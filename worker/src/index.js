// Worker de la Fase 6. Cada minuto: latido (estado de OpenWA para el panel) y tareas programadas
// (private.worker_tareas). Cada pocos segundos: toma trabajos de la cola (mensajes de WhatsApp y exportaciones a
// Google Sheets) y devuelve el resultado. Uso: node src/index.js [--una-vez]
import pg from 'pg';
import { config } from './config.js';
import { ErrorEnvio, crearOpenWA } from './openwa.js';
import { crearSheets } from './sheets.js';
import { crearFirestore } from './firestore.js';
import { copiaLegado, diaAnterior, reporteParalelo } from './paralelo.js';

const log = (...a) => console.log(`[${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}]`, ...a);
const esperar = ms => new Promise(r => setTimeout(r, ms));

if (!config.dbUri) {
  console.error('Falta WORKER_DB_URI (node db/scripts/generar-secretos.js la genera en .env).');
  process.exit(1);
}

// Las columnas `date` llegan como texto 'YYYY-MM-DD' (sin convertir a la zona del contenedor)
pg.types.setTypeParser(1082, v => v);
const pool = new pg.Pool({ connectionString: config.dbUri, max: 2, application_name: 'tcontrol-worker' });
const sql = async (texto, params = []) => (await pool.query(texto, params)).rows[0]?.v;
const sheets = crearSheets(config.sheets);
const firestore = crearFirestore({ proyecto: config.firestoreProyecto });
let wa = null;

async function clienteWA() {
  const cfg = await sql('SELECT private.worker_config() v');
  const url = config.openwa.url || cfg?.servidorUrl || '';
  if (!wa || wa.base !== url.replace(/\/+$/, '')) wa = crearOpenWA({ ...config.openwa, url });
  return wa;
}

async function latido() {
  let estado = { modo: config.modo, sheets: sheets.configurado ? 'configurado' : 'sin configurar' };
  if (config.modo === 'real') estado = { ...estado, ...(await (await clienteWA()).estado()) };
  else estado = { ...estado, sesion_activa: true, nombre_emisor: 'Modo simulación (no se envían mensajes)', error: null };
  await pool.query('SELECT private.worker_latido($1)', [estado]);
  return estado;
}

async function tareas() {
  const hechas = await sql('SELECT private.worker_tareas() v');
  for (const h of hechas || []) log(`Tarea ${h.tarea} (${h.fecha}):`, JSON.stringify(h.resultado));
}

// Tareas que corren en el worker (red o motor de cálculo); la base decide cuándo y deja constancia
const EXTERNAS = {
  copia_legado: () => copiaLegado(sql, firestore),
  reporte_paralelo: fecha => reporteParalelo(sql, diaAnterior(fecha)),
};
async function tareasExternas() {
  for (const [tarea, fn] of Object.entries(EXTERNAS)) {
    const fecha = await sql('SELECT private.worker_tarea_externa($1) v', [tarea]);
    if (!fecha) continue;
    try {
      const r = await fn(fecha);
      await pool.query('SELECT private.worker_tarea_fin($1, $2, $3)', [tarea, fecha, JSON.stringify(r)]);
      log(`Tarea ${tarea} (${fecha}):`, JSON.stringify(r).slice(0, 500));
    } catch (e) {
      await pool.query('SELECT private.worker_tarea_fin($1, $2, NULL, $3)', [tarea, fecha, e.message]);
      log(`Tarea ${tarea} (${fecha}) con error: ${e.message}`);
    }
  }
}

async function enviarWhatsApp(t) {
  const p = t.payload;
  const numero = String(p.telefono || '').replace(/\D/g, '');
  if (config.soloNumeros.length && !config.soloNumeros.includes(numero)) {
    return { ok: false, detalle: 'Descartado: el número no está en WHATSAPP_SOLO_NUMEROS (modo de prueba)', reintentar: false };
  }
  if (config.modo !== 'real') return { ok: true, simulado: true, detalle: 'Simulado: modo simulación, no se envió' };
  const cliente = await clienteWA();
  const r = t.imagen ? await cliente.enviarImagen(numero, p.mensaje, t.imagen) : await cliente.enviarTexto(numero, p.mensaje);
  return { ok: true, detalle: String(r.mensajeId) };
}

