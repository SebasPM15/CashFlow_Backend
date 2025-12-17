// src/services/invitation.service.js

import jwt from 'jsonwebtoken';
import db from '../models/index.js';
import config from '../config/index.js';
import { ApiError } from '../utils/ApiError.js';
import logger from '../utils/logger.js';
import { generateVerificationCode } from '../utils/verification.util.js';
import emailService from './email/email.service.js';
import bcrypt from 'bcryptjs';

class InvitationService {

    /**
     * Crea una invitación para un nuevo empleado.
     * @param {object} invitationData - Datos de la invitación
     * @param {number} adminUserId - ID del admin que invita
     * @param {number} companyId - ID de la compañía
     */
    async createInvitation(invitationData, adminUserId, companyId) {
        const { email, roleId } = invitationData;

        const t = await db.sequelize.transaction();
        try {
            // 1. Validar que el email no esté ya registrado
            const existingUser = await db.User.findOne({ 
                where: { email }, 
                transaction: t 
            });
            if (existingUser) {
                throw new ApiError(409, 'Este correo electrónico ya está registrado en el sistema.');
            }

            // 2. Validar que no haya una invitación activa (no usada) para este email en esta compañía
            const activeInvitation = await db.UserInvitation.findOne({
                where: {
                    company_id: companyId,
                    invited_email: email,
                    is_used: false
                },
                transaction: t
            });

            if (activeInvitation) {
                throw new ApiError(409, 'Ya existe una invitación activa para este correo en tu compañía.');
            }

            // 3. Validar que el rol existe
            const role = await db.Role.findByPk(roleId, { transaction: t });
            if (!role) {
                throw new ApiError(400, 'El rol especificado no es válido.');
            }

            // 4. Obtener datos de la compañía
            const company = await db.Company.findByPk(companyId, { transaction: t });
            if (!company) {
                throw new ApiError(404, 'Compañía no encontrada.');
            }

            // 5. Generar código de invitación (6 dígitos)
            const invitationCode = generateVerificationCode();

            // 6. Generar token JWT con metadatos de la compañía
            const invitationToken = jwt.sign(
                {
                    companyId: company.company_id,
                    companyName: company.company_name,
                    companyRuc: company.company_ruc,
                    roleId: roleId,
                    invitedEmail: email,
                    type: 'invitation'
                },
                config.jwt.secret,
                {
                    expiresIn: '7d',
                    issuer: config.jwt.issuer,
                    audience: config.jwt.audience
                }
            );

            // 7. Crear el registro de invitación
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días

            const invitation = await db.UserInvitation.create({
                company_id: companyId,
                invited_by_user_id: adminUserId,
                role_id: roleId,
                invited_email: email,
                invitation_code: invitationCode,
                invitation_token: invitationToken,
                expires_at: expiresAt,
            }, { transaction: t });

            // === PUNTO CRÍTICO: CONFIRMAMOS LA TRANSACCIÓN AQUÍ ===
            await t.commit(); 
            // A partir de aquí, la invitación YA EXISTE en la base de datos.
            // Si algo falla abajo, NO podemos hacer rollback.

            // 8. Enviar email de invitación (Manejo de errores aislado)
            try {
                const invitationLink = `${config.server.frontendUrl}/register-employee?token=${invitationToken}`;
                await emailService.sendInvitationEmail(email, {
                    companyName: company.company_name,
                    invitationCode: invitationCode,
                    invitationLink: invitationLink,
                    roleName: role.role_name
                });
                
                logger.info(`Invitación creada y enviada a ${email} para la compañía ${company.company_name}`);
            } catch (emailError) {
                // Si falla el email, solo loggeamos el error pero NO fallamos la petición completa
                // porque la invitación ya se creó correctamente en la BD.
                logger.error(`Invitación creada en BD pero falló el envío de email a ${email}: ${emailError.message}`);
                // Opcional: Podrías lanzar un warning o devolver un mensaje diferente
            }

            return {
                invitation_id: invitation.invitation_id,
                invited_email: email,
                expires_at: expiresAt,
                invitation_code: invitationCode,
                // Opcional: devolver el token para pruebas si el email falla
                // invitation_token: invitationToken 
            };

        } catch (error) {
            // === CORRECCIÓN: Solo hacemos rollback si la transacción NO ha finalizado ===
            if (!t.finished) {
                await t.rollback();
            }
            throw error instanceof ApiError ? error : new ApiError(500, 'No se pudo crear la invitación.');
        }
    }
    
