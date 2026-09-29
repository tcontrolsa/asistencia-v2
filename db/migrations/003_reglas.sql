-- 003 — Reglas de negocio en SQL (un solo lugar; el frontend no las repite)
-- Referencia: 04_REGLAS_Y_DECISIONES.md (R-xx, D-xx). Todas las horas en America/Guayaquil.

-- ───────────── Valores iniciales de configuración ─────────────
INSERT INTO core.horarios (tipo_dia, entrada, salida, tolerancia_min, limite_justificacion, umbral_extra_min) VALUES
  ('LABORABLE', '07:30', '16:15', 5, '07:45', 45),   -- D-01, R-07
  ('SABADO',    '07:00', '15:15', 5, '07:15', 45),   -- D-02; límite de justificación: supuesto (P-06)
  ('DOMINGO',   '07:00', '15:15', 5, '07:15', 45),
  ('FERIADO',   '07:00', '15:15', 5, '07:15', 45)
ON CONFLICT (tipo_dia) DO NOTHING;

INSERT INTO core.configuracion (clave, valor) VALUES
  ('sistema', jsonb_build_object(
     'ubicacion', jsonb_build_object('lat', -0.12910, 'lng', -78.47815, 'radio', 250),   -- D-21
     'horarios',  jsonb_build_object('hora_almuerzo', '09:30', 'almuerzo_activo', true),  -- R-14
     'registro',  jsonb_build_object('tolerancia_gps', 50, 'permite_registro_manual', true),
     'otras',     jsonb_build_object('whatsapp_number', '', 'mensaje_soporte', '', 'modo_mantenimiento', false),
     'forzar_actualizacion', 0)),
  ('invitados', jsonb_build_object('corte_almuerzo_extra', '09:40', 'corte_sanduche', '08:40')),  -- R-15
  ('periodo',   jsonb_build_object('dia_corte', 25)),                                          -- R-16 / D-03
  ('bolsa',     jsonb_build_object('minutos_periodo', 240, 'umbral_regularizar', 60)),         -- R-09 / R-10
  ('vacaciones', jsonb_build_object('tomadas_desde', null)),                                   -- D-04 / P-03
  ('cultura',   jsonb_build_object('habilitado', false)),
  ('whatsapp',  jsonb_build_object('activo', false, 'auto_envio_no_registro', false,
                                   'hora_corte_no_registro', '08:15', 'dias_envio', jsonb_build_array(1,2,3,4,5)))  -- R-23
ON CONFLICT (clave) DO NOTHING;

-- Feriados 2026 provisionales: lista de supervisor_core.js → esFeriadoODomingo (P-01 pendiente)
INSERT INTO core.feriados (fecha, nombre, ambito) VALUES
  ('2026-01-01','Año Nuevo','PROVISIONAL'), ('2026-02-16','Carnaval','PROVISIONAL'),
  ('2026-02-17','Carnaval','PROVISIONAL'), ('2026-04-03','Viernes Santo','PROVISIONAL'),
  ('2026-04-30','Feriado decretado','PROVISIONAL'), ('2026-05-01','Día del Trabajo','PROVISIONAL'),
  ('2026-05-25','Batalla del Pichincha','PROVISIONAL'), ('2026-06-26','Feriado imprevisto','PROVISIONAL'),
  ('2026-08-10','Primer Grito de Independencia','PROVISIONAL'), ('2026-10-09','Independencia de Guayaquil','PROVISIONAL'),
  ('2026-11-02','Día de los Difuntos','PROVISIONAL'), ('2026-11-03','Independencia de Cuenca','PROVISIONAL'),
  ('2026-12-06','Fundación de Quito','PROVISIONAL'), ('2026-12-25','Navidad','PROVISIONAL')
ON CONFLICT (fecha) DO NOTHING;

