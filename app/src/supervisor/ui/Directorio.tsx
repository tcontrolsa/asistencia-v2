// Asistencia → Directorio de colaboradores (supervisor_directorio.js)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReactNode, useMemo, useState } from 'react';
import { rpc } from '../../lib/api';
import { s } from '../../lib/estilo';
import { refrescarSilencioso, resetearPasswordEmpleado } from '../acciones';
import { descargarExcel } from '../excel';
import {
  EstadoCumple, calcularEdad, formatearFechaNacimientoLegible, normalizarEstadoAlmuerzo, obtenerEstadoCumpleanos,
  obtenerFechaNacimientoEmpleado, obtenerPrimerNombreYPrimerApellido, resolverAlmuerzoHoyEmpleado,
} from '../legado/personas';
import { Emp, getLocalHoyStr } from '../legado/util';
import { abrirModal, mostrarDetalle } from '../nav';
import { mostrarLoader, useSup } from '../store';
import { PhotoCell, errorTexto, mostrarToast } from './comun';

type KpiDir = 'todos' | 'activos' | 'inactivos' | 'supervisores' | 'whatsapp' | 'cumpleanos';

function leerVista(): 'grid' | 'tabla' {
  try { return localStorage.getItem('TCONTROL_DIR_VISTA') === 'tabla' ? 'tabla' : 'grid'; } catch { return 'grid'; }
}

const esSup = (e: Emp) => { const v = String(e.supervisor || '').toUpperCase(); return v === 'SI' || v === 'SUPERVISOR ADMIN'; };

