// src/utils/ApiError.js

export class ApiError extends Error {
    /**
     * @param {number} statusCode Código de estado HTTP
     * @param {string} message Mensaje de error
     * @param {boolean} [isOperational=true] Si el error es operacional (predecible)
     * @param {string} [stack=''] Stack trace
     */
    constructor(statusCode, message, isOperational = true, stack = '') {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
