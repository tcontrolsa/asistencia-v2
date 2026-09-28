import React, { useState, useEffect } from 'react';
import { Clock, ShieldCheck, Users, BarChart3, Utensils, Shield, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab }) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [dbStatus, setDbStatus] = useState('checking');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Check PostgreSQL backend health
    fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'obtenerConfiguraciones' }),
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.success) setDbStatus('connected');
        else setDbStatus('disconnected');
      })
      .catch(() => setDbStatus('disconnected'));
  }, []);

  const formatClock = (date) => {
    return date.toLocaleTimeString('es-EC', { hour12: false });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  return (
    <header className="navbar-container">
      <div className="navbar-content">
        {/* Brand */}
        <div className="navbar-brand">
          <div className="brand-logo">
            <ShieldCheck size={26} color="#3b82f6" />
          </div>
          <div>
            <h1 className="brand-title">T-CONTROL <span>2.0</span></h1>
            <p className="brand-subtitle">Control de Asistencia & Personal</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="navbar-tabs">
          <button
            onClick={() => setActiveTab('kiosko')}
            className={`nav-tab ${activeTab === 'kiosko' ? 'active' : ''}`}
          >
            <Clock size={18} />
            <span>Kiosco</span>
          </button>

          <button
            onClick={() => setActiveTab('supervisor')}
            className={`nav-tab ${activeTab === 'supervisor' ? 'active' : ''}`}
          >
            <BarChart3 size={18} />
            <span>Supervisor</span>
          </button>

          <button
            onClick={() => setActiveTab('guardia')}
            className={`nav-tab ${activeTab === 'guardia' ? 'active' : ''}`}
          >
            <Shield size={18} />
            <span>Guardia</span>
          </button>

          <button
            onClick={() => setActiveTab('catering')}
            className={`nav-tab ${activeTab === 'catering' ? 'active' : ''}`}
          >
            <Utensils size={18} />
            <span>Catering</span>
          </button>
        </nav>

        {/* Live Clock & DB Status */}
        <div className="navbar-meta">
          <div className={`db-pill ${dbStatus}`}>
            {dbStatus === 'connected' ? (
              <>
                <CheckCircle2 size={13} color="#10b981" />
                <span>Postgres Activo</span>
              </>
            ) : dbStatus === 'checking' ? (
              <>
                <div className="status-dot pulsing" />
                <span>Conectando...</span>
              </>
            ) : (
              <>
                <AlertCircle size={13} color="#ef4444" />
                <span>Sin Conexión</span>
              </>
            )}
          </div>

          <div className="live-clock">
            <span className="clock-time">{formatClock(currentTime)}</span>
            <span className="clock-date">{formatDate(currentTime)}</span>
          </div>
        </div>
      </div>

      <style>{`
        .navbar-container {
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .navbar-content {
          max-width: 1400px;
          margin: 0 auto;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }
        .navbar-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .brand-logo {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .brand-title {
          font-family: var(--font-display);
          font-size: 1.35rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #ffffff;
          line-height: 1.1;
        }
        .brand-title span {
          color: #3b82f6;
          font-size: 1.15rem;
        }
        .brand-subtitle {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .navbar-tabs {
          display: flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.04);
          padding: 4px;
          border-radius: var(--radius-full);
          border: 1px solid var(--border-color);
        }
        .nav-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 18px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 0.88rem;
          font-weight: 600;
          border-radius: var(--radius-full);
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .nav-tab:hover {
          color: var(--text-main);
          background: rgba(255, 255, 255, 0.05);
        }
        .nav-tab.active {
          color: white;
          background: var(--primary);
          box-shadow: 0 2px 10px var(--primary-glow);
        }
        .navbar-meta {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .db-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 5px 12px;
          border-radius: var(--radius-full);
        }
        .db-pill.connected {
          background: rgba(16, 185, 129, 0.12);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .db-pill.disconnected {
          background: rgba(239, 68, 68, 0.12);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .db-pill.checking {
          background: rgba(245, 158, 11, 0.12);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: currentColor;
        }
        .pulsing {
          animation: pulseGlow 1.5s infinite;
        }
        .live-clock {
          text-align: right;
          border-left: 1px solid var(--border-color);
          padding-left: 16px;
        }
        .clock-time {
          display: block;
          font-family: var(--font-display);
          font-size: 1.15rem;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: 0.02em;
        }
        .clock-date {
          display: block;
          font-size: 0.72rem;
          color: var(--text-dim);
          text-transform: capitalize;
        }
        @media (max-width: 900px) {
          .navbar-content {
            flex-direction: column;
            gap: 12px;
            padding: 12px 16px;
          }
          .navbar-tabs {
            width: 100%;
            justify-content: center;
          }
          .navbar-meta {
            display: none;
          }
        }
      `}</style>
    </header>
  );
}
