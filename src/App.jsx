import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import MiAsistenciaPage from './pages/MiAsistenciaPage';
import KioskoPage from './pages/KioskoPage';
import SupervisorPage from './pages/SupervisorPage';
import GuardiaPage from './pages/GuardiaPage';
import CateringPage from './pages/CateringPage';
import { Database } from 'lucide-react';

function getActor(initial) {
  if (initial) return initial;
  if (typeof window === 'undefined') return 'asistencia';
  
  const path = window.location.pathname.toLowerCase();
  if (path.includes('supervisor')) return 'supervisor';
  if (path.includes('guardia')) return 'guardia';
  if (path.includes('catering')) return 'catering';
  if (path.includes('kiosko')) return 'kiosko';

  const hash = window.location.hash.toLowerCase().replace('#', '');
  if (hash.includes('supervisor')) return 'supervisor';
  if (hash.includes('guardia')) return 'guardia';
  if (hash.includes('catering')) return 'catering';
  if (hash.includes('kiosko')) return 'kiosko';
  if (hash.includes('asistencia')) return 'asistencia';

  const params = new URLSearchParams(window.location.search);
  const p = params.get('page') || params.get('actor');
  if (p && ['supervisor', 'guardia', 'catering', 'asistencia', 'kiosko'].includes(p.toLowerCase())) {
    return p.toLowerCase();
  }

  return 'asistencia';
}

export default function App({ initialActor }) {
  const [actor, setActor] = useState(() => getActor(initialActor));

  useEffect(() => {
    const handleHash = () => {
      const next = getActor(null);
      setActor(next);
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleSelectActor = (newActor) => {
    setActor(newActor);
    if (typeof window !== 'undefined') {
      window.location.hash = newActor;
    }
  };

  return (
    <div className="app-root">
      {/* Top Navbar with Module Switcher */}
      <Navbar currentActor={actor} onSelectActor={handleSelectActor} />

      {/* Main Content View */}
      <main className="app-main">
        {actor === 'asistencia' && <MiAsistenciaPage />}
        {actor === 'kiosko' && <KioskoPage />}
        {actor === 'supervisor' && <SupervisorPage />}
        {actor === 'guardia' && <GuardiaPage />}
        {actor === 'catering' && <CateringPage />}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-left">
            <span className="footer-brand">T-Control S.A.</span>
            <span className="footer-separator">•</span>
            <span className="footer-desc">
              {actor === 'asistencia' ? 'Portal del Colaborador (Credencial & Marcación)' :
               actor === 'kiosko' ? 'Terminal de Kiosko General (PIN & Cámara)' :
               actor === 'supervisor' ? 'Panel de Supervisión (KPIs & Aprobaciones)' :
               actor === 'guardia' ? 'Terminal de Garita (Control Portería & Asistida)' : 'Servicio de Comedor & Catering'}
            </span>
          </div>

          <div className="footer-right">
            <div className="db-badge">
              <Database size={13} color="#10b981" />
              <span>Base de Datos: PostgreSQL</span>
            </div>
            <span className="footer-ver">v2.1.0-react</span>
          </div>
        </div>
      </footer>

      <style>{`
        .app-root {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .app-main {
          flex: 1;
          padding-bottom: 40px;
        }
        .app-footer {
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(11, 15, 25, 0.95);
          padding: 16px 24px;
          margin-top: auto;
        }
        .footer-content {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          font-size: 0.8rem;
          color: var(--text-dim);
        }
        .footer-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .footer-brand {
          font-weight: 700;
          color: var(--text-main);
        }
        .footer-separator {
          color: var(--text-dim);
        }
        .footer-right {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .db-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #34d399;
          font-weight: 600;
          font-size: 0.75rem;
        }
        .footer-ver {
          font-family: monospace;
          color: var(--text-dim);
        }
      `}</style>
    </div>
  );
}
