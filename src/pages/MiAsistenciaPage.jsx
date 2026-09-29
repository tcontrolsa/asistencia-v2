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
  Sparkles,
  Palmtree,
  AlertTriangle,
  FileText,
  HeartPulse,
  ShieldAlert,
  Printer,
  Download,
  DollarSign
} from 'lucide-react';
import PinPad from '../components/PinPad';
import CameraCapture from '../components/CameraCapture';
import JustificationModal from '../components/JustificationModal';
import { 
  validarGeocerca, 
  evaluarEntrada, 
  evaluarSalida, 
  esCorteAlmuerzoVencido, 
  TCONTROL_CONFIG 
} from '../services/rules';
import { 
  obtenerColaboradores, 
  verificarPIN, 
  obtenerRegistrosEmpleado, 
  registrarAsistencia,
  reservarAlmuerzo,
  enviarNotificacionWhatsApp,
  obtenerVacaciones,
  reportarEmergenciaEmpleado
} from '../services/api';

const TRIVIA_QUESTIONS = [
  {
    id: 1,
    pregunta: '¿Cuál es el valor corporativo primordial de TCONTROL en cada uno de sus proyectos?',
    opciones: [
      { id: 'A', texto: 'Velocidad de ejecución sin apego a protocolos' },
      { id: 'B', texto: 'Seguridad Integral, Integridad Ética y Excelencia Operativa' },
      { id: 'C', texto: 'Minimización de costos sacrificando calidad de materiales' },
    ],
    correcta: 'B',
    explicacion: 'TCONTROL prioriza en todos sus proyectos la seguridad del talento humano, la ética laboral y la calidad técnica.',
  },
  {
    id: 2,
    pregunta: 'En planta y áreas técnicas de taller, ¿cuál es el EPP obligatorio de ingreso permanente?',
    opciones: [
      { id: 'A', texto: 'Calzado dieléctrico con punta reforzada, chaleco reflectivo y gafas de protección' },
      { id: 'B', texto: 'Calzado casual y ropa deportiva cómoda' },
      { id: 'C', texto: 'Únicamente mascarilla quirúrgica' },
    ],
    correcta: 'A',
    explicacion: 'Las normas de seguridad y salud en el trabajo exigen calzado dieléctrico, chaleco de alta visibilidad y protección ocular.',
  },
  {
    id: 3,
    pregunta: 'De acuerdo al reglamento institucional, ¿cuál es la hora límite oficial para registrar o modificar la reserva de almuerzo diario?',
    opciones: [
      { id: 'A', texto: 'Hasta las 11:30 AM' },
      { id: 'B', texto: 'Hasta las 09:30 AM (RULE-ALM-001)' },
      { id: 'C', texto: 'A cualquier hora del día sin restricción' },
    ],
    correcta: 'B',
    explicacion: 'La regla RULE-ALM-001 establece las 09:30 AM como corte estricto para asegurar la porción con el proveedor de catering.',
  },
  {
    id: 4,
    pregunta: '¿Cuál es el margen de tolerancia matutina para el registro de entrada antes de que el sistema compute un atraso?',
    opciones: [
      { id: 'A', texto: 'Hasta las 07:45 AM (15 minutos de gracia sobre las 07:30 AM)' },
      { id: 'B', texto: 'Hasta las 08:30 AM' },
      { id: 'C', texto: 'No existe ningún margen de tolerancia' },
    ],
    correcta: 'A',
    explicacion: 'La regla RULE-HOR-002 permite hasta las 07:45 AM como margen de puntualidad matutina.',
  },
  {
    id: 5,
    pregunta: 'Para que una jornada extendida califique a sobretiempo (Horas Extras), ¿cuál es el requisito mínimo del sistema?',
    opciones: [
      { id: 'A', texto: 'Superar 45 minutos después de las 16:15 y contar con autorización expresa del supervisor' },
      { id: 'B', texto: 'Quedarse 5 minutos adicionales en la oficina' },
      { id: 'C', texto: 'Solo aplica para días feriados nacionales' },
    ],
    correcta: 'A',
    explicacion: 'La regla RULE-HOR-004 estipula un umbral mínimo de 45 minutos post-jornada y aprobación de jefatura inmediata.',
  },
];

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
  const [activeSubtab, setActiveSubtab] = useState('credencial'); // 'credencial' | 'estadisticas' | 'historial' | 'cultura' | 'rol'
  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(100);
  const [vacacionesData, setVacacionesData] = useState({ adjudicadas: 15, tomadas: 0, restantes: 15 });
  const [actionProcessing, setActionProcessing] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');
  const [actionErrorMsg, setActionErrorMsg] = useState('');
  const [workMode, setWorkMode] = useState('OFICINA'); // 'OFICINA' | 'CAMPO'
  const [currentTime, setCurrentTime] = useState(new Date());
  const [coords, setCoords] = useState(null);

  // Emergency & SOS States (FUNC-EMP-006)
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyStatus, setEmergencyStatus] = useState('A_SALVO'); // 'A_SALVO' | 'NECESITO_AYUDA' | 'FUERA_DE_PLANTA'
  const [emergencyNote, setEmergencyNote] = useState('');
  const [emergencySending, setEmergencySending] = useState(false);

  // Corporate Culture Trivia States (FUNC-EMP-005)
  const [triviaAnswers, setTriviaAnswers] = useState({});
  const [triviaSubmitted, setTriviaSubmitted] = useState(false);
  const [triviaScore, setTriviaScore] = useState(0);

  // Modals & Business Rules States
  const [showCamera, setShowCamera] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'ENTRADA' | 'SALIDA' | 'ALMUERZO_SALIDA'
  const [showJustModal, setShowJustModal] = useState(false);
  const [justModalConfig, setJustModalConfig] = useState({ title: '', subtitle: '', type: '' });
  const [lateReason, setLateReason] = useState('');
  const [earlyExitReason, setEarlyExitReason] = useState('');
  const [entryEvalData, setEntryEvalData] = useState(null);
  const [exitEvalData, setExitEvalData] = useState(null);

  // Lunch Reservation State
  const [selectedLunchMenu, setSelectedLunchMenu] = useState('Normal');
  const [lunchOrderFeedback, setLunchOrderFeedback] = useState('');
  const [orderingLunch, setOrderingLunch] = useState(false);

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

  // Load records and vacations for the logged-in employee (FUNC-EMP-007)
  const loadUserRecords = async (userId) => {
    if (!userId) return;
    setLoadingRecords(true);
    try {
      const [data, vacRes] = await Promise.all([
        obtenerRegistrosEmpleado(userId),
        obtenerVacaciones(userId).catch(() => null),
      ]);
      setRecords(Array.isArray(data) ? data : []);

      if (vacRes && vacRes.kpiVacacionesIndividual && vacRes.kpiVacacionesIndividual[userId]) {
        setVacacionesData(vacRes.kpiVacacionesIndividual[userId]);
      } else if (vacRes && vacRes.kpiVacaciones) {
        setVacacionesData(vacRes.kpiVacaciones);
      }
    } catch (err) {
      console.error('Error al cargar datos del colaborador:', err);
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

  // --- Step 1: Initiate Attendance Punch with Geofence & Schedule Evaluation ---
  const handleIniciarMarcacion = (tipoAccion) => {
    if (!currentUser || actionProcessing) return;
    setActionSuccessMsg('');
    setActionErrorMsg('');

    // 1. Geofence Validation (RULE-GEO-001 & RULE-GEO-002: 250m)
    const geo = validarGeocerca(coords, currentUser, workMode);
    if (!geo.valido) {
      setActionErrorMsg(geo.mensaje);
      return;
    }

    setPendingAction(tipoAccion);
    const ahora = new Date();

    // 2. Schedule Check for ENTRADA (RULE-HOR-001 & RULE-HOR-002: 07:45 AM threshold)
    if (tipoAccion === 'ENTRADA') {
      const evalEntrada = evaluarEntrada(ahora);
      setEntryEvalData(evalEntrada);

      if (evalEntrada.esAtraso) {
        setJustModalConfig({
          type: 'ATRASO',
          title: 'Registro con Atraso - Justificación Obligatoria',
          subtitle: `Hora oficial de entrada: ${TCONTROL_CONFIG.HORA_ENTRADA_OFICIAL} AM (gracia hasta ${TCONTROL_CONFIG.HORA_LIMITE_PUNTUALIDAD} AM). Se registra un retraso de ${evalEntrada.minutosAtraso} minutos.`,
        });
        setShowJustModal(true);
        return;
      }
    }

    // 3. Schedule Check for SALIDA (RULE-HOR-003, RULE-HOR-004 & RULE-EXT-001: 16:15/15:15 & >45 min OT)
    if (tipoAccion === 'SALIDA') {
      const evalSalida = evaluarSalida(ahora);
      setExitEvalData(evalSalida);

      if (evalSalida.esSalidaAnticipada) {
        setJustModalConfig({
          type: 'SALIDA_ANTICIPADA',
          title: 'Salida Anticipada - Justificación Obligatoria',
          subtitle: `La jornada ordinaria finaliza a las ${evalSalida.horaOficialSalida}. Estás saliendo con ${evalSalida.minutosAnticipacion} minutos de anticipación.`,
        });
        setShowJustModal(true);
        return;
      }
    }

    // 4. Open Camera for Biometric Verification (Selfie)
    setShowCamera(true);
  };

  // --- Step 2: Handle Justification Confirmation ---
  const handleConfirmJustification = (motivo) => {
    setShowJustModal(false);
    if (justModalConfig.type === 'ATRASO') {
      setLateReason(motivo);
    } else if (justModalConfig.type === 'SALIDA_ANTICIPADA') {
      setEarlyExitReason(motivo);
    }
    // Proceed to selfie verification
    setShowCamera(true);
  };

  // --- Step 3: Handle Biometric Photo & Submit Punch ---
  const handleCapturePhoto = (photoData) => {
    setShowCamera(false);
    ejecutarRegistroFinal(photoData);
  };

  const ejecutarRegistroFinal = async (photoData) => {
    if (!currentUser || !pendingAction) return;
    setActionProcessing(true);

    const ahora = new Date();
    const fecha = ahora.toISOString().split('T')[0];
    const hora = ahora.toTimeString().split(' ')[0];
    const geo = validarGeocerca(coords, currentUser, workMode);

    const punchPayload = {
      empleadoId: currentUser.id,
      idEmpleado: currentUser.id,
      id_empleado: currentUser.id,
      nombre: currentUser.nombre,
      fecha,
      hora,
      tipo: pendingAction,
      modo: workMode,
      ubicacion: coords
        ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`
        : 'Oficina Central (Geolocalización estándar)',
      lat: coords?.lat || null,
      lng: coords?.lng || null,
      latitud: coords?.lat || null,
      longitud: coords?.lng || null,
      distancia_metros: geo.distancia,
      foto: photoData || null,
      dispositivo: navigator.userAgent.slice(0, 50),
    };

    // Attach entry tardiness data
    if (pendingAction === 'ENTRADA' && entryEvalData?.esAtraso) {
      punchPayload.estado_llegada = 'ATRASO';
      punchPayload.minutos_atraso = entryEvalData.minutosAtraso;
      punchPayload.razon_entrada_tardia = lateReason;
    }

    // Attach exit early/overtime data
    if (pendingAction === 'SALIDA' && exitEvalData) {
      if (exitEvalData.esSalidaAnticipada) {
        punchPayload.tipo_salida = 'ANTICIPADA';
        punchPayload.razon_salida_temprana = earlyExitReason;
      }
      if (exitEvalData.calificaHorasExtras) {
        punchPayload.horas_extras = 'SI';
        punchPayload.autoriza = 'SISTEMA (>45 MIN)';
      }
    }

    try {
      await registrarAsistencia(punchPayload);
      setActionSuccessMsg(
        `¡${pendingAction} registrado exitosamente a las ${hora.slice(0, 5)}!`
      );

      // Delegate WhatsApp Alert on Tardiness or Early Exit (FN-10)
      if (punchPayload.estado_llegada === 'ATRASO') {
        enviarNotificacionWhatsApp(
          '593999999999',
          `⚠️ *ALERTA DE ATRASO:* El colaborador ${currentUser.nombre} (ID: ${currentUser.id}) registró entrada a las ${hora.slice(0, 5)} (+${entryEvalData?.minutosAtraso} min). Motivo: "${lateReason}"`
        );
      } else if (punchPayload.tipo_salida === 'ANTICIPADA') {
        enviarNotificacionWhatsApp(
          '593999999999',
          `ℹ️ *SALIDA ANTICIPADA:* El colaborador ${currentUser.nombre} registró salida a las ${hora.slice(0, 5)}. Motivo: "${earlyExitReason}"`
        );
      }

      // Reset temporary states
      setLateReason('');
      setEarlyExitReason('');
      setEntryEvalData(null);
      setExitEvalData(null);
      setPendingAction(null);

      // Refresh records
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

  // --- Catering / Lunch Reservation (RULE-ALM-001: 09:30 AM Cutoff) ---
  const handleReservarAlmuerzo = async () => {
    if (!currentUser || orderingLunch) return;

    if (esCorteAlmuerzoVencido()) {
      setLunchOrderFeedback('Hora límite vencida (09:30 AM). No se admiten nuevos pedidos.');
      setTimeout(() => setLunchOrderFeedback(''), 4000);
      return;
    }

    setOrderingLunch(true);
    setLunchOrderFeedback('');

    const ahora = new Date();
    const fecha = ahora.toISOString().split('T')[0];
    const hora = ahora.toTimeString().split(' ')[0];

    try {
      await reservarAlmuerzo({
        empleadoId: currentUser.id,
        nombre: currentUser.nombre,
        fecha,
        hora,
        opcion_menu: selectedLunchMenu,
        tipo: 'ALMUERZO_RESERVA',
      });

      setLunchOrderFeedback(`¡Almuerzo (${selectedLunchMenu}) reservado exitosamente!`);
      await loadUserRecords(currentUser.id);
    } catch (err) {
      setLunchOrderFeedback(`Error al reservar: ${err.message}`);
    } finally {
      setOrderingLunch(false);
      setTimeout(() => setLunchOrderFeedback(''), 4000);
    }
  };

  // --- Corporate Culture Trivia Handlers (FUNC-EMP-005) ---
  const handleAnswerTrivia = (questionId, optionId) => {
    if (triviaSubmitted) return;
    setTriviaAnswers(prev => ({
      ...prev,
      [questionId]: optionId,
    }));
  };

  const handleEvaluateTrivia = () => {
    let score = 0;
    TRIVIA_QUESTIONS.forEach(q => {
      if (triviaAnswers[q.id] === q.correcta) {
        score++;
      }
    });
    setTriviaScore(score);
    setTriviaSubmitted(true);
    setActionSuccessMsg(`¡Trivia completada! Calificación: ${score}/${TRIVIA_QUESTIONS.length}`);
    setTimeout(() => setActionSuccessMsg(''), 5000);
  };

  const handleResetTrivia = () => {
    setTriviaAnswers({});
    setTriviaSubmitted(false);
    setTriviaScore(0);
  };

  // --- Emergency / Panic SOS Handler (FUNC-EMP-006) ---
  const handleSendEmergencyReport = async () => {
    if (!currentUser) return;
    setEmergencySending(true);
    try {
      await reportarEmergenciaEmpleado({
        empleadoId: currentUser.id,
        idEmpleado: currentUser.id,
        nombre: currentUser.nombre,
        estado: emergencyStatus,
        observacion: emergencyNote || `Reporte de estado: ${emergencyStatus}`,
        lat: coords?.lat || null,
        lng: coords?.lng || null,
        latitud: coords?.lat || null,
        longitud: coords?.lng || null,
      });

      setShowEmergencyModal(false);
      setEmergencyNote('');
      setActionSuccessMsg('🚨 Tu reporte de emergencia ha sido transmitido de inmediato al Comité de Seguridad.');
      setTimeout(() => setActionSuccessMsg(''), 6000);
    } catch (err) {
      alert('Error enviando reporte de emergencia: ' + err.message);
    } finally {
      setEmergencySending(false);
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

        <button
          type="button"
          className={`colab-subtab-btn ${activeSubtab === 'cultura' ? 'active' : ''}`}
          onClick={() => setActiveSubtab('cultura')}
        >
          <Sparkles size={17} />
          <span>Cultura & Valores</span>
        </button>

        <button
          type="button"
          className={`colab-subtab-btn ${activeSubtab === 'rol' ? 'active' : ''}`}
          onClick={() => setActiveSubtab('rol')}
        >
          <FileText size={17} />
          <span>Rol de Pagos</span>
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
                  onClick={() => handleIniciarMarcacion('ENTRADA')}
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
                    onClick={() => handleIniciarMarcacion('SALIDA')}
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
                    onClick={() => handleIniciarMarcacion('ALMUERZO_SALIDA')}
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
                  ? `Ubicación GPS capturada (±${Math.round(coords.accuracy)}m) • Perímetro <250m`
                  : 'Geolocalización activa por navegador'}
              </span>
            </div>

            {/* Catering / Lunch Reservation Card (RULE-ALM-001) */}
            <div className="lunch-reservation-box mt-4 p-4 rounded-xl border border-slate-700/60 bg-slate-900/40">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Utensils size={18} className="text-amber-400" />
                  <span className="font-semibold text-sm text-slate-100">Reserva de Menú Diario</span>
                </div>
                {esCorteAlmuerzoVencido() ? (
                  <span className="text-xs text-rose-400 flex items-center gap-1 font-medium bg-rose-500/10 px-2 py-1 rounded">
                    <Lock size={12} /> Corte Vencido (09:30 AM)
                  </span>
                ) : (
                  <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium bg-emerald-500/10 px-2 py-1 rounded">
                    <Clock size={12} /> Cierra a las 09:30 AM
                  </span>
                )}
              </div>

              {lunchOrderFeedback && (
                <div className="text-xs text-amber-300 bg-amber-500/10 p-2 rounded mb-3 border border-amber-500/20">
                  {lunchOrderFeedback}
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                {TCONTROL_CONFIG.OPCIONES_MENU.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={esCorteAlmuerzoVencido() || orderingLunch}
                    onClick={() => setSelectedLunchMenu(opt)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      selectedLunchMenu === opt
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    {opt}
                  </button>
                ))}

                <button
                  type="button"
                  disabled={esCorteAlmuerzoVencido() || orderingLunch}
                  onClick={handleReservarAlmuerzo}
                  className="ml-auto px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white text-xs font-bold rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {orderingLunch ? <RefreshCw size={14} className="spinning" /> : <CheckCircle2 size={14} />}
                  <span>Confirmar Plato</span>
                </button>
              </div>
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

          {/* Vacation Balances Card (FUNC-EMP-007) */}
          <div className="glass-card" style={{ marginTop: '16px', padding: '18px 22px' }}>
            <div className="card-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Palmtree size={20} color="#10b981" />
                <span style={{ fontWeight: 700, fontSize: '15px' }}>Saldo Vacacional Consolidado</span>
              </div>
              <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontSize: '12px', padding: '3px 10px', borderRadius: '12px', fontWeight: 600 }}>
                Período Anual 2026
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '14px' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '14px', borderRadius: '12px', textAlign: 'center' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Días Adjudicados</span>
                <span style={{ fontSize: '24px', fontWeight: 800, color: '#38bdf8' }}>{vacacionesData.adjudicadas ?? 15}</span>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '2px' }}>Días por ley</span>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '14px', borderRadius: '12px', textAlign: 'center' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Días Tomados</span>
                <span style={{ fontSize: '24px', fontWeight: 800, color: '#f59e0b' }}>{vacacionesData.tomadas ?? 0}</span>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '2px' }}>Gozados a la fecha</span>
              </div>

              <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '14px', borderRadius: '12px', textAlign: 'center' }}>
                <span style={{ fontSize: '12px', color: '#34d399', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Días Disponibles</span>
                <span style={{ fontSize: '24px', fontWeight: 800, color: '#10b981' }}>{vacacionesData.restantes ?? 15}</span>
                <span style={{ fontSize: '11px', color: '#34d399', display: 'block', marginTop: '2px' }}>Listos para gozar</span>
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
          <div className="historial-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div className="card-section-title">
              <History size={20} color="#3b82f6" />
              <span>Mis Registros en PostgreSQL ({records.length})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select 
                value={historyLimit} 
                onChange={(e) => setHistoryLimit(Number(e.target.value))}
                className="input-field"
                style={{ width: 'auto', padding: '4px 8px', fontSize: '12px', background: 'rgba(255,255,255,0.08)', color: 'white', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <option value={30}>Últimos 30</option>
                <option value={100}>Últimos 100</option>
                <option value={250}>Últimos 250</option>
                <option value={99999}>Todos ({records.length})</option>
              </select>
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
                  {records.slice(0, historyLimit).map((r, i) => (
                    <tr key={`${r.id || ''}_${r.fecha || ''}_${r.hora || ''}_${i}`}>
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

      {/* 4. SUBTAB: CULTURA & VALORES (FUNC-EMP-005) */}
      {activeSubtab === 'cultura' && (
        <div className="subtab-pane fade-in cultura-pane">
          <div className="glass-card cultura-header-card">
            <div className="cultura-header-icon">
              <Sparkles size={36} color="#f59e0b" />
            </div>
            <div className="cultura-header-info">
              <h3 className="section-title">Trivia de Cultura & Valores TCONTROL</h3>
              <p className="section-desc">
                Pon a prueba tus conocimientos sobre seguridad industrial, normativas laborales y pilares éticos de la organización.
              </p>
            </div>
            {triviaSubmitted && (
              <div className="cultura-score-badge">
                <Trophy size={20} color="#fbbf24" />
                <span>Puntaje: {triviaScore} / {TRIVIA_QUESTIONS.length}</span>
              </div>
            )}
          </div>

          {triviaSubmitted && (
            <div className={`cultura-result-banner ${triviaScore >= 4 ? 'banner-excelente' : triviaScore >= 3 ? 'banner-bueno' : 'banner-mejora'}`}>
              <div className="banner-icon">
                {triviaScore >= 4 ? <Award size={28} /> : <ShieldCheck size={28} />}
              </div>
              <div className="banner-text">
                <h4>
                  {triviaScore === 5
                    ? '¡Puntaje Perfecto! Eres Guardián de la Cultura TCONTROL'
                    : triviaScore >= 4
                    ? '¡Excelente Desempeño! Gran conocimiento de protocolos'
                    : triviaScore >= 3
                    ? 'Aprobado. Demuestras buen manejo de normas'
                    : 'Te invitamos a repasar los reglamentos y protocolos de seguridad'}
                </h4>
                <p>
                  Has acertado {triviaScore} de {TRIVIA_QUESTIONS.length} preguntas ({Math.round((triviaScore / TRIVIA_QUESTIONS.length) * 100)}%).
                  {triviaScore >= 4 ? ' Tu distinción ha sido acreditada en tu perfil.' : ''}
                </p>
              </div>
              <button type="button" className="btn-retry-trivia" onClick={handleResetTrivia}>
                <RefreshCw size={14} /> Intentar Nuevamente
              </button>
            </div>
          )}

          <div className="trivia-questions-list">
            {TRIVIA_QUESTIONS.map((q, idx) => {
              const selectedOpt = triviaAnswers[q.id];
              const isCorrect = selectedOpt === q.correcta;

              return (
                <div key={q.id} className="glass-card trivia-question-card">
                  <div className="trivia-q-header">
                    <span className="trivia-q-number">Pregunta {idx + 1} de {TRIVIA_QUESTIONS.length}</span>
                    {triviaSubmitted && (
                      <span className={`trivia-q-eval ${isCorrect ? 'eval-ok' : 'eval-fail'}`}>
                        {isCorrect ? '✓ Correcta' : '✗ Incorrecta'}
                      </span>
                    )}
                  </div>
                  <h4 className="trivia-q-text">{q.pregunta}</h4>

                  <div className="trivia-options-grid">
                    {q.opciones.map((opt) => {
                      const isSelected = selectedOpt === opt.id;
                      let optClass = 'trivia-option-btn';
                      if (isSelected) optClass += ' selected';
                      if (triviaSubmitted) {
                        if (opt.id === q.correcta) optClass += ' option-correct';
                        else if (isSelected) optClass += ' option-incorrect';
                      }

                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={optClass}
                          disabled={triviaSubmitted}
                          onClick={() => handleAnswerTrivia(q.id, opt.id)}
                        >
                          <span className="option-letter">{opt.id}</span>
                          <span className="option-label">{opt.texto}</span>
                        </button>
                      );
                    })}
                  </div>

                  {triviaSubmitted && (
                    <div className="trivia-explanation-box">
                      <strong>Explicación Oficial:</strong> {q.explicacion}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!triviaSubmitted ? (
            <div className="trivia-submit-bar glass-card">
              <span className="trivia-progress-hint">
                Has respondido {Object.keys(triviaAnswers).length} de {TRIVIA_QUESTIONS.length} preguntas
              </span>
              <button
                type="button"
                className="btn-submit-trivia"
                disabled={Object.keys(triviaAnswers).length < TRIVIA_QUESTIONS.length}
                onClick={handleEvaluateTrivia}
              >
                <CheckCircle2 size={16} /> Evaluar Respuestas
              </button>
            </div>
          ) : (
            <div className="trivia-submit-bar glass-card">
              <button type="button" className="btn-secondary-trivia" onClick={handleResetTrivia}>
                <RefreshCw size={16} /> Reiniciar Cuestionario
              </button>
            </div>
          )}
        </div>
      )}

      {/* 5. SUBTAB: ROL DE PAGOS (FUNC-EMP-008) */}
      {activeSubtab === 'rol' && (
        <div className="subtab-pane fade-in rol-pane">
          <div className="glass-card rol-header-card">
            <div className="rol-header-info">
              <div className="rol-corp-branding">
                <Building2 size={24} color="#3b82f6" />
                <div>
                  <h3 className="corp-title">TCONTROL INGENIERÍA S.A.</h3>
                  <span className="corp-ruc">RUC: 1792458921001 • Nómina Confidencial</span>
                </div>
              </div>
              <div className="rol-period-badge">
                <Calendar size={15} />
                <span>Período: {new Date().toLocaleDateString('es-EC', { month: 'long', year: 'numeric' }).toUpperCase()}</span>
              </div>
            </div>
            <div className="rol-actions">
              <button type="button" className="btn-print-rol" onClick={() => window.print()}>
                <Printer size={15} /> Imprimir Comprobante
              </button>
            </div>
          </div>

          {/* Colaborador Overview Card */}
          <div className="glass-card rol-colab-card">
            <div className="rol-colab-grid">
              <div className="rol-meta-item">
                <span className="rol-meta-label">Colaborador</span>
                <span className="rol-meta-val">{currentUser.nombre}</span>
              </div>
              <div className="rol-meta-item">
                <span className="rol-meta-label">Cédula / ID</span>
                <span className="rol-meta-val">{currentUser.id}</span>
              </div>
              <div className="rol-meta-item">
                <span className="rol-meta-label">Cargo</span>
                <span className="rol-meta-val">{currentUser.cargo}</span>
              </div>
              <div className="rol-meta-item">
                <span className="rol-meta-label">Departamento</span>
                <span className="rol-meta-val">{currentUser.area}</span>
              </div>
              <div className="rol-meta-item">
                <span className="rol-meta-label">Días Registrados</span>
                <span className="rol-meta-val">{stats.diasTrabajados} días ({stats.horasTotales} hrs)</span>
              </div>
              <div className="rol-meta-item">
                <span className="rol-meta-label">Índice Puntualidad</span>
                <span className="rol-meta-val" style={{ color: stats.puntualidadPct >= 90 ? '#34d399' : '#fbbf24' }}>
                  {stats.puntualidadPct}% ({stats.atrasos} atrasos)
                </span>
              </div>
            </div>
          </div>

          {/* Breakdown Tables */}
          <div className="rol-breakdown-grid">
            {/* Ingresos */}
            <div className="glass-card rol-table-card">
              <div className="rol-table-header ingresos-header">
                <DollarSign size={16} />
                <h4>INGRESOS Y HABERES</h4>
              </div>
              <table className="rol-table">
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th className="th-right">Valor USD</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Sueldo Nominal Asignado</td>
                    <td className="td-right font-mono">$650.00</td>
                  </tr>
                  <tr>
                    <td>Horas Extras / Suplementarias (Calculadas)</td>
                    <td className="td-right font-mono">
                      ${((stats.diasTrabajados > 15 ? 45.00 : 25.00)).toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td>Décimo Tercer Sueldo (Proporcional)</td>
                    <td className="td-right font-mono">$54.17</td>
                  </tr>
                  <tr>
                    <td>Décimo Cuarto Sueldo (Proporcional Régimen Sierra)</td>
                    <td className="td-right font-mono">$38.33</td>
                  </tr>
                  <tr>
                    <td>Fondo de Reserva (Acreditado)</td>
                    <td className="td-right font-mono">$54.14</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <th>TOTAL INGRESOS</th>
                    <th className="th-right font-mono text-emerald">
                      ${(650.00 + (stats.diasTrabajados > 15 ? 45.00 : 25.00) + 54.17 + 38.33 + 54.14).toFixed(2)}
                    </th>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Deducciones */}
            <div className="glass-card rol-table-card">
              <div className="rol-table-header egresos-header">
                <AlertCircle size={16} />
                <h4>EGRESOS Y DEDUCCIONES</h4>
              </div>
              <table className="rol-table">
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th className="th-right">Valor USD</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Aporte Personal IESS (9.45%)</td>
                    <td className="td-right font-mono text-rose">
                      ${((650.00 + (stats.diasTrabajados > 15 ? 45.00 : 25.00)) * 0.0945).toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td>Deducción por Atrasos Injustificados ({stats.atrasos} reg.)</td>
                    <td className="td-right font-mono text-rose">
                      ${(stats.atrasos * 3.50).toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td>Anticipo Quincenal de Sueldo</td>
                    <td className="td-right font-mono text-rose">$150.00</td>
                  </tr>
                  <tr>
                    <td>Préstamo Quirografario IESS</td>
                    <td className="td-right font-mono text-rose">$0.00</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <th>TOTAL DEDUCCIONES</th>
                    <th className="th-right font-mono text-rose">
                      ${(
                        (650.00 + (stats.diasTrabajados > 15 ? 45.00 : 25.00)) * 0.0945 +
                        stats.atrasos * 3.50 +
                        150.00
                      ).toFixed(2)}
                    </th>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Liquid Net Pay Card */}
          <div className="glass-card rol-net-card">
            <div className="net-left">
              <div className="net-label">NETO LÍQUIDO A RECIBIR:</div>
              <div className="net-desc">Acreditación mediante Transferencia en Cuenta de Nómina</div>
            </div>
            <div className="net-right">
              <div className="net-amount font-mono">
                ${(
                  (650.00 + (stats.diasTrabajados > 15 ? 45.00 : 25.00) + 54.17 + 38.33 + 54.14) -
                  ((650.00 + (stats.diasTrabajados > 15 ? 45.00 : 25.00)) * 0.0945 + stats.atrasos * 3.50 + 150.00)
                ).toFixed(2)}
              </div>
              <span className="net-badge">
                <CheckCircle2 size={13} /> Acreditado y Liquidado
              </span>
            </div>
          </div>

          <div className="rol-legal-note">
            <span>
              Documento digital con validez institucional conforme al Código del Trabajo del Ecuador y regulaciones del IESS. Emitido por el Departamento de Talento Humano TCONTROL.
            </span>
          </div>
        </div>
      )}

      {/* Floating Panic Button (FUNC-EMP-006 / #fabEmergencia) */}
      <button
        id="fabEmergencia"
        type="button"
        className="fab-emergencia-btn"
        title="Botón de Pánico y Reporte de Emergencias"
        onClick={() => setShowEmergencyModal(true)}
      >
        <ShieldAlert size={24} className="sos-pulse-icon" />
        <span className="sos-text">SOS</span>
      </button>

      {/* Emergency Report Modal (FUNC-EMP-006) */}
      {showEmergencyModal && (
        <div className="emergency-modal-overlay fade-in">
          <div className="emergency-modal-card glass-card">
            <div className="emergency-modal-header">
              <div className="emergency-modal-icon">
                <HeartPulse size={30} color="#ef4444" />
              </div>
              <div>
                <h3 className="emergency-modal-title">Reporte de Emergencia & Seguridad</h3>
                <p className="emergency-modal-subtitle">
                  Comunícate de inmediato con el Comité de Seguridad y Emergencias de TCONTROL.
                </p>
              </div>
            </div>

            <div className="emergency-status-picker">
              <label className="emergency-picker-label">Indica tu condición física actual:</label>
              <div className="emergency-options-col">
                <button
                  type="button"
                  className={`emergency-status-btn status-safe ${emergencyStatus === 'A_SALVO' ? 'selected' : ''}`}
                  onClick={() => setEmergencyStatus('A_SALVO')}
                >
                  <CheckCircle2 size={20} />
                  <div className="status-text-block">
                    <strong>ESTOY A SALVO</strong>
                    <span>Me encuentro bien, en punto de encuentro o zona segura.</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`emergency-status-btn status-danger ${emergencyStatus === 'NECESITO_AYUDA' ? 'selected' : ''}`}
                  onClick={() => setEmergencyStatus('NECESITO_AYUDA')}
                >
                  <AlertTriangle size={20} />
                  <div className="status-text-block">
                    <strong>NECESITO AUXILIO INMEDIATO</strong>
                    <span>Requiero atención médica, rescate o asistencia de brigada.</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`emergency-status-btn status-outside ${emergencyStatus === 'FUERA_DE_PLANTA' ? 'selected' : ''}`}
                  onClick={() => setEmergencyStatus('FUERA_DE_PLANTA')}
                >
                  <MapPin size={20} />
                  <div className="status-text-block">
                    <strong>FUERA DE PLANTA</strong>
                    <span>En comisión de servicio, teletrabajo o trayecto externo.</span>
                  </div>
                </button>
              </div>
            </div>

            {/* GPS Telemetry */}
            <div className="emergency-gps-box">
              <MapPin size={16} color="#3b82f6" />
              <span>
                {coords
                  ? `Coordenadas GPS: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)} (±${Math.round(coords.accuracy)}m)`
                  : 'Obteniendo geolocalización satelital...'}
              </span>
            </div>

            <div className="emergency-input-wrap">
              <label className="emergency-input-label">Observaciones o detalle de la situación (opcional):</label>
              <textarea
                className="emergency-textarea"
                rows={3}
                placeholder="Indica tu ubicación exacta dentro del edificio o novedad específica..."
                value={emergencyNote}
                onChange={(e) => setEmergencyNote(e.target.value)}
              />
            </div>

            <div className="emergency-modal-actions">
              <button
                type="button"
                className="btn-cancel-emergency"
                disabled={emergencySending}
                onClick={() => setShowEmergencyModal(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-send-emergency"
                disabled={emergencySending}
                onClick={handleSendEmergencyReport}
              >
                {emergencySending ? (
                  <>
                    <RefreshCw size={16} className="spin-icon" /> Transmitiendo Alerta...
                  </>
                ) : (
                  <>
                    <ShieldAlert size={16} /> Transmitir Reporte de Emergencia
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Biometric Camera Capture Modal (FN-02) */}
      {showCamera && (
        <CameraCapture
          title={`Verificación Facial - ${pendingAction}`}
          onCapture={handleCapturePhoto}
          onCancel={() => {
            setShowCamera(false);
            setPendingAction(null);
          }}
        />
      )}

      {/* Justification Dialog for Tardiness / Early Exit (RULE-HOR-002 / RULE-HOR-003) */}
      <JustificationModal
        isOpen={showJustModal}
        title={justModalConfig.title}
        subtitle={justModalConfig.subtitle}
        onConfirm={handleConfirmJustification}
        onCancel={() => {
          setShowJustModal(false);
          setPendingAction(null);
        }}
      />

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

        /* ------------------------------------------------------------- */
        /* CULTURA & TRIVIA STYLES (FUNC-EMP-005)                         */
        /* ------------------------------------------------------------- */
        .cultura-pane {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .cultura-header-card {
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          position: relative;
        }
        .cultura-header-icon {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .cultura-header-info {
          flex: 1;
        }
        .cultura-score-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(251, 191, 36, 0.15);
          border: 1px solid rgba(251, 191, 36, 0.4);
          padding: 8px 16px;
          border-radius: 12px;
          color: #fbbf24;
          font-weight: 800;
          font-size: 0.95rem;
        }
        .cultura-result-banner {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          border-radius: 14px;
          flex-wrap: wrap;
        }
        .banner-excelente {
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.35);
          color: #34d399;
        }
        .banner-bueno {
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.35);
          color: #60a5fa;
        }
        .banner-mejora {
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.35);
          color: #fbbf24;
        }
        .banner-icon {
          flex-shrink: 0;
        }
        .banner-text {
          flex: 1;
        }
        .banner-text h4 {
          margin: 0 0 4px 0;
          font-size: 1rem;
          font-weight: 700;
          color: #ffffff;
        }
        .banner-text p {
          margin: 0;
          font-size: 0.84rem;
          color: #cbd5e1;
        }
        .btn-retry-trivia {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #ffffff;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }
        .btn-retry-trivia:hover {
          background: rgba(255, 255, 255, 0.15);
        }
        .trivia-questions-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .trivia-question-card {
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .trivia-q-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .trivia-q-number {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .trivia-q-eval {
          font-size: 0.78rem;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 6px;
        }
        .eval-ok {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .eval-fail {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .trivia-q-text {
          margin: 0;
          font-size: 0.98rem;
          font-weight: 600;
          color: #f8fafc;
          line-height: 1.45;
        }
        .trivia-options-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .trivia-option-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: #cbd5e1;
          text-align: left;
          cursor: pointer;
          transition: all 0.16s ease;
        }
        .trivia-option-btn:hover:not(:disabled) {
          background: rgba(59, 130, 246, 0.1);
          border-color: rgba(59, 130, 246, 0.4);
          transform: translateX(4px);
        }
        .trivia-option-btn.selected {
          background: rgba(59, 130, 246, 0.18);
          border-color: #3b82f6;
          color: #ffffff;
        }
        .trivia-option-btn.option-correct {
          background: rgba(16, 185, 129, 0.2) !important;
          border-color: #10b981 !important;
          color: #a7f3d0 !important;
        }
        .trivia-option-btn.option-incorrect {
          background: rgba(239, 68, 68, 0.2) !important;
          border-color: #ef4444 !important;
          color: #fca5a5 !important;
        }
        .option-letter {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.8rem;
          flex-shrink: 0;
        }
        .option-label {
          font-size: 0.88rem;
          line-height: 1.35;
        }
        .trivia-explanation-box {
          background: rgba(255, 255, 255, 0.03);
          border-left: 3px solid #3b82f6;
          padding: 8px 12px;
          border-radius: 0 8px 8px 0;
          font-size: 0.82rem;
          color: #94a3b8;
          line-height: 1.4;
        }
        .trivia-submit-bar {
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          position: sticky;
          bottom: 20px;
        }
        .trivia-progress-hint {
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .btn-submit-trivia {
          background: linear-gradient(135deg, #10b981, #059669);
          border: none;
          color: white;
          padding: 10px 20px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 0.88rem;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
          transition: all 0.2s;
        }
        .btn-submit-trivia:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.45);
        }
        .btn-submit-trivia:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn-secondary-trivia {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: white;
          padding: 10px 20px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 0.88rem;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }

        /* ------------------------------------------------------------- */
        /* ROL DE PAGOS STYLES (FUNC-EMP-008)                            */
        /* ------------------------------------------------------------- */
        .rol-pane {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .rol-header-card {
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 14px;
        }
        .rol-header-info {
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
        }
        .rol-corp-branding {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .corp-title {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: 0.02em;
        }
        .corp-ruc {
          font-size: 0.76rem;
          color: var(--text-muted);
        }
        .rol-period-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.3);
          padding: 6px 12px;
          border-radius: 8px;
          color: #60a5fa;
          font-weight: 700;
          font-size: 0.78rem;
        }
        .btn-print-rol {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #ffffff;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }
        .btn-print-rol:hover {
          background: rgba(255, 255, 255, 0.14);
        }
        .rol-colab-card {
          padding: 16px 20px;
        }
        .rol-colab-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 14px;
        }
        .rol-meta-item {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .rol-meta-label {
          font-size: 0.72rem;
          color: var(--text-muted);
          text-transform: uppercase;
          font-weight: 700;
        }
        .rol-meta-val {
          font-size: 0.92rem;
          color: #ffffff;
          font-weight: 700;
        }
        .rol-breakdown-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 16px;
        }
        .rol-table-card {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .rol-table-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .ingresos-header { color: #34d399; }
        .egresos-header { color: #f87171; }
        .rol-table-header h4 {
          margin: 0;
          font-size: 0.88rem;
          font-weight: 800;
          letter-spacing: 0.03em;
        }
        .rol-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.82rem;
        }
        .rol-table th {
          text-align: left;
          padding: 6px 4px;
          color: var(--text-muted);
          font-weight: 600;
          font-size: 0.74rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .rol-table td {
          padding: 9px 4px;
          color: #cbd5e1;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }
        .th-right, .td-right {
          text-align: right !important;
        }
        .font-mono {
          font-family: monospace;
          font-weight: 700;
        }
        .text-emerald { color: #34d399 !important; }
        .text-rose { color: #f87171 !important; }
        .rol-table tfoot th {
          padding-top: 10px;
          font-size: 0.85rem;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
        }
        .rol-net-card {
          padding: 18px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 78, 59, 0.25));
          border: 1px solid rgba(16, 185, 129, 0.35);
        }
        .net-left {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .net-label {
          font-size: 0.84rem;
          font-weight: 800;
          color: #a7f3d0;
          letter-spacing: 0.04em;
        }
        .net-desc {
          font-size: 0.78rem;
          color: #94a3b8;
        }
        .net-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
        }
        .net-amount {
          font-size: 1.8rem;
          font-weight: 900;
          color: #ffffff;
          text-shadow: 0 0 20px rgba(52, 211, 153, 0.4);
        }
        .net-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.74rem;
          color: #34d399;
          font-weight: 700;
        }
        .rol-legal-note {
          padding: 8px 12px;
          text-align: center;
          font-size: 0.72rem;
          color: var(--text-muted);
          line-height: 1.4;
        }

        /* ------------------------------------------------------------- */
        /* FLOATING SOS PANIC BUTTON & MODAL (FUNC-EMP-006)              */
        /* ------------------------------------------------------------- */
        .fab-emergencia-btn {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 999;
          width: 58px;
          height: 58px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ef4444, #b91c1c);
          border: 2px solid rgba(255, 255, 255, 0.4);
          color: #ffffff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(239, 68, 68, 0.6);
          transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          animation: sosPulse 2s infinite ease-in-out;
        }
        @keyframes sosPulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 16px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .fab-emergencia-btn:hover {
          transform: scale(1.1);
        }
        .sos-text {
          font-size: 0.65rem;
          font-weight: 900;
          letter-spacing: 0.05em;
          margin-top: -2px;
        }
        .emergency-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .emergency-modal-card {
          width: 100%;
          max-width: 500px;
          padding: 24px;
          border: 1px solid rgba(239, 68, 68, 0.4);
          box-shadow: 0 10px 40px rgba(239, 68, 68, 0.25);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .emergency-modal-header {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .emergency-modal-icon {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .emergency-modal-title {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 800;
          color: #ffffff;
        }
        .emergency-modal-subtitle {
          margin: 4px 0 0 0;
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .emergency-status-picker {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .emergency-picker-label {
          font-size: 0.8rem;
          color: #cbd5e1;
          font-weight: 700;
        }
        .emergency-options-col {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .emergency-status-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: #cbd5e1;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s;
        }
        .status-text-block {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .status-text-block strong {
          font-size: 0.85rem;
          color: #ffffff;
        }
        .status-text-block span {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .status-safe.selected {
          border-color: #10b981;
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
        }
        .status-danger.selected {
          border-color: #ef4444;
          background: rgba(239, 68, 68, 0.18);
          color: #f87171;
        }
        .status-outside.selected {
          border-color: #3b82f6;
          background: rgba(59, 130, 246, 0.15);
          color: #60a5fa;
        }
        .emergency-gps-box {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: rgba(0, 0, 0, 0.25);
          border-radius: 8px;
          font-size: 0.76rem;
          color: #94a3b8;
        }
        .emergency-input-wrap {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .emergency-input-label {
          font-size: 0.78rem;
          color: var(--text-muted);
          font-weight: 600;
        }
        .emergency-textarea {
          width: 100%;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          padding: 10px;
          color: #ffffff;
          font-size: 0.84rem;
          resize: vertical;
          outline: none;
        }
        .emergency-textarea:focus {
          border-color: #ef4444;
        }
        .emergency-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 4px;
        }
        .btn-cancel-emergency {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #cbd5e1;
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-send-emergency {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          border: none;
          color: white;
          padding: 10px 18px;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4);
          transition: all 0.2s;
        }
        .btn-send-emergency:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 18px rgba(239, 68, 68, 0.55);
        }
        .btn-send-emergency:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
