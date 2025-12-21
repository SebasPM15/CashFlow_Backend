// src/services/cashflow.service.js

import httpStatus from 'http-status';
import { Op } from 'sequelize';
import db from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import emailService from './email/email.service.js';
import logger from '../utils/logger.js';
import { storageService } from './storage.service.js';
import { notificationService } from './notification.service.js';
import { maskAccountNumber, canViewFullAccountNumbers } from '../utils/masking.util.js';

/**
 * Servicio para gestionar la lógica de negocio del flujo de caja.
 * @namespace cashflowService
 */

// =================================================================
// === HELPERS PRIVADOS ===
// =================================================================

/**
 * Resuelve el saldo inicial aplicable para una fecha dada (Global por año + Herencia).
 * Lógica:
 * 1. Busca si hay un saldo inicial explícito para este año (hasta el mes actual).
 * 2. Si no, busca el último saldo del año anterior (Continuidad Automática).
 * 3. Si no hay nada, error (Sistema vacío).
 */
const _resolveInitialBalance = async (companyId, year, month, transaction = null) => {
    // 1. Prioridad: Configuración explícita de este año (Ej: Enero 2025)
    // Se busca un registro del mismo año con mes <= al actual.
    // Al ordenar DESC, tomamos el más reciente aplicable (aunque la regla es 1 por año, esto protege).
    const explicitBalance = await db.InitialBalance.findOne({
        where: {
            company_id: companyId,
            year: year,
            month: { [Op.lte]: month }
        },
        order: [['month', 'DESC']],
        transaction
    });

    if (explicitBalance) {
        return {
            value: parseFloat(explicitBalance.initial_balance),
            source: 'explicit',
            date: new Date(year, explicitBalance.month - 1, 1) // Fecha de inicio del saldo
        };
    }

    // 2. Fallback: Continuidad del año anterior (Automática)
    // Si no configuré 2025, busco cómo terminó 2024.
    const lastTxPrevYear = await db.CashFlowTransaction.findOne({
        where: {
            company_id: companyId,
            status: 'ACTIVE',
            transaction_date: { [Op.lt]: new Date(`${year}-01-01`) }
        },
        order: [['transaction_date', 'DESC'], ['created_at', 'DESC']],
        transaction
    });

    if (lastTxPrevYear) {
        return {
            value: parseFloat(lastTxPrevYear.resulting_balance),
            source: 'inherited',
            date: new Date(lastTxPrevYear.transaction_date)
        };
    }

    // 3. Si es el inicio de los tiempos y no hay nada
    throw new ApiError(
        httpStatus.BAD_REQUEST,
        `No se ha configurado un saldo inicial para el año ${year} y no existe historial previo para heredar.`
    );
};

// =================================================================
// === MÉTODOS PÚBLICOS ===
// =================================================================

const getPaymentMethodsList = async () => {
    const paymentMethods = await db.PaymentMethod.findAll({
        where: { is_active: true },
        order: [['method_name', 'ASC']],
    });
    return paymentMethods;
};

/**
 * Establece el saldo inicial (GLOBAL POR AÑO).
 * REGLA: Solo se permite un registro de saldo inicial por año.
 */
const setInitialMonthlyBalance = async (balanceData, companyId) => {
    const { year, month, initialBalance } = balanceData;

    // 1. Validar unicidad anual
    const existingYearBalance = await db.InitialBalance.findOne({
        where: {
            company_id: companyId,
            year: year
        }
    });

    if (existingYearBalance) {
        // Si ya existe, verificamos si es el mismo mes (para permitir update si quisieras, o bloquear)
        // Tu regla dice: "Solo podemos hacer un cambio o ingreso de saldo inicial por año"
        if (existingYearBalance.month !== month) {
            throw new ApiError(
                httpStatus.CONFLICT,
                `Ya existe un saldo inicial configurado para el año ${year} (en el mes ${existingYearBalance.month}). Solo se permite un registro por año.`
            );
        }
        // Si es el mismo mes, podrías dejar actualizar o lanzar error.
        // Asumiendo inmutabilidad estricta según tu prompt anterior:
        throw new ApiError(
            httpStatus.CONFLICT,
            'El saldo inicial para este año ya ha sido configurado.'
        );
    }

    // 2. Crear el registro
    return await db.InitialBalance.create({
        company_id: companyId,
        year,
        month, // Mes desde donde aplica (hacia adelante)
        initial_balance: initialBalance
    });
};

