// src/services/auth.service.js

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import db from '../models/index.js';
import config from '../config/index.js';
import { ApiError } from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import { generateVerificationCode } from '../utils/verification.util.js';
import { generateAccessAndRefreshTokens } from '../utils/generateTokens.js';
import emailService from './email/email.service.js';

class AuthService {

    // =================================================================
    // Helpers Privados (Lógica Centralizada - DRY)
    // =================================================================

    /**
     * Busca un usuario por su email, incluyendo su compañía.
     * @private
     */
    async _findUserByEmail(email, { withPassword = false, transaction = null } = {}) {
        const scope = withPassword ? 'withPassword' : 'defaultScope';
        return db.User.scope(scope).findOne({
            where: { email },
            include: [
                { model: db.Role, as: 'role', attributes: ['role_name'] },
                { 
                    model: db.Company, 
                    as: 'company', 
                    // AGREGA 'is_active' AQUÍ ABAJO 👇
                    attributes: ['company_id', 'company_name', 'company_ruc', 'is_active'] 
                }
            ],
            transaction,
        });
    }

    /**
     * Valida las credenciales y el estado de la cuenta de un usuario para el login.
     * @private
     */
    async _validateUserCredentials(email, password) {
        const user = await this._findUserByEmail(email, { withPassword: true });

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            throw new ApiError(401, 'Credenciales inválidas.');
        }
        if (!user.is_verified) {
            throw new ApiError(403, 'Tu cuenta no ha sido verificada.');
        }
        if (!user.is_active) {
            throw new ApiError(403, 'Tu cuenta está desactivada. Contacta al administrador.');
        }
        
        // Verificar que la compañía esté activa
        if (!user.company.is_active) {
            throw new ApiError(403, 'La compañía asociada a tu cuenta está desactivada. Contacta a soporte.');
        }
        
