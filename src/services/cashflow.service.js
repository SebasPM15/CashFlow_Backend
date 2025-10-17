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
 * Establece o actualiza el saldo inicial para un mes y año específicos.
 */
const setInitialMonthlyBalance = async (balanceData) => {
    const { year, month, initialBalance } = balanceData;

    const [monthlyBalance, created] = await db.MonthlyBalance.findOrCreate({
        where: { year, month },
        defaults: { year, month, initial_balance: initialBalance },
    });

    if (!created) {
        monthlyBalance.initial_balance = initialBalance;
        await monthlyBalance.save();
    }

    return monthlyBalance;
};

/**
 * Crea una nueva transacción de flujo de caja, subiendo la evidencia a Supabase si se proporciona.
 */
const createTransaction = async (transactionData, userId) => {
    const { subcategory_id, transaction_date, payment_method, concept, amount, evidence } = transactionData;
    let subcategory;

    const newTransaction = await db.sequelize.transaction(async (t) => {
        // --- 1. Validaciones Iniciales (sin cambios) ---
        subcategory = await db.Subcategory.findByPk(subcategory_id, { transaction: t });
        if (!subcategory) {
            throw new ApiError(httpStatus.NOT_FOUND, 'La subcategoría especificada no existe.');
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
            transaction_date: date, 
            payment_method, 
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
    const { page = 1, limit = 10, userId: adminUserIdFilter } = queryParams;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (user.role.role_name === 'employee') {
        whereClause.user_id = user.user_id;
    } else if (user.role.role_name === 'admin' && adminUserIdFilter) {
        whereClause.user_id = adminUserIdFilter;
    }

    const { count, rows } = await db.CashFlowTransaction.findAndCountAll({
        where: whereClause,
        limit,
        offset,
        order: [['transaction_date', 'DESC']],
        include: [
            {
                model:
                    db.User, as: 'user',
                attributes: ['user_id', 'first_name', 'last_name']
            },
            {
                model:
                    db.Subcategory, as: 'subcategory',
                attributes: ['subcategory_name'],
                include: {
                    model: db.Category, as: 'category',
                    attributes: ['category_name']
                }
            },
            {
                model:
                    db.Evidence, as: 'evidences',
                attributes: ['evidence_id', 'original_filename', 'file_path']
            },
        ],
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

export default {
    setInitialMonthlyBalance,
    createTransaction,
    getTransactionsList,
    upsertEvidence,
};