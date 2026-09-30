// Desgloses del Dashboard portados 1:1 de JS/supervisor_core.js: histórico base de asistencia y diferencias
// (procesarYRenderizarHistoricoBase) y auditoría de vacaciones (renderizarTablaDesgloseVacaciones).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { VacInfo } from './dashboard';
import {
  Emp, PeriodoPago, esEmpleadoExcluidoAsistencia, esEmpleadoSoloAlmuerzo, normalizarFechaStr, obtenerDiasHabiles,
  obtenerFechaInicioEfectivaEmpleado, sumarDias,
} from './util';

const esActivo = (e: any) => e.estado === 'ACTIVO' || e.activo === 'SI' || e.activo === true || String(e.activo || '').toUpperCase() === 'SI';

export const esOpcionAnual = (v: string) => v === 'ANUAL' || v.startsWith('ANIO_') || v === 'ULTIMOS_365' || v === 'HISTORICO_BASE';

export interface FilaHistorico {
  id: string; nombre: string; cargo: string; area: string; evalIni: string; evalFin: string; rangoTexto: string; inicioEmp: string;
  esperadas: number; ordinarias: number; vacaciones: number; diferencia: number; fechasDiferencia: string[]; diasJustificados: number;
  extras: number; pct: number;
}

function esRegistroAsistenciaBase(r: any): boolean {
  if (!r) return false;
  const t = (r.tipo || '').toUpperCase();
  if (t === 'VACACIONES' || t === 'VACACION') return false;
  const razon = String(r.razon_ausencia || r.razon_justificac || '').toUpperCase();
  if (razon.includes('VACACI')) return false;
  if (['ENTRADA', 'CAMPO', 'ENTRADA_CAMPO', 'RETORNO_CAMPO', 'SALIDA'].includes(t)) return true;
  if (String(r.justificado || '').toUpperCase() === 'SI') return true;
  return !!(r.hora && String(r.hora).trim().length >= 4);
}

const ddmm = (f: string) => (f && f.length >= 10 ? `${f.substring(8, 10)}/${f.substring(5, 7)}` : f);
const ddmmaaaa = (f: string) => (f && f.length >= 10 ? `${f.substring(8, 10)}/${f.substring(5, 7)}/${f.substring(0, 4)}` : f);

// Primer día que debe estar cargado para calcular una opción del selector (el legado tenía el histórico en memoria)
export function inicioDatosHistorico(opcion: string, periodos: PeriodoPago[], idxDash: number, hoy_: string): string {
  const anio = hoy_.slice(0, 4);
  if (opcion === 'ANUAL') return `${anio}-01-01`;
  if (opcion.startsWith('ANIO_')) return `${opcion.replace('ANIO_', '')}-01-01`;
  if (opcion === 'ULTIMOS_365') return sumarDias(hoy_, -365);
  if (opcion === 'ULTIMOS_60') return sumarDias(hoy_, -60);
  if (opcion === 'HISTORICO_BASE') return sumarDias(hoy_, -799);
  if (opcion.startsWith('PER_')) return (periodos[parseInt(opcion.replace('PER_', ''), 10)] || periodos[0])?.inicio || hoy_;
  return (periodos[idxDash] || periodos[0])?.inicio || hoy_;
}

