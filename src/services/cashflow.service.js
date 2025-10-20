// src/services/cashflow.service.js

import httpStatus from 'http-status';
import { Op } from 'sequelize';
import db from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import emailService from './email/email.service.js';
import logger from '../utils/logger.js';
import { storageService } from './storage.service.js';

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
 * Establece o actualiza el saldo inicial para un mes y año específicos.
 */
const setInitialMonthlyBalance = async (balanceData) => {
    const { year, month, initialBalance } = balanceData;

    const [monthlyBalance, created] = await db.MonthlyBalance.findOrCreate({
        where: { year, month },
        defaults: { year, month, initial_balance: initialBalance },
    });

    // Si 'created' es falso, significa que el registro ya existía.
    if (!created) {
        // Lanzamos un error de negocio claro.
        throw new ApiError(
            httpStatus.CONFLICT, // 409 Conflict es el código ideal para esto.
            'El saldo inicial para este mes ya ha sido configurado y no puede ser modificado.'
        );
    }

    // Si 'created' es true, la operación fue exitosa y devolvemos el nuevo registro.
    return monthlyBalance;
};

/**
 * Crea una nueva transacción de flujo de caja, subiendo la evidencia a Supabase si se proporciona.
 */
const createTransaction = async (transactionData, userId) => {
    const { subcategory_id, transaction_date, method_id, concept, amount, evidence } = transactionData;
    let subcategory;

    const newTransaction = await db.sequelize.transaction(async (t) => {
        // --- 1. Validaciones Iniciales ---
        subcategory = await db.Subcategory.findByPk(subcategory_id, { transaction: t });
        if (!subcategory) {
            throw new ApiError(httpStatus.NOT_FOUND, 'La subcategoría especificada no existe.');
        }

        const paymentMethod = await db.PaymentMethod.findOne({
            where: { method_id, is_active: true },
            transaction: t,
        });
        if (!paymentMethod) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'El método de pago no es válido o no está activo.');
        }

        const date = new Date(transaction_date);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const monthlyBalance = await db.MonthlyBalance.findOne({ where: { year, month }, transaction: t });
        if (!monthlyBalance) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'El saldo inicial para este mes aún no ha sido configurado.');
        }

        // --- 2. Encontrar la última transacción REAL ---
        // Buscamos la transacción con la fecha de creación ('created_at') más reciente.
        // Esta es la última entrada real en nuestro "libro de contabilidad".
        const lastKnownTransaction = await db.CashFlowTransaction.findOne({
            where: { status: 'ACTIVE' },
            order: [['created_at', 'DESC']], // La última que se guardó en la BD
            limit: 1,
            transaction: t,
        });

        const previousBalance = lastKnownTransaction
            ? parseFloat(lastKnownTransaction.resulting_balance)
            : parseFloat(monthlyBalance.initial_balance);

        const debit = subcategory.transaction_type === 'DEBIT' ? amount : 0.00;
        const credit = subcategory.transaction_type === 'CREDIT' ? amount : 0.00;
        const resultingBalance = previousBalance + credit - debit;

        // --- 3. Creación del Nuevo Registro (sin cambios) ---
        const createdTransaction = await db.CashFlowTransaction.create({
            user_id: userId,
            subcategory_id,
            method_id,
            transaction_date: date,
            concept,
            debit,
            credit,
            resulting_balance: resultingBalance,
        }, { transaction: t });

        // --- 5. Manejo de Evidencia (sin cambios) ---
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

    // --- 6. Notificación por Email (sin cambios) ---
    try {
        const user = await db.User.findByPk(userId);
        const admin = await db.User.findOne({ include: { model: db.Role, as: 'role', where: { role_name: 'admin' } } });
        if (admin && user) {
            emailService.sendNewTransactionNotification(admin.email, {
                userFullName: `${user.first_name} ${user.last_name}`,
                concept: newTransaction.concept, amount, type: subcategory.transaction_type, transactionDate: newTransaction.transaction_date,
            });
        }
    } catch (error) {
        logger.error('Error al iniciar el envío de notificación de transacción.', { error: error.message });
    }

    return newTransaction;
};

/**
 * Obtiene una lista paginada de transacciones, incluyendo sus evidencias.
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

    // --- CONSTRUCCIÓN DINÁMICA DE LA CONSULTA (CORREGIDA) ---
    const whereClause = {};

    // Filtro base por rol de usuario
    if (user.role.role_name === 'employee') {
        whereClause.user_id = user.user_id;
    } else if (user.role.role_name === 'admin' && adminUserIdFilter) {
        whereClause.user_id = adminUserIdFilter;
    }

    // Añadir filtros directos si existen
    if (methodId) whereClause.methodId = methodId;
    if (subcategoryId) whereClause.subcategory_id = subcategoryId;

    // CORRECCIÓN: Se mueve el filtro de categoryId a la cláusula principal
    // usando la notación '$' para referenciar una columna de una tabla asociada.
    if (categoryId) {
        whereClause['$subcategory.category_id$'] = categoryId;
    }

    // Filtro por rango de fechas
    if (startDate && endDate) {
        whereClause.transaction_date = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    } else if (startDate) {
        whereClause.transaction_date = { [Op.gte]: new Date(startDate) };
    } else if (endDate) {
        whereClause.transaction_date = { [Op.lte]: new Date(endDate) };
    }

    // Ejecutar la consulta final
    const { count, rows } = await db.CashFlowTransaction.findAndCountAll({
        where: whereClause,
        include: [
            { model: db.User, as: 'user', attributes: ['user_id', 'first_name', 'last_name'] },
            { model: db.Evidence, as: 'evidences', attributes: ['evidence_id', 'original_filename'] },
            // La inclusión de Subcategory y Category se mantiene igual, pero sin el 'where' dinámico
            {
                model: db.Subcategory,
                as: 'subcategory',
                attributes: ['subcategory_name'],
                include: {
                    model: db.Category,
                    as: 'category',
                    attributes: ['category_name'],
                },
            },
            {
                model: db.PaymentMethod,
                as: 'paymentMethod',
                attributes: ['method_name'],
            },
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
 * Añade o actualiza la evidencia de una transacción existente en Supabase Storage.
 */
