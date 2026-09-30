// Motor de reportes portado 1:1 de JS/supervisor_core.js (cargarReportes, COLUMNAS_DISPONIBLES…) y de
// JS/supervisor/supervisor_reportes_custom.js (columnas del reporte interactivo). Mismas reglas y mismos
// números que el sistema actual para un mismo período.
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Emp, HORA_ENTRADA_REF, HORA_SALIDA_REF, Periodo, Reg, calcularAlmuerzosPeriodo, calcularNetWorkedOrdinario, clasificarGap,
  diaSemana, esEmpleadoPasante, esFeriadoODomingo, normalizarFechaStr, obtenerFechaInicioEfectivaEmpleado,
  obtenerMinutos, sumarDias,
} from './util';

export interface Columna {
  id: string; label: string; tipo: 'texto' | 'numero' | 'tiempo' | 'pct'; cat: string; catLabel: string; icono: string;
  color: string; colorBg: string; colorHeader: string;
}

export const COLUMNAS_DISPONIBLES: Columna[] = [
  { id: 'area', label: 'Área', tipo: 'texto', cat: 'general', catLabel: 'Datos Generales', icono: 'fa-building', color: '#475569', colorBg: '#f8fafc', colorHeader: '#334155' },
  { id: 'asistencias', label: 'Asistencias', tipo: 'numero', cat: 'asistencia', catLabel: 'Asistencia y Puntualidad', icono: 'fa-user-check', color: '#047857', colorBg: '#ecfdf5', colorHeader: '#047857' },
  { id: 'entradas', label: 'Entradas Reg.', tipo: 'numero', cat: 'asistencia', catLabel: 'Asistencia y Puntualidad', icono: 'fa-sign-in-alt', color: '#059669', colorBg: '#ecfdf5', colorHeader: '#059669' },
  { id: 'entradasAuto', label: 'Entradas Auto.', tipo: 'numero', cat: 'asistencia', catLabel: 'Asistencia y Puntualidad', icono: 'fa-robot', color: '#d97706', colorBg: '#fffbeb', colorHeader: '#d97706' },
  { id: 'salidas', label: 'Salidas Reg.', tipo: 'numero', cat: 'asistencia', catLabel: 'Asistencia y Puntualidad', icono: 'fa-sign-out-alt', color: '#0284c7', colorBg: '#f0f9ff', colorHeader: '#0284c7' },
  { id: 'salidasAuto', label: 'Salidas Auto.', tipo: 'numero', cat: 'asistencia', catLabel: 'Asistencia y Puntualidad', icono: 'fa-magic', color: '#7c3aed', colorBg: '#faf5ff', colorHeader: '#7c3aed' },
  { id: 'diasCampo', label: 'Días Campo', tipo: 'numero', cat: 'campo', catLabel: 'Trabajo en Campo', icono: 'fa-hard-hat', color: '#0891b2', colorBg: '#ecfeff', colorHeader: '#0891b2' },
  { id: 'faltas', label: 'Faltas', tipo: 'numero', cat: 'asistencia', catLabel: 'Asistencia y Puntualidad', icono: 'fa-calendar-times', color: '#b91c1c', colorBg: '#fef2f2', colorHeader: '#b91c1c' },
  { id: 'diasVacaciones', label: 'Vacaciones', tipo: 'numero', cat: 'permisos', catLabel: 'Permisos y Descuentos', icono: 'fa-umbrella-beach', color: '#059669', colorBg: '#ecfdf5', colorHeader: '#059669' },
  { id: 'diasJustificados', label: 'Días Justificados', tipo: 'numero', cat: 'permisos', catLabel: 'Permisos y Descuentos', icono: 'fa-shield-alt', color: '#7c3aed', colorBg: '#f5f3ff', colorHeader: '#7c3aed' },
  { id: 'diasExtras', label: 'Días Extras', tipo: 'numero', cat: 'extras', catLabel: 'Horas Extraordinarias', icono: 'fa-calendar-plus', color: '#4338ca', colorBg: '#eef2ff', colorHeader: '#4338ca' },
  { id: 'atrasos', label: 'Nº Atrasos', tipo: 'numero', cat: 'asistencia', catLabel: 'Asistencia y Puntualidad', icono: 'fa-clock', color: '#d97706', colorBg: '#fffbeb', colorHeader: '#d97706' },
  { id: 'minutosAtrasos', label: 'Tiempo Atrasos', tipo: 'tiempo', cat: 'asistencia', catLabel: 'Asistencia y Puntualidad', icono: 'fa-hourglass-half', color: '#b45309', colorBg: '#fffbeb', colorHeader: '#b45309' },
  { id: 'almPlanta', label: 'Alm. Planta', tipo: 'numero', cat: 'almuerzos', catLabel: 'Almuerzos', icono: 'fa-utensils', color: '#0284c7', colorBg: '#f0f9ff', colorHeader: '#0284c7' },
  { id: 'almFuera', label: 'Alm. Fuera', tipo: 'numero', cat: 'almuerzos', catLabel: 'Almuerzos', icono: 'fa-box', color: '#0369a1', colorBg: '#f0f9ff', colorHeader: '#0369a1' },
  { id: 'puntualidad', label: 'Puntualidad', tipo: 'pct', cat: 'asistencia', catLabel: 'Asistencia y Puntualidad', icono: 'fa-chart-pie', color: '#15803d', colorBg: '#f0fdf4', colorHeader: '#15803d' },
  { id: 'permisoMedico', label: 'Permiso Médico', tipo: 'tiempo', cat: 'permisos', catLabel: 'Permisos y Descuentos', icono: 'fa-notes-medical', color: '#0d9488', colorBg: '#f0fdfa', colorHeader: '#0d9488' },
  { id: 'permisoPersonal', label: 'Permiso Personal', tipo: 'tiempo', cat: 'permisos', catLabel: 'Permisos y Descuentos', icono: 'fa-user-clock', color: '#7c3aed', colorBg: '#f5f3ff', colorHeader: '#7c3aed' },
  { id: 'tiempoPorJustificar', label: 'Por Justificar', tipo: 'tiempo', cat: 'permisos', catLabel: 'Permisos y Descuentos', icono: 'fa-question-circle', color: '#c026d3', colorBg: '#fdf4ff', colorHeader: '#c026d3' },
  { id: 'tiempoADescontar', label: 'A Descontar', tipo: 'tiempo', cat: 'permisos', catLabel: 'Permisos y Descuentos', icono: 'fa-file-invoice-dollar', color: '#be123c', colorBg: '#fff1f2', colorHeader: '#be123c' },
  { id: 'horasExtra50', label: 'H. Extra 50% (A)', tipo: 'tiempo', cat: 'extras', catLabel: 'Horas Extraordinarias', icono: 'fa-bolt', color: '#1d4ed8', colorBg: '#eff6ff', colorHeader: '#1d4ed8' },
  { id: 'horasExtra100', label: 'H. Extra 100% (B)', tipo: 'tiempo', cat: 'extras', catLabel: 'Horas Extraordinarias', icono: 'fa-fire', color: '#4338ca', colorBg: '#eef2ff', colorHeader: '#4338ca' },
  { id: 'horasCampoNormales', label: 'Campo Normal', tipo: 'tiempo', cat: 'campo', catLabel: 'Trabajo en Campo', icono: 'fa-hard-hat', color: '#0891b2', colorBg: '#ecfeff', colorHeader: '#0891b2' },
  { id: 'horasCampo50', label: 'Campo 50% (C)', tipo: 'tiempo', cat: 'campo', catLabel: 'Trabajo en Campo', icono: 'fa-tools', color: '#0e7490', colorBg: '#ecfeff', colorHeader: '#0e7490' },
  { id: 'horasCampo100', label: 'Campo 100% (D)', tipo: 'tiempo', cat: 'campo', catLabel: 'Trabajo en Campo', icono: 'fa-wrench', color: '#155e75', colorBg: '#ecfeff', colorHeader: '#155e75' },
  { id: 'totalExtras50', label: 'Total 50% (A+C)', tipo: 'tiempo', cat: 'totalesExtras', catLabel: 'Totales Extras', icono: 'fa-calculator', color: '#1e3a8a', colorBg: '#dbeafe', colorHeader: '#1e3a8a' },
  { id: 'totalExtras100', label: 'Total 100% (B+D)', tipo: 'tiempo', cat: 'totalesExtras', catLabel: 'Totales Extras', icono: 'fa-coins', color: '#312e81', colorBg: '#e0e7ff', colorHeader: '#312e81' },
];

