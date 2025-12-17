// src/models/bankAccount.model.js

import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const BankAccount = sequelize.define('BankAccount', {
    account_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    company_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    bank_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    account_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    account_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
            is: /^[0-9]{10,20}$/, // Solo números, entre 10 y 20 dígitos
        },
    },
    account_alias: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    is_default: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
}, {
    tableName: 'bank_accounts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            unique: true,
            fields: ['company_id', 'account_number'],
            name: 'uniq_company_account_number',
        },
        {
            unique: true,
            fields: ['company_id', 'account_alias'],
            name: 'uniq_company_alias',
        },
        {
            fields: ['company_id'],
            name: 'idx_bank_accounts_company_id',
        },
        {
            fields: ['company_id', 'is_active'],
            name: 'idx_bank_accounts_is_active',
        },
    ],
});

export default BankAccount;