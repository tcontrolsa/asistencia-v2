// Fase 5 (bloque G): radar, configuración del sistema, supervisores, restablecimiento de contraseñas y estado
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
    ('AX_E','ANA AUX','TI','ANALISTA','EMPLEADO'), ('AX_S','SARA AUX','TI','JEFA','SUPERVISOR'), ('AX_M','MARIO AUX','TI','JEFE','SUPERVISOR_ADMIN')`);
  await c.query(`INSERT INTO private.credenciales (usuario, tipo_cuenta, password_hash, debe_cambiar) VALUES
    ('AX_E','EMPLEADO','x',false), ('AX_S','EMPLEADO','x',false), ('AX_M','EMPLEADO','x',false)`);
  await c.query(`INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, lat, lng) VALUES ('AX_E', 'ENTRADA', private.hoy(), '07:20', -0.129, -78.478)`);
  await c.query(`SET LOCAL app.etl = 'off'`);
  const sup = { usuario: 'AX_S', empleado_id: 'AX_S' }, adm = { usuario: 'AX_M', empleado_id: 'AX_M' };

  let r = await como(c, 'supervisor', sup, `SELECT api.sup_radar() v`);
  const ax = (r.v?.empleados || []).find(e => e.id === 'AX_E');
  t.ok(r.v?.empresa?.radio > 0 && ax?.registros?.[0]?.lat === -0.129, 'radar: geocerca de la configuración y marcaciones de hoy con coordenadas');

  r = await como(c, 'supervisor', sup, `SELECT api.sup_config_sistema() v`);
  t.ok(r.codigo === '42501', 'la configuración del sistema es de Sup. Admin');
  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_config_sistema() v`);
  const cfg = r.v;
  t.ok(cfg?.horarios?.hora_inicio === '07:30' && cfg?.supervisores?.some(x => x.id === 'AX_S'), 'lectura de configuración, horarios y supervisores');
  const nuevo = { ...cfg, ubicacion: { lat: -0.13, lng: -78.47, radio: 300 }, horarios: { ...cfg.horarios, hora_almuerzo: '09:45' } };
  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_guardar_config_sistema($1::jsonb) v`, [JSON.stringify(nuevo)]);
  const s = (await c.query(`SELECT valor FROM core.configuracion WHERE clave = 'sistema'`)).rows[0].valor;
  t.ok(r.v?.ok && s.ubicacion.radio === 300 && s.horarios.hora_almuerzo === '09:45' && s.otras?.whatsapp_number === cfg.otras?.whatsapp_number, 'guardar conserva el resto de la configuración');
  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_guardar_config_sistema($1::jsonb) v`, [JSON.stringify({ ...nuevo, ubicacion: { lat: 200, lng: 0 } })]);
  t.ok(r.codigo === '22023', 'coordenadas inválidas rechazadas');

  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_config_supervisor('AX_E', true) v`);
  t.ok(r.v?.ok && (await c.query(`SELECT rol FROM core.empleados WHERE id = 'AX_E'`)).rows[0].rol === 'SUPERVISOR', 'agregar supervisor por ID');
  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_config_supervisor('AX_E', false) v`);
  t.ok(r.v?.ok && (await c.query(`SELECT rol FROM core.empleados WHERE id = 'AX_E'`)).rows[0].rol === 'EMPLEADO', 'quitar supervisor');

  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_resetear_contrasenas_todos('borrar') v`);
  t.ok(r.codigo === '22023', 'el restablecimiento exige escribir BORRAR');
  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_resetear_contrasenas_todos('BORRAR') v`);
  const hashes = Object.fromEntries((await c.query(`SELECT usuario, password_hash FROM private.credenciales WHERE usuario LIKE 'AX_%'`)).rows.map(x => [x.usuario, x.password_hash]));
  t.ok(r.v?.ok && hashes.AX_E === null && hashes.AX_S === null && hashes.AX_M === 'x', 'restablece empleados y supervisores; no las cuentas de Sup. Admin');

  r = await como(c, 'supervisor', sup, `SELECT api.sup_estado_sistema() v`);
  t.ok(r.v?.servidor?.hoy && r.v?.migracion && r.v?.datos?.marcacionesHoy >= 1, 'estado del sistema');
}
