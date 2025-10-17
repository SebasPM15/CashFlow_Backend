// src/models/subcategory.model.js

import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Subcategory = sequelize.define('Subcategory', {
    subcategory_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    category_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        // La relación (references) se definirá en src/models/index.js
    },
    subcategory_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
    },
    transaction_type: {
        type: DataTypes.ENUM('DEBIT', 'CREDIT'),
        allowNull: false,
    },
}, {
    tableName: 'subcategories',
    timestamps: false, // La tabla SQL no tiene created_at/updated_at
    indexes: [
        {
            unique: true,
            fields: ['category_id', 'subcategory_name'],
        },
    ],
});

export default Subcategory;