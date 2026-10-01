-- 020 — Fase 7: operación en paralelo (P-08: el legado Firebase sigue en producción).
-- Cada noche el worker lee Firestore (registros y empleados; lectura pública de las reglas del legado, sin
-- credenciales), guarda los documentos tal cual en core.legado_documentos (sin PIN ni token de dispositivo) y los
-- aplica a la base nueva como marcaciones/novedades (legacy_id 'fs:<id>') y fichas. Después arma la vista del
-- legado y la de la base nueva, les aplica el mismo motor (D-24) y guarda el reporte diario de diferencias en
-- core.paralelo_reportes (Sup. Admin lo ve en diagnostico.html).

CREATE TABLE IF NOT EXISTS core.legado_documentos (
  coleccion  text NOT NULL,
  doc_id     text NOT NULL,
  data       jsonb NOT NULL,
  visto_en   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coleccion, doc_id)
);
ALTER TABLE core.legado_documentos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS core.paralelo_reportes (
  fecha        date PRIMARY KEY,           -- día comparado
  generado_en  timestamptz NOT NULL DEFAULT now(),
  resumen      jsonb NOT NULL,
  diferencias  jsonb NOT NULL DEFAULT '[]'
);
ALTER TABLE core.paralelo_reportes ENABLE ROW LEVEL SECURITY;

UPDATE core.configuracion SET valor = valor || jsonb_build_object('copia_legado', '00:15', 'reporte_paralelo', '00:45')
 WHERE clave = 'tareas' AND NOT valor ? 'copia_legado';

-- ───────────── Tareas que ejecuta el propio worker (necesitan red o el motor de cálculo) ─────────────
CREATE OR REPLACE FUNCTION private.worker_tarea_externa(p_tarea text, p_ahora timestamp DEFAULT NULL) RETURNS date
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE ahora timestamp := coalesce(p_ahora, private.ahora_local()); hora text;
BEGIN
  hora := private.cfg('tareas') ->> p_tarea;
  IF hora IS NULL OR to_char(ahora, 'HH24:MI') < hora THEN RETURN NULL; END IF;
  INSERT INTO core.tareas_ejecuciones (tarea, fecha) VALUES (p_tarea, ahora::date) ON CONFLICT DO NOTHING;
  RETURN CASE WHEN FOUND THEN ahora::date END;
END $$;

CREATE OR REPLACE FUNCTION private.worker_tarea_fin(p_tarea text, p_fecha date, p_resultado jsonb, p_error text DEFAULT NULL) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  UPDATE core.tareas_ejecuciones SET fin = now(), resultado = p_resultado, error = p_error WHERE tarea = p_tarea AND fecha = p_fecha
$$;

-- ───────────── Copia del legado ─────────────
-- Fecha del documento: 'YYYY-MM-DD', 'DD/MM/YYYY' o, si falta, la del timestamp en Guayaquil (normalizarRegistroDesdeTimestamp)
CREATE OR REPLACE FUNCTION private.fecha_legado(d jsonb) RETURNS date LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN d ->> 'fecha' ~ '^\d{4}-\d{2}-\d{2}' THEN left(d ->> 'fecha', 10)::date
    WHEN d ->> 'fecha' ~ '^\d{1,2}/\d{1,2}/\d{4}' THEN to_date(substring(d ->> 'fecha' FROM '^\d{1,2}/\d{1,2}/\d{4}'), 'DD/MM/YYYY')
    WHEN d ->> 'timestamp' ~ '^\d{4}-\d{2}-\d{2}T' THEN ((d ->> 'timestamp')::timestamptz AT TIME ZONE 'America/Guayaquil')::date
  END
$$;

