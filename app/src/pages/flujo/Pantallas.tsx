// Pantallas del flujo de marcación (index_core.js): mismo marcado, textos y emojis.
import { useState } from 'react';
import { s } from '../../lib/estilo';

const H3 = 'font-size: clamp(22px, 6vw, 28px); color: #0f172a; margin: 0; font-weight: 700;';
const P = 'color: #64748b; font-size: clamp(15px, 4.2vw, 18px); margin-top: 10px; line-height: 1.4;';
const BTN = 'font-size: clamp(16px, 4.2vw, 18px);';

function Encabezado({ icono, color, titulo, texto, tam = 48 }: { icono: string; color: string; titulo: string; texto: string; tam?: number }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 20 }}>
      <i className={`fas ${icono}`} style={{ fontSize: tam, color, marginBottom: 12 }}></i>
      <h3 style={s(H3)}>{titulo}</h3>
      <p style={s(P)}>{texto}</p>
    </div>
  );
}

function Opcion({ icono, etiqueta, onClick, estilo, sub, id, seleccionada }:
  { icono: string; etiqueta: string; onClick: () => void; estilo?: string; sub?: string; id?: string; seleccionada?: boolean }) {
  return (
    <div className={`razon-item ${seleccionada ? 'selected' : ''}`} id={id} onClick={onClick} style={estilo ? s(estilo) : undefined}>
      <div className="razon-icon">{icono}</div>
      <div className="razon-label">{etiqueta}</div>
      {sub && <div style={s('font-size: clamp(11px, 2.8vw, 12px); color: #64748b; margin-top: 4px;')}>{sub}</div>}
    </div>
  );
}

