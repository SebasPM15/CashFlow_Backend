import { Router } from 'express';
import authRoutes from './auth.routes.js'; // <-- IMPORTAMOS LAS RUTAS

const router = Router();

// Montamos las rutas de autenticación bajo el prefijo '/auth'
router.use('/auth', authRoutes);

// Placeholder para futuras rutas
// router.use('/cashflow', cashFlowRoutes);

router.get('/', (req, res) => {
    res.json({ message: `Welcome to ${process.env.APP_NAME || 'API'} - Version 1.0` });
});

export default router;