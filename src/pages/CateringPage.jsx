import React, { useState, useEffect } from 'react';
import { Utensils, Coffee, Check, Search, Calendar, User, CheckCircle2 } from 'lucide-react';
import { obtenerColaboradores, registrarAsistencia } from '../services/api';

export default function CateringPage() {
  const [colaboradores, setColaboradores] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [lunchHistory, setLunchHistory] = useState([]);
  const [lastMarked, setLastMarked] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const colabs = await obtenerColaboradores();
        setColaboradores(colabs);
      } catch (err) {
        console.error('Error cargando catering:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleRegisterLunch = async (colab) => {
    const empId = String(colab.id || colab.id_empleado);
    const empNombre = colab.nombre || colab.nombres;
    const now = new Date();
    const horaStr = now.toLocaleTimeString('es-EC', { hour12: false });
    const fechaStr = now.toISOString().split('T')[0];

    try {
      await registrarAsistencia({
        idEmpleado: empId,
        nombre: empNombre,
        tipo: 'Almuerzo_Salida',
        hora: horaStr,
        fecha: fechaStr,
        ubicacion: 'Comedor Central',
      });

      const entry = { id: empId, nombre: empNombre, hora: horaStr };
      setLunchHistory(prev => [entry, ...prev]);
      setLastMarked(entry);

      setTimeout(() => setLastMarked(null), 3000);
    } catch (err) {
      alert('Error al registrar almuerzo: ' + err.message);
    }
  };

  const filtered = colaboradores.filter(c => {
    const q = search.toLowerCase();
    const nombre = (c.nombre || c.nombres || '').toLowerCase();
    const id = String(c.id || c.id_empleado || '');
    return nombre.includes(q) || id.includes(q);
  });

  return (
    <div className="catering-layout fade-in">
      <div className="catering-header">
        <div>
          <h2 className="section-title">Terminal de Comedor & Catering</h2>
          <p className="section-subtitle">Gestión y registro rápido del servicio de almuerzos</p>
        </div>

        <div className="catering-badge">
          <Utensils size={18} color="#f59e0b" />
          <span>Comedor Central</span>
        </div>
      </div>

      {lastMarked && (
        <div className="last-marked-toast fade-in">
          <CheckCircle2 size={24} color="#10b981" />
          <div>
            <strong>Almuerzo Asignado: {lastMarked.nombre}</strong>
            <p>Registrado a las {lastMarked.hora}</p>
          </div>
        </div>
      )}

      <div className="catering-grid">
        {/* Left: Quick Register List */}
        <div className="glass-card c-card">
          <div className="search-wrap">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar colaborador para servir almuerzo..."
              className="input-field search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="c-list">
            {loading ? (
              <div className="empty-state">
                <p>Cargando personal...</p>
              </div>
            ) : (
              filtered.map(c => {
                const id = c.id || c.id_empleado;
                return (
                  <div key={id} className="c-item">
                    <div className="c-avatar">
                      <User size={20} color="#94a3b8" />
                    </div>
                    <div className="c-info">
                      <h4>{c.nombre || c.nombres}</h4>
                      <span>ID: {id}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-warning c-btn"
                      onClick={() => handleRegisterLunch(c)}
                    >
                      <Utensils size={15} />
                      <span>Servir</span>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: History served today */}
        <div className="glass-card c-card">
          <h3 className="c-history-title">Almuerzos Servidos Hoy ({lunchHistory.length})</h3>
          <div className="c-history-list">
            {lunchHistory.length === 0 ? (
              <div className="empty-state">
                <Coffee size={32} color="#6b7280" />
                <p>Aún no se han registrado almuerzos en esta sesión.</p>
              </div>
            ) : (
              lunchHistory.map((h, idx) => (
                <div key={idx} className="c-history-item fade-in">
                  <div>
                    <strong>{h.nombre}</strong>
                    <span className="c-h-id">ID: {h.id}</span>
                  </div>
                  <span className="badge badge-warning">{h.hora}</span>
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
          gap: 12px;
          padding: 14px 18px;
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.4);
          border-radius: var(--radius-md);
          color: #34d399;
        }
        .last-marked-toast strong {
          display: block;
          font-size: 0.95rem;
        }
        .last-marked-toast p {
          font-size: 0.8rem;
          opacity: 0.9;
        }
        .catering-grid {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 20px;
        }
        .c-card {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .c-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 520px;
          overflow-y: auto;
        }
        .c-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: var(--radius-md);
        }
        .c-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .c-info {
          flex: 1;
        }
        .c-info h4 {
          font-size: 0.92rem;
          color: var(--text-main);
        }
        .c-info span {
          font-size: 0.78rem;
          color: var(--text-dim);
          font-family: monospace;
        }
        .c-btn {
          padding: 6px 14px;
          font-size: 0.82rem;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white;
        }
        .c-history-title {
          font-family: var(--font-display);
          font-size: 1.1rem;
          color: #ffffff;
        }
        .c-history-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 480px;
          overflow-y: auto;
        }
        .c-history-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-radius: var(--radius-md);
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .c-history-item strong {
          display: block;
          font-size: 0.9rem;
          color: var(--text-main);
        }
        .c-h-id {
          font-size: 0.76rem;
          color: var(--text-dim);
          font-family: monospace;
        }
        @media (max-width: 900px) {
          .catering-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
