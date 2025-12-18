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
 * Calcula el rango de fechas (startDate, endDate).
 * @private
 */
const _calculateDateRange = (periodType, date) => {
    const parsedDate = parseISO(date);
    const year = parsedDate.getFullYear();
    const weekOptions = { weekStartsOn: 1 };

    switch (periodType) {
        case 'daily': return { startDate: startOfDay(parsedDate), endDate: endOfDay(parsedDate) };
        case 'weekly': return { startDate: startOfWeek(parsedDate, weekOptions), endDate: endOfWeek(parsedDate, weekOptions) };
        case 'monthly': return { startDate: startOfMonth(parsedDate), endDate: endOfMonth(parsedDate) };
        case 'quarterly': return { startDate: startOfQuarter(parsedDate), endDate: endOfQuarter(parsedDate) };
        case 'semiannual':
            const isFirstHalf = parsedDate.getMonth() < 6;
            return {
                startDate: isFirstHalf ? startOfDay(new Date(year, 0, 1)) : startOfDay(new Date(year, 6, 1)),
                endDate: isFirstHalf ? endOfDay(new Date(year, 5, 30)) : endOfDay(new Date(year, 11, 31)),
            };
        case 'annual': return { startDate: startOfYear(parsedDate), endDate: endOfYear(parsedDate) };
        default: throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Tipo de período no implementado.');
    }
};

/**
 * Construye la cláusula 'where' común para todas las consultas de reporte.
 * CRÍTICO: Asegura el aislamiento por compañía.
 * @private
 */
const _buildCommonWhereClause = (filters, user, dateRange) => {
    const { userId, subcategoryId, methodId } = filters;
    
    // 🔥 CORRECCIÓN DE SEGURIDAD: Filtro obligatorio por company_id
    const whereClause = {
        company_id: user.company.company_id, // <--- AQUÍ ESTABA EL HUECO, YA CERRADO
        status: 'ACTIVE',
        transaction_date: {
            [Op.between]: [dateRange.startDate, dateRange.endDate],
        },
    };

    // 1. Filtro por Rol/Usuario (dentro de la misma compañía)
    if (user.role.role_name === 'employee') {
        whereClause.user_id = user.user_id;
    } else if (user.role.role_name === 'admin' && userId) {
        whereClause.user_id = userId;
    }

    // 2. Filtros opcionales
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

    const subcategoryInclude = {
        model: db.Subcategory,
        as: 'subcategory',
        attributes: [],
        required: !!categoryId // Si hay filtro de categoría, el inner join es requerido
    };

    if (categoryId) {
        subcategoryInclude.where = { category_id: categoryId };
    }

    includeClause.push(subcategoryInclude);
    return includeClause;
};

/**
 * Ejecuta una consulta de agregación (SUM).
 * @private
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
        raw: true,
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
 * Genera un reporte periódico global.
 */
