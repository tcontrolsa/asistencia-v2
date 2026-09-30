// Utilidades del panel de supervisor portadas 1:1 de JS/supervisor_core.js (legado).
// Se conservan los mismos nombres y reglas para que los cálculos den los mismos números.
import { hoyStr } from '../../lib/reloj';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Reg = Record<string, any> & { fecha?: string; hora?: string; tipo?: string };
export type Emp = Record<string, any> & { id: string; nombre: string; registros: Reg[] };

export const HORA_ENTRADA_REF = 450; // 7:30
export const HORA_SALIDA_REF = 975;  // 16:15

// Feriados de core.feriados (D-17); el legado los tenía escritos en esFeriadoODomingo
let feriados = new Set<string>();
export function fijarFeriados(lista: string[]) { feriados = new Set(lista); }

export function getLocalHoyStr(): string { return hoyStr(); }

// "Día de la semana" de una fecha YYYY-MM-DD sin depender de la zona del navegador
export function diaSemana(fechaStr: string): number {
  const [y, m, d] = fechaStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function sumarDias(fechaStr: string, n: number): string {
  const [y, m, d] = fechaStr.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}

export function escapeHtml(str: unknown): string {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function obtenerMinutos(valor: unknown): number | null {
  if (!valor) return null;
  if (typeof valor === 'number') {
    if (valor > 0 && valor < 1) {
      const s = Math.round(valor * 86400);
      return Math.floor(s / 3600) * 60 + Math.floor((s % 3600) / 60);
    }
    return null;
  }
  if (typeof valor === 'string') {
    const s = valor.trim();
    if (!s) return null;
    const ampmMatch = s.match(/(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)/i);
    const m12 = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m12) {
      let h = parseInt(m12[1], 10);
      const m = parseInt(m12[2], 10);
      if (ampmMatch) {
        const isPm = /p/i.test(ampmMatch[1]);
        const isAm = /a/i.test(ampmMatch[1]);
        if (isPm && h < 12) h += 12;
        if (isAm && h === 12) h = 0;
      }
      return h * 60 + m;
    }
  }
  return null;
}

export function minsToHHMM(mins: number | null | undefined): string {
  if (mins === null || mins === undefined || isNaN(mins)) return '--:--';
  const h = Math.floor(Math.abs(Math.round(mins)) / 60);
  const m = Math.abs(Math.round(mins)) % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function formatearHora(valor: unknown): string {
  const m = obtenerMinutos(valor);
  if (m === null || isNaN(m)) return '--:--';
  return minsToHHMM(m);
}

export function calcularPct(v: number, t: number): number { return t ? Math.round((v / t) * 100) : 0; }

export function formatearMinutos(min: number): string {
  if (!min) return '0m';
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  return h ? h + 'h ' + m + 'm' : m + 'm';
}

export function formatearHorasDecimal(minutos: number): string {
  if (!minutos) return '0.00';
  return (minutos / 60).toFixed(2);
}

export function minutosAHHMMSS(minutos: number): string {
  if (!minutos || minutos < 0) return '00:00:00';
  const horas = Math.floor(minutos / 60);
  const mins = Math.floor(minutos % 60);
  const segs = Math.floor((minutos % 1) * 60);
  return String(horas).padStart(2, '0') + ':' + String(mins).padStart(2, '0') + ':' + String(segs).padStart(2, '0');
}

export interface Periodo { entrada: Reg | null; salida: Reg | null }

export function calcularNetWorkedOrdinario(periodosDia: Periodo[], esFestivo: boolean): number {
  if (esFestivo) return 0;
  let ordBruto = 0;
  let hasLunchGap = false;
  let ultimoSalidaMins: number | null = null;
  periodosDia.forEach(p => {
    if (!p || !p.entrada || !p.salida) return;
    const mE = obtenerMinutos(p.entrada.hora || p.entrada.timestamp);
    const mS = obtenerMinutos(p.salida.hora || p.salida.timestamp);
    if (mE === null || mS === null || mS <= mE) return;
    if (ultimoSalidaMins !== null && mE > ultimoSalidaMins) {
      if (!hasLunchGap && ultimoSalidaMins >= 690 && ultimoSalidaMins <= 870) {
        const gap = mE - ultimoSalidaMins;
        if (gap >= 30) hasLunchGap = true;
      }
    }
    ultimoSalidaMins = mS;
    const ordE = Math.max(HORA_ENTRADA_REF, mE);
    const ordS = Math.min(HORA_SALIDA_REF, mS);
    if (ordS > ordE) ordBruto += (ordS - ordE);
  });
  let ordNeto = ordBruto;
  if (!hasLunchGap && ordNeto > 240) ordNeto -= 45;
  return Math.max(0, ordNeto);
}

export function esFeriadoODomingo(fechaStr: string | null | undefined): boolean {
  if (!fechaStr) return false;
  if (diaSemana(fechaStr) === 0) return true;
  return feriados.has(fechaStr);
}

export function esEmpleadoSoloAlmuerzo(e: any): boolean {
  if (!e) return false;
  if (e.isSinAsistencia || e.isVisitante) return true;
  const cargo = String(e.cargo || '').toUpperCase().trim();
  const area = String(e.area || e.departamento || '').toUpperCase().trim();
  const tipo = String(e.tipo || e.tipoRegistro || '').toUpperCase().trim();
  if (cargo === 'SIN ASISTENCIA' || cargo.includes('SIN ASISTENCIA') || cargo.includes('SOLO ALMUERZO') || cargo.includes('COMENSAL')) return true;
  if (area.includes('SOLO ALMUERZO') || area.includes('COMENSAL')) return true;
  if (tipo.includes('SOLO ALMUERZO') || tipo.includes('COMENSAL')) return true;
  if (e.soloAlmuerzo === true || String(e.soloAlmuerzo).toUpperCase() === 'SI') return true;
  return false;
}

export function esEmpleadoExcluidoAsistencia(e: any): boolean {
  if (!e) return true;
  if (esEmpleadoSoloAlmuerzo(e)) return true;
  const tipo = String(e.tipoRegistro || e.tipo || '').toUpperCase();
  return tipo === 'MASTER' || tipo === 'VISITANTE';
}

export function esEmpleadoPasante(e: any): boolean {
  if (!e) return false;
  const cargo = String(e.cargo || e.tipo_cargo || e.rol || '').toUpperCase().trim();
  const area = String(e.area || e.departamento || '').toUpperCase().trim();
  const tipo = String(e.tipo || e.tipoRegistro || e.tipo_empleado || '').toUpperCase().trim();
  if (cargo.includes('PASANTE') || cargo.includes('PASANTIA') || cargo.includes('PASANTÍA')) return true;
  if (area.includes('PASANTE') || area.includes('PASANTIA') || area.includes('PASANTÍA')) return true;
  if (tipo.includes('PASANTE') || tipo.includes('PASANTIA') || tipo.includes('PASANTÍA')) return true;
  return false;
}

export function fixFotoUrl(url: string | null | undefined, size = 200): string | null {
  if (!url) return null;
  url = url.trim();
  if (url.startsWith('data:image') || url.startsWith('blob:') || url.startsWith('/') || url.startsWith('./')) return url;
  if (url.includes('googleusercontent.com/d/')) return url.includes('=') ? url : `${url}=w${size}`;
  if (url.includes('drive.google.com/file/d/')) {
    const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return `https://lh3.googleusercontent.com/d/${m[1]}=w${size}`;
  }
  if (url.includes('drive.google.com/open?id=') || url.includes('/uc?export=view&id=') || url.includes('/uc?id=') || url.includes('id=')) {
    const m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) return `https://lh3.googleusercontent.com/d/${m[1]}=w${size}`;
  }
  if (url.includes('/d/')) {
    const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return `https://lh3.googleusercontent.com/d/${m[1]}=w${size}`;
  }
  return url;
}

export interface PeriodoPago { inicio: string; fin: string; label: string }

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

// Períodos del 26 al 25 (R-16); el actual primero, 12 en total
export function generarPeriodos(hoy = getLocalHoyStr()): PeriodoPago[] {
  const [y, m, d] = hoy.split('-').map(Number);
  let baseMonth = m - 1;
  if (d >= 26) baseMonth += 1;
  const lista: PeriodoPago[] = [];
  const f = (yy: number, mm: number, dd: number) => {
    const x = new Date(Date.UTC(yy, mm, dd));
    return { s: `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`, d: x };
  };
  for (let i = 0; i < 12; i++) {
    const ini = f(y, baseMonth - i - 1, 26);
    const fin = f(y, baseMonth - i, 25);
    const label = `${ini.d.getUTCDate()} ${MESES_CORTOS[ini.d.getUTCMonth()]} — ${fin.d.getUTCDate()} ${MESES_CORTOS[fin.d.getUTCMonth()]} ${fin.d.getUTCFullYear()}`;
    lista.push({ inicio: ini.s, fin: fin.s, label: i === 0 ? '⭐ ' + label + ' (Actual)' : label });
  }
  return lista;
}

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export function obtenerDiaSemanaStr(fechaStr: string): string {
  if (!fechaStr || !/^\d{4}-\d{2}-\d{2}/.test(fechaStr)) return '';
  return DIAS_SEMANA[diaSemana(fechaStr.slice(0, 10))];
}

export function normalizarFechaStr(val: unknown): string {
  if (!val || val === 'undefined') return '';
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mYMD = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (mYMD) return `${mYMD[1]}-${mYMD[2].padStart(2, '0')}-${mYMD[3].padStart(2, '0')}`;
  const m1 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
  return s;
}

export function obtenerDiasHabiles(inicio: string, fin: string): string[] {
  const dias: string[] = [];
  let f = inicio;
  while (f <= fin) {
    const dia = diaSemana(f);
    if (dia >= 1 && dia <= 5 && !esFeriadoODomingo(f)) dias.push(f);
    f = sumarDias(f, 1);
  }
  return dias;
}

// Fecha real de inicio del colaborador (evita inasistencias antes de su ingreso)
export function obtenerFechaInicioEfectivaEmpleado(e: any, rangoIniFallback: string): string {
  if (!e) return rangoIniFallback;
  const fIngRaw = e.fecha_ingreso || e.fechaIngreso || e.fecha_inicio || e.fechaInicio;
  if (fIngRaw && String(fIngRaw).trim().length >= 10) {
    const fi = normalizarFechaStr(fIngRaw);
    if (fi && /^\d{4}-\d{2}-\d{2}$/.test(fi) && fi >= '2020-01-01') return fi;
  }
  const regs: Reg[] = Array.isArray(e.registros) ? e.registros : [];
  if (regs.length > 0) {
    const fechasReg = regs.map(r => normalizarFechaStr(r.fecha))
      .filter(f => f && /^\d{4}-\d{2}-\d{2}$/.test(f) && f >= '2020-01-01').sort();
    if (fechasReg.length > 0) return fechasReg[0];
  }
  return getLocalHoyStr();
}

export function clasificarGap(salidaReg: Reg | null, gap: number): { tipo: 'medico' | 'personal' | 'justificar'; mins: number } {
  if (!salidaReg) return { tipo: 'justificar', mins: gap };
  const razon = String(salidaReg.razon_salida || '').toLowerCase();
  const tipo = String(salidaReg.tipo_salida || '').toLowerCase();
  const razonPermiso = String(salidaReg.razon_permiso || '').toLowerCase();
  if (razon === 'permiso_medico' || tipo.includes('medico') || razonPermiso.includes('medico')) return { tipo: 'medico', mins: gap };
  if (razon === 'permiso_personal' || razon === 'cumpleanos' || tipo.includes('personal') || razonPermiso.includes('personal')) return { tipo: 'personal', mins: gap };
  return { tipo: 'justificar', mins: gap };
}

export function mapRazonAusenciaATipo(razon: string): string {
  if (!razon) return 'FALTA';
  const r = razon.toString().trim().toLowerCase();
  if (r.includes('vacación') || r.includes('vacacion') || r.includes('vacaciones')) return 'VACACIONES';
  if (r.includes('médico') || r.includes('medico')) return 'PERMISO_MEDICO';
  if (r.includes('personal')) return 'PERMISO_PERSONAL';
  if (r.includes('falta justificada') || r.includes('salida justificada')) return 'FALTA_JUSTIFICADA';
  if (r.includes('doméstica') || r.includes('domestica') || r.includes('calamidad')) return 'CALAMIDAD_DOMESTICA';
  if (r.includes('campo')) return 'TRABAJO_DE_CAMPO';
  return r.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, '_');
}

