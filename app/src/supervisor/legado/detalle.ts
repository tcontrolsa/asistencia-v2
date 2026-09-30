// Cálculo del historial del colaborador por período (mostrarDetalle → rebuildTable del legado), 1:1.
// Devuelve datos; el marcado vive en ui/Detalle.tsx.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { FechaRegularizar } from './asistencia';
import {
  Emp, HORA_ENTRADA_REF, HORA_SALIDA_REF, Periodo, Reg, calcularAlmuerzosPeriodo, calcularNetWorkedOrdinario, clasificarGap,
  diaSemana, esEmpleadoPasante, esFeriadoODomingo, getLocalHoyStr, normalizarFechaStr, obtenerDiasHabiles,
  obtenerFechaInicioEfectivaEmpleado, obtenerMinutos, sumarDias,
} from './util';

interface DiaAgrupado { registros: Reg[]; almuerzo: string | null; previoAlRegistro?: boolean; faltaInasistencia?: boolean }

export interface FilaDetalle {
  fecha: string; dayOfWeek: number; esFestivo: boolean;
  tipoFila: 'previo' | 'ausencia' | 'normal';
  regsDia: Reg[];
  // Ausencia o evento de día completo
  razonMostrar?: string; descMostrar?: string; icon?: string; cardBg?: string; cardBorder?: string; badgeBg?: string; badgeColor?: string;
  // Día con marcaciones
  periodos: Periodo[];
  almuerzo: string | null; esFalta: boolean; tieneAsistencia: boolean;
  netWorked: number; atrasoMins: number; minsSalidaTemprana: number;
  tiempoJustificado: number; tiempoPersonal: number; tiempoMedico: number; tiempoPorJustificar: number;
  razonTextoFinal: string; razonAusenciaVal: string; razonJustificadaVal: string;
  descuentoDia: number; h50: number; h100: number; hC50: number; hC100: number;
  autorizadoGlobal: boolean; extrasCampo: boolean; modActual: 'EMPRESA' | 'CAMPO' | 'MIXTO';
}

export interface ResultadoDetalle {
  filas: FilaDetalle[];
  fechasARegularizar: FechaRegularizar[];
  tot: { horas: number; atrasos: number; tJustificado: number; tp: number; tm: number; tj: number; descuentoBruto: number;
         descuentoNeto: number; extra50: number; extra100: number };
}

const esCampoDia = (regsDia: Reg[]) => regsDia.some(r => {
  const t = String(r.tipo || r.tipo_salida || '').toUpperCase();
  const modo = String(r.modo || r.modo_trabajo || '').toUpperCase();
  const raz = String(r.razon_ausencia || r.razon_permiso || r.razon_justificac || r.razon_salida || r.observacion || '').toUpperCase();
  const est = String(r.estado || '').toUpperCase();
  return t.includes('CAMPO') || modo.includes('CAMPO') || raz.includes('CAMPO') || est.includes('CAMPO');
});

const TIPOS_ASIS = ['ENTRADA', 'SALIDA', 'RETORNO_CAMPO', 'SALIDA_CAMPO', 'ENTRADA_CAMPO'];
const NO_JUST = ['—', '-', '', 'INASISTENCIA', 'FALTA INJUSTIFICADA', 'INJUSTIFICADA'];

function diaJustificado(regsDia: Reg[], tieneAsistencia: boolean, esCampoHoy: boolean): boolean {
  return esCampoHoy || regsDia.some(r => {
    const tipo = String(r.tipo || r.tipo_salida || '').toUpperCase();
    const razAus = String(r.razon_ausencia || '').trim();
    if (tieneAsistencia && (tipo.includes('VACAC') || razAus.toUpperCase().includes('VACAC'))) return false;
    if (r.justificado === 'SI' || r.justificado === true || r.justificada === 'SI' || r.justificada === true) return true;
    const razPerm = String(r.razon_permiso || '').trim();
    const razJust = String(r.razon_justificac || '').trim();
    if (razAus && !NO_JUST.includes(razAus.toUpperCase())) return true;
    if (razPerm && !NO_JUST.includes(razPerm.toUpperCase())) return true;
    if (razJust && !['—', '-', ''].includes(razJust.toUpperCase())) return true;
    if (tipo && !['ENTRADA', 'SALIDA', 'ESTADO', 'SOLO_ALMUERZO'].includes(tipo)) {
      if (tipo.includes('JUSTIFIC') || tipo.includes('CAMPO') || tipo.includes('VACAC') || tipo.includes('MEDIC') || tipo.includes('CALAMIDAD') || tipo.includes('CUMPLE') || tipo.includes('PERSONAL')) return true;
    }
    return false;
  });
}

