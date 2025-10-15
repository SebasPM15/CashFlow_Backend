import jwt from 'jsonwebtoken';
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
        throw new ApiError(401, 'No autorizado. Token no proporcionado.');
    }

    let decoded;
    try {
        decoded = jwt.verify(token, config.jwt.secret, {
            issuer: config.jwt.issuer,
            audience: config.jwt.audience,
        });
    } catch (error) {
        throw new ApiError(401, 'No autorizado. El token es inválido o ha expirado.');
    }

    const user = await db.User.findByPk(decoded.sub, {
        include: { model: db.Role, as: 'role' },
    });

    if (!user || !user.is_active) {
        throw new ApiError(401, 'El usuario asociado a esta sesión ya no es válido o está inactivo.');
    }

    // Adjuntamos el usuario al request para uso en controladores posteriores.
    req.user = user.toJSON();
    next();
});

/**
 * Middleware para la verificación de sesión stateful.
 * Debe usarse SIEMPRE DESPUÉS del middleware `protect`.
 * Verifica que el `sessionId` y el `uuid` del `dinHeader` existan y que la sesión sea válida en la BD.
 */
export const checkStatefulSession = asyncHandler(async (req, res, next) => {
    const { sessionId, uuid } = req.dinHeader || {};

    // --- CORRECCIÓN CLAVE: Validamos ambos campos ---
    if (!sessionId) {
        throw new ApiError(401, 'El `sessionId` es requerido en el `dinHeader` para esta operación.');
    }
    if (!uuid) {
        throw new ApiError(401, 'El `uuid` de transacción es requerido en el `dinHeader` para esta operación.');
    }

    // Verificamos que la sesión exista Y que pertenezca al usuario del token.
    const session = await db.Session.findOne({
        where: {
            session_id: sessionId,
            user_id: req.user.user_id, // `req.user` fue establecido por el middleware `protect`
        },
    });

    if (!session) {
        throw new ApiError(401, 'Sesión inválida, expirada o no autorizada.');
    }

    // Si la sesión es válida, continuamos.
    next();
});