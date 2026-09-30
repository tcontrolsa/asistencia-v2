-- Fase 5 (bloque C): Dashboard y Reportes.
-- 1) registros_legado: las novedades importadas de Firestore (sin editar) se entregan como las veía el
--    legado (firebase_backend.js _normalizarRegistro + normalizarRegistroDesdeTimestamp): 'justificado'
--    vacío = 'SI' y la hora tomada del documento o de su timestamp. Así los KPIs y reportes dan los mismos
--    números que el sistema actual (D-24). Los datos guardados no cambian.
-- 2) api.sup_solicitudes_invitados: solicitudes de un rango (reportes de períodos anteriores a la carga inicial).

-- 'HH:MM:SS' a partir de un texto con hora ('8:05', '08:05:07', 'Thu Jul 16 2026 08:18:43 GMT-0500 …')
CREATE OR REPLACE FUNCTION private.hora_legado(t text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN m IS NULL THEN NULL
              ELSE lpad(m[1], 2, '0') || ':' || m[2] || ':' || coalesce(m[3], '00') END
  FROM (SELECT regexp_match(coalesce(t, ''), '(\d{1,2}):(\d{2})(?::(\d{2}))?') AS m) x
$$;

CREATE OR REPLACE FUNCTION private.registros_legado(p_desde date, p_hasta date, p_empleado_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH m AS (
    SELECT m.*, (coalesce(m.legacy_raw ? 'fuente', false) AND m.editado_en IS NULL) AS de_hoja,
           row_number() OVER (PARTITION BY m.empleado_id, m.fecha
                              ORDER BY (m.tipo = 'ENTRADA') DESC, m.hora, m.id) AS orden_permiso
    FROM core.marcaciones m
    WHERE m.fecha BETWEEN p_desde AND p_hasta AND (p_empleado_id IS NULL OR m.empleado_id = p_empleado_id)
  ), n AS (
    SELECT n.*, (n.legacy_raw IS NOT NULL AND NOT n.legacy_raw ? 'fuente' AND n.editado_en IS NULL) AS de_firestore
    FROM core.novedades n
    WHERE n.fecha BETWEEN p_desde AND p_hasta AND (p_empleado_id IS NULL OR n.empleado_id = p_empleado_id)
  ), a AS (
    SELECT a.* FROM core.ajustes_dia a
    WHERE a.fecha BETWEEN p_desde AND p_hasta AND (p_empleado_id IS NULL OR a.empleado_id = p_empleado_id)
  ), filas AS (
    -- Marcaciones
    SELECT m.empleado_id, m.fecha, jsonb_strip_nulls(jsonb_build_object(
        'id', 'm' || m.id, 'empleadoId', m.empleado_id, 'fecha', to_char(m.fecha, 'YYYY-MM-DD'),
        'hora', to_char(m.hora, 'HH24:MI:SS'), 'tipo', m.tipo,
        'almuerzo', CASE m.almuerzo WHEN true THEN 'SI' WHEN false THEN 'NO' ELSE '' END,
        'modo', m.modo, 'lat', m.lat, 'lng', m.lng, 'dispositivo', m.dispositivo,
        'horasExtra', CASE WHEN m.horas_extra THEN 'SI' ELSE 'NO' END, 'autoriza', m.autoriza,
        'justificado', m.justificado::text, 'razon_justificac', m.razon_justificacion,
        'quien_justifica', m.quien_justifica, 'observacion', m.observacion,
        'estado_emergencia', m.estado_emergencia, 'origen', m.origen::text, 'creado_por', m.creado_por,
        -- Solo visibles para mostrar (D-24)
        'motivo_entrada_empleado', CASE WHEN NOT m.de_hoja THEN m.motivo_entrada_tardia END,
        'motivo_salida_empleado', CASE WHEN NOT m.de_hoja THEN m.motivo_salida END,
        'tipo_salida_empleado', CASE WHEN NOT m.de_hoja THEN m.tipo_salida END,
        'razon_permiso_empleado', CASE WHEN nullif(m.legacy_raw ->> 'razon_permiso', '') IS NULL THEN m.razon_permiso END))
      -- Filas del archivo de Sheets: el legado sí leía estos campos (normR en obtenerDatosSupervisor)
      || CASE WHEN m.de_hoja THEN jsonb_strip_nulls(jsonb_build_object(
           'razon_salida', m.motivo_salida, 'razon_entrada_tardia', m.motivo_entrada_tardia,
           'quien_justifica_entrada', m.quien_justifica_entrada, 'tipo_salida', m.tipo_salida))
         ELSE '{}'::jsonb END
      || CASE WHEN m.editado_en IS NULL AND nullif(m.legacy_raw ->> 'razon_permiso', '') IS NOT NULL
              THEN jsonb_build_object('razon_permiso', m.legacy_raw ->> 'razon_permiso') ELSE '{}'::jsonb END
      AS reg,
      CASE WHEN m.orden_permiso = 1 THEN 0 ELSE 2 END AS prioridad_permiso
    FROM m
    UNION ALL
    -- Novedades aprobadas o registradas por supervisor
    SELECT n.empleado_id, n.fecha, jsonb_strip_nulls(jsonb_build_object(
        'id', 'n' || n.id, 'empleadoId', n.empleado_id, 'fecha', to_char(n.fecha, 'YYYY-MM-DD'),
        -- Novedad importada de Firestore sin editar: hora del documento o, si no hay, la de su timestamp
        -- (normalizarRegistroDesdeTimestamp del legado)
        'hora', CASE WHEN n.de_firestore
                     THEN coalesce(nullif(private.hora_legado(n.legacy_raw ->> 'hora'), '00:00:00'),
                                   private.hora_legado(n.legacy_raw ->> 'timestamp'), '00:00:00')
                     ELSE '00:00:00' END,
        'tipo', n.tipo,
        'razon_ausencia', CASE WHEN (n.legacy_raw IS NULL AND n.legacy_id IS NULL) OR n.editado_en IS NOT NULL
                               THEN coalesce(nullif(n.motivo, ''), private.razon_por_tipo(n.tipo))
                               ELSE private.razon_por_tipo(n.tipo) END,
        'razon_justificac', CASE WHEN (n.legacy_raw IS NULL AND n.legacy_id IS NULL) OR n.editado_en IS NOT NULL
                                 THEN nullif(n.motivo, '')
                                 ELSE nullif(n.legacy_raw ->> 'razon_justificac', '') END,
        -- El legado daba por justificada toda ausencia de Firestore sin valor en 'justificado'
        'justificado', CASE WHEN n.de_firestore THEN coalesce(nullif(n.legacy_raw ->> 'justificado', ''), 'SI')
                            ELSE n.justificado::text END,
        'quien_justifica', n.quien_justifica, 'observacion', n.observacion,
        'autoriza', n.autoriza, 'modo', coalesce(n.legacy_raw ->> 'modo', 'OFICINA'),
        'almuerzo', coalesce(n.legacy_raw ->> 'almuerzo', ''),
        'hora_inicio', to_char(n.hora_inicio, 'HH24:MI'), 'hora_fin', to_char(n.hora_fin, 'HH24:MI'),
        'origen', n.origen::text)),
      1
    FROM n WHERE n.justificado <> 'PENDIENTE'
    UNION ALL
    -- Reportes del colaborador pendientes de aprobación (D-08): no justifican
    SELECT n.empleado_id, n.fecha, jsonb_strip_nulls(jsonb_build_object(
        'id', 'n' || n.id, 'empleadoId', n.empleado_id, 'fecha', to_char(n.fecha, 'YYYY-MM-DD'), 'hora', '00:00:00',
        'tipo', 'ESTADO', 'pendiente_aprobacion', true, 'tipo_reportado', n.tipo, 'motivo_pendiente', n.motivo,
        'observacion_pendiente', n.observacion, 'quien_reporta', n.quien_justifica)),
      3
    FROM n WHERE n.justificado = 'PENDIENTE'
    UNION ALL
    -- Minutos de un día sin ningún registro (el legado los perdía): fila técnica
    SELECT a.empleado_id, a.fecha, jsonb_build_object(
        'id', 'a' || a.empleado_id || '_' || to_char(a.fecha, 'YYYYMMDD'), 'empleadoId', a.empleado_id,
        'fecha', to_char(a.fecha, 'YYYY-MM-DD'), 'hora', '00:00:00', 'tipo', 'AJUSTE_TIEMPO'), 4
    FROM a
    WHERE NOT EXISTS (SELECT 1 FROM m WHERE m.empleado_id = a.empleado_id AND m.fecha = a.fecha)
      AND NOT EXISTS (SELECT 1 FROM n WHERE n.empleado_id = a.empleado_id AND n.fecha = a.fecha)
  ), con_permiso AS (
    -- Los minutos del día van en el registro que el legado usaba (la ENTRADA o el primero del día)
    SELECT f.reg || CASE WHEN f.prioridad_permiso = (min(f.prioridad_permiso) OVER (PARTITION BY f.empleado_id, f.fecha))
                              AND a.empleado_id IS NOT NULL
                         THEN jsonb_strip_nulls(jsonb_build_object(
                                'permiso_personal_mins', a.min_permiso_personal, 'permiso_medico_mins', a.min_permiso_medico,
                                'tiempo_justificado_mins', a.min_justificados, 'razon_permiso', nullif(a.comentario, '')))
                         ELSE '{}'::jsonb END AS reg,
           f.fecha, f.reg ->> 'hora' AS hora
    FROM filas f
    LEFT JOIN a ON a.empleado_id = f.empleado_id AND a.fecha = f.fecha
  )
  SELECT coalesce(jsonb_agg(reg ORDER BY fecha, hora, reg ->> 'tipo', reg ->> 'id'), '[]'::jsonb) FROM con_permiso
$$;

CREATE OR REPLACE FUNCTION api.sup_solicitudes_invitados(p_desde date, p_hasta date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM private.exigir_supervisor();
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN RAISE EXCEPTION 'Rango inválido' USING ERRCODE = '22023'; END IF;
  IF p_hasta - p_desde > 800 THEN RAISE EXCEPTION 'Rango demasiado amplio' USING ERRCODE = '22023'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(s) - 'legacy_raw' ORDER BY s.fecha DESC, s.hora DESC), '[]')
          FROM core.solicitudes_invitados s WHERE s.fecha BETWEEN p_desde AND p_hasta);
END $$;

REVOKE ALL ON FUNCTION api.sup_solicitudes_invitados(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.sup_solicitudes_invitados(date, date) TO supervisor;
REVOKE ALL ON FUNCTION private.hora_legado(text) FROM PUBLIC;
