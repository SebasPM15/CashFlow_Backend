// src/models/evidence.model.js

import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Evidence = sequelize.define('Evidence', {
    evidence_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    transaction_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        // La relación se definirá en src/models/index.js
    },
    file_path: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    original_filename: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    mime_type: {
        type: DataTypes.STRING(100),
        allowNull: false, // Ej: "image/jpeg", "application/pdf"
    },
    file_size_bytes: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
}, {
    tableName: 'evidences',
    timestamps: true,
    createdAt: 'uploaded_at', // Mapea `createdAt` a la columna `uploaded_at`
    updatedAt: false,
});

export default Evidence;