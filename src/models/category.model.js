// src/models/category.model.js

import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Category = sequelize.define('Category', {
    category_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    category_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
    },
}, {
    tableName: 'categories',
    timestamps: false, // La tabla SQL no tiene created_at/updated_at
});

export default Category;