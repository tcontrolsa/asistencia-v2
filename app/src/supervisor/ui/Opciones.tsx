// Opciones adicionales (#panel-opciones): centro de configuración del Administrador General — carga de personal,
// roles, desvinculaciones con historial, bajas y operaciones de mantenimiento.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react';
import { rpc } from '../../lib/api';
import { s } from '../../lib/estilo';
import { asegurarXLSX, descargarExcel } from '../excel';
import { Emp, getLocalHoyStr } from '../legado/util';
import { abrirModal } from '../nav';
import { cargarDatosCompletos, mostrarLoader, rolSesion, sup, useSup } from '../store';
import { errorTexto, fotoDe, mostrarToast } from './comun';

type Seccion = 'personal' | 'roles' | 'desvincular' | 'sistema';
type Modo = 'sheets' | 'manual' | 'pasted' | 'eliminar' | 'desvincular';

const rolDe = (e: any): 'ADMIN_MASTER' | 'SUPERVISOR_ADMIN' | 'SUPERVISOR' | 'EMPLEADO' =>
  e.rol_app === 'ADMIN' ? 'ADMIN_MASTER' : e.rol_app === 'SUPERVISOR_ADMIN' ? 'SUPERVISOR_ADMIN' : e.rol_app === 'SUPERVISOR' ? 'SUPERVISOR' : 'EMPLEADO';
const porNombre = (a: any, b: any) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });

// normalizarHeaderAKeyJS (la columna PIN del legado se ignora: ya no hay PIN, D-06)
function normalizarHeader(header: string): string {
  const clean = String(header).trim().toUpperCase();
  if (['ID/CÉDULA', 'ID/CEDULA', 'ID / CÉDULA', 'ID', 'CEDULA', 'CÉDULA'].includes(clean)) return 'id';
  if (['C.I.', 'CI', 'CÉDULA (C.I.)', 'CEDULA (C.I.)', 'NUMERO DE CEDULA', 'NÚMERO DE CÉDULA'].includes(clean)) return 'cedula';
  if (clean === 'NOMBRE COMPLETO' || clean === 'NOMBRE') return 'nombre';
  if (clean === 'ÁREA' || clean === 'AREA') return 'area';
  if (clean === 'CARGO') return 'cargo';
  if (clean === 'PIN') return 'pin';
  if (clean.startsWith('SUPERVISOR')) return 'supervisor';
  if (clean.startsWith('ACTIVO')) return 'activo';
  if (['TELÉFONO', 'TELEFONO', 'WHATSAPP', 'CELULAR', 'WHATSAPP / TELÉFONO'].includes(clean)) return 'telefono';
  if (['LATITUD BASE', 'LATITUD', 'BASELAT', 'LATITUD_BASE'].includes(clean)) return 'baseLat';
  if (['LONGITUD BASE', 'LONGITUD', 'BASELNG', 'LONGITUD_BASE'].includes(clean)) return 'baseLng';
  if (['FECHA NACIMIENTO', 'FECHA_NACIMIENTO', 'F. NACIMIENTO', 'FECHANACIMIENTO'].includes(clean)) return 'fechaNacimiento';
  return clean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_ ]/g, '').split(/[\s_]+/)
    .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join('');
}

const normSupervisor = (v: unknown) => { const u = String(v || '').trim().toUpperCase(); return u === 'SI' ? 'SI' : u === 'SUPERVISOR ADMIN' ? 'SUPERVISOR ADMIN' : 'NO'; };
const normActivo = (v: unknown) => (String(v || '').trim().toUpperCase() === 'NO' ? 'NO' : 'SI');

// parsearPegadoMasivo
function parsearPegado(texto: string): any[] {
  const lineas = (texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lineas.length) return [];
  const primera = lineas[0].toLowerCase();
  let esEnc = ['cedula', 'id', 'nombre', 'pin', 'cargo', 'area'].some(k => primera.includes(k));
  const sep = lineas[0].includes('\t') ? '\t' : lineas[0].includes(';') ? ';' : lineas[0].includes(',') ? ',' : '\t';
  let keys = ['id', 'nombre', 'area', 'cargo', 'cedula', 'supervisor', 'activo', 'telefono', 'baseLat', 'baseLng', 'fechaNacimiento'];
  if (esEnc) {
    const k = lineas[0].split(sep).map(h => normalizarHeader(h));
    if (k.includes('id') && k.includes('nombre')) keys = k; else esEnc = false;
  }
  const iId = keys.indexOf('id'), iNom = keys.indexOf('nombre');
  const out: any[] = [];
  for (let i = esEnc ? 1 : 0; i < lineas.length; i++) {
    const c = lineas[i].split(sep).map(x => x.trim());
    if (c.length < 2 || !c[iId !== -1 ? iId : 0] || !c[iNom !== -1 ? iNom : 1]) continue;
    out.push(filaAEmpleado(keys, c));
  }
  return out;
}

function filaAEmpleado(keys: string[], celdas: unknown[]) {
  const emp: any = {};
  keys.forEach((k, i) => {
    if (!k || k === 'pin') return;
    let v: any = celdas[i] ?? '';
    if (k === 'supervisor') v = normSupervisor(v);
    else if (k === 'activo') v = normActivo(v);
    else if (k === 'fechaNacimiento' && v instanceof Date) v = v.toISOString().slice(0, 10);
    emp[k] = typeof v === 'string' ? v.trim() : v;
  });
  return emp;
}

export function PanelOpciones() {
  useSup(x => x.version);
  const empCache = useSup(x => x.empCache);
  const empEliminados = useSup(x => x.empEliminados);
  const [seccion, setSeccion] = useState<Seccion>('personal');
  const [modo, setModo] = useState<Modo>('sheets');
  const [previaActual, setPrevia] = useState<any[]>([]);
  const previa = previaActual;
  const [datos, setDatos] = useState<{ desvinculados: any[]; actualizacionForzada: any } | null>(null);
  const esAdmin = rolSesion() === 'ADMIN_MASTER';

  const cargarDatos = async () => {
    try { setDatos(await rpc<any>('sup_opciones_datos', {})); } catch (e) { mostrarToast(errorTexto(e), 'error'); }
  };
  useEffect(() => { if (esAdmin) void cargarDatos(); }, [esAdmin]);

  const conRoles = empCache.filter(e => rolDe(e) !== 'EMPLEADO').length;
  const irSeccion = (sec: Seccion) => {
    setSeccion(sec);
    if (sec === 'desvincular') setModo('desvincular');
    else if (sec === 'personal' && modo === 'desvincular') setModo('sheets');
  };
  const cambiarModo = (m: Modo) => { setModo(m); setSeccion(m === 'desvincular' ? 'desvincular' : 'personal'); };

  const guardarMasivo = async (listaDirecta?: any[]) => {
    const previa = listaDirecta ?? previaActual;
    if (!previa.length) { mostrarToast('No hay datos válidos para guardar.', 'warning'); return; }
    if (!window.confirm(`¿Estás seguro de guardar/actualizar MASIVAMENTE ${previa.length} empleados?\n\nEsta acción modificará la base de datos de personal.`)) return;
    mostrarLoader(true);
    try {
      const r = await rpc<any>('sup_carga_masiva_empleados', { p_empleados: previa });
      const om = (r.omitidos || []).length;
      mostrarToast(`¡Personal actualizado con éxito! ${r.procesados} registros guardados.` + (om ? ` ${om} omitidos (ID, nombre, área o cargo inválidos).` : ''), om ? 'warning' : 'success');
      setPrevia([]);
      await cargarDatosCompletos({ silencioso: true });
    } catch (e) { mostrarToast(errorTexto(e) || 'Error al guardar los datos de empleados.', 'error'); }
    finally { mostrarLoader(false); }
  };

  if (!esAdmin) {
    return <div className="opc-section-card"><p style={s('color:#b91c1c; font-weight:700;')}><i className="fas fa-lock"></i> Herramientas exclusivas del Administrador General.</p></div>;
  }

  const tabGestion = (m: Modo, icono: string, colorIcono: string, texto: string, colorTexto?: string) => {
    const act = modo === m;
    return (
      <button onClick={() => cambiarModo(m)} id={`btnModo${m[0].toUpperCase()}${m.slice(1)}`} className={`tab-gestion${act ? ' active' : ''}`}
        style={s(`border:none; padding:7px 12px; font-size:11.5px; font-weight:700; border-radius:8px; cursor:pointer; background:${act ? 'white' : 'transparent'}; color:${act ? colorTexto || 'var(--g800)' : colorTexto || 'var(--g500)'}; box-shadow:${act ? 'var(--sh)' : 'none'}; transition:all 0.2s;`)}>
        <i className={icono} style={s(`color:${colorIcono}; margin-right:4px;`)}></i> {texto}
      </button>
    );
  };
  const secBtn = (sec: Seccion, icono: string, texto: string) => (
    <button onClick={() => irSeccion(sec)} id={`btnSec${sec[0].toUpperCase()}${sec.slice(1)}`} className={`btn-sec-opc${seccion === sec ? ' active' : ''}`}><i className={icono}></i> {texto}</button>
  );

  return (
    <>
      <div className="opciones-header-card">
        <div>
          <h2 style={s('font-size: 18px; font-weight:800; color:var(--g800); margin:0 0 4px 0; display:flex; align-items:center; gap:8px;')}><i className="fas fa-sliders-h" style={s('color:var(--red);')}></i> Centro de Configuración & Opciones Avanzadas</h2>
          <p style={s('font-size: 12px; color:var(--g500); margin:0;')}>Herramientas exclusivas del Administrador Master para gestionar personal, privilegios y base de datos.</p>
        </div>
        <div className="opciones-kpi-group">
          <div className="opciones-kpi-badge"><i className="fas fa-users" style={s('color:var(--blue); font-size:14px;')}></i><div><div className="kpi-num" id="kpiOpcTotalEmp">{empCache.length}</div><div className="kpi-lbl">Colaboradores</div></div></div>
          <div className="opciones-kpi-badge"><i className="fas fa-user-shield" style={s('color:#7c3aed; font-size:14px;')}></i><div><div className="kpi-num" id="kpiOpcTotalSupervisores">{conRoles}</div><div className="kpi-lbl">Con Privilegios</div></div></div>
        </div>
      </div>

      <div className="opciones-nav-bar">
        {secBtn('personal', 'fas fa-users-cog', '1. Gestión de Personal')}
        {secBtn('roles', 'fas fa-user-shield', '2. Asignación de Roles')}
        {secBtn('desvincular', 'fas fa-user-slash', '3. Desvinculaciones')}
        {secBtn('sistema', 'fas fa-tools', '4. Operaciones & Mantenimiento')}
      </div>

      {(seccion === 'personal' || seccion === 'desvincular') && (
        <div id="secOpcPersonal" className="opc-section-card">
          <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;')}>
            <div>
              <h3 style={s('font-size:16px; font-weight:800; color:var(--g800); margin:0 0 2px 0;')}><i className="fas fa-address-book" style={s('color:var(--blue); margin-right:6px;')}></i> Directorio y Carga de Personal</h3>
              <p style={s('font-size:12px; color:var(--g500); margin:0;')}>Crea nuevos colaboradores, actualiza la base con el archivo ACTUALIZAR o realiza cargas masivas desde Excel.</p>
            </div>
            <div style={s('display:flex; background:#f1f5f9; padding:4px; border-radius:10px; flex-wrap:wrap; gap:4px;')}>
              {tabGestion('sheets', 'fas fa-file-excel', '#0f9d58', '1. Archivo ACTUALIZAR')}
              {tabGestion('manual', 'fas fa-user-plus', 'var(--blue)', '2. Formulario Nuevo')}
              {tabGestion('pasted', 'fas fa-clipboard', 'var(--indigo)', '3. Pegar Excel')}
              {tabGestion('eliminar', 'fas fa-user-minus', '#e11d48', '4. Eliminar Usuarios', '#e11d48')}
              {tabGestion('desvincular', 'fas fa-user-slash', '#7c3aed', '5. Desvincular Personal', '#7c3aed')}
            </div>
          </div>
          {modo === 'sheets' && <ModoArchivo empCache={empCache} onPrevia={setPrevia} />}
          {modo === 'manual' && <ModoFormulario previa={previa} onPrevia={setPrevia} />}
          {modo === 'pasted' && <ModoPegado onPrevia={setPrevia} onGuardar={l => void guardarMasivo(l)} />}
          {modo === 'eliminar' && <ModoEliminar empCache={empCache} empEliminados={empEliminados} onHecho={() => void cargarDatos()} />}
          {modo === 'desvincular' && <ModoDesvincular empCache={empCache} empEliminados={empEliminados} datos={datos} recargar={cargarDatos} />}
        </div>
      )}

      {seccion === 'roles' && <SeccionRoles empCache={empCache} />}
      {seccion === 'sistema' && <SeccionSistema info={datos?.actualizacionForzada} recargar={cargarDatos} />}

      {previa.length > 0 && <VistaPrevia previa={previa} onLimpiar={() => { setPrevia([]); mostrarToast('Área de trabajo y vista previa limpiadas.', 'info'); }} onGuardar={() => void guardarMasivo()} />}
    </>
  );
}