export function Directorio() {
  const empCache = useSup(x => x.empCache);
  useSup(x => x.version);
  const [kpi, setKpi] = useState<KpiDir>('todos');
  const [vista, setVista] = useState<'grid' | 'tabla'>(leerVista);
  const [term, setTerm] = useState('');
  const [area, setArea] = useState('');
  const [rol, setRol] = useState('');
  const [estado, setEstado] = useState('SI');
  const [alm, setAlm] = useState('');
  const [cumple, setCumple] = useState('');

  const kpis = useMemo(() => {
    let hoyC = 0, prox = 0;
    const cercanos: { emp: Emp; estado: EstadoCumple }[] = [];
    empCache.forEach(e => {
      if (e.activo === 'NO') return;
      const st = obtenerEstadoCumpleanos(obtenerFechaNacimientoEmpleado(e));
      if (!st) return;
      if (st.esHoy) { hoyC++; cercanos.push({ emp: e, estado: st }); }
      else if (st.diasFaltan <= 30) { prox++; if (st.diasFaltan <= 15) cercanos.push({ emp: e, estado: st }); }
    });
    const areas = [...new Set(empCache.map(e => String(e.area || '').trim().toUpperCase()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      total: empCache.length, activos: empCache.filter(e => e.activo !== 'NO').length, inactivos: empCache.filter(e => e.activo === 'NO').length,
      supervisores: empCache.filter(esSup).length, conWp: empCache.filter(e => e.telefono && String(e.telefono).trim().length >= 7).length,
      hoyC, prox, cercanos: cercanos.sort((a, b) => a.estado.diasFaltan - b.estado.diasFaltan), areas,
    };
  }, [empCache]);

  const t = term.trim().toLowerCase();
  const filtrados = empCache.filter(emp => {
    if (t) {
      const nac = obtenerFechaNacimientoEmpleado(emp);
      if (![emp.id, emp.nombre, emp.area, emp.cargo, emp.telefono].some(v => String(v || '').toLowerCase().includes(t)) && !(nac && nac.toLowerCase().includes(t))) return false;
    }
    if (area && String(emp.area || '').toUpperCase() !== area) return false;
    if (rol) {
      const sup = String(emp.supervisor || '').toUpperCase();
      if (rol === 'SUPERVISOR_ADMIN' && sup !== 'SUPERVISOR ADMIN') return false;
      if (rol === 'SUPERVISOR' && sup !== 'SI' && sup !== 'SUPERVISOR ADMIN') return false;
      if (rol === 'REGULAR' && (sup === 'SI' || sup === 'SUPERVISOR ADMIN')) return false;
    }
    if (estado) {
      const act = emp.activo !== 'NO';
      if (estado === 'SI' && !act) return false;
      if (estado === 'NO' && act) return false;
    }
    if (alm) {
      const a = resolverAlmuerzoHoyEmpleado(emp);
      if (alm === 'SI' && a !== 'SI') return false;
      if (alm === 'NO' && a !== 'NO') return false;
      if (alm === 'SIN_ASIGNAR' && a !== '') return false;
    }
    const st = (cumple || kpi === 'cumpleanos') ? obtenerEstadoCumpleanos(obtenerFechaNacimientoEmpleado(emp)) : null;
    if (cumple) {
      if (!st) return false;
      if (cumple === 'HOY' && !st.esHoy) return false;
      if (['7', '15', '30'].includes(cumple) && (st.diasFaltan < 0 || st.diasFaltan > Number(cumple))) return false;
    }
    if (kpi === 'activos' && emp.activo === 'NO') return false;
    if (kpi === 'inactivos' && emp.activo !== 'NO') return false;
    if (kpi === 'supervisores' && !esSup(emp)) return false;
    if (kpi === 'whatsapp' && (!emp.telefono || String(emp.telefono).trim().length < 7)) return false;
    if (kpi === 'cumpleanos' && (!st || (!st.esHoy && st.diasFaltan > 30))) return false;
    return true;
  });

  const hayFiltros = t !== '' || area !== '' || rol !== '' || (estado !== '' && estado !== 'SI') || alm !== '' || cumple !== '' || kpi !== 'todos';
  const limpiarTodo = () => { setTerm(''); setArea(''); setRol(''); setEstado(''); setAlm(''); setCumple(''); setKpi('todos'); };
  const cambiarVista = (v: 'grid' | 'tabla') => { setVista(v); try { localStorage.setItem('TCONTROL_DIR_VISTA', v); } catch { /* */ } };
  const selectEstilo = s('font-size:11.5px; height:38px; border-radius:10px; padding:0 10px; border:1px solid #cbd5e1; background:#ffffff; color:#334155; font-weight:600;');

  const tarjetaKpi = (k: KpiDir, id: string, etiqueta: string, icono: string, estiloCard: string, estiloIcono: string, valor: ReactNode, sub: ReactNode, estiloSub: string, title?: string) => (
    <div className={`kpi-card${kpi === k ? ' active' : ''}`} id={id} onClick={() => setKpi(k)} style={s(estiloCard + ' cursor:pointer;')} title={title}>
      <div className="kpi-header"><div className="kpi-icon" style={s(estiloIcono)}><i className={icono}></i></div><span className="kpi-label">{etiqueta}</span></div>
      <div className="kpi-value">{valor}</div>
      <div style={s(estiloSub)}>{sub}</div>
    </div>
  );

  return (
    <div id="subpanel-asistencia-directorio" className="subpanel" style={{ display: 'block' }}>
      <div className="cards-grid directorio-kpi-grid" style={s('margin-bottom: 14px;')}>
        {tarjetaKpi('todos', 'kpiDirCardTodos', 'Total Usuarios', 'fas fa-users', '--card-color: var(--blue); --active-bg: #eff6ff; --active-text: #1e40af; --shadow-color: rgba(37, 99, 235, 0.12);', 'background: var(--blu-lt); color: var(--blue);', kpis.total, 'En base de datos', 'font-size:10px; color:#64748b; margin-top:2px;')}
        {tarjetaKpi('activos', 'kpiDirCardActivos', 'Activos', 'fas fa-user-check', '--card-color: var(--green); --active-bg: #f0fdf4; --active-text: #15803d; --shadow-color: rgba(22, 163, 74, 0.12);', 'background: var(--grn-lt); color: var(--green);', kpis.activos, 'En nómina activa', 'font-size:10px; color:#16a34a; font-weight:600; margin-top:2px;')}
        {tarjetaKpi('inactivos', 'kpiDirCardInactivos', 'Inactivos', 'fas fa-user-slash', '--card-color: var(--rose); --active-bg: #fff1f2; --active-text: #be123c; --shadow-color: rgba(225, 29, 72, 0.12);', 'background: var(--ros-lt); color: var(--rose);', kpis.inactivos, 'Suspendidos / Bajas', 'font-size:10px; color:#e11d48; margin-top:2px;')}
        {tarjetaKpi('supervisores', 'kpiDirCardSupervisores', 'Supervisores', 'fas fa-user-shield', '--card-color: var(--purple); --active-bg: #f5f3ff; --active-text: #6d28d9; --shadow-color: rgba(124, 58, 237, 0.12);', 'background: #ede9fe; color: #7c3aed;', kpis.supervisores, 'Con permisos de gestión', 'font-size:10px; color:#7c3aed; margin-top:2px;')}
        {tarjetaKpi('whatsapp', 'kpiDirCardWhatsApp', 'Con WhatsApp', 'fab fa-whatsapp', '--card-color: #10b981; --active-bg: #ecfdf5; --active-text: #047857; --shadow-color: rgba(16, 185, 129, 0.12);', 'background: #d1fae5; color: #059669;', kpis.conWp, 'Notificaciones listas', 'font-size:10px; color:#059669; margin-top:2px;')}
        {tarjetaKpi('cumpleanos', 'kpiDirCardCumpleanos', 'Cumpleaños', 'fas fa-cake-candles', '--card-color: #d97706; --active-bg: #fef3c7; --active-text: #b45309; --shadow-color: rgba(217, 119, 6, 0.12);', 'background: #fef3c7; color: #d97706;', kpis.hoyC + kpis.prox,
          kpis.hoyC > 0 ? `🎂 ${kpis.hoyC} Hoy · ${kpis.prox} próx.` : `${kpis.hoyC + kpis.prox} en próx. 30 días`, 'font-size:10px; color:#d97706; font-weight:600; margin-top:2px;',
          'Filtrar colaboradores que cumplen años hoy o en los próximos 30 días')}
      </div>

      <div className="directorio-toolbar-container" style={s('background:#ffffff; border:1px solid var(--g200); border-radius:14px; padding:12px 16px; margin-bottom:16px; box-shadow:0 2px 6px rgba(0,0,0,0.03);')}>
        <div style={s('display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px;')}>
          <div style={s('position:relative; flex:1; min-width:260px;')}>
            <i className="fas fa-search" style={s('position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#94a3b8; font-size:13px;')}></i>
            <input type="text" id="srchDirectorio" value={term} onChange={ev => setTerm(ev.target.value)} placeholder="🔍 Buscar por nombre, ID, área, cargo o teléfono..." className="form-input"
              style={s('width:100%; padding-left:36px; padding-right:32px; border-radius:10px; font-size:12px; height:38px; border:1px solid #cbd5e1;')} />
            <button id="btnLimpiarSrchDir" onClick={() => setTerm('')} style={{ ...s('position:absolute; right:10px; top:50%; transform:translateY(-50%); border:none; background:none; color:#94a3b8; cursor:pointer; font-size:12px;'), display: t ? 'block' : 'none' }}><i className="fas fa-times-circle"></i></button>
          </div>
          <div style={s('display:flex; flex-wrap:wrap; gap:8px; align-items:center;')}>
            <select id="filtroAreaDirectorio" value={area} onChange={ev => setArea(ev.target.value)} className="filter-select" style={selectEstilo}>
              <option value="">🏢 Todas las áreas</option>
              {kpis.areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select id="filtroRolDirectorio" value={rol} onChange={ev => setRol(ev.target.value)} className="filter-select" style={selectEstilo}>
              <option value="">🛡️ Todos los roles</option>
              <option value="REGULAR">👤 Empleados Regulares</option>
              <option value="SUPERVISOR">🛡️ Supervisores</option>
              <option value="SUPERVISOR_ADMIN">👑 Supervisores Admin</option>
            </select>
            <select id="filtroEstadoDirectorio" value={estado} onChange={ev => setEstado(ev.target.value)} className="filter-select" style={selectEstilo}>
              <option value="">Todos los estados</option>
              <option value="SI">🟢 Solo Activos</option>
              <option value="NO">🔴 Solo Inactivos</option>
            </select>
            <select id="filtroAlmuerzoDirectorio" value={alm} onChange={ev => setAlm(ev.target.value)} className="filter-select" style={selectEstilo} title="Filtrar colaboradores por opción de almuerzo hoy">
              <option value="">🍽️ Almuerzo: Todos</option>
              <option value="SI">🍱 Almuerzo en Planta</option>
              <option value="NO">🥪 Almuerzo Fuera</option>
              <option value="SIN_ASIGNAR">⚪ Sin Asignar / Ausente</option>
            </select>
            <select id="filtroCumpleanosDirectorio" value={cumple} onChange={ev => setCumple(ev.target.value)} className="filter-select" style={selectEstilo} title="Filtrar colaboradores por cumpleaños">
              <option value="">🎂 Cumpleaños: Todos</option>
              <option value="HOY">🎂 Cumplen Hoy</option>
              <option value="7">🎉 Próximos 7 días</option>
              <option value="15">🗓️ Próximos 15 días</option>
              <option value="30">📅 Próximos 30 días</option>
            </select>
            <div className="directorio-view-toggle" style={s('display:inline-flex; background:#f1f5f9; padding:3px; border-radius:10px; border:1px solid #e2e8f0;')}>
              {(['grid', 'tabla'] as const).map(v => (
                <button key={v} type="button" id={v === 'grid' ? 'btnDirVistaGrid' : 'btnDirVistaTabla'} onClick={() => cambiarVista(v)} className={`btn-dir-view${vista === v ? ' active' : ''}`}
                  title={v === 'grid' ? 'Vista de Cuadrícula / Tarjetas' : 'Vista de Lista / Tabla'}
                  style={{ ...s('border:none; padding:6px 10px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:5px; transition:all 0.15s;'),
                    background: vista === v ? 'white' : 'transparent', color: vista === v ? '#0f172a' : '#64748b', boxShadow: vista === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                  <i className={v === 'grid' ? 'fas fa-th-large' : 'fas fa-table-list'}></i> {v === 'grid' ? 'Tarjetas' : 'Tabla'}
                </button>
              ))}
            </div>
          </div>
          <div style={s('display:flex; gap:8px; align-items:center;')}>
            <button type="button" onClick={() => void exportarDirectorioExcel(filtrados.length ? filtrados : empCache)} className="btn btn-success"
              style={s('height:38px; padding:0 14px; border-radius:10px; font-size:12px; font-weight:700; background:#0f9d58; border:none; color:white; display:inline-flex; align-items:center; gap:6px; cursor:pointer; box-shadow:0 2px 5px rgba(15,157,88,0.22); transition:transform 0.15s;')}
              title="Exportar la lista actual a archivo Excel (.xlsx)"><i className="fas fa-file-excel"></i> Exportar Excel</button>
            <button type="button" onClick={() => abrirModal('nuevoEmp')} className="btn btn-primary"
              style={s('height:38px; padding:0 14px; border-radius:10px; font-size:12px; font-weight:700; background:var(--blue); border:none; color:white; display:inline-flex; align-items:center; gap:6px; cursor:pointer; box-shadow:0 2px 5px rgba(37,99,235,0.22); transition:transform 0.15s;')}
              title="Registrar un nuevo colaborador"><i className="fas fa-user-plus"></i> Nuevo Usuario</button>
          </div>
        </div>
        <div style={s('margin-top:10px; padding-top:8px; border-top:1px dashed #e2e8f0; display:flex; justify-content:space-between; align-items:center; font-size:11.5px; color:#64748b;')}>
          <div>Mostrando <strong id="dirConteoFiltrados" style={s('color:#0f172a;')}>{filtrados.length}</strong> de <span id="dirConteoTotal">{empCache.length}</span> colaboradores</div>
          <div id="dirFiltroActivoIndicator" style={{ ...s('color:#2563eb; font-weight:600;'), display: hayFiltros ? 'block' : 'none' }}>
            <i className="fas fa-filter"></i> Filtro activo aplicado · <a href="#" onClick={ev => { ev.preventDefault(); limpiarTodo(); }} style={s('color:#ef4444; text-decoration:underline;')}>Restablecer filtros</a>
          </div>
        </div>
      </div>

      <BannerCumpleanos lista={kpis.cercanos} onVerTodos={() => setKpi('cumpleanos')} />

      {filtrados.length > 0 && vista === 'grid' && (
        <div id="directorioGridContainer" className="directorio-grid" style={s('display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;')}>
          {filtrados.map(emp => <TarjetaDirectorio key={emp.id} emp={emp} />)}
        </div>
      )}
      {filtrados.length > 0 && vista === 'tabla' && (
        <div id="directorioTablaContainer" className="table-wrapper" style={s('display:block; background:#ffffff; border-radius:12px; border:1px solid var(--g200); box-shadow:0 2px 8px rgba(0,0,0,0.03); overflow-x:auto;')}>
          <table className="employee-table directorio-table" style={s('width:100%; border-collapse:collapse;')}>
            <thead>
              <tr style={s('background:#f8fafc;')}>
                <th style={s('padding:10px 12px; text-align:left; font-size:11px; font-weight:800; color:#475569;')}>Colaborador</th>
                <th style={s('padding:10px 12px; text-align:left; font-size:11px; font-weight:800; color:#475569;')}>Área & Cargo</th>
                <th style={s('padding:10px 12px; text-align:left; font-size:11px; font-weight:800; color:#475569;')}><i className="fas fa-cake-candles" style={s('color:#f59e0b; margin-right:4px;')}></i> F. Nacimiento</th>
                <th style={s('padding:10px 12px; text-align:left; font-size:11px; font-weight:800; color:#475569;')}>Contacto WhatsApp</th>
                <th style={s('padding:10px 12px; text-align:center; font-size:11px; font-weight:800; color:#475569; min-width:140px;')}><i className="fas fa-utensils" style={s('color:#64748b; margin-right:4px;')}></i> Almuerzo Hoy</th>
                <th style={s('padding:10px 12px; text-align:center; font-size:11px; font-weight:800; color:#475569; min-width:220px;')}>Acciones Rápidas</th>
              </tr>
            </thead>
            <tbody id="tbodyDirectorioTabla">{filtrados.map(emp => <FilaDirectorio key={emp.id} emp={emp} />)}</tbody>
          </table>
        </div>
      )}
      {filtrados.length === 0 && (
        <div id="directorioEmptyState" style={s('display:block; text-align:center; padding:50px 20px; background:#ffffff; border-radius:14px; border:1px dashed #cbd5e1; margin-top:14px;')}>
          <div style={s('width:64px; height:64px; border-radius:50%; background:#f1f5f9; color:#94a3b8; display:inline-flex; align-items:center; justify-content:center; font-size:26px; margin-bottom:12px;')}><i className="fas fa-users-slash"></i></div>
          <h3 style={s('font-size:15px; font-weight:800; color:#1e293b; margin:0 0 6px 0;')}>No se encontraron colaboradores</h3>
          <p style={s('font-size:12px; color:#64748b; margin:0 0 14px 0;')}>Intenta modificar el término de búsqueda o limpia los filtros activos.</p>
          <button type="button" onClick={limpiarTodo} className="btn btn-primary" style={s('padding:8px 16px; border-radius:8px; font-size:12px; font-weight:700; background:#2563eb; color:white; border:none; cursor:pointer;')}>
            <i className="fas fa-sync-alt"></i> Limpiar Filtros
          </button>
        </div>
      )}
    </div>
  );
}

function BannerCumpleanos({ lista, onVerTodos }: { lista: { emp: Emp; estado: EstadoCumple }[]; onVerTodos: () => void }) {
  if (!lista.length) return <div id="dirBannerCumpleanos" style={s('display:none; margin-bottom:16px;')}></div>;
  const hayHoy = lista.some(x => x.estado.esHoy);
  return (
    <div id="dirBannerCumpleanos" style={s('display:block; margin-bottom:16px;')}>
      <div style={s('background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border:1px solid #fde68a; border-radius:14px; padding:12px 16px; box-shadow:0 3px 8px rgba(245,158,11,0.08);')}>
        <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;')}>
          <div style={s('display:flex; align-items:center; gap:8px;')}>
            <span style={s('font-size:18px;')}>{hayHoy ? '🎂' : '🗓️'}</span>
            <span style={s('font-weight:800; font-size:13px; color:#92400e;')}>{hayHoy ? '¡Cumpleaños de Hoy y Próximos Colaboradores!' : 'Próximos Cumpleaños (15 días)'}</span>
            <span style={s('background:#fde68a; color:#78350f; padding:1px 7px; border-radius:20px; font-size:10.5px; font-weight:800;')}>{lista.length}</span>
          </div>
          <button type="button" onClick={onVerTodos} style={s('background:none; border:none; color:#b45309; font-size:11.5px; font-weight:700; cursor:pointer; text-decoration:underline;')}>Ver todos en la lista →</button>
        </div>
        <div style={s('display:flex; flex-wrap:wrap; gap:8px; align-items:center;')}>
          {lista.map(({ emp: e, estado: st }) => {
            const nombreFmt = obtenerPrimerNombreYPrimerApellido(e.nombre);
            const edadStr = st.edad ? ` (${st.edad} años)` : '';
            if (st.esHoy) {
              return (
                <div key={e.id} style={s('background:#fef3c7; border:1.5px solid #f59e0b; border-radius:10px; padding:6px 12px; display:inline-flex; align-items:center; gap:8px; box-shadow:0 2px 5px rgba(245,158,11,0.15);')}>
                  <span style={s('font-size:16px;')}>🎂</span>
                  <div>
                    <div style={s('font-weight:800; font-size:12px; color:#92400e;')}>¡Hoy! {nombreFmt}{edadStr}</div>
                    <div style={s('font-size:10px; color:#b45309;')}>{e.cargo || e.area || ''}</div>
                  </div>
                  <button type="button" onClick={() => abrirModal('waIndividual', { id: e.id })} style={s('background:#16a34a; color:white; border:none; border-radius:6px; padding:4px 9px; font-size:11px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:4px; margin-left:4px;')} title="Felicitar por WhatsApp">
                    <i className="fab fa-whatsapp"></i> Felicitar</button>
                </div>
              );
            }
            return (
              <div key={e.id} style={s('background:#ffffff; border:1px solid #fed7aa; border-radius:10px; padding:6px 12px; display:inline-flex; align-items:center; gap:8px; box-shadow:0 1px 3px rgba(0,0,0,0.04);')}>
                <span style={s('font-size:14px; color:#ea580c;')}>🎉</span>
                <div>
                  <div style={s('font-weight:750; font-size:11.5px; color:#1e293b;')}>{nombreFmt}{edadStr}</div>
                  <div style={s('font-size:10px; color:#ea580c; font-weight:600;')}>{st.diasFaltan === 1 ? 'Mañana' : `En ${st.diasFaltan} días`} ({st.fechaLegible})</div>
                </div>
                <button type="button" onClick={() => abrirModal('waIndividual', { id: e.id })} style={s('background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; border-radius:6px; padding:3px 7px; font-size:10px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:3px; margin-left:2px;')} title="Enviar WhatsApp">
                  <i className="fab fa-whatsapp"></i></button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BadgeRol({ emp }: { emp: Emp }) {
  const sup = String(emp.supervisor || '').toUpperCase();
  if (sup === 'SUPERVISOR ADMIN') return <span className="dir-badge-pill dir-badge-rol-admin"><i className="fas fa-crown"></i> Sup. Admin</span>;
  if (sup === 'SI') return <span className="dir-badge-pill dir-badge-rol-sup"><i className="fas fa-user-shield"></i> Supervisor</span>;
  return <span className="dir-badge-pill dir-badge-rol-reg"><i className="fas fa-user"></i> Empleado</span>;
}

function SelectAlmuerzo({ emp, iconos }: { emp: Emp; iconos?: boolean }) {
  const a = resolverAlmuerzoHoyEmpleado(emp);
  return (
    <select value={a} onChange={ev => void cambiarAlmuerzoDirectorio(emp, ev.target.value)} className={`dir-alm-select ${a === 'SI' ? 'is-planta' : a === 'NO' ? 'is-fuera' : 'is-none'}`}
      title={iconos ? 'Almuerzo de hoy: clic para modificar' : 'Cambiar almuerzo de hoy para este colaborador'}>
      <option value="SI">{iconos ? '🍱 Planta (Sí)' : 'Planta (Sí)'}</option>
      <option value="NO">{iconos ? '🥪 Fuera (No)' : 'Fuera (No)'}</option>
      <option value="">{iconos ? '⚪ Sin registro' : '— Sin asignar —'}</option>
    </select>
  );
}

function TarjetaDirectorio({ emp }: { emp: Emp }) {
  const esActivo = emp.activo !== 'NO';
  const rawTel = String(emp.telefono || '').trim();
  const st = obtenerEstadoCumpleanos(obtenerFechaNacimientoEmpleado(emp));
  const fNac = st ? st.fechaLegible : formatearFechaNacimientoLegible(obtenerFechaNacimientoEmpleado(emp));
  const almNorm = resolverAlmuerzoHoyEmpleado(emp);
  let fNacHtml: ReactNode;
  if (st && st.esHoy) fNacHtml = <span style={s('background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:2px 8px; border-radius:8px; font-size:10.5px; font-weight:800; display:inline-flex; align-items:center; gap:4px; box-shadow:0 1px 3px rgba(245,158,11,0.2);')} title={`¡Hoy es su cumpleaños! Fecha: ${fNac}`}>🎂 ¡Hoy! {st.edad !== null ? `(${st.edad} años)` : ''}</span>;
  else if (st && st.diasFaltan <= 7) fNacHtml = <span style={s('background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; padding:2px 8px; border-radius:8px; font-size:10.5px; font-weight:750; display:inline-flex; align-items:center; gap:4px;')} title={`Próximo cumpleaños en ${st.diasFaltan} días (${fNac})`}>🎉 En {st.diasFaltan} día{st.diasFaltan > 1 ? 's' : ''} {st.edad !== null ? `(${st.edad} a.)` : ''}</span>;
  else if (st && st.diasFaltan <= 30) fNacHtml = <span style={s('background:#f0f9ff; color:#0369a1; border:1px solid #bae6fd; padding:2px 8px; border-radius:8px; font-size:10.5px; font-weight:700; display:inline-flex; align-items:center; gap:4px;')} title={`Cumpleaños próximo: ${fNac}`}>🗓️ En {st.diasFaltan} días {st.edad !== null ? `(${st.edad} a.)` : ''}</span>;
  else if (fNac) { const edad = calcularEdad(obtenerFechaNacimientoEmpleado(emp)); fNacHtml = <span style={s('color:#1e293b; font-size:11.5px; font-weight:600; display:inline-flex; align-items:center; gap:4px;')} title="Fecha de nacimiento">{fNac} {edad !== null && <span style={s('color:#64748b; font-size:10.5px; font-weight:500;')}>({edad} a.)</span>}</span>; }
  else fNacHtml = <span style={s('color:#94a3b8; font-size:11px; display:inline-flex; align-items:center; gap:4px; cursor:pointer;')} onClick={() => abrirModal('editarEmp', { id: emp.id })} title="Clic para registrar fecha de nacimiento"><i className="fas fa-calendar-plus" style={s('color:#cbd5e1;')}></i> Sin registrar</span>;

  return (
    <div className="dir-emp-card">
      <div className="dir-card-header">
        <div className="dir-photo-container" onClick={() => mostrarDetalle(emp.id)} title="Ver detalle completo de asistencia">
          <PhotoCell e={emp} />
          <div className={`dir-status-dot ${esActivo ? 'active' : 'inactive'}`} title={esActivo ? 'Usuario Activo' : 'Usuario Inactivo'}></div>
        </div>
        <div style={s('flex:1; min-width:0;')}>
          <div style={s('display:flex; justify-content:space-between; align-items:flex-start; gap:6px;')}>
            <h4 style={s('margin:0; font-size:13.5px; font-weight:750; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer;')} onClick={() => mostrarDetalle(emp.id)} title={emp.nombre}>{emp.nombre}</h4>
            <BadgeRol emp={emp} />
          </div>
          <div style={s('display:flex; gap:6px; align-items:center; margin-top:3px; font-size:11px; color:#64748b; font-weight:600;')}>
            <span style={s("background:#f1f5f9; padding:1px 6px; border-radius:4px; font-family:'Fira Code', monospace;")}>ID: {emp.id}</span>
            <span>·</span>
            <span style={s('white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')} title={emp.cargo || 'Sin cargo'}>{emp.cargo || 'Sin cargo'}</span>
          </div>
        </div>
      </div>
      <div className="dir-card-body">
        <div className="dir-info-row"><span><i className="fas fa-building" style={s('color:#64748b; margin-right:4px;')}></i> Área:</span>
          <strong style={s('color:#1e293b; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{emp.area || 'Sin área'}</strong></div>
        <div className="dir-info-row"><span><i className="fas fa-cake-candles" style={s('color:#f59e0b; margin-right:4px;')}></i> F. Nacimiento:</span><div>{fNacHtml}</div></div>
        <div className="dir-info-row"><span><i className="fas fa-phone-alt" style={s('color:#64748b; margin-right:4px;')}></i> Contacto:</span>
          <div>{rawTel.length >= 7
            ? <a href="#" onClick={ev => { ev.preventDefault(); abrirModal('waIndividual', { id: emp.id }); }} title={`Enviar WhatsApp a ${emp.nombre}`} style={s('color:#16a34a; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-size:11.5px;')}><i className="fab fa-whatsapp" style={s('font-size:13px;')}></i> {rawTel}</a>
            : <span style={s('color:#94a3b8; font-size:11px; display:inline-flex; align-items:center; gap:4px; cursor:pointer;')} onClick={() => abrirModal('editarEmp', { id: emp.id })} title="Clic para agregar WhatsApp"><i className="fab fa-whatsapp" style={s('color:#cbd5e1;')}></i> Sin registrar</span>}</div></div>
        <div className="dir-info-row"><span><i className="fas fa-user-check" style={s('color:#64748b; margin-right:4px;')}></i> Estado:</span>
          {esActivo
            ? <span style={s('background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:750; border:1px solid #bbf7d0;')}><i className="fas fa-check-circle" style={s('font-size:8px;')}></i> Activo</span>
            : <span style={s('background:#fee2e2; color:#be123c; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:750; border:1px solid #fecaca;')}><i className="fas fa-ban" style={s('font-size:8px;')}></i> Inactivo</span>}</div>
        <div className="dir-info-row"><span><i className="fas fa-utensils" style={s('color:#64748b; margin-right:4px;')}></i> Almuerzo Hoy:</span>
          <div style={s('display:flex; align-items:center; gap:6px;')}>
            {almNorm === 'SI' ? <span style={s('background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; padding:2px 7px; border-radius:6px; font-size:10px; font-weight:750;')}><i className="fas fa-utensils"></i> Planta</span>
              : almNorm === 'NO' ? <span style={s('background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; padding:2px 7px; border-radius:6px; font-size:10px; font-weight:750;')}><i className="fas fa-motorcycle"></i> Fuera</span>
                : <span style={s('font-size:10px; color:#94a3b8; font-weight:600;')}><i className="fas fa-minus-circle"></i> Sin registro</span>}
            <SelectAlmuerzo emp={emp} />
          </div></div>
      </div>
      <div className="dir-card-actions">
        <button type="button" className="dir-btn-action btn-edit" onClick={() => abrirModal('editarEmp', { id: emp.id })} title="Editar ficha completa del usuario (Área, Cargo, PIN, Rol, WhatsApp)"><i className="fas fa-user-edit"></i> Editar</button>
        <button type="button" className="dir-btn-action btn-detail" onClick={() => mostrarDetalle(emp.id)} title="Ver expediente de asistencia 360 y registros"><i className="fas fa-id-badge"></i> Detalle</button>
        <button type="button" className="dir-btn-action btn-wp" onClick={() => abrirModal('waIndividual', { id: emp.id })} title="Enviar WhatsApp directo"><i className="fab fa-whatsapp"></i></button>
        <button type="button" className="dir-btn-action btn-key" onClick={() => void resetearPasswordEmpleado(emp.id, emp.nombre)} title="Resetear contraseña / PIN de vinculación"><i className="fas fa-key"></i></button>
        <button type="button" className="dir-btn-action" onClick={() => abrirModal('futuro', { id: emp.id })} title="Programar evento o ausencia (permiso, vacación)" style={s('background:#faf5ff; border-color:#e9d5ff; color:#7e22ce;')}><i className="fas fa-calendar-plus"></i></button>
        <button type="button" className="dir-btn-action" onClick={() => abrirModal('campo', { id: emp.id })} title="Registrar salida o trabajo en campo" style={s('background:#f0fdf4; border-color:#bbf7d0; color:#15803d;')}><i className="fas fa-hammer"></i></button>
      </div>
    </div>
  );
}

function FilaDirectorio({ emp }: { emp: Emp }) {
  const rawTel = String(emp.telefono || '').trim();
  const rawN = obtenerFechaNacimientoEmpleado(emp);
  const st = obtenerEstadoCumpleanos(rawN);
  const fL = st ? st.fechaLegible : formatearFechaNacimientoLegible(rawN);
  const edad = st ? st.edad : calcularEdad(rawN);
  let celdaNac: ReactNode;
  if (st && st.esHoy) celdaNac = <div style={s('display:flex; flex-direction:column; gap:2px;')}><span style={s('background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:2.5px 8px; border-radius:6px; font-size:10.5px; font-weight:800; display:inline-flex; align-items:center; gap:4px; width:fit-content; box-shadow:0 1px 3px rgba(245,158,11,0.2);')} title="¡Hoy es su cumpleaños!">🎂 ¡Hoy! {edad !== null ? `(${edad} años)` : ''}</span><span style={s('color:#475569; font-size:10.5px; font-weight:600;')}>{fL}</span></div>;
  else if (st && st.diasFaltan <= 7) celdaNac = <div style={s('display:flex; flex-direction:column; gap:2px;')}><span style={s('background:#ecfdf5; color:#047857; border:1px solid #a7f3d0; padding:2px 7px; border-radius:6px; font-size:10px; font-weight:800; display:inline-flex; align-items:center; gap:4px; width:fit-content;')} title={`Próximo cumpleaños en ${st.diasFaltan} días`}>🎉 En {st.diasFaltan} día{st.diasFaltan > 1 ? 's' : ''} {edad !== null ? `(${edad} a.)` : ''}</span><span style={s('color:#64748b; font-size:10.5px;')}>{fL}</span></div>;
  else if (st && st.diasFaltan <= 30) celdaNac = <div style={s('display:flex; flex-direction:column; gap:2px;')}><span style={s('background:#f0f9ff; color:#0369a1; border:1px solid #bae6fd; padding:2px 7px; border-radius:6px; font-size:10px; font-weight:700; display:inline-flex; align-items:center; gap:4px; width:fit-content;')} title={`Cumpleaños próximo en ${st.diasFaltan} días`}>🗓️ En {st.diasFaltan} días {edad !== null ? `(${edad} a.)` : ''}</span><span style={s('color:#64748b; font-size:10.5px;')}>{fL}</span></div>;
  else if (fL) celdaNac = <div style={s('display:flex; flex-direction:column; gap:1px;')}><span style={s('font-weight:700; color:#1e293b; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;')}><i className="fas fa-cake-candles" style={s('color:#f59e0b; font-size:10px;')}></i> {fL}</span>{edad !== null && <span style={s('font-size:10.5px; color:#64748b;')}>{edad} años</span>}</div>;
  else celdaNac = <span style={s('color:#94a3b8; font-size:11px; cursor:pointer;')} onClick={() => abrirModal('editarEmp', { id: emp.id })} title="Clic para registrar fecha de nacimiento"><i className="fas fa-calendar-plus" style={s('color:#cbd5e1; margin-right:3px;')}></i>—</span>;
  const hover = (on: boolean) => (ev: React.MouseEvent<HTMLTableRowElement>) => { ev.currentTarget.style.background = on ? '#f8fafc' : 'white'; };
  return (
    <tr style={s('border-bottom:1px solid #f1f5f9; transition:background 0.15s;')} onMouseOver={hover(true)} onMouseOut={hover(false)}>
      <td style={s('padding:10px 12px;')}>
        <div style={s('display:flex; align-items:center; gap:10px;')}>
          <div style={s('cursor:pointer;')} onClick={() => mostrarDetalle(emp.id)} title="Ver detalle"><PhotoCell e={emp} /></div>
          <div>
            <div style={s('font-weight:750; font-size:12px; color:#0f172a; cursor:pointer;')} onClick={() => mostrarDetalle(emp.id)} title={emp.nombre}>{emp.nombre}</div>
            <div style={s("font-size:10.5px; color:#64748b; font-family:'Fira Code', monospace; margin-top:1px;")}>ID: <strong>{emp.id}</strong></div>
          </div>
        </div>
      </td>
      <td style={s('padding:10px 12px; font-size:11.5px;')}><div style={s('font-weight:700; color:#1e293b;')}>{emp.area || '—'}</div><div style={s('font-size:10.5px; color:#64748b;')}>{emp.cargo || '—'}</div></td>
      <td style={s('padding:10px 12px; font-size:11.5px; white-space:nowrap;')}>{celdaNac}</td>
      <td style={s('padding:10px 12px;')}>{rawTel.length >= 7
        ? <a href="#" onClick={ev => { ev.preventDefault(); abrirModal('waIndividual', { id: emp.id }); }} style={s('color:#16a34a; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-size:11.5px;')} title="Enviar WhatsApp"><i className="fab fa-whatsapp"></i> {rawTel}</a>
        : <span style={s('color:#94a3b8; font-size:11px;')}>—</span>}</td>
      <td style={s('padding:10px 12px; text-align:center;')}><SelectAlmuerzo emp={emp} iconos /></td>
      <td style={s('padding:10px 12px; text-align:center;')}>
        <div className="dir-table-actions">
          <button type="button" className="dir-table-btn" onClick={() => abrirModal('editarEmp', { id: emp.id })} title="Editar Ficha de Usuario" style={s('color:#2563eb; border-color:#bfdbfe; background:#eff6ff;')}><i className="fas fa-user-edit"></i></button>
          <button type="button" className="dir-table-btn" onClick={() => mostrarDetalle(emp.id)} title="Ver Detalle de Asistencia 360" style={s('color:#475569;')}><i className="fas fa-id-badge"></i></button>
          <button type="button" className="dir-table-btn" onClick={() => abrirModal('waIndividual', { id: emp.id })} title="Enviar WhatsApp" style={s('color:#16a34a; border-color:#bbf7d0; background:#f0fdf4;')}><i className="fab fa-whatsapp"></i></button>
          <button type="button" className="dir-table-btn" onClick={() => void resetearPasswordEmpleado(emp.id, emp.nombre)} title="Resetear Contraseña / PIN" style={s('color:#be123c; border-color:#fecdd3; background:#fff1f2;')}><i className="fas fa-key"></i></button>
          <button type="button" className="dir-table-btn" onClick={() => abrirModal('futuro', { id: emp.id })} title="Programar Ausencia o Permiso" style={s('color:#7c3aed; border-color:#ddd6fe; background:#f5f3ff;')}><i className="fas fa-calendar-plus"></i></button>
          <button type="button" className="dir-table-btn" onClick={() => abrirModal('campo', { id: emp.id })} title="Registrar Trabajo en Campo" style={s('color:#059669; border-color:#a7f3d0; background:#ecfdf5;')}><i className="fas fa-hammer"></i></button>
        </div>
      </td>
    </tr>
  );
}

async function cambiarAlmuerzoDirectorio(emp: Emp, nuevo: string) {
  const estadoNorm = normalizarEstadoAlmuerzo(nuevo);
  const etiqueta = estadoNorm === 'SI' ? 'Planta' : estadoNorm === 'NO' ? 'Fuera' : 'Sin asignar';
  mostrarToast(`Almuerzo hoy: ${etiqueta}`, 'info');
  try {
    await rpc('sup_cambiar_almuerzo', { p_empleado_id: emp.id, p_almuerzo: estadoNorm, p_fecha: getLocalHoyStr() });
    mostrarToast(`Almuerzo guardado correctamente (${etiqueta})`, 'success');
    await refrescarSilencioso();
  } catch (e) {
    mostrarToast(errorTexto(e) || 'Error al guardar almuerzo en servidor', 'error');
  }
}

async function exportarDirectorioExcel(lista: Emp[]) {
  if (!lista.length) { mostrarToast('No hay colaboradores para exportar', 'warning'); return; }
  mostrarLoader(true);
  try {
    const filas = lista.map(emp => {
      const sup = String(emp.supervisor || '').toUpperCase();
      const almNorm = resolverAlmuerzoHoyEmpleado(emp);
      const rawNac = obtenerFechaNacimientoEmpleado(emp);
      const edad = calcularEdad(rawNac);
      return [emp.id ? String(emp.id) : '', emp.nombre || '', emp.area || 'SIN ASIGNAR', emp.cargo || 'SIN ASIGNAR', emp.telefono || '',
        formatearFechaNacimientoLegible(rawNac) || '', edad !== null ? edad : '', emp.tiene_password ? 'Creada' : 'Pendiente',
        sup === 'SUPERVISOR ADMIN' ? 'Supervisor Admin' : sup === 'SI' ? 'Supervisor' : 'Empleado Regular', emp.activo === 'NO' ? 'Inactivo' : 'Activo',
        emp.cultura_habilitada === false ? 'Exonerado' : 'Habilitado', emp.id_dispositivo ? 'Vinculado' : 'Sin Rol',
        almNorm === 'SI' ? 'Planta' : almNorm === 'NO' ? 'Fuera' : 'Sin registro'];
    });
    await descargarExcel(`Directorio_Personal_TCONTROL_${getLocalHoyStr()}.xlsx`, [{
      nombre: 'Directorio Colaboradores',
      filas: [['Cédula / ID', 'Nombre Completo', 'Área / Departamento', 'Cargo', 'WhatsApp / Teléfono', 'Fecha de Nacimiento', 'Edad',
        'Contraseña', 'Rol en el Sistema', 'Estado Nómina', 'Cultura Tcontrol', 'Rol de Pagos', 'Almuerzo Hoy'], ...filas],
      anchos: [16, 32, 22, 22, 18, 18, 8, 12, 20, 14, 18, 15, 16],
    }]);
    mostrarToast(`Directorio exportado exitosamente (${filas.length} colaboradores)`, 'success');
  } catch (e) {
    mostrarToast('Error al generar archivo Excel: ' + errorTexto(e), 'error');
  } finally { mostrarLoader(false); }
}
