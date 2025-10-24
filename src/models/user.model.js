// src/models/user.model.js

import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const User = sequelize.define('User', {
    user_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    company_ruc: {
        type: DataTypes.STRING(13),
        allowNull: true, // RUC es opcional
    },
    first_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    last_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        validate: {
            isEmail: true,
        },
    },
    phone_number: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    verification_code: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    verification_code_expires_at: {
        type: DataTypes.DATE, // Sequelize mapea TIMESTAMPTZ a DATE
        allowNull: true,
    },
    is_verified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    // Por seguridad, nunca devolvemos el hash de la contraseña por defecto
    defaultScope: {
        attributes: { exclude: ['password_hash'] },
    },
    // Creamos un "scope" para poder solicitar la contraseña cuando sea necesario
    scopes: {
        withPassword: {
            attributes: { include: ['password_hash'] },
        },
    },
});

export default User;