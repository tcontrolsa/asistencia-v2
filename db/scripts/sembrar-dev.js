// Carga db/seeds/*.sql en la base de desarrollo (nunca en producción).
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, BASE_DEV, conectar, log } from './lib.js';

const dir = path.join(RAIZ, 'db', 'seeds');
const c = await conectar(BASE_DEV);
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.sql')).sort()) {
  await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
  log(`✔ ${f}`);
}
await c.end();