export const DEFAULT_COLUMNAS_CUSTOM = ['area', 'asistencias', 'entradas', 'salidas', 'salidasAuto', 'diasCampo', 'faltas', 'diasVacaciones',
  'diasJustificados', 'diasExtras', 'atrasos', 'minutosAtrasos', 'almPlanta', 'puntualidad', 'totalExtras50', 'totalExtras100'];

const CLAVE_COLUMNAS = 'columnasCustomActivasReporte';

export function obtenerColumnasCustomActivas(): string[] {
  try {
    const saved = localStorage.getItem(CLAVE_COLUMNAS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        ['diasCampo', 'diasVacaciones', 'diasJustificados', 'diasExtras', 'entradas', 'entradasAuto', 'salidas', 'salidasAuto'].forEach(colId => {
          if (!parsed.includes(colId)) {
            const idxAsis = parsed.indexOf('asistencias');
            if (['entradas', 'entradasAuto', 'salidas', 'salidasAuto'].includes(colId) && idxAsis > -1) parsed.splice(idxAsis + 1, 0, colId);
            else {
              const idxFaltas = parsed.indexOf('faltas');
              if (idxFaltas > -1) parsed.splice(idxFaltas + 1, 0, colId);
              else parsed.push(colId);
            }
          }
        });
        return parsed;
      }
    }
  } catch { /* almacenamiento no disponible */ }
  return [...DEFAULT_COLUMNAS_CUSTOM];
}

