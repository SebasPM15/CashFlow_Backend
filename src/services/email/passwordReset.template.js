import { createHtmlWrapper } from './base.template.js';

/**
 * Genera el contenido para el correo de restablecimiento de contraseña.
 * @param {{verificationCode: string}} data - El código de 6 dígitos.
 * @returns {{subject: string, html: string, text: string}}
 */
export function createPasswordResetEmail({ verificationCode }) {
    const title = 'Restablecer tu contraseña';
    const body = `
    <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de CashFlow App.</p>
    <p>Usa este código para completar el proceso:</p>
    <div style="background-color: #f1f8e9; border-left: 4px solid #558b2f; padding: 15px; margin: 20px 0; text-align: center;">
      <p style="margin: 0; font-size: 28px; font-weight: bold; color: #33691e; letter-spacing: 4px;">
        ${verificationCode}
      </p>
    </div>
    <p>Este código es válido por 15 minutos. Si no solicitaste un cambio de contraseña, puedes ignorar este correo de forma segura.</p>`;

    const html = createHtmlWrapper(title, body);
    const text = `Tu código para restablecer la contraseña de CashFlow App es: ${verificationCode}. Válido por 15 minutos.`;

    return { subject: 'Solicitud de Restablecimiento de Contraseña', html, text };
}