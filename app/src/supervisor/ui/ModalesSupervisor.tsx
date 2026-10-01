// Modales del panel: registro manual, ausencia programada, trabajo en campo, pedido para invitados y gestión de jornada.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react';
import { rpc } from '../../lib/api';
import { s } from '../../lib/estilo';
import { horaStr } from '../../lib/reloj';
import { refrescarSilencioso } from '../acciones';
import { diaSemana, esFeriadoODomingo, getLocalHoyStr, sumarDias } from '../legado/util';
import { cerrarModal, mostrarDetalle, useModal } from '../nav';
import { mostrarLoader, sup, tienePermisoAdmin, useSup } from '../store';
import { errorTexto, mostrarToast } from './comun';
import { ModalJornada } from './ModalJornada';
import { ModalEditarEmpleado, ModalNuevoEmpleado } from './ModalesFicha';

export function ModalesSupervisor() {
  const jornada = useModal<{ id: string; fecha: string }>('jornada');
  const manual = useModal<{ id?: string; fecha?: string }>('manual');
  const futuro = useModal<{ id?: string; fecha?: string }>('futuro');
  const campo = useModal<{ id?: string }>('campo');
  const extra = useModal('extraLunch');
  const editarEmp = useModal<{ id: string }>('editarEmp');
  const nuevoEmp = useModal('nuevoEmp');
  return (
    <>
      {manual && <ModalManual datos={manual} />}
      {futuro && <ModalFuturo datos={futuro} />}
      {campo && <ModalCampo datos={campo} />}
      {extra && <ModalExtraLunch />}
      {editarEmp && <ModalEditarEmpleado id={editarEmp.id} />}
      {nuevoEmp && <ModalNuevoEmpleado />}
      {jornada && <ModalJornada id={jornada.id} fecha={jornada.fecha} />}
    </>
  );
}

const fondoCierra = (nombre: Parameters<typeof cerrarModal>[0]) => (ev: React.MouseEvent) => { if (ev.target === ev.currentTarget) cerrarModal(nombre); };

