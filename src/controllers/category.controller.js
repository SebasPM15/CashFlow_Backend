// src/controllers/category.controller.js

import httpStatus from 'http-status';
import asyncHandler from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.util.js';
import { categoryService } from '../services/category.service.js';

const getCategories = asyncHandler(async (req, res) => {
    const categories = await categoryService.getCategories();
    sendResponse(res, httpStatus.OK, 'Categorías obtenidas exitosamente.', categories);
});

const getSubcategories = asyncHandler(async (req, res) => {
    const queryParams = req.body.dinBody || {};
    const subcategories = await categoryService.getSubcategories(queryParams);
    sendResponse(res, httpStatus.OK, 'Subcategorías obtenidas exitosamente.', subcategories);
});

export const categoryController = {
    getCategories,
    getSubcategories,
};