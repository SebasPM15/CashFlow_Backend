// src/models/initialBalance.model.js

import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const InitialBalance = sequelize.define('InitialBalance', {
    balance_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    company_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    month: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1,
            max: 12,
        },
    },
    year: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 2020, // Validación de año mínimo razonable
        },
    },
    initial_balance: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
    },
}, {
    tableName: 'initial_balance',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            unique: true,
            fields: ['company_id', 'month', 'year'],
            name: 'uniq_initial_balance_per_company_month_year',
        },
    ],
});

export default InitialBalance;