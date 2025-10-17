// src/middlewares/validate.middleware.js

import Joi from 'joi';
import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';

/**
 * Middleware que valida el `req.body` contra un esquema de Joi.
 * Es flexible: si existe `req.body.dinBody`, lo valida. De lo contrario, valida `req.body` directamente.
 * @param {object} schema - El esquema de Joi a validar.
 * @returns {Function} El middleware de Express.
 */
export const validate = (schema) => (req, res, next) => {
    // Determina qué parte del body validar
    const objectToValidate = req.body.dinBody !== undefined ? req.body.dinBody : req.body;

    const { error } = Joi.compile(schema)
        .prefs({ errors: { label: 'key' }, abortEarly: false })
        .validate(objectToValidate);

    if (error) {
        const errorMessage = error.details.map((details) => details.message).join(', ');
        return next(new ApiError(httpStatus.BAD_REQUEST, errorMessage));
    }

    return next();
};