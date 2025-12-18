import httpStatus from 'http-status';
import asyncHandler from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.util.js';
import bankAccountService from '../services/bankAccount.service.js';

/**
 * Obtiene los catálogos de bancos y tipos de cuenta.
 */
const getCatalogs = asyncHandler(async (req, res) => {
    const catalogs = await bankAccountService.getCatalogs();
    sendResponse(res, httpStatus.OK, 'Catálogos obtenidos exitosamente.', catalogs);
});

/**
 * Crea una nueva cuenta bancaria.
 */
const createAccount = asyncHandler(async (req, res) => {
    const { dinBody } = req.body;
    const companyId = req.user.company.company_id;

    const newAccount = await bankAccountService.createBankAccount(dinBody, companyId);
    sendResponse(res, httpStatus.CREATED, 'Cuenta bancaria registrada exitosamente.', newAccount);
});

/**
 * Lista las cuentas bancarias de la empresa.
 */
const listAccounts = asyncHandler(async (req, res) => {
    const companyId = req.user.company.company_id;
    const accounts = await bankAccountService.listBankAccounts(companyId);
    sendResponse(res, httpStatus.OK, 'Cuentas bancarias listadas exitosamente.', accounts);
});

export const bankAccountController = {
    getCatalogs,
    createAccount,
    listAccounts
};