// parsearInputTiempo: acepta "60", "1h", "1:30", "1h30m" → minutos
export function parsearInputTiempo(str: unknown): number | null {
  const s = String(str || '').trim().toLowerCase();
  const mh = s.match(/^(\d+)h(?:(\d+)m?)?$/);
  if (mh) return parseInt(mh[1]) * 60 + parseInt(mh[2] || '0');
  const mc = s.match(/^(\d+):(\d{1,2})$/);
  if (mc) return parseInt(mc[1]) * 60 + parseInt(mc[2]);
  const n = parseInt(s);
  return isNaN(n) ? null : n;
}

export function calcularAlmuerzosPeriodo(e: Emp, R_INI: string, R_FIN: string): { almPlanta: number; almFuera: number } {
  const todosRegs = (e.registros || []).map(r => {
    const fNorm = normalizarFechaStr(r.fecha);
    return fNorm ? { ...r, fecha: fNorm } : r;
  });
  const regsPeriodo = todosRegs.filter(r => r.fecha! >= R_INI && r.fecha! <= R_FIN);
  const fechasAsistidas = new Set(regsPeriodo.filter(r => r.tipo === 'ENTRADA').map(r => normalizarFechaStr(r.fecha)).filter(Boolean));
  const esSinAsis = (e.cargo || '').toUpperCase() === 'SIN ASISTENCIA';
  let almPlanta = 0;
  let almFuera = 0;
  const regsPorFecha: Record<string, Reg[]> = {};
  regsPeriodo.forEach(r => {
    const fNorm = normalizarFechaStr(r.fecha);
    if (!fNorm) return;
    (regsPorFecha[fNorm] ||= []).push(r);
  });
  Object.keys(regsPorFecha).forEach(fNorm => {
    if (!fechasAsistidas.has(fNorm) && !esSinAsis) return;
    const regsDia = regsPorFecha[fNorm];
    const salidaTemprana = regsDia.some(r => {
      if (r.tipo === 'SALIDA' && r.hora) {
        const parts = r.hora.split(':');
        return parseInt(parts[0]) * 60 + parseInt(parts[1]) < 570;
      }
      return false;
    });
    if (salidaTemprana) { almFuera++; return; }
    const regsAlm = regsDia.filter(r => r.tipo === 'ENTRADA' || r.tipo === 'SOLO_ALMUERZO');
    const regPrincipal = regsAlm.find(r => r.tipo === 'ENTRADA') || regsAlm[0];
    if (regPrincipal) {
      const valAlm = regPrincipal.almuerzo;
      if (valAlm === 'SI' || valAlm === 'PLANTA') almPlanta++;
      else if (valAlm === 'NO' || valAlm === 'FUERA') almFuera++;
    }
  });
  return { almPlanta, almFuera };
}

