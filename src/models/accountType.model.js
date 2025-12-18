// src/models/accountType.model.js

import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const AccountType = sequelize.define('AccountType', {
    account_type_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    type_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    tableName: 'account_types',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false, // Tabla de catálogo, no necesita updated_at
});

export default AccountType;