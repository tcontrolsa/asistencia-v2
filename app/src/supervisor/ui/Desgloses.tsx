// Modales de desglose del Dashboard: histórico base de asistencia y diferencias (#modalDesgloseHistoricoBase)
// y auditoría de vacaciones (#modalDesgloseVacaciones).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react';
import { s } from '../../lib/estilo';
import { descargarExcel } from '../excel';
import { formatDias } from '../legado/dashboard';
import { calcularDesgloseVacaciones, calcularHistoricoBase, esOpcionAnual, inicioDatosHistorico } from '../legado/desgloses';
import { getLocalHoyStr } from '../legado/util';
import { cerrarModal, irADetalleFecha, mostrarDetalle, useModal } from '../nav';
import { useFiltrosRep } from '../reportesEstado';
import { asegurarRegistros, cargarDatosCompletos, useSup } from '../store';
import { errorTexto, mostrarToast } from './comun';

export function ModalesDesglose() {
  const hist = useModal<{ periodo?: string }>('desgloseHistorico');
  const vac = useModal('desgloseVacaciones');
  return (
    <>
      {hist && <ModalDesgloseHistorico preseleccion={hist.periodo} />}
      {vac && <ModalDesgloseVacaciones />}
    </>
  );
}

const cerrarBtn = 'background: none; border: none; font-size: 20px; color: #94a3b8; cursor: pointer; padding: 4px 8px; border-radius: 6px;';

