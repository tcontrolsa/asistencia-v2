// Inspector y Simulador de Empleados (visor_empleado.html). El legado falsificaba la sesión del colaborador en
// localStorage; ahora el servidor emite una sesión de solo lectura (api.sup_simular_empleado, P-16) que se entrega a
// la app del iframe por el fragmento de la URL (no viaja al servidor) y nunca toca la sesión propia del navegador.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react';
import { rpc } from '../lib/api';
import { leerClaims } from '../lib/sesion';
import { s } from '../lib/estilo';

interface EmpSim { id: string; nombre: string; area?: string; cargo?: string; activo: boolean; supervisor?: string; rol: string;
  latitud?: number | null; longitud?: number | null; tienePassword: boolean | null }

export function VisorApp() {
  const claims = leerClaims();
  const autorizado = !!claims && ['supervisor_admin', 'admin'].includes(claims.role);
  const [lista, setLista] = useState<EmpSim[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<EmpSim | null>(null);
  const [simulado, setSimulado] = useState<EmpSim | null>(null);
  const [src, setSrc] = useState('about:blank');
  const [toast, setToast] = useState<{ msg: string; tipo: string } | null>(null);
  const reloj = useRef(0);

  const mostrarToast = (msg: string, tipo = '') => {
    setToast({ msg, tipo });
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!autorizado) return;
    rpc<EmpSim[]>('sup_simular_lista', {})
      .then(l => { setLista(l); mostrarToast('Base de datos cargada correctamente.', 'success'); })
      .catch(e => { setError(e.message); mostrarToast('Error al conectar con el servidor: ' + e.message, 'error'); });
  }, [autorizado]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = useMemo(() => {
    const t = q.toLowerCase().trim();
    return (lista || []).filter(e => (e.nombre || '').toLowerCase().includes(t) || (e.id || '').includes(t)
      || (e.area || '').toLowerCase().includes(t) || (e.cargo || '').toLowerCase().includes(t));
  }, [lista, q]);

  const simular = async (emp: EmpSim | null = sel) => {
    if (!emp) return;
    if (!emp.activo) { mostrarToast('Solo se puede simular a colaboradores activos.', 'error'); return; }
    mostrarToast(`Iniciando simulación de credencial para: ${emp.nombre}...`, 'success');
    try {
      const r = await rpc<{ token: string }>('sup_simular_empleado', { p_empleado_id: emp.id });
      setSimulado(emp);
      setSrc(`index.html?vista=${Date.now()}#simular=${encodeURIComponent(r.token)}`);
    } catch (e: any) { mostrarToast(e.message, 'error'); }
  };
  const reiniciar = () => { if (simulado) void simular(simulado).then(() => mostrarToast('Simulador recargado.', 'success')); };
  const detener = () => { setSimulado(null); setSrc('about:blank'); mostrarToast('Simulación detenida correctamente.', 'info'); };

  if (!autorizado) {
    return (
      <div style={s("min-height: 100vh; display:flex; align-items:center; justify-content:center; padding:20px; font-family:'Plus Jakarta Sans',sans-serif; background:#0b0f19;")}>
        <div style={s('background:#1e293b; border:1px solid rgba(255,255,255,0.1); border-radius:24px; padding:40px 30px; max-width:440px; width:100%; text-align:center; box-shadow:0 20px 50px rgba(0,0,0,0.5);')}>
          <div style={s('width:76px; height:76px; margin:0 auto 20px; border-radius:50%; background:rgba(220,38,38,0.15); border:1.5px solid rgba(220,38,38,0.4); display:flex; align-items:center; justify-content:center; font-size:32px; color:#ef4444;')}><i className="fas fa-user-secret"></i></div>
          <h2 style={s("font-size:22px; font-weight:800; color:#f8fafc; margin-bottom:12px; font-family:'Outfit',sans-serif;")}>Simulador Protegido</h2>
          <p style={s('font-size:14px; color:#94a3b8; line-height:1.6; margin-bottom:28px;')}>El simulador e inspector de credenciales contiene funciones de acceso administrativo. Se requiere sesión activa de Administrador.</p>
          <a href="supervisor.html" style={s('display:inline-flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:14px; background:linear-gradient(135deg, #dc2626, #b91c1c); color:white; font-weight:700; border-radius:12px; text-decoration:none; box-shadow:0 8px 24px rgba(220,38,38,0.35);')}><i className="fas fa-lock"></i> Iniciar Sesión de Administrador</a>
        </div>
      </div>
    );
  }

  const activoSel = !!sel && simulado?.id === sel.id;
  return (
    <>
      <header>
        <div className="header-logo">
          <div className="logo-icon"><i className="fas fa-mobile-screen-button"></i></div>
          <div className="logo-text">CONTROL <span>Inspector</span></div>
        </div>
        <div className="sim-indicator" style={{ display: simulado ? 'flex' : 'none' }}>
          <span className="pulse-active"></span>
          <span>Simulando a: <strong>{simulado?.nombre}</strong> (ID: {simulado?.id}) · solo lectura</span>
        </div>
        <div className="header-badge"><i className="fas fa-circle-info"></i> Modo Supervisor Activo</div>
      </header>

      <div className="workspace">
        <div className="panel-control">
          <div className="panel-header">
            <h3 className="panel-title"><i className="fas fa-search"></i> Selector de Personal</h3>
            <div className="search-container">
              <i className="fas fa-magnifying-glass search-icon"></i>
              <input type="text" className="search-input" placeholder="Buscar por Nombre, Cédula o Área..." value={q} onChange={e => setQ(e.target.value)} />
            </div>
          </div>
          <div className="list-header"><span>Personal</span><span>{lista ? `${filtrados.length} usuarios` : 'Cargando...'}</span></div>
          <div className="employee-list">
            {error ? (
              <div style={s('padding:20px; text-align:center; color:var(--rose); font-size:12px;')}>
                <i className="fas fa-exclamation-triangle" style={s('font-size:24px; margin-bottom:8px; display:block;')}></i>Fallo al cargar personal: <br />{error}
              </div>
            ) : !lista ? (
              <div style={s('display:flex; justify-content:center; align-items:center; height:100px; flex-direction:column; gap:10px;')}>
                <div className="loader"></div><span style={s('font-size:12px; color:var(--text-muted);')}>Conectando al servidor...</span>
              </div>
            ) : !filtrados.length ? (
              <div style={s('padding:30px; text-align:center; color:var(--text-muted); font-size:12.5px;')}>
                <i className="fas fa-users-slash" style={s('font-size:24px; margin-bottom:8px; display:block; color:var(--slate-700);')}></i>No se encontraron usuarios
              </div>
            ) : filtrados.map(e => (
              <div key={e.id} className={`emp-item${sel?.id === e.id ? ' active' : ''}`} onClick={() => setSel(e)}>
                <div className="emp-avatar">{(e.nombre || '?').charAt(0).toUpperCase()}</div>
                <div className="emp-info"><div className="emp-name">{e.nombre}</div><div className="emp-sub">ID: {e.id} | {e.area || 'General'}</div></div>
                <span className={`emp-status-badge ${e.activo ? 'active' : 'inactive'}`}>{e.activo ? 'ACTIVO' : 'INACTIVO'}</span>
              </div>
            ))}
          </div>

          <div className="meta-card" style={{ display: sel ? 'flex' : 'none' }}>
            <h3 className="panel-title" style={{ margin: 0 }}><i className="fas fa-id-badge"></i> Ficha del Empleado</h3>
            <div className="meta-grid">
              <div className="meta-item"><div className="meta-label">ID / Cédula</div><div className="meta-val code">{sel?.id || '---'}</div></div>
              {/* El legado mostraba el PIN; ya no existe y las contraseñas no se pueden leer (D-06) */}
              <div className="meta-item"><div className="meta-label">Contraseña</div>
                <div className="meta-val code" style={{ color: 'var(--amber)' }}>{sel ? (sel.tienePassword ? 'Creada' : 'Pendiente') : '---'}</div></div>
            </div>
            <div className="meta-grid">
              <div className="meta-item"><div className="meta-label">Cargo</div><div className="meta-val">{sel?.cargo || '---'}</div></div>
              <div className="meta-item"><div className="meta-label">Área</div><div className="meta-val">{sel?.area || '---'}</div></div>
            </div>
            <div className="meta-grid">
              <div className="meta-item"><div className="meta-label">Supervisor</div>
                <div className="meta-val">{sel?.supervisor === 'SUPERVISOR ADMIN' ? 'SUPERVISOR ADMIN' : sel?.supervisor === 'SI' ? 'SÍ (SUPERVISOR)' : 'NO'}</div></div>
              <div className="meta-item"><div className="meta-label">Ubicación Base</div>
                <div className="meta-val" style={s('font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}>{sel?.latitud != null ? `${sel.latitud}, ${sel.longitud}` : 'No fijada'}</div></div>
            </div>
            <button className="btn-simular" onClick={() => void simular()}
              style={activoSel ? { background: 'linear-gradient(135deg, var(--green), #047857)', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.25)' } : undefined}>
              {activoSel ? <><i className="fas fa-arrows-rotate"></i> Recargar Simulación Activa</> : <><i className="fas fa-play"></i> Simular Credencial de Usuario</>}
            </button>
            <div className="sim-readonly"><i className="fas fa-eye"></i> Vista de solo lectura por 30 minutos: no permite marcar ni modificar datos. Queda registrada.</div>
          </div>
        </div>

        <div className="phone-container">
          <div className="sim-controls" style={{ display: simulado ? 'flex' : 'none', width: 375 }}>
            <button className="btn-outline" onClick={reiniciar}><i className="fas fa-rotate-right"></i> Reiniciar</button>
            <button className="btn-outline" onClick={detener} style={s('border-color:rgba(244,63,94,0.3); color:var(--rose);')}><i className="fas fa-power-off"></i> Detener Simulación</button>
          </div>
          <div className="phone-mockup">
            <div className="phone-notch"></div>
            <div className="phone-screen">
              <div className="empty-mockup-state" style={{ display: simulado ? 'none' : 'flex' }}>
                <div className="empty-icon"><i className="fas fa-mobile-button"></i></div>
                <h4 className="empty-title">Simulador Inactivo</h4>
                <p className="empty-text">Selecciona un empleado de la lista y presiona "Simular Credencial" para ver qué se le refleja en su aplicación móvil.</p>
              </div>
              <iframe className="phone-iframe" title="Vista del colaborador" src={src}></iframe>
              <div className="phone-home-indicator"></div>
            </div>
          </div>
        </div>
      </div>

      <div className={`toast-msg${toast ? ' show' : ''}${toast?.tipo ? ' ' + toast.tipo : ''}`}>
        <i className={toast?.tipo === 'success' ? 'fas fa-circle-check' : toast?.tipo === 'error' ? 'fas fa-circle-exclamation' : 'fas fa-circle-info'}
          style={{ color: toast?.tipo === 'success' ? '#10b981' : toast?.tipo === 'error' ? '#f43f5e' : '#60a5fa' }}></i>
        <span>{toast?.msg}</span>
      </div>
    </>
  );
}
