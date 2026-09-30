// Catering (catering.html + catering_core.js). Cambio frente al legado: el supervisor entra con su
// ID y su contraseña (el PIN de 4 dígitos ya no existe, D-06) y la sesión no desvincula su teléfono.
import { useCallback, useEffect, useRef, useState } from 'react';
import { alCerrarSesion, ErrorApi, rpc, sesion, urlFoto } from '../lib/api';
import { leerClaims } from '../lib/sesion';

interface ItemCatering { empleado_id: string; nombre: string; area: string | null; foto_url: string | null; hora_entrada: string | null; consumido: boolean }
type Filtro = 'todos' | 'pendientes' | 'consumidos';

const ROLES_SUPERVISOR = ['supervisor', 'supervisor_admin', 'admin'];

function filtroGuardado(): Filtro {
  try {
    const f = localStorage.getItem('catering_filtro');
    if (f === 'todos' || f === 'pendientes' || f === 'consumidos') return f;
  } catch { /* sin almacenamiento */ }
  return 'todos';
}

export function CateringApp() {
  const [activa, setActiva] = useState(() => { const c = leerClaims(); return !!c && ROLES_SUPERVISOR.includes(c.role) && !c.debe_cambiar; });
  const [toasts, setToasts] = useState<{ k: number; msg: string; error: boolean }[]>([]);

  const toast = useCallback((msg: string, error = false) => {
    const k = Date.now() + Math.random();
    setToasts(t => [...t, { k, msg, error }]);
    window.setTimeout(() => setToasts(t => t.filter(x => x.k !== k)), 2500);
  }, []);

  useEffect(() => { alCerrarSesion(() => setActiva(false)); }, []);

  return (
    <>
      {!activa && <Login onActivar={() => setActiva(true)} />}
      <Lista activa={activa} toast={toast} />
      {toasts.map(t => <div key={t.k} className={`toast-fast${t.error ? ' error' : ''}`}>{t.msg}</div>)}
    </>
  );
}

function Login({ onActivar }: { onActivar: () => void }) {
  const [id, setId] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [verificando, setVerificando] = useState(false);

  const ingresar = async () => {
    if (!id.trim() || !clave.trim()) { setError('Ingrese ID y contraseña'); return; }
    setError('');
    setVerificando(true);
    try {
      // Sin p_dispositivo: el catering no reemplaza el teléfono vinculado del supervisor
      const r = await rpc<{ token: string; rol: string; debe_cambiar: boolean }>('login', { p_usuario: id.trim(), p_password: clave }, false);
      if (!ROLES_SUPERVISOR.includes(r.rol)) { setError('Rango insuficiente.'); return; }
      if (r.debe_cambiar) { setError('Debe cambiar su contraseña temporal en la app TCONTROL antes de usar Catering.'); return; }
      sesion.guardar(r.token);
      onActivar();
    } catch (e) {
      setError(e instanceof ErrorApi && e.codigo !== 'RED' ? e.message : 'Error de conexión');
    } finally {
      setVerificando(false);
    }
  };

  return (
    <div id="login-catering" className="login-overlay">
      <div className="login-card">
        <div className="login-header">
          <i className="bi bi-shield-lock-fill"></i>
          <h2>Acceso Catering</h2>
          <p>ID y contraseña de Supervisor</p>
        </div>
        <div className="login-body">
          <div className="mb-3">
            <label className="form-label">ID Empleado</label>
            <input type="text" id="supId" className="form-control" placeholder="Ej: 123" autoComplete="username" value={id} onChange={e => setId(e.target.value)} />
          </div>
          <div className="mb-3">
            <label className="form-label">Contraseña</label>
            <input type="password" id="supPin" className="form-control" placeholder="••••••••" autoComplete="current-password" value={clave}
              onChange={e => setClave(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void ingresar(); }} />
          </div>
          <button className="btn-login" onClick={() => void ingresar()} disabled={verificando}>{verificando ? 'Verificando...' : 'Ingresar'}</button>
          <div id="login-error" className={`error-msg${error ? '' : ' hidden'}`}>{error}</div>
        </div>
      </div>
    </div>
  );
}

