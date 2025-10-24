// src/config/db.js

import { Sequelize } from 'sequelize';
import config from './index.js'; // Importamos la configuración centralizada

const { url, ssl, pool, options } = config.database;

const sequelize = new Sequelize(url, {
    dialect: 'postgres',
    logging: false, // Opcional: podrías usar config.logging.level si quieres logs de SQL
    retry: {
        max: 5,
        match: [
            /SequelizeConnectionError/,
            /SequelizeConnectionRefusedError/,
            /SequelizeHostNotFoundError/,
            /SequelizeHostNotReachableError/,
            /SequelizeInvalidConnectionError/,
            /SequelizeConnectionTimedOutError/,
            /ETIMEDOUT/,
            /ECONNRESET/,
        ],
    },
    pool: {
        max: pool.max,
        min: pool.min,
        idle: pool.idle,
        acquire: pool.acquire,
        evict: pool.evict,
    },
    dialectOptions: {
        ssl: ssl.enabled ? { require: true, rejectUnauthorized: ssl.rejectUnauthorized } : undefined,
        keepAlive: true,
        statement_timeout: options.statementTimeout,
        idle_in_transaction_session_timeout: options.idleTransactionTimeout,
        application_name: config.app.name,
    },
});

/**
 * Intenta autenticar la conexión a la base de datos con reintentos
 * y una estrategia de backoff exponencial para manejar arranques resilientes.
 */
export async function authenticateWithRetry() {
    let attempt = 0;
    const maxRetries = 8;
    const baseDelay = 300; // ms

    while (attempt <= maxRetries) {
        try {
            await sequelize.authenticate();
            console.log('✅ Database connection has been established successfully.');
            return;
        } catch (error) {
            if (attempt === maxRetries) {
                console.error('❌ Unable to connect to the database after all retries:', error);
                throw error; // Lanza el error para que la aplicación falle (Fail-Fast)
            }

            const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100; // Backoff + Jitter
            console.warn(`Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${Math.round(delay)}ms...`);

            await new Promise(res => setTimeout(res, delay));
            attempt++;
        }
    }
}

export default sequelize;