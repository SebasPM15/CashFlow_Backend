import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { secureEndpoint, checkStatefulSession } from '../middlewares/auth.middleware.js'; // <-- NOMBRE ACTUALIZADO
import tramaValidator from '../middlewares/trama.middleware.js';
import {
    validate,
    registerSchema,
    loginSchema,
    verifyAccountSchema,
    emailSchema,
    resetPasswordSchema,
} from '../validations/auth.validation.js';

const router = Router();

// =================================================================
// Rutas Públicas (No requieren token, pero sí la trama correcta)
// =================================================================

router.post(
    '/register',
    tramaValidator,
    validate(registerSchema),
    authController.register
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

router.post(
    '/logout',
    tramaValidator,
    secureEndpoint,         // <-- NOMBRE ACTUALIZADO
    checkStatefulSession,
    authController.logout
);

export default router;