import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { secureEndpoint, checkStatefulSession, authorizeRole } from '../middlewares/auth.middleware.js';
import tramaValidator from '../middlewares/trama.middleware.js';
import { validate } from '../middlewares/validate.middleware.js'; // Asegúrate de importar esto correctamente
import {
    registerCompanySchema,
    registerEmployeeSchema,
    inviteEmployeeSchema,
    loginSchema,
    verifyAccountSchema,
    emailSchema,
    resetPasswordSchema,
} from '../validations/auth.validation.js';

const router = Router();

// =================================================================
// Rutas Públicas (No requieren token, pero sí la trama correcta)
// =================================================================

// 1. Registro de Compañía + Admin (El punto de entrada)
router.post(
    '/register-company',
    tramaValidator,
    validate(registerCompanySchema),
    authController.registerCompany
);

// 2. Registro de Empleado (Consumo de token de invitación)
router.post(
    '/register-employee',
    tramaValidator,
    validate(registerEmployeeSchema),
    authController.registerEmployee
);

// 3. Validación de Token de Invitación (Para UI antes de registrar)
router.post(
    '/validate-invitation',
    tramaValidator,
    // Podrías crear un schema simple { token: Joi.string() } si quieres ser estricto
    authController.validateInvitation
);

router.post(
    '/login',
    tramaValidator,
    validate(loginSchema),
    authController.login
);

router.post(
    '/verify-account',
    tramaValidator,
    validate(verifyAccountSchema),
    authController.verifyAccount
);

router.post(
    '/resend-verification',
    tramaValidator,
    validate(emailSchema),
    authController.resendVerificationCode
);

router.post(
    '/request-password-reset',
    tramaValidator,
    validate(emailSchema),
    authController.requestPasswordReset
);

router.post(
    '/reset-password',
    tramaValidator,
    validate(resetPasswordSchema),
    authController.resetPassword
);

router.post(
    '/refresh-session',
    authController.refreshSession
);

// =================================================================
// Rutas Protegidas (Requieren trama, token y sesión stateful)
// =================================================================

// 4. Invitar Usuario (Solo Admin puede invitar)
router.post(
    '/invite-user',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    authorizeRole('admin'), // Restricción de rol
    validate(inviteEmployeeSchema),
    authController.inviteUser
);

router.post(
    '/logout',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    authController.logout
);

export default router;