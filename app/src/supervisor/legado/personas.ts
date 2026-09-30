// Utilidades de personas del legado (supervisor_directorio.js): cumpleaños, edad, nombre corto, almuerzo de hoy.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { partes } from '../../lib/reloj';
import { getLocalHoyStr, normalizarFechaStr } from './util';

export function obtenerFechaNacimientoEmpleado(emp: any): string {
  if (!emp) return '';
  return String(emp.fechaNacimiento || emp.fecha_nacimiento || '').trim();
}

export function normalizarFechaParaInput(val: unknown): string {
  if (!val) return '';
  const s = String(val).trim().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return normalizarFechaStr(s);
}

// Fecha de hoy (Guayaquil, hora del servidor) como números
function hoyNum() {
  const p = partes();
  return { y: p.anio, m: p.mes - 1, d: p.dia };
}

export function calcularEdad(fechaVal: unknown): number | null {
  const norm = normalizarFechaParaInput(fechaVal);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(norm)) return null;
  const [anio, mesStr, dia] = norm.split('-').map(Number);
  const mes = mesStr - 1;
  const h = hoyNum();
  let edad = h.y - anio;
  const dm = h.m - mes;
  if (dm < 0 || (dm === 0 && h.d < dia)) edad--;
  return edad >= 0 && edad < 120 ? edad : null;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function formatearFechaNacimientoLegible(fechaVal: unknown): string {
  if (!fechaVal) return '';
  const norm = normalizarFechaParaInput(fechaVal);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(norm)) return String(fechaVal);
  const [yyyy, mm, dd] = norm.split('-');
  return `${parseInt(dd, 10)} ${MESES[parseInt(mm, 10) - 1] || mm} ${yyyy}`;
}

export interface EstadoCumple { esHoy: boolean; esProximo: boolean; diasFaltan: number; edad: number | null; fechaLegible: string }

export function obtenerEstadoCumpleanos(fechaVal: unknown): EstadoCumple | null {
  const norm = normalizarFechaParaInput(fechaVal);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(norm)) return null;
  const [anio, mesStr, dia] = norm.split('-').map(Number);
  const mes = mesStr - 1;
  const h = hoyNum();
  const hoyCero = Date.UTC(h.y, h.m, h.d);
  let proximo = Date.UTC(h.y, mes, dia);
  let anioProx = h.y;
  if (proximo < hoyCero) { proximo = Date.UTC(h.y + 1, mes, dia); anioProx = h.y + 1; }
  const diasFaltan = Math.round((proximo - hoyCero) / 86400000);
  return {
    esHoy: diasFaltan === 0, esProximo: diasFaltan > 0 && diasFaltan <= 30, diasFaltan,
    edad: !isNaN(anio) && anio > 1900 ? anioProx - anio : null, fechaLegible: formatearFechaNacimientoLegible(fechaVal),
  };
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');

// "APELLIDO APELLIDO NOMBRE NOMBRE" → "Nombre Apellido"
export function obtenerPrimerNombreYPrimerApellido(nombreCompleto: unknown): string {
  const clean = String(nombreCompleto || '').trim();
  if (!clean) return 'Colaborador';
  const p = clean.split(/\s+/);
  if (p.length === 1) return cap(p[0]);
  if (p.length === 2) return `${cap(p[1])} ${cap(p[0])}`;
  return `${cap(p[2])} ${cap(p[0])}`;
}

export function normalizarEstadoAlmuerzo(val: unknown): '' | 'SI' | 'NO' {
  const v = String(val || '').toUpperCase().trim();
  if (v === 'SI' || v === 'SÍ' || v === 'PLANTA') return 'SI';
  if (v === 'NO' || v === 'FUERA') return 'NO';
  return '';
}

export function resolverAlmuerzoHoyEmpleado(emp: any, targetFecha?: string): '' | 'SI' | 'NO' {
  if (!emp) return '';
  const fHoy = targetFecha || getLocalHoyStr();
  let val = emp.almuerzoHoy;
  if (!val && Array.isArray(emp.registros)) {
    const reg = emp.registros.find((r: any) => (r.tipo === 'ENTRADA' || r.tipo === 'SOLO_ALMUERZO' || r.tipo === 'ENTRADA_CAMPO') && normalizarFechaStr(r.fecha) === fHoy);
    if (reg && reg.almuerzo) val = reg.almuerzo;
  }
  return normalizarEstadoAlmuerzo(val);
}
