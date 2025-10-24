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

// (Aquí añadiremos futuras validaciones para reportes específicos
// como 'balanceValidation' o 'salesExpenseReport' cuando los desarrollemos)

export const reportsValidation = {
    getPeriodicReport,
};