// Detalle del colaborador (mostrarDetalle del legado): ficha, métricas del período e historial por día.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react';
import { rpc } from '../../lib/api';
import { s } from '../../lib/estilo';
import { cambiarEstadoAlmuerzo, editarValorRegistro, refrescarSilencioso, resetearPasswordEmpleado } from '../acciones';
import { FechaRegularizar } from '../legado/asistencia';
import { FilaDetalle, calcularDetalle, resumenDetalle } from '../legado/detalle';
import { Reg, formatearHora, getLocalHoyStr, minsToHHMM, minutosAHHMMSS, normalizarFechaStr, obtenerDiaSemanaStr } from '../legado/util';
import { abrirModal, mostrarDetalle } from '../nav';
import { asegurarRegistros, buscarEmpleado, esAdminMaster, mostrarLoader, sup, useSup } from '../store';
import { PhotoCell, errorTexto, mostrarToast } from './comun';
import { obtenerPrimerNombreYPrimerApellido } from '../legado/personas';

interface VacInfo { tomadas: number | null; restantes: number | null; adjudicadas: number | null; vacaciones: { fecha: string }[] }

export function PanelDetalle() {
  const det = useSup(x => x.detalle);
  const version = useSup(x => x.version);
  const periodos = useSup(x => x.periodos);
  const [vac, setVac] = useState<VacInfo | null>(null);
  const [cargandoHist, setCargandoHist] = useState(false);
  const e = det ? buscarEmpleado(det.id) : undefined;

  const indexPeriodo = det?.indexPeriodo ?? 0;
  const periodoSeleccionado = periodos[indexPeriodo] || periodos[0];
  const R_INI = det?.customInicio || periodoSeleccionado?.inicio || '';
  const R_FIN = det?.customFin || periodoSeleccionado?.fin || '';

  // Historial anterior a la carga inicial y saldo de vacaciones, en segundo plano (como el legado)
  useEffect(() => {
    if (!det || !e) return;
    let vivo = true;
    setCargandoHist(true);
    asegurarRegistros(R_INI, R_FIN, det.id).catch(() => undefined).finally(() => { if (vivo) setCargandoHist(false); });
    rpc<VacInfo>('sup_vacaciones_empleado', { p_empleado_id: det.id }).then(v => { if (vivo) setVac(v); }).catch(() => undefined);
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [det?.id, R_INI, R_FIN]);

  // Sin registros en el período actual pero con marcaciones anteriores: ir al período con registros
  useEffect(() => {
    if (!det || !e || indexPeriodo !== 0 || det.customInicio || det.fechaEnfocar) return;
    const todos = e.registros || [];
    const enPeriodo = todos.some(r => r.fecha! >= R_INI && r.fecha! <= R_FIN);
    if (enPeriodo || todos.length === 0) return;
    const ult = [...todos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];
    if (ult?.fecha && ult.fecha < R_INI) {
      const idx = periodos.findIndex(p => ult.fecha! >= p.inicio && ult.fecha! <= p.fin);
      if (idx > 0) mostrarDetalle(det.id, idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [det?.id, version]);

  const calc = useMemo(() => {
    if (!e) return null;
    const regs = (e.registros || []).filter(r => r.fecha! >= R_INI && r.fecha! <= R_FIN).sort((a, b) => b.fecha!.localeCompare(a.fecha!));
    return { regs, detalle: calcularDetalle(e, regs, [], R_INI, R_FIN), resumen: resumenDetalle(e, regs, R_INI, R_FIN) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e, version, R_INI, R_FIN]);

  // Enfocar una fecha (irADetalleFecha / chips de regularización)
  useEffect(() => {
    if (!det?.fechaEnfocar || !calc) return;
    const f = det.fechaEnfocar;
    sup.set({ detalle: { ...det, fechaEnfocar: null } });
    window.setTimeout(() => enfocarFechaEnDetalle(det.id, f), 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [det?.fechaEnfocar, calc]);

  if (!det || !e || !calc) return <div id="detalleContent"></div>;
  const { detalle, resumen } = calc;
  const esMaster = esAdminMaster();
  const puntualidadVal = resumen.dias ? Math.max(0, Math.round((1 - resumen.tardT / resumen.dias) * 100)) : 100;
  const puntualidadColor = puntualidadVal >= 90 ? 'var(--green)' : puntualidadVal >= 70 ? 'var(--amber)' : 'var(--red)';
  const rawTel = String(e.telefono || '').trim();
  const numWa = rawTel.replace(/[^\d]/g, '');
  const tieneWa = numWa.length >= 9;
  const culturaActivaEmp = !(e.cultura_habilitada === false);
  const thH = Math.floor(detalle.tot.horas / 60) || 0;
  const thM = detalle.tot.horas % 60 || 0;
  const esDesv = e.esDesvinculado || (e.cargo || '').toLowerCase() === 'desvinculado' || (e.area || '').toLowerCase() === 'desvinculado';
  const irPeriodo = (idx: number, ini: string | null = null, fin: string | null = null) => mostrarDetalle(e.id, idx, ini, fin);

  return (
    <div id="detalleContent">
      <div className="detail-view-modern">
        <div className="detail-hero-card">
          <div className="detail-hero-main">
            <div className="detail-identity-group">
              <div className="detail-avatar-wrapper" onClick={esMaster ? () => subirFoto(e.id) : undefined} title={esMaster ? 'Subir o cambiar fotografía' : undefined}>
                <PhotoCell e={e} size="large" />
                {esMaster && <div className="detail-avatar-hover"><i className="fas fa-camera"></i></div>}
                <span className={`detail-status-dot ${(e.esEliminado || e.esDesvinculado) ? 'dot-inactive' : 'dot-active'}`} title={(e.esEliminado || e.esDesvinculado) ? 'Inactivo' : 'Activo'}></span>
              </div>
              <div className="detail-identity-info">
                <div className="detail-name-heading" style={esMaster ? { cursor: 'pointer' } : undefined} onClick={esMaster ? () => editarMetaEmpleado(e.id, 'nombre', e.nombre) : undefined}
                  title={esMaster ? 'Clic para editar nombre' : undefined}>{e.nombre}</div>
                <div className="detail-chips-row">
                  <span className="emp-chip chip-id" onClick={esMaster ? () => editarMetaEmpleado(e.id, 'id', e.id) : undefined} title={esMaster ? 'ID' : undefined}>
                    <i className="fas fa-id-card"></i> {e.id}</span>
                  <span className="emp-chip chip-area" onClick={esMaster ? () => editarMetaEmpleado(e.id, 'area', e.area || '') : undefined} title={esMaster ? 'Área / Departamento' : undefined}>
                    <i className="fas fa-building"></i> {e.area || 'Sin área'}</span>
                  <span className="emp-chip chip-cargo" onClick={esMaster ? () => editarMetaEmpleado(e.id, 'cargo', e.cargo || '') : undefined} title={esMaster ? 'Cargo' : undefined}>
                    <i className="fas fa-briefcase"></i> {e.cargo || 'General'}</span>
                  <span className={`emp-chip ${e.id_dispositivo ? 'chip-rol-si' : 'chip-rol-no'}`} onClick={esMaster ? () => editarMetaEmpleado(e.id, 'id_dispositivo', e.id_dispositivo || '') : undefined}
                    title={esMaster ? 'Rol de Pagos' : undefined}>
                    <i className="fas fa-file-invoice-dollar"></i> {e.id_dispositivo ? 'Con Rol' : 'Sin Rol'}</span>
                  {esDesv
                    ? <span className="emp-chip chip-desvinculado" title="Colaborador Desvinculado"><i className="fas fa-user-slash"></i> Desvinculado {(e.fecha_salida || e.fechaDesvinculacion) ? ' (' + normalizarFechaStr(e.fecha_salida || e.fechaDesvinculacion) + ')' : ''}</span>
                    : e.esEliminado ? <span className="emp-chip chip-eliminado" title="Colaborador Inactivo / Eliminado en base"><i className="fas fa-user-minus"></i> Inactivo en Base</span> : null}
                  {resumen.tardT > 0
                    ? <span className="emp-chip chip-warning" title={`${resumen.tardT} tardanzas`}><i className="fas fa-clock"></i> {resumen.tardT} tardanzas</span>
                    : <span className="emp-chip chip-success" title="Sin atrasos"><i className="fas fa-check-circle"></i> Puntual</span>}
                </div>
              </div>
            </div>

            <div className="detail-actions-toolbar">
              {tieneWa
                ? <button type="button" className="btn-action-detail btn-action-wa" onClick={() => abrirModal('waIndividual', { id: e.id })} title={`Enviar WhatsApp a ${e.nombre} (${rawTel})`}>
                    <i className="fab fa-whatsapp" style={s('font-size:13px;')}></i> <span>WhatsApp: {rawTel}</span></button>
                : <button type="button" className="btn-action-detail btn-action-wa-add" onClick={() => abrirModal('waIndividual', { id: e.id })} title="Registrar número para enviar WhatsApp">
                    <i className="fab fa-whatsapp" style={s('font-size:13px;')}></i> <span>+ WhatsApp</span></button>}
              <button type="button" className={`btn-action-detail ${culturaActivaEmp ? 'btn-action-cultura-on' : 'btn-action-cultura-off'}`} onClick={() => void toggleCulturaEmpleado(e.id, culturaActivaEmp)}
                title={culturaActivaEmp ? 'Cultura Tcontrol Habilitada para este colaborador. Clic para deshabilitar / exonerar' : 'Cultura Tcontrol Deshabilitada para este colaborador. Clic para habilitar'}>
                <i className="fas fa-lightbulb"></i>
                <span>Cultura: <strong>{culturaActivaEmp ? 'Habilitado' : 'Exonerado'}</strong></span>
                <i className="fas fa-rotate" style={s('font-size:9px; opacity:0.6;')}></i>
              </button>
              <button type="button" className="btn-action-detail btn-action-edit" onClick={() => abrirModal('editarEmp', { id: e.id })}
                title="Abrir ficha completa para editar datos del colaborador (Nombre, Área, Cargo, PIN, Rol, WhatsApp, etc.)">
                <i className="fas fa-user-pen"></i> <span>Editar Datos</span>
              </button>
              <button type="button" className="btn-action-detail btn-action-reset" onClick={() => void resetearPasswordEmpleado(e.id, e.nombre)}
                title="Resetear contraseña para permitir que el colaborador vuelva a vincular su dispositivo">
                <i className="fas fa-key"></i> <span>Resetear PIN</span>
              </button>
            </div>
          </div>

          <div className="detail-period-toolbar">
            <div className="detail-period-selector-group">
              <span className="period-label"><i className="fas fa-calendar-alt" style={s('color:#4f46e5;')}></i> Período:</span>
              <select id="filtroPeriodoDetalle" className="period-select" value={indexPeriodo} onChange={ev => irPeriodo(parseInt(ev.target.value))}>
                {periodos.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
              </select>
            </div>
            <div className="detail-date-range-group">
              <div className="date-field">
                <span className="date-label">Desde:</span>
                <input type="date" id="detFechaInicio" value={R_INI} onChange={ev => irPeriodo(indexPeriodo, ev.target.value, R_FIN)} className="date-input" />
              </div>
              <div className="date-field">
                <span className="date-label">Hasta:</span>
                <input type="date" id="detFechaFin" value={R_FIN} onChange={ev => irPeriodo(indexPeriodo, R_INI, ev.target.value)} className="date-input" />
              </div>
              <button type="button" className="btn-reset-period" onClick={() => irPeriodo(indexPeriodo)} title="Restablecer al rango por defecto del período">
                <i className="fas fa-rotate-left"></i> Restablecer
              </button>
            </div>
          </div>
        </div>

        <div className="kpi-grid-detail">
          <div className="kpi-metric-card kpi-card-blue">
            <div className="kpi-header-row">
              <span className="kpi-header-title"><i className="fas fa-calendar-check" style={s('color:#2563eb; font-size:12px;')}></i> Asistencia</span>
              <span className="emp-chip" style={s('background:#eff6ff; color:#1d4ed8; font-size:10px; padding:1px 6px;')}>Registro</span>
            </div>
            <div className="kpi-card-stats-grid">
              <div className="kpi-stat-item"><span className="kpi-stat-label">Días Trab.</span>
                <div className="kpi-stat-val-hero">{resumen.dias} <span style={s('font-size:10px; color:#94a3b8; font-weight:500;')}>({resumen.entT}e/{resumen.salT}s)</span></div></div>
              <div className="kpi-stat-item"><span className="kpi-stat-label">Puntualidad</span>
                <div className="kpi-stat-val-hero" style={{ color: puntualidadColor }}>{puntualidadVal}%</div></div>
              <div className="kpi-stat-item"><span className="kpi-stat-label">Prom. Ent.</span>
                <div className="kpi-stat-val-sub" style={s('color:#334155;')}>{minsToHHMM(resumen.pE)}</div></div>
              <div className="kpi-stat-item"><span className="kpi-stat-label">Prom. Sal.</span>
                <div className="kpi-stat-val-sub" style={s('color:#334155;')}>{minsToHHMM(resumen.pS)}</div></div>
            </div>
          </div>

          <div className="kpi-metric-card kpi-card-green">
            <div className="kpi-header-row">
              <span className="kpi-header-title"><i className="fas fa-clock" style={s('color:#10b981; font-size:12px;')}></i> Jornada y Tiempos</span>
              <span className="emp-chip" style={s('background:#ecfdf5; color:#047857; font-size:10px; padding:1px 6px;')}>Laboral</span>
            </div>
            <div className="kpi-card-stats-grid">
              <div className="kpi-stat-item"><span className="kpi-stat-label">Total Horas</span>
                <div className="kpi-stat-val-hero" style={s('color:#10b981;')}>{String(thH).padStart(2, '0')}:{String(thM).padStart(2, '0')}</div></div>
              <div className="kpi-stat-item"><span className="kpi-stat-label">Atrasos Acum.</span>
                <div className="kpi-stat-val-hero" style={{ color: detalle.tot.atrasos > 0 ? '#dc2626' : '#0f172a' }}>{minutosAHHMMSS(detalle.tot.atrasos)}</div></div>
              <div className="kpi-subrow-split">
                <span className="kpi-stat-label" style={s('margin:0;')}>T. por Justificar:</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: detalle.tot.tj > 0 ? '#dc2626' : '#10b981' }}>{minutosAHHMMSS(detalle.tot.tj)}</span>
              </div>
            </div>
          </div>

          <div className="kpi-metric-card kpi-card-purple">
            <div className="kpi-header-row">
              <span className="kpi-header-title"><i className="fas fa-hand-holding-heart" style={s('color:#8b5cf6; font-size:12px;')}></i> Permisos y Almuerzos</span>
              <span className="emp-chip" style={s('background:#faf5ff; color:#7e22ce; font-size:10px; padding:1px 6px;')}>Beneficios</span>
            </div>
            <div className="kpi-card-stats-grid">
              <div className="kpi-stat-item"><span className="kpi-stat-label">T. Personal</span><div className="kpi-stat-val-sub" style={s('color:#6366f1;')}>{minutosAHHMMSS(detalle.tot.tp)}</div></div>
              <div className="kpi-stat-item"><span className="kpi-stat-label">T. Médico</span><div className="kpi-stat-val-sub" style={s('color:#0d9488;')}>{minutosAHHMMSS(detalle.tot.tm)}</div></div>
              <div className="kpi-stat-item"><span className="kpi-stat-label">Alm. Planta</span><div className="kpi-stat-val-sub" style={s('color:#8b5cf6;')}>{resumen.almP}d</div></div>
              <div className="kpi-stat-item"><span className="kpi-stat-label">Alm. Fuera</span><div className="kpi-stat-val-sub" style={s('color:#64748b;')}>{resumen.almF}d</div></div>
            </div>
          </div>

          <CardVacaciones vac={vac} e={e} />
        </div>

        <div style={s('padding:var(--pad)')}>
          <div className="metric-title" style={s('margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;')}>
            <div style={s('display:flex; align-items:center; gap:8px;')}>
              <span><i className="fas fa-history"></i> Historial del período</span>
              {cargandoHist && <i className="fas fa-sync fa-spin" style={s('color:#94a3b8; font-size:11px;')} title="Cargando historial"></i>}
              <button className="btn btn-primary" onClick={() => abrirModal('manual', { id: e.id })}
                style={s('font-size:11px; padding:4px 10px; height:auto; display:inline-flex; align-items:center; gap:6px; background:#2563eb; border-color:#2563eb; color:white; cursor:pointer;')}
                title={`Crear Registro Manual de Asistencia para ${e.nombre}`}>
                <i className="fas fa-plus-circle"></i> Registro Manual
              </button>
              <button className="btn btn-success" onClick={() => mostrarToast('La exportación a Excel del detalle se habilita con el módulo de Reportes.', 'info')}
                style={s('font-size:11px; padding:4px 10px; height:auto; display:inline-flex; align-items:center; gap:6px;')}>
                <i className="fas fa-file-excel"></i> Exportar Excel
              </button>
              <button className="btn btn-primary" onClick={() => abrirModal('futuro', { id: e.id })}
                style={s('font-size:11px; padding:4px 10px; height:auto; display:inline-flex; align-items:center; gap:6px; background:var(--purple); border-color:var(--purple); color:white; cursor:pointer;')}>
                <i className="fas fa-calendar-plus"></i> Registrar Evento (jornada completa)
              </button>
              <button className="btn btn-primary" onClick={() => abrirModal('campo', { id: e.id })}
                style={s('font-size:11px; padding:4px 10px; height:auto; display:inline-flex; align-items:center; gap:6px; background:#059669; border-color:#059669; color:white; cursor:pointer;')}>
                <i className="fas fa-hammer"></i> Trabajo en Campo
              </button>
            </div>
            <span style={s('color:var(--indigo);font-weight:600;font-size:13px;background:#e0e7ff;padding:4px 10px;border-radius:12px;')}>{periodoSeleccionado ? periodoSeleccionado.label : ''}</span>
          </div>

          <div id="contenedorBannerRegularizarDetalle"><BannerRegularizar lista={detalle.fechasARegularizar} empId={e.id} /></div>

          <div className="table-wrapper">
            <div className="table-scroll-wrap">
              <table className="employee-table table-compact">
                <thead>
                  <tr>
                    <th style={s('font-size:11px; padding:6px 8px; text-align:left;')}>Fecha</th>
                    <th style={s('font-size:11px; padding:6px 8px; text-align:center;')}>Entrada</th>
                    <th style={s('font-size:11px; padding:6px 8px; text-align:center;')}>Salida</th>
                    <th style={s('font-size:11px; padding:6px 8px; text-align:center;')} title="Total Horas Trabajadas">Horas Trab.</th>
                    <th style={s('font-size:11px; padding:6px 8px; text-align:center;')} title="Modalidad de Almuerzo (Planta / Fuera)">Almuerzo</th>
                    <th style={s('font-size:11px; padding:6px 8px; text-align:center;')} title="Atrasos, Salidas Anticipadas, Justificaciones, Permisos y Observaciones">Novedades & Permisos</th>
                    <th style={s('font-size:11px; padding:6px 8px; text-align:center; color:var(--red);')} title="Tiempo neto a descontar">T. Descontar</th>
                    <th style={s('font-size:11px; padding:6px 8px; text-align:center; color:#1d4ed8;')} title="Horas Extra 50% con estado de autorización">H.E. 50%</th>
                    <th style={s('font-size:11px; padding:6px 8px; text-align:center; color:#4338ca;')} title="Horas Extra 100% con estado de autorización">H.E. 100%</th>
                  </tr>
                </thead>
                <tbody id="tbody-historial-periodo">
                  {detalle.filas.length === 0
                    ? <tr><td colSpan={9} className="empty-state">Sin registros</td></tr>
                    : detalle.filas.map(f => <FilaHistorial key={f.fecha} f={f} empId={e.id} esMaster={esMaster} />)}
                </tbody>
                <tfoot id="tfoot-historial-periodo"><FilaTotales tot={detalle.tot} /></tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardVacaciones({ vac, e }: { vac: VacInfo | null; e: any }) {
  if (!vac) {
    return (
      <div id="card-vacaciones-detalle" className="kpi-metric-card kpi-card-amber">
        <div className="kpi-header-row">
          <span className="kpi-header-title"><i className="fas fa-umbrella-beach" style={s('color:#d97706; font-size:12px;')}></i> Vacaciones</span>
          <span className="emp-chip" style={s('background:#fffbeb; color:#b45309; font-size:10px; padding:1px 6px;')}>Saldo</span>
        </div>
        <div style={s('display:flex; align-items:center; justify-content:center; padding:12px 0; color:#64748b; font-size:11px; gap:6px; min-height:48px;')}>
          <div className="spinner-border text-primary" role="status" style={s('width:14px; height:14px; border-width:2px;')}></div>
          <span>Consultando saldo...</span>
        </div>
      </div>
    );
  }
  const lista = vac.vacaciones || [];
  const tomadas = vac.tomadas ?? lista.length;
  const restantes = vac.restantes ?? Math.max(0, (parseFloat(e.vacaciones_totales) || vac.adjudicadas || 15) - (tomadas || 0));
  return (
    <div id="card-vacaciones-detalle" className="kpi-metric-card kpi-card-amber">
      <div className="kpi-header-row">
        <span className="kpi-header-title" style={s('font-size:10.5px;')}><i className="fas fa-umbrella-beach" style={s('color:#d97706; font-size:11.5px;')}></i> Vacaciones</span>
        <span className="emp-chip" style={s('background:#fffbeb; color:#b45309; font-size:9.5px; padding:1px 6px; white-space:nowrap;')}>
          {tomadas} tom. / <strong style={s('color:var(--green);')}>{restantes}</strong> disp.</span>
      </div>
      <div className="kpi-card-stats-grid">
        <div className="kpi-stat-item"><span className="kpi-stat-label">Tomadas</span>
          <div className="kpi-stat-val-hero" style={s('color:#d97706;')}>{tomadas} <span style={s('font-size:10px; font-weight:500; color:#94a3b8;')}>días</span></div></div>
        <div className="kpi-stat-item"><span className="kpi-stat-label">Disponibles</span>
          <div className="kpi-stat-val-hero" style={s('color:var(--green);')}>{restantes} <span style={s('font-size:10px; font-weight:500; color:#94a3b8;')}>días</span></div></div>
        <div style={s('grid-column: span 2; border-top: 1px dashed #f1f5f9; padding-top: 4px; margin-top: 2px; max-height: 44px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px;')}>
          {lista.length === 0
            ? <div style={s('font-size:10.5px; color:#94a3b8; text-align:center; padding:4px 0;')}>Sin vacaciones registradas</div>
            : lista.map(v => (
              <div key={v.fecha} style={s('font-size:10px; padding:2px 4px; border-radius:4px; background:#f8fafc; border:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; color:#334155;')}>
                <span><i className="fas fa-calendar-day" style={s('color:#d97706; font-size:9px;')}></i> {v.fecha}</span>
                <span style={s('font-weight:700; color:#b45309; font-size:9px; background:#fef3c7; padding:1px 5px; border-radius:3px;')}>Tomada</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function BannerRegularizar({ lista, empId }: { lista: FechaRegularizar[]; empId: string }) {
  if (!lista.length) {
    return (
      <div id="bannerFechasRegularizar" style={s('background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 5px solid #16a34a; border-radius: 10px; padding: 7px 14px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: #166534; font-weight: 600;')}>
        <i className="fas fa-check-circle" style={s('color: #16a34a; font-size: 14px;')}></i>
        <span>Asistencia al día: No hay fechas pendientes de regularizar en este período.</span>
      </div>
    );
  }
  return (
    <div id="bannerFechasRegularizar" style={s('background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); border: 1.5px solid #fb923c; border-left: 5px solid #ea580c; border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 2px 6px rgba(234,88,12,0.08);')}>
      <div style={s('display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;')}>
        <div style={s('display: flex; align-items: center; gap: 8px;')}>
          <i className="fas fa-calendar-times" style={s('color: #ea580c; font-size: 15px;')}></i>
          <span style={s('font-weight: 800; font-size: 12.5px; color: #9a3412;')}>Fechas que deben regularizarse ({lista.length}):</span>
        </div>
        <span style={s('font-size: 11px; color: #c2410c; font-weight: 600;')}><i className="fas fa-hand-pointer"></i> Haz clic en una fecha para ir directamente a su fila en la tabla</span>
      </div>
      <div style={s('display: flex; gap: 6px; flex-wrap: wrap; max-height: 120px; overflow-y: auto; padding: 2px;')}>
        {lista.map(it => (
          <div key={it.fecha} style={s('display:inline-flex; align-items:center; background:#ffffff; border:1.5px solid #f97316; border-radius:7px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06); transition:all 0.15s ease;')}>
            <button type="button" onClick={() => enfocarFechaEnDetalle(empId, it.fecha)} className="btn-chip-regularizar-detalle"
              style={s('background:#ffffff; border:none; color:#9a3412; padding:4px 8px; font-size:11px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:5px;')}
              title={`Clic para ir directamente al registro del ${it.fecha}${it.minutos ? ' (' + it.minutos + ' min)' : ''}`}>
              <i className="fas fa-calendar-day" style={s('color:#ea580c; font-size:10px;')}></i>
              <span>{it.label}</span>
              <span style={s('background:#ffedd5; color:#c2410c; padding:1px 5px; border-radius:4px; font-size:9.5px; font-weight:700; border:1px solid #fed7aa;')}>{it.motivo}</span>
            </button>
            <button type="button" onClick={ev => { ev.stopPropagation(); solicitarRegularizacionWhatsApp(empId, it.fecha, it.motivo); }}
              style={s('background:#f0fdf4; border:none; border-left:1px solid #fed7aa; color:#16a34a; padding:4px 7px; cursor:pointer; font-size:11px; display:inline-flex; align-items:center;')}
              title="Solicitar justificativo al colaborador por WhatsApp"><i className="fab fa-whatsapp"></i></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilaHistorial({ f, empId, esMaster }: { f: FilaDetalle; empId: string; esMaster: boolean }) {
  const abrir = () => abrirModal('jornada', { id: empId, fecha: f.fecha });
  let rowStyle = '';
  let badgeDia;
  if (f.dayOfWeek === 0) { rowStyle = 'background-color: rgba(239, 68, 68, 0.04);'; badgeDia = <span className="pill danger" style={s('font-size: 9px; padding: 1px 6px; margin-top: 4px; display: inline-block; font-weight: 700;')}>DOMINGO</span>; }
  else if (f.dayOfWeek === 6) { rowStyle = 'background-color: rgba(245, 158, 11, 0.04);'; badgeDia = <span className="pill warn" style={s('font-size: 9px; padding: 1px 6px; margin-top: 4px; display: inline-block; font-weight: 700;')}>SÁBADO</span>; }
  else if (f.esFestivo) { rowStyle = 'background-color: rgba(99, 102, 241, 0.04);'; badgeDia = <span className="pill indigo" style={s('font-size: 9px; padding: 1px 6px; margin-top: 4px; display: inline-block; font-weight: 700;')}>FERIADO</span>; }
  else badgeDia = <span className="pill ok" style={s('font-size: 9px; padding: 1px 6px; margin-top: 4px; display: inline-block; font-weight: 700;')}>LABORAL</span>;

  const fechaCelda = (
    <td style={s('white-space:nowrap; font-weight:600; font-size:10.5px; padding:6px 8px; cursor:pointer;')} onClick={ev => { ev.stopPropagation(); abrir(); }}>
      <span style={s('font-size:9.5px;color:var(--g400);display:block;margin-bottom:2px;')}>{obtenerDiaSemanaStr(f.fecha)}</span>
      <button type="button" className="btn-fecha-gestionar" onClick={ev => { ev.stopPropagation(); abrir(); }}
        style={s('background:#eef2ff; border:1.5px solid #c7d2fe; color:#4338ca; padding:3px 8px; border-radius:7px; font-weight:800; font-size:11.5px; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 1px 2px rgba(67, 56, 202, 0.08); transition:all 0.15s ease;')}
        title="Clic para gestionar jornada y permisos de esta fecha">
        <span>{f.fecha.slice(8, 10)}/{f.fecha.slice(5, 7)}</span>
        <i className="fas fa-edit" style={s('font-size:10px; color:#4f46e5;')}></i>
      </button>
      {badgeDia}
    </td>
  );

  if (f.tipoFila === 'previo' || f.tipoFila === 'ausencia') {
    const previo = f.tipoFila === 'previo';
    return (
      <tr id={`fila-fecha-${f.fecha}`} style={{ ...s(rowStyle), cursor: 'pointer' }} onClick={abrir} title={previo ? 'Clic para gestionar este día' : 'Clic para gestionar este día'}>
        {fechaCelda}
        <td colSpan={8} style={{ fontSize: '10.5px', padding: '6px 12px', background: f.cardBg, borderLeft: `3px solid ${f.cardBorder}`, cursor: 'pointer' }} onClick={abrir}>
          <div style={s('display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;')}>
            <div style={s('display:flex; align-items:center; gap:8px;')}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 800, color: f.badgeColor, background: f.badgeBg, padding: '3px 8px', borderRadius: 6, border: `1px solid ${f.cardBorder}`, fontSize: '10.5px' }}>
                {f.icon} {String(f.razonMostrar).toUpperCase()}
              </span>
              <span style={s('font-size:10.5px; color:#64748b; font-weight:600;')}>{f.descMostrar}</span>
            </div>
            {previo
              ? <button type="button" onClick={ev => { ev.stopPropagation(); abrir(); }} style={s('font-size:10.5px; color:#475569; font-weight:700; display:inline-flex; align-items:center; gap:4px; background:#ffffff; padding:3px 10px; border-radius:12px; border:1px solid #cbd5e1; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05);')}>
                  <i className="fas fa-info-circle"></i> Info</button>
              : <button type="button" onClick={ev => { ev.stopPropagation(); abrir(); }} style={s('font-size:10.5px; color:#4f46e5; font-weight:700; display:inline-flex; align-items:center; gap:4px; background:#ffffff; padding:3px 10px; border-radius:12px; border:1px solid #c7d2fe; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05);')}>
                  <i className="fas fa-sliders-h"></i> Gestionar</button>}
          </div>
        </td>
      </tr>
    );
  }

  const hoy = getLocalHoyStr();
  let aBadge;
  if (f.almuerzo === 'SI' || f.almuerzo === 'PLANTA') aBadge = <span className="pill ok">🏢 Sí</span>;
  else if (f.almuerzo === 'NO' || f.almuerzo === 'FUERA') aBadge = <span className="pill" style={s('background:#dbeafe; color:#1e40af;')}>🏠 No</span>;
  else if (f.fecha > hoy || !f.tieneAsistencia) aBadge = <span style={s('color:#94a3b8;')}>—</span>;
  else aBadge = <span className="pill dim">❓ —</span>;
  if (esMaster && !f.esFalta && (f.tieneAsistencia || f.almuerzo)) {
    const nuevo = (f.almuerzo === 'SI' || f.almuerzo === 'PLANTA') ? 'NO' : 'SI';
    aBadge = <span className="editable-pill" onClick={ev => { ev.stopPropagation(); void cambiarEstadoAlmuerzo(empId, nuevo, f.fecha); }}>{aBadge}</span>;
  }

  const extBadgeVal = f.autorizadoGlobal ? 'SI' : 'NO';
  let extBadge = f.autorizadoGlobal ? <span className="pill ok">SI</span> : <span className="pill dim">NO</span>;
  if (f.extrasCampo) extBadge = <span className="pill ok" title="Auto-autorizado por Campo">CAMPO</span>;
  if (esMaster && f.regsDia.length > 0 && !f.esFalta) {
    const b = extBadge;
    extBadge = <span className="editable-pill" onClick={ev => { ev.stopPropagation(); void editarValorRegistro(empId, String(f.regsDia[0].tipo), 'horasExtra', extBadgeVal, f.fecha); }}>{b}</span>;
  }

  const modalidadCell = f.modActual === 'CAMPO'
    ? <span className="pill" style={s('background:#eff6ff; color:#1d4ed8; font-weight:700; font-size:10px; border:1px solid #bfdbfe;')}>🏗️ CAMPO</span>
    : f.modActual === 'MIXTO'
      ? <span className="pill" style={s('background:#f5f3ff; color:#6d28d9; font-weight:700; font-size:10px; border:1px solid #ddd6fe;')}>🔀 MIXTO</span>
      : null;

  // Razón del día (badge morado)
  let razonBadge = null;
  if (f.razonTextoFinal) {
    let rIco = '📌';
    const rLower = (f.razonAusenciaVal || f.razonTextoFinal).toLowerCase();
    if (rLower.includes('vacac')) rIco = '🏖️';
    else if (rLower.includes('medico')) rIco = '🩺';
    else if (rLower.includes('personal')) rIco = '👤';
    else if (rLower.includes('calamidad')) rIco = '🏠';
    else if (rLower.includes('cumplea')) rIco = '🎂';
    else if (rLower.includes('justif')) rIco = '✅';
    else if (rLower.includes('campo')) rIco = '🚗';
    else if (rLower.includes('feriado')) rIco = '🏛️';
    let badgeLabel = f.razonAusenciaVal || f.razonTextoFinal;
    if (f.razonJustificadaVal && f.razonAusenciaVal && f.razonJustificadaVal !== f.razonAusenciaVal) badgeLabel = `${f.razonAusenciaVal}: ${f.razonJustificadaVal}`;
    razonBadge = <span className="pill" style={s('background:#f5f3ff; color:#6d28d9; font-size:10px; font-weight:700; border:1px solid #ddd6fe;')} title={f.razonTextoFinal}>{rIco} {badgeLabel}</span>;
  }

  const badges: JSX.Element[] = [];
  if (f.atrasoMins > 0) badges.push(<span key="a" className="badge-tiempo badge-atraso" title={`Atraso al ingreso: ${minutosAHHMMSS(f.atrasoMins)}`}><i className="fas fa-clock" style={s('font-size:9px;')}></i> Atraso: {minutosAHHMMSS(f.atrasoMins)}</span>);
  if (f.minsSalidaTemprana > 0) badges.push(<span key="s" className="badge-tiempo badge-salida-temp" title={`Salida anticipada: ${minutosAHHMMSS(f.minsSalidaTemprana)}`}><i className="fas fa-door-open" style={s('font-size:9px;')}></i> Ant: {minutosAHHMMSS(f.minsSalidaTemprana)}</span>);
  if (f.tiempoJustificado > 0) badges.push(<span key="j" className="badge-tiempo badge-just" title={`Tiempo Justificado: ${minutosAHHMMSS(f.tiempoJustificado)}`}><i className="fas fa-check-circle" style={s('font-size:9px;')}></i> TJ: {minutosAHHMMSS(f.tiempoJustificado)}</span>);
  if (f.tiempoPersonal > 0) badges.push(<span key="p" className="badge-tiempo badge-pers" title={`Permiso Personal: ${minutosAHHMMSS(f.tiempoPersonal)}`}><i className="fas fa-user" style={s('font-size:9px;')}></i> TP: {minutosAHHMMSS(f.tiempoPersonal)}</span>);
  if (f.tiempoMedico > 0) badges.push(<span key="m" className="badge-tiempo badge-med" title={`Permiso Médico: ${minutosAHHMMSS(f.tiempoMedico)}`}><i className="fas fa-briefcase-medical" style={s('font-size:9px;')}></i> TM: {minutosAHHMMSS(f.tiempoMedico)}</span>);
  if (f.tiempoPorJustificar > 0) badges.push(<span key="f" className="badge-tiempo badge-falt" title={`Tiempo por Justificar / Faltante (fuera de las 4h): ${minutosAHHMMSS(f.tiempoPorJustificar)}`}><i className="fas fa-exclamation-triangle" style={s('font-size:9px;')}></i> Falt: {minutosAHHMMSS(f.tiempoPorJustificar)}</span>);
  if (razonBadge && !['vacación', 'vacacion', 'vacaciones', 'laboral'].includes(f.razonTextoFinal.toLowerCase())) badges.push(<span key="r">{razonBadge}</span>);
  // Motivos informados por el colaborador (D-24): se muestran, no justifican
  const motivos = f.regsDia.map(r => r.motivo_entrada_empleado || r.motivo_salida_empleado).filter(Boolean);
  const pendiente = f.regsDia.find(r => r.pendiente_aprobacion);
  if (pendiente) badges.push(<span key="pa" className="pill" style={s('background:#fef3c7; color:#92400e; font-size:10px; font-weight:700; border:1px solid #fde68a;')} title={pendiente.motivo_pendiente || ''}>⏳ Reporte pendiente de aprobación</span>);
  if (motivos.length) badges.push(<span key="me" className="pill" style={s('background:#f8fafc; color:#475569; font-size:10px; border:1px dashed #cbd5e1;')} title="Motivo informado por el colaborador">💬 {motivos.join(' · ')}</span>);

  const totalH50Dia = f.h50 + f.hC50;
  const totalH100Dia = f.h100 + f.hC100;
  const horas = (p: 'entrada' | 'salida') => f.periodos.map((x, i) => <span key={i}>{i > 0 && <br />}{x[p] ? formatearHora(x[p]!.hora) : '--:--'}</span>);

  return (
    <tr id={`fila-fecha-${f.fecha}`} style={{ ...s(rowStyle), cursor: 'pointer' }} onClick={abrir} title="Clic para gestionar jornada y permisos de esta fecha">
      {fechaCelda}
      <td className="hora-cell" style={s('font-size:11.5px; font-weight:600; padding:6px 8px; text-align:center;')}>{horas('entrada')}</td>
      <td className="hora-cell" style={s('font-size:11.5px; font-weight:600; padding:6px 8px; text-align:center;')}>
        {horas('salida')}
        {modalidadCell && <div style={s('margin-top:2px;')}>{modalidadCell}</div>}
      </td>
      <td style={{ textAlign: 'center', color: f.netWorked > 0 ? '#15803d' : '#94a3b8', fontWeight: 700, fontSize: '11.5px', padding: '6px 8px' }}>{f.netWorked > 0 ? minutosAHHMMSS(f.netWorked) : '—'}</td>
      <td style={s('font-size:11px; padding:6px 8px; text-align:center;')}>{aBadge}</td>
      <td style={s('text-align:center; font-size:10.5px; padding:6px 8px;')}>
        {badges.length > 0 ? <div style={s('display:flex; align-items:center; justify-content:center; gap:4px; flex-wrap:wrap;')}>{badges}</div> : <span style={s('color:#94a3b8; font-size:11px;')}>Normal</span>}
      </td>
      <td style={s('text-align:center; font-size:11px; padding:6px 8px;')}>
        {f.descuentoDia > 0 ? <span style={s('color:#dc2626; font-weight:800; background:#fee2e2; padding:2px 7px; border-radius:6px; border:1px solid #fca5a5;')}>{minutosAHHMMSS(f.descuentoDia)}</span> : <span style={s('color:#94a3b8;')}>—</span>}
      </td>
      <td style={s('text-align:center; font-size:11px; padding:6px 8px;')} title={`Oficina: ${minutosAHHMMSS(f.h50)} | Campo: ${minutosAHHMMSS(f.hC50)}`}>
        {totalH50Dia > 0 ? <div style={s('display:flex; flex-direction:column; align-items:center; gap:2px;')}><strong style={s('color:#1d4ed8; font-size:11.5px;')}>{minutosAHHMMSS(totalH50Dia)}</strong>{extBadge}</div> : <span style={s('color:#94a3b8;')}>—</span>}
      </td>
      <td style={s('text-align:center; font-size:11px; padding:6px 8px;')} title={`Oficina: ${minutosAHHMMSS(f.h100)} | Campo: ${minutosAHHMMSS(f.hC100)}`}>
        {totalH100Dia > 0 ? <div style={s('display:flex; flex-direction:column; align-items:center; gap:2px;')}><strong style={s('color:#4338ca; font-size:11.5px;')}>{minutosAHHMMSS(totalH100Dia)}</strong>{extBadge}</div> : <span style={s('color:#94a3b8;')}>—</span>}
      </td>
    </tr>
  );
}

function FilaTotales({ tot }: { tot: { horas: number; atrasos: number; tJustificado: number; tp: number; tm: number; tj: number; descuentoBruto: number; descuentoNeto: number; extra50: number; extra100: number } }) {
  const mA = (v: number) => (v > 0 ? <strong>{minutosAHHMMSS(v)}</strong> : '—');
  return (
    <tr style={s('background:var(--g50); border-top:2px solid var(--g300); font-weight:700; font-size:11px;')}>
      <td style={s('padding:6px 8px; font-weight:800; color:#1e293b;')}>TOTALES</td>
      <td style={s('text-align:center; color:#94a3b8;')}>—</td>
      <td style={s('text-align:center; color:#94a3b8;')}>—</td>
      <td style={s('text-align:center; color:#15803d; font-weight:800; padding:6px 8px;')}>{mA(tot.horas)}</td>
      <td style={s('text-align:center; color:#94a3b8;')}>—</td>
      <td style={s('text-align:center; padding:6px 8px;')}>
        <div style={s('display:flex; flex-wrap:wrap; justify-content:center; gap:5px; font-size:10px;')}>
          {tot.atrasos > 0 && <span style={s('background:#fee2e2; color:#b91c1c; padding:2px 6px; border-radius:5px; border:1px solid #fca5a5;')} title="Total Atrasos">Atrasos: <strong>{minutosAHHMMSS(tot.atrasos)}</strong></span>}
          {tot.tJustificado > 0 && <span style={s('background:#fef9c3; color:#854d0e; padding:2px 6px; border-radius:5px; border:1px solid #fde047;')} title="Total Tiempo Justificado">TJ: <strong>{minutosAHHMMSS(tot.tJustificado)}</strong></span>}
          {tot.tp > 0 && <span style={s('background:#e0e7ff; color:#3730a3; padding:2px 6px; border-radius:5px; border:1px solid #c7d2fe;')} title="Total Tiempo Personal">TP: <strong>{minutosAHHMMSS(tot.tp)}</strong></span>}
          {tot.tm > 0 && <span style={s('background:#ccfbf1; color:#0f766e; padding:2px 6px; border-radius:5px; border:1px solid #99f6e4;')} title="Total Tiempo Médico">TM: <strong>{minutosAHHMMSS(tot.tm)}</strong></span>}
          {tot.tj > 0 && <span style={s('background:#ffe4e6; color:#be123c; padding:2px 6px; border-radius:5px; border:1px solid #fecdd3;')} title="Total Faltante">Falt: <strong>{minutosAHHMMSS(tot.tj)}</strong></span>}
          {(tot.atrasos === 0 && tot.tJustificado === 0 && tot.tp === 0 && tot.tm === 0 && tot.tj === 0) && <span style={s('color:#94a3b8;')}>Normal</span>}
        </div>
      </td>
      <td style={s('text-align:center; padding:6px 8px;')}>
        {tot.descuentoNeto > 0
          ? <span style={s('color:var(--red); font-weight:700;')} title={`Total Bruto: ${minutosAHHMMSS(tot.descuentoBruto)} - 4h Beneficio = ${minutosAHHMMSS(tot.descuentoNeto)}`}>{minutosAHHMMSS(tot.descuentoNeto)}</span>
          : '—'}
      </td>
      <td style={s('text-align:center; padding:6px 8px; color:#1d4ed8; font-weight:800;')}>{mA(tot.extra50)}</td>
      <td style={s('text-align:center; padding:6px 8px; color:#4338ca; font-weight:800;')}>{mA(tot.extra100)}</td>
    </tr>
  );
}

// enfocarFechaEnDetalle: desplaza, resalta la fila y abre la gestión del día
export function enfocarFechaEnDetalle(empId: string, fecha: string, reintentos = 6) {
  const row = document.getElementById('fila-fecha-' + fecha);
  if (!row) {
    if (reintentos > 0) { window.setTimeout(() => enfocarFechaEnDetalle(empId, fecha, reintentos - 1), 180); return; }
    mostrarToast('Fecha ' + fecha + ' no encontrada en el período visualizado.', 'info');
    return;
  }
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.remove('fila-resaltada-regularizar');
  void row.offsetWidth;
  row.classList.add('fila-resaltada-regularizar');
  window.setTimeout(() => row.classList.remove('fila-resaltada-regularizar'), 5000);
  window.setTimeout(() => abrirModal('jornada', { id: empId, fecha }), 250);
}

export function solicitarRegularizacionWhatsApp(empleadoId: string, fechaIso: string, motivo = 'Inasistencia') {
  const emp = buscarEmpleado(empleadoId);
  if (!emp) { mostrarToast('Colaborador no encontrado', 'error'); return; }
  const pActual = sup.get().periodos[0];
  if (pActual && fechaIso && (fechaIso < pActual.inicio || fechaIso > pActual.fin)) {
    mostrarToast(`⚠️ La fecha ${fechaIso} no pertenece al período actual (${pActual.inicio} a ${pActual.fin}).`, 'warn');
  }
  const nombreDest = obtenerPrimerNombreYPrimerApellido(emp.nombre);
  const fParts = (fechaIso || '').split('-');
  const fFmt = fParts.length === 3 ? `${fParts[2]}/${fParts[1]}/${fParts[0]}` : fechaIso;
  const mensaje = `Estimado(a) *${nombreDest}*, le saludamos de Supervisión T-Control.\n\nLe recordamos que dentro del *período actual* mantiene pendiente la regularización de su asistencia de la fecha *${fFmt}* (Novedad: *${motivo}*).\n\nPor favor remita su justificativo médico o laboral correspondiente para asentar su jornada en nómina.\n\n¡Muchas gracias! 📋`;
  abrirModal('waIndividual', { id: emp.id, mensaje });
}

async function editarMetaEmpleado(empleadoId: string, campo: string, valorActual: string) {
  if (!esAdminMaster()) { mostrarToast('Solo el Administrador General puede realizar esta acción.', 'error'); return; }
  const nuevo = window.prompt(`Editar ${campo} del empleado:`, valorActual);
  if (nuevo === null || nuevo === valorActual) return;
  mostrarLoader(true);
  try {
    const r = await rpc<{ id: string }>('sup_actualizar_empleado', { p_empleado_id: empleadoId, p_campo: campo, p_valor: nuevo });
    mostrarToast('Empleado actualizado', 'success');
    await refrescarSilencioso();
    if (campo === 'id') mostrarDetalle(r.id);
  } catch (e) {
    mostrarToast(errorTexto(e), 'error');
  } finally { mostrarLoader(false); }
}

async function toggleCulturaEmpleado(empleadoId: string, estadoActual: boolean) {
  const nuevoEstado = !estadoActual;
  if (!window.confirm(nuevoEstado ? '¿Habilitar el quiz de Cultura Tcontrol para este colaborador?' : '¿Exonerar / deshabilitar a este colaborador del quiz de Cultura Tcontrol?')) return;
  mostrarLoader(true);
  try {
    await rpc('sup_actualizar_empleado', { p_empleado_id: empleadoId, p_campo: 'cultura_habilitada', p_valor: String(nuevoEstado) });
    mostrarToast(nuevoEstado ? '✅ Cultura Tcontrol habilitada para el colaborador.' : '⏸️ Colaborador exonerado de Cultura Tcontrol.', 'success');
    await refrescarSilencioso();
  } catch (e) {
    mostrarToast('Error al actualizar empleado: ' + errorTexto(e), 'error');
  } finally { mostrarLoader(false); }
}

// triggerPhotoUpload: elegir imagen, reducir a JPEG y subir
export function subirFoto(empleadoId: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const archivo = input.files?.[0];
    if (!archivo) return;
    mostrarLoader(true, 'Subiendo fotografía...', '');
    try {
      const base64 = await reducirImagen(archivo);
      await rpc('sup_subir_foto', { p_empleado_id: empleadoId, p_base64: base64 });
      mostrarToast('✅ Fotografía actualizada', 'success');
      await refrescarSilencioso();
    } catch (e) {
      mostrarToast(errorTexto(e), 'error');
    } finally { mostrarLoader(false); }
  };
  input.click();
}

function reducirImagen(archivo: File, lado = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const esc = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * esc);
      c.height = Math.round(img.height * esc);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = URL.createObjectURL(archivo);
  });
}

export type { Reg };
