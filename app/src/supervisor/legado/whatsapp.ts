// Notificaciones WhatsApp: plantillas por defecto, formateo de mensajes y clasificación de destinatarios
// portados de JS/openwa_service.js y JS/supervisor/supervisor_whatsapp.js. El envío lo hace el worker.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { partes } from '../../lib/reloj';
import { obtenerPrimerNombreYPrimerApellido } from './personas';
import { Emp, esEmpleadoExcluidoAsistencia, getLocalHoyStr } from './util';

export const PLANTILLAS_DEFECTO: Record<string, string> = {
  no_registro: "🔔 *NOTIFICACIÓN DE ASISTENCIA — TCONTROL*\n\nEstimado/a *{nombre}*,\n\nTe informamos que al momento (*{hora}* del {fecha}) no registras marcación de ingreso en el sistema de Asistencia Tcontrol.\n\n⚠️ *Por favor:* Si ya te encuentras en tu jornada laboral, recuerda registrar tu asistencia en la aplicación móvil o comunicarte con tu supervisor / RRHH para justificar la novedad.\n\n📱 *App de Asistencia:* {link}\n_Este es un mensaje automático de control y seguimiento._\n🔒 _Aviso Legal: Mensaje emitido por TCONTROL S.A. en cumplimiento de la LOPDP exclusivamente para fines de control laboral._",
  ausente: "📋 *AVISO DE AUSENCIA LABORAL — TCONTROL*\n\nEstimado/a *{nombre}*,\n\nSe ha registrado tu *AUSENCIA* en la jornada laboral del día de hoy (*{fecha}*).\n\n📌 *Acción requerida:* Por favor presenta el justificativo respectivo (médico, calamidad o permiso personal) a tu supervisor o mediante la aplicación de Asistencia en el transcurso del día.\n\n📱 *App de Asistencia:* {link}\n_Departamento de Talento Humano / Operaciones Tcontrol._\n🔒 _Aviso Legal: Comunicación confidencial amparada por la LOPDP (Ecuador) para fines de gestión laboral._",
  vacaciones: "🏖️ *REGISTRO DE VACACIONES — TCONTROL*\n\nEstimado/a *{nombre}*,\n\nTe recordamos que te encuentras gozando de tu período oficial de *VACACIONES* para el día de hoy (*{fecha}*).\n\n¡Deseamos que disfrutes de tu descanso!\n\n_Departamento de Talento Humano T-Control._\n🔒 _Aviso Legal: Notificación institucional emitida bajo la LOPDP._",
  permisos: "📝 *REGISTRO DE PERMISO / LICENCIA — TCONTROL*\n\nEstimado/a *{nombre}*,\n\nTe informamos que se encuentra registrado tu *PERMISO LABORAL* ({razon}) para la jornada del día de hoy (*{fecha}*).\n\nSi tienes alguna duda o novedad sobre tu itinerario, por favor comunícate con tu supervisor.\n\n_Control de Asistencia T-Control._\n🔒 _Aviso Legal: Comunicación confidencial de gestión laboral bajo la LOPDP._",
  salida_faltante: "🚪 *RECORDATORIO DE REGISTRO DE SALIDA — TCONTROL*\n\nEstimado/a *{nombre}*,\n\nDetectamos que registraste tu ingreso hoy ({fecha}), pero aún *no has registrado tu marcación de salida*.\n\n⏰ *Recordatorio:* Recuerda marcar tu salida en la app antes de retirarte para que tus horas laboradas queden registradas correctamente.\n\n📱 *App de Asistencia:* {link}\n_Control de Asistencia Tcontrol._\n🔒 _Aviso Legal: Mensaje institucional emitido conforme a la LOPDP para control de jornada de trabajo._",
  emergencia: "🚨 *ALERTA GENERAL DE SEGURIDAD — TCONTROL*\n\nEstimado/a *{nombre}*,\n\nSe ha activado una alerta operativa / simulacro de emergencia en la plataforma.\n\n⚠️ *Instrucción Inmediata:* Por favor ingresa a la aplicación de Asistencia y pulsa el botón *🚨 Reportar mi Estado* para confirmar tu ubicación y seguridad.\n\n📱 *Confirmar Estado:* {link}\n_Comité de Seguridad y Operaciones Tcontrol._\n🔒 _Aviso Legal: Comunicación prioritaria de seguridad física y laboral bajo la LOPDP._",
};

