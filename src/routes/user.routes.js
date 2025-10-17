// src/routes/user.routes.js

import { Router } from 'express';
import { userController } from '../controllers/user.controller.js';
import { secureEndpoint, checkStatefulSession, authorizeRole} from '../middlewares/auth.middleware.js';
import tramaValidator from '../middlewares/trama.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { userValidation } from '../validations/user.validation.js';

const router = Router();

// Endpoint para obtener perfiles (accesible para ambos roles)
router.post(
    '/profile',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    validate(userValidation.getProfile),
    userController.getProfile
);

// --- NUEVAS RUTAS (SOLO ADMIN) ---

// Endpoint para listar todos los usuarios
router.post(
    '/list',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    authorizeRole('admin'),
    validate(userValidation.listUsers),
    userController.listUsers
);

// Endpoint para activar o desactivar un usuario
router.post(
    '/status',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    authorizeRole('admin'),
    validate(userValidation.updateStatus),
    userController.updateStatus
);

// Endpoint para cambiar el rol de un usuario
router.post(
    '/role',
    tramaValidator,
    secureEndpoint,
    checkStatefulSession,
    authorizeRole('admin'),
    validate(userValidation.updateRole),
    userController.updateRole
);

export default router;