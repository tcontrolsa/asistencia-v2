// Cálculos de presentación de la app del empleado, portados de index_core.js
// (calcularEstadisticas, calcularStatusActual, generarInsigniasHTMLCompacto, actualizarHistorialAgrupado).
// El atraso por día (R-04) y el tipo de día (feriado/fin de semana) vienen calculados del servidor.
// TODO(Fase 5): mover horas netas/extras a SQL junto con la jornada neta del supervisor (R-08).
import type { Registro } from './tipos';
import { formatMins } from './formato';
import { aMinutos } from './reloj';

export interface RegistroDia extends Registro { tipo_dia?: string }

const MARCACIONES_ORDINARIAS = ['ENTRADA', 'SALIDA', 'ESTADO', 'SOLO_ALMUERZO'];

export interface Estadisticas {
  diasTrabajados: number; atrasos: number; almuerzos: number; salidas_tempranas: number;
  horas_extras_50: string; horas_extras_100: string; horas_campo: string; minutosAtrasoTotal: number;
  minutosExtras50: number; minutosExtras100: number; minutosCampo: number; horas_trabajadas: string;
  minutosPermisoPersonal: number; minutosPermisoMedico: number; minutosTiempoJustificado: number; vacacionesEnPeriodo: number;
}

const ordenar = (a: Registro, b: Registro) => String(a.timestamp || a.hora).localeCompare(String(b.timestamp || b.hora));

export function calcularEstadisticas(registros: RegistroDia[], periodo: { inicio: string; fin: string }, esPasante: boolean): Estadisticas {
  const enPeriodo = registros.filter(r => r.fecha >= periodo.inicio && r.fecha <= periodo.fin);
  const vacio: Estadisticas = {
    diasTrabajados: 0, atrasos: 0, almuerzos: 0, salidas_tempranas: 0, horas_extras_50: '0h 0m', horas_extras_100: '0h 0m',
    horas_campo: '0h 0m', minutosAtrasoTotal: 0, minutosExtras50: 0, minutosExtras100: 0, minutosCampo: 0,
    horas_trabajadas: '0h 0m', minutosPermisoPersonal: 0, minutosPermisoMedico: 0, minutosTiempoJustificado: 0, vacacionesEnPeriodo: 0,
  };
  if (!enPeriodo.length) return vacio;

  const grupos: Record<string, RegistroDia[]> = {};
  enPeriodo.forEach(r => { (grupos[r.fecha] ??= []).push(r); });

  // Referencias del supervisor (07:30 y 16:15)
  const H_INI_REF = 450, H_FIN_REF = 975;
  let atrasos = 0, minutosAtrasoTotal = 0, almuerzos = 0, salidas_tempranas = 0, totalNetWorked = 0;
  let horasExtra50 = 0, horasExtra100 = 0, horasCampoNormales = 0, horasCampo50 = 0, horasCampo100 = 0;
  let minutosPermisoPersonal = 0, minutosPermisoMedico = 0, minutosTiempoJustificado = 0;

  Object.values(grupos).forEach(regsDia => {
    const entrada = regsDia.find(r => r.tipo === 'ENTRADA');
    const esFestivo = !!regsDia[0].tipo_dia && regsDia[0].tipo_dia !== 'LABORABLE';

    if (entrada && !esPasante && entrada.minutos_atraso > 0) {
      atrasos++;
      minutosAtrasoTotal += entrada.minutos_atraso;
    }
    if (entrada && (entrada.almuerzo === 'SI' || entrada.almuerzo === 'PLANTA')) almuerzos++;
    if (regsDia.some(r => (r.tipo_salida || '').includes('SALIDA_TEMPRANA'))) salidas_tempranas++;

    // Periodos entrada→salida del día
    const periodos: { e: RegistroDia | null; s: RegistroDia | null }[] = [];
    let pendiente: RegistroDia | null = null;
    [...regsDia].sort(ordenar).forEach(r => {
      const t = r.tipo.toUpperCase();
      if (t === 'ENTRADA' || t === 'RETORNO_CAMPO') pendiente = r;
      else if (t === 'SALIDA' || t === 'SALIDA_CAMPO') { periodos.push({ e: pendiente, s: r }); pendiente = null; }
    });
    if (pendiente) periodos.push({ e: pendiente, s: null });

    let trabajados = 0;
    periodos.forEach(p => {
      if (!p.e || !p.s) return;
      const mE = aMinutos(p.e.hora), mS = aMinutos(p.s.hora);
      if (mE === null || mS === null || mS <= mE) return;
      trabajados += mS - mE;
    });
    let netWorked = trabajados;
    if (!esFestivo && netWorked > 240) netWorked -= 45;

    let autorizado = regsDia.some(r => r.horasExtra === 'SI');
    if (esFestivo) autorizado = netWorked > 60;
    else {
      if (netWorked >= 600) autorizado = true;
      if (netWorked - 480 <= 60) autorizado = false;
    }

    let extra50 = 0;
    periodos.forEach(p => {
      if (!p.e || !p.s) return;
      const mE = aMinutos(p.e.hora)!, mS = aMinutos(p.s.hora)!;
      if (mE === null || mS === null || mS <= mE) return;
      const duracion = mS - mE;
      const enCampo = p.e.modo === 'CAMPO' || p.s.modo === 'CAMPO';
      if (esFestivo) {
        if (enCampo) { if (autorizado) horasCampo100 += duracion; } else if (autorizado) horasExtra100 += duracion;
      } else if (enCampo) {
        if (mS <= H_INI_REF || mE >= H_FIN_REF) horasCampo50 += duracion;
        else {
          const normal = Math.min(mS, H_FIN_REF) - Math.max(mE, H_INI_REF);
          horasCampoNormales += normal;
          horasCampo50 += duracion - normal;
        }
      } else if (autorizado && mS > H_FIN_REF) {
        extra50 += mS - Math.max(mE, H_FIN_REF);
      }
    });
    if (!esFestivo) horasExtra50 += extra50;
    totalNetWorked += netWorked;

    regsDia.forEach(r => {
      minutosPermisoPersonal += Number(r.permiso_personal_mins || 0);
      minutosPermisoMedico += Number(r.permiso_medico_mins || 0);
      minutosTiempoJustificado += Number(r.tiempo_justificado_mins || 0);
    });
  });

  const vacacionesEnPeriodo = enPeriodo.filter(r => r.tipo === 'VACACIONES' || r.tipo === 'VACACION').length;
  const totalExtras50 = horasExtra50 + horasCampo50;
  const totalExtras100 = horasExtra100 + horasCampo100;
  const totalCampo = horasCampoNormales + horasCampo50 + horasCampo100;

  return {
    diasTrabajados: Object.keys(grupos).length, atrasos, almuerzos, salidas_tempranas,
    horas_extras_50: formatMins(totalExtras50), horas_extras_100: formatMins(totalExtras100), horas_campo: formatMins(totalCampo),
    minutosAtrasoTotal, minutosExtras50: totalExtras50, minutosExtras100: totalExtras100, minutosCampo: totalCampo,
    horas_trabajadas: formatMins(totalNetWorked), minutosPermisoPersonal, minutosPermisoMedico, minutosTiempoJustificado, vacacionesEnPeriodo,
  };
}

