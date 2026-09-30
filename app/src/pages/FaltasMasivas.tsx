import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { rpc } from '../lib/api';
import { s } from '../lib/estilo';
import { claves } from '../lib/datos';
import { fechaLocal } from '../lib/formato';
import { useUi } from '../ui/Ui';

// Justificar asistencias de días pasados sin registro (renderFaltasMasivas / procesarJustificacionMasiva)
export function FaltasMasivas({ fechas, onSaltar }: { fechas: string[]; onSaltar: () => void }) {
  const ui = useUi();
  const qc = useQueryClient();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set(fechas));
  const [motivo, setMotivo] = useState('Vacaciones');
  const ordenadas = [...fechas].sort();

  const procesar = async () => {
    const sel = ordenadas.filter(f => marcadas.has(f));
    if (!sel.length) { ui.toast('Selecciona al menos un día', 'error'); return; }
    ui.cargando(true);
    try {
      const r = await rpc<{ justificados: number; rechazados: number }>('justificar_faltas', { p_fechas: sel, p_motivo: motivo });
      ui.cargando(false);
      if (r.justificados > 0) ui.toast(`${r.justificados} día(s) justificado(s) correctamente`, 'success');
      if (r.rechazados > 0) ui.toast(`${r.rechazados} error(es) al procesar. Revisa tu conexión.`, 'error');
      await qc.invalidateQueries({ queryKey: claves.faltantes });
      await qc.invalidateQueries({ queryKey: ['registros'] });
    } catch (e) {
      ui.cargando(false);
      ui.toast('Error al procesar: ' + (e as Error).message, 'error');
    }
  };

  return (
    <div className="page">
      <div className="glass-card">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <i className="fas fa-calendar-check" style={s('font-size: 40px; color: #3b82f6; margin-bottom: 10px;')}></i>
          <h3 style={s('font-size: 20px; color: #0f172a; margin: 0; font-weight: 800;')}>Justificar Asistencias</h3>
          <p style={s('font-size: 13px; color: #64748b; margin-top: 5px;')}>Selecciona los días y el motivo</p>
        </div>
        <div id="listaFaltas" style={s('max-height: 200px; overflow-y: auto; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 20px;')}>
          {ordenadas.map((f, i) => (
            <div key={f} className="falta-row" style={s('display: flex; align-items: center; gap: 12px; padding: 10px; border-bottom: 1px solid #f1f5f9;')}>
              <input type="checkbox" id={`chk-${i}`} className="falta-chk" checked={marcadas.has(f)}
                onChange={e => { const n = new Set(marcadas); if (e.target.checked) n.add(f); else n.delete(f); setMarcadas(n); }}
                style={s('width: 20px; height: 20px; accent-color: #3b82f6;')} />
              <label htmlFor={`chk-${i}`} style={s('flex: 1; font-weight: 500; font-size: 14px; margin: 0;')}>
                {fechaLocal(f).toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' })}
              </label>
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 15 }}>
          <label style={s('display: block; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px;')}>Motivo de la ausencia</label>
          <select id="motivoMasivo" value={motivo} onChange={e => setMotivo(e.target.value)}
            style={s("width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #cbd5e1; font-family: 'Inter', sans-serif; font-size: 14px; background: white;")}>
            <option value="Vacaciones">🏖️ Vacaciones</option>
            <option value="Permiso médico">🏥 Permiso Médico</option>
            <option value="Calamidad doméstica">🏠 Calamidad Doméstica</option>
            <option value="Permiso personal">👤 Permiso Personal</option>
            <option value="Salida a Campo">🚗 Salida a Campo</option>
            <option value="Falta injustificada">❌ Falta Injustificada</option>
          </select>
        </div>
        <button onClick={procesar} className="btn-primary" style={s('width:100%; padding: 14px; border-radius: 12px; font-weight: 700;')}>Justificar seleccionados</button>
        <button onClick={onSaltar} style={s('width:100%; background: none; border: none; color: #64748b; font-size: 13px; font-weight: 600; margin-top: 15px; cursor: pointer;')}>Saltar por ahora</button>
      </div>
    </div>
  );
}