-- p_docs: [{id, data}] de una colección completa. p_completo: la lista trae todos los documentos (habilita borrar
-- lo que el legado eliminó; nunca si llega menos de la mitad de lo que había, para no vaciar por un error de red).
CREATE OR REPLACE FUNCTION private.worker_copia_legado(p_coleccion text, p_docs jsonb, p_completo boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  antes int; n int := jsonb_array_length(coalesce(p_docs, '[]')); borrar boolean; parcial jsonb;
  r jsonb := jsonb_build_object('coleccion', p_coleccion, 'documentos', n);
  k int;
BEGIN
  IF p_coleccion NOT IN ('registros', 'empleados') THEN RAISE EXCEPTION 'Colección no soportada: %', p_coleccion; END IF;
  PERFORM set_config('app.etl', 'on', true);
  SELECT count(*) INTO antes FROM core.legado_documentos WHERE coleccion = p_coleccion;
  borrar := p_completo AND n >= antes / 2;

  INSERT INTO core.legado_documentos (coleccion, doc_id, data, visto_en)
  SELECT p_coleccion, x ->> 'id', (x -> 'data') - 'pin' - 'deviceToken', now()
    FROM jsonb_array_elements(p_docs) x WHERE nullif(x ->> 'id', '') IS NOT NULL
  ON CONFLICT (coleccion, doc_id) DO UPDATE SET data = EXCLUDED.data, visto_en = now();
  IF borrar THEN
    DELETE FROM core.legado_documentos l WHERE l.coleccion = p_coleccion
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_docs) x WHERE x ->> 'id' = l.doc_id);
  END IF;

  IF p_coleccion = 'empleados' THEN
    CREATE TEMP TABLE IF NOT EXISTS t_emp (id text, nombre text, area text, cargo text, activo boolean, telefono text,
      supervisor text, nacimiento date, lat float8, lng float8, rol_pagos text) ON COMMIT DROP;
    TRUNCATE t_emp;
    INSERT INTO t_emp
    SELECT trim(coalesce(nullif(d ->> 'id', ''), l.doc_id)), nullif(trim(d ->> 'nombre'), ''), nullif(trim(d ->> 'area'), ''),
           nullif(trim(d ->> 'cargo'), ''), upper(coalesce(d ->> 'activo', 'SI')) NOT IN ('NO', 'FALSE', 'INACTIVO', '0'),
           private.normalizar_telefono(d ->> 'telefono'), upper(trim(coalesce(d ->> 'supervisor', d ->> 'esSupervisor', 'NO'))),
           CASE WHEN d ->> 'fechaNacimiento' ~ '^\d{4}-\d{2}-\d{2}' THEN left(d ->> 'fechaNacimiento', 10)::date END,
           nullif(d ->> 'baseLat', '')::float8, nullif(d ->> 'baseLng', '')::float8,
           CASE WHEN d ->> 'id_dispositivo' ~* '^https?://' THEN d ->> 'id_dispositivo' END
      FROM core.legado_documentos l, LATERAL (SELECT l.data AS d) x
     WHERE l.coleccion = 'empleados' AND coalesce(nullif(d ->> 'id', ''), l.doc_id) ~ '^[0-9A-Za-z_-]+$';
    -- Altas: colaboradores creados en el legado durante el paralelo (rol según el selector del legado)
    WITH alta AS (
      INSERT INTO core.empleados (id, nombre, area, cargo, rol, activo, telefono, fecha_nacimiento, base_lat, base_lng,
                                  url_rol_pagos, es_pasante, tipo_asistencia, puede_autorizar_extras)
      SELECT t.id, coalesce(t.nombre, 'SIN NOMBRE'), t.area, t.cargo,
             CASE WHEN t.supervisor = 'SUPERVISOR ADMIN' THEN 'SUPERVISOR_ADMIN' WHEN t.supervisor = 'SI' THEN 'SUPERVISOR' ELSE 'EMPLEADO' END::core.rol_app,
             t.activo, t.telefono, t.nacimiento, t.lat, t.lng, t.rol_pagos,
             private.texto_es_pasante(t.cargo, t.area), private.texto_tipo_asistencia(t.cargo, t.area), private.texto_puede_autorizar_extras(t.cargo)
        FROM t_emp t WHERE NOT EXISTS (SELECT 1 FROM core.empleados e WHERE e.id = t.id)
      RETURNING id)
    SELECT count(*) INTO k FROM alta;
    INSERT INTO private.credenciales (usuario, tipo_cuenta, password_hash, debe_cambiar)
    SELECT t.id, 'EMPLEADO', NULL, true FROM t_emp t ON CONFLICT (usuario) DO NOTHING;
    r := r || jsonb_build_object('altas', k);
    -- Cambios de ficha hechos en el legado (el rol y las credenciales los manda la base nueva)
    WITH cambio AS (
      UPDATE core.empleados e SET nombre = coalesce(t.nombre, e.nombre), area = coalesce(t.area, e.area), cargo = coalesce(t.cargo, e.cargo),
             activo = t.activo, telefono = coalesce(t.telefono, e.telefono)
        FROM t_emp t
       WHERE e.id = t.id AND (e.nombre IS DISTINCT FROM coalesce(t.nombre, e.nombre) OR e.area IS DISTINCT FROM coalesce(t.area, e.area)
             OR e.cargo IS DISTINCT FROM coalesce(t.cargo, e.cargo) OR e.activo IS DISTINCT FROM t.activo
             OR e.telefono IS DISTINCT FROM coalesce(t.telefono, e.telefono))
      RETURNING e.id)
    SELECT count(*) INTO k FROM cambio;
    r := r || jsonb_build_object('actualizados', k,
      'rolDistinto', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'legado', t.supervisor, 'nuevo', e.rol::text) ORDER BY e.id), '[]')
                        FROM t_emp t JOIN core.empleados e ON e.id = t.id
                       WHERE (CASE WHEN t.supervisor = 'SUPERVISOR ADMIN' THEN 'SUPERVISOR_ADMIN' WHEN t.supervisor = 'SI' THEN 'SUPERVISOR' ELSE 'EMPLEADO' END)
                             <> CASE WHEN e.rol::text = 'ADMIN' THEN 'SUPERVISOR_ADMIN' ELSE e.rol::text END),
      'soloEnBaseNueva', (SELECT count(*) FROM core.empleados e WHERE e.activo AND NOT EXISTS (SELECT 1 FROM t_emp t WHERE t.id = e.id)));
    RETURN r;
  END IF;

  -- ── registros → marcaciones y novedades ──
  CREATE TEMP TABLE IF NOT EXISTS t_reg (legacy_id text, empleado_id text, nombre text, fecha date, hora time, tipo text,
    d jsonb, creado timestamptz) ON COMMIT DROP;
  TRUNCATE t_reg;
  INSERT INTO t_reg
  SELECT 'fs:' || l.doc_id, trim(d ->> 'empleadoId'), d ->> 'nombre', private.fecha_legado(d),
         coalesce(nullif(private.hora_legado(d ->> 'hora'), '00:00:00'),
                  CASE WHEN d ->> 'timestamp' ~ '^\d{4}-\d{2}-\d{2}T'
                       THEN to_char((d ->> 'timestamp')::timestamptz AT TIME ZONE 'America/Guayaquil', 'HH24:MI:SS') END,
                  '00:00:00')::time,
         CASE upper(trim(d ->> 'tipo')) WHEN 'VACACION' THEN 'VACACIONES' ELSE upper(trim(d ->> 'tipo')) END,
         d, CASE WHEN d ->> 'timestamp' ~ '^\d{4}-\d{2}-\d{2}T' THEN (d ->> 'timestamp')::timestamptz END
    FROM core.legado_documentos l, LATERAL (SELECT l.data AS d) x
   WHERE l.coleccion = 'registros' AND coalesce(d ->> 'empleadoId', '') ~ '^\s*[0-9A-Za-z_-]+\s*$';
  DELETE FROM t_reg WHERE fecha IS NULL OR tipo IS NULL OR tipo = '';

  -- Colaboradores sin ficha (no deberían existir: la copia de empleados va antes): ficha inactiva mínima
  INSERT INTO core.empleados (id, nombre, activo)
  SELECT DISTINCT ON (t.empleado_id) t.empleado_id, coalesce(t.nombre, 'DESCONOCIDO ' || t.empleado_id), false
    FROM t_reg t WHERE NOT EXISTS (SELECT 1 FROM core.empleados e WHERE e.id = t.empleado_id)
   ORDER BY t.empleado_id, t.fecha DESC;
  GET DIAGNOSTICS k = ROW_COUNT;
  r := r || jsonb_build_object('fichasCreadas', k);

  -- Lo que el legado borró (o cambió de tipo) deja de estar; lo editado en la base nueva no se toca
  IF borrar THEN
    DELETE FROM core.marcaciones m WHERE m.legacy_id LIKE 'fs:%' AND m.editado_en IS NULL
       AND NOT EXISTS (SELECT 1 FROM t_reg t WHERE t.legacy_id = m.legacy_id AND t.tipo = m.tipo);
    GET DIAGNOSTICS k = ROW_COUNT;
    r := r || jsonb_build_object('marcacionesRetiradas', k);
    DELETE FROM core.novedades n WHERE n.legacy_id LIKE 'fs:%' AND n.editado_en IS NULL
       AND NOT EXISTS (SELECT 1 FROM t_reg t WHERE t.legacy_id = n.legacy_id);
    GET DIAGNOSTICS k = ROW_COUNT;
    r := r || jsonb_build_object('novedadesRetiradas', k);
  END IF;

  -- Marcaciones: una por empleado|fecha|tipo|hh:mm; si ya existe con otro origen (copia del 29-sep), se respeta
  WITH ins AS (
    INSERT INTO core.marcaciones AS m (empleado_id, tipo, ts_servidor, fecha, hora, lat, lng, dispositivo, modo, almuerzo,
      horas_extra, autoriza, tipo_salida, motivo_entrada_tardia, quien_justifica_entrada, motivo_salida, razon_permiso,
      quien_justifica, justificado, razon_justificacion, observacion, estado_emergencia, origen, legacy_id, legacy_raw)
    SELECT DISTINCT ON (t.empleado_id, t.fecha, t.tipo, to_char(t.hora, 'HH24:MI'))
           t.empleado_id, t.tipo, (t.fecha + t.hora) AT TIME ZONE 'America/Guayaquil', t.fecha, t.hora,
           nullif(t.d ->> 'lat', '')::float8, nullif(t.d ->> 'lng', '')::float8, nullif(t.d ->> 'dispositivo', ''),
           CASE WHEN upper(t.d ->> 'modo') = 'CAMPO' THEN 'CAMPO' ELSE 'OFICINA' END,
           CASE upper(trim(t.d ->> 'almuerzo')) WHEN 'SI' THEN true WHEN 'NO' THEN false END,
           upper(trim(coalesce(t.d ->> 'horasExtra', ''))) = 'SI', nullif(t.d ->> 'autoriza', ''),
           CASE WHEN upper(t.d ->> 'tipoSalida') IN ('FINAL','PERMISO','PERMISO_CON_SALIDA_TEMPRANA','TRABAJO_CAMPO',
                     'SALIDA_PASANTE','SALIDA_TEMPRANA_JUSTIFICADA') THEN upper(t.d ->> 'tipoSalida') END,
           coalesce(nullif(t.d ->> 'razonEntradaTardia', ''), nullif(t.d ->> 'razon_entrada_tardia', '')),
           nullif(t.d ->> 'quienJustificaEntrada', ''),
           coalesce(nullif(t.d ->> 'razonSalidaTemprana', ''), nullif(t.d ->> 'razon_salida', '')),
           coalesce(nullif(t.d ->> 'razon_permiso', ''), nullif(t.d ->> 'razonPermiso', '')),
           coalesce(nullif(t.d ->> 'quien_justifica', ''), nullif(t.d ->> 'quienJustifica', '')),
           CASE upper(trim(coalesce(t.d ->> 'justificado', ''))) WHEN 'SI' THEN 'SI' ELSE 'NO' END::core.justificado,
           nullif(t.d ->> 'razon_justificac', ''),
           coalesce(nullif(t.d ->> 'observacion', ''), nullif(t.d ->> 'observaciones', ''), nullif(t.d ->> 'razon_ausencia', '')),
           CASE WHEN t.tipo = 'ENTRADA' THEN nullif(t.d ->> 'estado', '') END,
           CASE WHEN t.d ->> 'dispositivo' = 'GUARDIA' THEN 'GUARDIA' WHEN t.d ->> 'dispositivo' = 'AUTO_COMPLETAR' THEN 'SISTEMA'
                WHEN t.d ->> 'dispositivo' ILIKE 'MANUAL%' THEN 'SUPERVISOR' ELSE 'IMPORTADO' END::core.origen,
           t.legacy_id, t.d
      FROM t_reg t
     WHERE t.tipo IN ('ENTRADA','SALIDA','ENTRADA_CAMPO','SALIDA_CAMPO','RETORNO_CAMPO','SOLO_ALMUERZO')
       AND NOT EXISTS (SELECT 1 FROM core.marcaciones x WHERE x.empleado_id = t.empleado_id AND x.fecha = t.fecha AND x.tipo = t.tipo
                         AND to_char(x.hora, 'HH24:MI') = to_char(t.hora, 'HH24:MI') AND x.legacy_id IS DISTINCT FROM t.legacy_id)
     ORDER BY t.empleado_id, t.fecha, t.tipo, to_char(t.hora, 'HH24:MI'), t.creado NULLS LAST, t.legacy_id
    ON CONFLICT (legacy_id) DO UPDATE SET hora = EXCLUDED.hora, ts_servidor = EXCLUDED.ts_servidor, fecha = EXCLUDED.fecha,
      almuerzo = EXCLUDED.almuerzo, horas_extra = EXCLUDED.horas_extra, autoriza = EXCLUDED.autoriza, modo = EXCLUDED.modo,
      justificado = EXCLUDED.justificado, razon_justificacion = EXCLUDED.razon_justificacion, quien_justifica = EXCLUDED.quien_justifica,
      motivo_entrada_tardia = EXCLUDED.motivo_entrada_tardia, motivo_salida = EXCLUDED.motivo_salida, tipo_salida = EXCLUDED.tipo_salida,
      observacion = EXCLUDED.observacion, estado_emergencia = EXCLUDED.estado_emergencia, legacy_raw = EXCLUDED.legacy_raw
      WHERE m.editado_en IS NULL AND m.legacy_raw IS DISTINCT FROM EXCLUDED.legacy_raw
    RETURNING (xmax = 0) AS nueva)
  SELECT jsonb_build_object('marcacionesNuevas', count(*) FILTER (WHERE nueva), 'marcacionesActualizadas', count(*) FILTER (WHERE NOT nueva))
    INTO parcial FROM ins;
  r := r || parcial;

  -- Una novedad que en el legado cambió de día o de colaborador se reemplaza (su legacy_id es único)
  DELETE FROM core.novedades x USING t_reg t
   WHERE x.legacy_id = t.legacy_id AND x.editado_en IS NULL AND (x.fecha <> t.fecha OR x.empleado_id <> t.empleado_id);

  -- Novedades: una por empleado y día (R-18); gana la más reciente del legado
  WITH ins AS (
    INSERT INTO core.novedades AS x (empleado_id, fecha, tipo, justificado, motivo, quien_justifica, observacion, autoriza,
                                     origen, legacy_id, legacy_raw)
    SELECT DISTINCT ON (t.empleado_id, t.fecha) t.empleado_id, t.fecha, t.tipo,
           CASE upper(trim(coalesce(t.d ->> 'justificado', ''))) WHEN 'NO' THEN 'NO' WHEN 'PENDIENTE' THEN 'PENDIENTE' ELSE 'SI' END::core.justificado,
           coalesce(nullif(t.d ->> 'razon_justificac', ''), nullif(t.d ->> 'razon_ausencia', '')),
           nullif(t.d ->> 'quien_justifica', ''), coalesce(nullif(t.d ->> 'observacion', ''), nullif(t.d ->> 'observaciones', '')),
           nullif(t.d ->> 'autoriza', ''), 'IMPORTADO', t.legacy_id, t.d
      FROM t_reg t
     WHERE t.tipo IN ('VACACIONES','PERMISO','PERMISO_PERSONAL','PERMISO_MEDICO','CALAMIDAD_DOMESTICA','FALTA','FALTA_JUSTIFICADA',
                      'SALIDA_JUSTIFICADA','TRABAJO_DE_CAMPO','SALIDA_A_CAMPO','JUSTIFICACION','INASISTENCIA','FERIADO','CUMPLEANOS')
     ORDER BY t.empleado_id, t.fecha, t.creado DESC NULLS LAST, t.hora DESC, t.legacy_id DESC
    ON CONFLICT (empleado_id, fecha) DO UPDATE SET tipo = EXCLUDED.tipo, justificado = EXCLUDED.justificado, motivo = EXCLUDED.motivo,
      quien_justifica = EXCLUDED.quien_justifica, observacion = EXCLUDED.observacion, autoriza = EXCLUDED.autoriza,
      legacy_id = EXCLUDED.legacy_id, legacy_raw = EXCLUDED.legacy_raw
      WHERE x.editado_en IS NULL AND x.legacy_raw IS DISTINCT FROM EXCLUDED.legacy_raw
    RETURNING 1)
  SELECT r || jsonb_build_object('novedadesCopiadas', count(*)) INTO r FROM ins;
  -- Permisos parciales en minutos (gestión de jornada del legado) → ajustes_dia, máximo por día como el ETL
  WITH aj AS (
    INSERT INTO core.ajustes_dia (empleado_id, fecha, min_permiso_personal, min_permiso_medico, min_justificados, razon, quien_justifica)
    SELECT t.empleado_id, t.fecha, max(coalesce(nullif(t.d ->> 'permiso_personal_mins', '')::numeric, 0))::int,
           max(coalesce(nullif(t.d ->> 'permiso_medico_mins', '')::numeric, 0))::int,
           max(coalesce(nullif(t.d ->> 'tiempo_justificado_mins', '')::numeric, 0))::int,
           max(nullif(t.d ->> 'razon_justificac', '')), max(nullif(t.d ->> 'quien_justifica', ''))
      FROM t_reg t
     WHERE coalesce(nullif(t.d ->> 'permiso_personal_mins', '')::numeric, 0) > 0 OR coalesce(nullif(t.d ->> 'permiso_medico_mins', '')::numeric, 0) > 0
        OR coalesce(nullif(t.d ->> 'tiempo_justificado_mins', '')::numeric, 0) > 0
     GROUP BY t.empleado_id, t.fecha
    ON CONFLICT (empleado_id, fecha) DO UPDATE SET min_permiso_personal = EXCLUDED.min_permiso_personal,
      min_permiso_medico = EXCLUDED.min_permiso_medico, min_justificados = EXCLUDED.min_justificados, razon = EXCLUDED.razon,
      quien_justifica = EXCLUDED.quien_justifica, actualizado_en = now()
      WHERE (core.ajustes_dia.min_permiso_personal, core.ajustes_dia.min_permiso_medico, core.ajustes_dia.min_justificados)
            IS DISTINCT FROM (EXCLUDED.min_permiso_personal, EXCLUDED.min_permiso_medico, EXCLUDED.min_justificados)
    RETURNING 1)
  SELECT r || jsonb_build_object('ajustesDia', count(*)) INTO r FROM aj;
  r := r || jsonb_build_object('tiposNoReconocidos', (SELECT coalesce(jsonb_object_agg(z.tipo, z.cuenta), '{}') FROM (
         SELECT tipo, count(*) cuenta FROM t_reg WHERE tipo NOT IN ('ENTRADA','SALIDA','ENTRADA_CAMPO','SALIDA_CAMPO','RETORNO_CAMPO','SOLO_ALMUERZO',
           'VACACIONES','PERMISO','PERMISO_PERSONAL','PERMISO_MEDICO','CALAMIDAD_DOMESTICA','FALTA','FALTA_JUSTIFICADA','SALIDA_JUSTIFICADA',
           'TRABAJO_DE_CAMPO','SALIDA_A_CAMPO','JUSTIFICACION','INASISTENCIA','FERIADO','CUMPLEANOS') GROUP BY tipo) z));
  RETURN r;
