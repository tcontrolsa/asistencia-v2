import React, { useState, useEffect } from 'react';
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
  Sparkles
} from 'lucide-react';
import * as XLSX from 'xlsx';
import PinPad from '../components/PinPad';
import { verificarPIN, obtenerDatosSupervisor } from '../services/api';

export default function SupervisorPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('tcontrol_sup_auth') === 'true';
  });
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // Supervisor Data
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('hoy'); // 'hoy', 'semana', 'mes', 'todos'
  const [stats, setStats] = useState({
    totalEmpleados: 105,
    entradasHoy: 0,
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
      if (res.valido || res.success) {
        setIsAuthenticated(true);
        sessionStorage.setItem('tcontrol_sup_auth', 'true');
        loadData();
      } else {
        setLoginError('PIN incorrecto. Acceso denegado.');
        setLoginPin('');
      }
    } catch (err) {
      // If error, check direct override or display error
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

  // Fetch data from PostgreSQL
  const loadData = async () => {
    setLoading(true);
    try {
      const res = await obtenerDatosSupervisor({ filtro: dateFilter });
      const rows = res.registros || res.asistencias || res.datos || [];
      setRecords(rows);

      // Calculate KPIs
      const hoy = new Date().toISOString().split('T')[0];
      const hoyRows = rows.filter(r => (r.fecha || '').startsWith(hoy));
      const entradas = hoyRows.filter(r => r.entrada || r.tipo === 'Entrada' || r.tipo === 'ENTRADA' || r.tipo === 'SOLO_ALMUERZO').length;
      const salidas = hoyRows.filter(r => r.salida || r.tipo === 'Salida' || r.tipo === 'SALIDA').length;
      const atrasos = hoyRows.filter(r => (r.estado || '').toLowerCase().includes('atraso')).length;

      setStats({
        totalEmpleados: res.empleados?.length || res.totalEmpleados || 105,
        entradasHoy: entradas,
        salidasHoy: salidas,
        atrasos: atrasos,
      });
    } catch (err) {
      console.error('Error al cargar datos del supervisor:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, dateFilter]);

  // Filtered rows
  const filteredRecords = records.filter(r => {
    const q = search.toLowerCase();
    const nombre = (r.nombre || r.empleado_nombre || '').toLowerCase();
    const id = String(r.id_empleado || r.id || '');
    const estado = (r.estado || '').toLowerCase();
    return nombre.includes(q) || id.includes(q) || estado.includes(q);
  });

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredRecords.length === 0) return;

    const exportData = filteredRecords.map(r => ({
      'ID Empleado': r.id_empleado || r.id,
      'Colaborador': r.nombre || r.empleado_nombre || 'N/A',
      'Fecha': r.fecha ? r.fecha.split('T')[0] : 'N/A',
      'Entrada': r.entrada || r.hora || 'N/A',
      'Salida': r.salida || '--:--',
      'Horas': r.horas_trabajadas || '--',
      'Estado': r.estado || 'Normal',
      'Ubicación': r.ubicacion || 'Central',
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
            onClick={loadData}
            disabled={loading}
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

      {/* KPI Stats Cards */}
      <div className="kpi-grid">
        <div className="glass-card kpi-card">
          <div className="kpi-icon blue">
            <Users size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Colaboradores Activos</span>
            <span className="kpi-value">{stats.totalEmpleados}</span>
          </div>
        </div>

        <div className="glass-card kpi-card">
          <div className="kpi-icon green">
            <CheckCircle size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Entradas Registradas</span>
            <span className="kpi-value">{stats.entradasHoy}</span>
          </div>
        </div>

        <div className="glass-card kpi-card">
          <div className="kpi-icon yellow">
            <Clock size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Salidas Registradas</span>
            <span className="kpi-value">{stats.salidasHoy}</span>
          </div>
        </div>

        <div className="glass-card kpi-card">
          <div className="kpi-icon red">
            <AlertCircle size={22} />
          </div>
          <div className="kpi-content">
            <span className="kpi-label">Atrasos Detectados</span>
            <span className="kpi-value">{stats.atrasos}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-card filter-card">
        <div className="search-wrap">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por colaborador, ID o estado..."
            className="input-field search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-pills">
          <span className="filter-label"><Filter size={14} /> Filtro:</span>
          {['hoy', 'semana', 'mes', 'todos'].map((filtro) => (
            <button
              key={filtro}
              type="button"
              className={`pill-btn ${dateFilter === filtro ? 'active' : ''}`}
              onClick={() => setDateFilter(filtro)}
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
                <th>Fecha</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Horas</th>
                <th>Estado</th>
                <th>Ubicación</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="table-loading">
                    <RefreshCw size={24} className="spinning" />
                    <span>Consultando base de datos PostgreSQL...</span>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="8" className="table-empty">
                    No se encontraron registros para el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, idx) => (
                  <tr key={r.id || idx}>
                    <td className="id-col">{r.id_empleado || r.empleadoId || r.id}</td>
                    <td className="name-col">{r.nombre || r.empleado_nombre || 'N/A'}</td>
                    <td>{r.fecha ? r.fecha.split('T')[0] : 'N/A'}</td>
                    <td className="in-col">
                      {r.entrada || ((r.tipo === 'ENTRADA' || r.tipo === 'Entrada' || r.tipo === 'SOLO_ALMUERZO') ? r.hora : '--:--')}
                    </td>
                    <td className="out-col">
                      {r.salida || ((r.tipo === 'SALIDA' || r.tipo === 'Salida') ? r.hora : '--:--')}
                    </td>
                    <td>{r.horas_trabajadas || r.horasExtra || '--'}</td>
                    <td>
                      <span className={`badge ${
                        (r.estado || '').toLowerCase().includes('atraso') ? 'badge-danger' : 
                        (r.estado || '').toLowerCase().includes('justific') ? 'badge-warning' : 'badge-success'
                      }`}>
                        {r.estado || r.tipo || 'Registrado'}
                      </span>
                    </td>
                    <td className="loc-col" title={r.ubicacion || r.modo || 'Oficina Central'}>
                      {r.ubicacion ? r.ubicacion.slice(0, 24) : (r.modo || 'Oficina Central')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
