-- 007 — Fase 2: autenticación en servidor (§5.1, §5.6, D-06, D-14, R-22)
-- · Contraseñas con bcrypt (pgcrypto). Nadie conserva la anterior: primer ingreso = crear contraseña.
-- · Crear la contraseña exige la cédula registrada (evita que otro "reclame" una cuenta conociendo el ID).
-- · JWT HS256 firmado aquí con private.secretos.jwt_secret (el mismo PGRST_JWT_SECRET de PostgREST).
-- · 5 fallos → bloqueo 15 min. Un dispositivo activo por empleado. Cambiar/resetear la contraseña
--   invalida las sesiones anteriores. PostgREST valida cada petición con private.verificar_sesion().

INSERT INTO core.configuracion (clave, valor) VALUES
  ('auth', jsonb_build_object(
     'min_largo_empleado', 6, 'min_largo_privilegiado', 8,          -- D-06
     'max_intentos', 5, 'bloqueo_minutos', 15,
     'horas_sesion_empleado', 720, 'horas_sesion_supervisor', 12, 'horas_sesion_guardia', 720))
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE private.credenciales
  ADD COLUMN IF NOT EXISTS sesiones_validas_desde timestamptz NOT NULL DEFAULT date_trunc('second', now()),
  ADD COLUMN IF NOT EXISTS ultimo_ingreso timestamptz;

-- ───────────── JWT ─────────────
CREATE OR REPLACE FUNCTION private.b64url(p bytea) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT translate(encode(p, 'base64'), E'+/=\n', '-_') $$;

CREATE OR REPLACE FUNCTION private.jwt_firmar(p_claims jsonb) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  secreto text := (SELECT valor FROM private.secretos WHERE clave = 'jwt_secret');
  datos text;
BEGIN
  IF secreto IS NULL OR length(secreto) < 32 THEN
    RAISE EXCEPTION 'JWT no configurado (private.secretos.jwt_secret)';
  END IF;
  datos := private.b64url(convert_to('{"alg":"HS256","typ":"JWT"}', 'UTF8')) || '.' ||
           private.b64url(convert_to(p_claims::text, 'UTF8'));
  RETURN datos || '.' || private.b64url(hmac(convert_to(datos, 'UTF8'), convert_to(secreto, 'UTF8'), 'sha256'));
END $$;

-- ───────────── Utilidades ─────────────
CREATE OR REPLACE FUNCTION private.rol_bd(p_rol core.rol_app) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT lower(p_rol::text) $$;

