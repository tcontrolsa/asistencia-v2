// ETL Fase 1: public.* (tablas del Express) + libro CONTROL_ASISTENCIA_2026.xlsx → core.*
// Idempotente: se puede re-ejecutar (upsert por PK / legacy_id). No importa contraseñas (D-06).
// Uso: node db/etl/etl.js [--db nombre] [--produccion] [--libro ruta.xlsx] [--simular]
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { RAIZ, baseDestino, conectar, log } from '../scripts/lib.js';

const argv = process.argv;
const db = baseDestino();
const iLibro = argv.indexOf('--libro');
const LIBRO = iLibro >= 0 ? argv[iLibro + 1] : path.join(RAIZ, 'CONTROL_ASISTENCIA_2026.xlsx');
const SIMULAR = argv.includes('--simular');
const ANIO_VACACIONES = 2026;
const TZ = 'America/Guayaquil';

// ───────────── Normalización ─────────────
const EPOCA_EXCEL = Date.UTC(1899, 11, 30);
const pad = n => String(n).padStart(2, '0');

function normId(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(typeof v === 'number' ? Math.trunc(v) : v).trim().replace(/\.0+$/, '');
  return /^[0-9A-Za-z_-]+$/.test(s) ? s : null;
}

function enGuayaquil(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}:${p.second}` };
}

// Fecha desde serial de Excel, 'YYYY-MM-DD', 'DD/MM/YYYY' o texto de Date de JS.
function parseFecha(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const d = new Date(EPOCA_EXCEL + Math.floor(v) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  const d = new Date(s);
  return isNaN(d) ? null : enGuayaquil(d).fecha;
}

function parseHora(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const seg = Math.round((v - Math.floor(v)) * 86400) % 86400;
    return `${pad(Math.floor(seg / 3600))}:${pad(Math.floor(seg / 60) % 60)}:${pad(seg % 60)}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return `${pad(m[1])}:${m[2]}:${m[3] || '00'}`;
  const d = new Date(s);
  return isNaN(d) ? null : enGuayaquil(d).hora;
}

function normTelefono(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('593') && d.length >= 12) return d;
  if (d.length === 9 && d.startsWith('9')) return `593${d}`;
  if (d.length === 10 && d.startsWith('0')) return `593${d.slice(1)}`;
  return d;
}

function normCedula(v) {
  const d = String(typeof v === 'number' ? Math.trunc(v) : (v ?? '')).replace(/\D/g, '');
  if (!d) return null;
  return d.length === 9 ? `0${d}` : d;
}

const texto = v => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim());
const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));

// ───────────── Lectura del libro ─────────────
if (!fs.existsSync(LIBRO)) throw new Error(`No se encontró el libro: ${LIBRO}`);
log(`Leyendo ${path.basename(LIBRO)}…`);
const wb = XLSX.readFile(LIBRO, { cellDates: false, cellFormula: false, cellHTML: false });
const hoja = nombre => {
  const ws = wb.Sheets[nombre];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
};
const filas = nombre => hoja(nombre).slice(1).filter(r => r.some(v => v !== null && v !== ''));

// EMPLEADOS: A ID, B NOMBRE, C AREA, D ACTIVO, E URL_FOTO, G PIN, H TOKEN, I acceso, J CI,
// M TELEFONO, N Cargo TCONTROL, R NACIMIENTO, S LATITUD, T LONGITUD
const hojaEmpleados = new Map();
for (const r of filas('EMPLEADOS')) {
  const id = normId(r[0]);
  if (id) hojaEmpleados.set(id, {
    nombre: texto(r[1]), area: texto(r[2]), foto: texto(r[4]), supervisor: /^si$/i.test(texto(r[8]) || ''),
    cedula: normCedula(r[9]), telefono: normTelefono(r[12]), cargo: texto(r[13]),
    nacimiento: parseFecha(r[17]), lat: num(r[18]), lng: num(r[19]),
  });
}

// CALCULAR_vacaciones: A ID, D fecha de ingreso, F saldo del año anterior;
// G adjudicadas, H total, I tomadas, J restantes (valores calculados por la hoja al descargarla)
const hojaVacCalc = new Map();
for (const r of filas('CALCULAR_vacaciones')) {
  const id = normId(r[0]);
  if (id) hojaVacCalc.set(id, { ingreso: parseFecha(r[3]), saldo: num(r[5]),
    adjudicadas: num(r[6]), total: num(r[7]), tomadas: num(r[8]), restantes: num(r[9]) });
}

// Hoja 16: C ID → D URL del rol de pagos (SharePoint)
const hojaRolPagos = new Map();
for (const r of hoja('Hoja 16')) {
  const id = normId(r[2]);
  const url = texto(r[3]);
  if (id && url && /^https?:/i.test(url)) hojaRolPagos.set(id, url);
}

// REGISTROS (api_completa.gs → COLUMNAS, A–Y)
function registroDesdeFila(r, legacyId) {
  const id = normId(r[1]);
  const fecha = parseFecha(r[0]);
  const tipo = texto(r[3])?.toUpperCase();
  if (!id || !fecha || !tipo) return null;
  return {
    legacy_id: legacyId, empleado_id: id, nombre: texto(r[2]), fecha, tipo,
    hora: parseHora(r[5]) || parseHora(r[9]) || '00:00:00',
    almuerzo: texto(r[4]), lat: num(r[6]), lng: num(r[7]), dispositivo: texto(r[8]),
    modo: texto(r[11]), horas_extra: texto(r[12]), autoriza: texto(r[13]),
    razon_salida_temprana: texto(r[14]), quien_justifica: texto(r[15]), razon_entrada_tardia: texto(r[16]),
    quien_justifica_entrada: texto(r[17]), tipo_salida: texto(r[18]), razon_permiso: texto(r[19]),
    justificado: texto(r[20]), razon_justificac: texto(r[21]),
    permiso_personal_mins: num(r[22]) || 0, permiso_medico_mins: num(r[23]) || 0, tiempo_justificado_mins: num(r[24]) || 0,
  };
}
const hojaRegistros = hoja('REGISTROS').slice(1)
  .map((r, i) => registroDesdeFila(r, `sheet:REGISTROS:${i + 2}`)).filter(Boolean);

// VACACIONES: A FECHA, B ID, D TIPO
const hojaVacaciones = hoja('VACACIONES').slice(1).map((r, i) => ({
  legacy_id: `sheet:VACACIONES:${i + 2}`, empleado_id: normId(r[1]), fecha: parseFecha(r[0]),
  tipo: texto(r[3])?.toUpperCase(),
})).filter(v => v.empleado_id && v.fecha);

