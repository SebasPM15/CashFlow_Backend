// src/services/cashflow.service.js

import httpStatus from 'http-status';
import { Op } from 'sequelize';
import db from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import emailService from './email/email.service.js';
import logger from '../utils/logger.js';
import { storageService } from './storage.service.js';
import { notificationService } from './notification.service.js';

/**
 * Servicio para gestionar la lógica de negocio del flujo de caja.
 * @namespace cashflowService
 */

/**
 * Obtiene la lista de métodos de pago activos.
 * @returns {Promise<Array<PaymentMethod>>}
 */
const getPaymentMethodsList = async () => {
    const paymentMethods = await db.PaymentMethod.findAll({
        where: { is_active: true },
        order: [['method_name', 'ASC']],
    });
    return paymentMethods;
};

/**
 * Establece el saldo inicial para un mes y año específicos de una compañía.
 * CRÍTICO: Solo permite crear, no actualizar (inmutabilidad).
 */
const setInitialMonthlyBalance = async (balanceData, companyId) => {
    const { year, month, initialBalance } = balanceData;

    const [initialBalanceRecord, created] = await db.InitialBalance.findOrCreate({
        where: {
            company_id: companyId,
            year,
            month
        },
        defaults: {
            company_id: companyId,
            year,
            month,
            initial_balance: initialBalance
        },
    });

    if (!created) {
        throw new ApiError(
            httpStatus.CONFLICT,
            'El saldo inicial para este mes ya ha sido configurado y no puede ser modificado.'
        );
    }

    return initialBalanceRecord;
};

/**
 * Crea una nueva transacción de flujo de caja.
 * NUEVO: Valida que user_id pertenece a company_id.
 */
const createTransaction = async (transactionData, userId, companyId) => {
    const { subcategory_id, transaction_date, method_id, concept, amount, evidence } = transactionData;
    let subcategory;
    let paymentMethod;

    const newTransaction = await db.sequelize.transaction(async (t) => {
        // --- 1. Validar que el usuario pertenece a la compañía ---
        const user = await db.User.findOne({
            where: { user_id: userId, company_id: companyId },
            transaction: t
        });
        if (!user) {
            throw new ApiError(httpStatus.FORBIDDEN, 'No tienes permiso para crear transacciones en esta compañía.');
        }

        // --- 2. Validaciones de Subcategoría y Método de Pago ---
        subcategory = await db.Subcategory.findByPk(subcategory_id, {
            include: [{
                model: db.Category,
                as: 'category',
                attributes: ['category_name'],
            }],
            transaction: t
        });
        if (!subcategory) {
            throw new ApiError(httpStatus.NOT_FOUND, 'La subcategoría especificada no existe.');
        }

        paymentMethod = await db.PaymentMethod.findOne({
            where: { method_id, is_active: true },
            transaction: t,
        });
        if (!paymentMethod) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'El método de pago no es válido o no está activo.');
        }

        // --- 3. Verificar Saldo Inicial de la Compañía ---
        const date = new Date(transaction_date);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const initialBalance = await db.InitialBalance.findOne({
            where: {
                company_id: companyId,
                year,
                month
            },
            transaction: t
        });
        if (!initialBalance) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'El saldo inicial para este mes aún no ha sido configurado.');
        }

        // --- 4. Encontrar la Última Transacción ACTIVA de la Compañía ---
        const lastKnownTransaction = await db.CashFlowTransaction.findOne({
            where: {
                company_id: companyId,
                status: 'ACTIVE'
            },
            order: [['created_at', 'DESC']],
            limit: 1,
            transaction: t,
        });

        const previousBalance = lastKnownTransaction
            ? parseFloat(lastKnownTransaction.resulting_balance)
            : parseFloat(initialBalance.initial_balance);

        const debit = subcategory.transaction_type === 'DEBIT' ? amount : 0.00;
        const credit = subcategory.transaction_type === 'CREDIT' ? amount : 0.00;
        const resultingBalance = previousBalance + credit - debit;

        // --- 5. Creación de la Transacción ---
        const createdTransaction = await db.CashFlowTransaction.create({
            company_id: companyId,
            user_id: userId,
            subcategory_id,
            method_id,
            transaction_date: date,
            concept,
            debit,
            credit,
            resulting_balance: resultingBalance,
        }, { transaction: t });

        // --- 6. Manejo de Evidencia ---
        if (evidence?.file_data && evidence?.file_name) {
            const matches = evidence.file_data.match(/^data:(.+);base64,(.+)$/);
            if (!matches) throw new ApiError(httpStatus.BAD_REQUEST, 'Formato de base64 inválido.');
            const mime_type = matches[1];
            const buffer = Buffer.from(matches[2], 'base64');

            const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
            if (!allowedTypes.includes(mime_type)) {
                throw new ApiError(httpStatus.BAD_REQUEST, 'Tipo de archivo no permitido. Solo se aceptan PDF, JPG o PNG.');
            }

            const fileSizeInMB = buffer.length / (1024 * 1024);
            if (fileSizeInMB > 5) {
                throw new ApiError(httpStatus.BAD_REQUEST, 'El archivo excede el tamaño máximo de 5MB.');
            }

            const filePath = await storageService.uploadEvidence(buffer, evidence.file_name, userId);
            await db.Evidence.create({
                transaction_id: createdTransaction.transaction_id,
                file_path: filePath,
                original_filename: evidence.file_name,
                mime_type,
                file_size_bytes: buffer.length,
            }, { transaction: t });
        }

        return createdTransaction;
    });

    // --- 7. Notificaciones (Fire-and-Forget) ---
    try {
        const user = await db.User.findByPk(userId);
        const admins = await db.User.findAll({
            where: {
                company_id: companyId,
                is_active: true
            },
            include: {
                model: db.Role,
                as: 'role',
                where: { role_name: 'admin' },
            },
        });

        if (user) {
            const details = {
                userFullName: `${user.first_name} ${user.last_name}`,
                concept: newTransaction.concept,
                amount,
                type: subcategory.transaction_type,
                transactionDate: newTransaction.transaction_date,
                categoryName: subcategory.category.category_name,
                subcategoryName: subcategory.subcategory_name,
                methodName: paymentMethod.method_name,
            };

            if (admins && admins.length > 0) {
                for (const admin of admins) {
                    emailService.sendNewTransactionNotification(admin.email, details)
                        .catch(err => {
                            logger.error(`Error al enviar email al admin ${admin.email}: ${err.message}`);
                        });
                }
            }

            await notificationService.sendNewTransactionNotification(details);
        }
    } catch (error) {
        logger.error('Error al preparar notificaciones post-transacción.', { error: error.message });
    }

    return newTransaction;
};