function Lista({ activa, toast }: { activa: boolean; toast: (msg: string, error?: boolean) => void }) {
  const [empleados, setEmpleados] = useState<ItemCatering[] | null>(null);
  const [errorRed, setErrorRed] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>(filtroGuardado);
  const [busqueda, setBusqueda] = useState('');
  const [refrescando, setRefrescando] = useState(false);
  const [ultima, setUltima] = useState('');
  const [procesando, setProcesando] = useState<Set<string>>(new Set());
  const enCurso = useRef(false);
  const hayDatos = useRef(false);

  const cargarDatos = useCallback(async () => {
    if (enCurso.current || !sesion.token()) return;
    enCurso.current = true;
    setRefrescando(true);
    try {
      const r = await rpc<ItemCatering[]>('lista_catering');
      setEmpleados(r);
      hayDatos.current = true;
      setErrorRed(false);
      // Hora de la última consulta en el reloj del dispositivo (dato informativo, como en el legado)
      setUltima(new Date().toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Guayaquil' }));
    } catch (e) {
      if (!hayDatos.current) {
        if (e instanceof ErrorApi && e.codigo !== 'RED') toast('Error: ' + e.message, true);
        else { toast('Error de conexión', true); setErrorRed(true); }
      }
    } finally {
      enCurso.current = false;
      setRefrescando(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!activa) return;
    void cargarDatos();
    // Recarga automática cada 45 s y al volver a la pestaña
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void cargarDatos(); }, 45000);
    const vis = () => { if (document.visibilityState === 'visible') void cargarDatos(); };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [activa, cargarDatos]);

  const filtrarPor = (f: Filtro) => {
    setFiltro(f);
    try { localStorage.setItem('catering_filtro', f); } catch { /* sin almacenamiento */ }
  };

  const registrarConsumo = async (emp: ItemCatering) => {
    if (emp.consumido || procesando.has(emp.empleado_id)) return;
    setProcesando(p => new Set(p).add(emp.empleado_id));
    // Actualización optimista, como el legado
    const marcar = (v: boolean) => setEmpleados(l => l?.map(x => (x.empleado_id === emp.empleado_id ? { ...x, consumido: v } : x)) ?? l);
    marcar(true);
    toast(`✓ ${emp.nombre} - Almuerzo marcado como consumido`);
    try {
      await rpc('marcar_consumido', { p_empleado_id: emp.empleado_id });
      window.setTimeout(() => void cargarDatos(), 1000);
    } catch (e) {
      marcar(false);
      toast('Error: ' + (e instanceof Error ? e.message : ''), true);
    } finally {
      setProcesando(p => { const n = new Set(p); n.delete(emp.empleado_id); return n; });
    }
  };

  const lista = empleados ?? [];
  const total = lista.length;
  const consumidos = lista.filter(e => e.consumido).length;
  const termino = busqueda.trim().toLowerCase();
  const filtrados = lista
    .filter(e => !termino || e.nombre.toLowerCase().includes(termino) || e.empleado_id.toLowerCase().includes(termino))
    .filter(e => (filtro === 'pendientes' ? !e.consumido : filtro === 'consumidos' ? e.consumido : true));

  let contenido: JSX.Element | JSX.Element[];
  if (errorRed && !hayDatos.current) {
    contenido = (
      <div className="empty-state">
        <i className="bi bi-wifi-off"></i>
        <p>Error de conexión</p>
        <small>Verifica tu conexión a internet</small>
        <br /><br />
        <button onClick={() => void cargarDatos()} className="btn btn-sm btn-danger">Reintentar</button>
      </div>
    );
  } else if (empleados === null) {
    contenido = <div className="empty-state"><i className="bi bi-hourglass-split"></i><p>Cargando lista de almuerzos...</p></div>;
  } else if (filtrados.length === 0) {
    const mensaje = filtro === 'pendientes' ? '✅ No hay almuerzos pendientes'
      : filtro === 'consumidos' ? '📋 No hay almuerzos consumidos registrados' : '🍽️ No hay empleados que almuerzan en planta hoy';
    contenido = (
      <div className="empty-state">
        <i className="bi bi-egg-fried"></i>
        <p>{mensaje}</p>
        <small>Actualiza la lista si crees que debería haber empleados</small>
      </div>
    );
  } else {
    contenido = filtrados.map(emp => <Tarjeta key={emp.empleado_id} emp={emp} procesando={procesando.has(emp.empleado_id)} onServir={() => void registrarConsumo(emp)} />);
  }

  return (
    <div className="app-container">
      <div className="header">
        <h1><i className="bi bi-egg-fried"></i> Catering</h1>
        <p>Control de almuerzos en planta</p>
        <button className={`refresh-btn${refrescando ? ' loading' : ''}`} onClick={() => void cargarDatos()} title="Actualizar">
          <i className="bi bi-arrow-repeat"></i>
        </button>
      </div>

      <div className="stats-row">
        <button className={`stat-btn total ${filtro === 'todos' ? 'active' : ''}`} onClick={() => filtrarPor('todos')}>
          <div className="stat-number" id="totalCount">{total}</div>
          <div className="stat-label">TOTAL</div>
        </button>
        <button className={`stat-btn pending ${filtro === 'pendientes' ? 'active' : ''}`} onClick={() => filtrarPor('pendientes')}>
          <div className="stat-number" id="pendingCount">{total - consumidos}</div>
          <div className="stat-label">PENDIENTES</div>
        </button>
        <button className={`stat-btn consumed ${filtro === 'consumidos' ? 'active' : ''}`} onClick={() => filtrarPor('consumidos')}>
          <div className="stat-number" id="consumedCount">{consumidos}</div>
          <div className="stat-label">CONSUMIDOS</div>
        </button>
      </div>

      <div className="search-box">
        <input type="text" id="searchInput" className="search-input" placeholder="Buscar por nombre o ID..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <div className="main-content" id="mainContent">
        <div id="employeeList" className="employee-list">{contenido}</div>
      </div>

      <div className="last-update" id="lastUpdate">
        {ultima ? <><i className="bi bi-clock"></i> Última actualización: {ultima}</> : 'Actualizando...'}
      </div>
    </div>
  );
}

function Tarjeta({ emp, procesando, onServir }: { emp: ItemCatering; procesando: boolean; onServir: () => void }) {
  const [errFoto, setErrFoto] = useState(false);
  const foto = urlFoto(emp.foto_url);
  const inicial = (emp.nombre.charAt(0) || '?').toUpperCase();
  return (
    <div className={`employee-card ${emp.consumido ? 'consumed' : ''} ${procesando ? 'processing' : ''}`} data-id={emp.empleado_id}
      onClick={emp.consumido || procesando ? undefined : onServir}>
      {foto && !errFoto ? <img className="emp-photo" src={foto} alt={emp.nombre} onError={() => setErrFoto(true)} />
        : <div className="emp-photo-placeholder">{inicial}</div>}
      <div className="emp-info">
        <div className="emp-name">{emp.nombre}</div>
        <div className="emp-meta">
          <span><i className="bi bi-person-badge"></i> {emp.empleado_id}</span>
          <span><i className="bi bi-building"></i> {emp.area || 'Sin área'}</span>
          <span><i className="bi bi-clock"></i> {emp.hora_entrada ? emp.hora_entrada.slice(0, 5) : '--:--'}</span>
        </div>
      </div>
      <div className={`emp-status ${emp.consumido ? 'status-consumed' : 'status-pending'}`}>
        {emp.consumido ? <><i className="bi bi-check-circle-fill"></i> Consumido</> : <><i className="bi bi-egg-fried"></i> Servir</>}
      </div>
    </div>
  );
}