export function guardarColumnasCustomActivas(columnas: string[]) {
  try { localStorage.setItem(CLAVE_COLUMNAS, JSON.stringify(columnas)); } catch { /* sin almacenamiento */ }
}

export interface StatReporte {
  id: string; nombre: string; area: string; cargo: string; esEliminado: boolean; esDesvinculado?: boolean; fecha_salida?: string;
  fechaDesvinculacion?: string; motivo_salida?: string; activo?: any; estadoBadge?: string; foto_url?: string;
  asistencias: number; diasCampo: number; faltas: number; diasVacaciones: number; diasJustificados: number; diasExtras: number;
  permisoMedico: number; permisoPersonal: number; tiempoPorJustificar: number; tiempoADescontar: number; atrasos: number;
  minutosAtrasos: number; almPlanta: number; almFuera: number; puntualidad: number; horasExtra50: number; horasExtra100: number;
  horasCampoNormales: number; horasCampo50: number; horasCampo100: number; totalExtras50: number; totalExtras100: number;
  totalHorasExtra: number; entradas: number; entradasReg: number; entradasAuto: number; salidas: number; salidasReg: number;
  salidasAuto: number; [k: string]: any;
}

function esRegistroAutocompletado(r: Reg): boolean {
  if (!r) return false;
  const disp = String(r.dispositivo || '').trim().toUpperCase();
  const razonSal = String(r.razon_salida || r.razon_salida_temprana || '').toLowerCase();
  const razonJust = String(r.razon_justificac || r.razon_ausencia || '').toLowerCase();
  const razonEnt = String(r.razon_entrada_tardia || '').toLowerCase();
  const quien = String(r.quien_justifica || r.quienJustifica || r.quien_justifica_entrada || r.quienJustificaEntrada || '').trim().toUpperCase();
  const tipo = String(r.tipo || r.tipo_salida || '').trim().toUpperCase();
  return disp === 'AUTO_COMPLETAR' || quien === 'SISTEMA' || razonSal.includes('no registr') || razonJust.includes('no registr')
    || razonEnt.includes('no registr') || tipo.includes('AUTO');
}

// Fechas de R_INI a R_FIN inclusive (el legado usaba Date + toISOString)
function fechasDelRango(ini: string, fin: string): string[] {
  const out: string[] = [];
  for (let f = ini; f <= fin; f = sumarDias(f, 1)) out.push(f);
  return out;
}

function esCampoOJornadaJustificada(regsDia: Reg[]): boolean {
  return regsDia.some(r => {
    const t = String(r.tipo || r.tipo_salida || '').toUpperCase();
    const m = String(r.modo || r.modo_trabajo || '').toUpperCase();
    const raz = String(r.razon_ausencia || r.razon_permiso || r.razon_justificac || r.razon_salida || r.observacion || '').toUpperCase();
    const est = String(r.estado || '').toUpperCase();
    return t.includes('CAMPO') || m.includes('CAMPO') || raz.includes('CAMPO') || est.includes('CAMPO') || r.justificado === 'SI'
      || r.justificada === 'SI' || t.includes('JUSTIFIC');
  });
}

