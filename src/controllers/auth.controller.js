import authService from '../services/auth.service.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.util.js';
import { ApiError } from '../utils/ApiError.js';
import config from '../config/index.js';

// =================================================================
// Controladores Públicos
// =================================================================

const register = asyncHandler(async (req, res) => {
    const { dinBody } = req.body;
    const result = await authService.register(dinBody);

    sendResponse(res, 201, 'Usuario registrado exitosamente', result.user);
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


export const authController = {
    register,
    login,
    verifyAccount,
    resendVerificationCode,
    requestPasswordReset,
    resetPassword,
    logout,
    refreshSession,
};