// DESVINCULADOS: A fecha, B hoja origen, C ID, D nombre, E motivo, F supervisor, G obs, H ts, I.. = fila original
const desv = { empleados: [], registros: [], vacaciones: [] };
hoja('DESVINCULADOS').slice(1).forEach((r, i) => {
  const origen = texto(r[1]);
  const orig = r.slice(8, 34);
  const fila = i + 2;
  if (origen === 'EMPLEADOS') {
    desv.empleados.push({
      legacy_id: `sheet:DESVINCULADOS:${fila}`, empleado_id: normId(r[2]), nombre: texto(r[3]),
      fecha: parseFecha(r[0]), motivo: texto(r[4]), desvinculado_por: texto(r[5]), observaciones: texto(r[6]),
      area: texto(orig[2]), cargo: texto(orig[13]), cedula: normCedula(orig[9]), telefono: normTelefono(orig[12]),
      snapshot: orig,
    });
  } else if (origen === 'REGISTROS') {
    const reg = registroDesdeFila(orig, `sheet:DESVINCULADOS:${fila}`);
    if (reg) desv.registros.push(reg);
  } else if (origen === 'VACACIONES') {
    const id = normId(orig[1]); const fecha = parseFecha(orig[0]);
    if (id && fecha) desv.vacaciones.push({ legacy_id: `sheet:DESVINCULADOS:${fila}`, empleado_id: id, fecha, tipo: 'VACACIONES' });
  }
});

// ALMUERZOS_EXTRA: A FECHA, B DESCRIPCION, C EMPRESA, D TIPO, E CANTIDAD, F HORA, G TIMESTAMP
const hojaInvitados = hoja('ALMUERZOS_EXTRA').slice(1).map((r, i) => ({
  id: `sheet_almuerzos_extra_${i + 2}`, fecha: parseFecha(r[0]), descripcion: texto(r[1]),
  empresa: texto(r[2]), tipo: texto(r[3]), cantidad: Math.max(1, Math.trunc(num(r[4]) || 1)),
  hora: parseHora(r[5]), ts_fecha: parseFecha(r[6]), ts_hora: parseHora(r[6]), raw: r.slice(0, 7),
})).filter(x => x.fecha);

// DISPOSITIVOS: A token, B ID, C registro, D último uso, E activo
const hojaDispositivos = filas('DISPOSITIVOS').map(r => ({
  token: texto(r[0]), empleado_id: normId(r[1]),
  registrado: parseFecha(r[2]) && `${parseFecha(r[2])} ${parseHora(r[2]) || '00:00:00'}`,
  ultimo_uso: parseFecha(r[3]) && `${parseFecha(r[3])} ${parseHora(r[3]) || '00:00:00'}`,
  activo: /^(si|true|1)$/i.test(String(r[4] ?? '').trim()),
})).filter(d => d.token && d.empleado_id);

// HISTORIAL_MENU: FECHA, DIA, SOPA, PLATO_FUERTE, BEBIDA
const hojaMenu = hoja('HISTORIAL_MENU').slice(1).map((r, i) => ({
  legacy_id: `sheet:HISTORIAL_MENU:${i + 2}`, fecha: parseFecha(r[0]), dia: texto(r[1]),
  sopa: texto(r[2]), plato: texto(r[3]), jugo: texto(r[4]),
})).filter(m => m.fecha);

// CULTURA_PREGUNTAS: ID, TIPO, PILAR, ICONO, PREGUNTA, PISTA, OPCIONES_JSON, ACTIVO
const hojaCultura = filas('CULTURA_PREGUNTAS').map((r, i) => {
  let opciones = [];
  try { opciones = JSON.parse(r[6] || '[]'); } catch { /* se deja vacío y se reporta */ }
  return { id: texto(r[0]), tipo: texto(r[1]), pilar: texto(r[2]), icono: texto(r[3]), pregunta: texto(r[4]),
           pista: texto(r[5]), opciones, activo: !/^(no|false|0)$/i.test(String(r[7] ?? '').trim()), orden: i + 1 };
}).filter(p => p.id && p.pregunta);

// LOGS_WHATSAPP: TIMESTAMP, FECHA, HORA, ID, NOMBRE, TELEFONO, TIPO, ESTADO, MENSAJE, DETALLE, SUPERVISOR, ORIGEN
const hojaLogs = hoja('LOGS_WHATSAPP').slice(1).map((r, i) => ({
  legacy_id: `sheet:LOGS_WHATSAPP:${i + 2}`, fecha: parseFecha(r[1]), hora: parseHora(r[2]) || '00:00:00',
  empleado_id: normId(r[3]), nombre: texto(r[4]), telefono: normTelefono(r[5]), tipo: texto(r[6]),
  estado: texto(r[7]), detalle: texto(r[9]), enviado_por: texto(r[10]),
})).filter(l => l.fecha);

log(`Libro: ${hojaEmpleados.size} empleados, ${hojaRegistros.length} registros, ${hojaVacaciones.length} vacaciones, ` +
    `${desv.empleados.length}/${desv.registros.length}/${desv.vacaciones.length} desvinculados (fichas/registros/vacaciones), ` +
    `${hojaInvitados.length} invitados, ${hojaDispositivos.length} dispositivos`);

