// Fase 2: login, primer ingreso, bloqueo, dispositivo, cambio/reseteo de contraseña, guardias
// y validación de cada petición (private.verificar_sesion). Todo se revierte al final.
import crypto from 'node:crypto';

const EMP = 'TEST_EMP', EMP2 = 'TEST_EMP2', SUP = 'TEST_SUP', ADM = 'TEST_ADM', INACT = 'TEST_INACT';
const CEDULA = '0912345678';

// Ejecuta como un rol, con claims y ruta de petición, igual que PostgREST
async function como(c, rol, claims, sql, params = [], ruta = '/rpc/x') {
  await c.query('SAVEPOINT p');
  try {
    await c.query(`SET LOCAL ROLE ${rol}`);
    await c.query(`SELECT set_config('request.jwt.claims', $1, true), set_config('request.path', $2, true)`,
                  [JSON.stringify(claims), ruta]);
    const r = await c.query(sql, params);
    const estado = (await c.query(`SELECT current_setting('response.status', true) s`)).rows[0].s;
    await c.query('RELEASE SAVEPOINT p');
    await c.query('RESET ROLE');
    await c.query(`SELECT set_config('response.status', '', true)`);
    return { filas: r.rows, v: r.rows[0] && Object.values(r.rows[0])[0], estado };
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT p');
    await c.query('RESET ROLE');
    return { error: e.message, codigo: e.code };
  }
}
const anon = (c, sql, params) => como(c, 'anon', {}, sql, params);

function decodificar(token, secreto) {
  const [h, p, f] = token.split('.');
  const esperado = crypto.createHmac('sha256', secreto).update(`${h}.${p}`).digest('base64url');
  return { valido: esperado === f, claims: JSON.parse(Buffer.from(p, 'base64url').toString()) };
}
// Claims de un token, como los dejaría PostgREST en request.jwt.claims
const claimsDe = (token, secreto) => decodificar(token, secreto).claims;