// Textos de "Restablecer Plantilla" (restablecerConfiguracionWhatsApp: sin el aviso legal)
export const PLANTILLAS_RESTABLECER: Record<string, string> = {
  no_registro: "🔔 *NOTIFICACIÓN DE ASISTENCIA — TCONTROL*\n\nEstimado/a *{nombre}*,\n\nTe informamos que al momento (*{hora}* del {fecha}) no registras marcación de ingreso en el sistema de Asistencia Tcontrol.\n\n⚠️ *Por favor:* Si ya te encuentras en tu jornada laboral, recuerda registrar tu asistencia en la aplicación móvil o comunicarte con tu supervisor / RRHH para justificar la novedad.\n\n📱 *App de Asistencia:* {link}\n_Este es un mensaje automático de control y seguimiento._",
  ausente: "📋 *AVISO DE AUSENCIA LABORAL — TCONTROL*\n\nEstimado/a *{nombre}*,\n\nSe ha registrado tu *AUSENCIA* en la jornada laboral del día de hoy (*{fecha}*).\n\n📌 *Acción requerida:* Por favor presenta el justificativo respectivo (médico, calamidad o permiso personal) a tu supervisor o mediante la aplicación de Asistencia en el transcurso del día.\n\n📱 *App de Asistencia:* {link}\n_Departamento de Talento Humano / Operaciones Tcontrol._",
  salida_faltante: "🚪 *RECORDATORIO DE REGISTRO DE SALIDA — TCONTROL*\n\nEstimado/a *{nombre}*,\n\nDetectamos que registraste tu ingreso hoy ({fecha}), pero aún *no has registrado tu marcación de salida*.\n\n⏰ *Recordatorio:* Recuerda marcar tu salida en la app antes de retirarte para que tus horas laboradas queden registradas correctamente.\n\n📱 *App de Asistencia:* {link}\n_Control de Asistencia Tcontrol._",
  emergencia: "🚨 *ALERTA GENERAL DE SEGURIDAD — TCONTROL*\n\nEstimado/a *{nombre}*,\n\nSe ha activado una alerta operativa / simulacro de emergencia en la plataforma.\n\n⚠️ *Instrucción Inmediata:* Por favor ingresa a la aplicación de Asistencia y pulsa el botón *🚨 Reportar mi Estado* para confirmar tu ubicación y seguridad.\n\n📱 *Confirmar Estado:* {link}\n_Comité de Seguridad y Operaciones Tcontrol._",
};

export interface PlantillaWA { nombre: string; texto: string; imagen: string | null; personalizada: boolean }
export interface ConfigWA { servidorUrl: string; activo: boolean; autoEnvioNoRegistro: boolean; horaCorteNoRegistro: string; diasEnvio: number[]; enlaceApp: string }

export function resolverTipoPlantilla(tipoRaw: string, activa = 'no_registro'): string {
  if (!tipoRaw) return 'no_registro';
  const t = String(tipoRaw).toLowerCase().trim();
  if (['sin_marcar', 'no_registro', 'entrada_faltante', 'entrada'].includes(t)) return 'no_registro';
  if (t === 'vacaciones' || t === 'vacacion') return 'vacaciones';
  if (t === 'permisos' || t === 'permiso') return 'permisos';
  if (t === 'ausente' || t === 'ausencia' || t === 'ausencia_laboral') return 'ausente';
  if (t === 'salida' || t === 'salida_faltante') return 'salida_faltante';
  if (t === 'emergencia' || t === 'alerta_emergencia') return 'emergencia';
  if (t === 'plantilla_activa') return activa;
  return tipoRaw;
}

// normalizarNumeroParaWhatsApp
export function normalizarNumero(numeroRaw: unknown): string {
  if (!numeroRaw) return '';
  let num = String(numeroRaw).trim().replace(/[^\d]/g, '');
  if (!num) return '';
  if (num.startsWith('09') && num.length === 10) num = '593' + num.substring(1);
  else if (num.startsWith('9') && num.length === 9) num = '593' + num;
  else if (num.startsWith('59309') && num.length === 13) num = '593' + num.substring(5);
  return num.length >= 9 ? num : '';
}

const dos = (n: number) => String(n).padStart(2, '0');
export function fechaHoraAhora() {
  const p = partes();
  return { fecha: `${dos(p.dia)}/${dos(p.mes)}/${p.anio}`, hora: `${dos(p.hora)}:${dos(p.minuto)}` };
}

export function textoPlantilla(plantillas: Record<string, PlantillaWA>, tipo: string): string {
  return plantillas[tipo]?.texto || PLANTILLAS_DEFECTO[tipo] || '';
}