-- ───────────── Tiempo ─────────────
-- Prohibido derivar "hoy" en UTC (§3): todo pasa por estas funciones.
CREATE OR REPLACE FUNCTION private.ahora_local() RETURNS timestamp
LANGUAGE sql STABLE AS $$ SELECT now() AT TIME ZONE 'America/Guayaquil' $$;

CREATE OR REPLACE FUNCTION private.hoy() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'America/Guayaquil')::date $$;

-- Minuto del día ignorando segundos, igual que obtenerMinutos() del legado.
CREATE OR REPLACE FUNCTION private.minutos(t time) RETURNS int
LANGUAGE sql IMMUTABLE AS $$ SELECT (extract(hour FROM t) * 60 + extract(minute FROM t))::int $$;

CREATE OR REPLACE FUNCTION private.cfg(p_clave text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT valor FROM core.configuracion WHERE clave = p_clave
$$;

CREATE OR REPLACE FUNCTION private.tipo_dia(p_fecha date) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM core.feriados f WHERE f.fecha = p_fecha) THEN 'FERIADO'
    WHEN extract(isodow FROM p_fecha) = 6 THEN 'SABADO'
    WHEN extract(isodow FROM p_fecha) = 7 THEN 'DOMINGO'
    ELSE 'LABORABLE' END
$$;

CREATE OR REPLACE FUNCTION private.horario(p_fecha date) RETURNS core.horarios
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT h FROM core.horarios h WHERE h.tipo_dia = private.tipo_dia(p_fecha)
$$;

-- R-16 / D-03: período del 26 del mes anterior al 25 del mes.
CREATE OR REPLACE FUNCTION private.periodo(p_fecha date, OUT inicio date, OUT fin date)
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN extract(day FROM p_fecha) >= 26
              THEN make_date(extract(year FROM p_fecha)::int, extract(month FROM p_fecha)::int, 26)
              ELSE (date_trunc('month', p_fecha) - interval '1 month')::date + 25 END,
         CASE WHEN extract(day FROM p_fecha) >= 26
              THEN (date_trunc('month', p_fecha) + interval '1 month')::date + 24
              ELSE date_trunc('month', p_fecha)::date + 24 END
$$;

-- ───────────── Geocerca (R-01, R-02, D-07, D-21) ─────────────
CREATE OR REPLACE FUNCTION private.distancia_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
RETURNS float8 LANGUAGE sql IMMUTABLE AS $$
  SELECT 2 * 6371000 * asin(sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2) +
           cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

