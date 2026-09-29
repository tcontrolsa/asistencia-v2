// Completa en .env (local, no versionado) los secretos de PostgREST que falten, sin mostrarlos.
// PGRST_AUTHENTICATOR_PASSWORD, PGRST_JWT_SECRET y PGRST_DB_URI (usuario authenticator).
// Uso: node db/scripts/generar-secretos.js [--db nombre]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, BASE_DEV, log } from './lib.js';

const ruta = path.join(RAIZ, '.env');
let texto = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : '';
const i = process.argv.indexOf('--db');
const db = i >= 0 ? process.argv[i + 1] : BASE_DEV;
const aleatorio = n => crypto.randomBytes(n).toString('base64url');

const valor = k => texto.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim();
const poner = (k, v) => {
  const linea = `${k}=${v}`;
  texto = new RegExp(`^${k}=.*$`, 'm').test(texto)
    ? texto.replace(new RegExp(`^${k}=.*$`, 'm'), linea)
    : `${texto.replace(/\s*$/, '')}\n${linea}\n`;
};
const vacio = v => !v || /tu_contrasena|genera_/.test(v);

if (vacio(valor('PGRST_AUTHENTICATOR_PASSWORD'))) { poner('PGRST_AUTHENTICATOR_PASSWORD', aleatorio(24)); log('PGRST_AUTHENTICATOR_PASSWORD generado'); }
if (vacio(valor('PGRST_JWT_SECRET'))) { poner('PGRST_JWT_SECRET', aleatorio(48)); log('PGRST_JWT_SECRET generado'); }
const host = valor('PGHOST') || 'localhost';
const port = valor('PGPORT') || '5432';
poner('PGRST_DB_URI', `postgresql://authenticator:${encodeURIComponent(valor('PGRST_AUTHENTICATOR_PASSWORD'))}@${host}:${port}/${db}`);
if (!valor('PGRST_DB_SCHEMAS')) poner('PGRST_DB_SCHEMAS', 'api');
if (!valor('PGRST_DB_PRE_REQUEST')) poner('PGRST_DB_PRE_REQUEST', 'private.verificar_sesion');
log(`PGRST_DB_URI apunta a authenticator@${host}:${port}/${db}`);
fs.writeFileSync(ruta, texto);
