// Gestión & Servicios (#panel-servicios): Emergencias, Menú Semanal, Cultura Tcontrol e Invitados & Catering
// (supervisor_emergencias.js, cargarMenuSemanal…, supervisor_cultura.js, supervisor_invitados.js).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react';
import { rpc } from '../../lib/api';
import { s } from '../../lib/estilo';
import { descargarExcel } from '../excel';
import { InvitadoConsolidado, getLocalHoyStr, normalizarFechaStr, obtenerListaConsolidadaInvitados, sumarDias } from '../legado/util';
import { abrirModal, cambiarSubtabServicios } from '../nav';
import { cargarDatosCompletos, mostrarLoader, rolSesion, sup, useSup } from '../store';
import { errorTexto, mostrarToast } from './comun';

type Subtab = 'emergencias' | 'menu' | 'cultura' | 'invitados';

export function PanelServicios() {
  const sub = useSup(x => x.subtabServicios);
  useSup(x => x.version);
  const badge = badgeInvitados();
  const boton = (id: Subtab, icono: string, color: string, texto: string, extra?: React.ReactNode) => (
    <button type="button" className={`btn-subtab${sub === id ? ' active' : ''}`} id={`subtab-btn-serv-${id}`} onClick={() => cambiarSubtabServicios(id)}>
      <i className={icono} style={s(`color:${color};`)}></i> {texto}{extra}
    </button>
  );
  return (
    <>
      <div className="subtabs-header-bar" id="subtabsBarServicios">
        {boton('emergencias', 'fas fa-exclamation-triangle', '#ef4444', 'Emergencias')}
        {boton('menu', 'fas fa-utensils', 'var(--green)', 'Menú Semanal')}
        {boton('cultura', 'fas fa-lightbulb', 'var(--amber)', 'Cultura Tcontrol')}
        {boton('invitados', 'fas fa-concierge-bell', '#ea580c', 'Invitados & Catering',
          <span id="badgeSubtabInvitadosCount" style={s(`display:${badge ? 'inline-block' : 'none'}; background:${badge?.color || '#dc2626'}; color:white; font-size:10px; font-weight:800; padding:1px 6px; border-radius:10px; margin-left:4px;`)}>{badge?.n || 0}</span>)}
      </div>
      {sub === 'emergencias' && <SubEmergencias />}
      {sub === 'menu' && <SubMenu />}
      {sub === 'cultura' && <SubCultura />}
      {sub === 'invitados' && <SubInvitados />}
    </>
  );
}

// ─── Invitados: pendientes y contadores (actualizarNotificacionesSupAdminInvitados) ───
export function listaInvitados(): InvitadoConsolidado[] {
  return obtenerListaConsolidadaInvitados(sup.get().solicitudesInvitados || []);
}
export function pendientesInvitados(lista = listaInvitados()) {
  return lista.filter(i => (i.estado === 'SOLICITADO' || !i.estado) && i.estado !== 'CANCELADO' && i.estado !== 'CONFIRMADO' && i.estado !== 'ENTREGADO');
}
// Badge de la barra y de la subpestaña: pendientes (naranja) para Sup. Admin; si no hay, pedidos de hoy (azul)
export function badgeInvitados(): { n: number; color: string; title: string } | null {
  const todos = listaInvitados();
  const rol = rolSesion();
  const hoy = normalizarFechaStr(getLocalHoyStr());
  const pedidosHoy = todos.filter(i => i.fecha === hoy && i.estado !== 'CANCELADO');
  if (rol === 'SUPERVISOR_ADMIN' || rol === 'ADMIN_MASTER') {
    const pend = pendientesInvitados(todos);
    if (pend.length) return { n: pend.length, color: '#ea580c', title: `${pend.length} solicitudes de invitados pendientes de revisión` };
    if (pedidosHoy.length) return { n: pedidosHoy.length, color: '#2563eb', title: `${pedidosHoy.length} pedidos para hoy` };
    return null;
  }
  return pedidosHoy.length ? { n: pedidosHoy.length, color: '#dc2626', title: '' } : null;
}

const subtipoLabel = (st: string) => (st === 'ALMUERZO_EXTRA' ? 'Almuerzo Extra' : st === 'REFRIGERIO_SANDUCHE' ? 'Sánduche' : 'Break Galletas');

// notificarManualSupAdminsWhatsApp: el recordatorio queda en la cola de WhatsApp del servidor
export async function notificarManualSupAdminsWhatsApp() {
  const todos = listaInvitados();
  let pedidos = pendientesInvitados(todos);
  if (!pedidos.length) {
    if (!window.confirm("No hay solicitudes con estado 'SOLICITADO'. ¿Deseas enviar un recordatorio a los Sup. Admin con los pedidos activos del día de hoy?")) return;
    const hoy = normalizarFechaStr(getLocalHoyStr());
    pedidos = todos.filter(i => i.fecha === hoy && i.estado !== 'CANCELADO');
    if (!pedidos.length) { mostrarToast('No hay pedidos registrados para el día de hoy.', 'info'); return; }
  } else {
    mostrarToast('Enviando recordatorio WhatsApp a los Sup. Admin...', 'info');
  }
  mostrarLoader(true);
  try {
    const r = await rpc<{ destinatarios: number }>('sup_notificar_invitados', { p_ids: pedidos.map(p => p.id) });
    if (r.destinatarios > 0) mostrarToast(`¡Notificación enviada a ${r.destinatarios} Sup. Admin por WhatsApp!`, 'success');
    else mostrarToast('No se pudo completar el envío de WhatsApp', 'warning');
  } catch (e) {
    mostrarToast('Error enviando notificación: ' + errorTexto(e), 'error');
  } finally { mostrarLoader(false); }
}

const caja = 'background:#ffffff; border:1px solid var(--g200); border-radius:12px; padding:20px; margin-bottom:12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);';

