-- Fase 5 (bloque D): Gestión & Servicios del panel de supervisor.
-- Emergencias (reportes del día), menú semanal con histórico y sugerencias, banco de preguntas de Cultura
-- Tcontrol con su interruptor general, y gestión de pedidos de invitados (estado, eliminación, recordatorio).
-- Los avisos de WhatsApp van a core.cola_notificaciones; los envía el worker (Fase 6), sin llaves en el navegador.

-- Nombre de quien opera el panel (para "actualizado por" y los avisos)
CREATE OR REPLACE FUNCTION private.nombre_sesion() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce((SELECT nombre FROM core.empleados WHERE id = private.jwt_empleado_id()),
                  CASE WHEN private.nivel() >= 4 THEN 'Admin Master' ELSE 'Supervisor' END)
$$;

-- ───────────── Emergencias ─────────────
-- Estado reportado hoy en la primera ENTRADA de cada colaborador (cargarEmergenciasSupervisor)
CREATE OR REPLACE FUNCTION api.sup_emergencia_estado()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE em core.emergencias;
BEGIN
  PERFORM private.exigir_supervisor();
  SELECT * INTO em FROM core.emergencias WHERE activa ORDER BY inicio DESC LIMIT 1;
  RETURN jsonb_build_object(
    'emergencia', CASE WHEN em.id IS NULL THEN jsonb_build_object('activa', false, 'nombre', '', 'habilitadoPor', '', 'fecha', '')
                  ELSE jsonb_build_object('activa', true, 'nombre', em.nombre, 'habilitadoPor', coalesce(em.habilitado_por, ''),
                                          'fecha', to_char(em.inicio AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS')) END,
    'reportes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'empleadoId', x.empleado_id, 'estado', x.estado_emergencia,
                   'hora', to_char(x.estado_emergencia_ts AT TIME ZONE 'America/Guayaquil', 'HH24:MI'))), '[]')
                 FROM (SELECT DISTINCT ON (m.empleado_id) m.empleado_id, m.estado_emergencia, m.estado_emergencia_ts
                       FROM core.marcaciones m
                       WHERE m.fecha = private.hoy() AND m.tipo = 'ENTRADA'
                       ORDER BY m.empleado_id, m.hora, m.id) x
                 WHERE x.estado_emergencia IS NOT NULL));
END $$;

-- ───────────── Menú semanal ─────────────
CREATE OR REPLACE FUNCTION api.sup_menu()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM private.exigir_supervisor();
  RETURN jsonb_build_object(
    'menu', (SELECT coalesce(jsonb_object_agg(m.dia, jsonb_build_object('sopa', coalesce(m.sopa, ''), 'plato', coalesce(m.plato, ''),
                                                                        'jugo', coalesce(m.jugo, ''))), '{}')
             FROM core.menu_semanal m),
    -- obtenerHistorialMenuSugerencias: valores únicos del histórico
    'sugerencias', jsonb_build_object(
      'sopas', (SELECT coalesce(jsonb_agg(v ORDER BY v), '[]') FROM (SELECT DISTINCT trim(sopa) v FROM core.historial_menu WHERE nullif(trim(sopa), '') IS NOT NULL) s),
      'platos', (SELECT coalesce(jsonb_agg(v ORDER BY v), '[]') FROM (SELECT DISTINCT trim(plato) v FROM core.historial_menu WHERE nullif(trim(plato), '') IS NOT NULL) s),
      'jugos', (SELECT coalesce(jsonb_agg(v ORDER BY v), '[]') FROM (SELECT DISTINCT trim(jugo) v FROM core.historial_menu WHERE nullif(trim(jugo), '') IS NOT NULL) s)));
END $$;

