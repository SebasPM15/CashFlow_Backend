// src/controllers/cashflow.controller.js

import httpStatus from 'http-status';
import asyncHandler from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.util.js';
import cashflowService from '../services/cashflow.service.js';

/**
 * Controlador para gestionar las operaciones del flujo de caja.
 * @namespace cashflowController
 */

/**
 * Maneja la petición para establecer el saldo inicial del mes.
 */
const setMonthlyBalance = asyncHandler(async (req, res) => {
    const { year, month, initial_balance } = req.body.dinBody;
    const monthlyBalance = await cashflowService.setInitialMonthlyBalance({
        year,
        month,
        initialBalance: initial_balance,
    });

    sendResponse(
        res,
        httpStatus.CREATED,
        'Saldo inicial del mes configurado exitosamente.',
        monthlyBalance
    );
});

/**
 * Maneja la petición para crear una nueva transacción de flujo de caja.
 */
const createTransaction = asyncHandler(async (req, res) => {
    const transactionData = req.body.dinBody;
    const userId = req.user.user_id;
    const newTransaction = await cashflowService.createTransaction(transactionData, userId);

    sendResponse(
        res,
        httpStatus.CREATED,
        'Transacción registrada exitosamente.',
        newTransaction
    );
});

/**
 * Maneja la petición para listar las transacciones.
 */
const getTransactions = asyncHandler(async (req, res) => {
    const user = req.user;
    const queryParams = req.body.dinBody || {};
    const result = await cashflowService.getTransactionsList(user, queryParams);

    sendResponse(
        res,
        httpStatus.OK,
        'Transacciones obtenidas exitosamente.',
        result
    );
});

/**
 * Maneja la petición para añadir o actualizar la evidencia de una transacción.
 */
const upsertEvidence = asyncHandler(async (req, res) => {
    // 1. Extraemos TODO del dinBody, ya no hay req.params.
    const { transactionId, evidence } = req.body.dinBody;
    const user = req.user;

    // 2. Llama al servicio (esta llamada no cambia, ya estaba bien diseñada).
    const newEvidence = await cashflowService.upsertEvidence(transactionId, evidence, user);

    // 3. Envía la respuesta.
    sendResponse(res, httpStatus.OK, 'Evidencia actualizada exitosamente.', newEvidence);
});

export const cashflowController = {
    setMonthlyBalance,
    createTransaction,
    getTransactions,
    upsertEvidence, // <-- Exportamos la nueva función
};