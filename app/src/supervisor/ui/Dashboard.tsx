// Panel Dashboard (#panel-dashboard del legado): KPIs analíticos, detalle por colaborador, tarjetas del
// período actual, rankings y Resumen Mensual.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useRef } from 'react';
import { s } from '../../lib/estilo';
import { descargarExcel, descargarPdf } from '../excel';
import { calcularDashboard, calcularKpisDetallados, formatDias } from '../legado/dashboard';
import { formatearHorasDecimal, formatearMinutos, getLocalHoyStr } from '../legado/util';
import { abrirModal, mostrarDetalle } from '../nav';
import { limpiarFiltroFechaDashboard, syncFechaDash, syncPeriodo, useFiltrosRep } from '../reportesEstado';
import { useSup } from '../store';
import { mostrarToast } from './comun';
import { sumar, useDatosReporte } from './usoReportes';

const pill = "display:flex; align-items:center; gap:6px; background:#ffffff; padding:4px 10px; border-radius:10px; border:1px solid var(--g200); box-shadow:0 1px 3px rgba(0,0,0,0.02);";
const selectPill = "border:none; outline:none; font-family:'Plus Jakarta Sans', sans-serif; font-size:11.5px; font-weight:600; color:var(--g700); cursor:pointer; padding:2px; background: transparent;";

function estadoAsist(pct: number) {
  if (pct >= 95) return { txt: 'Excelente', color: 'var(--green)', bg: 'rgba(16, 185, 129, 0.1)', borde: 'var(--green)' };
  if (pct >= 85) return { txt: 'Aceptable', color: 'var(--amber)', bg: 'rgba(245, 158, 11, 0.1)', borde: 'var(--amber)' };
  return { txt: 'Crítico', color: 'var(--red)', bg: 'rgba(239, 68, 68, 0.1)', borde: 'var(--red)' };
}

function estadoVac(pct: number) {
  if (pct >= 85) return { icono: 'fas fa-check-circle', txt: 'Meta Cumplida', color: 'var(--green)', bg: 'rgba(16, 185, 129, 0.1)', borde: 'var(--green)' };
  if (pct >= 50) return { icono: 'fas fa-hourglass-half', txt: 'En Progreso', color: 'var(--amber)', bg: 'rgba(245, 158, 11, 0.1)', borde: 'var(--amber)' };
  return { icono: 'fas fa-exclamation-triangle', txt: 'Bajo Goce', color: '#0284c7', bg: 'rgba(2, 132, 199, 0.1)', borde: '#0284c7' };
}

