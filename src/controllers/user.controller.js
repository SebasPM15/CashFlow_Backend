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
    const targetUserId = req.body.dinBody?.userId; 

    // El servicio se encarga de verificar si targetUserId pertenece a la misma compañía
    const userProfile = await userService.getUserProfile(authenticatedUser, targetUserId);

    sendResponse(res, httpStatus.OK, 'Perfil obtenido exitosamente.', userProfile);
});

/**
 * Maneja la petición para listar todos los usuarios (solo admin).
 * CRÍTICO: Pasa el companyId para filtrar la lista.
 */
const listUsers = asyncHandler(async (req, res) => {
    const queryParams = req.body.dinBody || {};
    const companyId = req.user.company.company_id;

    const result = await userService.listAllUsers(companyId, queryParams);
    
    sendResponse(res, httpStatus.OK, 'Usuarios listados exitosamente.', result);
});

/**
 * Maneja la petición para activar o desactivar un usuario (solo admin).
 * CRÍTICO: Pasa el companyId para validar pertenencia.
 */
const updateStatus = asyncHandler(async (req, res) => {
    const adminUserId = req.user.user_id;
    const adminCompanyId = req.user.company.company_id;
    const { userId, isActive } = req.body.dinBody;

    const updatedUser = await userService.updateUserStatus(adminUserId, adminCompanyId, userId, isActive);
    
    const message = isActive ? 'Usuario activado exitosamente.' : 'Usuario desactivado exitosamente.';
    sendResponse(res, httpStatus.OK, message, updatedUser);
});

/**
 * Maneja la petición para cambiar el rol de un usuario (solo admin).
 * CRÍTICO: Pasa el companyId para validar pertenencia.
 */
const updateRole = asyncHandler(async (req, res) => {
    const adminCompanyId = req.user.company.company_id;
    const { userId, roleId } = req.body.dinBody;

    const updatedUser = await userService.updateUserRole(adminCompanyId, userId, roleId);
    
    sendResponse(res, httpStatus.OK, 'Rol de usuario actualizado exitosamente.', updatedUser);
});

export const userController = {
    getProfile,
    listUsers,
    updateStatus,
    updateRole,
};