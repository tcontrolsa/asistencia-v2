// Contenedor de paneles (.panel / .panel.active del legado)
import { ReactNode } from 'react';
import { cambiarSubtabAsistencia } from '../nav';
import { useSup } from '../store';
import { ControlDiario } from './ControlDiario';
import { Dashboard } from './Dashboard';
import { PanelDetalle } from './Detalle';
import { Directorio } from './Directorio';
import { Mapa } from './Mapa';
import { Reportes } from './Reportes';
import { PanelOpciones } from './Opciones';
import { PanelServicios } from './Servicios';
import { PanelWhatsApp } from './WhatsApp';

function PanelBase({ id, activo, children }: { id: string; activo: boolean; children: ReactNode }) {
  return <div id={`panel-${id}`} className={`panel${activo ? ' active' : ''}`}>{activo ? children : null}</div>;
}

export function Paneles() {
  const panel = useSup(x => x.panel);
  return (
    <>
      <PanelBase id="dashboard" activo={panel === 'dashboard'}><Dashboard /></PanelBase>
      <PanelBase id="reportes" activo={panel === 'reportes'}><Reportes /></PanelBase>
      <PanelBase id="asistencia" activo={panel === 'asistencia'}><PanelAsistencia /></PanelBase>
      <PanelBase id="opciones" activo={panel === 'opciones'}><PanelOpciones /></PanelBase>
      <PanelBase id="servicios" activo={panel === 'servicios'}><PanelServicios /></PanelBase>
      <PanelBase id="whatsapp" activo={panel === 'whatsapp'}><PanelWhatsApp /></PanelBase>
      <PanelBase id="detalle" activo={panel === 'detalle'}><PanelDetalle /></PanelBase>
    </>
  );
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
