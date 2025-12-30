// src/services/email/EmailService.js

import SibApiV3Sdk from 'sib-api-v3-sdk';
import nodemailer from 'nodemailer';
import opossum from 'opossum';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { createVerificationEmail } from './verification.template.js';
import { createPasswordResetEmail } from './passwordReset.template.js';
import { createTransactionNotificationEmail } from './transactionNotification.template.js';
import { createInvitationEmail } from './invitation.template.js';

class EmailService {
    constructor() {
        this.provider = config.email.provider; // 'brevo' o 'gmail'
        this._sendMailRaw = this._sendMailRaw.bind(this);

        // Inicialización condicional según el proveedor
        if (this.provider === 'brevo') {
            logger.info('[EmailService] Inicializando con Brevo API (producción)');

            try {
                const defaultClient = SibApiV3Sdk.ApiClient.instance;
                const apiKey = defaultClient.authentications['api-key'];
                apiKey.apiKey = config.email.brevoApiKey;

                this.client = new SibApiV3Sdk.TransactionalEmailsApi();
                logger.info('[EmailService] Cliente Brevo inicializado correctamente');
            } catch (error) {
                logger.error('[EmailService] Error al inicializar Brevo:', error);
                throw new Error(`Fallo crítico al inicializar Brevo: ${error.message}`);
            }
        } else {
            logger.info('[EmailService] Inicializando con Gmail SMTP (desarrollo)');

            this.client = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: config.email.gmail.user,
                    pass: config.email.gmail.pass
                }
            });
        }

        // Circuit Breaker para protección contra fallos
        const circuitBreakerOptions = {
            timeout: 10000,
            errorThresholdPercentage: 50,
            resetTimeout: 30000,
        };

        this.circuitBreaker = new opossum(this._sendMailRaw, circuitBreakerOptions);
        this._setupCircuitBreakerEvents();

        // Contador de emails (límite de Brevo en plan gratuito)
        this._emailsSentThisMonth = 0;
        this._monthlyLimit = config.email.provider === 'brevo' ? 300 : Infinity;
    }

    _setupCircuitBreakerEvents() {
        this.circuitBreaker.on('open', () => logger.warn('[EmailService] Circuit Breaker abierto.'));
        this.circuitBreaker.on('halfOpen', () => logger.info('[EmailService] Circuit Breaker medio abierto.'));
        this.circuitBreaker.on('close', () => logger.info('[EmailService] Circuit Breaker cerrado.'));
        this.circuitBreaker.on('failure', (error) => logger.warn('[EmailService] Fallo en envío de email', { error: error.message }));
    }

    /**
     * Envía el email según el proveedor configurado
     * @private
     */
    async _sendMailRaw(payload) {
        if (this.provider === 'brevo') {
            // === LÓGICA BREVO (PRODUCCIÓN) ===
            const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
            sendSmtpEmail.subject = payload.subject;
            sendSmtpEmail.htmlContent = payload.html;
            sendSmtpEmail.sender = { name: "CashFlow", email: config.email.from };
            sendSmtpEmail.to = [{ email: payload.to }];

            // DESACTIVAR TRACKING DE BREVO (enlaces y aperturas)
            sendSmtpEmail.params = {
                DISABLE_CLICK_TRACKING: true,
                DISABLE_OPEN_TRACKING: true
            };

            try {
                const data = await this.client.sendTransacEmail(sendSmtpEmail);
                logger.info('[EmailService] Email enviado vía Brevo:', data);
                return data;
            } catch (error) {
                const msg = error.body ? JSON.stringify(error.body) : error.message;
                logger.error('[EmailService] Error de Brevo:', msg);
                throw new Error(`Brevo Error: ${msg}`);
            }
        } else {
            // === LÓGICA GMAIL/NODEMAILER (DESARROLLO) ===
            const mailOptions = {
                from: `CashFlow Dev <${config.email.from}>`,
                to: payload.to,
                subject: `[DEV] ${payload.subject}`,
                html: payload.html
            };

            return await this.client.sendMail(mailOptions);
        }
    }

    /**
     * Ejecuta el envío con Circuit Breaker y validación de límites
     * @private
     */
    async _executeSecureSend(payload) {
        // Verificar límite mensual (solo en Brevo)
        if (this.provider === 'brevo' && this._emailsSentThisMonth >= this._monthlyLimit) {
            logger.error('[EmailService] ⚠️ LÍMITE MENSUAL DE BREVO ALCANZADO');
            throw new Error('Límite mensual de emails alcanzado. Considera actualizar tu plan de Brevo.');
        }

        try {
            logger.info(`[EmailService] Enviando email '${payload.subject}' a: ${payload.to}`);
            await this.circuitBreaker.fire(payload);
            this._emailsSentThisMonth++;
            logger.info(`[EmailService] ✅ Correo enviado exitosamente a: ${payload.to} (${this._emailsSentThisMonth}/${this._monthlyLimit})`);
        } catch (error) {
            logger.error(`[EmailService] ❌ Fallo al enviar a ${payload.to}. Causa: ${error.message}`);
            throw error; // Re-lanzamos para que el caller maneje el error
        }
    }

    /**
     * Método interno unificado para enviar correos
     * @private
     */
    async _sendSecure(to, template) {
        const payload = {
            to,
            subject: template.subject,
            html: template.html
        };

        await this._executeSecureSend(payload);
    }

    // =================================================================
    // MÉTODOS PÚBLICOS
    // =================================================================

    /**
     * Envía un correo de verificación con código de 6 dígitos
     */
    async sendVerificationEmail(to, code) {
        const template = createVerificationEmail({ verificationCode: code });
        await this._sendSecure(to, template);
    }

    /**
     * Envía un correo de restablecimiento de contraseña
     */
    async sendPasswordResetEmail(to, code) {
        const template = createPasswordResetEmail({ verificationCode: code });
        await this._sendSecure(to, template);
    }

    /**
     * Envía notificación de nueva transacción
     */
    async sendNewTransactionNotification(to, transactionDetails) {
        const template = createTransactionNotificationEmail(transactionDetails);
        await this._sendSecure(to, template);
    }

    /**
     * Envía un correo de invitación a un nuevo empleado
     */
    async sendInvitationEmail(to, data) {
        const template = createInvitationEmail(data);
        await this._sendSecure(to, template);
    }

    /**
     * Método helper para enviar correos masivos (múltiples destinatarios)
     */
    async sendBulkEmail(recipients, templateGenerator, templateData) {
        const promises = recipients.map(email =>
            this._sendSecure(email, templateGenerator(templateData)).catch(err => {
                logger.error(`[EmailService] Error enviando a ${email}`, { error: err.message });
                return null;
            })
        );

        const results = await Promise.allSettled(promises);
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        logger.info(`[EmailService] Envío masivo completado: ${successful} exitosos, ${failed} fallidos`);

        return { successful, failed };
    }
}

export default new EmailService();