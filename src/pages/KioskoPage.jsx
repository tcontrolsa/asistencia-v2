import React, { useState, useEffect } from 'react';
import { 
  LogIn, 
  LogOut, 
  Coffee, 
  Utensils, 
  User, 
  CheckCircle, 
  AlertTriangle, 
  MapPin, 
  Search,
  Sparkles,
  Loader2
} from 'lucide-react';
import PinPad from '../components/PinPad';
import { 
  obtenerColaboradores, 
  verificarPIN, 
  registrarAsistencia 
} from '../services/api';

export default function KioskoPage() {
  const [colaboradores, setColaboradores] = useState([]);
  const [loadingColab, setLoadingColab] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedColab, setSelectedColab] = useState(null);
  const [selectedAction, setSelectedAction] = useState('Entrada');
  const [pin, setPin] = useState('');
  const [coords, setCoords] = useState(null);
  
  // Status state
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type: 'success' | 'error', title, desc }

  // Load collaborators on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoadingColab(true);
        const data = await obtenerColaboradores();
        setColaboradores(data);
      } catch (err) {
        console.error('Error al cargar colaboradores:', err);
      } finally {
        setLoadingColab(false);
      }
    }
    loadData();

    // Request GPS silently
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        (err) => {
          console.warn('GPS no disponible o denegado:', err.message);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  // Filter collaborators
  const filteredColaboradores = colaboradores.filter(c => {
    const q = searchQuery.toLowerCase();
    const nombre = (c.nombre || c.nombres || '').toLowerCase();
    const id = String(c.id || c.id_empleado || '');
    const depto = (c.departamento || c.cargo || '').toLowerCase();
    return nombre.includes(q) || id.includes(q) || depto.includes(q);
  });

  const handleSelectColab = (c) => {
    setSelectedColab(c);
    setPin('');
    setStatusMessage(null);
  };

  const handleCancelSelection = () => {
    setSelectedColab(null);
    setPin('');
    setStatusMessage(null);
  };

  // Submit attendance record
  const handleConfirmPin = async () => {
    if (!selectedColab || pin.length < 4 || processing) return;

    setProcessing(true);
    setStatusMessage(null);

    const empId = String(selectedColab.id || selectedColab.id_empleado);
    const empNombre = selectedColab.nombre || selectedColab.nombres || `Empleado ${empId}`;

    try {
      // 1. Check PIN against PostgreSQL
      const pinRes = await verificarPIN(empId, pin);
      if (!pinRes.valido && !pinRes.success) {
        setStatusMessage({
          type: 'error',
          title: 'PIN Incorrecto',
          desc: 'El PIN ingresado no coincide. Por favor intenta nuevamente.',
        });
        setPin('');
        setProcessing(false);
        return;
      }

      // 2. Register punch in PostgreSQL
      const now = new Date();
      const horaStr = now.toLocaleTimeString('es-EC', { hour12: false });
      const fechaStr = now.toISOString().split('T')[0];

      const punchPayload = {
        idEmpleado: empId,
        nombre: empNombre,
        tipo: selectedAction,
        hora: horaStr,
        fecha: fechaStr,
        ubicacion: coords ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}` : 'Oficina Central',
        dispositivo: navigator.userAgent.slice(0, 100),
      };

      await registrarAsistencia(punchPayload);

      setStatusMessage({
        type: 'success',
        title: `¡${selectedAction} Registrada con Éxito!`,
        desc: `${empNombre} a las ${horaStr} hrs.`,
      });

      // Reset after 3.5 seconds
      setTimeout(() => {
        setSelectedColab(null);
        setPin('');
        setStatusMessage(null);
      }, 3500);

    } catch (err) {
      console.error('Error al registrar asistencia:', err);
      setStatusMessage({
        type: 'error',
        title: 'Error de Registro',
        desc: err.message || 'No se pudo comunicar con el servidor.',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="kiosko-layout fade-in">
      {/* Top Action Switcher */}
      <div className="action-selector-bar">
        <button
          type="button"
          onClick={() => setSelectedAction('Entrada')}
          className={`action-btn btn-in ${selectedAction === 'Entrada' ? 'selected' : ''}`}
        >
          <LogIn size={20} />
          <span>Entrada</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedAction('Salida')}
          className={`action-btn btn-out ${selectedAction === 'Salida' ? 'selected' : ''}`}
        >
          <LogOut size={20} />
          <span>Salida</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedAction('Almuerzo_Salida')}
          className={`action-btn btn-lunch-out ${selectedAction === 'Almuerzo_Salida' ? 'selected' : ''}`}
        >
          <Coffee size={20} />
          <span>Salida Almuerzo</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedAction('Almuerzo_Entrada')}
          className={`action-btn btn-lunch-in ${selectedAction === 'Almuerzo_Entrada' ? 'selected' : ''}`}
        >
          <Utensils size={20} />
          <span>Retorno Almuerzo</span>
        </button>
      </div>

      {/* Main Content Area: Left Colab List, Right PIN Pad */}
      <div className="kiosko-grid">
        {/* Left Column: Collaborator Selection */}
        <div className="glass-card colab-card">
          <div className="card-header">
            <div>
              <h2 className="section-title">Seleccionar Colaborador</h2>
              <p className="section-subtitle">
                {colaboradores.length} Colaboradores registrados en PostgreSQL
              </p>
            </div>
            {coords && (
              <span className="badge badge-success" title="GPS Detectado">
                <MapPin size={12} />
                <span>GPS OK</span>
              </span>
            )}
          </div>

          {/* Search box */}
          <div className="search-wrap">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar por nombre, ID o departamento..."
              className="input-field search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* List of collaborators */}
          <div className="colab-list">
            {loadingColab ? (
              <div className="empty-state">
                <Loader2 className="spinner" size={28} />
                <p>Cargando nómina de colaboradores...</p>
              </div>
            ) : filteredColaboradores.length === 0 ? (
              <div className="empty-state">
                <p>No se encontraron colaboradores.</p>
              </div>
            ) : (
              filteredColaboradores.map((colab) => {
                const id = colab.id || colab.id_empleado;
                const isSelected = selectedColab && (selectedColab.id || selectedColab.id_empleado) === id;
                return (
                  <div
                    key={id}
                    className={`colab-item ${isSelected ? 'active' : ''}`}
                    onClick={() => handleSelectColab(colab)}
                  >
                    <div className="colab-avatar">
                      {colab.foto ? (
                        <img src={colab.foto} alt={colab.nombre} />
                      ) : (
                        <User size={22} color="#94a3b8" />
                      )}
                    </div>
                    <div className="colab-info">
                      <h4 className="colab-name">{colab.nombre || colab.nombres}</h4>
                      <div className="colab-meta">
                        <span className="colab-id">ID: {id}</span>
                        {colab.departamento && (
                          <span className="colab-dept">• {colab.departamento}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: PIN Verification */}
        <div className="glass-card pin-card">
          {selectedColab ? (
            <div className="pin-active-view fade-in">
              <div className="selected-summary">
                <div className="summary-badge">
                  <span>Marcando: <strong>{selectedAction.replace('_', ' ')}</strong></span>
                </div>
                <h3 className="summary-name">{selectedColab.nombre || selectedColab.nombres}</h3>
                <p className="summary-id">ID: {selectedColab.id || selectedColab.id_empleado}</p>
                <button
                  type="button"
                  onClick={handleCancelSelection}
                  className="change-colab-btn"
                >
                  Cambiar Colaborador
                </button>
              </div>

              {/* Status Message Overlay */}
              {statusMessage && (
                <div className={`status-banner ${statusMessage.type} fade-in`}>
                  {statusMessage.type === 'success' ? (
                    <CheckCircle size={28} color="#10b981" />
                  ) : (
                    <AlertTriangle size={28} color="#ef4444" />
                  )}
                  <div>
                    <h4>{statusMessage.title}</h4>
                    <p>{statusMessage.desc}</p>
                  </div>
                </div>
              )}

              {/* Virtual Pad */}
              <div className="pinpad-wrapper">
                <p className="pin-instruction">Ingresa tu PIN de seguridad:</p>
                <PinPad
                  value={pin}
                  onChange={setPin}
                  onConfirm={handleConfirmPin}
                  disabled={processing}
                />
              </div>
            </div>
          ) : (
            <div className="pin-placeholder">
              <div className="placeholder-icon">
                <Sparkles size={40} color="#3b82f6" />
              </div>
              <h3>Selecciona tu Nombre</h3>
              <p>Haz clic en tu nombre en la lista de la izquierda para ingresar tu PIN y registrar tu asistencia.</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .kiosko-layout {
          max-width: 1300px;
          margin: 24px auto;
          padding: 0 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .action-selector-bar {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 16px 20px;
          font-family: var(--font-display);
          font-size: 1.05rem;
          font-weight: 700;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .action-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-main);
          transform: translateY(-1px);
        }
        .action-btn.selected {
          color: #ffffff;
          transform: translateY(-2px);
        }
        .action-btn.btn-in.selected {
          background: linear-gradient(135deg, #10b981, #059669);
          border-color: #10b981;
          box-shadow: 0 4px 18px rgba(16, 185, 129, 0.35);
        }
        .action-btn.btn-out.selected {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          border-color: #ef4444;
          box-shadow: 0 4px 18px rgba(239, 68, 68, 0.35);
        }
        .action-btn.btn-lunch-out.selected {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          border-color: #f59e0b;
          box-shadow: 0 4px 18px rgba(245, 158, 11, 0.35);
        }
        .action-btn.btn-lunch-in.selected {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          border-color: #3b82f6;
          box-shadow: 0 4px 18px rgba(59, 130, 246, 0.35);
        }

        .kiosko-grid {
          display: grid;
          grid-template-columns: 1fr 420px;
          gap: 20px;
          min-height: 580px;
        }
        .colab-card {
          padding: 22px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .section-title {
          font-family: var(--font-display);
          font-size: 1.35rem;
          font-weight: 700;
          color: #ffffff;
        }
        .section-subtitle {
          font-size: 0.82rem;
          color: var(--text-dim);
          margin-top: 2px;
        }
        .search-wrap {
          position: relative;
        }
        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-dim);
        }
        .search-input {
          padding-left: 42px;
        }
        .colab-list {
          flex: 1;
          overflow-y: auto;
          max-height: 480px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-right: 4px;
        }
        .colab-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 14px;
          border-radius: var(--radius-md);
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .colab-item:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.1);
          transform: translateX(4px);
        }
        .colab-item.active {
          background: rgba(59, 130, 246, 0.15);
          border-color: var(--primary);
        }
        .colab-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          flex-shrink: 0;
        }
        .colab-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .colab-name {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-main);
        }
        .colab-meta {
          display: flex;
          gap: 6px;
          font-size: 0.78rem;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .colab-id {
          font-family: monospace;
          color: #60a5fa;
        }

        .pin-card {
          padding: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .pin-placeholder {
          text-align: center;
          max-width: 280px;
          color: var(--text-muted);
        }
        .placeholder-icon {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
        }
        .pin-placeholder h3 {
          font-family: var(--font-display);
          color: #ffffff;
          font-size: 1.25rem;
          margin-bottom: 8px;
        }
        .pin-placeholder p {
          font-size: 0.88rem;
          line-height: 1.5;
        }

        .pin-active-view {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }
        .selected-summary {
          text-align: center;
          width: 100%;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-color);
        }
        .summary-badge {
          display: inline-block;
          padding: 4px 12px;
          background: rgba(59, 130, 246, 0.15);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: var(--radius-full);
          font-size: 0.75rem;
          color: #93c5fd;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .summary-name {
          font-family: var(--font-display);
          font-size: 1.25rem;
          font-weight: 700;
          color: #ffffff;
        }
        .summary-id {
          font-size: 0.8rem;
          color: var(--text-dim);
          font-family: monospace;
          margin-top: 2px;
        }
        .change-colab-btn {
          margin-top: 6px;
          background: transparent;
          border: none;
          color: #60a5fa;
          font-size: 0.8rem;
          cursor: pointer;
          text-decoration: underline;
        }
        .pin-instruction {
          font-size: 0.85rem;
          color: var(--text-muted);
          text-align: center;
          margin-bottom: 10px;
        }

        .status-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-radius: var(--radius-md);
          width: 100%;
        }
        .status-banner.success {
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.4);
          color: #34d399;
        }
        .status-banner.error {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #f87171;
        }
        .status-banner h4 {
          font-size: 0.95rem;
          font-weight: 700;
          margin-bottom: 2px;
        }
        .status-banner p {
          font-size: 0.8rem;
          opacity: 0.9;
        }

        .spinner {
          animation: spin 1s linear infinite;
          color: var(--primary);
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .empty-state {
          padding: 40px 20px;
          text-align: center;
          color: var(--text-dim);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }

        @media (max-width: 900px) {
          .action-selector-bar {
            grid-template-columns: repeat(2, 1fr);
          }
          .kiosko-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