// ─── Invitados y almuerzos extra (obtenerListaConsolidadaInvitados) ───
export function desglosarObservacionesInvitado(rawObs: unknown) {
  let obs = String(rawObs || '').trim();
  let horaReq = '', area = '', sol = '';
  const matchHora = obs.match(/\[Hora\s*req:\s*([^\]]+)\]/i);
  if (matchHora) { horaReq = matchHora[1].trim(); obs = obs.replace(matchHora[0], '').trim(); }
  const matchArea = obs.match(/\[Área:\s*([^\]]+)\]/i) || obs.match(/\[Area:\s*([^\]]+)\]/i);
  if (matchArea) { area = matchArea[1].trim(); obs = obs.replace(matchArea[0], '').trim(); }
  const matchSol = obs.match(/\(Sol:\s*([^)]+)\)/i);
  if (matchSol) { sol = matchSol[1].trim(); obs = obs.replace(matchSol[0], '').trim(); }
  obs = obs.replace(/\s{2,}/g, ' ').trim();
  return { obsLimpia: obs, horaReq, area, sol };
}

export function esAlmuerzoExtraItem(ae: any): boolean {
  if (!ae) return false;
  if (ae.estado === 'CANCELADO') return false;
  const t = String(ae.subtipo || ae.tipoSolicitud || ae.tipo || '').toUpperCase();
  return !t.includes('REFRIGERIO') && !t.includes('SANDUCHE') && !t.includes('GALLETA');
}

