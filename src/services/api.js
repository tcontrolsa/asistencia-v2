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

// ----------------- Dispositivos -----------------
export async function verificarDispositivo(idEmpleado, fingerprint) {
  return executeAction('verificarDispositivo', { idEmpleado: String(idEmpleado), fingerprint });
}

export async function registrarDispositivo(idEmpleado, fingerprint, info = {}) {
  return executeAction('registrarDispositivo', { idEmpleado: String(idEmpleado), fingerprint, ...info });
}

// ----------------- Kiosco / Asistencia -----------------
export async function registrarAsistencia(asistenciaData) {
  return executeAction('guardarRegistro', {
    registro: asistenciaData,
    ...asistenciaData,
  });
}

export async function registrarSalida(asistenciaData) {
  return executeAction('guardarRegistro', {
    registro: { ...asistenciaData, tipo: 'SALIDA' },
    tipo: 'SALIDA',
    ...asistenciaData,
  });
}

// ----------------- Colaboradores & Config -----------------
export async function obtenerColaboradores() {
  const res = await executeAction('obtenerEmpleados');
  return res.empleados || res.colaboradores || [];
}


export async function obtenerConfiguraciones() {
  const res = await executeAction('obtenerConfiguraciones');
  return res.configuraciones || {};
}

// ----------------- Panel Supervisor -----------------
export async function obtenerDatosSupervisor(filtro = {}) {
  return executeAction('obtenerDatosSupervisor', filtro);
}

export async function actualizarRegistro(id, datos) {
  return executeAction('actualizarRegistroGeneral', { id, ...datos });
}

export async function eliminarRegistro(id) {
  return executeAction('eliminarRegistro', { id });
}

export async function justificarDia(empleadoId, fecha, motivo) {
  return executeAction('justificarDia', { empleadoId, fecha, motivo });
}

export async function obtenerVacaciones(empleadoId) {
  return executeAction('obtenerVacacionesEmpleado', { empleadoId });
}

export async function obtenerAlmuerzosExtra(empleadoId, mes, anio) {
  return executeAction('obtenerAlmuerzosExtra', { empleadoId, mes, anio });
}
