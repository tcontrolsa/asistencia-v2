// Modales del directorio: "Editar Ficha de Colaborador" y "Registrar Nuevo Colaborador" (supervisor_directorio.js)
import { useMemo, useState } from 'react';
import { rpc } from '../../lib/api';
import { s } from '../../lib/estilo';
import { refrescarSilencioso } from '../acciones';
import { normalizarFechaParaInput, obtenerFechaNacimientoEmpleado } from '../legado/personas';
import { cerrarModal } from '../nav';
import { buscarEmpleado, mostrarLoader, sup, useSup } from '../store';
import { errorTexto, fotoDe, mostrarToast } from './comun';
import { subirFoto } from './Detalle';

function Datalists() {
  const empCache = useSup(x => x.empCache);
  const { areas, cargos } = useMemo(() => ({
    areas: [...new Set(empCache.map(e => String(e.area || '').trim().toUpperCase()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    cargos: [...new Set(empCache.map(e => String(e.cargo || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  }), [empCache]);
  return (
    <>
      <datalist id="listaAreasDirectorioDatalist">{areas.map(a => <option key={a} value={a} />)}</datalist>
      <datalist id="listaCargosDirectorioDatalist">{cargos.map(c => <option key={c} value={c} />)}</datalist>
    </>
  );
}

export function ModalEditarEmpleado({ id }: { id: string }) {
  const emp = buscarEmpleado(id);
  const sel = String(emp?.supervisor || '').toUpperCase();
  const [f, setF] = useState({
    nombre: emp?.nombre || '', area: emp?.area || '', cargo: emp?.cargo || '', telefono: emp?.telefono || '',
    fechaNac: normalizarFechaParaInput(obtenerFechaNacimientoEmpleado(emp)), cedula: emp?.cedula || '',
    supervisor: sel === 'SUPERVISOR ADMIN' ? 'SUPERVISOR ADMIN' : sel === 'SI' ? 'SI' : 'NO',
    activo: emp?.activo === 'NO' ? 'NO' : 'SI', cultura: emp?.cultura_habilitada === false ? 'NO' : 'SI',
  });
  const [fotoError, setFotoError] = useState(false);
  if (!emp) { mostrarToast('Colaborador no encontrado', 'error'); cerrarModal('editarEmp'); return null; }
  const set = (k: keyof typeof f) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value });
  const cerrar = () => cerrarModal('editarEmp');
  const guardar = async () => {
    if (!f.nombre.trim() || !f.area.trim() || !f.cargo.trim()) { mostrarToast('Por favor, completa los campos obligatorios (*)', 'warning'); return; }
    mostrarLoader(true);
    try {
      await rpc('sup_guardar_ficha', {
        p_empleado_id: emp.id, p_nombre: f.nombre.trim(), p_area: f.area.trim().toUpperCase(), p_cargo: f.cargo.trim(), p_telefono: f.telefono.trim() || null,
        p_fecha_nacimiento: f.fechaNac || null, p_rol: emp.supervisor === 'ADMIN' ? null : f.supervisor, p_activo: f.activo, p_cultura: f.cultura,
        p_cedula: f.cedula.trim() || null,
      });
      cerrar();
      mostrarToast(`¡Colaborador ${f.nombre.trim()} actualizado exitosamente!`, 'success');
      await refrescarSilencioso();
    } catch (e) {
      mostrarToast(errorTexto(e) || 'Error al actualizar colaborador', 'error');
    } finally { mostrarLoader(false); }
  };
  const foto = fotoDe(emp);
  return (
    <div id="modalEditarEmpleadoDirectorio" className="modal-overlay" style={s('z-index: 100000; backdrop-filter: blur(5px); background: rgba(15, 23, 42, 0.65);')}
      onClick={ev => { if (ev.target === ev.currentTarget) cerrar(); }}>
      <div className="modal-container modal-edit-employee-card">
        <div className="modal-edit-header">
          <div className="modal-edit-header-info">
            <div className="modal-edit-icon-wrap"><i className="fas fa-user-pen"></i></div>
            <div>
              <h3 className="modal-edit-title">Editar Ficha de Colaborador</h3>
              <p className="modal-edit-subtitle">Actualiza la información personal, asignación de puesto y credenciales</p>
            </div>
          </div>
          <button type="button" className="modal-edit-close" onClick={cerrar} title="Cerrar ventana"><i className="fas fa-xmark"></i></button>
        </div>
        <div className="modal-edit-body">
          <form id="formEditarEmpleadoDirectorio" onSubmit={ev => { ev.preventDefault(); void guardar(); }}>
            <div className="modal-edit-profile-card">
              <div id="editDirFotoPreviewContainer" className="modal-edit-avatar-box">
                <img id="editDirFotoPreview" src={foto && !fotoError ? foto : './assets/images/Logotipo T Control.png'} alt="Foto Colaborador" onError={() => setFotoError(true)} />
                <button type="button" className="modal-edit-avatar-btn" onClick={() => subirFoto(emp.id)} title="Cambiar Fotografía"><i className="fas fa-camera"></i></button>
              </div>
              <div className="modal-edit-profile-details">
                <div className="modal-edit-profile-name" id="editDirNombreBadge">{emp.nombre}</div>
                <div className="modal-edit-profile-badges">
                  <span className="modal-profile-chip"><i className="fas fa-id-card"></i> ID: <strong id="editDirIdBadge">{emp.id}</strong></span>
                  <span className="modal-profile-note"><i className="fas fa-info-circle"></i> Haz clic en la cámara para actualizar foto</span>
                </div>
              </div>
            </div>

            <div className="modal-form-section">
              <div className="modal-section-heading"><i className="fas fa-user-tag" style={s('color:#2563eb;')}></i><span>1. Información Personal y Contacto</span></div>
              <div className="modal-form-grid" style={s('grid-template-columns: 1fr; margin-bottom: 12px;')}>
                <div className="form-group-modern">
                  <label htmlFor="editDirNombre" className="form-label-modern">Nombre Completo <span className="req-star">*</span></label>
                  <div className="input-with-icon"><i className="fas fa-user input-icon"></i>
                    <input type="text" id="editDirNombre" className="input-modern" required placeholder="Ej: JUAN PEREZ ALVAREZ" value={f.nombre} onChange={set('nombre')} /></div>
                </div>
              </div>
              <div className="modal-form-grid" style={s('grid-template-columns: 1fr 1fr; gap: 12px;')}>
                <div className="form-group-modern">
                  <label htmlFor="editDirTelefono" className="form-label-modern">WhatsApp / Teléfono</label>
                  <div className="input-with-icon"><i className="fab fa-whatsapp input-icon" style={s('color:#16a34a;')}></i>
                    <input type="tel" id="editDirTelefono" className="input-modern" placeholder="Ej: 0984660105" value={f.telefono} onChange={set('telefono')} /></div>
                </div>
                <div className="form-group-modern">
                  <label htmlFor="editDirFechaNacimiento" className="form-label-modern">Fecha de Nacimiento</label>
                  <div className="input-with-icon"><i className="fas fa-cake-candles input-icon" style={s('color:#f59e0b;')}></i>
                    <input type="date" id="editDirFechaNacimiento" className="input-modern" title="Fecha de nacimiento" value={f.fechaNac} onChange={set('fechaNac')} /></div>
                </div>
              </div>
            </div>

            <div className="modal-form-section">
              <div className="modal-section-heading"><i className="fas fa-briefcase" style={s('color:#6366f1;')}></i><span>2. Organización y Puesto</span></div>
              <div className="modal-form-grid" style={s('grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;')}>
                <div className="form-group-modern">
                  <label htmlFor="editDirArea" className="form-label-modern">Área / Departamento <span className="req-star">*</span></label>
                  <div className="input-with-icon"><i className="fas fa-building input-icon"></i>
                    <input type="text" id="editDirArea" list="listaAreasDirectorioDatalist" className="input-modern" required placeholder="Ej: PRODUCCION" value={f.area} onChange={set('area')} /></div>
                </div>
                <div className="form-group-modern">
                  <label htmlFor="editDirCargo" className="form-label-modern">Cargo / Función <span className="req-star">*</span></label>
                  <div className="input-with-icon"><i className="fas fa-id-badge input-icon"></i>
                    <input type="text" id="editDirCargo" list="listaCargosDirectorioDatalist" className="input-modern" required placeholder="Ej: OPERARIO" value={f.cargo} onChange={set('cargo')} /></div>
                </div>
              </div>
              <div className="modal-form-grid" style={s('grid-template-columns: 1fr 1fr; gap: 12px;')}>
                <div className="form-group-modern">
                  <label htmlFor="editDirActivo" className="form-label-modern">Estado en Planilla</label>
                  <div className="input-with-icon"><i className="fas fa-circle-dot input-icon"></i>
                    <select id="editDirActivo" className="select-modern" value={f.activo} onChange={set('activo')}>
                      <option value="SI">🟢 Activo / Laborando</option>
                      <option value="NO">🔴 Inactivo / Baja</option>
                    </select></div>
                </div>
                <div className="form-group-modern">
                  <label htmlFor="editDirCultura" className="form-label-modern">Preguntas Cultura Tcontrol</label>
                  <div className="input-with-icon"><i className="fas fa-lightbulb input-icon" style={s('color:#f59e0b;')}></i>
                    <select id="editDirCultura" className="select-modern" value={f.cultura} onChange={set('cultura')}>
                      <option value="SI">💡 Habilitado (Participa)</option>
                      <option value="NO">🚫 Exonerado (No participa)</option>
                    </select></div>
                </div>
              </div>
            </div>

            <div className="modal-form-section">
              <div className="modal-section-heading"><i className="fas fa-shield-halved" style={s('color:#0d9488;')}></i><span>3. Seguridad y Credenciales</span></div>
              <div className="modal-form-grid" style={s('grid-template-columns: 1fr 1fr 1.3fr; gap: 12px;')}>
                <div className="form-group-modern">
                  <label htmlFor="editDirId" className="form-label-modern">ID (Identificador)</label>
                  <div className="input-with-icon"><i className="fas fa-lock input-icon" style={s('color:#94a3b8;')}></i>
                    <input type="text" id="editDirId" className="input-modern input-readonly" readOnly value={emp.id} title="Identificador único en sistema" /></div>
                </div>
                <div className="form-group-modern">
                  <label htmlFor="editDirCedula" className="form-label-modern">Cédula</label>
                  <div className="input-with-icon"><i className="fas fa-address-card input-icon"></i>
                    <input type="text" id="editDirCedula" className="input-modern" inputMode="numeric" maxLength={13} placeholder="Para crear su contraseña" value={f.cedula} onChange={set('cedula')}
                      title="El colaborador la usa para crear su contraseña en el primer ingreso" /></div>
                </div>
                <div className="form-group-modern">
                  <label htmlFor="editDirSupervisor" className="form-label-modern">Nivel de Acceso</label>
                  <div className="input-with-icon"><i className="fas fa-user-shield input-icon"></i>
                    {emp.supervisor === 'ADMIN'
                      ? <input type="text" className="input-modern input-readonly" readOnly value="👑 Administrador General" />
                      : <select id="editDirSupervisor" className="select-modern" value={f.supervisor} onChange={set('supervisor')}>
                          <option value="NO">👤 Empleado regular</option>
                          <option value="SI">🛡️ Supervisor</option>
                          <option value="SUPERVISOR ADMIN">👑 Supervisor Admin</option>
                        </select>}
                  </div>
                </div>
              </div>
              <div style={s('margin-top:8px; font-size:11px; color:#64748b;')}>
                <i className="fas fa-key"></i> Contraseña: {emp.tiene_password ? 'creada por el colaborador' : 'pendiente de crear'}. Para asignar una temporal use «Resetear PIN».
              </div>
            </div>

            <div className="modal-edit-footer">
              <div className="modal-edit-footer-hint"><i className="fas fa-asterisk" style={s('color:#ef4444; font-size:10px;')}></i> Campos con (*) son obligatorios</div>
              <div className="modal-edit-footer-btns">
                <button type="button" className="btn-modern-ghost" onClick={cerrar}>Cancelar</button>
                <button type="submit" id="btnGuardarEdicionEmpleadoDirectorio" className="btn-modern-primary"><i className="fas fa-check"></i> <span>Guardar Cambios</span></button>
              </div>
            </div>
          </form>
        </div>
      </div>
      <Datalists />
    </div>
  );
}

// Siguiente ID numérico libre (obtenerSiguienteIdDisponible)
function siguienteIdDisponible(): string {
  const todos = [...sup.get().empCache, ...sup.get().empEliminados];
  const nums = todos.map(e => String(e.id || '').trim()).filter(x => /^\d+$/.test(x)).map(x => parseInt(x, 10)).filter(n => n > 0);
  if (!nums.length) return '1';
  const ocupados = new Set(todos.map(e => String(e.id || '').trim()));
  let sig = Math.max(...nums) + 1;
  while (ocupados.has(String(sig))) sig++;
  return String(sig);
}

export function ModalNuevoEmpleado() {
  const [f, setF] = useState({ id: siguienteIdDisponible(), telefono: '', nombre: '', area: '', cargo: '', fechaNac: '', supervisor: 'NO', cedula: '' });
  const set = (k: keyof typeof f) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value });
  const cerrar = () => cerrarModal('nuevoEmp');
  const guardar = async () => {
    if (!f.id.trim() || !f.nombre.trim() || !f.area.trim() || !f.cargo.trim()) { mostrarToast('Por favor, completa todos los campos requeridos (*)', 'warning'); return; }
    if (sup.get().empCache.some(e => String(e.id).trim() === f.id.trim())) { mostrarToast(`Ya existe un colaborador con el ID ${f.id.trim()}`, 'error'); return; }
    mostrarLoader(true);
    try {
      await rpc('sup_crear_empleado', { p_id: f.id.trim(), p_nombre: f.nombre.trim(), p_area: f.area.trim().toUpperCase(), p_cargo: f.cargo.trim(),
        p_telefono: f.telefono.trim() || null, p_fecha_nacimiento: f.fechaNac || null, p_rol: f.supervisor, p_cedula: f.cedula.trim() || null });
      cerrar();
      mostrarToast(`¡Colaborador ${f.nombre.trim()} registrado con éxito!`, 'success');
      await refrescarSilencioso();
    } catch (e) {
      mostrarToast(errorTexto(e) || 'Error al registrar colaborador', 'error');
    } finally { mostrarLoader(false); }
  };
  const lbl = s('font-size:11.5px; font-weight:700; color:#334155;');
  return (
    <div id="modalNuevoEmpleadoDirectorio" className="modal-overlay" style={s('z-index: 100000;')} onClick={ev => { if (ev.target === ev.currentTarget) cerrar(); }}>
      <div className="modal-container" style={s('max-width: 540px; width: 95%; max-height: 90vh; overflow-y: auto;')}>
        <div className="modal-header" style={s('background: linear-gradient(135deg, #059669 0%, #10b981 100%); color:white; border-radius: 12px 12px 0 0; padding:14px 18px;')}>
          <h3 className="modal-title" style={s('color:white; font-size:15px; display:flex; align-items:center; gap:8px;')}><i className="fas fa-user-plus"></i> Registrar Nuevo Colaborador</h3>
          <button className="modal-close" onClick={cerrar} style={s('color:white; opacity:0.8; font-size:22px;')}>&times;</button>
        </div>
        <div className="modal-body" style={s('padding: 20px; background: #ffffff;')}>
          <form id="formNuevoEmpleadoDirectorio" onSubmit={ev => { ev.preventDefault(); void guardar(); }}>
            <div style={s('display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;')}>
              <div className="form-group" style={s('margin:0;')}>
                <label className="form-label" style={lbl}>ID * <span style={s('font-size:10px; font-weight:600; color:#059669; background:#dcfce7; padding:1px 6px; border-radius:4px; margin-left:4px;')}>Siguiente disponible</span></label>
                <input type="text" id="nuevoDirId" className="form-input" placeholder="ID del colaborador" required style={s('font-weight:700; color:#0f172a;')} value={f.id} onChange={set('id')} />
              </div>
              <div className="form-group" style={s('margin:0;')}>
                <label className="form-label" style={lbl}><i className="fab fa-whatsapp" style={s('color:#16a34a;')}></i> WhatsApp / Teléfono</label>
                <input type="tel" id="nuevoDirTelefono" className="form-input" placeholder="Ej: 0984660105" value={f.telefono} onChange={set('telefono')} />
              </div>
            </div>
            <div className="form-group" style={s('margin-bottom:12px;')}>
              <label className="form-label" style={lbl}>Nombre Completo *</label>
              <input type="text" id="nuevoDirNombre" className="form-input" placeholder="Ej: Carlos López" required value={f.nombre} onChange={set('nombre')} />
            </div>
            <div style={s('display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;')}>
              <div className="form-group" style={s('margin:0;')}>
                <label className="form-label" style={lbl}>Área / Departamento *</label>
                <input type="text" id="nuevoDirArea" list="listaAreasDirectorioDatalist" className="form-input" placeholder="Ej: PRODUCCION" required value={f.area} onChange={set('area')} />
              </div>
              <div className="form-group" style={s('margin:0;')}>
                <label className="form-label" style={lbl}>Cargo *</label>
                <input type="text" id="nuevoDirCargo" list="listaCargosDirectorioDatalist" className="form-input" placeholder="Ej: Operario" required value={f.cargo} onChange={set('cargo')} />
              </div>
            </div>
            <div style={s('display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; margin-bottom:12px;')}>
              <div className="form-group" style={s('margin:0;')}>
                <label className="form-label" style={lbl}><i className="fas fa-cake-candles" style={s('color:#f59e0b;')}></i> Fecha de Nacimiento</label>
                <input type="date" id="nuevoDirFechaNacimiento" className="form-input" title="Fecha de nacimiento opcional" value={f.fechaNac} onChange={set('fechaNac')} />
              </div>
              <div className="form-group" style={s('margin:0;')}>
                <label className="form-label" style={lbl}><i className="fas fa-address-card"></i> Cédula</label>
                <input type="text" id="nuevoDirCedula" className="form-input" inputMode="numeric" maxLength={13} placeholder="Para crear su contraseña" value={f.cedula} onChange={set('cedula')} />
              </div>
              <div className="form-group" style={s('margin:0;')}>
                <label className="form-label" style={lbl}>Rol de Acceso</label>
                <select id="nuevoDirSupervisor" className="form-select" value={f.supervisor} onChange={set('supervisor')}>
                  <option value="NO">👤 Empleado regular</option>
                  <option value="SI">🛡️ Supervisor</option>
                  <option value="SUPERVISOR ADMIN">👑 Supervisor Admin</option>
                </select>
              </div>
            </div>
            <div style={s('background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 12px; margin-bottom:14px; font-size:11.5px; color:#166534; display:flex; align-items:flex-start; gap:8px;')}>
              <i className="fab fa-whatsapp" style={s('font-size:16px; color:#16a34a; margin-top:2px;')}></i>
              <div><strong>Notificación y clave automática:</strong> Al registrar al colaborador se le enviará un mensaje de bienvenida a su WhatsApp y podrá crear su propia contraseña en su primer inicio de sesión con su cédula.</div>
            </div>
            <div className="modal-footer" style={s('padding:14px 0 0; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:8px;')}>
              <button type="button" className="btn" onClick={cerrar} style={s('background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:8px 14px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;')}>Cancelar</button>
              <button type="submit" id="btnGuardarNuevoEmpleadoDirectorio" className="btn btn-success" style={s('background:#059669; color:white; border:none; padding:8px 18px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 6px rgba(5,150,105,0.25);')}>
                <i className="fas fa-user-plus"></i> Crear Colaborador
              </button>
            </div>
          </form>
        </div>
      </div>
      <Datalists />
    </div>
  );
}
