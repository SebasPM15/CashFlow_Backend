// src/controllers/reports.controller.js

import httpStatus from 'http-status';
import asyncHandler from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.util.js';
import reportsService from '../services/reports.service.js';

/**
 * Controlador para gestionar la generación de reportes.
 * @namespace reportsController
 */

/**
 * Maneja la petición para un reporte periódico global (totales).
 */
const getPeriodicReport = asyncHandler(async (req, res) => {
    const reportData = req.body.dinBody;
    const user = req.user;
    const report = await reportsService.getPeriodicReport(reportData, user);

    sendResponse(
        res,
        httpStatus.OK,
        'Reporte periódico global generado exitosamente.',
        report
    );
});

/**
 * Maneja la petición para un reporte desglosado por categoría.
 */
const getReportByCategory = asyncHandler(async (req, res) => {
    const reportData = req.body.dinBody;
    const user = req.user;
    const report = await reportsService.getReportByCategory(reportData, user);

    sendResponse(
        res,
        httpStatus.OK,
        'Reporte por categoría generado exitosamente.',
        report
    );
});

/**
 * Maneja la petición para el reporte de gastos de venta.
 */
const getSalesExpenseReport = asyncHandler(async (req, res) => {
    const reportData = req.body.dinBody;
    const user = req.user;
    const report = await reportsService.getSalesExpenseReport(reportData, user);

    sendResponse(
        res,
        httpStatus.OK,
        'Reporte de gastos de venta generado exitosamente.',
        report
    );
});

/**
 * Maneja la petición para el reporte de validación de cuadre.
 */
const getBalanceValidationReport = asyncHandler(async (req, res) => {
    const reportData = req.body.dinBody;
    const user = req.user;
    const report = await reportsService.getBalanceValidationReport(reportData, user);

    sendResponse(
        res,
        httpStatus.OK,
        'Reporte de validación de cuadre generado exitosamente.',
        report
    );
});

export const reportsController = {
    getPeriodicReport,
    getReportByCategory,
    getSalesExpenseReport,
    getBalanceValidationReport,
};