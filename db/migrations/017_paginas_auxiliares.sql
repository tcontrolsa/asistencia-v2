-- Fase 5 (bloque G): páginas auxiliares del supervisor.
-- ubicacion.html (radar del día), admin_config.html (configuración del sistema, supervisores y restablecimiento
-- masivo de contraseñas) y la página de estado que reemplaza a diagnostico.html (D-16).

-- ───────────── Radar de ubicación (ubicacion.html) ─────────────
-- Últimas marcaciones de hoy por colaborador activo, con sus coordenadas, y la geocerca de la empresa.
CREATE OR REPLACE FUNCTION api.sup_radar()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u jsonb := coalesce(private.cfg('sistema') -> 'ubicacion', '{}');
BEGIN
  PERFORM private.exigir_supervisor();
  RETURN jsonb_build_object(
    'hoy', to_char(private.hoy(), 'YYYY-MM-DD'),
    'ahora', to_char(private.ahora_local(), 'YYYY-MM-DD"T"HH24:MI:SS'),
    'empresa', jsonb_build_object('lat', (u ->> 'lat')::double precision, 'lng', (u ->> 'lng')::double precision,
                                  'radio', coalesce((u ->> 'radio')::int, 250)),
    'empleados', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'nombre', e.nombre, 'area', e.area,
        'foto_url', private.url_foto(e.id, e.foto_legado, (SELECT f.actualizado_en FROM core.fotos f WHERE f.empleado_id = e.id)),
        'registros', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', m.tipo, 'hora', to_char(m.hora, 'HH24:MI:SS'),
                                                                   'lat', m.lat, 'lng', m.lng, 'modo', m.modo) ORDER BY m.hora, m.id), '[]')
                      FROM core.marcaciones m WHERE m.empleado_id = e.id AND m.fecha = private.hoy()))
        ORDER BY e.nombre), '[]')
      FROM core.empleados e WHERE e.activo));
END $$;

-- ───────────── Configuración del sistema (admin_config.html) ─────────────
CREATE OR REPLACE FUNCTION api.sup_config_sistema()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s jsonb := coalesce(private.cfg('sistema'), '{}'); h core.horarios;
BEGIN
  PERFORM private.exigir_supervisor_admin();
  SELECT * INTO h FROM core.horarios WHERE tipo_dia = 'LABORABLE';
  RETURN jsonb_build_object(
    'ubicacion', coalesce(s -> 'ubicacion', '{}'),
    'horarios', coalesce(s -> 'horarios', '{}') || jsonb_build_object(
        'hora_inicio', to_char(h.entrada, 'HH24:MI'), 'hora_entrada_limite', to_char(h.limite_justificacion, 'HH24:MI'),
        'hora_salida', to_char(h.salida, 'HH24:MI'),
        'hora_fin', coalesce(s #>> '{horarios,hora_fin}', to_char(h.salida, 'HH24:MI'))),
    'registro', coalesce(s -> 'registro', '{}'),
    'otras', coalesce(s -> 'otras', '{}'),
    'supervisores', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'rol', private.supervisor_legado(e.rol))
                                               ORDER BY e.nombre), '[]')
                     FROM core.empleados e WHERE e.activo AND e.rol IN ('SUPERVISOR', 'SUPERVISOR_ADMIN')));
END $$;

