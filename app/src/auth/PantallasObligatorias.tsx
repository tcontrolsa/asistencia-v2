import { useState } from 'react';
import { rpc, sesion } from '../lib/api';
import { s } from '../lib/estilo';
import { telefonoSchema } from '../lib/tipos';
import { useUi } from '../ui/Ui';
import type { ResultadoLogin } from './AuthScreen';

// Actualización de datos obligatoria si falta el teléfono (renderUpdateDataScreen)
export function ActualizarDatos({ fechaNacimiento, onListo }: { fechaNacimiento: string | null; onListo: () => void }) {
  const ui = useUi();
  const [tel, setTel] = useState('');
  const [fecha, setFecha] = useState(fechaNacimiento || '');
  const [estadoBtn, setEstadoBtn] = useState<'normal' | 'guardando' | 'reintentar'>('normal');
  const foco = (e: React.FocusEvent<HTMLInputElement>, on: boolean) => {
    e.target.style.borderColor = on ? '#3b82f6' : '#e2e8f0';
    e.target.style.boxShadow = on ? '0 0 0 4px rgba(59,130,246,0.1)' : 'none';
  };
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = telefonoSchema.safeParse(tel);
    if (!v.success) { ui.toast(v.error.issues[0].message, tel.trim() ? 'warning' : 'error'); return; }
    setEstadoBtn('guardando');
    try {
      await rpc('guardar_perfil', { p_telefono: tel.replace(/\D/g, ''), p_fecha_nacimiento: fecha || null });
      ui.toast('Datos guardados correctamente', 'success');
      onListo();
    } catch (err) {
      ui.toast((err as Error).message || 'Error al guardar', 'error');
      setEstadoBtn('reintentar');
    }
  };
  const input = 'width: 100%; padding: 14px 14px 14px 44px; border: 2px solid #e2e8f0; border-radius: 14px; font-size: 1.05rem; color: #0f172a; transition: all 0.2s ease; background: #ffffff;';
  const icono = 'position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 1.1rem;';
  const label = 'display: block; font-size: 0.85rem; font-weight: 700; color: #475569; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;';
  return (
    <div className="page" style={s('animation: fadeIn 0.4s ease; background-color: #f8fafc; min-height: 100vh; padding-top: 20px;')}>
      <div className="glass-card" style={s('border-radius: 24px; padding: 32px 24px; background: linear-gradient(145deg, #ffffff 0%, #f1f5f9 100%); box-shadow: 0 20px 40px rgba(0,0,0,0.08); border: 1px solid rgba(255,255,255,1); text-align: center; max-width: 400px; margin: 0 auto;')}>
        <div style={s('width: 72px; height: 72px; background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto; box-shadow: 0 8px 16px rgba(2,132,199,0.15);')}>
          <i className="fas fa-user-edit" style={s('font-size: 32px; color: #0284c7;')}></i>
        </div>
        <h3 style={s('color: #0f172a; font-weight: 800; font-size: 1.5rem; margin-bottom: 8px;')}>Actualización de Datos</h3>
        <p style={s('color: #64748b; font-size: 0.95rem; margin-bottom: 24px; line-height: 1.5;')}>Por favor confirma tus datos de contacto para mantener tu expediente laboral al día y recibir comunicados oficiales y comprobantes de pago.</p>
        <form onSubmit={guardar} style={{ textAlign: 'left' }}>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label style={s(label)}>Teléfono Móvil / Celular <span style={{ color: '#ef4444' }}>*</span></label>
            <div style={{ position: 'relative' }}>
              <i className="fas fa-phone-alt" style={s(icono)}></i>
              <input type="tel" className="form-control" placeholder="Ej. 0991234567" required value={tel} onChange={e => setTel(e.target.value)}
                style={s(input)} onFocus={e => foco(e, true)} onBlur={e => foco(e, false)} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 28 }}>
            <label style={s(label)}>Fecha de Nacimiento (Opcional)</label>
            <div style={{ position: 'relative' }}>
              <i className="fas fa-calendar-alt" style={s(icono)}></i>
              <input type="date" className="form-control" value={fecha} onChange={e => setFecha(e.target.value)}
                style={s(input)} onFocus={e => foco(e, true)} onBlur={e => foco(e, false)} />
            </div>
          </div>
          <button type="submit" disabled={estadoBtn === 'guardando'} className="btn-primary"
            style={s('width: 100%; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: white; border: none; border-radius: 14px; padding: 16px; font-weight: 700; font-size: 1.05rem; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 14px rgba(2,132,199,0.3);')}>
            {estadoBtn === 'guardando' ? <><i className="fas fa-spinner fa-spin"></i> Guardando...</>
              : estadoBtn === 'reintentar' ? <><span>Intentar de nuevo</span><i className="fas fa-redo"></i></>
                : <><span>Guardar Datos</span><i className="fas fa-check-circle" style={{ fontSize: '1.1rem' }}></i></>}
          </button>
        </form>
      </div>
    </div>
  );
}