const COLS_ARCHIVO: [string, string][] = [
  ['id', 'ID / Cédula'], ['nombre', 'Nombre completo'], ['area', 'Área'], ['cargo', 'Cargo'], ['cedula', 'C.I.'], ['telefono', 'Teléfono'],
  ['supervisor', 'Supervisor (SI/NO/SUPERVISOR ADMIN)'], ['activo', 'Activo (SI/NO)'], ['baseLat', 'Latitud Base'], ['baseLng', 'Longitud Base'],
  ['fechaNacimiento', 'Fecha Nacimiento'],
];

function ModoArchivo({ empCache, onPrevia }: { empCache: Emp[]; onPrevia: (l: any[]) => void }) {
  const descargar = async () => {
    if (!empCache.length) { mostrarToast('No hay datos de empleados cargados.', 'warning'); return; }
    try {
      const filas = empCache.map(e => [e.id, e.nombre, e.area || '', e.cargo || '', e.cedula || '', e.telefono || '', e.supervisor || 'NO', e.activo || 'SI',
        e.latitud ?? '', e.longitud ?? '', e.fecha_nacimiento || '']);
      await descargarExcel('ACTUALIZAR.xlsx', [{ nombre: 'ACTUALIZAR', filas: [COLS_ARCHIVO.map(c => c[1]), ...filas], anchos: [10, 34, 18, 22, 13, 15, 22, 12, 12, 12, 14] }]);
      mostrarToast('¡Base de datos descargada con éxito al archivo "ACTUALIZAR"!', 'success');
    } catch (e) { mostrarToast('Error al generar el archivo: ' + errorTexto(e), 'error'); }
  };
  const importar = async (file?: File) => {
    if (!file) return;
    try {
      const XLSX = await asegurarXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const hoja = wb.Sheets['ACTUALIZAR'] || wb.Sheets[wb.SheetNames[0]];
      const filas: any[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: '' });
      if (filas.length < 2) { mostrarToast('El archivo "ACTUALIZAR" no contiene registros válidos.', 'warning'); return; }
      const keys = filas[0].map(h => normalizarHeader(String(h)));
      if (!keys.includes('id') || !keys.includes('nombre')) { mostrarToast('El archivo debe tener las columnas ID y Nombre.', 'error'); return; }
      const lista = filas.slice(1).filter(f => String(f[keys.indexOf('id')] || '').trim() && String(f[keys.indexOf('nombre')] || '').trim()).map(f => filaAEmpleado(keys, f));
      onPrevia(lista);
      mostrarToast(`Importado: ${lista.length} registros cargados en vista previa. ¡Verifícalos y presiona "Confirmar y Guardar"!`, 'success');
    } catch (e) { mostrarToast('Error al leer el archivo: ' + errorTexto(e), 'error'); }
  };
  return (
    <div id="contModoSheets">
      <div style={s('background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:16px; margin-bottom:16px;')}>
        <h4 style={s('font-size:13px; font-weight:700; color:#166534; margin:0 0 6px 0; display:flex; align-items:center; gap:6px;')}><i className="fas fa-info-circle"></i> Flujo Sencillo con el archivo "ACTUALIZAR":</h4>
        <ol style={s('font-size:12px; color:#1e3a1e; margin:0; padding-left:18px; line-height:1.6;')}>
          <li>Haz clic en <strong>Descargar archivo "ACTUALIZAR"</strong> para exportar todos tus empleados a Excel.</li>
          <li>Abre el archivo en Excel o Google Sheets y edita los datos (crea nuevos usuarios, modifica nombres, áreas, cargos o roles).</li>
          <li>Regresa aquí y usa <strong>Subir archivo actualizado</strong> para revisar los cambios en la vista previa y aplicarlos.</li>
        </ol>
      </div>
      <div style={s('display:grid; grid-template-columns: 1fr 1fr; gap:12px;')}>
        <button className="btn btn-success" onClick={() => void descargar()} style={s('padding:14px; border-radius:10px; font-size:13px; font-weight:700; background:#0f9d58; border:none; color:white; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; box-shadow:0 2px 5px rgba(15,157,88,0.2);')}><i className="fas fa-cloud-download-alt"></i> Paso 1: Descargar archivo "ACTUALIZAR"</button>
        <label className="btn btn-primary" style={s('padding:14px; border-radius:10px; font-size:13px; font-weight:700; background:var(--blue); border:none; color:white; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; box-shadow:0 2px 5px rgba(37,99,235,0.2); margin:0;')}>
          <i className="fas fa-cloud-upload-alt"></i> Paso 2: Subir archivo actualizado
          <input type="file" accept=".xlsx,.xls,.csv" style={s('display:none;')} onChange={ev => { void importar(ev.target.files?.[0]); ev.target.value = ''; }} />
        </label>
      </div>
    </div>
  );
}

