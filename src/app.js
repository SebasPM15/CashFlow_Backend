import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import config from './config/index.js';
import logger from './utils/logger.js';
import db from './models/index.js';
// Se comenta la autenticación inicial; no se usa en serverless
// import { authenticateWithRetry } from './config/db.js'; 
import apiRouter from './routes/index.js';
import { errorHandler } from './middlewares/error.middleware.js';

// Manejadores de errores no capturados (Principio Fail-Fast)
process.on('uncaughtException', (error) => {
    logger.error('EXCEPCIÓN NO CAPTURADA! 💥 Apagando...', { error: error.name, message: error.message, stack: error.stack });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('RECHAZO DE PROMESA NO MANEJADO! 💥 Apagando...', { reason });
    process.exit(1);
});

const app = express();

/**
 * Inicia el servidor y todos los servicios necesarios.
 */
const startServer = async () => {
    try {
        logger.info('================================================================');
        logger.info('⏳ INICIANDO APP SERVERLESS (Vercel)...');

        // 1. Conexión a la BD (ELIMINADA)
        // En un entorno serverless, la conexión se establece en la primera query,
        // no al "iniciar" el servidor.
        // await authenticateWithRetry();

        // --- Sincronización de Modelos (Solo en Desarrollo) ---
        if (config.app.env !== 'production' && process.env.DB_SYNC === 'true') {
            logger.info('[DEV] Sincronizando modelos con la base de datos (DB_SYNC=true)...');
            await db.sequelize.sync({ alter: true });
            logger.info('✅ [DEV] Modelos de base de datos sincronizados.');
        } else {
            logger.info('[*] Omitiendo sequelize.sync() (usa DB_SYNC=true para habilitar en desarrollo).');
        }

        app.use(helmet());
        app.use(cors());
        app.use(express.json({ limit: '10mb' }));
        app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        app.use(cookieParser());

        const morganFormat = config.app.env === 'production' ? 'combined' : 'dev';
        app.use(morgan(morganFormat, {
            stream: { write: (message) => logger.http(message.trim()) },
        }));

        app.use('/api/v1', apiRouter);

        app.get('/health', (req, res) => res.status(200).send('OK'));

        app.use(errorHandler);

        logger.info('✅ Configuración de Middlewares completada.');
        logger.info('================================================================');


        // --- BLOQUE ELIMINADO ---
        // Vercel maneja el ciclo de vida del servidor.
        // No se usan app.listen() ni gracefulShutdown.
        /*
        const server = app.listen(config.server.port, () => {
            logger.info('✅ ARRANQUE COMPLETADO');
            logger.info(`🚀 Servidor corriendo en modo ${config.app.env} en http://${config.server.host}:${config.server.port}`);
            logger.info('================================================================');
        });

        const gracefulShutdown = (signal) => {
            // ... (código eliminado)
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        */
        // --- FIN BLOQUE ELIMINADO ---

    } catch (error) {
        logger.error('🔥 Fallo al configurar la app:', { error: error.message, stack: error.stack });
        process.exit(1);
    }
};

startServer();

// --- ¡EL CAMBIO MÁS IMPORTANTE PARA VERCEL! ---
// Exportamos la instancia de 'app' para que Vercel la pueda consumir.
export default app;