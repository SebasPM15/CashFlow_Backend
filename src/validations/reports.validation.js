// src/validations/reports.validation.js

import Joi from 'joi';

// Define los tipos de período permitidos según tu requisito.
const validPeriodTypes = [
    'daily',
    'weekly',
    'monthly',
    'quarterly', // Trimestral
    'semiannual', // Semestral
    'annual'      // Anual
];

/**
 * Validación para el endpoint principal de reportes periódicos.
 * Requiere un tipo de período y una fecha de referencia.
 */
const getPeriodicReport = Joi.object().keys({
    // --- Filtros de Reporte (Requeridos) ---
    periodType: Joi.string().valid(...validPeriodTypes).required(),
    date: Joi.date().iso().required(), // La fecha de referencia para el período

    // --- Filtros Opcionales (para acotar el reporte) ---

    // Filtro por Usuario (para que un admin consulte por un empleado)
    userId: Joi.number().integer().positive().optional(),

    // Filtros de Transacción
    categoryId: Joi.number().integer().positive().optional(),
    subcategoryId: Joi.number().integer().positive().optional(),
    methodId: Joi.number().integer().positive().optional(),
});

export const financialAnalysisSchema = Joi.object({
    year: Joi.number().integer().min(2000).max(2100).required()
        .messages({ 'any.required': 'El año es requerido para el análisis financiero.' })
});

export const reportsValidation = {
    getPeriodicReport,
    financialAnalysisSchema
};