// cargarReportes → stats por colaborador
export function calcularStatEmpleado(e: Emp, R_INI: string, R_FIN: string, hoyRep: string): StatReporte {
  const regsRango = (e.registros || []).filter(r => r.fecha! >= R_INI && r.fecha! <= R_FIN);
  let numEntradasReg = 0, numEntradasAuto = 0, numSalidasReg = 0, numSalidasAuto = 0;
  regsRango.forEach(r => {
    const tipo = String(r.tipo || '').toUpperCase();
    if (tipo === 'ENTRADA') { if (esRegistroAutocompletado(r)) numEntradasAuto++; else numEntradasReg++; }
    else if (tipo === 'SALIDA') { if (esRegistroAutocompletado(r)) numSalidasAuto++; else numSalidasReg++; }
  });

  const fSalida = (e.fecha_salida || e.fechaDesvinculacion) ? (normalizarFechaStr(e.fecha_salida || e.fechaDesvinculacion) || e.fecha_salida) : null;
  let finEvalEmp = (R_FIN < hoyRep) ? R_FIN : hoyRep;
  if (fSalida && fSalida < finEvalEmp) finEvalEmp = fSalida;
  let iniEvalEmp = R_INI;
  const fInicioEfectivo = obtenerFechaInicioEfectivaEmpleado(e, R_INI);
  if (fInicioEfectivo && fInicioEfectivo > R_INI) iniEvalEmp = fInicioEfectivo;

  const diasAsistidosPlantaSet = new Set<string>();
  const diasCampoSet = new Set<string>();
  const diasVacacionesSet = new Set<string>();
  const diasJustificadosSet = new Set<string>();
  const diasExtrasSet = new Set<string>();
  const diasFaltasSet = new Set<string>();

  let atrasos = 0, minutosAtrasos = 0;
  const resAlm = calcularAlmuerzosPeriodo(e, R_INI, R_FIN);
  const almPlanta = resAlm.almPlanta, almFuera = resAlm.almFuera;
  let horasExtra50 = 0, horasExtra100 = 0, horasCampoNormales = 0, horasCampo50 = 0, horasCampo100 = 0;
  let totalTiempoPersonal = 0, totalTiempoMedico = 0, totalTiempoPorJustificar = 0, totalDescuentoBruto = 0;
  const esPasanteEmp = esEmpleadoPasante(e);
  const todasLasFechas = fechasDelRango(R_INI, R_FIN);

  todasLasFechas.forEach(fecha => {
    if (fSalida && fecha > fSalida) return;
    if (iniEvalEmp && fecha < iniEvalEmp) return;
    const regsDia = (e.registros || []).filter(r => r.fecha === fecha);
    const dayOfWeek = diaSemana(fecha);
    const esFestivo = esFeriadoODomingo(fecha) || (dayOfWeek === 6 || dayOfWeek === 0);
    const esLaborable = !esFestivo;
    const esHoyOFuturo = fecha >= hoyRep;

    const esCampoHoy = regsDia.some(r => {
      const tipo = String(r.tipo || r.tipo_salida || '').toUpperCase();
      const modo = String(r.modo || '').toUpperCase();
      const razAus = String(r.razon_ausencia || '').toLowerCase();
      const razJust = String(r.razon_justificac || '').toLowerCase();
      const razSal = String(r.razon_salida || r.razon_salida_temprana || '').toLowerCase();
      const aut = String(r.autoriza || '').toUpperCase();
      const estado = String(r.estado || '').toUpperCase();
      return tipo.includes('CAMPO') || modo === 'CAMPO' || estado.includes('CAMPO') || razAus.includes('campo') || razJust.includes('campo')
        || razSal.includes('campo') || aut.includes('CAMPO');
    });
    const esVacacionHoy = regsDia.some(r => {
      const tipo = String(r.tipo || r.tipo_salida || '').toUpperCase();
      const razAus = String(r.razon_ausencia || '').toLowerCase();
      const razJust = String(r.razon_justificac || '').toLowerCase();
      return tipo.includes('VACAC') || razAus.includes('vacac') || razJust.includes('vacac');
    });
    const tieneEntradaPlanta = regsDia.some(r => {
      const tipo = String(r.tipo || '').toUpperCase();
      return ['ENTRADA', 'RETORNO_CAMPO'].includes(tipo) && String(r.modo || '').toUpperCase() !== 'CAMPO';
    });
    const tieneAsistenciaHoy = regsDia.some(r => ['ENTRADA', 'SALIDA', 'RETORNO_CAMPO', 'SALIDA_CAMPO', 'ENTRADA_CAMPO'].includes(String(r.tipo || '').toUpperCase()));
    const isJustificado = regsDia.some(r => {
      const tipo = String(r.tipo || r.tipo_salida || '').toUpperCase();
      const razAus = String(r.razon_ausencia || '').trim();
      const razJust = String(r.razon_justificac || '').trim();
      if (tieneAsistenciaHoy && (tipo.includes('VACAC') || razAus.toUpperCase().includes('VACAC'))) return false;
      if (r.justificado === 'SI' || r.justificado === true || r.justificada === 'SI' || r.justificada === true) return true;
      if (razAus !== '' && razAus !== '—' && razAus !== '-') return true;
      if (razJust !== '' && razJust !== '—' && razJust !== '-') return true;
      if (['PERMISO_MEDICO', 'PERMISO_PERSONAL', 'CALAMIDAD_DOMESTICA', 'SALIDA_JUSTIFICADA', 'CUMPLEAÑOS', 'CUMPLEANOS'].includes(tipo)) return true;
      if (r.razon_salida_temprana && ['permiso_medico', 'cumpleanos', 'permiso_personal', 'salida_justificada'].includes(r.razon_salida_temprana)) return true;
      if (tipo && !['ENTRADA', 'SALIDA', 'ESTADO', 'SOLO_ALMUERZO', 'RETORNO_CAMPO', 'SALIDA_CAMPO'].includes(tipo)) return true;
      return false;
    });

    if (esCampoHoy) diasCampoSet.add(fecha);
    if (tieneAsistenciaHoy || esCampoHoy) {
      if (esFestivo) diasExtrasSet.add(fecha);
      else if (tieneEntradaPlanta || (!esCampoHoy && tieneAsistenciaHoy)) diasAsistidosPlantaSet.add(fecha);
    } else if (esVacacionHoy) {
      if (esLaborable) diasVacacionesSet.add(fecha);
    } else if (isJustificado) {
      if (esLaborable) diasJustificadosSet.add(fecha);
    } else if (esLaborable && !esHoyOFuturo) {
      diasFaltasSet.add(fecha);
    }

    if (regsDia.length === 0) return;

    const primerReg = regsDia.find(r => r.tipo === 'ENTRADA' || r.tipo === 'RETORNO_CAMPO' || r.tipo === 'ENTRADA_CAMPO' || String(r.tipo || '').toUpperCase() === 'ENTRADA_CAMPO');
    let atrasoMinsHoy = 0;
    if (primerReg && !esPasanteEmp) {
      const mE = obtenerMinutos(primerReg.hora || primerReg.timestamp);
      const refEntrada = esFestivo ? 420 : HORA_ENTRADA_REF;
      if (mE !== null && mE > refEntrada + 5) atrasoMinsHoy = mE - refEntrada;
    }

    const periodosDia: Periodo[] = [];
    let entradaPendiente: Reg | null = null;
    const sortedRegs = [...regsDia].sort((a, b) => {
      if (a.timestamp && b.timestamp) return String(a.timestamp).localeCompare(String(b.timestamp));
      return String(a.hora || '').localeCompare(String(b.hora || ''));
    });
    sortedRegs.forEach(r => {
      const tipo = String(r.tipo || '').toUpperCase();
      if (tipo === 'ENTRADA' || tipo === 'RETORNO_CAMPO' || tipo === 'ENTRADA_CAMPO') entradaPendiente = r;
      else if (tipo === 'SALIDA' || tipo === 'SALIDA_CAMPO' || tipo === 'SALIDA_PASANTE' || r.tipo_salida === 'SALIDA_PASANTE' || r.razon_salida === 'salida_pasante') {
        if (entradaPendiente) { periodosDia.push({ entrada: entradaPendiente, salida: r }); entradaPendiente = null; }
        else periodosDia.push({ entrada: null, salida: r });
      }
    });
    if (entradaPendiente) periodosDia.push({ entrada: entradaPendiente, salida: null });

    let minutosTrabajadosHoy = 0, tiempoPersonalHoy = 0, tiempoMedicoHoy = 0, tiempoJustificarHoy = 0;
    const hasCumpleanos = regsDia.some(r => {
      const raz = String(r.razon_ausencia || '').toLowerCase();
      const tip = String(r.tipo || r.tipo_salida || '').toUpperCase();
      return raz.includes('cumplea') || raz.includes('cumplean') || tip.includes('CUMPLE');
    });

    let ultimoSalidaMins: number | null = null;
    let ultimoSalidaReg: Reg | null = null;
    let processedLunchGap = false;
    periodosDia.forEach(p => {
      if (!p.entrada || !p.salida) return;
      const mE = obtenerMinutos(p.entrada.hora || p.entrada.timestamp);
      const mS = obtenerMinutos(p.salida.hora || p.salida.timestamp);
      if (mE === null || mS === null || mS <= mE) return;
      minutosTrabajadosHoy += mS - mE;
      if (ultimoSalidaMins !== null && mE > ultimoSalidaMins) {
        let gap = mE - ultimoSalidaMins;
        if (!processedLunchGap && ultimoSalidaMins >= 690 && ultimoSalidaMins <= 870) {
          gap -= Math.min(45, gap);
          processedLunchGap = true;
        }
        if (gap > 0) {
          const clasif = clasificarGap(ultimoSalidaReg, gap);
          if (clasif.tipo === 'medico') tiempoMedicoHoy += gap;
          else if (clasif.tipo === 'personal') tiempoPersonalHoy += gap;
          else tiempoJustificarHoy += gap;
        }
      }
      ultimoSalidaMins = mS;
      ultimoSalidaReg = p.salida;
    });

    let netWorked = minutosTrabajadosHoy;
    if (!esFestivo && netWorked > 240) netWorked -= 45;

    let autorizado = regsDia.some(r => r.horasExtra === 'SI') || regsDia.some(r => (r.autoriza || '').includes('CAMPO'));
    if (esFestivo && netWorked > 60) autorizado = true;
    else if (!esFestivo && netWorked >= 600) autorizado = true;

    let extraMins50Acum = 0;
    periodosDia.forEach(p => {
      if (!p.entrada || !p.salida) return;
      const mE = obtenerMinutos(p.entrada.hora || p.entrada.timestamp);
      const mS = obtenerMinutos(p.salida.hora || p.salida.timestamp);
      if (mE === null || mS === null || mS <= mE) return;
      const duracion = mS - mE;
      const enCampo = p.entrada.modo === 'CAMPO' || p.salida.modo === 'CAMPO';
      if (esFestivo) {
        if (enCampo) { if (autorizado) horasCampo100 += duracion; }
        else if (autorizado) horasExtra100 += duracion;
      } else {
        const H_INI = HORA_ENTRADA_REF, H_FIN = HORA_SALIDA_REF;
        if (enCampo) {
          if (mS <= H_INI || mE >= H_FIN) horasCampo50 += duracion;
          else {
            const mNormal = Math.min(mS, H_FIN) - Math.max(mE, H_INI);
            horasCampoNormales += mNormal;
            horasCampo50 += duracion - mNormal;
          }
        } else if (autorizado && mS > H_FIN) {
          extraMins50Acum += mS - Math.max(mE, H_FIN);
        }
      }
    });
    if (!esFestivo) horasExtra50 += extraMins50Acum;

    const regPermiso = regsDia.find(r => r.tipo === 'ENTRADA') || regsDia.find(r => r.tiempo_justificado_mins || r.permiso_personal_mins || r.permiso_medico_mins) || regsDia[0];
    const persMins = regPermiso ? Number(regPermiso.permiso_personal_mins || 0) : 0;
    const medMins = regPermiso ? Number(regPermiso.permiso_medico_mins || 0) : 0;
    const justMins = regPermiso ? Number(regPermiso.tiempo_justificado_mins || 0) : 0;
    tiempoPersonalHoy += persMins;
    tiempoMedicoHoy += medMins;
    const tiempoJustificadoHoy = justMins + (hasCumpleanos ? 240 : 0);

    if ((isJustificado && !tieneAsistenciaHoy) || esCampoHoy || esHoyOFuturo || esPasanteEmp) {
      tiempoJustificarHoy = 0;
    } else {
      const netWorkedOrdinario = calcularNetWorkedOrdinario(periodosDia, esFestivo);
      const missingMinutes = esFestivo ? 0 : Math.max(0, 480 - netWorkedOrdinario);
      const totalPermisosHoy = tiempoPersonalHoy + tiempoMedicoHoy + tiempoJustificadoHoy;
      tiempoJustificarHoy += Math.max(0, missingMinutes - totalPermisosHoy);
      tiempoJustificarHoy = Math.max(0, tiempoJustificarHoy - tiempoJustificadoHoy);
    }

    // Los 45 min de almuerzo son neutros: no computan como falta ni atraso
    const ultSal = ultimoSalidaMins as number | null;
    const minsSalidaTempranaHoy = (!esFestivo && !esPasanteEmp && ultSal !== null && ultSal < HORA_SALIDA_REF) ? (HORA_SALIDA_REF - ultSal) : 0;
    const missingMinutesDia = esFestivo ? 0 : Math.max(0, 480 - calcularNetWorkedOrdinario(periodosDia, esFestivo));
    if (!esFestivo && (atrasoMinsHoy + minsSalidaTempranaHoy) > missingMinutesDia) {
      atrasoMinsHoy = Math.max(0, missingMinutesDia - minsSalidaTempranaHoy);
    }
    if (esPasanteEmp) atrasoMinsHoy = 0;
    else atrasoMinsHoy = Math.max(0, atrasoMinsHoy - tiempoPersonalHoy - tiempoMedicoHoy - tiempoJustificadoHoy);
    if (atrasoMinsHoy > 0) { atrasos++; minutosAtrasos += atrasoMinsHoy; }

    totalDescuentoBruto += tiempoPersonalHoy + (tiempoJustificarHoy > 0 ? Math.max(tiempoJustificarHoy, atrasoMinsHoy) : atrasoMinsHoy);
    totalTiempoPersonal += tiempoPersonalHoy;
    totalTiempoMedico += tiempoMedicoHoy;
    totalTiempoPorJustificar += tiempoJustificarHoy;
  });

  // Salidas pendientes en días pasados con entrada y sin salida
  todasLasFechas.forEach(fecha => {
    if (fecha >= hoyRep) return;
    if (fSalida && fecha > fSalida) return;
    if (iniEvalEmp && fecha < iniEvalEmp) return;
    const regsDia = regsRango.filter(r => normalizarFechaStr(r.fecha) === fecha);
    const tieneEntrada = regsDia.some(r => ['ENTRADA', 'RETORNO_CAMPO', 'ENTRADA_CAMPO'].includes(String(r.tipo || '').toUpperCase()));
    const tieneSalida = regsDia.some(r => ['SALIDA', 'SALIDA_CAMPO'].includes(String(r.tipo || '').toUpperCase()));
    if (tieneEntrada && !tieneSalida && !esCampoOJornadaJustificada(regsDia)) numSalidasAuto++;
  });

  const diasTotalesTrabajados = diasAsistidosPlantaSet.size + diasCampoSet.size;
  const puntualidad = diasTotalesTrabajados ? (esPasanteEmp ? 100 : Math.round((1 - atrasos / diasTotalesTrabajados) * 100)) : 0;

  return {
    id: e.id, nombre: e.nombre, area: e.area, cargo: e.cargo || '', esEliminado: !!e.esEliminado, esDesvinculado: !!e.esDesvinculado,
    fecha_salida: e.fecha_salida, fechaDesvinculacion: e.fechaDesvinculacion, motivo_salida: e.motivo_salida, activo: e.activo,
    foto_url: e.foto_url,
    asistencias: diasAsistidosPlantaSet.size, diasCampo: diasCampoSet.size, faltas: diasFaltasSet.size,
    diasVacaciones: diasVacacionesSet.size, diasJustificados: diasJustificadosSet.size, diasExtras: diasExtrasSet.size,
    permisoMedico: totalTiempoMedico, permisoPersonal: totalTiempoPersonal,
    tiempoPorJustificar: esPasanteEmp ? totalTiempoPorJustificar : Math.max(0, totalTiempoPorJustificar - 240),
    tiempoADescontar: esPasanteEmp ? totalDescuentoBruto : Math.max(0, totalDescuentoBruto - 240),
    atrasos, minutosAtrasos, almPlanta, almFuera, puntualidad,
    horasExtra50, horasExtra100, horasCampoNormales, horasCampo50, horasCampo100,
    totalExtras50: horasExtra50 + horasCampo50, totalExtras100: horasExtra100 + horasCampo100,
    totalHorasExtra: horasExtra50 + horasExtra100 + horasCampo50 + horasCampo100,
    entradas: numEntradasReg, entradasReg: numEntradasReg, entradasAuto: numEntradasAuto,
    salidas: numSalidasReg, salidasReg: numSalidasReg, salidasAuto: numSalidasAuto,
  };
}

