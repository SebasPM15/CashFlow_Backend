// src/models/bank.model.js

import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Bank = sequelize.define('Bank', {
    bank_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    bank_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
    },
    bank_code: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    tableName: 'banks',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false, // Tabla de catálogo, no necesita updated_at
});

export default Bank;