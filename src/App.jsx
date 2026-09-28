import React, { useState } from 'react';
import Navbar from './components/Navbar';
import KioskoPage from './pages/KioskoPage';
import SupervisorPage from './pages/SupervisorPage';
import GuardiaPage from './pages/GuardiaPage';
import CateringPage from './pages/CateringPage';
import { Database, ShieldCheck, Heart } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('kiosko');

  return (
    <div className="app-root">
      {/* Top Navbar */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content View */}
      <main className="app-main">
        {activeTab === 'kiosko' && <KioskoPage />}
        {activeTab === 'supervisor' && <SupervisorPage />}
        {activeTab === 'guardia' && <GuardiaPage />}
        {activeTab === 'catering' && <CateringPage />}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-left">
            <span className="footer-brand">T-Control S.A.</span>
            <span className="footer-separator">•</span>
            <span className="footer-desc">Sistema de Asistencia 2.0 (PostgreSQL Docker)</span>
          </div>

          <div className="footer-right">
            <div className="db-badge">
              <Database size={13} color="#10b981" />
              <span>Base de Datos: PostgreSQL</span>
            </div>
            <span className="footer-ver">v2.0.0-react</span>
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