/**
 * Crea una nueva transacción.
 * Integra: Validación de Banco + Resolución Inteligente de Saldo.
 */
/**
 * Crea una nueva transacción.
 * OPTIMIZADO: Manejo robusto de notificaciones por correo y slack.
 */
const createTransaction = async (transactionData, userId, companyId) => {
    const { subcategory_id, transaction_date, method_id, concept, amount, evidence, bank_account_id } = transactionData;

    let subcategory;
    let paymentMethod;

    // --- TRANSACCIÓN DE BASE DE DATOS ---
    const newTransaction = await db.sequelize.transaction(async (t) => {
        // 1. Validar usuario
        const user = await db.User.findOne({
            where: { user_id: userId, company_id: companyId },
            transaction: t
        });
        if (!user) throw new ApiError(httpStatus.FORBIDDEN, 'No tienes permiso para crear transacciones en esta compañía.');

        // 2. Validar Subcategoría
        subcategory = await db.Subcategory.findByPk(subcategory_id, {
            include: [{ model: db.Category, as: 'category', attributes: ['category_name'] }],
            transaction: t
        });
        if (!subcategory) throw new ApiError(httpStatus.NOT_FOUND, 'La subcategoría especificada no existe.');

        // 3. Validar Método de Pago
        paymentMethod = await db.PaymentMethod.findOne({ where: { method_id, is_active: true }, transaction: t });
        if (!paymentMethod) throw new ApiError(httpStatus.BAD_REQUEST, 'El método de pago no es válido.');

        // 4. Validar Cuenta Bancaria
        const methodName = paymentMethod.method_name.toLowerCase();
        let accountIdToSave = bank_account_id;

        if (methodName !== 'efectivo' && !bank_account_id) {
            throw new ApiError(httpStatus.BAD_REQUEST, `Para el método '${paymentMethod.method_name}' es obligatorio seleccionar una cuenta bancaria.`);
        }
        if (methodName === 'efectivo') {
            accountIdToSave = null;
        }

        if (accountIdToSave) {
            const bankAccount = await db.BankAccount.findOne({
                where: { account_id: accountIdToSave, company_id: companyId, is_active: true },
                transaction: t
            });
            if (!bankAccount) throw new ApiError(httpStatus.BAD_REQUEST, 'La cuenta bancaria no es válida o está inactiva.');
        }

        // 5. Resolver Saldo Inicial
        const date = new Date(transaction_date);
        const resolvedBalance = await _resolveInitialBalance(companyId, date.getFullYear(), date.getMonth() + 1, t);

        // 6. Calcular Saldo Resultante
        const lastKnownTransaction = await db.CashFlowTransaction.findOne({
            where: { company_id: companyId, status: 'ACTIVE' },
            order: [['created_at', 'DESC']],
            transaction: t
        });

        let previousBalance = resolvedBalance.value;
        if (lastKnownTransaction) {
            const lastTxDate = new Date(lastKnownTransaction.transaction_date);
            // Si el saldo explícito es más reciente que la última transacción, usamos el explícito (Reinicio)
            if (resolvedBalance.source === 'explicit' && resolvedBalance.date > lastTxDate) {
                previousBalance = resolvedBalance.value;
            } else {
                previousBalance = parseFloat(lastKnownTransaction.resulting_balance);
            }
        }

        const debit = subcategory.transaction_type === 'DEBIT' ? amount : 0.00;
        const credit = subcategory.transaction_type === 'CREDIT' ? amount : 0.00;
        const resultingBalance = previousBalance + credit - debit;

        // 7. Crear Registro
        const createdTransaction = await db.CashFlowTransaction.create({
            company_id: companyId,
            user_id: userId,
            subcategory_id,
            method_id,
            bank_account_id: accountIdToSave,
            transaction_date: date,
            concept,
            debit,
            credit,
            resulting_balance: resultingBalance,
        }, { transaction: t });

        // 8. Guardar Evidencia (si existe)
        if (evidence?.file_data && evidence?.file_name) {
            const matches = evidence.file_data.match(/^data:(.+);base64,(.+)$/);
            if (!matches) throw new ApiError(httpStatus.BAD_REQUEST, 'Formato de base64 inválido.');
            const buffer = Buffer.from(matches[2], 'base64');
            const newFilePath = await storageService.uploadEvidence(buffer, evidence.file_name, userId);

            await db.Evidence.create({
                transaction_id: createdTransaction.transaction_id,
                file_path: newFilePath,
                original_filename: evidence.file_name,
                mime_type: matches[1],
                file_size_bytes: buffer.length,
            }, { transaction: t });
        }

        return createdTransaction;
    });

    // --- BLOQUE DE NOTIFICACIONES (FUERA DE TRANSACCIÓN) ---
    try {
        logger.info('Iniciando proceso de notificaciones...');

        // 1. Obtener datos complementarios
        const company = await db.Company.findByPk(companyId, { attributes: ['company_name'] });
        const user = await db.User.findByPk(userId);

        let bankDetails = null;
        if (newTransaction.bank_account_id) {
            const bankAccountInfo = await db.BankAccount.findByPk(newTransaction.bank_account_id, {
                include: [{ model: db.Bank, as: 'bank', attributes: ['bank_name'] }]
            });
            if (bankAccountInfo) {
                bankDetails = {
                    bankName: bankAccountInfo.bank.bank_name,
                    accountAlias: bankAccountInfo.account_alias,
                    accountNumber: bankAccountInfo.account_number
                };
            }
        }

        // 2. Preparar el objeto de detalles
        if (user) {
            const details = {
                userFullName: `${user.first_name} ${user.last_name}`,
                companyName: company.company_name,
                concept: newTransaction.concept,
                amount,
                type: subcategory.transaction_type,
                transactionDate: newTransaction.transaction_date,
                categoryName: subcategory.category.category_name,
                subcategoryName: subcategory.subcategory_name,
                methodName: paymentMethod.method_name,
                bankDetails
            };

            // 3. Notificar a Slack (Fire-and-forget pero con log)
            // No usamos await aquí para que no bloquee el envío de emails, o viceversa, pero ambos son importantes.
            const slackPromise = notificationService.sendNewTransactionNotification(details);

            // 4. Notificar a Admins por Email
            // Buscamos admins activos
            const admins = await db.User.findAll({
                where: { company_id: companyId, is_active: true },
                include: { model: db.Role, as: 'role', where: { role_name: 'admin' } }, // Asegúrate que en BD sea 'admin' minúscula
            });

            logger.info(`Se encontraron ${admins.length} administradores para notificar por correo.`);

            if (admins.length > 0) {
                // Usamos Promise.all para asegurar que se disparen todos los envíos
                const emailPromises = admins.map(admin =>
                    emailService.sendNewTransactionNotification(admin.email, details)
                        .catch(err => logger.error(`Fallo envío email a ${admin.email}: ${err.message}`))
                );

                await Promise.all(emailPromises); // Esperamos a que el servidor de correo acepte las peticiones
            } else {
                logger.warn(`No hay administradores con rol 'admin' en la compañía ${companyId} para enviar correos.`);
            }

            // Esperamos a que Slack termine también (opcional, pero recomendado para logs ordenados)
            await slackPromise;
        }
    } catch (error) {
        logger.error('Error general en el bloque de notificaciones:', error);
        // No lanzamos error aquí para no revertir la transacción financiera que ya fue exitosa
    }

    return newTransaction;
};

