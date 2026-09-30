-- 011 — Fase 5 (bloque A): registros creados por el supervisor
-- Legado: guardarRegistroManual, guardarEventoFuturo, guardarTrabajoEnCampoSupervisor (supervisor_emergencias.js)
-- y guardarAlmuerzoExtra → crearSolicitudInvitado.

-- Registro manual de una marcación (modal "Crear Registro Manual de Asistencia")
CREATE OR REPLACE FUNCTION api.sup_registro_manual(p_empleado_id text, p_fecha date, p_hora text, p_tipo text,
  p_modo text DEFAULT 'EMPRESA', p_almuerzo text DEFAULT NULL, p_horas_extra text DEFAULT NULL, p_observacion text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  e core.empleados;
  v_tipo text := upper(trim(coalesce(p_tipo, '')));
  v_hora time(0);
  v_modo text := CASE WHEN upper(coalesce(p_modo, '')) = 'CAMPO' THEN 'CAMPO' ELSE 'OFICINA' END;
  v_alm boolean := CASE upper(coalesce(p_almuerzo, '')) WHEN 'SI' THEN true WHEN 'NO' THEN false END;
  hx record;
  v_hx boolean;
  v_aut text;
  v_sup text;
  n core.marcaciones;
BEGIN
  PERFORM private.exigir_supervisor();
  IF v_tipo NOT IN ('ENTRADA','SALIDA','SOLO_ALMUERZO','ENTRADA_CAMPO','SALIDA_CAMPO') THEN
    RAISE EXCEPTION 'Tipo de marcación no válido' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO e FROM core.empleados WHERE id = p_empleado_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seleccione un colaborador' USING ERRCODE = 'P0002'; END IF;
  IF p_fecha IS NULL OR nullif(trim(coalesce(p_hora, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Complete fecha y hora de la marcación' USING ERRCODE = '22023';
  END IF;
  BEGIN v_hora := trim(p_hora)::time(0);
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'Formato de hora inválido' USING ERRCODE = '22023'; END;
  -- Nombre del supervisor que registra (autoriza / quien_justifica del legado)
  SELECT coalesce((SELECT nombre FROM core.empleados WHERE id = private.jwt_empleado_id()), private.jwt_usuario()) INTO v_sup;
  SELECT * INTO hx FROM private.horas_extra_auto(v_tipo, p_fecha, v_hora, v_modo);
  -- Horas extra: la elección explícita del supervisor manda; sin elección, la regla automática (R-12)
  v_hx := CASE upper(coalesce(p_horas_extra, '')) WHEN 'SI' THEN true WHEN 'NO' THEN false ELSE hx.horas_extra END;
  v_aut := coalesce(nullif(hx.autoriza, ''), v_sup);
  IF v_tipo = 'SALIDA' AND v_hora < time '09:30' THEN v_alm := false; END IF;   -- R-14
  INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, ts_servidor, modo, almuerzo, horas_extra, autoriza,
    quien_justifica, observacion, origen, dispositivo, creado_por)
  VALUES (e.id, v_tipo, p_fecha, v_hora, (p_fecha + v_hora) AT TIME ZONE 'America/Guayaquil', v_modo,
    coalesce(v_alm, CASE WHEN v_tipo IN ('ENTRADA','SOLO_ALMUERZO') THEN false END), v_hx, v_aut, v_sup,
    nullif(trim(coalesce(p_observacion, '')), ''), 'SUPERVISOR', 'MANUAL', private.jwt_usuario())
  RETURNING * INTO n;
  RETURN jsonb_build_object('ok', true, 'id', n.id);
END $$;

-- Programar ausencia de jornada completa en días laborables (guardarEventoFuturo; solo Admin y Sup. Admin)
CREATE OR REPLACE FUNCTION api.sup_evento_futuro(p_empleado_id text, p_desde date, p_hasta date, p_tipo text, p_observacion text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_tipo text := upper(trim(coalesce(p_tipo, '')));
  v_obs text := coalesce(nullif(trim(coalesce(p_observacion, '')), ''), 'Registrado por supervisor');
  f date;
  n int := 0;
BEGIN
  PERFORM private.exigir_supervisor_admin();
  IF v_tipo NOT IN ('VACACIONES','PERMISO_PERSONAL','PERMISO_MEDICO','SALIDA_JUSTIFICADA','FALTA_JUSTIFICADA') THEN
    RAISE EXCEPTION 'Tipo de evento no válido' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM core.empleados WHERE id = p_empleado_id) THEN RAISE EXCEPTION 'Seleccione un empleado' USING ERRCODE = 'P0002'; END IF;
  IF p_desde IS NULL OR p_hasta IS NULL THEN RAISE EXCEPTION 'Seleccione fecha de inicio y fin' USING ERRCODE = '22023'; END IF;
  IF p_hasta < p_desde THEN RAISE EXCEPTION 'La fecha fin no puede ser menor a la fecha inicio' USING ERRCODE = '22023'; END IF;
  IF p_hasta - p_desde > 366 THEN RAISE EXCEPTION 'Rango demasiado amplio' USING ERRCODE = '22023'; END IF;
  FOR f IN SELECT d::date FROM generate_series(p_desde, p_hasta, interval '1 day') d LOOP
    -- Solo lunes a viernes que no sean feriado (sábado, domingo y feriados se omiten)
    CONTINUE WHEN extract(isodow FROM f) IN (6, 7) OR EXISTS (SELECT 1 FROM core.feriados WHERE fecha = f);
    IF f < private.hoy() THEN
      DELETE FROM core.marcaciones WHERE empleado_id = p_empleado_id AND fecha = f;
    END IF;
    INSERT INTO core.novedades AS x (empleado_id, fecha, tipo, justificado, motivo, quien_justifica, origen, creado_por, editado_en)
    VALUES (p_empleado_id, f, v_tipo, 'SI', v_obs, 'Supervisor', 'SUPERVISOR', private.jwt_usuario(), now())
    ON CONFLICT (empleado_id, fecha) DO UPDATE SET tipo = EXCLUDED.tipo, justificado = 'SI', motivo = EXCLUDED.motivo,
      quien_justifica = 'Supervisor', origen = 'SUPERVISOR', creado_por = EXCLUDED.creado_por, editado_en = now();
    n := n + 1;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'No hay días laborales en el rango seleccionado' USING ERRCODE = '22023'; END IF;
  RETURN jsonb_build_object('ok', true, 'dias', n);
END $$;

-- Trabajo en campo por días con horarios (guardarTrabajoEnCampoSupervisor)
-- p_dias: [{"fecha":"YYYY-MM-DD","entrada":"HH:MM","salida":"HH:MM"}]
CREATE OR REPLACE FUNCTION api.sup_trabajo_campo(p_empleado_id text, p_dias jsonb, p_proyecto text DEFAULT NULL,
  p_observaciones text DEFAULT NULL, p_autoriza text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  d jsonb;
  v_fecha date;
  v_he time(0);
  v_hs time(0);
  v_obs text;
  v_proy text := nullif(trim(coalesce(p_proyecto, '')), '');
  v_o text := nullif(trim(coalesce(p_observaciones, '')), '');
  v_aut text := nullif(trim(coalesce(p_autoriza, '')), '');
  v_id bigint;
  n int := 0;
BEGIN
  PERFORM private.exigir_supervisor();
  IF NOT EXISTS (SELECT 1 FROM core.empleados WHERE id = p_empleado_id) THEN RAISE EXCEPTION 'ID de empleado no especificado' USING ERRCODE = 'P0002'; END IF;
  IF jsonb_typeof(p_dias) <> 'array' OR jsonb_array_length(p_dias) = 0 THEN
    RAISE EXCEPTION 'No hay fechas seleccionadas en el rango.' USING ERRCODE = '22023';
  END IF;
  v_obs := CASE WHEN v_proy IS NOT NULL AND v_o IS NOT NULL THEN '[Proyecto: ' || v_proy || '] ' || v_o
                WHEN v_proy IS NOT NULL THEN '[Proyecto: ' || v_proy || '] Trabajo en Campo'
                WHEN v_o IS NOT NULL THEN v_o ELSE 'Trabajo en Campo' END;
  FOR d IN SELECT * FROM jsonb_array_elements(p_dias) LOOP
    v_fecha := (d ->> 'fecha')::date;
    v_he := nullif(d ->> 'entrada', '')::time(0);
    v_hs := nullif(d ->> 'salida', '')::time(0);
    IF v_he IS NULL AND v_hs IS NULL THEN v_he := time '08:00'; END IF;
    IF v_he IS NOT NULL THEN
      SELECT id INTO v_id FROM core.marcaciones WHERE empleado_id = p_empleado_id AND fecha = v_fecha AND tipo = 'ENTRADA_CAMPO' ORDER BY hora LIMIT 1;
      IF v_id IS NULL THEN
        INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, ts_servidor, modo, horas_extra, autoriza, observacion, origen, dispositivo, creado_por)
        VALUES (p_empleado_id, 'ENTRADA_CAMPO', v_fecha, v_he, (v_fecha + v_he) AT TIME ZONE 'America/Guayaquil', 'CAMPO', true, v_aut, v_obs,
                'SUPERVISOR', 'FORM_CAMPO_SUPERVISOR', private.jwt_usuario());
      ELSE
        UPDATE core.marcaciones SET hora = v_he, ts_servidor = (v_fecha + v_he) AT TIME ZONE 'America/Guayaquil', modo = 'CAMPO',
               horas_extra = true, autoriza = v_aut, observacion = v_obs, editado_en = now(), editado_por = private.jwt_usuario()
         WHERE id = v_id;
      END IF;
    END IF;
    IF v_hs IS NOT NULL THEN
      v_id := NULL;
      SELECT id INTO v_id FROM core.marcaciones WHERE empleado_id = p_empleado_id AND fecha = v_fecha AND tipo = 'SALIDA_CAMPO' ORDER BY hora DESC LIMIT 1;
      IF v_id IS NULL THEN
        INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, ts_servidor, modo, horas_extra, autoriza, observacion, origen, dispositivo, creado_por)
        VALUES (p_empleado_id, 'SALIDA_CAMPO', v_fecha, v_hs, (v_fecha + v_hs) AT TIME ZONE 'America/Guayaquil', 'CAMPO', true, v_aut, v_obs,
                'SUPERVISOR', 'FORM_CAMPO_SUPERVISOR', private.jwt_usuario());
      ELSE
        UPDATE core.marcaciones SET hora = v_hs, ts_servidor = (v_fecha + v_hs) AT TIME ZONE 'America/Guayaquil', modo = 'CAMPO',
               horas_extra = true, autoriza = v_aut, observacion = v_obs, editado_en = now(), editado_por = private.jwt_usuario()
         WHERE id = v_id;
      END IF;
    END IF;
    v_id := NULL;
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'dias', n);
END $$;

-- Pedido para invitados desde el panel (guardarAlmuerzoExtra): mismas reglas de fecha y horario (R-15)
CREATE OR REPLACE FUNCTION api.sup_crear_solicitud_invitado(p_subtipo text, p_fecha date, p_cantidad int, p_invitado text,
  p_empresa text DEFAULT NULL, p_hora_servicio text DEFAULT NULL, p_observaciones text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  ahora timestamp := private.ahora_local();
  v_subtipo text := upper(coalesce(nullif(p_subtipo, ''), 'ALMUERZO_EXTRA'));
  v_tipo text := CASE WHEN v_subtipo LIKE 'REFRIGERIO%' THEN 'REFRIGERIO' ELSE 'ALMUERZO_EXTRA' END;
  v_inv text := coalesce(nullif(trim(p_invitado), ''), 'Almuerzo Extra');
  v_emp text := coalesce(nullif(trim(p_empresa), ''), 'TCONTROL');
  v_sup_id text := private.jwt_empleado_id();
  v_sup text;
  v_obs text;
  v_obs_c text;
  v_id text;
  err text;
BEGIN
  PERFORM private.exigir_supervisor();
  IF v_subtipo NOT IN ('ALMUERZO_EXTRA','REFRIGERIO_SANDUCHE','REFRIGERIO_GALLETAS') THEN RAISE EXCEPTION 'Tipo de solicitud no válido' USING ERRCODE = '22023'; END IF;
  IF p_fecha IS NULL THEN RAISE EXCEPTION 'Ingrese una fecha válida' USING ERRCODE = '22023'; END IF;
  IF coalesce(p_cantidad, 0) < 1 OR p_cantidad > 200 THEN RAISE EXCEPTION 'Ingrese una cantidad válida' USING ERRCODE = '22023'; END IF;
  -- Reglas de fecha y hora de corte (sin la exclusión de Taller: el pedido es del panel)
  err := private.validar_solicitud_invitado(v_subtipo, p_fecha, NULL, NULL, ahora);
  IF err IS NOT NULL THEN RAISE EXCEPTION '%', err USING ERRCODE = 'P0001'; END IF;
  SELECT CASE WHEN private.nivel() >= 4 AND v_sup_id IS NULL THEN 'Admin Master'
              ELSE coalesce((SELECT nombre FROM core.empleados WHERE id = v_sup_id), 'Supervisor ID ' || coalesce(v_sup_id, private.jwt_usuario())) END INTO v_sup;
  v_obs := trim(coalesce(p_observaciones, ''));
  v_obs := CASE WHEN v_obs <> '' THEN v_obs || ' (Creado por: ' ELSE '(Creado por: ' END
           || CASE WHEN v_sup_id IS NOT NULL THEN 'ID: ' || v_sup_id || ' - ' || v_sup ELSE v_sup END || ')';
  v_obs_c := v_obs;
  IF nullif(p_hora_servicio, '') IS NOT NULL THEN v_obs_c := v_obs_c || ' [Hora req: ' || p_hora_servicio || ']'; END IF;
  IF position('colaborador' IN lower(v_inv)) = 0 THEN v_obs_c := v_obs_c || ' (Sol: Colaborador)'; END IF;
  v_id := format('inv_%s_%s_%s_%s', to_char(p_fecha, 'YYYYMMDD'), to_char(ahora, 'HH24MISS'), 'ext',
                 substr(encode(public.gen_random_bytes(3), 'hex'), 1, 4));
  INSERT INTO core.solicitudes_invitados (id, fecha, hora, tipo_solicitud, subtipo, cantidad, invitado, empresa, empleado_id,
    empleado_nombre, empleado_area, hora_servicio, observaciones, observaciones_completas, estado, creado_por, ts)
  VALUES (v_id, p_fecha, ahora::time(0), v_tipo, v_subtipo, p_cantidad, v_inv, v_emp, NULL, 'Colaborador', NULL,
    nullif(p_hora_servicio, ''), v_obs, v_obs_c, 'SOLICITADO', 'SUPERVISOR', ahora AT TIME ZONE 'America/Guayaquil');
  PERFORM private.encolar('SOLICITUD_INVITADO', jsonb_build_object('id', v_id, 'tipoSolicitud', v_tipo, 'subtipo', v_subtipo,
    'cantidad', p_cantidad, 'invitado', v_inv, 'empresa', v_emp, 'fecha', p_fecha, 'horaServicio', p_hora_servicio,
    'observaciones', v_obs, 'empleadoNombre', v_sup, 'empleadoArea', NULL));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION api.sup_registro_manual(text, date, text, text, text, text, text, text),
  api.sup_evento_futuro(text, date, date, text, text), api.sup_trabajo_campo(text, jsonb, text, text, text),
  api.sup_crear_solicitud_invitado(text, date, int, text, text, text, text)
  TO supervisor;
