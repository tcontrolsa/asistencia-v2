// Fase 5 (bloque F): Opciones adicionales del Administrador General
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
    ('OPC_E1','EMPLEADO OPC 1','TI','ANALISTA','EMPLEADO'), ('OPC_E2','EMPLEADO OPC 2','VENTAS','EJECUTIVO','EMPLEADO'),
    ('OPC_M','MARIO OPC','TI','JEFE','SUPERVISOR_ADMIN'), ('OPC_X','XAVI OPC','TI','GERENTE','ADMIN')`);
  await c.query(`INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora) VALUES ('OPC_E1', 'ENTRADA', private.hoy() - 3, '07:20')`);
  await c.query(`SET LOCAL app.etl = 'off'`);
  const adm = { usuario: 'OPC_M', empleado_id: 'OPC_M' }, root = { usuario: 'OPC_X', empleado_id: 'OPC_X' };
  const emp = async id => (await c.query(`SELECT * FROM core.empleados WHERE id = $1`, [id])).rows[0];

  let r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_opciones_datos() v`);
  t.ok(r.codigo === '42501', 'Opciones es exclusivo del Administrador General');

  r = await como(c, 'admin', root, `SELECT api.sup_carga_masiva_empleados($1::jsonb) v`, [JSON.stringify([
    { id: 'OPC_N1', nombre: 'NUEVO UNO', area: 'bodega', cargo: 'Operario', cedula: '1712345678', telefono: '0991234567', supervisor: 'SI', activo: 'SI' },
    { id: 'OPC_E2', nombre: 'EMPLEADO OPC DOS', area: 'VENTAS', cargo: 'Pasante de ventas' },
    { id: 'mal id!', nombre: 'X' }])]);
  const n1 = await emp('OPC_N1'), e2 = await emp('OPC_E2');
  const cred = (await c.query(`SELECT password_hash FROM private.credenciales WHERE usuario = 'OPC_N1'`)).rows[0];
  t.ok(r.v?.creados === 1 && r.v?.actualizados === 1 && r.v?.omitidos?.length === 1, 'carga masiva: crea, actualiza y reporta omitidos');
  t.ok(n1.area === 'BODEGA' && n1.rol === 'SUPERVISOR' && n1.telefono === '593991234567' && n1.fecha_ingreso && cred && cred.password_hash === null,
       'el nuevo queda con su rol, teléfono normalizado y crea su contraseña con la cédula');
  t.ok(e2.nombre === 'EMPLEADO OPC DOS' && e2.es_pasante, 'la actualización recalcula la clasificación por cargo');

  r = await como(c, 'admin', root, `SELECT api.sup_asignar_rol('OPC_E1', 'SUPERVISOR ADMIN') v`);
  t.ok(r.v?.rol === 'SUPERVISOR ADMIN' && (await emp('OPC_E1')).rol === 'SUPERVISOR_ADMIN', 'el Admin asigna Supervisor Admin');
  r = await como(c, 'admin', root, `SELECT api.sup_asignar_rol('OPC_X', 'NO') v`);
  t.ok(r.codigo === '22023', 'el rol del Administrador General es permanente');

  r = await como(c, 'admin', root, `SELECT api.sup_desvincular_colaborador('OPC_E1', NULL, 'Renuncia voluntaria', 'Entrega de equipos') v`);
  const d = (await c.query(`SELECT * FROM core.desvinculaciones WHERE empleado_id = 'OPC_E1'`)).rows[0];
  const marc = (await c.query(`SELECT count(*)::int n FROM core.marcaciones WHERE empleado_id = 'OPC_E1'`)).rows[0].n;
  const hoy = (await c.query(`SELECT to_char(private.hoy(), 'YYYY-MM-DD') h`)).rows[0].h;
  t.ok(r.v?.ok && !(await emp('OPC_E1')).activo && d?.motivo === 'Renuncia voluntaria' && marc === 1 && d.snapshot?.nombre,
       'desvincular: queda inactivo, con ficha respaldada y sin perder su histórico');
  r = await como(c, 'admin', root, `SELECT to_char(fecha, 'YYYY-MM-DD') FROM core.desvinculaciones WHERE empleado_id = 'OPC_E1'`);
  t.ok(r.v === hoy, 'sin fecha, la salida es el día oficial (Guayaquil)');
  r = await como(c, 'admin', root, `SELECT api.sup_desvincular_colaborador('OPC_E1') v`);
  t.ok(r.codigo === '22023', 'no se desvincula dos veces');

  r = await como(c, 'admin', root, `SELECT api.sup_eliminar_colaboradores(ARRAY['OPC_E2','OPC_X']) v`);
  const e2b = await emp('OPC_E2');
  t.ok(r.v?.totalEliminados === 1 && !e2b.activo && e2b.eliminado_en && (await emp('OPC_X')).activo,
       'eliminar da de baja sin borrar y nunca afecta al Administrador General');

  r = await como(c, 'admin', root, `SELECT api.sup_opciones_datos() v`);
  const lista = r.v?.desvinculados || [];
  t.ok(lista.some(x => x.id === 'OPC_E1' && x.origen === 'ARCHIVADO' && x.totalRegs === 1) && lista.some(x => x.id === 'OPC_E2' && x.origen === 'INACTIVO_BASE'),
       'historial: archivados e inactivos en base con sus registros');

  const antes = (await c.query(`SELECT api.version_forzada() v`)).rows[0].v;
  r = await como(c, 'admin', root, `SELECT api.sup_forzar_actualizacion() v`);
  const ctx = (await c.query(`SELECT (private.cfg('sistema') ->> 'forzar_actualizacion')::bigint v`)).rows[0].v;
  t.ok(r.v?.ok && Number(ctx) > Number(antes), 'la orden de actualización llega a la marca que leen la app y las terminales');
  r = await como(c, 'anon', {}, `SELECT api.version_forzada() v`);
  t.ok(Number(r.v) === Number(ctx), 'las terminales consultan la marca sin sesión');
}