/**
 * Obtiene una lista paginada de transacciones de una compañía.
 * NUEVO: Filtra por company_id automáticamente.
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

    // --- CONSTRUCCIÓN DE WHERE CLAUSE ---
    const whereClause = {
        company_id: user.company.company_id // FILTRO POR COMPAÑÍA
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
        attributes: ['subcategory_name'],
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
        ],
        limit,
        offset,
        order: [['transaction_date', 'DESC'], ['created_at', 'DESC']],
        distinct: true,
    });

    return {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page, 10),
        transactions: rows,
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
                company_id: user.company.company_id, // Validación de compañía
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
            order: [['created_at', 'DESC']],
            limit: 1,
            transaction: t,
        });

        const date = new Date(originalTransaction.transaction_date);
        const initialBalance = await db.InitialBalance.findOne({
            where: {
                company_id: user.company.company_id,
                year: date.getFullYear(),
                month: date.getMonth() + 1
            },
            transaction: t
        });

        const previousBalance = lastKnownTransaction
            ? parseFloat(lastKnownTransaction.resulting_balance)
            : parseFloat(initialBalance.initial_balance);

        const reversalDebit = parseFloat(originalTransaction.credit);
        const reversalCredit = parseFloat(originalTransaction.debit);
        const resultingBalance = previousBalance + reversalCredit - reversalDebit;

        const reversalTransaction = await db.CashFlowTransaction.create({
            company_id: user.company.company_id,
            user_id: user.user_id,
            subcategory_id: originalTransaction.subcategory_id,
            method_id: originalTransaction.method_id,
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
    Obtiene el saldo inicial, final y promedio de un mes para una compañía.
*/
const getMonthlyBalance = async (queryData, companyId) => {
    const { year, month } = queryData;
    const initialBalanceRecord = await db.InitialBalance.findOne({
        where: {
            company_id: companyId,
            year,
            month
        },
    });
    if (!initialBalanceRecord) {
        throw new ApiError(httpStatus.NOT_FOUND, `No se encontró un saldo inicial configurado para ${month}/${year}.`);
    }
    const initialBalance = parseFloat(initialBalanceRecord.initial_balance);
    const transactionsOfMonth = await db.CashFlowTransaction.findAll({
        where: {
            company_id: companyId,
            [Op.and]: [
                db.sequelize.where(db.sequelize.fn('EXTRACT', db.sequelize.literal('YEAR FROM transaction_date')), year),
                db.sequelize.where(db.sequelize.fn('EXTRACT', db.sequelize.literal('MONTH FROM transaction_date')), month),
            ],
            status: 'ACTIVE'
        },
        order: [['created_at', 'ASC']],
        attributes: ['resulting_balance', 'created_at'],
    });
    let finalBalance = initialBalance;
    let sumOfBalances = 0;
    const numberOfTransactions = transactionsOfMonth.length;
    if (numberOfTransactions > 0) {
        finalBalance = parseFloat(transactionsOfMonth[numberOfTransactions - 1].resulting_balance);
        transactionsOfMonth.forEach(tx => {
            sumOfBalances += parseFloat(tx.resulting_balance);
        });
    }
    const averageBalance = numberOfTransactions > 0
        ? (sumOfBalances / numberOfTransactions)
        : initialBalance;
    return {
        year,
        month,
        initialBalance: initialBalance.toFixed(2),
        finalBalance: finalBalance.toFixed(2),
        averageBalance: averageBalance.toFixed(2),
        numberOfTransactions: numberOfTransactions
    };
};