CREATE OR REPLACE FUNCTION private.validar_geocerca(
  p_lat float8, p_lng float8, p_modo text, p_base_lat float8, p_base_lng float8, p_base_radio int,
  OUT dentro boolean, OUT distancia_m int, OUT radio_m int, OUT mensaje text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u jsonb := private.cfg('sistema') -> 'ubicacion';
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL THEN
    dentro := false; mensaje := 'Obteniendo ubicación...'; RETURN;
  END IF;
  IF p_modo = 'CAMPO' THEN
    IF p_base_lat IS NULL OR p_base_lng IS NULL THEN
      dentro := false; mensaje := '❌ Debes registrar la ubicación del proyecto primero'; RETURN;
    END IF;
    radio_m := coalesce(p_base_radio, 300);
    distancia_m := round(private.distancia_m(p_lat, p_lng, p_base_lat, p_base_lng));
    dentro := distancia_m <= radio_m;
    mensaje := CASE WHEN dentro THEN NULL ELSE format('❌ Fuera del área del proyecto (%sm)', distancia_m) END;
  ELSE
    radio_m := (u ->> 'radio')::int;
    distancia_m := round(private.distancia_m(p_lat, p_lng, (u ->> 'lat')::float8, (u ->> 'lng')::float8));
    dentro := distancia_m <= radio_m;
    mensaje := CASE WHEN dentro THEN NULL ELSE format('❌ Fuera del área de la empresa (%sm)', distancia_m) END;
  END IF;
END $$;

-- ───────────── Entrada (R-04, R-05, R-06, D-01) ─────────────
-- Atraso: si entra después de referencia + tolerancia, se cuenta desde la referencia.
CREATE OR REPLACE FUNCTION private.minutos_atraso(p_fecha date, p_hora time, p_es_pasante boolean,
                                                  p_tipo_asistencia core.tipo_asistencia DEFAULT 'NORMAL')
RETURNS int LANGUAGE plpgsql STABLE AS $$
DECLARE h core.horarios := private.horario(p_fecha); d int;
BEGIN
  IF p_hora IS NULL OR p_es_pasante OR p_tipo_asistencia <> 'NORMAL' THEN RETURN 0; END IF;
  d := private.minutos(p_hora) - private.minutos(h.entrada);
  RETURN CASE WHEN d > h.tolerancia_min THEN d ELSE 0 END;
END $$;

-- La app pide motivo y quién justifica si la entrada es posterior al límite (07:45).
CREATE OR REPLACE FUNCTION private.requiere_motivo_entrada(p_fecha date, p_hora time)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT private.minutos(p_hora) > private.minutos((private.horario(p_fecha)).limite_justificacion)
$$;

-- ───────────── Salida (R-07, R-12, D-02) ─────────────
CREATE OR REPLACE FUNCTION private.es_salida_anticipada(p_fecha date, p_hora time)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT private.minutos(p_hora) < private.minutos((private.horario(p_fecha)).salida)
$$;

-- Horas extra automáticas al guardar (guardarRegistro): modo CAMPO siempre;
-- SALIDA más de 45 min después de la salida del tipo de día.
CREATE OR REPLACE FUNCTION private.horas_extra_auto(p_tipo text, p_fecha date, p_hora time, p_modo text,
                                                    OUT horas_extra boolean, OUT autoriza text)
LANGUAGE plpgsql STABLE AS $$
DECLARE h core.horarios := private.horario(p_fecha);
BEGIN
  horas_extra := false; autoriza := NULL;
  IF p_modo = 'CAMPO' THEN horas_extra := true; autoriza := 'SISTEMA (CAMPO)'; END IF;
  IF p_tipo = 'SALIDA' AND private.minutos(p_hora) - private.minutos(h.salida) > h.umbral_extra_min THEN
    horas_extra := true; autoriza := coalesce(autoriza, 'SISTEMA (>45 MIN)');
  END IF;
END $$;

-- ───────────── Almuerzo (R-14) ─────────────
-- Se puede elegir almuerzo en planta hasta la hora límite inclusive (09:30).
CREATE OR REPLACE FUNCTION private.almuerzo_abierto(p_hora time)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN coalesce((private.cfg('sistema') #>> '{horarios,almuerzo_activo}')::boolean, true)
              THEN private.minutos(p_hora) <= private.minutos((private.cfg('sistema') #>> '{horarios,hora_almuerzo}')::time)
              ELSE true END
$$;

-- Si la SALIDA ocurre antes de la hora límite, el almuerzo del registro es NO.
CREATE OR REPLACE FUNCTION private.almuerzo_en_salida(p_hora time, p_almuerzo boolean)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN private.minutos(p_hora) < private.minutos((private.cfg('sistema') #>> '{horarios,hora_almuerzo}')::time)
              THEN false ELSE p_almuerzo END
$$;

-- ───────────── Invitados (R-15) ─────────────
-- Devuelve el mensaje de error del legado o NULL si la solicitud es válida.
CREATE OR REPLACE FUNCTION private.validar_solicitud_invitado(p_subtipo text, p_fecha date, p_area text,
                                                              p_cargo text, p_ahora timestamp DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE
  ahora timestamp := coalesce(p_ahora, private.ahora_local());
  c jsonb := private.cfg('invitados');
  m int := private.minutos(ahora::time);
BEGIN
  IF p_fecha < ahora::date THEN
    RETURN 'No es posible registrar solicitudes para fechas pasadas.';
  END IF;
  IF p_fecha = ahora::date THEN
    IF p_subtipo = 'ALMUERZO_EXTRA' AND m > private.minutos((c ->> 'corte_almuerzo_extra')::time) THEN
      RETURN 'Las solicitudes de Almuerzo Extra para hoy cerraron a las 09:40. Puede programar su solicitud anticipada seleccionando una fecha futura.';
    ELSIF p_subtipo = 'REFRIGERIO_SANDUCHE' AND m > private.minutos((c ->> 'corte_sanduche')::time) THEN
      RETURN 'Las solicitudes de sánduches para el mismo día cerraron a las 08:40. Para hoy puede solicitar Break con galletas de TCONTROL, o seleccionar una fecha futura para sánduches.';
    END IF;
  END IF;
  IF upper(translate(coalesce(p_area, '') || ' ' || coalesce(p_cargo, ''), 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) LIKE '%TALLER%' THEN
    RETURN 'Esta opción no está disponible para personal del área de Taller.';
  END IF;
  RETURN NULL;
END $$;

-- ───────────── Clasificación de empleados a partir del texto legado ─────────────
CREATE OR REPLACE FUNCTION private.texto_es_pasante(p_cargo text, p_area text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(coalesce(p_cargo,'') || ' ' || coalesce(p_area,'')) ~ '(PASANTE|PASANTIA|PASANTÍA)'
$$;

CREATE OR REPLACE FUNCTION private.texto_tipo_asistencia(p_cargo text, p_area text)
RETURNS core.tipo_asistencia LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN upper(coalesce(p_cargo,'')) LIKE '%SIN ASISTENCIA%' THEN 'SIN_ASISTENCIA'::core.tipo_asistencia
    WHEN upper(coalesce(p_cargo,'') || ' ' || coalesce(p_area,'')) ~ '(SOLO[ _]ALMUERZO|COMENSAL)' THEN 'SOLO_ALMUERZO'
    ELSE 'NORMAL' END
$$;

-- actualizarInterfazSegunCargo: (producción o taller) y (coordinador/jefe/supervisor), o asistente de producción
CREATE OR REPLACE FUNCTION private.texto_puede_autorizar_extras(p_cargo text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT (upper(coalesce(p_cargo,'')) ~ '(PRODUCCI[OÓ]N|TALLER)' AND upper(coalesce(p_cargo,'')) ~ '(COORDINADOR|JEFE|SUPERVISOR)')
      OR (upper(coalesce(p_cargo,'')) LIKE '%ASISTENTE%' AND upper(coalesce(p_cargo,'')) ~ 'PRODUCCI[OÓ]N')
$$;

-- ───────────── Vacaciones (D-04, hoja CALCULAR_vacaciones) ─────────────
-- Años completos entre el ingreso y el 31/12 del año (DATEDIF(..., "y")).
CREATE OR REPLACE FUNCTION private.anios_servicio(p_ingreso date, p_anio int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_ingreso IS NULL THEN NULL
              ELSE extract(year FROM age(make_date(p_anio, 12, 31), p_ingreso))::int END
$$;

CREATE OR REPLACE FUNCTION private.vacaciones_adjudicadas(p_ingreso date, p_anio int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN y IS NULL THEN NULL
    WHEN y < 1  THEN 0
    WHEN y <= 5 THEN 11
    WHEN y = 6  THEN 12
    WHEN y = 7  THEN 13
    WHEN y = 8  THEN 14
    WHEN y = 9  THEN 15
    WHEN y <= 12 THEN 16      -- salto 10–12 tal como la hoja (P-04)
    WHEN y = 13 THEN 17
    WHEN y = 14 THEN 18
    WHEN y = 15 THEN 19
    WHEN y = 16 THEN 20
    WHEN y <= 19 THEN 21      -- salto 17–19 tal como la hoja (P-04)
    ELSE 22 END
  FROM (SELECT private.anios_servicio(p_ingreso, p_anio) AS y) s
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO anon, empleado, guardia;
