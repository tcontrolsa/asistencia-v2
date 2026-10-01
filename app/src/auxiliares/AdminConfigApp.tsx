// Panel de Configuración (admin_config.html + JS/admin_config_core.js): geocerca, horarios, registro,
// supervisores, soporte y restablecimiento de contraseñas. Exclusivo de Sup. Admin / Administrador.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { rpc } from '../lib/api';
import { leerClaims } from '../lib/sesion';
import { s } from '../lib/estilo';

const DEF = { lat: -0.1288771313385675, lng: -78.47896772889067, radio: 250, inicio: '07:30', salida: '16:15', almuerzo: '09:30', limite: '07:45' };
const SOPORTE = 'Hola, necesito soporte técnico para el sistema CONTROL 2026';
const MANT = 'El sistema se encuentra en mantenimiento. Por favor intenta más tarde.';

interface Form {
  lat: string; lng: string; radio: string;
  hora_inicio: string; hora_fin: string; hora_almuerzo: string; hora_entrada_limite: string; hora_salida: string;
  almuerzo_activo: boolean; marcacion_automatica: boolean; tiempo_automatico: string;
  tolerancia_gps: string; requiere_foto: boolean; permite_registro_manual: boolean;
  whatsapp_number: string; mensaje_soporte: string; modo_mantenimiento: boolean; mensaje_mantenimiento: string;
}

function aForm(res: any): Form {
  const u = res.ubicacion || {}, h = res.horarios || {}, r = res.registro || {}, o = res.otras || {};
  return {
    lat: String(u.lat || DEF.lat), lng: String(u.lng || DEF.lng), radio: String(u.radio || DEF.radio),
    hora_inicio: h.hora_inicio || DEF.inicio, hora_fin: h.hora_fin || DEF.salida, hora_almuerzo: h.hora_almuerzo || DEF.almuerzo,
    hora_entrada_limite: h.hora_entrada_limite || DEF.limite, hora_salida: h.hora_salida || DEF.salida,
    almuerzo_activo: h.almuerzo_activo !== false, marcacion_automatica: !!h.marcacion_automatica, tiempo_automatico: String(h.tiempo_automatico || 10),
    tolerancia_gps: String(r.tolerancia_gps || 50), requiere_foto: !!r.requiere_foto, permite_registro_manual: !!r.permite_registro_manual,
    whatsapp_number: o.whatsapp_number || '593963561149', mensaje_soporte: o.mensaje_soporte || SOPORTE,
    modo_mantenimiento: !!o.modo_mantenimiento, mensaje_mantenimiento: o.mensaje_mantenimiento || MANT,
  };
}

// limpiarCoordenada: deja dígitos, punto y signo; redondea a 6 decimales
function limpiarCoordenada(v: string): number | null {
  if (!v) return null;
  const n = parseFloat(String(v).trim().replace(/[^\d.-]/g, ''));
  return isNaN(n) ? null : Math.round(n * 1e6) / 1e6;
}

