// Panel de supervisor (supervisor.html + JS/supervisor_core.js). Estructura, textos y clases del legado.
import { useEffect, useState } from 'react';
import { alCerrarSesion, ErrorApi, rpc, sesion } from '../lib/api';
import { leerClaims } from '../lib/sesion';
import { s } from '../lib/estilo';
import { ModalAvisoPrivacidad } from '../ui/Modales';
import { fixFotoUrl } from './legado/util';
import { abrirModal, cambiarPanel, cerrarModal, tituloActual, useModal, volverAAsistencia } from './nav';
import { buscarEmpleado, cargarDatosCompletos, idSesion, rolSesion, sup, useSup } from './store';
import { Avisos, fotoDe, mostrarToast } from './ui/comun';
import { Paneles } from './ui/Paneles';
import { ModalesSupervisor } from './ui/ModalesSupervisor';
import { ModalesDesglose } from './ui/Desgloses';

export function SupervisorApp() {
  const [conSesion, setConSesion] = useState(() => {
    const c = leerClaims();
    return !!c && ['supervisor', 'supervisor_admin', 'admin'].includes(c.role) && !c.debe_cambiar;
  });

  useEffect(() => {
    alCerrarSesion(() => setConSesion(false));
    // hideSplash() a los 2,8 s, como el legado
    const t = window.setTimeout(() => {
      const splash = document.getElementById('initialSplash');
      if (!splash) return;
      splash.classList.add('fade-out');
      window.setTimeout(() => splash.remove(), 650);
    }, 2800);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <>
      <Loader />
      <Avisos />
      {conSesion && <Panel />}
      {!conSesion && <Login onIngresar={() => setConSesion(true)} />}
      <ModalesSupervisor />
      <ModalesDesglose />
      <AvisoPrivacidad />
    </>
  );
}

function AvisoPrivacidad() {
  const abierto = useModal('avisoPrivacidad');
  return abierto ? <ModalAvisoPrivacidad onCerrar={() => cerrarModal('avisoPrivacidad')} /> : null;
}

function Loader() {
  const l = useSup(x => x.loader);
  return (
    <div id="loader" className={`loader-overlay${l.visible ? '' : ' hidden'}`}>
      <div className="loading-card">
        <div className="loader-spinner loading-spinner"></div>
        <div className="loading-text loader-text" id="loaderText">{l.texto}</div>
        <div className="loading-subtext" id="loaderSubtext" style={{ display: l.subtexto ? 'block' : 'none' }}>{l.subtexto}</div>
      </div>
    </div>
  );
}

// ─── Login (intentarLoginSupervisor) ───
function Login({ onIngresar }: { onIngresar: () => void }) {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const ingresar = async () => {
    if (!usuario.trim()) { setError('Ingrese su usuario'); return; }
    if (!clave.trim()) { setError('Ingrese su contraseña'); return; }
    setError('');
    setEnviando(true);
    sup.set({ loader: { visible: true, texto: 'Cargando datos...', subtexto: 'Sincronizando información en tiempo real' } });
    try {
      // Sin p_dispositivo: entrar al panel no desvincula el teléfono del supervisor
      const r = await rpc<{ token: string; rol: string; debe_cambiar: boolean }>('login', { p_usuario: usuario.trim(), p_password: clave }, false);
      if (!['supervisor', 'supervisor_admin', 'admin'].includes(r.rol)) { setError('El usuario no tiene rango de Supervisor.'); return; }
      if (r.debe_cambiar) { setError('Debe cambiar su contraseña temporal en la app TCONTROL antes de ingresar al panel.'); return; }
      sesion.guardar(r.token);
      onIngresar();
    } catch (e) {
      setError(e instanceof ErrorApi && e.codigo !== 'RED' ? e.message : 'Error de conexión');
    } finally {
      setEnviando(false);
      sup.set({ loader: { ...sup.get().loader, visible: false } });
    }
  };

  return (
    <div id="login-supervisor" className="login-overlay">
      <div className="login-card">
        <div className="login-header">
          <i className="fas fa-user-shield"></i>
          <h2>Acceso Supervisor</h2>
          <p>Ingresa tu Contraseña de Seguridad</p>
        </div>
        <div className="login-body">
          <div className="form-group">
            <label htmlFor="supUser" className="form-label">Usuario (ID / Cédula)</label>
            <input type="text" id="supUser" className="form-input" placeholder="Ej: 1058" autoFocus autoComplete="username" value={usuario}
              onChange={e => setUsuario(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void ingresar(); }} />
          </div>
          <div className="form-group" style={s('position:relative')}>
            <label htmlFor="supPin" className="form-label">Contraseña / PIN</label>
            <input type={verClave ? 'text' : 'password'} id="supPin" className="form-input" placeholder="••••••••" style={s('padding-right: 40px;')}
              autoComplete="current-password" value={clave} onChange={e => setClave(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void ingresar(); }} />
            <i className={`fas ${verClave ? 'fa-eye-slash' : 'fa-eye'}`} id="togglePin" onClick={() => setVerClave(v => !v)}
              style={s('position:absolute; right:12px; top:38px; cursor:pointer; color:var(--g400)')}></i>
          </div>
          <button className="btn-login" id="btnIngresarSup" onClick={() => void ingresar()} disabled={enviando}>Ingresar al Panel</button>
          <div id="login-error" className={`error-msg${error ? '' : ' hidden'}`}>{error}</div>
        </div>
      </div>
    </div>
  );
}

function cerrarSesionSupervisor() {
  if (window.confirm('¿Estás seguro de que deseas cerrar sesión del panel de supervisión?')) {
    sesion.cerrar();
    window.location.reload();
  }
}

// ─── Tarjetas del supervisor en barra lateral y superior (mostrarInformacionSupervisor) ───
function AvatarSup({ foto, nombre, claseImg, claseRespaldo }: { foto: string | null; nombre: string; claseImg?: string; claseRespaldo: string }) {
  const [error, setError] = useState(false);
  const inicial = nombre.trim().charAt(0).toUpperCase() || 'S';
  if (!foto || error) return <div className={claseRespaldo}>{inicial}</div>;
  return <img src={foto} alt={nombre} className={claseImg} referrerPolicy="no-referrer" onError={() => setError(true)} />;
}

function datosSupervisor() {
  const id = idSesion();
  const rol = rolSesion();
  const e = buscarEmpleado(id);
  const nombre = e?.nombre || (rol === 'ADMIN_MASTER' ? 'Administrador General' : rol === 'SUPERVISOR_ADMIN' ? `Supervisor Admin #${id}` : `Supervisor #${id}`);
  const f = e ? fotoDe(e) : null;
  return { id, rol, nombre, foto: f ? fixFotoUrl(f, 200) : null };
}

function SidebarSupervisorInfo() {
  useSup(x => x.version);
  const { id, rol, nombre, foto } = datosSupervisor();
  return (
    <div id="sidebarSupervisorInfo" style={s('padding: 10px 16px; border-bottom: 1px dashed var(--g200); margin-bottom: 12px;')}>
      <div className="sup-card-container">
        <div className="sup-avatar-wrapper"><AvatarSup foto={foto} nombre={nombre} claseImg="sup-avatar-img" claseRespaldo="sup-avatar-fallback" /></div>
        <div className="sup-info-text">
          <div className="sup-name" title={nombre}>{nombre}</div>
          <div className="sup-role-row">
            {rol === 'ADMIN_MASTER' ? <span className="sup-badge-admin"><i className="fas fa-crown"></i> Admin Master</span>
              : rol === 'SUPERVISOR_ADMIN' ? <span className="sup-badge-sup-admin"><i className="fas fa-user-tie"></i> Sup. Admin</span>
                : <span className="sup-badge-sup"><i className="fas fa-user-shield"></i> Supervisor</span>}
            <span className="sup-id-badge">#{id}</span>
          </div>
        </div>
        <button type="button" className="btn-logout-card" onClick={cerrarSesionSupervisor} title="Cerrar Sesión"><i className="fas fa-sign-out-alt"></i></button>
      </div>
    </div>
  );
}

function TopbarSupervisorProfile() {
  useSup(x => x.version);
  const { rol, nombre, foto } = datosSupervisor();
  const partes = nombre.trim().split(/\s+/);
  const nombreCorto = partes.length > 2 ? partes[2] : partes[0];
  return (
    <div id="topbarSupervisorProfile">
      <div className="topbar-user-chip">
        <div className="topbar-avatar"><AvatarSup foto={foto} nombre={nombre} claseRespaldo="topbar-fallback" /></div>
        <div className="topbar-user-meta">
          <span className="topbar-user-name" title={nombre}>{nombreCorto}</span>
          <span className="topbar-user-role">{rol === 'ADMIN_MASTER' ? 'Admin' : rol === 'SUPERVISOR_ADMIN' ? 'Sup. Admin' : 'Supervisor'}</span>
        </div>
        <button type="button" className="btn-logout-header" onClick={cerrarSesionSupervisor} title="Cerrar Sesión">
          <i className="fas fa-power-off"></i><span>Salir</span>
        </button>
      </div>
    </div>
  );
}

// ─── Panel principal ───
function Panel() {
  const panel = useSup(x => x.panel);
  const titulo = useSup(tituloActual);
  const bgSync = useSup(x => x.bgSync);
  const lastUpdate = useSup(x => x.lastUpdate);
  const [colapsada, setColapsada] = useState(() => { try { return localStorage.getItem('sidebarCollapsed') === 'true'; } catch { return false; } });
  const [menuMovil, setMenuMovil] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const rol = rolSesion();
  const esAdmin = rol === 'ADMIN_MASTER' || rol === 'SUPERVISOR_ADMIN';

  useEffect(() => {
    cargarDatosCompletos().catch(e => mostrarToast(e instanceof Error ? e.message : 'Error al cargar datos', 'error'));
    // Sincronización silenciosa cada 2 minutos (pausada en segundo plano o con un modal de edición abierto)
    const t = window.setInterval(() => {
      if (document.hidden) return;
      if (document.querySelector('.modal-overlay:not(.hidden)')) return;
      cargarDatosCompletos({ silencioso: true }).catch(() => undefined);
    }, 120000);
    const alCambiarTamano = () => { if (window.innerWidth > 768) setMenuMovil(false); };
    window.addEventListener('resize', alCambiarTamano);
    return () => { window.clearInterval(t); window.removeEventListener('resize', alCambiarTamano); };
  }, []);

  const irA = (p: string) => { cambiarPanel(p); if (window.innerWidth <= 768) setMenuMovil(false); };
  const alternarBarra = () => {
    if (window.innerWidth <= 768) { setMenuMovil(false); return; }
    setColapsada(c => { try { localStorage.setItem('sidebarCollapsed', String(!c)); } catch { /* */ } return !c; });
  };
  const refrescar = async () => {
    setRefrescando(true);
    mostrarToast('Sincronizando datos frescos en segundo plano...', 'info');
    try {
      await cargarDatosCompletos({ silencioso: true });
      mostrarToast('✅ Datos actualizados correctamente', 'success');
    } catch (e) {
      mostrarToast('Error al sincronizar: ' + (e instanceof Error ? e.message : ''), 'error');
    } finally { setRefrescando(false); }
  };

  const nav = (p: string, icono: string, color: string, texto: string, extra?: React.ReactNode) => (
    <div className={`nav-item${panel === p ? ' active' : ''}`} data-panel={p} onClick={() => irA(p)}>
      <i className={icono} style={{ color }}></i><span>{texto}</span>{extra}
    </div>
  );

  return (
    <div className="app-layout page-content-enter">
      <aside className={`sidebar${colapsada ? ' collapsed' : ''}${menuMovil ? ' sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon"><i className="fas fa-chart-line"></i></div>
            <div className="sidebar-logo-text">CONTROL <span>2026</span></div>
          </div>
          <button id="btnToggleSidebar" className="sidebar-toggle-btn" title="Comprimir/Expandir Menú" onClick={alternarBarra}>
            <i className={menuMovil && window.innerWidth <= 768 ? 'fas fa-times' : 'fas fa-chevron-left'}></i>
          </button>
        </div>
        <SidebarSupervisorInfo />
        <nav className="sidebar-nav">
          {nav('asistencia', 'fas fa-calendar-day', 'var(--green)', 'Asistencia')}
          {nav('dashboard', 'fas fa-chart-pie', 'var(--blue)', 'Dashboard')}
          {nav('reportes', 'fas fa-file-invoice', 'var(--purple)', 'Reportes')}
          {nav('servicios', 'fas fa-layer-group', 'var(--amber)', 'Gestión & Servicios', <BadgeInvitados />)}
          {esAdmin && nav('whatsapp', 'fab fa-whatsapp', '#22c55e', 'Notificaciones WhatsApp')}
          {rol === 'ADMIN_MASTER' && nav('opciones', 'fas fa-sliders-h', '#64748b', 'Opciones adicionales')}
          <a className="nav-item" href="visor_empleado.html" target="_blank" style={s('text-decoration: none;')}><i className="fas fa-mobile-alt" style={s('color:#8b5cf6;')}></i><span>Simulador de Vista</span></a>
        </nav>
        <div className="sidebar-footer">
          <button className="btn-extra-lunch" onClick={() => abrirModal('manual', {})}
            style={s('background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; border: none; margin-bottom: 6px; box-shadow: 0 2px 6px rgba(37,99,235,0.3); font-weight: 750;')}>
            <i className="fas fa-plus-circle"></i> Registro Manual
          </button>
          <button className="btn-extra-lunch" id="btnExtraLunch" onClick={() => abrirModal('extraLunch', {})}><i className="fas fa-utensils"></i> Almuerzo Extra</button>
          <button className="btn-refresh" id="btnRefresh" onClick={() => void refrescar()}><i className={`fas fa-sync-alt${refrescando ? ' fa-spin' : ''}`}></i> Actualizar</button>
          <button type="button" onClick={() => abrirModal('avisoPrivacidad')}
            style={s('width:100%; margin-top:8px; background:transparent; border:1px solid #e2e8f0; color:#64748b; font-size:11px; font-weight:700; padding:6px 10px; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:6px; transition:all 0.15s;')}
            title="Aviso Legal y Protección de Datos Personales (LOPDP Ecuador)">
            <i className="fas fa-shield-halved" style={s('color:#0284c7;')}></i> Aviso Legal LOPDP
          </button>
        </div>
      </aside>
      <div id="sidebarOverlay" className={`sidebar-overlay${menuMovil ? '' : ' hidden'}`} onClick={() => setMenuMovil(false)}></div>
      <main className="main-content">
        <div className="top-bar">
          <button id="btnMobileMenu" className="mobile-menu-btn" title="Menú" onClick={() => setMenuMovil(true)}><i className="fas fa-bars"></i></button>
          <h1 className="page-title" id="pageTitle">{titulo}</h1>
          <div style={s('display:flex;gap:8px;align-items:center;flex-wrap:nowrap;')}>
            <div className={`bg-sync-indicator${bgSync ? '' : ' hidden'}`} id="bgSyncIndicator"
              style={s('display:flex; align-items:center; gap:6px; background:#e0f2fe; color:#0369a1; padding:4px 8px; border-radius:10px; font-size:11px; font-weight:700;')}>
              <i className="fas fa-sync fa-spin"></i> <span>Sincronizando...</span>
            </div>
            <div className="live-badge" id="liveBadge"><i className="fas fa-circle"></i> <span>En vivo</span></div>
            <div className="update-chip"><i className="fas fa-clock"></i> <span id="lastUpdate">{lastUpdate}</span></div>
            <TopbarSupervisorProfile />
          </div>
        </div>

        <div className="breadcrumb-nav-bar" id="breadcrumbNavBar">
          <div className="breadcrumb-trail" id="breadcrumbTrail">
            <span className="breadcrumb-link" onClick={() => cambiarPanel('asistencia')}><i className="fas fa-home"></i> Inicio</span>
            <span className="breadcrumb-sep"><i className="fas fa-chevron-right"></i></span>
            <span className="breadcrumb-current" id="breadcrumbCurrentItem">{titulo}</span>
          </div>
          <button id="btnBreadcrumbBack" className="btn-breadcrumb-back" onClick={volverAAsistencia} style={{ display: panel === 'detalle' ? 'inline-flex' : 'none' }}
            title="Volver a la vista anterior">
            <i className="fas fa-arrow-left"></i> <span>Volver</span>
          </button>
        </div>

        <BannerInvitadosSupAdmin />
        <Paneles />
      </main>
    </div>
  );
}

function pendientesInvitados() {
  return (sup.get().solicitudesInvitados || []).filter((x: { estado?: string }) => (x.estado || 'SOLICITADO') === 'SOLICITADO').length;
}

function BadgeInvitados() {
  useSup(x => x.version);
  const n = pendientesInvitados();
  return <span id="badgeInvitadosCount" style={{ display: n > 0 ? 'inline-block' : 'none', marginLeft: 'auto', background: '#dc2626', color: 'white', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 10 }}>{n}</span>;
}

// Aviso a Supervisores Admin de solicitudes de invitados pendientes (actualizarNotificacionesSupAdminInvitados)
function BannerInvitadosSupAdmin() {
  useSup(x => x.version);
  const [cerrado, setCerrado] = useState(false);
  const rol = rolSesion();
  const n = pendientesInvitados();
  if (cerrado || n === 0 || (rol !== 'SUPERVISOR_ADMIN' && rol !== 'ADMIN_MASTER')) return null;
  return (
    <div id="bannerAlertaSupAdminInvitados" style={s('display:flex; margin: 10px 0 16px 0; background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); border: 1.5px solid #fb923c; border-left: 6px solid #ea580c; border-radius: 12px; padding: 12px 18px; box-shadow: 0 4px 12px rgba(234,88,12,0.10); align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;')}>
      <div style={s('display: flex; align-items: center; gap: 12px; flex: 1; min-width: 280px;')}>
        <div style={s('width: 40px; height: 40px; border-radius: 10px; background: #ea580c; color: white; display: flex; align-items: center; justify-content: center; font-size: 18px; box-shadow: 0 2px 8px rgba(234,88,12,0.25); flex-shrink: 0;')}>
          <i className="fas fa-bell"></i>
        </div>
        <div>
          <div style={s('font-size: 13.5px; font-weight: 800; color: #9a3412; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;')}>
            <span>¡Atención Sup. Admin! Solicitudes de invitados pendientes</span>
            <span id="badgeSupAdminCountInvitados" style={s('background:#ea580c; color:white; font-size:11px; padding:2px 8px; border-radius:20px; font-weight:700;')}>{n} pendientes</span>
          </div>
          <div id="textoSupAdminAlertaInvitados" style={s('font-size: 12px; color: #7c2d12; margin-top: 3px; line-height: 1.35;')}>
            Hay solicitudes de refrigerios o almuerzos extra registradas que requieren tu revisión o coordinación.
          </div>
        </div>
      </div>
      <div style={s('display: flex; gap: 8px; align-items: center;')}>
        <button type="button" className="btn" onClick={() => cambiarPanel('invitados')}
          style={s('background: #ea580c; color: white; border: none; padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(234,88,12,0.25);')}>
          <i className="fas fa-utensils"></i> Revisar Solicitudes
        </button>
        <button type="button" onClick={() => setCerrado(true)} style={s('background: transparent; border: none; color: #9a3412; cursor: pointer; font-size: 16px; padding: 4px; margin-left: 4px;')} title="Cerrar aviso">
          <i className="fas fa-times"></i>
        </button>
      </div>
    </div>
  );
}
