// Fase 4: terminal de guardia, catering y kiosco (reloj simulado: lunes 2026-09-28).
const LAT = -0.12910, LNG = -78.47815;
const FECHA = '2026-09-28';

async function como(c, rol, claims, hora, sql, params = []) {
  await c.query('SAVEPOINT p');
  try {
    await c.query(`SELECT set_config('app.permitir_reloj_simulado', 'on', true), set_config('app.ahora', $1, true),
                          set_config('request.jwt.claims', $2, true)`, [`${FECHA} ${hora}`, JSON.stringify({ role: rol, ...claims })]);
    await c.query(`SET LOCAL ROLE ${rol}`);
    const r = await c.query(sql, params);
    const estado = (await c.query(`SELECT current_setting('response.status', true) s`)).rows[0].s;
    await c.query('RELEASE SAVEPOINT p');
    await c.query('RESET ROLE');
    await c.query(`SELECT set_config('response.status', '', true)`);
    return { filas: r.rows, v: r.rows[0] && Object.values(r.rows[0])[0], estado };
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT p');
    await c.query('RESET ROLE');
    return { error: e.message, codigo: e.code, hint: e.hint };
  }
}

export default async function (c, t) {
  await c.query(`SET LOCAL app.etl = 'on'`);
  await c.query(`INSERT INTO core.empleados (id, nombre, area, cargo, rol) VALUES
    ('G_A','ANA GARITA','TI','ANALISTA','EMPLEADO'), ('G_B','BRUNO KIOSCO','TI','ANALISTA','EMPLEADO'),
    ('G_S','SARA SUPERVISORA','TI','JEFA','SUPERVISOR'), ('G_X','XIMENA SINCLAVE','TI','ANALISTA','EMPLEADO')`);
  await c.query(`INSERT INTO core.guardias (usuario, nombre) VALUES ('garita_prueba', 'Guardia Prueba')`);
  await c.query(`INSERT INTO private.credenciales (usuario, tipo_cuenta, password_hash, debe_cambiar) VALUES
    ('G_B', 'EMPLEADO', crypt('kiosco123', gen_salt('bf', 4)), false), ('G_X', 'EMPLEADO', NULL, true)`);
  await c.query(`SET LOCAL app.etl = 'off'`);
  const guardia = { usuario: 'garita_prueba' };
  const sup = { usuario: 'G_S', empleado_id: 'G_S' };

  // ── Guardia ──
  let r = await como(c, 'empleado', { empleado_id: 'G_A', usuario: 'G_A' }, '07:10', `SELECT api.guardia_buscar('G_A') v`);
  t.ok(r.codigo === '42501', 'un empleado no usa la terminal de guardia');
  r = await como(c, 'guardia', guardia, '07:10', `SELECT api.guardia_buscar('G_A') v`);
  t.ok(r.v?.tipo === 'ENTRADA' && r.v.nombre === 'ANA GARITA', 'guardia busca por ID: corresponde ENTRADA');
  r = await como(c, 'guardia', guardia, '07:10', `SELECT api.marcar_guardia('G_A', 'ENTRADA', NULL, $1, $2) v`, [LAT, LNG]);
  t.ok(r.hint === 'ALMUERZO', 'guardia: la entrada exige elegir almuerzo');
  r = await como(c, 'guardia', guardia, '07:10', `SELECT api.marcar_guardia('G_A', 'ENTRADA', 'SI', $1, $2) v`, [LAT + 0.01, LNG]);
  t.ok(r.hint === 'FUERA_DE_AREA', 'guardia: el GPS del terminal debe estar en la planta');
  r = await como(c, 'guardia', guardia, '07:10', `SELECT api.marcar_guardia('G_A', 'SALIDA', NULL, $1, $2) v`, [LAT, LNG]);
  t.ok(/Corresponde registrar ENTRADA/.test(r.error || ''), 'guardia: no se registra SALIDA antes de la ENTRADA');
  r = await como(c, 'guardia', guardia, '07:10', `SELECT api.marcar_guardia('G_A', 'ENTRADA', 'SI', $1, $2) v`, [LAT, LNG]);
  t.ok(r.v?.ok && r.v.tipo === 'ENTRADA' && r.v.almuerzo === true, 'guardia registra ENTRADA con almuerzo en planta');
  const m = await c.query(`SELECT origen, dispositivo, creado_por FROM core.marcaciones WHERE empleado_id = 'G_A'`);
  t.ok(m.rows[0].origen === 'GUARDIA' && m.rows[0].dispositivo === 'GUARDIA' && m.rows[0].creado_por === 'garita_prueba',
       'la marcación queda con origen GUARDIA y el usuario del guardia');
  r = await como(c, 'guardia', guardia, '10:00', `SELECT api.guardia_buscar('G_A') v`);
  t.ok(r.v?.tipo === 'SALIDA', 'luego corresponde SALIDA');
  r = await como(c, 'guardia', guardia, '09:45', `SELECT api.marcar_guardia('G_B', 'ENTRADA', 'SI', $1, $2) v`, [LAT, LNG]);
  t.ok(r.v?.almuerzo === false, 'guardia después de 09:30: almuerzo fuera de planta (R-14)');
  r = await como(c, 'guardia', guardia, '17:05', `SELECT api.marcar_guardia('G_A', 'SALIDA', NULL, $1, $2) v`, [LAT, LNG]);
  t.ok(r.v?.ok, 'guardia registra SALIDA');
  r = await como(c, 'guardia', guardia, '17:10', `SELECT api.guardia_buscar('G_A') v`);
  t.ok(r.v?.tipo === null, 'con entrada y salida: jornada completada');
  r = await como(c, 'guardia', guardia, '17:10', `SELECT api.marcar_guardia('G_A', 'SALIDA', NULL, $1, $2) v`, [LAT, LNG]);
  t.ok(/Jornada completada/.test(r.error || ''), 'no se marca más de una salida');
  r = await como(c, 'guardia', guardia, '17:10', `SELECT * FROM api.presentes_hoy() WHERE empleado_id LIKE 'G\\_%' ORDER BY empleado_id`);
  t.ok(r.filas?.length === 2 && r.filas[0].hora_salida && !r.filas[1].hora_salida, 'presentes: con entrada hoy, con su salida si la hay');

  // ── Catering ──
  r = await como(c, 'guardia', guardia, '12:30', `SELECT * FROM api.lista_catering()`);
  t.ok(r.codigo === '42501', 'la guardia no ve la lista de catering');
  r = await como(c, 'supervisor', sup, '12:30', `SELECT * FROM api.lista_catering() WHERE empleado_id LIKE 'G\\_%'`);
  t.ok(r.filas?.length === 1 && r.filas[0].empleado_id === 'G_A' && r.filas[0].consumido === false, 'catering lista solo a quien almuerza en planta');
  r = await como(c, 'supervisor', sup, '12:30', `SELECT api.marcar_consumido('G_A') v`);
  r = await como(c, 'supervisor', sup, '12:31', `SELECT api.marcar_consumido('G_A') v`);
  const cons = await c.query(`SELECT count(*)::int n, max(registrado_por) quien FROM core.consumo_almuerzos WHERE empleado_id = 'G_A'`);
  t.ok(cons.rows[0].n === 1 && cons.rows[0].quien === 'G_S', 'consumo una sola vez por día, con quien lo registró');
  r = await como(c, 'supervisor', sup, '12:32', `SELECT consumido FROM api.lista_catering() WHERE empleado_id = 'G_A'`);
  t.ok(r.v === true, 'la lista muestra el consumo');

  // ── Kiosco ──
  r = await como(c, 'anon', {}, '07:20', `SELECT api.kiosco_identificar('G_B', 'malaclave') v`);
  t.ok(r.v?.codigo === 'CREDENCIALES' && r.estado === '401', 'kiosco: contraseña incorrecta');
  const f = await c.query(`SELECT intentos_fallidos FROM private.credenciales WHERE usuario = 'G_B'`);
  t.ok(f.rows[0].intentos_fallidos === 1, 'kiosco: el fallo cuenta para el bloqueo');
  r = await como(c, 'anon', {}, '07:20', `SELECT api.kiosco_identificar('G_X', 'loquesea') v`);
  t.ok(r.v?.codigo === 'CREAR_PASSWORD', 'kiosco: sin contraseña creada no se usa');
  r = await como(c, 'anon', {}, '07:20', `SELECT api.kiosco_identificar('G_B', 'kiosco123') v`);
  t.ok(r.v?.ok && r.v.tipo === 'SALIDA' && r.v.nombre === 'BRUNO KIOSCO', 'kiosco identifica y muestra qué corresponde');
  r = await como(c, 'anon', {}, '16:30', `SELECT api.marcar_kiosco('G_B', 'kiosco123', 'SALIDA', NULL, $1, $2) v`, [LAT, LNG]);
  t.ok(r.v?.ok && r.v.tipo === 'SALIDA', 'kiosco registra con la contraseña del colaborador');
  const k = await c.query(`SELECT origen, dispositivo FROM core.marcaciones WHERE empleado_id = 'G_B' AND tipo = 'SALIDA'`);
  t.ok(k.rows[0].origen === 'KIOSCO' && k.rows[0].dispositivo === 'KIOSCO', 'marcación con origen KIOSCO');
  r = await como(c, 'anon', {}, '16:30', `SELECT * FROM api.presentes_hoy()`);
  t.ok(r.codigo === '42501', 'el kiosco (anon) no ve presentes');
}
