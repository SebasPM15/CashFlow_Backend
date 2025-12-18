import httpStatus from 'http-status';
import db from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Obtiene los catálogos (Bancos y Tipos) para llenar los selects del frontend.
 */
const getCatalogs = async () => {
    const banks = await db.Bank.findAll({ 
        where: { is_active: true }, 
        attributes: ['bank_id', 'bank_name', 'bank_code'],
        order: [['bank_name', 'ASC']] 
    });
    
    const accountTypes = await db.AccountType.findAll({ 
        where: { is_active: true },
        attributes: ['account_type_id', 'type_name'],
        order: [['type_name', 'ASC']]
    });

    return { banks, accountTypes };
};

/**
 * Crea una nueva cuenta bancaria para la compañía.
 */
const createBankAccount = async (data, companyId) => {
    const { bankId, accountTypeId, accountNumber, alias, isDefault } = data;

    // 1. Validar existencia en catálogos
    const bank = await db.Bank.findByPk(bankId);
    if (!bank) throw new ApiError(httpStatus.NOT_FOUND, 'El banco seleccionado no es válido.');

    const type = await db.AccountType.findByPk(accountTypeId);
    if (!type) throw new ApiError(httpStatus.NOT_FOUND, 'El tipo de cuenta seleccionado no es válido.');

    // 2. Validar duplicidad de número de cuenta dentro de la misma empresa
    const existingAccount = await db.BankAccount.findOne({
        where: { company_id: companyId, account_number: accountNumber }
    });
    if (existingAccount) {
        throw new ApiError(httpStatus.CONFLICT, 'Este número de cuenta ya está registrado en tu empresa.');
    }

    // 3. Validar duplicidad de alias
    const existingAlias = await db.BankAccount.findOne({
        where: { company_id: companyId, account_alias: alias }
    });
    if (existingAlias) {
        throw new ApiError(httpStatus.CONFLICT, 'Ya tienes una cuenta registrada con este alias.');
    }

    // 4. Crear la cuenta (El trigger de BD gestionará si es default)
    return await db.BankAccount.create({
        company_id: companyId,
        bank_id: bankId,
        account_type_id: accountTypeId,
        account_number: accountNumber,
        account_alias: alias,
        is_default: isDefault || false,
        is_active: true
    });
};

/**
 * Lista las cuentas bancarias de la compañía.
 */
const listBankAccounts = async (companyId) => {
    return await db.BankAccount.findAll({
        where: { company_id: companyId, is_active: true },
        include: [
            { 
                model: db.Bank, 
                as: 'bank', 
                attributes: ['bank_name', 'bank_code'] 
            },
            { 
                model: db.AccountType, 
                as: 'accountType', 
                attributes: ['type_name'] 
            }
        ],
        order: [['is_default', 'DESC'], ['created_at', 'ASC']]
    });
};

export default {
    getCatalogs,
    createBankAccount,
    listBankAccounts
};