-- guardarMenuSemanal: archiva el menú anterior (con la fecha de ese día en la semana en curso, como
-- calcularFechaDiaSemana) y publica el nuevo
CREATE OR REPLACE FUNCTION api.sup_guardar_menu(p_menu jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  dias text[] := ARRAY['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  d text;
  hoy date := private.hoy();
  v jsonb;
BEGIN
  PERFORM private.exigir_supervisor();
  IF p_menu IS NULL OR jsonb_typeof(p_menu) <> 'object' THEN RAISE EXCEPTION 'Menú no válido' USING ERRCODE = '22023'; END IF;
  INSERT INTO core.historial_menu (fecha, dia, sopa, plato, jugo)
  SELECT hoy + (array_position(dias, m.dia) - 1 - extract(dow FROM hoy)::int), initcap(m.dia),
         coalesce(m.sopa, ''), coalesce(m.plato, ''), coalesce(m.jugo, '')
  FROM core.menu_semanal m
  WHERE coalesce(m.sopa, '') <> '' OR coalesce(m.plato, '') <> '' OR coalesce(m.jugo, '') <> ''
  ORDER BY array_position(ARRAY['lunes','martes','miercoles','jueves','viernes','sabado','domingo'], m.dia);
  FOREACH d IN ARRAY ARRAY['lunes','martes','miercoles','jueves','viernes','sabado','domingo'] LOOP
    v := coalesce(p_menu -> d, '{}');
    INSERT INTO core.menu_semanal (dia, sopa, plato, jugo, actualizado_en)
    VALUES (d, trim(coalesce(v ->> 'sopa', '')), trim(coalesce(v ->> 'plato', '')), trim(coalesce(v ->> 'jugo', '')), now())
    ON CONFLICT (dia) DO UPDATE SET sopa = EXCLUDED.sopa, plato = EXCLUDED.plato, jugo = EXCLUDED.jugo, actualizado_en = now();
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ───────────── Cultura Tcontrol ─────────────
CREATE OR REPLACE FUNCTION api.sup_cultura()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM private.exigir_supervisor();
  RETURN jsonb_build_object(
    'habilitado', coalesce((private.cfg('cultura') ->> 'habilitado')::boolean, true),
    'preguntas', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'id', p.id, 'tipo', p.tipo, 'pilar', p.pilar, 'clasePilar', p.clase_pilar, 'iconoPilar', p.icono_pilar,
                    'pregunta', p.pregunta, 'pista', p.pista, 'opciones', p.opciones, 'activo', p.activo)
                    ORDER BY p.orden NULLS LAST, p.id), '[]')
                  FROM core.cultura_preguntas p));
END $$;

