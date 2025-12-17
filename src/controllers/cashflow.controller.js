import httpStatus from 'http-status';
import asyncHandler from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.util.js';
import cashflowService from '../services/cashflow.service.js';

/**
 * Controlador para gestionar las operaciones del flujo de caja.
 * @namespace cashflowController
 */

const getPaymentMethods = asyncHandler(async (req, res) => {
    const paymentMethods = await cashflowService.getPaymentMethodsList();

    sendResponse(
        res,
        httpStatus.OK,
        'Métodos de pago obtenidos exitosamente.',
        paymentMethods
    );
});

/**
 * Maneja la petición para establecer el saldo inicial del mes.
 * CRÍTICO: Pasa el companyId del usuario autenticado.
 */
const setMonthlyBalance = asyncHandler(async (req, res) => {
    const { year, month, initial_balance } = req.body.dinBody;
    // Extraemos company_id del token
    const companyId = req.user.company.company_id;

    const monthlyBalance = await cashflowService.setInitialMonthlyBalance({
        year,
        month,
        initialBalance: initial_balance,
    }, companyId);

    sendResponse(
        res,
        httpStatus.CREATED,
        'Saldo inicial del mes configurado exitosamente.',
        monthlyBalance
    );
});

/**
 * Maneja la petición para crear una nueva transacción.
 * CRÍTICO: Pasa el companyId del usuario autenticado.
 */
const createTransaction = asyncHandler(async (req, res) => {
    const transactionData = req.body.dinBody;
    const userId = req.user.user_id;
    const companyId = req.user.company.company_id;

    const newTransaction = await cashflowService.createTransaction(transactionData, userId, companyId);

    sendResponse(
        res,
        httpStatus.CREATED,
        'Transacción registrada exitosamente.',
        newTransaction
    );
});

/**
 * Maneja la petición para listar las transacciones.
 * El servicio ya extrae el companyId del objeto user.
 */
const getTransactions = asyncHandler(async (req, res) => {
    const user = req.user;
    const queryParams = req.body.dinBody || {};
    // El servicio usa user.company.company_id internamente
    const result = await cashflowService.getTransactionsList(user, queryParams);

    sendResponse(
        res,
        httpStatus.OK,
        'Transacciones obtenidas exitosamente.',
        result
    );
});

const upsertEvidence = asyncHandler(async (req, res) => {
    const { transactionId, evidence } = req.body.dinBody;
    const user = req.user;

    const newEvidence = await cashflowService.upsertEvidence(transactionId, evidence, user);

    sendResponse(res, httpStatus.OK, 'Evidencia actualizada exitosamente.', newEvidence);
});

const cancelTransaction = asyncHandler(async (req, res) => {
    const { transactionId } = req.body.dinBody;
    const user = req.user;

    const reversalTransaction = await cashflowService.cancelTransaction(transactionId, user);

    sendResponse(
        res,
        httpStatus.OK,
        'Transacción cancelada y revertida exitosamente.',
        reversalTransaction
    );
});

const updateConcept = asyncHandler(async (req, res) => {
    const { transactionId, concept } = req.body.dinBody;
    const user = req.user;

    const updatedTransaction = await cashflowService.updateTransactionConcept(transactionId, concept, user);

    sendResponse(
        res,
        httpStatus.OK,
        'El concepto de la transacción ha sido actualizado exitosamente.',
        updatedTransaction
    );
});

const getEvidenceUrl = asyncHandler(async (req, res) => {
    const { evidenceId } = req.body.dinBody;
    const user = req.user;

    const evidenceLink = await cashflowService.getEvidenceDownloadUrl(evidenceId, user);

    sendResponse(
        res,
        httpStatus.OK,
        'URL de descarga de la evidencia generada exitosamente.',
        evidenceLink
    );
});

/**
 * Maneja la petición para obtener el saldo inicial.
 * CRÍTICO: Pasa el companyId del usuario autenticado.
 */
const getMonthlyBalance = asyncHandler(async (req, res) => {
    const { year, month } = req.body.dinBody;
    const companyId = req.user.company.company_id;

    const balanceData = await cashflowService.getMonthlyBalance({ year, month }, companyId);

    sendResponse(
        res,
        httpStatus.OK,
        'Datos del balance mensual obtenidos exitosamente.',
        balanceData
    );
});

const updateSubcategory = asyncHandler(async (req, res) => {
    const { transactionId, newSubcategoryId } = req.body.dinBody;
    // Pasamos el usuario completo para que el servicio valide permisos y compañía
    const user = req.user; 
    
    const updatedTransaction = await cashflowService.updateTransactionSubcategory(transactionId, newSubcategoryId, user);

    sendResponse(
        res,
        httpStatus.OK,
        'Transacción re-categorizada y saldos recalculados exitosamente.',
        updatedTransaction
    );
});

export const cashflowController = {
    getPaymentMethods,
    setMonthlyBalance,
    createTransaction,
    getTransactions,
    upsertEvidence,
    cancelTransaction,
    updateConcept,
    getEvidenceUrl,
    getMonthlyBalance,
    updateSubcategory
};