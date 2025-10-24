import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import logger from './logger.js';
import { ApiError } from './ApiError.js';

/**
 * @private
 * Extrae y valida los datos esenciales del usuario para el payload del token.
 * @param {object} user - El objeto de usuario de Sequelize, se espera que incluya el rol.
 * @returns {object} El payload validado para el JWT.
 * @throws {ApiError} Si faltan datos críticos en el objeto de usuario.
 */
function _extractAndValidatePayload(user) {
    const userId = user?.user_id;
    const email = user?.email;
    const roleName = user?.role?.role_name;

    // Validación crítica: nos aseguramos de que los datos existan.
    if (!userId || !email || !roleName) {
        logger.error('Intento de generar token para un objeto de usuario incompleto.', { userId, email, roleName });
        throw new ApiError(500, 'Datos de usuario insuficientes para generar un token seguro.');
    }

    const payload = {
        sub: userId,
        email,
        role: roleName,
    };

    // El RUC es opcional, lo añadimos al payload solo si existe.
    if (user.company_ruc) {
        payload.company_ruc = user.company_ruc;
    }

    return payload;
}

/**
 * Genera un par de tokens (access y refresh) firmados para una sesión de usuario.
 * @param {object} user - El objeto de usuario de Sequelize.
 * @returns {{accessToken: string, refreshToken: string}}
 */
export const generateAccessAndRefreshTokens = (user) => {
    // 1. Extraer y validar el payload del usuario.
    const accessTokenPayload = _extractAndValidatePayload(user);

    // 2. Firmar el Access Token con el payload completo.
    const accessToken = jwt.sign(accessTokenPayload, config.jwt.secret, {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
        expiresIn: config.jwt.accessExpiresIn,
        algorithm: 'HS256',
    });

    // 3. El Refresh Token solo necesita el `sub` (user_id) para ser funcional.
    const refreshTokenPayload = {
        sub: accessTokenPayload.sub,
        typ: 'refresh', // Tipo especial para diferenciarlo
    };

    // 4. Firmar el Refresh Token.
    const refreshToken = jwt.sign(refreshTokenPayload, config.jwt.secret, {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
        expiresIn: config.jwt.refreshExpiresIn,
        algorithm: 'HS256',
    });

    return { accessToken, refreshToken };
};