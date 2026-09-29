import React, { useState, useEffect, useMemo } from 'react';
import { 
  User, 
  LogIn, 
  LogOut, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  MapPin, 
  Award, 
  Trophy, 
  RefreshCw, 
  Building2, 
  Briefcase, 
  Utensils, 
  Search, 
  Lock, 
  ShieldCheck,
  ChevronRight,
  TrendingUp,
  History,
  IdCard,
  Sparkles
} from 'lucide-react';
import PinPad from '../components/PinPad';
import { 
  obtenerColaboradores, 
  verificarPIN, 
  obtenerRegistrosEmpleado, 
  registrarAsistencia 
} from '../services/api';

export default function MiAsistenciaPage() {
  // Current authenticated user session
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('tcontrol_colab_auth');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Login view states
  const [colaboradores, setColaboradores] = useState([]);
  const [loadingColabs, setLoadingColabs] = useState(false);
  const [searchColab, setSearchColab] = useState('');
  const [selectedColab, setSelectedColab] = useState(null);
  const [pin, setPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Authenticated module states
  const [activeSubtab, setActiveSubtab] = useState('credencial'); // 'credencial' | 'estadisticas' | 'historial'
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [actionProcessing, setActionProcessing] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');
  const [actionErrorMsg, setActionErrorMsg] = useState('');
  const [workMode, setWorkMode] = useState('OFICINA'); // 'OFICINA' | 'CAMPO'
  const [currentTime, setCurrentTime] = useState(new Date());
  const [coords, setCoords] = useState(null);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Request GPS
  useEffect(() => {
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
          console.warn('GPS:', err.message);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }, []);

  // Load collaborators list if not logged in
  useEffect(() => {
    if (!currentUser) {
      setLoadingColabs(true);
      obtenerColaboradores()
        .then((data) => setColaboradores(data || []))
        .catch((err) => console.error('Error cargando colaboradores:', err))
        .finally(() => setLoadingColabs(false));
    }
  }, [currentUser]);

  // Load records for the logged-in employee
  const loadUserRecords = async (userId) => {
    if (!userId) return;
    setLoadingRecords(true);
    try {
      const data = await obtenerRegistrosEmpleado(userId);
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error al cargar registros del empleado:', err);
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    if (currentUser?.id) {
      loadUserRecords(currentUser.id);
    }
  }, [currentUser]);

  // Handle Login
  const handleLogin = async () => {
    if (!selectedColab || pin.length < 4 || loggingIn) return;
    setLoggingIn(true);
    setLoginError('');

    try {
      const empId = String(selectedColab.id || selectedColab.id_empleado);
      const res = await verificarPIN(empId, pin);
      if (res.valido || res.success || res.ok) {
        const userData = {
          id: empId,
          nombre: selectedColab.nombre || selectedColab.nombres,
          cargo: selectedColab.cargo || 'COLABORADOR',
          area: selectedColab.area || selectedColab.departamento || 'OPERACIONES',
          foto_url: selectedColab.foto_url || '',
        };
        localStorage.setItem('tcontrol_colab_auth', JSON.stringify(userData));
        setCurrentUser(userData);
        setSelectedColab(null);
        setPin('');
      } else {
        setLoginError('PIN incorrecto. Intenta de nuevo.');
        setPin('');
      }
    } catch (err) {
      setLoginError(err.message || 'Error al validar credenciales');
    } finally {
      setLoggingIn(false);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem('tcontrol_colab_auth');
    setCurrentUser(null);
    setRecords([]);
    setPin('');
    setLoginError('');
  };

  // Compute Today's State
  const hoyStr = new Date().toISOString().split('T')[0];
  const todayRecords = useMemo(() => {
    return records.filter((r) => {
      const f = (r.fecha || '').split('T')[0];
      return f === hoyStr;
    });
  }, [records, hoyStr]);

  const entradaHoy = useMemo(() => {
    return todayRecords.find(
      (r) => r.tipo === 'ENTRADA' || r.tipo === 'Entrada' || r.tipo === 'SOLO_ALMUERZO'
    );
  }, [todayRecords]);

  const salidaHoy = useMemo(() => {
    return todayRecords.find((r) => r.tipo === 'SALIDA' || r.tipo === 'Salida');
  }, [todayRecords]);

  const almuerzoHoy = useMemo(() => {
    return todayRecords.find(
      (r) =>
        r.tipo === 'ALMUERZO_SALIDA' ||
        r.tipo === 'ALMUERZO_ENTRADA' ||
        r.tipo === 'SOLO_ALMUERZO' ||
        r.almuerzo === 'SI' ||
        r.almuerzo === 'PLANTA'
    );
  }, [todayRecords]);

  // Compute Monthly Statistics
  const stats = useMemo(() => {
    const ahora = new Date();
    const mesActual = ahora.toISOString().slice(0, 7); // YYYY-MM

    // Group records by date
    const diasMap = {};
    records.forEach((r) => {
      const f = (r.fecha || '').split('T')[0];
      if (f.startsWith(mesActual)) {
        if (!diasMap[f]) diasMap[f] = [];
        diasMap[f].push(r);
      }
    });

    const fechas = Object.keys(diasMap);
    const diasTrabajados = fechas.length;

    let atrasos = 0;
    let horasTotalesMin = 0;

    fechas.forEach((f) => {
      const recs = diasMap[f];
      const ent = recs.find((r) => r.tipo === 'ENTRADA' || r.tipo === 'Entrada');
      const sal = recs.find((r) => r.tipo === 'SALIDA' || r.tipo === 'Salida');

      if (ent && ent.hora) {
        // Evaluate late punch (after 07:45)
        const parts = ent.hora.split(':');
        const h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        if (h > 7 || (h === 7 && m > 45)) {
          atrasos += 1;
        }

        // Calculate hours if exit exists
        if (sal && sal.hora) {
          const sParts = sal.hora.split(':');
          const sh = parseInt(sParts[0], 10) || 0;
          const sm = parseInt(sParts[1], 10) || 0;
          const diff = (sh * 60 + sm) - (h * 60 + m);
          if (diff > 0) horasTotalesMin += diff;
        } else {
          horasTotalesMin += 8 * 60; // Standard day
        }
      }
    });

    const horasTotales = (horasTotalesMin / 60).toFixed(1);
    const puntualidadPct =
      diasTrabajados > 0
        ? Math.max(0, Math.round(((diasTrabajados - atrasos) / diasTrabajados) * 100))
        : 100;

    return {
      diasTrabajados,
      horasTotales,
      atrasos,
      puntualidadPct,
    };
  }, [records]);

  // Submit attendance punch
  const handleMarcar = async (tipoAccion) => {
    if (!currentUser || actionProcessing) return;
    setActionProcessing(true);
    setActionSuccessMsg('');
    setActionErrorMsg('');

    const ahora = new Date();
    const fecha = ahora.toISOString().split('T')[0];
    const hora = ahora.toTimeString().split(' ')[0];

    const asistenciaPayload = {
      idEmpleado: currentUser.id,
      nombre: currentUser.nombre,
      fecha,
      hora,
      tipo: tipoAccion,
      modo: workMode,
      ubicacion: coords
        ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
        : 'Oficina Central (Geolocalización estándar)',
      latitud: coords?.lat || null,
      longitud: coords?.lng || null,
      dispositivo: navigator.userAgent.slice(0, 40),
    };

    try {
      await registrarAsistencia(asistenciaPayload);
      setActionSuccessMsg(
        `¡${tipoAccion} registrado exitosamente a las ${hora.slice(0, 5)}!`
      );
      // Refresh user records
      await loadUserRecords(currentUser.id);
    } catch (err) {
      setActionErrorMsg(err.message || 'Error al procesar la marcación.');
    } finally {
      setActionProcessing(false);
      setTimeout(() => {
        setActionSuccessMsg('');
        setActionErrorMsg('');
      }, 5000);
    }
  };

  // Filter collaborators list for login selection
  const filteredColabs = useMemo(() => {
    const q = searchColab.toLowerCase().trim();
    if (!q) return colaboradores.slice(0, 12);
    return colaboradores
      .filter((c) => {
        const nom = (c.nombre || c.nombres || '').toLowerCase();
        const id = String(c.id || c.id_empleado || '');
        const area = (c.area || c.cargo || '').toLowerCase();
        return nom.includes(q) || id.includes(q) || area.includes(q);
      })
      .slice(0, 12);
  }, [colaboradores, searchColab]);

  // -------------------------------------------------------------------------
  // VIEW 1: LOGIN GATE (If no active collaborator session)
  // -------------------------------------------------------------------------
  if (!currentUser) {
    return (
      <div className="colab-auth-container fade-in">
        <div className="glass-card colab-auth-card">
          <div className="auth-header">
            <div className="auth-logo-badge">
              <IdCard size={32} color="#3b82f6" />
            </div>
            <h2 className="auth-title">Mi Asistencia</h2>
            <p className="auth-desc">
              Accede a tu credencial digital, registra tus entradas/salidas y consulta tus estadísticas laborales.
            </p>
          </div>

          {!selectedColab ? (
            <div className="colab-select-step">
              <label className="input-label">Selecciona tu usuario / colaborador:</label>
              <div className="search-wrap">
                <Search size={18} className="search-icon" />
                <input
                  type="text"
                  placeholder="Escribe tu nombre, ID o cédula..."
                  className="input-field"
                  value={searchColab}
                  onChange={(e) => setSearchColab(e.target.value)}
                />
              </div>

              {loadingColabs ? (
                <div className="loading-state">
                  <RefreshCw size={20} className="spinning" />
                  <span>Cargando colaboradores de PostgreSQL...</span>
                </div>
              ) : (
                <div className="colab-grid-list">
                  {filteredColabs.map((c) => {
                    const empId = c.id || c.id_empleado;
                    return (
                      <div
                        key={empId}
                        className="colab-pick-item"
                        onClick={() => {
                          setSelectedColab(c);
                          setLoginError('');
                          setPin('');
                        }}
                      >
                        <div className="colab-pick-avatar">
                          {c.foto_url ? (
                            <img src={c.foto_url} alt={c.nombre} />
                          ) : (
                            <User size={20} />
                          )}
                        </div>
                        <div className="colab-pick-info">
                          <span className="colab-pick-name">{c.nombre || c.nombres}</span>
                          <span className="colab-pick-meta">
                            ID: {empId} • {c.area || c.cargo || 'T-Control'}
                          </span>
                        </div>
                        <ChevronRight size={16} className="chevron" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="pin-step fade-in">
              <div className="selected-profile-badge">
                <div className="profile-badge-avatar">
                  {selectedColab.foto_url ? (
                    <img src={selectedColab.foto_url} alt={selectedColab.nombre} />
                  ) : (
                    <User size={24} />
                  )}
                </div>
                <div className="profile-badge-text">
                  <strong>{selectedColab.nombre || selectedColab.nombres}</strong>
                  <span>ID: {selectedColab.id || selectedColab.id_empleado}</span>
                </div>
                <button
                  type="button"
                  className="btn-change-user"
                  onClick={() => setSelectedColab(null)}
                >
                  Cambiar
                </button>
              </div>

              <div className="pin-prompt-text">
                Ingresa tu PIN de 4 dígitos para ingresar:
              </div>

              {loginError && (
                <div className="auth-error-pill fade-in">
                  <AlertCircle size={16} />
                  <span>{loginError}</span>
                </div>
              )}

              <PinPad
                value={pin}
                onChange={setPin}
                onConfirm={handleLogin}
                disabled={loggingIn}
                maxLength={6}
              />
            </div>
          )}
        </div>

        <style>{`
          .colab-auth-container {
            min-height: calc(100vh - 140px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px 16px;
          }
          .colab-auth-card {
            width: 100%;
            max-width: 460px;
            padding: 32px 24px;
            display: flex;
            flex-direction: column;
            gap: 20px;
          }
          .auth-header {
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
          }
          .auth-logo-badge {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: rgba(59, 130, 246, 0.12);
            border: 1px solid rgba(59, 130, 246, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .auth-title {
            font-size: 1.5rem;
            color: #ffffff;
            font-weight: 700;
            margin: 0;
          }
          .auth-desc {
            font-size: 0.88rem;
            color: var(--text-muted);
            line-height: 1.45;
            margin: 0;
          }
          .colab-select-step {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }
          .input-label {
            font-size: 0.82rem;
            color: var(--text-muted);
            font-weight: 600;
          }
          .colab-grid-list {
            max-height: 280px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-top: 4px;
            padding-right: 4px;
          }
          .colab-pick-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 14px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.18s ease;
          }
          .colab-pick-item:hover {
            background: rgba(59, 130, 246, 0.12);
            border-color: rgba(59, 130, 246, 0.4);
            transform: translateX(4px);
          }
          .colab-pick-avatar {
            width: 38px;
            height: 38px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.08);
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #94a3b8;
            flex-shrink: 0;
          }
          .colab-pick-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .colab-pick-info {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-width: 0;
          }
          .colab-pick-name {
            font-size: 0.88rem;
            font-weight: 700;
            color: #ffffff;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .colab-pick-meta {
            font-size: 0.74rem;
            color: var(--text-muted);
          }
          .chevron {
            color: #64748b;
          }
          .selected-profile-badge {
            display: flex;
            align-items: center;
            gap: 12px;
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid rgba(59, 130, 246, 0.3);
            padding: 10px 16px;
            border-radius: 12px;
          }
          .profile-badge-avatar {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            overflow: hidden;
            background: #1e293b;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #3b82f6;
          }
          .profile-badge-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .profile-badge-text {
            display: flex;
            flex-direction: column;
            flex: 1;
          }
          .profile-badge-text strong {
            color: #ffffff;
            font-size: 0.95rem;
          }
          .profile-badge-text span {
            color: var(--text-muted);
            font-size: 0.78rem;
          }
          .btn-change-user {
            background: transparent;
            border: none;
            color: #3b82f6;
            font-size: 0.8rem;
            font-weight: 700;
            cursor: pointer;
            text-decoration: underline;
          }
          .pin-prompt-text {
            text-align: center;
            font-size: 0.85rem;
            color: var(--text-muted);
            margin: 10px 0 4px;
          }
          .auth-error-pill {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.4);
            color: #f87171;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 0.82rem;
            font-weight: 600;
          }
          .loading-state {
            padding: 24px;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            color: var(--text-muted);
            font-size: 0.85rem;
          }
        `}</style>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // VIEW 2: AUTHENTICATED EMPLOYEE DASHBOARD
  // -------------------------------------------------------------------------
  return (
    <div className="colab-dashboard fade-in">
      {/* Top Banner / User Header */}
      <div className="user-top-bar glass-card">
        <div className="user-profile-left">
          <div className="user-avatar-wrap">
            {currentUser.foto_url ? (
              <img src={currentUser.foto_url} alt={currentUser.nombre} />
            ) : (
              <User size={30} color="#3b82f6" />
            )}
          </div>
          <div className="user-profile-meta">
            <div className="user-greeting">
              {currentTime.getHours() < 12
                ? 'Buenos días,'
                : currentTime.getHours() < 18
                ? 'Buenas tardes,'
                : 'Buenas noches,'}
            </div>
            <h2 className="user-full-name">{currentUser.nombre}</h2>
            <div className="user-tags">
              <span className="user-badge id-badge">ID: {currentUser.id}</span>
              <span className="user-badge area-badge">
                <Building2 size={12} /> {currentUser.area}
              </span>
              <span className="user-badge cargo-badge">
                <Briefcase size={12} /> {currentUser.cargo}
              </span>
            </div>
          </div>
        </div>

        <div className="user-profile-right">
          {/* Work Mode Toggle */}
          <div className="mode-toggle-group">
            <button
              type="button"
              className={`mode-btn ${workMode === 'OFICINA' ? 'active-oficina' : ''}`}
              onClick={() => setWorkMode('OFICINA')}
            >
              <Building2 size={13} /> OFICINA
            </button>
            <button
              type="button"
              className={`mode-btn ${workMode === 'CAMPO' ? 'active-campo' : ''}`}
              onClick={() => setWorkMode('CAMPO')}
            >
              <MapPin size={13} /> CAMPO
            </button>
          </div>

          <button
            type="button"
            className="btn-logout"
            onClick={handleLogout}
            title="Cerrar sesión"
          >
            <LogOut size={16} />
            <span>Salir</span>
          </button>
        </div>
      </div>

      {/* Subtabs Selector */}
      <div className="colab-subtabs">
        <button
          type="button"
          className={`colab-subtab-btn ${activeSubtab === 'credencial' ? 'active' : ''}`}
          onClick={() => setActiveSubtab('credencial')}
        >
          <IdCard size={17} />
          <span>Credencial & Marcación</span>
        </button>

        <button
          type="button"
          className={`colab-subtab-btn ${activeSubtab === 'estadisticas' ? 'active' : ''}`}
          onClick={() => setActiveSubtab('estadisticas')}
        >
          <TrendingUp size={17} />
          <span>Mis Estadísticas ({stats.puntualidadPct}%)</span>
        </button>

        <button
          type="button"
          className={`colab-subtab-btn ${activeSubtab === 'historial' ? 'active' : ''}`}
          onClick={() => setActiveSubtab('historial')}
        >
          <History size={17} />
          <span>Historial de Marcaciones</span>
        </button>
      </div>

      {/* Feedback Messages */}
      {actionSuccessMsg && (
        <div className="toast-feedback success fade-in">
          <CheckCircle2 size={18} />
          <span>{actionSuccessMsg}</span>
        </div>
      )}
      {actionErrorMsg && (
        <div className="toast-feedback error fade-in">
          <AlertCircle size={18} />
          <span>{actionErrorMsg}</span>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* SUBTAB 1: CREDENCIAL & MARCACIÓN                                   */}
      {/* ------------------------------------------------------------------- */}
      {activeSubtab === 'credencial' && (
        <div className="tab-credencial-grid fade-in">
          {/* Digital Credential Card */}
          <div className="glass-card digital-credential-card">
            <div className="cred-brand">
              <ShieldCheck size={20} color="#3b82f6" />
              <span>T-CONTROL S.A. • CREDENCIAL VIRTUAL</span>
            </div>

            <div className="cred-photo-container">
              <div className="cred-photo">
                {currentUser.foto_url ? (
                  <img src={currentUser.foto_url} alt={currentUser.nombre} />
                ) : (
                  <User size={64} color="#94a3b8" />
                )}
                <div className="photo-check" title="Empleado Activo">
                  <CheckCircle2 size={14} color="#ffffff" />
                </div>
              </div>
            </div>

            <div className="cred-info">
              <h3 className="cred-name">{currentUser.nombre}</h3>
              <div className="cred-role-pill">{currentUser.cargo}</div>
              <div className="cred-area-text">{currentUser.area}</div>
              <div className="cred-id-code">ID: {currentUser.id}</div>
            </div>

            <div className="cred-footer">
              <div className="cred-live-clock">
                <Clock size={16} color="#3b82f6" />
                <span>{currentTime.toLocaleTimeString('es-EC')}</span>
              </div>
              <div className="cred-date-str">
                {currentTime.toLocaleDateString('es-EC', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
            </div>
          </div>

          {/* Today's Punch Controls & Status */}
          <div className="glass-card punch-controls-card">
            <div className="card-section-title">
              <Sparkles size={18} color="#eab308" />
              <span>ESTADO DE ASISTENCIA - HOY</span>
            </div>

            {/* Today's Unified Timeline Box */}
            <div className="today-summary-box">
              <div className="summary-col">
                <span className="summary-lbl">ENTRADA</span>
                <span
                  className={`summary-val ${entradaHoy ? 'val-green' : 'val-pending'}`}
                >
                  {entradaHoy ? entradaHoy.hora?.slice(0, 5) : 'Pendiente'}
                </span>
                <span className="summary-sub">
                  {entradaHoy ? (entradaHoy.modo || 'Oficina') : 'No registrada'}
                </span>
              </div>

              <div className="summary-divider"></div>

              <div className="summary-col">
                <span className="summary-lbl">ALMUERZO</span>
                <span
                  className={`summary-val ${almuerzoHoy ? 'val-amber' : 'val-pending'}`}
                >
                  {almuerzoHoy ? 'Registrado' : 'Pendiente'}
                </span>
                <span className="summary-sub">
                  {almuerzoHoy ? (almuerzoHoy.hora?.slice(0, 5) || 'Planta') : 'Opcional'}
                </span>
              </div>

              <div className="summary-divider"></div>

              <div className="summary-col">
                <span className="summary-lbl">SALIDA</span>
                <span
                  className={`summary-val ${salidaHoy ? 'val-blue' : 'val-pending'}`}
                >
                  {salidaHoy ? salidaHoy.hora?.slice(0, 5) : 'Pendiente'}
                </span>
                <span className="summary-sub">
                  {salidaHoy ? 'Jornada cerrada' : 'Pendiente'}
                </span>
              </div>
            </div>

            {/* Smart Big Punch Action Button */}
            <div className="big-action-container">
              {!entradaHoy ? (
                <button
                  type="button"
                  className="big-action-btn btn-entrada"
                  onClick={() => handleMarcar('ENTRADA')}
                  disabled={actionProcessing}
                >
                  {actionProcessing ? (
                    <RefreshCw size={24} className="spinning" />
                  ) : (
                    <LogIn size={26} />
                  )}
                  <div className="action-btn-texts">
                    <span className="action-main-lbl">REGISTRAR ENTRADA</span>
                    <span className="action-sub-lbl">
                      Marcar inicio de jornada laboral ({workMode})
                    </span>
                  </div>
                </button>
              ) : !salidaHoy ? (
                <div className="punch-dual-actions">
                  <button
                    type="button"
                    className="big-action-btn btn-salida"
                    onClick={() => handleMarcar('SALIDA')}
                    disabled={actionProcessing}
                  >
                    {actionProcessing ? (
                      <RefreshCw size={24} className="spinning" />
                    ) : (
                      <LogOut size={26} />
                    )}
                    <div className="action-btn-texts">
                      <span className="action-main-lbl">REGISTRAR SALIDA</span>
                      <span className="action-sub-lbl">
                        Finalizar jornada de hoy ({currentTime.toLocaleTimeString('es-EC').slice(0, 5)})
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="sub-action-btn btn-almuerzo"
                    onClick={() => handleMarcar('ALMUERZO_SALIDA')}
                    disabled={actionProcessing}
                  >
                    <Utensils size={18} />
                    <span>Marcar Almuerzo</span>
                  </button>
                </div>
              ) : (
                <div className="jornada-completada-card">
                  <CheckCircle2 size={32} color="#10b981" />
                  <div className="jornada-texts">
                    <strong>¡Jornada de Hoy Completada!</strong>
                    <span>
                      Entrada: {entradaHoy.hora?.slice(0, 5)} • Salida: {salidaHoy.hora?.slice(0, 5)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Geolocation status pill */}
            <div className="geo-status-box">
              <MapPin size={15} color="#3b82f6" />
              <span>
                {coords
                  ? `Ubicación GPS capturada (±${Math.round(coords.accuracy)}m)`
                  : 'Geolocalización activa por navegador'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* SUBTAB 2: MIS ESTADÍSTICAS & LOGROS                                */}
      {/* ------------------------------------------------------------------- */}
      {activeSubtab === 'estadisticas' && (
        <div className="tab-stats-container fade-in">
          {/* KPI Cards Grid */}
          <div className="stats-kpi-grid">
            <div className="glass-card stat-kpi-box">
              <div className="stat-kpi-icon blue">
                <Calendar size={24} />
              </div>
              <div className="stat-kpi-content">
                <span className="stat-kpi-lbl">Días Laborados (Mes)</span>
                <span className="stat-kpi-num">{stats.diasTrabajados} días</span>
              </div>
            </div>

            <div className="glass-card stat-kpi-box">
              <div className="stat-kpi-icon green">
                <Clock size={24} />
              </div>
              <div className="stat-kpi-content">
                <span className="stat-kpi-lbl">Horas Acumuladas</span>
                <span className="stat-kpi-num">{stats.horasTotales} hrs</span>
              </div>
            </div>

            <div className="glass-card stat-kpi-box">
              <div className="stat-kpi-icon yellow">
                <Award size={24} />
              </div>
              <div className="stat-kpi-content">
                <span className="stat-kpi-lbl">Índice Puntualidad</span>
                <span className="stat-kpi-num">{stats.puntualidadPct}%</span>
              </div>
            </div>

            <div className="glass-card stat-kpi-box">
              <div className="stat-kpi-icon red">
                <AlertCircle size={24} />
              </div>
              <div className="stat-kpi-content">
                <span className="stat-kpi-lbl">Atrasos Detectados</span>
                <span className="stat-kpi-num">{stats.atrasos}</span>
              </div>
            </div>
          </div>

          {/* Badges / Gamified Achievements (as in original project) */}
          <div className="glass-card achievements-section">
            <div className="card-section-title">
              <Trophy size={20} color="#f59e0b" />
              <span>Insignias de Rendimiento Laboral</span>
            </div>

            <div className="achievements-list">
              {/* Asistencia badge */}
              <div className="achievement-item">
                <div
                  className="achievement-medal"
                  style={{
                    background:
                      stats.diasTrabajados >= 15
                        ? 'linear-gradient(135deg, #e2e8f0, #94a3b8)'
                        : stats.diasTrabajados >= 8
                        ? 'linear-gradient(135deg, #fef08a, #f59e0b)'
                        : 'linear-gradient(135deg, #fed7aa, #ea580c)',
                  }}
                >
                  🏅
                </div>
                <div className="achievement-info">
                  <strong>
                    {stats.diasTrabajados >= 15
                      ? 'Asistencia de Platino'
                      : stats.diasTrabajados >= 8
                      ? 'Asistencia de Oro'
                      : 'Asistencia en Progreso'}
                  </strong>
                  <p>
                    {stats.diasTrabajados >= 15
                      ? `¡Excelente! Llevas ${stats.diasTrabajados} días laborados en este período con asistencia constante.`
                      : `Has registrado ${stats.diasTrabajados} días en el período actual.`}
                  </p>
                </div>
              </div>

              {/* Puntualidad badge */}
              <div className="achievement-item">
                <div
                  className="achievement-medal"
                  style={{
                    background:
                      stats.puntualidadPct >= 95
                        ? 'linear-gradient(135deg, #bbf7d0, #10b981)'
                        : 'linear-gradient(135deg, #fef08a, #eab308)',
                  }}
                >
                  ⭐
                </div>
                <div className="achievement-info">
                  <strong>
                    {stats.puntualidadPct === 100
                      ? 'Puntualidad Impecable (100%)'
                      : stats.puntualidadPct >= 90
                      ? 'Muy Puntual'
                      : 'Oportunidad de Mejora'}
                  </strong>
                  <p>
                    {stats.puntualidadPct === 100
                      ? '¡Felicitaciones! Cero atrasos registrados en el mes actual.'
                      : `${stats.atrasos} marcación(es) registrada(s) con atraso en el mes.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* SUBTAB 3: HISTORIAL DE MARCACIONES                                 */}
      {/* ------------------------------------------------------------------- */}
      {activeSubtab === 'historial' && (
        <div className="tab-historial-container glass-card fade-in">
          <div className="historial-header">
            <div className="card-section-title">
              <History size={20} color="#3b82f6" />
              <span>Mis Registros Recientes en PostgreSQL</span>
            </div>
            <button
              type="button"
              className="btn-refresh-historial"
              onClick={() => loadUserRecords(currentUser.id)}
              disabled={loadingRecords}
            >
              <RefreshCw size={14} className={loadingRecords ? 'spinning' : ''} />
              <span>Actualizar</span>
            </button>
          </div>

          {loadingRecords ? (
            <div className="loading-state">
              <RefreshCw size={24} className="spinning" />
              <span>Consultando tus registros...</span>
            </div>
          ) : records.length === 0 ? (
            <div className="empty-state">
              <p>No se encontraron registros de asistencia para tu usuario.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="user-historial-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Hora</th>
                    <th>Tipo</th>
                    <th>Modo</th>
                    <th>Ubicación</th>
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 30).map((r, i) => (
                    <tr key={r.id || i}>
                      <td className="fecha-td">{(r.fecha || '').split('T')[0]}</td>
                      <td className="hora-td">{r.hora?.slice(0, 5) || '--:--'}</td>
                      <td>
                        <span
                          className={`hist-badge ${
                            (r.tipo || '').includes('ENTRADA')
                              ? 'hist-entrada'
                              : (r.tipo || '').includes('SALIDA')
                              ? 'hist-salida'
                              : 'hist-almuerzo'
                          }`}
                        >
                          {r.tipo || 'Marcación'}
                        </span>
                      </td>
                      <td>{r.modo || 'Oficina'}</td>
                      <td className="hist-loc-td" title={r.ubicacion || 'Central'}>
                        {r.ubicacion ? r.ubicacion.slice(0, 28) : 'Central'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <style>{`
        .colab-dashboard {
          max-width: 1080px;
          margin: 0 auto;
          padding: 24px 16px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .user-top-bar {
          padding: 20px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }
        .user-profile-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .user-avatar-wrap {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: rgba(59, 130, 246, 0.15);
          border: 2px solid rgba(59, 130, 246, 0.4);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .user-avatar-wrap img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .user-greeting {
          font-size: 0.8rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 700;
        }
        .user-full-name {
          font-size: 1.25rem;
          font-weight: 800;
          color: #ffffff;
          margin: 2px 0 6px;
        }
        .user-tags {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .user-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 0.72rem;
          font-weight: 700;
        }
        .id-badge {
          background: rgba(59, 130, 246, 0.15);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.3);
        }
        .area-badge {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .cargo-badge {
          background: rgba(168, 85, 247, 0.15);
          color: #c084fc;
          border: 1px solid rgba(168, 85, 247, 0.3);
        }
        .user-profile-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .mode-toggle-group {
          display: flex;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
          padding: 3px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .mode-btn {
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 0.75rem;
          font-weight: 700;
          padding: 6px 12px;
          border-radius: 7px;
          display: flex;
          align-items: center;
          gap: 5px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .active-oficina {
          background: rgba(16, 185, 129, 0.2);
          color: #10b981;
        }
        .active-campo {
          background: rgba(245, 158, 11, 0.2);
          color: #f59e0b;
        }
        .btn-logout {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #f87171;
          padding: 8px 14px;
          border-radius: 10px;
          font-size: 0.8rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn-logout:hover {
          background: rgba(239, 68, 68, 0.25);
        }

        /* Subtabs */
        .colab-subtabs {
          display: flex;
          gap: 10px;
          background: rgba(255, 255, 255, 0.03);
          padding: 6px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          overflow-x: auto;
        }
        .colab-subtab-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px;
          border-radius: 10px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-muted);
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .colab-subtab-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.05);
        }
        .colab-subtab-btn.active {
          background: rgba(59, 130, 246, 0.18);
          border-color: rgba(59, 130, 246, 0.4);
          color: #60a5fa;
        }

        /* Toast Feedback */
        .toast-feedback {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 18px;
          border-radius: 10px;
          font-size: 0.88rem;
          font-weight: 700;
        }
        .toast-feedback.success {
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.4);
          color: #34d399;
        }
        .toast-feedback.error {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #f87171;
        }

        /* Tab Credencial Grid */
        .tab-credencial-grid {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 20px;
        }
        @media (max-width: 820px) {
          .tab-credencial-grid {
            grid-template-columns: 1fr;
          }
        }
        .digital-credential-card {
          padding: 24px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 14px;
          background: linear-gradient(180deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.95) 100%);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .cred-brand {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.5px;
          color: #94a3b8;
        }
        .cred-photo-container {
          margin: 8px 0;
        }
        .cred-photo {
          width: 105px;
          height: 105px;
          border-radius: 50%;
          border: 3px solid #3b82f6;
          overflow: hidden;
          position: relative;
          background: #1e293b;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);
        }
        .cred-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .photo-check {
          position: absolute;
          bottom: 4px;
          right: 4px;
          background: #10b981;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #0f172a;
        }
        .cred-name {
          font-size: 1.15rem;
          font-weight: 800;
          color: #ffffff;
          margin: 0;
        }
        .cred-role-pill {
          display: inline-block;
          background: rgba(220, 38, 38, 0.15);
          color: #f87171;
          border: 1px solid rgba(220, 38, 38, 0.3);
          padding: 3px 12px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 800;
          margin-top: 4px;
        }
        .cred-area-text {
          font-size: 0.8rem;
          color: var(--text-muted);
          font-weight: 600;
          margin-top: 4px;
        }
        .cred-id-code {
          font-size: 0.76rem;
          color: #64748b;
          font-weight: 700;
        }
        .cred-footer {
          margin-top: auto;
          padding-top: 14px;
          border-top: 1px dashed rgba(255, 255, 255, 0.1);
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .cred-live-clock {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-family: var(--font-mono, monospace);
          font-size: 1.25rem;
          font-weight: 800;
          color: #60a5fa;
        }
        .cred-date-str {
          font-size: 0.72rem;
          color: var(--text-muted);
          text-transform: capitalize;
        }

        /* Punch Controls Card */
        .punch-controls-card {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .card-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.82rem;
          font-weight: 800;
          color: #cbd5e1;
          letter-spacing: 0.5px;
        }
        .today-summary-box {
          display: grid;
          grid-template-columns: 1fr auto 1fr auto 1fr;
          align-items: center;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 16px 12px;
        }
        .summary-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
        }
        .summary-lbl {
          font-size: 0.72rem;
          font-weight: 800;
          color: var(--text-muted);
          letter-spacing: 0.5px;
        }
        .summary-val {
          font-size: 1.25rem;
          font-weight: 900;
        }
        .val-green { color: #34d399; }
        .val-amber { color: #fbbf24; }
        .val-blue { color: #60a5fa; }
        .val-pending { color: #64748b; font-size: 1rem; font-weight: 700; }
        .summary-sub {
          font-size: 0.7rem;
          color: var(--text-muted);
        }
        .summary-divider {
          width: 1px;
          height: 36px;
          background: rgba(255, 255, 255, 0.1);
        }

        /* Big Action Button */
        .big-action-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .big-action-btn {
          border: none;
          padding: 20px 24px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          cursor: pointer;
          transition: all 0.25s ease;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
        }
        .big-action-btn:hover {
          transform: translateY(-2px);
          filter: brightness(1.1);
        }
        .btn-entrada {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: #ffffff;
        }
        .btn-salida {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: #ffffff;
        }
        .action-btn-texts {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
        }
        .action-main-lbl {
          font-size: 1.15rem;
          font-weight: 900;
          letter-spacing: 0.5px;
        }
        .action-sub-lbl {
          font-size: 0.78rem;
          opacity: 0.9;
        }
        .punch-dual-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .sub-action-btn {
          border: 1px solid rgba(245, 158, 11, 0.4);
          background: rgba(245, 158, 11, 0.12);
          color: #fbbf24;
          padding: 12px 18px;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .sub-action-btn:hover {
          background: rgba(245, 158, 11, 0.25);
        }
        .jornada-completada-card {
          display: flex;
          align-items: center;
          gap: 14px;
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 14px;
          padding: 18px 20px;
        }
        .jornada-texts {
          display: flex;
          flex-direction: column;
        }
        .jornada-texts strong {
          color: #34d399;
          font-size: 1rem;
        }
        .jornada-texts span {
          color: var(--text-muted);
          font-size: 0.82rem;
        }
        .geo-status-box {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.76rem;
          color: var(--text-muted);
          background: rgba(255, 255, 255, 0.02);
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        /* Stats Subtab */
        .tab-stats-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .stats-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }
        .stat-kpi-box {
          padding: 18px;
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .stat-kpi-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .stat-kpi-icon.blue { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
        .stat-kpi-icon.green { background: rgba(16, 185, 129, 0.15); color: #34d399; }
        .stat-kpi-icon.yellow { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
        .stat-kpi-icon.red { background: rgba(239, 68, 68, 0.15); color: #f87171; }
        .stat-kpi-content {
          display: flex;
          flex-direction: column;
        }
        .stat-kpi-lbl {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 600;
        }
        .stat-kpi-num {
          font-size: 1.35rem;
          font-weight: 800;
          color: #ffffff;
        }

        .achievements-section {
          padding: 22px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .achievements-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 14px;
        }
        .achievement-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
        }
        .achievement-medal {
          width: 46px;
          height: 46px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }
        .achievement-info strong {
          color: #ffffff;
          font-size: 0.92rem;
        }
        .achievement-info p {
          color: var(--text-muted);
          font-size: 0.78rem;
          margin: 3px 0 0;
          line-height: 1.4;
        }

        /* Historial Subtab */
        .tab-historial-container {
          padding: 22px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .historial-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .btn-refresh-historial {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #cbd5e1;
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 0.78rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-refresh-historial:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
        }
        .user-historial-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
        }
        .user-historial-table th {
          text-align: left;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-muted);
          font-weight: 700;
          font-size: 0.75rem;
          text-transform: uppercase;
        }
        .user-historial-table td {
          padding: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          color: #cbd5e1;
        }
        .fecha-td { font-weight: 700; color: #ffffff; }
        .hora-td { font-family: monospace; font-weight: 700; }
        .hist-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.72rem;
          font-weight: 800;
        }
        .hist-entrada {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .hist-salida {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .hist-almuerzo {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .hist-loc-td {
          font-size: 0.76rem;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
