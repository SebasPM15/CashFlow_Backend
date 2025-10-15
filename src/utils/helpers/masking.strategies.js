/**
 * @file Contiene un conjunto de funciones (estrategias) para enmascarar diferentes tipos de datos sensibles.
 */

// --- Estrategias de Enmascaramiento ---

/**
 * Oculta completamente un valor. Estrategia por defecto y de fallback.
 */
const maskFull = (value) => '[REDACTED]';

/**
 * Enmascara un correo electrónico, preservando caracteres clave y el dominio.
 * Ejemplo: 'mateo.pilco@gmail.com' -> 'm********o@gmail.com'
 */
const maskEmail = (email) => {
    if (typeof email !== 'string' || !email.includes('@')) {
        return maskFull(email);
    }
    const [user, domain] = email.split('@');
    if (user.length <= 2) {
        return `**@${domain}`;
    }
    return `${user[0]}${'*'.repeat(user.length - 2)}${user.slice(-1)}@${domain}`;
};

/**
 * Enmascara un nombre o apellido, preservando solo la primera letra.
 */
const maskName = (name) => {
    if (typeof name !== 'string' || name.length === 0) {
        return maskFull(name);
    }
    return `${name[0]}${'*'.repeat(name.length - 1)}`;
};

/**
 * Helper genérico para enmascarar parcialmente un identificador.
 * Muestra los 2 primeros y los 4 últimos caracteres.
 */
const maskPartialIdentifier = (id) => {
    const s = String(id);
    if (s.length < 7) {
        return maskFull(id);
    }
    return `${s.slice(0, 2)}....${s.slice(-4)}`;
};

/**
 * Mapea los nombres de las estrategias (usados en .env) a sus funciones.
 */
export const strategies = {
    full: maskFull,
    email: maskEmail,
    name: maskName,
    dni: maskPartialIdentifier,
    phone: maskPartialIdentifier,
};