// ─── Registro manual (mostrarModalManual / guardarRegistroManual) ───
function ModalManual({ datos }: { datos: { id?: string; fecha?: string } }) {
  const empCache = useSup(x => x.empCache);
  const [f, setF] = useState({
    id: datos.id || empCache[0]?.id || '', fecha: datos.fecha || getLocalHoyStr(), hora: horaStr(),
    tipo: 'ENTRADA', modo: 'EMPRESA', almuerzo: '', horasExtra: '', obs: '',
  });
  const set = (k: keyof typeof f) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value });
  const cerrar = () => cerrarModal('manual');
  const guardar = async () => {
    if (!f.id) { mostrarToast('Seleccione un colaborador', 'warning'); return; }
    if (!f.fecha || !f.hora) { mostrarToast('Complete fecha y hora de la marcación', 'warning'); return; }
    mostrarLoader(true);
    try {
      await rpc('sup_registro_manual', { p_empleado_id: f.id, p_fecha: f.fecha, p_hora: f.hora.length === 5 ? f.hora + ':00' : f.hora, p_tipo: f.tipo,
        p_modo: f.modo, p_almuerzo: f.almuerzo || null, p_horas_extra: f.horasExtra || null, p_observacion: f.obs || null });
      mostrarToast('✅ Registro manual guardado correctamente', 'success');
      cerrar();
      await refrescarSilencioso();
    } catch (e) {
      mostrarToast(errorTexto(e) || 'Error al guardar el registro manual', 'error');
    } finally { mostrarLoader(false); }
  };
  const lbl = 'font-weight:700; font-size:12px; color:#1e293b; display:flex; align-items:center; gap:6px;';
  const inp = 'font-size:12.5px; font-weight:600; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;';
  return (
    <div id="manualRegistroModal" className="modal-overlay" onClick={fondoCierra('manual')}>
      <div className="modal-container" style={s('max-width: 520px; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2), 0 10px 10px -5px rgba(0,0,0,0.1);')}>
        <div className="modal-header" style={s('background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 16px 20px;')}>
          <div style={s('display:flex; align-items:center; gap:10px;')}>
            <div style={s('background:rgba(255,255,255,0.2); width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:18px;')}><i className="fas fa-plus-circle"></i></div>
            <div>
              <h3 className="modal-title" style={s('color:white; margin:0; font-size:16px; font-weight:800;')}>Crear Registro Manual de Asistencia</h3>
              <p style={s('margin:2px 0 0 0; font-size:11px; opacity:0.85; font-weight:500;')}>Registra marcaciones personalizadas para cualquier colaborador</p>
            </div>
          </div>
          <button className="modal-close" onClick={cerrar} style={s('color:white; opacity:0.8; font-size:20px;')}>&times;</button>
        </div>
        <div className="modal-body" style={s('padding: 20px; background: #ffffff; display: flex; flex-direction: column; gap: 14px;')}>
          <div className="form-group" style={s('margin:0;')}>
            <label className="form-label" style={s(lbl)}><i className="fas fa-user" style={s('color:#2563eb;')}></i> Colaborador *</label>
            <select id="manEmpleadoId" className="form-select" value={f.id} onChange={set('id')} style={s('font-size:13px; font-weight:600; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;')}>
              {empCache.map(e => <option key={e.id} value={e.id}>{e.nombre} (ID: {e.id})</option>)}
            </select>
          </div>
          <div style={s('display:grid; grid-template-columns: 1fr 1fr; gap:12px;')}>
            <div className="form-group" style={s('margin:0;')}>
              <label className="form-label" style={s(lbl)}><i className="fas fa-calendar-day" style={s('color:#2563eb;')}></i> Fecha *</label>
              <input type="date" id="manFecha" className="form-input" value={f.fecha} onChange={set('fecha')} style={s('font-size:13px; font-weight:600; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;')} />
            </div>
            <div className="form-group" style={s('margin:0;')}>
              <label className="form-label" style={s(lbl)}><i className="fas fa-clock" style={s('color:#2563eb;')}></i> Hora *</label>
              <input type="time" id="manHora" className="form-input" step="1" value={f.hora} onChange={set('hora')} style={s('font-size:13px; font-weight:600; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;')} />
            </div>
          </div>
          <div style={s('display:grid; grid-template-columns: 1fr 1fr; gap:12px;')}>
            <div className="form-group" style={s('margin:0;')}>
              <label className="form-label" style={s(lbl)}><i className="fas fa-fingerprint" style={s('color:#2563eb;')}></i> Tipo de Marcación *</label>
              <select id="manTipo" className="form-select" value={f.tipo} onChange={set('tipo')} style={s(inp)}>
                <option value="ENTRADA">🟢 ENTRADA</option>
                <option value="SALIDA">🔴 SALIDA</option>
                <option value="SOLO_ALMUERZO">🍽️ SOLO ALMUERZO</option>
                <option value="ENTRADA_CAMPO">🏗️ ENTRADA CAMPO</option>
                <option value="SALIDA_CAMPO">🚗 SALIDA CAMPO</option>
              </select>
            </div>
            <div className="form-group" style={s('margin:0;')}>
              <label className="form-label" style={s(lbl)}><i className="fas fa-building" style={s('color:#2563eb;')}></i> Modo de Trabajo</label>
              <select id="manModo" className="form-select" value={f.modo} onChange={set('modo')} style={s(inp)}>
                <option value="EMPRESA">🏢 PLANTA / EMPRESA</option>
                <option value="OFICINA">💻 OFICINA</option>
                <option value="CAMPO">🏗️ CAMPO</option>
              </select>
            </div>
          </div>
          <div style={s('display:grid; grid-template-columns: 1fr 1fr; gap:12px;')}>
            <div className="form-group" style={s('margin:0;')}>
              <label className="form-label" style={s(lbl)}><i className="fas fa-utensils" style={s('color:#2563eb;')}></i> Almuerzo en Planta</label>
              <select id="manAlmuerzo" className="form-select" value={f.almuerzo} onChange={set('almuerzo')} style={s(inp)}>
                <option value="">(Sin almuerzo / No aplica)</option>
                <option value="SI">SI (En Planta)</option>
                <option value="NO">NO (Fuera)</option>
              </select>
            </div>
            <div className="form-group" style={s('margin:0;')}>
              <label className="form-label" style={s(lbl)}><i className="fas fa-business-time" style={s('color:#2563eb;')}></i> Horas Extras</label>
              <select id="manHorasExtra" className="form-select" value={f.horasExtra} onChange={set('horasExtra')} style={s(inp)}>
                <option value="">(No aplica)</option>
                <option value="SI">SI (Autorizadas)</option>
                <option value="NO">NO</option>
              </select>
            </div>
          </div>
          <div className="form-group" style={s('margin:0;')}>
            <label className="form-label" style={s(lbl)}><i className="fas fa-comment-alt" style={s('color:#2563eb;')}></i> Razón / Observación</label>
            <input type="text" id="manObservacion" className="form-input" value={f.obs} onChange={set('obs')} placeholder="Ej: Olvido de marcación, Registro autorizado por supervisor..." style={s('font-size:12.5px; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;')} />
          </div>
        </div>
        <div className="modal-footer" style={s('background:#f8fafc; padding:12px 20px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:10px;')}>
          <button type="button" className="btn btn-secondary" onClick={cerrar} style={s('padding:8px 16px; border-radius:8px; font-size:12.5px; font-weight:700; border:1px solid #cbd5e1; background:#ffffff; color:#475569; cursor:pointer;')}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => void guardar()} style={s('padding:8px 18px; border-radius:8px; font-size:12.5px; font-weight:700; background:linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color:white; border:none; cursor:pointer; box-shadow:0 2px 4px rgba(37,99,235,0.25);')}><i className="fas fa-save"></i> Guardar Registro</button>
        </div>
      </div>
    </div>
  );
}

