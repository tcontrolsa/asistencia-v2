// Ejecuta db/tests/*.sql y db/tests/*.test.js; cada archivo dentro de BEGIN … ROLLBACK.
// Uso: node db/scripts/test.js [--db nombre]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RAIZ, baseDestino, conectar } from './lib.js';

const dir = path.join(RAIZ, 'db', 'tests');
const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.sql') || f.endsWith('.test.js')).sort();
const c = await conectar(baseDestino());
let ok = 0, fallas = 0;

const t = {
  ok(cond, nombre) {
    if (cond) { ok++; console.log(`  ok - ${nombre}`); }
    else { fallas++; console.log(`  FALLA - ${nombre}`); }
  },
};

for (const f of archivos) {
  console.log(`# ${f}`);
  await c.query('BEGIN');
  try {
    if (f.endsWith('.sql')) {
      const avisos = [];
      const h = m => avisos.push(m.message);
      c.on('notice', h);
      try {
        await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
      } catch (e) {
        fallas++;
        avisos.push(e.message);
      } finally {
        c.off('notice', h);
      }
      for (const a of avisos) {
        if (a.startsWith('ok - ')) { ok++; console.log(`  ${a}`); }
        else console.log(`  ${a.startsWith('FALLA') ? a : `FALLA - ${a}`}`);
      }
    } else {
      const mod = await import(pathToFileURL(path.join(dir, f)).href);
      await mod.default(c, t);
    }
  } catch (e) {
    fallas++;
    console.log(`  FALLA - error inesperado: ${e.message}`);
  } finally {
    await c.query('ROLLBACK');
  }
}

await c.end();
console.log(`\n${ok} correctas, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
