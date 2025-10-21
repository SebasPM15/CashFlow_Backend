// src/routes/reports.routes.js

import { Router } from 'express';
import { reportsController } from '../controllers/reports.controller.js';
import { secureEndpoint, checkStatefulSession, authorizeRole } from '../middlewares/auth.middleware.js';
import tramaValidator from '../middlewares/trama.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { reportsValidation } from '../validations/reports.validation.js';

const router = Router();

// =================================================================
// Rutas Protegidas del Módulo de Reportes
// =================================================================

// Todos los endpoints de reportes requieren autenticación.
// Usamos .getPeriodicReport como validación base para la mayoría.

// Endpoint para el reporte periódico global (Totales)
router.post(
    '/periodic-summary',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    validate(reportsValidation.getPeriodicReport),
    reportsController.getPeriodicReport
);

// Endpoint para el reporte desglosado por categoría/subcategoría
router.post(
    '/by-category',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    validate(reportsValidation.getPeriodicReport), // Reutiliza la misma validación
    reportsController.getReportByCategory
);

// Endpoint para el reporte de gastos de venta (SOLO ADMIN)
router.post(
    '/sales-expense',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    authorizeRole('admin'), // Protegido solo para admin
    validate(reportsValidation.getPeriodicReport), // Reutiliza la misma validación
    reportsController.getSalesExpenseReport
);

// Endpoint para el reporte de validación de cuadre (SOLO ADMIN)
router.post(
    '/balance-validation',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    authorizeRole('admin'), // Protegido solo para admin
    validate(reportsValidation.getPeriodicReport), // Reutiliza la misma validación
    reportsController.getBalanceValidationReport
);

export default router;