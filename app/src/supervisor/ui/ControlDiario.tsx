// Asistencia → Control diario (cargarAsistencia + filtrarAsistenciaTabla del legado)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReactNode, useMemo, useState } from 'react';
import { s } from '../../lib/estilo';
import { cambiarEstadoAlmuerzo, editarValorRegistro, guardarRazonAusenciaGlobal } from '../acciones';
import { FechaRegularizar, InfoAusencia, obtenerFechasPendientesRegularizarEmpleado, obtenerInfoAusenciaPermisoHoy } from '../legado/asistencia';
import {
  Emp, HORA_ENTRADA_REF, HORA_SALIDA_REF, diaSemana, esEmpleadoPasante, esEmpleadoSoloAlmuerzo, esFeriadoODomingo,
  formatearMinutos, getLocalHoyStr, minsToHHMM, obtenerAlmuerzosExtraConsolidados, obtenerMinutos,
} from '../legado/util';
import { abrirModal, irADetalleFecha, mostrarDetalle } from '../nav';
import { sup, tienePermisoAdmin, useSup } from '../store';
import { PhotoCell } from './comun';

type Filtro = 'todos' | 'presente' | 'sin_marcar' | 'en_campo' | 'vacaciones' | 'permisos' | 'por_regularizar' | 'ausente'
  | 'tardanza' | 'almuerzo_si' | 'almuerzo_no' | 'salieron' | 'sin_salida';

interface FilaAsis {
  e: any; id: string; nombre: string; area?: string; cargo?: string;
  eReg?: any; sReg?: any; entradaHoy: boolean; salidaHoy: boolean; tard: boolean; mEnt: number | null; mSal: number | null;
  tieneSalida: boolean; esPasante: boolean; almuerzoHoy: string; modo: string; extrasVal: 'SI' | 'NO'; extrasCampo: boolean;
  infoAus: InfoAusencia; isSinAsistencia: boolean; isVisitante?: boolean; extra?: any; fechasRegularizar: FechaRegularizar[];
}

const stop = (ev: React.MouseEvent) => ev.stopPropagation();

