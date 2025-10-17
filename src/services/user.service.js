// src/services/user.service.js

import httpStatus from 'http-status';
import db from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Obtiene el perfil de un usuario con visibilidad por rol.
 * @param {object} authenticatedUser - El usuario que realiza la petición (de req.user).
 * @param {number} [targetUserId] - El ID del usuario cuyo perfil se quiere ver.
 * @returns {Promise<object>} El objeto del usuario sin datos sensibles.
 */
const getUserProfile = async (authenticatedUser, targetUserId) => {
    let userIdToFind;

    // 1. Lógica de permisos
    if (authenticatedUser.role.role_name === 'admin' && targetUserId) {
        // Si es admin y pide un perfil específico, busca ese perfil.
        userIdToFind = targetUserId;
    } else {
        // Si es empleado, o si es admin pero no especifica un ID, busca su propio perfil.
        userIdToFind = authenticatedUser.user_id;
    }

    // 2. Búsqueda en la base de datos
    const user = await db.User.findByPk(userIdToFind, {
        attributes: {
            exclude: ['password_hash', 'verification_code', 'verification_code_expires_at']
        },
        include: {
            model: db.Role,
            as: 'role',
            attributes: ['role_name'],
        },
    });

    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Usuario no encontrado.');
    }

    return user;
};

/**
 * Lista todos los usuarios para un administrador, con paginación y filtros.
 */
const listAllUsers = async (queryParams) => {
    const { page = 1, limit = 20, isActive } = queryParams;
    const offset = (page - 1) * limit;

    const whereClause = {};
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
        include: { model: db.Role, as: 'role', attributes: ['role_id', 'role_name'] },
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
 */
const updateUserStatus = async (adminUserId, targetUserId, isActive) => {
    if (adminUserId === targetUserId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Un administrador no puede desactivarse a sí mismo.');
    }

    const userToUpdate = await db.User.findByPk(targetUserId);
    if (!userToUpdate) {
        throw new ApiError(httpStatus.NOT_FOUND, 'El usuario que intentas modificar no existe.');
    }

    userToUpdate.is_active = isActive;
    await userToUpdate.save();

    // Si se desactiva un usuario, cerramos todas sus sesiones por seguridad.
    if (isActive === false) {
        await db.Session.destroy({ where: { user_id: targetUserId } });
    }

    return userToUpdate;
};

/**
 * Actualiza el rol de un usuario.
 */
const updateUserRole = async (targetUserId, newRoleId) => {
    const userToUpdate = await db.User.findByPk(targetUserId);
    if (!userToUpdate) {
        throw new ApiError(httpStatus.NOT_FOUND, 'El usuario que intentas modificar no existe.');
    }

    const roleExists = await db.Role.findByPk(newRoleId);
    if (!roleExists) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'El rol especificado no es válido.');
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