/**
 * Obtiene una lista paginada de transacciones de una compañía.
 * ACTUALIZADO: Enmascara números de cuenta según el rol del usuario.
 */
const getTransactionsList = async (user, queryParams) => {
    const {
        page = 1,
        limit = 10,
        userId: adminUserIdFilter,
        startDate,
        endDate,
        categoryId,
        subcategoryId,
        methodId,
    } = queryParams;

    const offset = (page - 1) * limit;
    const canViewFullNumbers = canViewFullAccountNumbers(user);

    // --- CONSTRUCCIÓN DE WHERE CLAUSE ---
    const whereClause = {
        company_id: user.company.company_id
    };

    if (user.role.role_name === 'employee') {
        whereClause.user_id = user.user_id;
    } else if (user.role.role_name === 'admin' && adminUserIdFilter) {
        whereClause.user_id = adminUserIdFilter;
    }

    if (methodId) whereClause.method_id = methodId;
    if (subcategoryId) whereClause.subcategory_id = subcategoryId;

    if (startDate && endDate) {
        whereClause.transaction_date = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    } else if (startDate) {
        whereClause.transaction_date = { [Op.gte]: new Date(startDate) };
    } else if (endDate) {
        whereClause.transaction_date = { [Op.lte]: new Date(endDate) };
    }

    // --- CONSTRUCCIÓN DE INCLUDES ---
    const subcategoryInclude = {
        model: db.Subcategory,
        as: 'subcategory',
        attributes: ['subcategory_name', 'transaction_type'],
        required: false,
        include: {
            model: db.Category,
            as: 'category',
            attributes: ['category_name'],
            required: false,
        },
    };

    if (categoryId) {
        subcategoryInclude.include.where = { category_id: categoryId };
        subcategoryInclude.include.required = true;
        subcategoryInclude.required = true;
    }

    // --- EJECUTAR CONSULTA ---
    const { count, rows } = await db.CashFlowTransaction.findAndCountAll({
        where: whereClause,
        include: [
            { model: db.User, as: 'user', attributes: ['user_id', 'first_name', 'last_name'] },
            { model: db.Evidence, as: 'evidences', attributes: ['evidence_id', 'original_filename'] },
            subcategoryInclude,
            { model: db.PaymentMethod, as: 'paymentMethod', attributes: ['method_name'] },
            {
                model: db.BankAccount,
                as: 'bankAccount',
                attributes: canViewFullNumbers
                    ? ['account_alias', 'account_number', 'masked_account_number'] // Admin ve todo
                    : ['account_alias', 'masked_account_number'], // Employee solo ve enmascarado
                include: [
                    { model: db.Bank, as: 'bank', attributes: ['bank_name', 'bank_code'] }
                ]
            },
        ],
        limit,
        offset,
        order: [['transaction_date', 'DESC'], ['created_at', 'DESC']],
        distinct: true,
    });

    // Post-procesamiento: Si NO es admin, eliminamos account_number del JSON
    const sanitizedRows = rows.map(tx => {
        const txJson = tx.toJSON();

        if (!canViewFullNumbers && txJson.bankAccount) {
            // Eliminamos el número completo si existe
            delete txJson.bankAccount.account_number;

            // Aseguramos que el número enmascarado esté presente
            if (!txJson.bankAccount.masked_account_number && txJson.bankAccount.account_number) {
                txJson.bankAccount.masked_account_number = maskAccountNumber(txJson.bankAccount.account_number);
            }
        }

        return txJson;
    });

    return {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page, 10),
        transactions: sanitizedRows,
    };
};

