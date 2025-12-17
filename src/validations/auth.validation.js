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

// =================================================================
// Esquemas de Validación para Onboarding y Auth
// =================================================================

/**
 * Esquema para el registro inicial de una Compañía y su Administrador.
 */
export const registerCompanySchema = Joi.object({
    // Datos del Usuario Administrador
    firstName: Joi.string().min(2).required().messages({
        'string.empty': 'El nombre es requerido',
        'string.min': 'El nombre debe tener al menos 2 caracteres'
    }),
    lastName: Joi.string().min(2).required().messages({
        'string.empty': 'El apellido es requerido'
    }),
    email: Joi.string().email().required().messages({
        'string.email': 'Debe ser un email válido'
    }),
    password: Joi.string().min(8).required().messages({
        'string.min': 'La contraseña debe tener al menos 8 caracteres'
    }),
    phoneNumber: Joi.string().optional().allow(''),

    // Datos de la Compañía
    companyRuc: Joi.string().length(13).pattern(/^\d+$/).required().messages({
        'string.length': 'El RUC debe tener exactamente 13 dígitos',
        'string.pattern.base': 'El RUC debe contener solo números'
    }),
    companyName: Joi.string().min(3).required().messages({
        'string.empty': 'El nombre de la empresa es requerido'
    }),
    companyAddress: Joi.string().optional().allow('')
});

/**
 * Esquema para invitar a un empleado (Solo Admin).
 */
export const inviteEmployeeSchema = Joi.object({
    email: Joi.string().email().required(),
    roleId: Joi.number().integer().required().messages({
        'number.base': 'El ID del rol debe ser un número',
        'any.required': 'El rol es requerido'
    })
});

/**
 * Esquema para que un empleado complete su registro usando un token de invitación.
 */
export const registerEmployeeSchema = Joi.object({
    token: Joi.string().required(), // El JWT de invitación
    verificationCode: Joi.string().length(6).required(), // El código visual de 6 dígitos
    firstName: Joi.string().min(2).required(),
    lastName: Joi.string().min(2).required(),
    password: Joi.string().min(8).required(),
    phoneNumber: Joi.string().optional().allow('')
});

/**
 * Esquema para inicio de sesión.
 */
export const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
});

/**
 * Esquema para verificar cuenta (Administradores/Flujo normal).
 */
export const verifyAccountSchema = Joi.object({
    email: Joi.string().email().required(),
    verificationCode: Joi.string().length(6).required(),
});

/**
 * Esquema genérico para solicitar acciones vía email (Reenvío código, Reset password).
 */
export const emailSchema = Joi.object({
    email: Joi.string().email().required(),
});

/**
 * Esquema para restablecer contraseña.
 */
export const resetPasswordSchema = Joi.object({
    email: Joi.string().email().required(),
    verificationCode: Joi.string().length(6).required(),
    newPassword: Joi.string().min(8).required(),
});

/**
 * Esquema para listar invitaciones (filtro opcional por estado).
 */
export const listInvitationsSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    isUsed: Joi.boolean().optional() // true = solo aceptadas, false = solo pendientes, null = todas
});