export function Dashboard() {
  const empCache = useSup(x => x.empCache);
  const periodos = useSup(x => x.periodos);
  const vacaciones = useSup(x => x.vacaciones);
  const solicitudes = useSup(x => x.solicitudesInvitados);
  const version = useSup(x => x.version);
  const f = useFiltrosRep();
  const { stats, totalAlmExt } = useDatosReporte();
  const refKpis = useRef<HTMLDivElement>(null);
  const refTablaKpi = useRef<HTMLDivElement>(null);
  const hoy = getLocalHoyStr();

  const dash = useMemo(() => (periodos[0] && empCache.length ? calcularDashboard(empCache, periodos[0], hoy, vacaciones as any, solicitudes) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [empCache, periodos, vacaciones, solicitudes, version, hoy]);
  const periodoKpi = periodos[f.periodoIdx] || periodos[0];
  const kpiDet = useMemo(() => (periodoKpi && empCache.length ? calcularKpisDetallados(empCache, periodoKpi, hoy, vacaciones as any) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [empCache, periodoKpi, vacaciones, version, hoy]);

  const tot = (c: string) => sumar(stats, c);
  const totalAlmPlanta = tot('almPlanta');
  const estA = estadoAsist(parseFloat(dash?.kpiAsistenciaPct || '0'));
  const estV = estadoVac(parseFloat(dash?.vac.pct || '0'));
  const estP = estadoAsist(parseFloat(kpiDet?.promGlobalAsist || '0'));

  // mostrarDetalleCalculoCard: sin SweetAlert en supervisor.html, el legado mostraba solo el aviso
  const detalleCard = (tipo: string) => {
    if (['almTotal', 'almPlanta', 'almExtras', 'almFuera'].includes(tipo)) {
      mostrarToast(`Total Planta: ${totalAlmPlanta + totalAlmExt} (${totalAlmPlanta} emp. + ${totalAlmExt} extras)`, 'info');
    } else if (tipo === 'entradasReg') mostrarToast(`Total Entradas Registradas: ${tot('entradas')}`, 'info');
    else if (tipo === 'entradasAuto') mostrarToast(`Total Entradas Autocompletadas: ${tot('entradasAuto')}`, 'info');
    else if (tipo === 'salidasReg') mostrarToast(`Total Salidas Registradas: ${tot('salidas')}`, 'info');
    else if (tipo === 'salidasAuto') mostrarToast(`Total Salidas Autocompletadas: ${tot('salidasAuto')}`, 'info');
    else mostrarToast(`Métrica: ${tipo}`, 'info');
  };

  const exportarKPIsExcel = async () => {
    if (!dash) return;
    try {
      await descargarExcel(`Reporte_KPIs_Globales_${hoy}.xlsx`, [{ nombre: 'KPIs Globales', filas: [
        ['Indicador', 'Valor %', 'Detalle 1', 'Detalle 2'],
        ['Cumplimiento de Asistencia', dash.kpiAsistenciaPct + '%', 'Efectivas: ' + dash.asistEfectivas, 'Esperadas: ' + dash.totalEsperadas],
        ['Cumplimiento de Vacaciones', dash.vac.pct + '%', 'Tomadas: ' + formatDias(dash.vac.tomadas) + ' d', 'Adjudicadas: ' + formatDias(dash.vac.adjudicadas) + ' d'],
      ] }]);
      mostrarToast('KPIs exportados a Excel', 'success');
    } catch (err: any) { mostrarToast('Error al exportar KPIs: ' + (err?.message || err), 'error'); }
  };
  const exportarPdf = async (el: HTMLElement | null, nombre: string, aviso: string) => {
    if (!el) return;
    try {
      mostrarToast(aviso, 'info');
      await descargarPdf(el, `${nombre}_${hoy}.pdf`);
      mostrarToast('PDF generado exitosamente', 'success');
    } catch (err: any) { mostrarToast('Error al generar PDF: ' + (err?.message || err), 'error'); }
  };
  const exportarKPIsDetalladosExcel = async () => {
    if (!kpiDet) return;
    try {
      const label = periodoKpi?.label || 'Periodo';
      await descargarExcel(`KPIs_Detallados_${label.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`, [{ nombre: 'KPIs Detallados', filas: [
        ['Colaborador', 'Días Laborables', 'Asist. Ordinarias', 'Inasistencias', 'Días Extras', 'KPI Asistencia', 'Vac. Adjudicadas', 'Vac. Tomadas', 'Vac. Pendientes', '% Goce Vacaciones'],
        ...kpiDet.filas.map(r => [r.nombre, r.diasLab, r.ord, r.inasist, `+${r.ext}`, `${r.kpiAsistPct.toFixed(1)}%`, formatDias(r.vacAdj), formatDias(r.vacTom), formatDias(r.vacRes), r.txtVacPct]),
      ] }]);
      mostrarToast('KPIs detallados exportados a Excel', 'success');
    } catch (err: any) { mostrarToast('Error al exportar: ' + (err?.message || err), 'error'); }
  };

  const tarjeta = (tipo: string, icono: string, claseIcono: string, idValor: string, valor: any, label: string, periodo: string, extra: { icon?: string; valor?: string; card?: string } = {}, titulo = '') => (
    <div className="reporte-card" onClick={() => detalleCard(tipo)} style={s('cursor:pointer;' + (extra.card || ''))} title={titulo}>
      <div className={`reporte-icon ${claseIcono}`} style={extra.icon ? s(extra.icon) : undefined}><i className={icono}></i></div>
      <div className="reporte-value" id={idValor} style={extra.valor ? s(extra.valor) : undefined}>{valor}</div>
      <div className="reporte-label">{label}</div>
      <div className="reporte-period">{periodo}</div>
    </div>
  );

  const opcionesPeriodo = periodos.map((p, i) => <option key={i} value={i}>{p.label}</option>);

  return (
    <>
      <div className="dashboard-header-sticky" style={s('position: sticky; top: 0; z-index: 100; background: #f8fafc; padding: 10px 0; border-bottom: 1px solid var(--g200); display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px;')}>
        <div style={s(pill)}>
          <span style={s('font-size:11px; font-weight:700; color:var(--g600);')}><i className="fas fa-calendar-alt" style={s('color:var(--red);')}></i> Período:</span>
          <select id="periodoMensualDash" className="filter-select" value={f.periodoIdx} onChange={ev => syncPeriodo(parseInt(ev.target.value, 10))} style={s(selectPill)}>{opcionesPeriodo}</select>
        </div>
        <div style={s(pill)}>
          <span style={s('font-size:11px; font-weight:700; color:var(--g600);')}><i className="fas fa-calendar-day" style={s('color:var(--blue);')}></i> Filtrar por fecha:</span>
          <input type="date" id="filtroFechaDashboard" value={f.fechaDash} onChange={ev => syncFechaDash(ev.target.value)} style={s("border:none; outline:none; font-family:'Plus Jakarta Sans', sans-serif; font-size:11.5px; font-weight:600; color:var(--g700); cursor:pointer; padding:2px;")} />
          <button onClick={limpiarFiltroFechaDashboard} id="btnLimpiarFechaDash" style={s(`display:${f.fechaDash || f.ini || f.fin ? 'inline-block' : 'none'}; border:none; background:none; cursor:pointer; color:var(--rose); font-size:11px; padding:2px 4px; line-height:1;`)} title="Limpiar fecha"><i className="fas fa-times-circle"></i></button>
        </div>
      </div>

      <div id="kpisDashboardSection" ref={refKpis} style={s('background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.8); border-radius: 16px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 20px;')}>
        <div style={s('display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;')}>
          <h3 style={s('margin: 0; font-size: 16px; font-weight: 800; color: var(--g800);')}><i className="fas fa-chart-pie" style={s('color: var(--indigo); margin-right: 8px;')}></i> Indicadores de Rendimiento (KPIs)</h3>
          <div style={s('display: flex; gap: 8px;')}>
            <button className="btn btn-primary" onClick={() => void exportarKPIsExcel()} style={s('padding:8px 14px; border-radius:10px; font-size:12px; font-weight:700; background:var(--green); border:none; box-shadow:0 2px 4px rgba(22,163,74,0.2);')}><i className="fas fa-file-excel"></i> Excel</button>
            <button className="btn btn-primary" onClick={() => void exportarPdf(refKpis.current, 'Reporte_KPIs', 'Generando PDF de KPIs...')} style={s('padding:8px 14px; border-radius:10px; font-size:12px; font-weight:700; background:var(--rose); border:none; box-shadow:0 2px 4px rgba(225,29,72,0.2);')}><i className="fas fa-file-pdf"></i> PDF</button>
          </div>
        </div>

        <div id="kpisContainer" style={s('display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px;')}>
          {/* KPI Asistencia */}
          <div style={s('background: white; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; position: relative; overflow: hidden;')}>
            <div style={s(`position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: ${dash ? estA.borde : 'var(--indigo)'};`)} id="kpiAsistenciaBorder"></div>
            <div style={s('display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;')}>
              <div>
                <h4 style={s('margin: 0; font-size: 13px; font-weight: 700; color: var(--g600);')}>Cumplimiento de Asistencia</h4>
                <p style={s('margin: 2px 0 0; font-size: 11px; color: var(--g400);')}>Histórico Base (Promedio de Asistencia)</p>
              </div>
              <div style={s('background: rgba(99, 102, 241, 0.1); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--indigo); font-size: 16px;')}><i className="fas fa-calendar-check"></i></div>
            </div>
            <div style={s('display: flex; align-items: baseline; gap: 8px;')}>
              <span id="kpiAsistenciaVal" style={s('font-size: 28px; font-weight: 800; color: var(--g900); letter-spacing: -0.5px;')}>{dash ? dash.kpiAsistenciaPct : '--'}%</span>
              <span id="kpiAsistenciaStatus" style={s(`font-size: 12px; font-weight: 600; padding: 4px 8px; border-radius: 20px; background: ${dash ? estA.bg : '#f1f5f9'}; color: ${dash ? estA.color : 'var(--g500)'};`)}>{dash ? estA.txt : '...'}</span>
            </div>
            <div style={s('margin-top: 10px; font-size: 11px; color: var(--g600); display: grid; grid-template-columns: 1fr 1fr; gap: 4px; background: #f8fafc; padding: 6px 10px; border-radius: 8px; border: 1px solid #e2e8f0;')}>
              <div><span style={s('color:var(--g400);')}>Asist. Ordinarias:</span> <strong id="kpiAsistenciaDetalle1">{dash?.asistEfectivas ?? '--'}</strong></div>
              <div><span style={s('color:var(--g400);')}>Asist. Esperadas:</span> <strong id="kpiAsistenciaDetalle2">{dash?.totalEsperadas ?? '--'}</strong></div>
              <div><span style={s('color:var(--g400);')}>Vacaciones:</span> <strong id="kpiAsistenciaDetalleVacaciones" style={s('color:#0284c7;')}>{dash?.vacEfectivas ?? '--'}</strong></div>
              <div><span style={s('color:var(--g400);')}>Días Extras:</span> <strong id="kpiAsistenciaDetalleExtras" style={s('color:#4f46e5;')}>{dash?.diasExtras ?? '--'}</strong></div>
              <div style={s('grid-column: span 2;')}><span style={s('color:var(--g400);')}>Colaboradores Evaluados:</span> <strong id="kpiAsistenciaDetalleColabs">{dash?.colabs ?? '--'}</strong></div>
            </div>
            <div style={s('margin-top: 10px; display: flex; gap: 6px;')}>
              <button type="button" onClick={() => abrirModal('desgloseHistorico', {})} className="btn btn-hover-indigo" style={s('flex: 1; padding: 6px 8px; font-size: 11.5px; font-weight: 700; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 5px; background: #eef2ff; border: 1px solid #c7d2fe; color: #4338ca; cursor: pointer; transition: all 0.15s ease;')} title="Haz clic para ver el desglose detallado de las diferencias del período actual">
                <i className="fas fa-list-ol"></i> Ver Desglose (<span id="lblBtnDiferenciaTotal">{dash?.difTotal ?? '--'}</span> d)
              </button>
              <button type="button" onClick={() => abrirModal('desgloseHistorico', { periodo: 'ANUAL' })} className="btn btn-hover-green" style={s('padding: 6px 12px; font-size: 11.5px; font-weight: 700; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 5px; background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; cursor: pointer; transition: all 0.15s ease;')} title="Haz clic para ver el Desglose Anual de Asistencia y Diferencias">
                <i className="fas fa-calendar"></i> Anual
              </button>
            </div>
          </div>

          {/* KPI Vacaciones */}
          <div style={s('background: white; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; position: relative; overflow: hidden;')}>
            <div style={s(`position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: ${dash ? estV.borde : 'var(--teal)'};`)} id="kpiVacacionesBorder"></div>
            <div style={s('display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;')}>
              <div>
                <h4 style={s('margin: 0; font-size: 13px; font-weight: 700; color: var(--g600);')}>Cumplimiento de Vacaciones</h4>
                <p style={s('margin: 2px 0 0; font-size: 11px; color: var(--g400);')}>Goce Anual (Tomadas / Adjudicadas)</p>
              </div>
              <div style={s('background: rgba(20, 184, 166, 0.1); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--teal); font-size: 16px;')}><i className="fas fa-umbrella-beach"></i></div>
            </div>
            <div style={s('display: flex; align-items: baseline; gap: 8px;')}>
              <span id="kpiVacacionesVal" style={s('font-size: 28px; font-weight: 800; color: var(--g900); letter-spacing: -0.5px;')}>{dash ? dash.vac.pct : '--'}%</span>
              <span id="kpiVacacionesStatus" style={s(`font-size: 12px; font-weight: 600; padding: 4px 8px; border-radius: 20px; background: ${dash ? estV.bg : '#f1f5f9'}; color: ${dash ? estV.color : 'var(--g500)'};`)}>
                {dash ? <><i className={estV.icono}></i> {estV.txt}</> : 'Objetivo: 100%'}
              </span>
            </div>
            <div style={s('margin-top: 10px; font-size: 11px; color: var(--g600); display: grid; grid-template-columns: 1fr 1fr; gap: 4px; background: #f8fafc; padding: 6px 10px; border-radius: 8px; border: 1px solid #e2e8f0;')}>
              <div><span style={s('color:var(--g400);')}>Tomadas / Gozadas:</span> <strong id="kpiVacacionesDetalleTomadas" style={s('color:#0d9488;')}>{dash ? `${formatDias(dash.vac.tomadas)} d` : '--'}</strong></div>
              <div><span style={s('color:var(--g400);')}>Adjudicadas:</span> <strong id="kpiVacacionesDetalle2">{dash ? `${formatDias(dash.vac.adjudicadas)} d` : '--'}</strong></div>
              <div><span style={s('color:var(--g400);')}>Pendientes:</span> <strong id="kpiVacacionesDetalle1" style={s('color:#ef4444;')}>{dash ? `${formatDias(dash.vac.restantes)} d` : '--'}</strong></div>
              <div><span style={s('color:var(--g400);')}>Promedio Indiv.:</span> <strong id="kpiVacacionesDetallePromedio" style={s('color:var(--g800);')}>{dash ? dash.vac.promedioIndiv : '--'}%</strong></div>
            </div>
            <button type="button" onClick={() => abrirModal('desgloseVacaciones', {})} className="btn btn-hover-teal" style={s('margin-top: 10px; width: 100%; padding: 6px 10px; font-size: 11.5px; font-weight: 700; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 6px; background: #f0fdfa; border: 1px solid #99f6e4; color: #0f766e; cursor: pointer; transition: all 0.15s ease;')} title="Haz clic para ver el estado de vacaciones colaborador por colaborador">
              <i className="fas fa-umbrella-beach"></i> Ver Desglose de Vacaciones
            </button>
          </div>
        </div>

        {/* DETALLE DE KPIs POR EMPLEADO */}
        <div style={s('background: white; border-radius: 12px; padding: 16px; border: 1px solid #e2e8f0; margin-top: 16px;')}>
          <div style={s('display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;')}>
            <div>
              <h4 style={s('margin: 0; font-size: 15px; font-weight: 800; color: var(--g800);')}><i className="fas fa-list-ul" style={s('color:var(--blue); margin-right:6px;')}></i> Detalle de KPIs por Colaborador</h4>
              <p style={s('margin: 2px 0 0; font-size: 12px; color: var(--g500);')}>Desglose por período (26 al 25) • <em>Haz clic en cualquier colaborador para ver su reporte detallado</em></p>
            </div>
            <div style={s('display: flex; gap: 8px; align-items: center; flex-wrap: wrap;')}>
              <div style={s('display: flex; align-items: center; gap: 6px; background: #ffffff; padding: 4px 10px; border-radius: 10px; border: 1px solid var(--g300); box-shadow: 0 1px 3px rgba(0,0,0,0.02);')}>
                <span style={s('font-size: 11.5px; font-weight: 700; color: var(--g600);')}><i className="fas fa-calendar-alt" style={s('color: var(--red);')}></i> Período:</span>
                <select id="kpiDetallePeriodo" value={f.periodoIdx} onChange={ev => syncPeriodo(parseInt(ev.target.value, 10))} className="filter-select" style={s("border: none; outline: none; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; font-weight: 600; color: var(--g700); cursor: pointer; padding: 2px; background: transparent;")}>{opcionesPeriodo}</select>
              </div>
              <button className="btn btn-outline" onClick={() => void exportarKPIsDetalladosExcel()} style={s('padding: 6px 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;')}><i className="fas fa-file-excel" style={s('color:#10b981;')}></i> Excel</button>
              <button className="btn btn-outline" onClick={() => void exportarPdf(refTablaKpi.current, 'KPIs_Detallados', 'Generando PDF de KPIs detallados...')} style={s('padding: 6px 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;')}><i className="fas fa-file-pdf" style={s('color:#ef4444;')}></i> PDF</button>
            </div>
          </div>

          <div id="kpiPeriodoResumenBar" style={s('display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 16px; margin-bottom: 12px;')}>
            <div style={s('display: flex; align-items: center; gap: 10px;')}>
              <div style={s('width: 34px; height: 34px; border-radius: 8px; background: #eff6ff; color: #2563eb; display: flex; align-items: center; justify-content: center; font-size: 16px;')}><i className="fas fa-calendar-check"></i></div>
              <div>
                <div style={s('font-size: 11px; color: var(--g500); font-weight: 600; text-transform: uppercase;')}>Promedio KPI del Período (<span id="lblKpiPeriodoNombre">{kpiDet ? periodoKpi?.label : '--'}</span>):</div>
                <div style={s('display: flex; align-items: baseline; gap: 8px; margin-top: 1px;')}>
                  <strong style={s('font-size: 19px; font-weight: 800; color: var(--g900);')} id="lblKpiPeriodoPct">{kpiDet ? kpiDet.promGlobalAsist : '--'}%</strong>
                  <span id="lblKpiPeriodoStatus" style={s(`font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px; background: ${kpiDet ? { Excelente: '#dcfce7', Aceptable: '#fef3c7', 'Crítico': '#fee2e2' }[estP.txt] : '#e2e8f0'}; color: ${kpiDet ? { Excelente: '#15803d', Aceptable: '#b45309', 'Crítico': '#b91c1c' }[estP.txt] : '#475569'};`)}>{kpiDet ? estP.txt : '--'}</span>
                </div>
              </div>
            </div>
            <div style={s('display: flex; align-items: center; gap: 16px; font-size: 12px; color: var(--g600); flex-wrap: wrap;')}>
              <div><span style={s('color: var(--g400);')}>Asist. Ordinarias:</span> <strong id="lblKpiPeriodoEfectivas" style={s('color: var(--g800);')}>{kpiDet?.totOrdinarias ?? '--'}</strong></div>
              <div><span style={s('color: var(--g400);')}>Asist. Esperadas:</span> <strong id="lblKpiPeriodoEsperadas" style={s('color: var(--g800);')}>{kpiDet?.totEsperadas ?? '--'}</strong></div>
              <div><span style={s('color: var(--g400);')}>Vacaciones:</span> <strong id="lblKpiPeriodoVacaciones" style={s('color: #0284c7;')}>{kpiDet?.totVacaciones ?? '--'}</strong></div>
              <div><span style={s('color: var(--g400);')}>Inasistencias:</span> <strong id="lblKpiPeriodoInasistencias" style={s('color: var(--red);')}>{kpiDet?.totInasistencias ?? '--'}</strong></div>
              <div><span style={s('color: var(--g400);')}>Días Extras:</span> <strong id="lblKpiPeriodoExtras" style={s('color: #4f46e5;')}>{kpiDet?.totExtras ?? '--'}</strong></div>
              <div><span style={s('color: var(--g400);')}>Colaboradores:</span> <strong id="lblKpiPeriodoColabs" style={s('color: var(--g800);')}>{kpiDet?.colabs ?? '--'}</strong></div>
              <div><span style={s('color: var(--g400);')}>Días Laborables:</span> <strong id="lblKpiPeriodoDiasLab" style={s('color: var(--g800);')}>{kpiDet?.diasLaborables ?? '--'}</strong></div>
            </div>
          </div>

          <div ref={refTablaKpi} style={s('overflow: auto; max-height: 520px; border-radius: 8px; border: 1px solid var(--g200); position: relative;')}>
            <table style={s('width: 100%; border-collapse: collapse; min-width: 850px; text-align: left;')} id="tablaKpiDetalle">
              <thead style={s('position: sticky; top: 0; z-index: 10; background: #f8fafc; font-size: 12px; color: var(--g600); border-bottom: 1px solid var(--g200); box-shadow: 0 1px 2px rgba(0,0,0,0.06);')}>
                <tr>
                  <th style={s('padding: 10px 12px; font-weight: 700;')}>Colaborador</th>
                  <th style={s('padding: 10px 12px; font-weight: 700; text-align: center;')} title="Días hábiles (Lunes a Viernes no feriados) transcurridos del período">Días Laborables</th>
                  <th style={s('padding: 10px 12px; font-weight: 700; text-align: center;')} title="Asistencias en días laborables ordinarios">Asist. Ordinarias</th>
                  <th style={s('padding: 10px 12px; font-weight: 700; text-align: center;')} title="Inasistencias en días laborables">Inasistencias</th>
                  <th style={s('padding: 10px 12px; font-weight: 700; text-align: center;')} title="Trabajo en fines de semana o feriados fuera de los días laborables">Días Extras</th>
                  <th style={s('padding: 10px 12px; font-weight: 700; text-align: center;')} title="% de asistencia sobre días laborables ordinarios">KPI Asistencia</th>
                  <th style={s('padding: 10px 12px; font-weight: 700; text-align: center;')}>Vac. Adjudicadas</th>
                  <th style={s('padding: 10px 12px; font-weight: 700; text-align: center;')}>Vac. Tomadas</th>
                  <th style={s('padding: 10px 12px; font-weight: 700; text-align: center;')}>Vac. Pendientes</th>
                  <th style={s('padding: 10px 12px; font-weight: 700; text-align: center;')} title="Porcentaje de vacaciones disfrutadas sobre las adjudicadas en el año (Tomadas / Adjudicadas)">% Goce Vacaciones</th>
                </tr>
              </thead>
              <tbody style={s('font-size: 13px; color: var(--g800);')} id="tbodyKpiDetalle">
                {!kpiDet ? <tr><td colSpan={10} style={s('padding: 20px; text-align: center; color: var(--g500);')}>{empCache.length ? 'Sin datos para el período seleccionado.' : 'Cargando datos...'}</td></tr>
                  : !kpiDet.filas.length ? <tr><td colSpan={10} style={s('padding: 20px; text-align: center; color: var(--g500);')}>No se encontraron colaboradores activos.</td></tr>
                  : kpiDet.filas.map(r => (
                    <tr key={r.id} className="fila-kpi-detalle" style={s('border-bottom: 1px solid #f1f5f9; cursor: pointer;')} onClick={() => mostrarDetalle(r.id)}>
                      <td style={s('padding: 10px 12px; font-weight: 600;')}>{r.nombre}</td>
                      <td style={s('padding: 10px 12px; text-align: center;')} title={`Días laborables esperados para este colaborador: ${r.diasLab}`}>{r.diasLab}</td>
                      <td style={s('padding: 10px 12px; text-align: center; color: #2563eb; font-weight: 700;')}>{r.ord}</td>
                      <td style={s(`padding: 10px 12px; text-align: center; color: ${r.inasist > 0 ? '#ef4444' : '#10b981'}; font-weight: 700;`)}>{r.inasist}</td>
                      <td style={s('padding: 10px 12px; text-align: center; color: #7c3aed; font-weight: 600;')}>+{r.ext}</td>
                      <td style={s(`padding: 10px 12px; text-align: center; font-weight: 800; color: ${r.colAsist};`)}>{r.kpiAsistPct.toFixed(1)}%</td>
                      <td style={s('padding: 10px 12px; text-align: center;')}>{formatDias(r.vacAdj)}</td>
                      <td style={s('padding: 10px 12px; text-align: center; color: #0d9488; font-weight: 700;')}>{formatDias(r.vacTom)}</td>
                      <td style={s(`padding: 10px 12px; text-align: center; color: ${r.vacRes > 0 ? '#ef4444' : '#10b981'}; font-weight: 700;`)}>{formatDias(r.vacRes)}</td>
                      <td style={s(`padding: 10px 12px; text-align: center; font-weight: 800; color: ${r.colVac};`)}>{r.txtVacPct}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card" style={s('--stat-color:var(--green)')}>
          <div className="stat-header"><div className="stat-icon green"><i className="fas fa-percent"></i></div></div>
          <div className="stat-value" id="dashAsistencia">{dash ? dash.aPct : '--'}%</div>
          <div className="stat-label">Asistencia general</div>
        </div>
        <div className="stat-card" style={s('--stat-color:var(--amber)')}>
          <div className="stat-header"><div className="stat-icon amber"><i className="fas fa-clock"></i></div></div>
          <div className="stat-value" id="dashPuntualidad">{dash ? dash.pPct : '--'}%</div>
          <div className="stat-label">Puntualidad</div>
        </div>
        <div className="stat-card" style={s('--stat-color:var(--blue)')}>
          <div className="stat-header"><div className="stat-icon blue"><i className="fas fa-utensils"></i></div></div>
          <div className="stat-value" id="dashAlmPlanta">{dash ? dash.almPct : '--'}%</div>
          <div className="stat-label">Almuerzo planta</div>
          <div className="stat-sub" id="dashAlmPlantaSub" style={s('font-size:10.5px; color:var(--g500); margin-top:4px;')}>
            {dash ? <><span style={s('font-weight:600; color:var(--blue)')}>{dash.almP}</span> emp. + <span style={s('font-weight:600; color:var(--indigo)')}>{dash.totalExtrasPeriodo}</span> ext. = <strong>{dash.almP + dash.totalExtrasPeriodo}</strong> total</> : '--'}
          </div>
        </div>
        <div className="stat-card" style={s('--stat-color:var(--purple)')}>
          <div className="stat-header"><div className="stat-icon purple"><i className="fas fa-users"></i></div></div>
          <div className="stat-value" id="dashTotalEmpleados">{dash ? dash.totalEmpleados : '--'}</div>
          <div className="stat-label">Empleados activos</div>
        </div>
      </div>

      <div className="metricas-row">
        <div className="metric-card">
          <div className="metric-title"><i className="fas fa-trophy"></i> Top 5 más puntuales</div>
          <div id="topPuntuales" className="ranking-list">
            {!dash ? <div className="empty-state"><i className="fas fa-spinner fa-spin"></i></div>
              : !dash.topPuntuales.length ? <div className="empty-state">Sin datos</div>
              : dash.topPuntuales.map((e, i) => (
                <div key={e.id} className="ranking-item" onClick={() => mostrarDetalle(e.id)} title={e.fechas.length ? `Tardanzas: ${e.fechas.join(', ')} (Total: ${e.minutosTard} min)` : '100% Puntual'} style={s('cursor:pointer;')}>
                  <div className={`ranking-position${i === 0 ? ' top' : ''}`}>{i + 1}</div>
                  <div className="ranking-info"><div className="ranking-name">{e.nombre}</div><div className="ranking-area">{e.area || 'Sin área'}</div></div>
                  <div className="ranking-value" style={s('display:flex; flex-direction:column; align-items:flex-end')}><span style={s('font-size:10px;color:var(--g400);font-weight:600;margin-bottom:-2px')}>{e.asist - e.tardanzas} de {e.asist} punt.</span><span>{e.p}%</span></div>
                </div>
              ))}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-title"><i className="fas fa-clock"></i> Top 5 más tardanzas</div>
          <div id="topTardanzasRanking" className="ranking-list">
            {!dash ? <div className="empty-state"><i className="fas fa-spinner fa-spin"></i></div>
              : !dash.topTardanzas.length ? <div className="empty-state">Sin tardanzas</div>
              : dash.topTardanzas.map((e, i) => (
                <div key={e.id} className="ranking-item" onClick={() => mostrarDetalle(e.id)} title={e.fechas.length ? `Tardanzas: ${e.fechas.join(', ')}` : undefined} style={s('cursor:pointer;')}>
                  <div className={`ranking-position${i === 0 ? ' top' : ''}`}>{i + 1}</div>
                  <div className="ranking-info"><div className="ranking-name">{e.nombre}</div><div className="ranking-area">{e.area || 'Sin área'}</div></div>
                  <div className="ranking-value" style={s('display:flex; flex-direction:column; align-items:flex-end')}><span style={s('font-size:10px;color:var(--g400);font-weight:600;margin-bottom:-2px')}>{e.tardanzas} de {e.asist} asis.</span><span style={s('color:var(--red); font-weight:bold;')}>{e.tardanzas} tard. ({e.minutosTard}m)</span></div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="metricas-row" style={s('grid-template-columns: repeat(auto-fit, minmax(285px, 1fr));')}>
        <div className="metric-card">
          <div className="metric-title"><i className="fas fa-magic"></i> Autocompletados en el Período</div>
          <div id="sinSalidaRanking" className="ranking-list" style={s('max-height: 250px; overflow-y: auto;')}>
            {!dash ? <div className="empty-state"><i className="fas fa-spinner fa-spin"></i></div>
              : !dash.sinSalida.length ? <div className="empty-state">Todos han registrado su salida</div>
              : dash.sinSalida.map((e, i) => (
                <div key={e.id} className="ranking-item" onClick={() => mostrarDetalle(e.id)} title={e.fechas.length ? `Fechas sin salida: ${e.fechas.join(', ')}` : undefined} style={s('cursor:pointer;')}>
                  <div className={`ranking-position${i === 0 ? ' top' : ''}`}>{i + 1}</div>
                  <div className="ranking-info"><div className="ranking-name">{e.nombre}</div><div className="ranking-area">{e.area || 'Sin área'}</div></div>
                  <div className="ranking-value" style={s('color:var(--purple);font-weight:700;display:flex; flex-direction:column; align-items:flex-end')}><span style={s('font-size:10px;color:var(--purple-lt);font-weight:600;margin-bottom:-2px')}>{e.faltasSalida} de {e.totalEntradas || '?'} entr.</span><span>{e.faltasSalida} sin salida</span></div>
                </div>
              ))}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-title"><i className="fas fa-calendar-times"></i> Faltas Injustificadas del Período</div>
          <div id="ausenciasRanking" className="ranking-list" style={s('max-height: 250px; overflow-y: auto;')}>
            {!dash ? <div className="empty-state"><i className="fas fa-spinner fa-spin"></i></div>
              : !dash.faltas.length ? <div className="empty-state">Sin faltas en el período</div>
              : dash.faltas.map((e, i) => (
                <div key={e.id} className="ranking-item" onClick={() => mostrarDetalle(e.id)} style={s('cursor:pointer; display:flex; align-items:center; gap:12px; padding:6px 0; border-bottom:1px solid var(--g100);')}>
                  <div className={`ranking-position${i === 0 ? ' top' : ''}`}>{i + 1}</div>
                  <div className="ranking-info" style={s('flex:1;')}>
                    <div className="ranking-name" style={s('font-weight:600; font-size:12px;')}>{e.nombre}</div>
                    <div style={s('display:flex; align-items:center; gap:8px; margin-top:2px;')}><span className="ranking-area" style={s('font-size:11px; color:var(--g500);')}>{e.area || 'Sin área'}</span></div>
                    <div style={s('display:flex; gap:4px; flex-wrap:wrap; margin-top:4px;')} title={`Fechas: ${e.fechas.map(x => `${x.slice(8, 10)}/${x.slice(5, 7)}`).join(', ')}`}>
                      {e.fechas.slice(0, 4).map(x => <span key={x} className="absence-chip">{x.slice(8, 10)}/{x.slice(5, 7)}</span>)}
                      {e.fechas.length > 4 && <span className="absence-chip-more">+{e.fechas.length - 4} más</span>}
                    </div>
                  </div>
                  <div className="ranking-value" style={s('display:flex; flex-direction:column; align-items:flex-end; justify-content:center;')}>
                    <span style={s('font-size:12px; font-weight:700; color:var(--red); background:var(--red-lt); padding:3px 8px; border-radius:6px; display:flex; align-items:center; gap:4px;')}><i className="fas fa-exclamation-circle"></i> {e.fechas.length}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="metric-card" style={s('margin-bottom:var(--gap)')}>
        <div className="metric-title"><i className="fas fa-calendar-alt"></i> Resumen Mensual</div>
        <div className="reportes-grid" style={s('margin-bottom:var(--gap); grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));')}>
          {tarjeta('entradasReg', 'fas fa-sign-in-alt', 'green', 'repEntradasReg', stats.length ? tot('entradas') : '--', 'Entradas Registradas', 'marcaciones directas', { icon: 'background: rgba(16, 185, 129, 0.1); color: #059669;', valor: 'color: #059669;' }, 'Clic para ver detalle de Entradas Registradas')}
          {tarjeta('entradasAuto', 'fas fa-robot', 'amber', 'repEntradasAuto', stats.length ? tot('entradasAuto') : '--', 'Entradas Auto.', 'sistema / regularizadas', { icon: 'background: rgba(245, 158, 11, 0.1); color: #d97706;', valor: 'color: #d97706;' }, 'Clic para ver detalle de Entradas Autocompletadas')}
          {tarjeta('salidasReg', 'fas fa-sign-out-alt', 'blue', 'repSalidasReg', stats.length ? tot('salidas') : '--', 'Salidas Registradas', 'marcaciones directas', { icon: 'background: rgba(2, 132, 199, 0.1); color: #0284c7;', valor: 'color: #0284c7;' }, 'Clic para ver detalle de Salidas Registradas')}
          {tarjeta('salidasAuto', 'fas fa-magic', 'purple', 'repSalidasAuto', stats.length ? tot('salidasAuto') : '--', 'Salidas Auto.', 'autocompletadas / sistema', { icon: 'background: rgba(124, 58, 237, 0.1); color: #7c3aed;', valor: 'color: #7c3aed;' }, 'Clic para ver detalle de Salidas Autocompletadas')}
        </div>
        <div className="reportes-grid" style={s('margin-bottom:var(--gap)')}>
          {tarjeta('faltas', 'fas fa-calendar-times', 'red', 'repFaltas', stats.length ? tot('faltas') : '--', 'FALTAS', 'días sin asistencia', {}, 'Clic para ver detalle de cálculo de Faltas')}
          {tarjeta('permisoMedico', 'fas fa-notes-medical', 'blue', 'repPermisoMedico', stats.length ? formatearMinutos(tot('permisoMedico')) : '--', 'Permiso Médico', 'con justificativo', {}, 'Clic para ver detalle de Permiso Médico')}
          {tarjeta('permisoPersonal', 'fas fa-user-clock', 'purple', 'repPermisoPersonal', stats.length ? formatearMinutos(tot('permisoPersonal')) : '--', 'Permiso Personal', 'sin justificativo', {}, 'Clic para ver detalle de Permiso Personal')}
          {tarjeta('atrasos', 'fas fa-clock', 'amber', 'repAtrasos', stats.length ? tot('atrasos') : '--', 'Atrasos', 'número de atrasos', {}, 'Clic para ver detalle de Atrasos')}
          {tarjeta('tiempoPorJustificar', 'fas fa-exclamation-circle', 'red', 'repTiempoPorJustificar', stats.length ? formatearMinutos(tot('tiempoPorJustificar')) : '--', 'Por Justificar', 'tiempo por justificar', {}, 'Clic para ver detalle de Tiempo Por Justificar')}
        </div>
        <div className="reportes-grid" style={s('margin-bottom:var(--gap)')}>
          {tarjeta('almPlanta', 'fas fa-utensils', 'green', 'repAlmuerzosEmp', stats.length ? totalAlmPlanta : '--', 'Almuerzos Empleados', 'en planta', {}, 'Clic para ver detalle de Almuerzos Empleados')}
          {tarjeta('almExtras', 'fas fa-plus-circle', 'blue', 'repAlmuerzosExt', stats.length ? totalAlmExt : '--', 'Almuerzos Extras', 'de visitantes/varios', {}, 'Clic para ver detalle de Almuerzos Extras')}
          {tarjeta('almTotal', 'fas fa-calculator', 'green', 'repAlmuerzosTotal', stats.length ? totalAlmPlanta + totalAlmExt : '--', 'TOTAL ALMUERZOS', 'empleados + extras', { icon: 'background: rgba(16, 185, 129, 0.1); color: var(--green);', card: ' border-color: var(--green);' }, 'Clic para ver detalle de Total Almuerzos')}
          {tarjeta('almFuera', 'fas fa-home', 'pink', 'repAlmuerzosFuera', stats.length ? tot('almFuera') : '--', 'Almuerzos Fuera', 'fuera de planta', {}, 'Clic para ver detalle de Almuerzos Fuera')}
        </div>
        <div className="reportes-grid" style={s('margin-bottom:var(--gap)')}>
          {tarjeta('horasExtra50', 'fas fa-charging-station', 'green', 'repHorasExtra50', stats.length ? formatearHorasDecimal(tot('horasExtra50')) : '--', 'Horas Extras 50% (A)', 'después de 16:15', {}, 'Clic para ver detalle de Horas Extras 50%')}
          {tarjeta('horasExtra100', 'fas fa-calendar-week', 'teal', 'repHorasExtra100', stats.length ? formatearHorasDecimal(tot('horasExtra100')) : '--', 'Horas Extras 100% (B)', 'fines de semana/feriados', {}, 'Clic para ver detalle de Horas Extras 100%')}
          {tarjeta('horasCampoNormales', 'fas fa-map-marker-alt', 'blue', 'repHorasCampoNormales', stats.length ? formatearHorasDecimal(tot('horasCampoNormales')) : '--', 'Horas en campo normales', 'fuera de ubicación', {}, 'Clic para ver detalle de Horas en Campo Normales')}
          {tarjeta('horasCampo50', 'fas fa-charging-station', 'purple', 'repHorasCampo50', stats.length ? formatearHorasDecimal(tot('horasCampo50')) : '--', 'Horas en campo 50% (C)', 'en campo horario laboral', {}, 'Clic para ver detalle de Horas en Campo 50%')}
        </div>
        <div className="reportes-grid" style={s('margin-bottom:var(--gap)')}>
          {tarjeta('horasCampo100', 'fas fa-charging-station', 'pink', 'repHorasCampo100', stats.length ? formatearHorasDecimal(tot('horasCampo100')) : '--', 'Horas en campo 100% (D)', 'fines de semana/feriados', {}, 'Clic para ver detalle de Horas en Campo 100%')}
          {tarjeta('totalExtras50', 'fas fa-calculator', 'amber', 'repTotalExtras50', stats.length ? formatearHorasDecimal(tot('totalExtras50')) : '--', 'TOTAL Extras 50% (A+C)', 'A + C', {}, 'Clic para ver detalle de TOTAL Extras 50%')}
          {tarjeta('totalExtras100', 'fas fa-calculator', 'teal', 'repTotalExtras100', stats.length ? formatearHorasDecimal(tot('totalExtras100')) : '--', 'TOTAL Extras 100% (B+D)', 'B + D', {}, 'Clic para ver detalle de TOTAL Extras 100%')}
          {tarjeta('totalHorasExtra', 'fas fa-chart-line', 'green', 'repTotalHorasExtra', stats.length ? formatearHorasDecimal(tot('totalHorasExtra')) : '--', 'TOTAL HORAS EXTRA', '(A+B+C+D)', {}, 'Clic para ver detalle de TOTAL HORAS EXTRA')}
        </div>
      </div>
    </>
  );
}
