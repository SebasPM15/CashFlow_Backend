import Joi from 'joi';
import { ApiError } from '../utils/ApiError.js';

/**
 * Middleware genérico que valida el `dinBody` de una petición contra un esquema de Joi.
 * @param {Joi.ObjectSchema} schema - El esquema de Joi para validar.
 */
export const validate = (schema) => (req, res, next) => {
    // Validamos específicamente el contenido de `dinBody`, como dicta nuestra trama.
    const { error } = schema.validate(req.body.dinBody);

    if (error) {
        // Extraemos un mensaje de error más limpio y lo pasamos a nuestro manejador.
        const errorMessage = error.details.map((details) => details.message).join(', ');
        return next(new ApiError(400, errorMessage));
    }

    return next();
};

// --- Esquemas de Validación para cada Endpoint ---

export const registerSchema = Joi.object({
    firstName: Joi.string().min(2).required(),
    lastName: Joi.string().min(2).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    phoneNumber: Joi.string().optional().allow(''),
});

export const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
});

export const verifyAccountSchema = Joi.object({
    email: Joi.string().email().required(),
    verificationCode: Joi.string().length(6).required(),
});

export const emailSchema = Joi.object({
    email: Joi.string().email().required(),
});

export const resetPasswordSchema = Joi.object({
    email: Joi.string().email().required(),
    verificationCode: Joi.string().length(6).required(),
    newPassword: Joi.string().min(8).required(),
});