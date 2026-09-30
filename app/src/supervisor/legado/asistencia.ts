// Reglas de asistencia del panel portadas 1:1 de JS/supervisor_core.js:
// obtenerFechasPendientesRegularizarEmpleado (R-10) y obtenerInfoAusenciaPermisoHoy.
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Emp, Periodo, Reg, calcularNetWorkedOrdinario, clasificarGap, diaSemana, esEmpleadoPasante, esFeriadoODomingo,
  getLocalHoyStr, normalizarFechaStr, obtenerFechaInicioEfectivaEmpleado, obtenerMinutos, sumarDias,
} from './util';

export interface FechaRegularizar { fecha: string; label: string; motivo: string; tipo: string; minutos?: number }

export function obtenerFechasPendientesRegularizarEmpleado(emp: Emp, inicioP: string, finP: string): FechaRegularizar[] {
  if (!emp || emp.isVisitante || (emp.cargo || '').toUpperCase() === 'SIN ASISTENCIA') return [];
  const hoyStrLocal = getLocalHoyStr();
  let inicio = inicioP;
  const fin = finP;

  const fInicioEmp = obtenerFechaInicioEfectivaEmpleado(emp, inicio);
  if (fInicioEmp && fInicioEmp > inicio) inicio = fInicioEmp;

  const porDia: Record<string, Reg[]> = {};
  (emp.registros || []).forEach(r => {
    const f = normalizarFechaStr(r.fecha);
    if (!f || f < inicio || f > fin) return;
    (porDia[f] ||= []).push(r);
  });

  const fechasRango: string[] = [];
  for (let f = inicio; f <= fin; f = sumarDias(f, 1)) {
    if (f < hoyStrLocal) fechasRango.push(f);
  }

  const fechasPendientes: FechaRegularizar[] = [];
  let saldoBeneficio4h = esEmpleadoPasante(emp) ? 0 : 240;

  fechasRango.forEach(f => {
    const dayOfWeek = diaSemana(f);
    const esFestivo = esFeriadoODomingo(f);
    const esDiaLaboralOrdinario = (dayOfWeek !== 0 && dayOfWeek !== 6 && !esFestivo);
    if (!esDiaLaboralOrdinario) return;

    const regsDia = porDia[f] || [];

    const esCampoHoy = regsDia.some(r => {
      const t = String(r.tipo || r.tipo_salida || '').toUpperCase();
      const modo = String(r.modo || r.modo_trabajo || '').toUpperCase();
      const razAus = String(r.razon_ausencia || '').toUpperCase();
      const razPerm = String(r.razon_permiso || '').toUpperCase();
      const razJust = String(r.razon_justificac || '').toUpperCase();
      const razSal = String(r.razon_salida || r.razon_salida_temprana || '').toUpperCase();
      const obs = String(r.observacion || r.comentario || '').toUpperCase();
      const est = String(r.estado || '').toUpperCase();
      return `${t} ${modo} ${razAus} ${razPerm} ${razJust} ${razSal} ${obs} ${est}`.includes('CAMPO');
    });

    const esEmpEnVacaciones = (emp.estado || '').toUpperCase() === 'VACACIONES';
    const esJustificadoHoy = esEmpEnVacaciones || regsDia.some(r => {
      const t = String(r.tipo || r.tipo_salida || '').toUpperCase();
      const just = String(r.justificado || r.justificada || '').toUpperCase();
      const razAus = String(r.razon_ausencia || '').toUpperCase();
      const razPerm = String(r.razon_permiso || '').toUpperCase();
      const razJust = String(r.razon_justificac || '').toUpperCase();
      const razSal = String(r.razon_salida || r.razon_salida_temprana || '').toUpperCase();
      const obs = String(r.observacion || r.comentario || '').toUpperCase();
      const allText = `${t} ${just} ${razAus} ${razPerm} ${razJust} ${razSal} ${obs}`;
      if (just === 'SI' || r.justificado === true || r.justificada === true) return true;
      if (t === 'FALTA_JUSTIFICADA' || t === 'SALIDA_JUSTIFICADA' || t.includes('JUSTIFIC')) return true;
      if (t.includes('VACAC') || t.includes('MEDIC') || t.includes('CALAMIDAD') || t.includes('CUMPLE') || t.includes('PERSONAL')) return true;
      if (allText.includes('JUSTIFIC') || allText.includes('VACAC') || allText.includes('MEDIC') || allText.includes('CALAMIDAD') || allText.includes('CUMPLE') || allText.includes('PERSONAL')) return true;
      if (razAus && !['—', '-', '', 'INASISTENCIA', 'FALTA INJUSTIFICADA', 'INJUSTIFICADA'].includes(razAus)) return true;
      if (razPerm && !['—', '-', '', 'INASISTENCIA', 'FALTA INJUSTIFICADA', 'INJUSTIFICADA'].includes(razPerm)) return true;
      return false;
    });

    if (esCampoHoy || esJustificadoHoy) return;

    const periodosDia: Periodo[] = [];
    let curEntrada: Reg | null = null;
    let tieneMarcacionReal = false;
    const isJustificado = false;

    const regsOrd = [...regsDia].sort((a, b) => {
      const ha = a.hora || (a.timestamp ? String(a.timestamp).substring(11, 19) : '');
      const hb = b.hora || (b.timestamp ? String(b.timestamp).substring(11, 19) : '');
      return ha.localeCompare(hb);
    });

    regsOrd.forEach(r => {
      const t = String(r.tipo || '').toUpperCase();
      const tSal = String(r.tipo_salida || '').toUpperCase();
      const rSal = String(r.razon_salida || '').toLowerCase();
      if (t === 'ENTRADA' || t === 'CAMPO' || t === 'ENTRADA_CAMPO' || t === 'TRABAJO_DE_CAMPO') {
        tieneMarcacionReal = true;
        if (curEntrada) periodosDia.push({ entrada: curEntrada, salida: null });
        curEntrada = r;
      } else if (t === 'SALIDA' || t === 'RETORNO_CAMPO' || t === 'SALIDA_PASANTE' || tSal === 'SALIDA_PASANTE' || rSal === 'salida_pasante') {
        tieneMarcacionReal = true;
        if (curEntrada) { periodosDia.push({ entrada: curEntrada, salida: r }); curEntrada = null; }
        else periodosDia.push({ entrada: null, salida: r });
      }
    });
    if (curEntrada) periodosDia.push({ entrada: curEntrada, salida: null });

    const esPasante = esEmpleadoPasante(emp);
    const esFalta = !tieneMarcacionReal && !isJustificado;
    const faltaMarcacionEntrada = periodosDia.some(p => !p.entrada && p.salida);
    const faltaMarcacionSalida = periodosDia.some(p => p.entrada && !p.salida);
    const fParts = f.split('-');
    const fFmt = fParts.length === 3 ? `${fParts[2]}/${fParts[1]}` : f;

    if (esFalta) { fechasPendientes.push({ fecha: f, label: fFmt, motivo: 'Inasistencia', tipo: 'ausencia' }); return; }

    if (esPasante) {
      if (faltaMarcacionSalida) fechasPendientes.push({ fecha: f, label: fFmt, motivo: 'Sin Salida', tipo: 'incompleto', minutos: 0 });
      else if (faltaMarcacionEntrada) fechasPendientes.push({ fecha: f, label: fFmt, motivo: 'Sin Entrada', tipo: 'incompleto', minutos: 0 });
      return;
    }

    let minutosTrabajadosHoy = 0;
    let ultimoSalidaMins: number | null = null;
    let tiempoMedico = 0;
    let tiempoPersonal = 0;
    let processedLunchGap = false;
    periodosDia.forEach(p => {
      if (!p.entrada || !p.salida) return;
      const mE = obtenerMinutos(p.entrada.hora || p.entrada.timestamp);
      const mS = obtenerMinutos(p.salida.hora || p.salida.timestamp);
      if (mE === null || mS === null || mS <= mE) return;
      minutosTrabajadosHoy += mS - mE;
      if (ultimoSalidaMins !== null && mE > ultimoSalidaMins) {
        let gap = mE - ultimoSalidaMins;
        if (!processedLunchGap && ultimoSalidaMins >= 690 && ultimoSalidaMins <= 870) {
          gap -= Math.min(45, gap);
          processedLunchGap = true;
        }
        if (gap > 0) {
          const clasif = clasificarGap(p.salida, gap);
          if (clasif.tipo === 'medico') tiempoMedico += gap;
          else if (clasif.tipo === 'personal') tiempoPersonal += gap;
        }
      }
      ultimoSalidaMins = mS;
    });

    let tiempoJustificado = 0;
    const regPermiso = regsOrd.find(r => r.tipo === 'ENTRADA') || regsOrd.find(r => r.tiempo_justificado_mins || r.permiso_personal_mins || r.permiso_medico_mins) || regsOrd[0];
    if (regPermiso) {
      tiempoPersonal += Number(regPermiso.permiso_personal_mins || 0);
      tiempoMedico += Number(regPermiso.permiso_medico_mins || 0);
      tiempoJustificado += Number(regPermiso.tiempo_justificado_mins || 0);
    }

    const netWorkedOrdinario = calcularNetWorkedOrdinario(periodosDia, false);
    const missingMinutes = Math.max(0, 480 - netWorkedOrdinario);
    const totalPermisosHoy = tiempoPersonal + tiempoMedico;
    const unaccountedMissing = Math.max(0, missingMinutes - totalPermisosHoy);
    let tj = Math.max(0, unaccountedMissing - tiempoJustificado);
    if (saldoBeneficio4h > 0 && tj > 0) {
      const consumo4h = Math.min(saldoBeneficio4h, tj);
      saldoBeneficio4h -= consumo4h;
      tj = Math.max(0, tj - consumo4h);
    }
    if (tj > 60) {
      let motivoTexto = 'Tiempo por justificar';
      let tipoTexto = 'tiempo';
      if (faltaMarcacionSalida && netWorkedOrdinario < 240) { motivoTexto = 'Sin Salida'; tipoTexto = 'incompleto'; }
      else if (faltaMarcacionEntrada && netWorkedOrdinario < 240) { motivoTexto = 'Sin Entrada'; tipoTexto = 'incompleto'; }
      fechasPendientes.push({ fecha: f, label: fFmt, motivo: motivoTexto, tipo: tipoTexto, minutos: tj });
    }
  });

  return fechasPendientes.filter(x => x && x.fecha >= inicio && x.fecha <= fin).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export interface InfoAusencia {
  esVacaciones: boolean; esCampo: boolean; esPermiso: boolean; razon: string; tipo: string; minutos: number;
  icono: string; textoBadge: string; esSalidaConPermiso?: boolean
}

const VACIA: InfoAusencia = { esVacaciones: false, esCampo: false, esPermiso: false, razon: '', tipo: '', minutos: 0, icono: '', textoBadge: '' };
const TIPOS_PERMISO = ['PERMISO', 'PERMISO_MEDICO', 'PERMISO_PERSONAL', 'FALTA_JUSTIFICADA', 'CALAMIDAD_DOMESTICA', 'SALIDA_JUSTIFICADA', 'CUMPLEAÑOS', 'CUMPLEANOS'];

// Vacaciones, permiso o campo de un colaborador en una fecha (obtenerInfoAusenciaPermisoHoy)
export function obtenerInfoAusenciaPermisoHoy(e: Emp, fTarget: string): InfoAusencia {
  const isSinAsis = (e.cargo || '').toUpperCase() === 'SIN ASISTENCIA';
  if (isSinAsis || e.isVisitante) return { ...VACIA };

  const regs = (e.registros || []).filter(r => r.fecha === fTarget);
  const eReg = regs.find(r => r.tipo === 'ENTRADA');
  const sReg = regs.find(r => (r.tipo === 'SALIDA' || r.tipo === 'SALIDA_PASANTE' || r.tipo_salida === 'SALIDA_PASANTE' || r.razon_salida === 'salida_pasante'));

  const estUpper = String(e.estado || '').toUpperCase();
  const razonEmpUpper = String(e.razon_ausencia || e.razon_permiso || e._razonAusenciaHoy || '').toUpperCase();
  const regVac = regs.find(r => {
    const t = String(r.tipo || '').toUpperCase();
    const te = String(r.tipo_estado || '').toUpperCase();
    const ra = String(r.razon_ausencia || '').toUpperCase();
    const rp = String(r.razon_permiso || '').toUpperCase();
    return t.includes('VACAC') || te.includes('VACAC') || ra.includes('VACAC') || rp.includes('VACAC');
  });
  if (estUpper.includes('VACAC') || razonEmpUpper.includes('VACAC') || !!regVac) {
    return { esVacaciones: true, esCampo: false, esPermiso: false, razon: 'Vacación', tipo: 'VACACIONES', minutos: 0, icono: '🏖️', textoBadge: 'Vacación' };
  }

  let razonDetectada = '';
  let tipoDetectado = '';
  let minutos = 0;
  let esSalidaConPermiso = false;
  let tieneRegistroPermisoDirecto = false;

  for (const r of regs) {
    const t = String(r.tipo || '').toUpperCase();
    const te = String(r.tipo_estado || '').toUpperCase();
    const ts = String(r.tipo_salida || '').toUpperCase();
    const tent = String(r.tipo_entrada || '').toUpperCase();
    const ra = String(r.razon_ausencia || '').trim();
    const rp = String(r.razon_permiso || '').trim();
    const rsal = String(r.razon_salida || r.razon_salida_temprana || '').trim();
    const rent = String(r.razon_entrada_tardia || '').trim();
    const persMins = Number(r.permiso_personal_mins || 0);
    const medMins = Number(r.permiso_medico_mins || 0);
    const justMins = Number(r.tiempo_justificado_mins || 0);
    if (persMins > 0) minutos += persMins;
    if (medMins > 0) minutos += medMins;
    if (justMins > 0) minutos += justMins;

    if (TIPOS_PERMISO.includes(t) || TIPOS_PERMISO.includes(te)) {
      tieneRegistroPermisoDirecto = true;
      tipoDetectado = tipoDetectado || te || t;
      razonDetectada = razonDetectada || ra || rp || te || t;
    }
    if (t === 'ESTADO' && (ra || rp || te)) {
      const combEstado = `${te} ${ra} ${rp}`.toUpperCase();
      if (!combEstado.includes('CAMPO') && !combEstado.includes('VACAC')) {
        tieneRegistroPermisoDirecto = true;
        tipoDetectado = tipoDetectado || te || 'ESTADO';
        razonDetectada = razonDetectada || ra || rp || te;
      }
    }
    if (t !== 'ENTRADA' && t !== 'SALIDA' && t !== 'SOLO_ALMUERZO') {
      const combRa = `${t} ${ra} ${rp}`.toUpperCase();
      if (!combRa.includes('CAMPO') && !combRa.includes('VACAC')) {
        if (ra) { tieneRegistroPermisoDirecto = true; razonDetectada = razonDetectada || ra; tipoDetectado = tipoDetectado || t; }
        if (rp) { tieneRegistroPermisoDirecto = true; razonDetectada = razonDetectada || rp; }
      }
    }
    if (t === 'SALIDA' || ts) {
      if (ts.includes('PERMIS') || ['permiso_medico', 'cumpleanos', 'permiso_personal', 'salida_justificada'].includes(rsal.toLowerCase()) || rsal.toLowerCase().includes('permiso')) {
        esSalidaConPermiso = true;
        tipoDetectado = tipoDetectado || 'SALIDA_CON_PERMISO';
        razonDetectada = razonDetectada || rsal || rp || 'Salida con Permiso';
      }
      if (rp && !rp.toUpperCase().includes('CAMPO') && !rp.toUpperCase().includes('VACAC')) razonDetectada = razonDetectada || rp;
    }
    if (t === 'ENTRADA' || tent) {
      if (tent.includes('PERMIS') || rent.toLowerCase().includes('permiso')) {
        tipoDetectado = tipoDetectado || 'ENTRADA_CON_PERMISO';
        razonDetectada = razonDetectada || rent || rp || 'Entrada con Permiso';
      }
      if (rp && !rp.toUpperCase().includes('CAMPO') && !rp.toUpperCase().includes('VACAC')) razonDetectada = razonDetectada || rp;
    }
  }

  const ePersMins = Number(e.permiso_personal_mins || 0);
  const eMedMins = Number(e.permiso_medico_mins || 0);
  if (ePersMins > 0) minutos += ePersMins;
  if (eMedMins > 0) minutos += eMedMins;

  const esEstadoPermiso = TIPOS_PERMISO.includes(estUpper) || (estUpper.includes('PERMIS') && !estUpper.includes('CAMPO'));
  if (esEstadoPermiso) { tipoDetectado = tipoDetectado || estUpper; razonDetectada = razonDetectada || e.estado; }
  for (const v of [e.razon_permiso, e.razon_ausencia, e._razonAusenciaHoy]) {
    if (v && String(v).trim() && !String(v).toUpperCase().includes('CAMPO') && !String(v).toUpperCase().includes('VACAC')) {
      razonDetectada = razonDetectada || String(v).trim();
    }
  }

  const esPermiso = (minutos > 0) || esSalidaConPermiso || esEstadoPermiso || tieneRegistroPermisoDirecto || Boolean(razonDetectada);
  if (esPermiso) {
    const combinada = `${tipoDetectado} ${razonDetectada}`.toUpperCase();
    let icono = '📋';
    let textoBadge = razonDetectada || 'Permiso';
    if (combinada.includes('MEDIC') || combinada.includes('SALUD') || combinada.includes('DOCTOR')) {
      icono = '🩺';
      if (!razonDetectada || razonDetectada.toUpperCase() === 'PERMISO_MEDICO' || razonDetectada === 'permiso_medico') textoBadge = 'Permiso Médico';
    } else if (combinada.includes('PERSONAL')) {
      icono = '👤';
      if (!razonDetectada || razonDetectada.toUpperCase() === 'PERMISO_PERSONAL' || razonDetectada === 'permiso_personal') textoBadge = 'Permiso Personal';
    } else if (combinada.includes('JUSTIFIC')) {
      icono = '✅';
      if (!razonDetectada || razonDetectada.toUpperCase() === 'FALTA_JUSTIFICADA' || razonDetectada === 'salida_justificada') textoBadge = 'Falta Justificada';
    } else if (combinada.includes('CALAMIDAD') || combinada.includes('DOMESTICA')) {
      icono = '🏠';
      if (!razonDetectada || razonDetectada.toUpperCase() === 'CALAMIDAD_DOMESTICA') textoBadge = 'Calamidad Doméstica';
    } else if (combinada.includes('CUMPLEA')) {
      icono = '🎂';
      if (!razonDetectada || razonDetectada.toUpperCase().includes('CUMPLEA') || razonDetectada === 'cumpleanos') textoBadge = 'Cumpleaños';
    }
    if (minutos > 0 && !textoBadge.includes(`${minutos}m`) && !textoBadge.includes(`${minutos} min`)) textoBadge = `${textoBadge} (${minutos}m)`;
    return { esVacaciones: false, esCampo: false, esPermiso: true, razon: razonDetectada || textoBadge, tipo: tipoDetectado || 'PERMISO', minutos, esSalidaConPermiso, icono, textoBadge };
  }

  const modoEmpUpper = String(e.modo || '').toUpperCase();
  const modoRegUpper = String(eReg?.modo || sReg?.modo || '').toUpperCase();
  const regCampo = regs.find(r => {
    const m = String(r.modo || '').toUpperCase();
    const t = String(r.tipo || '').toUpperCase();
    const ts = String(r.tipo_salida || '').toUpperCase();
    const ra = String(r.razon_ausencia || '').toUpperCase();
    return m.includes('CAMPO') || t.includes('CAMPO') || ts.includes('CAMPO') || ra.includes('CAMPO');
  });
  if (modoEmpUpper.includes('CAMPO') || modoRegUpper.includes('CAMPO') || razonEmpUpper.includes('CAMPO') || !!regCampo) {
    return { esVacaciones: false, esCampo: true, esPermiso: false, razon: 'Campo', tipo: 'CAMPO', minutos: 0, icono: '🚗', textoBadge: 'Campo' };
  }
  return { ...VACIA };
}

export function esCumpleanosEmpleadoEnFecha(emp: any, fechaStr: string): boolean {
  if (!emp || !fechaStr) return false;
  const rawN = emp.fechaNacimiento || emp.fecha_nacimiento || '';
  if (!rawN) return false;
  const pNac = normalizarFechaStr(rawN).split('-');
  const pFecha = normalizarFechaStr(fechaStr).split('-');
  if (pNac.length < 3 || pFecha.length < 3) return false;
  return parseInt(pNac[1], 10) === parseInt(pFecha[1], 10) && parseInt(pNac[2], 10) === parseInt(pFecha[2], 10);
}
