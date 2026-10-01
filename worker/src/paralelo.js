// Fase 7 — operación en paralelo. Copia nocturna de Firestore a la base nueva y reporte diario de diferencias:
// el motor de cálculo del legado (D-24, generado en src/generado/motor-legado.mjs) se aplica a lo que veía el legado
// (Firestore + copia del Express + hoja archivada) y a lo que ve la base nueva, para el día y el período en curso.
import * as M from './generado/motor-legado.mjs';

const CAMPOS = ['asistencias', 'faltas', 'diasVacaciones', 'diasJustificados', 'diasExtras', 'diasCampo', 'atrasos', 'minutosAtrasos',
  'permisoMedico', 'permisoPersonal', 'tiempoPorJustificar', 'tiempoADescontar', 'almPlanta', 'almFuera', 'horasExtra50', 'horasExtra100',
  'horasCampo50', 'horasCampo100', 'entradas', 'entradasAuto', 'salidas', 'salidasAuto'];
const ORDINARIAS = ['ENTRADA', 'SALIDA', 'ESTADO', 'SOLO_ALMUERZO', 'ENTRADA_CAMPO', 'SALIDA_CAMPO', 'RETORNO_CAMPO'];
const RAZON = { VACACIONES: 'Vacación', VACACION: 'Vacación', PERMISO_MEDICO: 'Permiso Médico', PERMISO_PERSONAL: 'Permiso Personal',
  CALAMIDAD_DOMESTICA: 'Calamidad Doméstica', TRABAJO_DE_CAMPO: 'Salida a Campo', SALIDA_A_CAMPO: 'Salida a Campo',
  FALTA_JUSTIFICADA: 'Falta Justificada', SALIDA_JUSTIFICADA: 'Salida Justificada' };
const horaDe = s => { const m = String(s || '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/); return m ? `${m[1].padStart(2, '0')}:${m[2]}:${(m[3] || '00')}` : ''; };
const horaTs = s => {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(s || ''))) return horaDe(s);
  return new Date(s).toLocaleTimeString('en-GB', { timeZone: 'America/Guayaquil', hour12: false });
};
const sumarDias = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export async function copiaLegado(sql, firestore) {
  const res = {};
  // Primero las fichas (altas del día), después las marcaciones
  for (const col of ['empleados', 'registros']) {
    const docs = await firestore.listar(col);
    res[col] = await sql('SELECT private.worker_copia_legado($1, $2, true) v', [col, JSON.stringify(docs)]);
  }
  return res;
}

// Registro del legado tal como lo armaba obtenerDatosSupervisor (normR + normalizarRegistroDesdeTimestamp)
function normLegado(x) {
  const r = { ...x };
  r.hora = horaDe(r.hora);
  const t = String(r.tipo || '').toUpperCase().trim();
  r.tipo = t;
  if (!ORDINARIAS.includes(t)) {
    if (!r.hora) r.hora = '00:00:00';
    if (!r.razon_ausencia) r.razon_ausencia = RAZON[t] || r.tipo;
    if (!r.justificado) r.justificado = 'SI';
  }
  if ((!r.hora || r.hora === '00:00:00') && r.timestamp) { const h = horaTs(r.timestamp); if (h) r.hora = h; }
  delete r.timestamp;
  ['permiso_personal_mins', 'permiso_medico_mins', 'tiempo_justificado_mins'].forEach(k => { r[k] = Number(r[k] || 0); });
  return r;
}

function vistaLegado(d) {
  const fb = [...d.express, ...d.firestore].map(normLegado);
  const fbDias = new Set(fb.map(r => `${r.empleadoId}|${r.fecha}`));
  const hoja = d.hoja.filter(x => !fbDias.has(`${x.empleado_id}|${x.fecha}`)).map((x, i) => ({
    id: `arch_${x.empleado_id}_${x.fecha}_${i}`, empleadoId: x.empleado_id, fecha: x.fecha, tipo: String(x.r.tipo || '').toUpperCase(),
    hora: horaDe(x.r.hora), almuerzo: x.r.almuerzo || '', modo: x.r.modo || 'OFICINA',
    razon_salida: x.r.razon_salida || x.r.razon_salida_temprana || '', quien_justifica: x.r.quien_justifica || '',
    razon_entrada_tardia: x.r.razon_entrada_tardia || '', tipo_salida: x.r.tipo_salida || '', razon_permiso: x.r.razon_permiso || '',
    horasExtra: x.r.horas_extra || '', autoriza: x.r.autoriza || '', justificado: x.r.justificado || '',
    razon_justificac: x.r.razon_justificac || '', permiso_personal_mins: Number(x.r.permiso_personal_mins || 0),
    permiso_medico_mins: Number(x.r.permiso_medico_mins || 0), tiempo_justificado_mins: Number(x.r.tiempo_justificado_mins || 0),
  }));
  const regs = [...fb, ...hoja].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora)
    || String(a.tipo).localeCompare(String(b.tipo)) || String(a.id).localeCompare(String(b.id)));
  const A = M.armarEmpleados(d.fichas, regs);
  d.vacHoja.forEach(v => {
    const e = A.empCache.find(x => x.id === v.empleado_id);
    if (e && !e.registros.some(r => r.fecha === v.fecha && (r.tipo === 'VACACIONES' || r.tipo === 'VACACION'))) {
      e.registros.push({ id: v.empleado_id, fecha: v.fecha, tipo: 'VACACIONES', razon_ausencia: 'Vacación', justificado: 'SI' });
    }
  });
  return A;
}

