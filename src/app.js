import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import config from './config/index.js';
import logger from './utils/logger.js';
import db from './models/index.js';
import { authenticateWithRetry } from './config/db.js';
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
        logger.info('⏳ INICIANDO SERVIDOR...');

        // 1. Conectar a la base de datos con reintentos
        await authenticateWithRetry();

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

        const server = app.listen(config.server.port, () => {
            logger.info('✅ ARRANQUE COMPLETADO');
            logger.info(`🚀 Servidor corriendo en modo ${config.app.env} en http://${config.server.host}:${config.server.port}`);
            logger.info('================================================================');
        });

        // 8. Manejo de cierre grácil (Graceful Shutdown)
        const gracefulShutdown = (signal) => {
            logger.info(`\n🚨 Recibida señal ${signal}. Iniciando cierre controlado...`);

            // 1. Dejar de aceptar nuevas conexiones
            server.close(async () => {
                logger.info('✅ Servidor HTTP cerrado.');

                // 2. Cerrar el pool de conexiones de la base de datos (LA PIEZA CLAVE)
                try {
                    await db.sequelize.close();
                    logger.info('✅ Conexiones de la base de datos cerradas.');
                } catch (error) {
                    logger.error('❌ Error al cerrar las conexiones de la base de datos:', error);
                }

                // 3. Salir del proceso
                logger.info('👋 Adiós!');
                process.exit(0);
            });

            // Forzar el cierre después de un tiempo si las conexiones no se cierran a tiempo
            setTimeout(() => {
                logger.error('❌ Cierre forzado por timeout. Algunas conexiones pueden no haberse cerrado correctamente.');
                process.exit(1);
            }, 10000); // 10 segundos de tiempo de gracia
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    } catch (error) {
        logger.error('🔥 Fallo al iniciar el servidor:', { error: error.message, stack: error.stack });
        process.exit(1);
    }
};

startServer();