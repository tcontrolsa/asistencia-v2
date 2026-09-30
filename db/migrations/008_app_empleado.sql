-- 008 — Fase 3: RPC de la app del empleado (legacy JS/index_core.js + firebase_backend.js)
-- Toda regla vive aquí; el cliente solo muestra. Hora oficial = servidor (D-15).

-- ───────────── Reloj simulable SOLO en desarrollo (pruebas de reglas por hora) ─────────────
-- En producción no se define app.permitir_reloj_simulado, así que app.ahora se ignora.
CREATE OR REPLACE FUNCTION private.ahora_local() RETURNS timestamp
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN current_setting('app.permitir_reloj_simulado', true) = 'on'
                   AND session_user <> 'authenticator'          -- jamás a través de PostgREST
                   AND nullif(current_setting('app.ahora', true), '') IS NOT NULL
              THEN current_setting('app.ahora', true)::timestamp
              ELSE now() AT TIME ZONE 'America/Guayaquil' END
$$;
CREATE OR REPLACE FUNCTION private.hoy() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT private.ahora_local()::date $$;

-- ───────────── Ajustes de esquema ─────────────
-- Salida por cumpleaños existe en el legado (procesarRazonSalida → 'CUMPLEAÑOS')
ALTER TABLE core.marcaciones DROP CONSTRAINT IF EXISTS marcaciones_tipo_salida_check;
ALTER TABLE core.marcaciones ADD CONSTRAINT marcaciones_tipo_salida_check CHECK (tipo_salida IN
  ('FINAL','PERMISO','PERMISO_CON_SALIDA_TEMPRANA','TRABAJO_CAMPO','SALIDA_PASANTE','SALIDA_TEMPRANA_JUSTIFICADA','CUMPLEAÑOS'));

-- Cola de avisos (WhatsApp) que procesará el worker de la Fase 6
CREATE TABLE IF NOT EXISTS core.cola_notificaciones (
  id          bigserial PRIMARY KEY,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  tipo        text NOT NULL,        -- REPORTE_FUERA_AREA, SOLICITUD_INVITADO, CANCELACION_INVITADO…
  payload     jsonb NOT NULL,
  estado      text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ENVIADO','ERROR','DESCARTADO')),
  intentos    int NOT NULL DEFAULT 0,
  procesado_en timestamptz,
  error       text
);
ALTER TABLE core.cola_notificaciones ENABLE ROW LEVEL SECURITY;

