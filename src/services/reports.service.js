// src/services/reports.service.js

import httpStatus from 'http-status';
import { Op } from 'sequelize';
import {
    parseISO,
    startOfDay,
    endOfDay,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    startOfQuarter,
    endOfQuarter,
    startOfYear,
    endOfYear,
} from 'date-fns';
import db from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import logger from '../utils/logger.js';

/**
 * Servicio para gestionar la lógica de negocio de los reportes.
 * @namespace reportsService
 */

// ===================================
// === HELPERS INTERNOS (LÓGICA DRY) ===
// ===================================

/**
 * Calcula el rango de fechas (startDate, endDate) basado en el período y la fecha de referencia.
 * @private
 * @param {string} periodType - 'daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'annual'
 * @param {string} date - Fecha ISO de referencia (ej: '2025-10-20T10:00:00.000Z')
 * @returns {{startDate: Date, endDate: Date}}
 */
const _calculateDateRange = (periodType, date) => {
    const parsedDate = parseISO(date);
    const year = parsedDate.getFullYear();

    // Nota: La semana en Ecuador (y en ISO 8601) empieza el Lunes (1).
    const weekOptions = { weekStartsOn: 1 };

    switch (periodType) {
        case 'daily':
            return {
                startDate: startOfDay(parsedDate),
                endDate: endOfDay(parsedDate),
            };
        case 'weekly':
            return {
                startDate: startOfWeek(parsedDate, weekOptions),
                endDate: endOfWeek(parsedDate, weekOptions),
            };
        case 'monthly':
            return {
                startDate: startOfMonth(parsedDate),
                endDate: endOfMonth(parsedDate),
            };
        case 'quarterly':
            return {
                startDate: startOfQuarter(parsedDate),
                endDate: endOfQuarter(parsedDate),
            };
        case 'semiannual':
            // date-fns no tiene 'startOfSemiannual', lo calculamos manual
            const isFirstHalf = parsedDate.getMonth() < 6; // Meses 0-5 (Ene-Jun)
            return {
                startDate: isFirstHalf ? startOfDay(new Date(year, 0, 1)) : startOfDay(new Date(year, 6, 1)), // 1 Ene o 1 Jul
                endDate: isFirstHalf ? endOfDay(new Date(year, 5, 30)) : endOfDay(new Date(year, 11, 31)), // 30 Jun o 31 Dic
            };
        case 'annual':
            return {
                startDate: startOfYear(parsedDate),
                endDate: endOfYear(parsedDate),
            };
        default:
            // Esto no debería pasar si la validación de Joi funciona
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tipo de período no implementado.');
    }
};

/**
 * Construye la cláusula 'where' común para todas las consultas de reporte.
 * @private
 */
const _buildCommonWhereClause = (filters, user, dateRange) => {
    const { userId, subcategoryId, methodId } = filters;
    const whereClause = {
        status: 'ACTIVE', // Los reportes SOLO deben incluir transacciones activas
        transaction_date: {
            [Op.between]: [dateRange.startDate, dateRange.endDate],
        },
    };

    // 1. Filtro por Rol/Usuario
    if (user.role.role_name === 'employee') {
        // Empleado solo ve sus transacciones
        whereClause.user_id = user.user_id;
    } else if (user.role.role_name === 'admin' && userId) {
        // Admin puede filtrar por un usuario específico
        whereClause.user_id = userId;
    }

    // 2. Filtros opcionales directos
    if (subcategoryId) whereClause.subcategory_id = subcategoryId;
    if (methodId) whereClause.method_id = methodId;

    return whereClause;
};

/**
 * Construye la cláusula 'include' para filtros en tablas asociadas.
 * @private
 */
const _buildCommonIncludeClause = (filters) => {
    const { categoryId } = filters;
    const includeClause = [];

    // 3. Filtro por Categoría (requiere un include)
    const subcategoryInclude = {
        model: db.Subcategory,
        as: 'subcategory',
        attributes: [], // No necesitamos los atributos, solo el filtro
    };

    if (categoryId) {
        subcategoryInclude.where = { category_id: categoryId };
    }

    // Siempre incluimos Subcategory para que el 'where' opcional funcione
    includeClause.push(subcategoryInclude);

    return includeClause;
};

/**
 * Ejecuta una consulta de agregación (SUM) con los filtros dados.
 * @private
 * @returns {Promise<{totalDebit: number, totalCredit: number, netFlow: number, count: number}>}
 */
