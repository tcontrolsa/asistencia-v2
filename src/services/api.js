// Centralized API Client connecting to Docker PostgreSQL Node backend
export function getApiBase() {
  if (typeof window !== 'undefined') {
    // Check localStorage override
    const saved = localStorage.getItem('tcontrol_api_url');
    if (saved) {
      const clean = saved.trim().replace(/\/$/, '');
      return clean.endsWith('/api') ? clean : `${clean}/api`;
    }

    // In local development, use the Vite dev server proxy
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return '/api';
    }
  }
  return import.meta.env.VITE_API_URL || '/api';
}

/**
 * Execute a backend action
 */
export async function executeAction(actionName, payload = {}) {
  const apiBase = getApiBase();
  try {
    const res = await fetch(`${apiBase}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Bypass-Tunnel-Reminder': 'true',
      },
      body: JSON.stringify({
        accion: actionName,
        action: actionName,
        ...payload,
        payload: payload,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(errData.error || `Error del servidor (${res.status})`);
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error(`[API Error: ${actionName}]`, error);
    throw error;
  }
}

// ----------------- Authentication & PIN -----------------
export async function verificarPIN(idEmpleado, pin) {
  return executeAction('verificarPIN', { idEmpleado: String(idEmpleado), pin: String(pin) });
}

export async function verificarEmpleadoTienePin(idEmpleado) {
  return executeAction('verificarEmpleadoTienePin', { idEmpleado: String(idEmpleado) });
}

export async function obtenerRegistrosEmpleado(empleadoId) {
  const idStr = String(empleadoId || '').trim();
  if (!idStr) return [];

  let list = [];
  try {
    const res = await executeAction('obtenerRegistros', { 
      empleadoId: idStr,
      idEmpleado: idStr,
      id_empleado: idStr
    });
    list = Array.isArray(res) ? res : (res.registros || res.datos || []);
  } catch (err) {
    console.warn('[API] Advertencia en obtenerRegistros:', err.message);
  }

  // Merge with cacheSupervisor if present to ensure recent punches are not missed
  if (cacheSupervisor && Array.isArray(cacheSupervisor.registros)) {
    const extra = cacheSupervisor.registros.filter(r => getRecordEmpId(r) === idStr);
    const existingIds = new Set(list.map(r => r.id || `${r.fecha}_${r.hora}_${r.tipo}`));
    extra.forEach(r => {
      const k = r.id || `${r.fecha}_${r.hora}_${r.tipo}`;
      if (!existingIds.has(k)) {
        list.push(r);
        existingIds.add(k);
      }
    });
  }

  // Ensure all returned records have normal identifiers and are sorted chronologically descending
  list = list.map(r => ({
    ...r,
    empleadoId: r.empleadoId || getRecordEmpId(r) || idStr,
    idEmpleado: r.idEmpleado || getRecordEmpId(r) || idStr,
    fecha: (r.fecha || '').split('T')[0],
  }));

  list.sort((a, b) => {
    const da = `${a.fecha || ''} ${a.hora || ''}`;
    const db = `${b.fecha || ''} ${b.hora || ''}`;
    return db.localeCompare(da);
  });

  return list;
}

// ----------------- Dispositivos -----------------
export async function verificarDispositivo(idEmpleado, fingerprint) {
  return executeAction('verificarDispositivo', { idEmpleado: String(idEmpleado), fingerprint });
}

export async function registrarDispositivo(idEmpleado, fingerprint, info = {}) {
  return executeAction('registrarDispositivo', { idEmpleado: String(idEmpleado), fingerprint, ...info });
}

// ----------------- Helper de Normalización de Registros -----------------
export function getRecordEmpId(r) {
  if (!r) return '';
  const raw = (r.empleadoId && String(r.empleadoId).trim()) || 
              (r.idEmpleado && String(r.idEmpleado).trim()) || 
              (r.id_empleado && String(r.id_empleado).trim()) || '';
  if (raw && !raw.includes('_')) return raw;

  if (r.id && typeof r.id === 'string' && r.id.includes('_')) {
    const parts = r.id.split('_');
    if (parts[0] && parts[0].trim()) return parts[0].trim();
  }
  return raw || String(r.id || '').trim();
}

function normalizarRegistro(asistenciaData = {}) {
  const empId = getRecordEmpId(asistenciaData);

  const lat = asistenciaData.lat ?? asistenciaData.latitud ?? null;
  const lng = asistenciaData.lng ?? asistenciaData.longitud ?? null;

  const now = new Date();
  const fecha = asistenciaData.fecha || now.toISOString().split('T')[0];
  const hora = asistenciaData.hora || now.toTimeString().split(' ')[0];

  return {
    ...asistenciaData,
    empleadoId: empId,
    idEmpleado: empId,
    id_empleado: empId,
    lat,
    lng,
    latitud: lat,
    longitud: lng,
    fecha,
    hora,
  };
}

// ----------------- Kiosco / Asistencia -----------------
export async function registrarAsistencia(asistenciaData) {
  const norm = normalizarRegistro(asistenciaData);
  invalidarCacheSupervisor();
  return executeAction('guardarRegistro', {
    ...norm,
    registro: norm,
  });
}

export async function registrarSalida(asistenciaData) {
  const norm = normalizarRegistro({ ...asistenciaData, tipo: 'SALIDA' });
  invalidarCacheSupervisor();
  return executeAction('guardarRegistro', {
    ...norm,
    tipo: 'SALIDA',
    registro: norm,
  });
}

// ----------------- Colaboradores & Config -----------------
let cacheEmpleados = null;
let cacheEmpleadosTime = 0;

export async function obtenerColaboradores(force = false) {
  const now = Date.now();
  if (!force && cacheEmpleados && (now - cacheEmpleadosTime < 5 * 60 * 1000)) {
    return cacheEmpleados;
  }
  const res = await executeAction('obtenerEmpleados');
  const list = Array.isArray(res) ? res : (res.empleados || res.colaboradores || []);
  cacheEmpleados = list;
  cacheEmpleadosTime = now;
  return list;
}

export async function obtenerConfiguraciones() {
  const res = await executeAction('obtenerConfiguraciones');
  return res.configuraciones || res || {};
}

// ----------------- Panel Supervisor -----------------
let cacheSupervisor = null;
let cacheSupervisorTime = 0;

export async function obtenerDatosSupervisor(filtro = {}, force = false) {
  const now = Date.now();
  if (!force && cacheSupervisor && (now - cacheSupervisorTime < 90 * 1000)) {
    return cacheSupervisor;
  }
  const data = await executeAction('obtenerDatosSupervisor', filtro);
  cacheSupervisor = data;
  cacheSupervisorTime = now;
  return data;
}

export function invalidarCacheSupervisor() {
  cacheSupervisor = null;
  cacheSupervisorTime = 0;
}

export async function actualizarRegistro(id, datos) {
  invalidarCacheSupervisor();
  return executeAction('actualizarRegistroGeneral', { id, ...datos });
}

export async function eliminarRegistro(id) {
  invalidarCacheSupervisor();
  return executeAction('eliminarRegistro', { id });
}

export async function justificarDia(empleadoId, fecha, motivo) {
  invalidarCacheSupervisor();
  const idStr = String(empleadoId);
  return executeAction('justificarDia', { 
    empleadoId: idStr, 
    idEmpleado: idStr, 
    id_empleado: idStr, 
    fecha, 
    motivo 
  });
}

export async function obtenerVacaciones(empleadoId) {
  return executeAction('obtenerVacacionesEmpleado', { empleadoId: String(empleadoId) });
}

export async function reportarEmergenciaEmpleado(payload) {
  invalidarCacheSupervisor();
  const norm = normalizarRegistro({
    ...payload,
    tipo: 'EMERGENCIA_REPORTE',
    observacion: payload.estado || payload.observacion || 'REPORTE_EMERGENCIA',
  });
  return executeAction('guardarRegistro', {
    ...norm,
    registro: norm,
  });
}

export async function toggleEmergenciaSistema(activa, motivo = 'Simulacro / Emergencia General') {
  invalidarCacheSupervisor();
  return executeAction('toggleEmergencia', { activa: Boolean(activa), motivo });
}

export async function obtenerAlmuerzosExtra(empleadoId, mes, anio) {
  return executeAction('obtenerAlmuerzosExtra', { empleadoId, mes, anio });
}

// ----------------- Notificaciones WhatsApp -----------------
export async function enviarNotificacionWhatsApp(telefono, mensaje, tipo = 'alerta') {
  try {
    return await executeAction('enviarWhatsApp', {
      telefono: String(telefono).replace(/\D/g, ''),
      mensaje,
      tipo,
    });
  } catch (err) {
    console.warn('[WhatsApp Notifier] No se pudo enviar notificación:', err.message);
    return { ok: false, error: err.message };
  }
}

// ----------------- Catering / Almuerzos -----------------
export async function reservarAlmuerzo(payload) {
  try {
    const res = await executeAction('guardarAlmuerzo', {
      ...payload,
      accion: 'reservar',
    });
    if (res && res.ok && !res.noImplementado) return res;
  } catch {
    // continue to fallback
  }

  const norm = normalizarRegistro({
    ...payload,
    tipo: 'ALMUERZO_RESERVA',
    almuerzo: payload.opcion || payload.almuerzo || 'Normal',
  });
  invalidarCacheSupervisor();
  return executeAction('guardarRegistro', {
    ...norm,
    registro: norm,
  });
}

export async function despacharAlmuerzo(payload) {
  try {
    const res = await executeAction('guardarAlmuerzo', {
      ...payload,
      accion: 'despachar',
      entregado: true,
    });
    if (res && res.ok && !res.noImplementado) return res;
  } catch {
    // continue to fallback
  }

  const norm = normalizarRegistro({
    ...payload,
    tipo: 'ALMUERZO_SALIDA',
    entregado: true,
  });
  invalidarCacheSupervisor();
  return executeAction('guardarRegistro', {
    ...norm,
    registro: norm,
  });
}

export async function obtenerConsumoAlmuerzosDia(fecha) {
  const f = fecha || new Date().toISOString().split('T')[0];
  try {
    const res = await executeAction('obtenerAlmuerzosDia', { fecha: f });
    if (res && res.ok && !res.noImplementado) {
      return Array.isArray(res) ? res : (res.almuerzos || res.datos || []);
    }
  } catch {
    // fallback
  }

  try {
    const supData = await obtenerDatosSupervisor({ fecha: f }, false);
    const all = supData.registros || supData.asistencias || supData.datos || [];
    return all.filter(r => {
      const rf = (r.fecha || '').split('T')[0];
      if (rf !== f) return false;
      const t = (r.tipo || '').toUpperCase();
      return t.includes('ALMUERZO') || r.almuerzo === 'SI' || r.almuerzo === 'PLANTA' || r.opcion_menu;
    });
  } catch (err) {
    console.warn('[Catering] Fallback al cargar consumo de almuerzos:', err.message);
    return [];
  }
}

// ----------------- Garita / Marcación Asistida (FN-04) -----------------
export async function registrarMarcacionAsistida(payload) {
  const norm = normalizarRegistro(payload);
  invalidarCacheSupervisor();
  return executeAction('guardarRegistro', {
    ...norm,
    operador: 'GUARDIA',
    dispositivo: 'GARITA_SEGURIDAD',
    registro: {
      ...norm,
      operador: 'GUARDIA',
      dispositivo: 'GARITA_SEGURIDAD',
    },
  });
}
