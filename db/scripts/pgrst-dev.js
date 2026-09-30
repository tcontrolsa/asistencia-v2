// Emulador MÍNIMO de PostgREST solo para desarrollo local (sin Docker). NO usar en producción:
// en producción corre PostgREST 12 (db/postgrest/docker-compose.yml).
// Replica lo que usa la app: JWT HS256 → SET LOCAL ROLE, request.jwt.claims, pre-request
// private.verificar_sesion(), POST/GET /rpc/<fn>, GET /<vista>?col=eq.x&order=…, response.status,
// dominios de tipo de medio ("image/jpeg") y el mapeo de errores de SQLSTATE a HTTP.
// Uso: node db/scripts/pgrst-dev.js   (escucha en PGRST_SERVER_PORT, 3001 por defecto)
import crypto from 'node:crypto';
import http from 'node:http';
import pg from 'pg';
import './lib.js';

const PUERTO = Number(process.env.PGRST_SERVER_PORT || 3001);
const SECRETO = process.env.PGRST_JWT_SECRET;
const URI = process.env.PGRST_DB_URI;
if (!SECRETO || !URI) throw new Error('Faltan PGRST_JWT_SECRET o PGRST_DB_URI en .env (node db/scripts/generar-secretos.js)');
const pool = new pg.Pool({ connectionString: URI, max: 5 });

const ident = s => `"${String(s).replace(/"/g, '""')}"`;

function verificarJwt(auth) {
  if (!auth) return { role: 'anon' };
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) throw { estado: 401, cuerpo: { code: 'PGRST301', message: 'JWT inválido' } };
  const [h, p, f] = m[1].split('.');
  if (!h || !p || !f) throw { estado: 401, cuerpo: { code: 'PGRST301', message: 'JWT inválido' } };
  const esperado = crypto.createHmac('sha256', SECRETO).update(`${h}.${p}`).digest('base64url');
  if (esperado !== f) throw { estado: 401, cuerpo: { code: 'PGRST301', message: 'JWT inválido' } };
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (claims.exp && claims.exp * 1000 < Date.now()) throw { estado: 401, cuerpo: { code: 'PGRST303', message: 'JWT expirado' } };
  return claims;
}

function estadoHttp(code, rol) {
  if (code === 'PT401') return 401;
  if (code === 'PT403') return 403;
  if (code === '42501') return rol === 'anon' ? 401 : 403;
  if (code === '28P01') return 403;
  if (code === 'P0002') return 404;
  if (code === '42883' || code === '42P01') return 404;
  if (/^(22|23|P0)/.test(code || '')) return 400;
  return 500;
}

const cacheFunciones = new Map();
async function infoFuncion(c, nombre) {
  if (cacheFunciones.has(nombre)) return cacheFunciones.get(nombre);
  const { rows } = await c.query(`
    SELECT p.proretset AS setof, t.typname, t.typtype, format_type(p.prorettype, NULL) AS tipo
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_type t ON t.oid = p.prorettype
    WHERE n.nspname = 'api' AND p.proname = $1 LIMIT 1`, [nombre]);
  cacheFunciones.set(nombre, rows[0] || null);
  return rows[0] || null;
}

