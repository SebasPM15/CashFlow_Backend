// src/routes/index.js

import { Router } from 'express';
import authRoutes from './auth.routes.js';
import cashflowRoutes from './cashflow.routes.js';
import userRoutes from './user.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/cashflow', cashflowRoutes);
router.use('/users', userRoutes);

router.get('/', (req, res) => {
    res.json({ message: `Welcome to ${process.env.APP_NAME || 'API'} - Version 1.0` });
});

export default router;