const _getAggregatedTotals = async (whereClause, includeClause) => {
    const result = await db.CashFlowTransaction.findOne({
        attributes: [
            [db.sequelize.fn('SUM', db.sequelize.col('debit')), 'totalDebit'],
            [db.sequelize.fn('SUM', db.sequelize.col('credit')), 'totalCredit'],
            [db.sequelize.fn('COUNT', db.sequelize.col('transaction_id')), 'count'],
        ],
        where: whereClause,
        include: includeClause,
        raw: true, // Devuelve un objeto JSON plano, no una instancia de Sequelize
    });

    const totalDebit = parseFloat(result.totalDebit) || 0;
    const totalCredit = parseFloat(result.totalCredit) || 0;
    const netFlow = totalCredit - totalDebit;
    const count = parseInt(result.count, 10) || 0;

    return { totalDebit, totalCredit, netFlow, count };
};


// ===================================
// === SERVICIOS PÚBLICOS (CORE) =====
// ===================================

/**
 * Genera un reporte periódico (diario, semanal, etc.) con totales GLOBALES.
 * @param {object} reportData - Datos validados por Joi
 * @param {object} user - Objeto de usuario autenticado
 */
const getPeriodicReport = async (reportData, user) => {
    const { periodType, date, ...filters } = reportData;

    // 1. Calcular el rango de fechas
    const dateRange = _calculateDateRange(periodType, date);

    // 2. Construir filtros
    const whereClause = _buildCommonWhereClause(filters, user, dateRange);
    const includeClause = _buildCommonIncludeClause(filters);

    // 3. Obtener totales agregados
    const totals = await _getAggregatedTotals(whereClause, includeClause);

    // 4. Devolver respuesta estandarizada
    return {
        reportMetadata: {
            reportName: 'Reporte Periódico Global',
            periodType,
            startDate: dateRange.startDate.toISOString(),
            endDate: dateRange.endDate.toISOString(),
            generatedAt: new Date().toISOString(),
            filtersApplied: filters,
        },
        summary: totals,
    };
};

/**
 * Genera un reporte desglosado por Categoría y Subcategoría.
 * @param {object} reportData - Datos validados por Joi
 * @param {object} user - Objeto de usuario autenticado
 */
const getReportByCategory = async (reportData, user) => {
    const { periodType, date, ...filters } = reportData;

    // 1. Calcular el rango de fechas
    const dateRange = _calculateDateRange(periodType, date);

    // 2. Construir filtros
    // Para este reporte, ignoramos los filtros categoryId y subcategoryId
    // que vengan en 'filters', ya que el propósito es agrupar por ellas.
    const { categoryId, subcategoryId, ...otherFilters } = filters;

    const whereClause = _buildCommonWhereClause(otherFilters, user, dateRange);

    // 3. Ejecutar la consulta de agregación CON GRUPO
    const results = await db.CashFlowTransaction.findAll({
        attributes: [
            // Obtenemos los nombres de las tablas asociadas
            [db.sequelize.col('subcategory.category.category_name'), 'categoryName'],
            [db.sequelize.col('subcategory.subcategory_name'), 'subcategoryName'],
            // Calculamos las sumas
            [db.sequelize.fn('SUM', db.sequelize.col('debit')), 'totalDebit'],
            [db.sequelize.fn('SUM', db.sequelize.col('credit')), 'totalCredit'],
            [db.sequelize.fn('COUNT', db.sequelize.col('transaction_id')), 'count'],
        ],
        where: whereClause,
        include: [
            // Incluimos las asociaciones para poder agrupar por sus nombres
            {
                model: db.Subcategory,
                as: 'subcategory',
                attributes: [], // No necesitamos los atributos de subcategoría en el SELECT
                required: true, // Asegura que solo traiga transacciones con subcategoría
                include: {
                    model: db.Category,
                    as: 'category',
                    attributes: [], // No necesitamos los atributos de categoría en el SELECT
                    required: true, // Asegura que solo traiga subcategorías con categoría
                },
            },
            // Incluimos las otras tablas asociadas si es necesario para filtros (ej. User)
            // (En este caso, _buildCommonWhereClause ya maneja el filtro de user_id directamente)
        ],
        // Agrupamos por los nombres
        group: [
            'subcategory.category.category_id', // Agrupar por IDs es más performante
            'subcategory.subcategory_id',
        ],
        order: [
            [db.sequelize.col('categoryName'), 'ASC'],
            [db.sequelize.col('subcategoryName'), 'ASC'],
        ],
        raw: true, // Devuelve JSON plano
    });

    // 4. Procesar y formatear los resultados
    const formattedResults = results.map(row => ({
        categoryName: row.categoryName,
        subcategoryName: row.subcategoryName,
        totalDebit: parseFloat(row.totalDebit) || 0,
        totalCredit: parseFloat(row.totalCredit) || 0,
        netFlow: (parseFloat(row.totalCredit) || 0) - (parseFloat(row.totalDebit) || 0),
        count: parseInt(row.count, 10) || 0,
    }));

    // 5. Devolver respuesta
    return {
        reportMetadata: {
            reportName: 'Reporte por Categoría y Subcategoría',
            periodType,
            startDate: dateRange.startDate.toISOString(),
            endDate: dateRange.endDate.toISOString(),
            generatedAt: new Date().toISOString(),
            filtersApplied: otherFilters, // Mostramos los filtros que sí se aplicaron
        },
        breakdown: formattedResults,
    };
};


