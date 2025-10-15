import winston from 'winston';
import config from '../config/index.js';
import { sanitizeLog } from './helpers/logSanitizer.js';

// --- Formato Personalizado de Sanitización ---
// Este formato se aplicará PRIMERO a cada log para limpiar datos sensibles.
const sanitizerFormat = winston.format((info) => {
    // 'splat' contiene los metadatos adicionales pasados al logger
    // Ejemplo: logger.info('Mensaje', { user: '...', details: '...' })
    const splat = info[Symbol.for('splat')];

    // Clonamos el objeto info para no mutar el original
    const sanitizedInfo = { ...info };

    // Si hay metadatos, los sanitizamos.
    if (splat && splat.length) {
        // Reemplazamos el splat original con su versión sanitizada
        sanitizedInfo[Symbol.for('splat')] = splat.map(sanitizeLog);
    }

    // También sanitizamos el objeto `info` principal, incluyendo `message` si es un objeto.
    if (typeof sanitizedInfo.message === 'object') {
        sanitizedInfo.message = sanitizeLog(sanitizedInfo.message);
    }

    return sanitizedInfo;
});


// --- Formatos de Salida ---
const formats = {
    // Formato JSON para producción: Sanitizar -> Poner Timestamp -> Convertir a JSON
    json: winston.format.combine(
        sanitizerFormat(),
        winston.format.timestamp(),
        winston.format.json()
    ),
    // Formato para la consola en desarrollo: Sanitizar -> Colorear -> Poner Timestamp -> Imprimir de forma legible
    console: winston.format.combine(
        sanitizerFormat(),
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(info => {
            // Formateamos el mensaje y cualquier metadato (ya sanitizado) de forma legible
            const message = typeof info.message === 'object' ? JSON.stringify(info.message, null, 2) : info.message;
            const splat = info[Symbol.for('splat')] || [];
            const meta = splat.length ? ` ${JSON.stringify(splat[0], null, 2)}` : '';
            return `${info.timestamp} ${info.level}: ${message}${meta}`;
        })
    ),
};

// --- Configuración de Transports (Salidas de Log) ---
const transports = [];

if (config.app.env === 'production') {
    // En producción, los logs van a la consola en formato JSON para ser capturados por servicios externos.
    transports.push(new winston.transports.Console({
        format: formats.json,
    }));
} else {
    // En desarrollo, usamos un formato más amigable para la lectura humana.
    transports.push(new winston.transports.Console({
        format: formats.console,
    }));
}

// --- Creación del Logger Principal ---
const logger = winston.createLogger({
    level: config.logging.level,
    format: formats.json, // Formato base por defecto
    transports,
    exitOnError: false, // No detener la aplicación en un error manejado
});

export default logger;