export function AdminConfigApp() {
  const claims = leerClaims();
  const autorizado = !!claims && ['supervisor_admin', 'admin'].includes(claims.role);
  const [f, setF] = useState<Form | null>(null);
  const [base, setBase] = useState<any>(null);
  const [supervisores, setSupervisores] = useState<any[] | null>(null);
  const [nuevoSup, setNuevoSup] = useState('');
  const [cargando, setCargando] = useState(false);
  const [alerta, setAlerta] = useState<{ m: string; ok: boolean } | null>(null);

  const reloj = useRef(0);
  const mensaje = (m: string, ok = true) => {
    setAlerta({ m, ok });
    window.clearTimeout(reloj.current);
    reloj.current = window.setTimeout(() => setAlerta(null), 3000);
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(x => (x ? { ...x, [k]: v } : x));

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await rpc<any>('sup_config_sistema', {});
      setBase(res);
      setF(aForm(res));
      setSupervisores(res.supervisores || []);
      mensaje('Configuraciones cargadas correctamente');
    } catch (e: any) { mensaje('Error al cargar configuraciones: ' + e.message, false); }
    finally { setCargando(false); }
  };
  useEffect(() => { if (autorizado) void cargar(); }, [autorizado]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async () => {
    if (!f) return;
    const lat = limpiarCoordenada(f.lat), lng = limpiarCoordenada(f.lng);
    if (lat === null || lng === null) { mensaje('Coordenadas inválidas. Verifica el formato.', false); return; }
    const cfg = {
      ubicacion: { lat, lng, radio: parseInt(f.radio) || 250 },
      horarios: { hora_inicio: f.hora_inicio, hora_fin: f.hora_fin, hora_almuerzo: f.hora_almuerzo, hora_entrada_limite: f.hora_entrada_limite,
        hora_salida: f.hora_salida, almuerzo_activo: f.almuerzo_activo, marcacion_automatica: f.marcacion_automatica, tiempo_automatico: parseInt(f.tiempo_automatico) || 10 },
      registro: { tolerancia_gps: parseInt(f.tolerancia_gps) || 50, requiere_foto: f.requiere_foto, permite_registro_manual: f.permite_registro_manual },
      otras: { ...(base?.otras || {}), whatsapp_number: f.whatsapp_number, mensaje_soporte: f.mensaje_soporte, modo_mantenimiento: f.modo_mantenimiento, mensaje_mantenimiento: f.mensaje_mantenimiento },
    };
    setCargando(true);
    try {
      await rpc('sup_guardar_config_sistema', { p: cfg });
      mensaje('Configuración guardada exitosamente');
      window.setTimeout(() => void cargar(), 1000);
    } catch (e: any) { mensaje('Error al guardar: ' + e.message, false); }
    finally { setCargando(false); }
  };

  const supervisor = async (id: string, agregar: boolean) => {
    if (!id) { mensaje('Ingresa el ID del empleado', false); return; }
    if (!agregar && !window.confirm(`¿Eliminar al supervisor ${id}?`)) return;
    setCargando(true);
    try {
      await rpc('sup_config_supervisor', { p_empleado_id: id, p_agregar: agregar });
      if (agregar) setNuevoSup('');
      mensaje(agregar ? 'Supervisor agregado exitosamente' : 'Supervisor eliminado');
      await cargar();
    } catch (e: any) { mensaje('Error: ' + e.message, false); }
    finally { setCargando(false); }
  };

  const ubicacionActual = () => {
    if (!navigator.geolocation) { mensaje('Geolocalización no soportada', false); return; }
    mensaje('Obteniendo ubicación...');
    navigator.geolocation.getCurrentPosition(p => {
      const lat = Math.round(p.coords.latitude * 1e6) / 1e6, lng = Math.round(p.coords.longitude * 1e6) / 1e6;
      setF(x => (x ? { ...x, lat: String(lat), lng: String(lng) } : x));
      mensaje(`Ubicación actual cargada: ${lat}, ${lng}`);
    }, e => mensaje('Error al obtener ubicación: ' + e.message, false), { enableHighAccuracy: true, timeout: 10000 });
  };

  const resetearPines = async () => {
    if (!window.confirm('⚠️ ADVERTENCIA DE SEGURIDAD:\n\n¿Estás seguro de que deseas BORRAR los PINs/Contraseñas de TODOS los empleados?\n\nAl ejecutar esta acción, ninguna cuenta tendrá contraseña guardada y cada usuario deberá ingresar a la app para registrar su nueva contraseña personal.')) return;
    const conf = window.prompt('Para confirmar la eliminación masiva de contraseñas, escribe exactamente la palabra: BORRAR');
    if (conf !== 'BORRAR') { window.alert('Operación cancelada. El texto ingresado no es correcto.'); return; }
    setCargando(true);
    try {
      const r = await rpc<any>('sup_resetear_contrasenas_todos', { p_confirmacion: conf });
      window.alert('✅ ' + (r?.mensaje || 'Contraseñas restablecidas exitosamente.'));
      mensaje('Contraseñas restablecidas correctamente');
    } catch (e: any) {
      window.alert('❌ Error: ' + (e.message || 'No se pudo restablecer las contraseñas.'));
      mensaje('Error al restablecer contraseñas', false);
    } finally { setCargando(false); }
  };

  if (!autorizado) {
    return (
      <div className="config-container">
        <div style={s("max-width: 480px; margin: 80px auto; padding: 40px 30px; background: white; border-radius: 24px; text-align: center; box-shadow: 0 20px 45px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; font-family: 'Plus Jakarta Sans', sans-serif;")}>
          <div style={s('width: 80px; height: 80px; margin: 0 auto 20px; border-radius: 50%; background: #fee2e2; color: #dc2626; display: flex; align-items: center; justify-content: center; font-size: 36px;')}><i className="fas fa-lock"></i></div>
          <h2 style={s('font-size: 22px; font-weight: 800; color: #0f172a; margin-bottom: 12px;')}>Acceso Restringido</h2>
          <p style={s('font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 26px;')}>Este panel contiene configuraciones críticas de geocerca y horarios de la empresa. Se requiere iniciar sesión como Administrador en el panel de Supervisión.</p>
          <a href="supervisor.html" className="btn btn-danger w-100" style={s('padding: 13px; font-weight: 700; border-radius: 12px; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px;')}><i className="fas fa-arrow-left"></i> Ir a Panel de Supervisión</a>
        </div>
      </div>
    );
  }

  const v = f || aForm({});
  const txt = (k: keyof Form, props: Record<string, unknown> = {}) => (
    <input className={`form-control${k === 'lat' || k === 'lng' ? ' coordenadas-input' : ''}`} value={v[k] as string} onChange={e => set(k, e.target.value as never)} {...props} />
  );
  const sw = (k: keyof Form, etiqueta: string) => (
    <div className="form-check form-switch">
      <input className="form-check-input" type="checkbox" role="switch" id={`cfg_${k}`} checked={v[k] as boolean} onChange={e => set(k, e.target.checked as never)} />
      <label className="form-check-label" htmlFor={`cfg_${k}`}>{etiqueta}</label>
    </div>
  );

  return (
    <>
      <div className="config-container">
        <div className="config-header">
          <div className="config-header-text">
            <h1><i className="fas fa-sliders-h"></i> Panel de Configuración</h1>
            <p>CONTROL 2026 - Sistema de Gestión de Asistencia</p>
          </div>
        </div>
        <div className="config-grid">
          <div className="config-column">
            <div className="config-card">
              <div className="card-title"><i className="fas fa-map-marker-alt text-danger"></i> Ubicación de la Empresa</div>
              <div className="row g-2 mb-3">
                <div className="col-6"><label className="form-label">Latitud</label>{txt('lat', { type: 'text', placeholder: '-0.128877' })}</div>
                <div className="col-6"><label className="form-label">Longitud</label>{txt('lng', { type: 'text', placeholder: '-78.478967' })}</div>
              </div>
              <div className="help-text mb-3">Punto geográfico central de la sucursal de la empresa.</div>
              <div className="mb-3">
                <label className="form-label">Radio de Validez (metros)</label>
                {txt('radio', { type: 'number', placeholder: '250', min: 10, max: 1000 })}
                <div className="help-text">Distancia máxima permitida para registrar asistencia.</div>
              </div>
              <button className="btn btn-outline-primary w-100 mt-2" onClick={ubicacionActual}><i className="fas fa-location-dot"></i> Usar mi ubicación actual</button>
            </div>

            <div className="config-card">
              <div className="card-title"><i className="fas fa-clock text-primary"></i> Horarios Laborales</div>
              <div className="row g-2 mb-3">
                <div className="col-6"><label className="form-label">Inicio de Jornada</label>{txt('hora_inicio', { type: 'time' })}</div>
                <div className="col-6"><label className="form-label">Fin de Jornada</label>{txt('hora_fin', { type: 'time' })}</div>
              </div>
              <hr />
              <div className="mb-3">
                <label className="form-label">Hora Límite de Almuerzo</label>{txt('hora_almuerzo', { type: 'time' })}
                <div className="help-text">Hora tope para registrar la opción de almuerzo hoy.</div>
              </div>
              <div className="mb-3">{sw('almuerzo_activo', 'Activar hora límite de almuerzo')}<div className="help-text">Si está desactivado, el registro se permite a cualquier hora.</div></div>
              <hr />
              <div className="row g-2 mb-3">
                <div className="col-6"><label className="form-label">Entrada Tardía Límite</label>{txt('hora_entrada_limite', { type: 'time' })}</div>
                <div className="col-6"><label className="form-label">Hora Salida Final</label>{txt('hora_salida', { type: 'time' })}</div>
              </div>
              <div className="help-text mb-3">Entradas después o salidas antes de estas horas requieren justificación.</div>
              <hr />
              <div className="mb-3">{sw('marcacion_automatica', 'Marcación automática de salida')}<div className="help-text">Registrar salida de forma automática después del tiempo indicado.</div></div>
              {v.marcacion_automatica && (
                <div className="mb-3">
                  <label className="form-label">Tiempo para marcación (minutos)</label>{txt('tiempo_automatico', { type: 'number', min: 1, max: 120 })}
                  <div className="help-text">Minutos después de fin de jornada para registrar la salida.</div>
                </div>
              )}
            </div>
          </div>

          <div className="config-column">
            <div className="config-card">
              <div className="card-title"><i className="fas fa-fingerprint text-success"></i> Parámetros de Registro</div>
              <div className="mb-3">
                <label className="form-label">Tolerancia de GPS (metros)</label>{txt('tolerancia_gps', { type: 'number', min: 0, max: 200 })}
                <div className="help-text">Margen de imprecisión permitido para la señal de GPS.</div>
              </div>
              <div className="mb-3">{sw('requiere_foto', 'Requerir foto en cada registro')}<div className="help-text">Obliga a tomar una fotografía al marcar entrada o salida.</div></div>
              <div className="mb-3">{sw('permite_registro_manual', 'Permitir registro manual (sin GPS)')}<div className="help-text">Habilita a los supervisores a forzar marcaciones manualmente.</div></div>
            </div>

            <div className="config-card">
              <div className="card-title"><i className="fas fa-user-tie text-info"></i> Usuarios Supervisores</div>
              <div className="mb-3">
                <label className="form-label">Asignar Nuevo Supervisor</label>
                <div className="input-group">
                  <input type="text" className="form-control" placeholder="ID de empleado" value={nuevoSup} onChange={e => setNuevoSup(e.target.value)} />
                  <button className="btn btn-primary px-3" onClick={() => void supervisor(nuevoSup.trim(), true)}><i className="fas fa-plus"></i></button>
                </div>
                <div className="help-text">Ingresa el ID único de empleado para darle acceso administrativo.</div>
              </div>
              <div className="info-badge">
                <i className="fas fa-list-ul"></i> <strong>Supervisores Activos</strong>
                <div className="mt-2">
                  {supervisores === null ? <div className="text-muted small">Cargando lista...</div>
                    : !supervisores.length ? <div className="text-muted">No hay supervisores registrados</div>
                    : supervisores.map(sp => (
                      <div key={sp.id} className="d-flex justify-content-between align-items-center p-2 border-bottom">
                        <div><strong>{sp.nombre || sp.id}</strong><br /><small className="text-muted">ID: {sp.id}</small></div>
                        <button className="btn btn-sm btn-outline-danger" onClick={() => void supervisor(sp.id, false)}><i className="fas fa-trash"></i></button>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="config-card">
              <div className="card-title"><i className="fas fa-cog text-secondary"></i> Soporte y Mantenimiento</div>
              <div className="mb-3">
                <label className="form-label">WhatsApp de Soporte Técnico</label>{txt('whatsapp_number', { type: 'tel', placeholder: '593963561149' })}
                <div className="help-text">Número de contacto (con código de país y sin el signo +).</div>
              </div>
              <div className="mb-3">
                <label className="form-label">Mensaje Predeterminado de Soporte</label>
                <textarea className="form-control" rows={2} value={v.mensaje_soporte} onChange={e => set('mensaje_soporte', e.target.value)} />
              </div>
              <hr />
              <div className="mb-3">{sw('modo_mantenimiento', 'Modo Mantenimiento Activo')}<div className="help-text">Restringe el acceso y muestra pantalla de mantenimiento a empleados.</div></div>
              {v.modo_mantenimiento && (
                <div className="mb-3">
                  <label className="form-label">Mensaje en Pantalla</label>
                  <textarea className="form-control" rows={2} value={v.mensaje_mantenimiento} onChange={e => set('mensaje_mantenimiento', e.target.value)} />
                </div>
              )}
            </div>

            <div className="config-card">
              <div className="card-title"><i className="fas fa-bolt text-warning"></i> Mantenimiento de Cuentas</div>
              <div className="mb-2">
                <button className="btn btn-danger w-100 fw-bold justify-content-center shadow-sm" onClick={() => void resetearPines()}><i className="fas fa-key"></i> Restablecer Contraseñas de Todos</button>
                <div className="help-text mt-2 text-center">
                  Borra los PINs de todos los empleados para que cada uno establezca su propia contraseña al entrar.<br />
                  <span className="text-danger fw-bold"><i className="fas fa-shield-alt"></i> Requiere confirmación de seguridad.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sticky-action-bar">
        <button className="btn btn-success px-4" onClick={() => void guardar()}><i className="fas fa-save"></i> Guardar Cambios</button>
        <button className="btn btn-outline-secondary px-4" onClick={() => void cargar()}><i className="fas fa-sync-alt"></i> Recargar</button>
      </div>

      <div className="save-alert" style={{ display: alerta ? 'flex' : 'none', ...(alerta && !alerta.ok ? { background: '#dc2626' } : {}) }}>
        <i className={`fas fa-${alerta?.ok === false ? 'exclamation-circle' : 'check-circle'}`}></i> {alerta?.m}
      </div>
      <div className={`loading-overlay${cargando ? '' : ' hidden'}`}><div className="loading-spinner"></div></div>
    </>
  );
}
