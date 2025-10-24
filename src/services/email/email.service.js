import nodemailer from 'nodemailer';
// import opossum from 'opossum'; // <--- Eliminado
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
            secure: false, // port 587 requires secure: false for STARTTLS
            requireTLS: true, // Force STARTTLS
            auth: config.email.auth, // user and pass (App Password)
            debug: true, // Mantenemos el debug por ahora
            logger: true // Mantenemos el logger por ahora
        });

        // Binding _sendMail sigue siendo útil si lo llamaras de otra forma, lo dejamos.
        this._sendMail = this._sendMail.bind(this);

        // --- LÓGICA DEL CIRCUIT BREAKER ELIMINADA ---
        // const circuitBreakerOptions = { ... };
        // this.circuitBreaker = new opossum(this._sendMail, circuitBreakerOptions);
        // this.circuitBreaker.on('open', ...);
        // this.circuitBreaker.on('close', ...);
        // this.circuitBreaker.on('failure', ...);
        // --- FIN DE LA ELIMINACIÓN ---
    }

    /** @private */
    async _sendMail(mailOptions) {
        // Esta función ahora solo es llamada por _sendSecure
        await this.transporter.sendMail(mailOptions);
    }

    /**
     * Envía un correo directamente.
     * @private
     */
    async _sendSecure(to, template) {
        try {
            logger.info(`Intentando enviar email de tipo '${template.subject}' a: ${to}`);
            const mailOptions = { from: config.email.from, to, ...template };

            // --- CAMBIO CLAVE: Llamada directa a _sendMail ---
            await this._sendMail(mailOptions);

            logger.info(`Email '${template.subject}' enviado exitosamente a: ${to}`);
        } catch (error) {
            // Si hay un timeout u otro error, se registrará aquí.
            logger.error(`No se pudo enviar el email a ${to}. Causa: ${error.message}`, { error }); // Logueamos el error completo
        }
    }

    // =================================================================
    // Métodos Públicos (API del Servicio) - Sin cambios aquí
    // =================================================================

    async sendVerificationEmail(to, code) {
        const template = createVerificationEmail({ verificationCode: code });
        // Llama a _sendSecure, que ahora es directo
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