END $$;

-- ───────────── Datos para comparar (vista del legado y vista de la base nueva) ─────────────
CREATE OR REPLACE FUNCTION private.worker_paralelo_datos(p_desde date, p_hasta date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object(
    -- Legado: Firestore (desde el 30-sep), la copia de Firestore del Express (hasta el 29-sep) y la hoja archivada
    'firestore', (SELECT coalesce(jsonb_agg(l.data || jsonb_build_object('id', l.doc_id, 'fecha', private.fecha_legado(l.data))), '[]')
                    FROM core.legado_documentos l WHERE l.coleccion = 'registros' AND private.fecha_legado(l.data) BETWEEN p_desde AND p_hasta),
    'express', (SELECT coalesce(jsonb_agg((r.raw_data - 'foto') || jsonb_build_object('id', r.id, 'empleadoId', r.empleado_id,
                                          'fecha', to_char(r.fecha, 'YYYY-MM-DD'))), '[]')
                  FROM public.registros r WHERE r.fecha BETWEEN p_desde AND p_hasta AND r.empleado_id ~ '^[0-9A-Za-z_-]+$'),
    'hoja', (SELECT coalesce(jsonb_agg(jsonb_build_object('empleado_id', x.empleado_id, 'fecha', to_char(x.fecha, 'YYYY-MM-DD'), 'r', x.legacy_raw)), '[]')
               FROM (SELECT empleado_id, fecha, legacy_raw FROM core.marcaciones WHERE legacy_raw ? 'fuente' AND fecha BETWEEN p_desde AND p_hasta
                     UNION ALL
                     SELECT empleado_id, fecha, legacy_raw FROM core.novedades WHERE legacy_raw ? 'fuente' AND fecha BETWEEN p_desde AND p_hasta) x),
    'vacHoja', (SELECT coalesce(jsonb_agg(jsonb_build_object('empleado_id', empleado_id, 'fecha', to_char(fecha, 'YYYY-MM-DD'))), '[]')
                  FROM core.novedades WHERE tipo = 'VACACIONES' AND legacy_raw IS NULL AND legacy_id IS NOT NULL AND fecha BETWEEN p_desde AND p_hasta),
    -- Base nueva: lo que ve el panel
    'nuevo', private.registros_legado(p_desde, p_hasta),
    'fichas', (SELECT jsonb_agg(private.empleado_legado(e)) FROM core.empleados e),
    'feriados', (SELECT coalesce(jsonb_agg(to_char(fecha, 'YYYY-MM-DD')), '[]') FROM core.feriados))
$$;

CREATE OR REPLACE FUNCTION private.worker_paralelo_guardar(p_fecha date, p_resumen jsonb, p_diferencias jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  INSERT INTO core.paralelo_reportes (fecha, generado_en, resumen, diferencias) VALUES (p_fecha, now(), p_resumen, coalesce(p_diferencias, '[]'))
  ON CONFLICT (fecha) DO UPDATE SET generado_en = now(), resumen = EXCLUDED.resumen, diferencias = EXCLUDED.diferencias
$$;

-- Reporte para Sup. Admin / Admin (diagnostico.html → Operación en paralelo)
CREATE OR REPLACE FUNCTION api.sup_paralelo(p_fecha date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE f date;
BEGIN
  PERFORM private.exigir_supervisor_admin();
  f := coalesce(p_fecha, (SELECT max(fecha) FROM core.paralelo_reportes));
  RETURN jsonb_build_object(
    'dias', (SELECT coalesce(jsonb_agg(jsonb_build_object('fecha', to_char(fecha, 'YYYY-MM-DD'),
               'iguales', resumen -> 'dia' -> 'iguales', 'conDiferencias', resumen -> 'dia' -> 'conDiferencias',
               'sinExplicar', resumen -> 'dia' -> 'sinExplicar') ORDER BY fecha DESC), '[]')
             FROM (SELECT * FROM core.paralelo_reportes ORDER BY fecha DESC LIMIT 31) x),
    'reporte', (SELECT jsonb_build_object('fecha', to_char(fecha, 'YYYY-MM-DD'),
                  'generado', to_char(generado_en AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI'),
                  'resumen', resumen, 'diferencias', diferencias)
                FROM core.paralelo_reportes WHERE fecha = f));
END $$;

-- Estado del sistema: + último reporte del paralelo
CREATE OR REPLACE FUNCTION private.ultimo_paralelo() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object('fecha', to_char(fecha, 'YYYY-MM-DD'), 'dia', resumen -> 'dia')
    FROM core.paralelo_reportes ORDER BY fecha DESC LIMIT 1
$$;

REVOKE ALL ON FUNCTION private.worker_tarea_externa(text, timestamp), private.worker_tarea_fin(text, date, jsonb, text),
  private.fecha_legado(jsonb), private.worker_copia_legado(text, jsonb, boolean), private.worker_paralelo_datos(date, date),
  private.worker_paralelo_guardar(date, jsonb, jsonb), api.sup_paralelo(date), private.ultimo_paralelo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.worker_tarea_externa(text, timestamp), private.worker_tarea_fin(text, date, jsonb, text),
  private.worker_copia_legado(text, jsonb, boolean), private.worker_paralelo_datos(date, date),
  private.worker_paralelo_guardar(date, jsonb, jsonb) TO tcontrol_worker;
GRANT EXECUTE ON FUNCTION api.sup_paralelo(date) TO supervisor_admin;
