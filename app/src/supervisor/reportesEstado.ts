// Filtros compartidos por Dashboard y Reportes (periodoMensual / periodoMensualDash / kpiDetallePeriodo,
// filtroFechaDashboard y el rango filtroFechaReportesInicio/Finalización del legado, sincronizados entre sí).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useSyncExternalStore } from 'react';
import { mostrarToast } from './ui/comun';
import { asegurarRegistros, asegurarSolicitudes, sup } from './store';
import { formatearFechaA_DMY } from './legado/reportes';
import { getLocalHoyStr } from './legado/util';

export type Preset = 'periodo' | 'quincena1' | 'quincena2' | 'hoy' | '';

export interface FiltrosRep {
  periodoIdx: number;
  ini: string;           // filtroFechaReportesInicio
  fin: string;           // filtroFechaReportesFinalizacion
  fechaDash: string;     // filtroFechaDashboard
  preset: Preset;
  cargo: string;         // filtroCargoReporte ('', 'pasante', 'sin asistencia', 'almuerzos extra', 'desvinculados', 'eliminados')
  busqueda: string;      // searchReportesCustom
  incluirDesv: boolean;
  incluirElim: boolean;
}

let estado: FiltrosRep = { periodoIdx: 0, ini: '', fin: '', fechaDash: '', preset: 'periodo', cargo: '', busqueda: '', incluirDesv: false, incluirElim: false };
const oyentes = new Set<() => void>();

export const filtrosRep = {
  get: () => estado,
  set(p: Partial<FiltrosRep>) { estado = { ...estado, ...p }; oyentes.forEach(f => f()); asegurarRango(); },
};

export function useFiltrosRep(): FiltrosRep {
  return useSyncExternalStore(f => { oyentes.add(f); return () => { oyentes.delete(f); }; }, () => estado);
}

export interface Rango { periodoIdx: number; R_INI: string; R_FIN: string; esFiltroPersonalizado: boolean; labelRango: string; labelCorto: string }

// obtenerRangoFechasReportes
export function obtenerRango(f: FiltrosRep = estado): Rango {
  const periodos = sup.get().periodos;
  const periodo = periodos[f.periodoIdx] || periodos[0];
  let inpIni = f.ini.trim();
  let inpFin = f.fin.trim();
  if (!inpIni && !inpFin && f.fechaDash) { inpIni = f.fechaDash; inpFin = f.fechaDash; }
  if (inpIni && !inpFin) inpFin = inpIni;
  if (!inpIni && inpFin) inpIni = inpFin;
  let R_INI = inpIni || periodo?.inicio || '';
  let R_FIN = inpFin || periodo?.fin || '';
  if (inpIni && inpFin && inpIni > inpFin) { const t = R_INI; R_INI = R_FIN; R_FIN = t; }
  const esFiltroPersonalizado = Boolean(inpIni || inpFin);
  let labelRango: string, labelCorto: string;
  if (esFiltroPersonalizado) {
    labelRango = `${formatearFechaA_DMY(R_INI)} al ${formatearFechaA_DMY(R_FIN)}`;
    labelCorto = `${R_INI} a ${R_FIN}`;
  } else if (periodo) {
    labelRango = (periodo.label || '').replace('⭐ ', '').replace(' (Actual)', '');
    labelCorto = labelRango;
  } else {
    labelRango = `${R_INI} al ${R_FIN}`;
    labelCorto = labelRango;
  }
  return { periodoIdx: f.periodoIdx, R_INI, R_FIN, esFiltroPersonalizado, labelRango, labelCorto };
}

// Trae del servidor los registros anteriores a la carga inicial cuando el rango lo necesita
function asegurarRango() {
  const r = obtenerRango();
  if (!r.R_INI) return;
  asegurarRegistros(r.R_INI, r.R_FIN).catch(() => mostrarToast('No se pudo cargar el historial del rango', 'error'));
  asegurarSolicitudes(r.R_INI, r.R_FIN).catch(() => mostrarToast('No se pudieron cargar los almuerzos extra del rango', 'error'));
}

// syncPeriodo: el cambio de período limpia los filtros de fecha
export function syncPeriodo(idx: number) {
  filtrosRep.set({ periodoIdx: idx, ini: '', fin: '', fechaDash: '', preset: 'periodo' });
}

// syncFecha('dash'): la fecha del dashboard se copia al rango de reportes
export function syncFechaDash(val: string) {
  filtrosRep.set(val ? { fechaDash: val, ini: val, fin: val } : { fechaDash: '' });
}

export function limpiarFiltroFechaDashboard() {
  filtrosRep.set({ fechaDash: '', ini: '', fin: '', preset: 'periodo' });
}

export function limpiarFiltroRangoFechasReportes() {
  filtrosRep.set({ fechaDash: '', ini: '', fin: '', preset: 'periodo' });
}

// filtrarReportePorRangoFechas (el legado corrige el rango invertido con aviso)
export function filtrarReportePorRangoFechas(ini: string, fin: string) {
  if (ini && fin && ini > fin) {
    mostrarToast(`Rango invertido corregido: ${formatearFechaA_DMY(fin)} al ${formatearFechaA_DMY(ini)}`, 'info');
    [ini, fin] = [fin, ini];
  }
  filtrosRep.set({ ini, fin, preset: (ini || fin) ? '' : 'periodo' });
}

export function aplicarPresetFechasReporte(preset: Preset) {
  const periodos = sup.get().periodos;
  const periodo = periodos[estado.periodoIdx] || periodos[0];
  if (!periodo) return;
  const [y, m] = periodo.fin.split('-');
  if (preset === 'periodo') filtrosRep.set({ ini: '', fin: '', preset });
  else if (preset === 'quincena1') filtrosRep.set({ ini: periodo.inicio, fin: `${y}-${m}-10`, preset });
  else if (preset === 'quincena2') filtrosRep.set({ ini: `${y}-${m}-11`, fin: periodo.fin, preset });
  else if (preset === 'hoy') { const h = getLocalHoyStr(); filtrosRep.set({ ini: h, fin: h, preset }); }
}
