// Contenedor de paneles (.panel / .panel.active del legado)
import { ReactNode } from 'react';
import { s } from '../../lib/estilo';
import { cambiarSubtabAsistencia, cambiarSubtabServicios } from '../nav';
import { useSup } from '../store';
import { ControlDiario } from './ControlDiario';
import { PanelDetalle } from './Detalle';
import { Directorio } from './Directorio';
import { Mapa } from './Mapa';

function PanelBase({ id, activo, children }: { id: string; activo: boolean; children: ReactNode }) {
  return <div id={`panel-${id}`} className={`panel${activo ? ' active' : ''}`}>{activo ? children : null}</div>;
}

export function Paneles() {
  const panel = useSup(x => x.panel);
  return (
    <>
      <PanelBase id="dashboard" activo={panel === 'dashboard'}><Pendiente texto="Dashboard" /></PanelBase>
      <PanelBase id="reportes" activo={panel === 'reportes'}><Pendiente texto="Reportes" /></PanelBase>
      <PanelBase id="asistencia" activo={panel === 'asistencia'}><PanelAsistencia /></PanelBase>
      <PanelBase id="opciones" activo={panel === 'opciones'}><Pendiente texto="Opciones adicionales" /></PanelBase>
      <PanelBase id="servicios" activo={panel === 'servicios'}><PanelServicios /></PanelBase>
      <PanelBase id="whatsapp" activo={panel === 'whatsapp'}><Pendiente texto="Notificaciones WhatsApp" /></PanelBase>
      <PanelBase id="detalle" activo={panel === 'detalle'}><PanelDetalle /></PanelBase>
    </>
  );
}

function Pendiente({ texto }: { texto: string }) {
  return <div className="empty-state" style={s('padding:40px; text-align:center; color:#64748b;')}><i className="fas fa-person-digging" style={s('font-size:28px;')}></i><p>{texto}: en migración (Fase 5).</p></div>;
}

function PanelAsistencia() {
  const sub = useSup(x => x.subtabAsistencia);
  const boton = (id: 'control' | 'directorio' | 'mapa', icono: string, color: string, texto: string) => (
    <button type="button" className={`btn-subtab${sub === id ? ' active' : ''}`} id={`subtab-btn-asis-${id}`} onClick={() => cambiarSubtabAsistencia(id)}>
      <i className={icono} style={{ color }}></i> {texto}
    </button>
  );
  return (
    <>
      <div className="subtabs-header-bar" id="subtabsBarAsistencia">
        {boton('control', 'fas fa-clipboard-check', 'var(--green)', 'Control Diario')}
        {boton('directorio', 'fas fa-address-book', 'var(--blue)', 'Directorio')}
        {boton('mapa', 'fas fa-map-marked-alt', 'var(--red)', 'Mapa de Asistencia')}
      </div>
      {sub === 'control' && <ControlDiario />}
      {sub === 'directorio' && <Directorio />}
      {sub === 'mapa' && <Mapa />}
    </>
  );
}

function PanelServicios() {
  const sub = useSup(x => x.subtabServicios);
  const boton = (id: 'emergencias' | 'menu' | 'cultura' | 'invitados', icono: string, color: string, texto: string) => (
    <button type="button" className={`btn-subtab${sub === id ? ' active' : ''}`} id={`subtab-btn-serv-${id}`} onClick={() => cambiarSubtabServicios(id)}>
      <i className={icono} style={{ color }}></i> {texto}
    </button>
  );
  return (
    <>
      <div className="subtabs-header-bar" id="subtabsBarServicios">
        {boton('emergencias', 'fas fa-exclamation-triangle', 'var(--red)', 'Emergencias')}
        {boton('menu', 'fas fa-utensils', 'var(--amber)', 'Menú Semanal')}
        {boton('cultura', 'fas fa-lightbulb', 'var(--purple)', 'Cultura Tcontrol')}
        {boton('invitados', 'fas fa-user-friends', 'var(--blue)', 'Invitados & Catering')}
      </div>
      <Pendiente texto={sub} />
    </>
  );
}
