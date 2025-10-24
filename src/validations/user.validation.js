// src/validations/user.validation.js

import Joi from 'joi';

const getProfile = Joi.object().keys({
        userId: Joi.number().integer().positive().optional(),
    }).allow(null, '');

const listUsers = Joi.object().keys({
        page: Joi.number().integer().min(1).optional(),
        limit: Joi.number().integer().min(1).max(100).optional(),
        isActive: Joi.boolean().optional(),
    }).allow(null, '');
    
const updateStatus = Joi.object().keys({
        userId: Joi.number().integer().positive().required(),
        isActive: Joi.boolean().required(),
    });

const updateRole = Joi.object().keys({
        userId: Joi.number().integer().positive().required(),
        roleId: Joi.number().integer().positive().required(),
    });

export const userValidation = {
    getProfile,
    listUsers,
    updateStatus,
    updateRole,
};