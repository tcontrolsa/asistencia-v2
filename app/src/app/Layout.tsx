import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from './Estado';
import { ModalSoporte } from '../ui/Modales';

// Barra inferior del legado: Credencial, Almuerzo, Resumen, Extras (coordinadores), Pagos, Estado (oculta), Perfil, Master (admin)
function BottomNav() {
  const { emp } = useApp();
  const item = (ruta: string, icono: string, texto: string, id?: string) => (
    <NavLink to={ruta} end id={id} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      ref={el => { if (el?.classList.contains('active')) { try { el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch { /* */ } } }}>
      <i className={`fas ${icono}`}></i><span>{texto}</span>
    </NavLink>
  );
  return (
    <div className="bottom-nav" style={{ display: 'flex' }}>
      {item('/', 'fa-id-card', 'Credencial')}
      {item('/almuerzo', 'fa-utensils', 'Almuerzo', 'navItemAlmuerzo')}
      {item('/resumen', 'fa-chart-line', 'Resumen')}
      {emp.puede_autorizar_extras && item('/extras', 'fa-clock', 'Extras', 'navItemExtras')}
      {item('/pagos', 'fa-file-invoice-dollar', 'Pagos', 'navItemPagos')}
      {item('/perfil', 'fa-user-circle', 'Perfil')}
      {emp.es_admin && item('/master', 'fa-lock', 'Master', 'navItemAdmin')}
    </div>
  );
}

// Banner de instalación de la PWA (beforeinstallprompt)
interface EventoInstalar extends Event { prompt: () => void; userChoice: Promise<{ outcome: string }> }
function BannerPwa() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [mostrar, setMostrar] = useState(false);
  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
      let descartado = false;
      try { descartado = !!localStorage.getItem('pwa_install_dismissed'); } catch { /* */ }
      if (!descartado) window.setTimeout(() => setMostrar(true), 3000);
    };
    window.addEventListener('beforeinstallprompt', h);
    const inst = () => setMostrar(false);
    window.addEventListener('appinstalled', inst);
    return () => { window.removeEventListener('beforeinstallprompt', h); window.removeEventListener('appinstalled', inst); };
  }, []);
  const cerrar = () => { setMostrar(false); try { localStorage.setItem('pwa_install_dismissed', '1'); } catch { /* */ } };
  return (
    <div id="pwaInstallBanner" className={mostrar ? 'show' : ''} onClick={async () => {
      if (!evento) return;
      setMostrar(false);
      evento.prompt();
      const { outcome } = await evento.userChoice;
      setEvento(null);
      if (outcome === 'dismissed') try { localStorage.setItem('pwa_install_dismissed', '1'); } catch { /* */ }
    }}>
      <img src="./assets/icons/icon-192.png" alt="TCONTROL" />
      <span>Instalar TCONTROL</span>
      <button className="pwa-close" aria-label="Cerrar" onClick={e => { e.stopPropagation(); cerrar(); }}>×</button>
    </div>
  );
}

// Pull-to-refresh del contenedor principal (tcontrol_core.js)
function usePullToRefresh(ref: React.RefObject<HTMLDivElement>, onRefresh: () => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ind = document.createElement('div');
    ind.id = 'ptr-indicator';
    ind.innerHTML = '<i class="fas fa-sync-alt" style="color:var(--red); font-size: 20px;"></i>';
    Object.assign(ind.style, { position: 'fixed', top: '-60px', left: '50%', transform: 'translateX(-50%)', width: '40px', height: '40px',
      backgroundColor: 'white', borderRadius: '50%', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: '10000', transition: 'top 0.2s ease, transform 0.2s ease' });
    document.body.appendChild(ind);
    let startY = 0, curY = 0, tirando = false;
    const start = (e: TouchEvent) => { if (el.scrollTop <= 2) { startY = curY = e.touches[0].clientY; tirando = true; ind.style.transition = 'none'; } };
    const move = (e: TouchEvent) => {
      if (!tirando) return;
      curY = e.touches[0].clientY;
      const diff = curY - startY;
      if (diff > 0 && el.scrollTop <= 2) {
        if (e.cancelable) e.preventDefault();
        const d = Math.min(diff * 0.4, 90);
        ind.style.top = `${-60 + d}px`; ind.style.transform = `translateX(-50%) rotate(${d * 4}deg)`;
      } else if (diff < 0) { tirando = false; ind.style.transition = 'top 0.3s ease, transform 0.3s ease'; ind.style.top = '-60px'; }
    };
    const end = () => {
      if (!tirando) return;
      tirando = false;
      ind.style.transition = 'top 0.3s ease, transform 0.3s ease';
      if (curY - startY > 100 && el.scrollTop <= 2) {
        ind.style.top = '20px';
        ind.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:var(--red); font-size: 20px;"></i>';
        window.setTimeout(onRefresh, 600);
      } else ind.style.top = '-60px';
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); ind.remove(); };
  }, [ref, onRefresh]);
}

export function Layout({ children }: { children: ReactNode }) {
  const { ctx, emp } = useApp();
  const loc = useLocation();
  const navegar = useNavigate();
  const refMain = useRef<HTMLDivElement>(null);
  const [soporte, setSoporte] = useState(false);
  usePullToRefresh(refMain, () => location.reload());
  const enHome = loc.pathname === '/';
  const em = ctx.emergencia;
  return (
    <div className="app-container" style={{ display: 'flex' }}>
      <div className="status-bar"></div>
      <div className="main-content page-content-enter" id="mainContent" ref={refMain} key={loc.pathname}>{children}</div>
      <BottomNav />
      <BannerPwa />
      <div className="fab-whatsapp" id="fabWhatsApp" style={{ display: enHome ? 'flex' : 'none' }} onClick={() => setSoporte(true)}>
        <span className="whatsapp-tooltip">¿Necesitas soporte?</span>
        <button className="fab-whatsapp-btn" aria-label="Soporte Técnico"><i className="fab fa-whatsapp"></i><span className="whatsapp-pulse"></span></button>
      </div>
      <div className="fab-emergencia" id="fabEmergencia" style={{ display: enHome && em.activa ? 'flex' : 'none' }}>
        <span className="emergencia-tooltip">{em.activa ? `🚨 ${em.nombre || 'Emergencia'}` : '🚨 Reportar mi Estado'}</span>
        <button className="fab-emergencia-btn" onClick={() => navegar('/estado')} aria-label="Reportar mi Estado">
          <i className="fas fa-exclamation-triangle"></i><span className="emergencia-pulse"></span>
        </button>
      </div>
      {soporte && <ModalSoporte nombre={emp.nombre} id={emp.id} area={emp.area} numero={ctx.soporte.whatsapp_number || ''} onCerrar={() => setSoporte(false)} />}
    </div>
  );
}
