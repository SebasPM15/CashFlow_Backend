// src/routes/cashflow.routes.js

import { Router } from 'express';
import { cashflowController } from '../controllers/cashflow.controller.js';
import { secureEndpoint, checkStatefulSession, authorizeRole } from '../middlewares/auth.middleware.js';
import tramaValidator from '../middlewares/trama.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { cashflowValidation } from '../validations/cashflow.validation.js';

const router = Router();

// =================================================================
// Rutas Protegidas del Módulo de Flujo de Caja
// =================================================================

// Endpoint para establecer el saldo inicial del mes (SOLO ADMIN)
router.post(
    '/monthly-balance',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    authorizeRole('admin'),
    validate(cashflowValidation.setMonthlyBalance),
    cashflowController.setMonthlyBalance
);

// Endpoint para que un usuario registre una nueva transacción (con evidencia opcional)
router.post(
    '/transactions',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    validate(cashflowValidation.createTransaction),
    cashflowController.createTransaction
);

// Endpoint para listar transacciones (visibilidad por rol)
router.post(
    '/transactions/list',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    validate(cashflowValidation.getTransactions),
    cashflowController.getTransactions
);

// Endpoint para añadir o actualizar la evidencia de una transacción
router.post(
    '/transactions/evidence',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    validate(cashflowValidation.upsertEvidence),
    cashflowController.upsertEvidence
);

export default router;