/**
 * Añade o actualiza la evidencia de una transacción.
 * NUEVO: Valida que la transacción pertenece a la compañía del usuario.
 */
const upsertEvidence = async (transactionId, evidenceData, user) => {
    const { file_name, file_data } = evidenceData;

    return await db.sequelize.transaction(async (t) => {
        const transaction = await db.CashFlowTransaction.findOne({
            where: {
                transaction_id: transactionId,
                company_id: user.company.company_id // Validación de compañía
            },
            transaction: t
        });

        if (!transaction) {
            throw new ApiError(httpStatus.NOT_FOUND, 'La transacción especificada no existe o no pertenece a tu compañía.');
        }

        if (user.role.role_name === 'employee' && transaction.user_id !== user.user_id) {
            throw new ApiError(httpStatus.FORBIDDEN, 'No tienes permiso para modificar esta transacción.');
        }

        const oldEvidence = await db.Evidence.findOne({ where: { transaction_id: transactionId }, transaction: t });
        if (oldEvidence) {
            await storageService.deleteEvidence(oldEvidence.file_path);
            await oldEvidence.destroy({ transaction: t });
        }

        const matches = file_data.match(/^data:(.+);base64,(.+)$/);
        if (!matches) throw new ApiError(httpStatus.BAD_REQUEST, 'El formato del archivo en base64 es inválido.');

        const mime_type = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');

        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
        if (!allowedTypes.includes(mime_type)) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Tipo de archivo no permitido.');
        }

        const fileSizeInMB = buffer.length / (1024 * 1024);
        if (fileSizeInMB > 5) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'El archivo excede el tamaño máximo de 5MB.');
        }

        const newFilePath = await storageService.uploadEvidence(buffer, file_name, user.user_id);

        return db.Evidence.create({
            transaction_id: transactionId,
            file_path: newFilePath,
            original_filename: file_name,
            mime_type,
            file_size_bytes: buffer.length,
        }, { transaction: t });
    });
};