CREATE OR REPLACE FUNCTION api.sup_guardar_config_sistema(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  lat double precision := (p #>> '{ubicacion,lat}')::double precision;
  lng double precision := (p #>> '{ubicacion,lng}')::double precision;
  radio int := coalesce((p #>> '{ubicacion,radio}')::int, 250);
  hi time := (p #>> '{horarios,hora_inicio}')::time;
  hl time := (p #>> '{horarios,hora_entrada_limite}')::time;
  hs time := (p #>> '{horarios,hora_salida}')::time;
  s jsonb := coalesce(private.cfg('sistema'), '{}');
BEGIN
  PERFORM private.exigir_supervisor_admin();
  IF lat IS NULL OR lng IS NULL OR lat NOT BETWEEN -90 AND 90 OR lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Coordenadas inválidas. Verifica el formato.' USING ERRCODE = '22023';
  END IF;
  IF radio NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'El radio debe estar entre 10 y 1000 metros' USING ERRCODE = '22023'; END IF;
  IF hi IS NULL OR hl IS NULL OR hs IS NULL OR hl < hi OR hs <= hi THEN
    RAISE EXCEPTION 'Horarios inválidos: la entrada límite y la salida deben ser posteriores al inicio de jornada' USING ERRCODE = '22023';
  END IF;
  s := s || jsonb_build_object(
    'ubicacion', jsonb_build_object('lat', lat, 'lng', lng, 'radio', radio),
    'horarios', coalesce(s -> 'horarios', '{}') || jsonb_build_object(
        'hora_almuerzo', coalesce(p #>> '{horarios,hora_almuerzo}', '09:30'),
        'almuerzo_activo', coalesce((p #>> '{horarios,almuerzo_activo}')::boolean, true),
        'hora_fin', coalesce(p #>> '{horarios,hora_fin}', to_char(hs, 'HH24:MI')),
        'marcacion_automatica', coalesce((p #>> '{horarios,marcacion_automatica}')::boolean, false),
        'tiempo_automatico', least(greatest(coalesce((p #>> '{horarios,tiempo_automatico}')::int, 10), 1), 120)),
    'registro', coalesce(s -> 'registro', '{}') || jsonb_build_object(
        'tolerancia_gps', least(greatest(coalesce((p #>> '{registro,tolerancia_gps}')::int, 50), 0), 200),
        'requiere_foto', coalesce((p #>> '{registro,requiere_foto}')::boolean, false),
        'permite_registro_manual', coalesce((p #>> '{registro,permite_registro_manual}')::boolean, true)),
    'otras', coalesce(s -> 'otras', '{}') || jsonb_build_object(
        'whatsapp_number', regexp_replace(coalesce(p #>> '{otras,whatsapp_number}', ''), '\D', '', 'g'),
        'mensaje_soporte', coalesce(p #>> '{otras,mensaje_soporte}', ''),
        'modo_mantenimiento', coalesce((p #>> '{otras,modo_mantenimiento}')::boolean, false),
        'mensaje_mantenimiento', coalesce(p #>> '{otras,mensaje_mantenimiento}', '')));
  UPDATE core.configuracion SET valor = s, actualizado_en = now(), actualizado_por = private.jwt_usuario() WHERE clave = 'sistema';
  UPDATE core.horarios SET entrada = hi, limite_justificacion = hl, salida = hs WHERE tipo_dia = 'LABORABLE';
  RETURN jsonb_build_object('ok', true);
END $$;

-- agregarSupervisor / eliminarSupervisor (por ID)
CREATE OR REPLACE FUNCTION api.sup_config_supervisor(p_empleado_id text, p_agregar boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE e core.empleados;
BEGIN
  PERFORM private.exigir_supervisor_admin();
  SELECT * INTO e FROM core.empleados WHERE id = trim(coalesce(p_empleado_id, ''));
  IF e.id IS NULL OR NOT e.activo THEN RAISE EXCEPTION 'No existe un colaborador activo con el ID %', p_empleado_id USING ERRCODE = 'P0002'; END IF;
  IF e.rol = 'ADMIN' THEN RAISE EXCEPTION 'El rol del Administrador General no se modifica desde aquí' USING ERRCODE = '22023'; END IF;
  IF p_agregar AND e.rol <> 'EMPLEADO' THEN RAISE EXCEPTION 'El colaborador ya tiene privilegios de supervisión' USING ERRCODE = '22023'; END IF;
  PERFORM private.cambiar_rol(e.id, CASE WHEN p_agregar THEN 'SUPERVISOR'::core.rol_app ELSE 'EMPLEADO'::core.rol_app END);
  RETURN jsonb_build_object('ok', true);
END $$;

-- ejecutarReseteoPinesAdmin: cada colaborador vuelve a crear su contraseña con su cédula (D-06).
-- No toca cuentas de Sup. Admin ni Admin (no pueden quedar sin acceso al panel) ni la del propio usuario.
CREATE OR REPLACE FUNCTION api.sup_resetear_contrasenas_todos(p_confirmacion text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE n int;
BEGIN
  PERFORM private.exigir_supervisor_admin();
  IF p_confirmacion IS DISTINCT FROM 'BORRAR' THEN
    RAISE EXCEPTION 'Operación cancelada. El texto ingresado no es correcto.' USING ERRCODE = '22023';
  END IF;
  UPDATE private.credenciales c SET password_hash = NULL, debe_cambiar = true, sesiones_validas_desde = date_trunc('second', now())
   FROM core.empleados e
   WHERE c.usuario = e.id AND c.tipo_cuenta = 'EMPLEADO' AND e.rol IN ('EMPLEADO', 'SUPERVISOR')
     AND e.id IS DISTINCT FROM private.jwt_empleado_id();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'restablecidas', n,
    'mensaje', format('Contraseñas restablecidas: %s cuentas. Cada colaborador creará su nueva contraseña con su cédula al ingresar.', n));
END $$;

-- ───────────── Estado del sistema (reemplaza diagnostico.html, D-16) ─────────────
CREATE OR REPLACE FUNCTION api.sup_estado_sistema()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE w jsonb := coalesce(private.cfg('whatsapp_worker'), '{}');
BEGIN
  PERFORM private.exigir_supervisor();
  RETURN jsonb_build_object(
    'servidor', jsonb_build_object('hora', to_char(private.ahora_local(), 'YYYY-MM-DD HH24:MI:SS'), 'hoy', to_char(private.hoy(), 'YYYY-MM-DD'),
                                   'base', current_database(), 'postgres', split_part(version(), ' ', 2)),
    'migracion', (SELECT max(version) FROM private.schema_migrations),
    'datos', jsonb_build_object(
      'empleadosActivos', (SELECT count(*) FROM core.empleados WHERE activo),
      'marcacionesHoy', (SELECT count(*) FROM core.marcaciones WHERE fecha = private.hoy()),
      'ultimaMarcacion', (SELECT to_char(max(ts_servidor) AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS') FROM core.marcaciones),
      'dispositivosActivos', (SELECT count(*) FROM core.dispositivos WHERE activo)),
    'cola', (SELECT coalesce(jsonb_object_agg(estado, n), '{}') FROM (SELECT estado, count(*) n FROM core.cola_notificaciones GROUP BY estado) x),
    'worker', jsonb_build_object('ultimoLatido', w ->> 'ultimo_latido',
                                 'activo', coalesce((w ->> 'ultimo_latido')::timestamptz > now() - interval '3 minutes', false)));
END $$;

REVOKE ALL ON FUNCTION api.sup_radar(), api.sup_config_sistema(), api.sup_guardar_config_sistema(jsonb),
  api.sup_config_supervisor(text, boolean), api.sup_resetear_contrasenas_todos(text), api.sup_estado_sistema() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.sup_radar(), api.sup_estado_sistema() TO supervisor;
GRANT EXECUTE ON FUNCTION api.sup_config_sistema(), api.sup_guardar_config_sistema(jsonb), api.sup_config_supervisor(text, boolean),
  api.sup_resetear_contrasenas_todos(text) TO supervisor_admin;
