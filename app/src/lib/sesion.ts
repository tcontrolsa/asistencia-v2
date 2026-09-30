import { sesion } from './api';

// Solo para decidir qué pantalla mostrar; la validez real la comprueba el servidor en cada petición.
export interface Claims { role: string; usuario: string; empleado_id?: string; debe_cambiar?: boolean; exp: number; dispositivo?: string }

export function leerClaims(token = sesion.token()): Claims | null {
  if (!token) return null;
  try {
    const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const c = JSON.parse(decodeURIComponent(escape(atob(p)))) as Claims;
    if (c.exp && c.exp * 1000 < Date.now()) return null;
    return c;
  } catch {
    return null;
  }
}

// Token del dispositivo (generarDeviceToken): DEV_XXXXXXXX guardado en el teléfono
export function tokenDispositivo(): string {
  try {
    let t = localStorage.getItem('DEVICE_TOKEN');
    if (!t || !/^[A-Za-z0-9_-]{6,64}$/.test(t)) {
      t = 'DEV_' + Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(8, '0');
      localStorage.setItem('DEVICE_TOKEN', t);
    }
    return t;
  } catch {
    return 'DEV_' + Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(8, '0');
  }
}
