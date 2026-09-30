// Modal "Gestión de jornada por fecha" (abrirModalGestionJornada / guardarModalGestionJornada del legado)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from 'react';
import { rpc } from '../../lib/api';
import { s } from '../../lib/estilo';
import { refrescarSilencioso } from '../acciones';
import { esCumpleanosEmpleadoEnFecha } from '../legado/asistencia';
import {
  HORA_ENTRADA_REF, HORA_SALIDA_REF, Periodo, calcularNetWorkedOrdinario, diaSemana, esFeriadoODomingo, formatearHora,
  minutosAHHMMSS, normalizarFechaStr, obtenerDiaSemanaStr, obtenerFechaInicioEfectivaEmpleado, obtenerMinutos,
} from '../legado/util';
import { cerrarModal } from '../nav';
import { buscarEmpleado, sup } from '../store';
import { errorTexto, mostrarToast } from './comun';
import { solicitarRegularizacionWhatsApp } from './Detalle';

const OPCIONES_VALIDAS = ['Vacación', 'Feriado', 'Permiso Médico', 'Permiso Personal', 'Falta Justificada', 'Campo', 'Inasistencia'];

const BANNERS: Record<string, { bg: string; borde: string; color: string; icono: string; colorIcono: string; titulo: string; texto: string }> = {
  'Vacación': { bg: '#f0fdfa', borde: '#99f6e4', color: '#0f766e', icono: 'fa-umbrella-beach', colorIcono: '#0d9488', titulo: 'Vacación:', texto: 'Goce de vacación de jornada completa autorizada.' },
  'Feriado': { bg: '#eef2ff', borde: '#c7d2fe', color: '#3730a3', icono: 'fa-landmark', colorIcono: '#6366f1', titulo: 'Feriado:', texto: 'Descanso obligatorio oficial según calendario nacional.' },
  'Permiso Médico': { bg: '#e0f2fe', borde: '#bae6fd', color: '#0369a1', icono: 'fa-stethoscope', colorIcono: '#0284c7', titulo: 'Permiso Médico Completo:', texto: 'Jornada completa no laborada justificada por cita médica o reposo.' },
  'Permiso Personal': { bg: '#f3e8ff', borde: '#e9d5ff', color: '#6b21a8', icono: 'fa-user-times', colorIcono: '#7c3aed', titulo: 'Permiso Personal Completo:', texto: 'Jornada completa no laborada autorizada por asuntos personales.' },
  'Falta Justificada': { bg: '#ecfdf5', borde: '#a7f3d0', color: '#065f46', icono: 'fa-check-circle', colorIcono: '#059669', titulo: 'Falta Justificada:', texto: 'Ausencia de jornada completa aprobada por el supervisor.' },
  'Campo': { bg: '#fffbeb', borde: '#fde68a', color: '#92400e', icono: 'fa-truck', colorIcono: '#d97706', titulo: 'Trabajo de Campo:', texto: 'Jornada completa en labores externas o de campo.' },
  'Inasistencia': { bg: '#fff1f2', borde: '#fecdd3', color: '#be123c', icono: 'fa-calendar-times', colorIcono: '#e11d48', titulo: 'Inasistencia Injustificada:', texto: 'Falta de día completo sin justificación sujeta a descuento de nómina.' },
};

interface Contexto {
  emp: any; fecha: string; regsDia: any[]; esFestivo: boolean; dayOfWeek: number; esCumpleHoy: boolean; modActual: string;
  netWorked: number; atrasoMins: number; faltanteJornada: number; tieneAsistencia: boolean; razonActual: string;
  minsJust: number; minsPers: number; minsMed: number; almuerzoActual: string; horasExtrasActual: string; comentario: string;
  horaEntrada: string; horaSalida: string; fInicioEmp: string;
}

