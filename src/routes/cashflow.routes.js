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

// Endpoint para cancelar una transacción existente
router.post(
    '/transactions/cancel',
    tramaValidator,       // 1. Valida la estructura de la trama genérica
    secureEndpoint,       // 2. Verifica el token JWT
    checkStatefulSession, // 3. Valida la sesión activa en la base de datos
    validate(cashflowValidation.cancelTransaction), // 4. Valida que el `transactionId` venga en el body
    cashflowController.cancelTransaction // 5. Llama al controlador para ejecutar la acción
);

// Endpoint para actualizar el concepto de una transacción
router.post(
    '/transactions/concept',
    tramaValidator,       // 1. Valida la trama genérica
    secureEndpoint,       // 2. Autentica al usuario vía JWT
    checkStatefulSession, // 3. Autoriza la sesión activa
    validate(cashflowValidation.updateConcept), // 4. Valida el `transactionId` y el nuevo `concept`
    cashflowController.updateConcept // 5. Llama al controlador para ejecutar la acción
);

// Endpoint para obtener la URL de descarga de una evidencia
router.post(
    '/transactions/evidence/download',
    tramaValidator,       // 1. Valida la trama genérica
    secureEndpoint,       // 2. Autentica al usuario
    checkStatefulSession, // 3. Valida la sesión activa
    validate(cashflowValidation.getEvidenceUrl), // 4. Valida que el `evidenceId` venga en el body
    cashflowController.getEvidenceUrl // 5. Llama al controlador para ejecutar la acción
);

export default router;