import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Contexto, Empleado, Registro } from '../lib/tipos';
import { calcularDistancia, useGps, type Posicion } from '../lib/gps';
import { useUi } from '../ui/Ui';
import { calcularStatusActual, type StatusActual } from '../lib/estadisticas';
import { useRefrescar } from '../lib/datos';

export interface EstadoHoy {
  tieneEntrada: boolean; tieneSalida: boolean; entrada?: Registro; salida?: Registro; ultimo?: Registro;
  almuerzo: string | null; novedad?: Registro; status: StatusActual;
}

interface Api {
  ctx: Contexto; emp: Empleado; registros: Registro[]; cargandoRegistros: boolean; hoy: EstadoHoy;
  modo: 'OFICINA' | 'CAMPO'; setModo: (m: 'OFICINA' | 'CAMPO') => void;
  pos: Posicion; gpsActivo: boolean; leerGps: () => void;
  distancia: () => { distancia: number | null; radio: number; dentro: boolean; msgError: string };
  refrescar: () => Promise<unknown>;
  passwordReciente: string | null;
}

const Ctx = createContext<Api | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('EstadoApp faltante');
  return c;
};

const MARCAS = ['ENTRADA', 'SALIDA', 'ENTRADA_CAMPO', 'SALIDA_CAMPO', 'RETORNO_CAMPO', 'SOLO_ALMUERZO'];

export function calcularEstadoHoy(registros: Registro[], fecha: string): EstadoHoy {
  const deHoy = registros.filter(r => r.fecha === fecha);
  const marcas = deHoy.filter(r => MARCAS.includes(r.tipo)).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const entrada = marcas.find(r => r.tipo === 'ENTRADA' || r.tipo === 'SOLO_ALMUERZO');
  const salidas = marcas.filter(r => r.tipo === 'SALIDA');
  const novedad = deHoy.find(r => !MARCAS.includes(r.tipo));
  return {
    tieneEntrada: !!marcas.find(r => r.tipo === 'ENTRADA'),
    tieneSalida: salidas.length > 0,
    entrada, salida: salidas[salidas.length - 1], ultimo: marcas[marcas.length - 1],
    almuerzo: entrada?.almuerzo || null,
    novedad,
    status: calcularStatusActual(deHoy, fecha),
  };
}

export function EstadoAppProvider({ ctx, registros, cargandoRegistros, passwordReciente, children }:
  { ctx: Contexto; registros: Registro[]; cargandoRegistros: boolean; passwordReciente: string | null; children: ReactNode }) {
  const ui = useUi();
  const [modo, setModo] = useState<'OFICINA' | 'CAMPO'>('OFICINA');
  const { pos, activo, leer } = useGps(msg => ui.toast(msg, 'error'));
  const refrescar = useRefrescar();
  const hoy = useMemo(() => calcularEstadoHoy(registros, ctx.fecha), [registros, ctx.fecha]);

  const api: Api = {
    ctx, emp: ctx.empleado, registros, cargandoRegistros, hoy, modo, setModo, pos, gpsActivo: activo, leerGps: leer, refrescar, passwordReciente,
    // verificarDistanciaEmpresa: solo indicativo; el servidor valida de nuevo al marcar
    distancia: () => {
      const campo = modo === 'CAMPO';
      const radio = campo ? (ctx.empleado.base_radio_m || 300) : ctx.ubicacion.radio;
      if (pos.lat === null || pos.lng === null) return { distancia: null, radio, dentro: false, msgError: '' };
      if (campo && (ctx.empleado.base_lat === null || ctx.empleado.base_lng === null)) return { distancia: null, radio, dentro: false, msgError: 'sin_base' };
      const lat = campo ? ctx.empleado.base_lat! : ctx.ubicacion.lat;
      const lng = campo ? ctx.empleado.base_lng! : ctx.ubicacion.lng;
      const d = calcularDistancia(pos.lat, pos.lng, lat, lng);
      return { distancia: d, radio, dentro: d <= radio, msgError: campo ? 'Fuera del área del proyecto' : 'Fuera del área de la empresa' };
    },
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
