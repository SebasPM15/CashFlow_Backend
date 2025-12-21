// =================================================================
// ARCHIVO 1: src/utils/masking.util.js
// Utilidad para enmascarar datos sensibles
// =================================================================

/**
 * Enmascara un número de cuenta bancaria.
 * Muestra solo los últimos 4 dígitos.
 * 
 * @param {string} accountNumber - Número de cuenta completo
 * @returns {string} - Número enmascarado (xxxx1234)
 * 
 * @example
 * maskAccountNumber('1234567890') // 'xxxx7890'
 * maskAccountNumber('12345') // 'xxx45'
 */
export const maskAccountNumber = (accountNumber) => {
    if (!accountNumber) return '';
    
    const numStr = accountNumber.toString();
    const visibleDigits = 4;
    
    if (numStr.length <= visibleDigits) {
        // Si el número es muy corto, mostrar solo x's
        return 'x'.repeat(numStr.length);
    }
    
    const lastDigits = numStr.slice(-visibleDigits);
    const maskedPart = 'x'.repeat(numStr.length - visibleDigits);
    
    return maskedPart + lastDigits;
};

/**
 * Determina si un usuario tiene permiso para ver números completos.
 * 
 * @param {Object} user - Usuario autenticado
 * @returns {boolean}
 */
export const canViewFullAccountNumbers = (user) => {
    // Solo admins pueden ver números completos
    return user && user.role && user.role.role_name === 'admin';
};