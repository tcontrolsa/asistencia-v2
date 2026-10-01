// crearReporteGoogleSheets del Apps Script, ahora con una cuenta de servicio de Google (sin librerías externas):
// borra la pestaña con el mismo nombre, la crea, escribe encabezados y filas, da formato y devuelve la URL.
import crypto from 'node:crypto';
import fs from 'node:fs';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
let token = null;

const b64url = b => Buffer.from(b).toString('base64url');

async function obtenerToken(cred) {
  if (token && token.vence > Date.now() + 60_000) return token.valor;
  const ahora = Math.floor(Date.now() / 1000);
  const cab = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = b64url(JSON.stringify({
    iss: cred.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600,
  }));
  const firma = crypto.createSign('RSA-SHA256').update(`${cab}.${cuerpo}`).sign(cred.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cab}.${cuerpo}.${firma}` }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Google rechazó la cuenta de servicio: ${d.error_description || d.error || r.status}`);
  token = { valor: d.access_token, vence: Date.now() + (d.expires_in || 3600) * 1000 };
  return token.valor;
}

export function crearSheets({ credenciales, hojaId }) {
  const configurado = !!(credenciales && hojaId && fs.existsSync(credenciales));
  let cred = null;

  async function api(ruta, metodo = 'GET', cuerpo) {
    cred ||= JSON.parse(fs.readFileSync(credenciales, 'utf8'));
    const r = await fetch(`${API}/${hojaId}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${await obtenerToken(cred)}`, 'Content-Type': 'application/json' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error?.message || `Error ${r.status} de Google Sheets`);
    return d;
  }

  async function exportar({ nombre, encabezados, filas }) {
    if (!configurado) throw new Error('La exportación a Google Sheets no está configurada en el servidor (GOOGLE_CREDENCIALES y SHEETS_ID).');
    const libro = await api('?fields=sheets.properties');
    const existente = libro.sheets?.find(s => s.properties.title === nombre);
    const pedidos = [];
    if (existente) pedidos.push({ deleteSheet: { sheetId: existente.properties.sheetId } });
    pedidos.push({ addSheet: { properties: { title: nombre } } });
    const res = await api(':batchUpdate', 'POST', { requests: pedidos });
    const gid = res.replies.at(-1).addSheet.properties.sheetId;
    const ancho = encabezados.length;
    const valores = [encabezados, ...filas.map(f => Array.from({ length: ancho }, (_, i) => f[i] ?? ''))];
    await api(`/values/${encodeURIComponent(`'${nombre.replace(/'/g, "''")}'!A1`)}?valueInputOption=USER_ENTERED`, 'PUT', { values: valores });
    // Cabecera azul, letra blanca, negrita y centrada; datos en Arial; columnas auto-ajustadas
    await api(':batchUpdate', 'POST', { requests: [
      { repeatCell: { range: { sheetId: gid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: ancho },
        cell: { userEnteredFormat: { backgroundColor: { red: 0x1e / 255, green: 0x40 / 255, blue: 0xaf / 255 }, horizontalAlignment: 'CENTER',
          textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)' } },
      { repeatCell: { range: { sheetId: gid, startRowIndex: 1, endRowIndex: valores.length, startColumnIndex: 0, endColumnIndex: ancho },
        cell: { userEnteredFormat: { textFormat: { fontFamily: 'Arial' } } }, fields: 'userEnteredFormat.textFormat.fontFamily' } },
      { autoResizeDimensions: { dimensions: { sheetId: gid, dimension: 'COLUMNS', startIndex: 0, endIndex: ancho } } },
    ] });
    return { url: `https://docs.google.com/spreadsheets/d/${hojaId}/edit#gid=${gid}` };
  }

  return { configurado, exportar };
}
