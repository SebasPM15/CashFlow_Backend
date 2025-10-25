import nodemailer from 'nodemailer';
import opossum from 'opossum';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { createVerificationEmail } from './verification.template.js';
import { createPasswordResetEmail } from './passwordReset.template.js';
import { createTransactionNotificationEmail } from './transactionNotification.template.js';

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: config.email.host,
            port: config.email.port,
            auth: config.email.auth,
            tls: {
                ciphers:'SSLv3'
            }
        });

        this._sendMail = this._sendMail.bind(this);

        const circuitBreakerOptions = {
            timeout: 5000,
            errorThresholdPercentage: 50,
            resetTimeout: 30000,
        };

        // --- Se añade la palabra 'new' ---
        this.circuitBreaker = new opossum(this._sendMail, circuitBreakerOptions);

        this.circuitBreaker.on('open', () => logger.error('[EmailService] Circuit Breaker opened.'));
        this.circuitBreaker.on('close', () => logger.info('[EmailService] Circuit Breaker closed.'));
        this.circuitBreaker.on('failure', (error) => logger.warn('[EmailService] Email sending failed.', { error: error.message }));
    }

    /** @private */
    async _sendMail(mailOptions) {
        await this.transporter.sendMail(mailOptions);
    }

    /**
     * Envía un correo de forma segura a través del Circuit Breaker.
     * @private
     */
    async _sendSecure(to, template) {
        try {
            logger.info(`Intentando enviar email de tipo '${template.subject}' a: ${to}`);
            const mailOptions = { from: config.email.from, to, ...template };

            await this.circuitBreaker.fire(mailOptions);
            logger.info(`Email '${template.subject}' enviado exitosamente a: ${to}`);
        } catch (error) {
            logger.error(`No se pudo enviar el email a ${to}. Causa: ${error.message}`);
        }
    }

    // =================================================================
    // Métodos Públicos (API del Servicio)
    // =================================================================

    async sendVerificationEmail(to, code) {
        const template = createVerificationEmail({ verificationCode: code });
        await this._sendSecure(to, template);
    }

    async sendPasswordResetEmail(to, code) {
        const template = createPasswordResetEmail({ verificationCode: code });
        await this._sendSecure(to, template);
    }

    async sendNewTransactionNotification(to, transactionDetails) {
        const template = createTransactionNotificationEmail(transactionDetails);
        await this._sendSecure(to, template);
    }
}

export default new EmailService();