// Piezas comunes del panel: avisos (mostrarToast), foto del colaborador (photoCell) y confirmaciones.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useSyncExternalStore, useState } from 'react';
import { urlFoto } from '../../lib/api';
import { fixFotoUrl, getLocalHoyStr } from '../legado/util';

// ─── Avisos (#toast-container, 5 s) ───
interface Aviso { id: number; msg: string; tipo: string; enlace?: { url: string; texto: string } }
let avisos: Aviso[] = [];
const oyentes = new Set<() => void>();
let sec = 0;
export function mostrarToast(msg: string, tipo = '', enlace?: { url: string; texto: string }) {
  const id = ++sec;
  avisos = [...avisos, { id, msg, tipo, enlace }];
  oyentes.forEach(f => f());
  window.setTimeout(() => { avisos = avisos.filter(a => a.id !== id); oyentes.forEach(f => f()); }, 5000);
}
export function Avisos() {
  const lista = useSyncExternalStore(f => { oyentes.add(f); return () => { oyentes.delete(f); }; }, () => avisos);
  return <div id="toast-container">{lista.map(a => <div key={a.id} className={'toast-msg' + (a.tipo ? ' ' + a.tipo : '')}>{a.msg}{a.enlace && (
    <a href={a.enlace.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', color: 'white', fontWeight: 'bold', marginLeft: 6 }}>
      {a.enlace.texto} <i className="fas fa-external-link-alt"></i></a>)}</div>)}</div>;
}

export function fotoDe(e: any, size = 200): string | null {
  const u = urlFoto(e?.foto_url);
  return u ? fixFotoUrl(u, size) : null;
}

function ImgConRespaldo({ className, src, inicial, claseRespaldo }: { className: string; src: string | null; inicial: string; claseRespaldo: string }) {
  const [error, setError] = useState(false);
  if (!src || error) return <div className={claseRespaldo}>{inicial}</div>;
  return <img className={className} src={src} referrerPolicy="no-referrer" onError={() => setError(true)} alt="" />;
}

// Indicador de estado sobre el avatar (obtenerBadgeEstadoEmpleado)
export function BadgeEstadoEmpleado({ e }: { e: any }) {
  if (!e) return null;
  if (e.isVisitante) return <span className="status-indicator-badge status-visitante" title="Visitante / Extra"><i className="fas fa-id-badge"></i></span>;
  if (e.isSinAsistencia || (e.cargo || '').toUpperCase() === 'SIN ASISTENCIA') {
    return <span className="status-indicator-badge status-comedor" title="Sin Asistencia / Solo Comedor"><i className="fas fa-utensils"></i></span>;
  }
  if (e._salidaHoy || e.salidaHoy) return <span className="status-indicator-badge status-salio" title="Ya Salió (Jornada Concluida)"><i className="fas fa-door-open"></i></span>;
  let razon = e.razon_ausencia || e.razon_permiso || e._razonAusenciaHoy || '';
  if (!razon && Array.isArray(e.registros)) {
    const hoy = getLocalHoyStr();
    const fReg = e.registros.find((r: any) => {
      const t = String(r.tipo).toUpperCase();
      return t !== 'ENTRADA' && t !== 'SALIDA' && t !== 'ESTADO' && t !== 'SOLO_ALMUERZO' && r.fecha === hoy;
    });
    if (fReg) razon = fReg.razon_ausencia || fReg.razon_permiso || '';
  }
  const razonUpper = (razon || '').toUpperCase();
  if (razonUpper.includes('VACACI') || (e.estado || '').toUpperCase() === 'VACACIONES') {
    return <span className="status-indicator-badge status-vacaciones" title="De Vacaciones"><i className="fas fa-umbrella-beach"></i></span>;
  }
  if (razonUpper.includes('MÉDICO') || razonUpper.includes('MEDICO') || razonUpper.includes('SALUD')) {
    return <span className="status-indicator-badge status-medico" title="Permiso Médico"><i className="fas fa-file-medical"></i></span>;
  }
  if (razonUpper.includes('PERSONAL') || razonUpper.includes('CALAMIDAD') || razonUpper.includes('CUMPLEAÑ') || razonUpper.includes('JUSTIFICAD') || razonUpper.includes('PERMISO')) {
    return <span className="status-indicator-badge status-personal" title="Con Permiso / Justificado"><i className="fas fa-user-clock"></i></span>;
  }
  const modoStr = String(e._modoTexto || e.modo || '').toUpperCase();
  if (modoStr.includes('CAMPO') || razonUpper.includes('CAMPO')) {
    return <span className="status-indicator-badge status-campo" title="En Campo / Proyecto"><i className="fas fa-route"></i></span>;
  }
  if (e._entradaHoy || e.entradaHoy) return <span className="status-indicator-badge status-empresa" title="En Empresa / Planta"><i className="fas fa-building"></i></span>;
  return <span className="status-indicator-badge status-ausente" title="Ausente (Sin Registro)"><i className="fas fa-user-slash"></i></span>;
}

// photoCell(e, size) del legado
export function PhotoCell({ e, size }: { e: any; size?: 'large' | 'card' }) {
  const ini = (e.nombre?.charAt(0) || '?').toUpperCase();
  const src = fotoDe(e);
  if (size === 'large') return <ImgConRespaldo className="detail-photo" src={src} inicial={ini} claseRespaldo="detail-photo-placeholder" />;
  if (size === 'card') return <ImgConRespaldo className="employee-card-photo" src={src} inicial={ini} claseRespaldo="employee-card-photo-placeholder" />;
  return (
    <div className="avatar-status-wrapper">
      <ImgConRespaldo className="employee-photo" src={src} inicial={ini} claseRespaldo="employee-photo-placeholder" />
      <BadgeEstadoEmpleado e={e} />
    </div>
  );
}

export function errorTexto(e: unknown): string {
  return e instanceof Error ? e.message : String(e || 'Error');
}