const cancelTransaction = async (transactionId, user) => {
    return await db.sequelize.transaction(async (t) => {
        const originalTransaction = await db.CashFlowTransaction.findOne({
            where: {
                transaction_id: transactionId,
                company_id: user.company.company_id,
                status: 'ACTIVE',
            },
            transaction: t,
        });

        if (!originalTransaction) {
            throw new ApiError(httpStatus.NOT_FOUND, 'La transacción activa no existe o no pertenece a tu compañía.');
        }

        if (user.role.role_name === 'employee' && originalTransaction.user_id !== user.user_id) {
            throw new ApiError(httpStatus.FORBIDDEN, 'No tienes permiso para cancelar esta transacción.');
        }

        originalTransaction.status = 'CANCELLED';
        await originalTransaction.save({ transaction: t });

        const lastKnownTransaction = await db.CashFlowTransaction.findOne({
            where: {
                company_id: user.company.company_id,
                status: 'ACTIVE'
            },
            order: [['transaction_date', 'DESC'], ['created_at', 'DESC']],
            limit: 1,
            transaction: t,
        });

        const date = new Date(originalTransaction.transaction_date);
        const resolvedBalance = await _resolveInitialBalance(
            user.company.company_id,
            date.getFullYear(),
            date.getMonth() + 1,
            t
        );

        const previousBalance = lastKnownTransaction
            ? parseFloat(lastKnownTransaction.resulting_balance)
            : resolvedBalance.value;

        const reversalDebit = parseFloat(originalTransaction.credit);
        const reversalCredit = parseFloat(originalTransaction.debit);
        const resultingBalance = previousBalance + reversalCredit - reversalDebit;

        const reversalTransaction = await db.CashFlowTransaction.create({
            company_id: user.company.company_id,
            user_id: user.user_id,
            subcategory_id: originalTransaction.subcategory_id,
            method_id: originalTransaction.method_id,
            bank_account_id: originalTransaction.bank_account_id, // NUEVO: Revertir en la misma cuenta
            transaction_date: new Date(),
            concept: `Reversión de transacción #${originalTransaction.transaction_id}: ${originalTransaction.concept}`,
            debit: reversalDebit,
            credit: reversalCredit,
            resulting_balance: resultingBalance,
            status: 'ACTIVE',
        }, { transaction: t });

        return reversalTransaction;
    });
};

const updateTransactionConcept = async (transactionId, newConcept, user) => {
    const transaction = await db.CashFlowTransaction.findOne({
        where: {
            transaction_id: transactionId,
            company_id: user.company.company_id
        }
    });

    if (!transaction) {
        throw new ApiError(httpStatus.NOT_FOUND, 'La transacción no existe o no pertenece a tu compañía.');
    }
    if (user.role.role_name === 'employee' && transaction.user_id !== user.user_id) {
        throw new ApiError(httpStatus.FORBIDDEN, 'No tienes permiso para modificar esta transacción.');
    }

    transaction.concept = newConcept;
    await transaction.save();

    return transaction;
};

/**
    Obtiene una URL firmada para descargar una evidencia.
*/
const getEvidenceDownloadUrl = async (evidenceId, user) => {
    const evidence = await db.Evidence.findOne({
        where: { evidence_id: evidenceId },
        include: {
            model: db.CashFlowTransaction,
            as: 'transaction',
            attributes: ['user_id', 'company_id'],
        },
    });
    if (!evidence) {
        throw new ApiError(httpStatus.NOT_FOUND, 'La evidencia solicitada no existe.');
    }
    if (evidence.transaction.company_id !== user.company.company_id) {
        throw new ApiError(httpStatus.FORBIDDEN, 'No tienes permiso para acceder a esta evidencia.');
    }
    const transactionOwnerId = evidence.transaction.user_id;
    if (user.role.role_name === 'employee' && transactionOwnerId !== user.user_id) {
        throw new ApiError(httpStatus.FORBIDDEN, 'No tienes permiso para acceder a esta evidencia.');
    }
    const signedUrl = await storageService.getSignedUrlForEvidence(
        evidence.file_path,
        evidence.mime_type,
        evidence.original_filename
    );
    return { downloadUrl: signedUrl };
};


/**
 * Obtiene el saldo del mes calculado en tiempo real.
 * CORREGIDO: Considera el historial previo para calcular el saldo inicial exacto.
 */
