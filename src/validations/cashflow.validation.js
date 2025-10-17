// src/validations/cashflow.validation.js

import Joi from 'joi';

// CORRECCIÓN: El esquema describe directamente el contenido del dinBody.
const setMonthlyBalance = Joi.object().keys({
    year: Joi.number().integer().min(2020).max(2100).required(),
    month: Joi.number().integer().min(1).max(12).required(),
    initial_balance: Joi.number().precision(2).positive().required(),
});

// CORRECCIÓN: Se quitó la envoltura { dinBody: ... }
const createTransaction = Joi.object().keys({
    subcategory_id: Joi.number().integer().positive().required(),
    transaction_date: Joi.date().iso().required(),
    payment_method: Joi.string().trim().min(1).required(),
    concept: Joi.string().trim().min(1).required(),
    amount: Joi.number().precision(2).positive().required(),
    evidence: Joi.object({
        file_name: Joi.string().required(),
        file_data: Joi.string().base64().required(),
    }).optional(),
});

// CORRECCIÓN: Se quitó la envoltura { dinBody: ... }
const getTransactions = Joi.object().keys({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    userId: Joi.number().integer().positive().optional(),
}).allow(null, ''); // Mantenemos esto para permitir filtros opcionales

const upsertEvidence = Joi.object().keys({
    transactionId: Joi.number().integer().positive().required(),
    evidence: Joi.object({
        file_name: Joi.string().required(),
        // CORRECCIÓN: Cambiamos .base64() por .uri() para aceptar el prefijo
        file_data: Joi.string().uri({ scheme: ['data'] }).required(),
    }).required(),
});

export const cashflowValidation = {
    setMonthlyBalance,
    createTransaction,
    getTransactions,
    upsertEvidence,
};