export interface StatusActual { label: string; icon: string; color: string }

export function calcularStatusActual(registros: Registro[], hoy: string): StatusActual {
  const regsHoy = registros.filter(r => r.fecha === hoy);
  if (!regsHoy.length) return { label: 'Fuera de horario', icon: '🌙', color: '#64748b' };
  const ultimo = [...regsHoy].sort(ordenar).pop()!;
  const tipo = ultimo.tipo.toUpperCase();
  const razon = (ultimo.razon_salida || '').toLowerCase();
  switch (tipo) {
    case 'ENTRADA': case 'RETORNO_CAMPO':
      return { label: 'OFICINA', icon: '🏢', color: '#10b981' };
    case 'SALIDA_CAMPO':
      return { label: 'CAMPO', icon: '🚗', color: '#f59e0b' };
    case 'SALIDA': {
      const tSalida = (ultimo.tipo_salida || '').toUpperCase();
      const rPermiso = (ultimo.razon_permiso || '').toUpperCase();
      if (tSalida === 'PERMISO' || tSalida === 'INTERMEDIA' || tSalida.includes('PERMISO')) {
        const label = (rPermiso.includes('MEDICO') || razon.includes('medico') || tSalida.includes('MEDICO')) ? 'PERMISO MEDICO' : 'PERMISO PERSONAL';
        return { label, icon: '🕐', color: '#8b5cf6' };
      }
      if (tSalida === 'TRABAJO_CAMPO' || rPermiso === 'EN CAMPO' || razon.includes('campo')) return { label: 'CAMPO', icon: '🚗', color: '#f59e0b' };
      if (tSalida === 'CUMPLEAÑOS' || razon.includes('cumpleanos')) return { label: 'CUMPLEAÑOS', icon: '🎂', color: '#ff69b4' };
      if (tSalida === 'SALIDA_TEMPRANA_JUSTIFICADA' || razon.includes('justificada')) return { label: 'SALIDA JUSTIFICADA', icon: '✅', color: '#64748b' };
      return { label: 'JORNADA FINALIZADA', icon: '🏡', color: '#64748b' };
    }
    case 'ESTADO':
      return { label: (razon || 'ESTADO').toUpperCase(), icon: '👤', color: '#8b5cf6' };
    case 'FALTA': {
      const rFalta = (ultimo.razon_permiso || ultimo.razon_salida || '').toUpperCase();
      if (rFalta.includes('VACACIONES')) return { label: 'VACACIONES', icon: '🏖️', color: '#3b82f6' };
      if (rFalta.includes('MEDICO')) return { label: 'PERMISO MEDICO', icon: '🏥', color: '#ef4444' };
      if (rFalta.includes('PERSONAL')) return { label: 'PERMISO PERSONAL', icon: '👤', color: '#8b5cf6' };
      if (rFalta.includes('CAMPO')) return { label: 'SALIDA A CAMPO', icon: '🚗', color: '#f59e0b' };
      return { label: rFalta || 'AUSENCIA JUSTIFICADA', icon: '🏖️', color: '#3b82f6' };
    }
    default:
      return { label: 'EN ACTIVIDAD', icon: '⚙️', color: '#10b981' };
  }
}

