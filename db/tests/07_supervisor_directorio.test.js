// Fase 5 (bloque B): directorio (ficha, alta, roles, almuerzo sin asignar)
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

export default async function (c, t) {
  await c.query(`SET LOCAL app.etl = 'on'`);
  await c.query(`INSERT INTO core.empleados (id, nombre, area, cargo, rol) VALUES
    ('D_A','ANA DIR','TI','ANALISTA','EMPLEADO'), ('D_S','SARA DIR','TI','JEFA','SUPERVISOR'),
    ('D_M','MARIO DIR','TI','JEFE','SUPERVISOR_ADMIN'), ('D_X','XAVI ADMIN','TI','GERENTE','ADMIN')`);
  await c.query(`SET LOCAL app.etl = 'off'`);
  const sup = { usuario: 'D_S', empleado_id: 'D_S' }, adm = { usuario: 'D_M', empleado_id: 'D_M' }, root = { usuario: 'D_X', empleado_id: 'D_X' };
  const emp = async id => (await c.query(`SELECT * FROM core.empleados WHERE id = $1`, [id])).rows[0];

  let r = await como(c, 'supervisor', sup, `SELECT api.sup_guardar_ficha('D_A', 'ANA DIR', 'ti', 'Pasante de sistemas', '0987654321', '1995-04-09', 'NO', 'SI', 'NO') v`);
  let e = await emp('D_A');
  t.ok(r.v?.ok && e.area === 'TI' && e.telefono === '593987654321' && e.es_pasante && !e.cultura_habilitada,
       'el supervisor edita la ficha: área en mayúsculas, teléfono normalizado y clasificación por cargo');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_guardar_ficha('D_A', 'ANA DIR', 'TI', 'ANALISTA', NULL, NULL, 'SI') v`);
  t.ok(r.codigo === '42501' && (await emp('D_A')).cargo !== 'ANALISTA', 'un supervisor no cambia niveles de acceso (y no se guarda nada)');
  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_guardar_ficha('D_A', 'ANA DIR', 'TI', 'ANALISTA', NULL, NULL, 'SI') v`);
  t.ok(r.v?.ok && (await emp('D_A')).rol === 'SUPERVISOR', 'el Sup. Admin asigna Supervisor');
  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_guardar_ficha('D_A', 'ANA DIR', 'TI', 'ANALISTA', NULL, NULL, 'SUPERVISOR ADMIN') v`);
  t.ok(r.codigo === '42501', 'solo el Admin asigna Supervisor Admin');
  r = await como(c, 'admin', root, `SELECT api.sup_guardar_ficha('D_X', 'XAVI ADMIN', 'TI', 'GERENTE', NULL, NULL, 'NO') v`);
  t.ok(r.v?.ok && (await emp('D_X')).rol === 'ADMIN', 'el rol ADMIN no se cambia desde la ficha');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_guardar_ficha('D_A', 'ANA DIR', 'TI', 'ANALISTA', NULL, NULL, NULL, 'NO') v`);
  t.ok(r.codigo === '42501', 'dar de baja es de Admin y Sup. Admin');

  r = await como(c, 'supervisor', sup, `SELECT api.sup_crear_empleado('D_N', 'NUEVO DIR', 'bodega', 'Operario', '0991112233', NULL, 'NO', '1712345678') v`);
  e = await emp('D_N');
  const cred = (await c.query(`SELECT password_hash, tipo_cuenta FROM private.credenciales WHERE usuario = 'D_N'`)).rows[0];
  const cola = (await c.query(`SELECT count(*)::int n FROM core.cola_notificaciones WHERE tipo = 'NUEVO_EMPLEADO' AND payload->>'id' = 'D_N'`)).rows[0].n;
  t.ok(r.v?.ok && e.activo && e.area === 'BODEGA' && e.cedula === '1712345678' && cred?.password_hash === null && cola === 1,
       'alta: colaborador activo, sin contraseña (la crea con su cédula) y aviso de bienvenida en cola');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_crear_empleado('D_N', 'OTRO', 'TI', 'X') v`);
  t.ok(/Ya existe/.test(r.error || ''), 'no se repite un ID');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_crear_empleado('D_P', 'OTRO', 'TI', 'X', NULL, NULL, 'SI') v`);
  t.ok(r.codigo === '42501', 'un supervisor no crea supervisores');

  await c.query(`SET LOCAL app.etl = 'on'`);
  await c.query(`INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, almuerzo) VALUES ('D_N', 'ENTRADA', private.hoy(), '07:20', true)`);
  await c.query(`SET LOCAL app.etl = 'off'`);
  r = await como(c, 'supervisor', sup, `SELECT api.sup_cambiar_almuerzo('D_N', '') v`);
  const alm = (await c.query(`SELECT almuerzo FROM core.marcaciones WHERE empleado_id = 'D_N'`)).rows[0].almuerzo;
  t.ok(r.v?.ok && alm === null, 'el almuerzo de hoy puede quedar sin asignar');
}
