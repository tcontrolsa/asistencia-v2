// Fase 5 (bloque E): configuración, plantillas, cola y logs de WhatsApp (sin llaves en la base del panel)
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
    ('W_A','ANA WA','TI','ANALISTA','EMPLEADO','0987654321'), ('W_S','SARA WA','TI','JEFA','SUPERVISOR', NULL),
    ('W_M','MARIO WA','TI','JEFE','SUPERVISOR_ADMIN', NULL)`);
  await c.query(`SET LOCAL app.etl = 'off'`);
  const sup = { usuario: 'W_S', empleado_id: 'W_S' }, adm = { usuario: 'W_M', empleado_id: 'W_M' };

  let r = await como(c, 'supervisor', sup, `SELECT api.sup_guardar_whatsapp_config('{"activo":true}'::jsonb) v`);
  t.ok(r.codigo === '42501', 'la configuración de WhatsApp es de Sup. Admin');
  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_guardar_whatsapp_config($1::jsonb) v`,
                 [JSON.stringify({ servidorUrl: 'http://owa.local:2785', activo: true, autoEnvioNoRegistro: true, horaCorteNoRegistro: '08:20', enlaceApp: 'https://app' })]);
  t.ok(r.v?.config?.autoEnvioNoRegistro === true && r.v?.config?.horaCorteNoRegistro === '08:20', 'se guarda la configuración del panel');
  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_guardar_whatsapp_config('{"apiKey":"x"}'::jsonb) v`);
  t.ok(r.codigo === '22023', 'la API key no se acepta desde el panel');

  // El worker real puede estar latiendo contra esta base: se quita su latido solo dentro de la prueba
  await c.query(`DELETE FROM core.configuracion WHERE clave = 'whatsapp_worker'`);
  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_guardar_plantilla_wa('custom_1', 'Comunicado', 'Hola {nombre}', 'data:image/jpeg;base64,AAAA') v`);
  let p = await como(c, 'supervisor', sup, `SELECT api.sup_whatsapp_plantillas() v`);
  t.ok(r.v?.ok && p.v?.plantillas?.custom_1?.personalizada === true && p.v?.plantillas?.custom_1?.imagen?.startsWith('data:image/jpeg'),
       'plantilla personalizada con imagen, legible por supervisores para componer mensajes');
  t.ok(p.v?.servicio?.conectado === false, 'sin latido del worker el servicio figura desconectado');
  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_guardar_plantilla_wa('no_registro', 'Entrada', 'x', 'javascript:alert(1)') v`);
  t.ok(r.codigo === '22023', 'solo imágenes data:image válidas');
  r = await como(c, 'supervisor_admin', adm, `SELECT api.sup_eliminar_plantilla_wa('no_registro') v`);
  t.ok(r.codigo === '22023', 'las plantillas del sistema no se eliminan');

  r = await como(c, 'supervisor', sup, `SELECT api.sup_encolar_whatsapp($1::jsonb, 'no_registro', 'MANUAL') v`, [JSON.stringify([
    { empleadoId: 'W_A', nombre: 'ANA WA', telefono: '0987654321', mensaje: 'Hola Ana' },
    { empleadoId: 'W_S', nombre: 'SARA WA', telefono: '', mensaje: 'Hola Sara' }])]);
  const cola = (await c.query(`SELECT payload FROM core.cola_notificaciones WHERE tipo = 'WHATSAPP_MENSAJE' ORDER BY id DESC LIMIT 1`)).rows[0];
  t.ok(r.v?.encolados === 1 && r.v?.sinTelefono === 1 && cola?.payload?.telefono === '593987654321', 'mensajes en cola con el número normalizado; sin teléfono queda en el log');
  const logs = await como(c, 'supervisor_admin', adm, `SELECT api.sup_whatsapp_logs(10) v`);
  const estados = (logs.v || []).slice(0, 2).map(l => l.estado).sort().join(',');
  t.ok(estados === 'EN_COLA,SIN_TELEFONO', 'auditoría de envíos con su estado');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_whatsapp_logs(10) v`);
  t.ok(r.codigo === '42501', 'los logs son de Sup. Admin');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_guardar_telefono('W_S', '0991112233') v`);
  const tel = (await c.query(`SELECT telefono FROM core.empleados WHERE id = 'W_S'`)).rows[0].telefono;
  t.ok(r.v?.ok && tel === '593991112233', 'el supervisor registra el celular normalizado');
  r = await como(c, 'supervisor', sup, `SELECT api.sup_guardar_telefono('W_S', '123') v`);
  t.ok(r.codigo === '22023', 'número inválido rechazado');
}
