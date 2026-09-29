-- 005 — Esquema expuesto por PostgREST: vistas (security_invoker → aplica RLS) y RPC de lectura.
-- Las RPC de escritura (marcar, justificar, solicitudes…) se agregan en las fases 2 a 5.

-- ───────────── Vistas ─────────────
CREATE OR REPLACE VIEW api.empleados WITH (security_invoker = true) AS
  SELECT id, cedula, nombre, area, cargo, rol, activo, es_pasante, tipo_asistencia,
         puede_autorizar_extras, auth_extras, telefono, fecha_nacimiento, fecha_ingreso,
         base_lat, base_lng, base_radio_m, url_rol_pagos,
         coalesce(foto_path, foto_legado) AS foto_url, cultura_habilitada
  FROM core.empleados;

CREATE OR REPLACE VIEW api.marcaciones WITH (security_invoker = true) AS
  SELECT id, empleado_id, tipo, ts_servidor, fecha, hora, lat, lng, distancia_m, dispositivo, modo,
         almuerzo, horas_extra, autoriza, tipo_salida, motivo_entrada_tardia, quien_justifica_entrada,
         motivo_salida, razon_permiso, quien_justifica, justificado, razon_justificacion, observacion,
         menu, estado_emergencia, estado_emergencia_ts, origen
  FROM core.marcaciones;

CREATE OR REPLACE VIEW api.novedades WITH (security_invoker = true) AS
  SELECT id, empleado_id, fecha, tipo, justificado, motivo, quien_justifica, observacion,
         hora_inicio, hora_fin, autoriza, origen, creado_por, creado_en
  FROM core.novedades;

CREATE OR REPLACE VIEW api.ajustes_dia WITH (security_invoker = true) AS
  SELECT * FROM core.ajustes_dia;

CREATE OR REPLACE VIEW api.consumo_almuerzos WITH (security_invoker = true) AS
  SELECT * FROM core.consumo_almuerzos;

CREATE OR REPLACE VIEW api.solicitudes_invitados WITH (security_invoker = true) AS
  SELECT id, fecha, hora, tipo_solicitud, subtipo, cantidad, invitado, empresa, empleado_id,
         empleado_nombre, empleado_area, hora_servicio, observaciones, observaciones_completas,
         estado, creado_por, actualizado_por, actualizado_en, ts
  FROM core.solicitudes_invitados;

CREATE OR REPLACE VIEW api.configuracion WITH (security_invoker = true) AS
  SELECT clave, valor, actualizado_en FROM core.configuracion;

CREATE OR REPLACE VIEW api.horarios WITH (security_invoker = true) AS SELECT * FROM core.horarios;
CREATE OR REPLACE VIEW api.feriados WITH (security_invoker = true) AS SELECT * FROM core.feriados;
CREATE OR REPLACE VIEW api.menu_semanal WITH (security_invoker = true) AS SELECT * FROM core.menu_semanal;
CREATE OR REPLACE VIEW api.historial_menu WITH (security_invoker = true) AS
  SELECT id, fecha, dia, sopa, plato, jugo FROM core.historial_menu;
CREATE OR REPLACE VIEW api.cultura_preguntas WITH (security_invoker = true) AS SELECT * FROM core.cultura_preguntas;
CREATE OR REPLACE VIEW api.emergencias WITH (security_invoker = true) AS SELECT * FROM core.emergencias;
CREATE OR REPLACE VIEW api.desvinculaciones WITH (security_invoker = true) AS
  SELECT id, empleado_id, fecha, motivo, observaciones, desvinculado_por, registrado_en, snapshot
  FROM core.desvinculaciones;
CREATE OR REPLACE VIEW api.whatsapp_plantillas WITH (security_invoker = true) AS SELECT * FROM core.whatsapp_plantillas;
CREATE OR REPLACE VIEW api.whatsapp_logs WITH (security_invoker = true) AS
  SELECT id, ts, empleado_id, nombre_empleado, telefono, tipo_notificacion, estado, detalle_respuesta, enviado_por
  FROM core.whatsapp_logs;
CREATE OR REPLACE VIEW api.auditoria WITH (security_invoker = true) AS
  SELECT id, ts, usuario, rol, tabla, accion, clave, antes, despues FROM core.auditoria;

