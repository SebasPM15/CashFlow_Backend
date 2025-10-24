// src/models/monthlyBalance.model.js

import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const MonthlyBalance = sequelize.define('MonthlyBalance', {
    balance_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
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
    },
    initial_balance: {
        type: DataTypes.DECIMAL(12, 2), // Mapea a DECIMAL(12, 2)
        allowNull: false,
    },
}, {
    tableName: 'monthly_balance',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            unique: true,
            fields: ['month', 'year'],
        },
    ],
});

export default MonthlyBalance;