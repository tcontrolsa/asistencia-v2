// Fase 7: copia nocturna de Firestore (registros y empleados) y reporte diario de diferencias
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
const copiar = (c, col, docs, completo = true) =>
  como(c, 'tcontrol_worker', null, `SELECT private.worker_copia_legado($1, $2, $3) v`, [col, JSON.stringify(docs), completo]);

export default async function (c, t) {
  // Estado limpio dentro de la transacción de prueba (la base de desarrollo ya tiene la copia real)
  await c.query(`DELETE FROM core.legado_documentos`);
  await c.query(`DELETE FROM core.tareas_ejecuciones`);

  const empleados = [
    { id: 'PL_E', data: { id: 'PL_E', nombre: 'PARALELO ELENA', area: 'TI', cargo: 'ANALISTA', activo: 'SI', telefono: '0991111111',
                          supervisor: 'NO', pin: '1234', deviceToken: 'DEV_X' } },
    { id: 'PL_S', data: { id: 'PL_S', nombre: 'PARALELO SUP', area: 'TI', cargo: 'JEFE', activo: 'SI', supervisor: 'SUPERVISOR ADMIN' } },
  ];
  let r = await copiar(c, 'empleados', empleados);
  t.ok(r.v?.altas === 2, 'altas de colaboradores creados en el legado' + (r.error ? ` (${r.error})` : ''));
  const e = await uno(c, `SELECT e.rol::text rol, e.activo, e.telefono, c.password_hash IS NULL sin_pass FROM core.empleados e
                          JOIN private.credenciales c ON c.usuario = e.id WHERE e.id = 'PL_S'`);
  t.ok(e?.rol === 'SUPERVISOR_ADMIN' && e.activo && e.sin_pass, 'rol según el selector del legado; crea su contraseña al ingresar');
  const raw = (await uno(c, `SELECT data FROM core.legado_documentos WHERE coleccion = 'empleados' AND doc_id = 'PL_E'`)).data;
  t.ok(!('pin' in raw) && !('deviceToken' in raw), 'la copia nunca guarda el PIN ni el token del legado');
  empleados[0].data.area = 'BODEGA';
  r = await copiar(c, 'empleados', empleados);
  t.ok(r.v?.actualizados === 1 && (await uno(c, `SELECT area FROM core.empleados WHERE id = 'PL_E'`)).area === 'BODEGA', 'cambios de ficha del legado');

  const registros = [
    { id: 'doc1', data: { empleadoId: 'PL_E', nombre: 'PARALELO ELENA', fecha: '2026-10-05', hora: '07:40:12', tipo: 'ENTRADA', almuerzo: 'SI',
                          modo: 'OFICINA', horasExtra: 'NO', dispositivo: 'DEV_1', timestamp: '2026-10-05T12:40:12Z' } },
    // Sin fecha: se toma la del timestamp en Guayaquil (normalizarRegistroDesdeTimestamp)
    { id: 'doc2', data: { empleadoId: 'PL_E', tipo: 'SALIDA', hora: '16:20:00', modo: 'OFICINA', timestamp: '2026-10-05T21:20:00Z',
                          permiso_personal_mins: 30 } },
    { id: 'doc3', data: { empleadoId: 'PL_S', fecha: '2026-10-05', tipo: 'Vacacion', razon_ausencia: 'Vacación', justificado: 'SI',
                          timestamp: '2026-10-05T13:00:00Z' } },
  ];
  r = await copiar(c, 'registros', registros);
  t.ok(r.v?.marcacionesNuevas === 2 && r.v.novedadesCopiadas === 1 && r.v.ajustesDia === 1, 'registros → marcaciones, novedad y minutos de permiso');
  const sal = await uno(c, `SELECT to_char(fecha, 'YYYY-MM-DD') f, to_char(hora, 'HH24:MI') h, legacy_id FROM core.marcaciones WHERE legacy_id = 'fs:doc2'`);
  t.ok(sal?.f === '2026-10-05' && sal.h === '16:20', 'fecha desde el timestamp cuando el documento no la trae');
  t.ok((await uno(c, `SELECT tipo FROM core.novedades WHERE legacy_id = 'fs:doc3'`))?.tipo === 'VACACIONES', 'tipo normalizado (Vacacion → VACACIONES)');
  r = await copiar(c, 'registros', registros);
  t.ok(r.v?.marcacionesNuevas === 0 && r.v.marcacionesActualizadas === 0 && r.v.novedadesCopiadas === 0, 'copia idempotente');

  // El legado corrige una hora y borra un registro
  registros[0].data.hora = '07:20:00';
  r = await copiar(c, 'registros', registros.filter(x => x.id !== 'doc3'));
  t.ok(r.v?.marcacionesActualizadas === 1 && r.v.novedadesRetiradas === 1
       && (await uno(c, `SELECT to_char(hora, 'HH24:MI') h FROM core.marcaciones WHERE legacy_id = 'fs:doc1'`)).h === '07:20',
    'correcciones y borrados del legado se reflejan');
  // Una lista incompleta (error de red) no borra nada
  r = await copiar(c, 'registros', []);
  t.ok(r.v?.marcacionesRetiradas === undefined && !!(await uno(c, `SELECT 1 x FROM core.marcaciones WHERE legacy_id = 'fs:doc1'`)),
    'una copia vacía o parcial no borra registros');
  // Lo editado en la base nueva no se pisa
  await c.query(`UPDATE core.marcaciones SET editado_en = now(), hora = '07:10' WHERE legacy_id = 'fs:doc1'`);
  registros[0].data.hora = '07:25:00';
  await copiar(c, 'registros', registros);
  t.ok((await uno(c, `SELECT to_char(hora, 'HH24:MI') h FROM core.marcaciones WHERE legacy_id = 'fs:doc1'`)).h === '07:10', 'no pisa lo editado en la base nueva');

  r = await como(c, 'tcontrol_worker', null, `SELECT private.worker_paralelo_datos('2026-10-05', '2026-10-05') v`);
  t.ok(r.v?.firestore?.some(x => x.id === 'doc1') && r.v.nuevo.some(x => x.empleadoId === 'PL_E') && Array.isArray(r.v.fichas),
    'datos para comparar: vista del legado y de la base nueva');

  // Tareas externas: una vez por día, a su hora
  r = await uno(c, `SELECT private.worker_tarea_externa('copia_legado', '2026-10-06 00:10') v`);
  t.ok(r.v === null, 'antes de su hora no corre');
  r = await uno(c, `SELECT private.worker_tarea_externa('copia_legado', '2026-10-06 00:20') v`);
  const r2 = await uno(c, `SELECT private.worker_tarea_externa('copia_legado', '2026-10-06 00:25') v`);
  t.ok(r.v === '2026-10-06' && r2.v === null, 'se reclama una sola vez por día');

  // Reporte para Sup. Admin
  await c.query(`SELECT private.worker_paralelo_guardar('2026-10-05', '{"dia":{"iguales":10,"conDiferencias":1,"sinExplicar":0}}', '[{"id":"PL_E"}]')`);
  r = await como(c, 'supervisor_admin', { usuario: 'PL_S', empleado_id: 'PL_S' }, `SELECT api.sup_paralelo('2026-10-05') v`);
  t.ok(r.v?.reporte?.diferencias?.[0]?.id === 'PL_E' && r.v.dias.some(x => x.fecha === '2026-10-05'), 'Sup. Admin ve el reporte diario');
  r = await como(c, 'supervisor', { usuario: 'PL_S', empleado_id: 'PL_S' }, `SELECT api.sup_paralelo() v`);
  t.ok(r.codigo === '42501', 'un supervisor no ve el reporte');
  r = await como(c, 'tcontrol_worker', null, `SELECT count(*) FROM core.legado_documentos`);
  t.ok(r.codigo === '42501', 'el worker no lee la copia directamente');
}
