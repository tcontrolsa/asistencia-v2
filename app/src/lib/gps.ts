import { useCallback, useEffect, useRef, useState } from 'react';

export interface Posicion { lat: number | null; lng: number | null }

// calcularDistancia (tcontrol_core.js). Solo para mostrar "📍 Xm / 250m": la validación real es del servidor.
export function calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180;
  const df = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// iniciarGPS(): lectura inmediata y cada 60 s, con alta precisión (igual que el legado)
export function useGps(onError: (msg: string) => void) {
  const [pos, setPos] = useState<Posicion>({ lat: null, lng: null });
  const [activo, setActivo] = useState(false);
  const errRef = useRef(onError);
  errRef.current = onError;

  const leer = useCallback(() => {
    if (!navigator.geolocation) { errRef.current('Geolocalización no soportada'); return; }
    navigator.geolocation.getCurrentPosition(
      p => {
        setPos({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 });
        setActivo(true);
      },
      e => errRef.current(e.code === 1 ? 'Permiso de ubicación denegado. Activa el GPS para registrar asistencia' : 'Error al obtener ubicación'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  useEffect(() => {
    leer();
    const t = window.setInterval(leer, 60000);
    return () => clearInterval(t);
  }, [leer]);

  return { pos, activo, leer };
}