const ordenar = (regs: Reg[]) => [...regs].sort((a, b) => {
  if (a.timestamp && b.timestamp) return String(a.timestamp).localeCompare(String(b.timestamp));
  return String(a.hora || '').localeCompare(String(b.hora || ''));
});

const esSalidaReg = (r: Reg) => {
  const tipo = String(r.tipo || '').toUpperCase();
  return tipo === 'SALIDA' || tipo === 'SALIDA_CAMPO' || tipo === 'SALIDA_PASANTE' || r.tipo_salida === 'SALIDA_PASANTE' || r.razon_salida === 'salida_pasante';
};
const esEntradaReg = (tipo: string) => tipo === 'ENTRADA' || tipo === 'RETORNO_CAMPO' || tipo === 'ENTRADA_CAMPO';

function tiemposPermiso(regsDia: Reg[]) {
  let just = 0;
  const hasCumpleanos = regsDia.some(r => {
    const raz = String(r.razon_ausencia || '').toLowerCase();
    const tip = String(r.tipo || r.tipo_salida || '').toUpperCase();
    return raz.includes('cumplea') || raz.includes('cumplean') || tip.includes('CUMPLE');
  });
  if (hasCumpleanos) just += 240;
  const regPermiso = regsDia.find(r => r.tipo === 'ENTRADA') || regsDia.find(r => r.tiempo_justificado_mins || r.permiso_personal_mins || r.permiso_medico_mins) || regsDia[0];
  return {
    pers: regPermiso ? Number(regPermiso.permiso_personal_mins || 0) : 0,
    med: regPermiso ? Number(regPermiso.permiso_medico_mins || 0) : 0,
    just: just + (regPermiso ? Number(regPermiso.tiempo_justificado_mins || 0) : 0),
  };
}

// Agrupa por día, inyecta vacaciones virtuales y días hábiles sin marcaciones (inasistencias)
function agruparPorDia(e: Emp, regs: Reg[], vacacionesList: Reg[], R_INI: string, R_FIN: string): Record<string, DiaAgrupado> {
  const porDia: Record<string, DiaAgrupado> = {};
  ordenar(regs).forEach(r => {
    const fechaNorm = normalizarFechaStr(r.fecha);
    if (!fechaNorm) return;
    const dia = (porDia[fechaNorm] ||= { registros: [], almuerzo: null });
    const rTipo = String(r.tipo || '').toUpperCase();
    const rH = (r.hora || '').slice(0, 5);
    const yaExiste = dia.registros.some(ex => {
      const exTipo = String(ex.tipo || '').toUpperCase();
      const exH = (ex.hora || '').slice(0, 5);
      if (ex.id && r.id && ex.id === r.id) return true;
      if (exTipo === rTipo && exH && rH && exH === rH) return true;
      if (exTipo.includes('SALIDA') && rTipo.includes('SALIDA') && exH && rH && exH === rH) return true;
      const esEntEx = exTipo.includes('ENTRADA') || exTipo.includes('RETORNO');
      const esEntR = rTipo.includes('ENTRADA') || rTipo.includes('RETORNO');
      if (esEntEx && esEntR && exH && rH && exH === rH) return true;
      return false;
    });
    if (!yaExiste) dia.registros.push(r);
    if (r.tipo === 'ENTRADA' && r.almuerzo) dia.almuerzo = r.almuerzo;
  });

  vacacionesList.forEach(v => {
    const fNorm = normalizarFechaStr(v.fecha);
    if (!fNorm || fNorm < R_INI || fNorm > R_FIN) return;
    const dia = (porDia[fNorm] ||= { registros: [], almuerzo: null });
    if (dia.registros.some(r => TIPOS_ASIS.includes(String(r.tipo || '').toUpperCase()))) return;
    if (!dia.registros.some(r => r.tipo === 'VACACIONES' || r.tipo === 'VACACION')) {
      dia.registros.push({ id: `${e.id}_VACACIONES_${fNorm}_000000`, empleadoId: e.id, tipo: 'VACACIONES', fecha: fNorm, razon_ausencia: 'Vacación', justificado: 'SI' });
    }
  });

  // Días hábiles desde el ingreso hasta ayer (nunca el día en curso) sin registros = inasistencia
  const hoyStrLocal = getLocalHoyStr();
  const ayerStrLocal = sumarDias(hoyStrLocal, -1);
  let limiteFinLocal = (R_FIN && R_FIN < ayerStrLocal) ? R_FIN : ayerStrLocal;
  const fSalidaEmp = (e.fecha_salida || e.fechaDesvinculacion) ? (normalizarFechaStr(e.fecha_salida || e.fechaDesvinculacion) || e.fecha_salida) : null;
  if (fSalidaEmp && fSalidaEmp < limiteFinLocal) limiteFinLocal = fSalidaEmp;
  const fechaInicioEfectiva = obtenerFechaInicioEfectivaEmpleado(e, R_INI);
  const inicioEvalEmp = (fechaInicioEfectiva && fechaInicioEfectiva > R_INI) ? fechaInicioEfectiva : R_INI;
  if (fechaInicioEfectiva && fechaInicioEfectiva > R_INI) {
    const finPrevio = sumarDias(fechaInicioEfectiva, -1);
    if (R_INI <= finPrevio) {
      obtenerDiasHabiles(R_INI, finPrevio).forEach(fPrev => {
        if (!porDia[fPrev]) porDia[fPrev] = { registros: [], almuerzo: null, previoAlRegistro: true };
      });
    }
  }
  if (inicioEvalEmp && limiteFinLocal && inicioEvalEmp <= limiteFinLocal) {
    obtenerDiasHabiles(inicioEvalEmp, limiteFinLocal).forEach(fHab => {
      if (!porDia[fHab]) porDia[fHab] = { registros: [], almuerzo: null, faltaInasistencia: true };
    });
  }
  return porDia;
}

