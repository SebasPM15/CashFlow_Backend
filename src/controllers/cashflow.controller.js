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
 * Maneja la petición para listar los métodos de pago activos.
 */
const getPaymentMethods = asyncHandler(async (req, res) => {
    // No se necesita req.body ni req.user, solo llama al servicio.
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

const cancelTransaction = asyncHandler(async (req, res) => {
    // 1. Extraemos los datos necesarios de la petición.
    const { transactionId } = req.body.dinBody;
    const user = req.user; // El usuario que realiza la acción, inyectado por el middleware de auth.

    // 2. Llamamos al servicio para que ejecute la lógica de negocio.
    const reversalTransaction = await cashflowService.cancelTransaction(transactionId, user);

    // 3. Enviamos la respuesta estandarizada.
    sendResponse(
        res,
        httpStatus.OK,
        'Transacción cancelada y revertida exitosamente.',
        reversalTransaction
    );
});

const updateConcept = asyncHandler(async (req, res) => {
    // 1. Extraemos los datos validados del cuerpo de la petición.
    const { transactionId, concept } = req.body.dinBody;
    const user = req.user; // Obtenemos el usuario autenticado.

    // 2. Llamamos al servicio para que ejecute la lógica de negocio.
    const updatedTransaction = await cashflowService.updateTransactionConcept(transactionId, concept, user);

    // 3. Enviamos la respuesta estandarizada.
    sendResponse(
        res,
        httpStatus.OK,
        'El concepto de la transacción ha sido actualizado exitosamente.',
        updatedTransaction
    );
});

const getEvidenceUrl = asyncHandler(async (req, res) => {
    // 1. Extraemos el ID de la evidencia del cuerpo de la petición.
    const { evidenceId } = req.body.dinBody;
    const user = req.user;

    // 2. Llamamos al servicio para que realice la lógica y genere la URL.
    const evidenceLink = await cashflowService.getEvidenceDownloadUrl(evidenceId, user);

    // 3. Enviamos la URL segura de vuelta al cliente.
    sendResponse(
        res,
        httpStatus.OK,
        'URL de descarga de la evidencia generada exitosamente.',
        evidenceLink
    );
});

/**
 * Maneja la petición para obtener el saldo inicial de un mes específico.
 */
const getMonthlyBalance = asyncHandler(async (req, res) => {
    const { year, month } = req.body.dinBody;
    // La función del servicio ahora devuelve un objeto con initialBalance y averageBalance
    const balanceData = await cashflowService.getMonthlyBalance({ year, month });

    sendResponse(
        res,
        httpStatus.OK,
        'Datos del balance mensual obtenidos exitosamente.', // Mensaje más general
        balanceData // Devolvemos el objeto completo
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
    getMonthlyBalance
};