const resumenDia = (e, f) => e.registros.filter(r => r.fecha === f)
  .map(r => `${r.tipo}${r.hora && r.hora !== '00:00:00' ? ' ' + r.hora.slice(0, 5) : ''}${r.dispositivo === 'AUTO_COMPLETAR' ? ' (auto)' : ''}`).sort();

// Causa probable de una diferencia del día
function causa(eA, eB, f, diasHoja) {
  const sinAuto = e => resumenDia(e, f).filter(x => !x.endsWith('(auto)')).join();
  const rA = eA.registros.filter(r => r.fecha === f), rB = eB.registros.filter(r => r.fecha === f);
  const autoB = rB.some(r => r.tipo === 'SALIDA' && r.dispositivo === 'AUTO_COMPLETAR') && !rA.some(r => r.tipo === 'SALIDA');
  if (autoB && sinAuto(eA) === sinAuto(eB)) {
    return { codigo: 'AUTOCOMPLETAR', explicacion: 'Salida autocompletada por la base nueva; el legado no la muestra cuando el día tiene registros en Firestore' };
  }
  if (sinAuto(eA) !== sinAuto(eB)) {
    if (diasHoja.has(`${eA.id}|${f}`)) {
      return { codigo: 'HOJA', explicacion: 'Marcaciones que solo están en la hoja REGISTROS; el legado las ocultaba porque ese día había otro registro en Firestore' };
    }
    return { codigo: 'COPIA', explicacion: 'Los registros del día no coinciden entre el legado y la base nueva' };
  }
  return { codigo: 'CALCULO', explicacion: 'Mismos registros, distinto resultado: revisar regla' };
}

export async function reporteParalelo(sql, fecha) {
  const hoy = M.getLocalHoyStr();
  const periodo = M.generarPeriodos(fecha).find(p => p.inicio <= fecha && fecha <= p.fin) || { inicio: fecha, fin: fecha, label: fecha };
  const d = await sql('SELECT private.worker_paralelo_datos($1, $2) v', [periodo.inicio, fecha]);
  M.fijarFeriados(d.feriados);
  const A = vistaLegado(d);
  const B = M.armarEmpleados(d.fichas, d.nuevo);
  const diasHoja = new Set(d.hoja.map(x => `${x.empleado_id}|${x.fecha}`));

  // Día
  const diferencias = [];
  let comparados = 0, iguales = 0;
  const porIndicador = {}, porCausa = {};
  for (const eA of A.empCache) {
    const eB = B.empCache.find(x => x.id === eA.id);
    if (!eB) continue;
    comparados++;
    const sA = M.calcularStatEmpleado(eA, fecha, fecha, hoy), sB = M.calcularStatEmpleado(eB, fecha, fecha, hoy);
    const dif = Object.fromEntries(CAMPOS.filter(k => sA[k] !== sB[k]).map(k => [k, [sA[k], sB[k]]]));
    if (!Object.keys(dif).length) { iguales++; continue; }
    const c = causa(eA, eB, fecha, diasHoja);
    Object.keys(dif).forEach(k => { porIndicador[k] = (porIndicador[k] || 0) + 1; });
    porCausa[c.codigo] = (porCausa[c.codigo] || 0) + 1;
    diferencias.push({ id: eA.id, nombre: eA.nombre, area: eA.area, causa: c.codigo, explicacion: c.explicacion, indicadores: dif,
                       legado: resumenDia(eA, fecha), nuevo: resumenDia(eB, fecha) });
  }

  // Período en curso hasta la fecha
  const pA = M.calcularStatsReportes(A.empCache, periodo.inicio, fecha, hoy);
  const pB = M.calcularStatsReportes(B.empCache, periodo.inicio, fecha, hoy);
  const totales = Object.fromEntries(CAMPOS.map(k => [k, [M.sumar(pA, k), M.sumar(pB, k)]]).filter(([, v]) => v[0] !== v[1]));
  const filasIguales = pA.filter(x => { const y = pB.find(z => z.id === x.id); return y && CAMPOS.every(k => x[k] === y[k]); }).length;

  const resumen = {
    dia: { fecha, comparados, iguales, conDiferencias: diferencias.length,
           sinExplicar: diferencias.filter(x => !['AUTOCOMPLETAR', 'HOJA'].includes(x.causa)).length, porIndicador, porCausa },
    periodo: { label: periodo.label, inicio: periodo.inicio, hasta: fecha, colaboradores: pA.length, filasIguales, totalesDistintos: totales },
  };
  await sql('SELECT private.worker_paralelo_guardar($1, $2, $3)', [fecha, JSON.stringify(resumen), JSON.stringify(diferencias)]);
  return resumen;
}

export const diaAnterior = f => sumarDias(f, -1);