// formatearMensaje
export function formatearMensaje(plantillas: Record<string, PlantillaWA>, config: ConfigWA | null, tipoRaw: string, empleado: any = null, extras: any = {}): string {
  const tipo = resolverTipoPlantilla(tipoRaw);
  let plantilla: string;
  if (tipo === 'ausente') {
    plantilla = empleado?._esVacaciones ? textoPlantilla(plantillas, 'vacaciones') : empleado?._esPermiso ? textoPlantilla(plantillas, 'permisos') : textoPlantilla(plantillas, 'ausente');
  } else if (tipo.startsWith('custom_')) plantilla = plantillas[tipo]?.texto || extras.plantillaCustom || '';
  else plantilla = textoPlantilla(plantillas, PLANTILLAS_DEFECTO[tipo] ? tipo : 'no_registro');
  const ahora = fechaHoraAhora();
  const nombre = obtenerPrimerNombreYPrimerApellido(empleado?.nombre || extras.nombre || 'Colaborador');
  return plantilla
    .replace(/\{nombre\}/gi, nombre)
    .replace(/\{fecha\}/gi, extras.fecha || ahora.fecha)
    .replace(/\{hora\}/gi, extras.hora || ahora.hora)
    .replace(/\{link\}/gi, config?.enlaceApp || 'https://tcontrol.ec/asistencia')
    .replace(/\{cargo\}/gi, empleado?.cargo || extras.cargo || 'Personal')
    .replace(/\{area\}/gi, empleado?.area || extras.area || 'Operaciones')
    .replace(/\{razon\}/gi, extras.razon || empleado?._razonAusencia || 'autorizado');
}

// generarMensajePruebaTexto
export function mensajePrueba(tipo: string, enlace: string, plantillaActiva: string): string {
  const { fecha, hora } = fechaHoraAhora();
  switch (tipo) {
    case 'ENTRADA_FALTANTE':
      return `🔔 *RECORDATORIO DE ASISTENCIA - TCONTROL*\nHola *Carlos Mendoza*, te recordamos que hoy ${fecha} a las ${hora} no registras marcación de entrada en planta.\n\nPor favor registra tu asistencia o notifica a tu supervisor:\n📲 ${enlace}`;
    case 'AUSENCIA_LABORAL':
      return `📋 *NOTIFICACIÓN DE AUSENCIA - TALENTO HUMANO*\nEstimado(a) *Carlos Mendoza*, al momento registras una ausencia en tu jornada laboral de hoy ${fecha}.\n\nFavor justificar con certificado médico o permiso autorizado a la brevedad posible.`;
    case 'SALIDA_FALTANTE':
      return `🚪 *RECORDATORIO DE SALIDA - TCONTROL*\nEstimado(a) *Carlos Mendoza*, ha finalizado el horario de tu jornada laboral de hoy ${fecha}.\n\nRecuerda marcar tu salida en la app para el cómputo correcto de horas laboradas:\n📲 ${enlace}`;
    case 'ALERTA_EMERGENCIA':
      return `🚨 *COMUNICADO DE SEGURIDAD INDUSTRIAL - TCONTROL*\nSe informa a todo el personal en planta y campo que a las 14:00 se llevará a cabo una prueba de alarmas y simulacro de evacuación.\n\nFavor seguir las instrucciones de los brigadistas designados.`;
    case 'PING_RAPIDO':
      return `⚡ *TEST DE CONEXIÓN OPENWA - TCONTROL*\nVerificación de canal de notificaciones WhatsApp operativo.\n⏰ Fecha y hora: ${fecha} ${hora}\nEstado: OK ✅`;
    case 'PLANTILLA_ACTIVA':
      if (plantillaActiva.trim()) {
        return plantillaActiva.replace(/\{colaborador\}/gi, 'Carlos Mendoza').replace(/\{empresa\}/gi, 'Tcontrol S.A.')
          .replace(/\{fecha\}/gi, fecha).replace(/\{hora\}/gi, hora).replace(/\{enlace_app\}/gi, enlace);
      }
      return 'Hola *Carlos Mendoza*, este es un mensaje de prueba de la plantilla activa de Tcontrol.';
    default:
      return `👋 Hola! Este es un mensaje de prueba enviado desde el sistema de Control de Asistencia Tcontrol (${fecha} ${hora}).`;
  }
}

// aplicarPlantillaWaIndividual
export function mensajeIndividual(tipo: string, nombreCompleto: string): string {
  const nombre = obtenerPrimerNombreYPrimerApellido(nombreCompleto || 'Colaborador');
  const { fecha } = fechaHoraAhora();
  switch (tipo) {
    case 'entrada': return `Hola ${nombre}, te recordamos registrar tu marcación de *ENTRADA* en el sistema de asistencia T-Control correspondiente al día de hoy ${fecha}. ¡Que tengas una excelente jornada! ⏰`;
    case 'salida': return `Hola ${nombre}, por favor no olvides registrar tu marcación de *SALIDA* al finalizar tus actividades de hoy ${fecha}. ¡Buen descanso! 🚪`;
    case 'ausencia': return `Estimado(a) ${nombre}, te saludamos de T-Control. Notamos que no registras marcación el día de hoy ${fecha}. Por favor indícanos si tienes alguna novedad, justificación o permiso médico pendiente. 🩺`;
    case 'saludo': return `Hola ${nombre}, te saluda la administración de T-Control. ¿Cómo estás? Te contactamos referente a tu registro de asistencia laboral. 👋`;
    case 'cumple': return `¡Estimado(a) ${nombre}, te deseamos un muy Feliz Cumpleaños! 🎂🎉 De parte de todo el equipo de T-Control te enviamos un afectuoso saludo y los mejores deseos en tu día especial. ¡Que disfrutes al máximo! ✨`;
    case 'regularizacion': return `Estimado(a) ${nombre}, le saludamos de Supervisión T-Control. Le recordamos que mantiene pendiente la regularización de su asistencia de una fecha dentro del período actual. Por favor remita su justificativo médico o laboral correspondiente a la brevedad. ¡Muchas gracias! 📋`;
    default: return '';
  }
}