// ¿Dónde almuerzas? (mostrarLunchSelector)
export function SelectorAlmuerzo({ onConfirmar, onCancelar, toast }: { onConfirmar: (o: 'SI' | 'NO') => void; onCancelar: () => void; toast: (m: string) => void }) {
  const [lugar, setLugar] = useState<'SI' | 'NO' | null>(null);
  return (
    <div className="page">
      <div className="glass-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <i className="fas fa-utensils" style={s('font-size: 48px; color: #f59e0b; margin-bottom: 12px;')}></i>
          <h3 style={s(H3)}>¿Dónde almuerzas?</h3>
          <p style={s(P)}>Selecciona tu opción de almuerzo para hoy</p>
        </div>
        <div className="modal-razones">
          <div className={`razon-item ${lugar === 'SI' ? 'selected' : ''}`} id="lunchSi" onClick={() => setLugar('SI')}>
            <div className="razon-icon">🏢</div><div className="razon-label">En planta</div>
            <div style={s('font-size: 11px; color: #64748b; margin-top: 4px;')}>Almuerzo en empresa</div>
          </div>
          <div className={`razon-item ${lugar === 'NO' ? 'selected' : ''}`} id="lunchNo" onClick={() => setLugar('NO')}>
            <div className="razon-icon">🏠</div><div className="razon-label">Fuera</div>
            <div style={s('font-size: 11px; color: #64748b; margin-top: 4px;')}>Almuerzo externo</div>
          </div>
        </div>
        <div className="d-grid gap-2" style={{ marginTop: 24 }}>
          <button className="btn btn-primary btn-lg" id="btnConfirmarAlmuerzo" disabled={!lugar} style={s(BTN + ' padding: 14px;')}
            onClick={() => (lugar ? onConfirmar(lugar) : toast('👈 Selecciona dónde almuerzas primero'))}>
            <i className="fas fa-check-circle"></i> Confirmar y registrar
          </button>
          <button className="btn btn-outline-secondary" onClick={onCancelar} style={s(BTN)}><i className="fas fa-times"></i> Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// Motivo de entrada después del límite (mostrarModalRazonEntrada — en el legado nunca se invocaba; D-01)
export function RazonEntrada({ limite, onElegir, onJustificada, onCancelar }:
  { limite: string; onElegir: (razon: string) => void; onJustificada: () => void; onCancelar: () => void }) {
  return (
    <div className="page">
      <div className="glass-card">
        <Encabezado icono="fa-clock" color="#dc2626" titulo="Registra tu entrada" texto={`Selecciona el motivo de tu entrada después de las ${limite}`} />
        <div className="modal-razones">
          <Opcion icono="🏥" etiqueta="Permiso médico" onClick={() => onElegir('permiso_medico')} />
          <Opcion icono="📋" etiqueta="Permiso personal" onClick={() => onElegir('permiso_personal')} />
          <Opcion icono="✅" etiqueta="Entrada Justificada" onClick={onJustificada} />
          <Opcion icono="🏢" etiqueta="Regreso de Campo" onClick={() => onElegir('regreso_campo')} />
        </div>
        <div className="d-grid gap-2" style={{ marginTop: 18 }}>
          <button className="btn btn-outline-secondary" onClick={onCancelar} style={s(BTN)}><i className="fas fa-times"></i> Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ¿Quién autoriza? (mostrarJustificacionEntrada / mostrarJustificacionSalida)
export function QuienAutoriza({ titulo, texto, tamIcono, onConfirmar, onAtras, toast }:
  { titulo: string; texto: string; tamIcono: number; onConfirmar: (nombre: string) => void; onAtras: () => void; toast: (m: string) => void }) {
  const [nombre, setNombre] = useState('');
  const confirmar = () => (nombre.trim() ? onConfirmar(nombre.trim()) : toast('Ingresa el nombre de quién autoriza'));
  const pequeno = tamIcono === 40;
  return (
    <div className="page">
      <div className="glass-card">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <i className="fas fa-clipboard-check" style={{ fontSize: tamIcono, color: '#0284c7', marginBottom: 12 }}></i>
          <h3 style={s(pequeno ? 'font-size: clamp(18px, 5vw, 22px); color: #0f172a; margin: 0; font-weight: 700;' : H3)}>{titulo}</h3>
          <p style={s(pequeno ? 'color: #64748b; font-size: clamp(13px, 3.5vw, 15px); margin-top: 10px; line-height: 1.4;' : P)}>{texto}</p>
        </div>
        <div style={s('background: #eff6ff; border-left: 4px solid #0284c7; padding: 14px 16px; border-radius: 10px; margin-bottom: 18px;')}>
          <input type="text" autoFocus placeholder="Nombre de la persona o jefe" value={nombre} onChange={e => setNombre(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmar(); }}
            style={s('width: 100%; padding: 14px 16px; border: 2px solid #bfdbfe; border-radius: 10px; font-size: clamp(16px, 4.5vw, 18px); color: #1e293b; background: white;')} />
        </div>
        <div className="d-grid gap-2">
          <button className="btn btn-primary btn-lg" onClick={confirmar} style={s(BTN)}><i className="fas fa-check-circle"></i> Confirmar</button>
          <button className="btn btn-outline-secondary" onClick={onAtras} style={s(BTN)}><i className="fas fa-arrow-left"></i> Atrás</button>
        </div>
      </div>
    </div>
  );
}

// Motivo de salida anticipada (mostrarModalRazonSalida)
export function RazonSalida({ esPasante, onElegir, onJustificada, onCancelar }:
  { esPasante: boolean; onElegir: (razon: string) => void; onJustificada: () => void; onCancelar: () => void }) {
  return (
    <div className="page">
      <div className="glass-card">
        <Encabezado icono="fa-exclamation-triangle" color="#dc2626" titulo="Registra tu salida" texto="Selecciona el motivo de tu salida anticipada" />
        <div className="modal-razones">
          <Opcion icono="🎂" etiqueta="Cumpleaños" onClick={() => onElegir('cumpleanos')} />
          <Opcion icono="🏥" etiqueta="Permiso médico" onClick={() => onElegir('permiso_medico')} />
          <Opcion icono="📋" etiqueta="Permiso personal" onClick={() => onElegir('permiso_personal')} />
          <Opcion icono="🚗" etiqueta="Salida a Campo" onClick={() => onElegir('salida_campo')} />
          <Opcion icono="✅" etiqueta="Salida Justificada" onClick={onJustificada} />
          {esPasante && (
            <div className="razon-item" onClick={() => onElegir('salida_pasante')}
              style={s('border: 2px solid #7c3aed; background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); box-shadow: 0 4px 16px rgba(124,58,237,0.10);')}>
              <div className="razon-icon">🎓</div>
              <div className="razon-label" style={s('color:#6d28d9; font-weight:700;')}>Salida Pasante</div>
            </div>
          )}
          <div className="d-grid gap-2" style={{ marginTop: 16 }}>
            <button className="btn btn-outline-secondary" onClick={onCancelar}><i className="fas fa-times"></i> Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ¿Cuál es tu situación? (mostrarModalTipoSalidaTemprana)
export function TipoSalidaTemprana({ onPermiso, onFinal, onAtras }: { onPermiso: () => void; onFinal: () => void; onAtras: () => void }) {
  return (
    <div className="page">
      <div className="glass-card">
        <Encabezado icono="fa-question-circle" color="#0284c7" titulo="¿Cuál es tu situación?" texto="Indica si regresas o es tu salida definitiva" />
        <div className="modal-razones">
          <Opcion icono="🔄" etiqueta="Voy a regresar" sub="(Permiso)" onClick={onPermiso}
            estilo="border: 3px solid #10b981; background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); box-shadow: 0 6px 20px rgba(16, 185, 129, 0.1);" />
          <Opcion icono="🚪" etiqueta="No regreso hoy" sub="(Salida definitiva)" onClick={onFinal}
            estilo="border: 3px solid #ef4444; background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); box-shadow: 0 6px 20px rgba(239, 68, 68, 0.1);" />
        </div>
        <div className="d-grid gap-2" style={{ marginTop: 18 }}>
          <button className="btn btn-outline-secondary" onClick={onAtras} style={s(BTN)}><i className="fas fa-arrow-left"></i> Atrás</button>
        </div>
      </div>
    </div>
  );
}

// Tipo de permiso con salida temprana (mostrarModalRazonPermisoConSalidaTemprana)
export function RazonPermiso({ onElegir, onAtras }: { onElegir: (r: 'medico' | 'personal') => void; onAtras: () => void }) {
  return (
    <div className="page">
      <div className="glass-card">
        <Encabezado icono="fa-hourglass-half" color="#10b981" titulo="Tipo de Permiso" texto="¿Cuál es el motivo?" />
        <div className="modal-razones">
          <Opcion icono="🏥" etiqueta="Médico" onClick={() => onElegir('medico')} />
          <Opcion icono="👤" etiqueta="Personal" onClick={() => onElegir('personal')} />
        </div>
        <div className="d-grid gap-2" style={{ marginTop: 18 }}>
          <button className="btn btn-outline-secondary" onClick={onAtras} style={s(BTN)}><i className="fas fa-arrow-left"></i> Atrás</button>
        </div>
      </div>
    </div>
  );
}