        return user;
    }

    /**
     * Crea y persiste una nueva sesión para un usuario, invalidando las anteriores.
     * @private
     */
    async _createAndPersistSession(user) {
        const { accessToken, refreshToken } = generateAccessAndRefreshTokens(user);
        const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await db.Session.destroy({ where: { user_id: user.user_id } });

        const newSession = await db.Session.create({
            user_id: user.user_id,
            refresh_token_hash: refreshTokenHash,
            expires_at: expiresAt,
        });

        return {
            accessToken,
            refreshToken,
            sessionId: newSession.session_id,
            uuid: newSession.session_uuid
        };
    }

    /**
     * Genera, asigna y guarda un nuevo código de verificación para un usuario.
     * @private
     */
    async _generateAndSetVerificationCode(user) {
        const verificationCode = generateVerificationCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        user.verification_code = verificationCode;
        user.verification_code_expires_at = expiresAt;

        await user.save();
        return verificationCode;
    }

    // =================================================================
    // Flujos Públicos (API del Servicio)
    // =================================================================

    /**
     * Orquesta el registro de un nuevo ADMIN que crea su compañía.
     */
    async registerAdmin(userData) {
        const { 
            companyRuc, 
            companyName, 
            firstName, 
            lastName, 
            email, 
            password, 
            phoneNumber 
        } = userData;

        // Validaciones iniciales
        if (!companyRuc || !companyName || !firstName || !lastName || !email || !password) {
            throw new ApiError(400, 'Todos los campos son requeridos para el registro del administrador.');
        }

        const t = await db.sequelize.transaction();
        try {
            // 1. Verificar que el email no esté registrado
            const existingUser = await this._findUserByEmail(email, { transaction: t });
            if (existingUser) {
                throw new ApiError(409, 'El correo electrónico ya está registrado.');
            }

            // 2. Verificar que el RUC no esté registrado
            const existingCompany = await db.Company.findOne({ 
                where: { company_ruc: companyRuc }, 
                transaction: t 
            });
            if (existingCompany) {
                throw new ApiError(409, 'El RUC ya está registrado en el sistema.');
            }

            // 3. Crear la compañía
            const newCompany = await db.Company.create({
                company_ruc: companyRuc,
                company_name: companyName,
                is_active: true,
            }, { transaction: t });

            logger.info(`Compañía creada: ${newCompany.company_name} (RUC: ${newCompany.company_ruc})`);

            // 4. Obtener el rol de admin
            const adminRole = await db.Role.findOne({ 
                where: { role_name: 'admin' }, 
                transaction: t 
            });
            if (!adminRole) {
                throw new ApiError(500, 'Configuración de rol base no encontrada.');
            }

            // 5. Crear el usuario admin
            const passwordHash = await bcrypt.hash(password, 10);
            const verificationCode = generateVerificationCode();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

            const newUser = await db.User.create({
                company_id: newCompany.company_id,
                role_id: adminRole.role_id,
                first_name: firstName,
                last_name: lastName,
                email: email,
                phone_number: phoneNumber,
                password_hash: passwordHash,
                verification_code: verificationCode,
                verification_code_expires_at: expiresAt,
            }, { transaction: t });

            await t.commit();

            // 6. Enviar email de verificación
            await emailService.sendVerificationEmail(newUser.email, verificationCode);

            logger.info('Administrador registrado exitosamente.', {
                userId: newUser.user_id,
                email: newUser.email,
                companyId: newCompany.company_id
            });

            return {
                user: {
                    user_id: newUser.user_id,
                    email: newUser.email
                },
                company: {
                    company_id: newCompany.company_id,
                    company_name: newCompany.company_name,
                    company_ruc: newCompany.company_ruc
                }
            };
        } catch (error) {
            await t.rollback();
            throw error instanceof ApiError ? error : new ApiError(500, 'No se pudo completar el registro.');
        }
    }

    /**
     * Orquesta el inicio de sesión del usuario.
     */
    async login(email, password) {
        if (!email || !password) throw new ApiError(400, 'Email y contraseña son requeridos.');

        const user = await this._validateUserCredentials(email, password);
        const { accessToken, refreshToken, sessionId, uuid } = await this._createAndPersistSession(user);

        logger.info(`Inicio de sesión exitoso para ${email}`);

        const userDto = user.toJSON();
        delete userDto.password_hash;

        return { user: userDto, accessToken, refreshToken, sessionId, uuid };
    }

    /**
     * Verifica la cuenta de un usuario.
     */
    async verifyAccount(email, verificationCode) {
        if (!email || !verificationCode) throw new ApiError(400, 'Email y código son requeridos.');

        const user = await this._findUserByEmail(email);
        if (!user || user.verification_code !== verificationCode) throw new ApiError(400, 'Código inválido.');
        if (user.is_verified) throw new ApiError(409, 'La cuenta ya ha sido verificada.');
        if (user.verification_code_expires_at < new Date()) throw new ApiError(410, 'El código ha expirado.');

        await user.update({ 
            is_verified: true, 
            is_active: true,  // Activar la cuenta al verificar
            verification_code: null, 
            verification_code_expires_at: null 
        });

        logger.info(`Cuenta verificada para: ${email}`);
        return { message: 'Cuenta verificada exitosamente. Ahora puedes iniciar sesión.' };
    }

    /**
     * Reenvía un nuevo código de verificación a un usuario no verificado.
     */
    async resendVerificationCode(email) {
        if (!email) throw new ApiError(400, 'Email es requerido.');

        const user = await this._findUserByEmail(email);
        if (!user) throw new ApiError(404, 'Usuario no encontrado.');
        if (user.is_verified) throw new ApiError(409, 'Esta cuenta ya ha sido verificada.');

        const newCode = await this._generateAndSetVerificationCode(user);
        await emailService.sendVerificationEmail(user.email, newCode);

        logger.info(`Reenviado código de verificación a: ${email}`);
        return { message: 'Se ha enviado un nuevo código de verificación a tu correo.' };
    }

    /**
     * Inicia el proceso de reseteo de contraseña.
     */
    async requestPasswordReset(email) {
        if (!email) throw new ApiError(400, 'Email es requerido.');

        const user = await this._findUserByEmail(email);
        if (user && user.is_verified) {
            const resetCode = await this._generateAndSetVerificationCode(user);
            await emailService.sendPasswordResetEmail(user.email, resetCode);
            logger.info(`Solicitud de reseteo de contraseña para ${email}.`);
        } else {
            logger.warn(`Solicitud de reseteo para email no registrado o no verificado: ${email}`);
        }

        return { message: 'Si tu correo está registrado y verificado, recibirás un código para restablecer tu contraseña.' };
    }

    /**
     * Completa el reseteo de contraseña y revoca todas las sesiones.
     */
    async resetPassword(email, verificationCode, newPassword) {
        if (!email || !verificationCode || !newPassword) {
            throw new ApiError(400, 'Email, código de verificación y nueva contraseña son requeridos.');
        }

        const user = await this._findUserByEmail(email);
        if (!user || user.verification_code !== verificationCode) {
            throw new ApiError(400, 'Código de verificación inválido.');
        }
        if (user.verification_code_expires_at < new Date()) {
            throw new ApiError(410, 'El código de verificación ha expirado.');
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await user.update({
            password_hash: passwordHash,
            verification_code: null,
            verification_code_expires_at: null
        });

        await db.Session.destroy({ where: { user_id: user.user_id } });

        logger.info(`Contraseña restablecida y sesiones revocadas para: ${email}`);
        return { message: 'Contraseña restablecida exitosamente. Por favor, inicia sesión de nuevo.' };
    }

    /**
     * Cierra la sesión activa de un usuario.
     */
    async logout(sessionId) {
        const deletedCount = await db.Session.destroy({ where: { session_id: sessionId } });
        if (deletedCount === 0) {
            throw new ApiError(404, "Sesión no encontrada o ya cerrada.");
        }
        logger.info(`Logout para SessionID: ${sessionId}`);
        return { message: 'Sesión cerrada exitosamente.' };
    }

    /**
     * Refresca un access token usando un refresh token.
     */
    async refreshSession(providedRefreshToken) {
        if (!providedRefreshToken) throw new ApiError(400, 'Refresh token es requerido.');

        let payload;
        try {
            payload = jwt.verify(providedRefreshToken, config.jwt.secret, { 
                issuer: config.jwt.issuer, 
                audience: config.jwt.audience 
            });
            if (payload.typ !== 'refresh') throw new Error('Tipo de token incorrecto.');
        } catch (error) {
            throw new ApiError(401, 'Refresh token inválido o expirado.');
        }

        const refreshTokenHash = crypto.createHash('sha256').update(providedRefreshToken).digest('hex');
        const session = await db.Session.findOne({ where: { refresh_token_hash: refreshTokenHash } });
        if (!session) throw new ApiError(401, 'Sesión no válida. Por favor, inicia sesión de nuevo.');

        const user = await this._findUserByEmail(payload.email);
        if (!user || !user.is_active) throw new ApiError(404, 'Usuario asociado no encontrado o inactivo.');

        const { accessToken } = generateAccessAndRefreshTokens(user);
        logger.info(`Token refrescado para: ${user.email}`);
        return { accessToken };
    }
}

export default new AuthService();