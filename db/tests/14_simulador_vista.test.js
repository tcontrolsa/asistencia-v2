// P-16: Simulador de Vista con sesión de solo lectura emitida por el servidor
async function como(c, rol, claims, sql, params = []) {
  await c.query('SAVEPOINT p');
  try {
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: rol, ...claims })]);
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
const payload = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

// Petición como la haría PostgREST: claims del token, rol, pre-request y la consulta, todo en un savepoint descartable
async function peticion(c, token, sql, params = []) {
  const cl = payload(token);
  await c.query('SAVEPOINT q');
  try {
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(cl)]);
    await c.query(`SET LOCAL ROLE ${cl.role}`);
    await c.query('SELECT private.verificar_sesion()');
    const r = await c.query(sql, params);
    return { v: r.rows[0] && Object.values(r.rows[0])[0] };
  } catch (e) {
    return { error: e.message, codigo: e.code };
  } finally {
    await c.query('ROLLBACK TO SAVEPOINT q');
    await c.query('RESET ROLE');
  }
}

export default async function (c, t) {
  await c.query(`SET LOCAL app.etl = 'on'`);
  await c.query(`INSERT INTO core.empleados (id, nombre, area, cargo, rol) VALUES
    ('SV_E','ELENA SIMULADA','TI','ANALISTA','EMPLEADO'), ('SV_S','SANTIAGO SUP','TI','JEFE','SUPERVISOR'),
    ('SV_A','ANDREA SUPADMIN','TI','COORD','SUPERVISOR_ADMIN'), ('SV_R','RAUL ADMIN','TI','GERENTE','ADMIN')`);
  await c.query(`INSERT INTO private.credenciales (usuario, tipo_cuenta, password_hash, debe_cambiar) VALUES
    ('SV_S','EMPLEADO','x',false), ('SV_A','EMPLEADO','x',false), ('SV_R','EMPLEADO','x',false)`);
  await c.query(`SET LOCAL app.etl = 'off'`);
  const adm = { usuario: 'SV_A', empleado_id: 'SV_A' }, root = { usuario: 'SV_R', empleado_id: 'SV_R' };

  let r = await como(c, 'supervisor', { usuario: 'SV_S', empleado_id: 'SV_S' }, `SELECT api.sup_simular_empleado('SV_E') v`);
  t.ok(r.codigo === '42501', 'un supervisor no puede simular');
  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_simular_lista() v`);
  const fila = r.v?.find(x => x.id === 'SV_E');
  t.ok(fila && fila.tienePassword === null && !('pin' in fila) && !('password_hash' in fila), 'lista sin PIN ni contraseñas');

  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_simular_empleado('SV_E') v`);
  const tok = r.v?.token;
  const cl = tok && payload(tok);
  t.ok(cl?.simulado === true && cl.simulado_por === 'SV_A' && cl.role === 'empleado' && cl.exp - cl.iat === 1800,
    'Sup. Admin obtiene una sesión simulada de 30 min con el rol del colaborador');
  t.ok(!!(await c.query(`SELECT 1 FROM core.auditoria WHERE tabla = 'simulacion' AND clave = 'SV_E' AND usuario = 'SV_A'`)).rows[0],
    'la simulación queda en la auditoría');
  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_simular_empleado('SV_R') v`);
  t.ok(r.codigo === '42501', 'un Sup. Admin no puede simular a un Admin');
  r = await como(c, 'admin', root, `SELECT api.sup_simular_empleado('SV_A') v`);
  t.ok(!!r.v?.token, 'el Admin sí puede simular a un Sup. Admin');

  // Lectura sí; escritura no (aunque el colaborador no haya creado su contraseña)
  r = await peticion(c, tok, `SELECT api.mi_contexto() v`);
  t.ok(!r.error && r.v, 'la vista simulada lee el contexto del colaborador' + (r.error ? ` (${r.error})` : ''));
  r = await peticion(c, tok, `SELECT api.guardar_perfil(p_telefono => '0990000000') v`);
  t.ok(r.codigo === '25006', 'la vista simulada no puede modificar datos (transacción de solo lectura)');
  r = await peticion(c, tok, `INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora) VALUES ('SV_E', 'ENTRADA', private.hoy(), '07:30') RETURNING 1`);
  t.ok(!!r.error, 'ni marcar asistencia');

  // Si quien simula pierde el rol o cambia su contraseña, la sesión simulada muere
  await c.query(`UPDATE private.credenciales SET sesiones_validas_desde = now() + interval '1 second' WHERE usuario = 'SV_A'`);
  r = await peticion(c, tok, `SELECT api.mi_contexto() v`);
  t.ok(r.codigo === 'PT401', 'cambio de contraseña de quien simula → la vista simulada termina');
}