export interface InvitadoConsolidado {
  id: string; fecha: string; hora: string; solicitante: string; empleadoId: string; area: string; tipoSolicitud: string;
  subtipo: string; cantidad: number; invitado: string; empresa: string; horaServicio: string; observaciones: string;
  estado: string; origen: string; filaIndex: null
}

export function obtenerListaConsolidadaInvitados(solicitudes: any[]): InvitadoConsolidado[] {
  const lista: InvitadoConsolidado[] = [];
  (solicitudes || []).forEach(s => {
    if (s.estado === 'CANCELADO') return;
    const id = s.id || `inv_${s.fecha}_${s.hora}_${s.empleadoId}`;
    const fNorm = normalizarFechaStr(s.fecha) || s.fecha;
    let invitadoLimpio = (s.invitado || '').trim() || 'Invitado';
    let solicitanteDetectado = s.empleadoNombre || 'Colaborador';
    const matchInvS = invitadoLimpio.match(/^(.*?)\s*\(Inv\.\s*de\s*(.*?)\)$/i);
    if (matchInvS) {
      invitadoLimpio = matchInvS[1].trim();
      if (!s.empleadoNombre || s.empleadoNombre === 'Colaborador') solicitanteDetectado = matchInvS[2].trim();
    }
    const desg = desglosarObservacionesInvitado(s.observaciones || s.observacionesCompletas || '');
    lista.push({
      id, fecha: fNorm, hora: s.hora || '', solicitante: solicitanteDetectado || desg.sol || 'Colaborador',
      empleadoId: s.empleadoId || '', area: s.empleadoArea || desg.area || '',
      tipoSolicitud: s.tipoSolicitud || 'ALMUERZO_EXTRA', subtipo: s.subtipo || s.tipoSolicitud || 'ALMUERZO_EXTRA',
      cantidad: parseInt(s.cantidad) || 1, invitado: invitadoLimpio, empresa: s.empresa || 'TCONTROL',
      horaServicio: s.horaServicio || desg.horaReq || '', observaciones: desg.obsLimpia || '',
      estado: s.estado || 'SOLICITADO', origen: 'FIRESTORE', filaIndex: null,
    });
  });
  lista.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.hora || '').localeCompare(a.hora || ''));
  return lista;
}

export function obtenerAlmuerzosExtraConsolidados(solicitudes: any[], fechaInicio: string | null = null, fechaFin: string | null = null) {
  const fIniNorm = fechaInicio ? normalizarFechaStr(fechaInicio) : null;
  const fFinNorm = fechaFin ? normalizarFechaStr(fechaFin) : null;
  return obtenerListaConsolidadaInvitados(solicitudes).filter(item => {
    if (item.estado === 'CANCELADO') return false;
    if (!esAlmuerzoExtraItem(item)) return false;
    const fNorm = normalizarFechaStr(item.fecha);
    if (!fNorm) return false;
    if (fIniNorm && fNorm < fIniNorm) return false;
    if (fFinNorm && fNorm > fFinNorm) return false;
    return true;
  });
}

// Literal seguro para textos del legado que usaban prompt/confirm
export function debounce<T extends (...a: any[]) => void>(fn: T, delay: number): T {
  let t: number | undefined;
  return ((...args: any[]) => { if (t) clearTimeout(t); t = window.setTimeout(() => fn(...args), delay); }) as T;
}
