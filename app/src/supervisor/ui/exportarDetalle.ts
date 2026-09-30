// Reporte individual en Excel (exportarExcelDetalleEmpleado de supervisor_reportes_custom.js). Conserva su
// propio cálculo por día, que en el legado difiere en detalles del de la tabla de Detalle.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { descargarBlob } from '../excel';
import { marcaTiempoAhora } from '../legado/dashboard';
import {
  HORA_ENTRADA_REF, HORA_SALIDA_REF, Periodo, Reg, calcularNetWorkedOrdinario, clasificarGap, diaSemana, escapeHtml, esFeriadoODomingo,
  formatearHora, getLocalHoyStr, minutosAHHMMSS, normalizarFechaStr, obtenerMinutos,
} from '../legado/util';
import { buscarEmpleado, sup } from '../store';
import { mostrarToast } from './comun';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const esMarcacionOrdinaria = (tipo: unknown) => ['ENTRADA', 'SALIDA', 'ESTADO', 'SOLO_ALMUERZO'].includes(String(tipo).toUpperCase());
const ordenar = (a: Reg, b: Reg) => (a.timestamp && b.timestamp ? String(a.timestamp).localeCompare(String(b.timestamp)) : String(a.hora || '').localeCompare(String(b.hora || '')));

const celda = (bg: string, extra = '') => `style="background-color:${bg}; border:0.5pt solid #cbd5e1; height:26px; font-size:9pt; font-family:Consolas, monospace; text-align:center; padding:3px 6px; mso-number-format:\\@;${extra}"`;
const resaltada = (bg: string, color: string, borde: string) => `style="background-color:${bg}; color:${color}; font-weight:bold; border:0.5pt solid ${borde}; height:26px; font-size:9pt; font-family:Consolas, monospace; text-align:center; padding:3px 6px; mso-number-format:\\@;"`;
const total = (bg: string, color: string, lado: string) => `style="background-color:${bg}; color:${color}; font-weight:bold; border-left:1pt solid ${lado}; border-right:1pt solid ${lado}; border-top:0.5pt solid #cbd5e1; border-bottom:0.5pt solid #cbd5e1; height:26px; font-size:9.5pt; font-family:Consolas, monospace; text-align:center; padding:3px 6px; mso-number-format:\\@;"`;
const hms = (m: number) => (m > 0 ? minutosAHHMMSS(m) : '—');

