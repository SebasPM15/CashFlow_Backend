import { strategies } from './masking.strategies.js';
import config from '../../config/index.js'; // Importamos la config central

const MASKING_CONFIG = new Map();

/**
 * Carga la configuración de enmascaramiento desde nuestro config centralizado.
 */
function loadMaskingConfig() {
    // Leemos la configuración ya validada por envalid
    const fieldsConfig = config.logging.sensitiveFields || '';

    const rules = fieldsConfig.split(',').filter(Boolean);
    for (const rule of rules) {
        const [field, strategy] = rule.trim().split('.');
        if (field && strategy) {
            MASKING_CONFIG.set(field.toLowerCase(), strategy);
        }
    }
}

// Cargar la configuración al iniciar el módulo.
loadMaskingConfig();

/**
 * Función principal y única exportada. Inicia el proceso de sanitización.
 * @param {any} data - El objeto o dato a sanitizar.
 * @returns {any} - El objeto o dato completamente sanitizado.
 */
export function sanitizeLog(data) {
    // Clonamos el objeto para no mutar el original, lo cual es una buena práctica.
    const dataClone = JSON.parse(JSON.stringify(data));
    return recursiveSanitize(dataClone);
}

/**
 * Recorre recursivamente una estructura de datos y aplica las reglas de sanitización.
 */
function recursiveSanitize(data) {
    if (data === null || data === undefined) {
        return data;
    }
    if (Array.isArray(data)) {
        return data.map(item => recursiveSanitize(item));
    }
    if (typeof data !== 'object') {
        return data;
    }

    for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            const keyLower = key.toLowerCase();
            const value = data[key];

            // Prioridad 1: Reglas especiales por nombre de clave.
            if (keyLower === 'authorization' && typeof value === 'string') {
                data[key] = '[REDACTED_TOKEN]';
                continue;
            }
            if (keyLower.includes('cookie') && typeof value === 'string') {
                data[key] = value.replace(/(refreshToken=)([^;]+)/i, '$1[REDACTED]');
                continue;
            }

            // Prioridad 2: Enmascaramiento configurable basado en config/index.js.
            if (MASKING_CONFIG.has(keyLower)) {
                const maskType = MASKING_CONFIG.get(keyLower);
                const masker = strategies[maskType] || strategies.full;
                data[key] = masker(value);
                continue;
            }

            // Default: Si no hay reglas, continuar de forma recursiva.
            data[key] = recursiveSanitize(value);
        }
    }
    return data;
}