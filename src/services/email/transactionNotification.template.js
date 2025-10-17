// src/services/email/transactionNotification.template.js

import { createHtmlWrapper } from './base.template.js';

/**
 * Crea el template de correo para notificar una nueva transacción.
 * @param {object} details - Detalles de la transacción.
 * @param {string} details.userFullName - Nombre completo del empleado.
 * @param {string} details.concept - Concepto de la transacción.
 * @param {number} details.amount - Monto de la transacción.
 * @param {'CREDIT' | 'DEBIT'} details.type - Tipo de transacción.
 * @param {Date} details.transactionDate - Fecha y hora de la transacción.
 * @returns {{subject: string, html: string}}
 */
export function createTransactionNotificationEmail(details) {
    const { userFullName, concept, amount, type, transactionDate } = details;

    const title = 'Nueva Transacción Registrada';
    const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    const transactionType = type === 'CREDIT' ? 'Ingreso (Crédito)' : 'Egreso (Débito)';
    const formattedDate = transactionDate.toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });

    const body = `
    <p style="margin:0 0 16px;">Hola Administrador,</p>
    <p style="margin:0 0 24px;">Se ha registrado una nueva transacción en el sistema por el empleado <strong>${userFullName}</strong>. A continuación, los detalles:</p>
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:24px;">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;"><strong>Concepto:</strong></td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;">${concept}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;"><strong>Monto:</strong></td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;">${formattedAmount}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;"><strong>Tipo:</strong></td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;">${transactionType}</td></tr>
      <tr><td style="padding:8px 0;"><strong>Fecha y Hora:</strong></td><td style="padding:8px 0;text-align:right;">${formattedDate}</td></tr>
    </table>
    <p style="margin:0;">Puedes revisar el detalle completo en el panel de administración de la aplicación.</p>
  `;

    return {
        subject: title,
        html: createHtmlWrapper(title, body),
    };
}