const getMonthlyBalance = async (queryData, companyId) => {
    const { year, month } = queryData;

    // 1. Obtener el punto de partida (Ancla)
    // Esto nos devuelve el saldo configurado (ej: Enero) o heredado del año pasado
    const resolved = await _resolveInitialBalance(companyId, year, month);
    let calculatedInitialBalance = resolved.value;

    // 2. Calcular el "GAP" o brecha histórica
    // Si el saldo ancla es de una fecha anterior al mes que pedimos, 
    // debemos sumar todas las transacciones intermedias.
    const targetMonthStart = new Date(year, month - 1, 1); // 1ro del mes solicitado
    const anchorDate = resolved.date; // Fecha del saldo ancla

    if (anchorDate < targetMonthStart) {
        const intermediateTransactions = await db.CashFlowTransaction.findAll({
            where: {
                company_id: companyId,
                status: 'ACTIVE',
                transaction_date: {
                    [Op.gte]: anchorDate,      // Desde el ancla
                    [Op.lt]: targetMonthStart  // Hasta antes de empezar este mes
                }
            },
            attributes: ['debit', 'credit']
        });

        // Sumamos el flujo histórico intermedio
        const historicalFlow = intermediateTransactions.reduce((acc, tx) => {
            return acc + (parseFloat(tx.credit) - parseFloat(tx.debit));
        }, 0);

        calculatedInitialBalance += historicalFlow;
    }

    // 3. Obtener transacciones DEL MES solicitado
    const transactionsOfMonth = await db.CashFlowTransaction.findAll({
        where: {
            company_id: companyId,
            status: 'ACTIVE',
            [Op.and]: [
                db.sequelize.where(db.sequelize.fn('EXTRACT', db.sequelize.literal('YEAR FROM transaction_date')), year),
                db.sequelize.where(db.sequelize.fn('EXTRACT', db.sequelize.literal('MONTH FROM transaction_date')), month),
            ]
        },
        order: [['created_at', 'ASC']],
        attributes: ['resulting_balance', 'debit', 'credit', 'created_at'],
    });

    // 4. Cálculos del mes
    let finalBalance = calculatedInitialBalance;
    let sumOfBalances = 0; // Para el promedio
    // Si no hay transacciones, el promedio es el saldo inicial constante
    let accumulatedBalanceForAvg = calculatedInitialBalance * (transactionsOfMonth.length + 1);

    if (transactionsOfMonth.length > 0) {
        // Opción A: Usar el resulting_balance de la última (más preciso si la data es consistente)
        finalBalance = parseFloat(transactionsOfMonth[transactionsOfMonth.length - 1].resulting_balance);

        // Opción B (Cálculo manual para promedio):
        let currentRunBalance = calculatedInitialBalance;
        sumOfBalances = currentRunBalance; // Saldo día 0

        transactionsOfMonth.forEach(tx => {
            const flow = parseFloat(tx.credit) - parseFloat(tx.debit);
            currentRunBalance += flow;
            sumOfBalances += currentRunBalance;
        });

        accumulatedBalanceForAvg = sumOfBalances;
    }

    // Promedio simple basado en hitos de movimiento
    // (Nota: Un promedio diario exacto requeriría iterar por días, este es promedio transaccional)
    const averageBalance = accumulatedBalanceForAvg / (transactionsOfMonth.length + 1);

    return {
        year,
        month,
        initialBalance: calculatedInitialBalance.toFixed(2),
        finalBalance: finalBalance.toFixed(2),
        averageBalance: averageBalance.toFixed(2),
        numberOfTransactions: transactionsOfMonth.length
    };
};

/**
 * Actualiza la subcategoría de una transacción existente.
 * RESTRICCIÓN CRÍTICA: Solo permite cambiar a una subcategoría del mismo tipo (DEBIT/CREDIT).
 * IMPORTANTE: Recalcula TODOS los saldos posteriores cronológicamente.
 */
