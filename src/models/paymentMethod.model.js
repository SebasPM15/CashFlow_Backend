// src/models/paymentMethod.model.js

import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const PaymentMethod = sequelize.define('PaymentMethod', {
    method_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    method_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    tableName: 'payment_methods',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false, // La tabla no tiene 'updated_at'
});

export default PaymentMethod;