CREATE OR REPLACE FUNCTION private.nivel_rol(p_rol text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(p_rol) WHEN 'empleado' THEN 1 WHEN 'supervisor' THEN 2 WHEN 'supervisor_admin' THEN 3
                           WHEN 'admin' THEN 4 WHEN 'guardia' THEN 0 ELSE -1 END
$$;

-- Rol de BD de una cuenta, o NULL si no existe o está inactiva
CREATE OR REPLACE FUNCTION private.rol_de_cuenta(p_usuario text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT CASE c.tipo_cuenta
           WHEN 'EMPLEADO' THEN (SELECT private.rol_bd(e.rol) FROM core.empleados e WHERE e.id = c.usuario AND e.activo)
           WHEN 'GUARDIA'  THEN (SELECT 'guardia' FROM core.guardias g WHERE g.usuario = c.usuario AND g.activo)
         END
  FROM private.credenciales c WHERE c.usuario = p_usuario
$$;

CREATE OR REPLACE FUNCTION private.validar_password(p_password text, p_rol text) RETURNS void
LANGUAGE plpgsql STABLE AS $$
DECLARE
  a jsonb := private.cfg('auth');
  minimo int := CASE WHEN private.nivel_rol(p_rol) >= 2 OR p_rol = 'guardia'
                     THEN (a ->> 'min_largo_privilegiado')::int ELSE (a ->> 'min_largo_empleado')::int END;
BEGIN
  IF p_password IS NULL OR length(p_password) < minimo THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos % caracteres.', minimo USING ERRCODE = '22023';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.normalizar_cedula(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN length(d) = 9 THEN '0' || d ELSE d END
  FROM (SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') AS d) x
$$;

-- Respuesta de error de login: HTTP 401 sin abortar la transacción (para que el fallo quede contado)
CREATE OR REPLACE FUNCTION private.respuesta_error(p_mensaje text, p_codigo text, p_estado int DEFAULT 401) RETURNS jsonb
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('response.status', p_estado::text, true);
  RETURN jsonb_build_object('ok', false, 'codigo', p_codigo, 'error', p_mensaje);
END $$;

-- Suma un fallo; al llegar al máximo bloquea. Devuelve el mensaje a mostrar.
CREATE OR REPLACE FUNCTION private.registrar_fallo(p_usuario text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE a jsonb := private.cfg('auth'); c private.credenciales;
BEGIN
  UPDATE private.credenciales SET intentos_fallidos = intentos_fallidos + 1 WHERE usuario = p_usuario RETURNING * INTO c;
  IF FOUND AND c.intentos_fallidos >= (a ->> 'max_intentos')::int THEN
    UPDATE private.credenciales
       SET bloqueado_hasta = now() + make_interval(mins => (a ->> 'bloqueo_minutos')::int), intentos_fallidos = 0
     WHERE usuario = p_usuario;
    RETURN private.respuesta_error(format('Demasiados intentos fallidos. Cuenta bloqueada por %s minutos.',
                                          a ->> 'bloqueo_minutos'), 'BLOQUEADO', 429);
  END IF;
  RETURN private.respuesta_error('ID o contraseña incorrectos.', 'CREDENCIALES');
END $$;

-- Vincula el dispositivo: queda activo solo este para el empleado (R-22)
CREATE OR REPLACE FUNCTION private.vincular_dispositivo(p_empleado_id text, p_token text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_token IS NULL THEN RETURN; END IF;
  IF p_token !~ '^[A-Za-z0-9_-]{6,64}$' THEN
    RAISE EXCEPTION 'Identificador de dispositivo inválido.' USING ERRCODE = '22023';
  END IF;
  UPDATE core.dispositivos SET activo = false WHERE empleado_id = p_empleado_id AND token <> p_token AND activo;
  INSERT INTO core.dispositivos (token, empleado_id, activo, registrado_en, ultimo_uso)
  VALUES (p_token, p_empleado_id, true, now(), now())
  ON CONFLICT (token) DO UPDATE SET empleado_id = EXCLUDED.empleado_id, activo = true, ultimo_uso = now();
  -- Si el token era de otro empleado, ese otro queda sin dispositivo activo (igual que en el legado)
END $$;

-- Emite la sesión (JWT) de una cuenta ya autenticada
CREATE OR REPLACE FUNCTION private.emitir_sesion(p_usuario text, p_dispositivo text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  a jsonb := private.cfg('auth');
  c private.credenciales;
  rol text := private.rol_de_cuenta(p_usuario);
  e core.empleados;
  g core.guardias;
  ahora timestamptz := date_trunc('second', now());
  horas int;
  claims jsonb;
BEGIN
  SELECT * INTO c FROM private.credenciales WHERE usuario = p_usuario;
  -- Un token emitido justo después de un reseteo no debe nacer invalidado
  ahora := greatest(ahora, c.sesiones_validas_desde);
  horas := CASE WHEN rol = 'guardia' THEN (a ->> 'horas_sesion_guardia')::int
                WHEN private.nivel_rol(rol) >= 2 THEN (a ->> 'horas_sesion_supervisor')::int
                ELSE (a ->> 'horas_sesion_empleado')::int END;
  claims := jsonb_build_object('role', rol, 'usuario', p_usuario,
                               'iat', extract(epoch FROM ahora)::bigint,
                               'exp', extract(epoch FROM ahora + make_interval(hours => horas))::bigint,
                               'debe_cambiar', c.debe_cambiar);
  IF c.tipo_cuenta = 'EMPLEADO' THEN
    SELECT * INTO e FROM core.empleados WHERE id = p_usuario;
    claims := claims || jsonb_build_object('empleado_id', e.id, 'rol_app', e.rol);
    IF p_dispositivo IS NOT NULL THEN
      PERFORM private.vincular_dispositivo(e.id, p_dispositivo);
      claims := claims || jsonb_build_object('dispositivo', p_dispositivo);
    END IF;
  ELSE
    SELECT * INTO g FROM core.guardias WHERE usuario = p_usuario;
  END IF;
  UPDATE private.credenciales SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_ingreso = now()
   WHERE usuario = p_usuario;
  RETURN jsonb_build_object(
    'ok', true, 'token', private.jwt_firmar(claims), 'expira', ahora + make_interval(hours => horas),
    'rol', rol, 'usuario', p_usuario, 'empleado_id', e.id, 'nombre', coalesce(e.nombre, g.nombre),
    'area', e.area, 'cargo', e.cargo, 'foto_url', coalesce(e.foto_path, e.foto_legado),
    'debe_cambiar', c.debe_cambiar, 'dispositivo', p_dispositivo);
END $$;

-- ───────────── Validación de cada petición (PGRST_DB_PRE_REQUEST) ─────────────
CREATE OR REPLACE FUNCTION private.verificar_sesion() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  cl jsonb := private.claims();
  v_rol text := private.jwt_rol();
  v_usuario text := cl ->> 'usuario';
  c private.credenciales;
  ruta text := coalesce(current_setting('request.path', true), '');
BEGIN
  IF v_rol = 'anon' OR v_rol IS NULL THEN RETURN; END IF;
  SELECT * INTO c FROM private.credenciales x WHERE x.usuario = v_usuario;
  IF NOT FOUND OR private.rol_de_cuenta(v_usuario) IS DISTINCT FROM v_rol THEN
    RAISE EXCEPTION 'Sesión no válida. Inicie sesión nuevamente.' USING ERRCODE = 'PT401';
  END IF;
  IF to_timestamp((cl ->> 'iat')::bigint) < c.sesiones_validas_desde THEN
    RAISE EXCEPTION 'Su contraseña cambió. Inicie sesión nuevamente.' USING ERRCODE = 'PT401';
  END IF;
  IF cl ? 'dispositivo' AND NOT EXISTS (
       SELECT 1 FROM core.dispositivos d WHERE d.token = cl ->> 'dispositivo' AND d.empleado_id = v_usuario AND d.activo) THEN
    RAISE EXCEPTION 'Este dispositivo fue desvinculado. Inicie sesión nuevamente.' USING ERRCODE = 'PT401';
  END IF;
  IF c.debe_cambiar AND ruta NOT IN ('/rpc/cambiar_password', '/rpc/mi_sesion') THEN
    RAISE EXCEPTION 'Debe cambiar su contraseña antes de continuar.' USING ERRCODE = 'PT403';
  END IF;
END $$;

-- ───────────── API ─────────────
CREATE OR REPLACE FUNCTION api.login(p_usuario text, p_password text, p_dispositivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  u text := trim(p_usuario);
  c private.credenciales;
BEGIN
  SELECT * INTO c FROM private.credenciales WHERE usuario = u;
  IF NOT FOUND OR private.rol_de_cuenta(u) IS NULL THEN
    PERFORM crypt(coalesce(p_password, ''), gen_salt('bf', 10));   -- mismo tiempo de respuesta
    RETURN private.respuesta_error('ID o contraseña incorrectos.', 'CREDENCIALES');
  END IF;
  IF c.bloqueado_hasta > now() THEN
    RETURN private.respuesta_error(format('Cuenta bloqueada por intentos fallidos. Intente nuevamente en %s min.',
                                          ceil(extract(epoch FROM c.bloqueado_hasta - now()) / 60)), 'BLOQUEADO', 429);
  END IF;
  IF c.password_hash IS NULL THEN
    RETURN private.respuesta_error('Debe crear su contraseña para ingresar.', 'CREAR_PASSWORD', 403);
  END IF;
  IF crypt(coalesce(p_password, ''), c.password_hash) <> c.password_hash THEN
    RETURN private.registrar_fallo(u);
  END IF;
  RETURN private.emitir_sesion(u, p_dispositivo);
END $$;

-- Primer ingreso (D-06): el empleado crea su contraseña confirmando su cédula
CREATE OR REPLACE FUNCTION api.crear_password(p_usuario text, p_cedula text, p_password text, p_dispositivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  u text := trim(p_usuario);
  c private.credenciales;
  e core.empleados;
  r jsonb;
BEGIN
  SELECT * INTO c FROM private.credenciales WHERE usuario = u AND tipo_cuenta = 'EMPLEADO';
  SELECT * INTO e FROM core.empleados WHERE id = u AND activo;
  IF c.usuario IS NULL OR e.id IS NULL THEN
    RETURN private.respuesta_error('No se encontró un colaborador activo con ese ID.', 'NO_EXISTE', 404);
  END IF;
  IF c.bloqueado_hasta > now() THEN
    RETURN private.respuesta_error('Cuenta bloqueada por intentos fallidos. Intente más tarde.', 'BLOQUEADO', 429);
  END IF;
  IF c.password_hash IS NOT NULL THEN
    RETURN private.respuesta_error('Este colaborador ya tiene contraseña. Inicie sesión o solicite un reseteo a su supervisor.', 'YA_TIENE', 409);
  END IF;
  IF e.cedula IS NULL THEN
    RETURN private.respuesta_error('No hay cédula registrada. Solicite a su supervisor que le asigne una contraseña.', 'SIN_CEDULA', 409);
  END IF;
  IF private.normalizar_cedula(p_cedula) <> private.normalizar_cedula(e.cedula) THEN
    r := private.registrar_fallo(u);
    RETURN CASE WHEN r ->> 'codigo' = 'CREDENCIALES'
                THEN r || jsonb_build_object('codigo', 'CEDULA', 'error', 'La cédula no coincide con la registrada.')
                ELSE r END;
  END IF;
  PERFORM private.validar_password(p_password, private.rol_bd(e.rol));
  UPDATE private.credenciales
     SET password_hash = crypt(p_password, gen_salt('bf', 10)), debe_cambiar = false,
         sesiones_validas_desde = date_trunc('second', now()), actualizado_en = now()
   WHERE usuario = u;
  RETURN private.emitir_sesion(u, p_dispositivo);
END $$;

CREATE OR REPLACE FUNCTION api.cambiar_password(p_actual text, p_nueva text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  u text := private.claims() ->> 'usuario';
  c private.credenciales;
BEGIN
  SELECT * INTO c FROM private.credenciales WHERE usuario = u;
  IF NOT FOUND OR c.password_hash IS NULL OR crypt(coalesce(p_actual, ''), c.password_hash) <> c.password_hash THEN
    RAISE EXCEPTION 'La contraseña actual no es correcta.' USING ERRCODE = '28P01';
  END IF;
  IF p_nueva = p_actual THEN
    RAISE EXCEPTION 'La nueva contraseña debe ser distinta de la actual.' USING ERRCODE = '22023';
  END IF;
  PERFORM private.validar_password(p_nueva, private.jwt_rol());
  UPDATE private.credenciales
     SET password_hash = crypt(p_nueva, gen_salt('bf', 10)), debe_cambiar = false,
         sesiones_validas_desde = date_trunc('second', now()), actualizado_en = now()
   WHERE usuario = u;
  INSERT INTO core.auditoria (usuario, rol, tabla, accion, clave) VALUES (u, private.jwt_rol(), 'credenciales', 'CAMBIO_PASSWORD', u);
  RETURN private.emitir_sesion(u, private.claims() ->> 'dispositivo');
END $$;

-- Supervisor: resetear la contraseña de un colaborador (opcionalmente asignar una temporal)
CREATE OR REPLACE FUNCTION api.resetear_password(p_empleado_id text, p_password_temporal text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  destino text := private.rol_de_cuenta(p_empleado_id);
BEGIN
  IF NOT private.es_supervisor() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  IF destino IS NULL OR NOT EXISTS (SELECT 1 FROM core.empleados WHERE id = p_empleado_id) THEN
    RAISE EXCEPTION 'Colaborador no encontrado o inactivo.' USING ERRCODE = 'P0002';
  END IF;
  IF private.nivel_rol(destino) >= private.nivel() AND private.nivel() < 4 THEN
    RAISE EXCEPTION 'No puede resetear la contraseña de alguien con igual o mayor rol.' USING ERRCODE = '42501';
  END IF;
  IF p_password_temporal IS NOT NULL THEN
    PERFORM private.validar_password(p_password_temporal, destino);
  END IF;
  UPDATE private.credenciales
     SET password_hash = CASE WHEN p_password_temporal IS NULL THEN NULL ELSE crypt(p_password_temporal, gen_salt('bf', 10)) END,
         debe_cambiar = true, intentos_fallidos = 0, bloqueado_hasta = NULL,
         sesiones_validas_desde = date_trunc('second', now()) + interval '1 second', actualizado_en = now()
   WHERE usuario = p_empleado_id;
  INSERT INTO core.auditoria (usuario, rol, tabla, accion, clave, despues)
  VALUES (private.jwt_usuario(), private.jwt_rol(), 'credenciales', 'RESETEO_PASSWORD', p_empleado_id,
          jsonb_build_object('con_temporal', p_password_temporal IS NOT NULL));
  RETURN jsonb_build_object('ok', true, 'empleado_id', p_empleado_id,
    'mensaje', CASE WHEN p_password_temporal IS NULL
                    THEN 'Contraseña reseteada. El colaborador creará una nueva con su cédula.'
                    ELSE 'Contraseña temporal asignada. Deberá cambiarla al ingresar.' END);
END $$;

-- Admin: reseteo masivo (resetearPinesTodosLosEmpleados)
CREATE OR REPLACE FUNCTION api.resetear_passwords_todos()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE n int;
BEGIN
  IF private.nivel() < 4 THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  UPDATE private.credenciales
     SET password_hash = NULL, debe_cambiar = true, intentos_fallidos = 0, bloqueado_hasta = NULL,
         sesiones_validas_desde = date_trunc('second', now()) + interval '1 second', actualizado_en = now()
   WHERE tipo_cuenta = 'EMPLEADO' AND usuario <> private.jwt_usuario();
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO core.auditoria (usuario, rol, tabla, accion, despues)
  VALUES (private.jwt_usuario(), private.jwt_rol(), 'credenciales', 'RESETEO_MASIVO', jsonb_build_object('cuentas', n));
  RETURN jsonb_build_object('ok', true, 'cuentas', n);
END $$;

-- Supervisor admin: cuentas individuales de guardia (D-14)
CREATE OR REPLACE FUNCTION api.guardar_guardia(p_usuario text, p_nombre text, p_activo boolean DEFAULT true,
                                               p_password text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE u text := lower(trim(p_usuario));
BEGIN
  IF NOT private.es_supervisor_admin() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF u !~ '^[a-z][a-z0-9_.]{2,31}$' THEN
    RAISE EXCEPTION 'Usuario inválido: 3 a 32 caracteres, empieza con letra (a-z, 0-9, _ .).' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM core.empleados WHERE id = u) THEN
    RAISE EXCEPTION 'Ese usuario coincide con un ID de colaborador.' USING ERRCODE = '23505';
  END IF;
  INSERT INTO core.guardias (usuario, nombre, activo) VALUES (u, trim(p_nombre), p_activo)
  ON CONFLICT (usuario) DO UPDATE SET nombre = EXCLUDED.nombre, activo = EXCLUDED.activo;
  INSERT INTO private.credenciales (usuario, tipo_cuenta) VALUES (u, 'GUARDIA') ON CONFLICT (usuario) DO NOTHING;
  IF p_password IS NOT NULL THEN
    PERFORM private.validar_password(p_password, 'guardia');
    UPDATE private.credenciales
       SET password_hash = crypt(p_password, gen_salt('bf', 10)), debe_cambiar = true,
           intentos_fallidos = 0, bloqueado_hasta = NULL,
           sesiones_validas_desde = date_trunc('second', now()) + interval '1 second', actualizado_en = now()
     WHERE usuario = u;
  END IF;
  IF NOT p_activo THEN
    UPDATE private.credenciales SET sesiones_validas_desde = date_trunc('second', now()) + interval '1 second' WHERE usuario = u;
  END IF;
  RETURN jsonb_build_object('ok', true, 'usuario', u);
END $$;

-- Datos de la sesión actual (para restaurar la app al abrirla)
CREATE OR REPLACE FUNCTION api.mi_sesion()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u text := private.claims() ->> 'usuario'; e core.empleados; g core.guardias; c private.credenciales;
BEGIN
  IF private.nivel() < 0 THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM private.credenciales WHERE usuario = u;
  SELECT * INTO e FROM core.empleados WHERE id = u;
  SELECT * INTO g FROM core.guardias WHERE usuario = u;
  RETURN jsonb_build_object('usuario', u, 'rol', private.jwt_rol(), 'empleado_id', e.id,
    'nombre', coalesce(e.nombre, g.nombre), 'area', e.area, 'cargo', e.cargo,
    'foto_url', coalesce(e.foto_path, e.foto_legado), 'es_pasante', e.es_pasante,
    'tipo_asistencia', e.tipo_asistencia, 'puede_autorizar_extras', e.puede_autorizar_extras,
    'debe_cambiar', c.debe_cambiar, 'dispositivo', private.claims() ->> 'dispositivo',
    'expira', to_timestamp((private.claims() ->> 'exp')::bigint));
END $$;

REVOKE ALL ON FUNCTION private.verificar_sesion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.verificar_sesion() TO anon, empleado, guardia;
GRANT EXECUTE ON FUNCTION api.login(text, text, text), api.crear_password(text, text, text, text) TO anon, empleado, guardia;
GRANT EXECUTE ON FUNCTION api.cambiar_password(text, text), api.mi_sesion() TO empleado, guardia;
GRANT EXECUTE ON FUNCTION api.resetear_password(text, text) TO supervisor;
GRANT EXECUTE ON FUNCTION api.guardar_guardia(text, text, boolean, text) TO supervisor_admin;
GRANT EXECUTE ON FUNCTION api.resetear_passwords_todos() TO admin;
-- Las demás funciones de private (b64url, jwt_firmar, emitir_sesion…) no se exponen a ningún rol.
REVOKE EXECUTE ON FUNCTION private.jwt_firmar(jsonb), private.emitir_sesion(text, text),
  private.registrar_fallo(text), private.vincular_dispositivo(text, text), private.rol_de_cuenta(text)
  FROM PUBLIC, anon, empleado, guardia;
