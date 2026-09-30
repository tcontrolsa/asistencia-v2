// Fase 5 (bloque D): emergencias, menú semanal, Cultura Tcontrol e invitados desde el panel
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
  await c.query(`INSERT INTO core.empleados (id, nombre, area, cargo, rol, telefono) VALUES
    ('S_A','ANA SERV','TI','ANALISTA','EMPLEADO', NULL), ('S_S','SARA SERV','TI','JEFA','SUPERVISOR', NULL),
    ('S_M','MARIO SERV','TI','JEFE','SUPERVISOR_ADMIN','593999000111')`);
  await c.query(`INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, estado_emergencia, estado_emergencia_ts)
                 VALUES ('S_A', 'ENTRADA', private.hoy(), '07:20', 'Requiere ayuda - Me lastimé', now())`);
  await c.query(`INSERT INTO core.solicitudes_invitados (id, fecha, hora, subtipo, cantidad, invitado, empleado_nombre, estado) VALUES
    ('inv_s1', private.hoy(), '08:00', 'ALMUERZO_EXTRA', 3, 'CLIENTE X', 'SARA SERV', 'SOLICITADO')`);
  await c.query(`DELETE FROM core.menu_semanal`);
  await c.query(`INSERT INTO core.menu_semanal (dia, sopa, plato, jugo) VALUES ('lunes', 'Locro', 'Seco de pollo', 'Mora')`);
  await c.query(`SET LOCAL app.etl = 'off'`);
  const sup = { usuario: 'S_S', empleado_id: 'S_S' };
  const emp = { usuario: 'S_A', empleado_id: 'S_A' };

  let r = await como(c, 'supervisor', sup, `SELECT api.sup_emergencia_estado() v`);
  const rep = (r.v?.reportes || []).find(x => x.empleadoId === 'S_A');
  t.ok(rep?.estado === 'Requiere ayuda - Me lastimé' && /^\d{2}:\d{2}$/.test(rep?.hora || ''), 'estado de emergencia reportado hoy, con su hora');
  r = await como(c, 'empleado', emp, `SELECT api.sup_emergencia_estado() v`);
  t.ok(r.codigo === '42501', 'un empleado no ve los reportes de emergencia de todos');

  const hist0 = (await c.query(`SELECT count(*)::int n FROM core.historial_menu`)).rows[0].n;
  r = await como(c, 'supervisor', sup, `SELECT api.sup_guardar_menu($1::jsonb) v`,
                 [JSON.stringify({ lunes: { sopa: ' Crema de zapallo ', plato: 'Lomo', jugo: '' }, martes: { sopa: 'Caldo' } })]);
  const menu = (await c.query(`SELECT dia, sopa, plato FROM core.menu_semanal ORDER BY dia`)).rows;
  const arch = (await c.query(`SELECT dia, sopa FROM core.historial_menu ORDER BY id DESC LIMIT 1`)).rows[0];
  t.ok(r.v?.ok && menu.length === 7 && menu.find(x => x.dia === 'lunes').sopa === 'Crema de zapallo' && menu.find(x => x.dia === 'viernes').sopa === '',
       'el menú se publica para los 7 días');
  t.ok((await c.query(`SELECT count(*)::int n FROM core.historial_menu`)).rows[0].n === hist0 + 1 && arch.dia === 'Lunes' && arch.sopa === 'Locro',
       'el menú anterior se archiva en el histórico');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_menu() v`);
  t.ok(r.v?.menu?.lunes?.plato === 'Lomo' && r.v?.sugerencias?.sopas.includes('Locro'), 'menú actual y sugerencias del histórico');

  r = await como(c, 'supervisor', sup, `SELECT api.sup_guardar_cultura($1::jsonb) v`, [JSON.stringify([
    { id: 'q_test', tipo: 'OTRO', pilar: 'Equipo', iconoPilar: '🤝', pregunta: '¿Prueba?', pista: 'Pista',
      opciones: [{ letra: 'A', texto: 'Sí', correcta: true }, { letra: 'B', texto: 'No', correcta: false }], activo: true }])]);
  const banco = (await c.query(`SELECT id, icono_pilar FROM core.cultura_preguntas`)).rows;
  t.ok(r.v?.ok && banco.length === 1 && banco[0].icono_pilar === '🤝', 'el banco de preguntas se reemplaza completo');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_guardar_cultura($1::jsonb) v`, [JSON.stringify([{ id: 'x', pregunta: '¿?', opciones: [{ texto: 'A' }] }])]);
  t.ok(r.codigo === '22023' && (await c.query(`SELECT count(*)::int n FROM core.cultura_preguntas`)).rows[0].n === 1,
       'una pregunta con menos de 2 opciones se rechaza y no cambia nada');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_cultura_global(false) v`);
  r = await como(c, 'empleado', emp, `SELECT api.cultura_pregunta_del_dia() v`);
  t.ok(r.v?.habilitada === false, 'el interruptor general desactiva la trivia para todos');

  r = await como(c, 'supervisor', sup, `SELECT api.sup_estado_invitado('inv_s1', 'CONFIRMADO') v`);
  const inv = (await c.query(`SELECT estado, actualizado_por FROM core.solicitudes_invitados WHERE id = 'inv_s1'`)).rows[0];
  t.ok(r.v?.ok && inv.estado === 'CONFIRMADO' && inv.actualizado_por === 'SARA SERV', 'cambio de estado del pedido con quien lo hizo');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_notificar_invitados(ARRAY['inv_s1']) v`);
  t.ok(r.v?.destinatarios >= 1 && r.v?.pedidos === 1, 'recordatorio a los Sup. Admin con teléfono, en cola');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_eliminar_invitado('inv_s1') v`);
  const cola = (await c.query(`SELECT payload FROM core.cola_notificaciones WHERE tipo = 'CANCELACION_INVITADO' ORDER BY id DESC LIMIT 1`)).rows[0];
  t.ok(r.v?.ok && cola?.payload?.invitado === 'CLIENTE X' && cola?.payload?.eliminadoPor === 'SARA SERV',
       'eliminar un pedido deja el aviso de cancelación en cola');
  r = await como(c, 'empleado', emp, `SELECT api.sup_estado_invitado('inv_s1', 'CONFIRMADO') v`);
  t.ok(r.codigo === '42501', 'un empleado no gestiona pedidos');
}
