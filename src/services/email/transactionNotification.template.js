// 1. IMPORTAR CONFIGURACIÓN (Esto faltaba)
import config from '../../config/index.js'; 
import { createHtmlWrapper } from './base.template.js';

export const createTransactionNotificationEmail = (details) => {
    const {
        userFullName,
        companyName,
        concept,
        amount,
        type,
        transactionDate,
        categoryName,
        subcategoryName,
        methodName,
        bankDetails
    } = details;

    const formattedAmount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(amount);

    const dateObj = new Date(transactionDate);
    const formattedDate = dateObj.toLocaleDateString('es-EC', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }) + ' - ' + dateObj.toLocaleTimeString('es-EC', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    const typeLabel = type === 'CREDIT' ? 'Ingreso (Crédito)' : 'Egreso (Débito)';
    const color = type === 'CREDIT' ? '#28a745' : '#dc3545';

    let bankRow = '';
    if (bankDetails) {
        bankRow = `
        <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Cuenta Bancaria:</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; color: #333;">
                ${bankDetails.bankName} - ${bankDetails.accountAlias}<br>
                <span style="font-size: 12px; color: #777;">(${bankDetails.accountNumber})</span>
            </td>
        </tr>`;
    }

    const bodyContent = `
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 4px solid ${color};">
            <h3 style="margin: 0 0 5px 0; color: #333;">${companyName}</h3>
            <p style="margin: 0; color: #666; font-size: 14px;">Nueva transacción registrada por <strong>${userFullName}</strong></p>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Fecha y Hora:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; color: #333;">${formattedDate}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Concepto:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; color: #333;">${concept}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Tipo:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; color: ${color}; font-weight: bold;">${typeLabel}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Categoría:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; color: #333;">${categoryName} / ${subcategoryName}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">Método de Pago:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right; color: #333;">${methodName}</td>
            </tr>
            ${bankRow}
            <tr>
                <td style="padding: 12px 0; font-weight: bold; color: #333; font-size: 16px;">Monto Total:</td>
                <td style="padding: 12px 0; text-align: right; color: #333; font-size: 18px; font-weight: bold;">${formattedAmount}</td>
            </tr>
        </table>
    `;

    const subject = `[${companyName}] Nueva Transacción: ${formattedAmount}`;
    const html = createHtmlWrapper(subject, bodyContent, { brandName: 'CashFlow App' });

    return { subject, html };
};