// Contraseña temporal asignada por el supervisor: debe cambiarla antes de continuar
// (reemplaza a renderMigrarPasswordScreen del legado, D-06)
export function CambioObligatorio({ nombre, passwordActual, onListo }: { nombre: string; passwordActual: string | null; onListo: () => void }) {
  const ui = useUi();
  const [actual, setActual] = useState(passwordActual || '');
  const [nueva, setNueva] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ver, setVer] = useState<Record<string, boolean>>({});
  const campo = (id: string, valor: string, set: (v: string) => void, ph: string, autoComplete: string) => (
    <div className="input-group">
      <input type={ver[id] ? 'text' : 'password'} id={id} className="form-control form-control-lg" placeholder={ph} autoComplete={autoComplete}
        value={valor} onChange={e => set(e.target.value)} />
      <button className="btn btn-outline-secondary" type="button" onClick={() => setVer({ ...ver, [id]: !ver[id] })}>
        <i className={`fas ${ver[id] ? 'fa-eye-slash' : 'fa-eye'}`}></i>
      </button>
    </div>
  );
  const guardar = async () => {
    if (!actual.trim()) { ui.toast('Ingresa la contraseña temporal que te asignaron', 'warning'); return; }
    if (nueva.trim().length < 6) { ui.toast('La contraseña debe tener al menos 6 caracteres', 'warning'); return; }
    if (nueva.trim() !== confirm.trim()) { ui.toast('Las contraseñas no coinciden', 'warning'); return; }
    ui.cargando(true);
    try {
      const r = await rpc<ResultadoLogin>('cambiar_password', { p_actual: actual.trim(), p_nueva: nueva.trim() });
      sesion.guardar(r.token);
      ui.cargando(false);
      await ui.splash({ titulo: '¡Contraseña Actualizada!', nombreEmpleado: nombre, subtitulo: 'Tu cuenta ha sido asegurada con tu nueva clave.',
        icono: 'lock', detalles: ['Clave cifrada de forma segura', 'Credenciales actualizadas', 'Ingresando al sistema'], duracion: 1700 });
      onListo();
    } catch (e) {
      ui.cargando(false);
      ui.toast((e as Error).message || 'Error al guardar la contraseña', 'error');
    }
  };
  return (
    <div className="page" style={s('animation: fadeIn 0.35s ease;')}>
      <div className="glass-card" style={s('border-radius: 24px; padding: 30px 22px; background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.92) 100%); box-shadow: 0 16px 48px rgba(0,0,0,0.08); border: 1px solid rgba(255,255,255,0.8); text-align: center;')}>
        <div style={s('width: 70px; height: 70px; background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; box-shadow: 0 8px 20px rgba(37,99,235,0.3);')}>
          <i className="fas fa-key" style={s('color: white; font-size: 28px;')}></i>
        </div>
        <h3 className="fw-bold mb-2" style={s('font-size: 20px; color: #0f172a;')}>¡Hola, {nombre || 'Colaborador'}! 👋</h3>
        <p style={s('color: #475569; font-size: 14px; line-height: 1.7; margin-bottom: 24px;')}>
          Para poder usar la aplicación necesitas registrar una <strong>contraseña personal</strong>.<br />Solo lo haces una vez.
        </p>
        <div style={s('text-align: left; display: flex; flex-direction: column; gap: 14px;')}>
          {!passwordActual && (
            <div>
              <label className="form-label small fw-bold text-secondary mb-1">Contraseña temporal</label>
              {campo('migPassActual', actual, setActual, 'La que te asignó tu supervisor', 'current-password')}
            </div>
          )}
          <div>
            <label className="form-label small fw-bold text-secondary mb-1">Contraseña</label>
            {campo('migPassNueva', nueva, setNueva, 'Escribe tu contraseña', 'new-password')}
          </div>
          <div>
            <label className="form-label small fw-bold text-secondary mb-1">Repite tu contraseña</label>
            {campo('migPassConfirm', confirm, setConfirm, 'Escribe tu contraseña otra vez', 'new-password')}
          </div>
          <button className="btn btn-primary btn-lg w-100 mt-2" onClick={guardar}
            style={s('border-radius: 14px; font-weight: 700; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); border: none; box-shadow: 0 6px 18px rgba(37,99,235,0.3); padding: 14px;')}>
            Guardar y Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