const updateTransactionSubcategory = async (transactionId, newSubcategoryId, user) => {
    return await db.sequelize.transaction(async (t) => {
        // 1. Obtener transacción original
        const transaction = await db.CashFlowTransaction.findOne({
            where: {
                transaction_id: transactionId,
                company_id: user.company.company_id,
                status: 'ACTIVE'
            },
            include: [{
                model: db.Subcategory,
                as: 'subcategory',
                attributes: ['subcategory_id', 'subcategory_name', 'transaction_type']
            }],
            transaction: t
        });

        if (!transaction) throw new ApiError(httpStatus.NOT_FOUND, 'Transacción no encontrada.');
        if (transaction.subcategory_id === newSubcategoryId) throw new ApiError(httpStatus.BAD_REQUEST, 'La transacción ya tiene esa subcategoría.');

        // 2. Validar nueva subcategoría
        const newSubcategory = await db.Subcategory.findByPk(newSubcategoryId, {
            include: [{ model: db.Category, as: 'category', attributes: ['category_name'] }],
            transaction: t
        });
        if (!newSubcategory) throw new ApiError(httpStatus.NOT_FOUND, 'Nueva subcategoría no existe.');

        // 3. Validar consistencia contable (Mismo tipo)
        if (transaction.subcategory.transaction_type !== newSubcategory.transaction_type) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'No se puede cambiar el tipo de transacción (Debe ser del mismo tipo DEBIT/CREDIT).');
        }

        // 4. Actualizar registro
        const oldName = transaction.subcategory.subcategory_name;
        transaction.subcategory_id = newSubcategoryId;
        transaction.concept = `${transaction.concept} [Subcat: ${oldName} -> ${newSubcategory.subcategory_name}]`;
        await transaction.save({ transaction: t });

        // =================================================================
        // 5. RECÁLCULO DE SALDOS (CRÍTICO: ORDEN CRONOLÓGICO)
        // =================================================================

        // A. Encontrar el saldo base justo antes de esta transacción
        // Buscamos la transacción inmediatamente anterior por FECHA, no por ID ni created_at solo.
        const lastTxBefore = await db.CashFlowTransaction.findOne({
            where: {
                company_id: user.company.company_id,
                status: 'ACTIVE',
                [Op.or]: [
                    { transaction_date: { [Op.lt]: transaction.transaction_date } },
                    {
                        transaction_date: transaction.transaction_date,
                        created_at: { [Op.lt]: transaction.created_at } // Desempate para mismo día
                    }
                ]
            },
            order: [['transaction_date', 'DESC'], ['created_at', 'DESC']],
            transaction: t
        });

        let currentBalance;
        if (lastTxBefore) {
            currentBalance = parseFloat(lastTxBefore.resulting_balance);
        } else {
            // Si no hay transacción anterior, resolvemos el saldo inicial del periodo
            const date = new Date(transaction.transaction_date);
            const resolvedBalance = await _resolveInitialBalance(
                user.company.company_id,
                date.getFullYear(),
                date.getMonth() + 1,
                t
            );
            currentBalance = resolvedBalance.value;
        }

        // B. Obtener TODAS las transacciones desde este punto en adelante (incluyendo la actual)
        // para recalcularlas en cadena.
        const subsequentTransactions = await db.CashFlowTransaction.findAll({
            where: {
                company_id: user.company.company_id,
                status: 'ACTIVE',
                [Op.or]: [
                    { transaction_date: { [Op.gt]: transaction.transaction_date } },
                    {
                        transaction_date: transaction.transaction_date,
                        created_at: { [Op.gte]: transaction.created_at } // Incluye la actual
                    }
                ]
            },
            order: [['transaction_date', 'ASC'], ['created_at', 'ASC']],
            transaction: t
        });

        // C. Iterar y actualizar
        for (const tx of subsequentTransactions) {
            const debit = parseFloat(tx.debit);
            const credit = parseFloat(tx.credit);

            // Recálculo
            const newBalance = currentBalance + credit - debit;

            // Optimización: Solo guardar si cambió (aunque siempre cambiará si la primera cambió)
            if (parseFloat(tx.resulting_balance) !== newBalance) {
                tx.resulting_balance = newBalance;
                await tx.save({ transaction: t });
            }

            currentBalance = newBalance;
        }

        logger.info(`Recalculados ${subsequentTransactions.length} saldos a partir de transacción #${transactionId}`);

        return await db.CashFlowTransaction.findByPk(transactionId, {
            include: [{ model: db.Subcategory, as: 'subcategory' }],
            transaction: t
        });
    });
};

export default {
    getPaymentMethodsList,
    setInitialMonthlyBalance,
    createTransaction,
    getTransactionsList,
    upsertEvidence,
    cancelTransaction,
    updateTransactionConcept,
    getEvidenceDownloadUrl,
    getMonthlyBalance,
    updateTransactionSubcategory
};