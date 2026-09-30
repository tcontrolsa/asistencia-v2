// Asistencia → Mapa de asistencia y disponibilidad (supervisor_mapa.js)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react';
import { s } from '../../lib/estilo';
import {
  Emp, HORA_ENTRADA_REF, diaSemana, esFeriadoODomingo, getLocalHoyStr, normalizarFechaStr, obtenerAlmuerzosExtraConsolidados,
  obtenerMinutos, sumarDias,
} from '../legado/util';
import { abrirModal, mostrarDetalle } from '../nav';
import { asegurarRegistros, cargarDatosCompletos, mostrarLoader, useSup } from '../store';
import { PhotoCell, errorTexto, mostrarToast } from './comun';

type Rango = 'semana' | '14dias' | 'mes' | 'periodo';
interface Estado { codigo: string; label: string; sub: string; icono: string; color: string; bg: string; border: string; alm: string; detalle: string }

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const corta = (f: string) => { const p = f.split('-'); return p.length < 3 ? f : `${p[2]} ${MESES[parseInt(p[1], 10) - 1] || p[1]}`; };
const lista = (ini: string, fin: string, max = 400) => { const r: string[] = []; for (let f = ini; f <= fin && r.length < max; f = sumarDias(f, 1)) r.push(f); return r; };

