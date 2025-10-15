/**
 * Crea el contenedor HTML base para los correos transaccionales.
 * @param {string} title - Título principal del correo.
 * @param {string} body  - HTML del contenido específico.
 * @param {object} [opts]
 * @param {string} [opts.brandName='CashFlow App'] - Nombre de la marca.
 */
export function createHtmlWrapper(title, body, opts = {}) {
    const { brandName = 'CashFlow App' } = opts;
    const currentYear = new Date().getFullYear();

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    @media (prefers-color-scheme: dark) {
      body { background-color:#0b0b0b !important; }
      .card { background-color:#111827 !important; border-color:#1f2937 !important; }
      h1,h2,p,span,td,div { color:#e5e7eb !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f4f4f7;">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" class="card" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;border:1px solid #e2e8f0;">
          <tr>
            <td align="center" style="padding:20px;border-bottom:1px solid #e2e8f0;">
              <h1 style="margin:0;color:#0d47a1;font-size:24px;line-height:1.2;">${brandName}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 25px;color:#212529;line-height:1.6;">
              <h2 style="margin:0 0 24px 0;color:#1e293b;font-size:20px;line-height:1.3;">${title}</h2>
              <div>${body}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px;text-align:center;border-top:1px solid #e2e8f0;background-color:#f8fafc;border-bottom-left-radius:8px;border-bottom-right-radius:8px;">
              <p style="margin:0;font-size:12px;color:#64748b;">&copy; ${currentYear} ${brandName}. Todos los derechos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}