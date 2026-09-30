import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ErrorApi, rpc, sesion, urlFoto } from '../lib/api';
import { s } from '../lib/estilo';
import { extraerPrimerNombre } from '../lib/formato';
import { tokenDispositivo } from '../lib/sesion';
import { useUi } from '../ui/Ui';
import { ModalAvisoPrivacidad } from '../ui/Modales';

export interface ResultadoLogin {
  ok: boolean; token: string; rol: string; usuario: string; empleado_id: string | null; nombre: string; debe_cambiar: boolean;
  codigo?: string; error?: string;
}
interface VistaPrevia { id: string; nombre: string; area: string | null; cargo: string | null; foto_url: string | null; tiene_password: boolean }

const CLAVE_ULTIMO = 'TCONTROL_ULTIMO_ID';
const recordarId = (id: string) => { try { localStorage.setItem(CLAVE_ULTIMO, id); } catch { /* sin almacenamiento */ } };
const ultimoId = () => { try { return localStorage.getItem(CLAVE_ULTIMO) || ''; } catch { return ''; } };

const crearSchema = z.object({
  id: z.string().trim().min(1, 'Ingresa tu ID / Cédula de empleado'),
  cedula: z.string().trim().min(9, 'Ingresa tu número de cédula registrado'),
  password: z.string().trim().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  confirmacion: z.string().trim(),
}).refine(d => d.password === d.confirmacion, { message: 'Las contraseñas no coinciden', path: ['confirmacion'] });

async function login(usuario: string, password: string): Promise<ResultadoLogin> {
  try {
    return await rpc<ResultadoLogin>('login', { p_usuario: usuario, p_password: password, p_dispositivo: tokenDispositivo() }, false);
  } catch (e) {
    if (e instanceof ErrorApi && e.datos && typeof e.datos === 'object' && 'codigo' in e.datos) return e.datos as ResultadoLogin;
    throw e;
  }
}

function Ojo({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button className="btn btn-outline-secondary" type="button" onClick={onClick}>
      <i className={`fas ${visible ? 'fa-eye-slash' : 'fa-eye'}`}></i>
    </button>
  );
}

function CampoClave({ id, valor, onCambio, placeholder, onEnter, autoComplete, autoFocus }:
  { id: string; valor: string; onCambio: (v: string) => void; placeholder: string; onEnter?: () => void; autoComplete?: string; autoFocus?: boolean }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="input-group">
      <input type={ver ? 'text' : 'password'} id={id} className="form-control form-control-lg" placeholder={placeholder} value={valor}
        autoComplete={autoComplete} autoFocus={autoFocus} onChange={e => onCambio(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onEnter?.(); }} />
      <Ojo visible={ver} onClick={() => setVer(!ver)} />
    </div>
  );
}