export function calcularDetalle(e: Emp, regs: Reg[], vacacionesList: Reg[], R_INI: string, R_FIN: string): ResultadoDetalle {
  const porDia = agruparPorDia(e, regs, vacacionesList, R_INI, R_FIN);
  const fechasOrdenadas = Object.keys(porDia).filter(f => f && /^\d{4}-\d{2}-\d{2}$/.test(f)).sort((a, b) => b.localeCompare(a));
  const hoyStrLocal = getLocalHoyStr();
  const esPasanteDet = esEmpleadoPasante(e);

  // ─── Bolsa de 4 horas (240 min) por período, en orden cronológico ───
  let saldoBeneficio4h = esPasanteDet ? 0 : 240;
  const mapBeneficioPorDia: Record<string, { consumo4h: number; tjNeto: number; descuentoNeto: number; rawTJ: number; rawDescuento: number }> = {};
  [...fechasOrdenadas].sort((a, b) => a.localeCompare(b)).forEach(f => {
    const d = porDia[f];
    const regsDia = ordenar(d.registros);
    const dayOfWeek = diaSemana(f);
    const esFestivo = esFeriadoODomingo(f) || dayOfWeek === 6;
    const tieneAsistencia = regsDia.some(r => TIPOS_ASIS.includes(String(r.tipo || '').toUpperCase()));
    const isJustificado = diaJustificado(regsDia, tieneAsistencia, esCampoDia(regsDia));

    const periodosDia: Periodo[] = [];
    let entradaPendiente: Reg | null = null;
    let ultimoSalidaMins: number | null = null;
    regsDia.forEach(r => {
      const tipo = String(r.tipo || '').toUpperCase();
      if (esEntradaReg(tipo)) {
        const mE = obtenerMinutos(r.timestamp || r.hora);
        if (entradaPendiente) {
          const mPend = obtenerMinutos(entradaPendiente.timestamp || entradaPendiente.hora);
          if (mPend !== null && mE !== null && Math.abs(mE - mPend) <= 2) return;
        }
        entradaPendiente = r;
      } else if (esSalidaReg(r)) {
        if (entradaPendiente) {
          periodosDia.push({ entrada: entradaPendiente, salida: r });
          ultimoSalidaMins = obtenerMinutos(r.timestamp || r.hora);
          entradaPendiente = null;
        } else periodosDia.push({ entrada: null, salida: r });
      }
    });
    if (entradaPendiente) periodosDia.push({ entrada: entradaPendiente, salida: null });
    if (periodosDia.length === 0) periodosDia.push({ entrada: null, salida: null });

    const primerReg = regsDia.find(r => esEntradaReg(String(r.tipo)));
    let atrasoMins = 0;
    if (primerReg && !esPasanteDet) {
      const mE = obtenerMinutos(primerReg.timestamp || primerReg.hora);
      const refEntrada = esFestivo ? 420 : HORA_ENTRADA_REF;
      if (mE !== null && mE > refEntrada + 5) atrasoMins = mE - refEntrada;
    }
    const ultSalReg = [...regsDia].reverse().find(r => String(r.tipo || r.tipo_salida || '').toUpperCase().includes('SALIDA'));
    if (ultSalReg) {
      const mS = obtenerMinutos(ultSalReg.hora || ultSalReg.timestamp);
      if (mS !== null) ultimoSalidaMins = mS;
    }
    let minsSalidaTemprana = 0;
    const refSalida = esFestivo ? 975 : HORA_SALIDA_REF;
    if (!esFestivo && !esPasanteDet && ultimoSalidaMins !== null && ultimoSalidaMins < refSalida) minsSalidaTemprana = refSalida - ultimoSalidaMins;

    const tp = tiemposPermiso(regsDia);
    const tiempoPersonal = tp.pers, tiempoMedico = tp.med, tiempoJustificado = tp.just;

    const netWorkedOrdinario = calcularNetWorkedOrdinario(periodosDia, esFestivo);
    const missingMinutesDia = esFestivo ? 0 : Math.max(0, 480 - netWorkedOrdinario);
    if (!esFestivo && (atrasoMins + minsSalidaTemprana) > missingMinutesDia) atrasoMins = Math.max(0, missingMinutesDia - minsSalidaTemprana);

    const rawAtrasoMins = atrasoMins;
    const rawSalidaTemprana = minsSalidaTemprana;
    let atrasoMinsDia = atrasoMins;
    if (esPasanteDet) {
      atrasoMinsDia = 0;
    } else {
      const tieneJustifEntradaTardia = regsDia.some(r => r.razon_entrada_tardia && !['—', '-', ''].includes(String(r.razon_entrada_tardia).trim()));
      const permisosTotales = tiempoPersonal + tiempoMedico + tiempoJustificado;
      atrasoMinsDia = tieneJustifEntradaTardia ? 0 : Math.max(0, rawAtrasoMins - permisosTotales);
      void rawSalidaTemprana;
    }

    let rawTJ = 0;
    const esPrevioAlRegistro = Boolean(d.previoAlRegistro);
    const esHoyOFuturo = f >= hoyStrLocal;
    if ((isJustificado && !tieneAsistencia) || esHoyOFuturo || esPrevioAlRegistro || esPasanteDet) {
      rawTJ = (esPasanteDet && periodosDia.some(p => p.entrada && !p.salida)) ? 60 : 0;
    } else {
      const missingMinutes = esFestivo ? 0 : Math.max(0, 480 - netWorkedOrdinario);
      const unaccountedMissing = Math.max(0, missingMinutes - (tiempoPersonal + tiempoMedico));
      rawTJ = Math.max(0, unaccountedMissing - tiempoJustificado);
    }
    const rawDescuento = tiempoPersonal + (rawTJ > 0 ? Math.max(rawTJ, atrasoMinsDia) : atrasoMinsDia);
    let consumo4h = 0;
    if (!esPasanteDet && saldoBeneficio4h > 0 && rawDescuento > 0) {
      consumo4h = Math.min(saldoBeneficio4h, rawDescuento);
      saldoBeneficio4h -= consumo4h;
    }
    mapBeneficioPorDia[f] = { consumo4h, tjNeto: Math.max(0, rawTJ - consumo4h), descuentoNeto: Math.max(0, rawDescuento - consumo4h), rawTJ, rawDescuento };
  });

  // ─── Filas (de la más reciente a la más antigua) ───
  const tot = { horas: 0, atrasos: 0, tJustificado: 0, tp: 0, tm: 0, tj: 0, descuentoBruto: 0, descuentoNeto: 0, extra50: 0, extra100: 0 };
  const fechasARegularizar: FechaRegularizar[] = [];

  const filas: FilaDetalle[] = fechasOrdenadas.map(f => {
    const d = porDia[f];
    const regsDia = ordenar(d.registros);
    const dayOfWeek = diaSemana(f);
    const esFestivo = esFeriadoODomingo(f) || dayOfWeek === 6;
    const esMarcacionOrdinaria = (tipo: unknown) => ['ENTRADA', 'SALIDA', 'ESTADO', 'SOLO_ALMUERZO'].includes(String(tipo).toUpperCase());
    const tieneAsistencia = regsDia.some(r => TIPOS_ASIS.includes(String(r.tipo || '').toUpperCase()));
    const esFalta = regsDia.some(r => !esMarcacionOrdinaria(r.tipo)) || !tieneAsistencia;
    const esCampoHoy = esCampoDia(regsDia);
    const isJustificado = diaJustificado(regsDia, tieneAsistencia, esCampoHoy);

    const periodosDia: Periodo[] = [];
    let entradaPendiente: Reg | null = null;
    let ultimoSalidaMins: number | null = null;
    let ultimoSalidaReg: Reg | null = null;
    regsDia.forEach(r => {
      const tipo = String(r.tipo || '').toUpperCase();
      if (esEntradaReg(tipo)) {
        const mE = obtenerMinutos(r.timestamp || r.hora);
        if (entradaPendiente) {
          const mPend = obtenerMinutos(entradaPendiente.timestamp || entradaPendiente.hora);
          if (mPend !== null && mE !== null && Math.abs(mE - mPend) <= 2) return;
        }
        entradaPendiente = r;
      } else if (esSalidaReg(r)) {
        if (entradaPendiente) {
          periodosDia.push({ entrada: entradaPendiente, salida: r });
          ultimoSalidaMins = obtenerMinutos(r.timestamp || r.hora);
          entradaPendiente = null;
        } else {
          const ultP = periodosDia[periodosDia.length - 1];
          if (ultP && ultP.salida) {
            const mUlt = obtenerMinutos(ultP.salida.timestamp || ultP.salida.hora);
            const mCur = obtenerMinutos(r.timestamp || r.hora);
            if (mUlt !== null && mCur !== null && Math.abs(mCur - mUlt) <= 2) return;
          }
          periodosDia.push({ entrada: null, salida: r });
        }
      }
    });
    if (entradaPendiente) periodosDia.push({ entrada: entradaPendiente, salida: null });
    if (periodosDia.length === 0) periodosDia.push({ entrada: null, salida: null });

    const primerReg = regsDia.find(r => esEntradaReg(String(r.tipo)));
    let atrasoMins = 0;
    if (primerReg && !esPasanteDet) {
      const mE = obtenerMinutos(primerReg.timestamp || primerReg.hora);
      const refEntrada = esFestivo ? 420 : HORA_ENTRADA_REF;
      if (mE !== null && mE > refEntrada + 5) atrasoMins = mE - refEntrada;
    }

    // Razón del día (ausencia, justificación)
    let razonAusenciaVal = '';
    let razonJustificadaVal = '';
    regsDia.forEach(r => {
      const t = String(r.tipo || r.tipo_salida || '').toUpperCase();
      let tipoLegible = '';
      if (t === 'VACACIONES' || t === 'VACACION') tipoLegible = 'Vacación';
      else if (t === 'PERMISO_MEDICO') tipoLegible = 'Permiso Médico';
      else if (t === 'PERMISO_PERSONAL') tipoLegible = 'Permiso Personal';
      else if (t === 'CALAMIDAD_DOMESTICA') tipoLegible = 'Calamidad Doméstica';
      else if (t === 'TRABAJO_DE_CAMPO' || t === 'SALIDA_A_CAMPO' || t === 'SALIDA_CAMPO' || t === 'ENTRADA_CAMPO') tipoLegible = 'Salida a Campo';
      else if (t === 'CUMPLEAÑOS' || t === 'CUMPLEANOS') tipoLegible = 'Cumpleaños';
      else if (t === 'SALIDA_JUSTIFICADA' || t === 'FALTA_JUSTIFICADA') tipoLegible = 'Salida Justificada';
      const obsTexto = String(r.razon_ausencia || r.razon_justificac || '').trim();
      if (tipoLegible) {
        razonAusenciaVal = tipoLegible;
        if (obsTexto && obsTexto !== tipoLegible && obsTexto !== '—' && obsTexto !== '-') razonJustificadaVal = obsTexto;
      } else if (obsTexto && obsTexto !== '—' && obsTexto !== '-') {
        razonAusenciaVal = obsTexto;
      } else if (r.justificado === 'SI' && r.razon_justificac) {
        razonJustificadaVal = r.razon_justificac;
      }
    });
    const razonTextoFinal = razonAusenciaVal || razonJustificadaVal;

    let h50 = 0, h100 = 0, hC50 = 0, hC100 = 0;
    let minutosTrabajadosHoy = 0;
    let tiempoPersonal = 0, tiempoMedico = 0, tiempoPorJustificar = 0;
    let minsEmpresa = 0, minsCampo = 0;
    ultimoSalidaMins = null;
    ultimoSalidaReg = null;
    let processedLunchGap = false;
    periodosDia.forEach(p => {
      if (!p.entrada || !p.salida) return;
      const mE = obtenerMinutos(p.entrada.hora || p.entrada.timestamp);
      const mS = obtenerMinutos(p.salida.hora || p.salida.timestamp);
      if (mE === null || mS === null || mS <= mE) return;
      const duracion = mS - mE;
      minutosTrabajadosHoy += duracion;
      if (p.entrada.modo === 'CAMPO' || p.salida.modo === 'CAMPO') minsCampo += duracion; else minsEmpresa += duracion;
      if (ultimoSalidaMins !== null && mE > ultimoSalidaMins) {
        let gap = mE - ultimoSalidaMins;
        if (!processedLunchGap && ultimoSalidaMins >= 690 && ultimoSalidaMins <= 870) {
          gap -= Math.min(45, gap);
          processedLunchGap = true;
        }
        if (gap > 0) {
          const clasif = clasificarGap(ultimoSalidaReg, gap);
          if (clasif.tipo === 'medico') tiempoMedico += gap;
          else if (clasif.tipo === 'personal') tiempoPersonal += gap;
          else tiempoPorJustificar += gap;
        }
      }
      ultimoSalidaMins = mS;
      ultimoSalidaReg = p.salida;
    });

    let netWorked = minutosTrabajadosHoy;
    if (!esFestivo && netWorked > 240) {
      netWorked -= 45;
      if (minsEmpresa > 240) minsEmpresa -= 45;
      else if (minsCampo > 240) minsCampo -= 45;
    }

    const ultSalReg = [...regsDia].reverse().find(r => String(r.tipo || r.tipo_salida || '').toUpperCase().includes('SALIDA'));
    if (ultSalReg) {
      const mS = obtenerMinutos(ultSalReg.hora || ultSalReg.timestamp);
      if (mS !== null) ultimoSalidaMins = mS;
    }
    let minsSalidaTemprana = 0;
    const refSalida = esFestivo ? 975 : HORA_SALIDA_REF;
    if (!esFestivo && !esPasanteDet && ultimoSalidaMins !== null && ultimoSalidaMins < refSalida) minsSalidaTemprana = refSalida - ultimoSalidaMins;

    // Horas extra independientes (no compensan faltantes)
    let autorizadoGlobal = regsDia.some(r => r.horasExtra === 'SI') || regsDia.some(r => (r.autoriza || '').includes('CAMPO'));
    if (esFestivo && netWorked > 60) autorizadoGlobal = true;
    else if (!esFestivo && netWorked >= 600) autorizadoGlobal = true;
    const extrasCampo = regsDia.some(r => (r.autoriza || '').includes('CAMPO'));

    let extraMins50Acum = 0;
    periodosDia.forEach(p => {
      if (!p.entrada || !p.salida) return;
      const mE = obtenerMinutos(p.entrada.hora || p.entrada.timestamp);
      const mS = obtenerMinutos(p.salida.hora || p.salida.timestamp);
      if (mE === null || mS === null || mS <= mE) return;
      const duracion = mS - mE;
      const enCampo = p.entrada.modo === 'CAMPO' || p.salida.modo === 'CAMPO';
      if (esFestivo) {
        if (enCampo) { if (autorizadoGlobal) hC100 += duracion; }
        else if (autorizadoGlobal) h100 += duracion;
      } else {
        const H_INI = HORA_ENTRADA_REF, H_FIN = HORA_SALIDA_REF;
        if (enCampo) {
          if (mS <= H_INI || mE >= H_FIN) hC50 += duracion;
          else {
            const mNormal = Math.min(mS, H_FIN) - Math.max(mE, H_INI);
            hC50 += duracion - mNormal;
          }
        } else if (autorizadoGlobal && mS > H_FIN) {
          extraMins50Acum += (mS - Math.max(mE, H_FIN));
        }
      }
    });
    if (!esFestivo) h50 = extraMins50Acum;

    const tpd = tiemposPermiso(regsDia);
    tiempoPersonal += tpd.pers;
    tiempoMedico += tpd.med;
    const tiempoJustificado = tpd.just;

    const esPrevioAlRegistro = Boolean(d.previoAlRegistro);
    const esHoyOFuturo = f >= getLocalHoyStr();
    const netWorkedOrdinario = calcularNetWorkedOrdinario(periodosDia, esFestivo);
    if ((isJustificado && !tieneAsistencia) || esHoyOFuturo || esPrevioAlRegistro || esPasanteDet) {
      tiempoPorJustificar = esPasanteDet ? (periodosDia.some(p => p.entrada && !p.salida) ? 60 : 0) : 0;
    } else {
      const missingMinutes = esFestivo ? 0 : Math.max(0, 480 - netWorkedOrdinario);
      const totalPermisosHoy = tiempoPersonal + tiempoMedico + tiempoPorJustificar;
      tiempoPorJustificar += Math.max(0, missingMinutes - totalPermisosHoy);
      tiempoPorJustificar = Math.max(0, tiempoPorJustificar - tiempoJustificado);
    }

    const missingMinutesDia = esFestivo ? 0 : Math.max(0, 480 - netWorkedOrdinario);
    if (!esFestivo && (atrasoMins + minsSalidaTemprana) > missingMinutesDia) atrasoMins = Math.max(0, missingMinutesDia - minsSalidaTemprana);

    const originalAtrasoMins = atrasoMins;
    const originalSalidaTemprana = minsSalidaTemprana;
    if (esPasanteDet) {
      atrasoMins = 0;
      minsSalidaTemprana = 0;
    } else {
      const tieneJustifEntradaTardia = regsDia.some(r => r.razon_entrada_tardia && !['—', '-', ''].includes(String(r.razon_entrada_tardia).trim()));
      const permisosTotales = tiempoPersonal + tiempoMedico + tiempoJustificado;
      atrasoMins = tieneJustifEntradaTardia ? 0 : Math.max(0, originalAtrasoMins - permisosTotales);
      const tieneJustifSalidaTemprana = regsDia.some(r => r.razon_salida_temprana && !['—', '-', ''].includes(String(r.razon_salida_temprana).trim()));
      if (tieneJustifSalidaTemprana) minsSalidaTemprana = 0;
      else {
        const permisosRestantes = Math.max(0, permisosTotales - (tieneJustifEntradaTardia ? 0 : originalAtrasoMins));
        minsSalidaTemprana = Math.max(0, originalSalidaTemprana - permisosRestantes);
      }
    }

    const infoBeneficio = mapBeneficioPorDia[f];
    if (infoBeneficio && infoBeneficio.tjNeto !== undefined) tiempoPorJustificar = infoBeneficio.tjNeto;
    const descuentoDia = infoBeneficio ? infoBeneficio.descuentoNeto
      : (tiempoPersonal + (tiempoPorJustificar > 0 ? Math.max(tiempoPorJustificar, atrasoMins) : atrasoMins));

    const todosRegsConModo = regsDia.filter(r => r.modo);
    const tieneCampo = todosRegsConModo.some(r => r.modo === 'CAMPO');
    const tieneEmpresa = todosRegsConModo.some(r => r.modo === 'EMPRESA' || r.modo === 'OFICINA');
    const modActual = tieneCampo && tieneEmpresa ? 'MIXTO' : tieneCampo ? 'CAMPO' : 'EMPRESA';

    tot.tp += tiempoPersonal;
    tot.tm += tiempoMedico;
    tot.tJustificado += tiempoJustificado;
    tot.tj += tiempoPorJustificar;
    tot.descuentoBruto += infoBeneficio ? infoBeneficio.rawDescuento : descuentoDia;
    tot.descuentoNeto += descuentoDia;
    tot.horas += netWorked;
    tot.atrasos += atrasoMins;
    tot.extra50 += h50 + hC50;
    tot.extra100 += h100 + hC100;

    // Fechas por regularizar (R-10), sin hoy, justificados, campo ni días previos al registro
    const esDiaLaboralOrdinario = dayOfWeek !== 0 && dayOfWeek !== 6 && !esFestivo;
    const faltaMarcacionEntrada = periodosDia.some(p => !p.entrada && p.salida);
    const faltaMarcacionSalida = periodosDia.some(p => p.entrada && !p.salida);
    const esFaltaSinJustificar = esFalta && !isJustificado && !esCampoHoy && !esPrevioAlRegistro;
    if (esDiaLaboralOrdinario && f < hoyStrLocal && !esPrevioAlRegistro && !isJustificado && !esCampoHoy) {
      const fParts = f.split('-');
      const fFmt = fParts.length === 3 ? `${fParts[2]}/${fParts[1]}` : f;
      if (esFaltaSinJustificar) fechasARegularizar.push({ fecha: f, label: fFmt, motivo: 'Inasistencia', tipo: 'ausencia' });
      else if (esPasanteDet) {
        if (faltaMarcacionSalida) fechasARegularizar.push({ fecha: f, label: fFmt, motivo: 'Sin Salida', tipo: 'incompleto', minutos: 0 });
        else if (faltaMarcacionEntrada) fechasARegularizar.push({ fecha: f, label: fFmt, motivo: 'Sin Entrada', tipo: 'incompleto', minutos: 0 });
      } else if (tiempoPorJustificar > 60) {
        let motivoTexto = 'Tiempo por justificar';
        let tipoTexto = 'tiempo';
        if (faltaMarcacionSalida && netWorkedOrdinario < 240) { motivoTexto = 'Sin Salida'; tipoTexto = 'incompleto'; }
        else if (faltaMarcacionEntrada && netWorkedOrdinario < 240) { motivoTexto = 'Sin Entrada'; tipoTexto = 'incompleto'; }
        fechasARegularizar.push({ fecha: f, label: fFmt, motivo: motivoTexto, tipo: tipoTexto, minutos: tiempoPorJustificar });
      }
    }

    const base: FilaDetalle = {
      fecha: f, dayOfWeek, esFestivo, tipoFila: 'normal', regsDia, periodos: periodosDia, almuerzo: d.almuerzo, esFalta,
      tieneAsistencia, netWorked, atrasoMins, minsSalidaTemprana, tiempoJustificado, tiempoPersonal, tiempoMedico,
      tiempoPorJustificar, razonTextoFinal, razonAusenciaVal, razonJustificadaVal, descuentoDia, h50, h100, hC50, hC100,
      autorizadoGlobal, extrasCampo, modActual,
    };

    if (esPrevioAlRegistro) {
      return { ...base, tipoFila: 'previo', razonMostrar: 'Usuario recién registrado', descMostrar: 'Previo al inicio/registro de labores del colaborador',
        icon: '👤', cardBg: 'rgba(100, 116, 139, 0.04)', cardBorder: '#cbd5e1', badgeBg: '#f1f5f9', badgeColor: '#475569' };
    }

    const esAusenciaTipo = (tipo: unknown) => !esMarcacionOrdinaria(tipo);
    const esAusenciaEspecial = !tieneAsistencia && (
      esFalta ||
      ['Vacación', 'Vacacion', 'Vacaciones', 'Permiso Médico', 'Permiso Personal', 'Salida Justificada', 'Calamidad Doméstica', 'Feriado', 'Inasistencia', 'Salida a Campo']
        .some(k => (razonAusenciaVal || '').toLowerCase().includes(k.toLowerCase()) || (razonJustificadaVal || '').toLowerCase().includes(k.toLowerCase())) ||
      Boolean(d.faltaInasistencia) ||
      regsDia.some(r => r.justificado === 'SI' || (r.tipo && esAusenciaTipo(r.tipo)))
    );
    if (esAusenciaEspecial) {
      const razonMostrar = razonAusenciaVal || razonJustificadaVal || (d.faltaInasistencia ? 'Inasistencia Injustificada' : 'Ausencia');
      const descMostrar = (razonJustificadaVal && razonJustificadaVal !== razonMostrar)
        ? razonJustificadaVal
        : (d.faltaInasistencia ? 'Sin registro de asistencia en día laborable' : 'Día completo sin marcaciones registradas');
      let cardBg = 'rgba(79, 70, 229, 0.04)', cardBorder = '#c7d2fe', badgeBg = '#e0e7ff', badgeColor = '#312e81', icon = '📋';
      const rLower = razonMostrar.toLowerCase();
      if (rLower.includes('vacac')) { icon = '🏖️'; cardBg = 'rgba(13, 148, 136, 0.04)'; cardBorder = '#99f6e4'; badgeBg = '#ccfbf1'; badgeColor = '#0f766e'; }
      else if (rLower.includes('medico')) { icon = '🩺'; cardBg = 'rgba(2, 132, 199, 0.04)'; cardBorder = '#bae6fd'; badgeBg = '#e0f2fe'; badgeColor = '#0369a1'; }
      else if (rLower.includes('personal')) { icon = '👤'; cardBg = 'rgba(147, 51, 234, 0.04)'; cardBorder = '#e9d5ff'; badgeBg = '#f3e8ff'; badgeColor = '#6b21a8'; }
      else if (rLower.includes('campo')) { icon = '🚗'; cardBg = 'rgba(8, 145, 178, 0.04)'; cardBorder = '#a5f3fc'; badgeBg = '#ecfeff'; badgeColor = '#0891b2'; }
      else if (rLower.includes('feriado')) { icon = '🏛️'; cardBg = 'rgba(99, 102, 241, 0.04)'; cardBorder = '#c7d2fe'; badgeBg = '#e0e7ff'; badgeColor = '#4338ca'; }
      else if (rLower.includes('calamidad')) { icon = '🏠'; cardBg = 'rgba(217, 119, 6, 0.04)'; cardBorder = '#fde68a'; badgeBg = '#fef3c7'; badgeColor = '#92400e'; }
      else if (rLower.includes('inasistencia') || rLower.includes('falta')) { icon = '❌'; cardBg = 'rgba(225, 29, 72, 0.04)'; cardBorder = '#fecdd3'; badgeBg = '#ffe4e6'; badgeColor = '#be123c'; }
      return { ...base, tipoFila: 'ausencia', razonMostrar, descMostrar, icon, cardBg, cardBorder, badgeBg, badgeColor };
    }
    return base;
  });

  return { filas, fechasARegularizar, tot };
}

