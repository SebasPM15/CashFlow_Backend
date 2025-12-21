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
    
    const whereClause = {
        company_id: user.company.company_id,
        status: 'ACTIVE',
        transaction_date: {
            [Op.between]: [dateRange.startDate, dateRange.endDate],
        },
    };

    if (user.role.role_name === 'employee') {
        whereClause.user_id = user.user_id;
    } else if (user.role.role_name === 'admin' && userId) {
        whereClause.user_id = userId;
    }

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
        required: !!categoryId
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
            'subcategory.category.category_name',
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
        where: { subcategory_name: 'Pago por gastos de venta' },
        attributes: ['subcategory_id'],
        raw: true,
    });

    if (!salesSubcategory) {
        logger.warn('No se encontró la subcategoría "Pago por gastos de venta".');
        throw new ApiError(httpStatus.NOT_FOUND, 'Subcategoría no configurada.');
    }

    const dateRange = _calculateDateRange(periodType, date);
    filters.subcategoryId = salesSubcategory.subcategory_id;
    
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

    const baseWhereClause = _buildCommonWhereClause(filters, user, dateRange);
    const baseIncludeClause = _buildCommonIncludeClause(filters);

    const { totalCredit } = await _getAggregatedTotals(baseWhereClause, baseIncludeClause);

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
 * NUEVO: Genera estructura detallada por subcategoría como en el Excel.
 */
const getFinancialAnalysis = async (companyId, year) => {
    const startDate = new Date(`${year}-01-01T00:00:00.000Z`);
    const endDate = new Date(`${year}-12-31T23:59:59.999Z`);

    // 1. Obtener todas las subcategorías en orden (según tu nueva estructura)
    const subcategories = await db.Subcategory.findAll({
        include: [{
            model: db.Category,
            as: 'category',
            attributes: ['category_id', 'category_name']
        }],
        order: [
            ['category_id', 'ASC'],
            ['subcategory_id', 'ASC']
        ],
        raw: true
    });

    // 2. Obtener transacciones del año
    const transactions = await db.CashFlowTransaction.findAll({
        where: {
            company_id: companyId,
            status: 'ACTIVE',
            transaction_date: { [Op.between]: [startDate, endDate] }
        },
        attributes: ['transaction_date', 'debit', 'credit', 'subcategory_id'],
        order: [['transaction_date', 'ASC']]
    });

    // 3. Obtener saldos iniciales
    const initialBalances = await db.InitialBalance.findAll({
        where: { company_id: companyId, year: year },
        raw: true
    });

    const balancesMap = {};
    initialBalances.forEach(b => {
        balancesMap[b.month] = parseFloat(b.initial_balance);
    });

    // 4. Determinar saldo inicial del año (continuidad histórica)
    let yearStartBalance = 0.00;

    if (balancesMap[1] !== undefined) {
        yearStartBalance = balancesMap[1];
    } else {
        const lastTxPreviousYear = await db.CashFlowTransaction.findOne({
            where: {
                company_id: companyId,
                status: 'ACTIVE',
                transaction_date: { [Op.lt]: startDate }
            },
            order: [['transaction_date', 'DESC'], ['created_at', 'DESC']],
            attributes: ['resulting_balance']
        });

        if (lastTxPreviousYear) {
            yearStartBalance = parseFloat(lastTxPreviousYear.resulting_balance);
        }
    }

    // 5. Construir estructura de datos mensual
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
                        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    
    const monthlyData = [];
    let runningBalance = yearStartBalance;

    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
        const monthNum = monthIndex + 1;

        // Si hay reinicio manual de saldo, lo aplicamos
        if (balancesMap[monthNum] !== undefined) {
            runningBalance = balancesMap[monthNum];
        }

        const monthStartBalance = runningBalance;

        // Filtrar transacciones del mes
        const monthTransactions = transactions.filter(tx => {
            const txDate = new Date(tx.transaction_date);
            return txDate.getUTCMonth() === monthIndex;
        });

        // Agrupar por subcategoría
        const subcategoryTotals = {};
        monthTransactions.forEach(tx => {
            const subId = tx.subcategory_id;
            if (!subcategoryTotals[subId]) {
                subcategoryTotals[subId] = { credit: 0, debit: 0 };
            }
            subcategoryTotals[subId].credit += parseFloat(tx.credit);
            subcategoryTotals[subId].debit += parseFloat(tx.debit);
        });

        // Construir las secciones del flujo de fondos
        const sections = [];
        let currentCategory = null;
        let categoryTotal = 0;
        let categoryRows = [];

        subcategories.forEach(sub => {
            const categoryName = sub['category.category_name'];
            const subName = sub.subcategory_name;
            const subId = sub.subcategory_id;

            // Cambio de categoría: cerrar la anterior
            if (currentCategory && currentCategory !== categoryName) {
                sections.push({
                    type: 'category',
                    name: currentCategory,
                    rows: categoryRows,
                    total: parseFloat(categoryTotal.toFixed(2))
                });
                categoryRows = [];
                categoryTotal = 0;
            }

            currentCategory = categoryName;

            // Calcular el valor neto de esta subcategoría
            const totals = subcategoryTotals[subId] || { credit: 0, debit: 0 };
            const netAmount = totals.credit - totals.debit;
            
            categoryTotal += netAmount;

            // Agregar fila
            categoryRows.push({
                subcategory: subName,
                amount: parseFloat(netAmount.toFixed(2))
            });
        });

        // Cerrar última categoría
        if (currentCategory) {
            sections.push({
                type: 'category',
                name: currentCategory,
                rows: categoryRows,
                total: parseFloat(categoryTotal.toFixed(2))
            });
        }

        // Calcular flujo neto del mes
        const totalIncome = sections.reduce((sum, sec) => sum + (sec.total > 0 ? sec.total : 0), 0);
        const totalExpense = sections.reduce((sum, sec) => sum + (sec.total < 0 ? sec.total : 0), 0);
        const netFlow = totalIncome + totalExpense;
        const monthEndBalance = monthStartBalance + netFlow;

        monthlyData.push({
            month: monthNames[monthIndex],
            monthNumber: monthNum,
            initialBalance: parseFloat(monthStartBalance.toFixed(2)),
            sections: sections,
            netFlow: parseFloat(netFlow.toFixed(2)),
            finalBalance: parseFloat(monthEndBalance.toFixed(2))
        });

        runningBalance = monthEndBalance;
    }

    // 6. Calcular resumen anual
    const sumOfMonthlyBalances = monthlyData.reduce((sum, m) => sum + m.finalBalance, 0);
    const averageAnnualBalance = sumOfMonthlyBalances / 12;

    return {
        year,
        companyId,
        annualSummary: {
            initialBalance: parseFloat(yearStartBalance.toFixed(2)),
            averageBalance: parseFloat(averageAnnualBalance.toFixed(2)),
            closingBalance: monthlyData[11].finalBalance
        },
        monthlyData: monthlyData
    };
};

export default {
    getPeriodicReport,
    getReportByCategory,
    getSalesExpenseReport,
    getBalanceValidationReport,
    getFinancialAnalysis,
};