// ───────────── Carga ─────────────
const c = await conectar(db);
log(`Base destino: ${db}${SIMULAR ? ' (simulación: se revierte al final)' : ''}`);
const J = x => JSON.stringify(x);
const reporte = { base: db, libro: path.basename(LIBRO), fecha: new Date().toISOString(), pasos: {}, avisos: [] };
const paso = (k, v) => { reporte.pasos[k] = v; log(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`); };

await c.query('BEGIN');
try {
  await c.query(`SET LOCAL app.etl = 'on'`);

  // Tabla temporal con todas las marcaciones/novedades de origen, ya normalizadas.
  await c.query(`CREATE TEMP TABLE etl_origen (
    legacy_id text, fuente text, empleado_id text, nombre text, fecha date, hora time, tipo text,
    almuerzo text, lat float8, lng float8, dispositivo text, modo text, horas_extra text, autoriza text,
    tipo_salida text, razon_entrada_tardia text, quien_justifica_entrada text, razon_salida_temprana text,
    razon_permiso text, quien_justifica text, justificado text, razon_justificac text, razon_ausencia text,
    observacion text, permiso_personal_mins int, permiso_medico_mins int, tiempo_justificado_mins int,
    creado timestamptz, raw jsonb) ON COMMIT DROP`);

  // 1) Registros de la base actual (fuente principal)
  await c.query(`
    INSERT INTO etl_origen
    SELECT 'pg:' || r.id, 'BASE', r.empleado_id, r.raw_data ->> 'nombre', r.fecha, r.hora, upper(trim(r.tipo)),
           r.almuerzo, r.latitud, r.longitud, coalesce(nullif(r.raw_data ->> 'dispositivo', ''), nullif(r.device_token, '')),
           r.modo, r.horas_extra, nullif(r.raw_data ->> 'autoriza', ''), nullif(r.raw_data ->> 'tipoSalida', ''),
           coalesce(nullif(r.razon_entrada_tardia, ''), nullif(r.raw_data ->> 'razonEntradaTardia', ''), nullif(r.raw_data ->> 'razon_entrada_tardia', '')),
           nullif(r.raw_data ->> 'quienJustificaEntrada', ''),
           coalesce(nullif(r.razon_salida_temprana, ''), nullif(r.razon_salida, ''), nullif(r.raw_data ->> 'razonSalidaTemprana', '')),
           coalesce(nullif(r.razon_permiso, ''), nullif(r.raw_data ->> 'razonPermiso', '')),
           coalesce(nullif(r.quien_justifica, ''), nullif(r.raw_data ->> 'quienJustifica', '')),
           r.justificado, nullif(r.razon_justificac, ''), nullif(r.razon_ausencia, ''), nullif(r.observacion, ''),
           coalesce(r.permiso_personal_mins, 0), coalesce(r.permiso_medico_mins, 0), coalesce(r.tiempo_justificado_mins, 0),
           r.created_at,
           r.raw_data - 'foto'                     -- las selfies del prototipo no se copian (C-01, P-07)
    FROM public.registros r
    WHERE r.empleado_id ~ '^[0-9A-Za-z_-]+$'`);
  const invalidos = (await c.query(`SELECT count(*)::int n, string_agg(DISTINCT quote_literal(empleado_id), ', ') ids
                                    FROM public.registros WHERE empleado_id !~ '^[0-9A-Za-z_-]+$'`)).rows[0];
  if (invalidos.n) reporte.avisos.push(`${invalidos.n} registros de la base con ID de empleado inválido (${invalidos.ids}) no se importaron (los vacíos son del prototipo v2).`);

  // 2) Filas de la hoja REGISTROS y del respaldo de desvinculados que no estén ya en la base
  //    (clave empleado|fecha|tipo|hh:mm, §5.2 de 03_DATOS_REALES).
  const extra = [...hojaRegistros.map(r => ({ ...r, fuente: 'HOJA_REGISTROS' })),
                 ...desv.registros.map(r => ({ ...r, fuente: 'HOJA_DESVINCULADOS' }))];
  await c.query(`
    INSERT INTO etl_origen
    SELECT x.legacy_id, x.fuente, x.empleado_id, x.nombre, x.fecha::date, x.hora::time, upper(x.tipo), x.almuerzo,
           x.lat, x.lng, x.dispositivo, x.modo, x.horas_extra, x.autoriza, x.tipo_salida, x.razon_entrada_tardia,
           x.quien_justifica_entrada, x.razon_salida_temprana, x.razon_permiso, x.quien_justifica, x.justificado,
           x.razon_justificac, NULL, NULL, x.permiso_personal_mins, x.permiso_medico_mins, x.tiempo_justificado_mins,
           NULL, to_jsonb(x)
    FROM jsonb_to_recordset($1::jsonb) AS x(legacy_id text, fuente text, empleado_id text, nombre text, fecha text,
         hora text, tipo text, almuerzo text, lat float8, lng float8, dispositivo text, modo text, horas_extra text,
         autoriza text, tipo_salida text, razon_entrada_tardia text, quien_justifica_entrada text,
         razon_salida_temprana text, razon_permiso text, quien_justifica text, justificado text,
         razon_justificac text, permiso_personal_mins int, permiso_medico_mins int, tiempo_justificado_mins int)
    WHERE NOT EXISTS (
      SELECT 1 FROM etl_origen o
      WHERE o.fuente = 'BASE' AND o.empleado_id = x.empleado_id AND o.fecha = x.fecha::date
        AND o.tipo = upper(x.tipo) AND to_char(o.hora, 'HH24:MI') = to_char(x.hora::time, 'HH24:MI'))`, [J(extra)]);
  // Dentro de las propias hojas también puede haber repetidos (REGISTROS vs DESVINCULADOS)
  await c.query(`DELETE FROM etl_origen a USING etl_origen b
                 WHERE a.fuente <> 'BASE' AND b.fuente <> 'BASE' AND a.legacy_id > b.legacy_id
                   AND a.empleado_id = b.empleado_id AND a.fecha = b.fecha AND a.tipo = b.tipo
                   AND to_char(a.hora, 'HH24:MI') = to_char(b.hora, 'HH24:MI')`);
  // Una marcación de la hoja REGISTROS con el mismo empleado, día y tipo que la base pero otra hora es la
  // misma marcación con la hora registrada de otra forma: se conserva la de la base.
  const horaDistinta = await c.query(`
    DELETE FROM etl_origen o WHERE o.fuente = 'HOJA_REGISTROS'
      AND o.tipo IN ('ENTRADA','SALIDA','ENTRADA_CAMPO','SALIDA_CAMPO','RETORNO_CAMPO','SOLO_ALMUERZO')
      AND EXISTS (SELECT 1 FROM etl_origen b WHERE b.fuente = 'BASE' AND b.empleado_id = o.empleado_id
                  AND b.fecha = o.fecha AND b.tipo = o.tipo)`);
  paso('hoja_registros_misma_marcacion_otra_hora', horaDistinta.rowCount);
  paso('origen', (await c.query(`SELECT fuente, count(*)::int n FROM etl_origen GROUP BY 1 ORDER BY 1`)).rows);
  reporte.pasos.hojas_vs_base = (await c.query(`
    SELECT o.fuente, o.tipo, to_char(o.fecha, 'YYYY-MM') mes,
           count(*)::int filas,
           count(*) FILTER (WHERE EXISTS (SELECT 1 FROM etl_origen b WHERE b.fuente = 'BASE' AND b.empleado_id = o.empleado_id
                                           AND b.fecha = o.fecha AND b.tipo = o.tipo))::int mismo_dia_tipo_en_base,
           count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM etl_origen b WHERE b.fuente = 'BASE' AND b.empleado_id = o.empleado_id))::int empleado_sin_registros_en_base
    FROM etl_origen o WHERE o.fuente <> 'BASE' GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`)).rows;

  // 3) Empleados: base actual + hoja EMPLEADOS + fecha de ingreso + rol de pagos
  const emp = (await c.query(`SELECT * FROM public.empleados`)).rows.map(e => {
    const id = normId(e.id);
    const h = hojaEmpleados.get(id) || {};
    const v = hojaVacCalc.get(id) || {};
    return {
      id, nombre: e.nombre || h.nombre, cedula: normCedula(e.cedula) || h.cedula, area: e.area || h.area,
      cargo: e.cargo || h.cargo,
      rol: id === '1058' ? 'ADMIN' : (e.es_supervisor || h.supervisor ? 'SUPERVISOR' : 'EMPLEADO'),   // P-09
      activo: !/^(no|false|inactivo)$/i.test(String(e.activo ?? 'SI')) && String(e.estado || 'ACTIVO').toUpperCase() !== 'INACTIVO',
      telefono: normTelefono(e.telefono) || h.telefono,
      nacimiento: e.fecha_nacimiento || h.nacimiento || null,        // columnas date llegan como 'YYYY-MM-DD'
      ingreso: e.fecha_ingreso || v.ingreso || null,
      base_lat: e.latitud ?? h.lat ?? null, base_lng: e.longitud ?? h.lng ?? null,
      url_rol_pagos: hojaRolPagos.get(id) || null, foto: e.foto_url || h.foto || null,
      cultura: e.cultura_habilitada !== false,
    };
  });
  await c.query(`
    INSERT INTO core.empleados AS e (id, cedula, nombre, area, cargo, rol, activo, es_pasante, tipo_asistencia,
      puede_autorizar_extras, telefono, fecha_nacimiento, fecha_ingreso, base_lat, base_lng, url_rol_pagos,
      foto_legado, cultura_habilitada)
    SELECT x.id, x.cedula, x.nombre, x.area, x.cargo, x.rol::core.rol_app, x.activo,
           private.texto_es_pasante(x.cargo, x.area), private.texto_tipo_asistencia(x.cargo, x.area),
           private.texto_puede_autorizar_extras(x.cargo), x.telefono, x.nacimiento::date, x.ingreso::date,
           x.base_lat, x.base_lng, x.url_rol_pagos, x.foto, x.cultura
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, cedula text, nombre text, area text, cargo text, rol text,
         activo boolean, telefono text, nacimiento text, ingreso text, base_lat float8, base_lng float8,
         url_rol_pagos text, foto text, cultura boolean)
    ON CONFLICT (id) DO UPDATE SET cedula = EXCLUDED.cedula, nombre = EXCLUDED.nombre, area = EXCLUDED.area,
      cargo = EXCLUDED.cargo, activo = EXCLUDED.activo, es_pasante = EXCLUDED.es_pasante,
      tipo_asistencia = EXCLUDED.tipo_asistencia, puede_autorizar_extras = EXCLUDED.puede_autorizar_extras,
      telefono = EXCLUDED.telefono, fecha_nacimiento = EXCLUDED.fecha_nacimiento,
      fecha_ingreso = EXCLUDED.fecha_ingreso, base_lat = EXCLUDED.base_lat, base_lng = EXCLUDED.base_lng,
      url_rol_pagos = EXCLUDED.url_rol_pagos, foto_legado = EXCLUDED.foto_legado,
      cultura_habilitada = EXCLUDED.cultura_habilitada`, [J(emp)]);
  // El rol no se pisa en re-ejecuciones: una vez asignado en la base nueva, manda la base nueva.
  paso('empleados_activos', emp.length);

  // 4) Desvinculados: ficha inactiva + registro de desvinculación
  await c.query(`
    INSERT INTO core.empleados (id, nombre, area, cargo, cedula, telefono, activo, es_pasante, tipo_asistencia)
    SELECT DISTINCT ON (x.empleado_id) x.empleado_id, coalesce(x.nombre, 'SIN NOMBRE'), x.area, x.cargo, x.cedula,
           x.telefono, false, private.texto_es_pasante(x.cargo, x.area), private.texto_tipo_asistencia(x.cargo, x.area)
    FROM jsonb_to_recordset($1::jsonb) AS x(empleado_id text, nombre text, area text, cargo text, cedula text, telefono text)
    WHERE x.empleado_id IS NOT NULL
    ON CONFLICT (id) DO NOTHING`, [J(desv.empleados)]);
  await c.query(`
    INSERT INTO core.desvinculaciones (empleado_id, fecha, motivo, observaciones, desvinculado_por, snapshot, legacy_id)
    SELECT x.empleado_id, x.fecha::date, x.motivo, x.observaciones, x.desvinculado_por, x.snapshot, x.legacy_id
    FROM jsonb_to_recordset($1::jsonb) AS x(legacy_id text, empleado_id text, fecha text, motivo text,
         observaciones text, desvinculado_por text, snapshot jsonb)
    WHERE x.empleado_id IS NOT NULL
    ON CONFLICT (legacy_id) DO UPDATE SET fecha = EXCLUDED.fecha, motivo = EXCLUDED.motivo,
      observaciones = EXCLUDED.observaciones, desvinculado_por = EXCLUDED.desvinculado_por`, [J(desv.empleados)]);
  // Empleados referenciados por registros que no están en ninguna fuente: ficha inactiva mínima
  const huerfanos = await c.query(`
    INSERT INTO core.empleados (id, nombre, activo)
    SELECT DISTINCT ON (o.empleado_id) o.empleado_id, coalesce(o.nombre, 'DESCONOCIDO ' || o.empleado_id), false
    FROM etl_origen o WHERE o.empleado_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM core.empleados e WHERE e.id = o.empleado_id)
    ORDER BY o.empleado_id, o.fecha DESC
    RETURNING id`);
  paso('desvinculados', { fichas: desv.empleados.length, sin_ficha_creados_inactivos: huerfanos.rows.map(r => r.id) });
  if (huerfanos.rowCount) reporte.avisos.push(`${huerfanos.rowCount} empleados con registros pero sin ficha: se crearon inactivos (${huerfanos.rows.map(r => r.id).join(', ')}).`);

  // 5) Marcaciones (tipos de marcación), sin duplicados emp|fecha|tipo|hh:mm; se prefiere la no automática
  const TIPOS_MARCACION = `('ENTRADA','SALIDA','ENTRADA_CAMPO','SALIDA_CAMPO','RETORNO_CAMPO','SOLO_ALMUERZO')`;
  const marc = await c.query(`
    INSERT INTO core.marcaciones AS m (empleado_id, tipo, ts_servidor, fecha, hora, lat, lng, dispositivo, modo, almuerzo,
      horas_extra, autoriza, tipo_salida, motivo_entrada_tardia, quien_justifica_entrada, motivo_salida, razon_permiso,
      quien_justifica, justificado, razon_justificacion, observacion, origen, legacy_id, legacy_raw)
    SELECT DISTINCT ON (o.empleado_id, o.fecha, o.tipo, to_char(o.hora, 'HH24:MI'))
           o.empleado_id, o.tipo, (o.fecha + o.hora) AT TIME ZONE 'America/Guayaquil', o.fecha, o.hora,
           o.lat, o.lng, o.dispositivo,
           CASE WHEN upper(o.modo) = 'CAMPO' THEN 'CAMPO' ELSE 'OFICINA' END,
           CASE upper(trim(o.almuerzo)) WHEN 'SI' THEN true WHEN 'NO' THEN false END,
           upper(trim(coalesce(o.horas_extra, ''))) = 'SI', o.autoriza,
           CASE WHEN upper(o.tipo_salida) IN ('FINAL','PERMISO','PERMISO_CON_SALIDA_TEMPRANA','TRABAJO_CAMPO',
                     'SALIDA_PASANTE','SALIDA_TEMPRANA_JUSTIFICADA') THEN upper(o.tipo_salida) END,
           o.razon_entrada_tardia, o.quien_justifica_entrada, o.razon_salida_temprana, o.razon_permiso,
           o.quien_justifica,
           CASE upper(trim(coalesce(o.justificado, ''))) WHEN 'SI' THEN 'SI' ELSE 'NO' END::core.justificado,
           o.razon_justificac, coalesce(o.observacion, o.razon_ausencia),
           CASE WHEN o.dispositivo = 'GUARDIA' THEN 'GUARDIA'
                WHEN o.dispositivo = 'AUTO_COMPLETAR' THEN 'SISTEMA'
                WHEN o.dispositivo ILIKE 'MANUAL%' THEN 'SUPERVISOR'
                ELSE 'IMPORTADO' END::core.origen,
           o.legacy_id, o.raw
    FROM etl_origen o
    WHERE o.tipo IN ${TIPOS_MARCACION}
    ORDER BY o.empleado_id, o.fecha, o.tipo, to_char(o.hora, 'HH24:MI'),
             (o.dispositivo = 'AUTO_COMPLETAR') NULLS FIRST, o.fuente, o.creado NULLS LAST
    ON CONFLICT (legacy_id) DO UPDATE SET almuerzo = EXCLUDED.almuerzo, horas_extra = EXCLUDED.horas_extra,
      autoriza = EXCLUDED.autoriza, justificado = EXCLUDED.justificado, modo = EXCLUDED.modo,
      motivo_entrada_tardia = EXCLUDED.motivo_entrada_tardia, motivo_salida = EXCLUDED.motivo_salida,
      tipo_salida = EXCLUDED.tipo_salida, legacy_raw = EXCLUDED.legacy_raw`);
  const dupMarc = (await c.query(`SELECT count(*)::int n FROM etl_origen WHERE tipo IN ${TIPOS_MARCACION}`)).rows[0].n - marc.rowCount;
  paso('marcaciones', { cargadas: marc.rowCount, duplicadas_descartadas: dupMarc });

  // 6) Novedades: una por empleado y día (R-18); gana la más reciente
  const nov = await c.query(`
    INSERT INTO core.novedades AS n (empleado_id, fecha, tipo, justificado, motivo, quien_justifica, observacion,
      autoriza, origen, legacy_id, legacy_raw)
    SELECT DISTINCT ON (o.empleado_id, o.fecha)
           o.empleado_id, o.fecha, CASE WHEN o.tipo = 'VACACION' THEN 'VACACIONES' ELSE o.tipo END,
           CASE upper(trim(coalesce(o.justificado, ''))) WHEN 'NO' THEN 'NO' WHEN 'PENDIENTE' THEN 'PENDIENTE' ELSE 'SI' END::core.justificado,
           coalesce(o.razon_justificac, o.razon_ausencia), o.quien_justifica, o.observacion, o.autoriza,
           'IMPORTADO', o.legacy_id, o.raw
    FROM etl_origen o
    WHERE o.tipo NOT IN ${TIPOS_MARCACION}
      AND (CASE WHEN o.tipo = 'VACACION' THEN 'VACACIONES' ELSE o.tipo END) IN ('VACACIONES','PERMISO','PERMISO_PERSONAL',
          'PERMISO_MEDICO','CALAMIDAD_DOMESTICA','FALTA','FALTA_JUSTIFICADA','SALIDA_JUSTIFICADA','TRABAJO_DE_CAMPO',
          'SALIDA_A_CAMPO','JUSTIFICACION','INASISTENCIA','FERIADO','CUMPLEANOS')
    ORDER BY o.empleado_id, o.fecha, o.creado DESC NULLS LAST, o.hora DESC, o.legacy_id DESC
    ON CONFLICT (empleado_id, fecha) DO UPDATE SET tipo = EXCLUDED.tipo, justificado = EXCLUDED.justificado,
      motivo = EXCLUDED.motivo, quien_justifica = EXCLUDED.quien_justifica, observacion = EXCLUDED.observacion,
      legacy_id = EXCLUDED.legacy_id, legacy_raw = EXCLUDED.legacy_raw`);
  const novOrigen = (await c.query(`
    SELECT count(*) FILTER (WHERE tipo NOT IN ${TIPOS_MARCACION})::int total,
           count(*) FILTER (WHERE tipo NOT IN ${TIPOS_MARCACION} AND (CASE WHEN tipo = 'VACACION' THEN 'VACACIONES' ELSE tipo END)
             NOT IN ('VACACIONES','PERMISO','PERMISO_PERSONAL','PERMISO_MEDICO','CALAMIDAD_DOMESTICA','FALTA','FALTA_JUSTIFICADA',
             'SALIDA_JUSTIFICADA','TRABAJO_DE_CAMPO','SALIDA_A_CAMPO','JUSTIFICACION','INASISTENCIA','FERIADO','CUMPLEANOS'))::int desconocidos,
           (SELECT string_agg(DISTINCT tipo, ', ') FROM etl_origen WHERE tipo NOT IN ${TIPOS_MARCACION}
              AND tipo NOT IN ('VACACION','VACACIONES','PERMISO','PERMISO_PERSONAL','PERMISO_MEDICO','CALAMIDAD_DOMESTICA','FALTA',
              'FALTA_JUSTIFICADA','SALIDA_JUSTIFICADA','TRABAJO_DE_CAMPO','SALIDA_A_CAMPO','JUSTIFICACION','INASISTENCIA','FERIADO','CUMPLEANOS')) tipos
    FROM etl_origen`)).rows[0];
  paso('novedades_registros', { cargadas: nov.rowCount, en_origen: novOrigen.total,
    mismo_dia_reemplazadas: novOrigen.total - novOrigen.desconocidos - nov.rowCount, tipos_desconocidos: novOrigen.tipos });
  if (novOrigen.desconocidos) reporte.avisos.push(`${novOrigen.desconocidos} registros con tipo no reconocido (${novOrigen.tipos}) no se importaron.`);

  // 7) Vacaciones de la hoja VACACIONES (y respaldo de desvinculados). No reemplaza otra novedad del mismo día.
  const vacs = [...hojaVacaciones.filter(v => /^VACACI/.test(v.tipo || 'VACACIONES')), ...desv.vacaciones];
  const vac = await c.query(`
    INSERT INTO core.novedades (empleado_id, fecha, tipo, justificado, origen, legacy_id)
    SELECT DISTINCT ON (x.empleado_id, x.fecha) x.empleado_id, x.fecha::date, 'VACACIONES', 'SI', 'IMPORTADO', x.legacy_id
    FROM jsonb_to_recordset($1::jsonb) AS x(legacy_id text, empleado_id text, fecha text)
    WHERE EXISTS (SELECT 1 FROM core.empleados e WHERE e.id = x.empleado_id)
    ORDER BY x.empleado_id, x.fecha, x.legacy_id
    ON CONFLICT (empleado_id, fecha) DO NOTHING`, [J(vacs)]);
  const choques = (await c.query(`
    SELECT count(*)::int n FROM jsonb_to_recordset($1::jsonb) AS x(empleado_id text, fecha text)
    JOIN core.novedades n ON n.empleado_id = x.empleado_id AND n.fecha = x.fecha::date AND n.tipo <> 'VACACIONES'`,
    [J(vacs)])).rows[0].n;
  const sinFicha = (await c.query(`
    SELECT count(*)::int n FROM jsonb_to_recordset($1::jsonb) AS x(empleado_id text)
    WHERE NOT EXISTS (SELECT 1 FROM core.empleados e WHERE e.id = x.empleado_id)`, [J(vacs)])).rows[0].n;
  paso('vacaciones_hoja', { en_hoja: vacs.length, nuevas: vac.rowCount, dia_con_otra_novedad: choques, sin_ficha: sinFicha });
  if (choques) reporte.avisos.push(`${choques} días de VACACIONES de la hoja coinciden con otra novedad del mismo día; se conservó la otra (revisar).`);

  // 8) Permisos parciales en minutos → ajustes_dia (máximo por día para no sumar dos veces)
  const aj = await c.query(`
    INSERT INTO core.ajustes_dia (empleado_id, fecha, min_permiso_personal, min_permiso_medico, min_justificados, razon, quien_justifica)
    SELECT o.empleado_id, o.fecha, max(o.permiso_personal_mins), max(o.permiso_medico_mins), max(o.tiempo_justificado_mins),
           max(o.razon_justificac), max(o.quien_justifica)
    FROM etl_origen o
    WHERE o.permiso_personal_mins > 0 OR o.permiso_medico_mins > 0 OR o.tiempo_justificado_mins > 0
    GROUP BY o.empleado_id, o.fecha
    ON CONFLICT (empleado_id, fecha) DO UPDATE SET min_permiso_personal = EXCLUDED.min_permiso_personal,
      min_permiso_medico = EXCLUDED.min_permiso_medico, min_justificados = EXCLUDED.min_justificados`);
  const ajDif = (await c.query(`
    SELECT count(*)::int n FROM (SELECT empleado_id, fecha FROM etl_origen
      WHERE permiso_personal_mins > 0 OR permiso_medico_mins > 0 OR tiempo_justificado_mins > 0
      GROUP BY 1, 2 HAVING count(DISTINCT (permiso_personal_mins, permiso_medico_mins, tiempo_justificado_mins)) > 1) d`)).rows[0].n;
  paso('ajustes_dia', { dias: aj.rowCount, dias_con_valores_distintos_entre_filas: ajDif });

  // 9) Saldo de vacaciones del año anterior (col. F)
  const saldos = [...hojaVacCalc].filter(([, v]) => v.saldo !== null).map(([id, v]) => ({ id, dias: v.saldo }));
  const sal = await c.query(`
    INSERT INTO core.vacaciones_saldo_inicial (empleado_id, anio, dias)
    SELECT x.id, ${ANIO_VACACIONES}, x.dias FROM jsonb_to_recordset($1::jsonb) AS x(id text, dias numeric)
    WHERE EXISTS (SELECT 1 FROM core.empleados e WHERE e.id = x.id)
    ON CONFLICT (empleado_id, anio) DO UPDATE SET dias = EXCLUDED.dias`, [J(saldos)]);
  paso('vacaciones_saldo_inicial', { en_hoja: saldos.length, cargados: sal.rowCount });

  // 10) Dispositivos: el último usado queda activo (R-22)
  const disp = await c.query(`
    INSERT INTO core.dispositivos (token, empleado_id, activo, registrado_en, ultimo_uso)
    SELECT DISTINCT ON (x.token) x.token, x.empleado_id, false,
           (x.registrado::timestamp AT TIME ZONE 'America/Guayaquil'), (x.ultimo_uso::timestamp AT TIME ZONE 'America/Guayaquil')
    FROM jsonb_to_recordset($1::jsonb) AS x(token text, empleado_id text, activo boolean, registrado text, ultimo_uso text)
    WHERE EXISTS (SELECT 1 FROM core.empleados e WHERE e.id = x.empleado_id)
    ORDER BY x.token, x.ultimo_uso DESC NULLS LAST
    ON CONFLICT (token) DO UPDATE SET empleado_id = EXCLUDED.empleado_id, ultimo_uso = EXCLUDED.ultimo_uso, activo = false`,
    [J(hojaDispositivos)]);
  const activos = (await c.query(`SELECT DISTINCT token FROM jsonb_to_recordset($1::jsonb) AS x(token text, activo boolean) WHERE x.activo`,
    [J(hojaDispositivos)])).rows.map(r => r.token);
  await c.query(`
    UPDATE core.dispositivos d SET activo = true
    FROM (SELECT DISTINCT ON (empleado_id) token FROM core.dispositivos WHERE token = ANY($1)
          ORDER BY empleado_id, ultimo_uso DESC NULLS LAST) u
    WHERE d.token = u.token`, [activos]);
  paso('dispositivos', { cargados: disp.rowCount, activos: (await c.query(`SELECT count(*)::int n FROM core.dispositivos WHERE activo`)).rows[0].n });

  // 11) Invitados (hoja ALMUERZOS_EXTRA). Sin columna de estado: pasados = ENTREGADO, hoy o futuros = SOLICITADO.
  const inv = await c.query(`
    INSERT INTO core.solicitudes_invitados (id, fecha, hora, tipo_solicitud, subtipo, cantidad, invitado, empresa,
      observaciones, estado, creado_por, ts, legacy_raw)
    SELECT x.id, x.fecha::date, x.hora::time, 'ALMUERZO_EXTRA', 'ALMUERZO_EXTRA', x.cantidad, x.descripcion, x.empresa,
           x.tipo, CASE WHEN x.fecha::date < private.hoy() THEN 'ENTREGADO' ELSE 'SOLICITADO' END, 'IMPORTADO',
           coalesce((x.ts_fecha || ' ' || coalesce(x.ts_hora, '00:00:00'))::timestamp,
                    (x.fecha || ' ' || coalesce(x.hora, '00:00:00'))::timestamp) AT TIME ZONE 'America/Guayaquil',
           x.raw
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, fecha text, hora text, descripcion text, empresa text, tipo text,
         cantidad int, ts_fecha text, ts_hora text, raw jsonb)
    ON CONFLICT (id) DO UPDATE SET cantidad = EXCLUDED.cantidad, invitado = EXCLUDED.invitado, empresa = EXCLUDED.empresa`,
    [J(hojaInvitados)]);
  paso('solicitudes_invitados', { en_hoja: hojaInvitados.length, cargadas: inv.rowCount,
    unidades: hojaInvitados.reduce((s, x) => s + x.cantidad, 0) });

  // 12) Menú, cultura, logs de WhatsApp
  await c.query(`
    INSERT INTO core.historial_menu (fecha, dia, sopa, plato, jugo, legacy_id)
    SELECT x.fecha::date, x.dia, x.sopa, x.plato, x.jugo, x.legacy_id
    FROM jsonb_to_recordset($1::jsonb) AS x(legacy_id text, fecha text, dia text, sopa text, plato text, jugo text)
    ON CONFLICT (legacy_id) DO NOTHING`, [J(hojaMenu)]);
  await c.query(`
    INSERT INTO core.menu_semanal (dia, sopa, plato, jugo)
    SELECT translate(lower(d.key), 'áé', 'ae'), d.value ->> 'sopa', d.value ->> 'plato', d.value ->> 'jugo'
    FROM public.configuracion c, jsonb_each(c.valor) d
    WHERE c.clave = 'menu_semanal' AND jsonb_typeof(d.value) = 'object'
      AND translate(lower(d.key), 'áé', 'ae') IN ('lunes','martes','miercoles','jueves','viernes','sabado','domingo')
    ON CONFLICT (dia) DO UPDATE SET sopa = EXCLUDED.sopa, plato = EXCLUDED.plato, jugo = EXCLUDED.jugo`);
  await c.query(`
    INSERT INTO core.cultura_preguntas (id, tipo, pilar, icono_pilar, pregunta, pista, opciones, activo, orden)
    SELECT x.id, x.tipo, x.pilar, x.icono, x.pregunta, x.pista, x.opciones, x.activo, x.orden
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, tipo text, pilar text, icono text, pregunta text, pista text,
         opciones jsonb, activo boolean, orden int)
    ON CONFLICT (id) DO UPDATE SET pregunta = EXCLUDED.pregunta, pista = EXCLUDED.pista, opciones = EXCLUDED.opciones,
      activo = EXCLUDED.activo`, [J(hojaCultura)]);
  await c.query(`
    INSERT INTO core.whatsapp_logs (ts, empleado_id, nombre_empleado, telefono, tipo_notificacion, estado,
      detalle_respuesta, enviado_por, legacy_id)
    SELECT (x.fecha || ' ' || x.hora)::timestamp AT TIME ZONE 'America/Guayaquil', x.empleado_id, x.nombre, x.telefono,
           x.tipo, x.estado, x.detalle, x.enviado_por, x.legacy_id
    FROM jsonb_to_recordset($1::jsonb) AS x(legacy_id text, fecha text, hora text, empleado_id text, nombre text,
         telefono text, tipo text, estado text, detalle text, enviado_por text)
    ON CONFLICT (legacy_id) DO NOTHING`, [J(hojaLogs)]);
  paso('catalogos', { historial_menu: hojaMenu.length, cultura_preguntas: hojaCultura.length, whatsapp_logs: hojaLogs.length });

  // 13) Configuración: se conserva la actual salvo la ubicación, que ya viene de D-21
  await c.query(`
    UPDATE core.configuracion n
    SET valor = (o.valor - 'ubicacion' - 'emergencia' - 'supervisores') || jsonb_build_object('ubicacion', n.valor -> 'ubicacion')
    FROM public.configuracion o WHERE o.clave = 'sistema' AND n.clave = 'sistema'`);
  const cfg = (await c.query(`SELECT valor FROM core.configuracion WHERE clave = 'sistema'`)).rows[0]?.valor;
  if (cfg?.otras?.modo_mantenimiento) reporte.avisos.push('La configuración importada tiene modo_mantenimiento = true.');
  await c.query(`
    INSERT INTO core.emergencias (nombre, activa, habilitado_por, inicio)
    SELECT coalesce(nullif(e.nombre, ''), 'Emergencia'), true, e.habilitado_por, coalesce(e.updated_at, now())
    FROM public.emergencias e WHERE e.activa AND NOT EXISTS (SELECT 1 FROM core.emergencias WHERE activa)`);

  // 14) Credenciales: todos crean contraseña nueva en el primer ingreso (D-06)
  const cred = await c.query(`
    INSERT INTO private.credenciales (usuario, tipo_cuenta, password_hash, debe_cambiar)
    SELECT id, 'EMPLEADO', NULL, true FROM core.empleados WHERE activo
    ON CONFLICT (usuario) DO NOTHING`);
  paso('credenciales_creadas_sin_password', cred.rowCount);

  // ───────────── Conciliación ─────────────
  const q = async s => (await c.query(s)).rows;
  reporte.conciliacion = {
    empleados: (await q(`SELECT count(*) FILTER (WHERE activo)::int activos, count(*) FILTER (WHERE NOT activo)::int inactivos,
                         count(*) FILTER (WHERE activo AND fecha_ingreso IS NULL)::int activos_sin_fecha_ingreso,
                         count(*) FILTER (WHERE activo AND telefono IS NULL)::int activos_sin_telefono,
                         count(*) FILTER (WHERE es_pasante)::int pasantes,
                         count(*) FILTER (WHERE tipo_asistencia <> 'NORMAL')::int sin_asistencia_normal,
                         count(*) FILTER (WHERE puede_autorizar_extras)::int autorizan_extras,
                         count(*) FILTER (WHERE url_rol_pagos IS NOT NULL)::int con_rol_pagos,
                         (SELECT json_object_agg(rol, n) FROM (SELECT rol, count(*)::int n FROM core.empleados
                                                                WHERE activo GROUP BY rol) r) roles_activos
                  FROM core.empleados`))[0],
    por_mes: await q(`
      WITH o AS (
        SELECT to_char(fecha, 'YYYY-MM') mes, tipo, almuerzo, horas_extra FROM public.registros
        WHERE empleado_id ~ '^[0-9A-Za-z_-]+$'),
      h AS (SELECT to_char(fecha, 'YYYY-MM') mes FROM etl_origen WHERE fuente <> 'BASE' AND tipo IN ${TIPOS_MARCACION}),
      d AS (SELECT to_char(fecha, 'YYYY-MM') mes, tipo, almuerzo, horas_extra FROM core.marcaciones)
      SELECT m.mes,
        (SELECT count(*) FROM o WHERE o.mes = m.mes AND o.tipo IN ${TIPOS_MARCACION})::int marcaciones_base,
        (SELECT count(*) FROM h WHERE h.mes = m.mes)::int agregadas_hojas,
        (SELECT count(*) FROM d WHERE d.mes = m.mes)::int marcaciones_nuevas,
        (SELECT count(*) FROM o WHERE o.mes = m.mes AND o.tipo = 'ENTRADA')::int entradas_base,
        (SELECT count(*) FROM d WHERE d.mes = m.mes AND d.tipo = 'ENTRADA')::int entradas_nuevas,
        (SELECT count(*) FROM o WHERE o.mes = m.mes AND o.horas_extra = 'SI' AND o.tipo IN ${TIPOS_MARCACION})::int extra_base,
        (SELECT count(*) FROM d WHERE d.mes = m.mes AND d.horas_extra)::int extra_nuevas,
        (SELECT count(*) FROM o WHERE o.mes = m.mes AND o.almuerzo = 'SI' AND o.tipo IN ${TIPOS_MARCACION})::int almuerzo_si_base,
        (SELECT count(*) FROM d WHERE d.mes = m.mes AND d.almuerzo)::int almuerzo_si_nuevas,
        (SELECT count(*) FROM core.novedades n WHERE to_char(n.fecha, 'YYYY-MM') = m.mes)::int novedades,
        (SELECT count(*) FROM core.novedades n WHERE to_char(n.fecha, 'YYYY-MM') = m.mes AND n.tipo = 'VACACIONES')::int vacaciones
      FROM (SELECT DISTINCT to_char(fecha, 'YYYY-MM') mes FROM core.marcaciones
            UNION SELECT DISTINCT to_char(fecha, 'YYYY-MM') FROM core.novedades) m ORDER BY 1`),
    tablas: await q(`
      SELECT 'marcaciones' t, count(*)::int n FROM core.marcaciones UNION ALL
      SELECT 'novedades', count(*) FROM core.novedades UNION ALL
      SELECT 'ajustes_dia', count(*) FROM core.ajustes_dia UNION ALL
      SELECT 'desvinculaciones', count(*) FROM core.desvinculaciones UNION ALL
      SELECT 'solicitudes_invitados', count(*) FROM core.solicitudes_invitados UNION ALL
      SELECT 'dispositivos', count(*) FROM core.dispositivos UNION ALL
      SELECT 'vacaciones_saldo_inicial', count(*) FROM core.vacaciones_saldo_inicial UNION ALL
      SELECT 'historial_menu', count(*) FROM core.historial_menu UNION ALL
      SELECT 'menu_semanal', count(*) FROM core.menu_semanal UNION ALL
      SELECT 'cultura_preguntas', count(*) FROM core.cultura_preguntas UNION ALL
      SELECT 'whatsapp_logs', count(*) FROM core.whatsapp_logs UNION ALL
      SELECT 'credenciales', count(*) FROM private.credenciales`),
    vacaciones_vs_hoja: await (async () => {
      // Compara "tomadas" (hasta hoy) con la hoja: debe dar lo mismo que COUNTIFS de CALCULAR_vacaciones col. I
      const hojaPorId = {};
      for (const v of hojaVacaciones) if (/^VACACIONES$/.test(v.tipo || '') && v.fecha <= enGuayaquil(new Date()).fecha)
        hojaPorId[v.empleado_id] = (hojaPorId[v.empleado_id] || 0) + 1;
      const base = Object.fromEntries((await q(`
        SELECT empleado_id, count(*)::int n FROM core.novedades WHERE tipo = 'VACACIONES' AND fecha <= private.hoy() GROUP BY 1`))
        .map(r => [r.empleado_id, r.n]));
      const ids = new Set([...Object.keys(hojaPorId), ...Object.keys(base)]);
      const difs = [...ids].filter(id => (hojaPorId[id] || 0) !== (base[id] || 0))
        .map(id => ({ empleado_id: id, hoja: hojaPorId[id] || 0, base_nueva: base[id] || 0 }));
      return { empleados_comparados: ids.size, con_diferencia: difs.length, diferencias: difs };
    })(),
    // Regla SQL de adjudicadas y total contra lo que calculó la hoja (D-04)
    saldo_vs_hoja: await (async () => {
      const nuevos = Object.fromEntries((await q(`
        SELECT e.id, private.vacaciones_adjudicadas(e.fecha_ingreso, ${ANIO_VACACIONES}) adj,
               coalesce(s.dias, 0) + coalesce(private.vacaciones_adjudicadas(e.fecha_ingreso, ${ANIO_VACACIONES}), 0) total
        FROM core.empleados e LEFT JOIN core.vacaciones_saldo_inicial s ON s.empleado_id = e.id AND s.anio = ${ANIO_VACACIONES}`))
        .map(r => [r.id, r]));
      const difs = [];
      let comparados = 0;
      for (const [id, h] of hojaVacCalc) {
        if (h.adjudicadas === null || !nuevos[id]) continue;
        comparados++;
        if (Number(nuevos[id].adj) !== h.adjudicadas || (h.total !== null && Number(nuevos[id].total) !== h.total))
          difs.push({ empleado_id: id, hoja_adj: h.adjudicadas, nueva_adj: nuevos[id].adj, hoja_total: h.total, nueva_total: Number(nuevos[id].total) });
      }
      return { comparados, con_diferencia: difs.length, diferencias: difs };
    })(),
  };
  const mesesDif = reporte.conciliacion.por_mes.filter(m => m.marcaciones_base + m.agregadas_hojas !== m.marcaciones_nuevas);
  reporte.avisos.push(mesesDif.length
    ? `✘ Meses que NO cuadran (base + hojas ≠ nueva): ${mesesDif.map(m => `${m.mes} (${m.marcaciones_base}+${m.agregadas_hojas}→${m.marcaciones_nuevas})`).join(', ')}.`
    : '✔ Marcaciones: en todos los meses base + agregadas desde hojas = nueva.');

  if (SIMULAR) { await c.query('ROLLBACK'); log('Simulación: cambios revertidos.'); }
  else { await c.query('COMMIT'); log('ETL confirmado.'); }
} catch (e) {
  await c.query('ROLLBACK');
  log(`✘ ETL revertido: ${e.message}`);
  await c.end();
  process.exit(1);
}
await c.end();

// ───────────── Reporte ─────────────
const dirRep = path.join(RAIZ, 'db', 'etl', 'reportes');
fs.mkdirSync(dirRep, { recursive: true });
const sello = enGuayaquil(new Date());
const base = path.join(dirRep, `conciliacion_${db}_${sello.fecha}_${sello.hora.replace(/:/g, '')}`);
fs.writeFileSync(`${base}.json`, JSON.stringify(reporte, null, 2));
const md = [
  `# Conciliación ETL — ${db}`, '', `Libro: ${reporte.libro} · ${sello.fecha} ${sello.hora} (Guayaquil)`, '',
  '## Pasos', '', ...Object.entries(reporte.pasos).map(([k, v]) => `- **${k}**: \`${JSON.stringify(v)}\``), '',
  '## Avisos', '', ...(reporte.avisos.length ? reporte.avisos.map(a => `- ${a}`) : ['- Ninguno']), '',
  '## Empleados', '', '```json', JSON.stringify(reporte.conciliacion.empleados, null, 2), '```', '',
  '## Por mes (base actual vs. nueva)', '',
  '| Mes | Marc. base | + hojas | Marc. nueva | Entradas base | Entradas nueva | Extra base | Extra nueva | Almuerzo SI base | Almuerzo SI nueva | Novedades | Vacaciones |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...reporte.conciliacion.por_mes.map(m => `| ${m.mes} | ${m.marcaciones_base} | ${m.agregadas_hojas} | ${m.marcaciones_nuevas} | ${m.entradas_base} | ${m.entradas_nuevas} | ${m.extra_base} | ${m.extra_nuevas} | ${m.almuerzo_si_base} | ${m.almuerzo_si_nuevas} | ${m.novedades} | ${m.vacaciones} |`), '',
  '## Tablas', '', ...reporte.conciliacion.tablas.map(t => `- ${t.t}: ${t.n}`), '',
  '## Vacaciones tomadas: hoja vs. base nueva', '',
  `Empleados comparados: ${reporte.conciliacion.vacaciones_vs_hoja.empleados_comparados} · con diferencia: ${reporte.conciliacion.vacaciones_vs_hoja.con_diferencia}`, '',
  ...reporte.conciliacion.vacaciones_vs_hoja.diferencias.map(d => `- ${d.empleado_id}: hoja ${d.hoja} · nueva ${d.base_nueva}`), '',
  '## Adjudicadas y total 2026: hoja CALCULAR_vacaciones vs. regla SQL', '',
  `Comparados: ${reporte.conciliacion.saldo_vs_hoja.comparados} · con diferencia: ${reporte.conciliacion.saldo_vs_hoja.con_diferencia}`, '',
  ...reporte.conciliacion.saldo_vs_hoja.diferencias.map(d => `- ${d.empleado_id}: adjudicadas hoja ${d.hoja_adj} / nueva ${d.nueva_adj} · total hoja ${d.hoja_total} / nueva ${d.nueva_total}`), '',
  '## Hojas vs. base (filas agregadas desde el libro)', '',
  '| Fuente | Tipo | Mes | Filas | Mismo día y tipo en base | Empleado sin registros en base |', '|---|---|---|---|---|---|',
  ...reporte.pasos.hojas_vs_base.map(h => `| ${h.fuente} | ${h.tipo} | ${h.mes} | ${h.filas} | ${h.mismo_dia_tipo_en_base} | ${h.empleado_sin_registros_en_base} |`),
].join('\n');
fs.writeFileSync(`${base}.md`, md);
log(`Reporte: ${path.relative(RAIZ, base)}.md`);
