import React, { useState, useEffect } from 'react';
import { Shield, UserCheck, Search, Users, AlertCircle, Clock, MapPin } from 'lucide-react';
import { obtenerColaboradores, obtenerDatosSupervisor } from '../services/api';

export default function GuardiaPage() {
  const [colaboradores, setColaboradores] = useState([]);
  const [asistenciasHoy, setAsistenciasHoy] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [colabs, supData] = await Promise.all([
          obtenerColaboradores(),
          obtenerDatosSupervisor({ filtro: 'hoy' }),
        ]);
        setColaboradores(colabs);
        setAsistenciasHoy(supData.registros || supData.asistencias || supData.datos || []);
      } catch (err) {
        console.error('Error en guardia:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Determine who is currently on site
  const onSiteList = colaboradores.map(c => {
    const id = String(c.id || c.id_empleado || c.cedula);
    const punch = asistenciasHoy.find(a => String(a.id_empleado || a.empleadoId || a.id) === id);
    const presente = !!(punch && (punch.entrada || punch.tipo === 'ENTRADA' || punch.tipo === 'Entrada' || punch.tipo === 'SOLO_ALMUERZO') && !punch.salida && punch.tipo !== 'SALIDA');
    return {
      ...c,
      presente,
      entrada: punch ? (punch.entrada || punch.hora) : null,
      salida: punch ? punch.salida : null,
      ubicacion: punch ? (punch.ubicacion || punch.modo) : null,
    };
  });

  const filtered = onSiteList.filter(c => {
    const q = search.toLowerCase();
    const nombre = (c.nombre || c.nombres || '').toLowerCase();
    const id = String(c.id || c.id_empleado || '');
    return nombre.includes(q) || id.includes(q);
  });

  const presentesCount = onSiteList.filter(c => c.presente).length;

  return (
    <div className="guardia-layout fade-in">
      <div className="guardia-header">
        <div>
          <h2 className="section-title">Terminal de Seguridad & Guardia</h2>
          <p className="section-subtitle">Monitoreo de accesos y personal en planta en tiempo real</p>
        </div>

        <div className="guardia-badge">
          <Shield size={18} color="#3b82f6" />
          <span>Control de Portería</span>
        </div>
      </div>

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
              placeholder="Buscar colaborador para verificar ingreso..."
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
            filtered.map((item) => {
              const id = item.id || item.id_empleado;
              return (
                <div key={id} className="guardia-row">
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
                </div>
              );
            })
          )}
        </div>
      </div>

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
          font-size: 0.78rem;
          color: var(--text-dim);
          text-transform: uppercase;
          font-weight: 600;
          display: block;
        }
        .g-stat-value {
          font-family: var(--font-display);
          font-size: 2rem;
          font-weight: 800;
          color: #ffffff;
        }
        .guardia-table-card {
          padding: 16px;
        }
        .table-search-bar {
          margin-bottom: 16px;
        }
        .guardia-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 500px;
          overflow-y: auto;
        }
        .guardia-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-radius: var(--radius-md);
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          transition: all 0.15s ease;
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
      `}</style>
    </div>
  );
}
