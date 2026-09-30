import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type TipoToast = 'success' | 'error' | 'info' | 'warning';
export type IconoSplash = 'check' | 'lock' | 'attendance' | 'sync' | 'badge' | 'entrada' | 'salida' | 'campo' | 'permiso';
export interface OpcionesSplash {
  titulo?: string; subtitulo?: string; nombreEmpleado?: string; detalles?: string[]; icono?: IconoSplash;
  duracion?: number; onPreExit?: () => void | Promise<void>;
}

interface UiApi {
  toast: (msg: string, tipo?: TipoToast) => void;
  cargando: (mostrar: boolean, mensaje?: string, sub?: string) => void;
  splash: (op: OpcionesSplash) => Promise<void>;
  cerrarSplash: () => void;
}

const Ctx = createContext<UiApi | null>(null);
export const useUi = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('UiProvider faltante');
  return c;
};

const vibrar = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* sin vibración */ } };

// ───────── Splash de transición (mostrarSplashTransicion) ─────────
function IconoTransicion({ icono }: { icono: IconoSplash }) {
  switch (icono) {
    case 'entrada':
      return (
        <div className="trans-action-stage shift-start-stage" aria-hidden="true">
          <div className="workday-scene-box start-work-box">
            <div className="workday-gears-header"><i className="fas fa-gear gear-left"></i><i className="fas fa-gear gear-right"></i></div>
            <div className="workday-hero-zone">
              <i className="fas fa-hard-hat workday-helmet-icon"></i>
              <div className="workday-status-pulse"></div>
              <div className="workday-sparkle-dots"><span></span><span></span><span></span></div>
            </div>
            <div className="workday-active-bar"><div className="active-bar-fill"></div></div>
          </div>
          <div className="trans-pill-badge shift-start-pill"><i className="fas fa-briefcase me-1"></i> ¡INICIO DE JORNADA!</div>
        </div>
      );
    case 'salida':
      return (
        <div className="trans-action-stage shift-end-stage" aria-hidden="true">
          <div className="workday-scene-box end-work-box">
            <div className="workday-stamp-header"><i className="fas fa-clock clock-tick"></i></div>
            <div className="workday-hero-zone">
              <i className="fas fa-clipboard-check workday-clipboard-icon"></i>
              <div className="workday-complete-seal"><i className="fas fa-check"></i></div>
              <div className="workday-stars-row"><i className="fas fa-star s1"></i><i className="fas fa-star s2"></i><i className="fas fa-star s3"></i></div>
            </div>
            <div className="workday-active-bar completed-bar"><div className="completed-bar-fill"></div></div>
          </div>
          <div className="trans-pill-badge shift-end-pill"><i className="fas fa-house-user me-1"></i> ¡FIN DE JORNADA!</div>
        </div>
      );
    case 'campo':
      return (
        <div className="trans-action-stage campo-stage" aria-hidden="true">
          <div className="trans-radar-circle">
            <div className="radar-sweep-beam"></div><i className="fas fa-map-location-dot"></i><div className="radar-ping-ring"></div>
          </div>
          <div className="trans-pill-badge campo-pill"><i className="fas fa-truck-pickup me-1"></i> MODO CAMPO ACTIVO</div>
        </div>
      );
    case 'permiso':
      return (
        <div className="trans-action-stage permiso-stage" aria-hidden="true">
          <div className="trans-document-stamp">
            <i className="fas fa-file-signature"></i>
            <div className="permiso-approved-badge"><i className="fas fa-check-double"></i></div>
            <div className="scanner-success-shockwave"></div>
          </div>
          <div className="trans-pill-badge permiso-pill"><i className="fas fa-user-clock me-1"></i> PERMISO CONFIRMADO</div>
        </div>
      );
    case 'check': return <div className="trans-icon-circle success-pulse"><i className="fas fa-check"></i></div>;
    case 'lock': return <div className="trans-icon-circle primary-pulse"><i className="fas fa-shield-alt"></i></div>;
    case 'attendance': return <div className="trans-icon-circle success-pulse"><i className="fas fa-fingerprint"></i></div>;
    case 'badge': return <div className="trans-icon-circle primary-pulse"><i className="fas fa-id-card"></i></div>;
    default: return <div className="trans-icon-circle sync-pulse"><i className="fas fa-rotate"></i></div>;
  }
}