export function calcularHistoricoBase(empCache: Emp[], opcion: string, periodos: PeriodoPago[], idxDash: number, hoy_: string, vacIndiv: Record<string, VacInfo>) {
  const finAuditoriaMax = sumarDias(hoy_, -1);
  const anioActual = parseInt(hoy_.slice(0, 4), 10);
  const empAsistencia = empCache.filter(e => esActivo(e) && !esEmpleadoSoloAlmuerzo(e) && !esEmpleadoExcluidoAsistencia(e) && e.tipoRegistro !== 'MASTER');

  let minFechaGlobalBase = '';
  const minFechaAnioBase: Record<string, string> = {};
  empAsistencia.forEach(e => (e.registros || []).forEach(r => {
    const f = normalizarFechaStr(r.fecha);
    if (!f || f > finAuditoriaMax || !esRegistroAsistenciaBase(r)) return;
    if (!minFechaGlobalBase || f < minFechaGlobalBase) minFechaGlobalBase = f;
    const y = f.substring(0, 4);
    if (!minFechaAnioBase[y] || f < minFechaAnioBase[y]) minFechaAnioBase[y] = f;
  }));

  let rangoIni = '';
  let rangoFin = finAuditoriaMax;
  let periodoLabel = 'Período';
  const conPeriodo = (p: PeriodoPago | undefined) => {
    if (!p) return;
    rangoIni = p.inicio;
    rangoFin = p.fin < finAuditoriaMax ? p.fin : finAuditoriaMax;
    periodoLabel = p.label;
  };
  if (opcion === 'DASHBOARD' || !opcion) conPeriodo(periodos[idxDash] || periodos[0]);
  else if (opcion.startsWith('PER_')) conPeriodo(periodos[parseInt(opcion.replace('PER_', ''), 10)]);
  else if (opcion === 'ANUAL') {
    const primer = minFechaAnioBase[String(anioActual)] || minFechaGlobalBase;
    rangoIni = (primer && primer > `${anioActual}-01-01`) ? primer : (primer || `${anioActual}-01-01`);
    const finAnio = `${anioActual}-12-31`;
    rangoFin = finAnio < finAuditoriaMax ? finAnio : finAuditoriaMax;
    periodoLabel = `Consolidado Anual ${anioActual}`;
  } else if (opcion.startsWith('ANIO_')) {
    const y = parseInt(opcion.replace('ANIO_', ''), 10);
    if (!isNaN(y)) {
      const primer = minFechaAnioBase[String(y)];
      rangoIni = (primer && primer > `${y}-01-01`) ? primer : (primer || `${y}-01-01`);
      const finY = `${y}-12-31`;
      rangoFin = finY < finAuditoriaMax ? finY : finAuditoriaMax;
      periodoLabel = `Año ${y} Completo`;
    }
  } else if (opcion === 'ULTIMOS_365') {
    const f365 = sumarDias(hoy_, -365);
    rangoIni = (minFechaGlobalBase && minFechaGlobalBase > f365) ? minFechaGlobalBase : f365;
    periodoLabel = 'Últimos 12 Meses (Año Móvil)';
  } else if (opcion === 'ULTIMOS_60') {
    rangoIni = sumarDias(hoy_, -60);
    periodoLabel = 'Últimos 60 Días';
  } else if (opcion === 'HISTORICO_BASE') {
    rangoIni = minFechaGlobalBase || finAuditoriaMax;
    periodoLabel = 'Histórico Completo';
  }

  const subtitulo = `Auditoría: ${periodoLabel} (${rangoIni ? ddmmaaaa(rangoIni) : 'Inicio'} al ${ddmmaaaa(rangoFin)}) — Asistencias Ordinarias + Vacaciones vs. Esperadas (Excluye jornada en curso)`;
  const diasHabilesFijo = rangoIni ? obtenerDiasHabiles(rangoIni, rangoFin) : [];
  const esVistaConsolidada = esOpcionAnual(opcion);
  let totalOrdinarias = 0, totalEsperadas = 0, totalVacaciones = 0, totalExtras = 0, totalDiferencias = 0;
  const filas: FilaHistorico[] = empAsistencia.map(e => {
    const regsEmp = e.registros || [];
    let primerRegistroEmpValido = '';
    regsEmp.forEach(r => {
      const f = normalizarFechaStr(r.fecha);
      if (!f || f > hoy_ || !esRegistroAsistenciaBase(r)) return;
      if (!primerRegistroEmpValido || f < primerRegistroEmpValido) primerRegistroEmpValido = f;
    });
    const inicioColaborador = obtenerFechaInicioEfectivaEmpleado(e, rangoIni);
    const evalIni = (inicioColaborador && rangoIni && inicioColaborador > rangoIni) ? inicioColaborador : (rangoIni || finAuditoriaMax);
    const evalFin = rangoFin <= finAuditoriaMax ? rangoFin : finAuditoriaMax;
    const diasHabEmp = evalIni <= evalFin ? (rangoIni && evalIni === rangoIni ? diasHabilesFijo : obtenerDiasHabiles(evalIni, evalFin)) : [];
    const esperadas = diasHabEmp.length;
    const dOrd = new Set<string>(), dVac = new Set<string>(), dJus = new Set<string>(), dExt = new Set<string>();
    regsEmp.forEach(r => {
      const f = normalizarFechaStr(r.fecha);
      if (!f || f < evalIni || f > evalFin) return;
      const t = (r.tipo || '').toUpperCase();
      const just = String(r.justificado || '').toUpperCase();
      const razon = String(r.razon_ausencia || r.razon_justificac || '').toUpperCase();
      const esHab = diasHabEmp.includes(f);
      const esPermiso = t === 'PERMISO_MEDICO' || t.includes('MEDIC') || t === 'CALAMIDAD_DOMESTICA' || t.includes('CALAMIDAD') || t === 'PERMISO_PERSONAL'
        || t === 'PERMISO' || t === 'FALTA_JUSTIFICADA' || t.includes('JUSTIFICAD') || t === 'CUMPLEANOS' || t.includes('LICENCIA') || just === 'SI'
        || razon.includes('MEDIC') || razon.includes('CALAMIDAD') || razon.includes('PERMISO') || razon.includes('JUSTIFIC');
      const esVacacion = t === 'VACACIONES' || t === 'VACACION' || razon.includes('VACACI');
      if (esVacacion) { if (esHab) dVac.add(f); }
      else if (esPermiso) { if (esHab) dJus.add(f); }
      else if (['ENTRADA', 'CAMPO', 'ENTRADA_CAMPO', 'TRABAJO_DE_CAMPO', 'RETORNO_CAMPO', 'SALIDA'].includes(t) || (r.hora && String(r.hora).trim().length >= 4)) {
        if (esHab) dOrd.add(f); else dExt.add(f);
      }
    });
    const fechasDiferencia = diasHabEmp.filter(d => d <= evalFin && !dOrd.has(d) && !dVac.has(d) && !dJus.has(d));
    const vInfo = vacIndiv[e.id] || (e.cedula && vacIndiv[e.cedula]) || null;
    const tomadasOficial = vInfo && vInfo.tomadas != null && !isNaN(Number(vInfo.tomadas)) ? Number(vInfo.tomadas) : null;
    const vacaciones = esVistaConsolidada && tomadasOficial !== null ? tomadasOficial : dVac.size;
    const vacsSinFechaMarcada = Math.max(0, vacaciones - dVac.size);
    const diferencia = Math.max(0, fechasDiferencia.length - vacsSinFechaMarcada);
    let pct = esperadas > 0 ? ((esperadas - diferencia) / esperadas) * 100 : 100;
    pct = Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
    totalOrdinarias += dOrd.size; totalEsperadas += esperadas; totalVacaciones += vacaciones; totalExtras += dExt.size; totalDiferencias += diferencia;
    return {
      id: e.id, nombre: e.nombre || 'Desconocido', cargo: e.cargo || e.area || 'Sin cargo', area: e.area || e.departamento || '',
      evalIni, evalFin, rangoTexto: evalIni === evalFin ? ddmm(evalIni) : `${ddmm(evalIni) || '--'} — ${ddmm(evalFin) || '--'}`,
      inicioEmp: primerRegistroEmpValido || evalIni, esperadas, ordinarias: dOrd.size, vacaciones, diferencia, fechasDiferencia,
      diasJustificados: dJus.size, extras: dExt.size, pct,
    };
  });
  filas.sort((a, b) => b.diferencia - a.diferencia || a.pct - b.pct);
  const promedioGral = totalEsperadas > 0 ? Math.max(0, ((totalEsperadas - totalDiferencias) / totalEsperadas) * 100).toFixed(1) : '100.0';

  const anios = new Set<number>([anioActual, anioActual - 1]);
  empCache.forEach(e => {
    (e.registros || []).forEach(r => { const y = parseInt((r.fecha || '').slice(0, 4), 10); if (y >= 2020 && y <= anioActual + 1) anios.add(y); });
    if (e.fecha_ingreso) { const y = parseInt(String(e.fecha_ingreso).slice(0, 4), 10); if (y >= 2020 && y <= anioActual + 1) anios.add(y); }
  });
  return {
    filas, subtitulo, totalOrdinarias, totalEsperadas, totalVacaciones, totalExtras, totalDiferencias, promedioGral,
    anios: Array.from(anios).sort((a, b) => b - a), anioActual,
  };
}

