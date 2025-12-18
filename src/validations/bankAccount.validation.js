import Joi from 'joi';

const createAccount = Joi.object({
    bankId: Joi.number().integer().positive().required().messages({
        'any.required': 'Debes seleccionar un banco.'
    }),
    accountTypeId: Joi.number().integer().positive().required().messages({
        'any.required': 'Debes seleccionar un tipo de cuenta.'
    }),
    accountNumber: Joi.string().pattern(/^[0-9]{10,20}$/).required().messages({
        'string.pattern.base': 'El número de cuenta debe tener entre 10 y 20 dígitos numéricos.'
    }),
    alias: Joi.string().min(3).max(100).required().messages({
        'string.empty': 'El alias es obligatorio para identificar la cuenta.'
    }),
    isDefault: Joi.boolean().optional()
});

export const bankAccountValidation = {
    createAccount,
};