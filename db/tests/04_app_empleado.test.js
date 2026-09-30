// Fase 3: RPC de la app del empleado con reloj simulado (lunes 2026-09-28).
const LAT = -0.12910, LNG = -78.47815;          // centro de la planta (D-21)
const FECHA = '2026-09-28';
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex').toString('base64');

async function como(c, rol, empleadoId, hora, sql, params = []) {
  await c.query('SAVEPOINT p');
  try {
    await c.query(`SELECT set_config('app.permitir_reloj_simulado', 'on', true),
                          set_config('app.ahora', $1, true),
                          set_config('request.jwt.claims', $2, true)`,
                  [`${FECHA} ${hora}`, JSON.stringify({ role: rol, empleado_id: empleadoId, usuario: empleadoId })]);
    await c.query(`SET LOCAL ROLE ${rol}`);
    const r = await c.query(sql, params);
    await c.query('RELEASE SAVEPOINT p');
    await c.query('RESET ROLE');
    return { filas: r.rows, v: r.rows[0] && Object.values(r.rows[0])[0] };
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT p');
    await c.query('RESET ROLE');
    return { error: e.message, codigo: e.code, hint: e.hint };
  }
}
const marcar = (c, id, hora, tipo, extra = {}) => como(c, 'empleado', id, hora,
  `SELECT api.marcar(p_tipo => $1, p_lat => $2, p_lng => $3, p_modo => $4, p_almuerzo => $5,
                     p_motivo_entrada_tardia => $6, p_tipo_salida => $7) v`,
  [tipo, extra.lat ?? LAT, extra.lng ?? LNG, extra.modo ?? 'OFICINA', extra.almuerzo ?? null, extra.motivo ?? null, extra.tipoSalida ?? null]);

