import { useState } from 'react';
import { s } from '../../lib/estilo';

// Confirmar salida antes de la hora oficial (mostrarModalConfirmacionSalidaAnticipada)
export function ModalConfirmarSalida({ nombre, horaActual, horaLimite, esPasante, onConfirmar, onCancelar, onMotivos }:
  { nombre: string; horaActual: string; horaLimite: string; esPasante: boolean; onConfirmar: () => void; onCancelar: () => void; onMotivos: () => void }) {
  const fila = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';
  return (
    <div id="modalConfirmacionSalida" className="modal-backdrop-custom"
      style={s('position: fixed; inset: 0; z-index: 99999; background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 16px;')}>
      <div style={s('background: #ffffff; border-radius: 24px; width: 100%; max-width: 420px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35); overflow: hidden; animation: popSuccess 0.28s cubic-bezier(0.16, 1, 0.3, 1);')}>
        <div style={s('background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 22px 20px; color: white; text-align: center; position: relative;')}>
          <div style={s('background: rgba(255,255,255,0.2); width: 54px; height: 54px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 26px; margin: 0 auto 10px auto;')}>
            <i className="fas fa-sign-out-alt"></i>
          </div>
          <h4 style={s('margin: 0; font-size: 19px; font-weight: 800; letter-spacing: -0.3px;')}>Confirmar Registro de Salida</h4>
          <div style={s('margin-top: 6px; display: inline-flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.22); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;')}>
            <i className="fas fa-clock"></i> Fin de jornada oficial: {horaLimite}
          </div>
        </div>
        <div style={s('padding: 22px 20px;')}>
          <p style={s('color: #475569; font-size: 14.5px; line-height: 1.5; margin: 0 0 16px 0; text-align: center;')}>
            Estás registrando tu salida <strong>antes de finalizar la jornada ({horaLimite})</strong>.<br />
            ¿Deseas confirmar el registro para dar por concluida tu jornada laboral?
          </p>
          <div style={s('background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 14px; margin-bottom: 20px; font-size: 13px;')}>
            <div style={s(fila)}>
              <span style={s('color: #64748b; font-weight: 500;')}>Colaborador:</span>
              <span style={s('font-weight: 700; color: #0f172a; max-width: 65%; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;')}>{nombre}</span>
            </div>
            {esPasante && (
              <div style={s(fila)}>
                <span style={s('color: #64748b; font-weight: 500;')}>Tipo de Horario:</span>
                <span style={s('font-weight: 700; color: #7c3aed; background: #f5f3ff; padding: 2px 8px; border-radius: 6px; font-size: 11.5px;')}>🎓 Flexible (Pasante)</span>
              </div>
            )}
            <div style={s(fila)}>
              <span style={s('color: #64748b; font-weight: 500;')}>Hora de Salida:</span>
              <span style={s('font-weight: 800; color: #dc2626; font-size: 14px;')}>{horaActual}</span>
            </div>
            <div style={s('display: flex; justify-content: space-between; align-items: center;')}>
              <span style={s('color: #64748b; font-weight: 500;')}>Fin de Jornada:</span>
              <span style={s('font-weight: 700; color: #2563eb;')}>{horaLimite}</span>
            </div>
          </div>
          <div className="d-grid gap-2">
            <button type="button" id="btnConfirmarSalidaAnticipada" className="btn btn-danger btn-lg" onClick={onConfirmar}
              style={s('border-radius: 12px; font-size: 15.5px; font-weight: 700; padding: 13px; box-shadow: 0 4px 14px rgba(220,38,38,0.35);')}>
              <i className="fas fa-check-circle"></i> Sí, confirmar salida
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={onCancelar} style={s('border-radius: 12px; font-size: 14.5px; font-weight: 600; padding: 10px;')}>
              <i className="fas fa-times"></i> Cancelar
            </button>
          </div>
          <div style={s('text-align: center; margin-top: 14px; padding-top: 12px; border-top: 1px dashed #e2e8f0;')}>
            <button type="button" onClick={onMotivos} style={s('background: none; border: none; color: #2563eb; font-size: 12px; font-weight: 600; cursor: pointer; text-decoration: underline; padding: 0;')}>
              <i className="fas fa-clipboard-list"></i> ¿Tienes un motivo especial o justificación? Clic aquí
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const OPCIONES_FUERA_AREA = {
  VACACIONES: '🏖️ VACACIÓN', PERMISO_PERSONAL: '👤 Permiso Personal', PERMISO_MEDICO: '🩺 Permiso Médico',
  FALTA_JUSTIFICADA: '📋 Falta Justificada', TRABAJO_DE_CAMPO: '🚗 CAMPO (Trabajo en Campo / Cliente)',
} as const;

// Reportar estado de hoy fuera del área (abrirModalReporteFueraArea)
export function ModalReporteFueraArea({ tipoInicial, obsInicial, onConfirmar, onCerrar }:
  { tipoInicial: string; obsInicial: string; onConfirmar: (tipo: string, obs: string) => void; onCerrar: () => void }) {
  const [tipo, setTipo] = useState(tipoInicial || 'VACACIONES');
  const [obs, setObs] = useState(obsInicial || '');
  const label = 'display: block; font-size: 12.5px; font-weight: 800; color: #334155; margin-bottom: 8px; text-transform: uppercase;';
  return (
    <div id="modalReporteFueraArea" className="modal-backdrop-custom"
      style={s('position: fixed; inset: 0; z-index: 99999; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 16px;')}>
      <div style={s('background: #ffffff; border-radius: 20px; width: 100%; max-width: 440px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3); overflow: hidden; animation: zoomIn 0.25s ease;')}>
        <div style={s('background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 18px 20px; color: white; display: flex; align-items: center; justify-content: space-between;')}>
          <div style={s('display: flex; align-items: center; gap: 10px;')}>
            <div style={s('background: rgba(255,255,255,0.2); width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px;')}>📍</div>
            <div>
              <h5 style={s('margin: 0; font-size: 16px; font-weight: 800; letter-spacing: 0.3px;')}>Reportar Estado de Hoy</h5>
              <div style={s('font-size: 11px; opacity: 0.9;')}>Fuera del Área de Registro</div>
            </div>
          </div>
          <button type="button" onClick={onCerrar} style={s('background: none; border: none; color: white; font-size: 22px; cursor: pointer; padding: 0; line-height: 1;')}>&times;</button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={s('background: #fff7ed; border: 1.5px solid #fdba74; border-left: 4px solid #ea580c; border-radius: 12px; padding: 12px 14px; margin-bottom: 18px;')}>
            <div style={s('display: flex; gap: 10px; align-items: flex-start;')}>
              <i className="fas fa-exclamation-triangle" style={s('color: #ea580c; font-size: 16px; margin-top: 2px;')}></i>
              <div style={s('font-size: 12px; color: #9a3412; font-weight: 600; line-height: 1.45;')}>
                <strong>Aviso Importante:</strong> Debe regularizar este evento con su supervisor tal como ya está establecido institucionalmente.<br />
                <span style={s('color: #c2410c; font-weight: 800;')}>Recuerde que las faltas injustificadas son tomadas como vacaciones.</span>
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={s(label)}>Seleccione su Estado de Hoy (Jornada Completa) *</label>
            <select id="selectEstadoFueraArea" value={tipo} onChange={e => setTipo(e.target.value)}
              style={s('width: 100%; padding: 10px 14px; border-radius: 10px; border: 1.5px solid #cbd5e1; font-size: 14px; font-weight: 700; color: #0f172a; background: #f8fafc; outline: none; cursor: pointer;')}>
              <option value="VACACIONES">🏖️ VACACIÓN</option>
              <optgroup label="📋 PERMISO JUSTIFICADO">
                <option value="PERMISO_PERSONAL">👤 Permiso Personal</option>
                <option value="PERMISO_MEDICO">🩺 Permiso Médico</option>
                <option value="FALTA_JUSTIFICADA">📋 Falta Justificada</option>
              </optgroup>
              <option value="TRABAJO_DE_CAMPO">🚗 CAMPO (Trabajo en Campo / Cliente)</option>
            </select>
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={s(label)}>Observaciones / Detalle (Opcional)</label>
            <textarea rows={2} placeholder="Ej: Atendiendo cliente en campo, cita médica..." value={obs} onChange={e => setObs(e.target.value)}
              style={s('width: 100%; padding: 10px 14px; border-radius: 10px; border: 1.5px solid #cbd5e1; font-size: 13px; color: #0f172a; box-sizing: border-box; resize: none;')} />
          </div>
          <div style={s('display: flex; gap: 10px; justify-content: flex-end;')}>
            <button type="button" onClick={onCerrar} style={s('padding: 10px 18px; border-radius: 10px; background: #f1f5f9; border: 1px solid #cbd5e1; color: #475569; font-weight: 700; font-size: 13px; cursor: pointer;')}>Cancelar</button>
            <button type="button" onClick={() => onConfirmar(tipo, obs.trim())}
              style={s('padding: 10px 22px; border-radius: 10px; background: #2563eb; border: none; color: white; font-weight: 800; font-size: 13px; cursor: pointer; box-shadow: 0 4px 10px rgba(37,99,235,0.3); display: inline-flex; align-items: center; gap: 6px;')}>
              <i className="fas fa-check-circle"></i> Confirmar Reporte
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Popup de almuerzo de 12:25 a 14:00 (mostrarPopupAlmuerzo)
export function PopupAlmuerzo({ onElegir, onCerrar }: { onElegir: (o: 'SI' | 'NO') => void; onCerrar: () => void }) {
  return (
    <div id="almuerzoModal" className="almuerzo-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="almuerzo-modal-card">
        <button className="almuerzo-modal-close" onClick={onCerrar}>&times;</button>
        <div className="almuerzo-modal-header">
          <div className="almuerzo-modal-icon">🍽️</div>
          <h3>¿Dónde almuerzas hoy?</h3>
          <p>Selecciona tu opción de almuerzo para registrarla en el sistema.</p>
        </div>
        <div className="almuerzo-modal-options">
          <div className="almuerzo-modal-option-card" onClick={() => onElegir('SI')}>
            <div className="option-icon">🏢</div><div className="option-title">En planta</div><div className="option-desc">Almuerzo en la empresa</div>
          </div>
          <div className="almuerzo-modal-option-card" onClick={() => onElegir('NO')}>
            <div className="option-icon">🏠</div><div className="option-title">Fuera</div><div className="option-desc">Almuerzo externo</div>
          </div>
        </div>
      </div>
    </div>
  );
}
