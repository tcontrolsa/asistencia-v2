import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorApi, rpc, urlFoto } from '../lib/api';
import { s } from '../lib/estilo';
import { esCumpleanos, formatearHora, formatearHora24, saludo } from '../lib/formato';
import { aMinutos, ahora, horaStr, minutosDelDia } from '../lib/reloj';
import { calcularDistancia } from '../lib/gps';
import { calcularEstadisticas, insigniasCompactas, type Insignia } from '../lib/estadisticas';
import { claves, useDiasFaltantes } from '../lib/datos';
import { useSubirFoto } from '../lib/foto';
import { useApp } from '../app/Estado';
import { useUi } from '../ui/Ui';
import { ModalAvisoPrivacidad, ModalFoto, ModalInsignia } from '../ui/Modales';
import { QuienAutoriza, RazonEntrada, RazonPermiso, RazonSalida, SelectorAlmuerzo, TipoSalidaTemprana } from './flujo/Pantallas';
import { ModalConfirmarSalida, ModalReporteFueraArea, OPCIONES_FUERA_AREA, PopupAlmuerzo } from './flujo/ModalesHome';
import { FaltasMasivas } from './FaltasMasivas';

type Flujo = null | 'almuerzo' | 'razonEntrada' | 'justEntrada' | 'razonSalida' | 'justSalida' | 'tipoSalidaTemprana' | 'razonPermiso';
interface Pendiente {
  tipo: 'ENTRADA' | 'SALIDA' | 'RETORNO_CAMPO'; almuerzo?: 'SI' | 'NO'; motivoEntrada?: string; quienEntrada?: string;
  tipoSalida?: string; razonSalida?: string; quienSalida?: string; razonPermiso?: string;
}