-- Fotos de perfil (D-05). 160 px JPEG (~10 KB): se guardan en la base y se sirven por /rpc/foto.
CREATE TABLE IF NOT EXISTS core.fotos (
  empleado_id    text PRIMARY KEY REFERENCES core.empleados(id) ON UPDATE CASCADE,
  contenido      bytea NOT NULL,
  mime           text NOT NULL DEFAULT 'image/jpeg',
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE core.fotos ENABLE ROW LEVEL SECURITY;

-- Cultura: el legado la considera habilitada salvo que se desactive explícitamente
UPDATE core.configuracion SET valor = jsonb_build_object('habilitado', true)
 WHERE clave = 'cultura' AND valor = jsonb_build_object('habilitado', false);

-- Parámetros de la app que en el legado estaban en el código
INSERT INTO core.configuracion (clave, valor) VALUES
  ('app_empleado', jsonb_build_object(
     'campo_distancia_minima_m', 250000,   -- cambiarModo(): CAMPO solo a más de 250 km de la planta (P-12)
     'faltas_dias_atras', 15,              -- obtenerDiasFaltantes()
     'almuerzo_popup_desde', '12:25', 'almuerzo_popup_hasta', '14:00',
     'salida_confirmar_almuerzo_hasta', '10:00'))
ON CONFLICT (clave) DO NOTHING;

-- ───────────── Utilidades ─────────────
-- URL pública de la foto: subida → /rpc/foto; base64 legado → /rpc/foto; URL externa → tal cual
CREATE OR REPLACE FUNCTION private.url_foto(p_id text, p_legado text, p_version timestamptz DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_version IS NOT NULL THEN format('/rpc/foto?p_id=%s&v=%s', p_id, extract(epoch FROM p_version)::bigint)
    WHEN p_legado LIKE 'data:image/%' THEN format('/rpc/foto?p_id=%s', p_id)
    ELSE nullif(p_legado, '') END
$$;

CREATE OR REPLACE FUNCTION private.empleado_actual() RETURNS core.empleados
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE e core.empleados;
BEGIN
  SELECT * INTO e FROM core.empleados WHERE id = private.jwt_empleado_id() AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión sin colaborador activo' USING ERRCODE = '42501'; END IF;
  RETURN e;
END $$;

CREATE OR REPLACE FUNCTION private.encolar(p_tipo text, p_payload jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  INSERT INTO core.cola_notificaciones (tipo, payload) VALUES (p_tipo, p_payload)
$$;

-- ───────────── Contexto de la app ─────────────
CREATE OR REPLACE FUNCTION api.mi_contexto()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  e core.empleados := private.empleado_actual();
  s jsonb := private.cfg('sistema');
  h core.horarios := private.horario(private.hoy());
  em core.emergencias;
  f core.fotos;
BEGIN
  SELECT * INTO em FROM core.emergencias WHERE activa LIMIT 1;
  SELECT * INTO f FROM core.fotos WHERE empleado_id = e.id;
  RETURN jsonb_build_object(
    'empleado', jsonb_build_object(
      'id', e.id, 'nombre', e.nombre, 'area', e.area, 'cargo', e.cargo, 'cedula', e.cedula,
      'telefono', e.telefono, 'fecha_nacimiento', e.fecha_nacimiento,
      'foto_url', private.url_foto(e.id, e.foto_legado, f.actualizado_en),
      'base_lat', e.base_lat, 'base_lng', e.base_lng, 'base_radio_m', e.base_radio_m,
      'url_rol_pagos', e.url_rol_pagos, 'rol', e.rol, 'es_pasante', e.es_pasante,
      'tipo_asistencia', e.tipo_asistencia, 'puede_autorizar_extras', e.puede_autorizar_extras,
      'cultura_habilitada', e.cultura_habilitada,
      'es_supervisor', e.rol IN ('SUPERVISOR','SUPERVISOR_ADMIN','ADMIN'),
      'es_admin', e.rol = 'ADMIN'),
    'ahora', private.ahora_local(), 'fecha', private.hoy(), 'tipo_dia', private.tipo_dia(private.hoy()),
    'horario', to_jsonb(h),
    'ubicacion', s -> 'ubicacion',
    'almuerzo', jsonb_build_object('hora_limite', s #>> '{horarios,hora_almuerzo}',
                                   'activo', coalesce((s #>> '{horarios,almuerzo_activo}')::boolean, true)),
    'invitados', private.cfg('invitados'),
    'app', private.cfg('app_empleado'),
    'soporte', jsonb_build_object('whatsapp_number', s #>> '{otras,whatsapp_number}',
                                  'mensaje', s #>> '{otras,mensaje_soporte}'),
    'forzar_actualizacion', coalesce(s -> 'forzar_actualizacion', '0'),
    'cultura_habilitada', coalesce((private.cfg('cultura') ->> 'habilitado')::boolean, true),
    'emergencia', CASE WHEN em.id IS NULL THEN jsonb_build_object('activa', false, 'nombre', '')
                       ELSE jsonb_build_object('activa', true, 'nombre', em.nombre, 'id', em.id) END,
    'periodo', to_jsonb(private.periodo(private.hoy())));
END $$;

-- ───────────── Registros del empleado (formato del legado para la app) ─────────────
-- Une marcaciones, novedades y ajustes del día. Los minutos de permiso van en una sola fila del día
-- (la novedad o la primera marcación) para que las sumas por fila del legado den lo mismo.
CREATE OR REPLACE FUNCTION api.mis_registros(p_desde date DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE e core.empleados := private.empleado_actual();
BEGIN
  RETURN QUERY
  WITH filas AS (
    SELECT m.fecha, m.ts_servidor AS ts, 0 AS orden_tipo, jsonb_build_object(
             'id', 'm' || m.id, 'fecha', m.fecha, 'hora', to_char(m.hora, 'HH24:MI:SS'),
             'timestamp', m.ts_servidor, 'tipo', m.tipo,
             'almuerzo', CASE m.almuerzo WHEN true THEN 'SI' WHEN false THEN 'NO' ELSE '' END,
             'modo', m.modo, 'horasExtra', CASE WHEN m.horas_extra THEN 'SI' ELSE 'NO' END,
             'autoriza', m.autoriza, 'tipo_salida', coalesce(m.tipo_salida, ''),
             'razon_salida', coalesce(m.motivo_salida, ''), 'razon_entrada_tardia', coalesce(m.motivo_entrada_tardia, ''),
             'quien_justifica', coalesce(m.quien_justifica, m.quien_justifica_entrada, ''),
             'razon_permiso', coalesce(m.razon_permiso, ''), 'razon_ausencia', coalesce(m.observacion, ''),
             'justificado', m.justificado, 'estado', m.estado_emergencia,
             -- la regla de atraso vive en el servidor (R-04); la app solo muestra
             'minutos_atraso', CASE WHEN m.tipo = 'ENTRADA'
                                    THEN private.minutos_atraso(m.fecha, m.hora, e.es_pasante, e.tipo_asistencia) ELSE 0 END) AS r
    FROM core.marcaciones m WHERE m.empleado_id = e.id AND (p_desde IS NULL OR m.fecha >= p_desde)
    UNION ALL
    SELECT n.fecha, n.creado_en, -1, jsonb_build_object(
             'id', 'n' || n.id, 'fecha', n.fecha, 'hora', '00:00:00', 'timestamp', n.creado_en, 'tipo', n.tipo,
             'almuerzo', '', 'modo', CASE WHEN n.tipo = 'TRABAJO_DE_CAMPO' THEN 'CAMPO' ELSE 'OFICINA' END,
             'horasExtra', 'NO', 'tipo_salida', '', 'razon_salida', '', 'razon_entrada_tardia', '',
             'quien_justifica', coalesce(n.quien_justifica, ''),
             'razon_permiso', CASE WHEN n.tipo = 'FALTA' THEN coalesce(n.motivo, '') ELSE '' END,
             'razon_ausencia', coalesce(n.motivo, n.observacion, ''), 'razon_justificac', coalesce(n.motivo, ''),
             'justificado', n.justificado)
    FROM core.novedades n WHERE n.empleado_id = e.id AND (p_desde IS NULL OR n.fecha >= p_desde)
  ),
  numeradas AS (
    SELECT f.*, row_number() OVER (PARTITION BY f.fecha ORDER BY f.orden_tipo, f.ts) AS rn FROM filas f
  )
  SELECT jsonb_build_object('tipo_dia', private.tipo_dia(x.fecha)) || CASE WHEN x.rn = 1 AND a.empleado_id IS NOT NULL
              THEN x.r || jsonb_build_object('permiso_personal_mins', a.min_permiso_personal,
                                             'permiso_medico_mins', a.min_permiso_medico,
                                             'tiempo_justificado_mins', a.min_justificados)
              ELSE x.r || jsonb_build_object('permiso_personal_mins', 0, 'permiso_medico_mins', 0,
                                             'tiempo_justificado_mins', 0) END
  FROM numeradas x
  LEFT JOIN core.ajustes_dia a ON a.empleado_id = e.id AND a.fecha = x.fecha
  ORDER BY x.fecha DESC, x.ts DESC;
END $$;

-- Días laborables de los últimos 15 sin ninguna marcación ni novedad (obtenerDiasFaltantes)
CREATE OR REPLACE FUNCTION api.mis_dias_faltantes()
RETURNS SETOF date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  e core.empleados := private.empleado_actual();
  hoy date := private.hoy();
  primero date;
BEGIN
  SELECT least((SELECT min(fecha) FROM core.marcaciones WHERE empleado_id = e.id),
               (SELECT min(fecha) FROM core.novedades WHERE empleado_id = e.id)) INTO primero;
  IF primero IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT d::date FROM generate_series(greatest(primero, hoy - (private.cfg('app_empleado') ->> 'faltas_dias_atras')::int),
                                      hoy - 1, interval '1 day') d
  WHERE private.tipo_dia(d::date) = 'LABORABLE'
    AND NOT EXISTS (SELECT 1 FROM core.marcaciones m WHERE m.empleado_id = e.id AND m.fecha = d::date)
    AND NOT EXISTS (SELECT 1 FROM core.novedades n WHERE n.empleado_id = e.id AND n.fecha = d::date)
  ORDER BY 1;
END $$;

-- ───────────── Marcar (iniciarRegistro / procederConRegistro / guardarRegistro) ─────────────
CREATE OR REPLACE FUNCTION api.marcar(
  p_tipo text, p_lat float8, p_lng float8, p_modo text DEFAULT 'OFICINA', p_almuerzo text DEFAULT NULL,
  p_ts_dispositivo timestamptz DEFAULT NULL,
  p_motivo_entrada_tardia text DEFAULT NULL, p_quien_justifica_entrada text DEFAULT NULL,
  p_tipo_salida text DEFAULT NULL, p_motivo_salida text DEFAULT NULL, p_quien_justifica text DEFAULT NULL,
  p_razon_permiso text DEFAULT NULL, p_menu jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  e core.empleados := private.empleado_actual();
  ahora timestamp := private.ahora_local();
  v_fecha date := ahora::date;
  v_hora time(0) := ahora::time(0);
  v_tipo text := upper(trim(p_tipo));
  v_modo text := CASE WHEN upper(coalesce(p_modo, '')) = 'CAMPO' THEN 'CAMPO' ELSE 'OFICINA' END;
  g record;
  ultimo core.marcaciones;
  entrada_hoy core.marcaciones;
  v_alm boolean;
  hx record;
  nuevo core.marcaciones;
BEGIN
  IF v_tipo NOT IN ('ENTRADA','SALIDA','SALIDA_CAMPO','RETORNO_CAMPO','ENTRADA_CAMPO') THEN
    RAISE EXCEPTION 'Tipo de registro no válido' USING ERRCODE = '22023';
  END IF;
  IF e.tipo_asistencia = 'SIN_ASISTENCIA' THEN
    RAISE EXCEPTION 'Tu perfil no registra asistencia.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo_salida IS NOT NULL AND p_tipo_salida NOT IN ('FINAL','PERMISO','PERMISO_CON_SALIDA_TEMPRANA','TRABAJO_CAMPO',
       'SALIDA_PASANTE','SALIDA_TEMPRANA_JUSTIFICADA','CUMPLEAÑOS') THEN
    RAISE EXCEPTION 'Tipo de salida no válido' USING ERRCODE = '22023';
  END IF;

  -- Geocerca validada en servidor (R-01, R-02)
  SELECT * INTO g FROM private.validar_geocerca(p_lat, p_lng, v_modo, e.base_lat, e.base_lng, e.base_radio_m);
  IF NOT g.dentro THEN
    RAISE EXCEPTION '%', g.mensaje USING ERRCODE = 'P0001', HINT = 'FUERA_DE_AREA';
  END IF;

  -- Doble marcación del mismo tipo seguida (R-17)
  SELECT * INTO ultimo FROM core.marcaciones WHERE empleado_id = e.id AND fecha = v_fecha
   ORDER BY ts_servidor DESC LIMIT 1;
  IF ultimo.tipo = v_tipo THEN
    RAISE EXCEPTION 'Ya registraste tu % recientemente hoy', v_tipo USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO entrada_hoy FROM core.marcaciones WHERE empleado_id = e.id AND fecha = v_fecha AND tipo = 'ENTRADA'
   ORDER BY ts_servidor LIMIT 1;

  IF v_tipo = 'ENTRADA' THEN
    IF entrada_hoy.id IS NULL THEN
      -- Motivo obligatorio después del límite (R-05 / D-01)
      IF e.tipo_asistencia = 'NORMAL' AND NOT e.es_pasante AND private.requiere_motivo_entrada(v_fecha, v_hora)
         AND nullif(trim(coalesce(p_motivo_entrada_tardia, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Selecciona el motivo de tu entrada después de las %',
          to_char((private.horario(v_fecha)).limite_justificacion, 'HH24:MI') USING ERRCODE = 'P0001', HINT = 'MOTIVO_ENTRADA';
      END IF;
      -- Almuerzo: se elige hasta la hora límite; después queda fuera de planta (R-14)
      IF NOT private.almuerzo_abierto(v_hora) THEN
        v_alm := false;
      ELSIF upper(coalesce(p_almuerzo, '')) IN ('SI','NO') THEN
        v_alm := upper(p_almuerzo) = 'SI';
      ELSE
        RAISE EXCEPTION 'Selecciona dónde almuerzas' USING ERRCODE = 'P0001', HINT = 'ALMUERZO';
      END IF;
    ELSE
      v_alm := entrada_hoy.almuerzo;   -- re-entrada tras permiso o campo
    END IF;
  ELSIF v_tipo = 'SALIDA' THEN
    v_alm := coalesce(entrada_hoy.almuerzo, NULL);
    IF upper(coalesce(p_almuerzo, '')) = 'NO'
       AND private.minutos(v_hora) < private.minutos(((private.cfg('app_empleado') ->> 'salida_confirmar_almuerzo_hasta'))::time) THEN
      v_alm := false;                  -- el colaborador canceló el almuerzo al salir antes de las 10:00
    END IF;
    v_alm := private.almuerzo_en_salida(v_hora, v_alm);
  ELSE
    v_alm := entrada_hoy.almuerzo;
  END IF;

  SELECT * INTO hx FROM private.horas_extra_auto(v_tipo, v_fecha, v_hora, v_modo);

  INSERT INTO core.marcaciones (empleado_id, tipo, ts_servidor, ts_dispositivo, fecha, hora, lat, lng, distancia_m,
    dispositivo, modo, almuerzo, horas_extra, autoriza, tipo_salida, motivo_entrada_tardia, quien_justifica_entrada,
    motivo_salida, quien_justifica, razon_permiso, menu, origen, creado_por)
  VALUES (e.id, v_tipo, ahora AT TIME ZONE 'America/Guayaquil', p_ts_dispositivo, v_fecha, v_hora, p_lat, p_lng,
    g.distancia_m, private.claims() ->> 'dispositivo', v_modo, v_alm, hx.horas_extra, hx.autoriza,
    nullif(p_tipo_salida, ''), nullif(trim(p_motivo_entrada_tardia), ''), nullif(trim(p_quien_justifica_entrada), ''),
    nullif(trim(p_motivo_salida), ''), nullif(trim(p_quien_justifica), ''), nullif(trim(p_razon_permiso), ''),
    p_menu, 'APP', e.id)
  RETURNING * INTO nuevo;

  RETURN jsonb_build_object('ok', true, 'id', nuevo.id, 'tipo', nuevo.tipo, 'fecha', nuevo.fecha,
    'hora', to_char(nuevo.hora, 'HH24:MI:SS'), 'almuerzo', nuevo.almuerzo, 'horas_extra', nuevo.horas_extra,
    'distancia_m', nuevo.distancia_m,
    'minutos_atraso', CASE WHEN v_tipo = 'ENTRADA' THEN private.minutos_atraso(v_fecha, v_hora, e.es_pasante, e.tipo_asistencia) END);
END $$;

-- ───────────── Reporte "fuera de área" (D-08: queda PENDIENTE hasta que el supervisor apruebe) ─────────────
CREATE OR REPLACE FUNCTION api.reportar_estado_hoy(p_tipo text, p_observacion text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  e core.empleados := private.empleado_actual();
  v_fecha date := private.hoy();
  v_texto text := CASE p_tipo WHEN 'VACACIONES' THEN '🏖️ VACACIÓN' WHEN 'PERMISO_PERSONAL' THEN '👤 Permiso Personal'
                    WHEN 'PERMISO_MEDICO' THEN '🩺 Permiso Médico' WHEN 'FALTA_JUSTIFICADA' THEN '📋 Falta Justificada'
                    WHEN 'TRABAJO_DE_CAMPO' THEN '🚗 CAMPO (Trabajo en Campo / Cliente)' END;
BEGIN
  IF v_texto IS NULL THEN RAISE EXCEPTION 'Estado no válido' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM core.marcaciones WHERE empleado_id = e.id AND fecha = v_fecha AND tipo IN ('ENTRADA','SALIDA')) THEN
    RAISE EXCEPTION 'Ya registraste tu jornada de asistencia el día de hoy.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO core.novedades (empleado_id, fecha, tipo, justificado, motivo, quien_justifica, observacion, origen, creado_por)
  VALUES (e.id, v_fecha, p_tipo, 'PENDIENTE', coalesce(nullif(trim(p_observacion), ''), v_texto),
          'Colaborador (Reporte Fuera de Área)', nullif(trim(p_observacion), ''), 'APP', e.id)
  ON CONFLICT (empleado_id, fecha) DO UPDATE SET tipo = EXCLUDED.tipo, justificado = 'PENDIENTE', motivo = EXCLUDED.motivo,
    quien_justifica = EXCLUDED.quien_justifica, observacion = EXCLUDED.observacion, origen = 'APP', creado_por = e.id,
    creado_en = now();
  PERFORM private.encolar('REPORTE_FUERA_AREA', jsonb_build_object('empleadoId', e.id, 'empleadoNombre', e.nombre,
    'empleadoArea', e.area, 'tipo', p_tipo, 'textoEstado', v_texto, 'observacion', p_observacion, 'fecha', v_fecha));
  RETURN jsonb_build_object('ok', true, 'tipo', p_tipo, 'texto', v_texto, 'fecha', v_fecha);
END $$;

-- ───────────── Justificación masiva de faltas (procesarJustificacionMasiva) ─────────────
CREATE OR REPLACE FUNCTION api.justificar_faltas(p_fechas date[], p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  e core.empleados := private.empleado_actual();
  permitidas date[];
  f date;
  n int := 0;
BEGIN
  IF p_motivo NOT IN ('Vacaciones','Permiso médico','Calamidad doméstica','Permiso personal','Salida a Campo','Falta injustificada') THEN
    RAISE EXCEPTION 'Motivo no válido' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(d) INTO permitidas FROM api.mis_dias_faltantes() d;
  FOREACH f IN ARRAY coalesce(p_fechas, '{}') LOOP
    IF f = ANY (coalesce(permitidas, '{}')) THEN
      INSERT INTO core.novedades (empleado_id, fecha, tipo, justificado, motivo, quien_justifica, origen, creado_por)
      VALUES (e.id, f, 'FALTA', 'SI', p_motivo, 'Colaborador', 'APP', e.id)
      ON CONFLICT (empleado_id, fecha) DO NOTHING;
      n := n + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'justificados', n, 'rechazados', coalesce(array_length(p_fechas, 1), 0) - n);
END $$;

-- ───────────── Almuerzo del día (registrarAlmuerzoTab / registrarAlmuerzoPopup) ─────────────
CREATE OR REPLACE FUNCTION api.cambiar_almuerzo(p_opcion text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  e core.empleados := private.empleado_actual();
  ahora timestamp := private.ahora_local();
  a jsonb := private.cfg('app_empleado');
  v_alm boolean := CASE upper(coalesce(p_opcion, '')) WHEN 'SI' THEN true WHEN 'NO' THEN false END;
  m core.marcaciones;
  en_popup boolean;
BEGIN
  IF v_alm IS NULL THEN RAISE EXCEPTION 'Opción de almuerzo no válida' USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM core.marcaciones WHERE empleado_id = e.id AND fecha = ahora::date
     AND tipo IN ('ENTRADA','ENTRADA_CAMPO','RETORNO_CAMPO','SOLO_ALMUERZO') ORDER BY ts_servidor LIMIT 1;
  en_popup := private.minutos(ahora::time) BETWEEN private.minutos((a ->> 'almuerzo_popup_desde')::time)
                                                AND private.minutos((a ->> 'almuerzo_popup_hasta')::time);
  IF NOT private.almuerzo_abierto(ahora::time) AND NOT (en_popup AND m.almuerzo IS NULL) THEN
    RAISE EXCEPTION 'El tiempo límite para cambios (%) ha expirado', (private.cfg('sistema') #>> '{horarios,hora_almuerzo}')
      USING ERRCODE = 'P0001';
  END IF;
  IF m.id IS NOT NULL THEN
    UPDATE core.marcaciones SET almuerzo = v_alm WHERE id = m.id;
  ELSIF e.tipo_asistencia <> 'NORMAL' THEN
    INSERT INTO core.marcaciones (empleado_id, tipo, ts_servidor, fecha, hora, modo, almuerzo, origen, creado_por)
    VALUES (e.id, 'SOLO_ALMUERZO', ahora AT TIME ZONE 'America/Guayaquil', ahora::date, ahora::time(0), 'OFICINA', v_alm, 'APP', e.id);
  ELSE
    RAISE EXCEPTION 'Primero registra tu entrada de hoy.' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object('ok', true, 'almuerzo', CASE WHEN v_alm THEN 'SI' ELSE 'NO' END);
END $$;

-- ───────────── Invitados (crearSolicitudInvitado / eliminarSolicitudInvitado) ─────────────
CREATE OR REPLACE FUNCTION api.crear_solicitud_invitado(p_tipo text, p_subtipo text, p_fecha date, p_cantidad int,
  p_invitado text, p_empresa text DEFAULT NULL, p_hora_servicio text DEFAULT NULL, p_observaciones text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  e core.empleados := private.empleado_actual();
  ahora timestamp := private.ahora_local();
  v_subtipo text := upper(coalesce(nullif(p_subtipo, ''), p_tipo));
  v_tipo text := upper(coalesce(nullif(p_tipo, ''), 'ALMUERZO_EXTRA'));
  err text;
  v_inv text := coalesce(nullif(trim(p_invitado), ''), 'Invitado');
  v_emp text := coalesce(nullif(trim(p_empresa), ''), 'TCONTROL');
  v_obs text := coalesce(trim(p_observaciones), '');
  v_obs_c text;
  v_id text;
BEGIN
  IF v_subtipo NOT IN ('ALMUERZO_EXTRA','REFRIGERIO_SANDUCHE','REFRIGERIO_GALLETAS') THEN
    RAISE EXCEPTION 'Tipo de solicitud no válido' USING ERRCODE = '22023';
  END IF;
  err := private.validar_solicitud_invitado(v_subtipo, p_fecha, e.area, e.cargo, ahora);
  IF err IS NOT NULL THEN RAISE EXCEPTION '%', err USING ERRCODE = 'P0001'; END IF;
  IF coalesce(p_cantidad, 0) < 1 OR p_cantidad > 50 THEN RAISE EXCEPTION 'Cantidad no válida' USING ERRCODE = '22023'; END IF;
  -- Observaciones con trazabilidad, igual que el legado
  v_obs_c := v_obs;
  IF nullif(p_hora_servicio, '') IS NOT NULL THEN
    v_obs_c := CASE WHEN v_obs_c <> '' THEN v_obs_c || ' [Hora req: ' || p_hora_servicio || ']' ELSE '[Hora req: ' || p_hora_servicio || ']' END;
  END IF;
  IF nullif(e.area, '') IS NOT NULL THEN
    v_obs_c := CASE WHEN v_obs_c <> '' THEN v_obs_c || ' [Área: ' || e.area || ']' ELSE '[Área: ' || e.area || ']' END;
  END IF;
  IF position(lower(e.nombre) IN lower(v_inv)) = 0 THEN
    v_obs_c := CASE WHEN v_obs_c <> '' THEN v_obs_c || ' (Sol: ' || e.nombre || ')' ELSE '(Sol: ' || e.nombre || ')' END;
  END IF;
  v_id := format('inv_%s_%s_%s_%s', to_char(p_fecha, 'YYYYMMDD'), to_char(ahora, 'HH24MISS'), e.id,
                 substr(encode(public.gen_random_bytes(3), 'hex'), 1, 4));
  INSERT INTO core.solicitudes_invitados (id, fecha, hora, tipo_solicitud, subtipo, cantidad, invitado, empresa, empleado_id,
    empleado_nombre, empleado_area, hora_servicio, observaciones, observaciones_completas, estado, creado_por, ts)
  VALUES (v_id, p_fecha, ahora::time(0), v_tipo, v_subtipo, p_cantidad, v_inv, v_emp, e.id, e.nombre, e.area,
    nullif(p_hora_servicio, ''), v_obs, v_obs_c, 'SOLICITADO', 'USUARIO', ahora AT TIME ZONE 'America/Guayaquil');
  PERFORM private.encolar('SOLICITUD_INVITADO', jsonb_build_object('id', v_id, 'tipoSolicitud', v_tipo, 'subtipo', v_subtipo,
    'cantidad', p_cantidad, 'invitado', v_inv, 'empresa', v_emp, 'fecha', p_fecha, 'horaServicio', p_hora_servicio,
    'observaciones', v_obs, 'empleadoNombre', e.nombre, 'empleadoArea', e.area));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

CREATE OR REPLACE FUNCTION api.cancelar_solicitud_invitado(p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  e core.empleados := private.empleado_actual();
  ahora timestamp := private.ahora_local();
  s core.solicitudes_invitados;
  c jsonb := private.cfg('invitados');
BEGIN
  SELECT * INTO s FROM core.solicitudes_invitados WHERE id = p_id AND empleado_id = e.id AND estado <> 'CANCELADO';
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada' USING ERRCODE = 'P0002'; END IF;
  IF s.fecha = ahora::date THEN
    IF s.subtipo = 'ALMUERZO_EXTRA' AND private.minutos(ahora::time) > private.minutos((c ->> 'corte_almuerzo_extra')::time) THEN
      RAISE EXCEPTION 'El horario para modificar almuerzos de hoy expiró a las 09:40.' USING ERRCODE = 'P0001';
    ELSIF s.subtipo = 'REFRIGERIO_SANDUCHE' AND private.minutos(ahora::time) > private.minutos((c ->> 'corte_sanduche')::time) THEN
      RAISE EXCEPTION 'El horario para sánduches de hoy expiró a las 08:40.' USING ERRCODE = 'P0001';
    END IF;
  ELSIF s.fecha < ahora::date THEN
    RAISE EXCEPTION 'No se puede cancelar una solicitud de una fecha pasada.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE core.solicitudes_invitados SET estado = 'CANCELADO', actualizado_por = e.nombre, actualizado_en = now() WHERE id = p_id;
  PERFORM private.encolar('CANCELACION_INVITADO', jsonb_build_object('invitado', s.invitado, 'solicitante', e.nombre,
    'subtipo', s.subtipo, 'cantidad', s.cantidad, 'fecha', s.fecha, 'eliminadoPor', e.nombre));
  RETURN jsonb_build_object('ok', true);
END $$;

-- ───────────── Perfil (guardarDatosPersonales / guardarPerfilEmpleado / foto) ─────────────
CREATE OR REPLACE FUNCTION api.guardar_perfil(p_nombre text DEFAULT NULL, p_telefono text DEFAULT NULL,
  p_fecha_nacimiento date DEFAULT NULL, p_foto_url text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  e core.empleados := private.empleado_actual();
  tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
BEGIN
  IF p_nombre IS NOT NULL AND trim(p_nombre) = '' THEN
    RAISE EXCEPTION 'El nombre no puede estar vacío' USING ERRCODE = '22023';
  END IF;
  IF tel <> '' AND length(tel) < 8 THEN
    RAISE EXCEPTION 'Por favor ingresa un número de teléfono válido (mínimo 8 dígitos)' USING ERRCODE = '22023';
  END IF;
  IF p_foto_url IS NOT NULL AND p_foto_url <> '' AND p_foto_url !~* '^https?://' AND p_foto_url NOT LIKE '/rpc/foto%' THEN
    RAISE EXCEPTION 'La URL de la foto debe empezar con http:// o https://' USING ERRCODE = '22023';
  END IF;
  UPDATE core.empleados SET
    nombre = coalesce(nullif(trim(p_nombre), ''), nombre),
    telefono = CASE WHEN p_telefono IS NULL THEN telefono
                    WHEN tel = '' THEN NULL
                    WHEN length(tel) = 9 AND tel LIKE '9%' THEN '593' || tel
                    WHEN length(tel) = 10 AND tel LIKE '0%' THEN '593' || substr(tel, 2)
                    ELSE tel END,
    fecha_nacimiento = coalesce(p_fecha_nacimiento, fecha_nacimiento),
    foto_legado = CASE WHEN p_foto_url IS NULL OR p_foto_url LIKE '/rpc/foto%' THEN foto_legado ELSE nullif(p_foto_url, '') END
  WHERE id = e.id;
  IF p_foto_url IS NOT NULL AND p_foto_url NOT LIKE '/rpc/foto%' THEN
    DELETE FROM core.fotos WHERE empleado_id = e.id;   -- si pega una URL, deja de usarse la foto subida
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Foto de perfil subida desde el teléfono (ya reducida a 160 px en el cliente)
CREATE OR REPLACE FUNCTION api.subir_foto(p_base64 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  e core.empleados := private.empleado_actual();
  datos bytea;
  v timestamptz := now();
BEGIN
  datos := decode(regexp_replace(p_base64, '^data:image/[a-z]+;base64,', ''), 'base64');
  IF length(datos) > 300000 THEN RAISE EXCEPTION 'La imagen es demasiado grande' USING ERRCODE = '22023'; END IF;
  IF substr(datos, 1, 3) <> '\xffd8ff'::bytea THEN RAISE EXCEPTION 'La imagen debe ser JPEG' USING ERRCODE = '22023'; END IF;
  INSERT INTO core.fotos (empleado_id, contenido, mime, actualizado_en) VALUES (e.id, datos, 'image/jpeg', v)
  ON CONFLICT (empleado_id) DO UPDATE SET contenido = EXCLUDED.contenido, actualizado_en = v;
  RETURN jsonb_build_object('ok', true, 'foto_url', private.url_foto(e.id, NULL, v));
END $$;

-- Sirve la foto (subida o base64 del legado) como image/jpeg. Pública, como la vista previa del login.
DO $$ BEGIN CREATE DOMAIN api."image/jpeg" AS bytea; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE OR REPLACE FUNCTION api.foto(p_id text, v text DEFAULT NULL)
RETURNS api."image/jpeg" LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE datos bytea; legado text;
BEGIN
  SELECT contenido INTO datos FROM core.fotos WHERE empleado_id = p_id;
  IF datos IS NULL THEN
    SELECT foto_legado INTO legado FROM core.empleados WHERE id = p_id;
    IF legado LIKE 'data:image/%' THEN
      datos := decode(regexp_replace(legado, '^data:image/[a-z]+;base64,', ''), 'base64');
    END IF;
  END IF;
  IF datos IS NULL THEN RAISE EXCEPTION 'Sin foto' USING ERRCODE = 'P0002'; END IF;
  PERFORM set_config('response.headers', '[{"Cache-Control": "public, max-age=86400"}]', true);
  RETURN datos;
END $$;

-- ───────────── Extras de Taller/Producción (coordinadores, R-13) ─────────────
CREATE OR REPLACE FUNCTION private.puede_autorizar() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT private.es_supervisor() OR coalesce((SELECT puede_autorizar_extras FROM core.empleados
                                              WHERE id = private.jwt_empleado_id() AND activo), false)
$$;

CREATE OR REPLACE FUNCTION api.personal_taller()
RETURNS TABLE (id text, nombre text, cargo text, foto_url text, auth_extras text, ubicacion text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT private.puede_autorizar() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT e.id, e.nombre, coalesce(nullif(e.cargo, ''), 'OPERARIO'),
         private.url_foto(e.id, e.foto_legado, (SELECT f.actualizado_en FROM core.fotos f WHERE f.empleado_id = e.id)),
         CASE WHEN m.horas_extra THEN 'SI' ELSE 'NO' END,
         CASE WHEN m.modo = 'CAMPO' THEN 'CAMPO' ELSE 'EMPRESA' END
  FROM core.empleados e
  LEFT JOIN LATERAL (SELECT x.horas_extra, x.modo FROM core.marcaciones x
                     WHERE x.empleado_id = e.id AND x.fecha = private.hoy() AND x.tipo = 'ENTRADA'
                     ORDER BY x.ts_servidor DESC LIMIT 1) m ON true
  WHERE e.activo AND upper(e.area) IN ('TALLER', 'PRODUCCION')
  ORDER BY e.nombre;
END $$;

CREATE OR REPLACE FUNCTION api.autorizar_extras(p_empleado_id text, p_autorizado boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE quien text := (SELECT nombre FROM core.empleados WHERE id = private.jwt_empleado_id());
BEGIN
  IF NOT private.puede_autorizar() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  UPDATE core.marcaciones SET horas_extra = p_autorizado, autoriza = coalesce(quien, 'SUPERVISOR')
   WHERE id = (SELECT id FROM core.marcaciones WHERE empleado_id = p_empleado_id AND fecha = private.hoy() AND tipo = 'ENTRADA'
               ORDER BY ts_servidor DESC LIMIT 1);
  IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró registro de entrada para hoy' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('ok', true, 'autorizado', CASE WHEN p_autorizado THEN 'SI' ELSE 'NO' END);
END $$;

-- ───────────── Emergencias (R-19) ─────────────
CREATE OR REPLACE FUNCTION api.reportar_estado_emergencia(p_estado text, p_comentario text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  e core.empleados := private.empleado_actual();
  msg text;
BEGIN
  IF p_estado NOT IN ('A salvo', 'Requiere ayuda') THEN RAISE EXCEPTION 'Estado no válido' USING ERRCODE = '22023'; END IF;
  msg := CASE WHEN nullif(trim(p_comentario), '') IS NOT NULL THEN p_estado || ' - ' || trim(p_comentario) ELSE p_estado END;
  UPDATE core.marcaciones SET estado_emergencia = msg, estado_emergencia_ts = now()
   WHERE id = (SELECT id FROM core.marcaciones WHERE empleado_id = e.id AND fecha = private.hoy() AND tipo = 'ENTRADA'
               ORDER BY ts_servidor LIMIT 1);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Debes haber registrado tu ENTRADA de hoy para poder reportar tu estado de emergencia' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION api.cambiar_emergencia(p_activa boolean, p_nombre text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT private.es_supervisor() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF p_activa THEN
    IF nullif(trim(p_nombre), '') IS NULL THEN
      RAISE EXCEPTION 'Por favor, ingresa el nombre de la emergencia o simulacro' USING ERRCODE = '22023';
    END IF;
    UPDATE core.emergencias SET activa = false, fin = now() WHERE activa;
    INSERT INTO core.emergencias (nombre, activa, habilitado_por) VALUES (trim(p_nombre), true, private.jwt_empleado_id());
  ELSE
    UPDATE core.emergencias SET activa = false, fin = now() WHERE activa;
  END IF;
  RETURN jsonb_build_object('ok', true, 'activa', p_activa);
END $$;

-- ───────────── Cultura Tcontrol (quiz del almuerzo) ─────────────
-- Misma selección determinística por fecha que obtenerPreguntaCulturaDelDia(); sin revelar la respuesta.
CREATE OR REPLACE FUNCTION private.cultura_del_dia() RETURNS core.cultura_preguntas
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  hoy date := private.hoy();
  semilla bigint := ((extract(year FROM hoy)::bigint * 10000 + extract(month FROM hoy) * 100 + extract(day FROM hoy)) * 9301 + 49297) % 233280;
  total int;
  p core.cultura_preguntas;
BEGIN
  SELECT count(*) INTO total FROM core.cultura_preguntas WHERE activo;
  IF total = 0 THEN
    SELECT count(*) INTO total FROM core.cultura_preguntas;
    SELECT * INTO p FROM core.cultura_preguntas ORDER BY orden, id OFFSET floor(semilla::numeric / 233280 * total) LIMIT 1;
  ELSE
    SELECT * INTO p FROM core.cultura_preguntas WHERE activo ORDER BY orden, id OFFSET floor(semilla::numeric / 233280 * total) LIMIT 1;
  END IF;
  RETURN p;
END $$;

CREATE OR REPLACE FUNCTION api.cultura_pregunta_del_dia()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE e core.empleados := private.empleado_actual(); p core.cultura_preguntas;
BEGIN
  IF NOT coalesce((private.cfg('cultura') ->> 'habilitado')::boolean, true) OR NOT e.cultura_habilitada THEN
    RETURN jsonb_build_object('habilitada', false);
  END IF;
  p := private.cultura_del_dia();
  IF p.id IS NULL THEN RETURN jsonb_build_object('habilitada', false); END IF;
  RETURN jsonb_build_object('habilitada', true, 'id', p.id, 'pilar', p.pilar, 'clase_pilar', p.clase_pilar,
    'icono_pilar', p.icono_pilar, 'pregunta', p.pregunta,
    'opciones', (SELECT jsonb_agg(jsonb_build_object('letra', o ->> 'letra', 'texto', o ->> 'texto') ORDER BY i)
                 FROM jsonb_array_elements(p.opciones) WITH ORDINALITY AS t(o, i)));
END $$;

CREATE OR REPLACE FUNCTION api.responder_cultura(p_indice int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE e core.empleados := private.empleado_actual(); p core.cultura_preguntas := private.cultura_del_dia();
BEGIN
  RETURN jsonb_build_object('correcta', coalesce((p.opciones -> p_indice ->> 'correcta')::boolean, false),
                            'pista', coalesce(p.pista, 'Revisa con atención los principios de Tcontrol e inténtalo de nuevo.'));
END $$;

-- ───────────── Cerrar sesión: desvincula este dispositivo (cerrarSesion → desvincularDispositivo) ─────────────
CREATE OR REPLACE FUNCTION api.cerrar_sesion()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE d text := private.claims() ->> 'dispositivo'; u text := private.claims() ->> 'usuario';
BEGIN
  IF d IS NOT NULL THEN
    UPDATE core.dispositivos SET activo = false WHERE token = d AND empleado_id = u;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ───────────── Vistas que devuelven la foto: usar la URL pública ─────────────
CREATE OR REPLACE VIEW api.empleados WITH (security_invoker = true) AS
  SELECT e.id, e.cedula, e.nombre, e.area, e.cargo, e.rol, e.activo, e.es_pasante, e.tipo_asistencia,
         e.puede_autorizar_extras, e.auth_extras, e.telefono, e.fecha_nacimiento, e.fecha_ingreso,
         e.base_lat, e.base_lng, e.base_radio_m, e.url_rol_pagos,
         private.url_foto(e.id, e.foto_legado, (SELECT f.actualizado_en FROM core.fotos f WHERE f.empleado_id = e.id)) AS foto_url,
         e.cultura_habilitada
  FROM core.empleados e;

CREATE OR REPLACE FUNCTION api.vista_previa_empleado(p_id text)
RETURNS TABLE (id text, nombre text, area text, cargo text, foto_url text, tiene_password boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT e.id, e.nombre, e.area, e.cargo,
         private.url_foto(e.id, e.foto_legado, (SELECT f.actualizado_en FROM core.fotos f WHERE f.empleado_id = e.id)),
         coalesce(c.password_hash IS NOT NULL, false)
  FROM core.empleados e
  LEFT JOIN private.credenciales c ON c.usuario = e.id
  WHERE e.id = trim(p_id) AND e.activo
$$;

GRANT SELECT ON core.fotos TO empleado;
DROP POLICY IF EXISTS leer_propio_o_supervisor ON core.fotos;
CREATE POLICY leer_propio_o_supervisor ON core.fotos FOR SELECT USING (private.es_supervisor() OR private.es_propio(empleado_id));

GRANT EXECUTE ON FUNCTION api.foto(text, text) TO anon, empleado, guardia;
GRANT EXECUTE ON FUNCTION api.mi_contexto(), api.mis_registros(date), api.mis_dias_faltantes(),
  api.marcar(text, float8, float8, text, text, timestamptz, text, text, text, text, text, text, jsonb),
  api.reportar_estado_hoy(text, text), api.justificar_faltas(date[], text), api.cambiar_almuerzo(text),
  api.crear_solicitud_invitado(text, text, date, int, text, text, text, text), api.cancelar_solicitud_invitado(text),
  api.guardar_perfil(text, text, date, text), api.subir_foto(text), api.personal_taller(), api.autorizar_extras(text, boolean),
  api.reportar_estado_emergencia(text, text), api.cultura_pregunta_del_dia(), api.responder_cultura(int)
  TO empleado;
GRANT EXECUTE ON FUNCTION api.cambiar_emergencia(boolean, text) TO supervisor;
GRANT EXECUTE ON FUNCTION api.cerrar_sesion() TO empleado, guardia;
GRANT EXECUTE ON FUNCTION private.url_foto(text, text, timestamptz) TO anon, empleado, guardia;
