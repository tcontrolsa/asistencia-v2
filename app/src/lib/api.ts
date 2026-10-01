// Cliente de PostgREST. Sin secretos: la sesión es un JWT firmado por la base (Fase 2).
const BASE = ((import.meta.env.VITE_POSTGREST_URL as string | undefined) || './rest').replace(/\/$/, '');
// Cada módulo (empleado, guardia, catering) guarda su propia sesión en el dispositivo
let CLAVE_TOKEN = 'TCONTROL_SESION';
export function usarClaveSesion(clave: string) { CLAVE_TOKEN = clave; }

// Vista simulada (visor_empleado.html, P-16): el token de solo lectura vive solo en memoria de la pestaña
let TOKEN_SIMULADO: string | null = null;
export function usarSesionSimulada(token: string) { TOKEN_SIMULADO = token; }
export const esSesionSimulada = () => TOKEN_SIMULADO !== null;

export class ErrorApi extends Error {
  constructor(message: string, public codigo?: string, public hint?: string, public estado?: number, public datos?: unknown) {
    super(message);
  }
}

export function urlApi(ruta: string): string {
  return `${BASE}${ruta}`;
}

// Las fotos subidas vienen como '/rpc/foto?...' relativas a la API
export function urlFoto(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('/rpc/')) return urlApi(url);
  return fixFotoUrl(url);
}

// window.fixFotoUrl del legado (tcontrol_core.js): enlaces de Google Drive → miniatura directa
export function fixFotoUrl(url: string, size = 200): string {
  url = url.trim();
  if (url.startsWith('data:image') || url.startsWith('blob:')) return url;
  if (url.includes('googleusercontent.com/d/')) return url.includes('=') ? url : `${url}=w${size}`;
  if (url.includes('drive.google.com') || url.includes('docs.google.com') || url.includes('googleusercontent.com')) {
    const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return `https://lh3.googleusercontent.com/d/${m[1]}=w${size}`;
  }
  return url;
}

export const sesion = {
  token(): string | null {
    if (TOKEN_SIMULADO !== null) return TOKEN_SIMULADO || null;
    try { return localStorage.getItem(CLAVE_TOKEN); } catch { return null; }
  },
  guardar(token: string) {
    if (TOKEN_SIMULADO !== null) { TOKEN_SIMULADO = token; return; }
    try { localStorage.setItem(CLAVE_TOKEN, token); } catch { /* sin almacenamiento */ }
  },
  cerrar() {
    if (TOKEN_SIMULADO !== null) { TOKEN_SIMULADO = ''; return; }
    try { localStorage.removeItem(CLAVE_TOKEN); } catch { /* sin almacenamiento */ }
  },
};

let alExpirar: (() => void) | null = null;
export function alCerrarSesion(fn: () => void) { alExpirar = fn; }

async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown, conSesion = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const token = conSesion ? sesion.token() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  let r: Response;
  try {
    r = await fetch(urlApi(ruta), { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  } catch {
    throw new ErrorApi('Error de conexión con el servidor', 'RED');
  }
  const texto = await r.text();
  let datos: unknown = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  if (!r.ok) {
    const d = (datos || {}) as { message?: string; error?: string; code?: string; codigo?: string; hint?: string };
    // Errores de sesión (pre-request): la app vuelve al login
    if ((r.status === 401 || d.code === 'PT401') && token && d.codigo === undefined) {
      sesion.cerrar();
      alExpirar?.();
    }
    if (TOKEN_SIMULADO !== null && d.code === '25006') {
      throw new ErrorApi('Vista simulada de solo lectura: no se puede marcar ni modificar datos.', 'SIMULACION', undefined, r.status, datos);
    }
    throw new ErrorApi(d.error || d.message || `Error del servidor (${r.status})`, d.codigo || d.code, d.hint, r.status, datos);
  }
  return datos as T;
}

export function rpc<T = unknown>(nombre: string, args: Record<string, unknown> = {}, conSesion = true): Promise<T> {
  return pedir<T>('POST', `/rpc/${nombre}`, args, conSesion);
}

export function leer<T = unknown>(recurso: string): Promise<T> {
  return pedir<T>('GET', `/${recurso}`);
}