function ModalDesgloseHistorico({ preseleccion }: { preseleccion?: string }) {
  const empCache = useSup(x => x.empCache);
  const periodos = useSup(x => x.periodos);
  const vacaciones = useSup(x => x.vacaciones);
  const version = useSup(x => x.version);
  const f = useFiltrosRep();
  const [opcion, setOpcion] = useState(preseleccion || 'DASHBOARD');
  const [busqueda, setBusqueda] = useState('');
  const [sincronizando, setSincronizando] = useState(false);
  const [cargandoRango, setCargandoRango] = useState(false);
  const refSel = useRef<HTMLSelectElement>(null);
  const hoy = getLocalHoyStr();
  const cerrar = () => cerrarModal('desgloseHistorico');

  // El legado tenía el histórico completo en memoria; aquí se trae el rango al elegir la opción
  useEffect(() => {
    let vivo = true;
    setCargandoRango(true);
    asegurarRegistros(inicioDatosHistorico(opcion, periodos, f.periodoIdx, hoy), hoy)
      .catch(e => mostrarToast('Error al procesar el desglose histórico: ' + errorTexto(e), 'error'))
      .finally(() => { if (vivo) setCargandoRango(false); });
    return () => { vivo = false; };
  }, [opcion, periodos, f.periodoIdx, hoy]);

  const datos = useMemo(() => (empCache.length ? calcularHistoricoBase(empCache, opcion, periodos, f.periodoIdx, hoy, vacaciones as any) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [empCache, opcion, periodos, f.periodoIdx, hoy, vacaciones, version]);
  const q = busqueda.toLowerCase().trim();
  const lista = !datos ? [] : !q ? datos.filas : datos.filas.filter(i => i.nombre.toLowerCase().includes(q) || i.cargo.toLowerCase().includes(q) || i.area.toLowerCase().includes(q));
  const esAnual = esOpcionAnual(opcion);
  const pDash = periodos[f.periodoIdx] || periodos[0];

  const seleccionarModo = (modo: 'mensual' | 'anual') => {
    if (modo === 'anual') { if (!esOpcionAnual(opcion)) setOpcion('ANUAL'); }
    else if (esOpcionAnual(opcion)) setOpcion('DASHBOARD');
  };

  const sincronizar = async () => {
    setSincronizando(true);
    mostrarToast('Sincronizando histórico completo desde la base de datos...', 'info');
    try {
      await cargarDatosCompletos({ silencioso: true });
      await asegurarRegistros(inicioDatosHistorico(opcion, periodos, f.periodoIdx, hoy), hoy);
      mostrarToast('¡Sincronización histórica completada exitosamente!', 'success');
    } catch (e) {
      mostrarToast('Error en la sincronización: ' + errorTexto(e), 'error');
    } finally { setSincronizando(false); }
  };

  const exportar = async () => {
    if (!datos || !datos.filas.length) { mostrarToast('No hay datos para exportar', 'warning'); return; }
    try {
      const enc = ['#', 'Colaborador', 'Cargo', 'Área', 'Rango Evaluado', 'Asistencias Esperadas', 'Asistencias Ordinarias', 'Vacaciones Tomadas',
        'Permisos y Justificaciones', 'Diferencia (Ausencias Injustificadas)', 'Fechas Inasistencias', 'Días Extras', '% Cumplimiento', 'Estado'];
      const filas = datos.filas.map((it, idx) => [idx + 1, it.nombre, it.cargo, it.area, it.rangoTexto, it.esperadas, it.ordinarias, it.vacaciones,
        it.diasJustificados || 0, it.diferencia > 0 ? -it.diferencia : 0,
        it.fechasDiferencia.map(x => { const p = x.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : x; }).join(', ') || 'Ninguna',
        it.extras, `${it.pct.toFixed(1)}%`, it.pct >= 95 ? 'Excelente' : it.pct >= 85 ? 'Aceptable' : 'Crítico']);
      const texto = refSel.current?.options[refSel.current.selectedIndex]?.text || '';
      const perLabel = texto.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 30);
      await descargarExcel(`Reporte_Diferencias_Asistencia${perLabel ? `_${perLabel}` : ''}_${hoy}.xlsx`, [{ nombre: 'Desglose Asistencia', filas: [enc, ...filas] }]);
      mostrarToast('Desglose de diferencias exportado a Excel', 'success');
    } catch (e) { mostrarToast('Error al exportar Excel: ' + errorTexto(e), 'error'); }
  };

  const botonModo = (activo: boolean) => s(`border: none; background: ${activo ? '#ffffff' : 'transparent'}; color: ${activo ? '#0f172a' : '#64748b'}; font-weight: 750; font-size: 11px; padding: 4px 9px; border-radius: 6px; cursor: pointer; box-shadow: ${activo ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'}; transition: all 0.15s; display: inline-flex; align-items: center; gap: 4px;`);
  const tarjeta = (titulo: string, valor: string, estiloCaja: string, estiloTitulo: string, estiloValor: string, id: string) => (
    <div style={s(estiloCaja)}>
      <div style={s(estiloTitulo)}>{titulo}</div>
      <div style={s(estiloValor)} id={id}>{valor}</div>
    </div>
  );
  const caja = 'background: white; padding: 8px 12px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.03);';
  const tit = 'font-size: 10px; color: var(--g500); font-weight: 700; text-transform: uppercase;';
  const num = (n?: number) => (n === undefined ? '--' : n.toLocaleString());

  return (
    <div id="modalDesgloseHistoricoBase" className="modal-overlay" style={s('z-index: 99999; display: flex; background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(5px);')}>
      <div className="modal-card" style={s('max-width: 1260px; width: 97vw; max-height: 92vh; display: flex; flex-direction: column; padding: 0; overflow: hidden; border-radius: 12px; background: #ffffff !important; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.35); border: 1px solid #cbd5e1;')}>
        <div style={s('padding: 14px 20px; background: #ffffff; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;')}>
          <div style={s('display: flex; align-items: center; gap: 10px;')}>
            <div style={s('width: 36px; height: 36px; border-radius: 10px; background: #eff6ff; color: #2563eb; display: flex; align-items: center; justify-content: center; font-size: 17px;')}><i className="fas fa-calculator"></i></div>
            <div>
              <h3 style={s('margin: 0; font-size: 15.5px; font-weight: 800; color: #1e293b;')}>Desglose Histórico de Asistencia y Diferencias</h3>
              <p id="subtituloModalHistorico" style={s('margin: 2px 0 0; font-size: 11.5px; color: #64748b;')}>{datos?.subtitulo || 'Auditoría: Asistencias Ordinarias + Vacaciones vs. Esperadas por Colaborador'}</p>
              <div id="bannerSincronizandoHistorico" style={s(`display: ${sincronizando || cargandoRango ? 'flex' : 'none'}; margin-top: 5px; padding: 4px 10px; border-radius: 6px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; font-size: 11px; align-items: center; gap: 6px;`)}>
                <i className="fas fa-spinner fa-spin"></i> Sincronizando asistencias históricas consolidadas ({datos?.anioActual || hoy.slice(0, 4)})... Los cálculos se actualizarán automáticamente al finalizar.
              </div>
            </div>
          </div>
          <button type="button" className="btn-cerrar-gris" onClick={cerrar} style={s(cerrarBtn)}>&times;</button>
        </div>

        <div style={s('padding: 10px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px;')}>
          {tarjeta('Asist. Ordinarias', num(datos?.totalOrdinarias), caja, tit, 'font-size: 17px; font-weight: 800; color: #10b981;', 'lblModalHistOrdinarias')}
          {tarjeta('Asist. Esperadas', num(datos?.totalEsperadas), caja, tit, 'font-size: 17px; font-weight: 800; color: #3b82f6;', 'lblModalHistEsperadas')}
          {tarjeta('Vacaciones', datos ? Math.round(datos.totalVacaciones).toLocaleString() : '--', 'background: #f0f9ff; padding: 8px 12px; border-radius: 8px; border: 1px solid #bae6fd; box-shadow: 0 1px 2px rgba(0,0,0,0.03);', 'font-size: 10px; color: #0369a1; font-weight: 800; text-transform: uppercase;', 'font-size: 17px; font-weight: 800; color: #0284c7;', 'lblModalHistVacaciones')}
          {tarjeta('Diferencia Acumulada', num(datos?.totalDiferencias), 'background: #fff5f5; padding: 8px 12px; border-radius: 8px; border: 1px solid #fecaca; box-shadow: 0 1px 2px rgba(0,0,0,0.03);', 'font-size: 10px; color: #b91c1c; font-weight: 800; text-transform: uppercase;', 'font-size: 17px; font-weight: 800; color: #ef4444;', 'lblModalHistDiferencia')}
          {tarjeta('Días Extras', num(datos?.totalExtras), 'background: #f5f3ff; padding: 8px 12px; border-radius: 8px; border: 1px solid #ddd6fe; box-shadow: 0 1px 2px rgba(0,0,0,0.03);', 'font-size: 10px; color: #4338ca; font-weight: 800; text-transform: uppercase;', 'font-size: 17px; font-weight: 800; color: #6366f1;', 'lblModalHistExtras')}
          {tarjeta('Promedio General', datos ? `${datos.promedioGral}%` : '--%', caja, tit, 'font-size: 17px; font-weight: 800; color: #1e293b;', 'lblModalHistPromedio')}
        </div>

        <div style={s('margin: 8px 20px 0 20px; background: #fff7ed; border: 1px solid #fed7aa; border-left: 4px solid #ea580c; border-radius: 8px; padding: 7px 12px; display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; color: #9a3412; gap: 8px; flex-wrap: wrap;')}>
          <div style={s('display: flex; align-items: center; gap: 8px;')}>
            <i className="fas fa-hand-pointer" style={s('color: #ea580c; font-size: 12px;')}></i>
            <span><strong>Regularización Rápida:</strong> Haz clic sobre cualquier fecha en la columna <strong>Diferencia</strong> para ir directamente a dicha fecha en <strong>Detalle de Empleado</strong>.</span>
          </div>
        </div>

        <div style={s('padding: 9px 20px; background: #ffffff; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;')}>
          <div style={s('display: flex; align-items: center; gap: 8px; flex: 1; min-width: 200px;')}>
            <i className="fas fa-search" style={s('color: #94a3b8; font-size: 12px;')}></i>
            <input type="text" id="txtBuscarHistoricoBase" value={busqueda} onChange={ev => setBusqueda(ev.target.value)} placeholder="Buscar por colaborador, cargo o área..." style={s('width: 100%; border: 1px solid #cbd5e1; padding: 5px 9px; border-radius: 6px; font-size: 11.5px; outline: none; background: #ffffff;')} />
          </div>
          <div style={s('display: flex; align-items: center; gap: 8px; flex-wrap: wrap;')}>
            <div style={s('display: inline-flex; align-items: center; background: #f1f5f9; padding: 2px; border-radius: 8px; border: 1px solid #cbd5e1;')}>
              <button type="button" id="btnModoHistoricoMensual" onClick={() => seleccionarModo('mensual')} style={botonModo(!esAnual)}><i className="fas fa-calendar-alt" style={s('color: #2563eb; font-size: 10.5px;')}></i> Mensual</button>
              <button type="button" id="btnModoHistoricoAnual" onClick={() => seleccionarModo('anual')} style={botonModo(esAnual)}><i className="fas fa-calendar" style={s('color: #10b981; font-size: 10.5px;')}></i> Anual</button>
            </div>
            <div style={s('display: flex; align-items: center; gap: 5px; background: #f8fafc; padding: 4px 10px; border-radius: 8px; border: 1px solid #cbd5e1;')}>
              <i className="fas fa-calendar-alt" style={s('color: #64748b; font-size: 11.5px;')}></i>
              <span style={s('font-size: 11px; font-weight: 700; color: #334155;')}>Período:</span>
              <select id="selPeriodoModalHistorico" ref={refSel} value={opcion} onChange={ev => setOpcion(ev.target.value)} style={s('border: none; background: transparent; font-size: 11.5px; font-weight: 700; color: #1e293b; outline: none; cursor: pointer; max-width: 270px;')}>
                <optgroup label="📅 Vistas Anuales y Consolidadas">
                  <option value="ANUAL">📅 Consolidado Anual ({datos?.anioActual || hoy.slice(0, 4)})</option>
                  {(datos?.anios || []).map(y => <option key={y} value={`ANIO_${y}`}>🗓️ Año {y} Completo</option>)}
                  <option value="ULTIMOS_365">📅 Últimos 12 Meses (Año Móvil)</option>
                  <option value="HISTORICO_BASE">🏛️ Todo el Histórico en Base</option>
                </optgroup>
                <optgroup label="🗓️ Períodos Mensuales (Corte al 25)">
                  {pDash && <option value="DASHBOARD">⭐ Período Dashboard ({pDash.label})</option>}
                  {periodos.map((p, idx) => <option key={idx} value={`PER_${idx}`}>{p.label}</option>)}
                  <option value="ULTIMOS_60">Últimos 60 Días (En Memoria)</option>
                </optgroup>
              </select>
            </div>
            <button type="button" className="btn btn-outline" id="btnSincronizarHistoricoModal" onClick={() => void sincronizar()} title="Sincronizar histórico completo" style={s('padding: 5px 10px; font-size: 11.5px; display: inline-flex; align-items: center; gap: 5px; background: #ffffff; border-radius: 8px; font-weight: 600; color: #475569;')}>
              <i className={`fas fa-sync-alt${sincronizando ? ' fa-spin' : ''}`} id="iconoSyncHistorico" style={s('color: #2563eb;')}></i> Sincronizar
            </button>
            <button type="button" className="btn btn-outline" onClick={() => void exportar()} style={s('padding: 5px 12px; font-size: 11.5px; display: inline-flex; align-items: center; gap: 5px; background: #ffffff; border-radius: 8px; font-weight: 600;')}>
              <i className="fas fa-file-excel" style={s('color: #10b981;')}></i> Exportar Excel
            </button>
          </div>
        </div>

        <div style={s('padding: 10px 16px; flex: 1; min-height: 0; display: flex; flex-direction: column; background: #ffffff;')}>
          <div style={s('overflow-x: hidden; overflow-y: auto; flex: 1; max-height: 54vh; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;')}>
            <table style={s('width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 11.5px; text-align: left; background: #ffffff;')} id="tablaHistoricoBaseModal">
              <thead style={s('position: sticky; top: 0; z-index: 10; background: #f8fafc; color: #475569; border-bottom: 1px solid #e2e8f0; font-size: 10.5px; text-transform: uppercase; box-shadow: 0 1px 2px rgba(0,0,0,0.06);')}>
                <tr>
                  <th style={s('padding: 8px 6px; font-weight: 700; width: 32px; text-align: center;')}>#</th>
                  <th style={s('padding: 8px 6px; font-weight: 700; width: 195px;')}>Colaborador</th>
                  <th style={s('padding: 8px 6px; font-weight: 700; text-align: center; width: 95px;')}>Rango / Inicio</th>
                  <th style={s('padding: 8px 6px; font-weight: 700; text-align: center; color: #3b82f6; width: 70px;')}>Esperadas</th>
                  <th style={s('padding: 8px 6px; font-weight: 700; text-align: center; color: #10b981; width: 70px;')}>Ordinarias</th>
                  <th style={s('padding: 8px 6px; font-weight: 700; text-align: center; color: #0284c7; width: 80px;')}>Vacaciones</th>
                  <th style={s('padding: 8px 6px; font-weight: 700; text-align: center; color: #b91c1c; width: 155px;')}>Diferencia</th>
                  <th style={s('padding: 8px 6px; font-weight: 700; text-align: center; color: #6366f1; width: 70px;')}>Días Extras</th>
                  <th style={s('padding: 8px 6px; font-weight: 700; text-align: center; width: 75px;')}>% Cumpl.</th>
                  <th style={s('padding: 8px 6px; font-weight: 700; text-align: center; width: 90px;')}>Acción</th>
                </tr>
              </thead>
              <tbody id="tbodyModalHistoricoBase" style={s('background: #ffffff;')}>
                {!datos ? <tr><td colSpan={10} style={s('padding: 25px; text-align: center; color: var(--g600);')}><i className="fas fa-spinner fa-spin"></i> Cargando datos de colaboradores...</td></tr>
                  : !lista.length ? <tr><td colSpan={10} style={s('padding: 25px; text-align: center; color: var(--g500);')}>No se encontraron colaboradores en este período.</td></tr>
                  : lista.map((item, idx) => {
                    const colorPct = item.pct >= 95 ? '#15803d' : item.pct >= 85 ? '#b45309' : '#b91c1c';
                    const fechas = item.fechasDiferencia.map(x => { const p = x.split('-'); return { iso: x, label: p.length === 3 ? `${p[2]}/${p[1]}` : x }; });
                    const chip = (x: { iso: string; label: string }, texto = x.label, title = `Clic para ir a regularizar el ${x.iso} en Detalle de Empleado`) => (
                      <button key={x.iso + texto} type="button" onClick={() => irADetalleFecha(item.id, x.iso)} className="btn-chip-dif" title={title}>{texto}</button>
                    );
                    return (
                      <tr key={item.id} className="fila-desglose" style={s('border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;')}>
                        <td style={s('padding: 6px 4px; text-align: center; color: var(--g500); font-weight: 700; font-size: 11px;')}>{idx + 1}</td>
                        <td style={s('padding: 6px 6px; overflow: hidden;')}>
                          <div style={s('display: flex; align-items: center; gap: 6px; min-width: 0;')}>
                            <div style={s('width: 24px; height: 24px; border-radius: 50%; background: #eff6ff; color: #2563eb; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 10px; flex-shrink: 0; border: 1px solid #bfdbfe;')}>{(item.nombre || '?').charAt(0)}</div>
                            <div style={s('min-width: 0; flex: 1;')}>
                              <strong style={s('color: #1e293b; font-size: 11.5px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;')} title={item.nombre}>{item.nombre}</strong>
                              <div style={s('font-size: 10px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;')} title={item.cargo}>{item.cargo}</div>
                            </div>
                          </div>
                        </td>
                        <td style={s('padding: 6px 4px; text-align: center; font-size: 10.5px; color: #475569; font-weight: 600; white-space: nowrap;')} title="Rango evaluado">{item.rangoTexto}</td>
                        <td style={s('padding: 6px 4px; text-align: center; font-weight: 700; color: #1e293b; font-size: 11.5px;')}>{item.esperadas}</td>
                        <td style={s('padding: 6px 4px; text-align: center; font-weight: 800; color: #2563eb; font-size: 11.5px;')}>{item.ordinarias}</td>
                        <td style={s('padding: 6px 4px; text-align: center; font-weight: 700; color: #0284c7; font-size: 11.5px;')}>
                          <span style={item.vacaciones > 0 ? s('background: #e0f2fe; padding: 2px 6px; border-radius: 6px; border: 1px solid #bae6fd;') : undefined} title={`${item.vacaciones} días de vacaciones tomadas`}>{item.vacaciones}</span>
                        </td>
                        <td style={s('padding: 6px 4px; text-align: center;')}>
                          {item.diferencia === 0 ? <span style={s('font-weight: 800; padding: 2px 8px; border-radius: 6px; font-size: 11px; background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0;')}>0</span> : (
                            <div style={s('display: flex; flex-direction: column; align-items: center; gap: 3px;')}>
                              <span style={s('font-weight: 800; padding: 1px 7px; border-radius: 6px; font-size: 11px; background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;')} title={`Total inasistencias sin justificar: ${item.diferencia}`}>-{item.diferencia}</span>
                              <div style={s('display: flex; align-items: center; gap: 3px; flex-wrap: wrap; justify-content: center; max-width: 155px;')}>
                                {fechas.length <= 3 ? fechas.map(x => chip(x)) : <>
                                  {fechas.slice(0, 2).map(x => chip(x))}
                                  {chip(fechas[2], `+${fechas.length - 2}`, `Ver ${fechas.length - 2} fechas más en Detalle de Empleado`)}
                                </>}
                              </div>
                            </div>
                          )}
                        </td>
                        <td style={s('padding: 6px 4px; text-align: center; font-weight: 700; color: #6366f1; font-size: 11.5px;')}>+{item.extras}</td>
                        <td style={s('padding: 6px 4px; text-align: center;')}><strong style={s(`color: ${colorPct}; font-size: 12px;`)}>{item.pct.toFixed(1)}%</strong></td>
                        <td style={s('padding: 6px 4px; text-align: center;')}>
                          <div style={s('display: flex; align-items: center; justify-content: center; gap: 4px;')}>
                            {item.pct >= 95 ? <span style={s('background: #dcfce7; color: #15803d; padding: 2px 6px; border-radius: 6px; font-weight: 800; font-size: 10px; border: 1px solid #bbf7d0; display: inline-flex; align-items: center; gap: 3px;')}><i className="fas fa-check-circle"></i> 95%+</span>
                              : item.pct >= 85 ? <span style={s('background: #fef3c7; color: #b45309; padding: 2px 6px; border-radius: 6px; font-weight: 800; font-size: 10px; border: 1px solid #fde68a; display: inline-flex; align-items: center; gap: 3px;')}><i className="fas fa-exclamation-circle"></i> 85%+</span>
                              : <span style={s('background: #fee2e2; color: #b91c1c; padding: 2px 6px; border-radius: 6px; font-weight: 800; font-size: 10px; border: 1px solid #fca5a5; display: inline-flex; align-items: center; gap: 3px;')}><i className="fas fa-times-circle"></i> &lt;85%</span>}
                            <button type="button" className="btn-ver-expediente" onClick={() => { mostrarDetalle(item.id); cerrar(); }} style={s('border: 1px solid #cbd5e1; border-radius: 5px; padding: 2px 6px; font-size: 10px; font-weight: 700; color: #334155; cursor: pointer; display: inline-flex; align-items: center; gap: 2px; transition: all 0.15s ease;')} title="Ver expediente">
                              <i className="fas fa-eye" style={s('color: #2563eb; font-size: 10px;')}></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={s('padding: 10px 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; gap: 15px;')}>
          <span style={s('font-size: 11px; color: var(--g500); line-height: 1.4;')}>
            <i className="fas fa-info-circle" style={s('color: #3b82f6;')}></i> <strong>Criterios de Auditoría:</strong> <em>Esperadas</em> = días hábiles en rango activo. <em>Ordinarias</em> = marcaciones presenciales/campo. <em>Vacaciones tomadas</em> y <em>Permisos médicos/justificados</em> están protegidos y no descuentan cumplimiento. <em>Diferencia</em> = inasistencias injustificadas con indicación exacta de fechas.
          </span>
          <button type="button" className="btn" onClick={cerrar} style={s('padding: 6px 14px; border-radius: 8px; font-size: 11.5px; background: #e2e8f0; color: #334155; font-weight: 700; border: none; cursor: pointer; flex-shrink: 0;')}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function ModalDesgloseVacaciones() {
  const empCache = useSup(x => x.empCache);
  const vacaciones = useSup(x => x.vacaciones);
  const [busqueda, setBusqueda] = useState('');
  const [actualizando, setActualizando] = useState(false);
  const cerrar = () => cerrarModal('desgloseVacaciones');
  const datos = useMemo(() => (empCache.length ? calcularDesgloseVacaciones(empCache, vacaciones as any) : null), [empCache, vacaciones]);
  const q = busqueda.toLowerCase().trim();
  const lista = !datos ? [] : !q ? datos.filas : datos.filas.filter(i => i.nombre.toLowerCase().includes(q) || i.cargo.toLowerCase().includes(q) || i.area.toLowerCase().includes(q));

  const actualizar = async () => {
    setActualizando(true);
    try {
      await cargarDatosCompletos({ silencioso: true });
      mostrarToast('Desglose de vacaciones actualizado con éxito', 'success');
    } catch (e) { mostrarToast('Error al actualizar vacaciones: ' + errorTexto(e), 'error'); }
    finally { setActualizando(false); }
  };

  // table_to_sheet del legado: mismas columnas visibles de la tabla
  const exportar = async () => {
    try {
      const enc = ['#', 'Colaborador', 'Adjudicadas', 'Tomadas', 'Pendientes', '% Goce', 'Estado', 'Acción'];
      const estado = (i: typeof lista[number]) => !i.tieneDatosVac ? 'Sin Asignar' : i.pct >= 100 ? 'Completo' : i.pct >= 50 ? 'En Goce' : i.pct > 0 ? 'Parcial' : 'Sin Gozar';
      const filas = lista.map((i, idx) => [idx + 1, `${(i.nombre || '?').charAt(0)} ${i.nombre} ${i.cargo}`, Number(formatDias(i.adjudicadas)), Number(formatDias(i.tomadas)),
        Number(formatDias(i.restantes)), `${i.pct.toFixed(1)}%`, estado(i), 'Detalle']);
      await descargarExcel(`Reporte_Auditoria_Vacaciones_${getLocalHoyStr()}.xlsx`, [{ nombre: 'Auditoría Vacaciones', filas: [enc, ...filas] }]);
      mostrarToast('Auditoría de vacaciones exportada a Excel', 'success');
    } catch (e) { mostrarToast('Error al exportar: ' + errorTexto(e), 'error'); }
  };

  const tarjeta = (titulo: string, valor: string, caja: string, estT: string, estV: string, id: string) => (
    <div style={s(caja)}><div style={s(estT)}>{titulo}</div><div style={s(estV)} id={id}>{valor}</div></div>
  );
  const sombra = 'box-shadow: 0 1px 2px rgba(0,0,0,0.03);';

  return (
    <div id="modalDesgloseVacaciones" className="modal-overlay" style={s('z-index: 99999; display: flex; background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(5px); overflow-y: auto; padding: 20px 10px;')}>
      <div className="modal-card" style={s('max-width: 920px; width: 96%; max-height: 88vh; margin: auto; display: flex; flex-direction: column; padding: 0; overflow: hidden; border-radius: 12px; background: #ffffff !important; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35); border: 1px solid #cbd5e1;')}>
        <div style={s('padding: 14px 18px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #ffffff; flex-shrink: 0;')}>
          <div style={s('display: flex; align-items: center; gap: 10px;')}>
            <div style={s('width: 36px; height: 36px; border-radius: 10px; background: rgba(20, 184, 166, 0.12); color: #0d9488; display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0;')}><i className="fas fa-umbrella-beach"></i></div>
            <div>
              <h3 style={s('margin: 0; font-size: 15.5px; font-weight: 800; color: #0f172a;')}>Auditoría y Desglose de Vacaciones</h3>
              <p style={s('margin: 2px 0 0; font-size: 11.5px; color: var(--g500);')}>Cumplimiento y goce de días de vacaciones adjudicados en el año en curso</p>
            </div>
          </div>
          <button type="button" className="btn-cerrar-gris" onClick={cerrar} style={s('background: none; border: none; font-size: 22px; color: #94a3b8; cursor: pointer; padding: 4px 8px; border-radius: 6px; line-height: 1;')}>&times;</button>
        </div>

        <div style={s('padding: 10px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; flex-shrink: 0;')}>
          {tarjeta('Adjudicadas Totales', datos ? `${formatDias(datos.totalAdjudicadas)} d` : '--', 'background: white; padding: 8px 10px; border-radius: 8px; border: 1px solid #e2e8f0;' + sombra, 'font-size: 10px; color: var(--g500); font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;', 'font-size: 17px; font-weight: 800; color: #3b82f6; margin-top: 2px;', 'lblModalVacAdjudicadas')}
          {tarjeta('Tomadas / Gozadas', datos ? `${formatDias(datos.totalTomadas)} d` : '--', 'background: #f0fdf4; padding: 8px 10px; border-radius: 8px; border: 1px solid #bbf7d0;' + sombra, 'font-size: 10px; color: #15803d; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px;', 'font-size: 17px; font-weight: 800; color: #16a34a; margin-top: 2px;', 'lblModalVacTomadas')}
          {tarjeta('Pendientes de Goce', datos ? `${formatDias(datos.totalRestantes)} d` : '--', 'background: #fff5f5; padding: 8px 10px; border-radius: 8px; border: 1px solid #fecaca;' + sombra, 'font-size: 10px; color: #b91c1c; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px;', 'font-size: 17px; font-weight: 800; color: #ef4444; margin-top: 2px;', 'lblModalVacRestantes')}
          {tarjeta('Goce Global Empresa', datos ? `${datos.tasaGlobal}%` : '--%', 'background: #f0fdfa; padding: 8px 10px; border-radius: 8px; border: 1px solid #99f6e4;' + sombra, 'font-size: 10px; color: #0f766e; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px;', 'font-size: 17px; font-weight: 800; color: #0d9488; margin-top: 2px;', 'lblModalVacTasaGlobal')}
          {tarjeta('Promedio Indiv.', datos ? `${datos.promedioIndiv}%` : '--%', 'background: white; padding: 8px 10px; border-radius: 8px; border: 1px solid #e2e8f0;' + sombra, 'font-size: 10px; color: var(--g500); font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;', 'font-size: 17px; font-weight: 800; color: #1e293b; margin-top: 2px;', 'lblModalVacPromedioIndiv')}
        </div>

        <div style={s('padding: 10px 16px; background: #ffffff; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; flex-shrink: 0;')}>
          <div style={s('display: flex; align-items: center; gap: 8px; flex: 1; min-width: 220px;')}>
            <i className="fas fa-search" style={s('color: #94a3b8; font-size: 13px;')}></i>
            <input type="text" id="txtBuscarVacaciones" value={busqueda} onChange={ev => setBusqueda(ev.target.value)} placeholder="Buscar colaborador, cargo o área..." style={s('width: 100%; border: 1px solid #cbd5e1; padding: 6px 10px; border-radius: 6px; font-size: 12px; outline: none; background: #ffffff;')} />
          </div>
          <div style={s('display: flex; gap: 8px;')}>
            <button type="button" className="btn btn-outline" disabled={actualizando} onClick={() => void actualizar()} style={s('padding: 5px 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; background: #ffffff;')} title="Sincronizar datos de vacaciones">
              <i className={actualizando ? 'fas fa-spinner fa-spin' : 'fas fa-sync-alt'} style={s('color: #0d9488;')}></i> Actualizar
            </button>
            <button type="button" className="btn btn-outline" onClick={() => void exportar()} style={s('padding: 5px 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; background: #ffffff;')}>
              <i className="fas fa-file-excel" style={s('color: #10b981;')}></i> Exportar Excel
            </button>
          </div>
        </div>

        <div style={s('padding: 12px 16px; flex: 1; min-height: 0; display: flex; flex-direction: column; background: #ffffff;')}>
          <div style={s('overflow: auto; flex: 1; max-height: 52vh; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;')}>
            <table style={s('width: 100%; border-collapse: collapse; min-width: 680px; font-size: 12px; text-align: left; background: #ffffff;')} id="tablaVacacionesModal">
              <thead style={s('position: sticky; top: 0; z-index: 10; background: #f8fafc; color: #475569; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-transform: uppercase; box-shadow: 0 1px 2px rgba(0,0,0,0.06);')}>
                <tr>
                  <th style={s('padding: 9px 10px; font-weight: 700; width: 35px; text-align: center;')}>#</th>
                  <th style={s('padding: 9px 10px; font-weight: 700;')}>Colaborador</th>
                  <th style={s('padding: 9px 10px; font-weight: 700; text-align: center; width: 85px;')}>Adjudicadas</th>
                  <th style={s('padding: 9px 10px; font-weight: 700; text-align: center; color: #16a34a; width: 80px;')}>Tomadas</th>
                  <th style={s('padding: 9px 10px; font-weight: 700; text-align: center; color: #b91c1c; width: 85px;')}>Pendientes</th>
                  <th style={s('padding: 9px 10px; font-weight: 700; text-align: center; width: 130px;')}>% Goce</th>
                  <th style={s('padding: 9px 10px; font-weight: 700; text-align: center; width: 100px;')}>Estado</th>
                  <th style={s('padding: 9px 10px; font-weight: 700; text-align: center; width: 80px;')}>Acción</th>
                </tr>
              </thead>
              <tbody id="tbodyModalVacaciones" style={s('background: #ffffff;')}>
                {!datos ? <tr><td colSpan={8} style={s('padding: 25px; text-align: center; color: var(--g600);')}><i className="fas fa-spinner fa-spin"></i> Cargando datos de colaboradores...</td></tr>
                  : !lista.length ? <tr><td colSpan={8} style={s('padding: 20px; text-align: center; color: var(--g500);')}>No se encontraron colaboradores.</td></tr>
                  : lista.map((item, idx) => {
                    const est = !item.tieneDatosVac ? { c: '#94a3b8', badge: <span style={s('background: #f1f5f9; color: #64748b; padding: 2px 8px; border-radius: 10px; font-weight: 700; font-size: 11px; border: 1px solid #e2e8f0;')}><i className="fas fa-minus"></i> Sin Asignar</span> }
                      : item.pct >= 100 ? { c: '#10b981', badge: <span style={s('background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 10px; font-weight: 800; font-size: 11px; border: 1px solid #bbf7d0;')}><i className="fas fa-check-circle"></i> Completo</span> }
                      : item.pct >= 50 ? { c: '#f59e0b', badge: <span style={s('background: #fef3c7; color: #b45309; padding: 2px 8px; border-radius: 10px; font-weight: 800; font-size: 11px; border: 1px solid #fde68a;')}><i className="fas fa-hourglass-half"></i> En Goce</span> }
                      : item.pct > 0 ? { c: '#0284c7', badge: <span style={s('background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 10px; font-weight: 800; font-size: 11px; border: 1px solid #bae6fd;')}><i className="fas fa-clock"></i> Parcial</span> }
                      : { c: '#ef4444', badge: <span style={s('background: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 10px; font-weight: 800; font-size: 11px; border: 1px solid #fca5a5;')}><i className="fas fa-exclamation-circle"></i> Sin Gozar</span> };
                    return (
                      <tr key={item.id} className="fila-desglose" style={s('border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;')}>
                        <td style={s('padding: 10px 12px; text-align: center; color: var(--g500); font-weight: 700;')}>{idx + 1}</td>
                        <td style={s('padding: 10px 12px;')}>
                          <div style={s('display: flex; align-items: center; gap: 8px;')}>
                            <div style={s('width: 26px; height: 26px; border-radius: 50%; background: #eff6ff; color: #2563eb; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px; flex-shrink: 0;')}>{(item.nombre || '?').charAt(0)}</div>
                            <div style={s('min-width: 0;')}>
                              <strong style={s('color: var(--g800);')}>{item.nombre}</strong>
                              <div style={s('font-size: 11px; color: var(--g500);')}>{item.cargo}</div>
                            </div>
                          </div>
                        </td>
                        <td style={s('padding: 10px 12px; text-align: center; font-weight: 600;')}>{formatDias(item.adjudicadas)}</td>
                        <td style={s('padding: 10px 12px; text-align: center; font-weight: 700; color: #0d9488;')}>{formatDias(item.tomadas)}</td>
                        <td style={s(`padding: 10px 12px; text-align: center; font-weight: 700; color: ${item.restantes > 0 ? '#b91c1c' : '#10b981'};`)}>{formatDias(item.restantes)}</td>
                        <td style={s('padding: 10px 12px; text-align: center;')}>
                          <div style={s('display: inline-flex; align-items: center; gap: 8px;')}>
                            <div style={s('background: #e2e8f0; border-radius: 6px; height: 8px; width: 70px; overflow: hidden;')}><div style={s(`background: ${est.c}; width: ${item.pct}%; height: 100%;`)}></div></div>
                            <strong style={s(`color: ${est.c}; font-size: 12px;`)}>{item.pct.toFixed(1)}%</strong>
                          </div>
                        </td>
                        <td style={s('padding: 10px 12px; text-align: center;')}>{est.badge}</td>
                        <td style={s('padding: 10px 12px; text-align: center;')}>
                          <button type="button" className="btn btn-outline" onClick={() => { cerrar(); mostrarDetalle(item.id, 0); }} style={s('padding: 4px 8px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; border-radius: 6px; background: #ffffff;')} title="Ver perfil del colaborador">
                            <i className="fas fa-user" style={s('color: var(--blue);')}></i> Detalle
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={s('padding: 10px 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;')}>
          <span style={s('font-size: 11px; color: var(--g500);')}><i className="fas fa-info-circle" style={s('color: #0d9488;')}></i> El objetivo anual es alcanzar el 100% de goce ocupando todos los días de vacaciones adjudicados.</span>
          <button type="button" className="btn" onClick={cerrar} style={s('padding: 6px 15px; border-radius: 7px; font-size: 11.5px; background: #e2e8f0; color: #334155; font-weight: 700; border: none; cursor: pointer;')}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
