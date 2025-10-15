// src/models/session.model.js

import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Session = sequelize.define('Session', {
    session_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    session_uuid: {
        type: DataTypes.UUID,
        allowNull: false,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    refresh_token_hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    expires_at: {
        type: DataTypes.DATE, // Mapea a TIMESTAMPTZ
        allowNull: false,
    },
}, {
    tableName: 'sessions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false, // No necesitamos `updated_at` para las sesiones
});

export default Session;