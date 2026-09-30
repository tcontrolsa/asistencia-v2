// Fase 5 (bloque A): datos del panel de supervisor y gestión de jornada (reloj simulado: miércoles 2026-09-30).
const FECHA = '2026-09-30';

async function como(c, rol, claims, sql, params = [], hora = '10:00') {
  await c.query('SAVEPOINT p');
  try {
    await c.query(`SELECT set_config('app.permitir_reloj_simulado', 'on', true), set_config('app.ahora', $1, true),
                          set_config('request.jwt.claims', $2, true)`, [`${FECHA} ${hora}`, JSON.stringify({ role: rol, ...claims })]);
    await c.query(`SET LOCAL ROLE ${rol}`);
    const r = await c.query(sql, params);
    await c.query('RELEASE SAVEPOINT p');
    await c.query('RESET ROLE');
    return { filas: r.rows, v: r.rows[0] && Object.values(r.rows[0])[0] };
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT p');
    await c.query('RESET ROLE');
    return { error: e.message, codigo: e.code };
  }
}

export default async function (c, t) {
  await c.query(`SET LOCAL app.etl = 'on'`);
  await c.query(`INSERT INTO core.empleados (id, nombre, area, cargo, rol, fecha_ingreso) VALUES
    ('S_A','ANA SUPER','TI','ANALISTA','EMPLEADO','2025-01-01'), ('S_S','SARA SUP','TI','JEFA','SUPERVISOR','2020-01-01'),
    ('S_M','MARIO ADMIN','TI','JEFE','SUPERVISOR_ADMIN','2020-01-01')`);
  await c.query(`INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, almuerzo, origen, legacy_raw, motivo_entrada_tardia) VALUES
    ('S_A','ENTRADA','2026-09-29','08:10',true,'APP',NULL,'Tráfico'),
    ('S_A','SALIDA','2026-09-29','16:15',NULL,'APP',NULL,NULL)`);
  await c.query(`INSERT INTO core.novedades (empleado_id, fecha, tipo, justificado, motivo, origen) VALUES
    ('S_A','2026-09-28','TRABAJO_DE_CAMPO','PENDIENTE','Reporte fuera de área','APP')`);
  await c.query(`SET LOCAL app.etl = 'off'`);
  const sup = { usuario: 'S_S', empleado_id: 'S_S' };
  const adm = { usuario: 'S_M', empleado_id: 'S_M' };
  const emp = { usuario: 'S_A', empleado_id: 'S_A' };
  const regs = async () => (await como(c, 'supervisor', sup, `SELECT api.sup_registros('2026-09-26','2026-10-05','S_A') v`)).v;

  let r = await como(c, 'empleado', emp, `SELECT api.sup_datos() v`);
  t.ok(r.codigo === '42501', 'un empleado no lee los datos del panel');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_datos('2026-09-26') v`);
  const ficha = r.v?.empleados.find(e => e.id === 'S_A');
  t.ok(ficha && ficha.activo === 'SI' && ficha.supervisor === 'NO', 'el panel recibe las fichas con los campos del legado');
  t.ok(r.v.empleados.find(e => e.id === 'S_M').supervisor === 'SUPERVISOR ADMIN', 'rol de supervisor con el valor del legado');

  let lista = await regs();
  const ent = lista.find(x => x.tipo === 'ENTRADA');
  t.ok(ent && ent.hora === '08:10:00' && ent.almuerzo === 'SI' && ent.horasExtra === 'NO', 'marcación con la forma del legado');
  t.ok(!ent.razon_entrada_tardia && ent.motivo_entrada_empleado === 'Tráfico', 'el motivo del colaborador se muestra pero no justifica (D-24)');
  const pend = lista.find(x => x.fecha === '2026-09-28');
  t.ok(pend && pend.tipo === 'ESTADO' && pend.pendiente_aprobacion === true && !pend.razon_ausencia,
       'reporte fuera de área pendiente: no justifica el día (D-08)');

  // Gestión de jornada: horas + permiso parcial
  r = await como(c, 'supervisor', sup, `SELECT api.sup_guardar_jornada('S_A', '2026-09-29', '07:40:00', '16:15:00', 'EMPRESA', NULL, 10, 0, 0, 'SI', 'NO', 'Cita') v`);
  t.ok(r.v?.ok, 'el supervisor guarda la jornada del día');
  lista = await regs();
  const e29 = lista.find(x => x.fecha === '2026-09-29' && x.tipo === 'ENTRADA');
  t.ok(e29.hora === '07:40:00' && e29.tiempo_justificado_mins === 10 && e29.razon_permiso === 'Cita', 'hora editada y minutos en la ENTRADA del día');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_guardar_jornada('S_A', '2026-09-29', NULL, NULL, 'EMPRESA', NULL, 800) v`);
  t.ok(/720/.test(r.error || ''), 'un permiso no puede superar 720 minutos');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_guardar_jornada('S_A', '2026-09-29') v`);
  t.ok(/Ingrese horas/.test(r.error || ''), 'sin horas, razón ni minutos no se guarda');

  // Ausencia de día completo reemplaza las marcaciones
  r = await como(c, 'supervisor', sup, `SELECT api.sup_guardar_jornada('S_A', '2026-09-29', NULL, NULL, 'EMPRESA', 'Permiso Médico') v`);
  lista = await regs();
  const d29 = lista.filter(x => x.fecha === '2026-09-29');
  t.ok(r.v?.tipo === 'PERMISO_MEDICO' && d29.length === 1 && d29[0].razon_ausencia === 'Permiso Médico' && d29[0].justificado === 'SI',
       'ausencia de día completo: una novedad justificada, sin marcaciones');

  // Registro manual con horas extra automáticas (R-12)
  r = await como(c, 'supervisor', sup, `SELECT api.sup_registro_manual('S_A', '2026-09-29', '17:30:00', 'SALIDA') v`);
  const m = await c.query(`SELECT horas_extra, autoriza, origen, dispositivo FROM core.marcaciones WHERE id = $1`, [r.v?.id]);
  t.ok(m.rows[0]?.horas_extra === true && m.rows[0].origen === 'SUPERVISOR' && m.rows[0].dispositivo === 'MANUAL', 'registro manual con horas extra automáticas');

  // Eliminar el día
  r = await como(c, 'supervisor', sup, `SELECT api.sup_eliminar_dia('S_A', '2026-09-29') v`);
  lista = await regs();
  t.ok(r.v?.ok && !lista.some(x => x.fecha === '2026-09-29'), 'limpiar registros elimina marcaciones, novedad y minutos del día');

  // Razón de ausencia de hoy y almuerzo
  r = await como(c, 'supervisor', sup, `SELECT api.sup_guardar_ausencia('S_A', '${FECHA}', 'Cita en el banco') v`);
  t.ok(r.v?.tipo === 'JUSTIFICACION', 'una razón libre se guarda como justificación');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_cambiar_almuerzo('S_A', 'SI', '${FECHA}') v`);
  t.ok(/No hay registros/.test(r.error || ''), 'no se cambia el almuerzo de un día sin marcaciones');

  // Permisos por rol
  r = await como(c, 'supervisor', sup, `SELECT api.sup_editar_hora('S_A', '${FECHA}', 'ENTRADA', '07:30') v`);
  t.ok(r.codigo === '42501', 'editar horas desde el control diario es de Admin y Sup. Admin');
  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_editar_hora('S_A', '${FECHA}', 'ENTRADA', '07:30') v`);
  t.ok(r.v?.ok, 'el Sup. Admin edita (o crea) la hora de entrada');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_evento_futuro('S_A', '2026-10-01', '2026-10-05', 'VACACIONES') v`);
  t.ok(r.codigo === '42501', 'programar ausencias es de Admin y Sup. Admin');
  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_evento_futuro('S_A', '2026-10-01', '2026-10-05', 'VACACIONES', 'Viaje') v`);
  t.ok(r.v?.dias === 3, 'la ausencia programada omite sábado y domingo');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_actualizar_empleado('S_A', 'nombre', 'OTRO') v`);
  t.ok(/Administrador General/.test(r.error || ''), 'editar la ficha desde el detalle es del Administrador General');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_actualizar_empleado('S_A', 'cultura_habilitada', 'false') v`);
  const cu = await c.query(`SELECT cultura_habilitada FROM core.empleados WHERE id = 'S_A'`);
  t.ok(r.v?.ok && cu.rows[0].cultura_habilitada === false, 'el supervisor exonera de Cultura Tcontrol');

  // Trabajo en campo y pedido de invitados
  r = await como(c, 'supervisor', sup, `SELECT api.sup_trabajo_campo('S_A', '[{"fecha":"2026-10-06","entrada":"06:00","salida":"18:00"},{"fecha":"2026-10-07"}]'::jsonb, 'Central') v`);
  const campo = await c.query(`SELECT tipo, hora::text, modo, horas_extra, observacion FROM core.marcaciones WHERE empleado_id = 'S_A' AND fecha IN ('2026-10-06','2026-10-07') ORDER BY fecha, hora`);
  t.ok(r.v?.dias === 2 && campo.rows.length === 3 && campo.rows.every(x => x.modo === 'CAMPO' && x.horas_extra)
       && campo.rows[2].hora === '08:00:00' && campo.rows[0].observacion === '[Proyecto: Central] Trabajo en Campo',
       'trabajo en campo: entradas y salidas de campo con horas extra, 08:00 si no hay horario');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_crear_solicitud_invitado('ALMUERZO_EXTRA', '${FECHA}', 2, 'Visita') v`, [], '10:00');
  t.ok(/09:40/.test(r.error || ''), 'pedido para invitados de hoy respeta el corte de las 09:40');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_crear_solicitud_invitado('ALMUERZO_EXTRA', '2026-10-01', 2, 'Visita') v`);
  const inv = await c.query(`SELECT estado, creado_por, observaciones FROM core.solicitudes_invitados WHERE id = $1`, [r.v?.id]);
  t.ok(inv.rows[0]?.estado === 'SOLICITADO' && inv.rows[0].creado_por === 'SUPERVISOR' && /Creado por: ID: S_S - SARA SUP/.test(inv.rows[0].observaciones),
       'pedido para invitados con trazabilidad de quién lo creó');
}