// ─── Programar ausencia (mostrarModalFuturos / guardarEventoFuturo) ───
const TIPOS_EVENTO = [
  ['VACACIONES', '🏖️', 'VACACIONES', 'Días completos'],
  ['PERMISO_PERSONAL', '👤', 'PERMISO PERSONAL', 'Día completo'],
  ['PERMISO_MEDICO', '🩺', 'PERMISO MÉDICO', 'Día completo'],
  ['SALIDA_JUSTIFICADA', '✅', 'SALIDA JUSTIFICADA', 'Parcial / salida anticipada'],
  ['FALTA_JUSTIFICADA', '📋', 'FALTA JUSTIFICADA', 'Día completo'],
];

function ModalFuturo({ datos }: { datos: { id?: string; fecha?: string } }) {
  const empCache = useSup(x => x.empCache);
  const fechaDef = datos.fecha || getLocalHoyStr();
  const [id, setId] = useState(datos.id || empCache[0]?.id || '');
  const [tipo, setTipo] = useState('VACACIONES');
  const [desde, setDesde] = useState(fechaDef);
  const [hasta, setHasta] = useState(fechaDef);
  const [obs, setObs] = useState('');
  const cerrar = () => cerrarModal('futuro');

  const resumen = useMemo(() => {
    if (!desde || !hasta || hasta < desde) return null;
    let lab = 0, fest = 0;
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
      const dow = diaSemana(f);
      if (dow === 0 || dow === 6 || esFeriadoODomingo(f)) fest++; else lab++;
    }
    return { lab, fest };
  }, [desde, hasta]);

  const guardar = async () => {
    if (!tienePermisoAdmin()) { mostrarToast('Solo Administradores y Supervisores Admin pueden realizar esta acción.', 'error'); return; }
    if (!id) { mostrarToast('Seleccione un empleado', 'error'); return; }
    if (!desde || !hasta) { mostrarToast('Seleccione fecha de inicio y fin', 'error'); return; }
    if (hasta < desde) { mostrarToast('La fecha fin no puede ser menor a la fecha inicio', 'error'); return; }
    if (!resumen?.lab) { mostrarToast('No hay días laborales en el rango seleccionado', 'error'); return; }
    mostrarLoader(true);
    mostrarToast(`Registrando ${resumen.lab} día(s) laborable(s)...`, 'info');
    try {
      const r = await rpc<{ dias: number }>('sup_evento_futuro', { p_empleado_id: id, p_desde: desde, p_hasta: hasta, p_tipo: tipo, p_observacion: obs || null });
      mostrarToast(`✅ ${r.dias} día(s) registrado(s) correctamente`, 'success');
      cerrar();
      await refrescarSilencioso();
      if (sup.get().panel === 'detalle') mostrarDetalle(id, 0, null, null, desde);
    } catch (e) {
      mostrarToast('Error de conexión al registrar eventos futuros: ' + errorTexto(e), 'error');
    } finally { mostrarLoader(false); }
  };
  const lbl = 'font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:#6366f1; font-weight:700;';
  return (
    <div id="eventoFuturoModal" className="modal-overlay" onClick={fondoCierra('futuro')}>
      <div className="modal-container" style={s('max-width: 520px;')}>
        <div className="modal-header" style={s('background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color:white; border-radius: 12px 12px 0 0;')}>
          <h3 className="modal-title" style={s('color:white;')}><i className="fas fa-calendar-plus"></i> Programar Ausencia</h3>
          <button className="modal-close" onClick={cerrar} style={s('color:white; opacity:0.8;')}>&times;</button>
        </div>
        <div className="modal-body" style={s('padding: 20px; background: #f8fafc;')}>
          <div className="form-group" style={s('margin-bottom:14px;')}>
            <label className="form-label" style={s(lbl)}>👤 Empleado</label>
            <select id="futEmpleadoId" className="form-select" value={id} onChange={ev => setId(ev.target.value)} style={s('border:2px solid #e0e7ff; border-radius:8px; padding:8px 12px; font-size:13px;')}>
              {empCache.map(e => <option key={e.id} value={e.id}>{e.nombre} ({e.id})</option>)}
            </select>
          </div>
          <div className="form-group" style={s('margin-bottom:14px;')}>
            <label className="form-label" style={s(lbl)}>📋 Tipo de Evento</label>
            <div id="futTipoCards" style={s('display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:6px;')}>
              {TIPOS_EVENTO.map(([t, ico, et, sub]) => {
                const sel = tipo === t;
                return (
                  <div key={t} className={`fut-tipo-card${sel ? ' selected' : ''}`} data-tipo={t} onClick={() => setTipo(t)}
                    style={{ ...s('border-radius:10px; padding:10px 12px; cursor:pointer; transition: all .15s;'), border: `2px solid ${sel ? '#6366f1' : '#e5e7eb'}`, background: sel ? '#ede9fe' : 'white' }}>
                    <div style={s('font-size:18px; margin-bottom:2px;')}>{ico}</div>
                    <div style={{ ...s('font-weight:700; font-size:12px;'), color: sel ? '#4f46e5' : '#374151' }}>{et}</div>
                    <div style={{ fontSize: 10, color: sel ? '#7c6fe5' : '#9ca3af' }}>{sub}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={s('display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;')}>
            <div className="form-group" style={s('margin-bottom:0;')}>
              <label className="form-label" style={s(lbl)}>📅 Desde</label>
              <input type="date" id="futFechaInicio" className="form-input" value={desde} onChange={ev => setDesde(ev.target.value)} style={s('border:2px solid #e0e7ff; border-radius:8px; padding:8px 10px; font-size:13px;')} />
            </div>
            <div className="form-group" style={s('margin-bottom:0;')}>
              <label className="form-label" style={s(lbl)}>📅 Hasta</label>
              <input type="date" id="futFechaFin" className="form-input" value={hasta} onChange={ev => setHasta(ev.target.value)} style={s('border:2px solid #e0e7ff; border-radius:8px; padding:8px 10px; font-size:13px;')} />
            </div>
          </div>
          {resumen && (
            <div id="futResumen" style={s('background:#e0e7ff; border-radius:10px; padding:10px 14px; margin-bottom:14px; font-size:12px; color:#3730a3; display:flex; align-items:center; gap:8px;')}>
              <i className="fas fa-info-circle"></i>
              <span id="futResumenText">
                {resumen.lab === 0 ? <span style={s('color:#dc2626;')}>⚠️ No hay días laborales en el rango seleccionado</span>
                  : <><strong>{resumen.lab}</strong> día(s) laborable(s) se registrarán{resumen.fest > 0 && <> · <span style={s('color:#7c3aed;')}>{resumen.fest} fin(es) de semana/feriado(s) omitido(s)</span></>}</>}
              </span>
            </div>
          )}
          <div className="form-group" style={s('margin-bottom:0;')}>
            <label className="form-label" style={s(lbl)}>💬 Observación <span style={s('font-weight:400; color:#9ca3af;')}>(opcional)</span></label>
            <input type="text" id="futObservacion" className="form-input" value={obs} onChange={ev => setObs(ev.target.value)} placeholder="Ej: Viaje programado, Cita médica..." style={s('border:2px solid #e0e7ff; border-radius:8px; padding:8px 12px; font-size:13px;')} />
          </div>
        </div>
        <div className="modal-footer" style={s('background:#f8fafc; border-radius: 0 0 12px 12px; padding:16px 20px; gap:10px;')}>
          <button className="btn-secondary-modal" onClick={cerrar} style={s('border-radius:8px;')}>Cancelar</button>
          <button className="btn-primary-modal" onClick={() => void guardar()} style={s('background: linear-gradient(135deg,#6366f1,#8b5cf6); color:white; border-radius:8px; border:none; padding:10px 24px; font-weight:700;')}>
            <i className="fas fa-save"></i> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Trabajo en campo (supervisor_emergencias.js) ───
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function totalesDiaCampo(fecha: string, hE: string, hS: string) {
  if (!hE || !hS) return { t50: '0h 0m', t100: '0h 0m' };
  const aMin = (h: string) => { const p = h.split(':'); return p.length < 2 ? null : parseInt(p[0]) * 60 + parseInt(p[1]); };
  const mE = aMin(hE);
  let mS = aMin(hS);
  if (mE === null || mS === null) return { t50: '0h 0m', t100: '0h 0m' };
  if (mS < mE) mS += 24 * 60;
  if (mS <= mE) return { t50: '0h 0m', t100: '0h 0m' };
  const netos = Math.max(0, mS - mE - 30);
  const dow = diaSemana(fecha);
  const esFestivo = esFeriadoODomingo(fecha) || dow === 0 || dow === 6;
  const t50 = esFestivo ? 0 : Math.max(0, 450 - mE) + Math.max(0, mS - 975);
  const t100 = esFestivo ? netos : 0;
  const fmt = (m: number) => `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  return { t50: fmt(t50), t100: fmt(t100) };
}

interface DiaCampo { fecha: string; hE: string; hS: string; yaExiste: boolean }

function ModalCampo({ datos }: { datos: { id?: string } }) {
  const empCache = useSup(x => x.empCache);
  const hoy = getLocalHoyStr();
  const [empId, setEmpId] = useState(datos.id || empCache[0]?.id || '');
  const [proyecto, setProyecto] = useState('');
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [obs, setObs] = useState('');
  const [autoriza, setAutoriza] = useState('');
  const [editados, setEditados] = useState<Record<string, Partial<DiaCampo>>>({});
  const [quitados, setQuitados] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const emp = empCache.find(e => e.id === empId);

  const esCampo = (r: any) => {
    const t = String(r.tipo || r.tipo_salida || '').toUpperCase();
    const m = String(r.modo || '').toUpperCase();
    const raz = String(r.razon_ausencia || r.observacion || '').toUpperCase();
    return m === 'CAMPO' || t.includes('CAMPO') || raz.includes('CAMPO') || raz.includes('TRABAJO EN CAMPO');
  };
  const dias: DiaCampo[] = useMemo(() => {
    if (!desde || !hasta || hasta < desde) return [];
    const regs = (emp?.registros || []).filter(esCampo);
    const lista: DiaCampo[] = [];
    for (let f = desde; f <= hasta && lista.length < 62; f = sumarDias(f, 1)) {
      if (quitados.has(f)) continue;
      const rf = regs.filter((r: any) => r.fecha === f);
      const rE = rf.find((r: any) => ['ENTRADA_CAMPO', 'RETORNO_CAMPO', 'ENTRADA'].includes(String(r.tipo).toUpperCase()));
      const rS = rf.find((r: any) => ['SALIDA_CAMPO', 'SALIDA'].includes(String(r.tipo).toUpperCase()));
      lista.push({ fecha: f, hE: rE?.hora ? rE.hora.substring(0, 5) : '', hS: rS?.hora ? rS.hora.substring(0, 5) : '', yaExiste: rf.length > 0, ...editados[f] });
    }
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emp, desde, hasta, editados, quitados]);

  // Autorizadores: personal activo de Ingeniería
  const ingenieros = useMemo(() => {
    const m = new Map<string, { nombre: string; area: string }>();
    empCache.forEach(e => {
      const norm = String(e.area || e.cargo || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (norm.includes('INGENIERIA') || norm.includes('INGENIERO') || norm.includes('ING')) {
        if (e.nombre && !m.has(e.nombre)) m.set(e.nombre, { nombre: e.nombre, area: e.area || e.cargo || 'INGENIERIA' });
      }
    });
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [empCache]);

  const cerrar = () => cerrarModal('campo');
  const guardar = async () => {
    if (!empId) { mostrarToast('ID de empleado no especificado', 'error'); return; }
    if (!dias.length) { mostrarToast('No hay fechas seleccionadas en el rango.', 'error'); return; }
    const existentes = dias.filter(d => d.yaExiste);
    if (existentes.length && !window.confirm(`⚠️ ATENCIÓN:\nYa existe(n) registro(s) previo(s) para la(s) fecha(s):\n• ${existentes.map(d => `${d.fecha} (${DIAS[diaSemana(d.fecha)]})`).join('\n• ')}\n\n¿Deseas SOBREESCRIBIR / ACTUALIZAR estos registros?`)) return;
    setGuardando(true);
    try {
      const r = await rpc<{ dias: number }>('sup_trabajo_campo', {
        p_empleado_id: empId, p_dias: dias.map(d => ({ fecha: d.fecha, entrada: d.hE, salida: d.hS })),
        p_proyecto: proyecto || null, p_observaciones: obs || null, p_autoriza: autoriza || null,
      });
      mostrarToast(`✅ Trabajo en Campo guardado/actualizado para ${r.dias} día(s)`, 'success');
      cerrar();
      await refrescarSilencioso();
    } catch (e) {
      mostrarToast('Error al guardar Trabajo en Campo: ' + errorTexto(e), 'error');
    } finally { setGuardando(false); }
  };
  const lbl = 'font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:#059669; font-weight:700;';
  const valido = desde && hasta && hasta >= desde;
  return (
    <div id="trabajoCampoSupModal" className="modal-overlay" style={s('z-index: 9999;')} onClick={fondoCierra('campo')}>
      <div className="modal-container" style={s('max-width: 520px; width: 95%; max-height: 90vh; overflow-y: auto;')}>
        <div className="modal-header" style={s('background: linear-gradient(135deg, #059669 0%, #10b981 100%); color:white; border-radius: 12px 12px 0 0;')}>
          <h3 className="modal-title" style={s('color:white;')}><i className="fas fa-hammer"></i> Registrar Trabajo en Campo</h3>
          <button className="modal-close" onClick={cerrar} style={s('color:white; opacity:0.8;')}>&times;</button>
        </div>
        <div className="modal-body" style={s('padding: 20px; background: #f8fafc;')}>
          <form id="formCampoSupervisor" onSubmit={ev => { ev.preventDefault(); void guardar(); }}>
            <div className="form-group" style={s('margin-bottom:14px;')}>
              <label className="form-label" style={s(lbl)}>👤 Empleado</label>
              <select id="supCampoEmpSelect" className="form-select" value={empId} onChange={ev => { setEmpId(ev.target.value); setEditados({}); setQuitados(new Set()); }}
                style={s('border:2px solid #a7f3d0; border-radius:8px; padding:8px 12px; font-size:13px; font-weight:700; background:#f0fdf4;')}>
                {empCache.map(e => <option key={e.id} value={e.id}>{e.nombre} ({e.id})</option>)}
              </select>
            </div>
            <div className="form-group" style={s('margin-bottom:14px;')}>
              <label className="form-label" style={s(lbl)}>🏗️ Proyecto</label>
              <input type="text" id="supCampoProyectoInput" className="form-input" value={proyecto} onChange={ev => setProyecto(ev.target.value)} placeholder="Ej: Proyecto Central Huallanca (opcional)" style={s('border:2px solid #e2e8f0; border-radius:8px; padding:8px 12px; font-size:13px;')} />
            </div>
            <div style={s('display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;')}>
              <div className="form-group" style={s('margin-bottom:0;')}>
                <label className="form-label" style={s(lbl)}>📅 Desde</label>
                <input type="date" id="supCampoFechaInicioInput" className="form-input" value={desde} onChange={ev => { setDesde(ev.target.value); setQuitados(new Set()); }} style={s('border:2px solid #e2e8f0; border-radius:8px; padding:8px 10px; font-size:13px;')} />
              </div>
              <div className="form-group" style={s('margin-bottom:0;')}>
                <label className="form-label" style={s(lbl)}>📅 Hasta</label>
                <input type="date" id="supCampoFechaFinInput" className="form-input" value={hasta} onChange={ev => { setHasta(ev.target.value); setQuitados(new Set()); }} style={s('border:2px solid #e2e8f0; border-radius:8px; padding:8px 10px; font-size:13px;')} />
              </div>
            </div>
            <div className="form-group" style={s('margin-bottom:14px;')}>
              <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;')}>
                <label className="form-label" style={s(lbl + ' margin-bottom:0;')}>📅 Fechas y Horarios</label>
                <small id="supCntDiasCampo" style={s('font-weight:700; color:#64748b; font-size:11px;')}>{dias.length} día(s)</small>
              </div>
              <div id="supListaDiasCampoContainer" style={s('max-height:280px; overflow-y:auto; padding-right:2px;')}>
                {!valido ? <div style={s('background:#fef3c7; border:1px solid #fde68a; padding:8px 12px; border-radius:6px; font-size:12px; color:#b45309;')}>Selecciona un rango de fechas válido.</div>
                  : dias.length === 0 ? <div style={s('background:#f1f5f9; padding:8px; border-radius:6px; font-size:12px; text-align:center; color:#64748b;')}>No hay fechas seleccionadas en el rango.</div>
                    : dias.map(d => {
                      const tot = totalesDiaCampo(d.fecha, d.hE, d.hS);
                      const dow = diaSemana(d.fecha);
                      const fest = esFeriadoODomingo(d.fecha) || dow === 0 || dow === 6;
                      const cambiar = (k: 'hE' | 'hS', v: string) => setEditados(x => ({ ...x, [d.fecha]: { ...x[d.fecha], [k]: v } }));
                      return (
                        <div key={d.fecha} style={{ ...s('padding: 10px; border-radius: 8px; margin-bottom: 8px;'), background: d.yaExiste ? '#fff7ed' : '#ffffff', border: `1px solid ${d.yaExiste ? '#fdba74' : '#e2e8f0'}` }}>
                          <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;')}>
                            <div>
                              <span style={s('font-weight:700; font-size:12.5px; color:#1e293b;')}>{d.fecha} ({DIAS[dow]})</span>
                              {fest && <span style={s('background:#fef3c7; color:#b45309; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; margin-left:4px;')}>Festivo / Finde</span>}
                              {d.yaExiste && <span style={s('background:#ffedd5; color:#c2410c; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; margin-left:4px;')}>⚠️ Registro existente (Se actualizará)</span>}
                            </div>
                            {dias.length > 1 && <button type="button" onClick={() => setQuitados(q => new Set(q).add(d.fecha))} style={s('background:none; border:none; color:#ef4444; font-weight:700; cursor:pointer; font-size:16px; padding:0 4px;')} title="Quitar fecha">&times;</button>}
                          </div>
                          <div style={s('display:flex; flex-wrap:wrap; gap:8px; align-items:center;')}>
                            <div style={s('flex:1; min-width:115px;')}>
                              <label style={s('font-size:10px; font-weight:700; color:#64748b; display:block;')}>ENTRADA</label>
                              <input type="time" className="form-input" value={d.hE} onChange={ev => cambiar('hE', ev.target.value)} style={s('padding:6px 8px; font-size:13px; height:auto; border-radius:6px; width:100%;')} />
                            </div>
                            <div style={s('flex:1; min-width:115px;')}>
                              <label style={s('font-size:10px; font-weight:700; color:#64748b; display:block;')}>SALIDA</label>
                              <input type="time" className="form-input" value={d.hS} onChange={ev => cambiar('hS', ev.target.value)} style={s('padding:6px 8px; font-size:13px; height:auto; border-radius:6px; width:100%;')} />
                            </div>
                            <div style={s('text-align:center; min-width:50px;')}>
                              <small style={s('font-size:9.5px; font-weight:700; color:#b45309; display:block;')}>50%</small>
                              <span style={s('font-weight:800; font-size:12px; color:#d97706;')}>{tot.t50}</span>
                            </div>
                            <div style={s('text-align:center; min-width:50px;')}>
                              <small style={s('font-size:9.5px; font-weight:700; color:#b91c1c; display:block;')}>100%</small>
                              <span style={s('font-weight:800; font-size:12px; color:#dc2626;')}>{tot.t100}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
              </div>
            </div>
            <div className="form-group" style={s('margin-bottom:14px;')}>
              <label className="form-label" style={s(lbl)}>📝 Observaciones</label>
              <textarea id="supCampoObservacionesInput" className="form-input" rows={2} value={obs} onChange={ev => setObs(ev.target.value)} placeholder="Ej: Trabajo en campo lejos" style={s('border:2px solid #e2e8f0; border-radius:8px; padding:8px 12px; font-size:13px;')}></textarea>
            </div>
            <div className="form-group" style={s('margin-bottom:18px;')}>
              <label className="form-label" style={s(lbl)}>✅ Autorizado por</label>
              <select id="supCampoAutorizadoPorSelect" className="form-select" value={autoriza} onChange={ev => setAutoriza(ev.target.value)} style={s('border:2px solid #e2e8f0; border-radius:8px; padding:8px 12px; font-size:13px;')}>
                {ingenieros.length ? <option value="">-- Seleccionar Autorizador (Ingeniería) [Opcional] --</option> : <option value="">-- Sin personal del área de Ingeniería encontrado --</option>}
                {ingenieros.map(i => <option key={i.nombre} value={i.nombre}>{i.nombre} ({i.area || 'INGENIERIA'})</option>)}
              </select>
            </div>
            <div style={s('display:flex; justify-content:flex-end; gap:8px;')}>
              <button type="button" className="btn-secondary-modal" onClick={cerrar}>Cancelar</button>
              <button type="submit" id="btnGuardarCampoSup" className="btn-primary-modal" disabled={guardando} style={s('background:#059669; border-color:#059669;')}>
                <i className="fas fa-save me-1"></i> Registrar / Actualizar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Pedido para invitados (mostrarModalExtraLunch / guardarAlmuerzoExtra) ───
function ModalExtraLunch() {
  const [f, setF] = useState({ tipo: 'ALMUERZO_EXTRA', nombre: '', empresa: '', fecha: getLocalHoyStr(), cantidad: '1', hora: '', obs: '' });
  const set = (k: keyof typeof f) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value });
  const cerrar = () => cerrarModal('extraLunch');
  const guardar = async () => {
    if (!f.fecha) { mostrarToast('Ingrese una fecha válida', 'error'); return; }
    if (!f.cantidad || parseInt(f.cantidad) < 1) { mostrarToast('Ingrese una cantidad válida', 'error'); return; }
    mostrarLoader(true);
    try {
      await rpc('sup_crear_solicitud_invitado', { p_subtipo: f.tipo, p_fecha: f.fecha, p_cantidad: parseInt(f.cantidad), p_invitado: f.nombre.trim() || 'Almuerzo Extra',
        p_empresa: f.empresa.trim() || 'TCONTROL', p_hora_servicio: f.hora || null, p_observaciones: f.obs.trim() || null });
      mostrarToast('Pedido registrado con éxito', 'success');
      cerrar();
      await refrescarSilencioso();
    } catch (e) {
      mostrarToast(errorTexto(e), 'error');
    } finally { mostrarLoader(false); }
  };
  return (
    <div id="extraLunchModal" className="modal-overlay" onClick={fondoCierra('extraLunch')}>
      <div className="modal-container" style={s('max-width: 440px;')}>
        <div className="modal-header">
          <h3 className="modal-title"><i className="fas fa-plus-circle"></i> Pedido para Invitados</h3>
          <button className="modal-close" onClick={cerrar}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Tipo de Servicio</label>
            <select id="visitanteTipoServicio" className="form-input" value={f.tipo} onChange={set('tipo')}>
              <option value="ALMUERZO_EXTRA">🍱 Almuerzo Extra</option>
              <option value="REFRIGERIO_SANDUCHE">🥪 Refrigerio — Sánduche</option>
              <option value="REFRIGERIO_GALLETAS">🍪 Refrigerio — Break con Galletas</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Nombre del Invitado o Motivo *</label>
            <input type="text" id="visitanteNombre" className="form-input" value={f.nombre} onChange={set('nombre')} placeholder="Nombre de la persona o visita" />
          </div>
          <div className="form-group">
            <label className="form-label">Empresa</label>
            <input type="text" id="visitanteEmpresa" className="form-input" value={f.empresa} onChange={set('empresa')} placeholder="Empresa visitante (opcional)" />
          </div>
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <input type="date" id="visitanteFecha" className="form-input" value={f.fecha} onChange={set('fecha')} style={s("font-family:'Plus Jakarta Sans', sans-serif;")} />
          </div>
          <div className="form-group">
            <label className="form-label">Cantidad</label>
            <input type="number" id="visitanteCantidad" className="form-input" min="1" value={f.cantidad} onChange={set('cantidad')} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Hora requerida para servir (opcional)</label>
            <input type="time" id="visitanteHoraServicio" className="form-input" value={f.hora} onChange={set('hora')} />
          </div>
          <div className="form-group">
            <label className="form-label">Observaciones</label>
            <textarea id="visitanteObservaciones" className="form-input" rows={2} value={f.obs} onChange={set('obs')} placeholder="Detalles u observaciones del pedido..."></textarea>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary-modal" onClick={cerrar}>Cancelar</button>
          <button className="btn-primary-modal" onClick={() => void guardar()}>Registrar</button>
        </div>
      </div>
    </div>
  );
}
