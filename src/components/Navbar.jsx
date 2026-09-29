import React, { useState, useEffect } from 'react';
import { Clock, ShieldCheck, Users, BarChart3, Utensils, Shield, CheckCircle2, AlertCircle, Settings, X, Wifi, AlertTriangle, IdCard } from 'lucide-react';
import { executeAction, getApiBase } from '../services/api';

export default function Navbar({ currentActor }) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [dbStatus, setDbStatus] = useState('checking');
  const [showConfig, setShowConfig] = useState(false);
  const [apiUrl, setApiUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success: boolean, msg: string }

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const checkHealth = () => {
    setDbStatus('checking');
    executeAction('obtenerConfiguraciones')
      .then(data => {
        if (data && (data.success || data.ok || (!data.error && !data.err))) setDbStatus('connected');
        else setDbStatus('disconnected');
      })
      .catch(() => setDbStatus('disconnected'));
  };

  useEffect(() => {
    checkHealth();
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tcontrol_api_url') || '';
      setApiUrl(saved);
    }
  }, []);

  const handleSaveConfig = async (e) => {
    if (e) e.preventDefault();
    setTesting(true);
    setTestResult(null);

    const trimmed = apiUrl.trim();
    if (trimmed) {
      localStorage.setItem('tcontrol_api_url', trimmed);
    } else {
      localStorage.removeItem('tcontrol_api_url');
    }

    try {
      const data = await executeAction('obtenerConfiguraciones');
      if (data && (data.success || data.ok || (!data.error && !data.err))) {
        setDbStatus('connected');
        setTestResult({ success: true, msg: '¡Conexión exitosa con el backend PostgreSQL!' });
        setTimeout(() => {
          setShowConfig(false);
          // Reload page to let components refetch fresh data
          window.location.reload();
        }, 1200);
      } else {
        setDbStatus('disconnected');
        setTestResult({ success: false, msg: 'El backend respondió pero reportó error.' });
      }
    } catch (err) {
      setDbStatus('disconnected');
      setTestResult({ 
        success: false, 
        msg: isHttps && trimmed.startsWith('http://') 
          ? 'Error de Mixed Content: Tu navegador bloquea HTTP desde HTTPS (GitHub Pages). Usa un túnel HTTPS o abre el sistema vía red local HTTP.' 
          : (err.message || 'No se pudo conectar con el servidor.')
      });
    } finally {
      setTesting(false);
    }
  };

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

        {/* Module Title Badge (Isolated, No Public Actor Tabs) */}
        <div className="navbar-actor-badge">
          {currentActor === 'supervisor' && (
            <div className="actor-pill purple">
              <BarChart3 size={17} />
              <span>Panel de Supervisor</span>
            </div>
          )}
          {currentActor === 'guardia' && (
            <div className="actor-pill green">
              <Shield size={17} />
              <span>Terminal de Guardia</span>
            </div>
          )}
          {currentActor === 'catering' && (
            <div className="actor-pill amber">
              <Utensils size={17} />
              <span>Servicio de Catering</span>
            </div>
          )}
          {(currentActor === 'asistencia' || !currentActor) && (
            <div className="actor-pill blue">
              <IdCard size={17} />
              <span>Portal del Colaborador</span>
            </div>
          )}
        </div>

        {/* Live Clock, DB Status & Settings */}
        <div className="navbar-meta">
          <button 
            type="button"
            onClick={() => setShowConfig(true)}
            className={`db-pill ${dbStatus}`}
            title="Clic para configurar servidor backend"
            style={{ cursor: 'pointer', border: 'none' }}
          >
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
            <Settings size={12} style={{ marginLeft: 4, opacity: 0.7 }} />
          </button>

          <div className="live-clock">
            <span className="clock-time">{formatClock(currentTime)}</span>
            <span className="clock-date">{formatDate(currentTime)}</span>
          </div>
        </div>
      </div>

      {/* Backend Config Modal */}
      {showConfig && (
        <div className="config-modal-backdrop" onClick={() => setShowConfig(false)}>
          <div className="config-modal-card" onClick={e => e.stopPropagation()}>
            <div className="config-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Wifi size={20} color="#3b82f6" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>Configurar Servidor Backend</h3>
              </div>
              <button className="config-close-btn" onClick={() => setShowConfig(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="config-modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', margin: '0 0 16px' }}>
                Define la dirección URL del servidor Node/Docker que maneja la base de datos PostgreSQL.
              </p>

              {isHttps && (
                <div className="config-warning-box">
                  <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Aviso de Seguridad HTTPS (GitHub Pages):</strong>
                    <p style={{ margin: '4px 0 0', fontSize: '0.78rem' }}>
                      Al estar en GitHub Pages (HTTPS), los navegadores bloquean peticiones a direcciones <code>http://</code> locales (como <code>http://192.168.10.129:3000</code>). Para conectar desde aquí usa un túnel HTTPS (ej. Cloudflare / Ngrok) o abre el sistema directamente en red local.
                    </p>
                  </div>
                </div>
              )}

              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: 6 }}>
                URL del Backend API:
              </label>
              <input
                type="text"
                value={apiUrl}
                onChange={e => setApiUrl(e.target.value)}
                placeholder="http://192.168.10.129:3000 o https://tu-tunel.com"
                className="config-input"
              />

              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="config-preset-btn"
                  onClick={() => setApiUrl('http://192.168.10.129:3000')}
                >
                  IP Local (192.168.10.129:3000)
                </button>
                <button
                  type="button"
                  className="config-preset-btn"
                  onClick={() => setApiUrl('')}
                >
                  Restablecer por Defecto (/api)
                </button>
              </div>

              {testResult && (
                <div className={`config-result-box ${testResult.success ? 'success' : 'error'}`}>
                  {testResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{testResult.msg}</span>
                </div>
              )}

              <div className="config-modal-actions">
                <button
                  type="button"
                  className="config-cancel-btn"
                  onClick={() => setShowConfig(false)}
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={testing}
                  className="config-save-btn"
                >
                  {testing ? 'Comprobando...' : 'Guardar y Probar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
        .navbar-actor-badge {
          display: flex;
          align-items: center;
        }
        .actor-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 16px;
          border-radius: var(--radius-full);
          font-size: 0.85rem;
          font-weight: 700;
          letter-spacing: 0.3px;
        }
        .actor-pill.blue {
          background: rgba(59, 130, 246, 0.15);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.35);
        }
        .actor-pill.purple {
          background: rgba(168, 85, 247, 0.15);
          color: #c084fc;
          border: 1px solid rgba(168, 85, 247, 0.35);
        }
        .actor-pill.green {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.35);
        }
        .actor-pill.amber {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.35);
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
        /* Config Modal */
        .config-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px;
        }
        .config-modal-card {
          background: #111827;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 16px;
          max-width: 520px;
          width: 100%;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
          overflow: hidden;
          animation: modalIn 0.2s ease-out;
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .config-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
        }
        .config-close-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
        }
        .config-close-btn:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.08);
        }
        .config-modal-body {
          padding: 20px;
        }
        .config-warning-box {
          display: flex;
          gap: 12px;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 10px;
          padding: 12px;
          margin-bottom: 16px;
          color: #fcd34d;
          font-size: 0.8rem;
          line-height: 1.4;
        }
        .config-warning-box code {
          background: rgba(0, 0, 0, 0.3);
          padding: 1px 4px;
          border-radius: 4px;
          font-family: monospace;
        }
        .config-input {
          width: 100%;
          padding: 10px 14px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          color: #fff;
          font-size: 0.9rem;
          box-sizing: border-box;
          outline: none;
        }
        .config-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }
        .config-preset-btn {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-dim);
          font-size: 0.75rem;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
        }
        .config-preset-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
        }
        .config-result-box {
          margin-top: 14px;
          padding: 10px 14px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.82rem;
          line-height: 1.35;
        }
        .config-result-box.success {
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.3);
          color: #34d399;
        }
        .config-result-box.error {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #f87171;
        }
        .config-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
        }
        .config-cancel-btn {
          padding: 8px 16px;
          border-radius: 8px;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-dim);
          cursor: pointer;
          font-size: 0.85rem;
        }
        .config-cancel-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
        }
        .config-save-btn {
          padding: 8px 18px;
          border-radius: 8px;
          background: #3b82f6;
          border: none;
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.85rem;
        }
        .config-save-btn:hover {
          background: #2563eb;
        }
        .config-save-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
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
