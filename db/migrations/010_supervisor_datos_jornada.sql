-- 010 — Fase 5 (bloque A): datos del panel de supervisor y gestión de jornada
-- Legado: JS/supervisor_core.js (cargarDatosCompletos, mostrarDetalle, abrirModalGestionJornada,
-- guardarModalGestionJornada, cambiarEstadoAlmuerzo, guardarRazonAusencia*, editarValorRegistro)
-- y JS/firebase_backend.js (obtenerDatosSupervisor, actualizarAlmuerzoSupervisor, guardarPermisoSupervisor…).
--
-- El panel conserva el motor de cálculo del legado (jornada neta, atrasos, bolsa de 4 h, "Por Regularizar"),
-- portado 1:1 a TypeScript, para que los números sean los mismos (§6 Fase 5). Estas funciones le entregan
-- los registros con la misma forma que veía el legado (D-24, 04_REGLAS_Y_DECISIONES.md §11):
--   · los motivos escritos por el colaborador se muestran pero no justifican tiempo (en el legado no llegaban
--     al cálculo); solo cuentan las justificaciones del supervisor;
--   · los reportes "fuera de área" pendientes (D-08) no justifican el día hasta que el supervisor los apruebe.

ALTER TABLE core.marcaciones ADD COLUMN IF NOT EXISTS editado_en timestamptz;
ALTER TABLE core.marcaciones ADD COLUMN IF NOT EXISTS editado_por text;
ALTER TABLE core.novedades   ADD COLUMN IF NOT EXISTS editado_en timestamptz;
ALTER TABLE core.ajustes_dia ADD COLUMN IF NOT EXISTS comentario text;       -- razon_permiso del legado