// Métricas de cabecera del detalle (días trabajados, puntualidad, promedios, almuerzos)
export function resumenDetalle(e: Emp, regs: Reg[], R_INI: string, R_FIN: string) {
  const entT = regs.filter(r => r.tipo === 'ENTRADA').length;
  const salT = regs.filter(r => r.tipo === 'SALIDA').length;
  const { almPlanta, almFuera } = calcularAlmuerzosPeriodo(e, R_INI, R_FIN);
  const dias = new Set(regs.filter(r => r.tipo === 'ENTRADA').map(r => r.fecha)).size;
  let sE = 0, cE = 0, sS = 0, cS = 0, tardT = 0;
  regs.forEach(r => {
    const m = obtenerMinutos(r.hora);
    if (m === null) return;
    if (r.tipo === 'ENTRADA') {
      sE += m; cE++;
      const esFestivo = esFeriadoODomingo(r.fecha) || diaSemana(r.fecha!) === 6;
      const refEnt = esFestivo ? 420 : HORA_ENTRADA_REF;
      if (m > refEnt + 5) tardT++;
    } else { sS += m; cS++; }
  });
  return { entT, salT, almP: almPlanta, almF: almFuera, dias, tardT, pE: cE ? Math.round(sE / cE) : null, pS: cS ? Math.round(sS / cS) : null };
}