function ModoFormulario({ previa, onPrevia }: { previa: any[]; onPrevia: (l: any[]) => void }) {
  const vacio = { id: '', nombre: '', area: '', cargo: '', telefono: '', cedula: '', supervisor: 'NO', activo: 'SI' };
  const [f, setF] = useState(vacio);
  const set = (k: keyof typeof vacio) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value });
  const agregar = () => {
    if (!f.id.trim() || !f.nombre.trim() || !f.area.trim() || !f.cargo.trim()) { mostrarToast('Por favor, complete todos los campos obligatorios (*).', 'warning'); return; }
    const ced = f.cedula.replace(/\D/g, '');
    if (ced && ced.length !== 10) { mostrarToast('La cédula debe tener 10 dígitos.', 'warning'); return; }
    const emp = { ...f, id: f.id.trim(), nombre: f.nombre.trim(), area: f.area.trim(), cargo: f.cargo.trim(), cedula: ced };
    const i = previa.findIndex(e => e.id === emp.id);
    if (i > -1) { onPrevia(previa.map((e, j) => (j === i ? emp : e))); mostrarToast('Empleado actualizado en la lista de vista previa.', 'info'); }
    else { onPrevia([...previa, emp]); mostrarToast('Empleado agregado a la lista de vista previa.', 'success'); }
    setF(vacio);
  };
  const lbl = s('font-size:11px; font-weight:700;');
  return (
    <div id="contModoManual">
      <div style={s('background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:16px;')}>
        <div style={s('display:grid; grid-template-columns: 1fr 1fr 1fr; gap:12px; margin-bottom:12px;')}>
          <div className="form-group" style={s('margin:0;')}><label className="form-label" style={lbl}>ID *</label><input type="text" id="frmEmpId" className="form-input" value={f.id} onChange={set('id')} placeholder="Ej: 1095" /></div>
          <div className="form-group" style={s('margin:0;')}><label className="form-label" style={lbl}>Nombre Completo *</label><input type="text" id="frmEmpNombre" className="form-input" value={f.nombre} onChange={set('nombre')} placeholder="Ej: Juan Pérez" /></div>
          <div className="form-group" style={s('margin:0;')}><label className="form-label" style={lbl}>Área *</label><input type="text" id="frmEmpArea" className="form-input" value={f.area} onChange={set('area')} placeholder="Ej: PRODUCCION" /></div>
        </div>
        <div style={s('display:grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr; gap:12px; margin-bottom:16px;')}>
          <div className="form-group" style={s('margin:0;')}><label className="form-label" style={lbl}>Cargo *</label><input type="text" id="frmEmpCargo" className="form-input" value={f.cargo} onChange={set('cargo')} placeholder="Ej: Operario" /></div>
          <div className="form-group" style={s('margin:0;')}><label className="form-label" style={lbl}><i className="fab fa-whatsapp" style={s('color:#16a34a;')}></i> WhatsApp / Teléfono</label><input type="text" id="frmEmpTelefono" className="form-input" value={f.telefono} onChange={set('telefono')} placeholder="Ej: 0984660105" /></div>
          <div className="form-group" style={s('margin:0;')}><label className="form-label" style={lbl}>Cédula (crea su contraseña)</label><input type="text" id="frmEmpCedula" className="form-input" value={f.cedula} onChange={set('cedula')} placeholder="Ej: 1712345678" maxLength={10} /></div>
          <div className="form-group" style={s('margin:0;')}><label className="form-label" style={lbl}>Rol / Permisos</label>
            <select id="frmEmpSup" className="form-select" value={f.supervisor} onChange={set('supervisor')}><option value="NO">Empleado regular</option><option value="SI">Supervisor</option><option value="SUPERVISOR ADMIN">Supervisor Admin</option></select></div>
          <div className="form-group" style={s('margin:0;')}><label className="form-label" style={lbl}>Estado Activo</label>
            <select id="frmEmpActivo" className="form-select" value={f.activo} onChange={set('activo')}><option value="SI">SI (Activo)</option><option value="NO">NO (Inactivo)</option></select></div>
        </div>
        <button className="btn btn-primary" onClick={agregar} style={s('width:100%; padding:12px; border-radius:10px; font-size:13px; font-weight:700; background:var(--blue); border:none; color:white; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer;')}><i className="fas fa-plus-circle"></i> Validar y Agregar Colaborador</button>
      </div>
    </div>
  );
}

function ModoPegado({ onPrevia, onGuardar }: { onPrevia: (l: any[]) => void; onGuardar: (l: any[]) => void }) {
  const [txt, setTxt] = useState('');
  const previsualizar = () => {
    if (!txt.trim()) { mostrarToast('Por favor, pega algunos datos antes de previsualizar.', 'warning'); return; }
    const l = parsearPegado(txt);
    if (!l.length) { mostrarToast('No se pudieron parsear los datos. Verifique el formato.', 'error'); return; }
    onPrevia(l);
    mostrarToast(`Vista previa cargada con ${l.length} registros.`, 'success');
  };
  return (
    <div id="contModoPasted">
      <div className="form-group" style={s('margin-bottom:12px;')}>
        <label className="form-label" style={s('font-weight:700; font-size:12px; margin-bottom:4px;')}>Copia y pega las columnas directamente desde Excel o Google Sheets:</label>
        <div style={s('font-size:11px; color:var(--g500); margin-bottom:8px; background:#f8fafc; padding:6px 10px; border-radius:6px; border:1px solid #e2e8f0;')}>
          <strong>Formato sugerido:</strong> ID | Nombre | Área | Cargo | Cédula | Supervisor (SI/NO/SUPERVISOR ADMIN) | Activo (SI/NO)
        </div>
        <textarea id="txtMasivoEmpleados" className="form-input" value={txt} onChange={ev => setTxt(ev.target.value)} style={s("width:100%; font-family:'Fira Code', monospace; font-size:11.5px; min-height:140px; resize:vertical; padding:10px;")} placeholder={'Ejemplo:\n1095\tJuan Pérez\tPRODUCCION\tOperario\t1712345678\tNO\tSI'}></textarea>
      </div>
      <div style={s('display:flex; gap:10px; justify-content:flex-end;')}>
        <button className="btn" onClick={previsualizar} style={s('padding:10px 18px; border-radius:8px; font-size:12px; font-weight:700; border:1px solid var(--g300); background:#ffffff; color:var(--g700); display:flex; align-items:center; gap:6px; cursor:pointer;')}><i className="fas fa-eye"></i> Previsualizar Datos</button>
        <button className="btn btn-primary" onClick={() => { const l = parsearPegado(txt); if (l.length) onPrevia(l); onGuardar(l); }} style={s('padding:10px 22px; border-radius:8px; font-size:12px; font-weight:700; background:var(--blue); border:none; color:white; display:flex; align-items:center; gap:6px; cursor:pointer; box-shadow:0 2px 5px rgba(59,130,246,0.2);')}><i className="fas fa-cloud-upload-alt"></i> Guardar Todo</button>
      </div>
    </div>
  );
}