export default async function (c, t) {
  const secreto = (await c.query(`SELECT valor FROM private.secretos WHERE clave = 'jwt_secret'`)).rows[0]?.valor;
  t.ok(secreto && secreto.length >= 32, 'secreto JWT configurado');
  if (!secreto) return;

  await c.query(`SET LOCAL app.etl = 'on'`);
  await c.query(`INSERT INTO core.empleados (id, nombre, cedula, rol, activo) VALUES
      ($1, 'EMPLEADO PRUEBA', $6, 'EMPLEADO', true), ($2, 'EMPLEADO DOS', '1712345678', 'EMPLEADO', true),
      ($3, 'SUPERVISOR PRUEBA', '1700000001', 'SUPERVISOR', true), ($4, 'ADMIN PRUEBA', '1700000002', 'ADMIN', true),
      ($5, 'INACTIVO PRUEBA', '1700000003', 'EMPLEADO', false)`, [EMP, EMP2, SUP, ADM, INACT, CEDULA]);
  await c.query(`INSERT INTO private.credenciales (usuario, tipo_cuenta, password_hash, debe_cambiar) VALUES
      ($1, 'EMPLEADO', NULL, true), ($2, 'EMPLEADO', NULL, true),
      ($3, 'EMPLEADO', crypt('supervisor1', gen_salt('bf', 4)), false),
      ($4, 'EMPLEADO', crypt('administra1', gen_salt('bf', 4)), false),
      ($5, 'EMPLEADO', crypt('inactivo1', gen_salt('bf', 4)), false)`, [EMP, EMP2, SUP, ADM, INACT]);
  await c.query(`SET LOCAL app.etl = 'off'`);

  // ── Primer ingreso (D-06) ──
  let r = await anon(c, `SELECT api.login($1, 'loquesea') v`, [EMP]);
  t.ok(r.v?.codigo === 'CREAR_PASSWORD' && r.estado === '403', 'sin contraseña: login pide crearla (403)');
  r = await anon(c, `SELECT api.crear_password($1, '1799999999', 'secreto1') v`, [EMP]);
  t.ok(r.v?.codigo === 'CEDULA' && r.estado === '401', 'crear contraseña con cédula equivocada se rechaza');
  r = await anon(c, `SELECT api.crear_password($1, $2, '12345') v`, [EMP, CEDULA]);
  t.ok(r.codigo === '22023' && /al menos 6/.test(r.error), 'contraseña de empleado < 6 caracteres se rechaza');
  r = await anon(c, `SELECT api.crear_password($1, '912345678', 'secreto1', 'DEV_AAAAAAAA') v`, [EMP]);
  t.ok(r.v?.ok === true && r.v.token, 'crear contraseña con cédula correcta (sin 0 inicial) inicia sesión');
  const tok1 = r.v?.token;
  const d1 = tok1 && decodificar(tok1, secreto);
  t.ok(d1?.valido, 'el JWT está firmado con el secreto de PostgREST (HS256)');
  t.ok(d1?.claims.role === 'empleado' && d1.claims.empleado_id === EMP && d1.claims.dispositivo === 'DEV_AAAAAAAA',
       'claims: role empleado, empleado_id y dispositivo');
  t.ok(d1?.claims.exp - d1?.claims.iat === 720 * 3600, 'sesión de empleado dura 30 días');
  r = await anon(c, `SELECT api.crear_password($1, $2, 'otraclave') v`, [EMP, CEDULA]);
  t.ok(r.v?.codigo === 'YA_TIENE', 'no se puede volver a "crear" una contraseña existente');
  const hash = (await c.query(`SELECT password_hash FROM private.credenciales WHERE usuario = $1`, [EMP])).rows[0].password_hash;
  t.ok(/^\$2[aby]\$10\$/.test(hash), 'la contraseña se guarda con bcrypt (costo 10)');

  // ── Login ──
  r = await anon(c, `SELECT api.login($1, 'secreto1') v`, [EMP]);
  t.ok(r.v?.ok && r.v.rol === 'empleado', 'login correcto');
  r = await anon(c, `SELECT api.login('NO_EXISTE', 'x') v`);
  t.ok(r.v?.codigo === 'CREDENCIALES' && r.estado === '401', 'usuario inexistente: mensaje genérico 401');
  r = await anon(c, `SELECT api.login($1, 'inactivo1') v`, [INACT]);
  t.ok(r.v?.codigo === 'CREDENCIALES', 'empleado inactivo no puede ingresar');
  r = await anon(c, `SELECT api.login($1, 'supervisor1') v`, [SUP]);
  t.ok(r.v?.rol === 'supervisor' && claimsDe(r.v.token, secreto).exp - claimsDe(r.v.token, secreto).iat === 12 * 3600,
       'supervisor obtiene rol supervisor y sesión de 12 h');
  const tokSup = r.v?.token;

  // ── Bloqueo: 5 fallos → 15 min ──
  for (let i = 1; i <= 4; i++) await anon(c, `SELECT api.login($1, 'mala') v`, [EMP]);
  r = await anon(c, `SELECT api.login($1, 'mala') v`, [EMP]);
  t.ok(r.v?.codigo === 'BLOQUEADO' && r.estado === '429', 'el 5.º fallo bloquea la cuenta (429)');
  r = await anon(c, `SELECT api.login($1, 'secreto1') v`, [EMP]);
  t.ok(r.v?.codigo === 'BLOQUEADO', 'bloqueada: ni la contraseña correcta entra');
  const bl = (await c.query(`SELECT round(extract(epoch FROM bloqueado_hasta - now()) / 60) m FROM private.credenciales WHERE usuario = $1`, [EMP])).rows[0].m;
  t.ok(Number(bl) === 15, 'el bloqueo dura 15 minutos');
  await c.query(`UPDATE private.credenciales SET bloqueado_hasta = now() - interval '1 minute' WHERE usuario = $1`, [EMP]);
  r = await anon(c, `SELECT api.login($1, 'secreto1', 'DEV_AAAAAAAA') v`, [EMP]);
  t.ok(r.v?.ok, 'pasado el bloqueo vuelve a ingresar');
  const f = (await c.query(`SELECT intentos_fallidos FROM private.credenciales WHERE usuario = $1`, [EMP])).rows[0].intentos_fallidos;
  t.ok(f === 0, 'un ingreso correcto reinicia los intentos');

  // ── Dispositivo (R-22) y validación por petición ──
  const cl1 = claimsDe(r.v.token, secreto);
  r = await como(c, 'empleado', cl1, `SELECT private.verificar_sesion()`);
  t.ok(!r.error, 'sesión válida pasa verificar_sesion');
  r = await anon(c, `SELECT api.login($1, 'secreto1', 'DEV_BBBBBBBB') v`, [EMP]);
  const activos = (await c.query(`SELECT array_agg(token ORDER BY token) t FROM core.dispositivos WHERE empleado_id = $1 AND activo`, [EMP])).rows[0].t;
  t.ok(activos?.length === 1 && activos[0] === 'DEV_BBBBBBBB', 'al vincular otro dispositivo queda uno solo activo');
  r = await como(c, 'empleado', cl1, `SELECT private.verificar_sesion()`);
  t.ok(r.codigo === 'PT401', 'la sesión del dispositivo anterior queda cerrada (401)');
  r = await anon(c, `SELECT api.login($1, 'secreto1', 'malo con espacios') v`, [EMP]);
  t.ok(r.codigo === '22023', 'identificador de dispositivo inválido se rechaza');

  // ── Cambio de contraseña ──
  const tokB = (await anon(c, `SELECT api.login($1, 'secreto1', 'DEV_BBBBBBBB') v`, [EMP])).v.token;
  const clB = claimsDe(tokB, secreto);
  r = await como(c, 'empleado', clB, `SELECT api.cambiar_password('equivocada', 'nueva123') v`);
  t.ok(r.codigo === '28P01', 'cambiar contraseña exige la actual');
  r = await como(c, 'empleado', clB, `SELECT api.cambiar_password('secreto1', 'nueva123') v`);
  t.ok(r.v?.ok && r.v.token, 'cambio de contraseña devuelve una sesión nueva');
  const clViejo = { ...clB, iat: clB.iat - 60 };
  r = await como(c, 'empleado', clViejo, `SELECT private.verificar_sesion()`);
  t.ok(r.codigo === 'PT401', 'sesiones anteriores al cambio quedan invalidadas');
  r = await anon(c, `SELECT api.login($1, 'nueva123') v`, [EMP]);
  t.ok(r.v?.ok, 'ingresa con la nueva contraseña');
  const clNueva = { ...claimsDe(r.v.token, secreto), iat: claimsDe(r.v.token, secreto).iat };
  r = await como(c, 'empleado', clNueva, `SELECT private.verificar_sesion()`);
  t.ok(!r.error, 'la sesión nueva es válida');

  // ── Reseteo por supervisor ──
  const clSup = claimsDe(tokSup, secreto);
  r = await como(c, 'empleado', clB, `SELECT api.resetear_password($1) v`, [EMP2]);
  t.ok(r.codigo === '42501', 'un empleado no puede resetear contraseñas');
  r = await como(c, 'supervisor', clSup, `SELECT api.resetear_password($1) v`, [ADM]);
  t.ok(r.codigo === '42501', 'un supervisor no puede resetear a un admin');
  r = await como(c, 'supervisor', clSup, `SELECT api.resetear_password($1, 'temp12') v`, [EMP]);
  t.ok(r.v?.ok, 'supervisor asigna contraseña temporal');
  r = await como(c, 'empleado', clNueva, `SELECT private.verificar_sesion()`);
  t.ok(r.codigo === 'PT401', 'el reseteo cierra las sesiones abiertas del colaborador');
  r = await anon(c, `SELECT api.login($1, 'temp12') v`, [EMP]);
  t.ok(r.v?.ok && r.v.debe_cambiar === true, 'con la temporal ingresa marcado "debe cambiar"');
  const clTemp = claimsDe(r.v.token, secreto);
  r = await como(c, 'empleado', clTemp, `SELECT private.verificar_sesion()`, [], '/rpc/estado_hoy');
  t.ok(r.codigo === 'PT403', 'con "debe cambiar" no puede usar otras funciones (403)');
  r = await como(c, 'empleado', clTemp, `SELECT private.verificar_sesion()`, [], '/rpc/cambiar_password');
  t.ok(!r.error, 'con "debe cambiar" sí puede cambiar la contraseña');
  r = await como(c, 'supervisor', clSup, `SELECT api.resetear_password($1) v`, [EMP2]);
  t.ok(r.v?.ok, 'reseteo sin temporal: el colaborador vuelve a crear su contraseña');
  r = await anon(c, `SELECT api.login($1, 'x') v`, [EMP2]);
  t.ok(r.v?.codigo === 'CREAR_PASSWORD', 'tras el reseteo el login pide crear contraseña');
  const aud = (await c.query(`SELECT count(*)::int n FROM core.auditoria WHERE tabla = 'credenciales' AND clave IN ($1, $2)`, [EMP, EMP2])).rows[0].n;
  t.ok(aud >= 3, 'cambios y reseteos de contraseña quedan en auditoría (sin el hash)');
  const sinHash = (await c.query(`SELECT count(*)::int n FROM core.auditoria WHERE tabla = 'credenciales' AND (antes::text LIKE '%$2%' OR despues::text LIKE '%$2%')`)).rows[0].n;
  t.ok(sinHash === 0, 'la auditoría no guarda hashes');

  // ── Largo mínimo privilegiado (8) ──
  const tokAdm = (await anon(c, `SELECT api.login($1, 'administra1') v`, [ADM])).v.token;
  const clAdm = claimsDe(tokAdm, secreto);
  r = await como(c, 'admin', clAdm, `SELECT api.cambiar_password('administra1', 'corta77') v`);
  t.ok(r.codigo === '22023' && /al menos 8/.test(r.error), 'admin necesita al menos 8 caracteres');

  // ── Guardias (D-14) ──
  r = await como(c, 'supervisor', clSup, `SELECT api.guardar_guardia('garita1', 'Guardia Uno', true, 'guardia123') v`);
  t.ok(r.codigo === '42501', 'un supervisor no crea guardias');
  r = await como(c, 'admin', clAdm, `SELECT api.guardar_guardia('garita1', 'Guardia Uno', true, 'guardia123') v`);
  t.ok(r.v?.ok, 'admin crea una cuenta de guardia');
  r = await anon(c, `SELECT api.login('garita1', 'guardia123') v`);
  t.ok(r.v?.rol === 'guardia' && r.v.debe_cambiar === true, 'el guardia ingresa con rol guardia y debe cambiar su clave');
  const clG = claimsDe(r.v.token, secreto);
  r = await como(c, 'admin', clAdm, `SELECT api.guardar_guardia('garita1', 'Guardia Uno', false) v`);
  r = await como(c, 'guardia', clG, `SELECT private.verificar_sesion()`, [], '/rpc/cambiar_password');
  t.ok(r.codigo === 'PT401', 'desactivar al guardia cierra su sesión');
  r = await anon(c, `SELECT api.login('garita1', 'guardia123') v`);
  t.ok(r.v?.codigo === 'CREDENCIALES', 'guardia desactivado no ingresa');

  // ── Cambio de rol invalida el token ──
  await c.query(`UPDATE core.empleados SET rol = 'EMPLEADO' WHERE id = $1`, [SUP]);
  r = await como(c, 'supervisor', clSup, `SELECT private.verificar_sesion()`);
  t.ok(r.codigo === 'PT401', 'si cambia el rol del usuario, su token anterior deja de servir');

  // ── mi_sesion y reseteo masivo ──
  r = await como(c, 'admin', clAdm, `SELECT api.mi_sesion() v`);
  t.ok(r.v?.empleado_id === ADM && r.v.rol === 'admin', 'mi_sesion devuelve los datos de la sesión');
  r = await como(c, 'empleado', clB, `SELECT api.resetear_passwords_todos() v`);
  t.ok(r.codigo === '42501', 'solo admin puede resetear a todos');
  r = await anon(c, `SELECT * FROM private.credenciales`);
  t.ok(r.codigo === '42501', 'anon no puede leer credenciales');
  r = await anon(c, `SELECT private.jwt_firmar('{"role":"admin"}'::jsonb)`);
  t.ok(r.codigo === '42501', 'nadie puede firmar tokens directamente');
}
