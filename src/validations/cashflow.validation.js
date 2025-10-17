// src/validations/cashflow.validation.js

import Joi from 'joi';

const setMonthlyBalance = Joi.object().keys({
    year: Joi.number().integer().min(2020).max(2100).required(),
    month: Joi.number().integer().min(1).max(12).required(),
    initial_balance: Joi.number().precision(2).positive().required(),
});

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

const getTransactions = Joi.object().keys({
    // --- Paginación (existente) ---
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    
    // --- Filtro por Usuario (existente, solo para admin) ---
    userId: Joi.number().integer().positive().optional(),

    // --- NUEVOS FILTROS ---
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    categoryId: Joi.number().integer().positive().optional(),
    subcategoryId: Joi.number().integer().positive().optional(),
    paymentMethod: Joi.string().trim().optional(),
}).allow(null, ''); // Permite un body vacío para obtener todos los resultados

const upsertEvidence = Joi.object().keys({
    transactionId: Joi.number().integer().positive().required(),
    evidence: Joi.object({
        file_name: Joi.string().required(),
        // CORRECCIÓN: Cambiamos .base64() por .uri() para aceptar el prefijo
        file_data: Joi.string().uri({ scheme: ['data'] }).required(),
    }).required(),
});

const cancelTransaction = Joi.object().keys({
    transactionId: Joi.number().integer().positive().required(),
});

const updateConcept = Joi.object().keys({
    transactionId: Joi.number().integer().positive().required(),
    concept: Joi.string().trim().min(1).required(),
});

const getEvidenceUrl = Joi.object().keys({
    evidenceId: Joi.number().integer().positive().required(),
});

export const cashflowValidation = {
    setMonthlyBalance,
    createTransaction,
    getTransactions,
    upsertEvidence,
    cancelTransaction,
    updateConcept,
    getEvidenceUrl
};