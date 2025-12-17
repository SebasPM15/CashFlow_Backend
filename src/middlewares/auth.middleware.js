// src/middlewares/auth.middleware.js

import jwt from 'jsonwebtoken';
import httpStatus from 'http-status'; // Es buena práctica usar http-status
import config from '../config/index.js';
import db from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * @private
 * Helper para extraer el token 'Bearer' del header de autorización.
 */
function _extractTokenFromHeader(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.split(' ')[1];
}

/**
 * Middleware para proteger rutas. Verifica el JWT, encuentra al usuario
 * y lo adjunta al objeto `req`. (Autenticación Stateless)
 */
export const secureEndpoint = asyncHandler(async (req, res, next) => {
    const token = _extractTokenFromHeader(req);
    if (!token) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'No autorizado. Token no proporcionado.');
    }

    let decoded;
    try {
        decoded = jwt.verify(token, config.jwt.secret, {
            issuer: config.jwt.issuer,
            audience: config.jwt.audience,
        });
    } catch (error) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'No autorizado. El token es inválido o ha expirado.');
    }

    const user = await db.User.findByPk(decoded.sub, {
        include: [
            { model: db.Role, as: 'role' },
            { 
                model: db.Company, 
                as: 'company', 
                attributes: ['company_id', 'company_name', 'company_ruc', 'is_active'] 
            }
        ],
    });

    if (!user || !user.is_active) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'El usuario asociado a esta sesión ya no es válido o está inactivo.');
    }

    // Validación extra de seguridad: Si la compañía está inactiva, bloqueamos el acceso
    if (user.company && !user.company.is_active) {
        throw new ApiError(httpStatus.FORBIDDEN, 'La compañía asociada a esta cuenta está suspendida.');
    }

    req.user = user.toJSON();
    next();
});

/**
 * Middleware para la verificación de sesión stateful.
 */
export const checkStatefulSession = asyncHandler(async (req, res, next) => {
    const { sessionId, uuid } = req.dinHeader || {};

    if (!sessionId) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'El `sessionId` es requerido en el `dinHeader` para esta operación.');
    }
    if (!uuid) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'El `uuid` de transacción es requerido en el `dinHeader` para esta operación.');
    }

    const session = await db.Session.findOne({
        where: {
            session_id: sessionId,
            user_id: req.user.user_id,
        },
    });

    if (!session) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Sesión inválida, expirada o no autorizada.');
    }

    next();
});

/**
 * Factoría de Middlewares para autorización basada en roles.
 */
export const authorizeRole = (...allowedRoles) => {
    return asyncHandler((req, res, next) => {
        if (!req.user || !req.user.role || !req.user.role.role_name) {
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Información de rol de usuario no encontrada en la petición.');
        }

        const userRole = req.user.role.role_name;

        if (!allowedRoles.includes(userRole)) {
            throw new ApiError(httpStatus.FORBIDDEN, 'Acceso denegado. No tienes los permisos necesarios para realizar esta acción.');
        }

        next();
    });
};