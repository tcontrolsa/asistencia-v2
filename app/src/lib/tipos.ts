import { z } from 'zod';

// Respuestas del servidor validadas con zod (formularios y contratos de API).
export const empleadoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  area: z.string().nullable(),
  cargo: z.string().nullable(),
  cedula: z.string().nullable(),
  telefono: z.string().nullable(),
  fecha_nacimiento: z.string().nullable(),
  foto_url: z.string().nullable(),
  base_lat: z.number().nullable(),
  base_lng: z.number().nullable(),
  base_radio_m: z.number().nullable(),
  url_rol_pagos: z.string().nullable(),
  rol: z.string(),
  es_pasante: z.boolean(),
  tipo_asistencia: z.string(),
  puede_autorizar_extras: z.boolean(),
  cultura_habilitada: z.boolean(),
  es_supervisor: z.boolean(),
  es_admin: z.boolean(),
});
export type Empleado = z.infer<typeof empleadoSchema>;

export const contextoSchema = z.object({
  empleado: empleadoSchema,
  ahora: z.string(),
  fecha: z.string(),
  tipo_dia: z.string(),
  horario: z.object({ entrada: z.string(), salida: z.string(), tolerancia_min: z.number(), limite_justificacion: z.string(), umbral_extra_min: z.number() }),
  ubicacion: z.object({ lat: z.number(), lng: z.number(), radio: z.number() }),
  almuerzo: z.object({ hora_limite: z.string(), activo: z.boolean() }),
  invitados: z.object({ corte_almuerzo_extra: z.string(), corte_sanduche: z.string() }),
  app: z.object({
    campo_distancia_minima_m: z.number(), faltas_dias_atras: z.number(),
    almuerzo_popup_desde: z.string(), almuerzo_popup_hasta: z.string(), salida_confirmar_almuerzo_hasta: z.string(),
  }),
  soporte: z.object({ whatsapp_number: z.string().nullable(), mensaje: z.string().nullable() }),
  forzar_actualizacion: z.union([z.number(), z.string()]).nullable(),
  cultura_habilitada: z.boolean(),
  emergencia: z.object({ activa: z.boolean(), nombre: z.string().nullable(), id: z.number().optional() }),
  periodo: z.object({ inicio: z.string(), fin: z.string() }),
});
export type Contexto = z.infer<typeof contextoSchema>;

// Registro en el formato que usan las pantallas del legado (api.mis_registros)
export interface Registro {
  id: string;
  fecha: string;
  hora: string;
  timestamp: string;
  tipo: string;
  almuerzo: string;
  modo: string;
  horasExtra: string;
  autoriza?: string | null;
  tipo_salida: string;
  razon_salida: string;
  razon_entrada_tardia: string;
  quien_justifica: string;
  razon_permiso: string;
  razon_ausencia: string;
  razon_justificac?: string;
  justificado: string;
  estado?: string | null;
  minutos_atraso: number;
  permiso_personal_mins: number;
  permiso_medico_mins: number;
  tiempo_justificado_mins: number;
}

export interface Solicitud {
  id: string; fecha: string; hora: string | null; tipo_solicitud: string; subtipo: string; cantidad: number;
  invitado: string | null; empresa: string | null; hora_servicio: string | null; estado: string;
}

export interface MenuDia { dia: string; sopa: string | null; plato: string | null; jugo: string | null }

export interface SaldoVacaciones { tomadas: number; restantes: number; adjudicadas: number | null; total: number }

// Formularios
export const telefonoSchema = z.string().trim().min(1, 'El teléfono es obligatorio')
  .refine(v => v.replace(/\D/g, '').length >= 8, 'Por favor ingresa un número de teléfono válido');
