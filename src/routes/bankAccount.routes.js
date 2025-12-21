import { Router } from 'express';
import { bankAccountController } from '../controllers/bankAccount.controller.js';
import { secureEndpoint, checkStatefulSession, authorizeRole } from '../middlewares/auth.middleware.js';
import tramaValidator from '../middlewares/trama.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { bankAccountValidation } from '../validations/bankAccount.validation.js';

const router = Router();

// Endpoint para obtener catálogos (Bancos y Tipos) - Para llenar selects en el Front
router.post(
    '/catalogs',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    bankAccountController.getCatalogs
);

// Endpoint para registrar una nueva cuenta (Solo Admin)
router.post(
    '/create',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    authorizeRole('admin'), // Solo el admin gestiona cuentas de la empresa
    validate(bankAccountValidation.createAccount),
    bankAccountController.createAccount
);

// Endpoint para listar cuentas (Admin y Empleado necesitan verlas para registrar pagos)
router.post(
    '/list',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    bankAccountController.listBankAccounts
);

export default router;