// Estado del panel de supervisor (equivalente a empCache, periodos, panelActual… del legado).
// Un solo almacén con suscripción; los componentes leen con useSup(selector).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useSyncExternalStore } from 'react';
import { rpc } from '../lib/api';
import { leerClaims } from '../lib/sesion';
import { sincronizarReloj } from '../lib/reloj';
import { Emp, PeriodoPago, Reg, fijarFeriados, generarPeriodos, getLocalHoyStr, normalizarFechaStr, sumarDias } from './legado/util';

export type RolSup = 'ADMIN_MASTER' | 'SUPERVISOR_ADMIN' | 'SUPERVISOR' | 'EMPLEADO';
export type Panel = 'asistencia' | 'dashboard' | 'reportes' | 'servicios' | 'whatsapp' | 'opciones' | 'detalle';

export interface VacacionesEmp { tomadas: number; restantes: number; adjudicadas: number; saldo_anterior: number; total: number; anios_servicio: number }

export interface DetalleSel { id: string; indexPeriodo: number; customInicio: string | null; customFin: string | null; fechaEnfocar: string | null }

export interface EstadoSup {
  cargado: boolean;
  desde: string;                        // primer día cargado en empCache
  empCache: Emp[];                      // activos
  empEliminados: Emp[];                 // inactivos, desvinculados o sin ficha
  solicitudesInvitados: any[];
  emergencia: { activa: boolean; nombre: string; habilitadoPor: string; fecha: string };
  vacaciones: Record<string, VacacionesEmp>;
  periodos: PeriodoPago[];
  lastUpdate: string;
  panel: Panel;
  panelOrigenDetalle: Panel;
  subtabAsistencia: 'control' | 'directorio' | 'mapa';
  subtabServicios: 'emergencias' | 'menu' | 'cultura' | 'invitados';
  detalle: DetalleSel | null;
  loader: { visible: boolean; texto: string; subtexto: string };
  bgSync: boolean;
  version: number;                      // cambia en cada mutación de datos
}

let estado: EstadoSup = {
  cargado: false, desde: '', empCache: [], empEliminados: [], solicitudesInvitados: [],
  emergencia: { activa: false, nombre: '', habilitadoPor: '', fecha: '' }, vacaciones: {}, periodos: generarPeriodos(),
  lastUpdate: '--:--:--', panel: 'asistencia', panelOrigenDetalle: 'asistencia', subtabAsistencia: 'control',
  subtabServicios: 'emergencias', detalle: null, loader: { visible: false, texto: 'Cargando datos...', subtexto: 'Sincronizando información en tiempo real' },
  bgSync: false, version: 0,
};
const oyentes = new Set<() => void>();

export const sup = {
  get: () => estado,
  set(parcial: Partial<EstadoSup>) { estado = { ...estado, ...parcial }; oyentes.forEach(f => f()); },
  tocar() { estado = { ...estado, version: estado.version + 1 }; oyentes.forEach(f => f()); },
  subscribe(f: () => void) { oyentes.add(f); return () => { oyentes.delete(f); }; },
};

export function useSup<T>(sel: (s: EstadoSup) => T): T {
  return useSyncExternalStore(sup.subscribe, () => sel(estado));
}

// Rol del panel a partir de la sesión (roles en la base, no en el código)
export function rolSesion(): RolSup {
  const r = leerClaims()?.role;
  if (r === 'admin') return 'ADMIN_MASTER';
  if (r === 'supervisor_admin') return 'SUPERVISOR_ADMIN';
  if (r === 'supervisor') return 'SUPERVISOR';
  return 'EMPLEADO';
}
export const esAdminMaster = () => rolSesion() === 'ADMIN_MASTER';
export const tienePermisoAdmin = () => ['ADMIN_MASTER', 'SUPERVISOR_ADMIN'].includes(rolSesion());
export const idSesion = () => leerClaims()?.empleado_id || leerClaims()?.usuario || '';

