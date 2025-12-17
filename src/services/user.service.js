// src/services/user.service.js

import httpStatus from 'http-status';
import db from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Obtiene el perfil de un usuario con visibilidad por rol.
 * NUEVO: Incluye información de la compañía.
 */
const getUserProfile = async (authenticatedUser, targetUserId) => {
    let userIdToFind;

    if (authenticatedUser.role.role_name === 'admin' && targetUserId) {
        // Validar que el usuario objetivo pertenece a la misma compañía
        const targetUser = await db.User.findByPk(targetUserId, {
            attributes: ['company_id']
        });
        
        if (!targetUser) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Usuario no encontrado.');
        }
        
        if (targetUser.company_id !== authenticatedUser.company.company_id) {
            throw new ApiError(httpStatus.FORBIDDEN, 'No tienes permiso para ver usuarios de otra compañía.');
        }
        
        userIdToFind = targetUserId;
    } else {
        userIdToFind = authenticatedUser.user_id;
    }

    const user = await db.User.findByPk(userIdToFind, {
        attributes: {
            exclude: ['password_hash', 'verification_code', 'verification_code_expires_at']
        },
        include: [
            {
                model: db.Role,
                as: 'role',
                attributes: ['role_name'],
            },
            {
                model: db.Company,
                as: 'company',
                attributes: ['company_id', 'company_name', 'company_ruc']
            }
        ],
    });

    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Usuario no encontrado.');
    }

    return user;
};

/**
 * Lista todos los usuarios de una compañía (solo admin).
 * NUEVO: Filtra automáticamente por companyId.
 */
const listAllUsers = async (companyId, queryParams) => {
    const { page = 1, limit = 20, isActive } = queryParams;
    const offset = (page - 1) * limit;

    const whereClause = {
        company_id: companyId // Filtro por compañía
    };
    
    if (isActive !== undefined) {
        whereClause.is_active = isActive;
    }

    const { count, rows } = await db.User.findAndCountAll({
        where: whereClause,
        limit,
        offset,
        order: [['created_at', 'DESC']],
        attributes: {
            exclude: ['password_hash', 'verification_code', 'verification_code_expires_at']
        },
        include: [
            { model: db.Role, as: 'role', attributes: ['role_id', 'role_name'] },
            { model: db.Company, as: 'company', attributes: ['company_name', 'company_ruc'] }
        ],
    });

    return {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        users: rows,
    };
};

/**
 * Actualiza el estado (activo/inactivo) de un usuario.
 * NUEVO: Valida que el usuario pertenece a la misma compañía.
 */
const updateUserStatus = async (adminUserId, adminCompanyId, targetUserId, isActive) => {
    if (adminUserId === targetUserId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Un administrador no puede desactivarse a sí mismo.');
    }

    const userToUpdate = await db.User.findOne({
        where: {
            user_id: targetUserId,
            company_id: adminCompanyId // Validación de compañía
        }
    });

    if (!userToUpdate) {
        throw new ApiError(httpStatus.NOT_FOUND, 'El usuario no existe o no pertenece a tu compañía.');
    }

    if (userToUpdate.is_active === isActive) {
        const status = isActive ? 'activo' : 'inactivo';
        throw new ApiError(httpStatus.BAD_REQUEST, `El usuario ya se encuentra ${status}.`);
    }

    userToUpdate.is_active = isActive;
    await userToUpdate.save();

    if (isActive === false) {
        await db.Session.destroy({ where: { user_id: targetUserId } });
    }

    return userToUpdate;
};

/**
 * Actualiza el rol de un usuario.
 * NUEVO: Valida que el usuario pertenece a la misma compañía.
 */
const updateUserRole = async (adminCompanyId, targetUserId, newRoleId) => {
    const userToUpdate = await db.User.findOne({
        where: {
            user_id: targetUserId,
            company_id: adminCompanyId
        }
    });

    if (!userToUpdate) {
        throw new ApiError(httpStatus.NOT_FOUND, 'El usuario no existe o no pertenece a tu compañía.');
    }

    const roleExists = await db.Role.findByPk(newRoleId);
    if (!roleExists) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'El rol especificado no es válido.');
    }

    if (userToUpdate.role_id === newRoleId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'El usuario ya tiene asignado ese rol.');
    }

    userToUpdate.role_id = newRoleId;
    await userToUpdate.save();

    return userToUpdate;
};

export const userService = {
    getUserProfile,
    listAllUsers,
    updateUserStatus,
    updateUserRole,
};