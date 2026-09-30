// Paridad de números del panel de supervisor (Fase 5).
// Aplica el motor de cálculo portado del legado (src/supervisor/legado/*.ts) a:
//   A) los registros tal como los veía el legado (public.registros = copia de Firestore, filas de la hoja
//      REGISTROS y vacaciones de la hoja VACACIONES), armados como obtenerDatosSupervisor;
//   B) los registros que entrega la base nueva (api.sup_registros).
// y compara, por colaborador y período, horas, atrasos, tiempo por justificar, descuento, extras y
// fechas por regularizar. Solo lee la base de desarrollo.
// Uso: node app/scripts/paridad-supervisor.mjs [--periodos N] [--detalle]
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..', '..');
const args = process.argv.slice(2);
const nPeriodos = Number(args[args.indexOf('--periodos') + 1]) || 6;
const verDetalle = args.includes('--detalle');

const salida = path.join(aqui, '.paridad-motor.mjs');
await build({
  stdin: {
    contents: `export * from './src/supervisor/legado/util';
               export * from './src/supervisor/legado/asistencia';
               export * from './src/supervisor/legado/detalle';
               export { armarEmpleados } from './src/supervisor/store';`,
    resolveDir: path.join(raiz, 'app'), loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: salida, logLevel: 'error',
  define: { 'import.meta.env.VITE_POSTGREST_URL': 'undefined' },
});
const M = await import(pathToFileURL(salida).href + '?t=' + Date.now());
const { BASE_DEV, conectar } = await import(pathToFileURL(path.join(raiz, 'db', 'scripts', 'lib.js')).href);

const c = await conectar(BASE_DEV);
const feriados = (await c.query(`SELECT to_char(fecha, 'YYYY-MM-DD') f FROM core.feriados`)).rows.map(r => r.f);
M.fijarFeriados(feriados);

// ── A) Vista del legado ──
const horaDe = s => { const m = String(s || '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/); return m ? `${m[1].padStart(2, '0')}:${m[2]}:${(m[3] || '00')}` : ''; };
const RAZON = { VACACIONES: 'Vacación', VACACION: 'Vacación', PERMISO_MEDICO: 'Permiso Médico', PERMISO_PERSONAL: 'Permiso Personal',
  CALAMIDAD_DOMESTICA: 'Calamidad Doméstica', TRABAJO_DE_CAMPO: 'Salida a Campo', SALIDA_A_CAMPO: 'Salida a Campo',
  FALTA_JUSTIFICADA: 'Falta Justificada', SALIDA_JUSTIFICADA: 'Salida Justificada' };
const ORDINARIAS = ['ENTRADA', 'SALIDA', 'ESTADO', 'SOLO_ALMUERZO', 'ENTRADA_CAMPO', 'SALIDA_CAMPO', 'RETORNO_CAMPO'];
const fb = (await c.query(`SELECT id, empleado_id, to_char(fecha, 'YYYY-MM-DD') fecha, raw_data FROM public.registros
                           WHERE empleado_id ~ '^[0-9A-Za-z_-]+$'`)).rows.map(x => {
  const r = { ...x.raw_data, id: x.id, empleadoId: x.empleado_id, fecha: x.fecha };
  r.hora = horaDe(r.hora);
  const t = String(r.tipo || '').toUpperCase().trim();
  r.tipo = t;
  if (!ORDINARIAS.includes(t)) {
    if (!r.hora) r.hora = '00:00:00';
    if (!r.razon_ausencia) r.razon_ausencia = RAZON[t] || r.tipo;
    if (!r.justificado) r.justificado = 'SI';
  }
  // normalizarRegistroDesdeTimestamp: una hora 00:00:00 se reemplaza por la del timestamp
  if ((!r.hora || r.hora === '00:00:00') && r.timestamp) { const h = horaDe(r.timestamp); if (h) r.hora = h; }
  delete r.timestamp;
  ['permiso_personal_mins', 'permiso_medico_mins', 'tiempo_justificado_mins'].forEach(k => { r[k] = Number(r[k] || 0); });
  return r;
});
const fbDias = new Set(fb.map(r => `${r.empleadoId}|${r.fecha}`));
// Filas de la hoja REGISTROS (archivadas) que no estaban en Firestore para ese colaborador y día (normR)
const hoja = (await c.query(`SELECT empleado_id, to_char(fecha, 'YYYY-MM-DD') fecha, legacy_raw r FROM core.marcaciones
                             WHERE legacy_raw ? 'fuente' UNION ALL
                             SELECT empleado_id, to_char(fecha, 'YYYY-MM-DD'), legacy_raw FROM core.novedades WHERE legacy_raw ? 'fuente'`)).rows
  .filter(x => !fbDias.has(`${x.empleado_id}|${x.fecha}`))
  .map((x, i) => ({
    id: `arch_${x.empleado_id}_${x.fecha}_${i}`, empleadoId: x.empleado_id, fecha: x.fecha, tipo: String(x.r.tipo || '').toUpperCase(),
    hora: horaDe(x.r.hora), almuerzo: x.r.almuerzo || '', modo: x.r.modo || 'OFICINA',
    razon_salida: x.r.razon_salida || x.r.razon_salida_temprana || '', quien_justifica: x.r.quien_justifica || '',
    razon_entrada_tardia: x.r.razon_entrada_tardia || '', tipo_salida: x.r.tipo_salida || '', razon_permiso: x.r.razon_permiso || '',
    horasExtra: x.r.horas_extra || '', autoriza: x.r.autoriza || '', justificado: x.r.justificado || '',
    razon_justificac: x.r.razon_justificac || '', permiso_personal_mins: Number(x.r.permiso_personal_mins || 0),
    permiso_medico_mins: Number(x.r.permiso_medico_mins || 0), tiempo_justificado_mins: Number(x.r.tiempo_justificado_mins || 0),
  }));
// Vacaciones de la hoja VACACIONES (se inyectaban si no había ya un registro VACACIONES ese día)
const vacHoja = (await c.query(`SELECT empleado_id, to_char(fecha, 'YYYY-MM-DD') fecha FROM core.novedades
                                WHERE tipo = 'VACACIONES' AND legacy_raw IS NULL AND legacy_id IS NOT NULL`)).rows;

const fichas = (await c.query(`SELECT private.empleado_legado(e) f FROM core.empleados e`)).rows.map(r => r.f);
const regsA = [...fb, ...hoja].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora) || String(a.tipo).localeCompare(String(b.tipo)) || String(a.id).localeCompare(String(b.id)));
const A = M.armarEmpleados(fichas, regsA.map(r => ({ ...r })));
vacHoja.forEach(v => {
  const e = A.empCache.find(x => x.id === v.empleado_id);
  if (e && !e.registros.some(r => r.fecha === v.fecha && (r.tipo === 'VACACIONES' || r.tipo === 'VACACION'))) {
    e.registros.push({ id: v.empleado_id, fecha: v.fecha, tipo: 'VACACIONES', razon_ausencia: 'Vacación', justificado: 'SI' });
  }
});

// ── B) Base nueva ──
await c.query('BEGIN');
await c.query(`SELECT set_config('request.jwt.claims', '{"role":"supervisor","usuario":"PARIDAD"}', true)`);
await c.query('SET LOCAL ROLE supervisor');
const regsB = (await c.query(`SELECT api.sup_registros('2026-01-01', (private.hoy() + 400)) r`)).rows[0].r;
await c.query('ROLLBACK');
await c.end();
const B = M.armarEmpleados(fichas, regsB);

// ── Comparación ──
const periodos = M.generarPeriodos().slice(0, nPeriodos);
const CAMPOS = ['horas', 'atrasos', 'tJustificado', 'tp', 'tm', 'tj', 'descuentoNeto', 'extra50', 'extra100'];
let casos = 0, iguales = 0;
const difs = [];
const porCampo = Object.fromEntries([...CAMPOS, 'regularizar', 'dias', 'tardanzas', 'almuerzos'].map(k => [k, 0]));
for (const eA of A.empCache) {
  const eB = B.empCache.find(x => x.id === eA.id);
  if (!eB) continue;
  for (const p of periodos) {
    const rA = eA.registros.filter(r => r.fecha >= p.inicio && r.fecha <= p.fin);
    const rB = eB.registros.filter(r => r.fecha >= p.inicio && r.fecha <= p.fin);
    const dA = M.calcularDetalle(eA, rA, [], p.inicio, p.fin);
    const dB = M.calcularDetalle(eB, rB, [], p.inicio, p.fin);
    const sA = M.resumenDetalle(eA, rA, p.inicio, p.fin);
    const sB = M.resumenDetalle(eB, rB, p.inicio, p.fin);
    const pendA = M.obtenerFechasPendientesRegularizarEmpleado(eA, p.inicio, p.fin).map(x => `${x.fecha}:${x.motivo}`).join(',');
    const pendB = M.obtenerFechasPendientesRegularizarEmpleado(eB, p.inicio, p.fin).map(x => `${x.fecha}:${x.motivo}`).join(',');
    casos++;
    const d = {};
    CAMPOS.forEach(k => { if (dA.tot[k] !== dB.tot[k]) d[k] = [dA.tot[k], dB.tot[k]]; });
    if (pendA !== pendB) d.regularizar = [pendA, pendB];
    if (sA.dias !== sB.dias) d.dias = [sA.dias, sB.dias];
    if (sA.tardT !== sB.tardT) d.tardanzas = [sA.tardT, sB.tardT];
    if (sA.almP !== sB.almP || sA.almF !== sB.almF) d.almuerzos = [`${sA.almP}/${sA.almF}`, `${sB.almP}/${sB.almF}`];
    if (Object.keys(d).length === 0) iguales++;
    else { Object.keys(d).forEach(k => porCampo[k]++); difs.push({ id: eA.id, nombre: eA.nombre, periodo: p.label, d }); }
  }
}
console.log(`Colaboradores activos: ${A.empCache.length}; períodos: ${periodos.length}; casos: ${casos}`);
console.log(`Iguales: ${iguales} (${(100 * iguales / casos).toFixed(1)} %); con diferencias: ${difs.length}`);
console.log('Diferencias por indicador:', porCampo);
if (verDetalle) difs.slice(0, 40).forEach(x => console.log(JSON.stringify(x)));