export type CategoriaWA = 'sin_marcar' | 'vacaciones' | 'permisos' | 'ausente' | 'salida_faltante' | 'emergencia';

// cambiarCategoriaModalWhatsApp: clasificación de cada colaborador activo según su condición de hoy
export function clasificarDestinatarios(empCache: Emp[]) {
  const hoy = getLocalHoyStr();
  const act = (e: any) => e.estado === 'ACTIVO' || e.activo === 'SI' || e.activo === true || String(e.activo || '').toUpperCase() === 'SI';
  const enr: any[] = empCache.filter(e => act(e) && !esEmpleadoExcluidoAsistencia(e) && (e.cargo || '').toUpperCase() !== 'SIN ASISTENCIA').map(e => {
    const fReg = (e.registros || []).find(r => { const t = String(r.tipo || '').toUpperCase(); return !['ENTRADA', 'SALIDA', 'ESTADO', 'SOLO_ALMUERZO'].includes(t) && r.fecha === hoy; });
    const rHoy = fReg ? String(fReg.razon_ausencia || fReg.razon_permiso || fReg.razon_justificac || '') : '';
    const rU = rHoy.toUpperCase();
    const regCampo = (e.registros || []).some(r => r.modo === 'CAMPO' && r.fecha === hoy);
    const esVac = rU.includes('VACACI') || String(e.estado || '').toUpperCase() === 'VACACIONES';
    const esCampo = rU.includes('CAMPO') || String(e.modo || '').toUpperCase().includes('CAMPO') || regCampo;
    const esPerm = !esVac && !esCampo && rU.length > 0;
    return { ...e, _esVacaciones: esVac, _esCampo: esCampo, _esPermiso: esPerm, _esSinMarcar: !e.entradaHoy && !esVac && !esCampo && !esPerm,
      _esSalidaFaltante: !!(e.entradaHoy && !e.salidaHoy), _razonAusencia: rHoy };
  });
  const listas: Record<CategoriaWA, any[]> = {
    sin_marcar: enr.filter(e => e._esSinMarcar), vacaciones: enr.filter(e => e._esVacaciones), permisos: enr.filter(e => e._esPermiso),
    ausente: enr.filter(e => !e.entradaHoy && !e._esCampo), salida_faltante: enr.filter(e => e._esSalidaFaltante), emergencia: [...enr],
  };
  return listas;
}

export const TITULOS_CATEGORIA: Record<CategoriaWA, string> = {
  sin_marcar: 'Notificar Colaboradores Sin Marcar (Injustificados)', vacaciones: 'Notificar Colaboradores en Vacaciones',
  permisos: 'Notificar Colaboradores con Permiso / Justificativo', ausente: 'Notificar a Todos los Ausentes',
  salida_faltante: 'Recordatorio de Marcación de Salida', emergencia: 'Alerta Operativa y de Seguridad',
};
export const SUBTITULOS_CATEGORIA: Record<CategoriaWA, string> = {
  sin_marcar: 'Colaboradores sin marcación que NO tienen registradas vacaciones ni permisos autorizados',
  vacaciones: 'Colaboradores que se encuentran en su período oficial de vacaciones el día de hoy',
  permisos: 'Colaboradores con permiso, licencia o justificación médica/personal registrada para hoy',
  ausente: 'Listado consolidado de todos los ausentes con el motivo de ausencia correspondiente',
  salida_faltante: 'Colaboradores que marcaron su entrada pero aún no registran su marcación de salida',
  emergencia: 'Envío masivo de alerta institucional o de seguridad a toda la nómina activa',
};

// Formato de WhatsApp (*negrita*, _cursiva_, ~tachado~) para la vista previa, sobre texto ya escapado
export function markdownWA(escapado: string): string {
  return escapado.replace(/\*(.*?)\*/g, '<strong>$1</strong>').replace(/_(.*?)_/g, '<em>$1</em>').replace(/~(.*?)~/g, '<del>$1</del>');
}