const upsertEvidence = async (transactionId, evidenceData, user) => {
    const { file_name, file_data } = evidenceData;

    return await db.sequelize.transaction(async (t) => {
        const transaction = await db.CashFlowTransaction.findByPk(transactionId, { transaction: t });
        if (!transaction) {
            throw new ApiError(httpStatus.NOT_FOUND, 'La transacción especificada no existe.');
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
            throw new ApiError(httpStatus.BAD_REQUEST, 'Tipo de archivo no permitido. Solo se aceptan PDF, JPG o PNG.');
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
        // --- 1. Buscar la transacción original y activa (sin cambios) ---
        const originalTransaction = await db.CashFlowTransaction.findOne({
            where: {
                transaction_id: transactionId,
                status: 'ACTIVE',
            },
            transaction: t,
        });

        if (!originalTransaction) {
            throw new ApiError(httpStatus.NOT_FOUND, 'La transacción activa especificada no existe o ya ha sido cancelada.');
        }

        // --- 2. Validar permisos (sin cambios) ---
        if (user.role.role_name === 'employee' && originalTransaction.user_id !== user.user_id) {
            throw new ApiError(httpStatus.FORBIDDEN, 'No tienes permiso para cancelar esta transacción.');
        }

        // --- 3. Marcar la transacción original como 'CANCELLED' ---
        originalTransaction.status = 'CANCELLED';
        await originalTransaction.save({ transaction: t });

        // --- 4. Crear la transacción de reversión (Lógica corregida) ---
        // CORRECCIÓN: Se busca la última transacción ACTIVA, igual que en createTransaction.
        const lastKnownTransaction = await db.CashFlowTransaction.findOne({
            where: { status: 'ACTIVE' },
            order: [['created_at', 'DESC']],
            limit: 1,
            transaction: t,
        });

        // Si no hay ninguna transacción activa, el saldo previo es el inicial del mes.
        // Esto cubre el caso de que se cancele la única transacción existente.
        const date = new Date(originalTransaction.transaction_date);
        const monthlyBalance = await db.MonthlyBalance.findOne({
            where: { year: date.getFullYear(), month: date.getMonth() + 1 },
            transaction: t
        });

        const previousBalance = lastKnownTransaction
            ? parseFloat(lastKnownTransaction.resulting_balance)
            : parseFloat(monthlyBalance.initial_balance);

        // CORRECCIÓN: Se convierten a número los valores de débito/crédito para evitar el NaN.
        const reversalDebit = parseFloat(originalTransaction.credit);
        const reversalCredit = parseFloat(originalTransaction.debit);

        // El cálculo ahora es seguro y siempre producirá un número.
        const resultingBalance = previousBalance + reversalCredit - reversalDebit;

        const reversalTransaction = await db.CashFlowTransaction.create({
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
    // 1. Buscamos la transacción por su clave primaria.
    const transaction = await db.CashFlowTransaction.findByPk(transactionId);

    // 2. Validamos que la transacción exista.
    if (!transaction) {
        throw new ApiError(httpStatus.NOT_FOUND, 'La transacción especificada no existe.');
    }

    // 3. Verificamos los permisos: un empleado solo puede editar sus propias transacciones.
    if (user.role.role_name === 'employee' && transaction.user_id !== user.user_id) {
        throw new ApiError(httpStatus.FORBIDDEN, 'No tienes permiso para modificar esta transacción.');
    }

    // 4. Actualizamos el campo 'concept'.
    transaction.concept = newConcept;

    // 5. Guardamos el cambio en la base de datos.
    await transaction.save();

    // 6. Devolvemos la instancia de la transacción con el campo actualizado.
    return transaction;
};

const getEvidenceDownloadUrl = async (evidenceId, user) => {
    // 1. Buscamos la evidencia (esto ya incluye original_filename si tu modelo está bien)
    const evidence = await db.Evidence.findOne({
        where: { evidence_id: evidenceId },
        include: {
            model: db.CashFlowTransaction,
            as: 'transaction',
            attributes: ['user_id'],
        },
    });

    if (!evidence) {
        throw new ApiError(httpStatus.NOT_FOUND, 'La evidencia solicitada no existe.');
    }

    // 2. Validamos permisos (sin cambios)
    const transactionOwnerId = evidence.transaction.user_id;
    if (user.role.role_name === 'employee' && transactionOwnerId !== user.user_id) {
        throw new ApiError(httpStatus.FORBIDDEN, 'No tienes permiso para acceder a esta evidencia.');
    }

    // 3. CORRECCIÓN: Llamamos al servicio de almacenamiento pasándole los TRES argumentos.
    const signedUrl = await storageService.getSignedUrlForEvidence(
        evidence.file_path,         // El path del archivo en Supabase
        evidence.mime_type,        // El tipo MIME
        evidence.original_filename // <-- EL NOMBRE ORIGINAL
    );

    // 4. Devolvemos la URL (sin cambios)
    return { downloadUrl: signedUrl };
};

export default {
    getPaymentMethodsList,
    setInitialMonthlyBalance,
    createTransaction,
    getTransactionsList,
    upsertEvidence,
    cancelTransaction,
    updateTransactionConcept,
    getEvidenceDownloadUrl
};