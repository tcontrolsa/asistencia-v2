// Prueba de humo contra PostgREST ya levantado (criterio §7: sin sesión no se lee ni escribe nada).
// Uso: node db/scripts/probar-http.js [--url http://192.168.10.129:3001]
// Opcional, para probar una sesión real: PRUEBA_USUARIO y PRUEBA_PASSWORD en el entorno.
import crypto from 'node:crypto';
import './lib.js';

const i = process.argv.indexOf('--url');
const URL_BASE = (i >= 0 ? process.argv[i + 1] : `http://${process.env.PGHOST || 'localhost'}:${process.env.PGRST_SERVER_PORT || 3001}`).replace(/\/$/, '');
let ok = 0, fallas = 0;
const t = (cond, nombre, extra = '') => {
  if (cond) { ok++; console.log(`  ok - ${nombre}`); } else { fallas++; console.log(`  FALLA - ${nombre} ${extra}`); }
};
async function pedir(metodo, ruta, { cuerpo, token } = {}) {
  const r = await fetch(`${URL_BASE}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  let datos = null;
  try { datos = await r.json(); } catch { /* sin cuerpo */ }
  return { estado: r.status, datos };
}
const firmar = (claims, secreto) => {
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const d = `${b({ alg: 'HS256', typ: 'JWT' })}.${b(claims)}`;
  return `${d}.${crypto.createHmac('sha256', secreto).update(d).digest('base64url')}`;
};

console.log(`# PostgREST en ${URL_BASE}`);
let r = await pedir('GET', '/');
t(r.estado === 200, 'PostgREST responde');

for (const tabla of ['empleados', 'marcaciones', 'novedades', 'auditoria', 'configuracion', 'vacaciones_saldo']) {
  r = await pedir('GET', `/${tabla}?limit=1`);
  t(r.estado === 401 || r.estado === 403, `sin sesión no se lee /${tabla}`, `(HTTP ${r.estado})`);
}
r = await pedir('POST', '/marcaciones', { cuerpo: { empleado_id: 'X', tipo: 'ENTRADA', fecha: '2026-01-01', hora: '07:00' } });
t(r.estado === 401 || r.estado === 403 || r.estado === 405, 'sin sesión no se escribe', `(HTTP ${r.estado})`);
for (const esquema of ['core', 'private', 'public']) {
  r = await fetch(`${URL_BASE}/empleados`, { headers: { 'Accept-Profile': esquema } });
  t(r.status === 406 || r.status === 400, `el esquema ${esquema} no está expuesto`, `(HTTP ${r.status})`);
}
r = await pedir('POST', '/rpc/ahora', { cuerpo: {} });
t(r.estado === 200 && r.datos?.[0]?.fecha, 'sin sesión se puede consultar la hora oficial');
r = await pedir('POST', '/rpc/login', { cuerpo: { p_usuario: 'NO_EXISTE_XYZ', p_password: 'x' } });
t(r.estado === 401 && r.datos?.codigo === 'CREDENCIALES', 'login incorrecto → 401 con mensaje genérico');

r = await pedir('GET', '/empleados', { token: firmar({ role: 'admin', usuario: '1058', empleado_id: '1058', exp: 9999999999 }, 'secreto-falso-de-32-caracteres-xx') });
t(r.estado === 401, 'un token firmado con otra clave se rechaza', `(HTTP ${r.estado})`);
r = await pedir('GET', '/empleados', { token: 'no.es.un.token' });
t(r.estado === 401, 'un token malformado se rechaza', `(HTTP ${r.estado})`);

if (process.env.PGRST_JWT_SECRET) {
  // Token bien firmado pero de un usuario sin credenciales: el pre-request debe rechazarlo
  r = await pedir('GET', '/empleados', { token: firmar({ role: 'admin', usuario: 'NO_EXISTE_XYZ', iat: 0, exp: 9999999999 }, process.env.PGRST_JWT_SECRET) });
  t(r.estado === 401, 'token válido de una cuenta inexistente se rechaza (pre-request)', `(HTTP ${r.estado})`);
}

if (process.env.PRUEBA_USUARIO && process.env.PRUEBA_PASSWORD) {
  r = await pedir('POST', '/rpc/login', { cuerpo: { p_usuario: process.env.PRUEBA_USUARIO, p_password: process.env.PRUEBA_PASSWORD } });
  t(r.estado === 200 && r.datos?.token, 'login real devuelve token');
  const token = r.datos?.token;
  if (token) {
    r = await pedir('GET', '/empleados', { token });
    t(r.estado === 200 && (r.datos.length === 1 || r.datos.length > 1), `con sesión lee /empleados (${r.datos?.length} filas)`);
    r = await pedir('POST', '/rpc/mi_sesion', { token, cuerpo: {} });
    t(r.estado === 200 && r.datos?.usuario === process.env.PRUEBA_USUARIO, 'mi_sesion devuelve el usuario');
  }
}

console.log(`\n${ok} correctas, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