-- guardarPreguntasCultura: el banco completo reemplaza al anterior
CREATE OR REPLACE FUNCTION api.sup_guardar_cultura(p_preguntas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE q jsonb; i int := 0; ids text[] := '{}';
BEGIN
  PERFORM private.exigir_supervisor();
  IF p_preguntas IS NULL OR jsonb_typeof(p_preguntas) <> 'array' THEN RAISE EXCEPTION 'Banco de preguntas no válido' USING ERRCODE = '22023'; END IF;
  FOR q IN SELECT value FROM jsonb_array_elements(p_preguntas) LOOP
    i := i + 1;
    IF nullif(trim(q ->> 'id'), '') IS NULL OR nullif(trim(q ->> 'pregunta'), '') IS NULL THEN
      RAISE EXCEPTION 'Pregunta % sin identificador o texto', i USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(q -> 'opciones') <> 'array' OR jsonb_array_length(q -> 'opciones') < 2 THEN
      RAISE EXCEPTION 'La pregunta "%" debe tener al menos 2 opciones', q ->> 'pregunta' USING ERRCODE = '22023';
    END IF;
    ids := ids || (q ->> 'id');
    INSERT INTO core.cultura_preguntas (id, tipo, pilar, clase_pilar, icono_pilar, pregunta, pista, opciones, activo, orden)
    VALUES (q ->> 'id', q ->> 'tipo', q ->> 'pilar', q ->> 'clasePilar', q ->> 'iconoPilar', trim(q ->> 'pregunta'), q ->> 'pista',
            (SELECT jsonb_agg(jsonb_build_object('letra', o ->> 'letra', 'texto', o ->> 'texto',
                                                 'correcta', coalesce((o ->> 'correcta')::boolean, false)) ORDER BY n)
             FROM jsonb_array_elements(q -> 'opciones') WITH ORDINALITY AS t(o, n)),
            coalesce((q ->> 'activo')::boolean, true), i)
    ON CONFLICT (id) DO UPDATE SET tipo = EXCLUDED.tipo, pilar = EXCLUDED.pilar, clase_pilar = EXCLUDED.clase_pilar,
      icono_pilar = EXCLUDED.icono_pilar, pregunta = EXCLUDED.pregunta, pista = EXCLUDED.pista, opciones = EXCLUDED.opciones,
      activo = EXCLUDED.activo, orden = EXCLUDED.orden;
  END LOOP;
  DELETE FROM core.cultura_preguntas WHERE NOT (id = ANY (ids));
  RETURN jsonb_build_object('ok', true, 'total', i);
END $$;

CREATE OR REPLACE FUNCTION api.sup_cultura_global(p_habilitado boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM private.exigir_supervisor();
  INSERT INTO core.configuracion (clave, valor, actualizado_en, actualizado_por)
  VALUES ('cultura', jsonb_build_object('habilitado', coalesce(p_habilitado, true)), now(), private.jwt_usuario())
  ON CONFLICT (clave) DO UPDATE SET valor = core.configuracion.valor || EXCLUDED.valor, actualizado_en = now(),
                                    actualizado_por = EXCLUDED.actualizado_por;
  RETURN jsonb_build_object('ok', true, 'habilitado', coalesce(p_habilitado, true));
END $$;

-- ───────────── Invitados & Catering ─────────────
CREATE OR REPLACE FUNCTION api.sup_estado_invitado(p_id text, p_estado text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM private.exigir_supervisor();
  IF p_estado NOT IN ('SOLICITADO','CONFIRMADO','ENTREGADO','CANCELADO') THEN RAISE EXCEPTION 'Estado no válido' USING ERRCODE = '22023'; END IF;
  UPDATE core.solicitudes_invitados SET estado = p_estado, actualizado_por = private.nombre_sesion(), actualizado_en = now()
   WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- eliminarSolicitudInvitado + aviso de cancelación a los Sup. Admin (notificarSupAdminsCancelacionInvitado)
CREATE OR REPLACE FUNCTION api.sup_eliminar_invitado(p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s core.solicitudes_invitados;
BEGIN
  PERFORM private.exigir_supervisor();
  DELETE FROM core.solicitudes_invitados WHERE id = p_id RETURNING * INTO s;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Solicitud no encontrada' USING ERRCODE = 'P0002'; END IF;
  PERFORM private.encolar('CANCELACION_INVITADO', jsonb_build_object(
    'id', s.id, 'invitado', coalesce(s.invitado, 'Invitado'), 'solicitante', coalesce(s.empleado_nombre, 'Colaborador'),
    'subtipo', s.subtipo, 'cantidad', s.cantidad, 'fecha', to_char(s.fecha, 'YYYY-MM-DD'), 'eliminadoPor', private.nombre_sesion()));
  RETURN jsonb_build_object('ok', true);
END $$;

-- notificarSupAdminsRecordatorioPendientes: recordatorio con los pedidos indicados
CREATE OR REPLACE FUNCTION api.sup_notificar_invitados(p_ids text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE pedidos jsonb; destinatarios int;
BEGIN
  PERFORM private.exigir_supervisor();
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'fecha', to_char(s.fecha, 'YYYY-MM-DD'), 'subtipo', s.subtipo,
                  'cantidad', s.cantidad, 'invitado', s.invitado, 'solicitante', s.empleado_nombre, 'estado', s.estado)
                  ORDER BY s.fecha, s.hora), '[]')
    INTO pedidos FROM core.solicitudes_invitados s WHERE s.id = ANY (coalesce(p_ids, '{}'));
  IF jsonb_array_length(pedidos) = 0 THEN RAISE EXCEPTION 'No hay pedidos para notificar' USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO destinatarios FROM core.empleados
   WHERE activo AND rol IN ('SUPERVISOR_ADMIN', 'ADMIN') AND nullif(telefono, '') IS NOT NULL;
  PERFORM private.encolar('RECORDATORIO_INVITADOS', jsonb_build_object('pedidos', pedidos, 'enviadoPor', private.nombre_sesion()));
  RETURN jsonb_build_object('ok', true, 'destinatarios', destinatarios, 'pedidos', jsonb_array_length(pedidos));
END $$;

REVOKE ALL ON FUNCTION private.nombre_sesion() FROM PUBLIC;
REVOKE ALL ON FUNCTION api.sup_emergencia_estado(), api.sup_menu(), api.sup_guardar_menu(jsonb), api.sup_cultura(),
  api.sup_guardar_cultura(jsonb), api.sup_cultura_global(boolean), api.sup_estado_invitado(text, text),
  api.sup_eliminar_invitado(text), api.sup_notificar_invitados(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.sup_emergencia_estado(), api.sup_menu(), api.sup_guardar_menu(jsonb), api.sup_cultura(),
  api.sup_guardar_cultura(jsonb), api.sup_cultura_global(boolean), api.sup_estado_invitado(text, text),
  api.sup_eliminar_invitado(text), api.sup_notificar_invitados(text[]) TO supervisor;