const getPeriodicReport = async (reportData, user) => {
    const { periodType, date, ...filters } = reportData;
    const dateRange = _calculateDateRange(periodType, date);
    
    // Ahora incluye company_id implícitamente
    const whereClause = _buildCommonWhereClause(filters, user, dateRange); 
    const includeClause = _buildCommonIncludeClause(filters);

    const totals = await _getAggregatedTotals(whereClause, includeClause);

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
 * Genera un reporte desglosado por Categoría.
 */
const getReportByCategory = async (reportData, user) => {
    const { periodType, date, ...filters } = reportData;
    const dateRange = _calculateDateRange(periodType, date);
    const { categoryId, subcategoryId, ...otherFilters } = filters;

    // Ahora incluye company_id implícitamente
    const whereClause = _buildCommonWhereClause(otherFilters, user, dateRange);

    const results = await db.CashFlowTransaction.findAll({
        attributes: [
            [db.sequelize.col('subcategory.category.category_name'), 'categoryName'],
            [db.sequelize.col('subcategory.subcategory_name'), 'subcategoryName'],
            [db.sequelize.fn('SUM', db.sequelize.col('debit')), 'totalDebit'],
            [db.sequelize.fn('SUM', db.sequelize.col('credit')), 'totalCredit'],
            [db.sequelize.fn('COUNT', db.sequelize.col('transaction_id')), 'count'],
        ],
        where: whereClause,
        include: [
            {
                model: db.Subcategory,
                as: 'subcategory',
                attributes: [],
                required: true,
                include: {
                    model: db.Category,
                    as: 'category',
                    attributes: [],
                    required: true,
                },
            },
        ],
        group: [
            'subcategory.category.category_id',
            'subcategory.category.category_name', // Postgres pide agrupar por lo que seleccionas o IDs
            'subcategory.subcategory_id',
            'subcategory.subcategory_name'
        ],
        order: [
            [db.sequelize.col('categoryName'), 'ASC'],
            [db.sequelize.col('subcategoryName'), 'ASC'],
        ],
        raw: true,
    });

    const formattedResults = results.map(row => ({
        categoryName: row.categoryName,
        subcategoryName: row.subcategoryName,
        totalDebit: parseFloat(row.totalDebit) || 0,
        totalCredit: parseFloat(row.totalCredit) || 0,
        netFlow: (parseFloat(row.totalCredit) || 0) - (parseFloat(row.totalDebit) || 0),
        count: parseInt(row.count, 10) || 0,
    }));

    return {
        reportMetadata: {
            reportName: 'Reporte por Categoría y Subcategoría',
            periodType,
            startDate: dateRange.startDate.toISOString(),
            endDate: dateRange.endDate.toISOString(),
            generatedAt: new Date().toISOString(),
            filtersApplied: otherFilters,
        },
        breakdown: formattedResults,
    };
};

/**
 * Genera reporte de Gastos de Venta.
 */
const getSalesExpenseReport = async (reportData, user) => {
    const { periodType, date, ...filters } = reportData;

    const salesSubcategory = await db.Subcategory.findOne({
        where: { subcategory_name: 'Pago de Gastos de Venta' },
        attributes: ['subcategory_id'],
        raw: true,
    });

    if (!salesSubcategory) {
        logger.warn('No se encontró la subcategoría "Pago de Gastos de Venta".');
        throw new ApiError(httpStatus.NOT_FOUND, 'Subcategoría no configurada.');
    }

    const dateRange = _calculateDateRange(periodType, date);
    filters.subcategoryId = salesSubcategory.subcategory_id;
    
    // Ahora incluye company_id implícitamente
    const whereClause = _buildCommonWhereClause(filters, user, dateRange);
    const includeClause = _buildCommonIncludeClause(filters);

    const totals = await _getAggregatedTotals(whereClause, includeClause);

    return {
        reportMetadata: {
            reportName: 'Reporte de Gastos de Venta',
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
 * Reporte de Validación de Cuadre.
 */
const getBalanceValidationReport = async (reportData, user) => {
    const { periodType, date, ...filters } = reportData;
    const dateRange = _calculateDateRange(periodType, date);

    // Filtros base con company_id seguro
    const baseWhereClause = _buildCommonWhereClause(filters, user, dateRange);
    const baseIncludeClause = _buildCommonIncludeClause(filters);

    // Consulta 1: Total Créditos
    const { totalCredit } = await _getAggregatedTotals(baseWhereClause, baseIncludeClause);

    // Consulta 2: Total Ingresos (Solo subcategorías CREDIT)
    const incomeSubcategories = await db.Subcategory.findAll({
        where: { transaction_type: 'CREDIT' },
        attributes: ['subcategory_id'],
        raw: true,
    });
    const incomeSubcategoryIds = incomeSubcategories.map(s => s.subcategory_id);

    const incomeWhereClause = {
        ...baseWhereClause,
        subcategory_id: { [Op.in]: incomeSubcategoryIds },
    };

    const { totalCredit: totalIncomeSum } = await _getAggregatedTotals(incomeWhereClause, baseIncludeClause);

    return {
        reportMetadata: {
            reportName: 'Reporte de Validación de Cuadre',
            periodType,
            generatedAt: new Date().toISOString(),
        },
        validation: {
            totalCreditColumn: totalCredit,
            totalIncomeSubcategories: totalIncomeSum,
            difference: totalCredit - totalIncomeSum,
            isValid: (totalCredit - totalIncomeSum) === 0,
        },
    };
};


/**
 * Genera el Análisis Financiero Anual (Flujo de Fondos tipo Excel).
 * Soporta continuidad histórica, reinicios manuales y cálculo de resumen anual.
 */
const getFinancialAnalysis = async (companyId, year) => {
    const startDate = new Date(`${year}-01-01T00:00:00.000Z`);
    const endDate = new Date(`${year}-12-31T23:59:59.999Z`);

    // 1. Obtener transacciones (Filtradas por Company)
    const transactions = await db.CashFlowTransaction.findAll({
        where: {
            company_id: companyId, // <--- SEGURO
            status: 'ACTIVE',
            transaction_date: { [Op.between]: [startDate, endDate] }
        },
        attributes: ['transaction_date', 'debit', 'credit'],
        include: [{
            model: db.Subcategory,
            as: 'subcategory',
            attributes: ['subcategory_name'],
            include: [{
                model: db.Category,
                as: 'category',
                attributes: ['category_name']
            }]
        }],
        order: [['transaction_date', 'ASC']]
    });

    // 2. Obtener saldos iniciales (Filtrados por Company)
    const initialBalances = await db.InitialBalance.findAll({
        where: { company_id: companyId, year: year }, // <--- SEGURO
        raw: true
    });

    const balancesMap = {};
    initialBalances.forEach(b => {
        balancesMap[b.month] = parseFloat(b.initial_balance);
    });

    // 3. Continuidad Histórica
    let currentBalance = 0.00;

    if (balancesMap[1] !== undefined) {
        currentBalance = balancesMap[1];
    } else {
        const lastTxPreviousYear = await db.CashFlowTransaction.findOne({
            where: {
                company_id: companyId, // <--- SEGURO
                status: 'ACTIVE',
                transaction_date: { [Op.lt]: startDate }
            },
            order: [['transaction_date', 'DESC'], ['created_at', 'DESC']],
            attributes: ['resulting_balance']
        });

        if (lastTxPreviousYear) {
            currentBalance = parseFloat(lastTxPreviousYear.resulting_balance);
        }
    }

    // 4. Iteración Mensual
    const monthlyData = [];
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    const MACRO_CATEGORIES = {
        OPERATIONAL: 'Movimientos Operacionales',
        INVESTMENT: 'Movimientos de Inversión',
        EXTERNAL: 'Movimientos Financiamiento Externo',
        INTERNAL: 'Movimientos Financiamiento Interno'
    };

    for (let i = 0; i < 12; i++) {
        const currentMonthNum = i + 1;

        if (balancesMap[currentMonthNum] !== undefined) {
            currentBalance = balancesMap[currentMonthNum];
        }

        const txsInMonth = transactions.filter(tx => {
            const d = new Date(tx.transaction_date);
            return d.getUTCMonth() === i;
        });

        const monthSummary = {
            month: monthNames[i],
            saldoInicial: parseFloat(currentBalance.toFixed(2)),
            flows: { operational: 0, investment: 0, external: 0, internal: 0 },
            details: { operational: {}, investment: {}, external: {}, internal: {} }
        };

        txsInMonth.forEach(tx => {
            const categoryName = tx.subcategory.category.category_name;
            const subName = tx.subcategory.subcategory_name;
            const amount = parseFloat(tx.credit) - parseFloat(tx.debit);

            if (categoryName === MACRO_CATEGORIES.OPERATIONAL) {
                monthSummary.flows.operational += amount;
                monthSummary.details.operational[subName] = (monthSummary.details.operational[subName] || 0) + amount;
            } else if (categoryName === MACRO_CATEGORIES.INVESTMENT) {
                monthSummary.flows.investment += amount;
                monthSummary.details.investment[subName] = (monthSummary.details.investment[subName] || 0) + amount;
            } else if (categoryName === MACRO_CATEGORIES.EXTERNAL) {
                monthSummary.flows.external += amount;
                monthSummary.details.external[subName] = (monthSummary.details.external[subName] || 0) + amount;
            } else if (categoryName === MACRO_CATEGORIES.INTERNAL) {
                monthSummary.flows.internal += amount;
                monthSummary.details.internal[subName] = (monthSummary.details.internal[subName] || 0) + amount;
            }
        });

        const netFlow = monthSummary.flows.operational + monthSummary.flows.investment + monthSummary.flows.external + monthSummary.flows.internal;
        const finalBalance = monthSummary.saldoInicial + netFlow;

        monthlyData.push({
            month: monthSummary.month,
            saldoInicial: monthSummary.saldoInicial,
            saldoFinal: parseFloat(finalBalance.toFixed(2)),
            flujoNeto: parseFloat(netFlow.toFixed(2)),
            flujoOperacional: parseFloat(monthSummary.flows.operational.toFixed(2)),
            flujoInversion: parseFloat(monthSummary.flows.investment.toFixed(2)),
            flujoFinancieroExt: parseFloat(monthSummary.flows.external.toFixed(2)),
            flujoFinancieroInt: parseFloat(monthSummary.flows.internal.toFixed(2)),
            detalles: monthSummary.details
        });

        currentBalance = finalBalance;
    }

    // 5. NUEVO: Cálculo de Resumen Anual
    let sumOfMonthlyBalances = 0;
    monthlyData.forEach(m => {
        sumOfMonthlyBalances += m.saldoFinal;
    });

    const averageAnnualBalance = sumOfMonthlyBalances / 12;

    return {
        year,
        companyId,
        // Agregamos el resumen aquí para dashboards o KPIs
        annualSummary: {
            averageBalance: parseFloat(averageAnnualBalance.toFixed(2)),
            closingBalance: monthlyData[11].saldoFinal // Saldo final de Diciembre
        },
        reportData: monthlyData
    };
};

export default {
    getPeriodicReport,
    getReportByCategory,
    getSalesExpenseReport,
    getBalanceValidationReport,
    getFinancialAnalysis,
};