export function exportarExcelDetalleEmpleado(empleadoId: string, indexPeriodo: number, customInicio: string | null = null, customFin: string | null = null) {
  const e = buscarEmpleado(String(empleadoId || '').trim());
  if (!e) { mostrarToast('Empleado no encontrado', 'error'); return; }
  const periodos = sup.get().periodos;
  const periodo = periodos[indexPeriodo] || periodos[0];
  if (!periodo) { mostrarToast('Periodo no encontrado', 'error'); return; }
  const R_INI = customInicio || periodo.inicio;
  const R_FIN = customFin || periodo.fin;
  const regs = (e.registros || []).map((r): Reg => ({ ...r, fecha: normalizarFechaStr(r.fecha) || r.fecha })).filter(r => r.fecha! >= R_INI && r.fecha! <= R_FIN);

  const porDia: Record<string, { registros: Reg[]; almuerzo: string | null }> = {};
  [...regs].sort(ordenar).forEach(r => {
    const f = normalizarFechaStr(r.fecha);
    if (!f) return;
    (porDia[f] ||= { registros: [], almuerzo: null }).registros.push(r);
    if (r.tipo === 'ENTRADA' && r.almuerzo) porDia[f].almuerzo = r.almuerzo;
  });
  const fechas = Object.keys(porDia).filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort((a, b) => b.localeCompare(a));

  let bodyHtml = '';
  let totTP = 0, totTM = 0, totTJ = 0, totHoras = 0, totAtrasos = 0, totSalidaTemprana = 0;
  let totH50 = 0, totH100 = 0, totHCN = 0, totHC50 = 0, totHC100 = 0, totExtra50 = 0, totExtra100 = 0, totDescuentoBruto = 0;
  const hoy = getLocalHoyStr();

  fechas.forEach((f, rowCounter) => {
    const d = porDia[f];
    const regsDia = d.registros;
    const esFestivo = esFeriadoODomingo(f) || diaSemana(f) === 6;
    const isJustificado = regsDia.some(r => {
      if (r.justificado === 'SI' || r.justificado === true || r.justificada === 'SI' || r.justificada === true) return true;
      if (r.razon_ausencia && String(r.razon_ausencia).trim() !== '' && String(r.razon_ausencia).trim() !== '—') return true;
      const tipo = String(r.tipo || r.tipo_salida || '').toUpperCase();
      return !!tipo && !['ENTRADA', 'SALIDA', 'ESTADO', 'SOLO_ALMUERZO', 'RETORNO_CAMPO', 'SALIDA_CAMPO'].includes(tipo);
    });

    const periodosDia: Periodo[] = [];
    let entradaPendiente: Reg | null = null;
    [...regsDia].sort(ordenar).forEach(r => {
      const tipo = String(r.tipo || '').toUpperCase();
      if (tipo === 'ENTRADA' || tipo === 'RETORNO_CAMPO') entradaPendiente = r;
      else if (tipo === 'SALIDA' || tipo === 'SALIDA_CAMPO') {
        periodosDia.push({ entrada: entradaPendiente, salida: r });
        entradaPendiente = null;
      }
    });
    if (entradaPendiente) periodosDia.push({ entrada: entradaPendiente, salida: null });
    if (periodosDia.length === 0) periodosDia.push({ entrada: null, salida: null });

    const horaE = periodosDia.map(p => (p.entrada ? formatearHora(p.entrada.hora || p.entrada.timestamp) : '--:--')).join(', ');
    const horaS = periodosDia.map(p => (p.salida ? formatearHora(p.salida.hora || p.salida.timestamp) : '--:--')).join(', ');
    const aBadgeVal = (d.almuerzo === 'SI' || d.almuerzo === 'PLANTA') ? 'SI' : (d.almuerzo === 'NO' || d.almuerzo === 'FUERA') ? 'NO' : '—';

    const primerReg = regsDia.find(r => r.tipo === 'ENTRADA' || r.tipo === 'RETORNO_CAMPO' || r.tipo === 'ENTRADA_CAMPO');
    let atrasoMins = 0;
    if (primerReg) {
      const mE = obtenerMinutos(primerReg.hora || primerReg.timestamp);
      const ref = esFestivo ? 420 : HORA_ENTRADA_REF;
      if (mE !== null && mE > ref + 5) atrasoMins = mE - ref;
    }

    let razonAusenciaVal = '', razonJustificadaVal = '';
    regsDia.forEach(r => {
      if (r.razon_ausencia) razonAusenciaVal = r.razon_ausencia;
      else if (r.tipo && !esMarcacionOrdinaria(r.tipo)) {
        const t = String(r.tipo).toUpperCase();
        if (t === 'VACACIONES' || t === 'VACACION') razonAusenciaVal = 'Vacación';
        else if (t === 'PERMISO_MEDICO') razonAusenciaVal = 'Permiso Médico';
        else if (t === 'PERMISO_PERSONAL') razonAusenciaVal = 'Permiso Personal';
        else if (t === 'CALAMIDAD_DOMESTICA') razonAusenciaVal = 'Calamidad Doméstica';
        else if (t === 'CUMPLEAÑOS' || t === 'CUMPLEANOS') razonAusenciaVal = 'Cumpleaños';
        else if (t === 'SALIDA_JUSTIFICADA') razonAusenciaVal = 'Salida Justificada';
      }
      if (r.razon_justificac) razonJustificadaVal = r.razon_justificac;
    });
    const razonText = razonAusenciaVal || razonJustificadaVal || '—';

    let h50 = 0, h100 = 0, hCN = 0, hC50 = 0, hC100 = 0, minutosTrabajadosHoy = 0, tiempoPersonal = 0, tiempoMedico = 0, tiempoPorJustificar = 0;
    let ultimoSalidaMins: number | null = null;
    let ultimoSalidaReg: Reg | null = null;
    let processedLunchGap = false;
    periodosDia.forEach(p => {
      if (!p.entrada || !p.salida) return;
      const mE = obtenerMinutos(p.entrada.hora || p.entrada.timestamp);
      const mS = obtenerMinutos(p.salida.hora || p.salida.timestamp);
      if (mE === null || mS === null || mS <= mE) return;
      minutosTrabajadosHoy += mS - mE;
      if (ultimoSalidaMins !== null && mE > ultimoSalidaMins) {
        let gap = mE - ultimoSalidaMins;
        if (!processedLunchGap && ultimoSalidaMins >= 690 && ultimoSalidaMins <= 870) { gap -= Math.min(45, gap); processedLunchGap = true; }
        if (gap > 0) {
          const c = clasificarGap(ultimoSalidaReg, gap);
          if (c.tipo === 'medico') tiempoMedico += gap; else if (c.tipo === 'personal') tiempoPersonal += gap; else tiempoPorJustificar += gap;
        }
      }
      ultimoSalidaMins = mS;
      ultimoSalidaReg = p.salida;
    });
    let netWorked = minutosTrabajadosHoy;
    if (!esFestivo && netWorked > 240) netWorked -= 45;

    const ultSalReg = [...regsDia].reverse().find(r => String(r.tipo || r.tipo_salida || '').toUpperCase().includes('SALIDA'));
    if (ultSalReg) { const mS = obtenerMinutos(ultSalReg.hora || ultSalReg.timestamp); if (mS !== null) ultimoSalidaMins = mS; }
    let minsSalidaTemprana = 0;
    const ultS = ultimoSalidaMins as number | null;
    if (!esFestivo && ultS !== null && ultS < HORA_SALIDA_REF) minsSalidaTemprana = HORA_SALIDA_REF - ultS;

    let autorizadoGlobal = regsDia.some(r => r.horasExtra === 'SI') || regsDia.some(r => (r.autoriza || '').includes('CAMPO'));
    if (esFestivo && netWorked > 60) autorizadoGlobal = true;
    else if (!esFestivo && netWorked >= 600) autorizadoGlobal = true;

    periodosDia.forEach(p => {
      if (!p.entrada || !p.salida) return;
      const mE = obtenerMinutos(p.entrada.hora || p.entrada.timestamp);
      const mS = obtenerMinutos(p.salida.hora || p.salida.timestamp);
      if (mE === null || mS === null || mS <= mE) return;
      const duracion = mS - mE;
      const enCampo = p.entrada.modo === 'CAMPO' || p.salida.modo === 'CAMPO';
      if (esFestivo) { if (enCampo) { if (autorizadoGlobal) hC100 += duracion; } else if (autorizadoGlobal) h100 += duracion; }
      else if (enCampo) {
        if (mS <= HORA_ENTRADA_REF || mE >= HORA_SALIDA_REF) hC50 += duracion;
        else { const mNormal = Math.min(mS, HORA_SALIDA_REF) - Math.max(mE, HORA_ENTRADA_REF); hCN += mNormal; hC50 += duracion - mNormal; }
      } else if (autorizadoGlobal && mS > HORA_SALIDA_REF) h50 += mS - Math.max(mE, HORA_SALIDA_REF);
    });

    const regPermiso = regsDia.find(r => r.tipo === 'ENTRADA') || regsDia.find(r => r.tiempo_justificado_mins || r.permiso_personal_mins || r.permiso_medico_mins) || regsDia[0];
    let tiempoJustificado = regPermiso ? Number(regPermiso.tiempo_justificado_mins || 0) : 0;
    const hasCumpleanos = regsDia.some(r => {
      const raz = String(r.razon_ausencia || '').toLowerCase();
      const tip = String(r.tipo || r.tipo_salida || '').toUpperCase();
      return raz.includes('cumplea') || raz.includes('cumplean') || tip.includes('CUMPLE');
    });
    if (hasCumpleanos) tiempoJustificado += 240;

    if (isJustificado || f >= hoy) tiempoPorJustificar = 0;
    else {
      tiempoPersonal += regPermiso?.permiso_personal_mins ? Number(regPermiso.permiso_personal_mins) : 0;
      tiempoMedico += regPermiso?.permiso_medico_mins ? Number(regPermiso.permiso_medico_mins) : 0;
      const missing = esFestivo ? 0 : Math.max(0, 480 - calcularNetWorkedOrdinario(periodosDia, esFestivo));
      tiempoPorJustificar += Math.max(0, missing - (tiempoPersonal + tiempoMedico + tiempoJustificado + tiempoPorJustificar));
    }
    const missingDia = esFestivo ? 0 : Math.max(0, 480 - calcularNetWorkedOrdinario(periodosDia, esFestivo));
    if (!esFestivo && (atrasoMins + minsSalidaTemprana) > missingDia) atrasoMins = Math.max(0, missingDia - minsSalidaTemprana);
    const atrasoOriginal = atrasoMins, salidaOriginal = minsSalidaTemprana;
    if (isJustificado) { atrasoMins = 0; minsSalidaTemprana = 0; }
    else {
      const permisos = tiempoPersonal + tiempoMedico + tiempoJustificado;
      atrasoMins = Math.max(0, atrasoOriginal - permisos);
      minsSalidaTemprana = Math.max(0, salidaOriginal - Math.max(0, permisos - atrasoOriginal));
    }
    const descuentoDia = tiempoPersonal + (tiempoPorJustificar > 0 ? Math.max(tiempoPorJustificar, atrasoMins) : atrasoMins);
    totDescuentoBruto += descuentoDia;
    totTP += tiempoPersonal; totTM += tiempoMedico; totTJ += tiempoPorJustificar; totHoras += netWorked; totAtrasos += atrasoMins;
    totSalidaTemprana += minsSalidaTemprana; totH50 += h50; totH100 += h100; totHCN += hCN; totHC50 += hC50; totHC100 += hC100;
    totExtra50 += h50 + hC50; totExtra100 += h100 + hC100;

    const fechaEx = `${DIAS[diaSemana(f)]} ${f.slice(8, 10)}/${f.slice(5, 7)}`;
    const rowBg = rowCounter % 2 === 0 ? '#ffffff' : '#f8fafc';
    const tdTime = celda(rowBg);
    bodyHtml += `<tr>
          <td style="background-color:${rowBg}; font-weight:600; color:#0f172a; text-align:center; border:0.5pt solid #cbd5e1; height:26px;">${fechaEx}</td>
          <td ${tdTime}>${horaE}</td>
          <td ${tdTime}>${horaS}</td>
          <td ${tdTime}>${hms(tiempoPersonal)}</td>
          <td ${tdTime}>${hms(tiempoMedico)}</td>
          <td ${tdTime}>${hms(tiempoPorJustificar)}</td>
          <td ${descuentoDia > 0 ? resaltada('#ffe4e6', '#9f1239', '#fecdd3') : tdTime}>${hms(descuentoDia)}</td>
          <td style="background-color:${rowBg}; font-weight:600; color:#0f172a; font-family:Consolas, monospace; font-size:9pt; text-align:center; border:0.5pt solid #cbd5e1; height:26px; mso-number-format:\\@;">${hms(netWorked)}</td>
          <td style="background-color:${rowBg}; text-align:center; border:0.5pt solid #cbd5e1; height:26px; font-weight:600; color:${aBadgeVal === 'SI' ? '#047857' : aBadgeVal === 'NO' ? '#b91c1c' : '#94a3b8'};">${aBadgeVal}</td>
          <td style="background-color:${rowBg}; text-align:center; border:0.5pt solid #cbd5e1; height:26px; font-weight:bold; color:${autorizadoGlobal ? '#1d4ed8' : '#94a3b8'};">${autorizadoGlobal ? 'SI' : 'NO'}</td>
          <td style="background-color:${rowBg}; border:0.5pt solid #cbd5e1; height:26px; font-size:9pt; color:#334155; padding:3px 6px;">${escapeHtml(razonText)}</td>
          <td ${atrasoMins > 0 ? resaltada('#fef3c7', '#92400e', '#fde68a') : tdTime}>${hms(atrasoMins)}</td>
          <td ${minsSalidaTemprana > 0 ? resaltada('#ffedd5', '#c2410c', '#fed7aa') : tdTime}>${hms(minsSalidaTemprana)}</td>
          <td ${h50 > 0 ? resaltada('#eff6ff', '#1d4ed8', '#bfdbfe') : tdTime}>${hms(h50)}</td>
          <td ${h100 > 0 ? resaltada('#eef2ff', '#4338ca', '#c7d2fe') : tdTime}>${hms(h100)}</td>
          <td ${hCN > 0 ? resaltada('#ecfeff', '#0891b2', '#a5f3fc') : tdTime}>${hms(hCN)}</td>
          <td ${hC50 > 0 ? resaltada('#ecfeff', '#0e7490', '#a5f3fc') : tdTime}>${hms(hC50)}</td>
          <td ${hC100 > 0 ? resaltada('#ecfeff', '#155e75', '#a5f3fc') : tdTime}>${hms(hC100)}</td>
          <td ${(h50 + hC50) > 0 ? total('#dbeafe', '#1e3a8a', '#93c5fd') : tdTime}>${hms(h50 + hC50)}</td>
          <td ${(h100 + hC100) > 0 ? total('#e0e7ff', '#312e81', '#a5b4fc') : tdTime}>${hms(h100 + hC100)}</td>
        </tr>`;
  });

  const totDescontarFinal = Math.max(0, totDescuentoBruto - 240);
  const tdTot = (color: string, v: number, size = '9.5pt') => `<td style="background-color:#0f172a; color:${color}; font-weight:bold; text-align:center; height:34px; border:1pt solid #0f172a; font-size:${size}; font-family:Consolas, monospace; mso-number-format:\\@;">${minutosAHHMMSS(v)}</td>`;
  const guion = '<td style="background-color:#0f172a; color:#ffffff; text-align:center; border:1pt solid #0f172a;">—</td>';
  const footerHtml = `<tr>
      <td colspan="3" style="background-color:#0f172a; color:#ffffff; font-weight:bold; text-align:left; height:34px; border:1pt solid #0f172a; font-size:10pt; padding:6px 10px; letter-spacing:0.5px;">TOTALES DEL PERÍODO</td>
      ${tdTot('#c4b5fd', totTP)}${tdTot('#5eead4', totTM)}${tdTot('#f0abfc', totTJ)}${tdTot('#fda4af', totDescontarFinal)}${tdTot('#fde047', totHoras)}
      ${guion}${guion}${guion}
      ${tdTot('#fcd34d', totAtrasos)}${tdTot('#fdba74', totSalidaTemprana)}${tdTot('#93c5fd', totH50)}${tdTot('#a5b4fc', totH100)}${tdTot('#67e8f9', totHCN)}
      ${tdTot('#22d3ee', totHC50)}${tdTot('#06b6d4', totHC100)}${tdTot('#38bdf8', totExtra50, '10pt')}${tdTot('#818cf8', totExtra100, '10pt')}
    </tr>`;
  const th = (bg: string, t: string, extra = '') => `<th style="background-color:${bg}; color:#ffffff; font-weight:bold; height:34px; text-align:center; border:0.5pt solid #475569; font-size:9pt;${extra}">${t}</th>`;
  const grupo = (n: number, bg: string, t: string, borde = '#475569') => `<th colspan="${n}" style="background-color:${bg}; color:#ffffff; font-weight:bold; text-align:center; height:28px; border:0.5pt solid ${borde}; font-size:9.5pt; letter-spacing:0.5px;">${t}</th>`;

  const excelHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8">
          <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Reporte Individual</x:Name><x:WorksheetOptions><x:DisplayGridlines/><x:Print><x:Orientation>Landscape</x:Orientation></x:Print></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
          <style>table { border-collapse:collapse; font-family:Arial, sans-serif; } th { font-family:Arial, sans-serif; } td { font-family:Arial, sans-serif; }</style>
        </head>
        <body>
          <table>
            <tr><td colspan="20" style="background-color:#0f172a; color:#ffffff; font-size:15pt; font-weight:bold; height:42px; text-align:center; vertical-align:middle; border:1pt solid #0f172a; letter-spacing:1px;">TCONTROL S.A. &mdash; REPORTE INDIVIDUAL DE ASISTENCIA Y CONTROL LABORAL</td></tr>
            <tr><td colspan="20" style="background-color:#1e293b; color:#94a3b8; font-size:9pt; height:24px; text-align:center; vertical-align:middle; border:1pt solid #1e293b;">
              Colaborador: <strong style="color:#ffffff;">${escapeHtml(e.nombre)}</strong> &nbsp;|&nbsp;
              ID: <strong style="color:#38bdf8;">${escapeHtml(e.id)}</strong> &nbsp;|&nbsp;
              Período: <strong style="color:#ffffff;">${escapeHtml(periodo.label)}</strong> (Rango: ${R_INI} al ${R_FIN}) &nbsp;|&nbsp;
              Generado: <strong style="color:#ffffff;">${marcaTiempoAhora()}</strong>
            </td></tr>
            <tr><td colspan="20" style="height:12px; border:none;"></td></tr>
            <thead>
              <tr>${grupo(3, '#1e293b', 'MARCACIONES', '#334155')}${grupo(4, '#6d28d9', 'PERMISOS Y DESCUENTOS')}${grupo(4, '#0369a1', 'JORNADA Y ESTADO')}${grupo(2, '#b45309', 'NOVEDADES')}${grupo(5, '#1e40af', 'HORAS EXTRAORDINARIAS & CAMPO')}${grupo(2, '#1e1b4b', 'TOTALES EXTRAS NÓMINA')}</tr>
              <tr>${th('#334155', 'FECHA')}${th('#334155', 'ENTRADA')}${th('#334155', 'SALIDA')}${th('#7c3aed', 'T. PERSONAL')}${th('#0d9488', 'T. MÉDICO')}${th('#c026d3', 'POR JUSTIFICAR')}${th('#be123c', 'A DESCONTAR')}${th('#0369a1', 'TOTAL HORAS')}${th('#0284c7', 'ALMUERZO')}${th('#475569', 'AUTORIZ. H.E.')}<th style="background-color:#475569; color:#ffffff; font-weight:bold; height:34px; text-align:left; border:0.5pt solid #475569; font-size:9pt; padding-left:6px; min-width:140px;">RAZÓN / ESTADO</th>${th('#b45309', 'ATRASOS')}${th('#c2410c', 'SALIDA TEMP.')}${th('#1d4ed8', 'H. EXTRA 50%')}${th('#4338ca', 'H. EXTRA 100%')}${th('#0891b2', 'CAMPO NORMAL')}${th('#0e7490', 'CAMPO 50%')}${th('#155e75', 'CAMPO 100%')}${th('#1e3a8a', 'TOTAL 50%')}${th('#312e81', 'TOTAL 100%')}</tr>
            </thead>
            <tbody>${bodyHtml}${footerHtml}</tbody>
            <tfoot>
              <tr><td colspan="20" style="height:14px; border:none;"></td></tr>
              <tr><td colspan="20" style="background-color:#f8fafc; color:#64748b; font-size:8pt; font-style:italic; border:0.5pt solid #cbd5e1; height:24px; padding:4px 8px; text-align:center;">CONFIDENCIAL &mdash; TCONTROL S.A. | Información laboral individual protegida por la Ley Orgánica de Protección de Datos Personales (LOPDP Ecuador) y el Código del Trabajo.</td></tr>
              <tr><td colspan="20" style="height:35px; border:none;"></td></tr>
              <tr>
                <td colspan="6" style="border-top:1.5pt solid #475569; text-align:center; font-size:9pt; font-weight:bold; color:#1e293b; padding-top:6px;">FIRMA DEL COLABORADOR<br><span style="font-size:8pt; font-weight:normal; color:#64748b;">${escapeHtml(e.nombre)}</span></td>
                <td colspan="7" style="border-top:1.5pt solid #475569; text-align:center; font-size:9pt; font-weight:bold; color:#1e293b; padding-top:6px;">SUPERVISOR DIRECTO<br><span style="font-size:8pt; font-weight:normal; color:#64748b;">Control de Asistencia y Turnos</span></td>
                <td colspan="7" style="border-top:1.5pt solid #475569; text-align:center; font-size:9pt; font-weight:bold; color:#1e293b; padding-top:6px;">TALENTO HUMANO / NÓMINA<br><span style="font-size:8pt; font-weight:normal; color:#64748b;">Auditoría y Liquidación</span></td>
              </tr>
            </tfoot>
          </table>
        </body>
        </html>`;
  descargarBlob(excelHtml, 'application/vnd.ms-excel;charset=utf-8;', `Reporte_Individual_${String(e.nombre).replace(/ /g, '_')}_${R_INI}_a_${R_FIN}.xls`);
  mostrarToast('Reporte individual exportado a Excel con éxito', 'success');
}