export default async function (c, t) {
  await c.query(`SET LOCAL app.etl = 'on'`);
  await c.query(`INSERT INTO core.empleados (id, nombre, area, cargo, rol, es_pasante, tipo_asistencia, puede_autorizar_extras) VALUES
    ('T_A','ANA PRUEBA','TI','ANALISTA','EMPLEADO',false,'NORMAL',false),
    ('T_B','BETO PRUEBA','TI','ANALISTA','EMPLEADO',false,'NORMAL',false),
    ('T_P','PASANTE PRUEBA','TI','PASANTE','EMPLEADO',true,'NORMAL',false),
    ('T_C','CARLA COORD','PRODUCCION','COORDINADOR DE PRODUCCION','EMPLEADO',false,'NORMAL',true),
    ('T_T','TOMAS TALLER','TALLER','SOLDADOR','EMPLEADO',false,'NORMAL',false),
    ('T_D','DIANA AUSENTE','TI','ANALISTA','EMPLEADO',false,'NORMAL',false),
    ('T_S','SUSANA SUP','TI','JEFA','SUPERVISOR',false,'NORMAL',false),
    ('T_X','XAVIER SIN','TI','SIN ASISTENCIA','EMPLEADO',false,'SIN_ASISTENCIA',false)`);
  await c.query(`INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, ts_servidor, almuerzo)
                 VALUES ('T_D', 'ENTRADA', '2026-09-14', '07:20', '2026-09-14 07:20-05', true)`);
  await c.query(`SET LOCAL app.etl = 'off'`);

  // ── Contexto ──
  let r = await como(c, 'empleado', 'T_A', '07:00', `SELECT api.mi_contexto() v`);
  t.ok(r.v?.empleado.id === 'T_A' && r.v.horario.salida === '16:15:00' && r.v.fecha === FECHA, 'mi_contexto trae ficha, horario y fecha del servidor');

  // ── Entrada ──
  r = await marcar(c, 'T_A', '07:20', 'ENTRADA');
  t.ok(r.hint === 'ALMUERZO', 'entrada antes de 09:30 exige elegir almuerzo');
  r = await marcar(c, 'T_A', '07:20', 'ENTRADA', { lat: LAT + 0.01 });
  t.ok(r.hint === 'FUERA_DE_AREA' && /Fuera del área de la empresa/.test(r.error), 'fuera de la geocerca se rechaza en el servidor');
  r = await marcar(c, 'T_A', '07:20', 'ENTRADA', { almuerzo: 'SI' });
  t.ok(r.v?.ok && r.v.almuerzo === true && r.v.minutos_atraso === 0 && r.v.hora === '07:20:00', 'entrada 07:20 con almuerzo en planta, sin atraso');
  r = await marcar(c, 'T_A', '07:25', 'ENTRADA', { almuerzo: 'SI' });
  t.ok(/Ya registraste tu ENTRADA/.test(r.error || ''), 'doble ENTRADA seguida se rechaza');
  r = await marcar(c, 'T_B', '07:50', 'ENTRADA', { almuerzo: 'NO' });
  t.ok(r.hint === 'MOTIVO_ENTRADA' && /07:45/.test(r.error), 'entrada 07:50 exige motivo');
  r = await marcar(c, 'T_B', '07:50', 'ENTRADA', { almuerzo: 'NO', motivo: 'permiso_medico' });
  t.ok(r.v?.ok && r.v.minutos_atraso === 20, 'entrada 07:50 con motivo: 20 min de atraso');
  r = await marcar(c, 'T_P', '07:50', 'ENTRADA', { almuerzo: 'SI' });
  t.ok(r.v?.ok && r.v.minutos_atraso === 0, 'pasante 07:50 no pide motivo ni suma atraso');
  r = await marcar(c, 'T_C', '09:40', 'ENTRADA', { almuerzo: 'SI', motivo: 'entrada_justificada' });
  t.ok(r.v?.ok && r.v.almuerzo === false, 'entrada 09:40: almuerzo queda fuera de planta');
  r = await marcar(c, 'T_X', '07:10', 'ENTRADA', { almuerzo: 'SI' });
  t.ok(/no registra asistencia/.test(r.error || ''), 'SIN ASISTENCIA no marca');
  r = await marcar(c, 'T_A', '07:30', 'SALIDA_CAMPO', { modo: 'CAMPO' });
  t.ok(/registrar la ubicación del proyecto/.test(r.error || ''), 'modo campo sin base asignada no marca');
  const fila = await c.query(`SELECT ts_servidor AT TIME ZONE 'America/Guayaquil' AS local, origen, dispositivo FROM core.marcaciones WHERE empleado_id = 'T_A' AND fecha = $1`, [FECHA]);
  t.ok(String(fila.rows[0]?.local).includes('07:20:00') && fila.rows[0].origen === 'APP', 'la hora guardada es la del servidor');

  // ── Salida ──
  r = await marcar(c, 'T_B', '09:20', 'SALIDA', { tipoSalida: 'FINAL' });
  t.ok(r.v?.ok && r.v.almuerzo === false, 'salida 09:20: almuerzo NO');
  r = await marcar(c, 'T_A', '17:05', 'SALIDA');
  t.ok(r.v?.ok && r.v.horas_extra === true, 'salida 17:05: horas extra automáticas');
  const aut = await c.query(`SELECT autoriza FROM core.marcaciones WHERE empleado_id = 'T_A' AND tipo = 'SALIDA'`);
  t.ok(aut.rows[0]?.autoriza === 'SISTEMA (>45 MIN)', 'autoriza SISTEMA (>45 MIN)');
  r = await marcar(c, 'T_P', '15:00', 'SALIDA', { tipoSalida: 'CUMPLEAÑOS' });
  t.ok(r.v?.ok, 'tipo de salida CUMPLEAÑOS aceptado');

  // ── Reporte fuera de área (D-08) ──
  r = await como(c, 'empleado', 'T_D', '08:00', `SELECT api.reportar_estado_hoy('VACACIONES', 'Viaje') v`);
  t.ok(r.v?.ok, 'reporte de estado de hoy sin marcación');
  const nov = await c.query(`SELECT justificado, quien_justifica FROM core.novedades WHERE empleado_id = 'T_D' AND fecha = $1`, [FECHA]);
  t.ok(nov.rows[0]?.justificado === 'PENDIENTE', 'el reporte queda PENDIENTE de aprobación');
  const cola = await c.query(`SELECT count(*)::int n FROM core.cola_notificaciones WHERE tipo = 'REPORTE_FUERA_AREA' AND payload ->> 'empleadoId' = 'T_D'`);
  t.ok(cola.rows[0].n === 1, 'el aviso al supervisor queda en la cola del worker');
  r = await como(c, 'empleado', 'T_A', '08:00', `SELECT api.reportar_estado_hoy('VACACIONES') v`);
  t.ok(/Ya registraste tu jornada/.test(r.error || ''), 'con marcación hoy no se puede reportar ausencia');

  // ── Faltas pasadas y justificación masiva ──
  r = await como(c, 'empleado', 'T_D', '08:00', `SELECT array_agg(d::text) v FROM api.mis_dias_faltantes() d`);
  t.ok(r.v?.length === 9 && r.v[0] === '2026-09-15' && !r.v.includes('2026-09-19') && !r.v.includes('2026-09-26'),
       'días faltantes: laborables desde la primera marcación, sin fines de semana');
  r = await como(c, 'empleado', 'T_D', '08:00', `SELECT api.justificar_faltas(ARRAY['2026-09-15','2026-09-01']::date[], 'Permiso médico') v`);
  t.ok(r.v?.justificados === 1 && r.v.rechazados === 1, 'solo se justifican días realmente faltantes');
  r = await como(c, 'empleado', 'T_D', '08:00', `SELECT api.justificar_faltas(ARRAY['2026-09-16']::date[], 'Me fui al cine') v`);
  t.ok(r.codigo === '22023', 'motivo fuera de la lista se rechaza');

  // ── Almuerzo del día ──
  r = await como(c, 'empleado', 'T_A', '09:00', `SELECT api.cambiar_almuerzo('NO') v`);
  t.ok(r.v?.almuerzo === 'NO', 'cambio de almuerzo antes de 09:30');
  r = await como(c, 'empleado', 'T_A', '10:00', `SELECT api.cambiar_almuerzo('SI') v`);
  t.ok(/09:30/.test(r.error || ''), 'después de 09:30 no se puede cambiar');
  await c.query(`UPDATE core.marcaciones SET almuerzo = NULL WHERE empleado_id = 'T_C' AND tipo = 'ENTRADA'`);
  r = await como(c, 'empleado', 'T_C', '12:30', `SELECT api.cambiar_almuerzo('SI') v`);
  t.ok(r.v?.almuerzo === 'SI', 'popup de 12:25 a 14:00 si aún no eligió');
  r = await como(c, 'empleado', 'T_D', '08:00', `SELECT api.cambiar_almuerzo('SI') v`);
  t.ok(/Primero registra tu entrada/.test(r.error || ''), 'sin entrada no hay almuerzo que cambiar');

  // ── Invitados (R-15) ──
  r = await como(c, 'empleado', 'T_A', '09:39', `SELECT api.crear_solicitud_invitado('ALMUERZO_EXTRA','ALMUERZO_EXTRA',$1,2,'Juan Cliente','ACME') v`, [FECHA]);
  t.ok(r.v?.ok && r.v.id.startsWith('inv_20260928_093900_T_A_'), 'almuerzo extra para hoy a las 09:39');
  const idSol = r.v?.id;
  const sol = await c.query(`SELECT observaciones_completas, estado FROM core.solicitudes_invitados WHERE id = $1`, [idSol]);
  t.ok(sol.rows[0]?.observaciones_completas === '[Área: TI] (Sol: ANA PRUEBA)' && sol.rows[0].estado === 'SOLICITADO', 'observaciones con trazabilidad como el legado');
  r = await como(c, 'empleado', 'T_A', '09:41', `SELECT api.crear_solicitud_invitado('ALMUERZO_EXTRA','ALMUERZO_EXTRA',$1,1,'Otro') v`, [FECHA]);
  t.ok(/cerraron a las 09:40/.test(r.error || ''), 'almuerzo extra para hoy después de 09:40 se rechaza');
  r = await como(c, 'empleado', 'T_T', '07:00', `SELECT api.crear_solicitud_invitado('REFRIGERIO','REFRIGERIO_GALLETAS','2026-09-29',1,'Visita') v`);
  t.ok(/Taller/.test(r.error || ''), 'personal de Taller no solicita');
  r = await como(c, 'empleado', 'T_B', '09:30', `SELECT api.cancelar_solicitud_invitado($1) v`, [idSol]);
  t.ok(r.codigo === 'P0002', 'no se cancela la solicitud de otro');
  r = await como(c, 'empleado', 'T_A', '09:39', `SELECT api.cancelar_solicitud_invitado($1) v`, [idSol]);
  t.ok(r.v?.ok, 'cancelar antes del corte');

  // ── Perfil y foto ──
  r = await como(c, 'empleado', 'T_A', '10:00', `SELECT api.guardar_perfil(p_telefono => '0991234567') v`);
  const tel = await c.query(`SELECT telefono FROM core.empleados WHERE id = 'T_A'`);
  t.ok(r.v?.ok && tel.rows[0].telefono === '593991234567', 'teléfono normalizado a 593…');
  r = await como(c, 'empleado', 'T_A', '10:00', `SELECT api.subir_foto($1) v`, [Buffer.from('no es imagen').toString('base64')]);
  t.ok(/JPEG/.test(r.error || ''), 'solo se aceptan fotos JPEG');
  r = await como(c, 'empleado', 'T_A', '10:00', `SELECT api.subir_foto($1) v`, [`data:image/jpeg;base64,${JPEG}`]);
  t.ok(r.v?.foto_url?.startsWith('/rpc/foto?p_id=T_A&v='), 'foto subida con URL pública versionada');
  r = await como(c, 'anon', null, '10:00', `SELECT encode(api.foto('T_A')::bytea, 'hex') v`);
  t.ok(r.v?.startsWith('ffd8ff'), 'la foto se sirve como image/jpeg');

  // ── Extras (R-13) ──
  r = await como(c, 'empleado', 'T_A', '10:00', `SELECT * FROM api.personal_taller()`);
  t.ok(r.codigo === '42501', 'un empleado común no ve la pestaña Extras');
  r = await como(c, 'empleado', 'T_C', '10:00', `SELECT * FROM api.personal_taller() WHERE id LIKE 'T\\_%'`);
  t.ok(r.filas?.some(f => f.id === 'T_T' && f.auth_extras === 'NO') && r.filas.some(f => f.id === 'T_C'), 'coordinador ve personal de Taller y Producción');
  r = await como(c, 'empleado', 'T_C', '10:00', `SELECT api.autorizar_extras('T_T', true) v`);
  t.ok(/entrada para hoy/.test(r.error || ''), 'sin entrada de hoy no se autoriza');
  await marcar(c, 'T_T', '07:10', 'ENTRADA', { almuerzo: 'SI' });
  r = await como(c, 'empleado', 'T_C', '10:00', `SELECT api.autorizar_extras('T_T', true) v`);
  const hx = await c.query(`SELECT horas_extra, autoriza FROM core.marcaciones WHERE empleado_id = 'T_T' AND tipo = 'ENTRADA'`);
  t.ok(r.v?.ok && hx.rows[0].horas_extra && hx.rows[0].autoriza === 'CARLA COORD', 'coordinador autoriza extras en la entrada de hoy');

  // ── Emergencia (R-19) ──
  r = await como(c, 'empleado', 'T_A', '10:00', `SELECT api.cambiar_emergencia(true, 'Simulacro') v`);
  t.ok(r.codigo === '42501', 'un empleado no activa emergencias');
  r = await como(c, 'supervisor', 'T_S', '10:00', `SELECT api.cambiar_emergencia(true, 'Simulacro Sismo') v`);
  t.ok(r.v?.ok, 'supervisor activa una emergencia');
  r = await como(c, 'empleado', 'T_A', '10:05', `SELECT api.reportar_estado_emergencia('A salvo', 'Todo bien') v`);
  const em = await c.query(`SELECT estado_emergencia FROM core.marcaciones WHERE empleado_id = 'T_A' AND tipo = 'ENTRADA'`);
  t.ok(r.v?.ok && em.rows[0].estado_emergencia === 'A salvo - Todo bien', 'estado de emergencia guardado en la ENTRADA');
  r = await como(c, 'empleado', 'T_D', '10:05', `SELECT api.reportar_estado_emergencia('A salvo') v`);
  t.ok(/ENTRADA de hoy/.test(r.error || ''), 'sin entrada no se reporta estado');
  await como(c, 'supervisor', 'T_S', '11:00', `SELECT api.cambiar_emergencia(false) v`);

  // ── Cultura ──
  r = await como(c, 'empleado', 'T_A', '10:00', `SELECT api.cultura_pregunta_del_dia() v`);
  const q = r.v;
  t.ok(q?.habilitada === true && q.opciones?.length > 0 && !JSON.stringify(q).includes('correcta'), 'pregunta del día sin revelar la respuesta');
  const correcta = (await c.query(`SELECT (SELECT i - 1 FROM jsonb_array_elements(opciones) WITH ORDINALITY t(o, i) WHERE (o ->> 'correcta')::boolean LIMIT 1) i
                                   FROM core.cultura_preguntas WHERE id = $1`, [q?.id])).rows[0]?.i;
  r = await como(c, 'empleado', 'T_A', '10:00', `SELECT api.responder_cultura($1) v`, [correcta]);
  t.ok(r.v?.correcta === true, 'la respuesta correcta se valida en el servidor');

  // ── Registros propios ──
  await c.query(`SET LOCAL app.etl = 'on'`);
  await c.query(`INSERT INTO core.ajustes_dia (empleado_id, fecha, min_permiso_personal) VALUES ('T_A', $1, 30)`, [FECHA]);
  await c.query(`SET LOCAL app.etl = 'off'`);
  r = await como(c, 'empleado', 'T_A', '18:00', `SELECT jsonb_agg(x) v FROM api.mis_registros('2026-09-01') x`);
  const regs = r.v || [];
  t.ok(regs.length === 2 && regs.reduce((s, x) => s + Number(x.permiso_personal_mins), 0) === 30, 'mis_registros: minutos de permiso contados una sola vez por día');
  t.ok(regs.every(x => x.fecha && x.hora && x.tipo), 'mis_registros trae fecha, hora y tipo');
  r = await como(c, 'empleado', 'T_B', '18:00', `SELECT count(*)::int v FROM api.mis_registros() x WHERE x ->> 'id' IN (SELECT 'm' || id FROM core.marcaciones WHERE empleado_id = 'T_A')`);
  t.ok(r.v === 0 || r.codigo === '42501', 'mis_registros no expone registros ajenos');

  // ── Cerrar sesión: desvincula el dispositivo (cerrarSesion) ──
  await c.query(`SET LOCAL app.etl = 'on'`);
  await c.query(`INSERT INTO core.dispositivos (token, empleado_id, activo) VALUES ('DEV_TESTCIERRE', 'T_A', true)`);
  await c.query(`SET LOCAL app.etl = 'off'`);
  await c.query('SAVEPOINT p');
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'empleado', empleado_id: 'T_A', usuario: 'T_A', dispositivo: 'DEV_TESTCIERRE' })]);
  await c.query('SET LOCAL ROLE empleado');
  await c.query('SELECT api.cerrar_sesion()');
  await c.query('RESET ROLE');
  await c.query('RELEASE SAVEPOINT p');
  const disp = await c.query(`SELECT activo FROM core.dispositivos WHERE token = 'DEV_TESTCIERRE'`);
  t.ok(disp.rows[0].activo === false, 'cerrar sesión desvincula el dispositivo');
}
