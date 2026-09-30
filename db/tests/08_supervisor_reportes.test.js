// Fase 5 (bloque C): forma legado de las novedades importadas y solicitudes de invitados por rango
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
    ('R_A','ANA REP','TI','ANALISTA','EMPLEADO'), ('R_S','SARA REP','TI','JEFA','SUPERVISOR')`);
  // Novedades importadas de Firestore: con 'justificado' vacío y con 'NO' explícito; y una de la hoja de Sheets
  await c.query(`INSERT INTO core.novedades (empleado_id, fecha, tipo, justificado, origen, legacy_id, legacy_raw) VALUES
    ('R_A', '2026-08-13', 'TRABAJO_DE_CAMPO', 'NO', 'IMPORTADO', 'fs_r1',
     '{"justificado":"","hora":"","timestamp":"Thu Aug 13 2026 08:18:43 GMT-0500 (hora de Ecuador)"}'),
    ('R_A', '2026-08-14', 'PERMISO_MEDICO', 'NO', 'IMPORTADO', 'fs_r2',
     '{"justificado":"NO","hora":"09:05","timestamp":"Fri Aug 14 2026 10:00:00 GMT-0500 (hora de Ecuador)"}'),
    ('R_A', '2026-08-17', 'FALTA', 'NO', 'IMPORTADO', 'hoja_r3', '{"fuente":"REGISTROS","justificado":""}')`);
  await c.query(`INSERT INTO core.solicitudes_invitados (id, fecha, hora, subtipo, cantidad, invitado, estado) VALUES
    ('inv_r1', '2025-03-10', '10:00', 'ALMUERZO_EXTRA', 2, 'VISITA', 'SOLICITADO'),
    ('inv_r2', '2025-06-10', '10:00', 'ALMUERZO_EXTRA', 1, 'OTRA', 'SOLICITADO')`);
  await c.query(`SET LOCAL app.etl = 'off'`);
  const sup = { usuario: 'R_S', empleado_id: 'R_S' };

  let r = await como(c, 'supervisor', sup, `SELECT api.sup_registros('2026-08-13', '2026-08-17', 'R_A') v`);
  const porFecha = Object.fromEntries((r.v || []).map(x => [x.fecha, x]));
  t.ok(porFecha['2026-08-13']?.justificado === 'SI' && porFecha['2026-08-13']?.hora === '08:18:43',
       'novedad de Firestore sin valor: justificada y con la hora de su timestamp, como la veía el legado');
  t.ok(porFecha['2026-08-14']?.justificado === 'NO' && porFecha['2026-08-14']?.hora === '09:05:00',
       'un "NO" explícito se respeta y la hora del documento prevalece');
  t.ok(porFecha['2026-08-17']?.justificado === 'NO' && porFecha['2026-08-17']?.hora === '00:00:00',
       'las filas de la hoja de Sheets no cambian');
  const guardado = (await c.query(`SELECT justificado FROM core.novedades WHERE legacy_id = 'fs_r1'`)).rows[0].justificado;
  t.ok(guardado === 'NO', 'los datos guardados no se modifican');

  r = await como(c, 'supervisor', sup, `SELECT api.sup_solicitudes_invitados('2025-01-01', '2025-04-30') v`);
  t.ok(Array.isArray(r.v) && r.v.length === 1 && r.v[0].id === 'inv_r1' && !('legacy_raw' in r.v[0]),
       'solicitudes de invitados de un rango antiguo (reportes de períodos pasados)');
  r = await como(c, 'empleado', { usuario: 'R_A', empleado_id: 'R_A' }, `SELECT api.sup_solicitudes_invitados('2025-01-01', '2025-04-30') v`);
  t.ok(r.codigo === '42501', 'un empleado no lee las solicitudes de todos');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_solicitudes_invitados('2025-05-01', '2025-01-01') v`);
  t.ok(r.codigo === '22023', 'rango invertido rechazado');
}
