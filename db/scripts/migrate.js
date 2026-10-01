// Aplica db/migrations/*.sql en orden, una vez cada una, dentro de una transacción.
// Uso: node db/scripts/migrate.js [--db nombre] [--produccion] [--reset | --rehacer 010 (solo desarrollo)]
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, baseDestino, conectar, log } from './lib.js';

const db = baseDestino();
const dir = path.join(RAIZ, 'db', 'migrations');
const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

const c = await conectar(db);
log(`Base: ${db}`);
if (process.argv.includes('--reset')) {
  if (process.argv.includes('--produccion')) throw new Error('--reset no está permitido en producción');
  await c.query('DROP SCHEMA IF EXISTS api, core, private CASCADE');
  log('Esquemas api, core y private eliminados (--reset).');
}
await c.query(`CREATE SCHEMA IF NOT EXISTS private;
               CREATE TABLE IF NOT EXISTS private.schema_migrations (
                 version text PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())`);
const aplicadas = new Set((await c.query('SELECT version FROM private.schema_migrations')).rows.map(r => r.version));
// --rehacer <archivo>: vuelve a ejecutar una migración ya aplicada mientras se desarrolla (solo desarrollo)
const iRehacer = process.argv.indexOf('--rehacer');
if (iRehacer > 0) {
  if (process.argv.includes('--produccion')) throw new Error('--rehacer no está permitido en producción');
  const objetivo = archivos.find(f => f.startsWith(process.argv[iRehacer + 1] || '¬'));
  if (!objetivo) throw new Error('Migración no encontrada para --rehacer');
  await c.query('DELETE FROM private.schema_migrations WHERE version = $1', [objetivo]);
  aplicadas.delete(objetivo);
  log(`Se volverá a aplicar ${objetivo} (--rehacer).`);
}

for (const f of archivos) {
  if (aplicadas.has(f)) continue;
  const sql = fs.readFileSync(path.join(dir, f), 'utf8');
  try {
    await c.query('BEGIN');
    await c.query(sql);
    await c.query('INSERT INTO private.schema_migrations (version) VALUES ($1)', [f]);
    await c.query('COMMIT');
    log(`✔ ${f}`);
  } catch (e) {
    await c.query('ROLLBACK');
    log(`✘ ${f}: ${e.message}${e.position ? ` (posición ${e.position})` : ''}`);
    await c.end();
    process.exit(1);
  }
}

// Contraseña del rol con el que se conecta PostgREST (no se guarda en el repositorio).
if (process.env.PGRST_AUTHENTICATOR_PASSWORD) {
  const { rows } = await c.query('SELECT quote_literal($1) AS p', [process.env.PGRST_AUTHENTICATOR_PASSWORD]);
  await c.query(`ALTER ROLE authenticator PASSWORD ${rows[0].p}`);
  log('Contraseña de authenticator actualizada.');
}
// Rol del worker de la Fase 6 (solo ejecuta private.worker_*); existe desde la migración 018.
if (process.env.WORKER_DB_PASSWORD) {
  const { rows } = await c.query(`SELECT quote_literal($1) AS p, EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tcontrol_worker') AS hay`,
    [process.env.WORKER_DB_PASSWORD]);
  if (rows[0].hay) {
    await c.query(`ALTER ROLE tcontrol_worker PASSWORD ${rows[0].p}`);
    log('Contraseña de tcontrol_worker actualizada.');
  }
}
// Secreto con el que la base firma los JWT; debe ser el mismo PGRST_JWT_SECRET de PostgREST.
if (process.env.PGRST_JWT_SECRET) {
  if (process.env.PGRST_JWT_SECRET.length < 32) throw new Error('PGRST_JWT_SECRET debe tener al menos 32 caracteres');
  await c.query(`INSERT INTO private.secretos (clave, valor) VALUES ('jwt_secret', $1)
                 ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`, [process.env.PGRST_JWT_SECRET]);
  log('Secreto JWT actualizado.');
}
await c.end();
log('Migraciones al día.');