async function procesar(t) {
  try {
    if (t.tipo === 'WHATSAPP_MENSAJE') {
      const r = await enviarWhatsApp(t);
      await pool.query('SELECT private.worker_resultado($1, $2, $3, $4, NULL, $5)', [t.id, r.ok, r.detalle, !!r.reintentar, !!r.simulado]);
      log(`WhatsApp #${t.id} → …${String(t.payload.telefono || '').slice(-4)}:${r.ok ? (r.simulado ? 'SIMULADO' : 'ENVIADO') : 'NO ENVIADO'} (${r.detalle})`);
      return true;
    }
    if (t.tipo === 'EXPORTAR_SHEETS') {
      const r = await sheets.exportar(t.payload);
      await pool.query('SELECT private.worker_resultado($1, true, $2, false, $3)', [t.id, 'Reporte creado exitosamente en Google Sheets', r]);
      log(`Sheets #${t.id} "${t.payload.nombre}": ${r.url}`);
      return false;
    }
    await pool.query('SELECT private.worker_resultado($1, false, $2)', [t.id, `Tipo de trabajo desconocido: ${t.tipo}`]);
  } catch (e) {
    const reintentar = e instanceof ErrorEnvio ? e.reintentar : t.tipo === 'WHATSAPP_MENSAJE';
    await pool.query('SELECT private.worker_resultado($1, false, $2, $3)', [t.id, e.message, reintentar]);
    log(`Trabajo #${t.id} (${t.tipo}) con error: ${e.message}${reintentar ? ' — se reintentará' : ''}`);
  }
  return t.tipo === 'WHATSAPP_MENSAJE';
}

async function cola() {
  let total = 0;
  for (;;) {
    const lote = await sql('SELECT private.worker_tomar(10) v');
    if (!lote?.length) return total;
    for (const t of lote) {
      const fueEnvio = await procesar(t);
      total++;
      if (fueEnvio && config.modo === 'real') await esperar(config.pausaMs);   // no saturar la sesión de WhatsApp
    }
  }
}

async function ciclo(nombre, fn) {
  try { return await fn(); } catch (e) { log(`Error en ${nombre}: ${e.message}`); return null; }
}

async function main() {
  log(`Worker iniciado · modo ${config.modo.toUpperCase()} · Google Sheets ${sheets.configurado ? 'configurado' : 'sin configurar'}`);
  // Copia y reporte a demanda (no marca la tarea del día): node src/index.js --paralelo [YYYY-MM-DD]
  const iPar = process.argv.indexOf('--paralelo');
  if (iPar >= 0) {
    log('Copia del legado:', JSON.stringify(await copiaLegado(sql, firestore)));
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(process.argv[iPar + 1] || '') ? process.argv[iPar + 1] : diaAnterior(hoy);
    log(`Reporte de diferencias ${fecha}:`, JSON.stringify(await reporteParalelo(sql, fecha)));
    await pool.end();
    return;
  }
  if (process.argv.includes('--una-vez')) {
    const est = await ciclo('latido', latido);
    log('Servicio WhatsApp:', JSON.stringify(est));
    await ciclo('tareas', tareas);
    await ciclo('tareas externas', tareasExternas);
    log(`Trabajos procesados: ${await ciclo('cola', cola)}`);
    await pool.end();
    return;
  }
  let ultimoMinuto = 0;
  let detener = false;
  const salir = () => { detener = true; };
  process.on('SIGINT', salir);
  process.on('SIGTERM', salir);
  while (!detener) {
    if (Date.now() - ultimoMinuto >= config.intervaloTareasMs) {
      ultimoMinuto = Date.now();
      await ciclo('latido', latido);
      await ciclo('tareas', tareas);
      await ciclo('tareas externas', tareasExternas);
    }
    await ciclo('cola', cola);
    await esperar(config.intervaloColaMs);
  }
  await pool.end();
  log('Worker detenido.');
}

main().catch(e => { console.error(e); process.exit(1); });
