// Fase 6: tareas programadas (reset de autorizaciones, autocompletar salidas, aviso "no registró entrada"),
// cola del worker (avisos por evento, reintentos, vencimiento), rol del worker y exportación a Google Sheets.
async function como(c, rol, claims, sql, params = []) {
  await c.query('SAVEPOINT p');
  try {
    if (claims) await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: rol, ...claims })]);
    await c.query(`SET LOCAL ROLE ${rol}`);
    const r = await c.query(sql, params);
    await c.query('RELEASE SAVEPOINT p');
    await c.query('RESET ROLE');
    return { v: r.rows[0] && Object.values(r.rows[0])[0] };
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT p');
    await c.query('RESET ROLE');
    return { error: e.message, codigo: e.code };
  }
}
const uno = async (c, sql, params = []) => (await c.query(sql, params)).rows[0];

export default async function (c, t) {
  // Las ejecuciones reales del worker en la base de desarrollo no deben interferir con las fechas de prueba
  await c.query(`DELETE FROM core.tareas_ejecuciones`);
  await c.query(`UPDATE core.cola_notificaciones SET estado = 'DESCARTADO' WHERE estado IN ('PENDIENTE', 'PROCESANDO')`);
  await c.query(`SET LOCAL app.etl = 'on'`);
  await c.query(`INSERT INTO core.empleados (id, nombre, area, cargo, rol, telefono, auth_extras) VALUES
    ('AT_E','PEREZ LOPEZ JUAN CARLOS','TALLER','SOLDADOR','EMPLEADO','0991111111', true),
    ('AT_S','SIN ASIST ANA','ADMINISTRACION','SIN ASISTENCIA','EMPLEADO',NULL, false),
    ('AT_N','MORA RUIZ LUIS','TI','ANALISTA','EMPLEADO','0992222222', false),
    ('AT_T','TAPIA SIN TEL','TI','ANALISTA','EMPLEADO',NULL, false),
    ('AT_V','VACA VACACIONES','TI','ANALISTA','EMPLEADO','0993333333', false),
    ('AT_A','ADMIN AVISOS','GERENCIA','JEFE','SUPERVISOR_ADMIN','0994444444', false)`);
  const ent = (id, f, h = '07:30') => c.query(`INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, ts_servidor)
    VALUES ($1, 'ENTRADA', $2::date, $3::time, ($2::date + $3::time) AT TIME ZONE 'America/Guayaquil')`, [id, f, h]);
  for (const f of ['2026-10-04', '2026-10-07', '2026-10-09', '2026-10-10', '2026-10-12']) await ent('AT_E', f);
  await ent('AT_S', '2026-10-07');
  // Salida automática de sábado mal puesta a las 16:15 con horas extra del sistema (regularizarSalidasFinDeSemana)
  await c.query(`INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, dispositivo, horas_extra, autoriza, quien_justifica) VALUES
    ('AT_E', 'ENTRADA', '2026-08-01', '07:00', NULL, true, 'SISTEMA (>45 min)', NULL),
    ('AT_E', 'SALIDA', '2026-08-01', '16:15', 'AUTO_COMPLETAR', true, 'SISTEMA (>45 min)', 'SISTEMA')`);
  await c.query(`SET LOCAL app.etl = 'off'`);

  t.ok((await uno(c, `SELECT private.nombre_corto('PEREZ LOPEZ JUAN CARLOS') a, private.nombre_corto('MORA LUIS') b, private.nombre_corto('') x`)).a === 'Juan Perez',
    'nombre corto (primer nombre y primer apellido)');

  // ── Tareas por hora ──
  let r = await uno(c, `SELECT private.worker_tareas('2026-10-12 00:01') v`);
  t.ok(r.v.length === 0, 'antes de 00:05 no corre ninguna tarea');
  r = await uno(c, `SELECT private.worker_tareas('2026-10-12 00:10') v`);
  t.ok(r.v.length === 1 && r.v[0].tarea === 'reset_autorizaciones'
       && (await uno(c, `SELECT auth_extras FROM core.empleados WHERE id = 'AT_E'`)).auth_extras === false,
    '00:05: autorizaciones de horas extra en NO');
  r = await uno(c, `SELECT private.worker_tareas('2026-10-12 00:31') v`);
  t.ok(r.v.length === 1 && r.v[0].tarea === 'autocompletar_salidas', '00:30: autocompletar salidas');
  const sal = Object.fromEntries((await c.query(`SELECT to_char(fecha, 'MM-DD') f, to_char(hora, 'HH24:MI') h, dispositivo, justificado::text j,
      quien_justifica q, razon_justificacion rj, origen::text o FROM core.marcaciones WHERE empleado_id = 'AT_E' AND tipo = 'SALIDA'`)).rows.map(x => [x.f, x]));
  t.ok(sal['10-07']?.h === '16:15' && sal['10-07'].dispositivo === 'AUTO_COMPLETAR' && sal['10-07'].j === 'NO'
       && sal['10-07'].q === 'SISTEMA' && sal['10-07'].rj === 'No registró salida' && sal['10-07'].o === 'SISTEMA',
    'día laborable: SALIDA 16:15 AUTO_COMPLETAR, no justificada, "No registró salida"');
  t.ok(sal['10-09']?.h === '15:15' && sal['10-10']?.h === '15:15', 'feriado y sábado: salida a las 15:15 (D-02)');
  t.ok(!sal['10-12'] && !sal['10-04'], 'no cierra el día de hoy ni días fuera de los últimos 7');
  t.ok(!(await uno(c, `SELECT 1 x FROM core.marcaciones WHERE empleado_id = 'AT_S' AND tipo = 'SALIDA'`)), 'cargo SIN ASISTENCIA excluido');
  const reg = (await c.query(`SELECT tipo, to_char(hora, 'HH24:MI') h, horas_extra, autoriza FROM core.marcaciones
                               WHERE empleado_id = 'AT_E' AND fecha = '2026-08-01' ORDER BY tipo`)).rows;
  t.ok(reg.find(x => x.tipo === 'SALIDA')?.h === '15:15' && reg.every(x => !x.horas_extra && x.autoriza === null),
    'regulariza salidas automáticas de fin de semana y quita las horas extra del sistema');
  r = await uno(c, `SELECT private.worker_tareas('2026-10-12 00:40') v`);
  t.ok(r.v.length === 0, 'cada tarea corre una sola vez por día');
  t.ok((await uno(c, `SELECT private.autocompletar_salidas('2026-10-12') v`)).v.insertadas === 0, 'autocompletar es idempotente');

  // ── Aviso automático "no registró entrada" ──
  await c.query(`INSERT INTO core.configuracion (clave, valor) VALUES ('whatsapp', '{"activo": true, "auto_envio_no_registro": true,
      "hora_corte_no_registro": "08:15", "dias_envio": [1,2,3,4,5]}') ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`);
  await c.query(`SET LOCAL app.etl = 'on'`);
  await ent('AT_V', '2026-10-01'); // dato irrelevante (otro día)
  await c.query(`INSERT INTO core.novedades (empleado_id, fecha, tipo, motivo) VALUES ('AT_V', '2026-10-12', 'VACACIONES', 'Vacaciones')`);
  await c.query(`SET LOCAL app.etl = 'off'`);
  r = await uno(c, `SELECT private.worker_tareas('2026-10-12 08:10') v`);
  t.ok(r.v.length === 0, 'antes de la hora de corte no se avisa');
  r = await uno(c, `SELECT private.worker_tareas('2026-10-12 08:20') v`);
  t.ok(r.v.length === 1 && r.v[0].tarea === 'aviso_no_registro', 'a la hora de corte corre el aviso');
  const msgs = Object.fromEntries((await c.query(`SELECT payload ->> 'empleadoId' id, payload ->> 'mensaje' m, payload ->> 'telefono' tel
      FROM core.cola_notificaciones WHERE tipo = 'WHATSAPP_MENSAJE' AND estado = 'PENDIENTE' AND payload ->> 'tipo' = 'no_registro'`)).rows.map(x => [x.id, x]));
  t.ok(msgs.AT_N?.tel === '593992222222' && msgs.AT_N.m.includes('Estimado/a *Luis Mora*') && msgs.AT_N.m.includes('(*08:20* del 12/10/2026)'),
    'mensaje con la plantilla no_registro, nombre corto, hora y fecha');
  t.ok(!msgs.AT_E && !msgs.AT_V && !msgs.AT_S, 'no avisa a quien marcó, a quien está de vacaciones ni a SIN ASISTENCIA');
  t.ok(!!(await uno(c, `SELECT 1 x FROM core.whatsapp_logs WHERE empleado_id = 'AT_T' AND estado = 'SIN_TELEFONO' AND origen = 'AUTOMATICO'`)),
    'sin teléfono: queda en la auditoría como SIN_TELEFONO');
  r = await uno(c, `SELECT private.worker_tareas('2026-10-17 09:00') v`);
  t.ok(!r.v.some(x => x.tarea === 'aviso_no_registro'), 'sábado fuera de los días configurados: sin aviso');

  // ── Eventos → mensajes, resultado, reintentos y vencimiento ──
  await c.query(`UPDATE core.cola_notificaciones SET estado = 'DESCARTADO' WHERE estado = 'PENDIENTE'`);
  await c.query(`SELECT private.encolar('SOLICITUD_INVITADO', '{"id":"INV_T","tipoSolicitud":"REFRIGERIO","subtipo":"REFRIGERIO_GALLETAS",
      "cantidad":3,"invitado":"Ing. Pérez","empresa":"ACME","fecha":"2026-10-12","horaServicio":"10:00","empleadoNombre":"MORA RUIZ LUIS","empleadoArea":"TI"}')`);
  await c.query(`SELECT private.encolar('NUEVO_EMPLEADO', '{"id":"AT_N","nombre":"MORA RUIZ LUIS","area":"TI","cargo":"ANALISTA","telefono":"593992222222","creado_por":"ADMIN AVISOS"}')`);
  await c.query(`INSERT INTO core.cola_notificaciones (tipo, payload, creado_en) VALUES ('CANCELACION_INVITADO', '{"invitado":"Viejo"}', now() - interval '13 hours')`);
  let tomados = (await uno(c, `SELECT private.worker_tomar(100) v`)).v;
  const aAdmin = tomados.filter(x => x.payload.telefono === '593994444444');
  t.ok(aAdmin.some(x => x.payload.mensaje.includes('Nueva Solicitud de Catering') && x.payload.mensaje.includes('🍪 Break con Galletas TCONTROL (x3)')
       && x.payload.mensaje.includes('• *Invitado:* Ing. Pérez · ACME')), 'solicitud de invitado → mensaje a Sup. Admin con el texto del legado');
  t.ok(aAdmin.some(x => x.payload.mensaje.includes('Nuevo Colaborador Registrado')), 'nuevo colaborador → aviso a supervisores');
  const bienv = tomados.find(x => x.payload.tipo === 'BIENVENIDA_NUEVO_EMPLEADO');
  t.ok(bienv?.payload.telefono === '593992222222' && bienv.payload.mensaje.includes('cédula') && !bienv.payload.mensaje.includes('PIN'),
    'bienvenida al colaborador: crear contraseña con la cédula (D-06)');
  t.ok(!tomados.some(x => x.payload.mensaje?.includes('Viejo'))
       && (await uno(c, `SELECT count(*)::int n FROM core.cola_notificaciones WHERE estado = 'DESCARTADO' AND error LIKE 'Vencido%'`)).n >= 1,
    'mensajes de más de 12 h se descartan como vencidos');
  t.ok(tomados.every(x => x.intentos === 1) && (await uno(c, `SELECT count(*)::int n FROM core.cola_notificaciones WHERE estado = 'PROCESANDO'`)).n === tomados.length,
    'los trabajos tomados quedan PROCESANDO');
  t.ok((await uno(c, `SELECT private.worker_tomar(100) v`)).v.length === 0, 'un trabajo tomado no se entrega dos veces');

  const [m1, m2] = aAdmin;
  await c.query(`SELECT private.worker_resultado($1, true, 'true_593994444444@c.us_ABC')`, [m1.id]);
  t.ok((await uno(c, `SELECT estado FROM core.whatsapp_logs WHERE cola_id = $1`, [m1.id])).estado === 'ENVIADO', 'envío exitoso → log ENVIADO');
  await c.query(`SELECT private.worker_resultado($1, false, 'Servidor no responde', true)`, [m2.id]);
  let q = await uno(c, `SELECT q.estado, l.estado le, l.detalle_respuesta d FROM core.cola_notificaciones q JOIN core.whatsapp_logs l ON l.cola_id = q.id WHERE q.id = $1`, [m2.id]);
  t.ok(q.estado === 'PENDIENTE' && q.le === 'EN_COLA' && q.d.startsWith('Reintentando'), 'error transitorio → reintento');
  await c.query(`UPDATE core.cola_notificaciones SET intentos = 3 WHERE id = $1`, [m2.id]);
  await c.query(`SELECT private.worker_resultado($1, false, 'Servidor no responde', true)`, [m2.id]);
  q = await uno(c, `SELECT q.estado, l.estado le FROM core.cola_notificaciones q JOIN core.whatsapp_logs l ON l.cola_id = q.id WHERE q.id = $1`, [m2.id]);
  t.ok(q.estado === 'ERROR' && q.le === 'ERROR', 'al tercer intento queda en ERROR');

  // ── Rol del worker: solo sus funciones ──
  r = await como(c, 'tcontrol_worker', null, `SELECT private.worker_tomar(1) v`);
  t.ok(Array.isArray(r.v), 'el worker puede tomar trabajos');
  r = await como(c, 'tcontrol_worker', null, `SELECT count(*) FROM core.empleados`);
  t.ok(r.codigo === '42501', 'el worker no lee tablas directamente');
  r = await como(c, 'tcontrol_worker', null, `SELECT private.autocompletar_salidas('2026-10-12')`);
  t.ok(r.codigo === '42501', 'el worker no ejecuta tareas sueltas, solo worker_tareas');
  await c.query(`SELECT private.worker_latido('{"sesion_activa": true, "numero_emisor": "593990000000", "modo": "simulacion"}')`);
  r = await como(c, 'supervisor', { usuario: 'AT_A', empleado_id: 'AT_A' }, `SELECT api.sup_whatsapp_plantillas() v`);
  t.ok(r.v?.servicio?.conectado === true && r.v.servicio.numeroEmisor === '593990000000', 'el latido del worker se ve en el panel');

  // ── Exportar a Google Sheets ──
  const sup = { usuario: 'AT_A', empleado_id: 'AT_A' };
  r = await como(c, 'supervisor', sup, `SELECT api.sup_exportar_sheets('Rep_Sep_2026', '["Empleado","Área"]', '[["MORA RUIZ LUIS","TI"]]') v`);
  const exp = r.v?.id;
  t.ok(r.v?.ok && exp, 'el supervisor encola la exportación');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_exportar_sheets('registros', '["A"]', '[["1"]]') v`);
  t.ok(r.codigo === '22023', 'no permite sobrescribir hojas del sistema');
  r = await como(c, 'empleado', { usuario: 'AT_N', empleado_id: 'AT_N' }, `SELECT api.sup_exportar_sheets('X', '["A"]', '[["1"]]') v`);
  t.ok(!!r.error, 'un colaborador no puede exportar');
  tomados = (await uno(c, `SELECT private.worker_tomar(100) v`)).v;
  t.ok(tomados.some(x => x.id === Number(exp) && x.tipo === 'EXPORTAR_SHEETS' && x.payload.filas[0][0] === 'MORA RUIZ LUIS'), 'el worker recibe la exportación');
  await c.query(`SELECT private.worker_resultado($1, true, 'OK', false, '{"url": "https://docs.google.com/spreadsheets/d/x#gid=1"}')`, [exp]);
  r = await como(c, 'supervisor', sup, `SELECT api.sup_estado_exportacion($1) v`, [exp]);
  t.ok(r.v?.estado === 'ENVIADO' && r.v.url.includes('#gid=1'), 'el panel obtiene la URL de la hoja');

  r = await como(c, 'supervisor', sup, `SELECT api.sup_estado_sistema() v`);
  t.ok(r.v?.tareas?.some(x => x.tarea === 'autocompletar_salidas') && r.v.worker.modo === 'simulacion', 'estado del sistema muestra tareas y worker');
}