export function calcularStatsReportes(lista: Emp[], R_INI: string, R_FIN: string, hoyRep: string): StatReporte[] {
  if (!R_INI || !R_FIN) return [];
  return lista.map(e => calcularStatEmpleado(e, R_INI, R_FIN, hoyRep));
}

export function sumar(stats: StatReporte[], campo: string): number {
  return stats.reduce((s, r) => s + (Number(r[campo]) || 0), 0);
}

// obtenerListaEmpleadosReportes: activos + (desvinculados/eliminados si se piden)
export function obtenerListaEmpleadosReportes(empCache: Emp[], empEliminados: Emp[], incluirDesv: boolean, incluirElim: boolean, fCargo: string): Emp[] {
  const verBajas = incluirDesv || incluirElim || fCargo === 'desvinculados' || fCargo === 'eliminados';
  return verBajas ? [...empCache, ...empEliminados] : [...empCache];
}

// obtenerDatosFiltradosReporteCustom
export function filtrarDatosReporte(base: StatReporte[], q: string, fCargo: string): StatReporte[] {
  q = (q || '').toLowerCase();
  fCargo = (fCargo || '').toLowerCase();
  return base.filter(e => {
    const matchQ = !q || (e.nombre || '').toLowerCase().includes(q) || (e.area || '').toLowerCase().includes(q) || String(e.id || '').toLowerCase().includes(q);
    let matchCargo = !fCargo;
    if (fCargo === 'desvinculados') {
      matchCargo = !!e.esDesvinculado || (e.cargo || '').toLowerCase() === 'desvinculado' || (e.area || '').toLowerCase() === 'desvinculado'
        || !!(e.estadoBadge && e.estadoBadge.toLowerCase().includes('desvinculado')) || !!(e.motivo_salida && e.motivo_salida.length > 0);
    } else if (fCargo === 'eliminados') {
      matchCargo = !!e.esEliminado || e.activo === false || (e.area || '').toLowerCase() === 'eliminado' || (e.cargo || '').toLowerCase() === 'eliminado';
    } else if (fCargo === 'sin asistencia') {
      matchCargo = (e.asistencias === 0 || !e.asistencias);
    } else if (fCargo) {
      matchCargo = (e.cargo || '').toLowerCase() === fCargo;
    }
    return matchQ && matchCargo;
  });
}

export function ordenar<T extends Record<string, any>>(data: T[], col: string | null, dir: 'asc' | 'desc', vacio: any = 0): T[] {
  if (!col) return data;
  return [...data].sort((a, b) => {
    const va = a[col] ?? vacio;
    const vb = b[col] ?? vacio;
    if (typeof va === 'string') return dir === 'asc' ? va.localeCompare(vb) : String(vb).localeCompare(va);
    return dir === 'asc' ? va - vb : vb - va;
  });
}

// formatearFechaA_DMY y formatearTimestampCompleto del legado
export function formatearFechaA_DMY(fecha: unknown): string {
  if (!fecha) return '';
  const str = String(fecha).trim();
  const matchDMY = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (matchDMY) return `${matchDMY[1].padStart(2, '0')}-${matchDMY[2].padStart(2, '0')}-${matchDMY[3]}`;
  const matchYMD = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (matchYMD) return `${matchYMD[3].padStart(2, '0')}-${matchYMD[2].padStart(2, '0')}-${matchYMD[1]}`;
  return str;
}
