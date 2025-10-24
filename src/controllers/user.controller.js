// src/controllers/user.controller.js

import httpStatus from 'http-status';
import asyncHandler from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.util.js';
import { userService } from '../services/user.service.js';

/**
 * Maneja la petición para obtener el perfil de un usuario.
 */
const getProfile = asyncHandler(async (req, res) => {
    const authenticatedUser = req.user;
    const targetUserId = req.body.dinBody?.userId; // El ID opcional que puede enviar un admin

    const userProfile = await userService.getUserProfile(authenticatedUser, targetUserId);

    sendResponse(res, httpStatus.OK, 'Perfil obtenido exitosamente.', userProfile);
});

/**
 * Maneja la petición para listar todos los usuarios (solo admin).
 */
const listUsers = asyncHandler(async (req, res) => {
    const queryParams = req.body.dinBody || {};
    const result = await userService.listAllUsers(queryParams);
    sendResponse(res, httpStatus.OK, 'Usuarios listados exitosamente.', result);
});

/**
 * Maneja la petición para activar o desactivar un usuario (solo admin).
 */
const updateStatus = asyncHandler(async (req, res) => {
    const adminUserId = req.user.user_id;
    const { userId, isActive } = req.body.dinBody;
    const updatedUser = await userService.updateUserStatus(adminUserId, userId, isActive);
    const message = isActive ? 'Usuario activado exitosamente.' : 'Usuario desactivado exitosamente.';
    sendResponse(res, httpStatus.OK, message, updatedUser);
});

/**
 * Maneja la petición para cambiar el rol de un usuario (solo admin).
 */
const updateRole = asyncHandler(async (req, res) => {
    const { userId, roleId } = req.body.dinBody;
    const updatedUser = await userService.updateUserRole(userId, roleId);
    sendResponse(res, httpStatus.OK, 'Rol de usuario actualizado exitosamente.', updatedUser);
});

export const userController = {
    getProfile,
    listUsers,
    updateStatus,
    updateRole,
};