export interface FilaVac { id: string; nombre: string; cargo: string; area: string; adjudicadas: number; tomadas: number; restantes: number; pct: number; tieneDatosVac: boolean }

export function calcularDesgloseVacaciones(empCache: Emp[], vacIndiv: Record<string, VacInfo>) {
  const emps = empCache.filter(e => esActivo(e) && !esEmpleadoExcluidoAsistencia(e));
  let totalAdjudicadas = 0, totalTomadas = 0, totalRestantes = 0, sumaKpis = 0, colabsConVac = 0;
  const filas: FilaVac[] = emps.map(e => {
    const v = vacIndiv[String(e.id).trim()] || (e.cedula && vacIndiv[String(e.cedula).trim()]) || { adjudicadas: 0, tomadas: 0, restantes: 0 };
    const adj = Number(v.adjudicadas) || 0, tom = Number(v.tomadas) || 0, res = Number(v.restantes) || 0;
    let pct = 0;
    if (adj > 0) { pct = Math.min(100, (tom / adj) * 100); sumaKpis += pct; colabsConVac++; }
    else if (tom > 0) { pct = 100; sumaKpis += 100; colabsConVac++; }
    totalAdjudicadas += adj; totalTomadas += tom; totalRestantes += res;
    return { id: e.id, nombre: e.nombre || 'Desconocido', cargo: e.cargo || e.area || 'Sin cargo', area: e.area || e.departamento || '',
      adjudicadas: adj, tomadas: tom, restantes: res, pct, tieneDatosVac: adj > 0 || tom > 0 || res !== 0 };
  });
  filas.sort((a, b) => {
    if (a.tieneDatosVac !== b.tieneDatosVac) return a.tieneDatosVac ? -1 : 1;
    if (a.pct !== b.pct) return a.pct - b.pct;
    return b.restantes - a.restantes;
  });
  const tasaGlobal = totalAdjudicadas > 0 ? ((totalTomadas / totalAdjudicadas) * 100).toFixed(1) : '100.0';
  const promedioIndiv = colabsConVac > 0 ? (sumaKpis / colabsConVac).toFixed(1) : tasaGlobal;
  return { filas, totalAdjudicadas, totalTomadas, totalRestantes, tasaGlobal, promedioIndiv };
}
