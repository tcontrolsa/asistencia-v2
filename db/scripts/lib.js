// Utilidades comunes de los scripts de base de datos.
// Por seguridad, todo script apunta a la base de desarrollo salvo que se pase --produccion.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

// Las columnas `date` se leen como texto 'YYYY-MM-DD' (sin conversión a la zona de la PC).
pg.types.setTypeParser(1082, v => v);

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: path.join(RAIZ, '.env'), quiet: true });

export const BASE_PRODUCCION = process.env.PGDATABASE || 'asistencia';
export const BASE_DEV = process.env.PGDATABASE_DEV || 'asistencia_v2_dev';

export function baseDestino(argv = process.argv) {
  const i = argv.indexOf('--db');
  const db = i >= 0 ? argv[i + 1] : BASE_DEV;
  if (db === BASE_PRODUCCION && !argv.includes('--produccion')) {
    throw new Error(`Para operar sobre la base de producción "${db}" agrega --produccion explícitamente.`);
  }
  return db;
}

export async function conectar(database) {
  const cliente = new pg.Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database,
    application_name: 'tcontrol-db-scripts',
  });
  await cliente.connect();
  return cliente;
}

export function log(...args) {
  console.log(`[${new Date().toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil' })}]`, ...args);
}