/**
 * Actualiza la subcategoría de una transacción existente.
 * RESTRICCIÓN CRÍTICA: Solo permite cambiar a una subcategoría del mismo tipo (DEBIT/CREDIT)
 * para mantener la consistencia contable.
 * IMPORTANTE: Recalcula TODOS los saldos posteriores en la cadena.
 */
const updateTransactionSubcategory = async (transactionId, newSubcategoryId, user) => {
    return await db.sequelize.transaction(async (t) => {
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
        if (!transaction) {
            throw new ApiError(httpStatus.NOT_FOUND, 'La transacción no existe o no pertenece a tu compañía.');
        }

        if (transaction.subcategory_id === newSubcategoryId) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'La transacción ya tiene asignada esa subcategoría.');
        }

        const newSubcategory = await db.Subcategory.findByPk(newSubcategoryId, {
            include: [{
                model: db.Category,
                as: 'category',
                attributes: ['category_name']
            }],
            transaction: t
        });

        if (!newSubcategory) {
            throw new ApiError(httpStatus.NOT_FOUND, 'La nueva subcategoría no existe.');
        }

        const originalType = transaction.subcategory.transaction_type;
        const newType = newSubcategory.transaction_type;

        if (originalType !== newType) {
            throw new ApiError(
                httpStatus.BAD_REQUEST,
                `No se puede cambiar a una subcategoría de tipo diferente.`
            );
        }

        const oldSubcategoryName = transaction.subcategory.subcategory_name;
        transaction.subcategory_id = newSubcategoryId;
        transaction.concept = `${transaction.concept} [Subcategoría actualizada de "${oldSubcategoryName}" a "${newSubcategory.subcategory_name}"]`;

        await transaction.save({ transaction: t });

        const lastTxBeforeUpdated = await db.CashFlowTransaction.findOne({
            where: {
                company_id: user.company.company_id,
                status: 'ACTIVE',
                created_at: { [Op.lt]: transaction.created_at }
            },
            order: [['created_at', 'DESC']],
            limit: 1,
            transaction: t
        });

        let currentBalance;
        if (lastTxBeforeUpdated) {
            currentBalance = parseFloat(lastTxBeforeUpdated.resulting_balance);
        } else {
            const date = new Date(transaction.transaction_date);
            const initialBalance = await db.InitialBalance.findOne({
                where: {
                    company_id: user.company.company_id,
                    year: date.getFullYear(),
                    month: date.getMonth() + 1
                },
                transaction: t
            });
            if (!initialBalance) throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Saldo inicial no encontrado.');
            currentBalance = parseFloat(initialBalance.initial_balance);
        }

        const subsequentTransactions = await db.CashFlowTransaction.findAll({
            where: {
                company_id: user.company.company_id,
                status: 'ACTIVE',
                created_at: { [Op.gte]: transaction.created_at }
            },
            order: [['created_at', 'ASC']],
            transaction: t
        });

        for (const tx of subsequentTransactions) {
            const debit = parseFloat(tx.debit);
            const credit = parseFloat(tx.credit);
            const newBalance = currentBalance + credit - debit;

            tx.resulting_balance = newBalance;
            await tx.save({ transaction: t });

            currentBalance = newBalance;
        }

        logger.info(`Recalculados ${subsequentTransactions.length} saldos desde transacción #${transactionId}`);

        return await db.CashFlowTransaction.findByPk(transactionId, {
            include: [
                {
                    model: db.Subcategory,
                    as: 'subcategory',
                    attributes: ['subcategory_name'],
                    include: {
                        model: db.Category,
                        as: 'category',
                        attributes: ['category_name']
                    }
                }
            ],
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