export interface Insignia { icono: string; titulo: string; descripcion: string; fondo: string; borde: string }

export function insigniasCompactas(stats: Estadisticas, esPasante: boolean): Insignia[] {
  const lista: Insignia[] = [];
  // 1. Asistencia
  let a: Insignia = { icono: '🥉', titulo: 'Sin Asistencia', fondo: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)', borde: 'rgba(203, 213, 225, 0.4)', descripcion: 'Aún no registras días de asistencia en este período fiscal.' };
  if (stats.diasTrabajados >= 15) a = { icono: '🏆', titulo: `Asistencia de Platino: ${stats.diasTrabajados} días`, fondo: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)', borde: '#94a3b8', descripcion: `Has completado ${stats.diasTrabajados} días de asistencia en la empresa. ¡Rendimiento excepcional de nivel Platino!` };
  else if (stats.diasTrabajados >= 8) a = { icono: '🥇', titulo: `Asistencia de Oro: ${stats.diasTrabajados} días`, fondo: 'linear-gradient(135deg, #fef3c7, #fde68a)', borde: '#fbbf24', descripcion: `Has completado ${stats.diasTrabajados} días de asistencia. ¡Excelente constancia de nivel Oro!` };
  else if (stats.diasTrabajados >= 1) a = { icono: '🥈', titulo: `Asistencia de Plata: ${stats.diasTrabajados} días`, fondo: 'linear-gradient(135deg, #ffedd5, #fed7aa)', borde: '#fb923c', descripcion: `Has completado ${stats.diasTrabajados} días de asistencia. Nivel Plata, sigue manteniendo la constancia de tus registros.` };
  lista.push(a);
  // 2. Puntualidad
  const pct = esPasante ? 100 : (stats.diasTrabajados > 0 ? Math.max(0, Math.round(((stats.diasTrabajados - stats.atrasos) / stats.diasTrabajados) * 100)) : 100);
  let p: Insignia = { icono: '⏱️', titulo: 'Puntualidad por Evaluar', fondo: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)', borde: 'rgba(203, 213, 225, 0.4)', descripcion: 'Aún no hay suficientes días laborados en este período fiscal para evaluar tu puntualidad de entrada.' };
  if (esPasante) p = { icono: '🎓', titulo: 'Horario Flexible (Pasante)', fondo: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', borde: '#a78bfa', descripcion: 'Modalidad de pasantía con horario flexible. Recuerda registrar siempre tu entrada y tu salida.' };
  else if (stats.diasTrabajados > 0) {
    if (pct === 100) p = { icono: '🌟', titulo: 'Puntualidad Impecable (100%)', fondo: 'linear-gradient(135deg, #ecfdf5, #a7f3d0)', borde: '#34d399', descripcion: '¡Espectacular! Tienes una puntualidad perfecta. No registras ningún atraso en este período de trabajo.' };
    else if (pct >= 90) p = { icono: '🎖️', titulo: `Puntualidad de Élite (${pct}%)`, fondo: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', borde: '#6ee7b7', descripcion: `Excelente puntualidad del ${pct}% en tus registros. Sigue manteniendo esta gran disciplina de entrada.` };
    else if (pct >= 75) p = { icono: '👍', titulo: `Buen Ritmo de Entrada (${pct}%)`, fondo: 'linear-gradient(135deg, #eff6ff, #dbeafe)', borde: '#60a5fa', descripcion: `Buen ritmo de entrada. Mantienes una puntualidad del ${pct}% en este período. ¡Sigue así!` };
    else p = { icono: '⚠️', titulo: `Puntualidad por Mejorar (${pct}% - ${stats.atrasos} atrasos)`, fondo: 'linear-gradient(135deg, #fff5f5, #fed7d7)', borde: '#f87171', descripcion: `Puntualidad por mejorar del ${pct}% con ${stats.atrasos} atraso(s). ¡Llegar a tiempo es clave para tu récord!` };
  }
  lista.push(p);
  // 3. Almuerzo
  let al: Insignia = { icono: '🍽️', titulo: 'Sin almuerzos en planta', fondo: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)', borde: 'rgba(203, 213, 225, 0.4)', descripcion: 'Aún no has registrado almuerzos dentro de la empresa en este período de trabajo.' };
  if (stats.almuerzos >= 15) al = { icono: '👑', titulo: `Almuerzo Platinum: ${stats.almuerzos} en planta`, fondo: 'linear-gradient(135deg, #f0fdf4, #bbf7d0)', borde: '#4ade80', descripcion: `Has registrado ${stats.almuerzos} almuerzos en planta. ¡Excelente constancia Platinum de permanencia y bienestar!` };
  else if (stats.almuerzos >= 8) al = { icono: '🥗', titulo: `Almuerzo de Oro: ${stats.almuerzos} en planta`, fondo: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', borde: '#86efac', descripcion: `Has registrado ${stats.almuerzos} almuerzos en planta. ¡Buen nivel Oro de alimentación dentro de la empresa!` };
  else if (stats.almuerzos >= 1) al = { icono: '🥪', titulo: `Almuerzo de Plata: ${stats.almuerzos} en planta`, fondo: 'linear-gradient(135deg, #fdf8f6, #fee2e2)', borde: '#fca5a5', descripcion: `Has registrado ${stats.almuerzos} almuerzos en planta. Nivel Plata, sigue participando del almuerzo en comedor.` };
  lista.push(al);
  // 4. Campo
  if (stats.minutosCampo > 0) {
    lista.push({ icono: '🏗️', titulo: 'Héroe de Campo', fondo: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)', borde: '#38bdf8',
      descripcion: `Has acumulado un total de ${formatMins(stats.minutosCampo)} laborando fuera de la oficina en labores de campo. ¡Felicitaciones por tu gran dedicación en exteriores!` });
  }
  return lista;
}

export interface Logro { icono: string; titulo: string; descripcion: string; color: string }

export function logrosPeriodo(stats: Estadisticas, esPasante: boolean): Logro[] {
  const out: Logro[] = [];
  if (stats.diasTrabajados >= 15) out.push({ titulo: 'Asistencia de Platino', descripcion: `¡Extraordinario! Has registrado ${stats.diasTrabajados} días laborados en este período. Excelente compromiso.`, icono: '🏆', color: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)' });
  else if (stats.diasTrabajados >= 8) out.push({ titulo: 'Asistencia de Oro', descripcion: `Muy buena constancia con ${stats.diasTrabajados} días laborados en este período. ¡Sigue así!`, icono: '🥇', color: 'linear-gradient(135deg, #fef3c7, #fde68a)' });
  else if (stats.diasTrabajados >= 1) out.push({ titulo: 'Asistencia de Plata', descripcion: `Has registrado ${stats.diasTrabajados} días laborados en este período. Buen inicio.`, icono: '🥈', color: 'linear-gradient(135deg, #ffedd5, #fed7aa)' });
  else out.push({ titulo: 'Iniciando Camino', descripcion: 'Aún no registras asistencias en este período. ¡Registra tu entrada hoy!', icono: '🥉', color: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)' });

  const pct = esPasante ? 100 : (stats.diasTrabajados > 0 ? Math.max(0, Math.round(((stats.diasTrabajados - stats.atrasos) / stats.diasTrabajados) * 100)) : 100);
  if (esPasante) out.push({ titulo: 'Horario Flexible (Pasante)', descripcion: 'Modalidad de horario flexible. Recuerda registrar siempre tanto tu entrada como tu salida.', icono: '🎓', color: 'linear-gradient(135deg, #f5f3ff, #ede9fe)' });
  else if (stats.diasTrabajados === 0) out.push({ titulo: 'Sin Registro', descripcion: 'Se evaluará tu puntualidad una vez que registres asistencias.', icono: '⏱️', color: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)' });
  else if (pct === 100) out.push({ titulo: 'Puntualidad Impecable (100%)', descripcion: '¡Asombroso! No registras ningún atraso en este período. Eres un ejemplo de puntualidad.', icono: '🌟', color: 'linear-gradient(135deg, #ecfdf5, #a7f3d0)' });
  else if (pct >= 90) out.push({ titulo: 'Puntualidad de Élite', descripcion: `Excelente puntualidad del ${pct}% (${stats.diasTrabajados - stats.atrasos} de ${stats.diasTrabajados} días a tiempo).`, icono: '🎖️', color: 'linear-gradient(135deg, #ecfdf5, #d1fae5)' });
  else if (pct >= 75) out.push({ titulo: 'Buen Ritmo de Entrada', descripcion: `Has mantenido un ${pct}% de puntualidad en el periodo. ¡Sigue concentrado!`, icono: '👍', color: 'linear-gradient(135deg, #eff6ff, #dbeafe)' });
  else out.push({ titulo: 'Puntualidad por Mejorar', descripcion: `Tienes un ${pct}% de puntualidad (${stats.atrasos} atrasos en ${stats.diasTrabajados} días). ¡Llega más temprano!`, icono: '⚠️', color: 'linear-gradient(135deg, #fff5f5, #fed7d7)' });

  if (stats.minutosCampo > 0) out.push({ titulo: 'Héroe de Campo', descripcion: `Has sumado ${formatMins(stats.minutosCampo)} trabajando activamente en campo durante este período.`, icono: '🏗️', color: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)' });
  if (stats.almuerzos >= 15) out.push({ titulo: 'Almuerzo Platinum', descripcion: `¡Espectacular! Has almorzado en planta ${stats.almuerzos} veces en este período, priorizando tu permanencia y bienestar.`, icono: '👑', color: 'linear-gradient(135deg, #f0fdf4, #bbf7d0)' });
  else if (stats.almuerzos >= 8) out.push({ titulo: 'Almuerzo de Oro', descripcion: `Muy buen hábito. Has registrado ${stats.almuerzos} almuerzos en la planta durante este período.`, icono: '🥗', color: 'linear-gradient(135deg, #f0fdf4, #dcfce7)' });
  else if (stats.almuerzos > 0) out.push({ titulo: 'Almuerzo de Plata', descripcion: `Has registrado ${stats.almuerzos} almuerzos en la planta. ¡Sigue manteniendo tu constancia!`, icono: '🥪', color: 'linear-gradient(135deg, #fdf8f6, #fee2e2)' });
  return out;
}

// ───────── Historial agrupado por semana (domingo a sábado) ─────────
export interface DiaHistorial {
  fecha: string; statusIcon: string; fechaFormato: string; entradaHora: string; salidaHora: string; duracion: string;
  almuerzoIcon: string; resaltar: boolean; detalles: { tipo: 'vacacion' | 'justificacion' | 'atraso' | 'salida' | 'permiso'; texto: string; extra?: string }[];
}
export interface SemanaHistorial { clave: string; etiqueta: string; dias: number; atrasos: number; justificaciones: number; horas: number; lista: DiaHistorial[] }

function detallesPermiso(r: Registro): string {
  const parts: string[] = [];
  if (r.permiso_personal_mins > 0) parts.push(`🔑 Permiso Personal: ${r.permiso_personal_mins} min`);
  if (r.permiso_medico_mins > 0) parts.push(`🩺 Permiso Médico: ${r.permiso_medico_mins} min`);
  if (r.tiempo_justificado_mins > 0) parts.push(`✅ Tiempo Justificado: ${r.tiempo_justificado_mins} min`);
  if (r.razon_permiso && r.tipo !== 'FALTA') {
    if (parts.length) parts.push(`(${r.razon_permiso})`); else parts.push(`🔑 Permiso: ${r.razon_permiso}`);
  }
  return parts.join(' ');
}

const esNoOrdinaria = (t: string) => !MARCACIONES_ORDINARIAS.includes(t.toUpperCase());

export function historialPorSemana(registros: Registro[], esPasante: boolean, formatearHora: (h: string) => string, desdePeriodo: string | null): SemanaHistorial[] {
  const semanas: Record<string, Record<string, Registro[]>> = {};
  registros.forEach(r => {
    const [y, m, d] = r.fecha.split('-').map(Number);
    const f = new Date(y, m - 1, d);
    const inicio = new Date(f); inicio.setDate(f.getDate() - f.getDay());
    const clave = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-${String(inicio.getDate()).padStart(2, '0')}`;
    ((semanas[clave] ??= {})[r.fecha] ??= []).push(r);
  });
  let claves = Object.keys(semanas).sort((a, b) => b.localeCompare(a));
  if (desdePeriodo) claves = claves.filter(k => Object.keys(semanas[k]).some(f => f >= desdePeriodo));

  return claves.map(clave => {
    const [y, m, d] = clave.split('-').map(Number);
    const ini = new Date(y, m - 1, d), fin = new Date(y, m - 1, d + 6);
    const fmt = (x: Date) => x.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit' });
    const sem: SemanaHistorial = { clave, etiqueta: `${fmt(ini)} al ${fmt(fin)}`, dias: 0, atrasos: 0, justificaciones: 0, horas: 0, lista: [] };
    Object.keys(semanas[clave]).sort((a, b) => b.localeCompare(a)).forEach(fecha => {
      const regs = semanas[clave][fecha];
      const entrada = regs.find(r => r.tipo === 'ENTRADA' || r.tipo === 'SOLO_ALMUERZO');
      const salida = regs.find(r => r.tipo === 'SALIDA');
      if (entrada || salida) sem.dias++;
      if (regs.some(r => r.razon_entrada_tardia) && !esPasante) sem.atrasos++;
      const esFalta = regs.some(r => esNoOrdinaria(r.tipo));
      if (esFalta) sem.justificaciones++;
      let duracion = '--';
      if (entrada && salida) {
        const mE = aMinutos(entrada.hora), mS = aMinutos(salida.hora);
        if (mE !== null && mS !== null && mS > mE) {
          const netos = Math.max(0, mS - mE - 45);
          sem.horas += netos / 60;
          duracion = netos > 0 ? `${Math.floor(netos / 60)}h ${netos % 60}m` : '0h 0m';
        }
      }
      const atrasoDia = entrada?.minutos_atraso || 0;
      const salidaTemprana = regs.some(r => (r.tipo_salida || '').includes('SALIDA_TEMPRANA'));
      const esVacacion = regs.some(r => r.tipo === 'VACACIONES' || r.tipo === 'VACACION');
      const [yy, mm, dd] = fecha.split('-').map(Number);
      const detalles: DiaHistorial['detalles'] = [];
      regs.forEach(r => {
        const t = r.tipo.toUpperCase();
        if (t === 'VACACIONES' || t === 'VACACION') { detalles.push({ tipo: 'vacacion', texto: 'Tomada' }); return; }
        if (esNoOrdinaria(t)) { detalles.push({ tipo: 'justificacion', texto: r.razon_ausencia || 'Falta' }); return; }
        if (r.razon_entrada_tardia) detalles.push({ tipo: 'atraso', texto: r.razon_entrada_tardia, extra: atrasoDia > 0 ? `+${atrasoDia}m` : undefined });
        if (r.razon_salida) detalles.push({ tipo: 'salida', texto: r.razon_salida });
        const perm = detallesPermiso(r);
        if (perm) detalles.push({ tipo: 'permiso', texto: perm });
      });
      sem.lista.push({
        fecha,
        statusIcon: esVacacion ? '🏖️' : (esFalta ? '📁' : (entrada && salida ? '✅' : entrada ? '⚠️' : '❌')),
        fechaFormato: new Date(yy, mm - 1, dd).toLocaleDateString('es-EC', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase(),
        entradaHora: esFalta ? 'JUSTIFICADO' : (entrada ? formatearHora(entrada.hora) : '--:--'),
        salidaHora: esFalta ? 'N/A' : (salida ? formatearHora(salida.hora) : '--:--'),
        duracion,
        almuerzoIcon: entrada ? (entrada.almuerzo === 'SI' ? '🏢' : entrada.almuerzo === 'NO' ? '🏠' : '-') : '-',
        resaltar: atrasoDia > 0 || salidaTemprana,
        detalles,
      });
    });
    return sem;
  });
}
