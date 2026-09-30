-- 009 — Fase 4: Terminal de Guardia, Catering y Kiosco (legacy guardia_core.js / catering_core.js; Kiosco aprobado D-23/P-02)

-- ───────────── Marcación asistida (guardia y kiosco) ─────────────
-- Mismo criterio que la guardia del legado: sin entrada → ENTRADA; con entrada y sin salida → SALIDA;
-- con ambas → jornada completada. Geocerca de oficina con el GPS del terminal (§5.4) y hora del servidor.
CREATE OR REPLACE FUNCTION private.siguiente_marcacion(p_empleado_id text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM core.marcaciones WHERE empleado_id = p_empleado_id AND fecha = private.hoy() AND tipo = 'ENTRADA') THEN 'ENTRADA'
    WHEN NOT EXISTS (SELECT 1 FROM core.marcaciones WHERE empleado_id = p_empleado_id AND fecha = private.hoy() AND tipo = 'SALIDA') THEN 'SALIDA'
  END
$$;

CREATE OR REPLACE FUNCTION private.marcar_asistido(p_empleado_id text, p_tipo text, p_almuerzo text, p_lat float8, p_lng float8,
  p_origen core.origen, p_dispositivo text, p_creado_por text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  e core.empleados;
  ahora timestamp := private.ahora_local();
  v_hora time(0) := ahora::time(0);
  esperado text := private.siguiente_marcacion(p_empleado_id);
  g record;
  hx record;
  v_alm boolean;
  n core.marcaciones;
BEGIN
  SELECT * INTO e FROM core.empleados WHERE id = trim(p_empleado_id) AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empleado no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF e.tipo_asistencia = 'SIN_ASISTENCIA' THEN RAISE EXCEPTION 'Este colaborador no registra asistencia.' USING ERRCODE = '22023'; END IF;
  IF esperado IS NULL THEN RAISE EXCEPTION 'Jornada completada' USING ERRCODE = 'P0001'; END IF;
  IF upper(p_tipo) IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'Corresponde registrar % para este colaborador', esperado USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO g FROM private.validar_geocerca(p_lat, p_lng, 'OFICINA', NULL, NULL, NULL);
  IF NOT g.dentro THEN RAISE EXCEPTION '%', coalesce(g.mensaje, 'Ubicación no disponible') USING ERRCODE = 'P0001', HINT = 'FUERA_DE_AREA'; END IF;

  IF esperado = 'ENTRADA' THEN
    IF upper(coalesce(p_almuerzo, '')) NOT IN ('SI','NO') THEN
      RAISE EXCEPTION 'Seleccione opción de almuerzo' USING ERRCODE = 'P0001', HINT = 'ALMUERZO';
    END IF;
    -- R-14 en un solo lugar: pasada la hora límite el almuerzo queda fuera de planta
    v_alm := CASE WHEN private.almuerzo_abierto(v_hora) THEN upper(p_almuerzo) = 'SI' ELSE false END;
  ELSE
    v_alm := private.almuerzo_en_salida(v_hora, (SELECT almuerzo FROM core.marcaciones WHERE empleado_id = e.id
                                                 AND fecha = ahora::date AND tipo = 'ENTRADA' ORDER BY ts_servidor LIMIT 1));
  END IF;
  SELECT * INTO hx FROM private.horas_extra_auto(esperado, ahora::date, v_hora, 'OFICINA');

  INSERT INTO core.marcaciones (empleado_id, tipo, ts_servidor, fecha, hora, lat, lng, distancia_m, dispositivo, modo,
    almuerzo, horas_extra, autoriza, origen, creado_por)
  VALUES (e.id, esperado, ahora AT TIME ZONE 'America/Guayaquil', ahora::date, v_hora, p_lat, p_lng, g.distancia_m,
    p_dispositivo, 'OFICINA', v_alm, hx.horas_extra, hx.autoriza, p_origen, p_creado_por)
  RETURNING * INTO n;
  RETURN jsonb_build_object('ok', true, 'tipo', n.tipo, 'hora', to_char(n.hora, 'HH24:MI:SS'), 'almuerzo', n.almuerzo,
                            'nombre', e.nombre);
END $$;

-- ───────────── Guardia (D-14: cuentas individuales) ─────────────
CREATE OR REPLACE FUNCTION api.guardia_buscar(p_empleado_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE e core.empleados;
BEGIN
  IF NOT (private.nivel() = 0 OR private.es_supervisor()) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  SELECT * INTO e FROM core.empleados WHERE id = trim(p_empleado_id) AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empleado no encontrado' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('id', e.id, 'nombre', e.nombre, 'area', e.area,
    'foto_url', private.url_foto(e.id, e.foto_legado, (SELECT f.actualizado_en FROM core.fotos f WHERE f.empleado_id = e.id)),
    'tipo', private.siguiente_marcacion(e.id));
END $$;

CREATE OR REPLACE FUNCTION api.marcar_guardia(p_empleado_id text, p_tipo text, p_almuerzo text DEFAULT NULL,
  p_lat float8 DEFAULT NULL, p_lng float8 DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT (private.nivel() = 0 OR private.es_supervisor()) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  RETURN private.marcar_asistido(p_empleado_id, p_tipo, p_almuerzo, p_lat, p_lng, 'GUARDIA', 'GUARDIA', private.jwt_usuario());
END $$;

-- Presentes de hoy (cargarPresentes): quienes tienen ENTRADA hoy, con su salida si ya la marcaron
DROP FUNCTION IF EXISTS api.presentes_hoy();
CREATE FUNCTION api.presentes_hoy()
RETURNS TABLE (empleado_id text, nombre text, foto_url text, hora_entrada time, hora_salida time, almuerzo boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT (private.nivel() = 0 OR private.es_supervisor()) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT e.id, e.nombre,
         private.url_foto(e.id, e.foto_legado, (SELECT f.actualizado_en FROM core.fotos f WHERE f.empleado_id = e.id)),
         en.hora::time, sa.hora::time, en.almuerzo
  FROM (SELECT DISTINCT ON (m.empleado_id) m.empleado_id, m.hora, m.almuerzo FROM core.marcaciones m
        WHERE m.fecha = private.hoy() AND m.tipo = 'ENTRADA' ORDER BY m.empleado_id, m.ts_servidor) en
  JOIN core.empleados e ON e.id = en.empleado_id
  LEFT JOIN LATERAL (SELECT s.hora FROM core.marcaciones s WHERE s.empleado_id = en.empleado_id AND s.fecha = private.hoy()
                     AND s.tipo = 'SALIDA' ORDER BY s.ts_servidor DESC LIMIT 1) sa ON true
  ORDER BY en.hora DESC;
END $$;

-- ───────────── Catering (solo supervisores, como el legado) ─────────────
CREATE OR REPLACE FUNCTION api.marcar_consumido(p_empleado_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE hoy date := private.hoy();
BEGIN
  IF NOT private.es_supervisor() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM core.empleados WHERE id = p_empleado_id) THEN
    RAISE EXCEPTION 'Empleado no encontrado' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO core.consumo_almuerzos (empleado_id, fecha, ts, registrado_por)
  VALUES (p_empleado_id, hoy, now(), private.jwt_usuario())
  ON CONFLICT (empleado_id, fecha) DO NOTHING;           -- una vez por empleado y día (R-14)
  RETURN jsonb_build_object('ok', true);
END $$;

-- ───────────── Kiosco (P-02: el colaborador marca con su propia contraseña) ─────────────
-- Verifica la contraseña con las mismas reglas que el login (bloqueo 5 fallos / 15 min) sin abrir sesión.
CREATE OR REPLACE FUNCTION private.kiosco_autenticar(p_usuario text, p_password text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE c private.credenciales; u text := trim(p_usuario);
BEGIN
  SELECT * INTO c FROM private.credenciales WHERE usuario = u AND tipo_cuenta = 'EMPLEADO';
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM core.empleados WHERE id = u AND activo) THEN
    PERFORM crypt(coalesce(p_password, ''), gen_salt('bf', 10));
    RETURN private.respuesta_error('ID o contraseña incorrectos.', 'CREDENCIALES');
  END IF;
  IF c.bloqueado_hasta > now() THEN
    RETURN private.respuesta_error('Cuenta bloqueada por intentos fallidos. Intente más tarde.', 'BLOQUEADO', 429);
  END IF;
  IF c.password_hash IS NULL THEN
    RETURN private.respuesta_error('Primero crea tu contraseña en la app TCONTROL de tu teléfono.', 'CREAR_PASSWORD', 403);
  END IF;
  IF crypt(coalesce(p_password, ''), c.password_hash) <> c.password_hash THEN
    RETURN private.registrar_fallo(u);
  END IF;
  IF c.debe_cambiar THEN
    RETURN private.respuesta_error('Debes cambiar tu contraseña temporal en la app TCONTROL antes de usar el kiosco.', 'DEBE_CAMBIAR', 403);
  END IF;
  UPDATE private.credenciales SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE usuario = u;
  RETURN NULL;   -- NULL = autenticado
END $$;

CREATE OR REPLACE FUNCTION api.kiosco_identificar(p_usuario text, p_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE err jsonb := private.kiosco_autenticar(p_usuario, p_password); e core.empleados;
BEGIN
  IF err IS NOT NULL THEN RETURN err; END IF;
  SELECT * INTO e FROM core.empleados WHERE id = trim(p_usuario);
  RETURN jsonb_build_object('ok', true, 'id', e.id, 'nombre', e.nombre, 'area', e.area,
    'foto_url', private.url_foto(e.id, e.foto_legado, (SELECT f.actualizado_en FROM core.fotos f WHERE f.empleado_id = e.id)),
    'tipo', private.siguiente_marcacion(e.id));
END $$;

CREATE OR REPLACE FUNCTION api.marcar_kiosco(p_usuario text, p_password text, p_tipo text, p_almuerzo text DEFAULT NULL,
  p_lat float8 DEFAULT NULL, p_lng float8 DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE err jsonb := private.kiosco_autenticar(p_usuario, p_password);
BEGIN
  IF err IS NOT NULL THEN RETURN err; END IF;
  RETURN private.marcar_asistido(trim(p_usuario), p_tipo, p_almuerzo, p_lat, p_lng, 'KIOSCO', 'KIOSCO', trim(p_usuario));
END $$;

REVOKE EXECUTE ON FUNCTION private.marcar_asistido(text, text, text, float8, float8, core.origen, text, text),
  private.kiosco_autenticar(text, text), private.siguiente_marcacion(text) FROM PUBLIC, anon, empleado, guardia;
GRANT EXECUTE ON FUNCTION api.guardia_buscar(text), api.marcar_guardia(text, text, text, float8, float8), api.presentes_hoy()
  TO guardia, supervisor;
GRANT EXECUTE ON FUNCTION api.marcar_consumido(text) TO supervisor;
GRANT EXECUTE ON FUNCTION api.kiosco_identificar(text, text), api.marcar_kiosco(text, text, text, text, float8, float8) TO anon;
