// src/models/cashFlowTransaction.model.js

import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const CashFlowTransaction = sequelize.define('CashFlowTransaction', {
    transaction_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    bank_account_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // NULL por ahora para compatibilidad
    },
    company_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    subcategory_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    method_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    transaction_date: {
        type: DataTypes.DATE, // Mapea a TIMESTAMPTZ para precisión de fecha y hora
        allowNull: false,
    },
    concept: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    debit: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00,
    },
    credit: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0.00,
    },
    resulting_balance: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
    },
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'ACTIVE',
        validate: {
            isIn: [['ACTIVE', 'CANCELLED']],
        },
    },
}, {
    tableName: 'cash_flow_transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false, // La tabla no tiene `updated_at` y las transacciones son inmutables
});

export default CashFlowTransaction;