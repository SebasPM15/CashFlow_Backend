// src/routes/category.routes.js

import { Router } from 'express';
import { categoryController } from '../controllers/category.controller.js';
import { secureEndpoint, checkStatefulSession } from '../middlewares/auth.middleware.js';
import tramaValidator from '../middlewares/trama.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
// Importamos la validación desde cashflow.validation.js ya que está relacionada
import { cashflowValidation } from '../validations/cashflow.validation.js';

const router = Router();

// Endpoint para listar todas las categorías principales
router.post(
    '/', // La ruta base será '/categories'
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    categoryController.getCategories
);

// Endpoint para listar subcategorías (con filtro opcional)
router.post(
    '/sub',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    validate(cashflowValidation.getSubcategories), // Reutilizamos la validación
    categoryController.getSubcategories
);

export default router;