/**
 * Genera un reporte específico de "Gastos de Venta".
 * @param {object} reportData - Datos validados por Joi (incluye período y filtros)
 * @param {object} user - Objeto de usuario autenticado
 */
const getSalesExpenseReport = async (reportData, user) => {
    const { periodType, date, ...filters } = reportData;

    // 1. Buscar la subcategoría "Pago de Gastos de Venta"
    const salesSubcategory = await db.Subcategory.findOne({
        where: { subcategory_name: 'Pago de Gastos de Venta' },
        attributes: ['subcategory_id'],
        raw: true,
    });

    if (!salesSubcategory) {
        logger.warn('No se encontró la subcategoría "Pago de Gastos de Venta" para el reporte.');
        throw new ApiError(httpStatus.NOT_FOUND, 'Subcategoría "Pago de Gastos de Venta" no configurada.');
    }

    // 2. Calcular rango de fechas
    const dateRange = _calculateDateRange(periodType, date);

    // 3. Construir filtros (forzando la subcategoría)
    // Se ignorará cualquier 'subcategoryId' que venga en 'filters'
    filters.subcategoryId = salesSubcategory.subcategory_id;
    const whereClause = _buildCommonWhereClause(filters, user, dateRange);
    const includeClause = _buildCommonIncludeClause(filters);

    // 4. Obtener totales
    const totals = await _getAggregatedTotals(whereClause, includeClause);

    return {
        reportMetadata: {
            reportName: 'Reporte de Gastos de Venta',
            periodType,
            startDate: dateRange.startDate.toISOString(),
            endDate: dateRange.endDate.toISOString(),
            generatedAt: new Date().toISOString(),
            filtersApplied: filters, // Mostrará que el filtro de subcategoría fue aplicado
        },
        summary: totals,
    };
};

/**
 * Genera un reporte de "Validación de Cuadre".
 * Compara el Total de Créditos vs. la Suma de subcategorías de Ingreso.
 * @param {object} reportData - Datos validados por Joi (incluye período y filtros)
 * @param {object} user - Objeto de usuario autenticado
 */
const getBalanceValidationReport = async (reportData, user) => {
    const { periodType, date, ...filters } = reportData;

    // 1. Calcular rango de fechas
    const dateRange = _calculateDateRange(periodType, date);

    // 2. Construir filtros base
    const baseWhereClause = _buildCommonWhereClause(filters, user, dateRange);
    const baseIncludeClause = _buildCommonIncludeClause(filters);

    // --- CONSULTA 1: Obtener el Total de Créditos (Total general de la columna 'credit') ---
    const { totalCredit } = await _getAggregatedTotals(baseWhereClause, baseIncludeClause);

    // --- CONSULTA 2: Obtener la suma solo de las subcategorías de INGRESO ('CREDIT') ---

    // 2.a. Encontrar todas las subcategorías tipo CREDIT
    const incomeSubcategories = await db.Subcategory.findAll({
        where: { transaction_type: 'CREDIT' },
        attributes: ['subcategory_id'],
        raw: true,
    });
    const incomeSubcategoryIds = incomeSubcategories.map(s => s.subcategory_id);

    // 2.b. Crear un 'where' clause específico para estas subcategorías
    const incomeWhereClause = {
        ...baseWhereClause,
        subcategory_id: { [Op.in]: incomeSubcategoryIds },
    };

    // 2.c. Obtener la suma de créditos SÓLO de esas subcategorías
    const { totalCredit: totalIncomeSum } = await _getAggregatedTotals(incomeWhereClause, baseIncludeClause);

    // 3. Comparar y devolver
    const difference = totalCredit - totalIncomeSum;
    const isValid = difference === 0;

    return {
        reportMetadata: {
            reportName: 'Reporte de Validación de Cuadre',
            periodType,
            startDate: dateRange.startDate.toISOString(),
            endDate: dateRange.endDate.toISOString(),
            generatedAt: new Date().toISOString(),
            filtersApplied: filters,
        },
        validation: {
            totalCreditColumn: totalCredit, // Suma total de la columna 'credit'
            totalIncomeSubcategories: totalIncomeSum, // Suma de transacciones en subcategorías 'CREDIT'
            difference,
            isValid,
        },
    };
};

export default {
    getPeriodicReport,
    getReportByCategory,
    getSalesExpenseReport,
    getBalanceValidationReport,
};