export function ControlDiario() {
  const version = useSup(x => x.version);
  const empCache = useSup(x => x.empCache);
  const periodos = useSup(x => x.periodos);
  const solicitudes = useSup(x => x.solicitudesInvitados);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [q, setQ] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const canEditAttendance = tienePermisoAdmin();

  const datos = useMemo(() => {
    const hoy = getLocalHoyStr();
    const esFestivoHoy = esFeriadoODomingo(hoy) || diaSemana(hoy) === 6;
    const refEntradaHoy = esFestivoHoy ? 420 : HORA_ENTRADA_REF;
    const refSalidaHoy = esFestivoHoy ? 900 : HORA_SALIDA_REF;
    const pActual = periodos[0];
    const emps = [...empCache].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));

    const total = emps.length;
    const pres = emps.filter(e => e.entradaHoy).length;
    const tards = emps.filter(e => {
      if (!e.entradaHoy || esEmpleadoPasante(e)) return false;
      const m = obtenerMinutos(e.horaEntradaMs);
      return m !== null && m > refEntradaHoy + 5;
    }).length;
    const esSalida = (r: any) => (r.tipo === 'SALIDA' || r.tipo === 'SALIDA_PASANTE' || r.tipo_salida === 'SALIDA_PASANTE' || r.razon_salida === 'salida_pasante') && r.fecha === hoy;
    const salieron = emps.filter(e => e.salidaHoy || (e.registros || []).some(esSalida)).length;
    const extrasHoy = obtenerAlmuerzosExtraConsolidados(solicitudes, hoy, hoy);
    const totalExtrasHoy = extrasHoy.reduce((acc, ae) => acc + (parseInt(String(ae.cantidad), 10) || 1), 0);
    const esPresenteOAlm = (e: Emp) => e.entradaHoy || esEmpleadoSoloAlmuerzo(e) || (e.cargo || '').toUpperCase() === 'SIN ASISTENCIA';
    const almPlanta = emps.filter(e => esPresenteOAlm(e) && (e.almuerzoHoy === 'SI' || e.almuerzoHoy === 'PLANTA')).length + totalExtrasHoy;
    const almFuera = emps.filter(e => esPresenteOAlm(e) && (e.almuerzoHoy === 'NO' || e.almuerzoHoy === 'FUERA')).length;

    let countSinMarcar = 0, countCampo = 0, countVacaciones = 0, countPermisos = 0, countPorRegularizar = 0;
    const filas: FilaAsis[] = emps.map(e => {
      const isSinAsistencia = (e.cargo || '').toUpperCase() === 'SIN ASISTENCIA';
      let fechasRegularizar: FechaRegularizar[] = [];
      let infoAus: InfoAusencia = { esVacaciones: false, esCampo: false, esPermiso: false, razon: '', tipo: '', minutos: 0, icono: '', textoBadge: '' };
      if (!isSinAsistencia) {
        fechasRegularizar = pActual ? obtenerFechasPendientesRegularizarEmpleado(e, pActual.inicio, pActual.fin)
          .filter(f => f.fecha >= pActual.inicio && f.fecha <= pActual.fin) : [];
        if (fechasRegularizar.length > 0) countPorRegularizar++;
        infoAus = obtenerInfoAusenciaPermisoHoy(e, hoy);
        if (infoAus.esVacaciones) countVacaciones++;
        else if (infoAus.esPermiso) countPermisos++;
        else if (infoAus.esCampo) countCampo++;
        else if (!e.entradaHoy) countSinMarcar++;
      }
      e._fechasRegularizar = fechasRegularizar;
      e._infoAusenciaHoy = infoAus;
      const esPasante = esEmpleadoPasante(e);
      const eReg = (e.registros || []).find((r: any) => r.tipo === 'ENTRADA' && r.fecha === hoy);
      const sReg = (e.registros || []).find(esSalida);
      const mEnt = e.entradaHoy ? obtenerMinutos(e.horaEntradaMs || eReg?.hora) : null;
      const tard = !esPasante && (mEnt !== null && mEnt > refEntradaHoy + 5);
      const tieneSalida = !!(e.salidaHoy || sReg);
      const mSal = tieneSalida ? obtenerMinutos(e.horaSalidaMs || sReg?.hora) : null;
      const modo = eReg?.modo || sReg?.modo || (infoAus.esCampo ? 'CAMPO' : (e.entradaHoy ? 'EMPRESA' : '-'));
      e._modoTexto = modo;
      return {
        e, id: e.id, nombre: e.nombre, area: e.area, cargo: e.cargo, eReg, sReg, entradaHoy: !!e.entradaHoy, salidaHoy: !!e.salidaHoy, tard,
        mEnt, mSal, tieneSalida, esPasante, almuerzoHoy: e.almuerzoHoy || '', modo,
        extrasVal: (eReg?.horasExtra === 'SI' || sReg?.horasExtra === 'SI') ? 'SI' : 'NO', extrasCampo: (eReg?.autoriza || '').includes('CAMPO'),
        infoAus, isSinAsistencia, fechasRegularizar,
      };
    });
    extrasHoy.forEach((extra, idx) => {
      filas.push({
        e: { nombre: `Visitante/Extra (${extra.invitado || extra.observaciones || 'Sin detalle'})`, isVisitante: true, cantidad: extra.cantidad },
        id: extra.id || `extra_${idx}`, nombre: `Visitante/Extra (${extra.invitado || extra.observaciones || 'Sin detalle'})`,
        area: extra.area || 'Visita/Extra', entradaHoy: false, salidaHoy: false, tard: false, mEnt: null, mSal: null, tieneSalida: false,
        esPasante: false, almuerzoHoy: 'SI', modo: '-', extrasVal: 'NO', extrasCampo: false,
        infoAus: { esVacaciones: false, esCampo: false, esPermiso: false, razon: '', tipo: '', minutos: 0, icono: '', textoBadge: '' },
        isSinAsistencia: false, isVisitante: true, extra, fechasRegularizar: [],
      });
    });
    return {
      hoy, refEntradaHoy, refSalidaHoy, filas, pActual,
      kpi: { total, pres, ausentes: total - pres, salieron, sinSalida: pres - salieron, tards, totalExtrasHoy, almPlanta, almFuera,
        countSinMarcar, countCampo, countVacaciones, countPermisos, countPorRegularizar },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, empCache, periodos, solicitudes]);

  const { kpi, hoy, refEntradaHoy, refSalidaHoy, pActual } = datos;
  const qn = q.toLowerCase().trim();
  const data = datos.filas.filter(e => {
    if (qn && !e.nombre.toLowerCase().includes(qn) && !(e.area || '').toLowerCase().includes(qn) && !(e.id || '').includes(qn) && !(e.cargo || '').toLowerCase().includes(qn)) return false;
    const infoAus = e.infoAus;
    if (filtro === 'presente' && (!e.entradaHoy || e.salidaHoy)) return false;
    if (filtro === 'sin_marcar') {
      if (e.entradaHoy || e.isVisitante || e.isSinAsistencia) return false;
      return !(infoAus.esVacaciones || infoAus.esCampo || infoAus.esPermiso);
    }
    if (filtro === 'en_campo') return !e.isVisitante && !e.isSinAsistencia && infoAus.esCampo;
    if (filtro === 'vacaciones') return !e.isVisitante && !e.isSinAsistencia && infoAus.esVacaciones;
    if (filtro === 'permisos') return !e.isVisitante && !e.isSinAsistencia && infoAus.esPermiso;
    if (filtro === 'por_regularizar') return !e.isVisitante && !e.isSinAsistencia && e.fechasRegularizar.length > 0;
    if (filtro === 'ausente' && (e.entradaHoy || e.isVisitante || e.isSinAsistencia)) return false;
    if (filtro === 'tardanza' && !e.tard) return false;
    if (filtro === 'almuerzo_si' && !e.isVisitante) {
      if (!(e.entradaHoy || e.isSinAsistencia) || (e.almuerzoHoy !== 'SI' && e.almuerzoHoy !== 'PLANTA')) return false;
    }
    if (filtro === 'almuerzo_no') {
      if (!(e.entradaHoy || e.isSinAsistencia) || (e.almuerzoHoy !== 'NO' && e.almuerzoHoy !== 'FUERA')) return false;
    }
    if (filtro === 'salieron' && !e.salidaHoy) return false;
    if (filtro === 'sin_salida' && (!e.entradaHoy || e.salidaHoy)) return false;
    return true;
  });
  const mult = sortDir === 'desc' ? -1 : 1;
  data.sort((a, b) => mult * (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));

  const tarjeta = (f: Filtro, etiqueta: string, icono: string, estiloCard: string, estiloIcono: string, valor: ReactNode, idValor: string, alerta?: { id: string; estilo: string; activa: boolean }) => (
    <div className={`kpi-card${filtro === f ? ' active' : ''}${alerta?.activa ? ' has-alerts' : ''}`} data-filter={f} onClick={() => setFiltro(f)} style={s(estiloCard)}>
      {alerta && <span className="kpi-badge-alert" id={alerta.id} style={{ ...s(alerta.estilo), display: alerta.activa ? 'block' : 'none' }}></span>}
      <div className="kpi-header">
        <div className="kpi-icon" style={s(estiloIcono)}><i className={icono}></i></div>
        <span className="kpi-label">{etiqueta}</span>
      </div>
      <div className="kpi-value" id={idValor}>{valor}</div>
    </div>
  );

  return (
    <div id="subpanel-asistencia-control" className="subpanel active" style={{ display: 'block' }}>
      <div className="asistencia-header-row" style={s('background:#ffffff; border:1px solid var(--g200); border-radius:12px; padding:10px; margin-bottom:12px; display:flex; flex-direction:column; gap:10px; position: sticky; top: 0; z-index: 100; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);')}>
        <div className="cards-grid">
          {tarjeta('todos', 'Todos', 'fas fa-users', '--card-color: var(--blue); --active-bg: #eff6ff; --active-text: #1e40af; --shadow-color: rgba(37, 99, 235, 0.12);', 'background: var(--blu-lt); color: var(--blue);', kpi.total, 'asisTotal')}
          {tarjeta('presente', 'Presentes', 'fas fa-user-check', '--card-color: var(--green); --active-bg: #f0fdf4; --active-text: #15803d; --shadow-color: rgba(22, 163, 74, 0.12);', 'background: var(--grn-lt); color: var(--green);', kpi.pres - kpi.salieron, 'asisPresentes')}
          {tarjeta('sin_marcar', 'Sin Marcar', 'fas fa-bell', '--card-color: #ef4444; --active-bg: #fef2f2; --active-text: #b91c1c; --shadow-color: rgba(239, 68, 68, 0.2);', 'background: #fee2e2; color: #dc2626;', kpi.countSinMarcar, 'asisSinMarcar', { id: 'asisSinMarcarDot', estilo: '', activa: kpi.countSinMarcar > 0 })}
          {tarjeta('en_campo', 'En Campo', 'fas fa-route', '--card-color: #f59e0b; --active-bg: #fffbeb; --active-text: #b45309; --shadow-color: rgba(245, 158, 11, 0.15);', 'background: #fef3c7; color: #d97706;', kpi.countCampo, 'asisCampo')}
          {tarjeta('vacaciones', 'Vacaciones', 'fas fa-umbrella-beach', '--card-color: #06b6d4; --active-bg: #ecfeff; --active-text: #0e7490; --shadow-color: rgba(6, 182, 212, 0.15);', 'background: #cffafe; color: #0891b2;', kpi.countVacaciones, 'asisVacaciones')}
          {tarjeta('permisos', 'Permisos', 'fas fa-file-medical', '--card-color: #a855f7; --active-bg: #faf5ff; --active-text: #7e22ce; --shadow-color: rgba(168, 85, 247, 0.15);', 'background: #f3e8ff; color: #9333ea;', kpi.countPermisos, 'asisPermisos')}
          {tarjeta('tardanza', 'Tardanzas', 'fas fa-exclamation-triangle', '--card-color: var(--amber); --active-bg: #fffbeb; --active-text: #b45309; --shadow-color: rgba(217, 119, 6, 0.12);', 'background: var(--amb-lt); color: var(--amber);', kpi.tards, 'asisTardanzas')}
          {tarjeta('almuerzo_si', 'Alm. Planta', 'fas fa-utensils', '--card-color: var(--indigo); --active-bg: #eef2ff; --active-text: #4338ca; --shadow-color: rgba(99, 102, 241, 0.12);', 'background: var(--ind-lt); color: var(--indigo);', kpi.almPlanta, 'asisAlmuerzoPlanta')}
          {tarjeta('almuerzo_no', 'Alm. Fuera', 'fas fa-home', '--card-color: var(--g500); --active-bg: #f8fafc; --active-text: #334155; --shadow-color: rgba(100, 116, 139, 0.12);', 'background: var(--g100); color: var(--g500);', kpi.almFuera, 'asisAlmuerzoFuera')}
          {tarjeta('salieron', 'Ya Salieron', 'fas fa-door-open', '--card-color: var(--teal); --active-bg: #f0fdf4; --active-text: #0f766e; --shadow-color: rgba(13, 148, 136, 0.12);', 'background: var(--tel-lt); color: var(--teal);', kpi.salieron, 'asisSalieron')}
          {tarjeta('por_regularizar', 'Por Regularizar', 'fas fa-calendar-times', '--card-color: #ea580c; --active-bg: #fff7ed; --active-text: #c2410c; --shadow-color: rgba(234, 88, 12, 0.15);', 'background: #ffedd5; color: #ea580c;', kpi.countPorRegularizar, 'asisPorRegularizar', { id: 'asisPorRegularizarDot', estilo: 'background:#ea580c;', activa: kpi.countPorRegularizar > 0 })}
        </div>

        <div className="search-bar-container">
          <div className="search-input-box">
            <i className="fas fa-search search-lens-icon"></i>
            <input type="text" id="searchAsistencia" className="search-input-modern" placeholder="Buscar por nombre, ID, área o cargo..." value={q} onChange={ev => setQ(ev.target.value)} />
            <button type="button" id="btnClearSearchAsistencia" className="search-clear-btn" onClick={() => setQ('')} title="Limpiar búsqueda" style={{ display: q.trim() ? 'flex' : 'none' }}>
              <i className="fas fa-times"></i>
            </button>
          </div>
          <div className="search-count-badge" id="searchCounterBadge" title="Empleados visibles en la tabla">
            <i className="fas fa-users"></i> <span id="searchResultCount">{data.length}</span>/<span id="searchTotalCount">{datos.filas.length}</span>
          </div>
          <div>
            <button type="button" id="btnNotificarWhatsAppUnificado" className="btn" onClick={() => abrirModal('waSinMarcar', { categoria: 'sin_marcar' })}
              style={s('display:inline-flex; background:linear-gradient(135deg, #16a34a 0%, #15803d 100%); color:white; font-size:12px; font-weight:700; border:none; border-radius:10px; padding:7px 14px; align-items:center; gap:7px; cursor:pointer; box-shadow:0 2px 6px rgba(22,163,74,0.25); white-space:nowrap; transition:all 0.2s;')}
              title="Abrir centro de notificaciones WhatsApp">
              <i className="fab fa-whatsapp" style={s('font-size:15px;')}></i> <span>Notificar WhatsApp (<strong id="lblCountTotalPendientesWhatsApp">{kpi.countSinMarcar}</strong>)</span>
            </button>
          </div>
          <div>
            <button type="button" id="btnRegistroManualAsistencia" className="btn" onClick={() => abrirModal('manual', {})}
              style={s('display:inline-flex; background:linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color:white; font-size:12px; font-weight:700; border:none; border-radius:10px; padding:7px 14px; align-items:center; gap:7px; cursor:pointer; box-shadow:0 2px 6px rgba(37,99,235,0.25); white-space:nowrap; transition:all 0.2s;')}
              title="Crear un nuevo registro manual de asistencia">
              <i className="fas fa-plus-circle" style={s('font-size:14px;')}></i> <span>Registro Manual</span>
            </button>
          </div>
        </div>
      </div>
      <div className="reportes-table-card asistencia-table-card">
        <div className="table-wrapper-enhanced">
          <div className="table-scroll-wrap" id="asistenciaTableScrollWrap">
            <div id="asistenciaTablaContainer">
              {data.length === 0 ? (
                <div className="empty-state" style={s('padding:45px 20px; text-align:center;')}>
                  <i className="fas fa-users-slash" style={s('font-size:32px; color:#cbd5e1; margin-bottom:12px;')}></i>
                  <p style={s('color:#64748b; font-weight:600; font-size:13px;')}>No hay colaboradores que coincidan con el filtro seleccionado</p>
                </div>
              ) : (
                <TablaAsistencia data={data} filtro={filtro} hoy={hoy} refEntradaHoy={refEntradaHoy} refSalidaHoy={refSalidaHoy}
                  canEdit={canEditAttendance} sortDir={sortDir} onSort={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))} pActual={pActual} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const COLUMNAS: Record<Filtro, string[]> = {
  todos: ['Empleado', 'Área', 'Entrada', 'Salida', 'Extras', 'Estado', 'Almuerzo'],
  presente: ['Empleado', 'Área', 'Entrada', 'Extras', 'Estado', 'Almuerzo'],
  sin_marcar: ['Empleado', 'Área', 'Estado', 'Almuerzo'],
  en_campo: ['Empleado', 'Área', 'Entrada', 'Salida', 'Extras', 'Estado', 'Almuerzo'],
  vacaciones: ['Empleado', 'Área', 'Estado'],
  permisos: ['Empleado', 'Área', 'Entrada', 'Salida', 'Estado', 'Almuerzo'],
  por_regularizar: ['Empleado', 'Área', 'Regularización', 'Entrada', 'Salida', 'Estado', 'Almuerzo'],
  ausente: ['Empleado', 'Área', 'Estado', 'Almuerzo'],
  tardanza: ['Empleado', 'Área', 'Entrada', 'Extras', 'Estado', 'Almuerzo'],
  almuerzo_si: ['Empleado', 'Área', 'Estado', 'Almuerzo'],
  almuerzo_no: ['Empleado', 'Área', 'Estado', 'Almuerzo'],
  salieron: ['Empleado', 'Área', 'Salida', 'Extras', 'Estado', 'Almuerzo'],
  sin_salida: ['Empleado', 'Área', 'Entrada', 'Salida', 'Extras', 'Estado', 'Almuerzo'],
};

function SelectRazon({ id }: { id: string }) {
  return (
    <div style={s('position:relative; width:100%; min-width:125px; margin-top:4px;')}>
      <select value="" onChange={ev => { void guardarRazonAusenciaGlobal(id, ev.target.value); }} onClick={stop} className="select-ausencia-modern"
        style={s('border:1px solid #cbd5e1; background:#ffffff; color:#475569; font-size:10px; padding:3px 6px;')}>
        <option value="">+ Razón...</option>
        <option value="Vacación">🏖️ Vacación</option>
        <optgroup label="📋 Permiso Justificado">
          <option value="Permiso Personal">👤 Permiso Personal</option>
          <option value="Permiso Médico">🩺 Permiso Médico</option>
          <option value="Falta Justificada">✅ Falta Justificada</option>
        </optgroup>
        <option value="Campo">🚗 Campo</option>
        <option value="Otro">✏️ Otro...</option>
      </select>
    </div>
  );
}

function TablaAsistencia({ data, filtro, hoy, refEntradaHoy, refSalidaHoy, canEdit, sortDir, onSort, pActual }: {
  data: FilaAsis[]; filtro: Filtro; hoy: string; refEntradaHoy: number; refSalidaHoy: number; canEdit: boolean; sortDir: string;
  onSort: () => void; pActual?: { inicio: string; fin: string };
}) {
  const cols = COLUMNAS[filtro] || COLUMNAS.todos;
  const enPeriodo = (l: FechaRegularizar[]) => l.filter(f => !pActual || (f.fecha >= pActual.inicio && f.fecha <= pActual.fin));
  const totalVisible = data.length;
  const countEntradas = data.filter(e => e.entradaHoy).length;
  const countSalidas = data.filter(e => e.salidaHoy).length;
  const countAlmPlanta = data.reduce((acc, e) => {
    if (e.isVisitante) return acc + (parseInt(e.e.cantidad, 10) || 1);
    const esPresenteOAlm = e.entradaHoy || esEmpleadoSoloAlmuerzo(e.e) || e.isSinAsistencia;
    return esPresenteOAlm && (e.almuerzoHoy === 'SI' || e.almuerzoHoy === 'PLANTA') ? acc + 1 : acc;
  }, 0);
  const countCampoVis = data.filter(e => !e.isVisitante && (e.modo === 'CAMPO' || (e.e.registros || []).some((r: any) => r.modo === 'CAMPO' && r.fecha === hoy))).length;
  const countExtrasAut = data.filter(e => !e.isVisitante && (e.extrasCampo || e.extrasVal === 'SI')).length;
  const sortIcon = sortDir === 'desc' ? 'fa-sort-alpha-up-alt' : 'fa-sort-alpha-down';

  const celdaEntrada = (e: FilaAsis) => {
    if (e.isVisitante) return <span className="rep-badge-pill" style={s('background:#f1f5f9; color:#64748b; border:1px solid #e2e8f0; font-size:10.5px;')}><i className="fas fa-clock" style={s('font-size:9px;')}></i> {e.extra?.hora || '--:--'}</span>;
    const click = canEdit ? (ev: React.MouseEvent) => { ev.stopPropagation(); void editarValorRegistro(e.id, 'ENTRADA', 'hora', e.e.horaEntrada || e.eReg?.hora || '-'); } : undefined;
    if (e.entradaHoy) {
      if (e.tard) {
        return <span className="editable-cell rep-badge-pill rep-badge-atraso-alert" onClick={click} title={canEdit ? 'Clic para editar entrada' : 'Entrada con atraso'}>
          <i className="fas fa-clock" style={s('font-size:9.5px;')}></i> {e.mEnt !== null ? minsToHHMM(e.mEnt) : 'Registrada'} <span className="delta-badge">+{formatearMinutos((e.mEnt || 0) - refEntradaHoy)}</span></span>;
      }
      return <span className="editable-cell rep-badge-pill rep-badge-asis" onClick={click} title={e.esPasante ? 'Entrada (Horario Flexible - Pasante)' : (canEdit ? 'Clic para editar entrada' : 'Entrada puntual')}>
        {e.esPasante ? <i className="fas fa-user-graduate" style={s('font-size:9.5px; color:#7c3aed;')}></i> : <i className="fas fa-check" style={s('font-size:9.5px;')}></i>} {e.mEnt !== null ? minsToHHMM(e.mEnt) : 'Registrada'}</span>;
    }
    return <span className="editable-cell rep-asis-empty" onClick={click} title={canEdit ? 'Clic para ingresar entrada manual' : ''}>—</span>;
  };

  const celdaSalida = (e: FilaAsis) => {
    if (e.isVisitante) return <span className="rep-asis-empty">—</span>;
    const click = canEdit ? (ev: React.MouseEvent) => { ev.stopPropagation(); void editarValorRegistro(e.id, 'SALIDA', 'hora', e.e.horaSalida || e.sReg?.hora || (e.entradaHoy ? 'Pendiente' : '-')); } : undefined;
    if (e.tieneSalida) {
      if (!e.esPasante && e.mSal !== null && (e.mSal - refSalidaHoy > 1)) {
        return <span className="editable-cell rep-badge-pill rep-badge-ex50" onClick={click} title={canEdit ? 'Clic para editar salida' : 'Salida con tiempo adicional'}>
          <i className="fas fa-sign-out-alt" style={s('font-size:9.5px;')}></i> {minsToHHMM(e.mSal)} <span className="delta-badge" style={s('background:#dbeafe; color:#1d4ed8;')}>+{formatearMinutos(e.mSal - refSalidaHoy)}</span></span>;
      }
      return <span className="editable-cell rep-badge-pill rep-badge-alm" style={e.esPasante ? s('background:#f5f3ff; color:#6d28d9; border:1px solid #ddd6fe;') : undefined} onClick={click}
        title={canEdit ? 'Clic para editar salida' : (e.esPasante ? 'Salida Pasante (Horario Flexible)' : 'Salida registrada')}>
        {e.esPasante ? <i className="fas fa-user-graduate" style={s('font-size:9.5px;')}></i> : <i className="fas fa-sign-out-alt" style={s('font-size:9.5px;')}></i>} {e.mSal !== null ? minsToHHMM(e.mSal) : 'Registrada'}</span>;
    }
    if (e.entradaHoy) {
      return <span className="editable-cell rep-badge-pill rep-badge-atraso-alert" onClick={click} style={s('background:#fffbeb; color:#b45309; border:1px dashed #fde68a;')} title={canEdit ? 'Clic para registrar salida' : 'Pendiente de salida'}>
        <i className="fas fa-hourglass-half" style={s('font-size:9px;')}></i> Pendiente</span>;
    }
    return <span className="editable-cell rep-asis-empty" onClick={click} title={canEdit ? 'Clic para registrar salida manual' : ''}>—</span>;
  };

  const celdaExtras = (e: FilaAsis) => {
    if (e.isVisitante) return <span className="rep-asis-empty">N/A</span>;
    const badge = e.extrasCampo
      ? <span className="rep-badge-pill rep-badge-campo" title="Auto-autorizado por Campo"><i className="fas fa-check-double" style={s('font-size:9.5px;')}></i> CAMPO</span>
      : e.extrasVal === 'SI'
        ? <span className="rep-badge-pill rep-badge-ex50" title="Horas Extras Autorizadas"><i className="fas fa-bolt" style={s('font-size:9.5px;')}></i> AUTORIZADO</span>
        : <span className="rep-badge-pill" style={s('color:#94a3b8; background:#f8fafc; border:1px solid #e2e8f0; font-weight:600;')}>NO</span>;
    if (!canEdit) return badge;
    return <span className="editable-pill" onClick={ev => { ev.stopPropagation(); void editarValorRegistro(e.id, 'ENTRADA', 'horasExtra', e.extrasVal, hoy); }} title="Clic para editar extras">{badge}</span>;
  };

  const celdaEstado = (e: FilaAsis) => {
    if (e.isVisitante) return <span className="rep-badge-pill" style={s('background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; font-size:10.5px;')}><i className="fas fa-id-badge"></i> Invitado</span>;
    const infoAus = e.infoAus;
    if (e.isSinAsistencia) return <span className="rep-badge-pill" style={s('background:#f1f5f9; color:#64748b; border:1px dashed #cbd5e1;')}><i className="fas fa-utensils"></i> Solo Alm.</span>;
    if (infoAus.esVacaciones) return <span className="rep-badge-pill" style={s('background:#fffbeb; color:#b45309; border:1px solid #fde68a; font-weight:700;')}><i className="fas fa-umbrella-beach"></i> Vacación</span>;
    if (infoAus.esPermiso) {
      return <span className="rep-badge-pill" style={s('background:#f5f3ff; color:#6d28d9; border:1px solid #ddd6fe; font-weight:700;')} onClick={canEdit ? stop : undefined} title={infoAus.razon || 'Permiso'}>
        <i className="fas fa-file-signature"></i> {infoAus.icono} {infoAus.textoBadge}</span>;
    }
    if (infoAus.esCampo) {
      return <span className="rep-badge-pill rep-badge-campo" onClick={canEdit ? (ev => { ev.stopPropagation(); void editarValorRegistro(e.id, 'ENTRADA', 'modo', e.modo || 'CAMPO', hoy); }) : undefined}
        title={canEdit ? 'Clic para editar modo' : 'En Campo'}><i className="fas fa-truck-pickup" style={s('font-size:9.5px;')}></i> Campo</span>;
    }
    if (!e.entradaHoy) {
      let tel = String(e.e.telefono || '').replace(/\D/g, '');
      if (tel.startsWith('0')) tel = '593' + tel.substring(1);
      const msg = encodeURIComponent('Hola, te recordamos que no has registrado tu asistencia el día de hoy.');
      return (
        <div style={s('display:flex; flex-direction:column; align-items:center; gap:2px;')}>
          <div style={s('display:flex; align-items:center;')}>
            <span className="rep-badge-pill rep-badge-falta-alert"><i className="fas fa-times-circle"></i> Ausente</span>
            {tel.length >= 9 && <a href={`https://wa.me/${tel}?text=${msg}`} target="_blank" rel="noreferrer" onClick={stop}
              style={s('display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:#25d366; color:#ffffff; font-size:12px; margin-left:6px; vertical-align:middle; text-decoration:none; box-shadow:0 1px 3px rgba(37,211,102,0.3); transition:transform 0.2s;')}
              title="Notificar por WhatsApp"><i className="fab fa-whatsapp"></i></a>}
          </div>
          <SelectRazon id={e.id} />
        </div>
      );
    }
    return <span className="rep-asis-empty">—</span>;
  };

  const celdaAlmuerzo = (e: FilaAsis) => {
    if (e.isVisitante) return <span className="rep-badge-pill" style={s('background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; font-size:11px; font-weight:700;')}><i className="fas fa-utensils" style={s('margin-right:4px;')}></i> +{e.extra?.cantidad || 1} Extra(s)</span>;
    if (!e.entradaHoy && !e.isSinAsistencia) return <span className="rep-asis-empty" style={s('font-size:11px; opacity:0.6;')}>Ausente</span>;
    const puedeEditar = e.entradaHoy || canEdit || e.isSinAsistencia;
    const isSi = e.almuerzoHoy === 'SI' || e.almuerzoHoy === 'PLANTA';
    const isNo = e.almuerzoHoy === 'NO' || e.almuerzoHoy === 'FUERA';
    return (
      <div className="almuerzo-toggle-modern">
        <button type="button" className={`almuerzo-btn-toggle ${isSi ? 'active-si' : ''} ${!puedeEditar ? 'disabled' : ''}`} disabled={!puedeEditar}
          onClick={ev => { ev.stopPropagation(); void cambiarEstadoAlmuerzo(e.id, 'SI'); }} title="Almuerzo en Planta"><i className="fas fa-utensils"></i> Sí</button>
        <button type="button" className={`almuerzo-btn-toggle ${isNo ? 'active-no' : ''} ${!puedeEditar ? 'disabled' : ''}`} disabled={!puedeEditar}
          onClick={ev => { ev.stopPropagation(); void cambiarEstadoAlmuerzo(e.id, 'NO'); }} title="Sin Almuerzo"><i className="fas fa-times"></i> No</button>
      </div>
    );
  };

  const cuerpo: Record<string, (e: FilaAsis) => ReactNode> = {
    'Empleado': e => {
      const listAct = enPeriodo(e.fechasRegularizar);
      const targetF = listAct.length > 0 ? listAct[0].fecha : '';
      return (
        <td><div className="employee-cell"><PhotoCell e={e.isVisitante ? { nombre: e.nombre, isVisitante: true } : e.e} /><div>
          <strong style={s('color:#0f172a; font-size:12.5px;')}>{e.nombre}</strong>
          {listAct.length > 0 && <button type="button" onClick={ev => { ev.stopPropagation(); irADetalleFecha(e.id, targetF); }}
            title={`${listAct.length} fecha(s) por regularizar en período actual. Clic para ir directamente al registro del ${targetF}`}
            style={s('background:#fff7ed; color:#c2410c; border:1px solid #fed7aa; border-radius:5px; padding:1.5px 6px; font-size:9.5px; font-weight:800; margin-left:6px; display:inline-flex; align-items:center; gap:3px; cursor:pointer;')}>
            <i className="fas fa-calendar-times" style={s('font-size:9px;')}></i> {listAct.length} pend.</button>}
          {e.id && !e.isVisitante && <div style={s('font-size:10px; color:#64748b; font-weight:600; margin-top:1px;')}><i className="fas fa-id-badge" style={s('font-size:9.5px; color:#6366f1;')}></i> ID: {e.id}</div>}
        </div></div></td>
      );
    },
    'Área': e => <td><span className="rep-asis-chip"><i className="fas fa-briefcase" style={s('font-size:9px; color:#94a3b8;')}></i> {e.area || '—'}</span></td>,
    'Regularización': e => {
      const list = enPeriodo(e.fechasRegularizar);
      if (!list.length) return <td style={s('text-align:center;')}><span style={s('color:#10b981; font-weight:600; font-size:11px; display:inline-flex; align-items:center; gap:4px;')}><i className="fas fa-check-circle" style={s('font-size:10px;')}></i> Al día</span></td>;
      return (
        <td><div style={s('display:flex; align-items:center; gap:5px; flex-wrap:wrap;')}>
          <button type="button" onClick={ev => { ev.stopPropagation(); irADetalleFecha(e.id, list[0].fecha); }} className="pill warn"
            style={s('background:#ffedd5; color:#c2410c; font-weight:800; font-size:10px; border:1px solid #fed7aa; cursor:pointer;')} title={`Clic para ir a la primera fecha pendiente (${list[0].fecha})`}>
            <i className="fas fa-calendar-times"></i> {list.length}</button>{' '}
          {list.slice(0, 3).map(f => (
            <button key={f.fecha} type="button" onClick={ev => { ev.stopPropagation(); irADetalleFecha(e.id, f.fecha); }} className="btn-chip-regularizar-tabla"
              title={`Clic para ir directamente a la fecha ${f.fecha} (${f.motivo}) en el período actual`}>
              <i className="fas fa-calendar-day" style={s('color: #ea580c; font-size: 9.5px;')}></i>
              <span>{f.label}</span>
              <span style={s('background: #ffedd5; color: #c2410c; padding: 1px 4px; border-radius: 3px; font-size: 9px; font-weight: 700;')}>{f.motivo}</span>
            </button>
          ))}
          {list.length > 3 && <button type="button" onClick={ev => { ev.stopPropagation(); irADetalleFecha(e.id, list[3].fecha); }} className="btn-chip-regularizar-tabla"
            style={s('background:#fff7ed; color:#ea580c;')} title={`Ver ${list.length - 3} fechas más`}>+{list.length - 3} más</button>}
        </div></td>
      );
    },
    'Entrada': e => <td style={s('text-align:center;')}>{celdaEntrada(e)}</td>,
    'Salida': e => <td style={s('text-align:center;')}>{celdaSalida(e)}</td>,
    'Extras': e => <td style={s('text-align:center;')}>{celdaExtras(e)}</td>,
    'Estado': e => <td style={s('text-align:center;')}>{celdaEstado(e)}</td>,
    'Almuerzo': e => <td style={s('text-align:center;')}>{celdaAlmuerzo(e)}</td>,
  };

  const cabecera: Record<string, ReactNode> = {
    'Empleado': <th onClick={onSort} style={s('cursor:pointer; background:#f8fafc; color:#1e293b; border-bottom:2px solid #2563eb; position:sticky; left:0; z-index:30;')} title="Clic para alternar orden alfabético"><i className="fas fa-user-tie" style={s('color:#2563eb; margin-right:6px;')}></i> Colaborador <i className={`fas ${sortIcon}`} style={s('color:#2563eb; font-size:10px; margin-left:4px;')}></i></th>,
    'Área': <th style={s('background:#f8fafc; color:#475569; border-bottom:2px solid #64748b;')}><i className="fas fa-building" style={s('color:#64748b; margin-right:5px;')}></i> Área</th>,
    'Regularización': <th style={s('background:#fff7ed; color:#c2410c; border-bottom:2px solid #ea580c;')}><i className="fas fa-calendar-times" style={s('color:#ea580c; margin-right:5px;')}></i> Fechas por Regularizar</th>,
    'Entrada': <th style={s('background:#ecfdf5; color:#047857; border-bottom:2px solid #047857; text-align:center;')}><i className="fas fa-sign-in-alt" style={s('color:#047857; margin-right:5px;')}></i> Entrada</th>,
    'Salida': <th style={s('background:#f0f9ff; color:#0284c7; border-bottom:2px solid #0284c7; text-align:center;')}><i className="fas fa-sign-out-alt" style={s('color:#0284c7; margin-right:5px;')}></i> Salida</th>,
    'Extras': <th style={s('background:#eff6ff; color:#1d4ed8; border-bottom:2px solid #1d4ed8; text-align:center;')}><i className="fas fa-bolt" style={s('color:#1d4ed8; margin-right:5px;')}></i> Extras</th>,
    'Estado': <th style={s('background:#f0fdf4; color:#15803d; border-bottom:2px solid #15803d; text-align:center;')}><i className="fas fa-shield-alt" style={s('color:#15803d; margin-right:5px;')}></i> Estado</th>,
    'Almuerzo': <th style={s('background:#f0f9ff; color:#0284c7; border-bottom:2px solid #0284c7; text-align:center;')}><i className="fas fa-utensils" style={s('color:#0284c7; margin-right:5px;')}></i> Almuerzo</th>,
  };

  const pie: Record<string, ReactNode> = {
    'Empleado': <td><strong style={s('color:#38bdf8; font-size:12px; display:inline-flex; align-items:center; gap:5px;')}><i className="fas fa-users" style={s('color:#38bdf8;')}></i> TOTALES ({totalVisible})</strong></td>,
    'Área': <td style={s('color:#94a3b8;')}>—</td>,
    'Regularización': <td><span className="rep-badge-pill" style={s('background:#334155; color:#fdba74; border:1px solid #475569;')}><i className="fas fa-calendar-times" style={s('font-size:9px;')}></i> {data.filter(e => enPeriodo(e.fechasRegularizar).length > 0).length} Pend.</span></td>,
    'Entrada': <td style={s('text-align:center;')}><span className="rep-badge-pill" style={s('background:#064e3b; color:#4ade80; border:1px solid #047857;')}><i className="fas fa-sign-in-alt" style={s('font-size:9.5px;')}></i> {countEntradas} Entradas</span></td>,
    'Salida': <td style={s('text-align:center;')}><span className="rep-badge-pill" style={s('background:#0c4a6e; color:#38bdf8; border:1px solid #0284c7;')}><i className="fas fa-sign-out-alt" style={s('font-size:9.5px;')}></i> {countSalidas} Salidas</span></td>,
    'Extras': <td style={s('text-align:center;')}><span className="rep-badge-pill" style={s('background:#1e3a8a; color:#93c5fd; border:1px solid #1d4ed8;')}><i className="fas fa-bolt" style={s('font-size:9.5px;')}></i> {countExtrasAut} Aut.</span></td>,
    'Estado': <td style={s('text-align:center; color:#94a3b8;')}>—</td>,
    'Almuerzo': <td style={s('text-align:center;')}><span className="rep-badge-pill" style={s('background:#713f12; color:#fde047; border:1px solid #a16207;')}><i className="fas fa-utensils" style={s('font-size:9.5px;')}></i> {countAlmPlanta} Planta</span></td>,
  };
  void countCampoVis;

  return (
    <table className="employee-table table-compact">
      <thead><tr>{cols.map(c => <FragmentKey key={c}>{cabecera[c]}</FragmentKey>)}</tr></thead>
      <tbody>
        {data.map(e => {
          const listAct = enPeriodo(e.fechasRegularizar);
          const onClick = () => {
            if (e.isVisitante) return;
            if (filtro === 'por_regularizar' && listAct.length) irADetalleFecha(e.id, listAct[0].fecha);
            else mostrarDetalle(e.id);
          };
          return <tr key={e.id} onClick={onClick} style={s('cursor:pointer;')}>{cols.map(c => <FragmentKey key={c}>{cuerpo[c](e)}</FragmentKey>)}</tr>;
        })}
      </tbody>
      <tfoot><tr className="rep-totals-row">{cols.map(c => <FragmentKey key={c}>{pie[c]}</FragmentKey>)}</tr></tfoot>
    </table>
  );
}

function FragmentKey({ children }: { children: ReactNode }) { return <>{children}</>; }

// Refresco manual para que otros módulos vuelvan a calcular el control diario
export function recalcularControlDiario() { sup.tocar(); }