function VistaPrevia({ previa, onLimpiar, onGuardar }: { previa: any[]; onLimpiar: () => void; onGuardar: () => void }) {
  const base = ['id', 'nombre', 'area', 'cargo', 'cedula', 'telefono', 'supervisor', 'activo', 'baseLat', 'baseLng', 'fechaNacimiento'];
  const etiquetas: Record<string, string> = { id: 'ID / Cédula', nombre: 'Nombre completo', area: 'Área', cargo: 'Cargo', cedula: 'C.I.', telefono: 'Teléfono', supervisor: 'Supervisor', activo: 'Activo', baseLat: 'Latitud', baseLng: 'Longitud', fechaNacimiento: 'F. Nacimiento' };
  const presentes = new Set(previa.flatMap(e => Object.keys(e)));
  const keys = [...base.filter(k => presentes.has(k)), ...[...presentes].filter(k => !base.includes(k))];
  return (
    <div id="vistaPreviaEmpleadosContainer" className="metric-card" style={s('padding:20px; background:white; border-radius:16px; border:1px solid var(--g200); margin-bottom:24px;')}>
      <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;')}>
        <h3 style={s('font-size: 15px; font-weight:700; color:var(--g800); margin:0;')}><i className="fas fa-clipboard-list" style={s('color:var(--g500); margin-right:6px;')}></i> Vista previa de carga (<span id="countVistaPrevia">{previa.length}</span> registros)</h3>
        <button className="btn-delete-tiny" onClick={onLimpiar} style={s('padding:4px 8px; font-size:11px; border-radius:6px; border:1px solid var(--g200); background:none; cursor:pointer; color:var(--g500); display:flex; align-items:center; gap:4px;')}><i className="fas fa-trash"></i> Limpiar</button>
      </div>
      <div className="table-wrapper" style={s('max-height: 250px; overflow-y: auto; border: 1px solid var(--g100); border-radius:10px;')}>
        <table className="employee-table table-compact">
          <thead><tr>{keys.map(k => <th key={k} style={k === 'supervisor' || k === 'activo' ? s('text-align:center') : undefined}>{etiquetas[k] || k}</th>)}</tr></thead>
          <tbody id="tbodyVistaPreviaEmpleados">
            {previa.map((e, i) => (
              <tr key={i}>{keys.map(k => {
                const v = e[k] ?? '';
                if (k === 'nombre') return <td key={k}><strong>{v}</strong></td>;
                if (k === 'supervisor') return <td key={k} style={s('text-align:center')}>{v === 'NO' || !v ? <span className="pill dim">NO</span> : <span className="pill ok">{v}</span>}</td>;
                if (k === 'activo') return <td key={k} style={s('text-align:center')}>{v === 'NO' ? <span className="pill miss">Inactivo</span> : <span className="pill ok">Activo</span>}</td>;
                return <td key={k} style={k === 'id' ? s("font-family:'Plus Jakarta Sans',sans-serif;font-weight:600;") : undefined}>{String(v)}</td>;
              })}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={s('display:flex; justify-content:flex-end; gap:10px; margin-top:16px; padding-top:12px; border-top:1px dashed var(--g200);')}>
        <button className="btn" onClick={onLimpiar} style={s('padding:8px 16px; border-radius:8px; font-size:12px; font-weight:600; border:1px solid var(--g300); background:#ffffff; color:var(--g600); display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer;')}><i className="fas fa-times"></i> Cancelar carga</button>
        <button className="btn btn-primary" onClick={onGuardar} style={s('padding:8px 20px; border-radius:8px; font-size:12px; font-weight:600; background:var(--blue); border:none; color:white; display:flex; align-items:center; justify-content:center; gap:6px; cursor:pointer; box-shadow:0 2px 4px rgba(37,99,235,0.15);')}><i className="fas fa-cloud-upload-alt"></i> Confirmar y Guardar</button>
      </div>
    </div>
  );
}

function ModoEliminar({ empCache, empEliminados, onHecho }: { empCache: Emp[]; empEliminados: Emp[]; onHecho: () => void }) {
  const [individual, setIndividual] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [resultado, setResultado] = useState<any>(null);
  const activos = [...empCache].sort(porNombre);
  const inactivos = [...empEliminados].sort(porNombre);
  const lista: any[] = [...inactivos.map(e => ({ ...e, esInactivo: true })), ...activos.map(e => ({ ...e, esInactivo: false }))]
    .filter(e => rolDe(e) !== 'ADMIN_MASTER');
  const visibles = lista.filter(e => `${e.nombre} ${e.id} ${e.area || ''}`.toLowerCase().includes(q.toLowerCase().trim()));

  const eliminar = async (ids: string[], masivo: boolean) => {
    if (!ids.length) { mostrarToast(masivo ? 'Por favor, selecciona al menos un colaborador para eliminar' : 'Por favor, selecciona un colaborador para eliminar', 'warning'); return; }
    const emp = lista.find(e => e.id === ids[0]);
    const msg = masivo ? `⚠️ ALERTA DE ELIMINACIÓN MASIVA:\n\n¿Estás seguro de eliminar a ${ids.length} colaborador(es)?\n\nPerderán el acceso al sistema; su histórico de asistencia se conserva.`
      : `⚠️ ALERTA DE ELIMINACIÓN:\n\n¿Estás seguro de eliminar a "${emp?.nombre || ids[0]}" (ID: ${ids[0]})?\n\nPerderá el acceso al sistema; su histórico de asistencia se conserva.`;
    if (!window.confirm(msg)) return;
    mostrarLoader(true);
    try {
      const r = await rpc<any>('sup_eliminar_colaboradores', { p_ids: ids });
      setResultado(r); setSel(new Set()); setIndividual('');
      await cargarDatosCompletos({ silencioso: true });
      onHecho();
    } catch (e) { mostrarToast(errorTexto(e) || 'Error al procesar la eliminación', 'error'); }
    finally { mostrarLoader(false); }
  };

  return (
    <div id="contModoEliminar">
      <div style={s('background:#fff1f2; border:1px solid #fecdd3; border-radius:10px; padding:12px 14px; margin-bottom:14px; font-size:12px; color:#9f1239; display:flex; align-items:center; gap:8px;')}>
        <i className="fas fa-exclamation-triangle" style={s('color:#e11d48; font-size:16px;')}></i>
        <span><strong>Atención:</strong> La eliminación retira al colaborador del sistema y le quita el acceso. Su histórico de asistencia se conserva para auditoría (LOPDP).</span>
      </div>
      <div style={s('display:grid; grid-template-columns: 1fr 1.3fr; gap:16px;')}>
        <div style={s('background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px;')}>
          <label style={s('font-size:12px; font-weight:700; color:#334155; display:block; margin-bottom:6px;')}><i className="fas fa-user-times" style={s('color:#e11d48;')}></i> Eliminar Colaborador Individual:</label>
          <div style={s('display:flex; flex-direction:column; gap:10px;')}>
            <select id="selEliminarIndividual" className="form-select" value={individual} onChange={ev => setIndividual(ev.target.value)} style={s('width:100%; padding:8px 10px; font-size:12px; height:36px;')}>
              <option value="">-- Seleccionar colaborador a eliminar --</option>
              {inactivos.length > 0 && <optgroup label={`⚠️ Inactivos / Borrados en Base (${inactivos.length})`}>{inactivos.map(e => <option key={e.id} value={e.id}>⚠️ [INACTIVO] {e.nombre} (ID: {e.id} - Área: {e.area || '—'})</option>)}</optgroup>}
              {activos.length > 0 && <optgroup label={`Colaboradores Activos (${activos.length})`}>{activos.filter(e => rolDe(e) !== 'ADMIN_MASTER').map(e => <option key={e.id} value={e.id}>{e.nombre} (ID: {e.id} - Área: {e.area || '—'})</option>)}</optgroup>}
            </select>
            <button onClick={() => void eliminar(individual ? [individual] : [], false)} className="btn" style={s('background:#e11d48; color:white; border:none; padding:10px; font-size:12px; font-weight:700; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;')}><i className="fas fa-trash-alt"></i> Confirmar Eliminación Individual</button>
          </div>
        </div>
        <div style={s('background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px;')}>
          <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;')}>
            <label style={s('font-size:12px; font-weight:700; color:#334155;')}><i className="fas fa-users-slash" style={s('color:#e11d48;')}></i> Eliminación Múltiple:</label>
            <label style={s('font-size:11px; font-weight:600; color:#475569; cursor:pointer;')}>
              <input type="checkbox" id="chkTodosEliminar" checked={visibles.length > 0 && visibles.every(e => sel.has(e.id))}
                onChange={ev => setSel(prev => { const n = new Set(prev); visibles.forEach(e => (ev.target.checked ? n.add(e.id) : n.delete(e.id))); return n; })} /> Todos
            </label>
          </div>
          <input type="text" id="srchEliminarEmp" value={q} onChange={ev => setQ(ev.target.value)} className="search-input" placeholder="🔍 Filtrar por nombre o cédula..." style={s('width:100%; font-size:11.5px; padding:6px 10px; border-radius:6px; border:1px solid #cbd5e1; margin-bottom:8px;')} />
          <div id="listaEliminarCheckboxesContainer" style={s('max-height:140px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:8px; background:#ffffff; padding:6px;')}>
            {!lista.length ? <div style={s('padding:10px; font-size:11px; color:#94a3b8; text-align:center;')}>No hay colaboradores registrados</div> : visibles.map(e => (
              <label key={e.id} className="item-eliminar-emp" style={s('display:flex; align-items:center; justify-content:space-between; padding:6px 8px; border-bottom:1px solid #f1f5f9; cursor:pointer; font-size:11.5px; transition:background 0.15s;')}>
                <div style={s('display:flex; align-items:center; gap:8px;')}>
                  <input type="checkbox" className="chk-eliminar-item" checked={sel.has(e.id)} onChange={ev => setSel(prev => { const n = new Set(prev); if (ev.target.checked) n.add(e.id); else n.delete(e.id); return n; })} style={s('cursor:pointer;')} />
                  <strong style={s('color:#1e293b;')}>{e.esInactivo && <span style={s('color:#e11d48; margin-right:4px;')}>⚠️</span>}{e.nombre}</strong>
                </div>
                <div style={s('display:flex; align-items:center; gap:6px;')}>
                  <span style={s('background:#f1f5f9; color:#64748b; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:600;')}>ID: {e.id}</span>
                  <span style={s(`background:${e.esInactivo ? '#fee2e2' : '#e0f2fe'}; color:${e.esInactivo ? '#b91c1c' : '#0369a1'}; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:600;`)}>{e.esInactivo ? 'Inactivo en Base' : e.area || '—'}</span>
                </div>
              </label>
            ))}
          </div>
          <div style={s('margin-top:10px; display:flex; justify-content:flex-end;')}>
            <button id="btnEliminarEmpMasivo" onClick={() => void eliminar([...sel], true)} className="btn" style={s('background:#be123c; color:white; border:none; padding:8px 16px; font-size:12px; font-weight:700; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;')}>
              <i className="fas fa-trash"></i> Eliminar (<span id="cntEliminarEmpSel">{sel.size}</span>) seleccionados
            </button>
          </div>
        </div>
      </div>
      {resultado && (
        <div id="modalResultadoEliminacion" className="modal-overlay" onClick={ev => { if (ev.target === ev.currentTarget) setResultado(null); }}>
          <div className="modal-container" style={s('max-width:440px; border-top:4px solid #e11d48;')}>
            <div className="modal-header" style={s('background:#fff1f2;')}>
              <h3 className="modal-title" style={s('color:#be123c;')}><i className="fas fa-trash-alt" style={s('color:#e11d48;')}></i> Resultado de Eliminación</h3>
              <button className="modal-close" onClick={() => setResultado(null)}>&times;</button>
            </div>
            <div className="modal-body" style={s('padding:16px;')}>
              <div style={s('display:flex; align-items:center; gap:10px; background:#f0fdf4; border:1px solid #bbf7d0; padding:10px 12px; border-radius:8px; margin-bottom:12px;')}>
                <i className="fas fa-check-circle" style={s('color:#16a34a; font-size:20px;')}></i>
                <div style={s('font-size:12.5px; color:#166534; font-weight:600;')}>{resultado.mensaje}</div>
              </div>
              <div style={s('font-size:11.5px; font-weight:700; color:#334155; margin-bottom:6px;')}>Colaboradores eliminados ({resultado.totalEliminados || 0}):</div>
              <ul style={s('max-height:160px; overflow-y:auto; font-size:11.5px; color:#475569; margin:0 0 12px 0; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px 8px 28px;')}>
                {(resultado.detalles || []).length ? resultado.detalles.map((d: any) => <li key={d.id} style={s('padding:4px 0; border-bottom:1px solid #f1f5f9;')}><strong>{d.nombre || d.id}</strong> (ID: {d.id})</li>) : <li>Operación completada exitosamente.</li>}
              </ul>
            </div>
            <div className="modal-footer"><button className="btn-primary-modal" onClick={() => setResultado(null)} style={s('background:#e11d48;')}>Entendido</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

const MOTIVOS = ['Renuncia voluntaria', 'Fin de contrato', 'Mutuo acuerdo', 'Despido intempestivo', 'Visto bueno', 'Jubilación', 'Otro'];

function ModoDesvincular({ empCache, empEliminados, datos, recargar }: { empCache: Emp[]; empEliminados: Emp[]; datos: any; recargar: () => Promise<void> }) {
  const [empId, setEmpId] = useState('');
  const [fecha, setFecha] = useState(getLocalHoyStr());
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [obs, setObs] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'archivados' | 'inactivos'>('todos');
  const [q, setQ] = useState('');
  const historial: any[] = datos?.desvinculados || [];
  const archivados = new Set(historial.filter(x => x.origen === 'ARCHIVADO').map(x => x.id));
  const candidatos = [...empCache.filter(e => rolDe(e) !== 'ADMIN_MASTER'), ...empEliminados.filter(e => !archivados.has(e.id))].sort(porNombre);
  const e = candidatos.find(x => x.id === empId);
  const inactivo = e ? e.activo === 'NO' || !!e.esEliminado : false;
  const lista = useMemo(() => {
    let l = historial;
    if (filtro === 'archivados') l = l.filter(x => x.origen === 'ARCHIVADO');
    else if (filtro === 'inactivos') l = l.filter(x => x.origen === 'INACTIVO_BASE');
    const t = q.toLowerCase().trim();
    if (t) l = l.filter(x => `${x.nombre} ${x.id} ${x.motivo} ${x.supervisor} ${x.fechaDesvinculacion} ${x.observaciones}`.toLowerCase().includes(t));
    return l;
  }, [historial, filtro, q]);

  const confirmar = async () => {
    if (!empId) { mostrarToast('Por favor, selecciona el colaborador que deseas desvincular.', 'warning'); return; }
    if (!window.confirm(`¿Estás seguro de que deseas DESVINCULAR a:\n\n👤 ${e?.nombre || empId} (ID: ${empId})\n📅 Fecha de salida: ${fecha}\n📋 Motivo: ${motivo}\n\nEl colaborador saldrá del sistema activo y su información quedará archivada como respaldo permanente.\n\n⚖️ Base Legal: Conforme al Art. 21 de la LOPDP (Ecuador) y normativa laboral, los datos se mantendrán en archivo confidencial para fines de solvencia patronal durante los plazos de prescripción legal.`)) return;
    mostrarLoader(true);
    try {
      const r = await rpc<any>('sup_desvincular_colaborador', { p_empleado_id: empId, p_fecha: fecha || null, p_motivo: motivo, p_observaciones: obs || null });
      mostrarToast(r.mensaje || `Colaborador ${e?.nombre} desvinculado y archivado correctamente.`, 'success');
      setEmpId(''); setObs('');
      await cargarDatosCompletos({ silencioso: true });
      await recargar();
    } catch (err) { mostrarToast('Error al desvincular colaborador: ' + errorTexto(err), 'error'); }
    finally { mostrarLoader(false); }
  };

  const exportar = async () => {
    if (!lista.length) { mostrarToast(historial.length ? 'No hay colaboradores que coincidan con la búsqueda o filtro' : 'No hay colaboradores desvinculados para exportar', 'warning'); return; }
    mostrarToast('Exportando historial de desvinculados a Excel...', 'info');
    try {
      await descargarExcel(`Historial_Desvinculados_${getLocalHoyStr()}.xlsx`, [{ nombre: 'Desvinculados', anchos: [5, 12, 32, 18, 18, 16, 25, 25, 14, 22, 22, 40], filas: [
        ['#', 'ID', 'Colaborador / Nombre', 'Área', 'Cargo', 'Fecha Desvinculación', 'Estado', 'Motivo de Salida', 'Total Registros', 'Detalle Registros', 'Responsable', 'Observaciones'],
        ...lista.map((x, i) => [i + 1, x.id, x.nombre, x.area || '—', x.cargo || '—', x.fechaDesvinculacion, x.origen === 'ARCHIVADO' ? 'Archivado (desvinculado)' : 'Inactivo en Base',
          x.motivo, x.totalRegs, `${x.totalRegs} registros en base`, x.supervisor, x.observaciones || '']),
      ] }]);
      mostrarToast('Historial de desvinculados exportado a Excel', 'success');
    } catch (err) { mostrarToast('Error al exportar: ' + errorTexto(err), 'error'); }
  };

  const nArch = historial.filter(x => x.origen === 'ARCHIVADO').length, nInact = historial.length - nArch;
  const btnFiltro = (f: typeof filtro, id: string, texto: string) => (
    <button type="button" onClick={() => setFiltro(f)} id={id} style={s(`border:none; background:${filtro === f ? 'white' : 'transparent'}; padding:4px 9px; border-radius:6px; font-weight:${filtro === f ? '700' : '600'}; color:${filtro === f ? '#1e293b' : '#64748b'}; cursor:pointer; box-shadow:${filtro === f ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'};`)}>{texto}</button>
  );
  const lbl = s('font-size:11.5px; font-weight:700; color:#334155; display:block; margin-bottom:4px;');
  const ctrl = s('width:100%; padding:8px 10px; font-size:12px; height:38px; border-radius:8px; border:1px solid #cbd5e1;');
  const foto = e ? fotoDe(e) : null;

  return (
    <div id="contModoDesvincular">
      <div style={s('background:#f5f3ff; border:1px solid #ddd6fe; border-radius:12px; padding:14px 18px; margin-bottom:16px; display:flex; align-items:flex-start; gap:12px;')}>
        <div style={s('width:36px; height:36px; border-radius:10px; background:#7c3aed; color:white; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;')}><i className="fas fa-archive"></i></div>
        <div style={s('font-size:12px; color:#5b21b6; line-height:1.5;')}>
          <strong>Módulo de Desvinculación y Respaldo Permanente:</strong> Al desvincular un colaborador, el sistema lo retira de las bases activas y conserva como respaldo permanente:
          <ul style={s('margin:4px 0 0; padding-left:18px;')}>
            <li><strong>Ficha:</strong> datos maestros, cargo, área y accesos (copia al momento de la salida).</li>
            <li><strong>Registros:</strong> historial íntegro de marcaciones, asistencias y horas extras.</li>
            <li><strong>Vacaciones:</strong> solicitudes, justificaciones y saldo de días.</li>
          </ul>
          El colaborador deja de contar en los cálculos y KPIs activos de la empresa; su información puede consultarse en los reportes con el filtro <strong>"Desvinculados"</strong>.
        </div>
      </div>
      <div style={s('background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:12px 16px; margin-bottom:16px; display:flex; align-items:flex-start; gap:12px;')}>
        <div style={s('width:32px; height:32px; border-radius:8px; background:#2563eb; color:white; display:flex; align-items:center; justify-content:center; font-size:15px; flex-shrink:0;')}><i className="fas fa-balance-scale"></i></div>
        <div style={s('font-size:11.5px; color:#1e40af; line-height:1.5;')}>
          <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:3px; flex-wrap:wrap; gap:6px;')}>
            <strong style={s('font-size:12px; color:#1e3a8a;')}><i className="fas fa-shield-alt"></i> Descargo de Ley — Archivo y Custodia de Datos Personales (LOPDP Ecuador)</strong>
            <button type="button" onClick={() => abrirModal('avisoPrivacidad')} style={s('background:transparent; border:none; color:#2563eb; font-weight:700; font-size:11px; cursor:pointer; text-decoration:underline; padding:0;')}>Ver Política Completa</button>
          </div>
          En observancia a los <strong>Arts. 7, 21 y 25 de la Ley Orgánica de Protección de Datos Personales (Registro Oficial Sup. 459)</strong>, el Código del Trabajo y la Ley de Seguridad Social de la República del Ecuador, el archivo histórico de los registros personales, biométricos y de jornada laboral del colaborador desvinculado se conservará bajo custodia técnica restringida y confidencialidad. Esta información se preserva exclusivamente para fines de acreditación patronal, auditorías de los organismos de control (IESS, Ministerio del Trabajo, SRI) y eventual defensa jurídica laboral durante los términos de prescripción legal. Queda estrictamente prohibida su cesión comercial o difusión no autorizada.
        </div>
      </div>

      <div style={s('display:grid; grid-template-columns: 1.1fr 1fr; gap:16px; margin-bottom:16px;')}>
        <div style={s('background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.02);')}>
          <h4 style={s('margin:0 0 12px; font-size:13px; font-weight:800; color:#1e293b; display:flex; align-items:center; gap:6px;')}><i className="fas fa-user-times" style={s('color:#7c3aed;')}></i> Datos de la Desvinculación</h4>
          <div style={s('display:flex; flex-direction:column; gap:12px;')}>
            <div>
              <label style={lbl}>Seleccionar Colaborador (Activo o Inactivo) *</label>
              <select id="selDesvincularColaborador" value={empId} onChange={ev => setEmpId(ev.target.value)} className="form-select" style={ctrl}>
                <option value="">-- Selecciona un colaborador --</option>
                {candidatos.map(c => <option key={c.id} value={c.id}>{c.activo === 'NO' || c.esEliminado ? '⚠️ [INACTIVO/BORRADO] ' : ''}{c.nombre} (ID: {c.id})</option>)}
              </select>
            </div>
            <div style={s('display:grid; grid-template-columns: 1fr 1fr; gap:10px;')}>
              <div><label style={lbl}>Fecha de Salida *</label><input type="date" id="txtFechaDesvinculacion" value={fecha} onChange={ev => setFecha(ev.target.value)} className="form-input" style={ctrl} /></div>
              <div><label style={lbl}>Motivo de Salida *</label>
                <select id="selMotivoDesvinculacion" value={motivo} onChange={ev => setMotivo(ev.target.value)} className="form-select" style={ctrl}>{MOTIVOS.map(m => <option key={m} value={m}>{m === 'Otro' ? 'Otro motivo' : m}</option>)}</select></div>
            </div>
            <div><label style={lbl}>Observaciones / Comentarios</label>
              <textarea id="txtObservacionesDesvinculacion" rows={2} value={obs} onChange={ev => setObs(ev.target.value)} className="form-input" placeholder="Detalles de liquidación, entrega de equipos, notas de RRHH..." style={s('width:100%; padding:8px 10px; font-size:11.5px; border-radius:8px; border:1px solid #cbd5e1; resize:vertical;')}></textarea></div>
            <button type="button" onClick={() => void confirmar()} id="btnConfirmarDesvinculacion" className="btn" style={s('background:#7c3aed; color:white; border:none; padding:12px 18px; font-size:12.5px; font-weight:800; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 3px 6px rgba(124,58,237,0.25); transition:all 0.15s ease;')}><i className="fas fa-archive"></i> Desvincular y Archivar</button>
          </div>
        </div>
        <div style={s('background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; display:flex; flex-direction:column; justify-content:space-between;')}>
          <div>
            <h4 style={s('margin:0 0 10px; font-size:13px; font-weight:800; color:#1e293b; display:flex; align-items:center; gap:6px;')}><i className="fas fa-info-circle" style={s('color:#0284c7;')}></i> Resumen del Colaborador Seleccionado</h4>
            <div id="resumenDesvinculacionBox" style={s('background:white; border:1px solid #e2e8f0; border-radius:10px; padding:12px; font-size:12px; color:#475569;')}>
              {!e ? (
                <div style={s('text-align:center; padding:15px; color:#94a3b8;')}><i className="fas fa-user" style={s('font-size:24px; margin-bottom:6px; display:block;')}></i>Selecciona un colaborador para previsualizar sus datos.</div>
              ) : <>
                <div style={s('display:flex; align-items:center; gap:12px; margin-bottom:10px;')}>
                  {foto ? <img src={foto} alt="" style={s(`width:48px; height:48px; border-radius:50%; object-fit:cover; border:2px solid ${inactivo ? '#e11d48' : '#7c3aed'};`)} />
                    : <div style={s(`width:48px; height:48px; border-radius:50%; background:${inactivo ? '#fee2e2' : '#ede9fe'}; color:${inactivo ? '#b91c1c' : '#7c3aed'}; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:800;`)}>{(e.nombre || 'U').charAt(0)}</div>}
                  <div>
                    <div style={s('font-size:14px; font-weight:800; color:#1e293b;')}>{e.nombre}</div>
                    <div style={s('font-size:11.5px; color:#64748b; display:flex; gap:6px; flex-wrap:wrap; margin-top:2px;')}>
                      <span style={s('background:#f1f5f9; padding:1px 6px; border-radius:4px; font-weight:600;')}>ID: {e.id}</span>
                      {e.cedula && <span style={s('background:#f1f5f9; padding:1px 6px; border-radius:4px; font-weight:600;')}>C.I.: {e.cedula}</span>}
                      <span style={s('background:#e0f2fe; color:#0369a1; padding:1px 6px; border-radius:4px; font-weight:600;')}>{e.area || 'Sin área'}</span>
                    </div>
                  </div>
                </div>
                <div style={s('display:grid; grid-template-columns: 1fr 1fr; gap:6px; font-size:11px; background:#f8fafc; padding:8px 10px; border-radius:8px; border:1px solid #f1f5f9;')}>
                  <div><strong>Cargo:</strong> {e.cargo || '—'}</div>
                  <div><strong>Rol App:</strong> {e.supervisor || 'EMPLEADO'}</div>
                  <div><strong>Registros cargados:</strong> <span style={s('color:#4338ca; font-weight:700;')}>{(e.registros || []).length} registros</span></div>
                  <div><strong>Estado:</strong> {inactivo
                    ? <span style={s('color:#b91c1c; font-weight:800; background:#fee2e2; padding:1px 6px; border-radius:4px;')}><i className="fas fa-user-slash"></i> Inactivo / Borrado en base</span>
                    : <span style={s('color:#16a34a; font-weight:800; background:#dcfce7; padding:1px 6px; border-radius:4px;')}><i className="fas fa-check-circle"></i> Activo en base</span>}</div>
                </div>
                <div style={s('margin-top:10px; font-size:11px; color:#7c3aed; background:#f5f3ff; border:1px solid #ddd6fe; padding:8px 10px; border-radius:6px; display:flex; align-items:flex-start; gap:8px;')}>
                  <i className="fas fa-archive" style={s('margin-top:2px;')}></i><span>Al confirmar, el sistema archivará la ficha de este colaborador y lo retirará de las bases activas, conservando todo su histórico.</span>
                </div>
              </>}
            </div>
          </div>
          <div style={s('margin-top:12px; padding:10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; font-size:11.5px; color:#1e40af;')}><i className="fas fa-shield-alt"></i> <strong>Garantía de Respaldo:</strong> Ningún registro se borra: la desvinculación solo cambia el estado del colaborador.</div>
        </div>
      </div>

      <div style={s('background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:16px;')}>
        <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;')}>
          <h4 style={s('margin:0; font-size:13px; font-weight:800; color:#1e293b; display:flex; align-items:center; gap:6px;')}><i className="fas fa-history" style={s('color:#64748b;')}></i> Historial de Personal Desvinculado e Inactivos</h4>
          <div style={s('display:flex; gap:8px; align-items:center; flex-wrap:wrap;')}>
            <div id="filtroTipoDesvinculados" style={s('display:inline-flex; background:#f1f5f9; padding:2px; border-radius:8px; border:1px solid #e2e8f0; font-size:11px;')}>
              {btnFiltro('todos', 'btnFiltroDesvTodos', `Todos (${historial.length})`)}
              {btnFiltro('archivados', 'btnFiltroDesvArch', `Archivados (${nArch})`)}
              {btnFiltro('inactivos', 'btnFiltroDesvInact', `Inactivos en Base (${nInact})`)}
            </div>
            <input type="text" id="txtBuscarDesvinculados" value={q} onChange={ev => setQ(ev.target.value)} placeholder="Buscar por nombre o ID..." style={s('padding:5px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:11.5px; outline:none; width:160px;')} />
            <button type="button" onClick={() => void recargar()} className="btn btn-outline" style={s('padding:5px 10px; font-size:11.5px; display:inline-flex; align-items:center; gap:4px; background:#ffffff;')}><i className="fas fa-sync-alt"></i> Actualizar</button>
            <button type="button" onClick={() => void exportar()} className="btn" style={s('padding:5px 12px; font-size:11.5px; display:inline-flex; align-items:center; gap:6px; background:#10b981; color:#ffffff; border:none; border-radius:6px; font-weight:700; cursor:pointer; box-shadow:0 1px 3px rgba(16,185,129,0.25);')} title="Exportar historial de desvinculados e inactivos a archivo Excel (.xlsx)"><i className="fas fa-file-excel"></i> Exportar a Excel</button>
          </div>
        </div>
        <div style={s('overflow: auto; max-height: 280px; border: 1px solid #e2e8f0; border-radius: 8px;')}>
          <table style={s('width: 100%; border-collapse: collapse; min-width: 720px; font-size: 12px; text-align: left;')}>
            <thead style={s('position: sticky; top: 0; z-index: 10; background: #f8fafc; color: #475569; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-transform: uppercase;')}>
              <tr>
                <th style={s('padding: 8px 10px; font-weight: 700; width: 35px; text-align: center;')}>#</th>
                <th style={s('padding: 8px 10px; font-weight: 700;')}>Colaborador</th>
                <th style={s('padding: 8px 10px; font-weight: 700; text-align: center;')}>Fecha / Estado</th>
                <th style={s('padding: 8px 10px; font-weight: 700;')}>Motivo</th>
                <th style={s('padding: 8px 10px; font-weight: 700; text-align: center;')}>Registros</th>
                <th style={s('padding: 8px 10px; font-weight: 700; text-align: center;')}>Acción / Responsable</th>
              </tr>
            </thead>
            <tbody id="tbodyHistorialDesvinculados">
              {!datos ? <tr><td colSpan={6} style={s('padding: 24px; text-align: center; color: #64748b;')}><i className="fas fa-spinner fa-spin" style={s('font-size:16px; margin-right:6px; color:#7c3aed;')}></i>Consultando historial de desvinculados e inactivos...</td></tr>
                : !lista.length ? <tr><td colSpan={6} style={s('padding: 24px; text-align: center; color: var(--g500);')}><i className="fas fa-info-circle" style={s('margin-right:6px; color:#94a3b8;')}></i>No se encontraron colaboradores en esta sección.</td></tr>
                : lista.map((x, i) => {
                  const arch = x.origen === 'ARCHIVADO';
                  return (
                    <tr key={x.id + x.origen} className="fila-desglose" style={s('border-bottom: 1px solid #f1f5f9; transition: background 0.15s;')}>
                      <td style={s('padding: 9px 10px; font-weight: 700; color: #64748b; text-align: center;')}>{i + 1}</td>
                      <td style={s('padding: 9px 10px;')}>
                        <div style={s('display: flex; align-items: center; gap: 9px;')}>
                          <div style={s('width: 32px; height: 32px; border-radius: 50%; background: #ede9fe; color: #7c3aed; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12.5px; flex-shrink: 0; border: 1px solid #ddd6fe;')}>{(x.nombre || 'U').trim().charAt(0).toUpperCase()}</div>
                          <div>
                            <div style={s('font-weight: 800; color: #1e293b; font-size: 12.5px; line-height: 1.2;')}>{x.nombre || '—'}</div>
                            <div style={s('font-size: 10.5px; color: #64748b; margin-top: 2px;')}>ID: <strong style={s('color:#475569;')}>{x.id || '—'}</strong>{(x.cargo || x.area) && <> &bull; <span>{x.cargo || x.area}</span></>}</div>
                          </div>
                        </div>
                      </td>
                      <td style={s('padding: 9px 10px; text-align: center;')}>
                        <div style={s('font-weight: 600; color: #334155; font-size: 11px;')}>{x.fechaDesvinculacion || '—'}</div>
                        <div style={s('margin-top: 2px;')}>{arch
                          ? <span style={s('background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; padding: 2px 7px; border-radius: 6px; font-size: 10.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;')}><i className="fas fa-check-circle"></i> Archivado</span>
                          : <span style={s('background: #fff1f2; color: #e11d48; border: 1px solid #fecdd3; padding: 2px 7px; border-radius: 6px; font-size: 10.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;')}><i className="fas fa-user-slash"></i> Inactivo en Base</span>}</div>
                      </td>
                      <td style={s('padding: 9px 10px;')}>
                        <span style={s('background: #ede9fe; color: #6d28d9; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700;')}>{x.motivo || 'Desvinculación laboral'}</span>
                        {x.observaciones && <div style={s('font-size: 10.5px; color: #64748b; margin-top: 3px;')} title={x.observaciones}><i className="fas fa-comment-dots"></i> {x.observaciones.length > 40 ? x.observaciones.slice(0, 40) + '...' : x.observaciones}</div>}
                      </td>
                      <td style={s('padding: 9px 10px; text-align: center;')}><span style={s('background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700;')} title={`${x.totalRegs} registros en base`}>{x.totalRegs} registros</span></td>
                      <td style={s('padding: 9px 10px; text-align: center;')}>
                        {!arch ? <button type="button" onClick={() => { setEmpId(x.id); document.getElementById('selDesvincularColaborador')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} style={s('background: #7c3aed; color: white; border: none; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 1px 3px rgba(124,58,237,0.2);')} title="Cargar en formulario para archivar la desvinculación"><i className="fas fa-archive"></i> Desvincular</button>
                          : <span style={s('color: #64748b; font-size: 11px;')}>{x.supervisor || 'Admin'}</span>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SeccionRoles({ empCache }: { empCache: Emp[] }) {
  const ordenados = [...empCache].sort(porNombre);
  const [empId, setEmpId] = useState('');
  const [rol, setRol] = useState('NO');
  const emp = empCache.find(e => e.id === empId);
  useEffect(() => {
    if (!emp) return;
    const r = rolDe(emp);
    setRol(r === 'SUPERVISOR_ADMIN' ? 'SUPERVISOR ADMIN' : r === 'SUPERVISOR' ? 'SI' : r === 'ADMIN_MASTER' ? '' : 'NO');
  }, [empId]); // eslint-disable-line react-hooks/exhaustive-deps
  const conPriv = empCache.filter(e => rolDe(e) !== 'EMPLEADO');

  const asignar = async (id: string, nuevo: string) => {
    if (!id) { mostrarToast('Por favor, selecciona un colaborador para asignar rol.', 'warning'); return; }
    const e = empCache.find(x => x.id === id);
    if (e && rolDe(e) === 'ADMIN_MASTER') { mostrarToast('El Administrador General es permanente y su rol no se puede modificar.', 'warning'); return; }
    const texto = nuevo === 'SUPERVISOR ADMIN' ? 'SUPERVISOR ADMIN (Acceso a Reportes, edición y registros manuales)' : nuevo === 'SI' ? 'SUPERVISOR (Turno y Operación)' : 'Empleado regular (sin permisos especiales)';
    if (!window.confirm(`¿Confirmas asignar el rol "${nuevo || 'NO'}" a "${e?.nombre || id}" (ID: ${id})?\n\nNuevo Rol: ${texto}`)) return;
    mostrarLoader(true);
    try {
      await rpc('sup_asignar_rol', { p_empleado_id: id, p_rol: nuevo || 'NO' });
      mostrarToast(`✅ Rol asignado exitosamente a "${e?.nombre || id}"`, 'success');
      await cargarDatosCompletos({ silencioso: true });
    } catch (err) { mostrarToast(errorTexto(err) || 'Error al guardar el rol en el servidor.', 'error'); }
    finally { mostrarLoader(false); }
  };

  const etiquetaRol = (e: Emp) => { const r = rolDe(e); return r === 'ADMIN_MASTER' ? '👑 Admin Master' : r === 'SUPERVISOR_ADMIN' ? '👔 Sup. Admin' : r === 'SUPERVISOR' ? '🛡️ Supervisor' : 'Empleado'; };
  const radio = (valor: string, borde: string, color: string, icono: string, titulo: string, sub: string, colorSub: string) => (
    <label className="role-radio-box" style={s(`cursor:pointer; background:#ffffff; border:1px solid ${borde}; border-radius:10px; padding:10px 8px; display:flex; flex-direction:column; align-items:center; text-align:center; transition:all 0.2s;`)}>
      <input type="radio" name="rbNuevoRol" value={valor} checked={rol === valor} onChange={() => setRol(valor)} style={s('margin-bottom:6px;')} />
      <span style={s(`font-size:11.5px; font-weight:700; color:${color};`)}><i className={icono}></i> {titulo}</span>
      <span style={s(`font-size:9.5px; color:${colorSub}; margin-top:2px;`)}>{sub}</span>
    </label>
  );
  const mini = (bg: string, color: string, borde: string) => s(`padding:2px 5px; font-size:9.5px; background:${bg}; color:${color}; border:1px solid ${borde}; border-radius:4px; cursor:pointer;`);

  return (
    <div id="secOpcRoles" className="opc-section-card">
      <div style={s('margin-bottom:16px;')}>
        <h3 style={s('font-size:16px; font-weight:800; color:var(--g800); margin:0 0 2px 0;')}><i className="fas fa-user-shield" style={s('color:#7c3aed; margin-right:6px;')}></i> Asignación de Roles y Permisos de Seguridad</h3>
        <p style={s('font-size:12px; color:var(--g500); margin:0;')}>Asigna privilegios de administración o supervisión a cualquier colaborador del sistema.</p>
      </div>
      <div style={s('display:grid; grid-template-columns: 1fr 1.2fr; gap:20px; align-items:start;')}>
        <div style={s('background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:18px;')}>
          <div style={s('font-size:13px; font-weight:800; color:#334155; margin-bottom:12px; display:flex; align-items:center; gap:6px;')}><i className="fas fa-key" style={s('color:#7c3aed;')}></i> 1. Asignar Rol a un Colaborador:</div>
          <div style={s('margin-bottom:14px;')}>
            <label style={s('font-size:11.5px; font-weight:700; color:#475569; display:block; margin-bottom:4px;')}>Seleccionar Colaborador:</label>
            <select id="selRolEmpleado" className="form-select" value={empId} onChange={ev => setEmpId(ev.target.value)} style={s('width:100%; padding:8px 12px; font-size:12.5px; height:38px; border-radius:8px;')}>
              <option value="">-- Selecciona un colaborador --</option>
              {ordenados.map(e => <option key={e.id} value={e.id}>{e.nombre || e.id} (ID: {e.id}) - [{etiquetaRol(e)}]</option>)}
            </select>
          </div>
          <div style={s('margin-bottom:16px;')}>
            <label style={s('font-size:11.5px; font-weight:700; color:#475569; display:block; margin-bottom:6px;')}>Selecciona el nivel de acceso:</label>
            <div style={s('display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px;')}>
              {radio('NO', '#cbd5e1', '#475569', 'fas fa-user', 'Empleado', 'Sin permisos esp.', '#94a3b8')}
              {radio('SI', '#bbf7d0', '#16a34a', 'fas fa-user-shield', 'Supervisor', 'Turno y Operación', '#15803d')}
              {radio('SUPERVISOR ADMIN', '#bfdbfe', '#2563eb', 'fas fa-user-tie', 'Sup. Admin', 'Admin Asistencias', '#1d4ed8')}
            </div>
          </div>
          <button onClick={() => void asignar(empId, rol)} className="btn" style={s('background:#7c3aed; color:white; border:none; width:100%; padding:12px; font-size:13px; font-weight:700; border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 3px 6px rgba(124,58,237,0.25);')}><i className="fas fa-save"></i> Guardar y Aplicar Permisos</button>
        </div>
        <div style={s('background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:18px;')}>
          <div style={s('display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;')}>
            <div style={s('font-size:13px; font-weight:800; color:#334155;')}><i className="fas fa-users-cog" style={s('color:#7c3aed; margin-right:4px;')}></i> Usuarios con Privilegios (<span id="cntUsuariosConRoles">{conPriv.length}</span>)</div>
            <button onClick={() => void cargarDatosCompletos({ silencioso: true })} className="btn-delete-tiny" style={s('padding:4px 8px; font-size:11px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; cursor:pointer; color:#64748b; display:flex; align-items:center; gap:4px;')}><i className="fas fa-sync-alt"></i> Actualizar</button>
          </div>
          <div className="table-wrapper" style={s('max-height:260px; overflow-y:auto; border:1px solid #f1f5f9; border-radius:10px;')}>
            <table className="employee-table table-compact" style={s('width:100%; font-size:11.5px;')}>
              <thead><tr><th>ID</th><th>Nombre</th><th>Área</th><th>Rol Asignado</th><th style={s('text-align:center;')}>Acción</th></tr></thead>
              <tbody id="tbodyUsuariosConRoles">
                {!conPriv.length ? <tr><td colSpan={5} style={s('text-align:center; color:#94a3b8; padding:8px;')}>No hay usuarios con privilegios registrados.</td></tr> : conPriv.map(e => {
                  const r = rolDe(e);
                  return (
                    <tr key={e.id} style={s('border-bottom:1px solid #f1f5f9;')}>
                      <td style={s('font-weight:700; color:#334155;')}>#{e.id}</td>
                      <td style={s('font-weight:600; color:#1e293b;')}>{e.nombre || '-'}</td>
                      <td style={s('color:#64748b; font-size:10.5px;')}>{e.area || '-'}</td>
                      <td>{r === 'ADMIN_MASTER' ? <span className="sup-badge-admin"><i className="fas fa-crown"></i> Admin Master</span>
                        : r === 'SUPERVISOR_ADMIN' ? <span className="sup-badge-sup-admin"><i className="fas fa-user-tie"></i> Sup. Admin</span>
                        : <span className="sup-badge-sup"><i className="fas fa-user-shield"></i> Supervisor</span>}</td>
                      <td style={s('text-align:center;')}>
                        {r === 'ADMIN_MASTER' ? <span style={s('font-size:10px; color:#94a3b8; font-weight:600;')}>Permanente</span> : (
                          <div style={s('display:flex; gap:4px; justify-content:center;')}>
                            {r !== 'SUPERVISOR_ADMIN' && <button onClick={() => void asignar(e.id, 'SUPERVISOR ADMIN')} className="btn-delete-tiny" style={mini('#eff6ff', '#2563eb', '#bfdbfe')} title="Hacer Supervisor Admin">Hacer Sup. Admin</button>}
                            {r !== 'SUPERVISOR' && <button onClick={() => void asignar(e.id, 'SI')} className="btn-delete-tiny" style={mini('#f0fdf4', '#16a34a', '#bbf7d0')} title="Cambiar a Supervisor Regular">Hacer Supervisor</button>}
                            <button onClick={() => void asignar(e.id, 'NO')} className="btn-delete-tiny" style={mini('#fef2f2', '#dc2626', '#fecaca')} title="Quitar todos los permisos">Quitar Rol</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SeccionSistema({ info, recargar }: { info: any; recargar: () => Promise<void> }) {
  const [emitiendo, setEmitiendo] = useState(false);
  const forzar = async () => {
    if (!window.confirm('⚠️ ¿ESTÁS SEGURO DE FORZAR LA ACTUALIZACIÓN EN TODOS LOS DISPOSITIVOS?\n\nEsta acción enviará una señal a todos los terminales:\n• Teléfonos de empleados (PWA)\n• Terminales de guardia\n• Terminales de catering y kiosco\n\nAl recibirla, cada dispositivo vaciará su caché local de forma automática y descargará la versión más reciente del sistema.')) return;
    setEmitiendo(true);
    try {
      await rpc('sup_forzar_actualizacion', {});
      window.alert('✅ ¡Señal de actualización forzada emitida con éxito!\n\nLos dispositivos conectados purgarán su caché y cargarán la versión más reciente.');
      await recargar();
    } catch (e) { window.alert('❌ No se pudo emitir la señal: ' + errorTexto(e)); }
    finally { setEmitiendo(false); }
  };
  const nombre = sup.get().empCache.find(e => rolDe(e) === 'ADMIN_MASTER')?.nombre;
  return (
    <div id="secOpcSistema" className="opc-section-card">
      <div style={s('margin-bottom:18px;')}>
        <h3 style={s('font-size:16px; font-weight:800; color:var(--g800); margin:0 0 2px 0;')}><i className="fas fa-cogs" style={s('color:var(--red); margin-right:6px;')}></i> Operaciones Especiales & Mantenimiento</h3>
        <p style={s('font-size:12px; color:var(--g500); margin:0;')}>Herramientas avanzadas de depuración de registros y optimización de base de datos.</p>
      </div>
      <div style={s('display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:20px;')}>
        <div className="opc-action-tile" onClick={() => abrirModal('manual', {})} style={s('cursor:pointer;')}>
          <div>
            <h4 style={s('font-size:14.5px; font-weight:800; color:var(--g800); margin:0 0 4px 0;')}><i className="fas fa-plus-circle" style={s('color:var(--blue); margin-right:6px;')}></i> Registro Manual de Asistencia</h4>
            <p style={s('font-size:11.5px; color:var(--g500); margin:0;')}>Crea una marcación personalizada (Entrada, Almuerzo, Salida) para cualquier colaborador y fecha.</p>
          </div>
          <button className="btn btn-primary" id="btnNuevoRegistroManual" onClick={ev => { ev.stopPropagation(); abrirModal('manual', {}); }} style={s('padding:10px 18px; font-size:12px; font-weight:700; border-radius:8px; white-space:nowrap; display:flex; align-items:center; gap:6px;')}><i className="fas fa-plus"></i> Crear Registro</button>
        </div>
        <div className="opc-action-tile">
          <div>
            <h4 style={s('font-size:14.5px; font-weight:800; color:var(--g800); margin:0 0 4px 0;')}><i className="fas fa-archive" style={s('color:var(--teal); margin-right:6px;')}></i> Archivar Datos Históricos</h4>
            <p style={s('font-size:11.5px; color:var(--g500); margin:0;')}>La base de datos conserva todo el histórico de asistencia y pedidos en un solo lugar; ya no es necesario trasladarlo a hojas de cálculo.</p>
          </div>
          <button className="btn" id="btnArchivar" onClick={() => mostrarToast('No requerido: la base de datos mantiene el histórico completo sin perder velocidad.', 'info')} style={s('background:var(--teal); color:white; border:none; padding:10px 18px; font-size:12px; font-weight:700; border-radius:8px; white-space:nowrap; display:flex; align-items:center; gap:6px; cursor:pointer;')}><i className="fas fa-archive"></i> Iniciar Archivado</button>
        </div>
        <div className="opc-action-tile" style={s('grid-column: span 2; border-left: 4px solid #ef4444; background: #fffcfc;')}>
          <div>
            <h4 style={s('font-size:14.5px; font-weight:800; color:var(--g800); margin:0 0 4px 0;')}><i className="fas fa-bolt" style={s('color:#ef4444; margin-right:6px;')}></i> Forzar Descarga de Actualizaciones en Terminales</h4>
            <p style={s('font-size:11.5px; color:var(--g500); margin:0;')}>Emite una orden remota para que todos los dispositivos (móviles de colaboradores, terminales de guardia, catering y kiosco) purguen su caché local y carguen la última versión del sistema automáticamente.</p>
            <div id="infoUltimaActualizacionForzada" style={s('font-size:11px; color:#64748b; margin-top:5px; font-weight:600;')}>
              <i className="fas fa-clock"></i> Última orden emitida: <span id="lblFechaUltimaActRemota" style={s('color:#0f172a; font-weight:700;')}>{info?.fecha ? `${info.fecha} (${info.version})` : 'Ninguna registrada'}</span>
            </div>
          </div>
          <button className="btn" id="btnForzarActualizacionRemota" disabled={emitiendo} onClick={() => void forzar()} style={s('background:#dc2626; color:white; border:none; padding:10px 18px; font-size:12px; font-weight:700; border-radius:8px; white-space:nowrap; display:flex; align-items:center; gap:6px; cursor:pointer; box-shadow: 0 2px 6px rgba(220,38,38,0.25);')}>
            {emitiendo ? <><i className="fas fa-spinner fa-spin"></i> Emitiendo señal remota...</> : <><i className="fas fa-sync-alt"></i> Forzar Actualización Ahora</>}
          </button>
        </div>
      </div>
      <div style={s('background:#fef2f2; border:1px solid #fee2e2; border-radius:12px; padding:14px 18px; display:flex; align-items:center; gap:12px;')}>
        <i className="fas fa-shield-alt" style={s('color:#dc2626; font-size:22px;')}></i>
        <div style={s('font-size:12px; color:#991b1b; line-height:1.4;')}><strong>Zona de Operaciones de Alto Impacto:</strong> Todas las modificaciones realizadas en este panel quedan registradas con la firma del usuario <strong>{nombre ? `${nombre} (Admin Master)` : 'Admin Master'}</strong>.</div>
      </div>
    </div>
  );
}