-- ───────────── Utilidades ─────────────
-- mapRazonAusenciaATipo del legado, restringido a los tipos válidos de core.novedades
CREATE OR REPLACE FUNCTION private.tipo_novedad_desde_razon(p_razon text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_razon IS NULL OR trim(p_razon) = '' THEN 'FALTA'
    WHEN lower(p_razon) ~ 'vacaci' THEN 'VACACIONES'
    WHEN lower(p_razon) ~ 'm[eé]dico' THEN 'PERMISO_MEDICO'
    WHEN lower(p_razon) ~ 'personal' THEN 'PERMISO_PERSONAL'
    WHEN lower(p_razon) ~ '(falta|salida) justificada' THEN 'FALTA_JUSTIFICADA'
    WHEN lower(p_razon) ~ '(dom[eé]stica|calamidad)' THEN 'CALAMIDAD_DOMESTICA'
    WHEN lower(p_razon) ~ 'campo' THEN 'TRABAJO_DE_CAMPO'
    WHEN lower(p_razon) ~ '^inasistencia' THEN 'INASISTENCIA'
    WHEN lower(p_razon) ~ '^feriado' THEN 'FERIADO'
    WHEN lower(p_razon) ~ '^cumplea' THEN 'CUMPLEANOS'
    ELSE 'JUSTIFICACION' END
$$;

-- razon_ausencia que el legado asignaba a una ausencia sin razón (_processDoc)
CREATE OR REPLACE FUNCTION private.razon_por_tipo(p_tipo text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_tipo
    WHEN 'VACACIONES' THEN 'Vacación' WHEN 'PERMISO_MEDICO' THEN 'Permiso Médico'
    WHEN 'PERMISO_PERSONAL' THEN 'Permiso Personal' WHEN 'CALAMIDAD_DOMESTICA' THEN 'Calamidad Doméstica'
    WHEN 'TRABAJO_DE_CAMPO' THEN 'Salida a Campo' WHEN 'SALIDA_A_CAMPO' THEN 'Salida a Campo'
    WHEN 'FALTA_JUSTIFICADA' THEN 'Falta Justificada' WHEN 'SALIDA_JUSTIFICADA' THEN 'Salida Justificada'
    ELSE p_tipo END
$$;

-- Rol de la ficha con los valores que usaba el campo `supervisor` del legado (getSupervisorRole)
CREATE OR REPLACE FUNCTION private.supervisor_legado(p_rol core.rol_app) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_rol WHEN 'SUPERVISOR' THEN 'SI' WHEN 'SUPERVISOR_ADMIN' THEN 'SUPERVISOR ADMIN'
                    WHEN 'ADMIN' THEN 'ADMIN' ELSE 'NO' END
$$;

CREATE OR REPLACE FUNCTION private.exigir_supervisor() RETURNS void
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF NOT private.es_supervisor() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION private.exigir_supervisor_admin() RETURNS void
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF NOT private.es_supervisor_admin() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
END $$;

-- ───────────── Registros con la forma del legado ─────────────
CREATE OR REPLACE FUNCTION private.registros_legado(p_desde date, p_hasta date, p_empleado_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH m AS (
    SELECT m.*, (coalesce(m.legacy_raw ? 'fuente', false) AND m.editado_en IS NULL) AS de_hoja,
           row_number() OVER (PARTITION BY m.empleado_id, m.fecha
                              ORDER BY (m.tipo = 'ENTRADA') DESC, m.hora, m.id) AS orden_permiso
    FROM core.marcaciones m
    WHERE m.fecha BETWEEN p_desde AND p_hasta AND (p_empleado_id IS NULL OR m.empleado_id = p_empleado_id)
  ), n AS (
    SELECT n.* FROM core.novedades n
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
        'id', 'n' || n.id, 'empleadoId', n.empleado_id, 'fecha', to_char(n.fecha, 'YYYY-MM-DD'), 'hora', '00:00:00',
        'tipo', n.tipo,
        'razon_ausencia', CASE WHEN (n.legacy_raw IS NULL AND n.legacy_id IS NULL) OR n.editado_en IS NOT NULL
                               THEN coalesce(nullif(n.motivo, ''), private.razon_por_tipo(n.tipo))
                               ELSE private.razon_por_tipo(n.tipo) END,
        'razon_justificac', CASE WHEN (n.legacy_raw IS NULL AND n.legacy_id IS NULL) OR n.editado_en IS NOT NULL
                                 THEN nullif(n.motivo, '')
                                 ELSE nullif(n.legacy_raw ->> 'razon_justificac', '') END,
        'justificado', n.justificado::text, 'quien_justifica', n.quien_justifica, 'observacion', n.observacion,
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

-- Ficha con los nombres de campo del legado
CREATE OR REPLACE FUNCTION private.empleado_legado(e core.empleados) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', e.id, 'nombre', e.nombre, 'cedula', e.cedula, 'area', e.area, 'cargo', e.cargo,
    'supervisor', private.supervisor_legado(e.rol), 'rol_app', e.rol::text,
    'activo', CASE WHEN e.activo THEN 'SI' ELSE 'NO' END, 'estado', CASE WHEN e.activo THEN 'ACTIVO' ELSE 'INACTIVO' END,
    'telefono', e.telefono, 'fecha_ingreso', to_char(e.fecha_ingreso, 'YYYY-MM-DD'),
    'fecha_nacimiento', to_char(e.fecha_nacimiento, 'YYYY-MM-DD'),
    'foto_url', private.url_foto(e.id, e.foto_legado, (SELECT f.actualizado_en FROM core.fotos f WHERE f.empleado_id = e.id)),
    'id_dispositivo', e.url_rol_pagos, 'cultura_habilitada', e.cultura_habilitada,
    'latitud', e.base_lat, 'longitud', e.base_lng, 'base_radio_m', e.base_radio_m,
    'es_pasante', e.es_pasante, 'tipo_asistencia', e.tipo_asistencia::text,
    'puede_autorizar_extras', e.puede_autorizar_extras, 'auth_extras', e.auth_extras,
    'tiene_password', (SELECT c.password_hash IS NOT NULL FROM private.credenciales c WHERE c.usuario = e.id),
    'dispositivo_vinculado', EXISTS (SELECT 1 FROM core.dispositivos d WHERE d.empleado_id = e.id AND d.activo)))
  || coalesce((SELECT jsonb_strip_nulls(jsonb_build_object(
        'esDesvinculado', true, 'fecha_salida', to_char(d.fecha, 'YYYY-MM-DD'), 'fechaDesvinculacion', to_char(d.fecha, 'YYYY-MM-DD'),
        'motivo_salida', coalesce(d.motivo, 'Desvinculado'), 'observaciones_salida', d.observaciones,
        'desvinculadoPor', d.desvinculado_por))
      FROM core.desvinculaciones d WHERE d.empleado_id = e.id AND NOT e.activo
      ORDER BY d.fecha DESC NULLS LAST, d.id DESC LIMIT 1), '{}'::jsonb)
$$;

-- ───────────── Lectura del panel ─────────────
-- Carga inicial (obtenerDatosSupervisor): fichas, registros desde p_desde (por defecto ~60 días, como el
-- legado), emergencia, solicitudes de invitados y saldos de vacaciones.
CREATE OR REPLACE FUNCTION api.sup_datos(p_desde date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_hoy date := private.hoy();
  v_desde date := coalesce(p_desde, private.hoy() - 60);
  em core.emergencias;
BEGIN
  PERFORM private.exigir_supervisor();
  SELECT * INTO em FROM core.emergencias WHERE activa ORDER BY inicio DESC LIMIT 1;
  RETURN jsonb_build_object(
    'hoy', to_char(v_hoy, 'YYYY-MM-DD'),
    'ahora', to_char(private.ahora_local(), 'YYYY-MM-DD"T"HH24:MI:SS'),
    'desde', to_char(v_desde, 'YYYY-MM-DD'),
    'empleados', (SELECT coalesce(jsonb_agg(private.empleado_legado(e) ORDER BY e.nombre), '[]') FROM core.empleados e),
    'registros', private.registros_legado(v_desde, v_hoy + 400),
    'emergencia', CASE WHEN em.id IS NULL THEN jsonb_build_object('activa', false, 'nombre', '', 'habilitadoPor', '', 'fecha', '')
                  ELSE jsonb_build_object('activa', true, 'nombre', em.nombre, 'habilitadoPor', coalesce(em.habilitado_por, ''),
                                          'fecha', to_char(em.inicio AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS')) END,
    'solicitudesInvitados', (SELECT coalesce(jsonb_agg(to_jsonb(s) - 'legacy_raw' ORDER BY s.fecha DESC, s.hora DESC), '[]')
                             FROM (SELECT * FROM core.solicitudes_invitados ORDER BY fecha DESC, hora DESC LIMIT 300) s),
    'vacaciones', (SELECT coalesce(jsonb_object_agg(v.empleado_id, jsonb_build_object(
                     'tomadas', v.tomadas, 'restantes', v.restantes, 'adjudicadas', v.adjudicadas,
                     'saldo_anterior', v.saldo_anterior, 'total', v.total, 'anios_servicio', v.anios_servicio)), '{}')
                   FROM api.vacaciones_saldo v),
    'feriados', (SELECT coalesce(jsonb_agg(jsonb_build_object('fecha', to_char(f.fecha, 'YYYY-MM-DD'), 'nombre', f.nombre) ORDER BY f.fecha), '[]')
                 FROM core.feriados f));
END $$;

-- Registros de un rango (historial completo del detalle, reportes de períodos anteriores)
CREATE OR REPLACE FUNCTION api.sup_registros(p_desde date, p_hasta date, p_empleado_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM private.exigir_supervisor();
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
    RAISE EXCEPTION 'Rango de fechas inválido' USING ERRCODE = '22023';
  END IF;
  IF p_empleado_id IS NULL AND p_hasta - p_desde > 800 THEN
    RAISE EXCEPTION 'Rango demasiado amplio' USING ERRCODE = '22023';
  END IF;
  RETURN private.registros_legado(p_desde, p_hasta, p_empleado_id);
END $$;

-- ───────────── Escrituras de jornada ─────────────
-- Almuerzo de un día (cambiarEstadoAlmuerzo → actualizarAlmuerzoSupervisor)
CREATE OR REPLACE FUNCTION api.sup_cambiar_almuerzo(p_empleado_id text, p_almuerzo text, p_fecha date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_fecha date := coalesce(p_fecha, private.hoy());
  v_alm boolean;
  v_id bigint;
  e core.empleados;
BEGIN
  PERFORM private.exigir_supervisor();
  IF upper(coalesce(p_almuerzo, '')) NOT IN ('SI','NO') THEN RAISE EXCEPTION 'Valor de almuerzo inválido' USING ERRCODE = '22023'; END IF;
  v_alm := upper(p_almuerzo) = 'SI';
  SELECT * INTO e FROM core.empleados WHERE id = p_empleado_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT id INTO v_id FROM core.marcaciones
   WHERE empleado_id = e.id AND fecha = v_fecha
   ORDER BY (tipo IN ('ENTRADA','ENTRADA_CAMPO','RETORNO_CAMPO','SOLO_ALMUERZO')) DESC, hora, id LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE core.marcaciones SET almuerzo = v_alm, editado_en = now(), editado_por = private.jwt_usuario() WHERE id = v_id;
  ELSIF e.tipo_asistencia = 'SIN_ASISTENCIA' AND v_fecha = private.hoy() THEN
    INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, almuerzo, modo, origen, creado_por, dispositivo)
    VALUES (e.id, 'SOLO_ALMUERZO', v_fecha, private.ahora_local()::time(0), v_alm, 'OFICINA', 'SUPERVISOR', private.jwt_usuario(), 'SUPERVISOR');
  ELSE
    RAISE EXCEPTION 'No hay registros de asistencia para esa fecha' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('ok', true, 'mensaje', 'Almuerzo actualizado');
END $$;

-- Razón de ausencia de un día (guardarRazonAusenciaGlobal / Fecha): una novedad por día (R-18)
CREATE OR REPLACE FUNCTION api.sup_guardar_ausencia(p_empleado_id text, p_fecha date, p_razon text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_razon text := nullif(trim(p_razon), '');
  v_tipo text := private.tipo_novedad_desde_razon(p_razon);
BEGIN
  PERFORM private.exigir_supervisor();
  IF v_razon IS NULL THEN RAISE EXCEPTION 'Indique la razón de la ausencia' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM core.empleados WHERE id = p_empleado_id) THEN
    RAISE EXCEPTION 'Colaborador no encontrado' USING ERRCODE = 'P0002';
  END IF;
  -- En fechas pasadas el legado eliminaba las marcaciones del día al registrar la ausencia
  IF p_fecha < private.hoy() THEN
    DELETE FROM core.marcaciones WHERE empleado_id = p_empleado_id AND fecha = p_fecha;
  END IF;
  INSERT INTO core.novedades AS n (empleado_id, fecha, tipo, justificado, motivo, quien_justifica, origen, creado_por, editado_en)
  VALUES (p_empleado_id, p_fecha, v_tipo, 'SI', v_razon, 'Supervisor', 'SUPERVISOR', private.jwt_usuario(), now())
  ON CONFLICT (empleado_id, fecha) DO UPDATE SET tipo = EXCLUDED.tipo, justificado = 'SI', motivo = EXCLUDED.motivo,
    quien_justifica = 'Supervisor', origen = 'SUPERVISOR', creado_por = EXCLUDED.creado_por, editado_en = now();
  RETURN jsonb_build_object('ok', true, 'tipo', v_tipo);
END $$;

-- Modal "Gestión de jornada por fecha" (guardarModalGestionJornada)
CREATE OR REPLACE FUNCTION api.sup_guardar_jornada(
  p_empleado_id text, p_fecha date,
  p_hora_entrada text DEFAULT NULL, p_hora_salida text DEFAULT NULL, p_modo text DEFAULT 'EMPRESA',
  p_razon text DEFAULT NULL,
  p_min_justificados int DEFAULT 0, p_min_personal int DEFAULT 0, p_min_medico int DEFAULT 0,
  p_almuerzo text DEFAULT NULL, p_horas_extra text DEFAULT NULL, p_observacion text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  e core.empleados;
  v_usuario text := private.jwt_usuario();
  v_modo text := CASE WHEN upper(coalesce(p_modo, '')) IN ('CAMPO','MIXTO') THEN 'CAMPO' ELSE 'OFICINA' END;
  v_he time(0);
  v_hs time(0);
  v_razon text := nullif(trim(coalesce(p_razon, '')), '');
  v_obs text := nullif(trim(coalesce(p_observacion, '')), '');
  v_alm boolean := CASE upper(coalesce(p_almuerzo, '')) WHEN 'SI' THEN true WHEN 'EXTRA' THEN true WHEN 'NO' THEN false END;
  v_hx boolean := upper(coalesce(p_horas_extra, '')) = 'SI';
  v_id bigint;
  v_tipo text;
  prev core.ajustes_dia;
BEGIN
  PERFORM private.exigir_supervisor();
  SELECT * INTO e FROM core.empleados WHERE id = p_empleado_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF p_fecha IS NULL THEN RAISE EXCEPTION 'Fecha requerida' USING ERRCODE = '22023'; END IF;
  IF greatest(coalesce(p_min_justificados, 0), coalesce(p_min_personal, 0), coalesce(p_min_medico, 0)) > 720
     OR least(coalesce(p_min_justificados, 0), coalesce(p_min_personal, 0), coalesce(p_min_medico, 0)) < 0 THEN
    RAISE EXCEPTION 'El tiempo asignado a un permiso no puede superar las 12 horas (720 min).' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_he := nullif(trim(coalesce(p_hora_entrada, '')), '')::time(0);
    v_hs := nullif(trim(coalesce(p_hora_salida, '')), '')::time(0);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Formato de hora inválido (use HH:MM o HH:MM:SS)' USING ERRCODE = '22023';
  END;
  IF v_he IS NULL AND v_hs IS NULL AND v_razon IS NULL
     AND coalesce(p_min_justificados, 0) + coalesce(p_min_personal, 0) + coalesce(p_min_medico, 0) = 0 THEN
    RAISE EXCEPTION 'Ingrese horas de asistencia o seleccione una razón de ausencia en la Sección 2.' USING ERRCODE = '22023';
  END IF;

  IF v_he IS NULL AND v_hs IS NULL AND v_razon IS NOT NULL THEN
    -- Ausencia de día completo: reemplaza las marcaciones y los permisos del día
    v_tipo := private.tipo_novedad_desde_razon(v_razon);
    DELETE FROM core.marcaciones WHERE empleado_id = e.id AND fecha = p_fecha;
    DELETE FROM core.ajustes_dia WHERE empleado_id = e.id AND fecha = p_fecha;
    INSERT INTO core.novedades AS n (empleado_id, fecha, tipo, justificado, motivo, quien_justifica, origen, creado_por, editado_en, legacy_raw)
    VALUES (e.id, p_fecha, v_tipo, 'SI', v_razon, 'Supervisor', 'SUPERVISOR', v_usuario, now(),
            jsonb_build_object('modo', CASE WHEN v_modo = 'CAMPO' THEN 'CAMPO' ELSE 'OFICINA' END))
    ON CONFLICT (empleado_id, fecha) DO UPDATE SET tipo = EXCLUDED.tipo, justificado = 'SI', motivo = EXCLUDED.motivo,
      quien_justifica = 'Supervisor', origen = 'SUPERVISOR', creado_por = EXCLUDED.creado_por, editado_en = now(),
      legacy_raw = EXCLUDED.legacy_raw;
    RETURN jsonb_build_object('ok', true, 'tipo', v_tipo);
  END IF;

  -- Jornada con horas: la ausencia registrada del día deja de aplicar
  DELETE FROM core.novedades WHERE empleado_id = e.id AND fecha = p_fecha;

  IF v_he IS NOT NULL THEN
    SELECT id INTO v_id FROM core.marcaciones
     WHERE empleado_id = e.id AND fecha = p_fecha AND tipo IN ('ENTRADA','RETORNO_CAMPO') ORDER BY hora, id LIMIT 1;
    IF v_id IS NULL THEN
      INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, ts_servidor, modo, almuerzo, horas_extra, origen, dispositivo,
                                    creado_por, editado_en, editado_por)
      VALUES (e.id, 'ENTRADA', p_fecha, v_he, (p_fecha + v_he) AT TIME ZONE 'America/Guayaquil', v_modo, coalesce(v_alm, true),
              v_hx, 'SUPERVISOR', 'MANUAL_SUPERVISOR', v_usuario, now(), v_usuario);
    ELSE
      UPDATE core.marcaciones SET hora = v_he, ts_servidor = (p_fecha + v_he) AT TIME ZONE 'America/Guayaquil',
             almuerzo = coalesce(v_alm, almuerzo), horas_extra = v_hx, editado_en = now(), editado_por = v_usuario
       WHERE id = v_id;
    END IF;
  END IF;

  IF v_hs IS NOT NULL THEN
    v_id := NULL;
    -- Se edita la última salida del día (la que muestra el modal)
    SELECT id INTO v_id FROM core.marcaciones
     WHERE empleado_id = e.id AND fecha = p_fecha AND tipo IN ('SALIDA','SALIDA_CAMPO') ORDER BY hora DESC, id DESC LIMIT 1;
    IF v_id IS NULL THEN
      INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, ts_servidor, modo, origen, dispositivo, creado_por, editado_en, editado_por)
      VALUES (e.id, 'SALIDA', p_fecha, v_hs, (p_fecha + v_hs) AT TIME ZONE 'America/Guayaquil', v_modo, 'SUPERVISOR',
              'MANUAL_SUPERVISOR', v_usuario, now(), v_usuario);
    ELSE
      UPDATE core.marcaciones SET hora = v_hs, ts_servidor = (p_fecha + v_hs) AT TIME ZONE 'America/Guayaquil',
             editado_en = now(), editado_por = v_usuario
       WHERE id = v_id;
    END IF;
  END IF;

  UPDATE core.marcaciones SET modo = v_modo, editado_en = now(), editado_por = v_usuario
   WHERE empleado_id = e.id AND fecha = p_fecha AND modo IS DISTINCT FROM v_modo;

  IF v_he IS NULL THEN
    IF v_alm IS NOT NULL THEN
      UPDATE core.marcaciones SET almuerzo = v_alm, editado_en = now(), editado_por = v_usuario
       WHERE id = (SELECT id FROM core.marcaciones WHERE empleado_id = e.id AND fecha = p_fecha
                   ORDER BY (tipo IN ('ENTRADA','ENTRADA_CAMPO','RETORNO_CAMPO','SOLO_ALMUERZO')) DESC, hora, id LIMIT 1)
         AND almuerzo IS DISTINCT FROM v_alm;
    END IF;
    IF p_horas_extra IS NOT NULL THEN
      UPDATE core.marcaciones SET horas_extra = v_hx, editado_en = now(), editado_por = v_usuario
       WHERE empleado_id = e.id AND fecha = p_fecha AND tipo = 'ENTRADA' AND horas_extra IS DISTINCT FROM v_hx;
    END IF;
  END IF;

  -- Permisos parciales (Sección 3)
  SELECT * INTO prev FROM core.ajustes_dia WHERE empleado_id = e.id AND fecha = p_fecha;
  IF coalesce(p_min_justificados, 0) + coalesce(p_min_personal, 0) + coalesce(p_min_medico, 0) > 0 OR prev.empleado_id IS NOT NULL THEN
    INSERT INTO core.ajustes_dia AS a (empleado_id, fecha, min_permiso_personal, min_permiso_medico, min_justificados,
                                        comentario, razon, quien_justifica, actualizado_en)
    VALUES (e.id, p_fecha, coalesce(p_min_personal, 0), coalesce(p_min_medico, 0), coalesce(p_min_justificados, 0),
            v_obs, prev.razon, v_usuario, now())
    ON CONFLICT (empleado_id, fecha) DO UPDATE SET min_permiso_personal = EXCLUDED.min_permiso_personal,
      min_permiso_medico = EXCLUDED.min_permiso_medico, min_justificados = EXCLUDED.min_justificados,
      comentario = coalesce(EXCLUDED.comentario, a.comentario), quien_justifica = EXCLUDED.quien_justifica, actualizado_en = now();
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Eliminar todas las marcaciones y registros del día (eliminarMarcacionesDiaModal)
CREATE OR REPLACE FUNCTION api.sup_eliminar_dia(p_empleado_id text, p_fecha date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE nm int; nn int;
BEGIN
  PERFORM private.exigir_supervisor();
  DELETE FROM core.marcaciones WHERE empleado_id = p_empleado_id AND fecha = p_fecha;
  GET DIAGNOSTICS nm = ROW_COUNT;
  DELETE FROM core.novedades WHERE empleado_id = p_empleado_id AND fecha = p_fecha;
  GET DIAGNOSTICS nn = ROW_COUNT;
  DELETE FROM core.ajustes_dia WHERE empleado_id = p_empleado_id AND fecha = p_fecha;
  RETURN jsonb_build_object('ok', true, 'marcaciones', nm, 'novedades', nn);
END $$;

-- Permiso parcial en minutos de un tipo (guardarPermiso / guardarPermisoSupervisor)
CREATE OR REPLACE FUNCTION api.sup_guardar_permiso(p_empleado_id text, p_fecha date, p_tipo text, p_minutos int,
  p_comentario text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM private.exigir_supervisor();
  IF p_minutos IS NULL OR p_minutos < 0 OR p_minutos > 720 THEN
    RAISE EXCEPTION 'Valor inválido' USING ERRCODE = '22023';
  END IF;
  IF p_tipo NOT IN ('personal','medico','justificado') THEN RAISE EXCEPTION 'Tipo de permiso inválido' USING ERRCODE = '22023'; END IF;
  INSERT INTO core.ajustes_dia AS a (empleado_id, fecha, min_permiso_personal, min_permiso_medico, min_justificados, comentario, quien_justifica)
  VALUES (p_empleado_id, p_fecha,
          CASE WHEN p_tipo = 'personal' THEN p_minutos ELSE 0 END,
          CASE WHEN p_tipo = 'medico' THEN p_minutos ELSE 0 END,
          CASE WHEN p_tipo = 'justificado' THEN p_minutos ELSE 0 END,
          nullif(trim(coalesce(p_comentario, '')), ''), private.jwt_usuario())
  ON CONFLICT (empleado_id, fecha) DO UPDATE SET
    min_permiso_personal = CASE WHEN p_tipo = 'personal' THEN p_minutos ELSE a.min_permiso_personal END,
    min_permiso_medico = CASE WHEN p_tipo = 'medico' THEN p_minutos ELSE a.min_permiso_medico END,
    min_justificados = CASE WHEN p_tipo = 'justificado' THEN p_minutos ELSE a.min_justificados END,
    comentario = CASE WHEN p_comentario IS NULL THEN a.comentario ELSE nullif(trim(p_comentario), '') END,
    quien_justifica = EXCLUDED.quien_justifica, actualizado_en = now();
  RETURN jsonb_build_object('ok', true);
END $$;

-- Horas extra / modalidad de un día (editarValorRegistro, guardarPermiso 'modalidad')
CREATE OR REPLACE FUNCTION api.sup_editar_dia(p_empleado_id text, p_fecha date, p_campo text, p_valor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE n int;
BEGIN
  PERFORM private.exigir_supervisor_admin();
  IF p_campo = 'horasExtra' THEN
    UPDATE core.marcaciones SET horas_extra = upper(coalesce(p_valor, '')) = 'SI',
           autoriza = CASE WHEN upper(coalesce(p_valor, '')) = 'SI' THEN coalesce(nullif(autoriza, ''), private.jwt_usuario()) ELSE autoriza END,
           editado_en = now(), editado_por = private.jwt_usuario()
     WHERE empleado_id = p_empleado_id AND fecha = p_fecha;
  ELSIF p_campo IN ('modo', 'modalidad') THEN
    UPDATE core.marcaciones SET modo = CASE WHEN upper(coalesce(p_valor, '')) IN ('CAMPO','MIXTO') THEN 'CAMPO' ELSE 'OFICINA' END,
           editado_en = now(), editado_por = private.jwt_usuario()
     WHERE empleado_id = p_empleado_id AND fecha = p_fecha;
  ELSE
    RAISE EXCEPTION 'Campo no editable: %', p_campo USING ERRCODE = '22023';
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'No hay registros de asistencia para esa fecha' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('ok', true, 'actualizados', n);
END $$;

-- Hora de entrada o salida desde el control diario (editarValorRegistro campo 'hora'); si no existe, se crea
CREATE OR REPLACE FUNCTION api.sup_editar_hora(p_empleado_id text, p_fecha date, p_tipo text, p_hora text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_hora time(0);
  v_id bigint;
  v_usuario text := private.jwt_usuario();
BEGIN
  PERFORM private.exigir_supervisor_admin();
  IF upper(p_tipo) NOT IN ('ENTRADA','SALIDA') THEN RAISE EXCEPTION 'Tipo inválido' USING ERRCODE = '22023'; END IF;
  BEGIN
    v_hora := trim(p_hora)::time(0);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Formato de hora inválido. Use HH:MM o HH:MM:SS' USING ERRCODE = '22023';
  END;
  IF NOT EXISTS (SELECT 1 FROM core.empleados WHERE id = p_empleado_id) THEN
    RAISE EXCEPTION 'Colaborador no encontrado' USING ERRCODE = 'P0002';
  END IF;
  SELECT id INTO v_id FROM core.marcaciones
   WHERE empleado_id = p_empleado_id AND fecha = p_fecha AND tipo = upper(p_tipo) ORDER BY hora, id LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, ts_servidor, modo, origen, dispositivo, creado_por, editado_en, editado_por)
    VALUES (p_empleado_id, upper(p_tipo), p_fecha, v_hora, (p_fecha + v_hora) AT TIME ZONE 'America/Guayaquil', 'OFICINA',
            'SUPERVISOR', 'MANUAL_SUPERVISOR', v_usuario, now(), v_usuario);
  ELSE
    UPDATE core.marcaciones SET hora = v_hora, ts_servidor = (p_fecha + v_hora) AT TIME ZONE 'America/Guayaquil',
           editado_en = now(), editado_por = v_usuario
     WHERE id = v_id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ───────────── Ficha del colaborador desde el detalle ─────────────
-- editarMetaEmpleado (solo Admin General) y toggleCulturaEmpleado (supervisores)
CREATE OR REPLACE FUNCTION api.sup_actualizar_empleado(p_empleado_id text, p_campo text, p_valor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v text := nullif(trim(coalesce(p_valor, '')), '');
  nuevo_id text;
BEGIN
  PERFORM private.exigir_supervisor();
  IF NOT EXISTS (SELECT 1 FROM core.empleados WHERE id = p_empleado_id) THEN
    RAISE EXCEPTION 'Colaborador no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF p_campo = 'cultura_habilitada' THEN
    UPDATE core.empleados SET cultura_habilitada = coalesce(lower(v) IN ('true','si','1'), false) WHERE id = p_empleado_id;
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF private.nivel() < 4 THEN
    RAISE EXCEPTION 'Solo el Administrador General puede realizar esta acción.' USING ERRCODE = '42501';
  END IF;
  CASE p_campo
    WHEN 'nombre' THEN
      IF v IS NULL THEN RAISE EXCEPTION 'El nombre no puede quedar vacío' USING ERRCODE = '22023'; END IF;
      UPDATE core.empleados SET nombre = v WHERE id = p_empleado_id;
    WHEN 'area' THEN UPDATE core.empleados SET area = v WHERE id = p_empleado_id;
    WHEN 'cargo' THEN
      UPDATE core.empleados SET cargo = v, es_pasante = private.texto_es_pasante(v, area),
             tipo_asistencia = private.texto_tipo_asistencia(v, area), puede_autorizar_extras = private.texto_puede_autorizar_extras(v)
       WHERE id = p_empleado_id;
    WHEN 'id_dispositivo' THEN UPDATE core.empleados SET url_rol_pagos = v WHERE id = p_empleado_id;
    WHEN 'id' THEN
      nuevo_id := v;
      IF nuevo_id IS NULL OR nuevo_id !~ '^[0-9A-Za-z_-]+$' THEN RAISE EXCEPTION 'ID inválido' USING ERRCODE = '22023'; END IF;
      IF EXISTS (SELECT 1 FROM core.empleados WHERE id = nuevo_id) OR EXISTS (SELECT 1 FROM private.credenciales WHERE usuario = nuevo_id) THEN
        RAISE EXCEPTION 'Ya existe un colaborador con el ID %', nuevo_id USING ERRCODE = '23505';
      END IF;
      -- Las tablas con clave foránea se actualizan en cascada; credenciales y fotos se mueven aquí
      UPDATE core.empleados SET id = nuevo_id WHERE id = p_empleado_id;
      UPDATE private.credenciales SET usuario = nuevo_id WHERE usuario = p_empleado_id;
      UPDATE core.fotos SET empleado_id = nuevo_id WHERE empleado_id = p_empleado_id;
    ELSE RAISE EXCEPTION 'Campo no editable: %', p_campo USING ERRCODE = '22023';
  END CASE;
  RETURN jsonb_build_object('ok', true, 'id', coalesce(nuevo_id, p_empleado_id));
END $$;

-- triggerPhotoUpload: el Administrador General sube la foto de un colaborador
CREATE OR REPLACE FUNCTION api.sup_subir_foto(p_empleado_id text, p_base64 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE datos bytea; v timestamptz := now();
BEGIN
  PERFORM private.exigir_supervisor_admin();
  IF NOT EXISTS (SELECT 1 FROM core.empleados WHERE id = p_empleado_id) THEN
    RAISE EXCEPTION 'Colaborador no encontrado' USING ERRCODE = 'P0002';
  END IF;
  datos := decode(regexp_replace(p_base64, '^data:image/[a-z]+;base64,', ''), 'base64');
  IF length(datos) > 300000 THEN RAISE EXCEPTION 'La imagen es demasiado grande' USING ERRCODE = '22023'; END IF;
  IF substr(datos, 1, 3) <> '\xffd8ff'::bytea THEN RAISE EXCEPTION 'La imagen debe ser JPEG' USING ERRCODE = '22023'; END IF;
  INSERT INTO core.fotos (empleado_id, contenido, mime, actualizado_en) VALUES (p_empleado_id, datos, 'image/jpeg', v)
  ON CONFLICT (empleado_id) DO UPDATE SET contenido = EXCLUDED.contenido, actualizado_en = v;
  RETURN jsonb_build_object('ok', true, 'foto_url', private.url_foto(p_empleado_id, NULL, v));
END $$;

-- Saldo y días de vacaciones de un colaborador (obtenerVacacionesEmpleado)
CREATE OR REPLACE FUNCTION api.sup_vacaciones_empleado(p_empleado_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v record;
BEGIN
  PERFORM private.exigir_supervisor();
  SELECT * INTO v FROM api.vacaciones_saldo WHERE empleado_id = p_empleado_id;
  RETURN jsonb_build_object(
    'tomadas', v.tomadas, 'restantes', v.restantes, 'adjudicadas', v.adjudicadas, 'saldo_anterior', v.saldo_anterior,
    'total', v.total, 'anios_servicio', v.anios_servicio,
    'vacaciones', (SELECT coalesce(jsonb_agg(jsonb_build_object('empleadoId', n.empleado_id, 'fecha', to_char(n.fecha, 'YYYY-MM-DD')) ORDER BY n.fecha DESC), '[]')
                   FROM core.novedades n WHERE n.empleado_id = p_empleado_id AND n.tipo = 'VACACIONES'));
END $$;

REVOKE ALL ON FUNCTION private.registros_legado(date, date, text), private.empleado_legado(core.empleados) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.sup_editar_hora(text, date, text, text), api.sup_actualizar_empleado(text, text, text),
  api.sup_subir_foto(text, text), api.sup_vacaciones_empleado(text) TO supervisor;
GRANT EXECUTE ON FUNCTION api.sup_datos(date), api.sup_registros(date, date, text),
  api.sup_cambiar_almuerzo(text, text, date), api.sup_guardar_ausencia(text, date, text),
  api.sup_guardar_jornada(text, date, text, text, text, text, int, int, int, text, text, text),
  api.sup_eliminar_dia(text, date), api.sup_guardar_permiso(text, date, text, int, text),
  api.sup_editar_dia(text, date, text, text)
  TO supervisor;