export function obtenerEstadoEmpleadoEnFecha(emp: Emp, fechaStr: string): Estado {
  const hoyStr = getLocalHoyStr();
  const esHoy = fechaStr === hoyStr;
  const regs = (emp.registros || []).filter(r => normalizarFechaStr(r.fecha) === fechaStr);
  const rEntrada = regs.find(r => r.tipo === 'ENTRADA');
  const rSalida = regs.find(r => r.tipo === 'SALIDA');
  const rAusencia = regs.find(r => { const t = String(r.tipo || '').toUpperCase(); return t !== 'ENTRADA' && t !== 'SALIDA' && t !== 'SOLO_ALMUERZO'; });
  const razonStr = String(rAusencia?.razon_ausencia || rAusencia?.razon_permiso || rAusencia?.observacion || rAusencia?.tipo || '').toUpperCase();
  const modoStr = String(regs.find(r => r.modo)?.modo || rEntrada?.modo || '').toUpperCase();
  const dow = diaSemana(fechaStr);
  const esFinde = dow === 0 || dow === 6 || esFeriadoODomingo(fechaStr);

  if (modoStr.includes('CAMPO') || razonStr.includes('CAMPO') || razonStr.includes('TRABAJO_DE_CAMPO')) {
    return { codigo: 'CAMPO', label: 'En Campo', sub: rAusencia?.observacion || (rEntrada?.hora ? `Ent: ${rEntrada.hora.slice(0, 5)}` : 'Salida Campo'),
      icono: 'fas fa-route', color: '#c2410c', bg: '#fff7ed', border: '#fed7aa', alm: rEntrada?.almuerzo || emp.almuerzoHoy || '',
      detalle: `Trabajo en campo: ${rAusencia?.observacion || 'Autorizado'}` };
  }
  if (razonStr.includes('VACACI') || (emp.estado || '').toUpperCase() === 'VACACIONES') {
    return { codigo: 'VACACIONES', label: 'Vacación', sub: 'Gozando período', icono: 'fas fa-umbrella-beach', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', alm: '', detalle: 'Vacaciones programadas' };
  }
  if (razonStr.includes('MEDIC') || razonStr.includes('SALUD') || razonStr.includes('DOCTOR')) {
    return { codigo: 'PERMISO_MEDICO', label: 'P. Médico', sub: rAusencia?.observacion || 'Certificado médico', icono: 'fas fa-stethoscope', color: '#7c3aed',
      bg: '#f5f3ff', border: '#ddd6fe', alm: '', detalle: `Permiso médico: ${rAusencia?.observacion || 'Justificado'}` };
  }
  if (razonStr.includes('PERMISO') || razonStr.includes('CALAMIDAD') || razonStr.includes('PERSONAL')) {
    return { codigo: 'PERMISO', label: 'Permiso', sub: rAusencia?.observacion || 'Permiso personal', icono: 'fas fa-file-signature', color: '#9333ea',
      bg: '#faf5ff', border: '#f3e8ff', alm: '', detalle: `Permiso autorizado: ${rAusencia?.observacion || 'Aprobado'}` };
  }
  if (rEntrada || (esHoy && emp.entradaHoy)) {
    const horaE = rEntrada?.hora || emp.horaEntrada || '';
    const horaS = rSalida?.hora || emp.horaSalida || '';
    const mEnt = obtenerMinutos(horaE);
    const refEnt = esFinde ? 420 : HORA_ENTRADA_REF;
    if (mEnt !== null && mEnt > refEnt + 5) {
      return { codigo: 'TARDANZA', label: 'Tardanza', sub: horaE ? horaE.slice(0, 5) : 'Con atraso', icono: 'fas fa-exclamation-triangle', color: '#b45309',
        bg: '#fffbeb', border: '#fde68a', alm: rEntrada?.almuerzo || emp.almuerzoHoy || '', detalle: `Entrada con retraso: ${horaE}${horaS ? ' · Salida: ' + horaS : ''}` };
    }
    return { codigo: 'PRESENTE', label: 'En Planta', sub: horaE ? horaE.slice(0, 5) : 'Puntual', icono: 'fas fa-building', color: '#15803d', bg: '#f0fdf4',
      border: '#bbf7d0', alm: rEntrada?.almuerzo || emp.almuerzoHoy || '', detalle: `Asistencia regular: ${horaE}${horaS ? ' · Salida: ' + horaS : ''}` };
  }
  if (esFinde) {
    return { codigo: 'DESCANSO', label: 'Descanso', sub: dow === 0 ? 'Domingo' : dow === 6 ? 'Sábado' : 'Feriado', icono: 'fas fa-bed', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', alm: '', detalle: 'Día no laborable / Descanso' };
  }
  if (esHoy) return { codigo: 'SIN_MARCAR', label: 'Sin Marcar', sub: 'Pendiente hoy', icono: 'fas fa-bell', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', alm: emp.almuerzoHoy || '', detalle: 'Sin registro de entrada al momento' };
  if (fechaStr < hoyStr) return { codigo: 'FALTA', label: 'Falta', sub: 'Injustificada', icono: 'fas fa-times-circle', color: '#ef4444', bg: '#fee2e2', border: '#fca5a5', alm: '', detalle: 'Falta laboral no registrada' };
  return { codigo: 'PROGRAMADO', label: 'Programado', sub: 'Jornada normal', icono: 'fas fa-calendar', color: '#94a3b8', bg: '#ffffff', border: '#e2e8f0', alm: '', detalle: 'Jornada laboral programada' };
}

const FUTUROS = ['VACACIONES', 'CAMPO', 'PERMISO', 'PERMISO_MEDICO'];

export function Mapa() {
  const empCache = useSup(x => x.empCache);
  const version = useSup(x => x.version);
  const periodos = useSup(x => x.periodos);
  const solicitudes = useSup(x => x.solicitudesInvitados);
  const [rango, setRango] = useState<Rango | null>('semana');
  const [ref, setRef] = useState(getLocalHoyStr());
  const [custom, setCustom] = useState<{ ini: string; fin: string } | null>(null);
  const [vista, setVista] = useState<'matriz' | 'tarjetas' | 'cobertura'>('matriz');
  const [kpiF, setKpiF] = useState('todos');
  const [estadoF, setEstadoF] = useState('TODOS');
  const [q, setQ] = useState('');
  const [area, setArea] = useState('');

  const rangoInfo = useMemo(() => {
    if (custom) {
      const fechas = lista(custom.ini, custom.fin, 90);
      return { fechas, inicio: custom.ini, fin: custom.fin, label: `${corta(custom.ini)} - ${corta(custom.fin)} (${fechas.length} días)` };
    }
    if (rango === '14dias') {
      const fechas = lista(sumarDias(ref, -6), sumarDias(ref, 7));
      return { fechas, inicio: fechas[0], fin: fechas[13], label: `14 Días: ${corta(fechas[0])} al ${corta(fechas[13])}` };
    }
    if (rango === 'mes') {
      const [y, m] = ref.split('-').map(Number);
      const ini = `${y}-${String(m).padStart(2, '0')}-01`;
      const fin = sumarDias(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1);
      return { fechas: lista(ini, fin), inicio: ini, fin, label: `Mes de ${MESES_LARGO[m - 1]} ${y}` };
    }
    if (rango === 'periodo') {
      const p = periodos.find(x => ref >= x.inicio && ref <= x.fin) || periodos[0];
      return { fechas: lista(p.inicio, p.fin, 40), inicio: p.inicio, fin: p.fin, label: `Período: ${p.label || `${p.inicio} al ${p.fin}`}` };
    }
    const dow = diaSemana(ref);
    const lunes = sumarDias(ref, dow === 0 ? -6 : 1 - dow);
    const fechas = lista(lunes, sumarDias(lunes, 6));
    return { fechas, inicio: fechas[0], fin: fechas[6], label: `Semana: ${corta(fechas[0])} al ${corta(fechas[6])}` };
  }, [rango, ref, custom, periodos]);

  // Rangos anteriores a la carga inicial: traer esos registros (el legado tenía todo el histórico)
  useEffect(() => { asegurarRegistros(rangoInfo.inicio, rangoInfo.fin).catch(() => undefined); }, [rangoInfo.inicio, rangoInfo.fin]);

  const hoyStr = getLocalHoyStr();
  const calc = useMemo(() => {
    const k = { total: empCache.length, planta: 0, sinMarcar: 0, campo: 0, vac: 0, perm: 0, tard: 0, futuros: 0, almP: 0, almF: 0 };
    empCache.forEach(e => {
      const st = obtenerEstadoEmpleadoEnFecha(e, hoyStr);
      if (st.codigo === 'PRESENTE') k.planta++;
      else if (st.codigo === 'TARDANZA') { k.planta++; k.tard++; }
      else if (st.codigo === 'SIN_MARCAR') k.sinMarcar++;
      else if (st.codigo === 'CAMPO') k.campo++;
      else if (st.codigo === 'VACACIONES') k.vac++;
      else if (st.codigo === 'PERMISO_MEDICO' || st.codigo === 'PERMISO') k.perm++;
      const esPresOAlm = e.entradaHoy || (e.cargo || '').toUpperCase() === 'SIN ASISTENCIA';
      if (esPresOAlm && (e.almuerzoHoy === 'SI' || e.almuerzoHoy === 'PLANTA')) k.almP++;
      else if (esPresOAlm && (e.almuerzoHoy === 'NO' || e.almuerzoHoy === 'FUERA')) k.almF++;
      rangoInfo.fechas.forEach(f => { if (f > hoyStr && FUTUROS.includes(obtenerEstadoEmpleadoEnFecha(e, f).codigo)) k.futuros++; });
    });
    k.almP += obtenerAlmuerzosExtraConsolidados(solicitudes, hoyStr, hoyStr).reduce((a, ae) => a + (parseInt(String(ae.cantidad), 10) || 1), 0);
    return k;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empCache, version, rangoInfo, solicitudes]);

  const qn = q.trim().toLowerCase();
  const filtrados = empCache.filter(e => {
    if (qn && ![e.nombre, e.id, e.area, e.cargo].some(v => String(v || '').toLowerCase().includes(qn))) return false;
    if (area && (e.area || '') !== area) return false;
    const st = obtenerEstadoEmpleadoEnFecha(e, hoyStr);
    if (kpiF === 'presente' && st.codigo !== 'PRESENTE' && st.codigo !== 'TARDANZA') return false;
    if (kpiF === 'sin_marcar' && st.codigo !== 'SIN_MARCAR') return false;
    if (kpiF === 'en_campo' && st.codigo !== 'CAMPO') return false;
    if (kpiF === 'vacaciones' && st.codigo !== 'VACACIONES') return false;
    if (kpiF === 'permisos' && st.codigo !== 'PERMISO' && st.codigo !== 'PERMISO_MEDICO') return false;
    if (kpiF === 'tardanza' && st.codigo !== 'TARDANZA') return false;
    if (kpiF === 'almuerzo_si' && e.almuerzoHoy !== 'SI' && e.almuerzoHoy !== 'PLANTA') return false;
    if (kpiF === 'almuerzo_no' && e.almuerzoHoy !== 'NO' && e.almuerzoHoy !== 'FUERA') return false;
    if (kpiF === 'futuros' && !rangoInfo.fechas.some(f => f > hoyStr && FUTUROS.includes(obtenerEstadoEmpleadoEnFecha(e, f).codigo))) return false;
    if (estadoF !== 'TODOS' && !rangoInfo.fechas.some(f => obtenerEstadoEmpleadoEnFecha(e, f).codigo === estadoF)) return false;
    return true;
  });
  const areas = useMemo(() => [...new Set(empCache.map(e => e.area).filter(Boolean))].sort() as string[], [empCache]);

  const cambiarRango = (r: Rango) => { setRango(r); setCustom(null); };
  const navegar = (delta: number) => {
    setCustom(null);
    if (!rango) setRango('semana');
    if (delta === 0) setRef(getLocalHoyStr());
    else setRef(x => sumarDias(x, delta * (rango === 'semana' ? 7 : rango === '14dias' ? 14 : 30)));
  };
  const [iniInput, setIniInput] = useState('');
  const [finInput, setFinInput] = useState('');
  useEffect(() => { setIniInput(rangoInfo.inicio); setFinInput(rangoInfo.fin); }, [rangoInfo.inicio, rangoInfo.fin]);
  const aplicarCustom = (ini: string, fin: string) => {
    setIniInput(ini); setFinInput(fin);
    if (!ini || !fin) return;
    if (fin < ini) { mostrarToast('La fecha fin no puede ser anterior a la fecha inicio', 'error'); return; }
    setCustom({ ini, fin }); setRango(null);
  };
  const recargar = async () => {
    mostrarLoader(true);
    try { await cargarDatosCompletos({ silencioso: true }); mostrarToast('Datos del Mapa actualizados desde el servidor', 'success'); }
    catch (e) { mostrarToast('Error al recargar datos: ' + errorTexto(e), 'error'); }
    finally { mostrarLoader(false); }
  };
  const exportarCsv = () => {
    if (!empCache.length) { mostrarToast('No hay datos disponibles para exportar', 'error'); return; }
    let csv = 'ID,Nombre,Area,Cargo';
    rangoInfo.fechas.forEach(f => { csv += `,"${f} (${DIAS[diaSemana(f)]})"`; });
    csv += '\n';
    empCache.forEach(emp => {
      const esc = (v: unknown) => String(v || '').replace(/"/g, '""');
      let row = `"${emp.id}","${esc(emp.nombre)}","${esc(emp.area)}","${esc(emp.cargo)}"`;
      rangoInfo.fechas.forEach(f => { const st = obtenerEstadoEmpleadoEnFecha(emp, f); row += `,"${esc(`${st.label} - ${st.sub}`)}"`; });
      csv += row + '\n';
    });
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mapa_Asistencia_${rangoInfo.inicio}_al_${rangoInfo.fin}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    mostrarToast('Archivo de Mapa de Asistencia generado y descargado exitosamente', 'success');
  };

  const tarjeta = (f: string, etiqueta: string, icono: string, card: string, ico: string, valor: number, id: string) => (
    <div className={`kpi-card${kpiF === f ? ' active' : ''}`} data-filter={f} onClick={() => setKpiF(f)} style={s(card + ' cursor:pointer;')}>
      <div className="kpi-header"><div className="kpi-icon" style={s(ico)}><i className={icono}></i></div><span className="kpi-label">{etiqueta}</span></div>
      <div className="kpi-value" id={id}>{valor}</div>
    </div>
  );
  const leyenda = (est: string, color: string, texto: string) => (
    <button className={`legend-chip${estadoF === est ? ' active' : ''}`} data-estado={est} onClick={() => setEstadoF(est)}>
      <span className="legend-dot" style={{ background: color }}></span> {texto}
    </button>
  );

  return (
    <div id="subpanel-asistencia-mapa" className="subpanel" style={{ display: 'block' }}>
      <div className="cards-grid mapa-kpi-grid" style={s('margin-bottom: 12px;')}>
        {tarjeta('todos', 'Todos', 'fas fa-users', '--card-color: var(--blue); --active-bg: #eff6ff; --active-text: #1e40af; --shadow-color: rgba(37, 99, 235, 0.12);', 'background: var(--blu-lt); color: var(--blue);', calc.total, 'mapaKpiTotal')}
        {tarjeta('presente', 'En Planta Hoy', 'fas fa-building', '--card-color: var(--green); --active-bg: #f0fdf4; --active-text: #15803d; --shadow-color: rgba(22, 163, 74, 0.12);', 'background: var(--grn-lt); color: var(--green);', calc.planta, 'mapaKpiPlanta')}
        {tarjeta('sin_marcar', 'Sin Marcar', 'fas fa-bell', '--card-color: #ef4444; --active-bg: #fef2f2; --active-text: #b91c1c; --shadow-color: rgba(239, 68, 68, 0.2);', 'background: #fee2e2; color: #dc2626;', calc.sinMarcar, 'mapaKpiSinMarcar')}
        {tarjeta('en_campo', 'En Campo', 'fas fa-route', '--card-color: #f59e0b; --active-bg: #fffbeb; --active-text: #b45309; --shadow-color: rgba(245, 158, 11, 0.15);', 'background: #fef3c7; color: #d97706;', calc.campo, 'mapaKpiCampo')}
        {tarjeta('vacaciones', 'Vacaciones', 'fas fa-umbrella-beach', '--card-color: #06b6d4; --active-bg: #ecfeff; --active-text: #0e7490; --shadow-color: rgba(6, 182, 212, 0.15);', 'background: #cffafe; color: #0891b2;', calc.vac, 'mapaKpiVacaciones')}
        {tarjeta('permisos', 'Permisos', 'fas fa-file-medical', '--card-color: #a855f7; --active-bg: #faf5ff; --active-text: #7e22ce; --shadow-color: rgba(168, 85, 247, 0.15);', 'background: #f3e8ff; color: #9333ea;', calc.perm, 'mapaKpiPermisos')}
        {tarjeta('tardanza', 'Tardanzas', 'fas fa-exclamation-triangle', '--card-color: var(--amber); --active-bg: #fffbeb; --active-text: #b45309; --shadow-color: rgba(217, 119, 6, 0.12);', 'background: var(--amb-lt); color: var(--amber);', calc.tard, 'mapaKpiTardanzas')}
        {tarjeta('futuros', 'Próx. Eventos', 'fas fa-calendar-check', '--card-color: #6366f1; --active-bg: #e0e7ff; --active-text: #4338ca; --shadow-color: rgba(99, 102, 241, 0.15);', 'background: #e0e7ff; color: #4f46e5;', calc.futuros, 'mapaKpiFuturos')}
        {tarjeta('almuerzo_si', 'Alm. Planta', 'fas fa-utensils', '--card-color: var(--indigo); --active-bg: #eef2ff; --active-text: #4338ca; --shadow-color: rgba(99, 102, 241, 0.12);', 'background: var(--ind-lt); color: var(--indigo);', calc.almP, 'mapaKpiAlmPlanta')}
        {tarjeta('almuerzo_no', 'Alm. Fuera', 'fas fa-home', '--card-color: var(--g500); --active-bg: #f8fafc; --active-text: #334155; --shadow-color: rgba(100, 116, 139, 0.12);', 'background: var(--g100); color: var(--g500);', calc.almF, 'mapaKpiAlmFuera')}
      </div>

      <div className="mapa-controls-card">
        <div style={s('display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;')}>
          <div>
            <h2 style={s('font-size:18px; font-weight:800; color:#0f172a; margin:0; display:flex; align-items:center; gap:8px;')}><i className="fas fa-map-marked-alt" style={s('color:var(--red);')}></i> Mapa de Asistencia y Disponibilidad</h2>
            <p style={s('font-size:12px; color:#64748b; margin:2px 0 0 0;')}>Visualización gráfica e interactiva de asistencias, salidas a campo, vacaciones y permisos futuros.</p>
          </div>
          <div style={s('display:flex; gap:8px; align-items:center; flex-wrap:wrap;')}>
            <button className="btn" onClick={() => abrirModal('futuro', {})} style={s('background:linear-gradient(135deg,#6366f1,#8b5cf6); color:white; border:none; padding:8px 14px; border-radius:10px; font-size:12px; font-weight:700; display:flex; align-items:center; gap:6px; cursor:pointer; box-shadow:0 2px 4px rgba(99,102,241,0.2);')}><i className="fas fa-calendar-plus"></i> + Ausencia / Vacación</button>
            <button className="btn" onClick={() => abrirModal('campo', {})} style={s('background:linear-gradient(135deg,#059669,#10b981); color:white; border:none; padding:8px 14px; border-radius:10px; font-size:12px; font-weight:700; display:flex; align-items:center; gap:6px; cursor:pointer; box-shadow:0 2px 4px rgba(16,185,129,0.2);')}><i className="fas fa-route"></i> + Salida a Campo</button>
            <button className="btn" onClick={exportarCsv} style={s('background:#ffffff; border:1px solid #cbd5e1; color:#334155; padding:8px 14px; border-radius:10px; font-size:12px; font-weight:700; display:flex; align-items:center; gap:6px; cursor:pointer;')} title="Descargar vista actual en Excel"><i className="fas fa-file-excel" style={s('color:#16a34a;')}></i> Excel</button>
            <button className="btn btn-refresh-mapa" onClick={() => void recargar()} style={s('background:#ffffff; border:1px solid #cbd5e1; color:#334155; padding:8px 12px; border-radius:10px; font-size:12px; font-weight:700; display:flex; align-items:center; gap:6px; cursor:pointer;')} title="Recargar datos desde el servidor"><i className="fas fa-sync-alt"></i></button>
          </div>
        </div>

        <div style={s('display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding:10px 14px; background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:14px;')}>
          <div style={s('display:flex; gap:6px; align-items:center; flex-wrap:wrap;')}>
            <span style={s('font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; margin-right:4px;')}><i className="fas fa-clock" style={s('color:var(--blue);')}></i> Rango:</span>
            {([['semana', 'btnRangoSemana', 'Esta Semana'], ['14dias', 'btnRango14Dias', '14 Días'], ['mes', 'btnRangoMes', 'Mes Actual'], ['periodo', 'btnRangoPeriodo', 'Período 26-25']] as const).map(([r, id, t]) => (
              <button key={r} className={`mapa-range-btn${rango === r && !custom ? ' active' : ''}`} id={id} onClick={() => cambiarRango(r)}>{t}</button>
            ))}
          </div>
          <div style={s('display:flex; align-items:center; gap:8px; flex-wrap:wrap;')}>
            <button onClick={() => navegar(-1)} className="mapa-nav-arrow" title="Rango Anterior"><i className="fas fa-chevron-left"></i></button>
            <button onClick={() => navegar(0)} className="mapa-nav-today" title="Ir a Hoy"><i className="fas fa-dot-circle"></i> Hoy</button>
            <button onClick={() => navegar(1)} className="mapa-nav-arrow" title="Rango Siguiente"><i className="fas fa-chevron-right"></i></button>
            <div id="mapaRangoLabel" style={s('font-size:12.5px; font-weight:800; color:#1e293b; background:#ffffff; padding:4px 12px; border-radius:8px; border:1px solid #cbd5e1; box-shadow:0 1px 2px rgba(0,0,0,0.03);')}>{rangoInfo.label}</div>
          </div>
          <div style={s('display:flex; align-items:center; gap:6px;')}>
            <input type="date" id="mapaFechaInicio" value={iniInput} onChange={ev => aplicarCustom(ev.target.value, finInput)} className="mapa-date-input" title="Fecha Inicio" />
            <span style={s('font-size:11px; color:#94a3b8; font-weight:700;')}>a</span>
            <input type="date" id="mapaFechaFin" value={finInput} onChange={ev => aplicarCustom(iniInput, ev.target.value)} className="mapa-date-input" title="Fecha Fin" />
          </div>
        </div>

        <div style={s('display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;')}>
          <div style={s('display:flex; gap:10px; align-items:center; flex-wrap:wrap; flex:1; min-width:280px;')}>
            <div style={s('position:relative; flex:1; max-width:320px;')}>
              <input type="text" id="searchMapaAsistencia" placeholder="Buscar colaborador por nombre, ID o cargo..." value={q} onChange={ev => setQ(ev.target.value)} className="search-input" style={s('padding-left:32px; height:34px; border-radius:10px; font-size:12px; margin:0; width:100%;')} />
              <i className="fas fa-search" style={s('position:absolute; left:11px; top:50%; transform:translateY(-50%); color:#94a3b8; font-size:11px;')}></i>
            </div>
            <div style={s('display:flex; align-items:center; gap:6px; background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:3px 8px; height:34px;')}>
              <i className="fas fa-building" style={s('color:var(--blue); font-size:12px;')}></i>
              <select id="mapaFiltroArea" value={area} onChange={ev => setArea(ev.target.value)} style={s('border:none; outline:none; font-size:12px; font-weight:600; color:#334155; background:transparent; cursor:pointer;')}>
                <option value="">Todas las Áreas</option>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="search-count-badge" id="searchCounterBadgeMapa" title="Colaboradores visibles en el mapa"><i className="fas fa-users"></i> <span id="mapaResultCount">{filtrados.length}</span>/<span id="mapaTotalCount">{empCache.length}</span></div>
          </div>
          <div className="mapa-view-switcher">
            {([['matriz', 'btnVistaMatriz', 'fas fa-table', 'Matriz', 'Vista Matriz / Cronograma'], ['tarjetas', 'btnVistaTarjetas', 'fas fa-id-card', 'Tarjetas', 'Vista Tarjetas de Personal'],
              ['cobertura', 'btnVistaCobertura', 'fas fa-chart-bar', 'Cobertura', 'Vista Cobertura por Área']] as const).map(([v, id, ico, t, title]) => (
              <button key={v} className={`mapa-view-btn${vista === v ? ' active' : ''}`} id={id} onClick={() => setVista(v)} title={title}><i className={ico}></i> {t}</button>
            ))}
          </div>
        </div>

        <div className="mapa-legend-bar">
          <span style={s('font-size:10.5px; font-weight:800; color:#64748b; text-transform:uppercase; display:flex; align-items:center; gap:4px;')}><i className="fas fa-filter"></i> Leyenda:</span>
          {leyenda('TODOS', '#64748b', 'Todos')}
          {leyenda('PRESENTE', '#16a34a', 'Presentes')}
          {leyenda('TARDANZA', '#f59e0b', 'Tardanzas')}
          {leyenda('CAMPO', '#ea580c', 'En Campo')}
          {leyenda('VACACIONES', '#06b6d4', 'Vacaciones')}
          {leyenda('PERMISO_MEDICO', '#8b5cf6', 'P. Médico')}
          {leyenda('PERMISO', '#a855f7', 'Permiso Pers.')}
          {leyenda('FALTA', '#ef4444', 'Faltas')}
          {leyenda('SIN_MARCAR', '#94a3b8', 'Sin Marcar')}
        </div>
      </div>

      {vista === 'matriz' && <div id="mapaMatrizViewWrapper" className="mapa-view-container active"><div className="mapa-matrix-scroll-wrapper"><div id="mapaMatrizContainer"><Matriz empleados={filtrados} fechas={rangoInfo.fechas} /></div></div></div>}
      {vista === 'tarjetas' && <div id="mapaTarjetasViewWrapper" className="mapa-view-container active" style={{ display: 'block' }}><div id="mapaTarjetasContainer" className="mapa-cards-grid"><Tarjetas empleados={filtrados} fechas={rangoInfo.fechas} /></div></div>}
      {vista === 'cobertura' && <div id="mapaCoberturaViewWrapper" className="mapa-view-container active" style={{ display: 'block' }}><div id="mapaCoberturaContainer" className="mapa-coverage-grid"><Cobertura empleados={filtrados} /></div></div>}
    </div>
  );
}

function BotonesFila({ emp }: { emp: Emp }) {
  return (
    <div style={s('display:flex; gap:3px; flex-shrink:0;')}>
      <button type="button" onClick={() => abrirModal('futuro', { id: emp.id })} title={`Registrar vacación/permiso para ${emp.nombre}`} style={s('background:#ede9fe; color:#6d28d9; border:1px solid #ddd6fe; border-radius:5px; width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; font-size:9px;')}><i className="fas fa-calendar-plus"></i></button>
      <button type="button" onClick={() => abrirModal('campo', { id: emp.id })} title={`Registrar salida a campo para ${emp.nombre}`} style={s('background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; border-radius:5px; width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; font-size:9px;')}><i className="fas fa-hammer"></i></button>
    </div>
  );
}

function Matriz({ empleados, fechas }: { empleados: Emp[]; fechas: string[] }) {
  if (!empleados.length) {
    return (
      <div style={s('padding:48px 20px; text-align:center; color:#64748b;')}>
        <i className="fas fa-users-slash" style={s('font-size:32px; color:#cbd5e1; margin-bottom:12px; display:block;')}></i>
        <div style={s('font-size:14.5px; font-weight:750; color:#1e293b;')}>No hay colaboradores que coincidan con los filtros</div>
        <div style={s('font-size:12px; margin-top:4px;')}>Prueba cambiando el rango de fechas, seleccionando "Todos" o limpiando el texto de búsqueda.</div>
      </div>
    );
  }
  const hoyStr = getLocalHoyStr();
  return (
    <table className="mapa-matrix-table">
      <thead>
        <tr>
          <th className="col-emp-sticky">Colaborador ({empleados.length})</th>
          {fechas.map(f => (
            <th key={f} className={f === hoyStr ? 'col-is-today' : ''} style={s('text-align:center; min-width:96px; padding:6px 4px;')}>
              <div style={s('font-size:10px; font-weight:700; text-transform:uppercase; opacity:0.8;')}>{DIAS[diaSemana(f)]}</div>
              <div style={s('font-size:12.5px; font-weight:800; line-height:1.2;')}>{f.slice(8, 10)}/{f.slice(5, 7)}</div>
              {f === hoyStr && <span style={s('display:inline-block; font-size:9px; background:#3b82f6; color:white; padding:1px 5px; border-radius:4px; font-weight:800; margin-top:2px;')}>HOY</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {empleados.map(emp => (
          <tr key={emp.id}>
            <td className="col-emp-sticky">
              <div style={s('display:flex; align-items:center; justify-content:space-between; gap:8px;')}>
                <div style={s('display:flex; align-items:center; gap:8px; min-width:0; cursor:pointer;')} onClick={() => mostrarDetalle(emp.id)} title={`Ver detalle de asistencia de ${emp.nombre}`}>
                  <PhotoCell e={emp} />
                  <div style={s('min-width:0;')}>
                    <div style={s('font-weight:750; font-size:11.5px; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:145px;')}>{emp.nombre}</div>
                    <div style={s('font-size:10px; color:#64748b; display:flex; align-items:center; gap:6px; margin-top:1px;')}>
                      <span>ID: <strong>{emp.id}</strong></span><span>·</span>
                      <span style={s('white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:85px;')} title={emp.area || ''}>{emp.area || '—'}</span>
                    </div>
                  </div>
                </div>
                <BotonesFila emp={emp} />
              </div>
            </td>
            {fechas.map(f => {
              const st = obtenerEstadoEmpleadoEnFecha(emp, f);
              return (
                <td key={f} className={`mapa-matrix-cell${f === hoyStr ? ' col-is-today' : ''}`}>
                  <div className="mapa-status-chip" title={`${emp.nombre} [${f}]: ${st.label} - ${st.detalle || st.sub}`}
                    onClick={() => (f >= hoyStr ? abrirModal('futuro', { id: emp.id, fecha: f }) : mostrarDetalle(emp.id))}
                    style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>
                    <div style={s('display:flex; align-items:center; gap:4px; font-size:10px; font-weight:800;')}><i className={st.icono}></i><span>{st.label}</span></div>
                    <div style={s('font-size:8.5px; font-weight:600; opacity:0.85; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:85px;')}>{st.sub}</div>
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr style={s('border-top:2px solid #cbd5e1; font-weight:750;')}>
          <td className="col-emp-sticky" style={s('font-size:10.5px; color:#475569;')}>
            <div style={s('font-weight:800;')}>TOTALES DIARIOS</div>
            <div style={s('font-size:9px; color:#64748b; font-weight:600;')}>(🟩 Planta · 🟧 Campo · 🟥 Ausentes)</div>
          </td>
          {fechas.map(f => {
            let pres = 0, campo = 0, aus = 0;
            empleados.forEach(e => {
              const c = obtenerEstadoEmpleadoEnFecha(e, f).codigo;
              if (c === 'PRESENTE' || c === 'TARDANZA') pres++;
              else if (c === 'CAMPO') campo++;
              else if (['VACACIONES', 'PERMISO', 'PERMISO_MEDICO', 'FALTA'].includes(c)) aus++;
            });
            return (
              <td key={f} style={s('text-align:center; padding:5px 3px; font-size:9.5px; background:#f8fafc;')}>
                <div style={s('color:#15803d; font-weight:750;')} title="Presentes en planta"><i className="fas fa-building" style={s('font-size:8.5px;')}></i> {pres}</div>
                <div style={s('color:#ea580c; font-weight:750;')} title="En campo"><i className="fas fa-route" style={s('font-size:8.5px;')}></i> {campo}</div>
                <div style={s('color:#dc2626; font-weight:750;')} title="Ausencias / Vacaciones"><i className="fas fa-times-circle" style={s('font-size:8.5px;')}></i> {aus}</div>
              </td>
            );
          })}
        </tr>
      </tfoot>
    </table>
  );
}

function Tarjetas({ empleados, fechas }: { empleados: Emp[]; fechas: string[] }) {
  if (!empleados.length) {
    return <div style={s('padding:48px 20px; text-align:center; color:#64748b; grid-column: 1 / -1;')}><i className="fas fa-id-card" style={s('font-size:32px; color:#cbd5e1; margin-bottom:12px; display:block;')}></i><div style={s('font-size:14.5px; font-weight:750; color:#1e293b;')}>No hay tarjetas para mostrar</div></div>;
  }
  const hoyStr = getLocalHoyStr();
  const ult7 = fechas.slice(-7);
  return (
    <>
      {empleados.map(emp => {
        const st = obtenerEstadoEmpleadoEnFecha(emp, hoyStr);
        return (
          <div key={emp.id} className="mapa-emp-card">
            <div>
              <div style={s('display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:10px;')}>
                <div style={s('display:flex; align-items:center; gap:10px; min-width:0;')}>
                  <PhotoCell e={emp} />
                  <div style={s('min-width:0;')}>
                    <h4 style={s('margin:0; font-size:13px; font-weight:750; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer;')} onClick={() => mostrarDetalle(emp.id)}>{emp.nombre}</h4>
                    <div style={s('font-size:11px; color:#64748b; font-weight:600; margin-top:2px;')}><span>ID: {emp.id}</span> · <span>{emp.area || 'Sin Área'}</span></div>
                  </div>
                </div>
              </div>
              <div style={{ ...s('border-radius:10px; padding:8px 12px; display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;'), background: st.bg, border: `1px solid ${st.border}` }}>
                <div style={s('display:flex; align-items:center; gap:8px;')}>
                  <i className={st.icono} style={{ fontSize: 16, color: st.color }}></i>
                  <div><div style={{ fontSize: 12, fontWeight: 800, color: st.color }}>{st.label}</div><div style={s('font-size:10px; color:#64748b; font-weight:600;')}>{st.sub}</div></div>
                </div>
                {st.alm && <span style={s('font-size:10px; font-weight:700; background:#ffffff; color:#4338ca; padding:2px 7px; border-radius:6px; border:1px solid #c7d2fe;')}><i className="fas fa-utensils"></i> Alm: {st.alm}</span>}
              </div>
              <div style={s('background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:6px 10px; margin-bottom:12px;')}>
                <div style={s('font-size:9.5px; font-weight:700; color:#64748b; margin-bottom:4px; text-transform:uppercase;')}>Historial Reciente (7 días)</div>
                <div style={s('display:flex; justify-content:space-between; align-items:center;')}>
                  {ult7.map(f => {
                    const sf = obtenerEstadoEmpleadoEnFecha(emp, f);
                    const esHoy = f === hoyStr;
                    return (
                      <div key={f} style={s('display:flex; flex-direction:column; align-items:center; gap:2px;')} title={`${f}: ${sf.label} (${sf.sub})`}>
                        <span style={{ fontSize: 9, color: esHoy ? '#2563eb' : '#94a3b8', fontWeight: esHoy ? 800 : 600 }}>{DIAS[diaSemana(f)].slice(0, 1)}</span>
                        <div style={{ width: 14, height: 14, borderRadius: '50%', background: sf.color, border: esHoy ? '2px solid #2563eb' : 'none' }} title={sf.label}></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div style={s('display:flex; gap:6px; border-top:1px solid #f1f5f9; padding-top:10px;')}>
              <button type="button" onClick={() => mostrarDetalle(emp.id)} className="btn" style={s('flex:1; padding:6px; font-size:11px; font-weight:700; background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; border-radius:7px; cursor:pointer;')}><i className="fas fa-user-clock"></i> Detalle</button>
              <button type="button" onClick={() => abrirModal('futuro', { id: emp.id })} className="btn" style={s('flex:1; padding:6px; font-size:11px; font-weight:700; background:#ede9fe; color:#6d28d9; border:1px solid #ddd6fe; border-radius:7px; cursor:pointer;')}><i className="fas fa-calendar-plus"></i> Ausencia</button>
              <button type="button" onClick={() => abrirModal('campo', { id: emp.id })} className="btn" style={s('flex:1; padding:6px; font-size:11px; font-weight:700; background:#dcfce7; color:#15803d; border:1px solid #bbf7d0; border-radius:7px; cursor:pointer;')}><i className="fas fa-hammer"></i> Campo</button>
            </div>
          </div>
        );
      })}
    </>
  );
}

function Cobertura({ empleados }: { empleados: Emp[] }) {
  if (!empleados.length) {
    return <div style={s('padding:48px 20px; text-align:center; color:#64748b; grid-column: 1 / -1;')}><i className="fas fa-chart-bar" style={s('font-size:32px; color:#cbd5e1; margin-bottom:12px; display:block;')}></i><div style={s('font-size:14.5px; font-weight:750; color:#1e293b;')}>No hay información de cobertura disponible</div></div>;
  }
  const hoyStr = getLocalHoyStr();
  const grupos: Record<string, Emp[]> = {};
  empleados.forEach(e => { (grupos[e.area || 'Sin Área Asignada'] ||= []).push(e); });
  return (
    <>
      {Object.keys(grupos).sort().map(areaNom => {
        const staff = grupos[areaNom];
        const tot = staff.length;
        let pres = 0, campo = 0, aus = 0;
        const estados = staff.map(e => obtenerEstadoEmpleadoEnFecha(e, hoyStr));
        estados.forEach(st => { if (st.codigo === 'PRESENTE' || st.codigo === 'TARDANZA') pres++; else if (st.codigo === 'CAMPO') campo++; else aus++; });
        const pct = (n: number) => Math.round((n / tot) * 100) || 0;
        return (
          <div key={areaNom} className="mapa-cov-card">
            <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;')}>
              <h4 style={s('margin:0; font-size:14px; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:6px;')}><i className="fas fa-building" style={s('color:var(--blue);')}></i> {areaNom}</h4>
              <span style={s('font-size:11px; font-weight:700; color:#64748b; background:#f1f5f9; padding:2px 8px; border-radius:10px;')}>{tot} colaboradores</span>
            </div>
            <div style={s('height:10px; width:100%; background:#f1f5f9; border-radius:6px; overflow:hidden; display:flex; margin-bottom:12px;')}>
              <div style={{ width: `${pct(pres)}%`, background: '#16a34a' }} title={`En Planta: ${pres} (${pct(pres)}%)`}></div>
              <div style={{ width: `${pct(campo)}%`, background: '#ea580c' }} title={`En Campo: ${campo} (${pct(campo)}%)`}></div>
              <div style={{ width: `${pct(aus)}%`, background: '#ef4444' }} title={`Ausente/Permiso: ${aus} (${pct(aus)}%)`}></div>
            </div>
            <div style={s('display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; text-align:center; margin-bottom:14px;')}>
              <div style={s('background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:6px;')}><div style={s('font-size:16px; font-weight:800; color:#15803d;')}>{pres}</div><div style={s('font-size:9.5px; font-weight:700; color:#166534;')}>En Planta</div></div>
              <div style={s('background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:6px;')}><div style={s('font-size:16px; font-weight:800; color:#c2410c;')}>{campo}</div><div style={s('font-size:9.5px; font-weight:700; color:#9a3412;')}>En Campo</div></div>
              <div style={s('background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:6px;')}><div style={s('font-size:16px; font-weight:800; color:#dc2626;')}>{aus}</div><div style={s('font-size:9.5px; font-weight:700; color:#991b1b;')}>Ausentes</div></div>
            </div>
            <div style={s('border-top:1px solid #f1f5f9; padding-top:10px;')}>
              <div style={s('font-size:10px; font-weight:750; color:#64748b; text-transform:uppercase; margin-bottom:6px;')}>Personal del Área Hoy</div>
              <div style={s('display:flex; flex-wrap:wrap; gap:5px;')}>
                {staff.map((e, i) => (
                  <div key={e.id} style={{ ...s('display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:16px; font-size:10.5px; font-weight:700; cursor:pointer;'), background: estados[i].bg, border: `1px solid ${estados[i].border}`, color: estados[i].color }}
                    onClick={() => mostrarDetalle(e.id)} title={`${e.nombre}: ${estados[i].label}`}>
                    <i className={estados[i].icono}></i><span>{e.nombre.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
