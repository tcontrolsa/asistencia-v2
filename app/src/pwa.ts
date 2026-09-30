import { registerSW } from 'virtual:pwa-register';

// Registro del service worker con actualización automática (initPWA del legado)
export function iniciarPwa() {
  if (!('serviceWorker' in navigator)) return;
  const actualizar = registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      window.setInterval(() => reg.update().catch(() => undefined), 15 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => undefined); });
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

export function verificarActualizacionForzada(tsRemoto: number | string | null | undefined) {
  const remoto = Number(tsRemoto || 0);
  let local = 0;
  try { local = Number(localStorage.getItem('tcontrol_ultima_act_forzada') || 0); } catch { /* */ }
  if (remoto > local) void forzarActualizacion(remoto);
}
