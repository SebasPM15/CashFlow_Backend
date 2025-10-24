// src/middlewares/error.middleware.js

import config from '../config/index.js';
import { ApiError } from '../utils/ApiError.js';

export const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';

    // Si no es un ApiError, podría ser un error inesperado.
    // En producción, no filtramos detalles de errores internos.
    if (!(err instanceof ApiError) && config.app.env === 'production') {
        // Aquí podríamos loggear el error completo con un logger como Winston
        console.error('UNEXPECTED_ERROR:', err);
        statusCode = 500;
        message = 'An unexpected error occurred.';
    }

    // En desarrollo, mostramos más detalles
    const errorResponse = {
        success: false,
        message,
        ...(config.app.env === 'development' && { stack: err.stack }),
    };

    res.status(statusCode).json(errorResponse);
};
