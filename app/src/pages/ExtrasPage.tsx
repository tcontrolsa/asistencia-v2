import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { rpc, urlFoto } from '../lib/api';
import { s } from '../lib/estilo';
import { claves } from '../lib/datos';
import { useUi } from '../ui/Ui';

interface Persona { id: string; nombre: string; cargo: string; foto_url: string | null; auth_extras: 'SI' | 'NO'; ubicacion: 'CAMPO' | 'EMPRESA' }

// Autorización de horas extra de Taller/Producción para coordinadores (renderHorasExtrasPage, R-13)
export function ExtrasPage() {
  const ui = useUi();
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: claves.taller, queryFn: () => rpc<Persona[]>('personal_taller') });
  const [busca, setBusca] = useState('');
  const [cargo, setCargo] = useState('TODOS');

  const personas = useMemo(() => [...(lista.data || [])].sort((a, b) => a.nombre.localeCompare(b.nombre)), [lista.data]);
  const cargos = useMemo(() => [...new Set(personas.map(p => p.cargo || 'OPERARIO'))].sort(), [personas]);
  const filtrados = personas.filter(p => (cargo === 'TODOS' || (p.cargo || 'OPERARIO') === cargo)
    && (!busca.trim() || p.nombre.toLowerCase().includes(busca.toLowerCase().trim()) || p.id.includes(busca.trim())));

  const actualizar = (id: string, v: 'SI' | 'NO') =>
    qc.setQueryData<Persona[]>(claves.taller, prev => (prev || []).map(p => (p.id === id ? { ...p, auth_extras: v } : p)));

  const alternar = async (p: Persona, autorizado: boolean) => {
    actualizar(p.id, autorizado ? 'SI' : 'NO');
    try {
      await rpc('autorizar_extras', { p_empleado_id: p.id, p_autorizado: autorizado });
      ui.toast(`✅ Estado actualizado: ${autorizado ? 'SI' : 'NO'}`, 'success');
    } catch (e) {
      actualizar(p.id, autorizado ? 'NO' : 'SI');
      ui.toast('❌ Error: ' + (e as Error).message, 'error');
    }
  };

  const todos = async (autorizado: boolean) => {
    const obj = filtrados.filter(p => p.ubicacion !== 'CAMPO');
    if (!obj.length) { ui.toast('No hay empleados modificables en este filtro', 'info'); return; }
    if (!window.confirm(`¿Deseas ${autorizado ? 'AUTORIZAR' : 'DESAUTORIZAR'} horas extras a los ${obj.length} empleados de la lista actual?`)) return;
    ui.cargando(true);
    let ok = 0, mal = 0;
    for (const p of obj) {
      try { await rpc('autorizar_extras', { p_empleado_id: p.id, p_autorizado: autorizado }); actualizar(p.id, autorizado ? 'SI' : 'NO'); ok++; } catch { mal++; }
    }
    ui.cargando(false);
    ui.toast(`Proceso completo. Éxito: ${ok}, Fallidos: ${mal}`, ok > 0 ? 'success' : 'error');
  };

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <div className="glass-card" style={s('position: sticky; top: -16px; z-index: 100; margin-bottom: 16px; padding: 16px; border-radius: 0 0 16px 16px; border-top: none; margin-left: -16px; margin-right: -16px; margin-top: -16px; background: rgba(255,255,255,0.92); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 8px 32px rgba(0,0,0,0.06); border-bottom: 1px solid rgba(226, 232, 240, 0.8);')}>
        <div style={s('display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;')}>
          <div>
            <h3 className="fw-bold mb-0" style={s('font-size: 20px; color: #1e293b;')}>Autorización Extras</h3>
            <p className="text-muted small mb-0" style={s('font-size: 11px; font-weight: 500;')}>Área TALLER / PRODUCCIÓN</p>
          </div>
          <div style={s('display: flex; gap: 8px;')}>
            <button className="btn btn-primary btn-sm" onClick={() => todos(true)} style={s('border-radius: 8px; padding: 6px 12px; font-size: 11px; font-weight:600; background-color: var(--primary); border: none; box-shadow: 0 2px 4px rgba(0,0,0,0.05);')}>
              <i className="fas fa-check-double me-1"></i> Autorizar Filtrados
            </button>
            <button className="btn btn-outline-danger btn-sm" onClick={() => todos(false)} style={s('border-radius: 8px; padding: 6px 12px; font-size: 11px; font-weight:600; box-shadow: 0 2px 4px rgba(0,0,0,0.02);')}>
              <i className="fas fa-times me-1"></i> Quitar Filtrados
            </button>
          </div>
        </div>
        <div className="row g-2">
          <div className="col-6">
            <input type="text" className="form-input" placeholder="🔍 Buscar por nombre o ID..." value={busca} onChange={e => setBusca(e.target.value)}
              style={s('border-radius: 8px; font-size: 12.5px; padding: 8px 12px; width: 100%; border: 1px solid #cbd5e1; background: #ffffff;')} />
          </div>
          <div className="col-6">
            <select className="form-select" value={cargo} onChange={e => setCargo(e.target.value)}
              style={s('border-radius: 8px; font-size: 12.5px; padding: 8px 12px; width: 100%; border: 1px solid #cbd5e1; background: #ffffff; height: 37px;')}>
              <option value="TODOS">-- Todos los Cargos ({personas.length}) --</option>
              {cargos.map(c => <option key={c} value={c}>{c} ({personas.filter(p => (p.cargo || 'OPERARIO') === c).length})</option>)}
            </select>
          </div>
        </div>
      </div>

      <div id="listaTaller" className="mt-2" style={s('display: flex; flex-direction: column; gap: 10px; padding: 0 4px 24px 4px;')}>
        {lista.isLoading ? (
          <div className="text-center py-5"><div className="spinner-border text-primary" role="status"></div><p className="mt-2 text-muted">Cargando personal...</p></div>
        ) : lista.isError ? (
          <div className="alert alert-danger">{(lista.error as Error).message}</div>
        ) : !personas.length ? (
          <div className="text-center py-5 text-muted"><i className="fas fa-users-slash fs-1 d-block mb-3"></i>No hay personal activo en Taller</div>
        ) : !filtrados.length ? (
          <div className="text-center py-4 text-muted"><i className="fas fa-user-slash d-block mb-2"></i>No hay personal que coincida</div>
        ) : filtrados.map(p => {
          const campo = p.ubicacion === 'CAMPO';
          const foto = urlFoto(p.foto_url);
          return (
            <div key={p.id} className="taller-item glass-card" onClick={() => !campo && alternar(p, p.auth_extras !== 'SI')}
              style={{ ...s('display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.4); box-shadow: 0 4px 6px rgba(0,0,0,0.02); transition: all 0.2s;'),
                cursor: campo ? 'default' : 'pointer', ...(campo ? s('border-left: 4px solid #3b82f6; background: rgba(59, 130, 246, 0.04);') : {}) }}>
              <div style={s('display: flex; align-items: center; gap: 12px; pointer-events: none;')}>
                {foto
                  ? <img className="taller-photo" src={foto} alt="Foto" style={s('width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary); box-shadow: 0 2px 4px rgba(0,0,0,0.1);')} />
                  : <div className="taller-photo-placeholder" style={s('width: 44px; height: 44px; border-radius: 50%; background: #f1f5f9; display: flex; align-items: center; justify-content: center; font-size: 18px; border: 2px solid #e2e8f0; color: #94a3b8;')}>👤</div>}
                <div className="taller-info">
                  <h4 style={s('margin: 0; font-size: 13.5px; font-weight: 600; color: #1e293b; display: flex; align-items: center; gap: 6px;')}>
                    {p.nombre} {campo && <span className="badge bg-primary" style={s('font-size: 9px; padding: 2px 6px; border-radius: 4px;')}>CAMPO</span>}
                  </h4>
                  <p style={s('margin: 2px 0 0 0; font-size: 11px; color: #64748b; font-weight: 500;')}>
                    ID: {p.id} • <span style={s('color: var(--primary); font-weight: 600;')}>{p.cargo || 'OPERARIO'}</span>
                  </p>
                </div>
              </div>
              <label className="switch-container" style={{ margin: 0 }} onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={campo || p.auth_extras === 'SI'} disabled={campo} onChange={e => alternar(p, e.target.checked)} />
                <span className="slider"></span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
