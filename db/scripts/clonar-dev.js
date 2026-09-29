// Crea la base de desarrollo y copia en su esquema `public` las tablas actuales del Express.
// Solo LEE la base de producción. Uso: node db/scripts/clonar-dev.js [--reset]
import { BASE_DEV, BASE_PRODUCCION, conectar, log } from './lib.js';

const RESET = process.argv.includes('--reset');
const LOTE = 2000;

const mant = await conectar('postgres');
const existe = (await mant.query('SELECT 1 FROM pg_database WHERE datname = $1', [BASE_DEV])).rowCount > 0;
if (existe && RESET) {
  log(`Eliminando ${BASE_DEV} (--reset)`);
  await mant.query(`DROP DATABASE "${BASE_DEV}" WITH (FORCE)`);
}
if (!existe || RESET) {
  log(`Creando base ${BASE_DEV}`);
  await mant.query(`CREATE DATABASE "${BASE_DEV}"`);
}
await mant.end();

const origen = await conectar(BASE_PRODUCCION);
const destino = await conectar(BASE_DEV);
await origen.query('SET default_transaction_read_only = on');

const tablas = (await origen.query(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`)).rows.map(r => r.table_name);

for (const t of tablas) {
  const cols = (await origen.query(
    `SELECT column_name, data_type, udt_name, character_maximum_length, is_nullable, column_default
       FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`, [t])).rows;

  const defs = cols.map(c => {
    const serial = c.column_default?.startsWith('nextval(');
    let tipo = serial ? 'serial' : (c.data_type === 'USER-DEFINED' ? c.udt_name : c.data_type);
    if (tipo === 'character varying' && c.character_maximum_length) tipo = `varchar(${c.character_maximum_length})`;
    return `"${c.column_name}" ${tipo}${c.is_nullable === 'NO' && !serial ? ' NOT NULL' : ''}` +
           `${c.column_default && !serial ? ` DEFAULT ${c.column_default}` : ''}`;
  });
  const pk = (await origen.query(
    `SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conrelid = $1::regclass AND contype = 'p'`,
    [`public.${t}`])).rows[0]?.d;
  if (pk) defs.push(pk);

  await destino.query(`DROP TABLE IF EXISTS public."${t}" CASCADE`);
  await destino.query(`CREATE TABLE public."${t}" (${defs.join(', ')})`);

  const idx = (await origen.query(
    `SELECT indexdef FROM pg_indexes i WHERE schemaname = 'public' AND tablename = $1
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = i.indexname)`, [t])).rows;
  for (const { indexdef } of idx) await destino.query(indexdef);

  let copiadas = 0;
  for (let off = 0; ; off += LOTE) {
    const { rows } = await origen.query(
      `SELECT coalesce(json_agg(x), '[]') AS filas FROM (SELECT * FROM public."${t}" ORDER BY 1 OFFSET $1 LIMIT $2) x`,
      [off, LOTE]);
    const filas = rows[0].filas;
    if (!filas.length) break;
    await destino.query(
      `INSERT INTO public."${t}" SELECT * FROM json_populate_recordset(NULL::public."${t}", $1::json)`,
      [JSON.stringify(filas)]);
    copiadas += filas.length;
  }
  const serialCol = cols.find(c => c.column_default?.startsWith('nextval('));
  if (serialCol) {
    await destino.query(`SELECT setval(pg_get_serial_sequence('public."${t}"', '${serialCol.column_name}'),
                         coalesce((SELECT max("${serialCol.column_name}") FROM public."${t}"), 0) + 1, false)`);
  }
  const n = Number((await origen.query(`SELECT count(*) FROM public."${t}"`)).rows[0].count);
  log(`${t}: ${copiadas}/${n} filas ${copiadas === n ? '✔' : '✘ NO CUADRA'}`);
}

await origen.end();
await destino.end();
log('Clonado terminado.');
