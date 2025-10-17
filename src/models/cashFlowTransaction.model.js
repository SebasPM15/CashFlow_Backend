// src/models/cashFlowTransaction.model.js

import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const CashFlowTransaction = sequelize.define('CashFlowTransaction', {
    transaction_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        // La relación se definirá en src/models/index.js
    },
    subcategory_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        // La relación se definirá en src/models/index.js
    },
    transaction_date: {
        type: DataTypes.DATE, // Mapea a TIMESTAMPTZ para precisión de fecha y hora
        allowNull: false,
    },
    payment_method: {
        type: DataTypes.STRING(50),
        allowNull: false, // Ej: "Transferencia", "Efectivo", "Cheque"
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