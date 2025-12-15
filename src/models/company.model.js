// src/models/company.model.js

import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Company = sequelize.define('Company', {
    company_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    company_ruc: {
        type: DataTypes.STRING(13),
        allowNull: false,
        unique: true,
        validate: {
            is: /^[0-9]{13}$/, // Valida que sea exactamente 13 dígitos
        },
    },
    company_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    tableName: 'companies',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
});

export default Company;