// ─── Emergencias ───
function SubEmergencias() {
  const empCache = useSup(x => x.empCache);
  const [datos, setDatos] = useState<{ emergencia: any; reportes: { empleadoId: string; estado: string; hora: string | null }[] } | null>(null);
  const [nombre, setNombre] = useState('');

  const cargar = async (recargarTodo: boolean) => {
    try {
      if (recargarTodo) await cargarDatosCompletos();
      const d = await rpc<any>('sup_emergencia_estado', {});
      setDatos(d);
      setNombre(d.emergencia.nombre || '');
    } catch (e) { mostrarToast(errorTexto(e), 'error'); }
  };
  useEffect(() => { void cargar(false); }, []);

  const alternar = async (activa: boolean) => {
    const n = nombre.trim();
    if (activa && !n) { mostrarToast('Por favor ingrese el nombre del evento/simulacro.', 'warning'); return; }
    mostrarLoader(true);
    try {
      await rpc('cambiar_emergencia', { p_activa: activa, p_nombre: activa ? n : null });
      mostrarToast(activa ? '🚨 Alerta de emergencia iniciada' : '🟢 Alerta de emergencia finalizada', 'success');
      await cargar(true);
    } catch (e) {
      mostrarToast(errorTexto(e) || 'Error al actualizar la alerta', 'error');
    } finally { mostrarLoader(false); }
  };

  const em = datos?.emergencia || { activa: false, nombre: '' };
  const porEmp = new Map((datos?.reportes || []).map(r => [r.empleadoId, r]));
  let aSalvo = 0, ayuda = 0, pend = 0;
  const filas = empCache.map(emp => {
    const rep = porEmp.get(emp.id);
    let texto = '⚪ PENDIENTE', color = '#64748b', bg = '#f1f5f9', detalle = '-', hora = '-';
    if (rep?.estado) {
      const val = rep.estado;
      if (val.startsWith('A salvo')) { aSalvo++; texto = '🟢 A SALVO / OK'; color = '#0f766e'; bg = '#ccfbf1'; }
      else if (val.startsWith('Requiere ayuda')) { ayuda++; texto = '🔴 REQUIERE AYUDA'; color = '#b91c1c'; bg = '#fee2e2'; }
      else { aSalvo++; texto = '🟢 REGISTRADO'; color = '#0f766e'; bg = '#ccfbf1'; }
      const i = val.indexOf(' - ');
      detalle = i !== -1 ? val.substring(i + 3) : 'Sin comentarios';
      hora = rep.hora || '-';
    } else pend++;
    return (
      <tr key={emp.id} style={s('border-bottom: 1px solid #e2e8f0;')}>
        <td style={s('padding: 12px; font-size: 13px; font-weight: 600; color: #1e293b;')}>{emp.nombre || 'Sin nombre'}</td>
        <td style={s('padding: 12px; font-size: 13px; color: #475569;')}>{emp.departamento || emp.cargo || 'Área general'}</td>
        <td style={s('padding: 12px;')}><span style={s(`display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; color: ${color}; background: ${bg}; text-align: center;`)}>{texto}</span></td>
        <td style={s('padding: 12px; font-size: 13px; color: #334155; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;')} title={detalle}>{detalle}</td>
        <td style={s('padding: 12px; font-size: 13px; color: #64748b;')}>{hora}</td>
      </tr>
    );
  });

  return (
    <div id="subpanel-servicios-emergencias" className="subpanel active">
      <div style={s(caja)}>
        <div style={s('display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:20px;')}>
          <div>
            <h2 style={s('font-size:20px; font-weight:800; color:#0f172a; margin:0; display:flex; align-items:center; gap:8px;')}><i className="fas fa-exclamation-triangle" style={s('color:#ef4444;')}></i> Control de Simulacros y Emergencias</h2>
            <p style={s('font-size:13px; color:#64748b; margin:5px 0 0 0;')}>Monitoreo en tiempo real de reportes de estado del personal.</p>
          </div>
          <div style={s('display:flex; gap:10px;')}>
            <button className="btn" id="btnRecargarEmergencia" onClick={() => void cargar(true)} style={s('background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:8px 16px; font-weight:600; font-size:13px; color:#334155; cursor:pointer; display:flex; align-items:center; gap:6px;')}><i className="fas fa-sync-alt"></i> Actualizar</button>
          </div>
        </div>
        <div style={s('background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:15px; margin-bottom:20px;')}>
          <h3 style={s('font-size:14px; font-weight:700; color:#1e293b; margin:0 0 10px 0;')}><i className="fas fa-bullhorn me-2 text-primary"></i>Panel de Activación de Alerta</h3>
          <div style={s('display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;')}>
            <div style={s('flex:1; min-width:250px;')}>
              <label style={s('display:block; font-size:11px; font-weight:600; color:#64748b; margin-bottom:6px;')}>Nombre del Evento (Ej. Simulacro de Sismo 2026)</label>
              <input type="text" id="supEmEventName" value={nombre} onChange={ev => setNombre(ev.target.value)} placeholder="Ingrese nombre del evento..." style={s('width:100%; padding:9px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; box-sizing:border-box;')} />
            </div>
            <div style={s('display:flex; gap:10px;')}>
              <button id="btnSupEmStart" onClick={() => void alternar(true)} style={s(`background:#dc2626; color:white; border:none; border-radius:8px; padding:9px 16px; font-weight:700; font-size:13px; cursor:pointer; display:${em.activa ? 'none' : 'flex'}; align-items:center; gap:6px;`)}>🚨 Iniciar Alerta</button>
              <button id="btnSupEmStop" onClick={() => void alternar(false)} style={s(`background:#16a34a; color:white; border:none; border-radius:8px; padding:9px 16px; font-weight:700; font-size:13px; cursor:pointer; display:${em.activa ? 'flex' : 'none'}; align-items:center; gap:6px;`)}>🟢 Finalizar Alerta</button>
            </div>
          </div>
        </div>
        <div id="statusEmergenciaDetalle" style={s('margin-bottom:20px;')}>
          {datos && (
            <div style={s(`padding: 12px; border-radius: 8px; background: ${em.activa ? '#fef2f2' : '#f0fdf4'}; border: 1px solid ${em.activa ? '#fca5a5' : '#bbf7d0'}; color: ${em.activa ? '#991b1b' : '#166534'}; font-weight: bold; display: flex; align-items: center; justify-content: space-between;`)}>
              <div>
                <span style={s('font-size: 15px;')}>📢 Estado del Evento: <strong>{em.activa ? 'ACTIVO' : 'INACTIVO'}</strong></span>
                {em.activa && <><br /><span style={s('font-size: 12.5px; font-weight: normal; color: #7f1d1d; margin-top: 4px; display: inline-block;')}>Nombre del Evento: <strong>{em.nombre}</strong> (Iniciado el {em.fecha || 'hoy'})</span></>}
              </div>
              <div><i className={`fas ${em.activa ? 'fa-bell fa-beat' : 'fa-shield-alt'}`} style={s('font-size: 20px;')}></i></div>
            </div>
          )}
        </div>
        <div className="row" style={s('display:flex; gap:16px; margin-bottom:20px; flex-wrap:wrap;')}>
          <div style={s('flex:1; min-width:200px; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:12px; padding:15px; text-align:center;')}>
            <div style={s('font-size:24px; margin-bottom:4px;')}>🟢</div>
            <div style={s('font-size:12px; font-weight:700; color:#065f46;')}>A SALVO / SIN NOVEDADES</div>
            <div style={s('font-size:28px; font-weight:800; color:#047857; margin-top:5px;')} id="numASalvo">{aSalvo}</div>
          </div>
          <div style={s('flex:1; min-width:200px; background:#fef2f2; border:1px solid #fca5a5; border-radius:12px; padding:15px; text-align:center;')}>
            <div style={s('font-size:24px; margin-bottom:4px;')}>🔴</div>
            <div style={s('font-size:12px; font-weight:700; color:#991b1b;')}>REQUIEREN ASISTENCIA</div>
            <div style={s('font-size:28px; font-weight:800; color:#b91c1c; margin-top:5px;')} id="numRequiereAyuda">{ayuda}</div>
          </div>
          <div style={s('flex:1; min-width:200px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:15px; text-align:center;')}>
            <div style={s('font-size:24px; margin-bottom:4px;')}>⚪</div>
            <div style={s('font-size:12px; font-weight:700; color:#475569;')}>PENDIENTES (SIN REPORTAR)</div>
            <div style={s('font-size:28px; font-weight:800; color:#334155; margin-top:5px;')} id="numPendientes">{pend}</div>
          </div>
        </div>
        <div style={s('background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:15px;')}>
          <h3 style={s('font-size:15px; font-weight:700; color:#1e293b; margin:0 0 12px 0;')}>Detalle de Reportes por Empleado</h3>
          <div className="table-wrapper" style={s('overflow: auto; max-height: 480px; border-radius: 8px;')}>
            <table className="employee-table" style={s('width:100%; border-collapse:collapse;')}>
              <thead style={s('position: sticky; top: 0; z-index: 10; background: #f1f5f9; box-shadow: 0 1px 2px rgba(0,0,0,0.06);')}>
                <tr style={s('background:#f1f5f9; border-bottom:2px solid #e2e8f0;')}>
                  {['Empleado', 'Área', 'Estado', 'Detalle / Observación', 'Hora de Reporte'].map(h => <th key={h} style={s('padding:12px; text-align:left; font-size:12px; font-weight:700; color:#475569;')}>{h}</th>)}
                </tr>
              </thead>
              <tbody id="listaReportesEmergenciaBody">
                {filas.length ? filas : <tr><td colSpan={5} style={s('text-align: center; padding: 20px; color: #64748b;')}>No hay personal activo registrado para mostrar.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Menú semanal ───
const DIAS_MENU = [
  { key: 'lunes', label: 'Lunes' }, { key: 'martes', label: 'Martes' }, { key: 'miercoles', label: 'Miércoles' }, { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' }, { key: 'sabado', label: 'Sábado' }, { key: 'domingo', label: 'Domingo' },
];
type Menu = Record<string, { sopa: string; plato: string; jugo: string }>;

function SubMenu() {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [sug, setSug] = useState<{ sopas: string[]; platos: string[]; jugos: string[] }>({ sopas: [], platos: [], jugos: [] });

  const cargar = async (conLoader: boolean) => {
    if (conLoader) mostrarLoader(true);
    try {
      const d = await rpc<any>('sup_menu', {});
      if (conLoader) setMenu(Object.fromEntries(DIAS_MENU.map(x => [x.key, { sopa: '', plato: '', jugo: '', ...(d.menu?.[x.key] || {}) }])));
      setSug(d.sugerencias || { sopas: [], platos: [], jugos: [] });
    } catch (e) {
      mostrarToast(errorTexto(e) || 'Error al cargar el menú', 'error');
    } finally { if (conLoader) mostrarLoader(false); }
  };
  useEffect(() => { void cargar(true); }, []);

  const set = (dia: string, campo: 'sopa' | 'plato' | 'jugo', v: string) => setMenu(m => (m ? { ...m, [dia]: { ...m[dia], [campo]: v } } : m));

  const guardar = async () => {
    if (!menu) { mostrarToast('El formulario de menú aún no se ha cargado. Por favor espera un momento.', 'warning'); return; }
    const llenos = Object.values(menu).reduce((n, d) => n + [d.sopa, d.plato, d.jugo].filter(v => v.trim()).length, 0);
    if (llenos === 0 && !window.confirm('Todos los campos del menú están vacíos. ¿Deseas limpiar y guardar el menú en blanco?')) return;
    mostrarLoader(true);
    try {
      await rpc('sup_guardar_menu', { p_menu: menu });
      mostrarToast('¡Menú semanal guardado y publicado correctamente!', 'success');
      void cargar(false);
    } catch (e) {
      mostrarToast('Error de conexión al guardar el menú: ' + errorTexto(e), 'error');
    } finally { mostrarLoader(false); }
  };

  const campo = (d: string, c: 'sopa' | 'plato' | 'jugo', etiqueta: string, lista: string, ph: string) => (
    <div>
      <label style={s('font-size:11px; font-weight:700; color:#475569; display:block; margin-bottom:3px; text-transform:uppercase;')}>{etiqueta}</label>
      <input type="text" className="form-control menu-input" list={lista} data-dia={d} data-campo={c} value={menu?.[d]?.[c] || ''} onChange={ev => set(d, c, ev.target.value)}
        placeholder={ph} style={s('font-size:12.5px; padding:6px 10px; border-radius:8px; border: 1.5px solid var(--g200); font-family: inherit;')} />
    </div>
  );

  return (
    <div id="subpanel-servicios-menu" className="subpanel">
      <div style={s(caja)}>
        <div style={s('display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:20px; border-bottom:1px solid #f1f5f9; padding-bottom:15px;')}>
          <div>
            <h4 style={s('font-weight:800; color:#0f172a; margin:0; font-size:18px;')}>Planificación de Menú Semanal</h4>
            <p style={s('color:#64748b; margin:4px 0 0 0; font-size:13px;')}>Define las opciones del comedor de la planta para cada día de la semana.</p>
          </div>
          <button className="btn btn-success" onClick={() => void guardar()} style={s('padding:10px 20px; border-radius:8px; font-weight:700; display:inline-flex; align-items:center; gap:8px;')}><i className="fas fa-save"></i> Guardar Menú</button>
        </div>
        <div id="formMenuSemanalContainer" style={s('display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;')}>
          {menu && DIAS_MENU.map(d => (
            <div key={d.key} className="menu-dia-card" style={s('background:#f8fafc; border:1px solid var(--g200); border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:12px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);')}>
              <div style={s('font-size:14px; font-weight:800; color:var(--indigo); border-bottom:1.5px solid var(--indigo); padding-bottom:4px; display:flex; align-items:center; gap:6px;')}><i className="fas fa-calendar-day"></i> {d.label}</div>
              <div style={s('display:flex; flex-direction:column; gap:8px;')}>
                {campo(d.key, 'sopa', '🍜 Sopa', 'datalist-sopas', 'Ej: Crema de verduras')}
                {campo(d.key, 'plato', '🥩 Plato Fuerte', 'datalist-platos', 'Ej: Lomo saltado')}
                {campo(d.key, 'jugo', '🥤 Bebida', 'datalist-jugos', 'Ej: Jugo de naranja')}
              </div>
            </div>
          ))}
          <datalist id="datalist-sopas">{sug.sopas.map(v => <option key={v} value={v} />)}</datalist>
          <datalist id="datalist-platos">{sug.platos.map(v => <option key={v} value={v} />)}</datalist>
          <datalist id="datalist-jugos">{sug.jugos.map(v => <option key={v} value={v} />)}</datalist>
        </div>
      </div>
    </div>
  );
}

// ─── Cultura Tcontrol ───
interface Opcion { letra: string; texto: string; correcta: boolean }
interface Pregunta { id: string; tipo: string; pilar: string; iconoPilar: string; pregunta: string; pista: string; opciones: Opcion[]; activo: boolean }

const PREGUNTAS_CULTURA_DEFAULT: Pregunta[] = [
  { id: 'proposito', tipo: 'PROPOSITO', pilar: 'Propósito', iconoPilar: '🎯', pregunta: '¿Cuál es el Propósito de Tcontrol?',
    pista: 'Recuerda: El propósito de Tcontrol es "Diseñar soluciones para el futuro".',
    opciones: [{ letra: 'A', texto: 'Diseñar soluciones para el futuro', correcta: true }, { letra: 'B', texto: 'Vender equipos eléctricos al menor costo', correcta: false },
      { letra: 'C', texto: 'Importar maquinaria industrial usada', correcta: false }], activo: true },
  { id: 'mision', tipo: 'MISION', pilar: 'Misión', iconoPilar: '⚡', pregunta: '¿Cuál es la Misión principal de Tcontrol?',
    pista: 'Recuerda: La misión es "Brindar soluciones eléctricas confiables mediante diseño y fabricación de tableros, cuartos eléctricos y automatización con calidad, eficiencia y seguridad".',
    opciones: [{ letra: 'A', texto: 'Comercializar herramientas manuales para construcción', correcta: false },
      { letra: 'B', texto: 'Brindar soluciones eléctricas confiables mediante el diseño y fabricación de tableros de control industrial, cuartos eléctricos y sistemas de automatización adaptados a cada cliente con calidad y seguridad', correcta: true },
      { letra: 'C', texto: 'Realizar únicamente instalaciones residenciales básicas', correcta: false }], activo: true },
  { id: 'vision', tipo: 'VISION', pilar: 'Visión (2030)', iconoPilar: '🚀', pregunta: 'Para el año 2030, la Visión de Tcontrol es:',
    pista: 'Recuerda: La visión 2030 es "Ser referentes nacionales en soluciones electromecánicas de calidad (>95% satisfacción), con certificaciones internacionales y expansión a al menos 2 países".',
    opciones: [{ letra: 'A', texto: 'Ser referentes nacionales como proveedores de soluciones electromecánicas de calidad (>95% satisfacción), certificaciones internacionales y expandir operaciones a 2 países de la región', correcta: true },
      { letra: 'B', texto: 'Cambiar el modelo de negocio al comercio minorista', correcta: false }, { letra: 'C', texto: 'Reducir las operaciones a una sola ciudad local', correcta: false }], activo: true },
  { id: 'valores_calidad', tipo: 'VALORES', pilar: 'Valores y Calidad', iconoPilar: '🛡️', pregunta: '¿Cuáles son los principios fundamentales de calidad y seguridad en Tcontrol?',
    pista: 'Recuerda: En Tcontrol la calidad superior, precisión técnica y seguridad del personal y cliente son nuestros pilares de trabajo diario.',
    opciones: [{ letra: 'A', texto: 'Priorizar la velocidad sobre la seguridad y el control de calidad', correcta: false },
      { letra: 'B', texto: 'Cumplimiento estricto de normas técnicas, precisión en ensamblaje y protección total del personal', correcta: true },
      { letra: 'C', texto: 'Entregar proyectos sin protocolos de prueba ni calibración', correcta: false }], activo: true },
  { id: 'seguridad_industrial', tipo: 'SEGURIDAD', pilar: 'Seguridad Industrial', iconoPilar: '⚙️', pregunta: '¿Cuál es la regla de oro ante una condición insegura en planta o campo?',
    pista: 'Recuerda: Si una condición no es segura, se debe detener el trabajo y reportar inmediatamente.',
    opciones: [{ letra: 'A', texto: 'Detener el trabajo, aislar el peligro y comunicar de inmediato al supervisor / HSE', correcta: true },
      { letra: 'B', texto: 'Continuar con el trabajo para no retrasar la entrega', correcta: false }, { letra: 'C', texto: 'Esperar a que otro compañero resuelva la situación', correcta: false }], activo: true },
];

const PILAR_ESTILO: Record<string, { bg: string; color: string; border: string }> = {
  PROPOSITO: { bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' }, MISION: { bg: '#fef3c7', color: '#b45309', border: '#fde68a' },
  VISION: { bg: '#e0e7ff', color: '#4338ca', border: '#c7d2fe' }, VALORES: { bg: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  SEGURIDAD: { bg: '#ffedd5', color: '#c2410c', border: '#fed7aa' }, INNOVACION: { bg: '#f3e8ff', color: '#7e22ce', border: '#e9d5ff' },
};

const esCorrecta = (o: any) => o.correcta === true || String(o.correcta) === 'true';

function SubCultura() {
  const [banco, setBanco] = useState<Pregunta[] | null>(null);
  const [habilitado, setHabilitado] = useState(true);
  const [q, setQ] = useState('');
  const [pilar, setPilar] = useState('TODOS');
  const [editando, setEditando] = useState<{ id: string | null } | null>(null);

  useEffect(() => {
    rpc<any>('sup_cultura', {}).then(d => {
      setBanco(d.preguntas?.length ? d.preguntas : JSON.parse(JSON.stringify(PREGUNTAS_CULTURA_DEFAULT)));
      setHabilitado(d.habilitado !== false);
    }).catch(() => setBanco(JSON.parse(JSON.stringify(PREGUNTAS_CULTURA_DEFAULT))));
  }, []);

  const items = banco || [];
  const lista = useMemo(() => {
    let l = items;
    if (pilar !== 'TODOS') l = l.filter(i => (i.tipo || '').toUpperCase() === pilar);
    const t = q.toLowerCase().trim();
    if (t) l = l.filter(i => (i.pregunta || '').toLowerCase().includes(t) || (i.pilar || '').toLowerCase().includes(t) || (i.pista || '').toLowerCase().includes(t)
      || (i.opciones || []).map(o => (o.texto || '').toLowerCase()).join(' ').includes(t));
    return l;
  }, [items, q, pilar]);

  const alternarGlobal = async (v: boolean) => {
    setHabilitado(v);
    try {
      await rpc('sup_cultura_global', { p_habilitado: v });
      mostrarToast(v ? '✅ Cultura Tcontrol habilitada para todos los colaboradores.' : '⏸️ Cultura Tcontrol deshabilitada globalmente.', 'success');
    } catch (e) { mostrarToast('Error de conexión al actualizar Cultura Tcontrol: ' + errorTexto(e), 'error'); }
  };
  const guardarBanco = async () => {
    mostrarLoader(true);
    try {
      await rpc('sup_guardar_cultura', { p_preguntas: items });
      mostrarToast('Banco de preguntas de cultura sincronizado exitosamente.', 'success');
    } catch (e) { mostrarToast('Error al sincronizar con el servidor: ' + errorTexto(e), 'error'); }
    finally { mostrarLoader(false); }
  };
  const restablecer = () => {
    if (!window.confirm('¿Deseas restablecer el banco de preguntas a los valores corporativos predeterminados?')) return;
    setBanco(JSON.parse(JSON.stringify(PREGUNTAS_CULTURA_DEFAULT)));
    mostrarToast('Base predeterminada restaurada. Recuerda guardar cambios.', 'info');
  };
  const eliminar = (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar esta pregunta del banco?')) return;
    setBanco(items.filter(x => x.id !== id));
    mostrarToast('Pregunta eliminada localmente. Haz clic en Guardar Cambios para sincronizar.', 'info');
  };
  const alternarActiva = (id: string) => {
    const item = items.find(x => x.id === id);
    if (!item) return;
    const activo = item.activo === false;
    setBanco(items.map(x => (x.id === id ? { ...x, activo } : x)));
    mostrarToast(activo ? 'Pregunta activada' : 'Pregunta desactivada', 'info');
  };
  const guardarDesdeModal = (p: Pregunta, id: string | null) => {
    if (id && items.some(x => x.id === id)) setBanco(items.map(x => (x.id === id ? { ...x, ...p } : x)));
    else setBanco([...items, p]);
    setEditando(null);
    mostrarToast('Pregunta guardada. Haz clic en "Guardar Cambios" para sincronizar.', 'success');
  };

  return (
    <div id="subpanel-servicios-cultura" className="subpanel">
      <div style={s('background:#ffffff; border:1px solid var(--g200); border-radius:16px; padding:24px; margin-bottom:16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);')}>
        <div style={s('display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; margin-bottom:20px; border-bottom:1px solid #f1f5f9; padding-bottom:16px;')}>
          <div style={s('display:flex; align-items:center; gap:10px;')}>
            <span style={s('background:linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color:white; width:36px; height:36px; border-radius:10px; display:inline-flex; align-items:center; justify-content:center; font-size:16px; box-shadow:0 3px 10px rgba(220,38,38,0.25);')}><i className="fas fa-lightbulb"></i></span>
            <div>
              <h4 style={s('font-weight:800; color:#0f172a; margin:0; font-size:18px;')}>Banco de Preguntas — Cultura Tcontrol</h4>
              <p style={s('color:#64748b; margin:3px 0 0 0; font-size:12.5px;')}>Gestiona las preguntas dinámicas de identidad corporativa (Propósito, Misión, Visión, Valores) para la evaluación diaria.</p>
            </div>
          </div>
          <div style={s('display:flex; gap:8px; flex-wrap:wrap;')}>
            <button type="button" className="btn" onClick={restablecer} style={s('padding:9px 15px; border-radius:8px; font-size:12.5px; font-weight:600; background:#f8fafc; border:1px solid var(--g300); color:#475569; display:inline-flex; align-items:center; gap:6px; cursor:pointer;')} title="Restaurar las preguntas predeterminadas"><i className="fas fa-undo"></i> Restablecer Base</button>
            <button type="button" className="btn btn-primary" onClick={() => setEditando({ id: null })} style={s('padding:9px 18px; border-radius:8px; font-size:12.5px; font-weight:700; background:var(--red); border:none; color:white; display:inline-flex; align-items:center; gap:6px; cursor:pointer; box-shadow:0 2px 8px rgba(220,38,38,0.25);')}><i className="fas fa-plus-circle"></i> Nueva Pregunta</button>
            <button type="button" className="btn btn-success" onClick={() => void guardarBanco()} style={s('padding:9px 18px; border-radius:8px; font-size:12.5px; font-weight:700; background:#16a34a; border:none; color:white; display:inline-flex; align-items:center; gap:6px; cursor:pointer; box-shadow:0 2px 8px rgba(220,38,38,0.25);')} title="Guardar banco de preguntas"><i className="fas fa-save"></i> Guardar Cambios</button>
          </div>
        </div>

        <div id="boxControlCulturaGlobal" style={s(`display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom:18px; background:${habilitado ? 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)' : 'linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)'}; border:1px solid ${habilitado ? '#bbf7d0' : '#fecaca'}; padding:14px 20px; border-radius:12px; transition:all 0.3s ease;`)}>
          <div style={s('display:flex; align-items:center; gap:12px;')}>
            <div style={s(`width:40px; height:40px; border-radius:10px; background:${habilitado ? '#dcfce7' : '#fee2e2'}; color:${habilitado ? '#16a34a' : '#dc2626'}; display:flex; align-items:center; justify-content:center; font-size:18px; transition:all 0.3s ease;`)}>
              <i className={habilitado ? 'fas fa-toggle-on' : 'fas fa-toggle-off'} id="iconoEstadoCulturaGlobal"></i>
            </div>
            <div>
              <div style={s('font-size:14px; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:8px;')}>
                Módulo de Evaluación "Cultura Tcontrol"
                <span id="badgeEstadoCulturaGlobal" style={s(`font-size:11px; font-weight:700; padding:2px 8px; border-radius:20px; background:${habilitado ? '#dcfce7' : '#fee2e2'}; color:${habilitado ? '#15803d' : '#b91c1c'}; border:1px solid ${habilitado ? '#86efac' : '#fca5a5'}; transition:all 0.3s ease;`)}>{habilitado ? 'HABILITADO GENERAL' : 'DESHABILITADO GLOBAL'}</span>
              </div>
              <div style={s('font-size:12px; color:#475569; margin-top:2px;')}>Si está desactivado, ningún colaborador verá la trivia obligatoria de cultura al seleccionar su menú de almuerzo.</div>
            </div>
          </div>
          <div style={s('display:flex; align-items:center; gap:12px;')}>
            <span id="lblTextoSwitchCulturaGlobal" style={s(`font-size:13px; font-weight:700; color:${habilitado ? '#16a34a' : '#dc2626'}; transition:color 0.3s ease;`)}>{habilitado ? 'Habilitado para todos' : 'Deshabilitado para todos'}</span>
            <label className="switch" title="Activar o desactivar Cultura Tcontrol globalmente">
              <input type="checkbox" id="chkCulturaTcontrolGlobal" checked={habilitado} onChange={ev => void alternarGlobal(ev.target.checked)} />
              <span className="slider-round"></span>
            </label>
          </div>
        </div>

        <div style={s('display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:18px; background:#f8fafc; padding:12px 16px; border-radius:12px; border:1px solid var(--g200);')}>
          <div style={s('display:flex; align-items:center; gap:16px; flex-wrap:wrap;')}>
            <div style={s('font-size:12px; color:#475569;')}>Total preguntas activas: <strong id="lblTotalPreguntasCultura" style={s('color:#0f172a; font-size:14px; font-weight:800;')}>{banco ? `${lista.filter(x => x.activo !== false).length} de ${lista.length}` : 0}</strong></div>
            <div style={s('font-size:12px; color:#475569;')}>Modalidad: <span style={s('background:#e0f2fe; color:#0369a1; padding:3px 8px; border-radius:6px; font-weight:700; font-size:11px;')}><i className="fas fa-random me-1"></i> 1 Pregunta Aleatoria Diaria por Colaborador</span></div>
          </div>
          <div style={s('display:flex; gap:8px; align-items:center; flex-wrap:wrap;')}>
            <input type="text" id="buscarPreguntaCultura" value={q} onChange={ev => setQ(ev.target.value)} placeholder="🔍 Buscar pregunta o pilar..." style={s('padding:7px 12px; border-radius:8px; border:1px solid var(--g300); font-size:12px; min-width:200px; outline:none; font-family:inherit;')} />
            <select id="filtroPilarCultura" value={pilar} onChange={ev => setPilar(ev.target.value)} style={s('padding:7px 12px; border-radius:8px; border:1px solid var(--g300); font-size:12px; outline:none; font-family:inherit; background:white; cursor:pointer;')}>
              <option value="TODOS">-- Todos los Pilares --</option>
              <option value="PROPOSITO">🎯 Propósito</option>
              <option value="MISION">⚡ Misión</option>
              <option value="VISION">🚀 Visión</option>
              <option value="VALORES">🛡️ Valores / Calidad</option>
              <option value="SEGURIDAD">⚙️ Seguridad</option>
              <option value="OTRO">🌟 Personalizados</option>
            </select>
          </div>
        </div>

        <div id="preguntasCulturaContainer" style={s('display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:16px;')}>
          {!banco ? (
            <div style={s('text-align:center; padding:40px; color:#94a3b8; grid-column: 1/-1;')}><i className="fas fa-spinner fa-spin" style={s('font-size:24px; margin-bottom:8px; display:block;')}></i>Cargando preguntas de cultura...</div>
          ) : !lista.length ? (
            <div style={s('text-align:center; padding:40px; color:#94a3b8; grid-column: 1/-1; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:12px;')}>
              <i className="fas fa-lightbulb" style={s('font-size:32px; margin-bottom:10px; color:#cbd5e1; display:block;')}></i>
              <h5 style={s('margin:0 0 6px 0; color:#475569; font-weight:700;')}>No hay preguntas en el banco</h5>
              <p style={s('margin:0 0 14px 0; font-size:12px; color:#64748b;')}>Crea tu primera pregunta de cultura o restaura la base predeterminada.</p>
              <button type="button" className="btn btn-outline" onClick={restablecer} style={s('font-size:12px; padding:6px 14px;')}><i className="fas fa-undo"></i> Cargar Preguntas Predeterminadas</button>
            </div>
          ) : lista.map(p => {
            const ps = PILAR_ESTILO[p.tipo] || { bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' };
            const activa = p.activo !== false;
            return (
              <div key={p.id} className="cultura-pregunta-card" style={s(`background:white; border:1px solid ${activa ? 'var(--g200)' : '#cbd5e1'}; border-radius:12px; padding:16px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 1px 3px rgba(0,0,0,0.03); opacity:${activa ? '1' : '0.6'};`)}>
                <div>
                  <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;')}>
                    <span style={s(`background:${ps.bg}; color:${ps.color}; border:1px solid ${ps.border}; padding:3px 10px; border-radius:20px; font-size:11.5px; font-weight:750; display:inline-flex; align-items:center; gap:5px;`)}><span>{p.iconoPilar || '💡'}</span> <span>{p.pilar || p.tipo || 'Cultura'}</span></span>
                    <button type="button" onClick={() => alternarActiva(p.id)} className="btn" style={s(`padding:2px 8px; border-radius:6px; font-size:11px; font-weight:700; background:${activa ? '#ecfdf5' : '#f1f5f9'}; color:${activa ? '#059669' : '#64748b'}; border:1px solid ${activa ? '#a7f3d0' : '#cbd5e1'}; cursor:pointer;`)} title="Activar/Desactivar para el quiz diario">
                      {activa ? <><i className="fas fa-eye"></i> Activa</> : <><i className="fas fa-eye-slash"></i> Inactiva</>}
                    </button>
                  </div>
                  <h5 style={s('margin:0 0 10px 0; font-size:13.5px; font-weight:800; color:#0f172a; line-height:1.4;')}>{p.pregunta}</h5>
                  <div style={s('margin-bottom:12px;')}>
                    {(p.opciones || []).map((o, i) => {
                      const ok = esCorrecta(o);
                      return (
                        <div key={i} style={s(`display:flex; align-items:flex-start; gap:8px; padding:6px 8px; border-radius:6px; font-size:12px; background:${ok ? '#f0fdf4' : '#f8fafc'}; border:1px solid ${ok ? '#86efac' : '#e2e8f0'}; margin-bottom:4px;`)}>
                          <span style={s(`font-weight:800; color:${ok ? '#15803d' : '#64748b'}; width:18px;`)}>{o.letra || '•'}</span>
                          <span style={s(`flex:1; color:${ok ? '#166534' : '#334155'}; font-weight:${ok ? '600' : '400'}; line-height:1.35;`)}>{o.texto}</span>
                          {ok && <span title="Respuesta Correcta" style={s('color:#16a34a; font-size:13px;')}><i className="fas fa-check-circle"></i></span>}
                        </div>
                      );
                    })}
                  </div>
                  {p.pista && <div style={s('background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:8px 10px; font-size:11px; color:#1e40af; line-height:1.35; margin-bottom:14px;')}><i className="fas fa-info-circle me-1" style={s('color:#2563eb;')}></i> <strong>Pista Pedagógica:</strong> {p.pista}</div>}
                </div>
                <div style={s('display:flex; justify-content:flex-end; gap:8px; border-top:1px solid #f1f5f9; padding-top:10px; margin-top:6px;')}>
                  <button type="button" onClick={() => setEditando({ id: p.id })} className="btn btn-outline" style={s('padding:5px 10px; font-size:11.5px; font-weight:600; border-radius:6px; display:inline-flex; align-items:center; gap:4px; color:#0284c7; border-color:#bae6fd; background:#f0f9ff;')}><i className="fas fa-edit"></i> Editar</button>
                  <button type="button" onClick={() => eliminar(p.id)} className="btn btn-outline" style={s('padding:5px 10px; font-size:11.5px; font-weight:600; border-radius:6px; display:inline-flex; align-items:center; gap:4px; color:#dc2626; border-color:#fecaca; background:#fef2f2;')}><i className="fas fa-trash-alt"></i> Eliminar</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {editando && <ModalPreguntaCultura item={editando.id ? items.find(x => x.id === editando.id) : undefined} onCerrar={() => setEditando(null)} onGuardar={guardarDesdeModal} />}
    </div>
  );
}

const PILARES = [
  { v: 'PROPOSITO', icon: '🎯', pilar: 'Propósito', texto: '🎯 Propósito' }, { v: 'MISION', icon: '⚡', pilar: 'Misión', texto: '⚡ Misión' },
  { v: 'VISION', icon: '🚀', pilar: 'Visión (2030)', texto: '🚀 Visión (2030)' }, { v: 'VALORES', icon: '🛡️', pilar: 'Valores y Calidad', texto: '🛡️ Valores y Calidad' },
  { v: 'SEGURIDAD', icon: '⚙️', pilar: 'Seguridad Industrial', texto: '⚙️ Seguridad Industrial' },
  { v: 'INNOVACION', icon: '💡', pilar: 'Innovación y Tecnología', texto: '💡 Innovación y Tecnología' },
  { v: 'OTRO', icon: '🌟', pilar: 'Cultura Corporativa', texto: '🌟 Personalizado' },
];
const ICONOS = ['🎯', '⚡', '🚀', '🛡️', '⚙️', '💡', '🌟', '🏆', '🔧', '🤝'];

function ModalPreguntaCultura({ item, onCerrar, onGuardar }: { item?: Pregunta; onCerrar: () => void; onGuardar: (p: Pregunta, id: string | null) => void }) {
  const idxCorrecta = item ? Math.max(0, (item.opciones || []).findIndex(esCorrecta)) : 0;
  const [tipo, setTipo] = useState(item?.tipo || 'PROPOSITO');
  const [icono, setIcono] = useState(item?.iconoPilar || '🎯');
  const [custom, setCustom] = useState(item?.tipo === 'OTRO' ? item.pilar || '' : '');
  const [pregunta, setPregunta] = useState(item?.pregunta || '');
  const [pista, setPista] = useState((item?.pista || '').replace(/<[^>]*>/g, ''));
  const [opts, setOpts] = useState<string[]>([0, 1, 2, 3].map(i => item?.opciones?.[i]?.texto || ''));
  const [correcta, setCorrecta] = useState(idxCorrecta);

  const cambiarPilar = (v: string) => {
    setTipo(v);
    const p = PILARES.find(x => x.v === v);
    if (p) setIcono(p.icon);
  };
  const guardar = () => {
    let pilarNombre = PILARES.find(x => x.v === tipo)?.pilar || tipo;
    if (tipo === 'OTRO' && custom.trim()) pilarNombre = custom.trim();
    if (!pregunta.trim()) { mostrarToast('Por favor escribe la pregunta.', 'error'); return; }
    const letras = ['A', 'B', 'C', 'D'];
    const opciones: Opcion[] = [];
    opts.forEach((t, i) => { if (t.trim()) opciones.push({ letra: letras[i], texto: t.trim(), correcta: i === correcta }); });
    if (opciones.length < 2) { mostrarToast('Debes ingresar al menos 2 opciones de respuesta.', 'error'); return; }
    if (!opciones.some(o => o.correcta)) opciones[0].correcta = true;
    onGuardar({ id: item?.id || 'q_' + Date.now(), tipo, pilar: pilarNombre, iconoPilar: icono, pregunta: pregunta.trim(), pista: pista.trim(), opciones, activo: true }, item?.id || null);
  };
  const lbl = s('font-size:12px; font-weight:700;');
  return (
    <div id="modalPreguntaCultura" className="modal-overlay" style={s('z-index: 99999;')} onClick={ev => { if (ev.target === ev.currentTarget) onCerrar(); }}>
      <div className="modal-container" style={s('max-width:580px; width:95%;')}>
        <div className="modal-header">
          <h3 className="modal-title" id="modalPreguntaCulturaTitulo" style={s('display:flex; align-items:center; gap:8px;')}>
            {item ? <><i className="fas fa-edit" style={s('color:var(--red);')}></i> <span>Editar Pregunta de Cultura</span></> : <><i className="fas fa-plus-circle" style={s('color:var(--red);')}></i> <span>Nueva Pregunta de Cultura</span></>}
          </h3>
          <button className="modal-close" onClick={onCerrar}>&times;</button>
        </div>
        <div className="modal-body" style={s('display:flex; flex-direction:column; gap:12px; padding:18px;')}>
          <div style={s('display:grid; grid-template-columns:1fr 110px; gap:10px;')}>
            <div>
              <label className="form-label" style={lbl}>Pilar / Categoría</label>
              <select id="culturaPilarSelect" className="form-select" value={tipo} onChange={ev => cambiarPilar(ev.target.value)} style={s('font-size:12.5px;')}>
                {PILARES.map(p => <option key={p.v} value={p.v}>{p.texto}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label" style={lbl}>Ícono Emoji</label>
              <select id="culturaIconoSelect" className="form-select" value={icono} onChange={ev => setIcono(ev.target.value)} style={s('font-size:14px; text-align:center;')}>
                {ICONOS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>
          <div id="culturaPilarCustomContainer" style={s(`display:${tipo === 'OTRO' ? 'block' : 'none'};`)}>
            <label className="form-label" style={lbl}>Nombre del Pilar Personalizado</label>
            <input type="text" id="culturaPilarCustomText" className="form-input" value={custom} onChange={ev => setCustom(ev.target.value)} placeholder="Ej: Trabajo en Equipo" />
          </div>
          <div>
            <label className="form-label" style={lbl}>Pregunta para el Colaborador <span style={s('color:#ef4444;')}>*</span></label>
            <textarea id="culturaPreguntaTexto" className="form-input" rows={2} value={pregunta} onChange={ev => setPregunta(ev.target.value)} placeholder="Ej: ¿Cuál es el propósito fundamental de Tcontrol?" style={s('resize:vertical; font-size:12.5px;')}></textarea>
          </div>
          <div>
            <label className="form-label" style={lbl}>Pista Pedagógica / Explicación (se muestra si falla) <span style={s('color:#ef4444;')}>*</span></label>
            <textarea id="culturaPistaTexto" className="form-input" rows={2} value={pista} onChange={ev => setPista(ev.target.value)} placeholder="Ej: Recuerda: El propósito de Tcontrol es 'Diseñar soluciones para el futuro'." style={s('resize:vertical; font-size:12px;')}></textarea>
          </div>
          <div>
            <label className="form-label" style={s('font-size:12px; font-weight:700; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;')}>
              <span>Opciones de Respuesta (Marca la Correcta)</span>
              <span style={s('font-size:11px; color:#16a34a; font-weight:700;')}><i className="fas fa-check-circle"></i> Selecciona la correcta</span>
            </label>
            <div style={s('display:flex; flex-direction:column; gap:8px;')}>
              {['A', 'B', 'C', 'D'].map((l, i) => (
                <div key={l} style={s('display:flex; align-items:center; gap:8px; background:#f8fafc; padding:8px 10px; border-radius:8px; border:1px solid var(--g200);')}>
                  <span style={s('font-weight:800; color:#475569; width:20px; text-align:center;')}>{l}</span>
                  <input type="text" id={`culturaOptTexto_${i}`} className="form-input" value={opts[i]} onChange={ev => setOpts(o => o.map((x, j) => (j === i ? ev.target.value : x)))}
                    placeholder={i === 3 ? 'Opción D (opcional)...' : `Texto de la opción ${l}...`} style={s('flex:1; padding:6px 10px; font-size:12.5px;')} />
                  <label style={s('display:flex; align-items:center; gap:4px; margin:0; cursor:pointer; font-size:11.5px; font-weight:700; color:#15803d; white-space:nowrap;')}>
                    <input type="radio" name="culturaOptCorrecta" value={i} checked={correcta === i} onChange={() => setCorrecta(i)} style={s('accent-color:#16a34a; width:16px; height:16px;')} /> Correcta
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary-modal" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-primary-modal" onClick={guardar}><i className="fas fa-check"></i> Guardar Pregunta</button>
        </div>
      </div>
    </div>
  );
}

// ─── Invitados & Catering ───
const ESTADOS: Record<string, { bg: string; color: string; text: string }> = {
  SOLICITADO: { bg: '#fef9c3', color: '#854d0e', text: '⏳ Solicitado' }, CONFIRMADO: { bg: '#dbeafe', color: '#1e40af', text: '✓ Confirmado' },
  ENTREGADO: { bg: '#dcfce7', color: '#15803d', text: '🍽️ Entregado' }, CANCELADO: { bg: '#fee2e2', color: '#b91c1c', text: '✕ Cancelado' },
};

function SubInvitados() {
  useSup(x => x.version);
  const solicitudes = useSup(x => x.solicitudesInvitados);
  const hoy = normalizarFechaStr(getLocalHoyStr());
  const manana = sumarDias(hoy, 1);
  const [fecha, setFecha] = useState(hoy);
  const [tipo, setTipo] = useState('TODOS');
  const [estado, setEstado] = useState('TODOS');
  const [busq, setBusq] = useState('');
  const todos = useMemo(() => obtenerListaConsolidadaInvitados(solicitudes || []), [solicitudes]);

  let filtrados = todos;
  if (fecha) filtrados = filtrados.filter(i => i.fecha === fecha);
  if (tipo !== 'TODOS') filtrados = filtrados.filter(i => i.subtipo === tipo);
  if (estado !== 'TODOS') filtrados = filtrados.filter(i => i.estado === estado);
  const qb = busq.toLowerCase().trim();
  if (qb) filtrados = filtrados.filter(i => (i.invitado || '').toLowerCase().includes(qb) || (i.empresa || '').toLowerCase().includes(qb)
    || (i.solicitante || '').toLowerCase().includes(qb) || (i.observaciones || '').toLowerCase().includes(qb) || (i.area || '').toLowerCase().includes(qb));
  const baseKpi = fecha ? todos.filter(i => i.fecha === fecha && i.estado !== 'CANCELADO') : todos.filter(i => i.estado !== 'CANCELADO');
  let kAlm = 0, kSand = 0, kGall = 0, kTot = 0;
  baseKpi.forEach(i => {
    const c = parseInt(String(i.cantidad)) || 0;
    kTot += c;
    if (i.subtipo === 'ALMUERZO_EXTRA') kAlm += c; else if (i.subtipo === 'REFRIGERIO_SANDUCHE') kSand += c; else if (i.subtipo === 'REFRIGERIO_GALLETAS') kGall += c;
  });

  const recargar = async () => { mostrarLoader(true); try { await cargarDatosCompletos({ silencioso: true }); } finally { mostrarLoader(false); } };
  const cambiarEstado = async (id: string, nuevo: string) => {
    mostrarLoader(true);
    try {
      await rpc('sup_estado_invitado', { p_id: id, p_estado: nuevo });
      mostrarToast('Estado actualizado correctamente', 'success');
      const x = (sup.get().solicitudesInvitados || []).find((s: any) => s.id === id);
      if (x) x.estado = nuevo;
      sup.tocar();
    } catch (e) { mostrarToast('Error: ' + (errorTexto(e) || 'Desconocido'), 'error'); }
    finally { mostrarLoader(false); }
  };
  const eliminar = async (id: string) => {
    const item = todos.find(x => x.id === id);
    const desc = item ? `"${item.invitado}" (${item.subtipo === 'ALMUERZO_EXTRA' ? 'Almuerzo Extra' : 'Refrigerio'} - ${item.fecha})` : 'esta solicitud';
    if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente a ${desc}?\n\nEsta acción borrará el registro de la hoja ALMUERZOS_EXTRA y notificará al respectivo Sup. Admin.`)) return;
    mostrarLoader(true);
    try {
      await rpc('sup_eliminar_invitado', { p_id: id });
      mostrarToast('Registro eliminado de ALMUERZOS_EXTRA y del sistema', 'success');
      sup.set({ solicitudesInvitados: (sup.get().solicitudesInvitados || []).filter((s: any) => s.id !== id) });
    } catch (e) { mostrarToast('Error eliminando registro: ' + (errorTexto(e) || 'Desconocido'), 'error'); }
    finally { mostrarLoader(false); }
  };

  const copiarResumen = () => {
    const f = fecha || hoy;
    const lista = todos.filter(i => i.fecha === f && i.estado !== 'CANCELADO');
    if (!lista.length) { mostrarToast('No hay pedidos activos para la fecha seleccionada (' + f + ')', 'warning'); return; }
    const alm = lista.filter(i => i.subtipo === 'ALMUERZO_EXTRA'), san = lista.filter(i => i.subtipo === 'REFRIGERIO_SANDUCHE'), gal = lista.filter(i => i.subtipo === 'REFRIGERIO_GALLETAS');
    const suma = (l: InvitadoConsolidado[]) => l.reduce((a, b) => a + (parseInt(String(b.cantidad)) || 0), 0);
    let txt = `*📋 RESUMEN DE PEDIDOS PARA INVITADOS - TCONTROL*\n*📅 Fecha:* ${f}\n\n`;
    if (alm.length) {
      txt += `*🍱 ALMUERZOS EXTRA (Total: ${suma(alm)})*\n`;
      alm.forEach(a => { txt += `• (${a.cantidad}x) ${a.invitado} - Solicitante: ${a.solicitante} (${a.area || 'Planta'})${a.observaciones ? ' [' + a.observaciones + ']' : ''}\n`; });
      txt += '\n';
    }
    if (san.length) {
      txt += `*🥪 REFRIGERIOS - SÁNDUCHES (Total: ${suma(san)})*\n`;
      san.forEach(x => { txt += `• (${x.cantidad}x) ${x.invitado} - Solicitante: ${x.solicitante}${x.horaServicio ? ' [Hora: ' + x.horaServicio + ']' : ''}${x.observaciones ? ' [' + x.observaciones + ']' : ''}\n`; });
      txt += '\n';
    }
    if (gal.length) {
      txt += `*🍪 BREAKS CON GALLETAS TCONTROL (Total: ${suma(gal)})*\n`;
      gal.forEach(g => { txt += `• (${g.cantidad}x) ${g.invitado} - Solicitante: ${g.solicitante}${g.horaServicio ? ' [Hora: ' + g.horaServicio + ']' : ''}${g.observaciones ? ' [' + g.observaciones + ']' : ''}\n`; });
      txt += '\n';
    }
    txt += `*👥 TOTAL INVITADOS:* ${suma(lista)} personas\n_Generado desde el Sistema de Asistencia TCONTROL_`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(() => mostrarToast('¡Resumen de cocina copiado al portapapeles!', 'success')).catch(() => window.prompt('Copia el resumen:', txt));
    else window.prompt('Copia el resumen:', txt);
  };

  const exportar = async () => {
    const datos = fecha ? todos.filter(i => i.fecha === fecha) : todos;
    if (!datos.length) { mostrarToast('No hay datos para exportar', 'warning'); return; }
    try {
      await descargarExcel(`Pedidos_Invitados_${fecha || 'Todos'}.xlsx`, [{ nombre: 'Invitados_Catering', filas: [
        ['Fecha', 'Hora Solicitud', 'Solicitante', 'Área Solicitante', 'Tipo de Servicio', 'Cantidad', 'Invitado / Motivo', 'Empresa', 'Hora Servicio', 'Observaciones', 'Estado', 'Origen Registro'],
        ...datos.map(i => [i.fecha, i.hora, i.solicitante, i.area, i.subtipo, i.cantidad, i.invitado, i.empresa, i.horaServicio, i.observaciones, i.estado, i.origen]),
      ] }]);
      mostrarToast('Archivo Excel descargado exitosamente', 'success');
    } catch (e) { mostrarToast('Error al exportar: ' + errorTexto(e), 'error'); }
  };

  const pill = (activo: boolean) => `btn-filtro-pill${activo ? ' active' : ''}`;
  const kpi = (tipoK: string, emoji: string, bg: string, titulo: string, id: string, valor: number, color: string, title: string) => (
    <div className="kpi-invitado-card" onClick={() => setTipo(tipoK)} title={title} style={s('background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; display:flex; align-items:center; gap:14px; cursor:pointer; transition:all 0.2s ease;')}>
      <span style={s(`font-size:28px; width:44px; height:44px; border-radius:10px; background:${bg}; display:inline-flex; align-items:center; justify-content:center;`)}>{emoji}</span>
      <div>
        <div style={s('font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;')}>{titulo}</div>
        <div id={id} style={s(`font-size:22px; font-weight:800; color:${color};`)}>{valor}</div>
      </div>
    </div>
  );
  const selectFiltro = s("padding:6px 10px; border-radius:8px; border:1px solid var(--g300); font-size:12px; font-family:'Plus Jakarta Sans', sans-serif;");
  const etiqueta = s('font-size:12px; font-weight:700; color:#475569; margin:0;');

  return (
    <div id="subpanel-servicios-invitados" className="subpanel">
      <div style={s('background:#ffffff; border:1px solid var(--g200); border-radius:16px; padding:24px; margin-bottom:16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);')}>
        <div style={s('display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; margin-bottom:20px; border-bottom:1px solid #f1f5f9; padding-bottom:16px;')}>
          <div style={s('display:flex; align-items:center; gap:10px;')}>
            <span style={s('background:linear-gradient(135deg, #f97316 0%, #ea580c 100%); color:white; width:38px; height:38px; border-radius:10px; display:inline-flex; align-items:center; justify-content:center; font-size:18px; box-shadow:0 3px 10px rgba(249,115,22,0.3);')}><i className="fas fa-utensils"></i></span>
            <div>
              <h4 style={s('font-weight:800; color:#0f172a; margin:0; font-size:18px;')}>Almuerzos Extra & Refrigerios — Invitados</h4>
              <p style={s('color:#64748b; margin:3px 0 0 0; font-size:12.5px;')}>Control de pedidos registrados en la hoja <strong>ALMUERZOS_EXTRA</strong>. Horarios: Almuerzos hasta 09:40 | Sánduches hasta 08:40.</p>
            </div>
          </div>
          <div style={s('display:flex; gap:8px; flex-wrap:wrap;')}>
            <button type="button" className="btn" onClick={() => void notificarManualSupAdminsWhatsApp()} style={s('padding:9px 15px; border-radius:8px; font-size:12.5px; font-weight:700; background:#25d366; border:none; color:white; display:inline-flex; align-items:center; gap:6px; cursor:pointer; box-shadow:0 2px 8px rgba(37,211,102,0.25);')} title="Enviar recordatorio WhatsApp a los Sup. Admin"><i className="fab fa-whatsapp"></i> Notificar a Sup. Admin</button>
            <button type="button" className="btn" onClick={copiarResumen} style={s('padding:9px 15px; border-radius:8px; font-size:12.5px; font-weight:600; background:#f8fafc; border:1px solid var(--g300); color:#475569; display:inline-flex; align-items:center; gap:6px; cursor:pointer;')} title="Copiar resumen formateado para cocina / WhatsApp"><i className="fas fa-copy text-primary"></i> Copiar Resumen</button>
            <button type="button" className="btn" onClick={() => void exportar()} style={s('padding:9px 15px; border-radius:8px; font-size:12.5px; font-weight:600; background:#f8fafc; border:1px solid var(--g300); color:#16a34a; display:inline-flex; align-items:center; gap:6px; cursor:pointer;')} title="Descargar reporte en formato Excel"><i className="fas fa-file-excel"></i> Excel</button>
            <button type="button" className="btn btn-primary" onClick={() => abrirModal('extraLunch')} style={s('padding:9px 18px; border-radius:8px; font-size:12.5px; font-weight:700; background:var(--red); border:none; color:white; display:inline-flex; align-items:center; gap:6px; cursor:pointer; box-shadow:0 2px 8px rgba(220,38,38,0.25);')}><i className="fas fa-plus-circle"></i> Nuevo Pedido Manual</button>
            <button type="button" className="btn btn-secondary" onClick={() => void recargar()} style={s('padding:9px 14px; border-radius:8px; font-size:12.5px; font-weight:600; background:#f1f5f9; border:1px solid #cbd5e1; color:#334155; display:inline-flex; align-items:center; gap:6px; cursor:pointer;')} title="Actualizar datos"><i className="fas fa-sync-alt"></i></button>
          </div>
        </div>

        <div style={s('display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; margin-bottom:20px;')}>
          {kpi('ALMUERZO_EXTRA', '🍱', '#eff6ff', 'Almuerzos Extra', 'kpiInvitadosAlmuerzos', kAlm, '#1e40af', 'Clic para filtrar por Almuerzos Extra')}
          {kpi('REFRIGERIO_SANDUCHE', '🥪', '#fff7ed', 'Sánduches / Preparados', 'kpiInvitadosSanduches', kSand, '#c2410c', 'Clic para filtrar por Sánduches')}
          {kpi('REFRIGERIO_GALLETAS', '🍪', '#fefce8', 'Breaks con Galletas', 'kpiInvitadosGalletas', kGall, '#a16207', 'Clic para filtrar por Breaks con Galletas')}
          {kpi('TODOS', '👥', '#f0fdf4', 'Total Invitados', 'kpiInvitadosTotal', kTot, '#15803d', 'Clic para ver todos los servicios')}
        </div>

        <div style={s('background:#f8fafc; border:1px solid var(--g200); border-radius:12px; padding:14px; margin-bottom:16px; display:flex; flex-wrap:wrap; gap:12px; align-items:center;')}>
          <div style={s('display:flex; align-items:center; gap:8px;')}>
            <label style={etiqueta}><i className="fas fa-calendar-day text-primary"></i> Fecha:</label>
            <input type="date" id="filtroFechaInvitados" value={fecha} onChange={ev => setFecha(ev.target.value)} style={selectFiltro} />
            <button type="button" id="btnPillHoy" className={pill(fecha === hoy)} onClick={() => setFecha(hoy)} title="Ver pedidos de hoy">Hoy</button>
            <button type="button" id="btnPillManana" className={pill(fecha === manana)} onClick={() => setFecha(manana)} title="Ver pedidos programados para mañana">Mañana</button>
            <button type="button" id="btnPillTodas" className={pill(!fecha)} onClick={() => setFecha('')} title="Ver todos los pedidos sin filtro de fecha">Ver Todo</button>
          </div>
          <div style={s('display:flex; align-items:center; gap:8px;')}>
            <label style={etiqueta}><i className="fas fa-filter text-primary"></i> Servicio:</label>
            <select id="filtroTipoInvitados" value={tipo} onChange={ev => setTipo(ev.target.value)} style={selectFiltro}>
              <option value="TODOS">Todos los servicios</option>
              <option value="ALMUERZO_EXTRA">🍱 Solo Almuerzos Extra</option>
              <option value="REFRIGERIO_SANDUCHE">🥪 Solo Sánduches</option>
              <option value="REFRIGERIO_GALLETAS">🍪 Solo Breaks Galletas</option>
            </select>
          </div>
          <div style={s('display:flex; align-items:center; gap:8px;')}>
            <label style={etiqueta}><i className="fas fa-info-circle text-primary"></i> Estado:</label>
            <select id="filtroEstadoInvitados" value={estado} onChange={ev => setEstado(ev.target.value)} style={selectFiltro}>
              <option value="TODOS">Todos los estados</option>
              <option value="SOLICITADO">⏳ Solicitado / Pendiente</option>
              <option value="CONFIRMADO">✓ Confirmado</option>
              <option value="ENTREGADO">🍽️ Entregado / Servido</option>
              <option value="CANCELADO">✕ Cancelado</option>
            </select>
          </div>
          <div style={s('flex:1; min-width:200px; display:flex; align-items:center; position:relative;')}>
            <i className="fas fa-search" style={s('position:absolute; left:10px; color:#94a3b8; font-size:12px;')}></i>
            <input type="text" id="filtroBusquedaInvitados" value={busq} onChange={ev => setBusq(ev.target.value)} placeholder="Buscar por invitado, empresa o solicitante..." style={s('width:100%; padding:6px 10px 6px 30px; border-radius:8px; border:1px solid var(--g300); font-size:12px;')} />
          </div>
        </div>

        <div className="table-wrapper" style={s('box-shadow:0 4px 6px -1px rgba(0,0,0,0.04); border:1px solid var(--g200); border-radius:12px; overflow:hidden;')}>
          <div className="table-invitados-wrap">
            <table id="tablaInvitadosSupervisor">
              <thead>
                <tr>
                  <th style={s('width:125px;')}>Fecha / Hora</th>
                  <th style={s('width:170px;')}>Solicitante</th>
                  <th style={s('width:145px;')}>Servicio</th>
                  <th style={s('width:65px; text-align:center;')}>Cant.</th>
                  <th style={s('min-width:210px;')}>Invitado / Empresa</th>
                  <th style={s('min-width:220px;')}>Hora Req. / Observaciones</th>
                  <th style={s('width:135px; text-align:center;')}>Estado</th>
                  <th style={s('width:85px; text-align:center;')}>Acciones</th>
                </tr>
              </thead>
              <tbody id="tbodyInvitadosSupervisor">
                {!filtrados.length ? (
                  <tr><td colSpan={8} style={s('text-align:center; padding:45px 20px; color:#94a3b8;')}>
                    <div style={s('font-size:32px; margin-bottom:10px;')}>🍽️</div>
                    <div style={s('font-weight:750; font-size:14px; color:#334155;')}>No hay solicitudes registradas</div>
                    <div style={s('font-size:12px; color:#94a3b8; margin-top:4px;')}>No se encontraron pedidos con los filtros aplicados. Prueba seleccionando "Ver Todo" o cambiando la fecha.</div>
                  </td></tr>
                ) : filtrados.map(item => {
                  const isAlm = item.subtipo === 'ALMUERZO_EXTRA', isSand = item.subtipo === 'REFRIGERIO_SANDUCHE';
                  const bColor = isAlm ? '#1e40af' : isSand ? '#c2410c' : '#a16207';
                  const est = ESTADOS[item.estado] || ESTADOS.SOLICITADO;
                  return (
                    <tr key={item.id} style={item.estado === 'CANCELADO' ? s('opacity: 0.55; background: #fafafa;') : undefined}>
                      <td>
                        <div style={s('font-weight:750; font-size:12.5px; color:#0f172a; white-space:nowrap;')}><i className="far fa-calendar-alt text-primary" style={s('margin-right:4px;')}></i>{item.fecha}</div>
                        <div style={s('font-size:11px; color:#64748b; margin-top:2px; white-space:nowrap;')}><i className="far fa-clock" style={s('margin-right:3px;')}></i>{item.hora || '--:--'}</div>
                      </td>
                      <td>
                        <div style={s('font-weight:750; font-size:12.5px; color:#0f172a;')}>{item.solicitante}</div>
                        {item.area && <span style={s('font-size:10px; font-weight:700; background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px; display:inline-block; margin-top:2px;')}><i className="fas fa-building" style={s('margin-right:3px;')}></i>{item.area}</span>}
                      </td>
                      <td><span style={s(`font-size:11px; font-weight:750; background:${isAlm ? '#eff6ff' : isSand ? '#fff7ed' : '#fefce8'}; color:${bColor}; padding:4px 9px; border-radius:8px; display:inline-flex; align-items:center; gap:5px; border:1px solid ${bColor}33; white-space:nowrap;`)}>{isAlm ? '🍱' : isSand ? '🥪' : '🍪'} {isAlm ? 'Almuerzo Extra' : isSand ? 'Sánduche' : 'Break Galletas'}</span></td>
                      <td style={s('text-align:center;')}><span style={s('display:inline-block; min-width:28px; padding:3px 8px; border-radius:8px; font-weight:800; font-size:13px; background:#f1f5f9; color:#0f172a;')}>{item.cantidad}</span></td>
                      <td>
                        <div style={s('font-weight:750; font-size:13px; color:#1e293b;')}>{item.invitado}</div>
                        {item.empresa && item.empresa !== 'TCONTROL' && <div style={s('font-size:11px; color:#0284c7; font-weight:700; margin-top:3px; display:inline-flex; align-items:center; gap:4px; background:#f0f9ff; border:1px solid #bae6fd; padding:1px 6px; border-radius:4px;')}><i className="fas fa-briefcase"></i>{item.empresa}</div>}
                      </td>
                      <td>
                        {item.horaServicio && <div style={s('font-size:11px; font-weight:750; color:#c2410c; background:#fff7ed; border:1px solid #ffedd5; padding:2px 7px; border-radius:6px; display:inline-flex; align-items:center; gap:4px; margin-bottom:4px;')}><i className="fas fa-bell"></i>Servir a las: {item.horaServicio}</div>}
                        <div style={s('font-size:11.5px; color:#475569; line-height:1.35;')} title={item.observaciones || ''}>
                          {item.observaciones || <span style={s('color:#cbd5e1; font-style:italic;')}>Sin observaciones adicionales</span>}
                        </div>
                      </td>
                      <td style={s('text-align:center;')}>
                        <select value={item.estado} onChange={ev => void cambiarEstado(item.id, ev.target.value)} style={s(`font-size:11.5px; font-weight:750; padding:4px 8px; border-radius:20px; border:1px solid ${est.color}44; background:${est.bg}; color:${est.color}; cursor:pointer; outline:none; transition:all 0.15s;`)}>
                          <option value="SOLICITADO">⏳ Solicitado</option>
                          <option value="CONFIRMADO">✓ Confirmado</option>
                          <option value="ENTREGADO">🍽️ Entregado</option>
                          <option value="CANCELADO">✕ Cancelado</option>
                        </select>
                      </td>
                      <td style={s('text-align:center;')}>
                        <button type="button" className="btn-del-invitado" onClick={() => void eliminar(item.id)} title="Eliminar registro de ALMUERZOS_EXTRA y notificar a Sup. Admin" style={s('border:none; background:#fee2e2; color:#dc2626; border-radius:8px; width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; font-size:12px; transition:all 0.15s; box-shadow:0 1px 3px rgba(220,38,38,0.15);')}><i className="fas fa-trash-alt"></i></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export { subtipoLabel };
