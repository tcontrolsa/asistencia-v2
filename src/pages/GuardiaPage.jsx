import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  UserCheck, 
  Search, 
  Users, 
  AlertCircle, 
  Clock, 
  MapPin, 
  UserPlus, 
  CheckCircle2, 
  X, 
  FileText,
  RefreshCw,
  LogIn,
  LogOut,
  Coffee
} from 'lucide-react';
import { obtenerColaboradores, obtenerDatosSupervisor, registrarMarcacionAsistida, getRecordEmpId } from '../services/api';

export default function GuardiaPage() {
  const [colaboradores, setColaboradores] = useState([]);
  const [asistenciasHoy, setAsistenciasHoy] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Assisted Punch States (FN-04)
  const [selectedColabForPunch, setSelectedColabForPunch] = useState(null);
  const [assistedAction, setAssistedAction] = useState('ENTRADA');
  const [assistedReason, setAssistedReason] = useState('Sin smartphone / Batería agotada');
  const [assistedNotes, setAssistedNotes] = useState('');
  const [punchProcessing, setPunchProcessing] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  const reloadData = async () => {
    try {
      setLoading(true);
      const [colabs, supData] = await Promise.all([
        obtenerColaboradores(true),
        obtenerDatosSupervisor({ filtro: 'hoy' }, true),
      ]);
      setColaboradores(colabs);
      const hoy = new Date().toISOString().split('T')[0];
      const all = supData.registros || supData.asistencias || supData.datos || [];
      setAsistenciasHoy(all.filter(r => (r.fecha || '').startsWith(hoy)));
    } catch (err) {
      console.error('Error en guardia:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadData();
  }, []);

  // Determine who is currently on site
  const onSiteList = colaboradores.map(c => {
    const id = String(c.id || c.id_empleado || c.cedula || '');
    const colabPunches = asistenciasHoy.filter(a => getRecordEmpId(a) === id);

    colabPunches.sort((p1, p2) => (p1.hora || '').localeCompare(p2.hora || ''));

    const entrada = colabPunches.find(p => (p.tipo || '').toUpperCase().includes('ENTRADA') || p.tipo === 'SOLO_ALMUERZO');
    const salida = colabPunches.find(p => (p.tipo || '').toUpperCase().includes('SALIDA'));

    // Employee is on site if they have punched ENTRADA and haven't punched SALIDA
    const presente = Boolean(entrada && !salida);
    const latestPunch = colabPunches[colabPunches.length - 1];

    return {
      ...c,
      presente,
      entrada: entrada ? (entrada.hora?.slice(0, 5) || entrada.entrada) : null,
      salida: salida ? (salida.hora?.slice(0, 5) || salida.salida) : null,
      ubicacion: latestPunch ? (latestPunch.ubicacion || latestPunch.modo) : null,
    };
  });

  const filtered = onSiteList.filter(c => {
    const q = search.toLowerCase();
    const nombre = (c.nombre || c.nombres || '').toLowerCase();
    const id = String(c.id || c.id_empleado || '');
    return nombre.includes(q) || id.includes(q);
  });

  const presentesCount = onSiteList.filter(c => c.presente).length;

  const handleOpenAssistedPunch = (colab) => {
    setSelectedColabForPunch(colab);
    setAssistedAction(colab.presente ? 'SALIDA' : 'ENTRADA');
    setAssistedReason('Sin smartphone / Batería agotada');
    setAssistedNotes('');
  };

  const handleConfirmAssistedPunch = async (e) => {
    e.preventDefault();
    if (!selectedColabForPunch || punchProcessing) return;

    setPunchProcessing(true);
    const empId = String(selectedColabForPunch.id || selectedColabForPunch.id_empleado);
    const empNombre = selectedColabForPunch.nombre || selectedColabForPunch.nombres;
    const now = new Date();
    const horaStr = now.toLocaleTimeString('es-EC', { hour12: false });
    const fechaStr = now.toISOString().split('T')[0];

    try {
      await registrarMarcacionAsistida({
        empleadoId: empId,
        idEmpleado: empId,
        id_empleado: empId,
        nombre: empNombre,
        tipo: assistedAction,
        hora: horaStr,
        fecha: fechaStr,
        motivo_asistencia_garita: assistedReason,
        observacion: assistedNotes,
        ubicacion: 'Garita de Portería (Planta Central)',
      });

      setFeedbackMsg({
        type: 'success',
        text: `¡${assistedAction} asistida registrada exitosamente para ${empNombre} a las ${horaStr}!`,
      });
      setSelectedColabForPunch(null);
      await reloadData();
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: `Error al registrar: ${err.message}`,
      });
    } finally {
      setPunchProcessing(false);
      setTimeout(() => setFeedbackMsg(null), 5000);
    }
  };

  return (
    <div className="guardia-layout fade-in">
      <div className="guardia-header">
        <div>
          <h2 className="section-title">Terminal de Seguridad & Garita</h2>
          <p className="section-subtitle">Control de accesos y marcación asistida de contingencia (FN-04)</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={reloadData}
            disabled={loading}
            className="btn btn-secondary flex items-center gap-2 text-xs py-2 px-3"
            title="Refrescar lista"
          >
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
            <span>Actualizar</span>
          </button>

          <div className="guardia-badge">
            <Shield size={18} color="#3b82f6" />
            <span>Control de Portería</span>
          </div>
        </div>
      </div>

      {feedbackMsg && (
        <div className={`p-3 rounded-xl border flex items-center gap-2 text-sm fade-in ${
          feedbackMsg.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          {feedbackMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Quick Summary Cards */}
      <div className="guardia-stats">
        <div className="glass-card g-stat-card">
          <div className="g-stat-icon green">
            <UserCheck size={24} />
          </div>
          <div>
            <span className="g-stat-label">Personal en Planta Ahora</span>
            <span className="g-stat-value">{presentesCount}</span>
          </div>
        </div>

        <div className="glass-card g-stat-card">
          <div className="g-stat-icon blue">
            <Users size={24} />
          </div>
          <div>
            <span className="g-stat-label">Total Nómina Registrada</span>
            <span className="g-stat-value">{colaboradores.length}</span>
          </div>
        </div>
      </div>

      {/* Search & List */}
      <div className="glass-card guardia-table-card">
        <div className="table-search-bar">
          <div className="search-wrap">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar colaborador por nombre o ID para verificar o marcar..."
              className="input-field search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="guardia-list">
          {loading ? (
            <div className="empty-state">
              <Clock size={28} className="spinning" />
              <p>Verificando accesos en base de datos...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <p>No se encontraron colaboradores coincidentes.</p>
            </div>
          ) : (
            filtered.map((item, idx) => {
              const id = item.id || item.id_empleado;
              return (
                <div key={`${id}_${idx}`} className="guardia-row">
                  <div className="guardia-avatar">
                    <span className="avatar-text">{(item.nombre || 'U')[0]}</span>
                  </div>

                  <div className="guardia-details">
                    <h4 className="colab-name">{item.nombre || item.nombres}</h4>
                    <div className="guardia-tags">
                      <span className="colab-id">ID: {id}</span>
                      {item.cargo && <span>• {item.cargo}</span>}
                    </div>
                  </div>

                  <div className="guardia-status">
                    {item.presente ? (
                      <span className="badge badge-success">
                        <UserCheck size={12} /> EN PLANTA ({item.entrada})
                      </span>
                    ) : (
                      <span className="badge badge-secondary">FUERA</span>
                    )}
                  </div>

                  <div className="guardia-actions ml-3">
                    <button
                      type="button"
                      onClick={() => handleOpenAssistedPunch(item)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        item.presente
                          ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30'
                          : 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30'
                      }`}
                    >
                      {item.presente ? <LogOut size={13} /> : <LogIn size={13} />}
                      <span>{item.presente ? 'Marcar Salida' : 'Marcar Ingreso'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Assisted Punch Modal (FN-04) */}
      {selectedColabForPunch && (
        <div className="assisted-modal-overlay fade-in">
          <div className="assisted-modal-card glass-card">
            <div className="assisted-modal-header">
              <div className="flex items-center gap-2">
                <Shield size={20} className="text-blue-400" />
                <h3 className="text-base font-bold text-white">Marcación Asistida en Garita</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedColabForPunch(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmAssistedPunch} className="p-5 flex flex-col gap-4">
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white text-sm">
                    {selectedColabForPunch.nombre || selectedColabForPunch.nombres}
                  </h4>
                  <p className="text-xs text-slate-400">
                    ID: {selectedColabForPunch.id || selectedColabForPunch.id_empleado} • {selectedColabForPunch.cargo || 'Operaciones'}
                  </p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                  selectedColabForPunch.presente ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-300'
                }`}>
                  {selectedColabForPunch.presente ? 'En Planta' : 'Fuera'}
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 mb-2 block">
                  Tipo de Registro:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAssistedAction('ENTRADA')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                      assistedAction === 'ENTRADA'
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <LogIn size={14} /> Entrada
                  </button>

                  <button
                    type="button"
                    onClick={() => setAssistedAction('SALIDA')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                      assistedAction === 'SALIDA'
                        ? 'bg-rose-600 text-white border-rose-400 shadow-md'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <LogOut size={14} /> Salida
                  </button>

                  <button
                    type="button"
                    onClick={() => setAssistedAction('SOLO_ALMUERZO')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                      assistedAction === 'SOLO_ALMUERZO'
                        ? 'bg-amber-600 text-white border-amber-400 shadow-md'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <Coffee size={14} /> Almuerzo
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
                  Motivo de Marcación Asistida (Garita):
                </label>
                <select
                  value={assistedReason}
                  onChange={(e) => setAssistedReason(e.target.value)}
                  className="input-field w-full text-xs"
                >
                  <option value="Sin smartphone / Batería agotada">Sin smartphone / Batería agotada</option>
                  <option value="Falla de conectividad móvil / GPS">Falla de conectividad móvil / GPS</option>
                  <option value="Dispositivo dañado o extraviado">Dispositivo dañado o extraviado</option>
                  <option value="Personal eventual / Proveedor / Visita">Personal eventual / Proveedor / Visita</option>
                  <option value="Autorización expresa de jefatura">Autorización expresa de jefatura</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 mb-1.5 block">
                  Observaciones adicionales de guardia (opcional):
                </label>
                <input
                  type="text"
                  placeholder="Ej. Ingreso autorizado por Ing. Morales..."
                  value={assistedNotes}
                  onChange={(e) => setAssistedNotes(e.target.value)}
                  className="input-field w-full text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setSelectedColabForPunch(null)}
                  className="btn btn-secondary text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={punchProcessing}
                  className="btn btn-primary text-xs flex items-center gap-2"
                >
                  {punchProcessing ? <RefreshCw size={14} className="spinning" /> : <CheckCircle2 size={14} />}
                  <span>Registrar Marcación</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .guardia-layout {
          max-width: 1200px;
          margin: 24px auto;
          padding: 0 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .guardia-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }
        .guardia-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.3);
          border-radius: var(--radius-full);
          font-weight: 600;
          font-size: 0.85rem;
          color: #93c5fd;
        }
        .guardia-stats {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        .g-stat-card {
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .g-stat-icon {
          width: 52px;
          height: 52px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .g-stat-icon.green {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .g-stat-icon.blue {
          background: rgba(59, 130, 246, 0.15);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.3);
        }
        .g-stat-label {
          display: block;
          font-size: 0.8rem;
          color: var(--text-dim);
          text-transform: uppercase;
        }
        .g-stat-value {
          display: block;
          font-family: var(--font-display);
          font-size: 1.8rem;
          font-weight: 700;
          color: #ffffff;
        }
        .guardia-table-card {
          padding: 20px;
        }
        .table-search-bar {
          margin-bottom: 16px;
        }
        .guardia-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .guardia-row {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: var(--radius-md);
          transition: background 0.2s;
        }
        .guardia-row:hover {
          background: rgba(255, 255, 255, 0.06);
        }
        .guardia-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(59, 130, 246, 0.2);
          color: #60a5fa;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          margin-right: 14px;
        }
        .guardia-details {
          flex: 1;
        }
        .guardia-tags {
          display: flex;
          gap: 6px;
          font-size: 0.78rem;
          color: var(--text-dim);
          margin-top: 2px;
        }
        .badge-secondary {
          background: rgba(255, 255, 255, 0.06);
          color: var(--text-dim);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .assisted-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .assisted-modal-card {
          width: 100%;
          max-width: 500px;
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .assisted-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
      `}</style>
    </div>
  );
}
