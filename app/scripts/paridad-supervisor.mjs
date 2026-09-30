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
               export * from './src/supervisor/legado/reportes';
               export * from './src/supervisor/legado/dashboard';
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

// ── Reporte mensual (cargarReportes) y KPIs por período: totales de la empresa ──
const hoyRep = M.getLocalHoyStr();
const CAMPOS_REP = ['asistencias', 'faltas', 'diasVacaciones', 'diasJustificados', 'diasExtras', 'diasCampo', 'atrasos', 'minutosAtrasos',
  'permisoMedico', 'permisoPersonal', 'tiempoPorJustificar', 'tiempoADescontar', 'almPlanta', 'almFuera', 'horasExtra50', 'horasExtra100',
  'horasCampo50', 'horasCampo100', 'entradas', 'entradasAuto', 'salidas', 'salidasAuto'];
const vacVacio = {};
let perIguales = 0, colIguales = 0, colCasos = 0;
for (const p of periodos) {
  const sA = M.calcularStatsReportes(A.empCache, p.inicio, p.fin, hoyRep);
  const sB = M.calcularStatsReportes(B.empCache, p.inicio, p.fin, hoyRep);
  const dif = {};
  CAMPOS_REP.forEach(k => { const a = M.sumar(sA, k), b = M.sumar(sB, k); if (a !== b) dif[k] = [a, b]; });
  sA.forEach(x => {
    const y = sB.find(z => z.id === x.id);
    if (!y) return;
    colCasos++;
    if (CAMPOS_REP.every(k => x[k] === y[k])) colIguales++;
    else if (verDetalle) console.log('rep', p.label, x.id, JSON.stringify(Object.fromEntries(CAMPOS_REP.filter(k => x[k] !== y[k]).map(k => [k, [x[k], y[k]]]))));
  });
  const kA = M.calcularKpisDetallados(A.empCache, p, hoyRep, vacVacio);
  const kB = M.calcularKpisDetallados(B.empCache, p, hoyRep, vacVacio);
  ['totOrdinarias', 'totEsperadas', 'totVacaciones', 'totInasistencias', 'totExtras', 'promGlobalAsist'].forEach(k => { if (kA[k] !== kB[k]) dif['kpi.' + k] = [kA[k], kB[k]]; });
  if (!Object.keys(dif).length) perIguales++;
  console.log(`Reporte ${p.label}: ${Object.keys(dif).length ? 'difiere ' + JSON.stringify(dif) : 'totales idénticos'}`);
}
console.log(`Reporte mensual: períodos con totales idénticos ${perIguales}/${periodos.length}; filas colaborador-período idénticas ${colIguales}/${colCasos} (${(100 * colIguales / colCasos).toFixed(1)} %)`);

if (args.includes('--kpi-detalle')) {
  const p = periodos[Number(args[args.indexOf('--kpi-detalle') + 1]) || 2];
  const kA = M.calcularKpisDetallados(A.empCache, p, hoyRep, {}), kB = M.calcularKpisDetallados(B.empCache, p, hoyRep, {});
  let n = 0;
  for (const fa of kA.filas) {
    const fb2 = kB.filas.find(x => x.id === fa.id);
    if (!fb2 || (fa.ord === fb2.ord && fa.ext === fb2.ext)) continue;
    if (n++ > 3) break;
    console.log('KPI', fa.id, fa.nombre, 'A', fa.ord, fa.ext, 'B', fb2.ord, fb2.ext);
    const eA = A.empCache.find(x => x.id === fa.id), eB = B.empCache.find(x => x.id === fa.id);
    const fechasA = new Set(eA.registros.filter(r => r.fecha >= p.inicio && r.fecha <= p.fin && (r.justificado === 'SI' || r.tipo === 'ENTRADA')).map(r => r.fecha));
    const fechasB = new Set(eB.registros.filter(r => r.fecha >= p.inicio && r.fecha <= p.fin && (r.justificado === 'SI' || r.tipo === 'ENTRADA')).map(r => r.fecha));
    const solo = [...fechasA].filter(f => !fechasB.has(f)).slice(0, 2);
    solo.forEach(f => {
      console.log('  A', f, JSON.stringify(eA.registros.filter(r => r.fecha === f).map(r => ({ t: r.tipo, j: r.justificado, h: r.hora, ra: r.razon_ausencia }))));
      console.log('  B', f, JSON.stringify(eB.registros.filter(r => r.fecha === f).map(r => ({ t: r.tipo, j: r.justificado, h: r.hora, ra: r.razon_ausencia }))));
    });
  }
}

if (args.includes('--dif-dias')) {
  const id = args[args.indexOf('--dif-dias') + 1];
  const p = periodos[Number(args[args.indexOf('--dif-dias') + 2] ?? 1)];
  const eA = A.empCache.find(x => x.id === id), eB = B.empCache.find(x => x.id === id);
  const k = r => JSON.stringify(Object.fromEntries(Object.entries(r).filter(([x, v]) => !["id", "empleadoId", "fecha", "lat", "lng", "origen", "creado_por", "nombre", "dia", "estado_timestamp"].includes(x) && v !== "" && v !== 0 && v != null).sort()));
  for (let f = p.inicio; f <= p.fin; f = M.sumarDias(f, 1)) {
    const a = eA.registros.filter(r => r.fecha === f).map(k).sort().join(' ; ');
    const b = eB.registros.filter(r => r.fecha === f).map(k).sort().join(' ; ');
    const dA = M.calcularStatEmpleado(eA, f, f, hoyRep), dB = M.calcularStatEmpleado(eB, f, f, hoyRep);
    const cambia = CAMPOS_REP.filter(c => dA[c] !== dB[c]).map(c => `${c}:${dA[c]}/${dB[c]}`).join(' ');
    if (a !== b && (cambia || args.includes('--todo'))) console.log(f, cambia, '\n  A:', a, '\n  B:', b);
  }
}
