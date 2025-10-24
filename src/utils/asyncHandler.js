// src/utils/asyncHandler.js

/**
 * Captura excepciones en controladores asíncronos y las pasa al
 * middleware de errores de Express usando next().
 * @param {Function} fn - El controlador asíncrono.
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;