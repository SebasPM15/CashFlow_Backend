// src/config/index.js

import dotenv from 'dotenv';
import { cleanEnv, str, port, num, url, bool } from 'envalid';

// Carga el archivo .env en process.env
dotenv.config();

// Valida y limpia las variables de entorno usando envalid
const env = cleanEnv(process.env, {
    // APP
    NODE_ENV: str({ choices: ['development', 'production', 'test'], default: 'development' }),
    APP_NAME: str({ default: 'CashFlow-API' }),
    APP_VERSION: str({ default: '1.0.0' }),

    // SERVER
    HOST: str({ default: '0.0.0.0' }),
    PORT: port({ default: 3000 }),

    // DATABASE
    DATABASE_URL: url({ desc: 'PostgreSQL connection string' }),
    DB_SSL_ENABLED: bool({ default: true }),
    DB_SSL_REJECT_UNAUTHORIZED: bool({ default: false }),
    DB_POOL_MAX: num({ default: 10 }),
    DB_POOL_MIN: num({ default: 0 }),
    DB_POOL_ACQUIRE_MS: num({ default: 30000 }),
    DB_POOL_IDLE_MS: num({ default: 10000 }),
    DB_POOL_EVICT_MS: num({ default: 10000 }),
    PG_STATEMENT_TIMEOUT_MS: num({ default: 10000 }),
    PG_IDLE_XACT_TIMEOUT_MS: num({ default: 30000 }),

    // JWT
    JWT_SECRET: str({ desc: 'Secret key for signing JWTs' }),
    JWT_ISSUER: str({ default: 'CashFlowApp' }),
    JWT_AUDIENCE: str({ default: 'CashFlowUsers' }),
    JWT_ACCESS_EXPIRES_IN: str({ default: '15m' }),
    JWT_REFRESH_EXPIRES_IN: str({ default: '7d' }),

    // LOGGING
    LOG_SENSITIVE_FIELDS: str({
        default: 'password.full,password_hash.full,verification_code.full,email.email,firstName.name,lastName.name,phone_number.phone,accessToken.full,refreshToken.full',
        desc: 'Campos a enmascarar en los logs, formato: field1.strategy,field2.strategy'
    }),

    // EMAIL SERVICE
    SENDGRID_API_KEY: str({ desc: 'API Key for SendGrid' }),
    EMAIL_HOST: str({ devDefault: 'smtp.mailtrap.io' }),
    EMAIL_PORT: port({ devDefault: 2525 }),
    EMAIL_USER: str({ devDefault: 'testuser' }),
    EMAIL_PASS: str({ devDefault: 'testpass' }),
    EMAIL_FROM: str({ default: '"MyApp" <no-reply@myapp.com>' }),
});

// Organiza la configuración en un objeto anidado y estructurado
const config = {
    app: {
        env: env.NODE_ENV,
        name: env.APP_NAME,
        version: env.APP_VERSION,
    },
    server: {
        host: env.HOST,
        port: env.PORT,
    },
    database: {
        url: env.DATABASE_URL,
        ssl: {
            enabled: env.DB_SSL_ENABLED,
            rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED,
        },
        pool: {
            max: env.DB_POOL_MAX,
            min: env.DB_POOL_MIN,
            acquire: env.DB_POOL_ACQUIRE_MS,
            idle: env.DB_POOL_IDLE_MS,
            evict: env.DB_POOL_EVICT_MS,
        },
        options: {
            statementTimeout: env.PG_STATEMENT_TIMEOUT_MS,
            idleTransactionTimeout: env.PG_IDLE_XACT_TIMEOUT_MS,
        }
    },
    jwt: {
        secret: env.JWT_SECRET,
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
        refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    },
    logging: {
        level: env.isProduction ? 'info' : 'debug',
        sensitiveFields: env.LOG_SENSITIVE_FIELDS, // <-- AÑADIR ESTA LÍNEA
    },
    email: {
        apiKey: env.SENDGRID_API_KEY,
        host: env.EMAIL_HOST,
        port: env.EMAIL_PORT,
        auth: {
            user: env.EMAIL_USER,
            pass: env.EMAIL_PASS,
        },
        from: env.EMAIL_FROM,
    },
    supabase: {
        url: process.env.SUPABASE_URL,
        serviceKey: process.env.SUPABASE_SERVICE_KEY,
        bucketName: 'evidence', // Definimos el nombre del bucket aquí
    },
    slack: {
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
    }
};

// Asegúrate de validarla
if (!config.slack.webhookUrl) {
    throw new Error('FATAL ERROR: SLACK_WEBHOOK_URL is not defined.');
}

// Congela el objeto para hacerlo inmutable, previniendo modificaciones accidentales
export default Object.freeze(config);