// Pruebas de permisos por rol (RLS + GRANT), simulando lo que hace PostgREST:
// SET LOCAL ROLE <rol> y request.jwt.claims. Todo dentro de una transacción que se revierte.

const EMP_A = 'TEST_A', EMP_B = 'TEST_B', SUP = 'TEST_SUP';

async function como(c, rol, claims, sql, params = []) {
  await c.query('SAVEPOINT p');
  try {
    await c.query(`SET LOCAL ROLE ${rol}`);
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: rol, ...claims })]);
    const r = await c.query(sql, params);
    await c.query('RELEASE SAVEPOINT p');
    await c.query('RESET ROLE');
    return { filas: r.rows };
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT p');
    await c.query('RESET ROLE');
    return { error: e.message, codigo: e.code };
  }
}

export default async function (c, t) {
  await c.query(`SET LOCAL app.etl = 'on'`);
  await c.query(`INSERT INTO core.empleados (id, nombre, rol) VALUES
                   ($1, 'PRUEBA A', 'EMPLEADO'), ($2, 'PRUEBA B', 'EMPLEADO'), ($3, 'PRUEBA SUP', 'SUPERVISOR')`,
                [EMP_A, EMP_B, SUP]);
  await c.query(`INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, almuerzo)
                 VALUES ($1, 'ENTRADA', private.hoy(), '07:20', true), ($2, 'ENTRADA', private.hoy(), '07:40', false)`,
                [EMP_A, EMP_B]);
  await c.query(`INSERT INTO private.credenciales (usuario, tipo_cuenta, password_hash)
                 VALUES ($1, 'EMPLEADO', crypt('secreto', gen_salt('bf')))`, [EMP_A]);
  await c.query(`SET LOCAL app.etl = 'off'`);

  const empA = { empleado_id: EMP_A };
  const sup = { empleado_id: SUP };
  const test = (...a) => `SELECT count(*)::int n FROM ${a[0]} WHERE ${a[1] ?? 'true'}`;
  const filtroPrueba = `empleado_id LIKE 'TEST_%'`;

  // ── anon (sin sesión) ──
  let r = await como(c, 'anon', {}, test('api.empleados'));
  t.ok(r.codigo === '42501', 'anon no puede leer api.empleados');
  r = await como(c, 'anon', {}, test('api.marcaciones'));
  t.ok(r.codigo === '42501', 'anon no puede leer api.marcaciones');
  r = await como(c, 'anon', {}, test('core.empleados'));
  t.ok(r.codigo === '42501', 'anon no puede leer core.empleados');
  r = await como(c, 'anon', {}, 'SELECT * FROM private.credenciales');
  t.ok(r.codigo === '42501', 'anon no puede leer private.credenciales');
  r = await como(c, 'anon', {}, 'SELECT * FROM api.vista_previa_empleado($1)', [EMP_A]);
  t.ok(r.filas?.length === 1 && r.filas[0].tiene_password === true && !('password_hash' in r.filas[0]),
       'anon ve la vista previa (sin hash) y tiene_password');
  r = await como(c, 'anon', {}, 'SELECT * FROM api.ahora()');
  t.ok(r.filas?.length === 1, 'anon puede consultar la hora oficial');
  r = await como(c, 'anon', {}, 'SELECT api.estado_hoy($1)', [EMP_A]);
  t.ok(!!r.error, 'anon no puede consultar estado_hoy');

  // ── empleado ──
  r = await como(c, 'empleado', empA, test('api.marcaciones', filtroPrueba));
  t.ok(r.filas?.[0].n === 1, 'empleado solo ve sus marcaciones');
  r = await como(c, 'empleado', empA, test('api.empleados'));
  t.ok(r.filas?.[0].n === 1, 'empleado solo ve su ficha');
  r = await como(c, 'empleado', empA, 'SELECT api.estado_hoy() e');
  t.ok(r.filas?.[0].e.marcaciones.length === 1, 'empleado consulta su estado de hoy');
  r = await como(c, 'empleado', empA, 'SELECT api.estado_hoy($1)', [EMP_B]);
  t.ok(r.codigo === '42501', 'empleado no consulta el estado de otro');
  r = await como(c, 'empleado', empA, `INSERT INTO api.marcaciones (empleado_id, tipo, fecha, hora) VALUES ($1,'SALIDA',now(),now())`, [EMP_A]);
  t.ok(r.codigo === '42501', 'empleado no inserta marcaciones directo (solo por RPC)');
  r = await como(c, 'empleado', empA, test('api.auditoria'));
  t.ok(r.codigo === '42501', 'empleado no lee auditoría');
  r = await como(c, 'empleado', empA, 'SELECT * FROM api.presentes_hoy()');
  t.ok(r.codigo === '42501', 'empleado no ve presentes');
  r = await como(c, 'empleado', empA, 'SELECT * FROM api.lista_catering()');
  t.ok(r.codigo === '42501', 'empleado no ve lista de catering');
  r = await como(c, 'empleado', empA, test('api.vacaciones_saldo'));
  t.ok(r.filas?.[0].n === 1, 'empleado ve solo su saldo de vacaciones');
  r = await como(c, 'empleado', { empleado_id: EMP_B, role: 'empleado' }, test('api.marcaciones', filtroPrueba));
  t.ok(r.filas?.[0].n === 1, 'empleado B tampoco ve las de A');
  r = await como(c, 'empleado', { empleado_id: SUP, role: 'supervisor' }, test('api.marcaciones', filtroPrueba));
  t.ok(r.filas?.[0].n === 0, 'claim "supervisor" con rol de BD empleado no ve datos ajenos');

  // ── guardia ──
  const guardia = { usuario: 'guardia_prueba' };
  r = await como(c, 'guardia', guardia, test('api.marcaciones'));
  t.ok(r.codigo === '42501', 'guardia no lee tablas directamente');
  r = await como(c, 'guardia', guardia, 'SELECT api.estado_hoy($1) e', [EMP_B]);
  t.ok(r.filas?.[0].e.empleado.id === EMP_B, 'guardia consulta el estado de cualquier empleado');
  r = await como(c, 'guardia', guardia, 'SELECT count(*)::int n FROM api.presentes_hoy() WHERE empleado_id LIKE $1', ['TEST_%']);
  t.ok(r.filas?.[0].n === 2, 'guardia ve presentes');

  // ── supervisor ──
  r = await como(c, 'supervisor', sup, test('api.marcaciones', filtroPrueba));
  t.ok(r.filas?.[0].n === 2, 'supervisor ve todas las marcaciones');
  r = await como(c, 'supervisor', sup, 'SELECT count(*)::int n FROM api.lista_catering() WHERE empleado_id LIKE $1', ['TEST_%']);
  t.ok(r.filas?.[0].n === 1, 'catering lista solo almuerzo SI');
  r = await como(c, 'supervisor', sup, test('api.auditoria'));
  t.ok(r.codigo === '42501', 'supervisor no lee auditoría');
  r = await como(c, 'supervisor', sup, test('api.whatsapp_logs'));
  t.ok(r.codigo === '42501', 'supervisor no lee logs de WhatsApp');

  // ── supervisor_admin / admin ──
  r = await como(c, 'supervisor_admin', sup, test('api.auditoria'));
  t.ok(!r.error, 'supervisor_admin lee auditoría');
  r = await como(c, 'admin', sup, test('api.whatsapp_logs'));
  t.ok(!r.error, 'admin lee logs de WhatsApp');

  // ── auditoría ──
  await c.query(`UPDATE core.empleados SET area = 'CAMBIO' WHERE id = $1`, [EMP_B]);
  const a = await c.query(`SELECT count(*)::int n FROM core.auditoria WHERE tabla = 'empleados' AND clave = $1 AND accion = 'UPDATE'`, [EMP_B]);
  t.ok(a.rows[0].n === 1, 'los cambios quedan en auditoría');
}
