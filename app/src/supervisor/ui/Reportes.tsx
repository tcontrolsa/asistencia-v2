// Panel Reporte Interactivo (#panel-reportes; JS/supervisor/supervisor_reportes_custom.js): período o rango,
// presets de quincena, filtros rápidos, vistas de columnas, tabla con totales y exportaciones.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { s } from '../../lib/estilo';
import { descargarBlob } from '../excel';
import { marcaTiempoAhora } from '../legado/dashboard';
import {
  COLUMNAS_DISPONIBLES, Columna, DEFAULT_COLUMNAS_CUSTOM, StatReporte, filtrarDatosReporte, formatearFechaA_DMY, guardarColumnasCustomActivas,
  obtenerColumnasCustomActivas, ordenar,
} from '../legado/reportes';
import { escapeHtml, minutosAHHMMSS, normalizarFechaStr } from '../legado/util';
import { mostrarDetalle } from '../nav';
import {
  Preset, aplicarPresetFechasReporte, filtrarReportePorRangoFechas, filtrosRep, limpiarFiltroRangoFechasReportes, syncPeriodo, useFiltrosRep,
} from '../reportesEstado';
import { useSup } from '../store';
import { PhotoCell, mostrarToast } from './comun';
import { DatosReporte, useDatosReporte } from './usoReportes';

const FILTROS_RAPIDOS: { val: string; texto: ReactNode; clase?: string; title?: string }[] = [
  { val: '', texto: 'TODOS' },
  { val: 'pasante', texto: 'Pasante' },
  { val: 'sin asistencia', texto: 'Sin Asistencia' },
  { val: 'almuerzos extra', texto: <><i className="fas fa-utensils"></i> Almuerzos Extra</> },
  { val: 'desvinculados', texto: <><i className="fas fa-user-slash"></i> Desvinculados</>, clase: ' btn-pill-desv', title: 'Ver solo colaboradores desvinculados' },
  { val: 'eliminados', texto: <><i className="fas fa-user-minus"></i> Eliminados</>, clase: ' btn-pill-elim', title: 'Ver colaboradores eliminados con histórico' },
];

type Orden = { col: string; dir: 'asc' | 'desc' };

function IconoOrden({ orden, col }: { orden: Orden; col: string }) {
  if (orden.col !== col) return <i className="fas fa-sort" style={s('opacity:.2;margin-left:4px;font-size:9px')}></i>;
  return orden.dir === 'asc'
    ? <i className="fas fa-sort-up" style={s('color:var(--red);margin-left:4px;font-size:9px')}></i>
    : <i className="fas fa-sort-down" style={s('color:var(--red);margin-left:4px;font-size:9px')}></i>;
}

const cero = (txt = '0', color = '#94a3b8') => <span style={s(`color:${color}; font-family:'Fira Code',monospace; font-size:11px;`)}>{txt}</span>;
const pillN = (bg: string, color: string, borde: string, icono: string, valor: any) => (
  <span className="rep-badge-pill" style={s(`background:${bg}; color:${color}; border:1px solid ${borde}; font-weight:700;`)}><i className={`fas ${icono}`} style={s('font-size:8.5px;')}></i> {valor}</span>
);

// Contenido de cada celda como en filtrarReporteInteractivo
function Celda({ col, valor }: { col: Columna; valor: any }) {
  switch (col.id) {
    case 'asistencias': return <span className="rep-badge-pill rep-badge-asis"><i className="fas fa-check" style={s('font-size:8.5px;')}></i> {valor}</span>;
    case 'entradas': return pillN('#ecfdf5', '#059669', '#a7f3d0', 'fa-sign-in-alt', valor);
    case 'entradasAuto': return valor > 0 ? pillN('#fffbeb', '#d97706', '#fde68a', 'fa-robot', valor) : cero();
    case 'salidas': return pillN('#f0f9ff', '#0284c7', '#bae6fd', 'fa-sign-out-alt', valor);
    case 'salidasAuto': return valor > 0 ? pillN('#faf5ff', '#7c3aed', '#ddd6fe', 'fa-magic', valor) : cero();
    case 'diasCampo': return valor > 0 ? pillN('#ecfeff', '#0891b2', '#a5f3fc', 'fa-hard-hat', valor) : cero();
    case 'faltas': return valor > 0 ? <span className="rep-badge-pill rep-badge-falta-alert"><i className="fas fa-times-circle" style={s('font-size:8.5px;')}></i> {valor}</span> : <span className="rep-badge-falta-zero">0</span>;
    case 'diasVacaciones': return valor > 0 ? pillN('#ecfdf5', '#059669', '#a7f3d0', 'fa-umbrella-beach', valor) : cero();
    case 'diasJustificados': return valor > 0 ? pillN('#f5f3ff', '#7c3aed', '#ddd6fe', 'fa-shield-alt', valor) : cero();
    case 'diasExtras': return valor > 0 ? pillN('#eef2ff', '#4338ca', '#c7d2fe', 'fa-calendar-plus', valor) : cero();
    case 'atrasos': return valor > 0 ? <span className="rep-badge-pill rep-badge-atraso-alert"><i className="fas fa-clock" style={s('font-size:8.5px;')}></i> {valor}</span> : <span className="rep-badge-atraso-zero">0</span>;
    case 'minutosAtrasos': return valor > 0 ? <span className="rep-badge-pill rep-badge-atraso-alert">{minutosAHHMMSS(valor)}</span> : cero('00:00:00');
    case 'almPlanta': case 'almFuera': return <span className="rep-badge-pill rep-badge-alm"><i className="fas fa-utensils" style={s('font-size:8.5px;')}></i> {valor}</span>;
    case 'puntualidad':
      if (valor >= 90) return <span className="rep-badge-pill rep-badge-pct-hi"><i className="fas fa-star" style={s('font-size:8.5px;')}></i> {valor}%</span>;
      if (valor >= 75) return <span className="rep-badge-pill rep-badge-pct-mid">{valor}%</span>;
      return <span className="rep-badge-pill rep-badge-pct-low"><i className="fas fa-exclamation-circle" style={s('font-size:8.5px;')}></i> {valor}%</span>;
    case 'horasExtra50': return valor > 0 ? <span className="rep-badge-pill rep-badge-ex50">{minutosAHHMMSS(valor)}</span> : cero('—', '#cbd5e1');
    case 'horasExtra100': return valor > 0 ? <span className="rep-badge-pill rep-badge-ex100">{minutosAHHMMSS(valor)}</span> : cero('—', '#cbd5e1');
    case 'totalExtras50': return valor > 0 ? <span className="rep-badge-pill rep-badge-totextra">{minutosAHHMMSS(valor)}</span> : cero('00:00:00');
    case 'totalExtras100': return valor > 0 ? <span className="rep-badge-pill rep-badge-totextra" style={s('background:#ede9fe; color:#4338ca; border-color:#c7d2fe;')}>{minutosAHHMMSS(valor)}</span> : cero('00:00:00');
  }
  if (col.cat === 'campo') return valor > 0 ? <span className="rep-badge-pill rep-badge-campo">{minutosAHHMMSS(valor)}</span> : cero('—', '#cbd5e1');
  if (col.cat === 'permisos') {
    return valor > 0 ? <span className="rep-badge-pill rep-badge-perm" style={s(`background:${col.colorBg}; color:${col.color}; border-color:${col.color}40;`)}>{minutosAHHMMSS(valor)}</span> : cero('—', '#cbd5e1');
  }
  return <span style={s("font-family:'Fira Code',monospace; font-size:11px;")}>{valor}</span>;
}

