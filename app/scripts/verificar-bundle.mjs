// §7: ningún secreto en el bundle del frontend. Busca en dist/ los valores sensibles del .env
// (sin imprimirlos) y patrones de llaves conocidas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = fs.existsSync(path.join(raiz, '..', '.env')) ? fs.readFileSync(path.join(raiz, '..', '.env'), 'utf8') : '';
const sensibles = [...env.matchAll(/^(PGPASSWORD|PGRST_JWT_SECRET|PGRST_AUTHENTICATOR_PASSWORD|DATABASE_URL|PGRST_DB_URI)=(.+)$/gm)]
  .map(m => ({ clave: m[1], valor: m[2].trim() })).filter(x => x.valor.length >= 8);
const patrones = [/owa_k1_[A-Za-z0-9]+/, /AIza[0-9A-Za-z_-]{20,}/, /TCONTROL_SECURE_2026/, /script\.google\.com\/macros/, /postgres(ql)?:\/\//];

const archivos = [];
const recorrer = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) recorrer(p); else if (/\.(js|html|css|json|webmanifest|map)$/.test(e.name)) archivos.push(p);
});
recorrer(path.join(raiz, 'dist'));

let hallazgos = 0;
for (const f of archivos) {
  const t = fs.readFileSync(f, 'utf8');
  for (const s of sensibles) if (t.includes(s.valor)) { hallazgos++; console.log(`✘ ${path.relative(raiz, f)} contiene el valor de ${s.clave}`); }
  for (const p of patrones) if (p.test(t)) { hallazgos++; console.log(`✘ ${path.relative(raiz, f)} coincide con ${p}`); }
}
console.log(`${archivos.length} archivos revisados, ${sensibles.length} secretos comparados: ${hallazgos ? hallazgos + ' hallazgo(s)' : 'ninguno en el bundle ✔'}`);
process.exit(hallazgos ? 1 : 0);
