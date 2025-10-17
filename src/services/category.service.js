// src/services/category.service.js

import db from '../models/index.js';

/**
 * Obtiene una lista de todas las categorías principales.
 */
const getCategories = async () => {
    return db.Category.findAll({
        order: [['category_id', 'ASC']],
    });
};

/**
 * Obtiene una lista de subcategorías, opcionalmente filtradas por categoryId.
 */
const getSubcategories = async (queryParams = {}) => {
    const { categoryId } = queryParams;
    const whereClause = {};

    if (categoryId) {
        whereClause.category_id = categoryId;
    }

    return db.Subcategory.findAll({
        where: whereClause,
        order: [['subcategory_name', 'ASC']],
    });
};

export const categoryService = {
    getCategories,
    getSubcategories,
};