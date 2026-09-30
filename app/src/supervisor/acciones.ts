// Acciones de edición del panel (editarValorRegistro, cambiarEstadoAlmuerzo, guardarRazonAusencia*, …).
// Todas validan en el servidor; la interfaz se refresca con los datos que devuelve la base.
import { rpc } from '../lib/api';
import { getLocalHoyStr } from './legado/util';
import { cargarDatosCompletos, mostrarLoader, sup, tienePermisoAdmin } from './store';
import { errorTexto, mostrarToast } from './ui/comun';

export async function refrescarSilencioso() {
  try { await cargarDatosCompletos({ silencioso: true }); } catch { /* el aviso de error ya se mostró */ }
}

async function enSegundoPlano<T>(fn: () => Promise<T>, exito?: string): Promise<T | null> {
  sup.set({ bgSync: true });
  try {
    const r = await fn();
    if (exito) mostrarToast(exito, 'success');
    await refrescarSilencioso();
    return r;
  } catch (e) {
    mostrarToast(errorTexto(e), 'error');
    return null;
  } finally {
    sup.set({ bgSync: false });
  }
}

// Cambiar almuerzo del día (Sí / No)
export function cambiarEstadoAlmuerzo(id: string, estado: 'SI' | 'NO', fecha?: string) {
  return enSegundoPlano(() => rpc('sup_cambiar_almuerzo', { p_empleado_id: id, p_almuerzo: estado, p_fecha: fecha || getLocalHoyStr() }), 'Almuerzo actualizado');
}

// Razón de ausencia desde el control diario (siempre para hoy)
export function guardarRazonAusenciaGlobal(empleadoId: string, valorSeleccionado: string) {
  if (!valorSeleccionado) return;
  let razonFinal = valorSeleccionado;
  if (valorSeleccionado === 'Otro') {
    const otra = window.prompt('Ingrese la razón de la ausencia:');
    if (!otra) return;
    razonFinal = otra;
  }
  return enSegundoPlano(() => rpc('sup_guardar_ausencia', { p_empleado_id: empleadoId, p_fecha: getLocalHoyStr(), p_razon: razonFinal }), 'Razón de ausencia guardada');
}

// Edición rápida de hora, modo o autorización de extras (solo Admin y Sup. Admin)
export async function editarValorRegistro(empleadoId: string, tipo: string, campo: 'hora' | 'modo' | 'horasExtra', valorActual: string, fecha?: string) {
  if (!tienePermisoAdmin()) { mostrarToast('Solo Administradores y Supervisores Admin pueden realizar esta acción.', 'error'); return; }
  const targetFecha = fecha || getLocalHoyStr();
  let nuevoValor: string | null = null;
  if (campo === 'hora') {
    nuevoValor = window.prompt(`Editar HORA (${tipo}) para el empleado ${empleadoId} [${targetFecha}]:`, valorActual);
    if (nuevoValor === null || nuevoValor === '') return;
    if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/.test(nuevoValor)) { mostrarToast('Formato de hora inválido. Use HH:MM o HH:MM:SS', 'error'); return; }
    if (nuevoValor.split(':').length === 2) nuevoValor += ':00';
  } else if (campo === 'modo') {
    if (valorActual === 'CAMPO') nuevoValor = window.confirm('¿Cambiar MODO a OFICINA? (Aceptar para OFICINA, Cancelar para mantener CAMPO)') ? 'OFICINA' : 'CAMPO';
    else nuevoValor = window.confirm('¿Cambiar MODO a CAMPO? (Aceptar para CAMPO, Cancelar para mantener OFICINA)') ? 'CAMPO' : 'OFICINA';
    if (nuevoValor === valorActual || (nuevoValor === 'OFICINA' && ['EMPRESA', 'PLANTA', '-'].includes(valorActual))) return;
  } else {
    if (valorActual === 'SI') nuevoValor = window.confirm('¿Quitar la autorización de HORAS EXTRAS?') ? 'NO' : 'SI';
    else nuevoValor = window.confirm('¿Autorizar HORAS EXTRAS?') ? 'SI' : 'NO';
    if (nuevoValor === valorActual) return;
  }
  mostrarToast('Procesando edición...', 'info');
  const valor = nuevoValor;
  await enSegundoPlano(() => campo === 'hora'
    ? rpc('sup_editar_hora', { p_empleado_id: empleadoId, p_fecha: targetFecha, p_tipo: tipo, p_hora: valor })
    : rpc('sup_editar_dia', { p_empleado_id: empleadoId, p_fecha: targetFecha, p_campo: campo, p_valor: valor }), 'Registro actualizado');
}

// Resetear contraseña (opcionalmente asignar una temporal)
export async function resetearPasswordEmpleado(empleadoId: string, nombreEmpleado: string) {
  if (!empleadoId) return;
  const mensaje = '🔑 RESETEAR CONTRASEÑA DE ACCESO\n\n' + `Empleado: ${nombreEmpleado}\n` + `ID / Cédula: ${empleadoId}\n\n`
    + '¿Deseas resetear la contraseña para que el colaborador pueda crear una nueva o vincular su teléfono de nuevo?';
  if (!window.confirm(mensaje)) return;
  const nuevaClave = window.prompt(`(Opcional) Si deseas asignarle una contraseña manual a ${nombreEmpleado}, escríbela aquí:\n(Déjala vacía para que el empleado cree su propia clave al vincular)`);
  if (nuevaClave === null) return;
  mostrarLoader(true);
  try {
    await rpc('resetear_password', { p_empleado_id: empleadoId, p_password_temporal: nuevaClave.trim() || null });
    mostrarToast(nuevaClave.trim() === ''
      ? `✅ Se eliminó la contraseña de ${nombreEmpleado}. Ahora puede vincular su teléfono y crear una contraseña nueva.`
      : `✅ Contraseña manual asignada correctamente a ${nombreEmpleado}.`, 'success');
  } catch (e) {
    mostrarToast(errorTexto(e) || 'Error al resetear la contraseña', 'error');
  } finally {
    mostrarLoader(false);
  }
}