interface EstadoSplash extends Required<Omit<OpcionesSplash, 'onPreExit'>> { saliendo: boolean }

export function UiProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; tipo: TipoToast; saliendo: boolean; k: number } | null>(null);
  const [carga, setCarga] = useState<{ mensaje: string; sub: string } | null>(null);
  const [spl, setSpl] = useState<EstadoSplash | null>(null);
  const timers = useRef<number[]>([]);

  const mostrarToast = useCallback((msg: string, tipo: TipoToast = 'info') => {
    vibrar(tipo === 'success' ? 50 : tipo === 'error' ? [80, 40, 80] : 30);
    const k = Date.now();
    setToast({ msg, tipo, saliendo: false, k });
    const dur = tipo === 'error' ? 3500 : 2800;
    window.setTimeout(() => setToast(t => (t && t.k === k ? { ...t, saliendo: true } : t)), dur);
    window.setTimeout(() => setToast(t => (t && t.k === k ? null : t)), dur + 300);
  }, []);

  const cargando = useCallback((mostrar: boolean, mensaje = 'Procesando...', sub = 'Por favor espera un momento') => {
    setCarga(mostrar ? { mensaje, sub } : null);
  }, []);

  const cerrarSplash = useCallback(() => {
    timers.current.forEach(t => clearTimeout(t));
    timers.current = [];
    setSpl(null);
  }, []);

  const splash = useCallback((op: OpcionesSplash) => new Promise<void>(resolve => {
    cerrarSplash();
    const duracion = op.duracion ?? 2800;
    setSpl({
      titulo: op.titulo ?? '¡Proceso Exitoso!', subtitulo: op.subtitulo ?? 'Por favor espera un momento...',
      nombreEmpleado: op.nombreEmpleado ?? '', detalles: op.detalles ?? [], icono: op.icono ?? 'check', duracion, saliendo: false,
    });
    vibrar([40, 60, 40]);
    timers.current.push(window.setTimeout(() => { Promise.resolve(op.onPreExit?.()).catch(() => undefined); }, Math.max(duracion - 650, 200)));
    timers.current.push(window.setTimeout(() => {
      setSpl(s => (s ? { ...s, saliendo: true } : s));
      timers.current.push(window.setTimeout(() => { setSpl(null); resolve(); }, 500));
    }, duracion));
  }), [cerrarSplash]);

  useEffect(() => () => timers.current.forEach(t => clearTimeout(t)), []);

  const iconos: Record<TipoToast, string> = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const clases: Record<TipoToast, string> = { success: 'success-toast', error: 'error-toast', info: 'info-toast', warning: '' };

  return (
    <Ctx.Provider value={{ toast: mostrarToast, cargando, splash, cerrarSplash }}>
      {children}
      {toast && (
        <div key={toast.k} className={`custom-toast ${clases[toast.tipo]}`} style={toast.saliendo ? { animation: 'toastOut 0.3s ease forwards' } : undefined}>
          <span className="toast-icon">{iconos[toast.tipo]}</span><span>{toast.msg}</span>
        </div>
      )}
      <div id="loadingOverlay" className={`loading-overlay ${carga ? '' : 'hidden'}`}>
        <div className="loading-card">
          <div className="loading-spinner"></div>
          <div className="loading-text">{carga?.mensaje || 'Procesando...'}</div>
          <div className="loading-subtext" style={{ display: carga?.sub ? 'block' : 'none' }}>{carga?.sub}</div>
        </div>
      </div>
      {spl && (
        <div id="transitionSplashOverlay" className={`transition-splash-overlay ${spl.saliendo ? 'fade-out' : ''}`}>
          <div className="transition-splash-card">
            <IconoTransicion icono={spl.icono} />
            <h4 className="trans-title">{spl.titulo}</h4>
            {spl.nombreEmpleado && <div className="trans-employee-name">{spl.nombreEmpleado}</div>}
            <p className="trans-subtitle">{spl.subtitulo}</p>
            {spl.detalles.length > 0 && (
              <div className="trans-steps-container">
                {spl.detalles.map((d, i) => (
                  <div key={i} className="trans-step-item" style={{ animationDelay: `${i * 0.15}s` }}>
                    <i className="fas fa-check-circle me-2" style={{ color: '#dc2626' }}></i><span>{d}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="trans-progress-bar"><div className="trans-progress-fill" style={{ animationDuration: `${spl.duracion / 1000}s` }}></div></div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
