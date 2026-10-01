import { registerSW } from 'virtual:pwa-register';
import { rpc } from './lib/api';

// Registro del service worker con actualización automática (initPWA del legado)
export function iniciarPwa() {
  if (!('serviceWorker' in navigator)) return;
  const actualizar = registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      window.setInterval(() => { reg.update().catch(() => undefined); void consultarVersionForzada(); }, 15 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => undefined); });
      void consultarVersionForzada();
    },
    onNeedRefresh() { actualizar(true); },
  });
}

// Actualización forzada (verificarActualizacionForzada / forzarActualizacionTerminalManual)
export async function forzarActualizacion(ts: number) {
  try { localStorage.setItem('tcontrol_ultima_act_forzada', String(ts || Date.now())); } catch { /* */ }
  try {
    if ('caches' in window) await Promise.all((await caches.keys()).map(k => caches.delete(k)));
    if ('serviceWorker' in navigator) {
      for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.update().catch(() => undefined);
    }
  } finally {
    window.setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.set('v_update', String(ts || Date.now()));
      window.location.replace(url.toString());
    }, 500);
  }
}

// Orden emitida desde Opciones → Operaciones (todas las páginas: app, guardia, catering, kiosco y panel)
async function consultarVersionForzada() {
  try {
    const remoto = Number(await rpc<number>('version_forzada', {}, false));
    // Primera visita del dispositivo: solo toma la marca actual (no hay versión vieja que purgar)
    if (!localStorage.getItem('tcontrol_ultima_act_forzada')) { localStorage.setItem('tcontrol_ultima_act_forzada', String(remoto)); return; }
    verificarActualizacionForzada(remoto);
  } catch { /* sin conexión o sin almacenamiento */ }
}

export function verificarActualizacionForzada(tsRemoto: number | string | null | undefined) {
  const remoto = Number(tsRemoto || 0);
  let local = 0;
  try { local = Number(localStorage.getItem('tcontrol_ultima_act_forzada') || 0); } catch { /* */ }
  if (remoto > local) void forzarActualizacion(remoto);
}
