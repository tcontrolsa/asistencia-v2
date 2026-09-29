import React, { useState, useEffect, useMemo } from 'react';
import { 
  Utensils, 
  Coffee, 
  Check, 
  Search, 
  Calendar, 
  User, 
  CheckCircle2, 
  Clock, 
  Lock, 
  AlertTriangle,
  RefreshCw,
  Flame,
  Salad
} from 'lucide-react';
import { obtenerColaboradores, registrarAsistencia, despacharAlmuerzo, obtenerDatosSupervisor, getRecordEmpId } from '../services/api';
import { esCorteAlmuerzoVencido, TCONTROL_CONFIG } from '../services/rules';

export default function CateringPage() {
  const [colaboradores, setColaboradores] = useState([]);
  const [registrosHoy, setRegistrosHoy] = useState([]);
  const [search, setSearch] = useState('');
  const [filterMenu, setFilterMenu] = useState('todos'); // 'todos' | 'Normal' | 'Dieta' | 'Vegetariano'
  const [filterStatus, setFilterStatus] = useState('todos'); // 'todos' | 'pendientes' | 'servidos'
  const [loading, setLoading] = useState(true);
  const [lastMarked, setLastMarked] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Live timer
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [colabs, supData] = await Promise.all([
        obtenerColaboradores(true),
        obtenerDatosSupervisor({ filtro: 'hoy' }, true),
      ]);
      setColaboradores(colabs);
      const hoy = new Date().toISOString().split('T')[0];
      const all = supData.registros || supData.asistencias || supData.datos || [];
      setRegistrosHoy(all.filter(r => (r.fecha || '').startsWith(hoy)));
    } catch (err) {
      console.error('Error cargando catering:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Map lunch status per collaborator
  const colabLunchList = useMemo(() => {
    return colaboradores.map(c => {
      const empId = String(c.id || c.id_empleado || c.cedula || '');
      const punches = registrosHoy.filter(r => getRecordEmpId(r) === empId);
      
      const lunchPunch = punches.find(r => 
        r.tipo === 'ALMUERZO_SALIDA' || 
        r.tipo === 'Almuerzo_Salida' || 
        r.tipo === 'ALMUERZO_RESERVA' ||
        r.tipo === 'SOLO_ALMUERZO' ||
        r.almuerzo === 'SI' ||
        r.almuerzo === 'PLANTA'
      );

      const servido = Boolean(
        punches.some(r => r.tipo === 'ALMUERZO_SALIDA' || r.tipo === 'Almuerzo_Salida' || r.entregado === true)
      );

      const horaEntrega = punches.find(r => r.tipo === 'ALMUERZO_SALIDA' || r.tipo === 'Almuerzo_Salida')?.hora;
      const opcionMenu = lunchPunch?.opcion_menu || c.preferencia_menu || 'Normal';

      return {
        ...c,
        empId,
        nombre: c.nombre || c.nombres,
        servido,
        horaEntrega: horaEntrega ? horaEntrega.slice(0, 5) : null,
        opcionMenu,
        tienePedido: Boolean(lunchPunch),
      };
    });
  }, [colaboradores, registrosHoy]);

  // Dispatch lunch (RULE-ALM-002: Check double dispatch)
  const handleRegisterLunch = async (colab) => {
    setErrorMessage(null);

    // Strict Double Dispatch Check
    if (colab.servido) {
      setErrorMessage(`El colaborador ${colab.nombre} ya recibió su almuerzo hoy a las ${colab.horaEntrega || 'hora registrada'}. Prohibida la doble entrega (RULE-ALM-002).`);
      setTimeout(() => setErrorMessage(null), 5000);
      return;
    }

    const now = new Date();
    const horaStr = now.toLocaleTimeString('es-EC', { hour12: false });
    const fechaStr = now.toISOString().split('T')[0];

    try {
      await registrarAsistencia({
        empleadoId: colab.empId,
        idEmpleado: colab.empId,
        id_empleado: colab.empId,
        nombre: colab.nombre,
        tipo: 'Almuerzo_Salida',
        hora: horaStr,
        fecha: fechaStr,
        opcion_menu: colab.opcionMenu,
        entregado: true,
        ubicacion: 'Comedor Central (Línea de Servicio)',
      });

      const entry = { id: colab.empId, nombre: colab.nombre, hora: horaStr.slice(0, 5), menu: colab.opcionMenu };
      setLastMarked(entry);
      setTimeout(() => setLastMarked(null), 4000);

      // Refresh list
      await loadData();
    } catch (err) {
      setErrorMessage('Error al registrar entrega: ' + err.message);
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  // KPIs
  const totalServidos = colabLunchList.filter(c => c.servido).length;
  const countNormal = colabLunchList.filter(c => c.opcionMenu === 'Normal').length;
  const countDieta = colabLunchList.filter(c => c.opcionMenu === 'Dieta').length;
  const countVeg = colabLunchList.filter(c => c.opcionMenu === 'Vegetariano').length;

  const filtered = colabLunchList.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = c.nombre.toLowerCase().includes(q) || c.empId.includes(q);
    const matchMenu = filterMenu === 'todos' || c.opcionMenu === filterMenu;
    const matchStatus = 
      filterStatus === 'todos' 
        ? true 
        : filterStatus === 'servidos' 
        ? c.servido 
        : !c.servido;
    return matchSearch && matchMenu && matchStatus;
  });

  const isCutoffPassed = esCorteAlmuerzoVencido(currentTime);

  return (
    <div className="catering-layout fade-in">
      <div className="catering-header">
        <div>
          <h2 className="section-title">Terminal de Comedor & Catering</h2>
          <p className="section-subtitle">Aprovisionamiento y despacho de raciones en tiempo real (FN-05)</p>
        </div>

        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
            isCutoffPassed 
              ? 'bg-rose-500/15 border-rose-500/30 text-rose-300' 
              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
          }`}>
            {isCutoffPassed ? <Lock size={14} /> : <Clock size={14} />}
            <span>{isCutoffPassed ? 'Corte Cerrado (09:30 AM)' : 'Recepción Abierta'}</span>
          </div>

          <div className="catering-badge">
            <Utensils size={18} color="#f59e0b" />
            <span>Comedor Central</span>
          </div>
        </div>
      </div>

      {lastMarked && (
        <div className="last-marked-toast fade-in">
          <CheckCircle2 size={24} color="#10b981" />
          <div>
            <strong>Almuerzo Despachado: {lastMarked.nombre} ({lastMarked.menu})</strong>
            <p>Registrado en línea de servicio a las {lastMarked.hora} hrs</p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/15 text-rose-300 flex items-center gap-2 text-sm fade-in">
          <AlertTriangle size={20} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-4 gap-3">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold">
            <Utensils size={20} />
          </div>
          <div>
            <span className="text-xs text-slate-400 uppercase font-semibold">Total Raciones Servidas</span>
            <div className="text-xl font-bold text-white">{totalServidos} / {colaboradores.length}</div>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold">
            <Flame size={20} />
          </div>
          <div>
            <span className="text-xs text-slate-400 uppercase font-semibold">Menú Normal</span>
            <div className="text-xl font-bold text-white">{countNormal}</div>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold">
            <Salad size={20} />
          </div>
          <div>
            <span className="text-xs text-slate-400 uppercase font-semibold">Menú Dieta</span>
            <div className="text-xl font-bold text-white">{countDieta}</div>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center font-bold">
            <Salad size={20} />
          </div>
          <div>
            <span className="text-xs text-slate-400 uppercase font-semibold">Vegetariano</span>
            <div className="text-xl font-bold text-white">{countVeg}</div>
          </div>
        </div>
      </div>

      <div className="catering-grid">
        {/* Left: Quick Register List */}
        <div className="glass-card c-card">
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <div className="search-wrap flex-1 min-w-[240px]">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar colaborador para servir almuerzo..."
                className="input-field search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-1.5">
              {['todos', 'pendientes', 'servidos'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFilterStatus(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all border ${
                    filterStatus === st
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="c-list">
            {loading ? (
              <div className="empty-state">
                <RefreshCw size={24} className="spinning text-amber-400" />
                <p className="mt-2">Cargando nómina y consumos de comedor...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <p>No se encontraron registros con los filtros seleccionados.</p>
              </div>
            ) : (
              filtered.map((c, idx) => (
                <div key={`${c.empId}_${idx}`} className="c-item">
                  <div className="c-avatar">
                    <User size={20} color="#94a3b8" />
                  </div>
                  <div className="c-info">
                    <h4>{c.nombre}</h4>
                    <span className="text-xs text-slate-400">ID: {c.empId} • Plato: <strong className="text-amber-400">{c.opcionMenu}</strong></span>
                  </div>

                  <div className="ml-auto flex items-center gap-3">
                    {c.servido ? (
                      <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                        <CheckCircle2 size={13} /> Entregado ({c.horaEntrega})
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-warning c-btn"
                        onClick={() => handleRegisterLunch(c)}
                      >
                        <Utensils size={15} />
                        <span>Despachar Plato</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: History served today */}
        <div className="glass-card c-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="c-history-title">Despachos Confirmados ({totalServidos})</h3>
            <button
              type="button"
              onClick={loadData}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
            >
              <RefreshCw size={12} /> Refrescar
            </button>
          </div>

          <div className="c-history-list">
            {colabLunchList.filter(c => c.servido).length === 0 ? (
              <div className="empty-state">
                <Coffee size={32} color="#6b7280" />
                <p>Aún no se han despachado almuerzos hoy.</p>
              </div>
            ) : (
              colabLunchList.filter(c => c.servido).map((h, idx) => (
                <div key={`${h.empId}_${idx}`} className="c-history-item fade-in">
                  <div>
                    <strong>{h.nombre}</strong>
                    <span className="c-h-id">ID: {h.empId} • {h.opcionMenu}</span>
                  </div>
                  <span className="badge badge-warning">{h.horaEntrega}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <style>{`
        .catering-layout {
          max-width: 1200px;
          margin: 24px auto;
          padding: 0 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .catering-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }
        .catering-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: var(--radius-full);
          font-weight: 600;
          font-size: 0.85rem;
          color: #fcd34d;
        }
        .last-marked-toast {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 20px;
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.4);
          border-radius: var(--radius-md);
          color: #ffffff;
        }
        .catering-grid {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 20px;
          min-height: 520px;
        }
        .c-card {
          padding: 20px;
          display: flex;
          flex-direction: column;
        }
        .c-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 560px;
        }
        .c-item {
          display: flex;
          align-items: center;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: var(--radius-md);
        }
        .c-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 12px;
        }
        .c-info h4 {
          font-size: 0.9rem;
          font-weight: 600;
          color: #ffffff;
        }
        .c-btn {
          padding: 8px 14px;
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .c-history-title {
          font-size: 1rem;
          font-weight: 700;
          color: #ffffff;
        }
        .c-history-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 560px;
        }
        .c-history-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: var(--radius-md);
        }
        .c-h-id {
          display: block;
          font-size: 0.75rem;
          color: var(--text-dim);
        }
        .badge-warning {
          background: rgba(245, 158, 11, 0.2);
          color: #fcd34d;
          border: 1px solid rgba(245, 158, 11, 0.4);
          padding: 4px 8px;
          border-radius: var(--radius-full);
          font-size: 0.75rem;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
