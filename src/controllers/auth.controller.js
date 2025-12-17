import authService from '../services/auth.service.js';
import invitationService from '../services/invitation.service.js'; // Importamos el servicio de invitaciones
import asyncHandler from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.util.js';
import { ApiError } from '../utils/ApiError.js';
import config from '../config/index.js';

// =================================================================
// Controladores Públicos
// =================================================================

const registerCompany = asyncHandler(async (req, res) => {
    const { dinBody } = req.body;
    const result = await authService.registerAdmin(dinBody);

    sendResponse(res, 201, 'Compañía y Administrador registrados exitosamente.', result);
});

/**
 * Registro de empleado: Finaliza el registro usando un token de invitación.
 */
const registerEmployee = asyncHandler(async (req, res) => {
    const { dinBody } = req.body;
    // Llama al método que consume el token de invitación
    const result = await invitationService.acceptInvitation(dinBody);

    sendResponse(res, 201, 'Empleado registrado exitosamente.', result);
});

/**
 * Genera y envía una invitación a un nuevo empleado (Solo Admins).
 */
const inviteUser = asyncHandler(async (req, res) => {
    const { dinBody } = req.body;
    const adminUser = req.user; // El middleware auth inyecta el usuario completo
    
    // Pasamos companyId explícitamente desde el usuario autenticado
    const result = await invitationService.createInvitation(dinBody, adminUser.user_id, adminUser.company.company_id);

    sendResponse(res, 201, 'Invitación enviada exitosamente.', result);
});

/**
 * Valida un token de invitación para mostrar info en el frontend antes de registrar.
 */
const validateInvitation = asyncHandler(async (req, res) => {
    const { token } = req.body.dinBody;
    const info = await invitationService.validateInvitationToken(token);
    
    sendResponse(res, 200, 'Invitación válida.', info);
});

const login = asyncHandler(async (req, res) => {
    const { dinBody } = req.body;
    const { email, password } = dinBody;

    const { user, accessToken, refreshToken, sessionId, uuid } = await authService.login(email, password);

    if (req.dinHeader) {
        req.dinHeader.sessionId = sessionId;
        req.dinHeader.uuid = uuid;
    }

    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: config.app.env === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // --- CORRECCIÓN: Aplanamos el objeto user y lo fusionamos con el accessToken ---
    sendResponse(res, 200, 'Inicio de sesión exitoso', {
        ...user, // <-- Propaga todos los campos del usuario directamente en el dinBody
        accessToken
    });
});

const verifyAccount = asyncHandler(async (req, res) => {
    const { dinBody } = req.body;
    const { email, verificationCode } = dinBody;
    const result = await authService.verifyAccount(email, verificationCode);

    sendResponse(res, 200, result.message, result);
});

const resendVerificationCode = asyncHandler(async (req, res) => {
    const { dinBody } = req.body;
    const result = await authService.resendVerificationCode(dinBody.email);

    sendResponse(res, 200, result.message, result);
});

const requestPasswordReset = asyncHandler(async (req, res) => {
    const { dinBody } = req.body;
    const result = await authService.requestPasswordReset(dinBody.email);

    sendResponse(res, 200, result.message, result);
});

const resetPassword = asyncHandler(async (req, res) => {
    const { dinBody } = req.body;
    const { email, verificationCode, newPassword } = dinBody;
    const result = await authService.resetPassword(email, verificationCode, newPassword);

    sendResponse(res, 200, result.message, result);
});

const logout = asyncHandler(async (req, res) => {
    // Para el logout stateful, usamos el sessionId que viene en el dinHeader
    const sessionId = req.dinHeader?.sessionId;
    if (!sessionId) {
        throw new ApiError(401, 'Identificador de sesión no encontrado en la petición.');
    }

    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: config.app.env === 'production',
        sameSite: 'strict'
    });

    const result = await authService.logout(sessionId);
    sendResponse(res, 200, result.message, result);
});

const refreshSession = asyncHandler(async (req, res) => {
    const { refreshToken } = req.cookies;
    if (!refreshToken) {
        throw new ApiError(401, 'Refresh token no encontrado en las cookies.');
    }

    const result = await authService.refreshSession(refreshToken);
    sendResponse(res, 200, 'Token refrescado exitosamente', result);
});

/**
 * Lista las invitaciones enviadas por la compañía.
 */
const listInvitations = asyncHandler(async (req, res) => {
    const { dinBody } = req.body;
    const companyId = req.user.company.company_id; // Seguridad: Filtro por compañía del token

    const result = await invitationService.listInvitations(companyId, dinBody);

    sendResponse(res, 200, 'Listado de invitaciones obtenido exitosamente.', result);
});

export const authController = {
    registerCompany, // NUEVO
    registerEmployee, // NUEVO
    inviteUser, // NUEVO
    validateInvitation, // NUEVO
    login,
    verifyAccount,
    resendVerificationCode,
    requestPasswordReset,
    resetPassword,
    logout,
    refreshSession,
    listInvitations
};