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
        companyName, // NUEVO
        concept,
        amount,
        type,
        transactionDate,
        categoryName,
        subcategoryName,
        methodName,
        bankDetails // NUEVO
    } = details;

    const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    
    // Formato de Fecha Mejorado
    const dateObj = new Date(transactionDate);
    // Capitalizamos la primera letra (ej: jueves -> Jueves)
    const dateStr = dateObj.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = dateObj.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: true });
    const formattedDate = `${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} - ${timeStr}`;

    const amountPrefix = type === 'CREDIT' ? '+' : '-';
    const color = type === 'CREDIT' ? '#2E8B57' : '#D2122E';
    const transactionType = type === 'CREDIT' ? 'Ingreso' : 'Egreso';

    // Construcción dinámica de campos
    const fields = [
        { type: 'mrkdwn', text: `*Empresa:*\n${companyName}` },
        { type: 'mrkdwn', text: `*Empleado:*\n${userFullName}` },
        { type: 'mrkdwn', text: `*Fecha:*\n${formattedDate}` },
        { type: 'mrkdwn', text: `*Concepto:*\n${concept}` },
        { type: 'mrkdwn', text: `*Clasificación:*\n${subcategoryName} (${categoryName})` },
        { type: 'mrkdwn', text: `*Método:*\n${methodName}` },
    ];

    // Si hay datos bancarios, los agregamos
    if (bankDetails) {
        fields.push({ 
            type: 'mrkdwn', 
            text: `*Cuenta Bancaria:*\n${bankDetails.bankName} - ${bankDetails.accountAlias}` 
        });
    }

    // El monto siempre al final destacado
    fields.push({ type: 'mrkdwn', text: `*Monto:*\n\`${amountPrefix}${formattedAmount}\` (${transactionType})` });

    return {
        text: `Nueva transacción en ${companyName}: ${concept}`,
        blocks: [
            {
                type: 'header',
                text: { type: 'plain_text', text: '💸 Nueva Transacción Registrada' },
            },
            {
                type: 'section',
                fields: fields,
            },
            { type: 'divider' },
        ],
        attachments: [{ color: color, blocks: [] }],
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