    async validateInvitationToken(token) {
        try {
            const payload = jwt.verify(token, config.jwt.secret, {
                issuer: config.jwt.issuer,
                audience: config.jwt.audience
            });

            if (payload.type !== 'invitation') {
                throw new Error('Tipo de token incorrecto.');
            }

            const invitation = await db.UserInvitation.findOne({
                where: {
                    invitation_token: token,
                    is_used: false
                },
                include: [
                    { model: db.Company, as: 'company', attributes: ['company_name', 'company_ruc'] },
                    { model: db.Role, as: 'role', attributes: ['role_name'] }
                ]
            });

            if (!invitation) {
                throw new ApiError(400, 'La invitación no es válida o ya ha sido utilizada.');
            }

            if (new Date() > invitation.expires_at) {
                throw new ApiError(410, 'La invitación ha expirado.');
            }

            return {
                companyName: invitation.company.company_name,
                companyRuc: invitation.company.company_ruc,
                roleName: invitation.role.role_name,
                email: invitation.invited_email
            };

        } catch (error) {
            if (error instanceof jwt.JsonWebTokenError) {
                throw new ApiError(400, 'Token de invitación inválido.');
            }
            if (error instanceof jwt.TokenExpiredError) {
                throw new ApiError(410, 'El token de invitación ha expirado.');
            }
            throw error;
        }
    }

    async acceptInvitation(acceptanceData) {
        const { token, verificationCode, firstName, lastName, password, phoneNumber } = acceptanceData;

        if (!token || !verificationCode || !firstName || !lastName || !password) {
            throw new ApiError(400, 'Todos los campos son requeridos.');
        }

        const t = await db.sequelize.transaction();
        try {
            const invitation = await db.UserInvitation.findOne({
                where: {
                    invitation_token: token,
                    invitation_code: verificationCode,
                    is_used: false
                },
                transaction: t
            });

            if (!invitation) {
                throw new ApiError(400, 'Código de invitación inválido o la invitación ya fue utilizada.');
            }

            if (new Date() > invitation.expires_at) {
                throw new ApiError(410, 'La invitación ha expirado.');
            }

            const existingUser = await db.User.findOne({
                where: { email: invitation.invited_email },
                transaction: t
            });
            if (existingUser) {
                throw new ApiError(409, 'Este correo electrónico ya ha sido registrado.');
            }

            const passwordHash = await bcrypt.hash(password, 10);

            const newUser = await db.User.create({
                company_id: invitation.company_id,
                role_id: invitation.role_id,
                first_name: firstName,
                last_name: lastName,
                email: invitation.invited_email,
                phone_number: phoneNumber,
                password_hash: passwordHash,
                is_verified: true,
                is_active: true,
            }, { transaction: t });

            invitation.is_used = true;
            invitation.used_at = new Date();
            await invitation.save({ transaction: t });

            await t.commit();

            logger.info(`Usuario creado exitosamente desde invitación: ${newUser.email}`);

            return {
                user: {
                    user_id: newUser.user_id,
                    email: newUser.email,
                    first_name: newUser.first_name,
                    last_name: newUser.last_name
                }
            };

        } catch (error) {
            if (!t.finished) await t.rollback();
            throw error instanceof ApiError ? error : new ApiError(500, 'No se pudo completar el registro.');
        }
    }

    async listInvitations(companyId, queryParams) {
        const { page = 1, limit = 20, isUsed } = queryParams;
        const offset = (page - 1) * limit;

        const whereClause = {
            company_id: companyId
        };

        if (isUsed !== undefined) {
            whereClause.is_used = isUsed;
        }

        const { count, rows } = await db.UserInvitation.findAndCountAll({
            where: whereClause,
            limit,
            offset,
            order: [['created_at', 'DESC']],
            include: [
                { 
                    model: db.User, 
                    as: 'invitedBy', 
                    attributes: ['first_name', 'last_name', 'email'] 
                },
                { 
                    model: db.Role, 
                    as: 'role', 
                    attributes: ['role_name'] 
                }
            ],
        });

        return {
            totalItems: count,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            invitations: rows,
        };
    }

    async resendInvitation(invitationId, adminCompanyId) {
        const invitation = await db.UserInvitation.findOne({
            where: {
                invitation_id: invitationId,
                company_id: adminCompanyId,
                is_used: false
            },
            include: [
                { model: db.Company, as: 'company', attributes: ['company_name'] },
                { model: db.Role, as: 'role', attributes: ['role_name'] }
            ]
        });

        if (!invitation) {
            throw new ApiError(404, 'Invitación no encontrada o ya fue utilizada.');
        }

        if (new Date() > invitation.expires_at) {
            throw new ApiError(410, 'Esta invitación ha expirado. Crea una nueva invitación.');
        }

        const invitationLink = `${config.server.frontendUrl}/register-employee?token=${invitation.invitation_token}`;
        await emailService.sendInvitationEmail(invitation.invited_email, {
            companyName: invitation.company.company_name,
            invitationCode: invitation.invitation_code,
            invitationLink: invitationLink,
            roleName: invitation.role.role_name
        });

        logger.info(`Invitación reenviada a ${invitation.invited_email}`);

        return { message: 'Invitación reenviada exitosamente.' };
    }

    async cancelInvitation(invitationId, adminCompanyId) {
        const invitation = await db.UserInvitation.findOne({
            where: {
                invitation_id: invitationId,
                company_id: adminCompanyId,
                is_used: false
            }
        });

        if (!invitation) {
            throw new ApiError(404, 'Invitación no encontrada o ya fue utilizada.');
        }

        await invitation.destroy();

        logger.info(`Invitación ${invitationId} cancelada.`);

        return { message: 'Invitación cancelada exitosamente.' };
    }
}

export default new InvitationService();