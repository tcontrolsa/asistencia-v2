// Datos del reporte (cargarReportes) calculados una vez por cambio de datos o de filtros; los comparten
// el Resumen Mensual del Dashboard y el Reporte Interactivo.
import { useMemo } from 'react';
import { StatReporte, calcularStatsReportes, obtenerListaEmpleadosReportes, sumar } from '../legado/reportes';
import { getLocalHoyStr, obtenerAlmuerzosExtraConsolidados } from '../legado/util';
import { Rango, obtenerRango, useFiltrosRep } from '../reportesEstado';
import { useSup } from '../store';

export interface DatosReporte { rango: Rango; stats: StatReporte[]; extras: ReturnType<typeof obtenerAlmuerzosExtraConsolidados>; totalAlmExt: number }

export function useDatosReporte(): DatosReporte {
  const f = useFiltrosRep();
  const empCache = useSup(x => x.empCache);
  const empEliminados = useSup(x => x.empEliminados);
  const solicitudes = useSup(x => x.solicitudesInvitados);
  const version = useSup(x => x.version);
  const periodos = useSup(x => x.periodos);
  return useMemo(() => {
    const rango = obtenerRango(f);
    const lista = obtenerListaEmpleadosReportes(empCache, empEliminados, f.incluirDesv, f.incluirElim, f.cargo);
    const stats = calcularStatsReportes(lista, rango.R_INI, rango.R_FIN, getLocalHoyStr());
    const extras = obtenerAlmuerzosExtraConsolidados(solicitudes, rango.R_INI, rango.R_FIN);
    const totalAlmExt = extras.reduce((acc, ae) => acc + (parseInt(String(ae.cantidad), 10) || 1), 0);
    return { rango, stats, extras, totalAlmExt };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.periodoIdx, f.ini, f.fin, f.fechaDash, f.incluirDesv, f.incluirElim, f.cargo, empCache, empEliminados, solicitudes, version, periodos]);
}

export { sumar };
