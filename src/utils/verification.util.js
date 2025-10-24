// src/utils/verification.util.js

/**
 * Genera un código de verificación numérico de 6 dígitos como string.
 * @returns {string}
 */
export const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};