// Lectura inicial del día (abrirModalGestionJornada)
function contextoDelDia(empleadoId: string, fecha: string): Contexto | null {
  const emp = buscarEmpleado(empleadoId);
  if (!emp) return null;
  const fechaEfectiva = normalizarFechaStr(fecha) || fecha;
  const regsDia = (emp.registros || []).filter((r: any) => normalizarFechaStr(r.fecha) === fechaEfectiva)
    .sort((a: any, b: any) => String(a.hora || '').localeCompare(String(b.hora || '')));
  const dayOfWeek = diaSemana(fechaEfectiva);
  const esFestivo = esFeriadoODomingo(fechaEfectiva) || dayOfWeek === 6 || dayOfWeek === 0;

  const periodosDia: Periodo[] = [];
  let entradaPendiente: any = null;
  regsDia.forEach((r: any) => {
    const tipo = String(r.tipo || '').toUpperCase();
    if (tipo === 'ENTRADA' || tipo === 'RETORNO_CAMPO' || tipo === 'ENTRADA_CAMPO') entradaPendiente = r;
    else if (tipo === 'SALIDA' || tipo === 'SALIDA_CAMPO') {
      if (entradaPendiente) { periodosDia.push({ entrada: entradaPendiente, salida: r }); entradaPendiente = null; }
      else periodosDia.push({ entrada: null, salida: r });
    }
  });
  if (entradaPendiente) periodosDia.push({ entrada: entradaPendiente, salida: null });

  let minutosTrabajadosHoy = 0;
  periodosDia.forEach(p => {
    if (!p.entrada || !p.salida) return;
    const mE = obtenerMinutos(p.entrada.hora);
    const mS = obtenerMinutos(p.salida.hora);
    if (mE !== null && mS !== null && mS > mE) minutosTrabajadosHoy += mS - mE;
  });
  let netWorked = minutosTrabajadosHoy;
  if (!esFestivo && netWorked > 240) netWorked -= 45;
  netWorked = Math.max(0, netWorked);

  let atrasoMins = 0;
  const primerReg = regsDia.find((r: any) => r.tipo === 'ENTRADA' || r.tipo === 'RETORNO_CAMPO' || r.tipo === 'ENTRADA_CAMPO');
  if (primerReg) {
    const mE = obtenerMinutos(primerReg.hora);
    const refEntrada = esFestivo ? 420 : 450;
    if (mE !== null && mE > refEntrada + 5) atrasoMins = mE - refEntrada;
  }
  const netWorkedOrdinario = calcularNetWorkedOrdinario(periodosDia, esFestivo);
  const faltanteJornada = esFestivo ? 0 : Math.max(0, 480 - netWorkedOrdinario);
  if (!esFestivo && atrasoMins > faltanteJornada) atrasoMins = faltanteJornada;

  const conModo = regsDia.filter((r: any) => r.modo);
  const tieneCampo = conModo.some((r: any) => r.modo === 'CAMPO');
  const tieneEmpresa = conModo.some((r: any) => r.modo === 'EMPRESA' || r.modo === 'OFICINA');
  const modActual = tieneCampo && tieneEmpresa ? 'MIXTO' : tieneCampo ? 'CAMPO' : 'EMPRESA';

  let razonActual = '';
  regsDia.forEach((r: any) => {
    if (r.razon_ausencia) razonActual = r.razon_ausencia;
    else if (r.razon_justificac) razonActual = r.razon_justificac;
    else if (r.tipo && !['ENTRADA', 'SALIDA', 'ESTADO', 'SOLO_ALMUERZO'].includes(r.tipo.toUpperCase())) {
      const t = r.tipo.toUpperCase();
      if (t.includes('VACAC')) razonActual = 'Vacación';
      else if (t.includes('MEDIC')) razonActual = 'Permiso Médico';
      else if (t.includes('PERS')) razonActual = 'Permiso Personal';
      else if (t.includes('CUMPLE')) razonActual = 'Cumpleaños';
      else if (t.includes('JUSTIF')) razonActual = 'Falta Justificada';
      else if (t.includes('CALAM')) razonActual = 'Calamidad Doméstica';
      else if (t.includes('CAMPO')) razonActual = 'Campo';
      else if (t.includes('FERIADO')) razonActual = 'Feriado';
      else if (t.includes('INASISTENCIA') || t === 'FALTA') razonActual = 'Inasistencia';
    }
  });

  const regPermiso = regsDia.find((r: any) => r.tipo === 'ENTRADA') || regsDia.find((r: any) => r.permiso_personal_mins || r.permiso_medico_mins || r.tiempo_justificado_mins) || regsDia[0];
  const regEntrada = regsDia.find((r: any) => r.tipo === 'ENTRADA');
  const primerEntrada = regsDia.find((r: any) => r.tipo === 'ENTRADA' || r.tipo === 'RETORNO_CAMPO' || r.tipo === 'ENTRADA_CAMPO');
  const ultimoSalida = [...regsDia].reverse().find((r: any) => r.tipo === 'SALIDA' || r.tipo === 'SALIDA_CAMPO');
  const tieneAsistencia = regsDia.some((r: any) => ['ENTRADA', 'SALIDA', 'RETORNO_CAMPO', 'SALIDA_CAMPO', 'ENTRADA_CAMPO'].includes(String(r.tipo || '').toUpperCase()))
    || Boolean(primerEntrada || ultimoSalida) || netWorked > 0;
  const hora = (r: any) => (r ? (formatearHora(r.hora) === '--:--' ? '' : String(r.hora).slice(0, 8)) : '');

  return {
    emp, fecha: fechaEfectiva, regsDia, esFestivo, dayOfWeek, esCumpleHoy: esCumpleanosEmpleadoEnFecha(emp, fechaEfectiva), modActual,
    netWorked, atrasoMins, faltanteJornada, tieneAsistencia, razonActual,
    minsJust: regPermiso ? Number(regPermiso.tiempo_justificado_mins || 0) : 0,
    minsPers: regPermiso ? Number(regPermiso.permiso_personal_mins || 0) : 0,
    minsMed: regPermiso ? Number(regPermiso.permiso_medico_mins || 0) : 0,
    almuerzoActual: regEntrada ? (regEntrada.almuerzo || 'SI') : (emp.almuerzoHoy || 'SI'),
    horasExtrasActual: regsDia.some((r: any) => r.horasExtra === 'SI') ? 'SI' : 'NO',
    comentario: regPermiso ? (regPermiso.razon_permiso || '') : '',
    horaEntrada: hora(primerEntrada), horaSalida: hora(ultimoSalida),
    fInicioEmp: obtenerFechaInicioEfectivaEmpleado(emp, fechaEfectiva),
  };
}

