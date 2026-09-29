import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  CheckCircle, 
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
  ChevronRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import PinPad from '../components/PinPad';
import { verificarPIN, obtenerDatosSupervisor, invalidarCacheSupervisor } from '../services/api';

export default function SupervisorPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('tcontrol_sup_auth') === 'true';
  });
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Supervisor Data
  const [records, setRecords] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('hoy'); // 'hoy', 'semana', 'mes', 'todos'
  const [statusFilter, setStatusFilter] = useState('todos'); // 'todos' | 'presente' | 'sin_marcar' | 'atraso' | 'finalizado'
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const [stats, setStats] = useState({
    totalEmpleados: 105,
    presentesHoy: 0,
    sinMarcarHoy: 0,
    salidasHoy: 0,
    atrasos: 0,
  });

  // Verify PIN for Supervisor Login
  const handleLogin = async () => {
    if (loginPin.length < 4 || loggingIn) return;
    setLoggingIn(true);
    setLoginError('');

    try {
      // 1058 is the administrator ID in PostgreSQL
      const res = await verificarPIN('1058', loginPin);
      if (res.valido || res.success || res.ok) {
        setIsAuthenticated(true);
        sessionStorage.setItem('tcontrol_sup_auth', 'true');
      } else {
        setLoginError('PIN incorrecto. Acceso denegado.');
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

  // Fetch data from PostgreSQL (using in-memory cache)
  const loadData = async (force = false) => {
    if (force) invalidarCacheSupervisor();
    setLoading(true);
    try {
      const res = await obtenerDatosSupervisor({}, force);
      const rows = res.registros || res.asistencias || res.datos || [];
      const emps = res.empleados || [];
      setRecords(rows);
      setEmpleados(emps);

      // Calculate KPIs for today
      const hoy = new Date().toISOString().split('T')[0];
      const hoyRows = rows.filter(r => (r.fecha || '').startsWith(hoy));
      
      const mapPunches = {};
      hoyRows.forEach(r => {
        const empId = String(r.idEmpleado || r.id_empleado || r.empleadoId || r.id || '');
        if (!mapPunches[empId]) mapPunches[empId] = [];
        mapPunches[empId].push(r);
      });

      let presCount = 0;
      let sinMarcarCount = 0;
      let salidasCount = 0;
      let atrasosCount = 0;

      emps.forEach(emp => {
        const empId = String(emp.id || emp.id_empleado || '');
        const punches = mapPunches[empId] || [];
        const ent = punches.find(r => r.tipo === 'ENTRADA' || r.tipo === 'Entrada' || r.tipo === 'SOLO_ALMUERZO');
        const sal = punches.find(r => r.tipo === 'SALIDA' || r.tipo === 'Salida');

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
        }
      });

      setStats({
        totalEmpleados: emps.length || 105,
        presentesHoy: presCount,
        sinMarcarHoy: sinMarcarCount,
        salidasHoy: salidasCount,
        atrasos: atrasosCount,
      });
    } catch (err) {
      console.error('Error al cargar datos del supervisor:', err);
    } finally {
      setLoading(false);
    }
  };

  // Only load when auth status changes; filtering is instantaneous in memory
  useEffect(() => {
    if (isAuthenticated) {
      loadData(false);
    }
  }, [isAuthenticated]);

  // Reset page when filter or search changes
  useEffect(() => {
    setPage(1);
  }, [dateFilter, statusFilter, search]);

  // Consolidated Daily Sábana (1 row per collaborator)
  const consolidatedList = useMemo(() => {
    const hoyStr = new Date().toISOString().split('T')[0];
    const ahora = new Date();
    const sieteDiasAtras = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const mesActual = hoyStr.slice(0, 7);

    if (dateFilter === 'hoy') {
      const hoyRows = records.filter(r => (r.fecha || '').startsWith(hoyStr));
      const mapPunches = {};
      hoyRows.forEach(r => {
        const empId = String(r.idEmpleado || r.id_empleado || r.empleadoId || r.id || '');
        if (!mapPunches[empId]) mapPunches[empId] = [];
        mapPunches[empId].push(r);
      });

      return empleados.map(emp => {
        const empId = String(emp.id || emp.id_empleado || '');
        const punches = mapPunches[empId] || [];

        const entradaReg = punches.find(r => r.tipo === 'ENTRADA' || r.tipo === 'Entrada' || r.tipo === 'SOLO_ALMUERZO');
        const salidaReg = punches.find(r => r.tipo === 'SALIDA' || r.tipo === 'Salida');
        const almuerzoReg = punches.find(r => r.tipo === 'ALMUERZO_SALIDA' || r.tipo === 'ALMUERZO_ENTRADA' || r.tipo === 'SOLO_ALMUERZO' || r.almuerzo === 'SI' || r.almuerzo === 'PLANTA');

        const horaEntrada = entradaReg?.hora ? entradaReg.hora.slice(0, 5) : '--:--';
        const horaSalida = salidaReg?.hora ? salidaReg.hora.slice(0, 5) : '--:--';
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
          if (tieneAlmuerzo && !punches.some(p => p.tipo === 'ALMUERZO_ENTRADA')) {
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
          fecha: hoyStr,
          entrada: horaEntrada,
          almuerzo: tieneAlmuerzo ? (almuerzoReg.hora ? almuerzoReg.hora.slice(0, 5) : 'Planta') : '--:--',
          salida: horaSalida,
          horas,
          estado,
          statusCode,
          ubicacion: entradaReg?.ubicacion || entradaReg?.modo || emp.area || 'Oficina Central'
        };
      });
    } else {
      let list = records;
      if (dateFilter === 'semana') {
        list = list.filter(r => (r.fecha || '') >= sieteDiasAtras);
      } else if (dateFilter === 'mes') {
        list = list.filter(r => (r.fecha || '').startsWith(mesActual));
      }

      const grouped = {};
      list.forEach(r => {
        const empId = String(r.idEmpleado || r.id_empleado || r.empleadoId || r.id || '');
        const f = (r.fecha || '').split('T')[0];
        const key = `${f}_${empId}`;
        if (!grouped[key]) {
          grouped[key] = {
            id: empId,
            nombre: r.nombre || r.empleado_nombre || `Colaborador ${empId}`,
            area: r.area || 'General',
            cargo: r.cargo || 'Colaborador',
            foto_url: '',
            fecha: f,
            entrada: '--:--',
            almuerzo: '--:--',
            salida: '--:--',
            horas: '--',
            estado: 'Registrado',
            statusCode: 'presente',
            ubicacion: r.ubicacion || r.modo || 'Oficina Central'
          };
        }
        if (r.tipo === 'ENTRADA' || r.tipo === 'Entrada') {
          grouped[key].entrada = r.hora ? r.hora.slice(0, 5) : '--:--';
        } else if (r.tipo === 'SALIDA' || r.tipo === 'Salida') {
          grouped[key].salida = r.hora ? r.hora.slice(0, 5) : '--:--';
        } else if (r.tipo?.includes('ALMUERZO')) {
          grouped[key].almuerzo = r.hora ? r.hora.slice(0, 5) : 'Registrado';
        }
      });

      return Object.values(grouped).sort((a, b) => (b.fecha + ' ' + b.entrada).localeCompare(a.fecha + ' ' + a.entrada));
    }
  }, [records, empleados, dateFilter]);

  // In-memory filtered and sorted rows (0ms lag!)
  const filteredRecords = useMemo(() => {
    let list = consolidatedList;

    if (dateFilter === 'hoy' && statusFilter !== 'todos') {
      if (statusFilter === 'presente') {
        list = list.filter(r => r.statusCode === 'presente' || r.statusCode === 'atraso' || r.statusCode === 'almuerzo');
      } else {
        list = list.filter(r => r.statusCode === statusFilter);
      }
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(r => {
        return (r.nombre || '').toLowerCase().includes(q) ||
               String(r.id).includes(q) ||
               (r.area || '').toLowerCase().includes(q) ||
               (r.estado || '').toLowerCase().includes(q);
      });
    }

    return list;
  }, [consolidatedList, statusFilter, dateFilter, search]);

  // Paginated records for rendering (maximum 50 rows in DOM at any time)
  const paginatedRecords = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRecords.slice(start, start + PAGE_SIZE);
  }, [filteredRecords, page]);

  const totalPages = Math.ceil(filteredRecords.length / PAGE_SIZE) || 1;

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredRecords.length === 0) return;

    const exportData = filteredRecords.map(r => ({
      'ID Empleado': r.id,
      'Colaborador': r.nombre,
      'Área': r.area,
      'Fecha': r.fecha,
      'Entrada': r.entrada,
      'Almuerzo': r.almuerzo,
      'Salida': r.salida,
      'Horas': r.horas,
      'Estado': r.estado,
      'Ubicación': r.ubicacion,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
    XLSX.writeFile(wb, `Reporte_Asistencia_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // If not logged in, show PIN Gate
  if (!isAuthenticated) {
    return (
      <div className="supervisor-auth-gate fade-in">
        <div className="glass-card auth-card">
          <div className="auth-icon-wrap">
            <Lock size={32} color="#3b82f6" />
          </div>
          <h2 className="auth-title">Panel de Supervisor</h2>
          <p className="auth-desc">Ingresa tu PIN administrativo para acceder a los reportes y gestión en tiempo real.</p>

          {loginError && (
            <div className="auth-error fade-in">
              <AlertCircle size={16} />
              <span>{loginError}</span>
            </div>
          )}

          <PinPad
            value={loginPin}
            onChange={setLoginPin}
            onConfirm={handleLogin}
            disabled={loggingIn}
            maxLength={6}
          />
        </div>

        <style>{`
          .supervisor-auth-gate {
            min-height: calc(100vh - 120px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
          }
          .auth-card {
            width: 100%;
            max-width: 400px;
            padding: 36px 28px;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
          }
          .auth-icon-wrap {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: rgba(59, 130, 246, 0.12);
            border: 1px solid rgba(59, 130, 246, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .auth-title {
            font-family: var(--font-display);
            font-size: 1.5rem;
            color: #ffffff;
            font-weight: 700;
          }
          .auth-desc {
            font-size: 0.88rem;
            color: var(--text-muted);
            line-height: 1.5;
            max-width: 320px;
          }
          .auth-error {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 14px;
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: var(--radius-sm);
            color: #f87171;
            font-size: 0.82rem;
            width: 100%;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="supervisor-layout fade-in">
      {/* Top Header & Actions */}
      <div className="sup-header">
        <div>
          <h2 className="sup-title">Panel de Control & Supervisión</h2>
          <p className="sup-subtitle">Datos en vivo conectados a PostgreSQL (Docker)</p>
        </div>

        <div className="sup-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => loadData(true)}
            disabled={loading}
            title="Recargar datos frescos de PostgreSQL"
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            <span>Actualizar</span>
          </button>

          <button
            type="button"
            className="btn btn-success"
            onClick={handleExportExcel}
            disabled={filteredRecords.length === 0}
          >
            <Download size={16} />
            <span>Exportar Excel</span>
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

      {/* KPI Stats Cards (Interactive Filters) */}
      <div className="kpi-grid">
        <div 
          className={`glass-card kpi-card clickable ${statusFilter === 'todos' ? 'active-filter' : ''}`}
          onClick={() => setStatusFilter('todos')}
          title="Ver todos los colaboradores"
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
          title="Filtrar colaboradores en planta"
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
          title="Filtrar colaboradores sin marcación hoy"
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
          title="Filtrar colaboradores con atraso"
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
          title="Filtrar colaboradores que ya marcaron salida"
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

      {/* Filter and Search Bar */}
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

        <div className="filter-pills">
          <span className="filter-label"><Filter size={14} /> Período:</span>
          {['hoy', 'semana', 'mes', 'todos'].map((filtro) => (
            <button
              key={filtro}
              type="button"
              className={`pill-btn ${dateFilter === filtro ? 'active' : ''}`}
              onClick={() => {
                setDateFilter(filtro);
                setStatusFilter('todos');
              }}
            >
              {filtro === 'hoy' ? 'Hoy' : filtro === 'semana' ? 'Esta Semana' : filtro === 'mes' ? 'Este Mes' : 'Todos'}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <div className="glass-card table-card">
        <div className="table-responsive">
          <table className="sup-table">
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
                <th>Ubicación</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
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
                  <tr key={r.id || idx}>
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
                      <span className={`badge ${
                        r.statusCode === 'atraso' ? 'badge-danger' : 
                        r.statusCode === 'presente' ? 'badge-success' : 
                        r.statusCode === 'almuerzo' ? 'badge-warning' : 
                        r.statusCode === 'finalizado' ? 'badge-info' : 'badge-neutral'
                      }`} style={
                        r.statusCode === 'sin_marcar' ? { background: 'rgba(100, 116, 139, 0.15)', color: '#94a3b8' } :
                        r.statusCode === 'finalizado' ? { background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' } : {}
                      }>
                        {r.estado}
                      </span>
                    </td>
                    <td className="loc-col" title={r.ubicacion || 'Oficina Central'}>
                      {r.ubicacion ? r.ubicacion.slice(0, 24) : 'Oficina Central'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>


        {/* Pagination bar */}
        {totalPages > 1 && (
          <div className="table-pagination">
            <span className="pagination-info">
              Mostrando {((page - 1) * PAGE_SIZE) + 1} - {Math.min(page * PAGE_SIZE, filteredRecords.length)} de {filteredRecords.length} registros
            </span>
            <div className="pagination-controls">
              <button
                type="button"
                className="page-btn"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft size={16} />
                <span>Anterior</span>
              </button>
              <span className="page-current">Página {page} de {totalPages}</span>
              <button
                type="button"
                className="page-btn"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <span>Siguiente</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .supervisor-layout {
          max-width: 1400px;
          margin: 24px auto;
          padding: 0 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .sup-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }
        .sup-title {
          font-family: var(--font-display);
          font-size: 1.55rem;
          font-weight: 800;
          color: #ffffff;
        }
        .sup-subtitle {
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .sup-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .logout-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.4);
          color: #f87171;
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .kpi-card {
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .kpi-card.clickable {
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .kpi-card.clickable:hover {
          transform: translateY(-2px);
          border-color: rgba(59, 130, 246, 0.4);
        }
        .kpi-card.active-filter {
          background: rgba(59, 130, 246, 0.12);
          border: 1.5px solid rgba(59, 130, 246, 0.5);
          box-shadow: 0 4px 14px rgba(59, 130, 246, 0.2);
        }
        .kpi-icon {
          width: 52px;
          height: 52px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .kpi-icon.blue {
          background: rgba(59, 130, 246, 0.15);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.3);
        }
        .kpi-icon.green {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .kpi-icon.yellow {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .kpi-icon.red {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .kpi-content {
          display: flex;
          flex-direction: column;
        }
        .kpi-label {
          font-size: 0.78rem;
          color: var(--text-dim);
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 0.04em;
        }
        .kpi-value {
          font-family: var(--font-display);
          font-size: 1.85rem;
          font-weight: 800;
          color: #ffffff;
          line-height: 1.1;
          margin-top: 2px;
        }

        .filter-card {
          padding: 14px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .search-wrap {
          position: relative;
          flex: 1;
          min-width: 260px;
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
        .filter-pills {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .filter-label {
          font-size: 0.8rem;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .pill-btn {
          padding: 6px 14px;
          font-size: 0.82rem;
          font-weight: 600;
          border-radius: var(--radius-full);
          border: 1px solid var(--border-color);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .pill-btn:hover {
          color: var(--text-main);
          background: rgba(255, 255, 255, 0.08);
        }
        .pill-btn.active {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }

        .table-card {
          padding: 0;
          overflow: hidden;
        }
        .table-responsive {
          overflow-x: auto;
        }
        .sup-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.88rem;
          text-align: left;
        }
        .sup-table th {
          background: rgba(255, 255, 255, 0.03);
          padding: 14px 18px;
          font-size: 0.76rem;
          font-weight: 700;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid var(--border-color);
        }
        .sup-table td {
          padding: 14px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          color: var(--text-muted);
        }
        .sup-table tbody tr:hover {
          background: rgba(255, 255, 255, 0.02);
        }
        .id-col {
          font-family: monospace;
          color: #60a5fa;
          font-weight: 600;
        }
        .name-col {
          color: var(--text-main);
          font-weight: 600;
        }
        .in-col {
          color: #34d399;
          font-family: monospace;
          font-weight: 600;
        }
        .out-col {
          color: #fbbf24;
          font-family: monospace;
        }
        .loc-col {
          font-size: 0.78rem;
          color: var(--text-dim);
        }
        .table-loading, .table-empty {
          text-align: center;
          padding: 48px !important;
          color: var(--text-dim);
        }
        .table-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }
        .spinning {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .table-pagination {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
          flex-wrap: wrap;
          gap: 12px;
        }
        .pagination-info {
          font-size: 0.8rem;
          color: var(--text-dim);
        }
        .pagination-controls {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .page-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-main);
          font-size: 0.82rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .page-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.12);
        }
        .page-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .page-current {
          font-size: 0.82rem;
          color: var(--text-dim);
          font-weight: 600;
        }

        @media (max-width: 900px) {
          .kpi-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .sup-header {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
