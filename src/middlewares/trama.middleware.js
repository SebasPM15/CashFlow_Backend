import { ApiError } from '../utils/ApiError.js';

/**
 * Middleware para validar la ESTRUCTURA BASE de la trama genérica (dinHeader y dinBody).
 * Si la trama es válida, adjunta el dinHeader al objeto `req` para uso posterior.
 * NO valida campos de sesión como `sessionId` o `uuid`, ya que eso es responsabilidad
 * de los middlewares de autenticación.
 */
const tramaValidator = (req, res, next) => {
    // Esta validación se aplica a los métodos que envían un body.
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
        return next();
    }

    const { dinHeader, dinBody } = req.body;

    if (!dinHeader || typeof dinHeader !== 'object') {
        return next(new ApiError(400, 'La petición debe incluir un objeto `dinHeader`.'));
    }

    if (dinBody === undefined) {
        return next(new ApiError(400, 'La petición debe incluir un `dinBody`.'));
    }

    // Solo validamos los campos universales que DEBEN existir en CUALQUIER petición.
    const requiredBaseHeaders = ['aplicacionId', 'canalId', 'horaTransaccion', 'ip'];
    for (const field of requiredBaseHeaders) {
        if (!dinHeader[field]) {
            return next(new ApiError(400, `El campo '${field}' es requerido en el dinHeader.`));
        }
    }

    // Adjuntamos el header al request para que esté disponible en los siguientes middlewares.
    // NO modificamos req.body, como ya acordamos.
    req.dinHeader = dinHeader;

    next();
};

export default tramaValidator;