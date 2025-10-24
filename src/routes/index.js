// src/routes/index.js

import { Router } from 'express';
import authRoutes from './auth.routes.js';
import cashflowRoutes from './cashflow.routes.js';
import userRoutes from './user.routes.js';
import categoryRoutes from './category.routes.js'; // <-- IMPORTAMOS
import reportsRoutes from './reports.routes.js'; // <-- IMPORTAMOS

const router = Router();

router.use('/auth', authRoutes);
router.use('/cashflow', cashflowRoutes);
router.use('/users', userRoutes);
router.use('/categories', categoryRoutes);
router.use('/reports', reportsRoutes);

router.get('/', (req, res) => {
    res.json({ message: `Welcome to ${process.env.APP_NAME || 'API'} - Version 1.0` });
});

export default router;