function filtrarExtras(extras: DatosReporte['extras'], q: string) {
  if (!q) return extras;
  return extras.filter(ae => (ae.invitado || '').toLowerCase().includes(q) || (ae.observaciones || '').toLowerCase().includes(q)
    || (ae.empresa || '').toLowerCase().includes(q) || (ae.subtipo || '').toLowerCase().includes(q));
}

// Tipo mostrado de un almuerzo extra (obtenerAlmuerzosExtraConsolidados no trae 'tipo': el legado caía en 'Manual')
const tipoExtra = (ae: any) => ae.tipo || 'Manual';
const nombreExtra = (ae: any) => ae.nombre || 'Almuerzo Extra';

export function Reportes() {
  const f = useFiltrosRep();
  const periodos = useSup(x => x.periodos);
  const empCache = useSup(x => x.empCache);
  const datos = useDatosReporte();
  const { rango, stats, extras } = datos;
  const [cols, setCols] = useState<string[]>(obtenerColumnasCustomActivas);
  const [orden, setOrden] = useState<Orden>({ col: 'nombre', dir: 'asc' });
  const [drawer, setDrawer] = useState(false);
  const [busqueda, setBusqueda] = useState(f.busqueda);
  const [pillsTocadas, setPillsTocadas] = useState(false);
  const refTop = useRef<HTMLDivElement>(null);
  const refDummy = useRef<HTMLDivElement>(null);
  const refScroll = useRef<HTMLDivElement>(null);

  // Buscador con espera de 250 ms (debounce del legado)
  useEffect(() => {
    const t = window.setTimeout(() => filtrosRep.set({ busqueda }), 250);
    return () => clearTimeout(t);
  }, [busqueda]);

  const q = f.busqueda.toLowerCase();
  const fCargo = f.cargo.toLowerCase();
  const esExtras = fCargo === 'almuerzos extra';
  const activas = COLUMNAS_DISPONIBLES.filter(c => cols.includes(c.id));
  const data = useMemo(() => ordenar(filtrarDatosReporte(stats, q, fCargo), orden.col, orden.dir), [stats, q, fCargo, orden]);
  const extrasVista = useMemo(() => ordenar(filtrarExtras(extras, q) as any[], orden.col, orden.dir, ''), [extras, q, orden]);

  // Barra de desplazamiento superior sincronizada (initScrollSync)
  useEffect(() => {
    const top = refTop.current, bottom = refScroll.current, dummy = refDummy.current;
    if (!top || !bottom || !dummy) return;
    dummy.style.width = bottom.scrollWidth + 'px';
    let sincronizando = false;
    top.onscroll = () => { if (sincronizando) return; sincronizando = true; bottom.scrollLeft = top.scrollLeft; sincronizando = false; };
    bottom.onscroll = () => { if (sincronizando) return; sincronizando = true; top.scrollLeft = bottom.scrollLeft; sincronizando = false; };
  });

  const guardarCols = (nuevas: string[]) => { setCols(nuevas); guardarColumnasCustomActivas(nuevas); };
  const alternarCol = (id: string) => guardarCols(cols.includes(id) ? cols.filter(c => c !== id) : [...cols, id]);
  const ordenarPor = (col: string) => setOrden(o => (o.col === col ? { col, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }));

  const setFiltroRapido = (val: string) => {
    setPillsTocadas(true);
    const extra: any = {};
    if (val === 'desvinculados') extra.incluirDesv = true;
    else if (val === 'eliminados') extra.incluirElim = true;
    filtrosRep.set({ cargo: val, ...extra });
  };
  const resetFiltroSiExtras = () => { if (f.cargo === 'almuerzos extra') { setPillsTocadas(true); filtrosRep.set({ cargo: '' }); } };
  const restablecerColumnasDefault = () => { resetFiltroSiExtras(); guardarCols([...DEFAULT_COLUMNAS_CUSTOM]); mostrarToast('Columnas restablecidas por defecto', 'info'); };
  const cargarPlantilla = (tipo: string) => {
    resetFiltroSiExtras();
    if (tipo === 'almuerzos') { guardarCols(['asistencias', 'almPlanta', 'almFuera']); mostrarToast('Plantilla de Almuerzos cargada', 'success'); }
    else if (tipo === 'extras') { guardarCols(['horasExtra50', 'horasExtra100', 'horasCampoNormales', 'horasCampo50', 'horasCampo100', 'totalExtras50', 'totalExtras100']); mostrarToast('Plantilla de Horas Extra cargada', 'success'); }
    else if (tipo === 'asistencias') { guardarCols(['asistencias', 'entradas', 'salidas', 'salidasAuto', 'faltas', 'atrasos', 'minutosAtrasos', 'puntualidad']); mostrarToast('Plantilla de Asistencia y Atrasos cargada', 'success'); }
    else if (tipo === 'completo') { guardarCols(COLUMNAS_DISPONIBLES.map(c => c.id)); mostrarToast('Plantilla de Reporte Completo cargada', 'success'); }
  };

  const estiloPill = (val: string) => {
    if (!pillsTocadas) return undefined;
    if (f.cargo !== val) return s('background:#f8fafc; color:var(--g600); border-color:var(--g200);');
    const c = val === 'desvinculados' ? '#7c3aed' : val === 'eliminados' ? '#e11d48' : 'var(--blue)';
    return s(`background:${c}; color:#fff; border-color:${c};`);
  };

  const info = esExtras
    ? `Mostrando ${extrasVista.length} registros (${extrasVista.reduce((a: number, ae: any) => a + (parseInt(ae.cantidad || 0) || 0), 0)} almuerzos extras) | ${rango.labelRango}`
    : data.length ? `Mostrando ${data.length} de ${empCache.length} colaboradores${rango.esFiltroPersonalizado ? ` | Filtro: ${rango.labelRango}` : ` | ${rango.labelRango}`}`
      : `Mostrando 0 colaboradores | ${rango.labelRango}`;

  const presetBtn = (p: Preset, texto: string, title: string) => (
    <button type="button" className={`btn-date-preset${f.preset === p ? ' active' : ''}`} data-preset={p} onClick={() => aplicarPresetFechasReporte(p)} title={title}>{texto}</button>
  );

  return (
    <>
      <div className="reportes-toolbar-container">
        <div className="reportes-toolbar-row reportes-row-primary">
          <div className="reportes-group-left">
            <div className="reportes-control-pill" title="Seleccionar Período Oficial de Nómina">
              <span className="control-label"><i className="fas fa-calendar-alt" style={s('color:var(--red);')}></i> Período:</span>
              <select id="periodoMensual" className="filter-select select-clean" value={f.periodoIdx} onChange={ev => syncPeriodo(parseInt(ev.target.value, 10))}>
                {periodos.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
              </select>
            </div>
            <div className="reportes-control-pill date-range-pill" title="Filtrar por rango de fechas específico">
              <span className="control-label"><i className="fas fa-calendar-day" style={s('color:var(--blue);')}></i> Fechas:</span>
              <input type="date" id="filtroFechaReportesInicio" value={f.ini} onChange={ev => filtrarReportePorRangoFechas(ev.target.value, f.fin)} title="Fecha Desde" className="date-input-clean" />
              <span className="range-separator"><i className="fas fa-arrow-right"></i></span>
              <input type="date" id="filtroFechaReportesFinalizacion" value={f.fin} onChange={ev => filtrarReportePorRangoFechas(f.ini, ev.target.value)} title="Fecha Hasta" className="date-input-clean" />
              <button type="button" onClick={limpiarFiltroRangoFechasReportes} id="btnLimpiarFechaRep" className="btn-clear-date" style={s(`display:${f.ini || f.fin ? 'inline-block' : 'none'};`)} title="Limpiar filtro de fechas">
                <i className="fas fa-times-circle"></i>
              </button>
            </div>
            <div className="date-presets-group">
              {presetBtn('periodo', 'Mes Completo', 'Ver mes completo del período actual')}
              {presetBtn('quincena1', '1ª Quincena', '1ª Quincena: 26 al 10')}
              {presetBtn('quincena2', '2ª Quincena', '2ª Quincena: 11 al 25')}
              {presetBtn('hoy', 'Hoy', 'Ver solo registros de hoy')}
            </div>
            <div id="badgeEstadoRangoReporte" className={`badge-rango-activo ${rango.esFiltroPersonalizado ? 'badge-rango-filtro' : 'badge-rango-periodo'}`} style={s('display:inline-flex;')}>
              {rango.esFiltroPersonalizado
                ? <><i className="fas fa-filter"></i> Filtro: <strong>{rango.labelRango}</strong></>
                : <><i className="fas fa-calendar-alt"></i> Período: <strong>{rango.labelRango}</strong></>}
            </div>
          </div>
          <div className="reportes-group-actions">
            <button type="button" className="btn-export btn-export-excel" onClick={() => exportarExcelReporteCustom(datos, data, extrasVista, activas, fCargo)} title="Descargar reporte en formato Microsoft Excel (.xls)">
              <i className="fas fa-file-excel"></i> <span>Excel</span>
            </button>
            <button type="button" className="btn-export btn-export-sheets" onClick={() => mostrarToast('La exportación a Google Sheets se habilita con el servicio de integraciones (Fase 6). Usa Excel mientras tanto.', 'info')} title="Exportar pestaña directa en tu archivo de Google Sheets">
              <i className="fab fa-google-drive"></i> <span>Google Sheets</span>
            </button>
            <button type="button" className="btn-export btn-export-print" onClick={() => imprimirReporteCustom(datos, data, extrasVista, activas, fCargo)} title="Imprimir o guardar como PDF">
              <i className="fas fa-print"></i> <span>Imprimir / PDF</span>
            </button>
          </div>
        </div>

        <div className="reportes-toolbar-row reportes-row-secondary">
          <div className="reportes-search-wrap">
            <i className="fas fa-search search-icon"></i>
            <input type="text" id="searchReportesCustom" className="search-input-compact" placeholder="Buscar por colaborador, cédula o área..." value={busqueda} onChange={ev => setBusqueda(ev.target.value)} />
          </div>
          <div className="reportes-quick-filters" id="filtrosRapidosCargo">
            {FILTROS_RAPIDOS.map(b => (
              <button key={b.val || 'todos'} type="button" className={`btn-filter-pill${b.clase || ''}${f.cargo === b.val ? ' active' : ''}`} style={estiloPill(b.val)} onClick={() => setFiltroRapido(b.val)} title={b.title}>{b.texto}</button>
            ))}
          </div>
          <div className="reportes-templates-group">
            <span className="templates-label"><i className="fas fa-layer-group" style={s('color:var(--blue);')}></i> Vistas:</span>
            <button type="button" className="btn-template-pill" onClick={() => cargarPlantilla('almuerzos')} title="Ver columnas de almuerzos en planta y fuera"><i className="fas fa-utensils"></i> Almuerzos</button>
            <button type="button" className="btn-template-pill" onClick={() => cargarPlantilla('extras')} title="Ver horas extra 50%, 100% y campo"><i className="fas fa-clock"></i> H. Extra</button>
            <button type="button" className="btn-template-pill" onClick={() => cargarPlantilla('asistencias')} title="Ver asistencias, atrasos y puntualidad"><i className="fas fa-calendar-check"></i> Asistencia</button>
            <button type="button" className="btn-template-pill" onClick={() => cargarPlantilla('completo')} title="Ver todas las columnas"><i className="fas fa-th"></i> Completo</button>
          </div>
          <div className="reportes-columns-tools">
            <button type="button" id="btnToggleColsLayout" className={`btn-toggle-cols${drawer ? ' active' : ''}`} onClick={() => setDrawer(d => !d)}
              style={drawer ? s('background:#eff6ff; border-color:#2563eb; color:#1e40af;') : undefined} title="Abrir/Cerrar selector interactivo de columnas">
              <i className="fas fa-columns" style={s('color:var(--red);')}></i> Columnas (<span id="lblCountColsActivas">{cols.length}</span>) <i className="fas fa-chevron-down toggle-arrow"></i>
            </button>
          </div>
          <div className="reportes-toggles-minor">
            <label className="toggle-checkbox-label" title="Incluir desvinculados en el cálculo general">
              <input type="checkbox" id="chkIncluirDesvinculadosRep" checked={f.incluirDesv} onChange={ev => filtrosRep.set({ incluirDesv: ev.target.checked })} />
              <span>+ Desvinculados</span>
            </label>
            <label className="toggle-checkbox-label" title="Incluir eliminados en el cálculo general">
              <input type="checkbox" id="chkIncluirEliminadosRep" checked={f.incluirElim} onChange={ev => filtrosRep.set({ incluirElim: ev.target.checked })} />
              <span>+ Eliminados</span>
            </label>
          </div>
          <div id="reporteCustomInfo" className="reporte-custom-counter">{empCache.length ? info : 'Cargando información...'}</div>
        </div>
      </div>

      <div id="reportsLayoutContainer" className="reports-columns-drawer" style={s(`display:${drawer && !esExtras ? 'block' : 'none'};`)}>
        <div className="drawer-header">
          <div className="drawer-title">
            <i className="fas fa-sliders-h" style={s('color:var(--blue);')}></i>
            <strong>Personalizar Columnas del Reporte</strong>
            <span className="drawer-hint">(Haz clic sobre cada columna para activarla o desactivarla en la tabla y exportaciones)</span>
          </div>
          <div className="drawer-actions">
            <button type="button" className="btn-drawer-link" onClick={restablecerColumnasDefault}><i className="fas fa-undo-alt"></i> Restablecer por Defecto</button>
            <button type="button" className="btn-drawer-close" onClick={() => setDrawer(false)} title="Cerrar selector de columnas"><i className="fas fa-times"></i></button>
          </div>
        </div>
        <div id="columnasSelectorInteractivo" className="columns-selector-chips">
          {COLUMNAS_DISPONIBLES.map(col => {
            const act = cols.includes(col.id);
            return (
              <div key={col.id} className={`chip-item ${act ? 'activa' : 'disponible'}`} onClick={() => alternarCol(col.id)}
                style={act ? { borderColor: col.color, backgroundColor: col.colorBg, color: col.color } : { borderColor: 'var(--g200)', backgroundColor: '#ffffff', color: 'var(--g600)' }}>
                {act ? <><i className={`fas ${col.icono}`} style={{ color: col.color }}></i> <span style={s('font-weight:700;')}>{col.label}</span></>
                  : <><i className={`fas ${col.icono}`} style={s('opacity:0.4;')}></i> <span>{col.label}</span></>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="reportes-table-card">
        <div className="top-scroll-wrapper" id="customRepTopScroll" ref={refTop} style={s('overflow-x: auto; overflow-y: hidden; height: 12px; margin-bottom: 2px;')}>
          <div className="top-scroll-dummy" ref={refDummy} style={s('height: 1px; width: 100%;')}></div>
        </div>
        <div className="table-wrapper-enhanced" id="tablaReportesCustomWrapper">
          <div className="scroll-hint" style={s('background:#f8fafc; border-bottom:1px solid var(--g200); padding: 4px 12px; font-size: 11px; color: var(--g500);')}><i className="fas fa-arrows-alt-h"></i> Desplazamiento lateral disponible — Haz clic en una columna para ordenar — Haz clic en un empleado para ver su desglose individual</div>
          <div className="table-scroll-wrap" id="reporteCustomScroll" ref={refScroll}>
            <table className="employee-table table-compact">
              <thead>
                <tr id="reporteCustomHeaders">
                  {esExtras ? <>
                    <th onClick={() => ordenarPor('fecha')} style={s('cursor:pointer')}>Fecha <IconoOrden orden={orden} col="fecha" /></th>
                    <th onClick={() => ordenarPor('nombre')} style={s('cursor:pointer')}>Descripción <IconoOrden orden={orden} col="nombre" /></th>
                    <th onClick={() => ordenarPor('cantidad')} style={s('text-align:center; cursor:pointer')}>Cantidad <IconoOrden orden={orden} col="cantidad" /></th>
                    <th onClick={() => ordenarPor('empresa')} style={s('cursor:pointer')}>Empresa/Destino <IconoOrden orden={orden} col="empresa" /></th>
                    <th onClick={() => ordenarPor('observaciones')} style={s('cursor:pointer')}>Observaciones <IconoOrden orden={orden} col="observaciones" /></th>
                    <th onClick={() => ordenarPor('tipo')} style={s('cursor:pointer')}>Tipo <IconoOrden orden={orden} col="tipo" /></th>
                  </> : <>
                    <th onClick={() => ordenarPor('nombre')} style={s('cursor:pointer; min-width:230px; background:#f8fafc; border-bottom:2.5px solid #2563eb;')}>
                      <div style={s('display:flex; align-items:center; gap:6px;')}>
                        <i className="fas fa-user-tie" style={s('color:#2563eb; font-size:12px;')}></i>
                        <span style={s('font-weight:700; color:#1e293b;')}>COLABORADOR</span>
                        <IconoOrden orden={orden} col="nombre" />
                      </div>
                    </th>
                    {activas.map(col => col.id === 'area' ? (
                      <th key={col.id} onClick={() => ordenarPor('area')} style={s('cursor:pointer; min-width:140px; background:#f8fafc; border-bottom:2.5px solid #64748b;')}>
                        <div style={s('display:flex; align-items:center; gap:5px;')}>
                          <i className={`fas ${col.icono}`} style={s(`color:${col.color}; font-size:11px; margin-right:4px;`)}></i><span style={s('font-weight:700; color:#334155;')}>ÁREA</span> <IconoOrden orden={orden} col="area" />
                        </div>
                      </th>
                    ) : (
                      <th key={col.id} onClick={() => ordenarPor(col.id)} style={s(`text-align:center; cursor:pointer; min-width:115px; background:${col.colorBg}; border-bottom:2.5px solid ${col.color};`)}>
                        <div style={s('display:flex; align-items:center; justify-content:center; gap:4px;')} title={col.catLabel || col.label}>
                          <i className={`fas ${col.icono}`} style={s(`color:${col.color}; font-size:11px; margin-right:4px;`)}></i><span style={s(`color:${col.color}; font-weight:700;`)}>{col.label}</span> <IconoOrden orden={orden} col={col.id} />
                        </div>
                      </th>
                    ))}
                  </>}
                </tr>
              </thead>
              <tbody id="reporteCustomBody">
                {!empCache.length ? (
                  <tr><td colSpan={12} style={s('text-align:center; padding:45px; color:var(--g500);')}>
                    <i className="fas fa-spinner fa-spin" style={s('font-size:24px; color:var(--blue); margin-bottom:10px; display:block;')}></i>
                    Cargando datos de colaboradores y registros...
                  </td></tr>
                ) : esExtras ? (
                  !extrasVista.length
                    ? <tr><td colSpan={6} style={s('text-align:center; padding:30px; color:var(--g500);')}><i className="fas fa-search" style={s('font-size:18px; margin-bottom:8px; display:block;')}></i> No hay almuerzos extras registrados en este rango/período ({rango.labelRango}).</td></tr>
                    : extrasVista.map((ae: any, i: number) => (
                      <tr key={ae.id || i}>
                        <td style={s("font-family:'Fira Code',monospace;font-size:11px")}>{formatearFechaA_DMY(ae.fecha)}</td>
                        <td><div className="employee-cell">
                          <div className="employee-photo-placeholder" style={s('background:var(--indigo-lt); color:var(--indigo); display:flex; align-items:center; justify-content:center;')}><i className="fas fa-utensils"></i></div>
                          <strong>{nombreExtra(ae)}</strong>
                        </div></td>
                        <td style={s('text-align:center')}><span className="pill late" style={s('font-weight:700;font-size:11px;padding:2px 7px')}>{ae.cantidad || 1}</span></td>
                        <td>{ae.empresa || '—'}</td>
                        <td>{ae.observaciones || '—'}</td>
                        <td><span className="pill ok" style={s('font-size:10px;padding:2px 7px')}>{tipoExtra(ae)}</span></td>
                      </tr>
                    ))
                ) : !data.length ? (
                  <tr><td colSpan={cols.length + 1} style={s('text-align:center; padding:35px; color:var(--g500);')}><i className="fas fa-search" style={s('font-size:22px; margin-bottom:8px; display:block; color:var(--blue);')}></i> No se encontraron resultados para el rango/período (<strong>{rango.labelRango}</strong>).</td></tr>
                ) : <>
                  {data.map(e => <FilaReporte key={e.id} e={e} activas={activas} onClick={() => mostrarDetalle(e.id, rango.periodoIdx, rango.R_INI, rango.R_FIN)} />)}
                  <tr className="rep-totals-row">
                    <td style={s('padding:10px 14px;')}>
                      <div style={s('display:flex; align-items:center; gap:6px;')}><i className="fas fa-calculator" style={s('color:#38bdf8;')}></i><span>TOTALES / PROMEDIOS</span></div>
                    </td>
                    {activas.map(col => col.id === 'area' ? <td key={col.id} style={s('text-align:center; color:#64748b;')}>—</td> : (
                      <td key={col.id} style={s('text-align:center;')}>
                        <span style={s("font-family:'Fira Code',monospace; font-size:11.5px; font-weight:800; color:#ffffff;")}>{totalColumna(data, col)}</span>
                      </td>
                    ))}
                  </tr>
                </>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function FilaReporte({ e, activas, onClick }: { e: StatReporte; activas: Columna[]; onClick: () => void }) {
  const esDesv = e.esDesvinculado || (e.cargo || '').toLowerCase() === 'desvinculado' || (e.area || '').toLowerCase() === 'desvinculado';
  const fSalidaStr = (e.fecha_salida || e.fechaDesvinculacion) ? (normalizarFechaStr(e.fecha_salida || e.fechaDesvinculacion) || e.fecha_salida) : '';
  return (
    <tr onClick={onClick} style={s('cursor:pointer')} title={`Ver detalle de asistencia de ${e.nombre}`}>
      <td><div className="employee-cell"><PhotoCell e={e} /><span style={s('font-weight:600; color:#0f172a;')}>
        {e.nombre}
        {esDesv ? <>
          {' '}<span className="pill" style={s('font-size:9.5px; padding:2px 7px; background:#f5f3ff; color:#7c3aed; font-weight:700; border:1px solid #ddd6fe;')} title="Colaborador Desvinculado"><i className="fas fa-user-slash"></i> Desvinculado</span>
          {fSalidaStr && <>{' '}<span style={s('font-size:10px; color:#8b5cf6; font-weight:600; margin-left:2px;')}>(Salida: {fSalidaStr})</span></>}
        </> : e.esEliminado ? <>
          {' '}<span className="pill" style={s('font-size:9px; padding:1px 6px; background:#ffe4e6; color:#e11d48; font-weight:700; border:1px solid #fecdd3;')} title="Colaborador eliminado con registros históricos">🗑️ Eliminado</span>
        </> : null}
      </span></div></td>
      {activas.map(col => col.id === 'area' ? (
        <td key={col.id}><span style={s('color:#475569; font-weight:600; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;')}><i className="fas fa-building" style={s('font-size:9px; opacity:0.4;')}></i> {e.area || '—'}</span></td>
      ) : <td key={col.id} style={s('text-align:center;')}><Celda col={col} valor={e[col.id]} /></td>)}
    </tr>
  );
}

function totalColumna(data: StatReporte[], col: Columna): string | number {
  const total = data.reduce((acc, e) => acc + (parseFloat(e[col.id]) || 0), 0);
  if (col.tipo === 'tiempo') return minutosAHHMMSS(total);
  if (col.tipo === 'pct') return `${data.length ? Math.round(total / data.length) : 0}%`;
  return total;
}

// ─── Exportación a Excel (HTML con estilos, .xls) — exportarExcelReporteCustom ───
const CAT_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  asistencia: { label: 'ASISTENCIA Y PUNTUALIDAD', bg: '#065f46', color: '#ffffff' },
  almuerzos: { label: 'ALMUERZOS', bg: '#0369a1', color: '#ffffff' },
  permisos: { label: 'PERMISOS Y DESCUENTOS', bg: '#6d28d9', color: '#ffffff' },
  extras: { label: 'HORAS EXTRAORDINARIAS', bg: '#1e40af', color: '#ffffff' },
  campo: { label: 'TRABAJO EN CAMPO', bg: '#0e7490', color: '#ffffff' },
  totalesExtras: { label: 'TOTALES EXTRAS NÓMINA', bg: '#1e1b4b', color: '#ffffff' },
  general: { label: 'INFORMACIÓN GENERAL', bg: '#334155', color: '#ffffff' },
};

const COLOR_NUM: Record<string, [string, string, string]> = {
  faltas: ['#fee2e2', '#991b1b', 'bold'], diasCampo: ['#ecfeff', '#0891b2', 'bold'], diasVacaciones: ['#ecfdf5', '#059669', 'bold'],
  diasJustificados: ['#f5f3ff', '#7c3aed', 'bold'], diasExtras: ['#eef2ff', '#4338ca', 'bold'], atrasos: ['#fef3c7', '#92400e', 'bold'],
  asistencias: ['#ecfdf5', '#047857', 'bold'], entradas: ['#ecfdf5', '#059669', 'bold'], entradasAuto: ['#fffbeb', '#d97706', 'bold'],
  salidas: ['#f0f9ff', '#0284c7', 'bold'], salidasAuto: ['#faf5ff', '#7c3aed', 'bold'], almPlanta: ['#f0f9ff', '#0369a1', '600'], almFuera: ['#f0f9ff', '#0369a1', '600'],
};

function exportarExcelReporteCustom(datos: DatosReporte, data: StatReporte[], extras: any[], activeCols: Columna[], fCargo: string) {
  const { rango } = datos;
  const esExtras = fCargo === 'almuerzos extra';
  const hasData = esExtras ? extras.length > 0 : datos.stats.length > 0;
  if (!hasData) { mostrarToast('No hay datos para exportar', 'warning'); return; }
  const safeFileName = (rango.labelCorto || 'Reporte').replace(/[^a-zA-Z0-9_-]/g, '_');
  let tableContentHtml = '';
  let totalCols = 0;

  if (esExtras) {
    totalCols = 6;
    const totalCant = extras.reduce((acc, ae) => acc + (parseInt(ae.cantidad || 0) || 0), 0);
    const th = (t: string, align: string) => `<th style="background-color:#0284c7; color:#ffffff; font-weight:bold; height:32px; text-align:${align}; border:0.5pt solid #0369a1; font-size:10pt;${align === 'left' ? ' padding-left:8px;' : ''}">${t}</th>`;
    const rowsHtml = extras.map((ae, idx) => {
      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      return `<tr>
            <td style="background-color:${rowBg}; font-family:Consolas, monospace; font-size:10pt; text-align:center; border:0.5pt solid #cbd5e1; height:26px; mso-number-format:\\@;">${formatearFechaA_DMY(ae.fecha)}</td>
            <td style="background-color:${rowBg}; font-weight:600; color:#0f172a; border:0.5pt solid #cbd5e1; padding:4px 8px; height:26px;">${escapeHtml(nombreExtra(ae))}</td>
            <td style="background-color:${rowBg}; text-align:center; font-weight:bold; color:#0284c7; border:0.5pt solid #cbd5e1; height:26px;">${ae.cantidad || 1}</td>
            <td style="background-color:${rowBg}; color:#334155; border:0.5pt solid #cbd5e1; padding:4px 8px; height:26px;">${escapeHtml(ae.empresa || '—')}</td>
            <td style="background-color:${rowBg}; color:#475569; border:0.5pt solid #cbd5e1; padding:4px 8px; height:26px;">${escapeHtml(ae.observaciones || '—')}</td>
            <td style="background-color:${rowBg}; text-align:center; font-weight:600; color:#047857; border:0.5pt solid #cbd5e1; height:26px;">${escapeHtml(tipoExtra(ae))}</td>
          </tr>`;
    }).join('');
    tableContentHtml = `
      <thead><tr>${th('FECHA', 'center')}${th('DESCRIPCIÓN', 'left')}${th('CANTIDAD', 'center')}${th('EMPRESA / DESTINO', 'left')}${th('OBSERVACIONES', 'left')}${th('TIPO', 'center')}</tr></thead>
      <tbody>
        ${rowsHtml}
        <tr>
          <td colspan="2" style="background-color:#0f172a; color:#ffffff; font-weight:bold; text-align:left; height:32px; border:1pt solid #0f172a; font-size:10pt; padding-left:8px;">TOTAL ALMUERZOS EXTRAS CONSOLIDADOS</td>
          <td style="background-color:#0f172a; color:#fde047; font-weight:bold; text-align:center; height:32px; border:1pt solid #0f172a; font-size:11pt;">${totalCant}</td>
          <td colspan="3" style="background-color:#0f172a; color:#94a3b8; font-size:9pt; text-align:left; border:1pt solid #0f172a; padding-left:8px;">${extras.length} Registros de consumo</td>
        </tr>
      </tbody>`;
  } else {
    totalCols = activeCols.length + 2;
    let superHeadersHtml = `<th colspan="2" style="background-color:#1e293b; color:#ffffff; font-weight:bold; text-align:center; height:28px; border:0.5pt solid #334155; font-size:9.5pt; letter-spacing:0.5px;">DATOS DEL COLABORADOR</th>`;
    const superTh = (cat: string, n: number) => {
      const cfg = CAT_STYLES[cat] || { label: cat.toUpperCase(), bg: '#334155', color: '#ffffff' };
      return `<th colspan="${n}" style="background-color:${cfg.bg}; color:${cfg.color}; font-weight:bold; text-align:center; height:28px; border:0.5pt solid #475569; font-size:9pt; letter-spacing:0.5px;">${cfg.label}</th>`;
    };
    let currentCat: string | null = null;
    let currentCatCount = 0;
    activeCols.forEach((col, idx) => {
      const cat = col.cat || 'general';
      if (cat !== currentCat) {
        if (currentCat !== null) superHeadersHtml += superTh(currentCat, currentCatCount);
        currentCat = cat;
        currentCatCount = 1;
      } else currentCatCount++;
      if (idx === activeCols.length - 1) superHeadersHtml += superTh(currentCat as string, currentCatCount);
    });
    let colHeadersHtml = `
      <th style="background-color:#334155; color:#ffffff; font-weight:bold; height:34px; text-align:left; border:0.5pt solid #475569; font-size:9.5pt; padding:4px 8px; min-width:200px;">COLABORADOR</th>
      <th style="background-color:#334155; color:#ffffff; font-weight:bold; height:34px; text-align:left; border:0.5pt solid #475569; font-size:9.5pt; padding:4px 8px; min-width:130px;">ÁREA / CARGO</th>`;
    activeCols.forEach(col => {
      colHeadersHtml += `<th style="background-color:${col.colorHeader || '#1e40af'}; color:#ffffff; font-weight:bold; height:34px; text-align:center; border:0.5pt solid #475569; font-size:9pt; padding:4px 6px; text-transform:uppercase; min-width:85px;">${col.label}</th>`;
    });

    const rowsHtml = data.map((e, rowIndex) => {
      const rowBg = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
      let rowCells = `
        <td style="background-color:${rowBg}; color:#0f172a; font-weight:600; text-align:left; border:0.5pt solid #cbd5e1; padding:5px 8px; height:26px;">${escapeHtml(e.nombre)}</td>
        <td style="background-color:${rowBg}; color:#475569; text-align:left; border:0.5pt solid #cbd5e1; padding:5px 8px; height:26px;">${escapeHtml(e.area || '—')}</td>`;
      activeCols.forEach(col => {
        const valor = e[col.id];
        let displayVal: any = '';
        let cellBg = rowBg, cellColor = '#1e293b', cellWeight = 'normal', cellFont = 'Arial, sans-serif', borderCustom = '';
        if (col.tipo === 'tiempo') {
          const mins = Number(valor) || 0;
          displayVal = mins > 0 ? minutosAHHMMSS(mins) : '—';
          cellFont = 'Consolas, monospace';
          if (col.id === 'minutosAtrasos' && mins > 0) { cellBg = '#fef3c7'; cellColor = '#92400e'; cellWeight = 'bold'; }
          else if (col.id === 'tiempoADescontar' && mins > 0) { cellBg = '#ffe4e6'; cellColor = '#9f1239'; cellWeight = 'bold'; }
          else if (col.id === 'horasExtra50' && mins > 0) { cellBg = '#eff6ff'; cellColor = '#1d4ed8'; cellWeight = 'bold'; }
          else if (col.id === 'horasExtra100' && mins > 0) { cellBg = '#eef2ff'; cellColor = '#4338ca'; cellWeight = 'bold'; }
          else if (col.id === 'totalExtras50' && mins > 0) { cellBg = '#dbeafe'; cellColor = '#1e3a8a'; cellWeight = 'bold'; borderCustom = 'border-left:1pt solid #93c5fd; border-right:1pt solid #93c5fd;'; }
          else if (col.id === 'totalExtras100' && mins > 0) { cellBg = '#e0e7ff'; cellColor = '#312e81'; cellWeight = 'bold'; borderCustom = 'border-left:1pt solid #a5b4fc; border-right:1pt solid #a5b4fc;'; }
          else if (col.cat === 'campo' && mins > 0) { cellBg = '#ecfeff'; cellColor = '#0891b2'; cellWeight = 'bold'; }
          else if (col.cat === 'permisos' && mins > 0) { cellBg = '#f5f3ff'; cellColor = '#7c3aed'; cellWeight = 'bold'; }
          else if (mins === 0) cellColor = '#94a3b8';
        } else if (col.tipo === 'pct') {
          const num = Number(valor) || 0;
          displayVal = `${num}%`;
          cellWeight = 'bold';
          if (num >= 90) { cellBg = '#dcfce7'; cellColor = '#15803d'; }
          else if (num >= 75) { cellBg = '#fef9c3'; cellColor = '#854d0e'; }
          else { cellBg = '#fee2e2'; cellColor = '#991b1b'; }
        } else {
          const num = Number(valor) || 0;
          displayVal = num;
          const c = COLOR_NUM[col.id];
          if (c && num > 0) { [cellBg, cellColor, cellWeight] = c; }
          else if (c || num === 0) cellColor = '#94a3b8';
        }
        rowCells += `<td style="background-color:${cellBg}; color:${cellColor}; font-weight:${cellWeight}; font-family:${cellFont}; font-size:9.5pt; text-align:center; border:0.5pt solid #cbd5e1; height:26px; padding:3px 6px; ${borderCustom} mso-number-format:\\@;">${displayVal}</td>`;
      });
      return `<tr>${rowCells}</tr>`;
    }).join('');

    let totalsCellsHtml = `<td colspan="2" style="background-color:#0f172a; color:#ffffff; font-weight:bold; text-align:left; height:34px; border:1pt solid #0f172a; font-size:10pt; padding:6px 10px; letter-spacing:0.5px;">TOTALES / PROMEDIOS (${data.length} COLABORADORES)</td>`;
    activeCols.forEach(col => {
      const sum = data.reduce((acc, e) => acc + (Number(e[col.id]) || 0), 0);
      if (col.tipo === 'pct') {
        totalsCellsHtml += `<td style="background-color:#0f172a; color:#4ade80; font-weight:bold; text-align:center; height:34px; border:1pt solid #0f172a; font-size:10pt; mso-number-format:\\@;">${data.length ? Math.round(sum / data.length) : 0}%</td>`;
      } else if (col.tipo === 'tiempo') {
        totalsCellsHtml += `<td style="background-color:#0f172a; color:#fde047; font-weight:bold; text-align:center; height:34px; border:1pt solid #0f172a; font-size:9.5pt; font-family:Consolas, monospace; mso-number-format:\\@;">${minutosAHHMMSS(sum)}</td>`;
      } else {
        totalsCellsHtml += `<td style="background-color:#0f172a; color:#ffffff; font-weight:bold; text-align:center; height:34px; border:1pt solid #0f172a; font-size:10pt;">${sum}</td>`;
      }
    });
    tableContentHtml = `
      <thead><tr>${superHeadersHtml}</tr><tr>${colHeadersHtml}</tr></thead>
      <tbody>${rowsHtml}<tr>${totalsCellsHtml}</tr></tbody>`;
  }

  const sigCol1 = Math.max(1, Math.floor(totalCols / 3));
  const sigCol2 = Math.max(1, Math.floor(totalCols / 3));
  const sigCol3 = Math.max(1, totalCols - sigCol1 - sigCol2);
  const excelHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Reporte Asistencia</x:Name><x:WorksheetOptions><x:DisplayGridlines/><x:Print><x:Orientation>Landscape</x:Orientation></x:Print></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      <style>table { border-collapse:collapse; font-family:Arial, sans-serif; } th { font-family:Arial, sans-serif; } td { font-family:Arial, sans-serif; }</style>
    </head>
    <body>
      <table>
        <tr><td colspan="${totalCols}" style="background-color:#0f172a; color:#ffffff; font-size:15pt; font-weight:bold; height:42px; text-align:center; vertical-align:middle; border:1pt solid #0f172a; letter-spacing:1px;">TCONTROL S.A. &mdash; REPORTE CONSOLIDADO DE ASISTENCIA Y NÓMINA</td></tr>
        <tr><td colspan="${totalCols}" style="background-color:#1e293b; color:#94a3b8; font-size:9pt; height:24px; text-align:center; vertical-align:middle; border:1pt solid #1e293b;">
          ${rango.esFiltroPersonalizado ? 'Rango de Fechas' : 'Período Nómina'}: <strong style="color:#38bdf8;">${escapeHtml(rango.labelRango)}</strong> &nbsp;|&nbsp;
          Filtro: <strong style="color:#ffffff;">${fCargo ? escapeHtml(fCargo.toUpperCase()) : 'TODOS LOS COLABORADORES'}</strong> &nbsp;|&nbsp;
          Generado: <strong style="color:#ffffff;">${marcaTiempoAhora()}</strong>
        </td></tr>
        <tr><td colspan="${totalCols}" style="height:12px; border:none;"></td></tr>
        ${tableContentHtml}
        <tr><td colspan="${totalCols}" style="height:14px; border:none;"></td></tr>
        <tr><td colspan="${totalCols}" style="background-color:#f8fafc; color:#64748b; font-size:8pt; font-style:italic; border:0.5pt solid #cbd5e1; height:24px; padding:4px 8px; text-align:center;">CONFIDENCIAL &mdash; TCONTROL S.A. | Información laboral protegida por la Ley Orgánica de Protección de Datos Personales (LOPDP Ecuador) y el Código del Trabajo. Exclusivo para gestión interna y auditoría patronal autorizada.</td></tr>
        <tr><td colspan="${totalCols}" style="height:35px; border:none;"></td></tr>
        <tr>
          <td colspan="${sigCol1}" style="border-top:1.5pt solid #475569; text-align:center; font-size:9pt; font-weight:bold; color:#1e293b; padding-top:6px;">ELABORADO POR<br><span style="font-size:8pt; font-weight:normal; color:#64748b;">Supervisor de Turno / RRHH</span></td>
          <td colspan="${sigCol2}" style="border-top:1.5pt solid #475569; text-align:center; font-size:9pt; font-weight:bold; color:#1e293b; padding-top:6px;">REVISADO POR<br><span style="font-size:8pt; font-weight:normal; color:#64748b;">Jefatura de Talento Humano</span></td>
          <td colspan="${sigCol3}" style="border-top:1.5pt solid #475569; text-align:center; font-size:9pt; font-weight:bold; color:#1e293b; padding-top:6px;">APROBADO POR<br><span style="font-size:8pt; font-weight:normal; color:#64748b;">Gerencia General / Auditoría</span></td>
        </tr>
      </table>
    </body>
    </html>`;
  descargarBlob(excelHtml, 'application/vnd.ms-excel;charset=utf-8;', `Reporte_Asistencia_${safeFileName}.xls`);
  mostrarToast('Reporte exportado a Excel con estilos premium', 'success');
}

// ─── Imprimir / PDF — imprimirReporteCustom ───
function imprimirReporteCustom(datos: DatosReporte, data: StatReporte[], extras: any[], activeCols: Columna[], fCargo: string) {
  const { rango } = datos;
  const esExtras = fCargo === 'almuerzos extra';
  const hasData = esExtras ? extras.length > 0 : datos.stats.length > 0;
  if (!hasData) { mostrarToast('No hay datos para imprimir', 'warning'); return; }
  const printWindow = window.open('', '_blank');
  if (!printWindow) { mostrarToast('Error al abrir la ventana de impresión. Por favor habilite los pop-ups.', 'error'); return; }
  let headersHtml = '', bodyHtml = '', totalMetaLabel = '', tituloReporte = '';
  if (esExtras) {
    headersHtml = '<th>Fecha</th><th>Descripción</th><th style="text-align:center;">Cantidad</th><th>Empresa/Destino</th><th>Observaciones</th><th>Tipo</th>';
    tituloReporte = 'TCONTROL S.A. - REPORTE DE ALMUERZOS EXTRAS';
    const totalQty = extras.reduce((acc, ae) => acc + (parseInt(ae.cantidad || 0) || 0), 0);
    totalMetaLabel = `Total Almuerzos Extras: ${totalQty} | Registros: ${extras.length}`;
    bodyHtml = extras.map(ae => `<tr>
            <td style="font-family:monospace;">${formatearFechaA_DMY(ae.fecha)}</td>
            <td style="font-weight:600;">${escapeHtml(nombreExtra(ae))}</td>
            <td style="text-align:center;">${ae.cantidad || 1}</td>
            <td>${escapeHtml(ae.empresa || '—')}</td>
            <td>${escapeHtml(ae.observaciones || '—')}</td>
            <td>${escapeHtml(tipoExtra(ae))}</td>
          </tr>`).join('');
  } else {
    headersHtml = '<th>Empleado</th><th>Área</th>' + activeCols.map(col => `<th>${col.label}</th>`).join('');
    tituloReporte = 'TCONTROL S.A. - REPORTE OFICIAL DE ASISTENCIA';
    totalMetaLabel = `Total Empleados Evaluados: ${data.length}`;
    bodyHtml = data.map(e => `<tr><td style="font-weight:600;">${escapeHtml(e.nombre)}</td><td>${escapeHtml(e.area || '—')}</td>${activeCols.map(col => {
      const v = e[col.id];
      const c = col.tipo === 'tiempo' ? minutosAHHMMSS(v) : col.tipo === 'pct' ? `${v}%` : escapeHtml(v);
      return `<td style="text-align:center;">${c}</td>`;
    }).join('')}</tr>`).join('');
  }
  printWindow.document.write(`<!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${tituloReporte} - ${escapeHtml(rango.labelRango)}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #333; padding: 20px; margin: 0; }
            .header { text-align: center; margin-bottom: 25px; border-bottom: 3px solid #1e40af; padding-bottom: 12px; }
            .header h1 { margin: 0; font-size: 22px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
            .header p { margin: 6px 0 0 0; font-size: 13px; color: #4b5563; font-weight: bold; }
            .info-meta { display: flex; justify-content: space-between; font-size: 11px; color: #64748b; margin-bottom: 15px; font-weight: 600; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background-color: #1e40af; color: #ffffff; font-weight: bold; text-align: left; padding: 8px 6px; font-size: 10px; text-transform: uppercase; border: 1px solid #cbd5e1; }
            td { padding: 7px 6px; font-size: 10px; border: 1px solid #cbd5e1; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 15px; }
            @page { size: A4 landscape; margin: 12mm; }
          </style>
        </head>
        <body>
          <div class="header"><h1>${tituloReporte}</h1><p>${rango.esFiltroPersonalizado ? 'Filtro de Fechas: ' : 'Período: '}${escapeHtml(rango.labelRango)}</p></div>
          <div class="info-meta"><div>Generado el: ${marcaTiempoAhora()}</div><div>${totalMetaLabel}</div></div>
          <table><thead><tr>${headersHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
          <div class="footer">
            <strong>TCONTROL S.A.</strong> — Sistema de Gestión de Asistencia y Jornada Laboral CONTROL 2026<br>
            <span style="font-size: 8.5px; color: #64748b;">DOCUMENTO CONFIDENCIAL: Contiene datos personales y de asistencia amparados por la Ley Orgánica de Protección de Datos Personales (LOPDP Ecuador). Su uso se limita estrictamente a fines de control laboral y auditoría patronal autorizada. Prohibida su divulgación o copia sin autorización.</span>
          </div>
        </body>
        </html>`);
  printWindow.document.close();
  // El legado imprimía en window.onload y cerraba la ventana 600 ms después
  window.setTimeout(() => { printWindow.focus(); printWindow.print(); window.setTimeout(() => printWindow.close(), 600); }, 300);
}