export function buscarEmpleado(id: string): Emp | undefined {
  const k = String(id).trim();
  return estado.empCache.find(x => String(x.id).trim() === k) || estado.empEliminados.find(x => String(x.id).trim() === k);
}

// ─── Armado de datos como obtenerDatosSupervisor del legado ───
function dedup(regs: Reg[]): Reg[] {
  const seen = new Set<string>();
  return regs.filter(r => {
    const key = `${r.fecha}|${r.tipo}|${(r.hora || '').slice(0, 5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function solicitudLegado(s: any) {
  return {
    ...s, hora: s.hora ? String(s.hora).slice(0, 8) : '', tipoSolicitud: s.tipo_solicitud, empleadoId: s.empleado_id || '',
    empleadoNombre: s.empleado_nombre || '', empleadoArea: s.empleado_area || '', horaServicio: s.hora_servicio || '',
    observacionesCompletas: s.observaciones_completas || '',
  };
}

export function armarEmpleados(fichas: any[], registros: Reg[]) {
  const hoy = getLocalHoyStr();
  const activos: Record<string, Emp> = {};
  const eliminados: Record<string, Emp> = {};
  fichas.forEach(f => {
    const item: Emp = { ...f, registros: [], entradaHoy: false, salidaHoy: false };
    if (f.activo === 'SI') activos[f.id] = item;
    else eliminados[f.id] = { ...item, nombre: f.nombre || `Colaborador (${f.id})`, area: f.area || (f.esDesvinculado ? 'Desvinculado' : 'Inactivo'),
                              cargo: f.cargo || (f.esDesvinculado ? 'Desvinculado' : 'Inactivo'), esEliminado: true };
  });
  registros.forEach(reg => {
    const eid = String(reg.empleadoId || '').trim();
    if (!eid) return;
    reg.fecha = normalizarFechaStr(reg.fecha);
    const vAlm = (reg.almuerzo || '').toString().trim().toUpperCase();
    reg.almuerzo = (vAlm === 'SI' || vAlm === 'SÍ' || vAlm === 'PLANTA') ? 'SI' : ((vAlm === 'NO' || vAlm === 'FUERA') ? 'NO' : '');
    const e = activos[eid];
    if (e) {
      e.registros.push(reg);
      if (reg.fecha === hoy) {
        if (reg.tipo === 'ENTRADA') {
          e.entradaHoy = true;
          e.horaEntrada = reg.hora;
          e.horaEntradaMs = reg.hora;
          if (!e.almuerzoHoy) e.almuerzoHoy = reg.almuerzo;
        }
        if (reg.tipo === 'SOLO_ALMUERZO' && !e.almuerzoHoy) e.almuerzoHoy = reg.almuerzo;
        if (reg.tipo === 'SALIDA') {
          e.salidaHoy = true;
          e.horaSalida = reg.hora;
          e.horaSalidaMs = reg.hora;
        }
      }
    } else {
      const el = (eliminados[eid] ||= { id: eid, nombre: `Colaborador (${eid})`, area: 'Eliminado', cargo: 'Eliminado', esEliminado: true,
                                         activo: false, registros: [], entradaHoy: false, salidaHoy: false });
      el.registros.push(reg);
    }
  });
  Object.values(activos).forEach(emp => {
    emp.registros = dedup(emp.registros);
    // Si ya registró su salida antes de las 09:30, sin almuerzo (R-14)
    if (emp.salidaHoy && emp.horaSalida) {
      const parts = String(emp.horaSalida).split(':');
      if (parseInt(parts[0]) * 60 + parseInt(parts[1]) < 570) emp.almuerzoHoy = 'NO';
    }
  });
  Object.values(eliminados).forEach(emp => { emp.registros = dedup(emp.registros); });
  const porNombre = (a: Emp, b: Emp) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
  return { empCache: Object.values(activos).sort(porNombre), empEliminados: Object.values(eliminados).sort(porNombre) };
}

let cargando = false;
export async function cargarDatosCompletos(opciones: { silencioso?: boolean } = {}) {
  if (cargando) return;
  cargando = true;
  const tieneDatos = estado.empCache.length > 0;
  const loaderPantalla = !opciones.silencioso && !tieneDatos;
  if (loaderPantalla) mostrarLoader(true); else sup.set({ bgSync: true });
  try {
    const d = await rpc<any>('sup_datos', {});
    sincronizarReloj(d.ahora);
    fijarFeriados((d.feriados || []).map((f: any) => f.fecha));
    const { empCache, empEliminados } = armarEmpleados(d.empleados || [], d.registros || []);
    const ahora = new Date();
    sup.set({
      cargado: true, desde: d.desde, empCache, empEliminados, solicitudesInvitados: (d.solicitudesInvitados || []).map(solicitudLegado),
      emergencia: d.emergencia, vacaciones: d.vacaciones || {}, periodos: generarPeriodos(d.hoy),
      lastUpdate: ahora.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guayaquil' }),
      version: estado.version + 1,
    });
  } finally {
    cargando = false;
    if (loaderPantalla) mostrarLoader(false);
    sup.set({ bgSync: false });
  }
}

// Registros anteriores a la carga inicial (historial del detalle y reportes de períodos pasados)
const rangosCargados = new Set<string>();
export async function asegurarRegistros(desde: string, hasta: string, empleadoId?: string): Promise<boolean> {
  if (!estado.desde || desde >= estado.desde) return false;
  const fin = hasta < estado.desde ? hasta : sumarDias(estado.desde, -1);
  const clave = `${empleadoId || '*'}|${desde}|${fin}`;
  if (rangosCargados.has(clave)) return false;
  rangosCargados.add(clave);
  const regs = await rpc<Reg[]>('sup_registros', { p_desde: desde, p_hasta: fin, p_empleado_id: empleadoId ?? null });
  const nuevos: Record<string, Reg[]> = {};
  regs.forEach(r => { (nuevos[r.empleadoId] ||= []).push(r); });
  [...estado.empCache, ...estado.empEliminados].forEach(e => {
    const extra = nuevos[e.id];
    if (!extra) return;
    const ids = new Set(e.registros.map(r => r.id));
    e.registros = dedup([...e.registros, ...extra.filter(r => !ids.has(r.id))]);
  });
  sup.tocar();
  return true;
}

// Solicitudes de invitados de un rango (la carga inicial trae solo las 300 más recientes)
const rangosSolicitudes = new Set<string>();
export async function asegurarSolicitudes(desde: string, hasta: string): Promise<boolean> {
  const clave = `${desde}|${hasta}`;
  if (rangosSolicitudes.has(clave)) return false;
  const actuales = estado.solicitudesInvitados;
  const masAntigua = actuales.reduce((min: string, x: any) => (!min || x.fecha < min ? x.fecha : min), '');
  if (actuales.length < 300 || (masAntigua && desde >= masAntigua)) return false;
  rangosSolicitudes.add(clave);
  const lista = await rpc<any[]>('sup_solicitudes_invitados', { p_desde: desde, p_hasta: hasta });
  const ids = new Set(actuales.map((x: any) => x.id));
  const nuevas = lista.filter(x => !ids.has(x.id)).map(solicitudLegado);
  if (nuevas.length) sup.set({ solicitudesInvitados: [...actuales, ...nuevas] });
  return nuevas.length > 0;
}

let watchdog: number | undefined;
export function mostrarLoader(show: boolean, texto = 'Cargando datos...', subtexto = 'Sincronizando información en tiempo real') {
  if (watchdog) { clearTimeout(watchdog); watchdog = undefined; }
  sup.set({ loader: { visible: show, texto, subtexto } });
  // Watchdog de seguridad del legado: nunca congelar más de 12 s
  if (show) watchdog = window.setTimeout(() => sup.set({ loader: { ...estado.loader, visible: false } }), 12000);
}
