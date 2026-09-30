import { useQuery, useQueryClient } from '@tanstack/react-query';
import { leer, rpc } from './api';
import { contextoSchema, type Contexto, type MenuDia, type Registro, type SaldoVacaciones, type Solicitud } from './tipos';
import { sincronizarReloj } from './reloj';

export const claves = {
  contexto: ['contexto'] as const,
  registros: (desde: string | null) => ['registros', desde] as const,
  faltantes: ['faltantes'] as const,
  menu: ['menu'] as const,
  solicitudes: (desde: string) => ['solicitudes', desde] as const,
  vacaciones: ['vacaciones'] as const,
  taller: ['taller'] as const,
};

export function useContexto(habilitado = true) {
  return useQuery({
    queryKey: claves.contexto,
    enabled: habilitado,
    // cargarConfiguracionesSistema() se repetía cada 10 s (emergencias) en el legado
    refetchInterval: 10000,
    queryFn: async (): Promise<Contexto> => {
      const c = contextoSchema.parse(await rpc('mi_contexto'));
      sincronizarReloj(c.ahora);
      return c;
    },
  });
}

// Registros del empleado: por defecto desde el inicio del período; null = todo el historial
export function useRegistros(desde: string | null, habilitado = true) {
  return useQuery({
    queryKey: claves.registros(desde),
    enabled: habilitado,
    refetchInterval: 60000,
    // SETOF jsonb: según la versión, PostgREST devuelve el objeto o { mis_registros: objeto }
    queryFn: async () => (await rpc<(Registro | { mis_registros: Registro })[]>('mis_registros', desde ? { p_desde: desde } : {}))
      .map(x => ('mis_registros' in x ? x.mis_registros : x)),
  });
}

export function useDiasFaltantes(habilitado = true) {
  return useQuery({
    queryKey: claves.faltantes,
    enabled: habilitado,
    queryFn: async () => (await rpc<string[] | { mis_dias_faltantes: string }[]>('mis_dias_faltantes'))
      .map(x => (typeof x === 'string' ? x : x.mis_dias_faltantes)),
  });
}

export function useMenuSemanal() {
  return useQuery({
    queryKey: claves.menu,
    queryFn: async () => {
      const filas = await leer<MenuDia[]>('menu_semanal');
      return Object.fromEntries(filas.map(f => [f.dia, f])) as Record<string, MenuDia>;
    },
  });
}

export function useMisSolicitudes(empleadoId: string, desde: string) {
  return useQuery({
    queryKey: claves.solicitudes(desde),
    queryFn: () => leer<Solicitud[]>(`solicitudes_invitados?empleado_id=eq.${encodeURIComponent(empleadoId)}&fecha=gte.${desde}&order=fecha.asc,hora.desc`),
  });
}

export function useVacaciones(empleadoId: string) {
  return useQuery({
    queryKey: claves.vacaciones,
    queryFn: async () => (await leer<SaldoVacaciones[]>(`vacaciones_saldo?empleado_id=eq.${encodeURIComponent(empleadoId)}`))[0] || null,
  });
}

export function useRefrescar() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ['registros'] }),
    qc.invalidateQueries({ queryKey: claves.contexto }),
    qc.invalidateQueries({ queryKey: claves.faltantes }),
    qc.invalidateQueries({ queryKey: claves.vacaciones }),
  ]);
}
