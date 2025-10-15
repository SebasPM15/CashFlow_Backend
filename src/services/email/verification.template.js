import { createHtmlWrapper } from './base.template.js';

/**
 * Genera el contenido para el correo de verificación de cuenta.
 * @param {{verificationCode: string}} data - El código de 6 dígitos.
 * @returns {{subject: string, html: string, text: string}}
 */
export function createVerificationEmail({ verificationCode }) {
    const title = 'Confirma tu cuenta';
    const body = `
    <p>¡Gracias por registrarte en CashFlow App!</p>
    <p>Para activar tu cuenta, por favor usa el siguiente código de verificación:</p>
    <div style="background-color: #e3f2fd; border-left: 4px solid #1976d2; padding: 15px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; font-size: 28px; font-weight: bold; color: #0d47a1; letter-spacing: 4px;">
        ${verificationCode}
      </p>
    </div>
    <p>Este código es válido por 15 minutos.</p>`;

    const html = createHtmlWrapper(title, body);
    const text = `Tu código de verificación para CashFlow App es: ${verificationCode}. Expira en 15 minutos.`;

    return { subject: 'Tu Código de Verificación de CashFlow App', html, text };
}