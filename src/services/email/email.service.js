// 1. CAMBIO: Importamos 'sgMail' y quitamos 'nodemailer'
import sgMail from '@sendgrid/mail';
import opossum from 'opossum';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { createVerificationEmail } from './verification.template.js';
import { createPasswordResetEmail } from './passwordReset.template.js';
import { createTransactionNotificationEmail } from './transactionNotification.template.js';

class EmailService {
    constructor() {
<<<<<<< Updated upstream
        this.transporter = nodemailer.createTransport({
            host: config.email.host,
            port: config.email.port,
            auth: config.email.auth,
            tls: {
                ciphers:'SSLv3'
            }
        });
=======
        // 2. CAMBIO: Quitamos 'nodemailer.createTransport' y
        //    configuramos la API Key de SendGrid.
        //    Tu config ahora debe pasar 'config.email.apiKey'
        sgMail.setApiKey(config.email.apiKey);
>>>>>>> Stashed changes

        this._sendMail = this._sendMail.bind(this);

        const circuitBreakerOptions = {
            timeout: 5000,
            errorThresholdPercentage: 50,
            resetTimeout: 30000,
        };

        this.circuitBreaker = new opossum(this._sendMail, circuitBreakerOptions);

        this.circuitBreaker.on('open', () => logger.error('[EmailService] Circuit Breaker opened.'));
        this.circuitBreaker.on('close', () => logger.info('[EmailService] Circuit Breaker closed.'));
        this.circuitBreaker.on('failure', (error) => logger.warn('[EmailService] Email sending failed.', { error: error.message }));
    }

    /** @private */
    async _sendMail(mailOptions) {
        // 3. CAMBIO: Reemplazamos 'transporter.sendMail'
        //    por el método del SDK de SendGrid.
        await sgMail.send(mailOptions);
    }

    /**
     * Envía un correo de forma segura a través del Circuit Breaker.
     * @private
     */
    async _sendSecure(to, template) {
        try {
            logger.info(`Intentando enviar email de tipo '${template.subject}' a: ${to}`);
            
            // ESTO NO CAMBIA: El formato de mailOptions de SendGrid
            // es compatible con el que ya tenías.
            const mailOptions = { from: config.email.from, to, ...template };

            await this.circuitBreaker.fire(mailOptions);
            logger.info(`Email '${template.subject}' enviado exitosamente a: ${to}`);
        } catch (error) {
            // Manejamos los errores que SendGrid pueda lanzar
            let errorMessage = error.message;
            if (error.response) {
                // Captura errores específicos de la API de SendGrid
                errorMessage = error.response.body.errors[0]?.message || 'SendGrid API Error';
            }
            logger.error(`No se pudo enviar el email a ${to}. Causa: ${errorMessage}`);
        }
    }

    // =================================================================
    // MÉTODOS PÚBLICOS
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