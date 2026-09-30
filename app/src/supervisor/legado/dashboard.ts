// Dashboard portado 1:1 de cargarDashboard y renderDetailedKPIs (JS/supervisor_core.js). Las tarjetas y
// rankings usan el período actual (periodos[0]) como el legado; el detalle de KPIs usa el período elegido.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { partes } from '../../lib/reloj';
import {
  Emp, HORA_ENTRADA_REF, PeriodoPago, calcularAlmuerzosPeriodo, calcularPct, diaSemana, esEmpleadoExcluidoAsistencia,
  esEmpleadoPasante, esEmpleadoSoloAlmuerzo, esFeriadoODomingo, normalizarFechaStr, obtenerAlmuerzosExtraConsolidados, obtenerDiasHabiles,
  obtenerFechaInicioEfectivaEmpleado, obtenerMinutos,
} from './util';

export interface VacInfo { adjudicadas: number; tomadas: number; restantes: number }

const esActivo = (e: any) => e.estado === 'ACTIVO' || e.activo === 'SI' || e.activo === true || String(e.activo || '').toUpperCase() === 'SI';

export interface RankingPunt { id: string; nombre: string; area: string; p: number; asist: number; tardanzas: number; minutosTard: number; fechas: string[] }
export interface RankingSinSalida { id: string; nombre: string; area: string; faltasSalida: number; totalEntradas: number; fechas: string[] }
export interface RankingFaltas { id: string; nombre: string; area: string; fechas: string[] }

export interface Dashboard {
  aPct: number; pPct: number; almPct: number; totalEmpleados: number;
  kpiAsistenciaPct: string; asistEfectivas: number; totalEsperadas: number; vacEfectivas: number; diasExtras: number; colabs: number; difTotal: number;
  vac: { pct: string; tomadas: number; adjudicadas: number; restantes: number; promedioIndiv: string };
  topPuntuales: RankingPunt[]; topTardanzas: RankingPunt[]; sinSalida: RankingSinSalida[]; faltas: RankingFaltas[];
  almP: number; totalExtrasPeriodo: number;
}

// Suma de vacaciones individuales (renderizarCardKpiVacaciones)
export function kpiVacacionesGlobal(vacIndiv: Record<string, VacInfo>, empAsistencia: Emp[]) {
  let adjudicadas = 0, tomadas = 0, restantes = 0;
  for (const [k, v] of Object.entries(vacIndiv)) {
    const kl = String(k).toLowerCase().trim();
    if (!k || kl.includes('sumatoria') || kl.includes('total') || kl.includes('promedio') || kl.includes('resumen')) continue;
    adjudicadas += Number(v.adjudicadas) || 0;
    tomadas += Number(v.tomadas) || 0;
    restantes += Number(v.restantes) || 0;
  }
  let pct = adjudicadas > 0 ? ((tomadas / adjudicadas) * 100).toFixed(1) : '100.0';
  if (parseFloat(pct) > 100) pct = '100.0';
  let suma = 0, n = 0;
  empAsistencia.forEach(e => {
    const vInfo = vacIndiv[String(e.id).trim()] || (e.cedula && vacIndiv[String(e.cedula).trim()]);
    if (vInfo && (Number(vInfo.adjudicadas) > 0 || Number(vInfo.tomadas) > 0)) {
      const a = Number(vInfo.adjudicadas) || 0;
      const t = Number(vInfo.tomadas) || 0;
      suma += Math.min(100, a > 0 ? (t / a) * 100 : 100);
      n++;
    }
  });
  return { pct, tomadas, adjudicadas, restantes, promedioIndiv: n > 0 ? (suma / n).toFixed(1) : pct };
}

export const formatDias = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));

const esFestivoOSabado = (f: string) => esFeriadoODomingo(f) || diaSemana(f) === 6;