async function ejecutar(req, url, cuerpo) {
  const claims = verificarJwt(req.headers.authorization);
  const rol = claims.role || 'anon';
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL ROLE ${ident(rol)}`);
    await c.query(`SELECT set_config('request.jwt.claims', $1, true), set_config('request.path', $2, true), set_config('request.method', $3, true)`,
      [JSON.stringify(claims), url.pathname, req.method]);
    await c.query('SELECT private.verificar_sesion()');

    let resultado, tipoContenido = 'application/json';
    const rpc = url.pathname.match(/^\/rpc\/([a-z_]+)$/);
    if (rpc) {
      const nombre = rpc[1];
      const info = await infoFuncion(c, nombre);
      if (!info) throw { code: '42883', message: `Función api.${nombre} no existe` };
      const args = req.method === 'GET' ? Object.fromEntries(url.searchParams) : (cuerpo || {});
      const claves = Object.keys(args);
      // Objetos y listas de objetos van como JSON (jsonb); listas de valores simples, como arreglos de PostgreSQL
      const esJson = v => v !== null && typeof v === 'object' && (!Array.isArray(v) || v.some(x => x !== null && typeof x === 'object'));
      const valores = claves.map(k => (esJson(args[k]) ? JSON.stringify(args[k]) : args[k]));
      const llamada = `api.${ident(nombre)}(${claves.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')})`;
      const compuesto = info.typtype === 'c' || info.tipo === 'record';
      if (info.typname === 'image/jpeg') {
        const r = await c.query(`SELECT ${llamada}::bytea AS r`, valores);
        resultado = r.rows[0]?.r; tipoContenido = 'image/jpeg';
      } else if (compuesto) {
        const r = await c.query(`SELECT * FROM ${llamada}`, valores);
        resultado = info.setof ? r.rows : (r.rows[0] ?? null);
      } else {
        const r = await c.query(`SELECT ${llamada} AS r`, valores);
        resultado = info.setof ? r.rows.map(x => x.r) : (r.rows[0]?.r ?? null);
      }
    } else if (req.method === 'GET') {
      const vista = url.pathname.replace(/^\//, '');
      if (!vista) { resultado = { info: 'emulador de desarrollo' }; }
      else {
        const where = [], valores = [];
        let orden = '', limite = '';
        for (const [k, v] of url.searchParams) {
          if (k === 'select') continue;
          if (k === 'order') { orden = ' ORDER BY ' + v.split(',').map(o => { const [col, dir] = o.split('.'); return `${ident(col)} ${dir === 'desc' ? 'DESC' : 'ASC'}`; }).join(', '); continue; }
          if (k === 'limit') { limite = ` LIMIT ${Number(v) || 100}`; continue; }
          const m = v.match(/^(eq|neq|gt|gte|lt|lte|like|is)\.(.*)$/);
          if (!m) continue;
          const op = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', is: 'IS' }[m[1]];
          if (m[1] === 'is') { where.push(`${ident(k)} IS ${m[2] === 'null' ? 'NULL' : m[2] === 'true' ? 'TRUE' : 'FALSE'}`); continue; }
          valores.push(m[2]);
          where.push(`${ident(k)}::text ${op} $${valores.length}`);
        }
        const r = await c.query(`SELECT * FROM api.${ident(vista)}${where.length ? ' WHERE ' + where.join(' AND ') : ''}${orden}${limite}`, valores);
        resultado = r.rows;
      }
    } else {
      throw { code: '42501', message: 'Método no permitido' };
    }
    const est = (await c.query(`SELECT current_setting('response.status', true) AS s`)).rows[0].s;
    await c.query('COMMIT');
    return { estado: est ? Number(est) : 200, cuerpo: resultado, tipoContenido };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    if (e.estado) throw e;
    throw { estado: estadoHttp(e.code, rol), cuerpo: { code: e.code, message: e.message, details: e.detail || null, hint: e.hint || null } };
  } finally {
    c.release();
  }
}

http.createServer(async (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  let datos = '';
  req.on('data', d => { datos += d; });
  req.on('end', async () => {
    const url = new URL(req.url, 'http://localhost');
    try {
      const r = await ejecutar(req, url, datos ? JSON.parse(datos) : null);
      if (r.tipoContenido === 'image/jpeg') { res.writeHead(r.estado, { ...cors, 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' }); res.end(r.cuerpo); }
      else { res.writeHead(r.estado, { ...cors, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(r.cuerpo)); }
      console.log(`${req.method} ${url.pathname} → ${r.estado}`);
    } catch (e) {
      res.writeHead(e.estado || 500, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(e.cuerpo || { message: String(e.message || e) }));
      console.log(`${req.method} ${url.pathname} → ${e.estado || 500} ${e.cuerpo?.message || ''}`);
    }
  });
}).listen(PUERTO, () => console.log(`Emulador PostgREST (solo desarrollo) en http://localhost:${PUERTO}`));