export function ModalJornada({ id, fecha }: { id: string; fecha: string }) {
  const ctx = useMemo(() => contextoDelDia(id, fecha), [id, fecha]);
  if (!ctx) { mostrarToast('Colaborador no encontrado (' + id + ')', 'error'); cerrarModal('jornada'); return null; }
  return <ModalJornadaCuerpo key={`${id}|${fecha}`} ctx={ctx} />;
}

function ModalJornadaCuerpo({ ctx }: { ctx: Contexto }) {
  const hayMarcaciones = Boolean(ctx.horaEntrada || ctx.horaSalida);
  const razonInicial = hayMarcaciones ? '' : OPCIONES_VALIDAS.includes(ctx.razonActual) ? ctx.razonActual : (ctx.razonActual && ctx.razonActual !== 'Cumpleaños') ? 'Otro' : '';
  let justIni = ctx.minsJust;
  let comentarioIni = ctx.comentario;
  if (ctx.esCumpleHoy) {
    if (ctx.tieneAsistencia && ctx.minsJust === 0 && ctx.minsPers === 0 && ctx.minsMed === 0 && ctx.faltanteJornada > 0) {
      justIni = 240;
      if (!comentarioIni) comentarioIni = 'Beneficio institucional por cumpleaños (4 horas)';
    } else if (!ctx.tieneAsistencia && !ctx.razonActual && !comentarioIni) {
      comentarioIni = 'Día de cumpleaños del colaborador';
    }
  }

  const [hE, setHE] = useState(ctx.horaEntrada);
  const [hS, setHS] = useState(ctx.horaSalida);
  const [modo, setModo] = useState(ctx.modActual === 'CAMPO' || ctx.modActual === 'MIXTO' ? ctx.modActual : 'EMPRESA');
  const [razon, setRazon] = useState(razonInicial);
  const [razonOtro, setRazonOtro] = useState(razonInicial === 'Otro' ? ctx.razonActual : '');
  const [minsJust, setMinsJust] = useState(justIni);
  const [minsPers, setMinsPers] = useState(ctx.minsPers);
  const [minsMed, setMinsMed] = useState(ctx.minsMed);
  const alm0 = ctx.almuerzoActual;
  const [almuerzo, setAlmuerzo] = useState((alm0 === 'NO' || alm0 === 'FUERA') ? 'NO' : alm0 === 'EXTRA' ? 'EXTRA' : 'SI');
  const [horasExtras, setHorasExtras] = useState(ctx.horasExtrasActual);
  const [observacion, setObservacion] = useState(comentarioIni);
  const [guardando, setGuardando] = useState(false);

  // Tiempos del día (recalcularTiemposModalJornada / alCambiarRazonModalJornada)
  const tiempos = useMemo(() => {
    if (hE && hS) {
      const mE = obtenerMinutos(hE);
      const mS = obtenerMinutos(hS);
      if (mE !== null && mS !== null && mS > mE) {
        let dur = mS - mE;
        if (!ctx.esFestivo && dur > 240) dur -= 45;
        const refEntrada = ctx.esFestivo ? 420 : HORA_ENTRADA_REF;
        const refSalida = ctx.esFestivo ? 975 : HORA_SALIDA_REF;
        let ordDur = Math.max(0, Math.min(refSalida, mS) - Math.max(refEntrada, mE));
        if (!ctx.esFestivo && ordDur > 240) ordDur -= 45;
        const falt = ctx.esFestivo ? 0 : Math.max(0, 480 - Math.max(0, ordDur));
        let atraso = mE > refEntrada + 5 ? mE - refEntrada : 0;
        if (!ctx.esFestivo && atraso > falt) atraso = falt;
        return { neto: Math.max(0, dur), atraso, falt, tieneAsistencia: true };
      }
    }
    if (!hE && !hS) {
      if (hayMarcaciones || razon) return { neto: 0, atraso: 0, falt: 0, tieneAsistencia: false };
    }
    return { neto: ctx.netWorked, atraso: ctx.atrasoMins, falt: ctx.faltanteJornada, tieneAsistencia: ctx.tieneAsistencia };
  }, [hE, hS, razon, ctx, hayMarcaciones]);

  const cambiarHora = (setter: (v: string) => void, v: string) => {
    setter(v);
    if (v && razon) setRazon('');
  };
  const cambiarRazon = (v: string) => {
    setRazon(v);
    if (v) { setHE(''); setHS(''); }
  };
  const accionRapida = (accion: string) => {
    const { falt, atraso } = tiempos;
    const cubrir = atraso > 0 ? (falt > 0 ? Math.min(atraso, falt) : atraso) : (falt > 0 ? falt : 60);
    if (accion === 'completar_8h') { setMinsJust(falt); setMinsPers(0); setMinsMed(0); }
    else if (accion === 'cubrir_atraso_medico') { setMinsMed(cubrir); setMinsJust(0); setMinsPers(0); }
    else if (accion === 'cubrir_atraso_personal') { setMinsPers(cubrir); setMinsJust(0); setMinsMed(0); }
    else { setMinsJust(0); setMinsPers(0); setMinsMed(0); }
  };
  const tope = (v: string) => Math.min(720, Math.max(0, parseInt(v || '0') || 0));

  const tieneHoras = Boolean(hE || hS);
  const banner = razon && !tieneHoras ? BANNERS[razon] : null;
  const mostrarAyudaPrevio = !banner && ctx.fecha < ctx.fInicioEmp && !ctx.razonActual;
  const fParts = ctx.fecha.split('-');
  const badgeDia = ctx.dayOfWeek === 0 ? { t: 'DOMINGO', c: '#dc2626' } : ctx.dayOfWeek === 6 ? { t: 'SÁBADO', c: '#d97706' } : ctx.esFestivo ? { t: 'FERIADO', c: '#4f46e5' } : { t: 'LABORAL', c: '#16a34a' };
  const totalPerm = minsJust + minsPers + minsMed;

  const cerrar = () => cerrarModal('jornada');
  const guardar = async () => {
    let razonFinal = razon === 'Otro' ? (razonOtro.trim() || 'Otro') : razon;
    if (!razonFinal && ctx.esCumpleHoy && !hE && !hS) razonFinal = 'Cumpleaños';
    if (!tieneHoras && !razonFinal && totalPerm === 0) { mostrarToast('⚠️ Ingrese horas de asistencia o seleccione una razón de ausencia en la Sección 2.', 'warn'); return; }
    const norm = (h: string) => (h && h.length === 5 ? h + ':00' : h);
    setGuardando(true);
    sup.set({ bgSync: true });
    try {
      await rpc('sup_guardar_jornada', {
        p_empleado_id: ctx.emp.id, p_fecha: ctx.fecha, p_hora_entrada: norm(hE) || null, p_hora_salida: norm(hS) || null, p_modo: modo,
        p_razon: tieneHoras ? null : (razonFinal || null), p_min_justificados: minsJust, p_min_personal: minsPers, p_min_medico: minsMed,
        p_almuerzo: almuerzo, p_horas_extra: horasExtras !== ctx.horasExtrasActual || hE ? horasExtras : null, p_observacion: observacion || null,
      });
      cerrar();
      mostrarToast('✅ Jornada y permisos guardados exitosamente', 'success');
      await refrescarSilencioso();
    } catch (e) {
      mostrarToast('Error al procesar jornada: ' + errorTexto(e), 'error');
    } finally {
      setGuardando(false);
      sup.set({ bgSync: false });
    }
  };
  const eliminarDia = async () => {
    if (!window.confirm(`¿Estás seguro de eliminar todas las marcaciones y registros del día ${ctx.fecha} para este colaborador?`)) return;
    cerrar();
    sup.set({ bgSync: true });
    try {
      await rpc('sup_eliminar_dia', { p_empleado_id: ctx.emp.id, p_fecha: ctx.fecha });
      mostrarToast('✅ Marcaciones del día eliminadas', 'info');
      await refrescarSilencioso();
    } catch (e) {
      mostrarToast(errorTexto(e), 'error');
    } finally { sup.set({ bgSync: false }); }
  };
  const solicitarRegularizacion = () => {
    const motivo = ctx.razonActual || (tiempos.falt > 0 ? 'Jornada Incompleta' : (!tiempos.tieneAsistencia ? 'Inasistencia' : 'Sin Salida/Entrada'));
    solicitarRegularizacionWhatsApp(ctx.emp.id, ctx.fecha, motivo);
  };
  const hover = (on: boolean) => (ev: React.MouseEvent<HTMLButtonElement>) => {
    ev.currentTarget.style.background = on ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
    ev.currentTarget.style.color = on ? '#ffffff' : '#94a3b8';
  };

  return (
    <div id="modalGestionJornadaFecha" className="modal-overlay" onClick={ev => { if (ev.target === ev.currentTarget) cerrar(); }}
      style={s('display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.7); backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); z-index:100005; align-items:center; justify-content:center; padding:16px;')}>
      <div className="modal-card" style={s('background:#ffffff; border-radius:18px; width:100%; max-width:840px; max-height:94vh; display:flex; flex-direction:column; box-shadow:0 25px 35px -5px rgba(0, 0, 0, 0.3), 0 15px 15px -5px rgba(0, 0, 0, 0.15); border:1px solid #e2e8f0; overflow:hidden; animation: fadeIn 0.2s ease-out;')}>
        <div style={s('background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color:#ffffff; padding:18px 24px; display:flex; align-items:center; justify-content:space-between; flex-shrink:0;')}>
          <div style={s('display:flex; align-items:center; gap:14px;')}>
            <div style={s('width:46px; height:46px; border-radius:12px; background:rgba(99, 102, 241, 0.2); border:1px solid rgba(129, 140, 248, 0.4); display:flex; align-items:center; justify-content:center; color:#818cf8; font-size:22px;')}>
              <i className="fas fa-calendar-check"></i>
            </div>
            <div>
              <div style={s('font-size:21px; font-weight:800; letter-spacing:-0.3px; display:flex; align-items:center; gap:10px;')}>
                <span>Gestión de Jornada y Ausencias</span>
                <span id="modalJornadaBadgeDia" style={{ ...s('color:#f8fafc; font-size:13px; font-weight:700; padding:3px 10px; border-radius:12px; text-transform:uppercase;'), background: badgeDia.c }}>{badgeDia.t}</span>
              </div>
              <div style={s('font-size:15px; color:#94a3b8; margin-top:3px;')} id="modalJornadaSubtitulo">
                Colaborador: <strong id="modalJornadaColaboradorNombre" style={s('color:#f1f5f9;')}>{ctx.emp.nombre || `ID: ${ctx.emp.id}`}</strong> • <span id="modalJornadaFechaTexto" style={s('color:#cbd5e1;')}>{obtenerDiaSemanaStr(ctx.fecha)} {fParts[2]}/{fParts[1]}/{fParts[0]}</span>
              </div>
            </div>
          </div>
          <button type="button" onClick={cerrar} onMouseOver={hover(true)} onMouseOut={hover(false)}
            style={s('background:rgba(255,255,255,0.1); border:none; color:#94a3b8; width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:20px; transition:all 0.15s;')}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div style={s('padding:22px 26px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:18px; background:#f8fafc;')}>
          <div style={s('display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:12px;')}>
            {[
              ['Modo Base', ctx.modActual === 'CAMPO' ? '🏗️ CAMPO' : ctx.modActual === 'MIXTO' ? '🔀 MIXTO' : '🏢 EMPRESA', '#1e293b', 'modalJornadaInfoModo'],
              ['Horas Netas', minutosAHHMMSS(tiempos.neto), '#16a34a', 'modalJornadaInfoNeto'],
              ['Atraso Detectado', tiempos.atraso > 0 ? minutosAHHMMSS(tiempos.atraso) : '00:00:00', '#dc2626', 'modalJornadaInfoAtraso'],
              ['Faltante Jornada', tiempos.falt > 0 ? minutosAHHMMSS(tiempos.falt) : '00:00:00', '#d97706', 'modalJornadaInfoFaltante'],
            ].map(([t, v, c, idv]) => (
              <div key={t} style={s('background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; text-align:center;')}>
                <div style={s('font-size:13px; font-weight:700; color:#64748b; text-transform:uppercase;')}>{t}</div>
                <div id={idv} style={{ ...s('font-size:18px; font-weight:800; margin-top:3px;'), color: c }}>{v}</div>
              </div>
            ))}
          </div>

          {ctx.esCumpleHoy && (
            <div id="modalJornadaBannerCumpleanos" style={s('display:flex; padding:14px 18px; border-radius:12px; background:linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%); border:1.5px solid #a5b4fc; color:#3730a3; align-items:center; gap:14px; box-shadow:0 2px 5px rgba(99, 102, 241, 0.1);')}>
              <span style={s('font-size:28px;')}>🎂</span>
              <div>
                <div style={s('font-size:16.5px; font-weight:800; color:#1e1b4b;')}>¡Día de Cumpleaños del Colaborador!</div>
                <div style={s('font-size:14px; color:#4338ca; font-weight:600; margin-top:2px;')} id="modalJornadaBannerCumpleanosTexto">
                  Beneficio institucional detectado automáticamente según fecha de nacimiento: Aplica media jornada (hasta 4 horas / 240 min).
                </div>
              </div>
            </div>
          )}

          {banner && (
            <div id="modalJornadaBannerAyuda" style={{ ...s('display:flex; padding:12px 18px; border-radius:12px; font-size:15px; font-weight:600; line-height:1.45; align-items:center; gap:10px;'), background: banner.bg, border: `1.5px solid ${banner.borde}`, color: banner.color }}>
              <i className={`fas ${banner.icono}`} style={{ fontSize: 20, color: banner.colorIcono }}></i> <div><strong>{banner.titulo}</strong> {banner.texto}</div>
            </div>
          )}
          {mostrarAyudaPrevio && (
            <div id="modalJornadaBannerAyuda" style={s('display:flex; padding:12px 18px; border-radius:12px; font-size:15px; font-weight:600; line-height:1.45; align-items:center; gap:10px; background:#f8fafc; border:1.5px solid #cbd5e1; color:#475569;')}>
              <i className="fas fa-info-circle" style={s('font-size:20px; color:#64748b;')}></i> <div><strong>Usuario recién registrado:</strong> Esta jornada es anterior a la fecha de ingreso/registro del colaborador ({ctx.fInicioEmp}). No corresponde a una inasistencia injustificada.</div>
            </div>
          )}

          <div style={s('background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:16px 18px; box-shadow:0 1px 3px rgba(0,0,0,0.03);')}>
            <div style={s('font-size:16.5px; font-weight:800; color:#1e293b; margin-bottom:12px; display:flex; align-items:center; gap:8px;')}>
              <i className="fas fa-clock" style={s('color:#3b82f6; font-size:18px;')}></i> <span>1. Marcaciones y Modalidad de Trabajo</span>
            </div>
            <div style={s('display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px;')}>
              <div>
                <label style={s('display:block; font-size:14px; font-weight:700; color:#475569; margin-bottom:5px;')}>Hora de Entrada</label>
                <div style={s('display:flex; gap:6px;')}>
                  <input type="text" id="modalJornadaHoraEntrada" placeholder="HH:MM:SS" value={hE} onChange={ev => cambiarHora(setHE, ev.target.value.trim())}
                    style={s('width:100%; font-size:16px; font-weight:800; padding:8px 10px; border:1.5px solid #cbd5e1; border-radius:8px; text-align:center; background:#f8fafc;')} />
                  <button type="button" onClick={() => cambiarHora(setHE, '07:30:00')} style={s('border:1.5px solid #cbd5e1; background:#ffffff; border-radius:8px; padding:6px 10px; font-size:13.5px; font-weight:800; color:#3b82f6; cursor:pointer;')} title="Asignar horario oficial 07:30">07:30</button>
                </div>
              </div>
              <div>
                <label style={s('display:block; font-size:14px; font-weight:700; color:#475569; margin-bottom:5px;')}>Hora de Salida</label>
                <div style={s('display:flex; gap:6px;')}>
                  <input type="text" id="modalJornadaHoraSalida" placeholder="HH:MM:SS" value={hS} onChange={ev => cambiarHora(setHS, ev.target.value.trim())}
                    style={s('width:100%; font-size:16px; font-weight:800; padding:8px 10px; border:1.5px solid #cbd5e1; border-radius:8px; text-align:center; background:#f8fafc;')} />
                  <button type="button" onClick={() => cambiarHora(setHS, '16:15:00')} style={s('border:1.5px solid #cbd5e1; background:#ffffff; border-radius:8px; padding:6px 10px; font-size:13.5px; font-weight:800; color:#3b82f6; cursor:pointer;')} title="Asignar horario oficial 16:15">16:15</button>
                </div>
              </div>
              <div>
                <label style={s('display:block; font-size:14px; font-weight:700; color:#475569; margin-bottom:5px;')}>Modalidad (MODO)</label>
                <select id="modalJornadaModoSelect" value={modo} onChange={ev => setModo(ev.target.value)} style={s('width:100%; font-size:15px; font-weight:700; padding:8px 10px; border:1.5px solid #cbd5e1; border-radius:8px; background:#ffffff; cursor:pointer; color:#1e293b; height:42px;')}>
                  <option value="EMPRESA">🏢 EMPRESA</option>
                  <option value="CAMPO">🏗️ CAMPO</option>
                  <option value="MIXTO">🔀 MIXTO</option>
                </select>
              </div>
            </div>
          </div>

          <div id="seccionModalJornadaRazon" style={{ ...s('border:1px solid #e2e8f0; border-radius:14px; padding:16px 18px; box-shadow:0 1px 3px rgba(0,0,0,0.03); transition:all 0.2s;'), opacity: tieneHoras ? 0.8 : 1, background: tieneHoras ? '#f8fafc' : '#ffffff' }}>
            <div style={s('font-size:16.5px; font-weight:800; color:#1e293b; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between;')}>
              <div style={s('display:flex; align-items:center; gap:8px;')}>
                <i className="fas fa-tag" style={s('color:#8b5cf6; font-size:18px;')}></i> <span>2. Razón de Ausencia de Día Completo</span>
              </div>
              <span style={s('font-size:13.5px; color:#64748b; font-weight:600;')}>(Solo sin marcaciones)</span>
            </div>
            <div style={s('display:grid; grid-template-columns:1fr 1fr; gap:14px;')}>
              <div>
                <label style={s('display:block; font-size:14px; font-weight:700; color:#475569; margin-bottom:5px;')}>Seleccione Motivo de Ausencia</label>
                <select id="modalJornadaRazonSelect" value={razon} onChange={ev => cambiarRazon(ev.target.value)}
                  style={{ ...s('width:100%; font-size:15px; font-weight:700; padding:9px 12px; border-radius:8px; cursor:pointer; height:44px;'),
                    border: `1.5px solid ${tieneHoras ? '#cbd5e1' : '#8b5cf6'}`, background: tieneHoras ? '#f1f5f9' : '#f5f3ff', color: tieneHoras ? '#64748b' : '#5b21b6' }}>
                  <option value="">-- Sin Razón / Sin Ausencia --</option>
                  <option value="Vacación" id="modalOptVacacion">🏖️ Vacación (Jornada completa)</option>
                  <optgroup label="📋 Permiso Justificado">
                    <option value="Permiso Personal">👤 Permiso Personal (Día Completo)</option>
                    <option value="Permiso Médico">🩺 Permiso Médico (Día Completo)</option>
                    <option value="Falta Justificada">✅ Falta Justificada (Día Completo)</option>
                  </optgroup>
                  <option value="Campo" id="modalOptCampo">🚗 Campo (Trabajo de Campo)</option>
                  <option value="Feriado" id="modalOptFeriado">🏛️ Feriado Oficial</option>
                  <option value="Inasistencia" id="modalOptInasistencia">❌ Inasistencia Injustificada</option>
                  <option value="Otro">✏️ Otra Razón Personalizada...</option>
                </select>
              </div>
              <div id="modalJornadaDivRazonPersonalizada" style={{ display: razon === 'Otro' ? 'block' : 'none' }}>
                <label style={s('display:block; font-size:14px; font-weight:700; color:#475569; margin-bottom:5px;')}>Especificar Razón</label>
                <input type="text" id="modalJornadaRazonOtroInput" placeholder="Escriba el motivo..." value={razonOtro} onChange={ev => setRazonOtro(ev.target.value)}
                  style={s('width:100%; font-size:15px; padding:9px 12px; border:1.5px solid #cbd5e1; border-radius:8px; height:44px;')} />
              </div>
            </div>
            <div id="modalJornadaAvisoSeccion2Inactiva" style={{ ...s('margin-top:12px; padding:10px 14px; background:#f1f5f9; border-left:4px solid #6366f1; border-radius:8px; font-size:13.5px; color:#475569; font-weight:600; align-items:center; gap:8px;'), display: tieneHoras ? 'flex' : 'none' }}>
              <i className="fas fa-info-circle" style={s('color:#6366f1; font-size:16px;')}></i>
              <span>Tiene horas de asistencia ingresadas en la <strong>Sección 1</strong>. Los permisos parciales se gestionan en la <strong>Sección 3</strong>. Si desea cambiar a una <em>ausencia de día completo</em>, seleccione un motivo arriba y las horas se limpiarán automáticamente.</span>
            </div>
          </div>

          <div style={s('background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:16px 18px; box-shadow:0 1px 3px rgba(0,0,0,0.03);')}>
            <div style={s('font-size:16.5px; font-weight:800; color:#1e293b; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between;')}>
              <div style={s('display:flex; align-items:center; gap:8px;')}>
                <i className="fas fa-hourglass-half" style={s('color:#d97706; font-size:18px;')}></i> <span>3. Tiempos Parciales y Permisos en Minutos</span>
              </div>
              <span style={s('font-size:14.5px; color:#15803d; font-weight:800;')} id="modalJornadaTotalPermisosTxt">Total Permisos: {minutosAHHMMSS(totalPerm)} ({totalPerm} min)</span>
            </div>
            <div style={s('font-size:13.5px; color:#64748b; margin-bottom:12px;')}>
              Si el usuario registró marcaciones, el tiempo se guarda como permiso parcial sin anular las horas trabajadas.
            </div>
            <div style={s('display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;')}>
              {[
                ['T. Justificado (min)', 'fa-check-circle', minsJust, setMinsJust, '#fefce8', '#fef08a', '#854d0e', '#fde047', '#a16207', 'modalJornadaMinsJustificado'],
                ['Permiso Personal (min)', 'fa-user', minsPers, setMinsPers, '#eef2ff', '#c7d2fe', '#3730a3', '#a5b4fc', '#4338ca', 'modalJornadaMinsPersonal'],
                ['Permiso Médico (min)', 'fa-stethoscope', minsMed, setMinsMed, '#f0fdfa', '#99f6e4', '#115e59', '#5eead4', '#0f766e', 'modalJornadaMinsMedico'],
              ].map(([etq, ico, val, set, bg, borde, color, bordeInput, colorLbl, idi]) => (
                <div key={idi as string} style={{ ...s('border-radius:10px; padding:10px 12px;'), background: bg as string, border: `1.5px solid ${borde}` }}>
                  <label style={{ ...s('display:block; font-size:14px; font-weight:700; margin-bottom:5px;'), color: color as string }}><i className={`fas ${ico}`}></i> {etq as string}</label>
                  <input type="number" id={idi as string} min="0" max="720" value={val as number} onChange={ev => (set as (n: number) => void)(tope(ev.target.value))}
                    style={{ ...s('width:100%; font-size:18px; font-weight:800; padding:6px 10px; border-radius:8px; background:#ffffff; text-align:center; height:42px;'), border: `1.5px solid ${bordeInput}`, color: color as string }} />
                  <div style={{ ...s('font-size:13.5px; font-weight:700; text-align:center; margin-top:4px;'), color: colorLbl as string }}>{minutosAHHMMSS(val as number)}</div>
                </div>
              ))}
            </div>
            <div style={s('font-size:13.5px; color:#1e293b; margin-top:10px; display:flex; align-items:center; gap:8px; background:#eff6ff; padding:10px 14px; border-radius:8px; border:1px solid #bfdbfe;')}>
              <i className="fas fa-info-circle" style={s('color:#2563eb; font-size:16px;')}></i> <span><strong>Tiempos independientes:</strong> Puede ingresar permisos intermedios o parciales libremente. Cada concepto se suma a su propia categoría sin descontar de las horas extras.</span>
            </div>
            <div style={s('display:flex; flex-wrap:wrap; gap:8px; margin-top:12px;')}>
              <button type="button" className="btn" onClick={() => accionRapida('completar_8h')} style={s('font-size:14px; padding:7px 14px; border-radius:8px; background:#ecfdf5; border:1.5px solid #a7f3d0; color:#065f46; font-weight:700; cursor:pointer;')}>⚡ Salida Justif. (Restante Jornada)</button>
              <button type="button" className="btn" onClick={() => accionRapida('cubrir_atraso_medico')} style={s('font-size:14px; padding:7px 14px; border-radius:8px; background:#f0fdfa; border:1.5px solid #99f6e4; color:#0f766e; font-weight:700; cursor:pointer;')}>🩺 Cubrir Atraso Médico</button>
              <button type="button" className="btn" onClick={() => accionRapida('cubrir_atraso_personal')} style={s('font-size:14px; padding:7px 14px; border-radius:8px; background:#f5f3ff; border:1.5px solid #ddd6fe; color:#5b21b6; font-weight:700; cursor:pointer;')}>👤 Cubrir Atraso Personal</button>
              <button type="button" className="btn" onClick={() => accionRapida('limpiar_tiempos')} style={s('font-size:14px; padding:7px 12px; border-radius:8px; background:#f1f5f9; border:1.5px solid #cbd5e1; color:#475569; font-weight:700; cursor:pointer;')}>🔄 Reiniciar Tiempos</button>
            </div>
          </div>

          <div style={s('background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:16px 18px; box-shadow:0 1px 3px rgba(0,0,0,0.03);')}>
            <div style={s('font-size:16.5px; font-weight:800; color:#1e293b; margin-bottom:12px; display:flex; align-items:center; gap:8px;')}>
              <i className="fas fa-utensils" style={s('color:#10b981; font-size:18px;')}></i> <span>4. Almuerzo, Horas Extras y Justificación</span>
            </div>
            <div style={s('display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:12px;')}>
              <div>
                <label style={s('display:block; font-size:14px; font-weight:700; color:#475569; margin-bottom:5px;')}>Estado Almuerzo</label>
                <select id="modalJornadaAlmuerzoSelect" value={almuerzo} onChange={ev => setAlmuerzo(ev.target.value)} style={s('width:100%; font-size:15px; font-weight:700; padding:8px 10px; border:1.5px solid #cbd5e1; border-radius:8px; background:#ffffff; height:42px;')}>
                  <option value="SI">🏢 Sí (En Planta)</option>
                  <option value="NO">🏠 No (Fuera / No Tomó)</option>
                  <option value="EXTRA">⭐ Almuerzo Extra</option>
                </select>
              </div>
              <div>
                <label style={s('display:block; font-size:14px; font-weight:700; color:#475569; margin-bottom:5px;')}>Horas Extras Autorizadas</label>
                <select id="modalJornadaHorasExtrasSelect" value={horasExtras} onChange={ev => setHorasExtras(ev.target.value)} style={s('width:100%; font-size:15px; font-weight:700; padding:8px 10px; border:1.5px solid #cbd5e1; border-radius:8px; background:#ffffff; height:42px;')}>
                  <option value="NO">❌ No Autorizadas</option>
                  <option value="SI">✅ Sí Autorizadas</option>
                </select>
              </div>
            </div>
            <div>
              <label style={s('display:block; font-size:14px; font-weight:700; color:#475569; margin-bottom:5px;')}>Observación / Comentario del Supervisor</label>
              <textarea id="modalJornadaObservacionInput" rows={2} placeholder="Motivo o detalle de la justificación..." value={observacion} onChange={ev => setObservacion(ev.target.value)}
                style={s('width:100%; font-size:15px; padding:10px 12px; border:1.5px solid #cbd5e1; border-radius:8px; font-family:inherit; resize:vertical;')}></textarea>
            </div>
          </div>
        </div>

        <div style={s('padding:16px 24px; background:#ffffff; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; gap:12px; flex-wrap:wrap;')}>
          <div style={s('display:flex; align-items:center; gap:8px;')}>
            <button type="button" className="btn" onClick={() => void eliminarDia()} style={s('font-size:14px; font-weight:700; padding:9px 15px; border-radius:8px; background:#fff1f2; border:1.5px solid #fecdd3; color:#be123c; cursor:pointer; display:inline-flex; align-items:center; gap:6px;')} title="Eliminar marcaciones registradas para este día">
              <i className="fas fa-trash-alt"></i> Limpiar Registros
            </button>
            <button type="button" className="btn" onClick={solicitarRegularizacion} style={s('font-size:14px; font-weight:700; padding:9px 15px; border-radius:8px; background:#f0fdf4; border:1.5px solid #bbf7d0; color:#15803d; cursor:pointer; display:inline-flex; align-items:center; gap:6px;')} title="Solicitar justificativo al colaborador por WhatsApp">
              <i className="fab fa-whatsapp" style={s('color:#16a34a; font-size:15px;')}></i> Solicitar Regularización
            </button>
          </div>
          <div style={s('display:flex; gap:10px;')}>
            <button type="button" className="btn" onClick={cerrar} style={s('font-size:15px; font-weight:700; padding:10px 20px; border-radius:8px; background:#f1f5f9; border:1.5px solid #cbd5e1; color:#475569; cursor:pointer;')}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={guardando} style={s('font-size:16px; font-weight:800; padding:10px 24px; border-radius:8px; background:#4f46e5; border:none; color:#ffffff; cursor:pointer; display:inline-flex; align-items:center; gap:8px; box-shadow:0 3px 8px rgba(79, 70, 229, 0.35);')}>
              <i className="fas fa-save"></i> Guardar Cambios
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
