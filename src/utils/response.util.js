import config from '../config/index.js';

/**
 * Módulo centralizado para la construcción de respuestas de API estandarizadas.
 * Esta es la única función que los controladores deben usar para enviar una respuesta.
 * Depende del `trama.middleware` para obtener el contexto del `dinHeader` entrante.
 *
 * @param {import('express').Response} res - El objeto de la respuesta de Express.
 * @param {number} statusCode - El código de estado HTTP (ej. 200, 404, 500).
 * @param {string} message - Un mensaje descriptivo y legible para el `dinHeader`.
 * @param {object | null} [data=null] - El payload de la respuesta (`dinBody`).
 * @param {Error | object | null} [error=null] - El objeto de error para el `dinError`.
 */
export const sendResponse = (res, statusCode, message, data = null, error = null) => {
    const timestamp = new Date().toISOString();
    const requestDinHeader = res.req.dinHeader || {};

    // 1. Determinar el contexto del usuario para trazabilidad
    const userId =
        res.req.user?.user_id ||         // 1. Prioridad: Usuario del token de autenticación.
        data?.user_id ||                 // 2. Fallback: ID en el nivel superior del payload (para login/registro plano).
        data?.user?.user_id ||           // 3. Fallback: ID en un objeto anidado (por si se usa en otro lugar).
        'ANONYMOUS';                     // 4. Último recurso.

    // 2. Construir el dinHeader de la respuesta
    const dinHeader = {
        ...requestDinHeader,
        usuarioId: userId,
        timestamp,
        message,
        statusCode,
    };

    // 3. Construir el dinBody y dinError según el resultado de la operación
    let dinBody = null;
    let dinError = null;

    if (error) {
        // Si hay un error, el dinBody es nulo y construimos el dinError
        const isProduction = config.app.env === 'production';
        dinError = {
            tipo: 'E', // 'E' para Error
            fecha: timestamp,
            origen: error.origen || 'APP',
            codigo: String(error.code || statusCode),
            mensaje: error.message || 'Ocurrió un error inesperado.',
            detalle: isProduction ? 'Consulte los logs para más detalles.' : error.stack || String(error),
        };
    } else {
        // Si la operación fue exitosa, el dinBody contiene los datos
        dinBody = data;
        dinError = {
            tipo: 'N', // 'N' para Normal (éxito)
            fecha: timestamp,
            origen: null,
            codigo: '0000',
            mensaje: 'OK',
            detalle: 'OK',
        };
    }

    // 4. Enviar la respuesta JSON final
    return res.status(statusCode).json({
        dinHeader,
        dinBody,
        dinError,
    });
};