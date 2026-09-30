import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { rpc, sesion, urlFoto } from '../lib/api';
import { s } from '../lib/estilo';
import { fechaDMY } from '../lib/formato';
import { ahora, partes } from '../lib/reloj';
import { claves, useVacaciones } from '../lib/datos';
import { useSubirFoto } from '../lib/foto';
import { leerClaims } from '../lib/sesion';
import { useApp } from '../app/Estado';
import { useUi } from '../ui/Ui';
import { ModalAvisoPrivacidad } from '../ui/Modales';
import { forzarActualizacion } from '../pwa';
import { useVerificarDistancia } from './HomePage';

function ClaveOpcional({ id, valor, onCambio, ph }: { id: string; valor: string; onCambio: (v: string) => void; ph: string }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="input-group">
      <input type={ver ? 'text' : 'password'} id={id} className="form-control" placeholder={ph} value={valor} onChange={e => onCambio(e.target.value)} />
      <button className="btn btn-outline-secondary" type="button" onClick={() => setVer(!ver)}><i className={`fas ${ver ? 'fa-eye-slash' : 'fa-eye'}`}></i></button>
    </div>
  );
}

// Perfil del colaborador (renderProfilePage / guardarPerfilEmpleado)
export function ProfilePage() {
  const app = useApp();
  const { emp, registros, cargandoRegistros } = app;
  const ui = useUi();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const subirFoto = useSubirFoto(emp.nombre);
  const verificar = useVerificarDistancia();
  const vac = useVacaciones(emp.id);
  const [aviso, setAviso] = useState(false);
  const [nombre, setNombre] = useState(emp.nombre || '');
  const [tel, setTel] = useState(emp.telefono || '');
  const [fechaNac, setFechaNac] = useState(emp.fecha_nacimiento || '');
  const [fotoUrl, setFotoUrl] = useState(emp.foto_url?.startsWith('/rpc/') ? '' : (emp.foto_url || ''));
  const [pActual, setPActual] = useState('');
  const [pNueva, setPNueva] = useState('');
  const [pConfirm, setPConfirm] = useState('');

  const foto = urlFoto(emp.foto_url);
  const p = partes(ahora());
  const mesActual = `${p.anio}-${String(p.mes).padStart(2, '0')}`;
  const totalEntradas = cargandoRegistros ? '...' : registros.filter(r => r.tipo === 'ENTRADA').length;
  const totalSalidas = cargandoRegistros ? '...' : registros.filter(r => r.tipo === 'SALIDA').length;
  const diasMes = cargandoRegistros ? '...' : new Set(registros.filter(r => r.fecha.startsWith(mesActual)).map(r => r.fecha)).size;
  const dispositivo = leerClaims()?.dispositivo;

  const guardar = async () => {
    if (!nombre.trim()) { ui.toast('El nombre no puede estar vacío', 'warning'); return; }
    const telLimpio = tel.replace(/\D/g, '');
    if (tel && telLimpio.length < 8) { ui.toast('Por favor ingresa un número de teléfono válido (mínimo 8 dígitos)', 'warning'); return; }
    if (pNueva) {
      if (!pActual) { ui.toast('Ingresa tu contraseña actual para confirmar el cambio', 'warning'); return; }
      if (pNueva.trim().length < 6) { ui.toast('La nueva contraseña debe tener al menos 6 caracteres', 'warning'); return; }
      if (pNueva !== pConfirm) { ui.toast('La nueva contraseña y su confirmación no coinciden', 'warning'); return; }
    }
    ui.cargando(true);
    try {
      await rpc('guardar_perfil', { p_nombre: nombre.trim(), p_telefono: telLimpio, p_fecha_nacimiento: fechaNac || null,
        p_foto_url: fotoUrl.trim() || (emp.foto_url?.startsWith('/rpc/') ? null : '') });
      if (pNueva) {
        const r = await rpc<{ token: string }>('cambiar_password', { p_actual: pActual.trim(), p_nueva: pNueva.trim() });
        sesion.guardar(r.token);
      }
      await qc.invalidateQueries({ queryKey: claves.contexto });
      ui.cargando(false);
      setPActual(''); setPNueva(''); setPConfirm('');
      await ui.splash({ titulo: '¡Perfil Actualizado!', nombreEmpleado: nombre.trim(),
        subtitulo: pNueva ? 'Tu información y tu contraseña fueron actualizadas exitosamente.' : 'Tu información personal fue guardada exitosamente.',
        icono: 'check', detalles: ['Datos personales sincronizados', pNueva ? 'Nueva contraseña guardada' : 'Expediente actualizado'], duracion: 1500 });
    } catch (e) {
      ui.cargando(false);
      ui.toast((e as Error).message || 'Error al actualizar perfil', 'error');
    }
  };

  const cerrarSesion = async () => {
    if (!window.confirm('¿Cerrar sesión? Se eliminará el acceso de este dispositivo.')) return;
    ui.cargando(true);
    try { await rpc('cerrar_sesion'); } catch { /* igual se cierra localmente */ }
    sesion.cerrar();
    try { sessionStorage.removeItem('justificar_popup_saltado'); } catch { /* */ }
    location.reload();
  };

  const tarjeta = 'padding: 20px 18px; border-radius: 20px; background: rgba(255,255,255,0.85); box-shadow: 0 8px 30px rgba(0,0,0,0.04); border: 1px solid rgba(255,255,255,0.7);';
  const tituloT = 'font-size: 14.5px; color: #1e293b; display: flex; align-items: center; gap: 8px; letter-spacing: -0.2px;';
  const accion = 'font-size: 13.5px; padding: 12px 14px; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s;';
  const dato = 'display: flex; justify-content: space-between; align-items: center; background: rgba(248,250,252,0.8); padding: 10px 14px; border-radius: 10px; border: 1px solid #f1f5f9; box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);';

  return (
    <div className="page" style={s('padding-bottom: 30px; animation: fadeIn 0.35s ease;')}>
      <div className="glass-card text-center" style={s('background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.85) 100%); border-radius: 24px; padding: 30px 20px; box-shadow: 0 12px 40px rgba(0,0,0,0.06); border: 1px solid rgba(255, 255, 255, 0.7); position: relative; overflow: hidden;')}>
        <div style={s('position: absolute; top: -50px; right: -50px; width: 120px; height: 120px; background: radial-gradient(circle, rgba(220,38,38,0.08) 0%, transparent 70%); pointer-events: none;')}></div>
        <div className="photo-container-premium d-inline-block profile-photo-container" onClick={subirFoto}
          style={s('position: relative; border-radius: 50%; padding: 4px; background: linear-gradient(135deg, var(--primary) 0%, #3b82f6 100%); box-shadow: 0 10px 28px rgba(37,99,235,0.2); cursor: pointer; transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); display: inline-block;')}>
          {foto
            ? <img className="employee-photo-profesional" src={foto} alt="Foto" style={s('border-radius: 50%; width: 110px; height: 110px; object-fit: cover; border: 4px solid white;')} />
            : <div className="employee-photo-placeholder-profesional" style={s('border-radius: 50%; width: 110px; height: 110px; display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%); font-size: 40px; border: 4px solid white; color: #475569;')}>👤</div>}
          <div className="photo-upload-overlay" style={s('position: absolute; top: 4px; left: 4px; right: 4px; bottom: 4px; background: rgba(15, 23, 42, 0.6); display: flex; align-items: center; justify-content: center; color: white; font-size: 20px; opacity: 0; transition: opacity 0.25s ease; border-radius: 50%;')}><i className="fas fa-camera"></i></div>
        </div>
        <h3 className="fw-bold mt-3 mb-1" style={s('font-size: 22px; color: #0f172a; letter-spacing: -0.5px;')}>{emp.nombre || 'Empleado'}</h3>
        <p className="text-primary fw-bold mb-0" style={s('font-size: 14px; color: var(--primary); letter-spacing: 0.8px; text-transform: uppercase;')}>{emp.cargo || 'Sin Cargo'}</p>
        <p className="text-muted small mb-2" style={s('font-size: 12px; font-weight: 500; background: rgba(100,116,139,0.06); display: inline-block; padding: 3px 12px; border-radius: 20px; margin-top: 5px;')}>Área: {emp.area || 'Área'}</p>
        <div className="d-flex justify-content-center gap-2 mt-2 flex-wrap">
          <span className="badge" style={s('background: rgba(15, 23, 42, 0.05); color: #1e293b; font-size: 11.5px; padding: 6px 12px; border-radius: 8px; font-weight: 600; border: 1px solid rgba(15,23,42,0.05);')}><i className="fas fa-id-card me-1" style={{ color: '#64748b' }}></i> ID: {emp.id || '-'}</span>
          {emp.es_supervisor && <span className="badge" style={s('background: linear-gradient(135deg, rgba(59,130,246,0.1), rgba(37,99,235,0.15)); color: #1d4ed8; font-size: 11.5px; padding: 6px 12px; border-radius: 8px; font-weight: 700; border: 1px solid rgba(37,99,235,0.1);')}><i className="fas fa-crown me-1" style={{ color: '#3b82f6' }}></i> Supervisor</span>}
          {emp.telefono && <span className="badge" style={s('background: rgba(2, 132, 199, 0.07); color: #0284c7; font-size: 11.5px; padding: 6px 12px; border-radius: 8px; font-weight: 600; border: 1px solid rgba(2,132,199,0.15);')}><i className="fas fa-phone-alt me-1" style={{ color: '#0284c7' }}></i> {emp.telefono}</span>}
          {emp.fecha_nacimiento && <span className="badge" style={s('background: rgba(234, 88, 12, 0.07); color: #ea580c; font-size: 11.5px; padding: 6px 12px; border-radius: 8px; font-weight: 600; border: 1px solid rgba(234,88,12,0.15);')}><i className="fas fa-cake-candles me-1" style={{ color: '#ea580c' }}></i> {fechaDMY(emp.fecha_nacimiento)}</span>}
        </div>
        <div style={s('display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 24px; padding-top: 20px; border-top: 1px dashed rgba(148,163,184,0.3);')}>
          {([[totalEntradas, 'Entradas', '#16a34a', 'rgba(220,38,38,0.04)', 'rgba(22,163,74,0.06)'], [diasMes, 'Días (Mes)', '#2563eb', 'rgba(59,130,246,0.04)', 'rgba(59,130,246,0.06)'],
            [totalSalidas, 'Salidas', '#dc2626', 'rgba(220,38,38,0.04)', 'rgba(220,38,38,0.06)']] as const).map(([v, t, c, bg, b]) => (
            <div key={t} style={{ ...s('text-align: center; padding: 10px 5px; border-radius: 12px;'), background: bg, border: `1px solid ${b}` }}>
              <div style={{ ...s('font-size: 20px; font-weight: 800; line-height: 1;'), color: c }}>{v}</div>
              <div style={{ ...s('font-size: 9.5px; font-weight: 700; text-transform: uppercase; margin-top: 6px; letter-spacing: 0.3px;'), color: c }}>{t}</div>
            </div>
          ))}
        </div>
      </div>

      {emp.es_pasante ? (
        <div className="glass-card mt-3" style={s('padding: 20px 18px; border-radius: 20px; background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(245,243,255,0.9) 100%); box-shadow: 0 8px 30px rgba(0,0,0,0.04); border: 1px solid rgba(221,214,254,0.8); display: flex; align-items: center; justify-content: space-between; position: relative; overflow: hidden;')}>
          <div style={{ textAlign: 'left' }}>
            <h5 className="fw-bold mb-1" style={s('font-size: 14.5px; color: #6d28d9; display: flex; align-items: center; gap: 8px; letter-spacing: -0.2px;')}><i className="fas fa-user-graduate" style={{ color: '#7c3aed' }}></i> Régimen de Pasantía</h5>
            <p style={s('font-size: 11.5px; color: #7c3aed; margin: 0;')}>Horario flexible • Registro obligatorio de Entrada y Salida</p>
          </div>
          <div style={s('background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white; min-width: 54px; height: 45px; padding: 0 10px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; box-shadow: 0 4px 10px rgba(124,58,237,0.3); text-transform: uppercase;')}>FLEX</div>
        </div>
      ) : (
        <div className="glass-card mt-3" style={s('padding: 20px 18px; border-radius: 20px; background: linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(240,249,255,0.85) 100%); box-shadow: 0 8px 30px rgba(0,0,0,0.04); border: 1px solid rgba(186,230,253,0.7); display: flex; align-items: center; justify-content: space-between; position: relative; overflow: hidden;')}>
          <div style={{ textAlign: 'left' }}>
            <h5 className="fw-bold mb-1" style={s('font-size: 14.5px; color: #0369a1; display: flex; align-items: center; gap: 8px; letter-spacing: -0.2px;')}><i className="fas fa-umbrella-beach"></i> Vacaciones Disponibles</h5>
            <p style={s('font-size: 11.5px; color: #0284c7; margin: 0;')}>
              Total tomadas: {vac.isLoading ? <span className="spinner-border text-primary" role="status" style={s('width:10px; height:10px; border-width:1.5px; display:inline-block; vertical-align: middle;')}></span>
                : vac.isError ? <strong className="text-danger">error</strong> : <><strong>{vac.data?.tomadas ?? 0}</strong> día(s)</>}
            </p>
          </div>
          <div style={s('background: #0284c7; color: white; width: 45px; height: 45px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; box-shadow: 0 4px 10px rgba(2,132,199,0.3);')}>
            {vac.isLoading ? <div className="spinner-border text-light" role="status" style={s('width:16px; height:16px; border-width:2px;')}></div> : (vac.data?.restantes ?? '--')}
          </div>
        </div>
      )}

      <div className="glass-card mt-3" style={s('padding: 22px 18px; border-radius: 20px; background: rgba(255,255,255,0.9); box-shadow: 0 8px 30px rgba(0,0,0,0.04); border: 1px solid rgba(255,255,255,0.8); text-align: left;')}>
        <h5 className="fw-bold mb-3" style={s(tituloT)}><i className="fas fa-user-gear" style={{ color: '#2563eb' }}></i> Actualizar Mis Datos y Contraseña</h5>
        <div style={s('display: flex; flex-direction: column; gap: 12px;')}>
          <div><label className="form-label small fw-bold text-secondary mb-1">Nombre Completo</label>
            <input type="text" className="form-control" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre" /></div>
          <div><label className="form-label small fw-bold text-secondary mb-1">Teléfono Móvil / Celular</label>
            <div className="input-group">
              <span className="input-group-text" style={s('background:#f8fafc; color:#64748b; border:1px solid #ced4da; border-right:none;')}><i className="fas fa-phone-alt"></i></span>
              <input type="tel" className="form-control" value={tel} onChange={e => setTel(e.target.value)} placeholder="Ej. 0991234567" />
            </div></div>
          <div><label className="form-label small fw-bold text-secondary mb-1">Fecha de Nacimiento</label>
            <div className="input-group">
              <span className="input-group-text" style={s('background:#f8fafc; color:#64748b; border:1px solid #ced4da; border-right:none;')}><i className="fas fa-calendar-alt"></i></span>
              <input type="date" className="form-control" value={fechaNac} onChange={e => setFechaNac(e.target.value)} />
            </div></div>
          <div><label className="form-label small fw-bold text-secondary mb-1">URL de Foto de Perfil</label>
            <div className="input-group">
              <input type="url" className="form-control" value={fotoUrl} onChange={e => setFotoUrl(e.target.value)} placeholder="https://drive.google.com/..." />
              <button className="btn btn-outline-primary" type="button" onClick={subirFoto}><i className="fas fa-camera"></i></button>
            </div></div>
          <hr style={s('margin: 8px 0; border-color: #e2e8f0;')} />
          <div style={s('font-size: 12px; font-weight: 700; color: #3b82f6; display: flex; align-items: center; gap: 6px;')}><i className="fas fa-key"></i> Cambiar Contraseña (Opcional)</div>
          <div><label className="form-label small text-secondary mb-1" style={{ fontSize: 11 }}>Contraseña Actual</label>
            <ClaveOpcional id="profPassActual" valor={pActual} onCambio={setPActual} ph="Requerida para cambiar clave" /></div>
          <div><label className="form-label small text-secondary mb-1" style={{ fontSize: 11 }}>Nueva Contraseña</label>
            <ClaveOpcional id="profPassNueva" valor={pNueva} onCambio={setPNueva} ph="Mínimo 6 caracteres" /></div>
          <div><label className="form-label small text-secondary mb-1" style={{ fontSize: 11 }}>Confirmar Nueva Contraseña</label>
            <ClaveOpcional id="profPassConfirm" valor={pConfirm} onCambio={setPConfirm} ph="Repite la nueva clave" /></div>
          <button className="btn btn-primary w-100 mt-2" onClick={guardar} style={s('border-radius: 12px; font-weight: 700; padding: 10px; background: var(--primary); border: none;')}>
            <i className="fas fa-floppy-disk me-1"></i> Guardar Cambios en Perfil
          </button>
        </div>
      </div>

      <div className="glass-card mt-3" style={s(tarjeta)}>
        <h5 className="fw-bold mb-3" style={s(tituloT)}><i className="fas fa-shield-alt" style={{ color: '#64748b' }}></i> Seguridad y Conectividad</h5>
        <div style={s('display: flex; flex-direction: column; gap: 10px;')}>
          <div style={s(dato)}>
            <span style={s('font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;')}><i className="fas fa-fingerprint me-1"></i> TOKEN:</span>
            <span className="font-monospace" style={s('font-size: 11px; color: #334155; font-weight: 600; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: #e2e8f0; padding: 2px 8px; border-radius: 4px;')}>{dispositivo || '--'}</span>
          </div>
          <div style={s(dato)}>
            <span style={s('font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;')}><i className="fas fa-location-crosshairs me-1"></i> GPS:</span>
            <span style={s('font-size: 11px; color: #334155; font-weight: 700;')}>
              {app.gpsActivo && app.pos.lat !== null
                ? <><i className="fas fa-circle text-success me-1" style={{ fontSize: 8 }}></i> {app.pos.lat.toFixed(6)}, {app.pos.lng!.toFixed(6)}</>
                : <span style={{ color: '#ef4444' }}><i className="fas fa-triangle-exclamation me-1"></i> No disponible</span>}
            </span>
          </div>
        </div>
      </div>

      <div className="glass-card mt-3" style={s(tarjeta)}>
        <h5 className="fw-bold mb-3" style={s(tituloT)}><i className="fas fa-sliders" style={{ color: '#64748b' }}></i> Acciones y Soporte</h5>
        <div style={s('display: flex; flex-direction: column; gap: 10px;')}>
          {emp.es_supervisor && (
            <button className="btn btn-danger w-100" onClick={() => navegar('/estado')} style={s(accion + ' font-weight: 750; background: #dc2626; color: white; border: none; cursor: pointer; box-shadow: 0 4px 12px rgba(220,38,38,0.25);')}>
              <i className="fas fa-exclamation-triangle"></i> Control de Emergencias (Simulacros)
            </button>
          )}
          <button className="btn btn-outline-secondary w-100" onClick={() => location.reload()} style={s(accion + ' font-weight: 600; border-color: #cbd5e1; color: #334155; background: white;')}>
            <i className="fas fa-arrows-rotate" style={{ color: '#64748b' }}></i> Sincronizar Datos
          </button>
          <button className="btn w-100" onClick={() => { if (window.confirm('¿Deseas descargar la última versión del sistema y limpiar la memoria caché de este dispositivo?\n\nEsta acción descargará todos los archivos actualizados.')) forzarActualizacion(Date.now()); }}
            style={s(accion + ' font-weight: 700; border: 1px solid #bae6fd; background: #f0f9ff; color: #0284c7; cursor: pointer;')}>
            <i className="fas fa-cloud-arrow-down" style={{ color: '#0284c7' }}></i> Forzar Descarga de Actualizaciones
          </button>
          <button className="btn btn-outline-primary w-100" onClick={() => { if (verificar()) ui.toast('✅ Estás dentro del rango de registro', 'success'); }}
            style={s(accion + ' font-weight: 600; border-color: rgba(59,130,246,0.5); color: #2563eb; background: rgba(59,130,246,0.02);')}>
            <i className="fas fa-location-dot" style={{ color: '#3b82f6' }}></i> Probar Rango de Ubicación
          </button>
          <button className="btn w-100" onClick={() => setAviso(true)} style={s('font-size: 13px; padding: 12px 14px; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 700; transition: all 0.2s; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; cursor: pointer;')}>
            <i className="fas fa-balance-scale" style={{ color: '#2563eb' }}></i> Descargo Legal y Protección de Datos (LOPDP)
          </button>
          <button className="btn btn-outline-danger w-100" onClick={cerrarSesion} style={s(accion + ' font-weight: 700; border-color: #fca5a5; background: #fff5f5; color: #dc2626;')}>
            <i className="fas fa-right-from-bracket"></i> Cerrar Sesión en Dispositivo
          </button>
        </div>
      </div>

      <div className="text-center text-muted small py-4" style={s('font-size: 11px; font-weight: 500; opacity: 0.8; line-height: 1.5;')}>
        <i className="fas fa-shield-halved text-primary"></i> CONTROL 2026 v3.0 • TCONTROL S.A.<br />
        <span style={s('font-size: 10px; color: #94a3b8;')}>Cumplimiento LOPDP Registro Oficial Sup. 459 (Ecuador)</span>
      </div>
      {aviso && <ModalAvisoPrivacidad onCerrar={() => setAviso(false)} />}
    </div>
  );
}
