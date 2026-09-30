// Navegación del panel (cambiarPanel, cambiarSubtab*, mostrarDetalle, irADetalleFecha… del legado)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useSyncExternalStore } from 'react';
import { EstadoSup, Panel, sup } from './store';

export const TITULOS: Record<string, string> = {
  dashboard: 'Dashboard', reportes: 'Reporte Interactivo', asistencia: 'Control de Asistencia', servicios: 'Gestión & Servicios',
  detalle: 'Detalle de Empleado', opciones: 'Opciones adicionales', whatsapp: 'Notificaciones WhatsApp',
};

export function tituloActual(s: EstadoSup): string {
  if (s.panel === 'asistencia') {
    if (s.subtabAsistencia === 'directorio') return 'Asistencia — Directorio de Colaboradores';
    if (s.subtabAsistencia === 'mapa') return 'Asistencia — Mapa y Disponibilidad';
    return 'Control de Asistencia';
  }
  if (s.panel === 'servicios') {
    return ({ emergencias: 'Gestión & Servicios — Simulacros y Emergencias', menu: 'Gestión & Servicios — Menú Semanal',
      cultura: 'Gestión & Servicios — Cultura Tcontrol', invitados: 'Gestión & Servicios — Invitados & Catering' } as Record<string, string>)[s.subtabServicios];
  }
  return TITULOS[s.panel] || 'Supervisor';
}

export function cambiarPanel(panel: string) {
  // Alias históricos de subpestañas
  if (panel === 'directorio' || panel === 'mapa') { sup.set({ panel: 'asistencia', subtabAsistencia: panel }); return; }
  if (['emergencias', 'menu', 'cultura', 'invitados'].includes(panel)) { sup.set({ panel: 'servicios', subtabServicios: panel as any }); return; }
  sup.set({ panel: panel as Panel });
}

export function cambiarSubtabAsistencia(subtab: 'control' | 'directorio' | 'mapa') { sup.set({ subtabAsistencia: subtab || 'control' }); }
export function cambiarSubtabServicios(subtab: 'emergencias' | 'menu' | 'cultura' | 'invitados') { sup.set({ subtabServicios: subtab || 'emergencias' }); }

export function mostrarDetalle(id: string, indexPeriodo = 0, customInicio: string | null = null, customFin: string | null = null, fechaEnfocar: string | null = null) {
  const s = sup.get();
  sup.set({
    panelOrigenDetalle: s.panel !== 'detalle' ? s.panel : s.panelOrigenDetalle,
    panel: 'detalle',
    detalle: { id, indexPeriodo, customInicio, customFin, fechaEnfocar },
  });
}

export function volverAAsistencia() {
  const s = sup.get();
  if (s.panelOrigenDetalle === 'asistencia' && s.subtabAsistencia === 'directorio') sup.set({ panel: 'asistencia', subtabAsistencia: 'directorio' });
  else sup.set({ panel: s.panelOrigenDetalle === 'detalle' ? 'asistencia' : s.panelOrigenDetalle });
}

export function irADetalleFecha(empleadoId: string, fechaIso: string) {
  cerrarModal('desgloseHistorico');
  const periodos = sup.get().periodos;
  let idxPer = 0;
  if (fechaIso) {
    const found = periodos.findIndex(p => fechaIso >= p.inicio && fechaIso <= p.fin);
    if (found >= 0) idxPer = found;
    else {
      const foundClosest = periodos.findIndex(p => fechaIso >= p.inicio);
      if (foundClosest >= 0) idxPer = foundClosest;
    }
  }
  mostrarDetalle(empleadoId, idxPer, null, null, fechaIso);
}

// ─── Modales (varios pueden estar abiertos, p. ej. WhatsApp sobre gestión de jornada) ───
export type NombreModal = 'jornada' | 'manual' | 'futuro' | 'campo' | 'extraLunch' | 'justificar' | 'editarEmp' | 'nuevoEmp'
  | 'waIndividual' | 'waSinMarcar' | 'waPlantilla' | 'desgloseInasistencias' | 'desgloseHistorico' | 'desgloseVacaciones'
  | 'mapaDia' | 'culturaPregunta' | 'avisoPrivacidad' | 'resetPassword';
let modales: Partial<Record<NombreModal, any>> = {};
const oyentes = new Set<() => void>();
export function abrirModal(nombre: NombreModal, datos: any = {}) { modales = { ...modales, [nombre]: datos }; oyentes.forEach(f => f()); }
export function cerrarModal(nombre: NombreModal) {
  if (!(nombre in modales)) return;
  const copia = { ...modales };
  delete copia[nombre];
  modales = copia;
  oyentes.forEach(f => f());
}
export function useModal<T = any>(nombre: NombreModal): T | undefined {
  return useSyncExternalStore(f => { oyentes.add(f); return () => { oyentes.delete(f); }; }, () => modales[nombre]);
}
