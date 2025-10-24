// src/services/notification.service.js

import { IncomingWebhook } from '@slack/webhook';
import config from '../config/index.js';
import logger from '../utils/logger.js'; // [cite: 421]

// Inicializamos el webhook con la URL de nuestra configuración [cite: 426]
const webhook = new IncomingWebhook(config.slack.webhookUrl);

/**
 * Formatea los datos de la transacción para un mensaje de Slack.
 * @param {object} details - Mismo objeto que el template de email.
 * @param {string} details.userFullName
 * @param {string} details.concept
 * @param {number} details.amount
 * @param {'CREDIT' | 'DEBIT'} details.type
 * @param {Date} details.transactionDate
 * @returns {object} - Payload formateado para Slack (Blocks)
 */
const _formatTransactionMessage = (details) => {
    const {
        userFullName,
        concept,
        amount,
        type,
        transactionDate,
        categoryName,
        subcategoryName,
        methodName,
    } = details;

    // Formateamos los datos igual que en el template de email
    const formattedAmount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount);
    const transactionType = type === 'CREDIT' ? 'Ingreso (Crédito)' : 'Egreso (Débito)';
    const formattedDate = transactionDate.toLocaleString('es-EC', {
        timeZone: 'America/Guayaquil',
    });
    const amountPrefix = type === 'CREDIT' ? '+' : '-';
    const color = type === 'CREDIT' ? '#2E8B57' : '#D2122E';

    return {
        text: `Nueva transacción registrada: ${concept}`,
        blocks: [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: '💸 Nueva Transacción Registrada',
                },
            },
            {
                // --- MODIFICACIÓN: Añadimos los nuevos campos al layout ---
                type: 'section',
                fields: [
                    { type: 'mrkdwn', text: `*Empleado:*\n${userFullName}` },
                    { type: 'mrkdwn', text: `*Fecha y Hora:*\n${formattedDate}` },
                    { type: 'mrkdwn', text: `*Concepto:*\n${concept}` },
                    { type: 'mrkdwn', text: `*Tipo:*\n${transactionType}` },
                    { type: 'mrkdwn', text: `*Categoría:*\n${categoryName}` },
                    { type: 'mrkdwn', text: `*Subcategoría:*\n${subcategoryName}` },
                    { type: 'mrkdwn', text: `*Método de Pago:*\n${methodName}` },
                    { type: 'mrkdwn', text: `*Monto:*\n\`${amountPrefix}${formattedAmount}\`` },
                ],
            },
            {
                type: 'divider',
            },
        ],
        attachments: [
            {
                color: color,
                blocks: [],
            },
        ],
    };
};

/**
 * Envía una notificación de nueva transacción a Slack.
 * Esta función es "fire-and-forget": NUNCA lanza un error.
 * Si falla, solo lo loguea.
 * @param {object} details - Mismo objeto que el template de email.
 */
const sendNewTransactionNotification = async (details) => {
    try {
        const messagePayload = _formatTransactionMessage(details);

        logger.info('Enviando notificación de transacción a Slack...');
        await webhook.send(messagePayload);
        logger.info('Notificación a Slack enviada exitosamente.');

    } catch (error) {
        // ¡CRÍTICO! Capturamos el error y solo lo logueamos.
        // No relanzamos la excepción para no detener el flujo principal.
        logger.error({
            message: 'Error al enviar la notificación a Slack',
            error: error.message,
            stack: error.stack,
        });
    }
};

export const notificationService = {
    sendNewTransactionNotification,
};