-- Saldo de vacaciones del año en curso (D-04): A (saldo anterior) + B (adjudicadas) − tomadas.
-- "Tomadas" = días con novedad VACACIONES hasta hoy, desde configuracion.vacaciones.tomadas_desde (P-03).
CREATE OR REPLACE VIEW api.vacaciones_saldo WITH (security_invoker = true) AS
  WITH p AS (
    SELECT extract(year FROM private.hoy())::int AS anio, private.hoy() AS hoy,
           (private.cfg('vacaciones') ->> 'tomadas_desde')::date AS desde)
  SELECT e.id AS empleado_id, p.anio, e.fecha_ingreso,
         private.anios_servicio(e.fecha_ingreso, p.anio) AS anios_servicio,
         coalesce(s.dias, 0) AS saldo_anterior,
         private.vacaciones_adjudicadas(e.fecha_ingreso, p.anio) AS adjudicadas,
         coalesce(s.dias, 0) + coalesce(private.vacaciones_adjudicadas(e.fecha_ingreso, p.anio), 0) AS total,
         (SELECT count(*) FROM core.novedades n
           WHERE n.empleado_id = e.id AND n.tipo = 'VACACIONES' AND n.fecha <= p.hoy
             AND (p.desde IS NULL OR n.fecha >= p.desde))::int AS tomadas,
         coalesce(s.dias, 0) + coalesce(private.vacaciones_adjudicadas(e.fecha_ingreso, p.anio), 0)
           - (SELECT count(*) FROM core.novedades n
               WHERE n.empleado_id = e.id AND n.tipo = 'VACACIONES' AND n.fecha <= p.hoy
                 AND (p.desde IS NULL OR n.fecha >= p.desde)) AS restantes
  FROM core.empleados e CROSS JOIN p
  LEFT JOIN core.vacaciones_saldo_inicial s ON s.empleado_id = e.id AND s.anio = p.anio;

GRANT SELECT ON api.empleados, api.marcaciones, api.novedades, api.ajustes_dia, api.consumo_almuerzos,
  api.solicitudes_invitados, api.configuracion, api.horarios, api.feriados, api.menu_semanal,
  api.cultura_preguntas, api.emergencias, api.vacaciones_saldo
  TO empleado;
GRANT SELECT ON api.historial_menu TO supervisor;
GRANT SELECT ON api.desvinculaciones, api.whatsapp_plantillas, api.whatsapp_logs, api.auditoria TO supervisor_admin;

-- ───────────── RPC de lectura ─────────────
-- Hora oficial del servidor (el cliente no usa su reloj para decidir reglas).
CREATE OR REPLACE FUNCTION api.ahora()
RETURNS TABLE (fecha date, hora time(0), tipo_dia text, periodo_inicio date, periodo_fin date)
LANGUAGE sql STABLE AS $$
  SELECT private.hoy(), private.ahora_local()::time(0), private.tipo_dia(private.hoy()),
         (private.periodo(private.hoy())).inicio, (private.periodo(private.hoy())).fin
$$;