export function calcularDashboard(empCache: Emp[], periodo: PeriodoPago, hoy_: string, vacIndiv: Record<string, VacInfo>, solicitudes: any[]): Dashboard {
  const diasHab = obtenerDiasHabiles(periodo.inicio, periodo.fin).filter(d => d <= hoy_);
  const totalPos = empCache.length * diasHab.length || 1;
  let asist = 0, tard = 0, almP = 0;
  empCache.forEach(e => {
    const entradas = (e.registros || []).filter(r => r.tipo === 'ENTRADA' && r.fecha! >= periodo.inicio && r.fecha! <= hoy_);
    asist += new Set(entradas.map(r => r.fecha)).size;
    entradas.forEach(r => {
      const m = obtenerMinutos(r.hora);
      const ref = esFestivoOSabado(r.fecha!) ? 420 : HORA_ENTRADA_REF;
      if (m !== null && m > ref + 5) tard++;
    });
    almP += calcularAlmuerzosPeriodo(e, periodo.inicio, hoy_).almPlanta;
  });
  const aPct = calcularPct(asist, totalPos);
  const pPct = asist ? Math.round((1 - tard / asist) * 100) : 0;
  const almPct = asist ? calcularPct(almP, asist) : 0;

  // KPI de asistencia (histórico base)
  const empAsistencia = empCache.filter(e => esActivo(e) && !esEmpleadoSoloAlmuerzo(e) && !esEmpleadoExcluidoAsistencia(e) && e.tipoRegistro !== 'MASTER');
  let asistEfectivas = 0, vacEfectivas = 0, diasExtras = 0, totalEsperadas = 0;
  empAsistencia.forEach(e => {
    let evalIniEmp = periodo.inicio;
    const fInicioEmp = obtenerFechaInicioEfectivaEmpleado(e, periodo.inicio);
    if (fInicioEmp && fInicioEmp > periodo.inicio) evalIniEmp = fInicioEmp;
    const evalFinEmp = periodo.fin < hoy_ ? periodo.fin : hoy_;
    const diasHabEmp = evalIniEmp <= evalFinEmp ? obtenerDiasHabiles(evalIniEmp, evalFinEmp) : [];
    totalEsperadas += diasHabEmp.length;
    const dEf = new Set<string>(), dVac = new Set<string>(), dExt = new Set<string>();
    (e.registros || []).forEach(r => {
      const f = normalizarFechaStr(r.fecha);
      if (!f || f < evalIniEmp || f > evalFinEmp) return;
      const t = (r.tipo || '').toUpperCase();
      const just = String(r.justificado || '').toUpperCase();
      const razon = String(r.razon_ausencia || r.razon_justificac || '').toUpperCase();
      const esHab = diasHabEmp.includes(f);
      if (t === 'VACACIONES' || t === 'VACACION' || razon.includes('VACACI')) { if (esHab) dVac.add(f); }
      else if (t === 'ENTRADA' || t === 'CAMPO' || t === 'ENTRADA_CAMPO' || just === 'SI') { if (esHab) dEf.add(f); else dExt.add(f); }
    });
    asistEfectivas += dEf.size;
    vacEfectivas += dVac.size;
    diasExtras += dExt.size;
  });
  if (totalEsperadas <= 0) totalEsperadas = 1;
  let kpiAsistenciaPct = totalEsperadas > 0 ? (((asistEfectivas + vacEfectivas) / totalEsperadas) * 100).toFixed(1) : '100.0';
  if (parseFloat(kpiAsistenciaPct) > 100) kpiAsistenciaPct = '100.0';
  const difTotal = Math.max(0, totalEsperadas - (asistEfectivas + vacEfectivas));

  // Rankings
  const puntMap: Record<string, RankingPunt> = {}, puntMapBackup: Record<string, RankingPunt> = {}, tardMap: Record<string, RankingPunt> = {};
  const sinSalidaMap: Record<string, RankingSinSalida> = {};
  empCache.forEach(e => {
    const esPasanteEmp = esEmpleadoPasante(e);
    const entradas = (e.registros || []).filter(r => r.tipo === 'ENTRADA' && r.fecha! >= periodo.inicio && r.fecha! <= hoy_);
    const salidas = (e.registros || []).filter(r => (r.tipo === 'SALIDA' || r.tipo === 'SALIDA_PASANTE' || r.tipo_salida === 'SALIDA_PASANTE' || r.razon_salida === 'salida_pasante')
      && r.fecha! >= periodo.inicio && r.fecha! <= hoy_);
    const porDia: Record<string, any[]> = {};
    entradas.forEach(r => { (porDia[r.fecha!] ||= []).push(r); });
    let tardE = 0, nE = 0, faltasS = 0, minutosTardE = 0;
    const detTard: string[] = [], detSinSal: string[] = [];
    Object.keys(porDia).forEach(fecha => {
      const regs = porDia[fecha];
      regs.sort((a, b) => (obtenerMinutos(a.hora) as number) - (obtenerMinutos(b.hora) as number));
      const firstE = regs[0];
      const m = obtenerMinutos(firstE.hora);
      const fechaLegible = `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
      if (m !== null) {
        nE++;
        if (m > HORA_ENTRADA_REF + 5 && !esPasanteEmp) {
          tardE++;
          minutosTardE += m - HORA_ENTRADA_REF;
          detTard.push(`${fechaLegible} (${String(firstE.hora).slice(0, 5)})`);
        }
      }
      if (fecha !== hoy_) {
        const tieneSalida = salidas.some(s => s.fecha === fecha);
        const regsFecha = (e.registros || []).filter(r => normalizarFechaStr(r.fecha) === fecha);
        const justif = regsFecha.some(r => {
          const t = String(r.tipo || r.tipo_salida || '').toUpperCase();
          const mo = String(r.modo || r.modo_trabajo || '').toUpperCase();
          const raz = String(r.razon_ausencia || r.razon_permiso || r.razon_justificac || r.razon_salida || r.observacion || '').toUpperCase();
          const est = String(r.estado || '').toUpperCase();
          return t.includes('CAMPO') || mo.includes('CAMPO') || raz.includes('CAMPO') || est.includes('CAMPO') || r.justificado === 'SI' || r.justificada === 'SI' || t.includes('JUSTIFIC');
        });
        if (!tieneSalida && !justif) { faltasS++; detSinSal.push(fechaLegible); }
      }
    });
    if (!esPasanteEmp) {
      const item = { nombre: e.nombre, area: e.area, p: nE ? Math.round((1 - tardE / nE) * 100) : 0, id: e.id, asist: nE, tardanzas: tardE, minutosTard: minutosTardE, fechas: detTard };
      if (nE >= 3) puntMap[e.id] = item;
      else if (nE > 0) puntMapBackup[e.id] = item;
      if (tardE > 0) tardMap[e.id] = item;
    }
    if (faltasS > 0) sinSalidaMap[e.id] = { nombre: e.nombre, area: e.area, faltasSalida: faltasS, id: e.id, totalEntradas: nE, fechas: detSinSal };
  });
  const sourcePunt = Object.keys(puntMap).length > 0 ? puntMap : puntMapBackup;
  const topPuntuales = Object.values(sourcePunt).sort((a, b) => {
    if (b.p !== a.p) return b.p - a.p;
    if (b.minutosTard !== a.minutosTard) return a.minutosTard - b.minutosTard;
    return b.asist - a.asist;
  }).slice(0, 10);
  const topTardanzas = Object.values(tardMap).sort((a, b) => (b.tardanzas !== a.tardanzas ? b.tardanzas - a.tardanzas : b.minutosTard - a.minutosTard)).slice(0, 10);
  const sinSalida = Object.values(sinSalidaMap).sort((a, b) => (b.faltasSalida !== a.faltasSalida ? b.faltasSalida - a.faltasSalida : b.totalEntradas - a.totalEntradas)).slice(0, 10);

  const faltas: RankingFaltas[] = [];
  empCache.forEach(e => {
    const asistidas = new Set((e.registros || []).filter(r => r.tipo === 'ENTRADA' && r.fecha! >= periodo.inicio && r.fecha! <= hoy_).map(r => normalizarFechaStr(r.fecha)).filter(Boolean));
    const fechasFaltas = diasHab.filter(f => !asistidas.has(f));
    if (fechasFaltas.length > 0) faltas.push({ id: e.id, nombre: e.nombre, area: e.area, fechas: fechasFaltas.sort((a, b) => b.localeCompare(a)) });
  });
  faltas.sort((a, b) => b.fechas.length - a.fechas.length);

  const extrasPeriodo = obtenerAlmuerzosExtraConsolidados(solicitudes, periodo.inicio, hoy_);
  const totalExtrasPeriodo = extrasPeriodo.reduce((acc, ae) => acc + (parseInt(String(ae.cantidad), 10) || 1), 0);

  return {
    aPct, pPct, almPct, totalEmpleados: empCache.length,
    kpiAsistenciaPct, asistEfectivas, totalEsperadas, vacEfectivas, diasExtras, colabs: empAsistencia.length, difTotal,
    vac: kpiVacacionesGlobal(vacIndiv, empAsistencia),
    topPuntuales, topTardanzas, sinSalida, faltas, almP, totalExtrasPeriodo,
  };
}

export interface FilaKpi {
  id: string; nombre: string; diasLab: number; ord: number; inasist: number; ext: number; kpiAsistPct: number;
  vacAdj: number; vacTom: number; vacRes: number; txtVacPct: string; colVac: string; colAsist: string;
}

export function calcularKpisDetallados(empCache: Emp[], periodo: PeriodoPago, hoy_: string, vacIndiv: Record<string, VacInfo>) {
  const diasHab = obtenerDiasHabiles(periodo.inicio, periodo.fin).filter(d => d <= hoy_);
  const empActivos = empCache.filter(e => esActivo(e) && !esEmpleadoExcluidoAsistencia(e));
  let totOrdinarias = 0, totEsperadas = 0, totVacaciones = 0, totInasistencias = 0, totExtras = 0, sumaKpiAsist = 0;
  const filas: FilaKpi[] = empActivos.map(emp => {
    const fInicioEmp = obtenerFechaInicioEfectivaEmpleado(emp, periodo.inicio);
    const iniEvalEmp = (fInicioEmp && fInicioEmp > periodo.inicio) ? fInicioEmp : periodo.inicio;
    const diasHabEmp = diasHab.filter(d => d >= iniEvalEmp);
    const diasLab = diasHabEmp.length;
    const dEf = new Set<string>(), dVac = new Set<string>(), dExt = new Set<string>();
    (emp.registros || []).filter(r => r.fecha! >= iniEvalEmp && r.fecha! <= hoy_).forEach(r => {
      const t = (r.tipo || '').toUpperCase();
      const just = String(r.justificado || '').toUpperCase();
      const esHab = diasHabEmp.includes(r.fecha!);
      if (t === 'VACACIONES' || t === 'VACACION') { if (esHab) dVac.add(r.fecha!); }
      else if (t === 'ENTRADA' || t === 'CAMPO' || just === 'SI') { if (esHab) dEf.add(r.fecha!); else dExt.add(r.fecha!); }
    });
    const ord = dEf.size, vac = dVac.size, ext = dExt.size;
    const inasist = Math.max(0, diasLab - (ord + vac));
    totOrdinarias += ord; totVacaciones += vac; totExtras += ext; totInasistencias += inasist; totEsperadas += diasLab;
    let kpiAsistPct = diasLab > 0 ? ((ord + vac) / diasLab) * 100 : 100;
    if (kpiAsistPct > 100) kpiAsistPct = 100;
    sumaKpiAsist += kpiAsistPct;
    const vInfo = vacIndiv[String(emp.id).trim()] || (emp.cedula && vacIndiv[String(emp.cedula).trim()]) || { adjudicadas: 0, tomadas: 0, restantes: 0 };
    const vacAdj = Number(vInfo.adjudicadas) || 0, vacTom = Number(vInfo.tomadas) || 0, vacRes = Number(vInfo.restantes) || 0;
    let txtVacPct = '-', colVac = '#94a3b8';
    if (vacAdj > 0) {
      const p = Math.min(100, (vacTom / vacAdj) * 100);
      txtVacPct = `${p.toFixed(1)}%`;
      colVac = p >= 85 ? '#10b981' : p >= 50 ? '#f59e0b' : '#0284c7';
    } else if (vacTom > 0) { txtVacPct = '100.0%'; colVac = '#10b981'; }
    const colAsist = kpiAsistPct >= 95 ? '#10b981' : kpiAsistPct >= 85 ? '#f59e0b' : '#ef4444';
    return { id: emp.id, nombre: emp.nombre, diasLab, ord, inasist, ext, kpiAsistPct, vacAdj, vacTom, vacRes, txtVacPct, colVac, colAsist };
  });
  const promGlobalAsist = empActivos.length > 0 ? (sumaKpiAsist / empActivos.length).toFixed(1) : '0.0';
  return { filas, promGlobalAsist, totOrdinarias, totEsperadas, totVacaciones, totInasistencias, totExtras, colabs: empActivos.length, diasLaborables: diasHab.length };
}

// formatearTimestampCompleto(new Date()) en hora de Guayaquil
export function marcaTiempoAhora(): string {
  const p = partes();
  const d = (n: number) => String(n).padStart(2, '0');
  return `${d(p.dia)}-${d(p.mes)}-${p.anio} ${d(p.hora)}:${d(p.minuto)}:${d(p.segundo)}`;
}