// Estado reportado hoy sin marcación (tiposAusenciaMap del legado)
const TIPOS_AUSENCIA: Record<string, { label: string; badge: string; bg: string; color: string; border: string }> = {
  VACACIONES: { label: '🏖️ VACACIÓN', badge: 'Vacación', bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  VACACION: { label: '🏖️ VACACIÓN', badge: 'Vacación', bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  PERMISO_PERSONAL: { label: '👤 PERMISO PERSONAL', badge: 'Permiso Justificado', bg: '#fdf4ff', color: '#86198f', border: '#f0abfc' },
  PERMISO_MEDICO: { label: '🩺 PERMISO MÉDICO', badge: 'Permiso Justificado', bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  FALTA_JUSTIFICADA: { label: '📋 FALTA JUSTIFICADA', badge: 'Permiso Justificado', bg: '#fefce8', color: '#a16207', border: '#fde047' },
  TRABAJO_DE_CAMPO: { label: '🚗 CAMPO (Trabajo en Campo / Cliente)', badge: 'Trabajo en Campo', bg: '#fffbeb', color: '#b45309', border: '#fcd34d' },
  PERMISO: { label: '📋 PERMISO JUSTIFICADO', badge: 'Permiso', bg: '#fdf4ff', color: '#86198f', border: '#f0abfc' },
};
const BLOQUEAN_BOTON = ['VACACIONES', 'PERMISO_PERSONAL', 'PERMISO_MEDICO', 'FALTA_JUSTIFICADA'];

function RelojBoton({ completa, texto }: { completa: boolean; texto: string }) {
  const [t, setT] = useState(horaStr());
  useEffect(() => {
    if (completa) return;
    const i = window.setInterval(() => setT(horaStr()), 1000);
    return () => clearInterval(i);
  }, [completa]);
  return <div id="btnTime" className="btn-time" data-completa={completa ? 'true' : undefined}>{completa ? texto : t}</div>;
}

// Globos que permanecen todo el día de cumpleaños
function GlobosCumpleanos() {
  useEffect(() => {
    if (document.getElementById('birthdayBalloons')) return;
    const cont = document.createElement('div');
    cont.id = 'birthdayBalloons';
    const colores = ['#ff69b4', '#ffb6c1', '#ffd700', '#87ceeb', '#98fb98', '#f472b6', '#c084fc'];
    for (let i = 0; i < 12; i++) {
      const b = document.createElement('div');
      b.className = 'balloon';
      b.style.left = (Math.random() * 90 + 5) + 'vw';
      b.style.backgroundColor = colores[Math.floor(Math.random() * colores.length)];
      b.style.animationDuration = (Math.random() * 4 + 5) + 's';
      b.style.animationDelay = (Math.random() * 6) + 's';
      cont.appendChild(b);
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = (Math.random() * 100) + 'vw';
      c.style.backgroundColor = colores[Math.floor(Math.random() * colores.length)];
      c.style.width = (Math.random() * 8 + 4) + 'px';
      c.style.height = (Math.random() * 8 + 4) + 'px';
      c.style.animationDuration = (Math.random() * 3 + 3) + 's';
      c.style.animationDelay = (Math.random() * 5) + 's';
      cont.appendChild(c);
    }
    document.body.appendChild(cont);
  }, []);
  return null;
}

// Celebración al ingresar el día de cumpleaños (celebrarCumpleanos)
export function celebrarCumpleanos() {
  const colores = ['#f472b6', '#fbbf24', '#3b82f6', '#22c55e', '#ef4444'];
  for (let i = 0; i < 15; i++) {
    const b = document.createElement('div');
    b.className = 'balloon';
    b.style.left = (Math.random() * 90 + 5) + 'vw';
    b.style.backgroundColor = colores[Math.floor(Math.random() * colores.length)];
    b.style.animationDuration = (Math.random() * 3 + 4) + 's';
    b.style.animationDelay = (Math.random() * 2) + 's';
    document.body.appendChild(b);
    window.setTimeout(() => b.remove(), 7000);
  }
  for (let i = 0; i < 50; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = (Math.random() * 100) + 'vw';
    c.style.backgroundColor = colores[Math.floor(Math.random() * colores.length)];
    c.style.width = (Math.random() * 8 + 4) + 'px';
    c.style.height = (Math.random() * 8 + 4) + 'px';
    c.style.animationDuration = (Math.random() * 2 + 2) + 's';
    c.style.animationDelay = (Math.random() * 3) + 's';
    document.body.appendChild(c);
    window.setTimeout(() => c.remove(), 5000);
  }
  document.querySelector('.employee-photo-profesional')?.classList.add('birthday-glow');
}

// verificarDistanciaEmpresa(silencioso): indicador "📍 Xm / 250m" + mensaje; el servidor valida al marcar
export function useVerificarDistancia() {
  const app = useApp();
  const ui = useUi();
  return (silencioso = false): boolean => {
    const d = app.distancia();
    if (app.pos.lat === null) { if (!silencioso) ui.toast('Obteniendo ubicación...', 'info'); app.leerGps(); return false; }
    if (d.msgError === 'sin_base') { if (!silencioso) ui.toast('❌ La ubicación del proyecto la asigna tu supervisor', 'error'); return false; }
    window.dispatchEvent(new CustomEvent('tcontrol:distancia', { detail: `📍 ${Math.round(d.distancia!)}m / ${d.radio}m` }));
    if (d.dentro) return true;
    if (!silencioso) ui.toast(`❌ ${d.msgError} (${Math.round(d.distancia!)}m)`, 'error');
    return false;
  };
}

export function IndicadorDistancia() {
  const [texto, setTexto] = useState<string | null>(null);
  useEffect(() => {
    let t = 0;
    const h = (e: Event) => { setTexto((e as CustomEvent<string>).detail); clearTimeout(t); t = window.setTimeout(() => setTexto(null), 3000); };
    window.addEventListener('tcontrol:distancia', h);
    return () => { window.removeEventListener('tcontrol:distancia', h); clearTimeout(t); };
  }, []);
  return <div id="distanceIndicator" className={`distance-indicator ${texto ? '' : 'hidden'}`}>{texto}</div>;
}

export function HomePage() {
  const app = useApp();
  const { ctx, emp, hoy, registros, modo } = app;
  const ui = useUi();
  const qc = useQueryClient();
  const loc = useLocation();
  const navegar = useNavigate();
  const verificar = useVerificarDistancia();
  const subirFoto = useSubirFoto(emp.nombre);
  const faltantes = useDiasFaltantes();
  const [flujo, setFlujo] = useState<Flujo>(null);
  const pend = useRef<Pendiente>({ tipo: 'ENTRADA' });
  const [modalSalida, setModalSalida] = useState(false);
  const [modalFuera, setModalFuera] = useState(false);
  const [popupAlmuerzo, setPopupAlmuerzo] = useState(false);
  const [insignia, setInsignia] = useState<Insignia | null>(null);
  const [fotoGrande, setFotoGrande] = useState<string | null>(null);
  const [aviso, setAviso] = useState(false);
  const [saltoFaltas, setSaltoFaltas] = useState(() => { try { return sessionStorage.getItem('justificar_popup_saltado') === 'true'; } catch { return false; } });

  const foto = urlFoto(emp.foto_url);
  const cumple = esCumpleanos(emp.fecha_nacimiento);
  const stats = useMemo(() => calcularEstadisticas(registros, ctx.periodo, emp.es_pasante), [registros, ctx.periodo, emp.es_pasante]);
  const d = app.distancia();
  const fueraDeArea = app.pos.lat !== null && d.distancia !== null && !d.dentro;
  const minLimiteAlmuerzo = aMinutos(ctx.almuerzo.hora_limite) ?? 570;
  const almuerzoCerrado = () => ctx.almuerzo.activo && minutosDelDia() > minLimiteAlmuerzo;

  // Popup de almuerzo de 12:25 a 14:00 si aún no eligió (evaluarPopupAlmuerzo)
  useEffect(() => {
    const evaluar = () => {
      if (cumple) return;
      const m = minutosDelDia();
      const desde = aMinutos(ctx.app.almuerzo_popup_desde) ?? 745, hasta = aMinutos(ctx.app.almuerzo_popup_hasta) ?? 840;
      if (m < desde || m > hasta) { setPopupAlmuerzo(false); return; }
      if (hoy.almuerzo === 'SI' || hoy.almuerzo === 'NO') return;
      try { if (sessionStorage.getItem('almuerzo_popup_cerrado') === 'true') return; } catch { /* */ }
      setPopupAlmuerzo(true);
    };
    evaluar();
    const t = window.setInterval(evaluar, 30000);
    return () => clearInterval(t);
  }, [cumple, hoy.almuerzo, ctx.app]);

  // "REGISTRAR SALIDA" desde el Resumen abre aquí el flujo de salida
  useEffect(() => {
    const st = loc.state as { iniciar?: string } | null;
    if (st?.iniciar === 'SALIDA') {
      navegar('/', { replace: true, state: null });
      iniciarRegistro('SALIDA');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.state]);

  // ───────── Registrar (procederConRegistro) ─────────
  const refrescarTodo = async () => {
    await qc.invalidateQueries({ queryKey: ['registros'] });
    await qc.invalidateQueries({ queryKey: claves.faltantes });
  };

  // El reporte "fuera de área" se ofrece solo si se conoce la ubicación y está fuera (no mientras llega el GPS)
  const ofrecerReporte = (tipo: string) => {
    const dd = app.distancia();
    if (tipo === 'ENTRADA' && !hoy.tieneEntrada && !hoy.tieneSalida && dd.distancia !== null && !dd.dentro) setModalFuera(true);
  };

  const procederConRegistro = async () => {
    const p = pend.current;
    if (!verificar()) { ofrecerReporte(p.tipo); return; }
    if (p.tipo === 'SALIDA') {
      const m = minutosDelDia();
      const hastaConfirmar = aMinutos(ctx.app.salida_confirmar_almuerzo_hasta) ?? 600;
      if (m < minLimiteAlmuerzo) p.almuerzo = 'NO';
      else if (m < hastaConfirmar && window.confirm('❓ Vas a registrar tu salida antes de la hora de almuerzo.\n\n¿Deseas cancelar el almuerzo del día de hoy?')) p.almuerzo = 'NO';
      // Advertencia de marcación sospechosa: entrada hace menos de 15 minutos
      if (hoy.entrada) {
        const minsDesdeEntrada = (ahora().getTime() - new Date(hoy.entrada.timestamp).getTime()) / 60000;
        if (minsDesdeEntrada < 15 && !window.confirm('🚨 ADVERTENCIA IMPORTANTE:\n\nHas registrado tu ENTRADA hace menos de 15 minutos.\nSi olvidaste marcar tu Entrada por la mañana, marcar la Salida ahora causará que tu jornada sea calculada en SEGUNDOS.\n\n¿Deseas continuar de todas formas? Debes comunicar este olvido al área respectiva de inmediato para su corrección.')) return;
      }
    }
    const horaActual = formatearHora(ahora());
    let titulo = '¡Marcación Registrada!', sub = `Registrado a las ${horaActual}`, icono: 'attendance' | 'entrada' | 'salida' | 'campo' | 'permiso' = 'attendance';
    let detalles = ['Hora exacta registrada', 'Ubicación GPS confirmada'];
    if (p.tipo === 'ENTRADA') {
      titulo = '¡Inicio de Jornada!'; sub = `¡Bienvenido(a)! Turno iniciado con éxito • ${horaActual}`; icono = 'entrada';
      detalles = ['Jornada laboral iniciada', `Hora de entrada registrada (${horaActual})`, p.almuerzo === 'SI' ? 'Almuerzo en planta confirmado' : 'Ubicación confirmada'];
    } else if (p.tipo === 'SALIDA') {
      titulo = '¡Fin de Jornada!'; sub = `¡Excelente trabajo hoy! Que tengas buen descanso • ${horaActual}`; icono = 'salida';
      detalles = ['Jornada laboral finalizada', `Hora de salida registrada (${horaActual})`, p.razonSalida ? `Motivo: ${p.razonSalida}` : 'Registro de turno completado'];
    } else if (p.tipoSalida === 'TRABAJO_CAMPO') {
      titulo = '¡Salida a Campo Registrada!'; sub = `Modo campo activo • ${horaActual}`; icono = 'campo';
    } else if (p.tipoSalida === 'PERMISO' || p.tipoSalida === 'PERMISO_CON_SALIDA_TEMPRANA') {
      titulo = '¡Permiso Registrado!'; sub = `${p.razonPermiso || 'Permiso'} • ${horaActual}`; icono = 'permiso';
    }
    setFlujo(null);
    const splash = ui.splash({ titulo, nombreEmpleado: emp.nombre, subtitulo: sub, icono, detalles, duracion: 2800, onPreExit: refrescarTodo });
    try {
      await rpc('marcar', {
        p_tipo: p.tipo, p_lat: app.pos.lat, p_lng: app.pos.lng, p_modo: modo, p_almuerzo: p.almuerzo ?? null,
        p_ts_dispositivo: new Date().toISOString(),
        p_motivo_entrada_tardia: p.motivoEntrada ?? null, p_quien_justifica_entrada: p.quienEntrada ?? null,
        p_tipo_salida: p.tipoSalida ?? null, p_motivo_salida: p.razonSalida ?? null, p_quien_justifica: p.quienSalida ?? null,
        p_razon_permiso: p.razonPermiso ?? null,
      });
      await splash;
    } catch (e) {
      ui.cerrarSplash();
      const err = e as ErrorApi;
      if (err.hint === 'MOTIVO_ENTRADA') { setFlujo('razonEntrada'); return; }
      if (err.hint === 'ALMUERZO') { setFlujo('almuerzo'); return; }
      ui.toast(err.message || 'Error al registrar', 'error');
    }
  };

  // ───────── Iniciar (iniciarRegistro) ─────────
  const continuarEntrada = () => {
    if (almuerzoCerrado()) {
      pend.current.almuerzo = 'NO';
      ui.toast(`⚠️ Fuera del horario (límite ${ctx.almuerzo.hora_limite}). Se registra almuerzo fuera de planta.`, 'warning');
      procederConRegistro();
    } else setFlujo('almuerzo');
  };

  const iniciarRegistro = (tipo: Pendiente['tipo']) => {
    if (!verificar()) { ofrecerReporte(tipo); return; }
    pend.current = { tipo };
    if (tipo === 'ENTRADA') {
      const reentrada = hoy.tieneEntrada && (hoy.status.label.includes('PERMISO') || hoy.status.label.includes('CAMPO'));
      if (reentrada) { procederConRegistro(); return; }
      const requiereMotivo = emp.tipo_asistencia === 'NORMAL' && !emp.es_pasante && !hoy.tieneEntrada
        && minutosDelDia() > (aMinutos(ctx.horario.limite_justificacion) ?? 465);
      if (requiereMotivo) { setFlujo('razonEntrada'); return; }
      continuarEntrada();
    } else if (tipo === 'SALIDA') {
      if (minutosDelDia() < (aMinutos(ctx.horario.salida) ?? 975)) { setModalSalida(true); return; }
      procederConRegistro();
    } else {
      procederConRegistro();
    }
  };

  const elegirRazonSalida = (razon: string) => {
    const p = pend.current;
    p.razonSalida = razon; p.quienSalida = undefined;
    p.tipoSalida = razon === 'salida_campo' ? 'TRABAJO_CAMPO' : razon === 'cumpleanos' ? 'CUMPLEAÑOS' : razon === 'salida_pasante' ? 'SALIDA_PASANTE' : 'SALIDA_TEMPRANA_JUSTIFICADA';
    if (razon === 'permiso_medico' || razon === 'permiso_personal') setFlujo('tipoSalidaTemprana');
    else procederConRegistro();
  };

  const cambiarModo = (m: 'OFICINA' | 'CAMPO') => {
    if (m === 'CAMPO') {
      if (app.pos.lat === null || app.pos.lng === null) { ui.toast('Ubicación no detectada. Esperando GPS...', 'warning'); app.leerGps(); return; }
      const dist = calcularDistancia(app.pos.lat, app.pos.lng, ctx.ubicacion.lat, ctx.ubicacion.lng);
      if (dist <= ctx.app.campo_distancia_minima_m) {
        ui.toast(`No puedes activar CAMPO a menos de ${Math.round(ctx.app.campo_distancia_minima_m / 1000)}km de la base (Distancia actual: ${(dist / 1000).toFixed(1)} km)`, 'error');
        return;
      }
    }
    app.setModo(m);
  };

  const reportarFueraArea = async (tipo: string, obs: string) => {
    ui.cargando(true);
    try {
      await rpc('reportar_estado_hoy', { p_tipo: tipo, p_observacion: obs || null });
      setModalFuera(false);
      ui.toast('✅ Estado de hoy reportado exitosamente', 'success');
      await refrescarTodo();
    } catch (e) {
      ui.toast('Error al enviar reporte: ' + (e as Error).message, 'error');
    } finally { ui.cargando(false); }
  };

  const elegirAlmuerzoPopup = async (o: 'SI' | 'NO') => {
    ui.cargando(true);
    try {
      await rpc('cambiar_almuerzo', { p_opcion: o });
      ui.toast('Almuerzo registrado correctamente', 'success');
      setPopupAlmuerzo(false);
      await refrescarTodo();
    } catch (e) {
      ui.toast('Error al registrar almuerzo: ' + (e as Error).message, 'error');
    } finally { ui.cargando(false); }
  };
  const cerrarPopupAlmuerzo = () => { try { sessionStorage.setItem('almuerzo_popup_cerrado', 'true'); } catch { /* */ } setPopupAlmuerzo(false); };

  // ───────── Pantallas de flujo ─────────
  const toastErr = (m: string) => ui.toast(m, 'error');
  if (flujo === 'almuerzo') return <SelectorAlmuerzo toast={toastErr} onCancelar={() => setFlujo(null)} onConfirmar={o => { pend.current.almuerzo = o; procederConRegistro(); }} />;
  if (flujo === 'razonEntrada') return <RazonEntrada limite={formatearHora24(ctx.horario.limite_justificacion)} onCancelar={() => setFlujo(null)}
    onJustificada={() => setFlujo('justEntrada')}
    onElegir={r => { pend.current.motivoEntrada = r; pend.current.quienEntrada = undefined; almuerzoCerrado() ? (pend.current.almuerzo = 'NO', ui.toast('⚠️ Fuera del horario de almuerzo. Se registra almuerzo fuera de planta.', 'error'), window.setTimeout(procederConRegistro, 2000)) : setFlujo('almuerzo'); }} />;
  if (flujo === 'justEntrada') return <QuienAutoriza titulo="Entrada Justificada" texto="¿Quién autoriza esta entrada?" tamIcono={48} toast={toastErr}
    onAtras={() => setFlujo('razonEntrada')}
    onConfirmar={n => { pend.current.motivoEntrada = 'entrada_justificada'; pend.current.quienEntrada = n; almuerzoCerrado() ? (pend.current.almuerzo = 'NO', ui.toast('⚠️ Fuera del horario de almuerzo. Se registra almuerzo fuera de planta.', 'error'), window.setTimeout(procederConRegistro, 2000)) : setFlujo('almuerzo'); }} />;
  if (flujo === 'razonSalida') return <RazonSalida esPasante={emp.es_pasante || (emp.cargo || '').toLowerCase() === 'pasante'} onCancelar={() => setFlujo(null)}
    onJustificada={() => setFlujo('justSalida')} onElegir={elegirRazonSalida} />;
  if (flujo === 'justSalida') return <QuienAutoriza titulo="Salida Justificada" texto="¿Quién autoriza esta salida?" tamIcono={40} toast={toastErr}
    onAtras={() => setFlujo('razonSalida')}
    onConfirmar={n => { Object.assign(pend.current, { razonSalida: 'salida_justificada', quienSalida: n, tipoSalida: 'SALIDA_TEMPRANA_JUSTIFICADA' }); setFlujo('tipoSalidaTemprana'); }} />;
  if (flujo === 'tipoSalidaTemprana') return <TipoSalidaTemprana onAtras={() => setFlujo('razonSalida')}
    onFinal={() => { pend.current.tipoSalida = 'SALIDA_TEMPRANA_JUSTIFICADA'; procederConRegistro(); }}
    onPermiso={() => {
      const r = pend.current.razonSalida;
      if (r === 'permiso_medico' || r === 'permiso_personal') {
        Object.assign(pend.current, { tipoSalida: 'PERMISO_CON_SALIDA_TEMPRANA', razonPermiso: r === 'permiso_medico' ? 'medico' : 'personal' });
        procederConRegistro();
      } else setFlujo('razonPermiso');
    }} />;
  if (flujo === 'razonPermiso') return <RazonPermiso onAtras={() => setFlujo('tipoSalidaTemprana')}
    onElegir={r => { Object.assign(pend.current, { tipoSalida: 'PERMISO_CON_SALIDA_TEMPRANA', razonPermiso: r }); procederConRegistro(); }} />;

  // Justificar faltas pasadas antes de ver la credencial
  if ((faltantes.data?.length || 0) > 0 && !saltoFaltas) {
    return <FaltasMasivas fechas={faltantes.data!} onSaltar={() => { try { sessionStorage.setItem('justificar_popup_saltado', 'true'); } catch { /* */ } setSaltoFaltas(true); }} />;
  }

  // ───────── Credencial (renderHomePage) ─────────
  const partesNombre = (emp.nombre || 'EMPLEADO').trim().split(/\s+/);
  const horaEntrada = hoy.entrada ? formatearHora24(hoy.entrada.hora) : (hoy.tieneEntrada ? 'Registrada' : 'Pendiente');
  const horaSalida = hoy.salida ? formatearHora24(hoy.salida.hora) : (hoy.tieneSalida ? 'Registrada' : 'Pendiente');
  const sinMarca = !hoy.tieneEntrada && !hoy.tieneSalida;
  const tipoEstado = sinMarca && hoy.novedad ? hoy.novedad.tipo.toUpperCase() : null;
  const cfgEstado = tipoEstado ? (TIPOS_AUSENCIA[tipoEstado] || null) : null;
  const detalleEstado = hoy.novedad?.razon_ausencia || '';

  let btn = { type: 'ENTRADA' as Pendiente['tipo'] | 'NONE', label: 'REGISTRAR ENTRADA', clase: 'bg-entrada', icono: 'fa-sign-in-alt' };
  const ultimoTipo = hoy.ultimo?.tipo;
  if (sinMarca && cfgEstado && BLOQUEAN_BOTON.includes(tipoEstado!)) btn = { type: 'NONE', label: 'ESTADO REPORTADO HOY', clase: 'bg-campo', icono: 'fa-calendar-check' };
  else if (hoy.status.label.includes('CAMPO')) btn = { type: 'RETORNO_CAMPO', label: 'RETORNO DE CAMPO', clase: 'bg-campo', icono: 'fa-undo' };
  else if (hoy.tieneEntrada && hoy.status.label.includes('PERMISO')) btn = { type: 'ENTRADA', label: 'REGISTRAR RE-ENTRADA', clase: 'bg-reentrada', icono: 'fa-door-open' };
  else if (ultimoTipo === 'ENTRADA' || ultimoTipo === 'RETORNO_CAMPO') btn = { type: 'SALIDA', label: 'REGISTRAR SALIDA', clase: 'bg-salida', icono: 'fa-sign-out-alt' };
  else if (hoy.tieneSalida) btn = { type: 'NONE', label: 'JORNADA FINALIZADA', clase: 'bg-salida', icono: 'fa-check-circle' };
  const completaTexto = btn.type === 'NONE' ? (hoy.tieneSalida ? 'COMPLETA' : 'JORNADA COMPLETA') : '';

  return (
    <div className="credencial-wrapper">
      {cumple && <GlobosCumpleanos />}
      {!foto && (
        <div className="glass-card mb-3" style={s('background: rgba(239, 68, 68, 0.08); border: 1.5px solid rgba(239, 68, 68, 0.25); border-radius: 20px; padding: 14px 16px; animation: pulseGlowRed 2.5s infinite ease-in-out; margin: 0 10px 15px; box-sizing: border-box; text-align: left;')}>
          <div style={s('display: flex; gap: 12px; align-items: flex-start;')}>
            <div style={s('background: #ef4444; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; box-shadow: 0 4px 10px rgba(239,68,68,0.2);')}>
              <i className="fas fa-camera"></i>
            </div>
            <div style={{ flex: 1 }}>
              <h6 className="fw-bold mb-1" style={s('color: #991b1b; font-size: 14px; margin: 0 0 4px 0; font-family: inherit;')}>Falta Foto de Perfil</h6>
              <p style={s('color: #7f1d1d; font-size: 11.5px; margin: 0 0 10px 0; line-height: 1.4; font-weight: 500;')}>Para validar su identidad corporativa, es obligatorio subir una foto de perfil clara.</p>
              <div style={s('font-size: 10.5px; color: #7f1d1d; background: rgba(239, 68, 68, 0.04); border-radius: 8px; padding: 8px 10px; border-left: 3px solid #ef4444; font-weight: 600; line-height: 1.4;')}>
                💡 <strong>Cómo quitar este aviso:</strong> Haga clic en el botón de cámara azul <i className="fas fa-camera" style={{ color: 'var(--primary)' }}></i> sobre su foto de credencial abajo, seleccione su foto y se actualizará automáticamente.
              </div>
            </div>
          </div>
        </div>
      )}
      <div className={`credencial-profesional ${cumple ? 'birthday-glow' : ''}`}>
        <div className="credencial-decorative-top"></div>
        <div className="credencial-decorative-bottom"></div>
        <div className="credencial-brand-header">
          <img src="./assets/images/Logotipo T Control.png" alt="TCONTROL - Tecnología en Control Industrial" className="credencial-logo-img" />
        </div>
        <div className="photo-name-section">
          <div className="photo-frame rectangular-frame" style={{ position: 'relative' }}>
            {cumple && <div className="birthday-hat-overlay"><div className="birthday-hat-badge">🥳</div></div>}
            <div onClick={() => (foto ? setFotoGrande(foto) : ui.toast('No hay foto disponible', 'info'))}>
              {foto
                ? <FotoCredencial url={foto} />
                : <div className="employee-photo-placeholder-profesional rectangular-photo">👤</div>}
            </div>
            <div className="photo-edit-badge" onClick={subirFoto} title="Cambiar foto de perfil"><i className="fas fa-camera"></i></div>
            <div className="photo-verified"><i className="fas fa-check"></i></div>
            <div className="employee-id-badge">ID: {emp.id || '---'}</div>
          </div>
          <div className="insignias-container-credencial" style={s('margin-top: 38px; display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; margin-bottom: 0px; position: relative; z-index: 20;')}>
            {insigniasCompactas(stats, emp.es_pasante).map((i, k) => (
              <div key={k} className="compact-badge" title={i.titulo} onClick={() => setInsignia(i)}
                style={{ ...s('width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.08); transition: transform 0.2s, box-shadow 0.2s; cursor: pointer;'), background: i.fondo, border: `2.5px solid ${i.borde}` }}
                onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.15)'; }}
                onMouseOut={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.08)'; }}>
                {i.icono}
              </div>
            ))}
          </div>
          <div style={s('margin-top: 15px; margin-bottom: 4px;')}>
            <div style={s('color: #64748b; font-size: clamp(11px, 3.2vw, 13px); font-weight: 700; text-transform: uppercase; letter-spacing: 1px;')}>{saludo()}</div>
            <div className="employee-name-profesional" style={s('margin-top: 2px; font-weight: 900; font-size: clamp(14px, 4.2vw, 17px); color: #0f172a; letter-spacing: 0.5px; text-transform: uppercase;')}>
              {partesNombre[0]} {partesNombre.slice(1).join(' ')}
            </div>
          </div>
          <div><div className="employee-cargo-pill-badge">{emp.cargo || 'COLABORADOR'}</div></div>
          <div style={s('margin-top: 6px; color: #64748b; font-size: clamp(11px, 3vw, 13px); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;')}>{emp.area || 'General'}</div>

          <div className="mode-selector-premium" style={s('margin-top: 15px; display: flex; gap: 10px; justify-content: center;')}>
            {(['OFICINA', 'CAMPO'] as const).map(m => {
              const act = modo === m;
              const of = m === 'OFICINA';
              return (
                <div key={m} onClick={() => cambiarModo(m)} style={{
                  ...s('cursor: pointer; padding: 8px 16px; border-radius: 100px; font-size: 11px; font-weight: 800; transition: all 0.3s; display: flex; align-items: center; gap: 6px;'),
                  border: `2px solid ${act ? (of ? '#10b981' : '#f59e0b') : '#f1f5f9'}`, background: act ? (of ? '#f0fdf4' : '#fffbeb') : 'white',
                  color: act ? (of ? '#166534' : '#92400e') : '#94a3b8', boxShadow: act ? (of ? '0 4px 10px rgba(16,185,129,0.15)' : '0 4px 10px rgba(245,158,11,0.15)') : 'none',
                }}>
                  <i className={`fas ${of ? 'fa-building' : 'fa-map-marker-alt'}`} style={{ fontSize: 12 }}></i> {m}
                </div>
              );
            })}
          </div>
          {modo === 'CAMPO' && (
            <div style={s('margin-top: 10px; animation: fadeIn 0.3s ease;')}>
              {/* D-07: la base de campo la asigna el supervisor; el colaborador ya no la fija */}
              <div style={s('padding: 8px 16px; border-radius: 12px; background: #0369a1; color: white; border: none; font-weight: 700; font-size: 11px; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(3,105,161,0.2);')}>
                <i className="fas fa-location-arrow"></i> {emp.base_lat !== null ? 'PROYECTO ASIGNADO POR SUPERVISOR' : 'SIN PROYECTO ASIGNADO — CONSULTA A TU SUPERVISOR'}
              </div>
            </div>
          )}
        </div>

        <div className="status-section">
          <div className="status-title" style={s('white-space: nowrap !important; font-size: clamp(9px, 2.8vw, 11.5px) !important; text-align: center; display: block; width: 100%; letter-spacing: 0.5px; margin-bottom: 10px;')}>ESTADO DE ASISTENCIA - HOY</div>
          <div className="status-grid">
            <div className="status-card unified" style={s('width: 100%; display: flex; flex-direction: row !important; align-items: center; justify-content: space-around; padding: 12px 16px; border-radius: 14px;')}>
              <div className="unified-item" style={s('flex: 1; text-align: center;')}>
                <div className="unified-label" style={s('font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;')}>ENTRADA</div>
                <div className={`unified-value ${hoy.tieneEntrada ? 'success' : 'pending'}`} style={s('font-size: 17px; font-weight: 800; margin-top: 2px;')}>{horaEntrada}</div>
              </div>
              <div className="unified-divider" style={s('width: 1px; height: 32px; background: #e2e8f0; margin: 0 10px;')}></div>
              <div className="unified-item" style={s('flex: 1; text-align: center;')}>
                <div className="unified-label" style={s('font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;')}>SALIDA</div>
                <div className={`unified-value ${hoy.tieneSalida ? 'success' : 'pending'}`} style={s('font-size: 17px; font-weight: 800; margin-top: 2px;')}>{horaSalida}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="credencial-footer-profesional" style={s('padding: 12px 15px; border-top: 1px solid #f1f5f9; background: #f8fafc; text-align: center;')}>
          <div style={s('width: 100%; color: #64748b; font-size: 10.5px; font-weight: 700; letter-spacing: 0.5px;')}>TCONTROL S.A. © 2026</div>
          <div style={{ marginTop: 4 }}>
            <a href="#" onClick={e => { e.preventDefault(); setAviso(true); }}
              style={s('color: #0284c7; text-decoration: none; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 6px; background: #eff6ff; border: 1px solid #dbeafe;')}>
              <i className="fas fa-shield-halved"></i> Aviso Legal y Protección de Datos (LOPDP)
            </a>
          </div>
        </div>
      </div>

      {cfgEstado && sinMarca ? (
        <div className="card-reporte-fuera-confirmado" style={{ ...s('margin-top: 14px; margin-bottom: 8px; border-radius: 16px; padding: 14px 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); text-align: left;'), border: `1.5px solid ${cfgEstado.border}`, background: cfgEstado.bg }}>
          <div style={s('display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;')}>
            <span style={{ ...s('font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 5px;'), color: cfgEstado.color }}>
              <i className="fas fa-check-circle"></i> ESTADO DE HOY REPORTADO
            </span>
            <span style={{ ...s('font-size: 10.5px; font-weight: 700; background: white; padding: 2px 8px; border-radius: 10px;'), color: cfgEstado.color, border: `1px solid ${cfgEstado.border}` }}>
              {cfgEstado.badge} • {hoy.novedad?.justificado === 'PENDIENTE' ? 'Pendiente de aprobación' : 'Jornada Completa'}
            </span>
          </div>
          <div style={s('font-size: 16px; font-weight: 800; color: #0f172a; margin: 4px 0;')}>{cfgEstado.label}</div>
          {detalleEstado && detalleEstado !== cfgEstado.label && <div style={s('font-size: 12px; color: #475569; margin-bottom: 8px; font-style: italic;')}>“{detalleEstado}”</div>}
          <div style={s('background: #fff7ed; border-left: 3.5px solid #ea580c; border-radius: 8px; padding: 9px 12px; margin-top: 8px; font-size: 11.5px; color: #9a3412; line-height: 1.45;')}>
            <div style={s('font-weight: 800; margin-bottom: 2px;')}><i className="fas fa-exclamation-triangle" style={{ color: '#ea580c' }}></i> Regularización Obligatoria:</div>
            <div>Debe regularizar este evento con su supervisor tal como ya está establecido institucionalmente.</div>
            <div style={s('font-weight: 700; color: #c2410c; margin-top: 2px;')}>Recuerde que las faltas injustificadas son tomadas como vacaciones.</div>
          </div>
          <div style={s('margin-top: 10px; text-align: right;')}>
            <button type="button" onClick={() => setModalFuera(true)} style={s('background: none; border: none; color: #2563eb; font-size: 11.5px; font-weight: 700; cursor: pointer; text-decoration: underline; padding: 0;')}>
              <i className="fas fa-sync-alt"></i> Actualizar o cambiar estado reportado
            </button>
          </div>
        </div>
      ) : sinMarca ? (
        <div id="contenedorBotonFueraArea" style={{ display: fueraDeArea ? 'block' : 'none', marginTop: 12, marginBottom: 8 }}>
          <div onClick={() => setModalFuera(true)} style={s('background: #ffffff; border: 1.5px dashed #3b82f6; border-radius: 14px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 8px rgba(59,130,246,0.06);')}>
            <div style={s('display: flex; align-items: center; gap: 10px; text-align: left;')}>
              <div style={s('background: #eff6ff; width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #2563eb; flex-shrink: 0;')}>📍</div>
              <div>
                <div style={s('font-size: 12.5px; font-weight: 800; color: #1e3a8a;')}>¿Fuera del área de registro?</div>
                <div style={s('font-size: 11px; color: #64748b; font-weight: 600;')}>Reporte aquí: Vacación, Permiso Justificado o Campo</div>
              </div>
            </div>
            <div style={s('background: #2563eb; color: white; border-radius: 8px; padding: 6px 12px; font-size: 11.5px; font-weight: 700; white-space: nowrap; box-shadow: 0 2px 6px rgba(37,99,235,0.25);')}>
              Reportar <i className="fas fa-chevron-right" style={s('font-size: 10px; margin-left: 2px;')}></i>
            </div>
          </div>
        </div>
      ) : null}

      <div className="main-action-wrapper">
        <button className={`btn-main-action ${btn.clase}`} disabled={btn.type === 'NONE'} onClick={() => btn.type !== 'NONE' && iniciarRegistro(btn.type)}>
          <div className="btn-type"><i className={`fas ${btn.icono}`}></i> {btn.label}</div>
          <RelojBoton completa={btn.type === 'NONE'} texto={completaTexto} />
        </button>
      </div>

      {cumple && (
        <div className="birthday-banner glass-card" style={s('margin-top: 16px; margin-bottom: 8px; border: 1px solid #f472b6; background: linear-gradient(135deg, #fdf2f8, #fbcfe8);')}>
          <div className="birthday-banner-content">
            <div style={s('font-size: 24px; text-align: center; margin-bottom: 6px;')}>🎁</div>
            <h3 style={s('color: #db2777; font-size: clamp(14px, 4vw, 16px); font-weight: 800; text-align: center; margin: 0 0 8px 0;')}>¡Feliz Cumpleaños!</h3>
            <div style={s('background: rgba(255,255,255,0.6); border-radius: 8px; padding: 10px;')}>
              <p style={s('color: #9d174d; font-size: clamp(11px, 3.2vw, 13px); line-height: 1.4; margin: 0; text-align: center; font-weight: 600;')}>
                Disfrute su medio día laborable libre. Recuerde registrar su salida como "Cumpleaños".
              </p>
            </div>
          </div>
        </div>
      )}
      {emp.es_supervisor && (
        <button className="btn-supervisor" onClick={() => window.open('supervisor.html', '_blank')}><i className="fas fa-chart-line"></i> PANEL SUPERVISOR</button>
      )}
      {emp.es_admin && (
        <button className="btn-admin" onClick={() => window.open('admin_config.html', '_blank')}><i className="fas fa-sliders-h"></i> CONFIGURACIÓN DEL SISTEMA</button>
      )}

      {modalSalida && (
        <ModalConfirmarSalida nombre={emp.nombre} horaActual={formatearHora(ahora())} horaLimite={formatearHora24(ctx.horario.salida)}
          esPasante={emp.es_pasante || (emp.cargo || '').toLowerCase() === 'pasante'}
          onCancelar={() => setModalSalida(false)}
          onConfirmar={() => { setModalSalida(false); pend.current = { tipo: 'SALIDA' }; procederConRegistro(); }}
          onMotivos={() => { setModalSalida(false); pend.current = { tipo: 'SALIDA' }; setFlujo('razonSalida'); }} />
      )}
      {modalFuera && (
        <ModalReporteFueraArea tipoInicial={hoy.novedad && hoy.novedad.tipo in OPCIONES_FUERA_AREA ? hoy.novedad.tipo : 'VACACIONES'}
          obsInicial={hoy.novedad && hoy.novedad.razon_ausencia !== OPCIONES_FUERA_AREA[hoy.novedad.tipo as keyof typeof OPCIONES_FUERA_AREA] ? hoy.novedad.razon_ausencia : ''}
          onCerrar={() => setModalFuera(false)}
          onConfirmar={(t, o) => {
            if (!sinMarca) { ui.toast('Ya registraste tu jornada de asistencia el día de hoy.', 'info'); setModalFuera(false); return; }
            reportarFueraArea(t, o);
          }} />
      )}
      {popupAlmuerzo && <PopupAlmuerzo onElegir={elegirAlmuerzoPopup} onCerrar={cerrarPopupAlmuerzo} />}
      {insignia && <ModalInsignia titulo={insignia.titulo} descripcion={insignia.descripcion} icono={insignia.icono} fondo={insignia.fondo} borde={insignia.borde} onCerrar={() => setInsignia(null)} />}
      {fotoGrande && <ModalFoto url={fotoGrande} onCerrar={() => setFotoGrande(null)} />}
      {aviso && <ModalAvisoPrivacidad onCerrar={() => setAviso(false)} />}
    </div>
  );
}

function FotoCredencial({ url }: { url: string }) {
  const [err, setErr] = useState(false);
  if (err) return <div className="employee-photo-placeholder-profesional rectangular-photo" style={{ display: 'flex' }}>👤</div>;
  return <img className="employee-photo-profesional rectangular-photo" src={url} alt="Foto" onError={() => setErr(true)} />;
}
