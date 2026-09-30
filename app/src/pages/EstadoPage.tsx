import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { rpc } from '../lib/api';
import { s } from '../lib/estilo';
import { claves } from '../lib/datos';
import { useApp } from '../app/Estado';
import { useUi } from '../ui/Ui';

// Estado de emergencia / simulacro (renderEstadoPage, R-19)
export function EstadoPage() {
  const { ctx, emp, hoy } = useApp();
  const ui = useUi();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const em = ctx.emergencia;
  const [nombreEvento, setNombreEvento] = useState(em.nombre || '');
  const [estado, setEstado] = useState('');
  const [comentarios, setComentarios] = useState('');
  const yaReportado = !!hoy.entrada?.estado && hoy.entrada.tipo === 'ENTRADA';

  const alternar = async (activa: boolean) => {
    if (activa && !nombreEvento.trim()) { ui.toast('Por favor, ingresa el nombre de la emergencia o simulacro', 'warning'); return; }
    ui.cargando(true);
    try {
      await rpc('cambiar_emergencia', { p_activa: activa, p_nombre: nombreEvento.trim() || null });
      ui.toast(activa ? 'Alerta de emergencia INICIADA' : 'Alerta de emergencia FINALIZADA', 'success');
      await qc.invalidateQueries({ queryKey: claves.contexto });
    } catch (e) {
      ui.toast((e as Error).message || 'Error al actualizar alerta', 'error');
    } finally { ui.cargando(false); }
  };

  const enviar = async () => {
    if (!estado) { ui.toast('Por favor, selecciona tu estado actual', 'warning'); return; }
    ui.cargando(true);
    try {
      await rpc('reportar_estado_emergencia', { p_estado: estado, p_comentario: comentarios || null });
      ui.toast('Reporte de estado enviado correctamente', 'success');
      await qc.invalidateQueries({ queryKey: ['registros'] });
    } catch (e) {
      ui.toast((e as Error).message || 'Error al enviar reporte', 'error');
    } finally { ui.cargando(false); }
  };

  const botonEstado = (valor: string, emoji: string, texto: string, id: string, color: string, fondo: string) => (
    <div style={{ flex: 1 }}>
      <button type="button" id={id} onClick={() => setEstado(valor)}
        style={{ ...s('width:100%; padding: 20px 12px; text-align:center; border-radius:16px; cursor:pointer; transition:all 0.2s;'),
          border: `2px solid ${estado === valor ? color : '#e2e8f0'}`, background: estado === valor ? fondo : '#f8fafc' }}>
        <div style={s('font-size:28px; margin-bottom:4px;')}>{emoji}</div>
        <span className="fw-bold small" style={s('color:#1e293b; font-weight:700;')}>{texto}</span>
      </button>
    </div>
  );

  return (
    <div className="page">
      <div className="glass-card mb-4 text-center">
        <div style={{ fontSize: 40, color: em.activa ? '#ef4444' : '#10b981', marginBottom: 12, animation: em.activa ? 'pulseGlowRed 2.5s infinite' : 'none' }}>
          <i className={`fas ${em.activa ? 'fa-exclamation-triangle' : 'fa-check-circle'}`}></i>
        </div>
        <h3 className="fw-bold mb-1" style={s('color: #0f172a; margin:0;')}>{em.activa ? 'Reporte de Emergencia / Simulacro' : 'Estado del Sistema'}</h3>
        <p className="text-muted small" style={s('margin: 6px 0 0 0;')}>{em.activa ? <>Evento activo: <strong>{em.nombre}</strong></> : 'No hay simulacros ni emergencias activas.'}</p>
      </div>

      {emp.es_supervisor && (
        <div className="glass-card mb-4">
          <h4 className="fw-bold mb-3" style={s('color: #0f172a; margin:0 0 12px 0;')}><i className="fas fa-tools me-2 text-primary"></i>Panel de Control de Emergencias</h4>
          <div className="form-group mb-3">
            <label className="form-label text-muted small fw-bold" style={s('display:block; margin-bottom:6px;')}>Nombre del Evento (Simulacro o Emergencia)</label>
            <input type="text" className="form-control" placeholder="Ej: Simulacro Sismo 2026" value={nombreEvento} onChange={e => setNombreEvento(e.target.value)}
              style={s('border-radius:12px; padding:12px; width:100%; border:1px solid #cbd5e1; box-sizing:border-box;')} />
          </div>
          <div style={s('display:flex; gap:12px;')}>
            {!em.activa
              ? <button onClick={() => alternar(true)} className="btn btn-danger flex-grow-1" style={s('border-radius:12px; font-weight:700; padding:12px; display: block; background:#dc2626; color:white; border:none; cursor:pointer; width:100%;')}>🚨 Iniciar Alerta</button>
              : <button onClick={() => alternar(false)} className="btn btn-success flex-grow-1" style={s('border-radius:12px; font-weight:700; padding:12px; display: block; background:#16a34a; color:white; border:none; cursor:pointer; width:100%;')}>🟢 Finalizar Alerta</button>}
          </div>
        </div>
      )}

      {em.activa ? (yaReportado ? (
        <div className="glass-card text-center p-4">
          <div className="text-success mb-2" style={{ fontSize: 32 }}><i className="fas fa-check-double" style={{ color: '#10b981' }}></i></div>
          <h4 className="fw-bold text-success" style={s('color:#16a34a; margin:0 0 8px 0;')}>Reporte Enviado</h4>
          <p className="text-muted small" style={s('margin:0 0 15px 0;')}>Tu estado para este evento ha sido registrado correctamente.</p>
          <button onClick={() => navegar('/')} className="btn btn-secondary w-100 mt-2" style={s('border-radius:12px; width:100%; padding:12px; background:#e2e8f0; border:none; font-weight:700; cursor:pointer; color:#475569;')}>Ir al Inicio</button>
        </div>
      ) : (
        <div className="glass-card">
          <h4 className="fw-bold mb-3 text-center" style={s('color: #0f172a; margin:0 0 15px 0;')}>¿Cuál es tu estado actual?</h4>
          <div style={s('display:flex; gap:12px; margin-bottom:15px;')}>
            {botonEstado('A salvo', '🟢', 'A salvo / OK', 'btnEstSalvo', '#10b981', '#ecfdf5')}
            {botonEstado('Requiere ayuda', '🔴', 'Requiere Ayuda', 'btnEstAyuda', '#ef4444', '#fef2f2')}
          </div>
          <div className="form-group mb-3">
            <label className="form-label text-muted small fw-bold" style={s('display:block; margin-bottom:6px;')}>Detalles / Comentarios (Opcional)</label>
            <textarea className="form-control" rows={2} placeholder="Ej: Sin novedades en el área de taller" value={comentarios} onChange={e => setComentarios(e.target.value)}
              style={s('border-radius:12px; padding:12px; width:100%; border:1px solid #cbd5e1; box-sizing:border-box; font-family:inherit;')} />
          </div>
          <button onClick={enviar} className="btn btn-primary" style={s('width:100%; padding:14px; border-radius:12px; font-weight:700; background:var(--primary); color:white; border:none; cursor:pointer; font-size:15px; box-shadow: 0 4px 12px var(--primary-glow);')}>
            Enviar Reporte de Estado
          </button>
        </div>
      )) : !emp.es_supervisor ? (
        <div className="glass-card text-center p-4">
          <div className="text-muted mb-2" style={{ fontSize: 32 }}><i className="fas fa-shield-alt" style={{ color: '#64748b' }}></i></div>
          <h4 className="fw-bold text-muted" style={s('color:#475569; margin:0 0 6px 0;')}>Todo en Orden</h4>
          <p className="text-muted small" style={{ margin: 0 }}>No hay alertas de simulacro ni emergencias vigentes en este momento.</p>
        </div>
      ) : null}
    </div>
  );
}
