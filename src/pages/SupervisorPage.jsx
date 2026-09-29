import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  CheckCircle, 
  CheckCircle2,
  Clock, 
  AlertCircle, 
  Search, 
  Download, 
  RefreshCw, 
  Lock, 
  Unlock, 
  Calendar,
  Filter,
  Eye, 
  LogOut, 
  Sparkles, 
  ChevronLeft, 
  ChevronRight, 
  MessageSquare, 
  AlertTriangle, 
  Send,
  Award,
  MapPin,
  Utensils,
  FileSpreadsheet,
  Shield,
  ShieldAlert,
  FileText,
  UserPlus,
  KeyRound,
  Trash2,
  Check,
  X,
  Phone,
  Radio,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import PinPad from '../components/PinPad';
import { 
  verificarPIN, 
  obtenerDatosSupervisor, 
  invalidarCacheSupervisor,
  enviarNotificacionWhatsApp,
  actualizarRegistro,
  justificarDia,
  obtenerColaboradores,
  getRecordEmpId,
  toggleEmergenciaSistema
} from '../services/api';
import { calcularDistancia } from '../services/rules';

export default function SupervisorPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('tcontrol_sup_auth') === 'true';
  });
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Active Tab: 8 modules from Reverse Engineering documentation
  const [activeTab, setActiveTab] = useState('monitor'); // 'monitor' | 'horas_extras' | 'justificaciones' | 'directorio' | 'invitados' | 'reportes' | 'whatsapp' | 'mapa'

  // Sidebar Collapsed state (persisted in localStorage as in documentation)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebarCollapsed', String(next));
      return next;
    });
  };

  // Core Data
  const [records, setRecords] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [dateFilter, setDateFilter] = useState('hoy'); // 'hoy', 'ayer', 'fecha', 'semana', 'mes', 'todos'
  const [statusFilter, setStatusFilter] = useState('todos'); // 'todos' | 'presente' | 'sin_marcar' | 'atraso' | 'finalizado'
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // Instant O(1) Employee Map for high-performance Sabana processing
  const empMap = useMemo(() => {
    const map = new Map();
    empleados.forEach(e => {
      const id = String(e.id || e.id_empleado || e.cedula || '').trim();
      if (id) map.set(id, e);
    });
    return map;
  }, [empleados]);

  // Global KPIs
  const [stats, setStats] = useState({
    totalEmpleados: 105,
    presentesHoy: 0,
    sinMarcarHoy: 0,
    salidasHoy: 0,
    atrasos: 0,
    horasExtrasHoy: 0,
  });

  const [waToast, setWaToast] = useState('');

  // ----------------- Verify PIN for Login -----------------
  const handleLogin = async () => {
    if (loginPin.length < 4 || loggingIn) return;
    setLoggingIn(true);
    setLoginError('');

    try {
      const res = await verificarPIN('1058', loginPin);
      if (res.valido || res.success || res.ok) {
        setIsAuthenticated(true);
        sessionStorage.setItem('tcontrol_sup_auth', 'true');
      } else {
        setLoginError('PIN incorrecto. Acceso denegado al módulo de supervisión.');
        setLoginPin('');
      }
    } catch (err) {
      setLoginError(err.message || 'Error al validar credenciales');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('tcontrol_sup_auth');
    setLoginPin('');
  };

  // Emergency & Evacuation Control (FUNC-SUP-006 / toggleEmergencia)
  const [isEmergencyActive, setIsEmergencyActive] = useState(false);
  const [emergencyAlertMsg, setEmergencyAlertMsg] = useState('');

  const handleToggleEmergency = async () => {
    const nextState = !isEmergencyActive;
    if (nextState) {
      const confirmActivate = window.confirm(
        '⚠️ ¿CONFIRMAR ACTIVACIÓN DE PROTOCOLO DE EMERGENCIA EN PLANTA?\n\nEsto emitirá la alerta institucional de evacuación inmediata hacia las terminales móviles de los colaboradores y registrará el evento.'
      );
      if (!confirmActivate) return;
    }
    try {
      await toggleEmergenciaSistema(nextState);
      setIsEmergencyActive(nextState);
      if (nextState) {
        setEmergencyAlertMsg('🚨 PROTOCOLO DE EMERGENCIA ACTIVADO. Monitoreando personal en planta...');
      } else {
        setEmergencyAlertMsg('✅ Protocolo de emergencia finalizado. Estado normalizado.');
        setTimeout(() => setEmergencyAlertMsg(''), 5000);
      }
    } catch (err) {
      alert('Error al cambiar estado de emergencia: ' + err.message);
    }
  };

  // ----------------- Load Data from PostgreSQL -----------------
  const loadData = async (force = false) => {
    if (force) invalidarCacheSupervisor();
    setLoading(true);
    try {
      const res = await obtenerDatosSupervisor({}, force);
      const rows = res.registros || res.asistencias || res.datos || [];
      const emps = res.empleados || [];
      setRecords(rows);
      setEmpleados(emps);

      // Merge backend invitados / almuerzosExtra
      const backendInvitados = [];
      if (Array.isArray(res.solicitudesInvitados)) {
        res.solicitudesInvitados.forEach(inv => {
          backendInvitados.push({
            id: inv.id || 'INV_' + Math.random().toString(36).slice(2, 7),
            nombre: inv.nombre || inv.invitado || 'Invitado',
            empresa: inv.empresa || inv.institucion || 'Institucional',
            menu: inv.menu || inv.opcion_menu || 'Normal',
            centroCosto: inv.centroCosto || inv.area || 'OPERACIONES',
            motivo: inv.motivo || 'Visita / Reunión técnica',
            hora: (inv.hora || '12:00').slice(0, 5),
            servido: Boolean(inv.servido || inv.entregado),
          });
        });
      }
      if (Array.isArray(res.almuerzosExtra)) {
        res.almuerzosExtra.forEach(alm => {
          backendInvitados.push({
            id: alm.id || 'EXT_' + Math.random().toString(36).slice(2, 7),
            nombre: alm.nombre || `Extra Colaborador ${alm.empleadoId || ''}`,
            empresa: alm.empresa || 'Almuerzo Extra',
            menu: alm.opcion || alm.menu || 'Normal',
            centroCosto: alm.centroCosto || 'OPERACIONES',
            motivo: alm.motivo || 'Autorizado por Supervisor',
            hora: (alm.hora || '12:30').slice(0, 5),
            servido: Boolean(alm.servido || alm.entregado),
          });
        });
      }
      if (backendInvitados.length > 0) {
        setInvitadosList(prev => {
          const ids = new Set(prev.map(p => p.id));
          const merged = [...prev];
          backendInvitados.forEach(b => {
            if (!ids.has(b.id)) {
              merged.push(b);
              ids.add(b.id);
            }
          });
          return merged;
        });
      }

      // Compute today stats accurately using getRecordEmpId
      const hoy = new Date().toISOString().split('T')[0];
      const hoyRows = rows.filter(r => (r.fecha || '').startsWith(hoy));
      
      const mapPunches = {};
      hoyRows.forEach(r => {
        const empId = getRecordEmpId(r);
        if (!empId) return;
        if (!mapPunches[empId]) mapPunches[empId] = [];
        mapPunches[empId].push(r);
      });

      let presCount = 0;
      let sinMarcarCount = 0;
      let salidasCount = 0;
      let atrasosCount = 0;
      let heCount = 0;

      emps.forEach(emp => {
        const empId = String(emp.id || emp.id_empleado || emp.cedula || '');
        const punches = mapPunches[empId] || [];
        const ent = punches.find(r => {
          const t = (r.tipo || '').toUpperCase();
          return t.includes('ENTRADA') || t === 'SOLO_ALMUERZO';
        });
        const sal = punches.find(r => (r.tipo || '').toUpperCase().includes('SALIDA'));

        if (!ent && !sal) {
          sinMarcarCount++;
        } else if (ent && !sal) {
          presCount++;
          if (ent.hora) {
            const [h, m] = ent.hora.split(':').map(Number);
            if (h > 7 || (h === 7 && m > 45)) atrasosCount++;
          }
        } else if (sal) {
          salidasCount++;
          if (sal.horas_extras === 'SI' || sal.horasExtra === 'SI' || sal.autoriza) {
            heCount++;
          }
        }
      });

      setStats({
        totalEmpleados: emps.length || 105,
        presentesHoy: presCount,
        sinMarcarHoy: sinMarcarCount,
        salidasHoy: salidasCount,
        atrasos: atrasosCount,
        horasExtrasHoy: heCount,
      });
    } catch (err) {
      console.error('Error al cargar datos del supervisor:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    setPage(1);
  }, [dateFilter, selectedDate, statusFilter, search, activeTab]);

  // ----------------- Sábana Diaria Consolidada -----------------
  const consolidatedList = useMemo(() => {
    const ahora = new Date();
    const hoyStr = ahora.toISOString().split('T')[0];
    const ayerStr = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const sieteDiasAtras = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const mesActual = hoyStr.slice(0, 7);

    // If single date selected ('hoy', 'ayer', or custom 'fecha')
    const isSingleDate = dateFilter === 'hoy' || dateFilter === 'ayer' || dateFilter === 'fecha';
    const targetDate = dateFilter === 'ayer' ? ayerStr : dateFilter === 'fecha' ? (selectedDate || hoyStr) : hoyStr;

    if (isSingleDate) {
      const dateRows = records.filter(r => (r.fecha || '').startsWith(targetDate));
      const mapPunches = {};
      dateRows.forEach(r => {
        const empId = getRecordEmpId(r);
        if (!empId) return;
        if (!mapPunches[empId]) mapPunches[empId] = [];
        mapPunches[empId].push(r);
      });

      return empleados.map(emp => {
        const empId = String(emp.id || emp.id_empleado || emp.cedula || '');
        const punches = mapPunches[empId] || [];

        const entradaReg = punches.find(r => {
          const t = (r.tipo || '').toUpperCase();
          return t.includes('ENTRADA') || t === 'SOLO_ALMUERZO';
        });
        const salidaReg = punches.find(r => (r.tipo || '').toUpperCase().includes('SALIDA'));
        const almuerzoReg = punches.find(r => {
          const t = (r.tipo || '').toUpperCase();
          return t.includes('ALMUERZO') || r.almuerzo === 'SI' || r.almuerzo === 'PLANTA' || r.opcion_menu;
        });

        const horaEntrada = entradaReg?.hora ? entradaReg.hora.slice(0, 5) : '--:--';
        const horaSalida = salidaReg?.hora ? salidaReg.hora.slice(0, 5) : '--:--';
        const horaAlmuerzo = almuerzoReg?.hora ? almuerzoReg.hora.slice(0, 5) : '--:--';

        const tieneEntrada = Boolean(entradaReg);
        const tieneSalida = Boolean(salidaReg);
        const tieneAlmuerzo = Boolean(almuerzoReg);

        let esAtraso = false;
        if (entradaReg && entradaReg.hora) {
          const [h, m] = entradaReg.hora.split(':').map(Number);
          if (h > 7 || (h === 7 && m > 45)) esAtraso = true;
        }

        let estado = 'Sin Marcar';
        let statusCode = 'sin_marcar';

        if (tieneEntrada && tieneSalida) {
          estado = 'Jornada Finalizada';
          statusCode = 'finalizado';
        } else if (tieneEntrada && !tieneSalida) {
          if (tieneAlmuerzo && !punches.some(p => (p.tipo || '').includes('ALMUERZO_ENTRADA'))) {
            estado = 'En Almuerzo';
            statusCode = 'almuerzo';
          } else if (esAtraso) {
            estado = 'Atraso (En Planta)';
            statusCode = 'atraso';
          } else {
            estado = 'En Planta';
            statusCode = 'presente';
          }
        }

        let horas = '--';
        if (tieneEntrada && tieneSalida && entradaReg.hora && salidaReg.hora) {
          const [eh, em] = entradaReg.hora.split(':').map(Number);
          const [sh, sm] = salidaReg.hora.split(':').map(Number);
          const diff = (sh * 60 + sm) - (eh * 60 + em);
          if (diff > 0) horas = (diff / 60).toFixed(1) + ' hrs';
        }

        return {
          id: empId,
          nombre: emp.nombre || emp.nombres || `Colaborador ${empId}`,
          area: emp.area || emp.departamento || 'General',
          cargo: emp.cargo || 'Colaborador',
          foto_url: emp.foto_url || '',
          fecha: targetDate,
          entrada: horaEntrada,
          almuerzo: horaAlmuerzo !== '--:--' ? horaAlmuerzo : (tieneAlmuerzo ? (almuerzoReg.opcion_menu || 'Registrado') : '--:--'),
          salida: horaSalida,
          horas,
          estado,
          statusCode,
          razonAtraso: entradaReg?.razon_entrada_tardia || entradaReg?.razonEntradaTardia || null,
          razonSalida: salidaReg?.razon_salida_temprana || salidaReg?.razonSalidaTemprana || null,
          horasExtras: (salidaReg?.horas_extras === 'SI' || salidaReg?.horasExtra === 'SI' || salidaReg?.autoriza) ? 'SI' : 'NO',
          autorizaHE: salidaReg?.autoriza || null,
          telefono: emp.telefono || null,
          ubicacion: entradaReg?.ubicacion || entradaReg?.modo || emp.area || 'Oficina Central',
          lat: entradaReg?.lat || entradaReg?.latitud || null,
          lng: entradaReg?.lng || entradaReg?.longitud || null,
          rawEntrada: entradaReg,
          rawSalida: salidaReg
        };
      });
    } else {
      // Range grouping (semana, mes, todos) with O(1) empMap lookup
      let list = records;
      if (dateFilter === 'semana') {
        list = list.filter(r => (r.fecha || '') >= sieteDiasAtras);
      } else if (dateFilter === 'mes') {
        list = list.filter(r => (r.fecha || '').startsWith(mesActual));
      }

      const grouped = {};
      list.forEach(r => {
        const empId = getRecordEmpId(r);
        if (!empId) return;
        const f = (r.fecha || '').split('T')[0];
        const key = `${empId}_${f}`;

        if (!grouped[key]) {
          const emp = empMap.get(empId);
          grouped[key] = {
            id: empId,
            nombre: emp?.nombre || emp?.nombres || r.nombre || `Colaborador ${empId}`,
            area: emp?.area || emp?.departamento || r.area || 'General',
            cargo: emp?.cargo || r.cargo || 'Colaborador',
            foto_url: emp?.foto_url || '',
            fecha: f,
            entrada: '--:--',
            almuerzo: '--:--',
            salida: '--:--',
            horas: '--',
            estado: 'Marcación',
            statusCode: 'presente',
            razonAtraso: null,
            razonSalida: null,
            horasExtras: 'NO',
            telefono: emp?.telefono || null,
            ubicacion: r.ubicacion || 'Central',
            lat: r.lat || r.latitud || null,
            lng: r.lng || r.longitud || null,
            rawEntrada: null,
            rawSalida: null
          };
        }

        const tipoUpper = (r.tipo || '').toUpperCase();
        if (tipoUpper.includes('ENTRADA')) {
          grouped[key].entrada = r.hora?.slice(0, 5) || '--:--';
          grouped[key].rawEntrada = r;
          if (r.razon_entrada_tardia) grouped[key].razonAtraso = r.razon_entrada_tardia;
        } else if (tipoUpper.includes('SALIDA')) {
          grouped[key].salida = r.hora?.slice(0, 5) || '--:--';
          grouped[key].rawSalida = r;
          if (r.razon_salida_temprana) grouped[key].razonSalida = r.razon_salida_temprana;
          if (r.horas_extras === 'SI' || r.horasExtra === 'SI') grouped[key].horasExtras = 'SI';
        } else if (tipoUpper.includes('ALMUERZO')) {
          grouped[key].almuerzo = r.hora?.slice(0, 5) || 'Almuerzo';
        }
      });

      return Object.values(grouped).map(row => {
        if (row.entrada !== '--:--' && row.salida !== '--:--') {
          row.estado = 'Jornada Finalizada';
          row.statusCode = 'finalizado';
          const [eh, em] = row.entrada.split(':').map(Number);
          const [sh, sm] = row.salida.split(':').map(Number);
          const diff = (sh * 60 + sm) - (eh * 60 + em);
          if (diff > 0) row.horas = (diff / 60).toFixed(1) + ' hrs';
        } else if (row.entrada !== '--:--') {
          const [h, m] = row.entrada.split(':').map(Number);
          if (h > 7 || (h === 7 && m > 45)) {
            row.estado = 'Atraso';
            row.statusCode = 'atraso';
          } else {
            row.estado = 'En Planta';
            row.statusCode = 'presente';
          }
        } else {
          row.estado = 'Sin Marcar';
          row.statusCode = 'sin_marcar';
        }
        return row;
      });
    }
  }, [records, empleados, empMap, dateFilter, selectedDate]);

  // Filtered Records for Table
  const filteredRecords = useMemo(() => {
    return consolidatedList.filter(row => {
      if (statusFilter !== 'todos' && row.statusCode !== statusFilter) return false;
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        row.nombre.toLowerCase().includes(term) ||
        row.id.toLowerCase().includes(term) ||
        row.area.toLowerCase().includes(term) ||
        row.cargo.toLowerCase().includes(term)
      );
    });
  }, [consolidatedList, statusFilter, search]);

  const totalPages = Math.ceil(filteredRecords.length / PAGE_SIZE) || 1;
  const paginatedRecords = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRecords.slice(start, start + PAGE_SIZE);
  }, [filteredRecords, page]);

  // ----------------- SUBMODULE: Horas Extras (FUNC-SUP-004) -----------------
  const [heActionLoading, setHeActionLoading] = useState(null);

  const overtimeCandidates = useMemo(() => {
    return consolidatedList.filter(row => {
      if (row.horasExtras === 'SI') return true;
      if (row.salida !== '--:--') {
        const [sh, sm] = row.salida.split(':').map(Number);
        // Exceso sobre 16:15 en laborables
        if (sh > 16 || (sh === 16 && sm >= 15)) return true;
      }
      return false;
    });
  }, [consolidatedList]);

  const handleApproveOvertime = async (row) => {
    const punchId = row.rawSalida?.id || `${row.id}_SALIDA_${row.fecha}_${row.salida.replace(':', '')}00`;
    setHeActionLoading(punchId);
    try {
      await actualizarRegistro(punchId, {
        horas_extras: 'SI',
        horasExtra: 'SI',
        autoriza: 'SUPERVISOR: 1058 (TI/OPERACIONES)',
        observacion: 'Horas extraordinarias aprobadas en sistema.',
      });
      setWaToast(`✅ Horas extras aprobadas para ${row.nombre}`);
      setTimeout(() => setWaToast(''), 4000);
      await loadData(true);
    } catch (err) {
      alert('Error al aprobar horas extras: ' + err.message);
    } finally {
      setHeActionLoading(null);
    }
  };

  const handleRejectOvertime = async (row) => {
    const punchId = row.rawSalida?.id || `${row.id}_SALIDA_${row.fecha}_${row.salida.replace(':', '')}00`;
    setHeActionLoading(punchId);
    try {
      await actualizarRegistro(punchId, {
        horas_extras: 'NO',
        horasExtra: 'NO',
        autoriza: 'RECHAZADO: SUPERVISOR 1058',
        observacion: 'Sobretiempo no justificado por necesidades operativas.',
      });
      setWaToast(`❌ Horas extras denegadas para ${row.nombre}`);
      setTimeout(() => setWaToast(''), 4000);
      await loadData(true);
    } catch (err) {
      alert('Error al rechazar horas extras: ' + err.message);
    } finally {
      setHeActionLoading(null);
    }
  };

  // ----------------- SUBMODULE: Justificaciones Laborales (FUNC-SUP-003) -----------------
  const [justEmpId, setJustEmpId] = useState('');
  const [justFecha, setJustFecha] = useState(() => new Date().toISOString().split('T')[0]);
  const [justTipo, setJustTipo] = useState('ATRASO');
  const [justMotivo, setJustMotivo] = useState('MÉDICA (Certificado IESS / Médico Empresa)');
  const [justMinutos, setJustMinutos] = useState(30);
  const [justObs, setJustObs] = useState('');
  const [justSaving, setJustSaving] = useState(false);
  const [justMsg, setJustMsg] = useState('');

  const handleSubmitJustification = async (e) => {
    e.preventDefault();
    if (!justEmpId) {
      alert('Por favor selecciona un colaborador');
      return;
    }
    setJustSaving(true);
    setJustMsg('');
    try {
      const fullMotivo = `${justTipo} - ${justMotivo} (${justMinutos} min). Obs: ${justObs || 'Regularizado por supervisor 1058'}`;
      await justificarDia(justEmpId, justFecha, fullMotivo);
      setJustMsg('✅ Justificación registrada con éxito. Sincronizada con PostgreSQL.');
      setJustObs('');
      setTimeout(() => setJustMsg(''), 5000);
      await loadData(true);
    } catch (err) {
      setJustMsg('❌ Error al guardar justificación: ' + err.message);
    } finally {
      setJustSaving(false);
    }
  };

  // ----------------- SUBMODULE: Directorio de Personal & LOPDP (FUNC-SUP-005) -----------------
  const [dirSearch, setDirSearch] = useState('');
  const [dirAreaFilter, setDirAreaFilter] = useState('todos');
  const [selectedColabForCoords, setSelectedColabForCoords] = useState(null);
  const [customLat, setCustomLat] = useState('');
  const [customLng, setCustomLng] = useState('');

  const filteredDirectorio = useMemo(() => {
    return empleados.filter(e => {
      if (dirAreaFilter !== 'todos' && (e.area || e.departamento) !== dirAreaFilter) return false;
      if (!dirSearch.trim()) return true;
      const t = dirSearch.toLowerCase();
      const n = (e.nombre || e.nombres || '').toLowerCase();
      const id = String(e.id || e.id_empleado || '');
      const c = (e.cargo || '').toLowerCase();
      return n.includes(t) || id.includes(t) || c.includes(t);
    });
  }, [empleados, dirSearch, dirAreaFilter]);

  const areasList = useMemo(() => {
    const setA = new Set(empleados.map(e => e.area || e.departamento).filter(Boolean));
    return Array.from(setA);
  }, [empleados]);

  const handleResetPin = async (emp) => {
    const id = emp.id || emp.id_empleado;
    if (!confirm(`¿Deseas resetear el PIN de seguridad para ${emp.nombre || emp.nombres} (ID: ${id})? El colaborador deberá configurar uno nuevo en su próximo inicio.`)) return;
    try {
      await actualizarRegistro(`EMP_${id}`, { pin: null, reset_pin: true });
      alert(`PIN del colaborador ${id} reseteado exitosamente.`);
    } catch (err) {
      alert('Error al resetear PIN: ' + err.message);
    }
  };

  const handleSaveBaseCoords = (emp) => {
    const id = emp.id || emp.id_empleado;
    localStorage.setItem(`tcontrol_geocerca_${id}`, JSON.stringify({
      baseLat: parseFloat(customLat),
      baseLng: parseFloat(customLng),
    }));
    alert(`Geocerca base actualizada para el colaborador ID: ${id}.`);
    setSelectedColabForCoords(null);
    setCustomLat('');
    setCustomLng('');
  };

  // ----------------- SUBMODULE: Invitados y Almuerzos Extra (FUNC-SUP-008) -----------------
  const [invitadosList, setInvitadosList] = useState(() => {
    try {
      const saved = localStorage.getItem('tcontrol_invitados_hoy');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [invNombre, setInvNombre] = useState('');
  const [invEmpresa, setInvEmpresa] = useState('');
  const [invMenu, setInvMenu] = useState('Normal');
  const [invCentroCosto, setInvCentroCosto] = useState('OPERACIONES');
  const [invMotivo, setInvMotivo] = useState('');

  const handleAddGuest = (e) => {
    e.preventDefault();
    if (!invNombre.trim()) return;
    const now = new Date();
    const newGuest = {
      id: 'INV_' + Date.now().toString().slice(-6),
      nombre: invNombre.trim(),
      empresa: invEmpresa.trim() || 'Visita Institucional',
      menu: invMenu,
      centroCosto: invCentroCosto,
      motivo: invMotivo.trim() || 'Comisión / Reunión técnica',
      hora: now.toLocaleTimeString('es-EC', { hour12: false }).slice(0, 5),
      servido: false,
    };
    const updated = [newGuest, ...invitadosList];
    setInvitadosList(updated);
    localStorage.setItem('tcontrol_invitados_hoy', JSON.stringify(updated));
    setInvNombre('');
    setInvEmpresa('');
    setInvMotivo('');
    setWaToast(`🍽️ Invitado ${newGuest.nombre} añadido a la orden de Catering.`);
    setTimeout(() => setWaToast(''), 4000);
  };

  // ----------------- SUBMODULE: Diseñador de Reportes (FUNC-SUP-006) -----------------
  const [selectedColumns, setSelectedColumns] = useState({
    id: true,
    nombre: true,
    area: true,
    cargo: true,
    fecha: true,
    entrada: true,
    almuerzo: true,
    salida: true,
    horas: true,
    estado: true,
    razonAtraso: true,
    razonSalida: false,
    horasExtras: true,
    ubicacion: false
  });

  const toggleColumn = (key) => {
    setSelectedColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExportCustomExcel = () => {
    const dataToExport = filteredRecords.map(r => {
      const row = {};
      if (selectedColumns.id) row['ID'] = r.id;
      if (selectedColumns.nombre) row['Colaborador'] = r.nombre;
      if (selectedColumns.area) row['Área'] = r.area;
      if (selectedColumns.cargo) row['Cargo'] = r.cargo;
      if (selectedColumns.fecha) row['Fecha'] = r.fecha;
      if (selectedColumns.entrada) row['Hora Entrada'] = r.entrada;
      if (selectedColumns.almuerzo) row['Almuerzo'] = r.almuerzo;
      if (selectedColumns.salida) row['Hora Salida'] = r.salida;
      if (selectedColumns.horas) row['Total Horas'] = r.horas;
      if (selectedColumns.estado) row['Estado'] = r.estado;
      if (selectedColumns.razonAtraso) row['Motivo Atraso'] = r.razonAtraso || '--';
      if (selectedColumns.razonSalida) row['Motivo Salida Anticipada'] = r.razonSalida || '--';
      if (selectedColumns.horasExtras) row['Horas Extras (+HE)'] = r.horasExtras;
      if (selectedColumns.ubicacion) row['Ubicación GPS'] = r.ubicacion;
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte_TCONTROL');
    
    // Auto column widths
    const max_width = 30;
    const colWidths = Object.keys(dataToExport[0] || {}).map(key => ({
      wch: Math.min(Math.max(key.length, 12), max_width)
    }));
    worksheet['!cols'] = colWidths;

    XLSX.writeFile(workbook, `TCONTROL_Reporte_${dateFilter}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // ----------------- SUBMODULE: Consola WhatsApp Masiva (FUNC-SUP-007) -----------------
  const [waMode, setWaMode] = useState('ausentes'); // 'ausentes' | 'atrasos' | 'todos'
  const [waTemplate, setWaTemplate] = useState('recordatorio_entrada');
  const [waCustomMessage, setWaCustomMessage] = useState('');
  const [waSending, setWaSending] = useState(false);
  const [waProgress, setWaProgress] = useState({ sent: 0, total: 0 });

  const waTargetList = useMemo(() => {
    if (waMode === 'ausentes') {
      return consolidatedList.filter(r => r.statusCode === 'sin_marcar');
    } else if (waMode === 'atrasos') {
      return consolidatedList.filter(r => r.statusCode === 'atraso');
    }
    return consolidatedList;
  }, [consolidatedList, waMode]);

  const getWaMessageText = (nombre) => {
    if (waCustomMessage.trim()) {
      return waCustomMessage.replace('{nombre}', nombre);
    }
    switch (waTemplate) {
      case 'recordatorio_entrada':
        return `Hola *${nombre}*, te recordamos registrar tu asistencia en *TCONTROL 2026*. Tu hora oficial de ingreso es 07:30. Puedes timbrar desde tu smartphone o en garita.`;
      case 'alerta_atraso':
        return `Estimado/a *${nombre}*, se registró tu ingreso con atraso el día de hoy. Por favor ingresa a la aplicación para formalizar tu motivo de justificación.`;
      case 'recordatorio_salida':
        return `Hola *${nombre}*, recuerda registrar tu marcación de salida al concluir tu jornada laboral (16:15).`;
      default:
        return `Hola *${nombre}*, comunicado oficial de Talento Humano TCONTROL.`;
    }
  };

  const handleBroadcastWhatsApp = async () => {
    if (waTargetList.length === 0) {
      alert('No hay destinatarios en la lista seleccionada.');
      return;
    }
    if (!confirm(`¿Deseas despachar notificaciones de WhatsApp a ${waTargetList.length} colaboradores?`)) return;

    setWaSending(true);
    setWaProgress({ sent: 0, total: waTargetList.length });

    for (let i = 0; i < waTargetList.length; i++) {
      const colab = waTargetList[i];
      const tel = colab.telefono || '593999999999';
      const msg = getWaMessageText(colab.nombre);
      try {
        await enviarNotificacionWhatsApp(tel, msg);
      } catch (err) {
        console.warn('Error al despachar WhatsApp:', err);
      }
      setWaProgress({ sent: i + 1, total: waTargetList.length });
    }

    setWaSending(false);
    setWaToast(`✅ Despacho completado: ${waTargetList.length} mensajes procesados.`);
    setTimeout(() => setWaToast(''), 5000);
  };

  // ----------------- SUBMODULE: Radar Satelital / Mapa GPS (FUNC-SUP-009) -----------------
  const BASE_LAT = -0.129202;
  const BASE_LNG = -78.477511;

  const gpsPunches = useMemo(() => {
    return consolidatedList.filter(r => r.lat && r.lng).map(r => {
      const dist = calcularDistancia(BASE_LAT, BASE_LNG, r.lat, r.lng);
      return {
        ...r,
        distanciaCalculada: dist,
        enPlanta: dist <= 250,
      };
    });
  }, [consolidatedList]);

  // ----------------- RENDER: LOGIN VIEW -----------------
  if (!isAuthenticated) {
    return (
      <div className="login-wrapper">
        <div className="glass-card login-card">
          <div className="login-header">
            <div className="login-icon">
              <Lock size={32} />
            </div>
            <h2>Acceso a Supervisión</h2>
            <p>Ingresa tu PIN de autorización para gestionar asistencias y reportería institucional.</p>
          </div>

          <div className="pin-section">
            <PinPad
              pin={loginPin}
              onChange={setLoginPin}
              maxLength={4}
              onComplete={handleLogin}
              disabled={loggingIn}
            />
          </div>

          {loginError && (
            <div className="error-alert">
              <AlertCircle size={16} />
              <span>{loginError}</span>
            </div>
          )}

          <div className="login-footer">
            <button
              type="button"
              className="btn btn-primary login-btn"
              onClick={handleLogin}
              disabled={loginPin.length < 4 || loggingIn}
            >
              {loggingIn ? (
                <>
                  <RefreshCw size={16} className="spinning" />
                  <span>Validando...</span>
                </>
              ) : (
                <>
                  <Unlock size={16} />
                  <span>Desbloquear Panel</span>
                </>
              )}
            </button>
          </div>
        </div>

        <style>{`
          .login-wrapper {
            min-height: calc(100vh - 120px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .login-card {
            max-width: 420px;
            width: 100%;
            padding: 32px;
            text-align: center;
          }
          .login-header {
            margin-bottom: 24px;
          }
          .login-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 16px;
            border-radius: 50%;
            background: rgba(239, 68, 68, 0.15);
            color: #ef4444;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .login-header h2 {
            font-size: 1.5rem;
            font-weight: 700;
            color: #fff;
            margin-bottom: 8px;
          }
          .login-header p {
            font-size: 0.85rem;
            color: #94a3b8;
          }
          .error-alert {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 14px;
            border-radius: 8px;
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #fca5a5;
            font-size: 0.85rem;
            margin-top: 16px;
          }
          .login-footer {
            margin-top: 24px;
          }
          .login-btn {
            width: 100%;
            padding: 12px;
            font-size: 1rem;
          }
        `}</style>
      </div>
    );
  }

  // ----------------- RENDER: DASHBOARD VIEW -----------------
  return (
    <div className={`supervisor-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* LEFT VERTICAL SIDEBAR (FUNC-SUP-001 / Architecture 09_FRONTEND) */}
      <aside className="sup-sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">
            <Shield size={20} color="#ef4444" />
          </div>
          {!sidebarCollapsed && (
            <div className="brand-info">
              <h3>TCONTROL</h3>
              <span>Supervisión 2026</span>
            </div>
          )}
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
          >
            {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        {/* Vertical Navigation Links */}
        <nav className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'monitor' ? 'active' : ''}`}
            onClick={() => setActiveTab('monitor')}
            title="Monitor en Vivo"
          >
            <Clock size={18} />
            {!sidebarCollapsed && <span className="nav-label">Monitor en Vivo</span>}
            <span className="tab-pill">{stats.presentesHoy}</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'horas_extras' ? 'active' : ''}`}
            onClick={() => setActiveTab('horas_extras')}
            title="Horas Extras (+HE)"
          >
            <Award size={18} />
            {!sidebarCollapsed && <span className="nav-label">Horas Extras</span>}
            {overtimeCandidates.length > 0 && (
              <span className="tab-pill yellow">{overtimeCandidates.length}</span>
            )}
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'justificaciones' ? 'active' : ''}`}
            onClick={() => setActiveTab('justificaciones')}
            title="Justificaciones Laborales"
          >
            <FileText size={18} />
            {!sidebarCollapsed && <span className="nav-label">Justificaciones</span>}
            {stats.atrasos > 0 && <span className="tab-pill red">{stats.atrasos}</span>}
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'directorio' ? 'active' : ''}`}
            onClick={() => setActiveTab('directorio')}
            title="Directorio & LOPDP"
          >
            <Users size={18} />
            {!sidebarCollapsed && <span className="nav-label">Directorio Personal</span>}
            <span className="tab-pill">{empleados.length}</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'invitados' ? 'active' : ''}`}
            onClick={() => setActiveTab('invitados')}
            title="Almuerzos Extra / Visitas"
          >
            <Utensils size={18} />
            {!sidebarCollapsed && <span className="nav-label">Almuerzos Extra</span>}
            {invitadosList.length > 0 && <span className="tab-pill">{invitadosList.length}</span>}
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'reportes' ? 'active' : ''}`}
            onClick={() => setActiveTab('reportes')}
            title="Diseñador Reportes XLSX"
          >
            <FileSpreadsheet size={18} />
            {!sidebarCollapsed && <span className="nav-label">Diseñador Reportes</span>}
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'whatsapp' ? 'active' : ''}`}
            onClick={() => setActiveTab('whatsapp')}
            title="Consola WhatsApp"
          >
            <MessageSquare size={18} />
            {!sidebarCollapsed && <span className="nav-label">Consola WhatsApp</span>}
            {stats.sinMarcarHoy > 0 && <span className="tab-pill red">{stats.sinMarcarHoy}</span>}
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'mapa' ? 'active' : ''}`}
            onClick={() => setActiveTab('mapa')}
            title="Radar Satelital GPS"
          >
            <MapPin size={18} />
            {!sidebarCollapsed && <span className="nav-label">Radar Satelital</span>}
            <span className="tab-pill">{gpsPunches.length}</span>
          </button>
        </nav>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          {!sidebarCollapsed ? (
            <div className="user-profile">
              <div className="user-avatar">1058</div>
              <div className="user-details">
                <span className="user-name">SUPERVISOR TI</span>
                <span className="user-role">ID: 1058 • Master</span>
              </div>
            </div>
          ) : (
            <div className="user-avatar-collapsed" title="Supervisor Master (1058)">1058</div>
          )}
          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={handleLogout}
            title="Cerrar sesión"
          >
            <LogOut size={16} />
            {!sidebarCollapsed && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* RIGHT MAIN WORKSPACE */}
      <div className="supervisor-main-content">
        {/* Top Header */}
        <div className="sup-header">
          <div className="sup-title-wrap">
            <div className="sup-icon">
              <Sparkles size={24} />
            </div>
            <div>
              <h1>Centro de Control & Supervisión TCONTROL</h1>
              <p>Monitoreo biométrico en tiempo real, gestión de novedades y reportería legal LOPDP.</p>
            </div>
          </div>

          <div className="sup-actions">
            <button
              type="button"
              className={`btn ${isEmergencyActive ? 'btn-emergency-active' : 'btn-emergency-idle'}`}
              onClick={handleToggleEmergency}
              title={isEmergencyActive ? 'Desactivar protocolo de emergencia' : 'Activar protocolo de emergencia / evacuación'}
            >
              <ShieldAlert size={16} className={isEmergencyActive ? 'emergency-pulse' : ''} />
              <span>{isEmergencyActive ? 'EMERGENCIA ACTIVA' : 'Protocolo Emergencia'}</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => loadData(true)}
              disabled={loading}
              title="Refrescar datos desde la base de datos PostgreSQL"
            >
              <RefreshCw size={16} className={loading ? 'spinning' : ''} />
              <span>{loading ? 'Consultando...' : 'Actualizar'}</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary logout-btn"
              onClick={handleLogout}
              title="Cerrar sesión de supervisor"
            >
              <LogOut size={16} />
              <span>Salir</span>
            </button>
          </div>
        </div>

        {/* Emergency Alert Banner (FUNC-SUP-006) */}
        {isEmergencyActive && (
          <div className="emergency-broadcast-banner fade-in">
            <div className="banner-left">
              <ShieldAlert size={32} className="emergency-icon-pulse" />
              <div>
                <h4 className="banner-title">🚨 PROTOCOLO DE EMERGENCIA / EVACUACIÓN ACTIVO EN PLANTA</h4>
                <p className="banner-desc">
                  Alerta emitida a todas las terminales móviles PWA. Monitoreando personal actualmente en planta ({stats.presentesHoy} colaboradores).
                </p>
              </div>
            </div>
            <div className="banner-actions">
              <button
                type="button"
                className="btn btn-warning-sm"
                onClick={() => {
                  enviarNotificacionWhatsApp(
                    '593999999999',
                    `🚨 *ALERTA GENERAL DE EVACUACIÓN - TCONTROL:* Protocolo de emergencia activo. Todo el personal debe evacuar inmediatamente hacia los puntos de encuentro asignados.`
                  );
                  alert('Notificación de evacuación transmitida por WhatsApp.');
                }}
              >
                <MessageSquare size={14} /> Difundir por WhatsApp
              </button>
              <button
                type="button"
                className="btn btn-secondary-sm"
                onClick={handleToggleEmergency}
              >
                Finalizar Emergencia
              </button>
            </div>
          </div>
        )}

        {/* Global Feedback Toast */}
        {waToast && (
          <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 flex items-center gap-2 text-sm fade-in mb-3">
            <MessageSquare size={16} />
            <span>{waToast}</span>
          </div>
        )}

      {/* ==================== TAB 1: MONITOR EN VIVO (FUNC-SUP-002) ==================== */}
      {activeTab === 'monitor' && (
        <div className="fade-in">
          {/* KPI Stats Cards */}
          <div className="kpi-grid">
            <div 
              className={`glass-card kpi-card clickable ${statusFilter === 'todos' ? 'active-filter' : ''}`}
              onClick={() => setStatusFilter('todos')}
            >
              <div className="kpi-icon blue">
                <Users size={22} />
              </div>
              <div className="kpi-content">
                <span className="kpi-label">Todos los Colaboradores</span>
                <span className="kpi-value">{stats.totalEmpleados}</span>
              </div>
            </div>

            <div 
              className={`glass-card kpi-card clickable ${statusFilter === 'presente' ? 'active-filter' : ''}`}
              onClick={() => setStatusFilter('presente')}
            >
              <div className="kpi-icon green">
                <CheckCircle size={22} />
              </div>
              <div className="kpi-content">
                <span className="kpi-label">En Planta (Presentes)</span>
                <span className="kpi-value">{stats.presentesHoy}</span>
              </div>
            </div>

            <div 
              className={`glass-card kpi-card clickable ${statusFilter === 'sin_marcar' ? 'active-filter' : ''}`}
              onClick={() => setStatusFilter('sin_marcar')}
            >
              <div className="kpi-icon yellow">
                <Clock size={22} />
              </div>
              <div className="kpi-content">
                <span className="kpi-label">Sin Marcar / Ausentes</span>
                <span className="kpi-value">{stats.sinMarcarHoy}</span>
              </div>
            </div>

            <div 
              className={`glass-card kpi-card clickable ${statusFilter === 'atraso' ? 'active-filter' : ''}`}
              onClick={() => setStatusFilter('atraso')}
            >
              <div className="kpi-icon red">
                <AlertCircle size={22} />
              </div>
              <div className="kpi-content">
                <span className="kpi-label">Atrasos Detectados</span>
                <span className="kpi-value">{stats.atrasos}</span>
              </div>
            </div>

            <div 
              className={`glass-card kpi-card clickable ${statusFilter === 'finalizado' ? 'active-filter' : ''}`}
              onClick={() => setStatusFilter('finalizado')}
            >
              <div className="kpi-icon purple" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
                <LogOut size={22} />
              </div>
              <div className="kpi-content">
                <span className="kpi-label">Jornada Finalizada</span>
                <span className="kpi-value">{stats.salidasHoy}</span>
              </div>
            </div>
          </div>

          {/* Search and Period Filter */}
          <div className="glass-card filter-card">
            <div className="search-wrap">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar por colaborador, ID, cargo o área..."
                className="input-field search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="filter-pills" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              <span className="filter-label"><Filter size={14} /> Fecha / Período:</span>
              <button
                type="button"
                className={`pill-btn ${dateFilter === 'hoy' ? 'active' : ''}`}
                onClick={() => {
                  setDateFilter('hoy');
                  setStatusFilter('todos');
                }}
              >
                Hoy
              </button>
              <button
                type="button"
                className={`pill-btn ${dateFilter === 'ayer' ? 'active' : ''}`}
                onClick={() => {
                  setDateFilter('ayer');
                  setStatusFilter('todos');
                }}
              >
                Ayer
              </button>
              <div 
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: dateFilter === 'fecha' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                  border: dateFilter === 'fecha' ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '20px',
                  padding: '4px 10px',
                }}
              >
                <Calendar size={13} style={{ color: dateFilter === 'fecha' ? '#60a5fa' : '#94a3b8' }} />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setDateFilter('fecha');
                    setStatusFilter('todos');
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    fontSize: '12px',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                  title="Elegir cualquier fecha de la base de datos"
                />
              </div>
              <button
                type="button"
                className={`pill-btn ${dateFilter === 'semana' ? 'active' : ''}`}
                onClick={() => {
                  setDateFilter('semana');
                  setStatusFilter('todos');
                }}
              >
                Últimos 7 Días
              </button>
              <button
                type="button"
                className={`pill-btn ${dateFilter === 'mes' ? 'active' : ''}`}
                onClick={() => {
                  setDateFilter('mes');
                  setStatusFilter('todos');
                }}
              >
                Este Mes
              </button>
              <button
                type="button"
                className={`pill-btn ${dateFilter === 'todos' ? 'active' : ''}`}
                onClick={() => {
                  setDateFilter('todos');
                  setStatusFilter('todos');
                }}
                title="Ver totalidad de marcaciones procesadas"
              >
                Histórico ({records.length})
              </button>
            </div>

            <button
              type="button"
              className="btn btn-success ml-auto"
              onClick={handleExportCustomExcel}
            >
              <Download size={15} />
              <span>Exportar Excel</span>
            </button>
          </div>

          {/* Monitor Table */}
          <div className="glass-card table-card">
            <div className="table-responsive">
              <table className="asistencia-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Colaborador</th>
                    <th>Área</th>
                    <th>Fecha</th>
                    <th>Entrada</th>
                    <th>Almuerzo</th>
                    <th>Salida</th>
                    <th>Horas</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && records.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="table-loading">
                        <RefreshCw size={24} className="spinning" />
                        <span>Consultando base de datos PostgreSQL...</span>
                      </td>
                    </tr>
                  ) : paginatedRecords.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="table-empty">
                        No se encontraron registros para el filtro seleccionado.
                      </td>
                    </tr>
                  ) : (
                    paginatedRecords.map((r, idx) => (
                      <tr key={`${r.id || ''}_${r.fecha || ''}_${idx}`}>
                        <td className="id-col">{r.id}</td>
                        <td className="name-col">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {r.foto_url ? (
                              <img 
                                src={r.foto_url} 
                                alt={r.nombre} 
                                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} 
                              />
                            ) : null}
                            <div>
                              <strong>{r.nombre}</strong>
                              <div style={{ fontSize: '10px', color: '#64748b' }}>{r.cargo}</div>
                            </div>
                          </div>
                        </td>
                        <td>{r.area || 'General'}</td>
                        <td>{r.fecha || 'N/A'}</td>
                        <td className="in-col" style={{ color: r.entrada !== '--:--' ? '#34d399' : '#64748b', fontWeight: 700 }}>
                          {r.entrada}
                        </td>
                        <td style={{ color: r.almuerzo !== '--:--' ? '#fbbf24' : '#64748b' }}>
                          {r.almuerzo}
                        </td>
                        <td className="out-col" style={{ color: r.salida !== '--:--' ? '#60a5fa' : '#64748b', fontWeight: 700 }}>
                          {r.salida}
                        </td>
                        <td style={{ fontWeight: 600 }}>{r.horas}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span className={`badge ${
                              r.statusCode === 'atraso' ? 'badge-danger' : 
                              r.statusCode === 'presente' ? 'badge-success' : 
                              r.statusCode === 'finalizado' ? 'badge-info' : 'badge-warning'
                            }`}>
                              {r.estado}
                            </span>
                            {r.horasExtras === 'SI' && (
                              <span className="badge badge-warning" title={r.autorizaHE || 'Horas extras registradas'}>
                                +HE (&gt;45m)
                              </span>
                            )}
                          </div>
                          {r.razonAtraso && (
                            <div style={{ fontSize: '10px', color: '#f87171', marginTop: '3px' }}>
                              ⚠️ <em>{r.razonAtraso}</em>
                            </div>
                          )}
                          {r.razonSalida && (
                            <div style={{ fontSize: '10px', color: '#60a5fa', marginTop: '3px' }}>
                              ℹ️ <em>{r.razonSalida}</em>
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary icon-btn"
                              title="Justificar Novedad"
                              onClick={() => {
                                setJustEmpId(r.id);
                                setJustFecha(r.fecha || new Date().toISOString().split('T')[0]);
                                setActiveTab('justificaciones');
                              }}
                            >
                              <FileText size={14} />
                            </button>
                            {r.telefono && (
                              <button
                                type="button"
                                className="btn btn-secondary icon-btn"
                                title={`Enviar WhatsApp a ${r.nombre}`}
                                onClick={async () => {
                                  try {
                                    await enviarNotificacionWhatsApp(
                                      r.telefono,
                                      `Hola ${r.nombre}, te saludamos de Supervisión TCONTROL respecto a tu jornada del ${r.fecha}.`
                                    );
                                    setWaToast(`WhatsApp despachado a ${r.nombre}`);
                                    setTimeout(() => setWaToast(''), 4000);
                                  } catch (err) {
                                    alert('Error al enviar WhatsApp: ' + err.message);
                                  }
                                }}
                              >
                                <Send size={14} color="#34d399" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="pagination-bar">
                <span className="pagination-info">
                  Mostrando {paginatedRecords.length} de {filteredRecords.length} registros (Página {page} de {totalPages})
                </span>
                <div className="pagination-controls">
                  <button
                    type="button"
                    className="page-btn"
                    onClick={() => setPage(p => Math.max(p - 1, 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft size={16} />
                    <span>Anterior</span>
                  </button>
                  <span className="page-current">{page}</span>
                  <button
                    type="button"
                    className="page-btn"
                    onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                    disabled={page === totalPages}
                  >
                    <span>Siguiente</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 2: HORAS EXTRAS (FUNC-SUP-004) ==================== */}
      {activeTab === 'horas_extras' && (
        <div className="glass-card tab-content-card fade-in">
          <div className="submodule-header">
            <div>
              <h3>Gestión y Aprobación de Jornadas Extraordinarias (+HE)</h3>
              <p>Revisión de colaboradores con sobretiempo laboral (&gt;45 min de jornada sobre 16:15 en laborables o 15:15 en fines de semana).</p>
            </div>
            <div className="flex gap-2 items-center">
              <span className="badge badge-warning">Candidatos a Sobretiempo: {overtimeCandidates.length}</span>
            </div>
          </div>

          {overtimeCandidates.length === 0 ? (
            <div className="table-empty">
              <CheckCircle size={36} color="#34d399" style={{ margin: '0 auto 12px' }} />
              <p>No hay registros con horas extras pendientes de validación para el período actual.</p>
            </div>
          ) : (
            <div className="table-responsive mt-4">
              <table className="asistencia-table">
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th>Fecha</th>
                    <th>Entrada</th>
                    <th>Salida</th>
                    <th>Total Jornada</th>
                    <th>Estado de Autorización</th>
                    <th>Acción del Supervisor</th>
                  </tr>
                </thead>
                <tbody>
                  {overtimeCandidates.map((row, idx) => (
                    <tr key={`${row.id}_he_${idx}`}>
                      <td>
                        <strong>{row.nombre}</strong>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>ID: {row.id} • {row.area}</div>
                      </td>
                      <td>{row.fecha}</td>
                      <td className="in-col">{row.entrada}</td>
                      <td className="out-col">{row.salida}</td>
                      <td><strong>{row.horas}</strong></td>
                      <td>
                        {row.horasExtras === 'SI' ? (
                          <span className="badge badge-success flex items-center gap-1">
                            <CheckCircle size={12} /> APROBADA ({row.autorizaHE || 'SUPERVISOR'})
                          </span>
                        ) : (
                          <span className="badge badge-warning flex items-center gap-1">
                            <Clock size={12} /> PENDIENTE DE REVISIÓN
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn btn-success text-xs py-1 px-3"
                            onClick={() => handleApproveOvertime(row)}
                            disabled={heActionLoading === row.id}
                          >
                            <Check size={14} />
                            <span>Aprobar</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger text-xs py-1 px-3"
                            onClick={() => handleRejectOvertime(row)}
                            disabled={heActionLoading === row.id}
                          >
                            <X size={14} />
                            <span>Rechazar</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: JUSTIFICACIONES LABORALES (FUNC-SUP-003) ==================== */}
      {activeTab === 'justificaciones' && (
        <div className="grid grid-2 gap-4 fade-in">
          {/* Form */}
          <div className="glass-card tab-content-card">
            <h3 className="mb-2">Registrar Justificación Laboral</h3>
            <p className="text-xs text-slate-400 mb-4">
              Regulariza atrasos, salidas anticipadas, faltas médicas o calamidades domésticas para cómputo de nómina.
            </p>

            {justMsg && (
              <div className="p-3 mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs">
                {justMsg}
              </div>
            )}

            <form onSubmit={handleSubmitJustification} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Colaborador:</label>
                <select
                  className="input-field w-full mt-1"
                  value={justEmpId}
                  onChange={(e) => setJustEmpId(e.target.value)}
                  required
                >
                  <option value="">-- Seleccionar colaborador --</option>
                  {empleados.map(emp => (
                    <option key={emp.id || emp.id_empleado} value={emp.id || emp.id_empleado}>
                      {emp.id || emp.id_empleado} - {emp.nombre || emp.nombres} ({emp.area || 'General'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Fecha de la Novedad:</label>
                  <input
                    type="date"
                    className="input-field w-full mt-1"
                    value={justFecha}
                    onChange={(e) => setJustFecha(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300">Minutos Justificados:</label>
                  <input
                    type="number"
                    min="1"
                    max="480"
                    className="input-field w-full mt-1"
                    value={justMinutos}
                    onChange={(e) => setJustMinutos(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Tipo de Novedad:</label>
                <select
                  className="input-field w-full mt-1"
                  value={justTipo}
                  onChange={(e) => setJustTipo(e.target.value)}
                >
                  <option value="ATRASO">Atraso en Entrada</option>
                  <option value="SALIDA_ANTICIPADA">Salida Anticipada</option>
                  <option value="FALTA_JUSTIFICADA">Falta / Ausencia Completa</option>
                  <option value="PERMISO_LABORAL">Permiso Especial Pre-aprobado</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Causal Legal / Motivo:</label>
                <select
                  className="input-field w-full mt-1"
                  value={justMotivo}
                  onChange={(e) => setJustMotivo(e.target.value)}
                >
                  <option value="MÉDICA (Certificado IESS / Médico Empresa)">MÉDICA (Certificado IESS / Médico de Empresa)</option>
                  <option value="CALAMIDAD DOMÉSTICA (Fuerza Mayor / Familiar)">CALAMIDAD DOMÉSTICA (Fuerza Mayor Comprobada)</option>
                  <option value="COMISIÓN DE SERVICIOS (Terreno / Cliente)">COMISIÓN DE SERVICIOS (Labores Externas en Cliente)</option>
                  <option value="FALLA DE TRANSPORTE (Tráfico Severo / Desperfecto)">FALLA DE TRANSPORTE (Tráfico Mayor / Vía Cerrada)</option>
                  <option value="PERMISO PERSONAL APROBADO">PERMISO PERSONAL APROBADO</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Observaciones y Respaldo:</label>
                <textarea
                  className="input-field w-full mt-1"
                  rows={3}
                  placeholder="Ej: Presenta certificado médico del IESS No. 58921..."
                  value={justObs}
                  onChange={(e) => setJustObs(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary mt-2"
                disabled={justSaving}
              >
                {justSaving ? 'Guardando en Base de Datos...' : 'Guardar y Regularizar Novedad'}
              </button>
            </form>
          </div>

          {/* Guidelines and Audit info */}
          <div className="glass-card tab-content-card">
            <h3 className="mb-2">Normativa de Justificaciones (Art. 34 Reglamento Interno)</h3>
            <div className="space-y-3 text-xs text-slate-300 mt-4 leading-relaxed">
              <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                <strong className="text-amber-300">Atrasos Matutinos (&gt;07:45):</strong>
                <p className="mt-1 text-slate-400">Todo ingreso posterior al límite de gracia debe justificarse con certificado o memo de jefatura de área. Máximo 60 minutos de tolerancia mensual.</p>
              </div>

              <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                <strong className="text-blue-300">Salidas Anticipadas (&lt;16:15):</strong>
                <p className="mt-1 text-slate-400">Requieren autorización previa por escrito o confirmación verbal del supervisor antes del timbrado.</p>
              </div>

              <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                <strong className="text-emerald-300">Certificados Médicos IESS:</strong>
                <p className="mt-1 text-slate-400">Tienen plazo de entrega legal de hasta 48 horas tras su emisión para no generar descuento en nómina.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 4: DIRECTORIO DE PERSONAL & LOPDP (FUNC-SUP-005) ==================== */}
      {activeTab === 'directorio' && (
        <div className="glass-card tab-content-card fade-in">
          <div className="submodule-header">
            <div>
              <h3>Catálogo de Personal & Custodia Patronal LOPDP</h3>
              <p>Mantenimiento de colaboradores, reseteo de claves PIN y configuración de geocercas base.</p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Filtrar por nombre, ID o cargo..."
                className="input-field text-xs py-1.5 px-3"
                value={dirSearch}
                onChange={(e) => setDirSearch(e.target.value)}
              />
              <select
                className="input-field text-xs py-1.5"
                value={dirAreaFilter}
                onChange={(e) => setDirAreaFilter(e.target.value)}
              >
                <option value="todos">Todas las Áreas</option>
                {areasList.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          {selectedColabForCoords && (
            <div className="p-4 mb-4 rounded-xl border border-blue-500/30 bg-blue-500/10 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <strong className="text-sm text-blue-300">
                  Asignar Geocerca Personalizada a: {selectedColabForCoords.nombre || selectedColabForCoords.nombres}
                </strong>
                <button type="button" onClick={() => setSelectedColabForCoords(null)} className="text-slate-400 hover:text-white">✕</button>
              </div>
              <p className="text-xs text-slate-400">Configura coordenadas fijas para colaboradores asignados a campamentos o teletrabajo.</p>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  step="0.000001"
                  placeholder="Latitud (ej: -0.129202)"
                  className="input-field text-xs"
                  value={customLat}
                  onChange={(e) => setCustomLat(e.target.value)}
                />
                <input
                  type="number"
                  step="0.000001"
                  placeholder="Longitud (ej: -78.477511)"
                  className="input-field text-xs"
                  value={customLng}
                  onChange={(e) => setCustomLng(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary text-xs py-1.5 px-3"
                  onClick={() => handleSaveBaseCoords(selectedColabForCoords)}
                >
                  Guardar Geocerca
                </button>
              </div>
            </div>
          )}

          <div className="table-responsive mt-3">
            <table className="asistencia-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Colaborador</th>
                  <th>Área / Departamento</th>
                  <th>Cargo</th>
                  <th>Teléfono</th>
                  <th>Seguridad & Opciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredDirectorio.slice(0, 50).map((emp, idx) => {
                  const id = emp.id || emp.id_empleado;
                  return (
                    <tr key={`${id}_dir_${idx}`}>
                      <td className="id-col">{id}</td>
                      <td>
                        <strong>{emp.nombre || emp.nombres}</strong>
                      </td>
                      <td>{emp.area || emp.departamento || 'General'}</td>
                      <td>{emp.cargo || 'Colaborador'}</td>
                      <td>{emp.telefono || 'No registrado'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary text-xs py-1 px-2.5 flex items-center gap-1"
                            title="Resetear PIN del colaborador"
                            onClick={() => handleResetPin(emp)}
                          >
                            <KeyRound size={13} />
                            <span>Reset PIN</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary text-xs py-1 px-2.5 flex items-center gap-1"
                            title="Asignar coordenadas de base específica"
                            onClick={() => {
                              setSelectedColabForCoords(emp);
                              setCustomLat('-0.129202');
                              setCustomLng('-78.477511');
                            }}
                          >
                            <MapPin size={13} />
                            <span>Geocerca</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== TAB 5: ALMUERZOS EXTRA & INVITADOS (FUNC-SUP-008) ==================== */}
      {activeTab === 'invitados' && (
        <div className="grid grid-2 gap-4 fade-in">
          <div className="glass-card tab-content-card">
            <h3 className="mb-2">Registrar Comensal Extraordinario (Invitado)</h3>
            <p className="text-xs text-slate-400 mb-4">
              Autoriza raciones de alimentación para visitas técnicas, auditores, proveedores o clientes externos con cargo a centro de costos.
            </p>

            <form onSubmit={handleAddGuest} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Nombre de la Visita:</label>
                <input
                  type="text"
                  placeholder="Ej: Ing. Marco Morales"
                  className="input-field w-full mt-1"
                  value={invNombre}
                  onChange={(e) => setInvNombre(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Empresa / Procedencia:</label>
                <input
                  type="text"
                  placeholder="Ej: Auditoría KPMG / Soporte ABB"
                  className="input-field w-full mt-1"
                  value={invEmpresa}
                  onChange={(e) => setInvEmpresa(e.target.value)}
                />
              </div>

              <div className="grid grid-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Tipo de Menú:</label>
                  <select
                    className="input-field w-full mt-1"
                    value={invMenu}
                    onChange={(e) => setInvMenu(e.target.value)}
                  >
                    <option value="Normal">Menú Normal</option>
                    <option value="Dieta">Menú Dieta / Hipocalórico</option>
                    <option value="Vegetariano">Menú Vegetariano</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Centro de Costos:</label>
                  <select
                    className="input-field w-full mt-1"
                    value={invCentroCosto}
                    onChange={(e) => setInvCentroCosto(e.target.value)}
                  >
                    <option value="OPERACIONES">OPERACIONES</option>
                    <option value="TI">TI / SISTEMAS</option>
                    <option value="ADMINISTRACION">ADMINISTRACIÓN</option>
                    <option value="MANTENIMIENTO">MANTENIMIENTO</option>
                    <option value="GERENCIA">GERENCIA GENERAL</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Motivo de la Visita:</label>
                <input
                  type="text"
                  placeholder="Ej: Pruebas de relevadores de protección"
                  className="input-field w-full mt-1"
                  value={invMotivo}
                  onChange={(e) => setInvMotivo(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-warning mt-2">
                <Utensils size={15} />
                <span>Autorizar Almuerzo de Invitado</span>
              </button>
            </form>
          </div>

          <div className="glass-card tab-content-card">
            <h3 className="mb-2">Invitados Autorizados Hoy ({invitadosList.length})</h3>
            <p className="text-xs text-slate-400 mb-3">Notificados a la línea de despacho de Catering.</p>

            {invitadosList.length === 0 ? (
              <div className="table-empty">
                <Utensils size={32} color="#64748b" style={{ margin: '0 auto 8px' }} />
                <p>No se han registrado visitas para el almuerzo el día de hoy.</p>
              </div>
            ) : (
              <div className="space-y-2 mt-2">
                {invitadosList.map((g, i) => (
                  <div key={`${g.id}_${i}`} className="p-3 bg-white/5 rounded-lg border border-white/10 flex justify-between items-center">
                    <div>
                      <strong>{g.nombre}</strong>
                      <div className="text-xs text-slate-400">{g.empresa} • Centro: <span className="text-amber-300">{g.centroCosto}</span></div>
                      <div className="text-xs text-slate-500">Motivo: {g.motivo}</div>
                    </div>
                    <div className="text-right">
                      <span className="badge badge-warning">{g.menu}</span>
                      <div className="text-xs text-slate-400 mt-1">{g.hora} hrs</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB 6: DISEÑADOR DE REPORTES (FUNC-SUP-006) ==================== */}
      {activeTab === 'reportes' && (
        <div className="glass-card tab-content-card fade-in">
          <div className="submodule-header">
            <div>
              <h3>Diseñador Dinámico de Reportes Institucionales</h3>
              <p>Selecciona las columnas deseadas y genera un archivo Microsoft Excel (.xlsx) con formato oficial corporativo.</p>
            </div>
            <button
              type="button"
              className="btn btn-success"
              onClick={handleExportCustomExcel}
            >
              <Download size={16} />
              <span>Generar y Descargar Excel (.xlsx)</span>
            </button>
          </div>

          <div className="my-4">
            <label className="text-xs font-semibold text-slate-300 block mb-2">Columnas Activas en el Reporte:</label>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'id', label: 'ID Empleado' },
                { key: 'nombre', label: 'Nombre Completo' },
                { key: 'area', label: 'Área / Departamento' },
                { key: 'cargo', label: 'Cargo Laboral' },
                { key: 'fecha', label: 'Fecha' },
                { key: 'entrada', label: 'Hora Entrada' },
                { key: 'almuerzo', label: 'Hora Almuerzo' },
                { key: 'salida', label: 'Hora Salida' },
                { key: 'horas', label: 'Horas Trabajadas' },
                { key: 'estado', label: 'Estado de Asistencia' },
                { key: 'razonAtraso', label: 'Motivo de Atraso' },
                { key: 'razonSalida', label: 'Motivo Salida Anticipada' },
                { key: 'horasExtras', label: 'Horas Extras (+HE)' },
                { key: 'ubicacion', label: 'Ubicación GPS' }
              ].map(col => (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => toggleColumn(col.key)}
                  className={`pill-btn ${selectedColumns[col.key] ? 'active' : ''}`}
                >
                  {selectedColumns[col.key] ? '✓ ' : '+ '} {col.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs text-slate-300">
            📊 El reporte incluirá los <strong>{filteredRecords.length} colaboradores</strong> filtrados bajo el período actual (<em>{dateFilter.toUpperCase()}</em>).
          </div>
        </div>
      )}

      {/* ==================== TAB 7: CONSOLA WHATSAPP MASIVA (FUNC-SUP-007) ==================== */}
      {activeTab === 'whatsapp' && (
        <div className="grid grid-2 gap-4 fade-in">
          <div className="glass-card tab-content-card">
            <h3 className="mb-2">Centro de Emisión Masiva por WhatsApp</h3>
            <p className="text-xs text-slate-400 mb-4">
              Envía avisos de timbrado a colaboradores ausentes, alertas de regularización de atrasos o comunicados institucionales.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300">Grupo Destinatario:</label>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    className={`pill-btn ${waMode === 'ausentes' ? 'active' : ''}`}
                    onClick={() => setWaMode('ausentes')}
                  >
                    Ausentes Hoy ({stats.sinMarcarHoy})
                  </button>
                  <button
                    type="button"
                    className={`pill-btn ${waMode === 'atrasos' ? 'active' : ''}`}
                    onClick={() => setWaMode('atrasos')}
                  >
                    Con Atraso ({stats.atrasos})
                  </button>
                  <button
                    type="button"
                    className={`pill-btn ${waMode === 'todos' ? 'active' : ''}`}
                    onClick={() => setWaMode('todos')}
                  >
                    Todos ({empleados.length})
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300">Plantilla Institucional:</label>
                <select
                  className="input-field w-full mt-1"
                  value={waTemplate}
                  onChange={(e) => setWaTemplate(e.target.value)}
                >
                  <option value="recordatorio_entrada">Recordatorio de Entrada (Ausentes)</option>
                  <option value="alerta_atraso">Aviso de Justificación de Atraso</option>
                  <option value="recordatorio_salida">Recordatorio de Marcación de Salida</option>
                  <option value="personalizado">Mensaje Personalizado Libre</option>
                </select>
              </div>

              {waTemplate === 'personalizado' && (
                <div>
                  <label className="text-xs font-semibold text-slate-300">Mensaje Libre (Usa {'{nombre}'} para nombre dinámico):</label>
                  <textarea
                    className="input-field w-full mt-1"
                    rows={4}
                    value={waCustomMessage}
                    onChange={(e) => setWaCustomMessage(e.target.value)}
                    placeholder="Escribe el mensaje institucional aquí..."
                  />
                </div>
              )}

              {/* Live Preview */}
              <div>
                <label className="text-xs font-semibold text-slate-300">Previsualización del Mensaje:</label>
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-emerald-200 text-xs mt-1 leading-relaxed">
                  {getWaMessageText('JUAN PÉREZ')}
                </div>
              </div>

              {waSending && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-300 text-xs">
                  Enviando: {waProgress.sent} de {waProgress.total} mensajes...
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary w-full mt-2"
                onClick={handleBroadcastWhatsApp}
                disabled={waSending || waTargetList.length === 0}
              >
                <Send size={15} />
                <span>Despachar a {waTargetList.length} Colaboradores</span>
              </button>
            </div>
          </div>

          <div className="glass-card tab-content-card">
            <h3 className="mb-2">Destinatarios Seleccionados ({waTargetList.length})</h3>
            <p className="text-xs text-slate-400 mb-3">Revisión antes de emisión:</p>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {waTargetList.map((c, i) => (
                <div key={`${c.id}_wa_${i}`} className="p-2.5 bg-white/5 rounded-lg border border-white/10 flex justify-between items-center text-xs">
                  <div>
                    <strong>{c.nombre}</strong>
                    <div className="text-slate-400">ID: {c.id} • {c.area}</div>
                  </div>
                  <span className="badge badge-secondary">{c.telefono || 'Sin celular'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 8: RADAR SATELITAL GPS (FUNC-SUP-009) ==================== */}
      {activeTab === 'mapa' && (
        <div className="glass-card tab-content-card fade-in">
          <div className="submodule-header">
            <div>
              <h3>Radar Satelital & Geomonitoreo de Personal</h3>
              <p>Validación de coordenadas GPS y radio de geocerca de 250 metros en Casa Matriz (-0.129202, -78.477511).</p>
            </div>
            <div className="flex gap-2">
              <span className="badge badge-success">En Planta (&lt;=250m): {gpsPunches.filter(p => p.enPlanta).length}</span>
              <span className="badge badge-info">En Campo (&gt;250m): {gpsPunches.filter(p => !p.enPlanta).length}</span>
            </div>
          </div>

          {gpsPunches.length === 0 ? (
            <div className="table-empty">
              <MapPin size={36} color="#64748b" style={{ margin: '0 auto 12px' }} />
              <p>No se registran marcaciones con coordenadas satelitales en el período seleccionado.</p>
            </div>
          ) : (
            <div className="table-responsive mt-3">
              <table className="asistencia-table">
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th>Coordenadas Satelitales</th>
                    <th>Distancia a Planta Central</th>
                    <th>Condición de Geocerca</th>
                    <th>Ver en Mapa</th>
                  </tr>
                </thead>
                <tbody>
                  {gpsPunches.map((p, idx) => (
                    <tr key={`${p.id}_gps_${idx}`}>
                      <td>
                        <strong>{p.nombre}</strong>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{p.cargo} • ID: {p.id}</div>
                      </td>
                      <td>
                        <code>{p.lat ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : 'N/A'}</code>
                      </td>
                      <td>
                        <strong>{p.distanciaCalculada ? `${Math.round(p.distanciaCalculada)} metros` : '--'}</strong>
                      </td>
                      <td>
                        {p.enPlanta ? (
                          <span className="badge badge-success flex items-center gap-1">
                            <CheckCircle2 size={12} /> DENTRO DE GEOCERCA (&lt;=250m)
                          </span>
                        ) : (
                          <span className="badge badge-info flex items-center gap-1">
                            <Radio size={12} /> EN CAMPO / PROYECTO EXTERNO
                          </span>
                        )}
                      </td>
                      <td>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 inline-flex"
                        >
                          <ExternalLink size={12} />
                          <span>Google Maps</span>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SCOPED COMPONENT STYLES */}
      <style>{`
        .supervisor-page {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding-bottom: 30px;
        }

        .sup-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .sup-title-wrap {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .sup-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .sup-title-wrap h1 {
          font-size: 1.35rem;
          font-weight: 700;
          color: #fff;
          margin: 0;
        }

        .sup-title-wrap p {
          font-size: 0.8rem;
          color: #94a3b8;
          margin: 2px 0 0;
        }

        .sup-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        /* Supervisor Layout with Vertical Left Sidebar */
        .supervisor-container {
          display: flex;
          gap: 20px;
          min-height: calc(100vh - 120px);
          align-items: stretch;
          width: 100%;
        }

        /* Sidebar Styling */
        .sup-sidebar {
          width: 250px;
          flex-shrink: 0;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 16px 12px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .sidebar-collapsed .sup-sidebar {
          width: 72px;
          padding: 16px 8px;
        }

        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 4px 6px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .brand-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(239, 68, 68, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .brand-info {
          flex: 1;
          min-width: 0;
        }

        .brand-info h3 {
          font-size: 0.95rem;
          font-weight: 800;
          color: #fff;
          margin: 0;
          letter-spacing: 0.5px;
        }

        .brand-info span {
          font-size: 0.7rem;
          color: #ef4444;
          font-weight: 600;
          text-transform: uppercase;
        }

        .sidebar-collapse-btn {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #94a3b8;
          border-radius: 6px;
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          margin-left: auto;
        }

        .sidebar-collapse-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
        }

        .sidebar-collapsed .sidebar-collapse-btn {
          margin: 0 auto;
        }

        /* Sidebar Navigation Items */
        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
        }

        .sidebar-nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          background: transparent;
          border: 1px solid transparent;
          color: #94a3b8;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.18s ease;
          width: 100%;
          text-align: left;
        }

        .sidebar-nav-item:hover {
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
        }

        .sidebar-nav-item.active {
          background: rgba(239, 68, 68, 0.18);
          border-color: rgba(239, 68, 68, 0.45);
          color: #fff;
        }

        .sidebar-collapsed .sidebar-nav-item {
          justify-content: center;
          padding: 12px 0;
        }

        .sidebar-collapsed .sidebar-nav-item .nav-label,
        .sidebar-collapsed .sidebar-nav-item .tab-pill {
          display: none;
        }

        .nav-label {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Sidebar Footer */
        .sidebar-footer {
          margin-top: auto;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .user-profile {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px;
        }

        .user-avatar {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: #ef4444;
          color: #fff;
          font-size: 0.75rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .user-avatar-collapsed {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: #ef4444;
          color: #fff;
          font-size: 0.72rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto;
        }

        .user-details {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .user-name {
          font-size: 0.78rem;
          font-weight: 700;
          color: #fff;
        }

        .user-role {
          font-size: 0.68rem;
          color: #64748b;
        }

        .sidebar-logout-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 8px;
          border-radius: 8px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #fca5a5;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          width: 100%;
        }

        .sidebar-logout-btn:hover {
          background: rgba(239, 68, 68, 0.25);
          color: #fff;
        }

        /* Right Workspace */
        .supervisor-main-content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        }
        .tab-pill.yellow {
          background: rgba(245, 158, 11, 0.2);
          color: #fbbf24;
        }
        .tab-pill.red {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
        }

        /* KPI Cards */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }

        .kpi-card {
          padding: 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: transform 0.2s, border-color 0.2s;
        }

        .kpi-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .kpi-card.active-filter {
          border-color: #ef4444;
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.25);
        }

        .kpi-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .kpi-icon.blue { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
        .kpi-icon.green { background: rgba(16, 185, 129, 0.15); color: #34d399; }
        .kpi-icon.yellow { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
        .kpi-icon.red { background: rgba(239, 68, 68, 0.15); color: #f87171; }

        .kpi-content {
          display: flex;
          flex-direction: column;
        }

        .kpi-label {
          font-size: 0.72rem;
          color: #94a3b8;
        }

        .kpi-value {
          font-size: 1.35rem;
          font-weight: 700;
          color: #fff;
        }

        /* Filter Card */
        .filter-card {
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .search-wrap {
          flex: 1;
          min-width: 240px;
          position: relative;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #64748b;
        }

        .search-input {
          width: 100%;
          padding-left: 36px;
          font-size: 0.85rem;
        }

        .filter-pills {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .filter-label {
          font-size: 0.78rem;
          color: #94a3b8;
          display: flex;
          align-items: center;
          gap: 4px;
          margin-right: 4px;
        }

        .pill-btn {
          padding: 5px 10px;
          border-radius: 6px;
          font-size: 0.75rem;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.2s;
        }

        .pill-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .pill-btn.active {
          background: #ef4444;
          border-color: #ef4444;
          color: #fff;
        }

        /* Tables */
        .table-card {
          padding: 16px;
        }

        .tab-content-card {
          padding: 20px;
        }

        .submodule-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 12px;
        }

        .submodule-header h3 {
          font-size: 1.1rem;
          font-weight: 700;
          color: #fff;
          margin: 0;
        }

        .submodule-header p {
          font-size: 0.8rem;
          color: #94a3b8;
          margin: 2px 0 0;
        }

        .table-responsive {
          overflow-x: auto;
        }

        .asistencia-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.82rem;
          text-align: left;
        }

        .asistencia-table th {
          padding: 10px 12px;
          color: #94a3b8;
          font-weight: 600;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .asistencia-table td {
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          color: #cbd5e1;
        }

        .asistencia-table tr:hover td {
          background: rgba(255, 255, 255, 0.03);
        }

        .table-loading, .table-empty {
          text-align: center;
          padding: 36px !important;
          color: #64748b;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .pagination-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 14px;
          padding-top: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .pagination-info {
          font-size: 0.78rem;
          color: #64748b;
        }

        .pagination-controls {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .page-btn {
          padding: 4px 8px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          font-size: 0.75rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .page-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .page-current {
          font-size: 0.78rem;
          font-weight: 700;
          color: #fff;
          padding: 0 4px;
        }

        .icon-btn {
          padding: 5px 8px;
        }

        /* Generic Grids */
        .grid-2 {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        }

        /* Emergency Protocol (FUNC-SUP-006) */
        .btn-emergency-active {
          background: linear-gradient(135deg, #ef4444, #b91c1c) !important;
          color: white !important;
          border: 1px solid rgba(255, 255, 255, 0.4) !important;
          animation: emergencyBtnPulse 1.5s infinite;
          box-shadow: 0 0 16px rgba(239, 68, 68, 0.6);
        }
        @keyframes emergencyBtnPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.03); opacity: 0.9; }
        }
        .btn-emergency-idle {
          background: rgba(239, 68, 68, 0.12) !important;
          color: #f87171 !important;
          border: 1px solid rgba(239, 68, 68, 0.3) !important;
        }
        .btn-emergency-idle:hover {
          background: rgba(239, 68, 68, 0.22) !important;
        }
        .emergency-broadcast-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          margin-bottom: 20px;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(185, 28, 28, 0.35));
          border: 1px solid rgba(239, 68, 68, 0.6);
          box-shadow: 0 4px 20px rgba(239, 68, 68, 0.3);
          flex-wrap: wrap;
        }
        .banner-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .emergency-icon-pulse {
          color: #f87171;
          animation: emergencyPulse 1.5s infinite ease-in-out;
        }
        @keyframes emergencyPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        .banner-title {
          margin: 0;
          font-size: 0.95rem;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: 0.02em;
        }
        .banner-desc {
          margin: 4px 0 0 0;
          font-size: 0.8rem;
          color: #fca5a5;
        }
        .banner-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .btn-warning-sm {
          background: #f59e0b;
          color: #000;
          font-weight: 700;
          font-size: 0.78rem;
          padding: 6px 12px;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .btn-secondary-sm {
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          font-weight: 600;
          font-size: 0.78rem;
          padding: 6px 12px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          cursor: pointer;
        }

        @media (max-width: 900px) {
          .supervisor-container {
            flex-direction: column;
          }
          .sup-sidebar {
            width: 100% !important;
          }
          .sidebar-nav {
            flex-direction: row;
            overflow-x: auto;
          }
          .sidebar-nav-item {
            width: auto;
            white-space: nowrap;
          }
          .sup-header {
            flex-direction: column;
            align-items: flex-start;
          }
          .sup-actions {
            width: 100%;
            justify-content: flex-end;
          }
        }
      `}</style>
      </div>
    </div>
  );
}