-- Vista previa al escribir el ID en la vinculación/login (§1.1). Solo datos no sensibles.
CREATE OR REPLACE FUNCTION api.vista_previa_empleado(p_id text)
RETURNS TABLE (id text, nombre text, area text, cargo text, foto_url text, tiene_password boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT e.id, e.nombre, e.area, e.cargo, coalesce(e.foto_path, e.foto_legado),
         coalesce(c.password_hash IS NOT NULL, false)
  FROM core.empleados e
  LEFT JOIN private.credenciales c ON c.usuario = e.id
  WHERE e.id = trim(p_id) AND e.activo
$$;

-- Marcaciones y novedad de hoy de un empleado. Empleado: solo el suyo; guardia y supervisor: cualquiera.
CREATE OR REPLACE FUNCTION api.estado_hoy(p_empleado_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_id text := coalesce(p_empleado_id, private.jwt_empleado_id());
  v_hoy date := private.hoy();
  e core.empleados;
BEGIN
  IF v_id IS NULL OR NOT (private.es_propio(v_id) OR private.nivel() = 0 OR private.es_supervisor()) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO e FROM core.empleados WHERE id = v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empleado no encontrado' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object(
    'empleado', jsonb_build_object('id', e.id, 'nombre', e.nombre, 'area', e.area, 'cargo', e.cargo,
                                   'foto_url', coalesce(e.foto_path, e.foto_legado), 'activo', e.activo),
    'fecha', v_hoy,
    'tipo_dia', private.tipo_dia(v_hoy),
    'marcaciones', coalesce((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'tipo', m.tipo, 'hora', m.hora,
                                'almuerzo', m.almuerzo, 'modo', m.modo, 'estado_emergencia', m.estado_emergencia)
                              ORDER BY m.ts_servidor)
                             FROM core.marcaciones m WHERE m.empleado_id = v_id AND m.fecha = v_hoy), '[]'),
    'novedad', (SELECT to_jsonb(n) - 'legacy_raw' - 'legacy_id' FROM core.novedades n
                WHERE n.empleado_id = v_id AND n.fecha = v_hoy),
    'minutos_atraso', (SELECT private.minutos_atraso(v_hoy, m.hora, e.es_pasante, e.tipo_asistencia)
                       FROM core.marcaciones m WHERE m.empleado_id = v_id AND m.fecha = v_hoy AND m.tipo = 'ENTRADA'
                       ORDER BY m.ts_servidor LIMIT 1));
END $$;

-- Pestaña "Presentes" de guardia: la última marcación de hoy es de ingreso.
CREATE OR REPLACE FUNCTION api.presentes_hoy()
RETURNS TABLE (empleado_id text, nombre text, area text, foto_url text, tipo text, hora time, almuerzo boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT (private.nivel() = 0 OR private.es_supervisor()) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT e.id, e.nombre, e.area, coalesce(e.foto_path, e.foto_legado), u.tipo, u.hora::time, u.almuerzo
  FROM (SELECT DISTINCT ON (m.empleado_id) m.empleado_id, m.tipo, m.hora, m.almuerzo
        FROM core.marcaciones m WHERE m.fecha = private.hoy()
        ORDER BY m.empleado_id, m.ts_servidor DESC) u
  JOIN core.empleados e ON e.id = u.empleado_id
  WHERE u.tipo IN ('ENTRADA','ENTRADA_CAMPO','RETORNO_CAMPO')
  ORDER BY e.nombre;
END $$;

-- Lista de catering del día (§3): almuerzo SI en ENTRADA o SOLO_ALMUERZO, con estado de consumo.
CREATE OR REPLACE FUNCTION api.lista_catering(p_fecha date DEFAULT NULL)
RETURNS TABLE (empleado_id text, nombre text, area text, foto_url text, hora_entrada time,
               consumido boolean, hora_consumo timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE f date := coalesce(p_fecha, private.hoy());
BEGIN
  IF NOT private.es_supervisor() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT e.id, e.nombre, e.area, coalesce(e.foto_path, e.foto_legado), a.hora::time,
         c.empleado_id IS NOT NULL, c.ts
  FROM (SELECT DISTINCT ON (m.empleado_id) m.empleado_id, m.hora
        FROM core.marcaciones m
        WHERE m.fecha = f AND m.tipo IN ('ENTRADA','SOLO_ALMUERZO') AND m.almuerzo
        ORDER BY m.empleado_id, m.ts_servidor) a
  JOIN core.empleados e ON e.id = a.empleado_id
  LEFT JOIN core.consumo_almuerzos c ON c.empleado_id = a.empleado_id AND c.fecha = f
  ORDER BY e.nombre;
END $$;

-- Período 26–25 que contiene una fecha (R-16)
CREATE OR REPLACE FUNCTION api.periodo(p_fecha date DEFAULT NULL)
RETURNS TABLE (inicio date, fin date)
LANGUAGE sql STABLE AS $$ SELECT * FROM private.periodo(coalesce(p_fecha, private.hoy())) $$;

GRANT EXECUTE ON FUNCTION api.ahora(), api.vista_previa_empleado(text) TO anon, empleado, guardia;
GRANT EXECUTE ON FUNCTION api.estado_hoy(text), api.presentes_hoy(), api.periodo(date) TO empleado, guardia;
GRANT EXECUTE ON FUNCTION api.lista_catering(date) TO supervisor;
