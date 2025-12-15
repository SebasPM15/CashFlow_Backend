// src/services/email/invitation.template.js

// 1. CORRECCIÓN: Importamos el nombre correcto
import { createHtmlWrapper } from './base.template.js';

/**
 * Crea el template HTML para el email de invitación.
 */
export const createInvitationEmail = (data) => {
    const { companyName, invitationCode, invitationLink, roleName } = data;

    // 2. Definimos el contenido específico (body)
    const bodyContent = `
        <h2 style="color: #333; margin-bottom: 20px;">¡Has sido invitado a unirte a ${companyName}!</h2>
        
        <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Has recibido una invitación para unirte a <strong>${companyName}</strong> 
            como <strong>${roleName}</strong> en la plataforma de gestión de flujo de caja.
        </p>

        <div style="background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #495057; font-size: 14px;">
                <strong>Código de invitación:</strong>
            </p>
            <p style="margin: 10px 0; color: #007bff; font-size: 32px; font-weight: bold; letter-spacing: 5px;">
                ${invitationCode}
            </p>
        </div>

        <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
            Para completar tu registro, haz clic en el siguiente botón y proporciona 
            este código junto con tu información personal:
        </p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="${invitationLink}" 
               style="display: inline-block; padding: 15px 40px; background-color: #007bff; color: #ffffff; 
                      text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                Aceptar Invitación
            </a>
        </div>

        <p style="color: #999; font-size: 13px; margin-top: 30px; line-height: 1.6;">
            <strong>Nota:</strong> Esta invitación es válida por 7 días. Si no completas tu registro 
            en ese plazo, deberás solicitar una nueva invitación al administrador.
        </p>

        <p style="color: #999; font-size: 13px; margin-top: 15px;">
            Si no esperabas este correo, puedes ignorarlo de forma segura.
        </p>
    `;

    const subject = `Invitación para unirte a ${companyName}`;

    // 3. CORRECCIÓN: Usamos tu función createHtmlWrapper(title, body)
    const html = createHtmlWrapper(subject, bodyContent);

    // Retornamos el objeto que espera el email.service.js
    return {
        subject,
        html
    };
};