export function AuthScreen({ onIngreso }: { onIngreso: (r: ResultadoLogin, passwordUsada: string) => void }) {
  const ui = useUi();
  const [pantalla, setPantalla] = useState<'pin' | 'registro'>(ultimoId() ? 'pin' : 'registro');
  const [aviso, setAviso] = useState(false);

  // ── Login ──
  const [loginId, setLoginId] = useState(ultimoId());
  const [pass, setPass] = useState('');
  const [errorPin, setErrorPin] = useState('');
  const refPass = useRef<HTMLInputElement | null>(null);

  // ── Vincular dispositivo ──
  const [regId, setRegId] = useState('');
  const [previa, setPrevia] = useState<VistaPrevia | null | 'cargando' | 'no'>(null);
  const [regCedula, setRegCedula] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [cambioClave, setCambioClave] = useState<string | null>(null);

  useEffect(() => {
    const id = regId.trim();
    if (!id) { setPrevia(null); return; }
    setPrevia('cargando');
    const t = window.setTimeout(async () => {
      try {
        const r = await rpc<VistaPrevia[]>('vista_previa_empleado', { p_id: id }, false);
        setPrevia(r[0] || 'no');
      } catch { setPrevia('no'); }
    }, 280);
    return () => clearTimeout(t);
  }, [regId]);

  const ingresar = async () => {
    const id = loginId.trim();
    if (!id) { ui.toast('Ingresa tu ID / Cédula de empleado', 'warning'); return; }
    if (!pass.trim()) { ui.toast('Ingresa tu contraseña de acceso', 'error'); refPass.current?.focus(); return; }
    try {
      const r = await login(id, pass.trim());
      if (!r.ok) {
        setErrorPin('❌ ' + r.error);
        ui.toast(r.error || 'Contraseña incorrecta', 'error');
        if (r.codigo === 'CREAR_PASSWORD') {
          window.setTimeout(() => { setPantalla('registro'); setRegId(id); }, 1400);
        }
        return;
      }
      recordarId(id);
      sesion.guardar(r.token);
      await ui.splash({ titulo: '¡Identidad Verificada!', nombreEmpleado: r.nombre || 'Colaborador',
        subtitulo: 'Acceso concedido. Ingresando a tu credencial digital...', icono: 'lock',
        detalles: ['Credenciales autenticadas', 'Sincronizando estado de hoy'], duracion: 1400 });
      onIngreso(r, pass.trim());
    } catch (e) {
      ui.toast('Error de conexión: ' + (e as Error).message, 'error');
    }
  };

  const vincular = async () => {
    const id = regId.trim();
    if (!id) { ui.toast('Ingresa tu ID / Cédula de empleado', 'error'); return; }
    const existente = previa && typeof previa === 'object' && previa.tiene_password;
    try {
      let r: ResultadoLogin;
      if (existente) {
        if (!regPass.trim()) { ui.toast('Ingresa tu contraseña', 'error'); return; }
        r = await login(id, regPass.trim());
      } else {
        const v = crearSchema.safeParse({ id, cedula: regCedula, password: regPass, confirmacion: regConfirm });
        if (!v.success) { ui.toast(v.error.issues[0].message, 'error'); return; }
        try {
          r = await rpc<ResultadoLogin>('crear_password', { p_usuario: id, p_cedula: regCedula.trim(), p_password: regPass.trim(), p_dispositivo: tokenDispositivo() }, false);
        } catch (e) {
          if (e instanceof ErrorApi && e.datos && typeof e.datos === 'object' && 'codigo' in e.datos) r = e.datos as ResultadoLogin;
          else throw e;
        }
      }
      if (!r.ok) { ui.toast(r.error || 'No se pudo vincular', 'error'); return; }
      recordarId(id);
      sesion.guardar(r.token);
      await ui.splash({ titulo: existente ? '¡Dispositivo Vinculado!' : '¡Contraseña Creada!', nombreEmpleado: r.nombre || id,
        subtitulo: 'Tu cuenta ha sido autorizada correctamente. Preparando tu credencial digital...', icono: 'check',
        detalles: ['Contraseña y credenciales validadas', 'Dispositivo enlazado con éxito', 'Credencial corporativa lista'], duracion: 1700 });
      onIngreso(r, regPass.trim());
    } catch (e) {
      ui.toast('Error de registro: ' + (e as Error).message, 'error');
    }
  };

  const existente = !!(previa && typeof previa === 'object' && previa.tiene_password);
  const nuevo = !!(previa && typeof previa === 'object' && !previa.tiene_password);

  return (
    <div className="page">
      {pantalla === 'pin' && (
        <div id="pinScreen">
          <div className="glass-card">
            <div className="text-center mb-4">
              <img src="./assets/images/Logotipo T Control.png" alt="TCONTROL" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                style={s('width: clamp(140px, 45vw, 190px); max-height: 72px; object-fit: contain; margin-bottom: 16px; display: block; margin-left: auto; margin-right: auto;')} />
              <h3 className="h5 fw-bold" style={{ color: '#0f172a' }}>Acceso Seguro al Sistema</h3>
              <p className="text-muted small">Ingresa tus credenciales para continuar</p>
            </div>
            <div className="mb-3 text-start">
              <label className="form-label small fw-bold text-secondary mb-1">ID / Cédula de Empleado</label>
              <input type="text" id="loginEmployeeId" className="form-control form-control-lg" placeholder="Ej: 1058" autoComplete="username"
                value={loginId} onChange={e => setLoginId(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') refPass.current?.focus(); }} />
            </div>
            <div className="mb-4 text-start">
              <label className="form-label small fw-bold text-secondary mb-1">Contraseña</label>
              <div className="input-group">
                <PassConRef valor={pass} onCambio={setPass} onEnter={ingresar} inputRef={refPass} autoFocus={!!loginId} />
              </div>
            </div>
            <div className="alert alert-info py-2 small mb-4" style={s('border-radius: 10px; font-size: 11.5px;')}>
              <i className="fas fa-shield-halved me-1"></i> Si es tu primera vez o vinculas un nuevo dispositivo, haz clic en "Vincular Dispositivo".
            </div>
            <button className="btn btn-primary btn-lg w-100 mb-2" onClick={ingresar} style={s('border-radius: 12px; font-weight: 700;')}>
              <i className="fas fa-arrow-right me-1"></i> Ingresar
            </button>
            <button className="btn btn-outline-primary w-100" onClick={() => setPantalla('registro')} style={s('border-radius: 12px; font-weight: 600;')}>
              <i className="fas fa-user-plus me-1"></i> Vincular Dispositivo
            </button>
            <div className="text-center mt-3" style={s('font-size: 11px; color: #64748b; line-height: 1.4;')}>
              <i className="fas fa-shield-alt text-primary me-1"></i> Tratamiento de datos protegido por la <strong>LOPDP Ecuador</strong>.<br />
              <a href="#" onClick={e => { e.preventDefault(); setAviso(true); }} style={s('color: #0284c7; text-decoration: underline; font-weight: 600;')}>Ver Descargo Legal y Derechos</a>
            </div>
            {errorPin && <div id="pinResult" className="alert alert-danger mt-3" style={s('border-radius: 10px; font-size: 12px;')}>{errorPin}</div>}
          </div>
        </div>
      )}

      {pantalla === 'registro' && (
        <div id="registroInicialScreen">
          <div className="glass-card">
            <div className="text-center mb-3">
              <img src="./assets/images/Logotipo T Control.png" alt="TCONTROL" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                style={s('width: clamp(130px, 42vw, 175px); max-height: 64px; object-fit: contain; margin-bottom: 14px; display: block; margin-left: auto; margin-right: auto;')} />
              <h3 className="h5 fw-bold" style={{ color: '#0f172a' }}>Vincular Dispositivo</h3>
              <p className="text-muted small">Ingresa tu ID de empleado para continuar</p>
            </div>
            <div className="mb-3 text-start">
              <label className="form-label small fw-bold text-secondary mb-1">ID (Número de usuario)</label>
              <input type="text" id="registroEmployeeId" className="form-control form-control-lg" placeholder="Ej: 1 o 1058" autoFocus
                value={regId} onChange={e => setRegId(e.target.value)} />
            </div>

            <VistaPreviaAlerta id={regId.trim()} previa={previa}
              onIniciarSesion={() => { setLoginId(regId.trim()); setPantalla('pin'); }}
              onCambiarClave={() => setCambioClave(regId.trim())} />

            {nuevo && (
              <div className="mb-3 text-start">
                <label className="form-label small fw-bold text-secondary mb-1">Número de Cédula</label>
                <input type="text" inputMode="numeric" className="form-control form-control-lg" placeholder="Tu cédula registrada en la empresa"
                  value={regCedula} onChange={e => setRegCedula(e.target.value)} autoComplete="off" />
              </div>
            )}
            <div className="mb-3 text-start">
              <label className="form-label small fw-bold text-secondary mb-1">{existente ? 'Contraseña Registrada' : nuevo ? 'Nueva Contraseña' : 'Contraseña'}</label>
              <CampoClave id="registroPasswordInput" valor={regPass} onCambio={setRegPass} placeholder="Ingresa tu contraseña" onEnter={existente ? vincular : undefined} />
            </div>
            {!existente && (
              <div className="mb-4 text-start" id="containerPasswordConfirm">
                <label className="form-label small fw-bold text-secondary mb-1">Confirmar Contraseña</label>
                <CampoClave id="registroPasswordConfirm" valor={regConfirm} onCambio={setRegConfirm} placeholder="Repite la contraseña" onEnter={vincular} />
              </div>
            )}
            <p className="text-muted small text-center mb-3" style={{ fontSize: 11.5 }}>
              {existente ? '🔒 Al vincular este equipo, cualquier otro teléfono previo quedará desvinculado automáticamente.'
                : nuevo ? '🔑 Recuerda esta contraseña, la usarás cada vez que ingreses al sistema.'
                  : '🔑 Recuerda esta contraseña, la usarás cada vez que ingreses.'}
            </p>
            <button className="btn btn-primary btn-lg w-100 mb-2" onClick={vincular} style={s('border-radius: 12px; font-weight: 700;')}>
              {existente ? <><i className="fas fa-link me-1"></i> Autorizar y Vincular Dispositivo</>
                : nuevo ? <><i className="fas fa-check-circle me-1"></i> Crear Contraseña y Vincular</>
                  : <><i className="fas fa-mobile-alt me-1"></i> Vincular Dispositivo</>}
            </button>
            <button className="btn btn-outline-secondary w-100" onClick={() => setPantalla('pin')} style={s('border-radius: 12px; font-weight: 600;')}>
              <i className="fas fa-arrow-left me-1"></i> Volver
            </button>
            <div className="text-center mt-3" style={s('font-size: 11px; color: #64748b; line-height: 1.4;')}>
              <i className="fas fa-shield-alt text-primary me-1"></i> Datos tratados bajo la <strong>LOPDP</strong> para fines de control laboral.<br />
              <a href="#" onClick={e => { e.preventDefault(); setAviso(true); }} style={s('color: #0284c7; text-decoration: underline; font-weight: 600;')}>Aviso de Privacidad y Derechos ARCO</a>
            </div>
          </div>
        </div>
      )}

      {cambioClave && <ModalCambioClave empleadoId={cambioClave} onCerrar={() => setCambioClave(null)}
        onListo={(r, p) => { setCambioClave(null); onIngreso(r, p); }} />}
      {aviso && <ModalAvisoPrivacidad onCerrar={() => setAviso(false)} />}
    </div>
  );
}

function PassConRef({ valor, onCambio, onEnter, inputRef, autoFocus }:
  { valor: string; onCambio: (v: string) => void; onEnter: () => void; inputRef: React.MutableRefObject<HTMLInputElement | null>; autoFocus?: boolean }) {
  const [ver, setVer] = useState(false);
  return (
    <>
      <input ref={inputRef} type={ver ? 'text' : 'password'} id="pinInput" className="form-control form-control-lg" placeholder="••••••••"
        autoComplete="current-password" autoFocus={autoFocus} value={valor} onChange={e => onCambio(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onEnter(); }} />
      <Ojo visible={ver} onClick={() => setVer(!ver)} />
    </>
  );
}

// Tarjeta con foto y nombre al escribir el ID (verificarEstadoCuentaEmpleado)
function VistaPreviaAlerta({ id, previa, onIniciarSesion, onCambiarClave }:
  { id: string; previa: VistaPrevia | null | 'cargando' | 'no'; onIniciarSesion: () => void; onCambiarClave: () => void }) {
  if (!previa || !id) return null;
  if (previa === 'cargando') {
    return (
      <div id="registroStatusAlert" className="alert alert-light py-3 px-3 small mb-3 text-center border"
        style={s('border-radius: 16px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border-color: #cbd5e1; box-shadow: 0 4px 14px rgba(0,0,0,0.04);')}>
        <div style={s('display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; padding:6px 0;')}>
          <div className="spinner-border text-primary" style={s('width:2.2rem; height:2.2rem; border-width:0.22em;')} role="status"><span className="visually-hidden">Buscando...</span></div>
          <div>
            <strong style={s('font-size:13.5px; color:#0f172a; display:block;')}>Verificando usuario...</strong>
            <span style={s('font-size:11.5px; color:#64748b;')}>Buscando cuenta para ID: <strong style={{ color: '#0284c7' }}>{id}</strong></span>
          </div>
        </div>
      </div>
    );
  }
  if (previa === 'no') {
    return (
      <div id="registroStatusAlert" className="alert alert-danger py-2 px-3 small mb-3 text-start" style={{ borderRadius: 10, fontSize: 11.5 }}>
        <div style={s('display:flex; align-items:center; gap:8px;')}>
          <i className="fas fa-exclamation-triangle text-danger" style={s('font-size:16px; flex-shrink:0;')}></i>
          <div><strong>No se pudo verificar ID:</strong><div style={s('font-size:11px; margin-top:1px;')}>No se encontró un colaborador activo con ese ID.</div></div>
        </div>
      </div>
    );
  }
  const tiene = previa.tiene_password;
  const primer = extraerPrimerNombre(previa.nombre);
  const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(primer || 'U')}&background=${tiene ? 'f59e0b' : '0284c7'}&color=fff&bold=true`;
  const borde = tiene ? '#f59e0b' : '#10b981';
  const icono = tiene ? 'fa-key' : 'fa-user-plus';
  return (
    <div id="registroStatusAlert" className={`alert ${tiene ? 'alert-warning' : 'alert-info'} py-3 px-3 small mb-3 text-start`} style={{ borderRadius: 10, fontSize: 11.5 }}>
      <div style={s('display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px;')}>
        <div style={s('position:relative; width:96px; height:96px; margin:0 auto;')}>
          <img src={urlFoto(previa.foto_url) || avatar} alt={previa.nombre} onError={e => { const i = e.target as HTMLImageElement; i.onerror = null; i.src = avatar; }}
            style={{ ...s('width:96px; height:96px; min-width:96px; border-radius:50%; object-fit:cover; box-shadow:0 4px 14px rgba(0,0,0,0.14); background:#f1f5f9; display:block;'), border: `3.5px solid ${borde}` }} />
          <span style={{ ...s('position:absolute; bottom:2px; right:2px; width:26px; height:26px; border-radius:50%; color:white; display:flex; align-items:center; justify-content:center; font-size:12px; border:2px solid white; box-shadow:0 2px 5px rgba(0,0,0,0.2);'), background: borde }}>
            <i className={`fas ${icono}`}></i>
          </span>
        </div>
        <div>
          <h4 style={s('font-size:18px; font-weight:800; color:#0f172a; margin:0;')}>¡Hola, {primer}! 👋</h4>
          <div style={s('font-size:11.5px; font-weight:600; color:#64748b; margin-top:2px;')}>{previa.nombre}</div>
          <span style={{ ...s('display:inline-block; font-size:10.5px; font-weight:700; padding:2px 10px; border-radius:12px; margin-top:4px;'), background: tiene ? '#fef3c7' : '#dcfce7', color: tiene ? '#b45309' : '#15803d' }}>
            <i className={`fas ${icono} me-1`}></i>{tiene ? 'Contraseña Registrada' : 'Primera Vinculación'}
          </span>
        </div>
        <div style={s('font-size:12px; color:#475569; line-height:1.4; margin-top:2px;')}>
          {tiene ? 'Tu cuenta ya posee contraseña registrada. Ingrésala abajo para autorizar y vincular este dispositivo.'
            : 'Es tu primera vinculación. Confirma tu cédula y crea una contraseña personal para acceder al sistema.'}
        </div>
      </div>
      {tiene && (
        <div className="mt-3 pt-2 border-top" style={s('display:grid; grid-template-columns:1fr 1fr; gap:8px;')}>
          <button type="button" className="btn btn-outline-primary py-2" onClick={onIniciarSesion} style={s('border-radius:10px; font-size:11.5px; font-weight:700;')}>
            <i className="fas fa-sign-in-alt me-1"></i> Iniciar Sesión
          </button>
          <button type="button" className="btn btn-outline-warning py-2" onClick={onCambiarClave} style={s('border-radius:10px; font-size:11.5px; font-weight:700; color:#b45309; border-color:#f59e0b; background:#fffbeb;')}>
            <i className="fas fa-key me-1"></i> Cambiar Clave
          </button>
        </div>
      )}
      <div className="mt-2 pt-2 border-top" style={s('font-size:10.5px; color:#64748b;')}>
        {tiene ? (<>
          <div style={s('font-weight:700; color:#b45309; margin-bottom:2px;')}><i className="fas fa-shield-alt me-1"></i> Restricciones y Seguridad:</div>
          <ul style={s('margin:0; padding-left:16px; line-height:1.4;')}>
            <li><strong>Dispositivo único:</strong> Al vincular este equipo, cualquier otro teléfono previo quedará desvinculado automáticamente.</li>
            <li><strong>Identidad y GPS:</strong> Tu marcación es personal y se valida por geolocalización.</li>
          </ul>
        </>) : (<>
          <div style={s('font-weight:700; color:#0369a1; margin-bottom:2px;')}><i className="fas fa-info-circle me-1"></i> Requisitos y Restricciones:</div>
          <ul style={s('margin:0; padding-left:16px; line-height:1.4;')}>
            <li>Mínimo <strong>6 caracteres</strong> (letras, números o una frase fácil de recordar).</li>
            <li><strong>Dispositivo único:</strong> Solo podrás registrar asistencia desde este equipo vinculado.</li>
            <li>El registro es <strong>personal e intransferible</strong> con verificación GPS.</li>
          </ul>
        </>)}
      </div>
    </div>
  );
}

// Modal "Cambiar Contraseña" desde la vinculación (mostrarModalCambioPassword)
function ModalCambioClave({ empleadoId, onCerrar, onListo }:
  { empleadoId: string; onCerrar: () => void; onListo: (r: ResultadoLogin, pass: string) => void }) {
  const ui = useUi();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirm, setConfirm] = useState('');
  const guardar = async () => {
    if (!actual.trim()) { ui.toast('Ingresa tu contraseña actual', 'warning'); return; }
    if (nueva.trim().length < 6) { ui.toast('La nueva contraseña debe tener al menos 6 caracteres', 'warning'); return; }
    if (nueva.trim() !== confirm.trim()) { ui.toast('Las nuevas contraseñas no coinciden', 'warning'); return; }
    try {
      const r = await login(empleadoId, actual.trim());
      if (!r.ok) { ui.toast(r.error || 'Contraseña incorrecta', 'error'); return; }
      sesion.guardar(r.token);
      const r2 = await rpc<ResultadoLogin>('cambiar_password', { p_actual: actual.trim(), p_nueva: nueva.trim() });
      sesion.guardar(r2.token);
      recordarId(empleadoId);
      onCerrar();
      await ui.splash({ titulo: '¡Contraseña Actualizada!', nombreEmpleado: r2.nombre || empleadoId,
        subtitulo: 'Tu nueva clave ha sido guardada y tu dispositivo vinculado exitosamente.', icono: 'lock',
        detalles: ['Clave cifrada de forma segura', 'Dispositivo verificado', 'Acceso concedido'], duracion: 1700 });
      onListo(r2, nueva.trim());
    } catch (e) {
      ui.toast('Error al actualizar contraseña: ' + (e as Error).message, 'error');
    }
  };
  return (
    <div>
      <div className="modal fade show" style={s('display:block; background:rgba(15,23,42,0.75); backdrop-filter:blur(6px); z-index:10500;')} tabIndex={-1}>
        <div className="modal-dialog modal-dialog-centered" style={s('max-width:390px; margin:16px auto;')}>
          <div className="modal-content border-0 shadow-lg" style={s('border-radius:22px; overflow:hidden; background:#ffffff;')}>
            <div className="modal-header border-0 pb-0 pt-4 px-4 text-center justify-content-center flex-column">
              <div style={s('width:56px; height:56px; border-radius:50%; background:#eff6ff; color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:24px; margin-bottom:12px; box-shadow:0 4px 12px rgba(37,99,235,0.15);')}>
                <i className="fas fa-key"></i>
              </div>
              <h5 className="modal-title fw-bold" style={s('color:#0f172a; font-size:19px;')}>Cambiar Contraseña</h5>
              <p className="text-muted small mb-0 mt-1">Usuario ID: <strong style={{ color: '#0284c7' }}>{empleadoId}</strong></p>
            </div>
            <div className="modal-body p-4">
              <div className="mb-3 text-start">
                <label className="form-label small fw-bold text-secondary mb-1">Contraseña Actual</label>
                <CampoClave id="chgPassActual" valor={actual} onCambio={setActual} placeholder="Ingresa tu clave actual" autoComplete="current-password" />
              </div>
              <div className="mb-3 text-start">
                <label className="form-label small fw-bold text-secondary mb-1">Nueva Contraseña</label>
                <CampoClave id="chgPassNueva" valor={nueva} onCambio={setNueva} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
              </div>
              <div className="mb-4 text-start">
                <label className="form-label small fw-bold text-secondary mb-1">Confirmar Nueva Contraseña</label>
                <CampoClave id="chgPassConfirm" valor={confirm} onCambio={setConfirm} placeholder="Repite la nueva clave" autoComplete="new-password" onEnter={guardar} />
              </div>
              <button className="btn btn-primary btn-lg w-100 py-3 mb-2" onClick={guardar}
                style={s('border-radius:14px; font-weight:700; background:linear-gradient(135deg, #2563eb, #1d4ed8); border:none; box-shadow:0 4px 14px rgba(37,99,235,0.3);')}>
                <i className="fas fa-save me-1"></i> Actualizar y Vincular
              </button>
              <button className="btn btn-light w-100 py-2" onClick={onCerrar} style={s('border-radius:12px; font-weight:600; color:#64748b;')}>Cancelar</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
