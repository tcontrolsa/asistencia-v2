-- 018 — Fase 6: automatizaciones e integraciones.
-- La imagen de PostgreSQL no trae pg_cron: el worker (worker/) llama cada minuto a private.worker_tareas(), que decide
-- qué tarea toca según la hora oficial y deja constancia en core.tareas_ejecuciones (una vez por día y tarea).
-- El worker se conecta con su propio rol (tcontrol_worker) que solo puede ejecutar las funciones private.worker_*.
--   · reset_autorizaciones  (resetearAutorizacionesDiarias)          00:05
--   · autocompletar_salidas (autoCompletarSalidasFaltantesSheets)    00:30
--   · aviso_no_registro     (ejecutarChequeoAutomatico de OpenWA)    hora de corte del panel, días configurados
-- Los avisos que hoy se encolan como eventos (SOLICITUD_INVITADO, REPORTE_FUERA_AREA, …) se convierten aquí en
-- mensajes WHATSAPP_MENSAJE con los textos del legado (openwa_service.js) y su fila en core.whatsapp_logs.

-- ───────────── Rol del worker ─────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tcontrol_worker') THEN
    CREATE ROLE tcontrol_worker LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER;
  END IF;
END $$;
ALTER ROLE tcontrol_worker SET timezone TO 'America/Guayaquil';
GRANT USAGE ON SCHEMA private TO tcontrol_worker;

-- ───────────── Cola ─────────────
ALTER TABLE core.cola_notificaciones DROP CONSTRAINT IF EXISTS cola_notificaciones_estado_check;
ALTER TABLE core.cola_notificaciones ADD CONSTRAINT cola_notificaciones_estado_check
  CHECK (estado IN ('PENDIENTE','PROCESANDO','ENVIADO','ERROR','DESCARTADO'));
ALTER TABLE core.cola_notificaciones ADD COLUMN IF NOT EXISTS disponible_en timestamptz NOT NULL DEFAULT now();  -- reintentos
ALTER TABLE core.cola_notificaciones ADD COLUMN IF NOT EXISTS tomado_en timestamptz;
ALTER TABLE core.cola_notificaciones ADD COLUMN IF NOT EXISTS resultado jsonb;                          -- p. ej. URL de Sheets
ALTER TABLE core.cola_notificaciones ADD COLUMN IF NOT EXISTS padre_id bigint REFERENCES core.cola_notificaciones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS cola_pendientes_idx ON core.cola_notificaciones (disponible_en, id) WHERE estado = 'PENDIENTE';

-- ───────────── Ejecuciones de tareas programadas ─────────────
CREATE TABLE IF NOT EXISTS core.tareas_ejecuciones (
  tarea     text NOT NULL,
  fecha     date NOT NULL,              -- día (America/Guayaquil) al que corresponde la ejecución
  inicio    timestamptz NOT NULL DEFAULT now(),
  fin       timestamptz,
  resultado jsonb,
  error     text,
  PRIMARY KEY (tarea, fecha)
);
ALTER TABLE core.tareas_ejecuciones ENABLE ROW LEVEL SECURITY;

INSERT INTO core.configuracion (clave, valor) VALUES
  ('tareas', jsonb_build_object('reset_autorizaciones', '00:05', 'autocompletar_salidas', '00:30')),
  -- Enlaces del mensaje de bienvenida (notificarNuevoEmpleadoRegistrado)
  ('enlaces', jsonb_build_object('app', 'https://asistencia.tcontrolsa.com/index.html',
                                 'supervisor', 'https://asistencia.tcontrolsa.com/supervisor.html'))
ON CONFLICT (clave) DO NOTHING;

-- ───────────── Utilidades de texto ─────────────
CREATE OR REPLACE FUNCTION private.cap(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN coalesce(p, '') = '' THEN '' ELSE upper(left(p, 1)) || lower(substr(p, 2)) END
$$;

-- obtenerPrimerNombreYPrimerApellido: "APELLIDO APELLIDO NOMBRE NOMBRE" → "Nombre Apellido"
CREATE OR REPLACE FUNCTION private.nombre_corto(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE coalesce(array_length(w, 1), 0)
    WHEN 0 THEN 'Colaborador'
    WHEN 1 THEN private.cap(w[1])
    WHEN 2 THEN private.cap(w[2]) || ' ' || private.cap(w[1])
    ELSE private.cap(w[3]) || ' ' || private.cap(w[1]) END
  FROM (SELECT regexp_split_to_array(nullif(trim(coalesce(p, '')), ''), '\s+') AS w) x
$$;

-- Plantilla "no_registro" (DEFAULT_CONFIG_WHATSAPP.plantillaNoRegistro) cuando no se personalizó en el panel
CREATE OR REPLACE FUNCTION private.plantilla_wa(p_clave text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(
    (SELECT nullif(texto, '') FROM core.whatsapp_plantillas WHERE clave = p_clave AND activa),
    CASE p_clave WHEN 'no_registro' THEN
      E'🔔 *NOTIFICACIÓN DE ASISTENCIA — TCONTROL*\n\nEstimado/a *{nombre}*,\n\nTe informamos que al momento (*{hora}* del {fecha}) no registras marcación de ingreso en el sistema de Asistencia Tcontrol.\n\n⚠️ *Por favor:* Si ya te encuentras en tu jornada laboral, recuerda registrar tu asistencia en la aplicación móvil o comunicarte con tu supervisor / RRHH para justificar la novedad.\n\n📱 *App de Asistencia:* {link}\n_Este es un mensaje automático de control y seguimiento._\n🔒 _Aviso Legal: Mensaje emitido por TCONTROL S.A. en cumplimiento de la LOPDP exclusivamente para fines de control laboral._'
    END)
$$;

-- formatearMensaje: {nombre} {fecha} {hora} {link} {cargo} {area} {razon}
CREATE OR REPLACE FUNCTION private.formatear_wa(p_texto text, e core.empleados, p_ahora timestamp) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(p_texto,
    '\{nombre\}', replace(private.nombre_corto(e.nombre), '\', '\\'), 'gi'),
    '\{fecha\}', to_char(p_ahora, 'DD/MM/YYYY'), 'gi'),
    '\{hora\}', to_char(p_ahora, 'HH24:MI'), 'gi'),
    '\{link\}', replace(coalesce(private.whatsapp_config() ->> 'enlaceApp', 'https://tcontrol.ec/asistencia'), '\', '\\'), 'gi'),
    '\{cargo\}', replace(coalesce(nullif(e.cargo, ''), 'Personal'), '\', '\\'), 'gi'),
    '\{area\}', replace(coalesce(nullif(e.area, ''), 'Operaciones'), '\', '\\'), 'gi'),
    '\{razon\}', 'autorizado', 'gi')
$$;

-- Mensaje encolado + fila de auditoría (EN_COLA). Sin número válido: solo la auditoría SIN_TELEFONO.
CREATE OR REPLACE FUNCTION private.encolar_wa(p_empleado_id text, p_nombre text, p_telefono text, p_mensaje text,
  p_tipo text, p_origen text, p_plantilla text DEFAULT NULL, p_padre bigint DEFAULT NULL, p_creado timestamptz DEFAULT now())
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE tel text := private.normalizar_telefono(p_telefono); cid bigint;
BEGIN
  IF length(coalesce(tel, '')) < 9 THEN
    INSERT INTO core.whatsapp_logs (empleado_id, nombre_empleado, telefono, tipo_notificacion, estado, detalle_respuesta, enviado_por, mensaje, origen)
    VALUES (p_empleado_id, p_nombre, 'SIN_NUMERO', p_tipo, 'SIN_TELEFONO', 'Sin número de WhatsApp registrado', 'Sistema', p_mensaje, p_origen);
    RETURN false;
  END IF;
  INSERT INTO core.cola_notificaciones (tipo, payload, padre_id, creado_en)
  VALUES ('WHATSAPP_MENSAJE', jsonb_build_object('telefono', tel, 'mensaje', p_mensaje, 'plantilla', p_plantilla,
                                                 'empleadoId', p_empleado_id, 'nombre', p_nombre, 'tipo', p_tipo), p_padre, p_creado)
  RETURNING id INTO cid;
  INSERT INTO core.whatsapp_logs (empleado_id, nombre_empleado, telefono, tipo_notificacion, estado, detalle_respuesta, enviado_por, mensaje, origen, cola_id)
  VALUES (p_empleado_id, p_nombre, tel, p_tipo, 'EN_COLA', 'Pendiente de envío', 'Sistema', p_mensaje, p_origen, cid);
  RETURN true;
END $$;

-- ───────────── Tareas ─────────────
-- resetearAutorizacionesDiarias: AUTH_EXTRAS de la ficha vuelve a NO. (La autorización del día vive en la ENTRADA
-- de hoy —api.autorizar_extras— y por eso ya es diaria; esto mantiene la ficha igual que el legado.)
CREATE OR REPLACE FUNCTION private.resetear_autorizaciones_extras() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE n int;
BEGIN
  UPDATE core.empleados SET auth_extras = false WHERE auth_extras;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('reseteados', n);
END $$;

-- autoCompletarSalidasFaltantesSheets (R-21, D-02).
-- Paso 1 (regularizarSalidasFinDeSemana): salidas automáticas de sábado/domingo con hora distinta a la del horario
--   pasan a esa hora y pierden la marca de horas extra puesta por el sistema (también en la ENTRADA del día).
-- Paso 2: últimos 7 días sin hoy; colaboradores activos que no son "SIN ASISTENCIA" con ENTRADA/RETORNO_CAMPO y sin
--   SALIDA/SALIDA_CAMPO → SALIDA a la hora de salida del tipo de día (16:15 L-V; 15:15 sábado, domingo y feriado).
CREATE OR REPLACE FUNCTION private.autocompletar_salidas(p_hoy date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE regularizadas int; insertadas int;
BEGIN
  WITH corr AS (
    UPDATE core.marcaciones m
       SET hora = h.salida, ts_servidor = (m.fecha + h.salida) AT TIME ZONE 'America/Guayaquil',
           horas_extra = CASE WHEN upper(coalesce(m.autoriza, '')) ~ 'SISTEMA|>45 MIN' THEN false ELSE m.horas_extra END,
           autoriza = CASE WHEN upper(coalesce(m.autoriza, '')) ~ 'SISTEMA|>45 MIN' THEN NULL ELSE m.autoriza END
      FROM core.horarios h
     WHERE h.tipo_dia = CASE extract(isodow FROM m.fecha) WHEN 6 THEN 'SABADO' ELSE 'DOMINGO' END
       AND extract(isodow FROM m.fecha) IN (6, 7)
       AND m.tipo IN ('SALIDA', 'SALIDA_CAMPO')
       AND to_char(m.hora, 'HH24:MI') <> to_char(h.salida, 'HH24:MI')   -- extraerMinutosDelDia ≠ 915
       AND (m.dispositivo = 'AUTO_COMPLETAR' OR upper(coalesce(m.quien_justifica, '')) = 'SISTEMA'
            OR lower(coalesce(m.motivo_salida, '') || ' ' || coalesce(m.razon_justificacion, '')) ~ 'no registr(o|ó) salida')
    RETURNING m.empleado_id, m.fecha)
  , ent AS (
    UPDATE core.marcaciones m SET horas_extra = false, autoriza = NULL
      FROM (SELECT DISTINCT empleado_id, fecha FROM corr) c
     WHERE m.empleado_id = c.empleado_id AND m.fecha = c.fecha AND m.tipo IN ('ENTRADA', 'RETORNO_CAMPO')
       AND upper(coalesce(m.autoriza, '')) ~ 'SISTEMA|>45 MIN'
    RETURNING 1)
  SELECT (SELECT count(*) FROM corr) INTO regularizadas;

  INSERT INTO core.marcaciones (empleado_id, tipo, ts_servidor, fecha, hora, dispositivo, modo, almuerzo, horas_extra,
                                motivo_salida, quien_justifica, justificado, razon_justificacion, origen, creado_por)
  SELECT e.id, 'SALIDA', (d.fecha + h.salida) AT TIME ZONE 'America/Guayaquil', d.fecha, h.salida, 'AUTO_COMPLETAR', 'OFICINA',
         false, false, 'No registró salida', 'SISTEMA', 'NO', 'No registró salida', 'SISTEMA', 'SISTEMA'
    FROM core.empleados e
   CROSS JOIN LATERAL (SELECT (p_hoy - g)::date AS fecha FROM generate_series(1, 7) g) d
   CROSS JOIN LATERAL (SELECT (private.horario(d.fecha)).salida) h(salida)
   WHERE e.activo AND upper(trim(coalesce(e.cargo, ''))) <> 'SIN ASISTENCIA'
     AND EXISTS (SELECT 1 FROM core.marcaciones x WHERE x.empleado_id = e.id AND x.fecha = d.fecha AND x.tipo IN ('ENTRADA', 'RETORNO_CAMPO'))
     AND NOT EXISTS (SELECT 1 FROM core.marcaciones x WHERE x.empleado_id = e.id AND x.fecha = d.fecha AND x.tipo IN ('SALIDA', 'SALIDA_CAMPO'));
  GET DIAGNOSTICS insertadas = ROW_COUNT;
  RETURN jsonb_build_object('regularizadas', regularizadas, 'insertadas', insertadas, 'desde', p_hoy - 7, 'hasta', p_hoy - 1);
END $$;

-- ejecutarChequeoAutomatico + filtro "sin marcar" de supervisor_whatsapp.js: activos que no son solo-almuerzo,
-- sin ENTRADA hoy, sin novedad con motivo hoy, sin registros en CAMPO hoy. Mensaje con la plantilla no_registro.
CREATE OR REPLACE FUNCTION private.aviso_no_registro(p_ahora timestamp) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  hoy date := p_ahora::date;
  regs jsonb := private.registros_legado(hoy, hoy);
  plantilla text := private.plantilla_wa('no_registro');
  e core.empleados;
  total int := 0; encolados int := 0;
BEGIN
  FOR e IN
    SELECT x.* FROM core.empleados x
     WHERE x.activo
       AND upper(coalesce(x.cargo, '')) !~ 'SIN ASISTENCIA|SOLO ALMUERZO|COMENSAL'
       AND upper(coalesce(x.area, '')) !~ 'SOLO ALMUERZO|COMENSAL'
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(regs) r
                        WHERE r ->> 'empleadoId' = x.id AND (r ->> 'tipo' = 'ENTRADA' OR r ->> 'modo' = 'CAMPO'))
       -- primer registro de hoy que no es ENTRADA/SALIDA/ESTADO/SOLO_ALMUERZO: si tiene motivo, no se avisa
       AND coalesce((SELECT coalesce(nullif(r ->> 'razon_ausencia', ''), nullif(r ->> 'razon_permiso', ''), r ->> 'razon_justificac', '')
                       FROM jsonb_array_elements(regs) WITH ORDINALITY r(r, i)
                      WHERE r ->> 'empleadoId' = x.id AND r ->> 'tipo' NOT IN ('ENTRADA', 'SALIDA', 'ESTADO', 'SOLO_ALMUERZO')
                      ORDER BY i LIMIT 1), '') = ''
     ORDER BY x.nombre
  LOOP
    total := total + 1;
    IF private.encolar_wa(e.id, e.nombre, e.telefono, private.formatear_wa(plantilla, e, p_ahora), 'no_registro', 'AUTOMATICO', 'no_registro') THEN
      encolados := encolados + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('sinMarcar', total, 'encolados', encolados, 'sinTelefono', total - encolados);
END $$;

-- Reclama la tarea del día (una sola vez aunque haya varios workers) y la ejecuta registrando el resultado
CREATE OR REPLACE FUNCTION private.correr_tarea(p_tarea text, p_fecha date, p_ahora timestamp) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE r jsonb;
BEGIN
  INSERT INTO core.tareas_ejecuciones (tarea, fecha) VALUES (p_tarea, p_fecha) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN NULL; END IF;
  BEGIN
    r := CASE p_tarea
      WHEN 'reset_autorizaciones' THEN private.resetear_autorizaciones_extras()
      WHEN 'autocompletar_salidas' THEN private.autocompletar_salidas(p_fecha)
      WHEN 'aviso_no_registro' THEN private.aviso_no_registro(p_ahora) END;
    UPDATE core.tareas_ejecuciones SET fin = now(), resultado = r WHERE tarea = p_tarea AND fecha = p_fecha;
  EXCEPTION WHEN OTHERS THEN
    UPDATE core.tareas_ejecuciones SET fin = now(), error = SQLERRM WHERE tarea = p_tarea AND fecha = p_fecha;
    r := jsonb_build_object('error', SQLERRM);
  END;
  RETURN jsonb_build_object('tarea', p_tarea, 'fecha', p_fecha, 'resultado', r);
END $$;

-- Llamada del worker cada minuto: ejecuta las tareas cuya hora ya llegó y que no corrieron hoy
CREATE OR REPLACE FUNCTION private.worker_tareas(p_ahora timestamp DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  ahora timestamp := coalesce(p_ahora, private.ahora_local());
  hoy date := ahora::date;
  hhmm text := to_char(ahora, 'HH24:MI');
  cfg jsonb := coalesce(private.cfg('tareas'), '{}');
  wa jsonb := private.whatsapp_config();
  hechas jsonb := '[]';
  r jsonb;
BEGIN
  IF hhmm >= coalesce(cfg ->> 'reset_autorizaciones', '00:05') THEN
    r := private.correr_tarea('reset_autorizaciones', hoy, ahora);
    IF r IS NOT NULL THEN hechas := hechas || r; END IF;
  END IF;
  IF hhmm >= coalesce(cfg ->> 'autocompletar_salidas', '00:30') THEN
    r := private.correr_tarea('autocompletar_salidas', hoy, ahora);
    IF r IS NOT NULL THEN hechas := hechas || r; END IF;
  END IF;
  IF (wa ->> 'activo')::boolean AND (wa ->> 'autoEnvioNoRegistro')::boolean
     AND (wa -> 'diasEnvio') @> to_jsonb(extract(dow FROM ahora)::int)
     AND hhmm >= wa ->> 'horaCorteNoRegistro' THEN
    r := private.correr_tarea('aviso_no_registro', hoy, ahora);
    IF r IS NOT NULL THEN hechas := hechas || r; END IF;
  END IF;
  RETURN hechas;
END $$;

-- ───────────── Avisos por evento → mensajes (textos de openwa_service.js) ─────────────
CREATE OR REPLACE FUNCTION private.expandir_evento(c core.cola_notificaciones) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  p jsonb := c.payload;
  msg text; lbl text; extra text; n int := 0; dest record; cuenta int; resumen text;
  admins boolean := c.tipo <> 'NUEVO_EMPLEADO';
  enl jsonb := coalesce(private.cfg('enlaces'), '{}');
  rol_txt text;
BEGIN
  IF c.tipo = 'SOLICITUD_INVITADO' THEN
    lbl := CASE WHEN p ->> 'tipoSolicitud' = 'ALMUERZO_EXTRA' OR p ->> 'subtipo' = 'ALMUERZO_EXTRA' THEN '🍱 Almuerzo Extra'
                WHEN p ->> 'subtipo' = 'REFRIGERIO_GALLETAS' THEN '🍪 Break con Galletas TCONTROL' ELSE '🥪 Refrigerio (Sánduche)' END;
    msg := E'🔔 *TCONTROL - Nueva Solicitud de Catering / Invitados*\n\n'
        || E'Estimado(a) *Sup. Admin*, se ha registrado un nuevo pedido de invitados:\n\n'
        || '• *Servicio:* ' || lbl || ' (x' || coalesce(nullif(p ->> 'cantidad', ''), '1') || E')\n'
        || '• *Fecha requerida:* ' || coalesce(nullif(p ->> 'fecha', ''), to_char(c.creado_en AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD'))
        || coalesce(E'\n• *Hora para servir:* ' || nullif(p ->> 'horaServicio', ''), '') || E'\n'
        || '• *Solicitante:* ' || coalesce(nullif(p ->> 'empleadoNombre', ''), 'Colaborador') || ' (' || coalesce(nullif(p ->> 'empleadoArea', ''), 'Área') || E')\n'
        || '• *Invitado:* ' || coalesce(nullif(p ->> 'invitado', ''), 'Invitado') || ' ' || coalesce('· ' || nullif(p ->> 'empresa', ''), '')
        || coalesce(E'\n• *Detalle:* ' || nullif(p ->> 'observaciones', ''), '') || E'\n\n'
        || '👉 *Acción requerida:* Favor ingresar al panel de Supervisor (pestaña *Invitados & Catering*) para revisar y coordinar la confirmación y atención.';
  ELSIF c.tipo = 'REPORTE_FUERA_AREA' THEN
    msg := E'🔔 *TCONTROL - Novedad de Asistencia Reportada*\n\n'
        || 'El colaborador *' || coalesce(nullif(p ->> 'empleadoNombre', ''), 'Colaborador') || '* (ID: ' || coalesce(nullif(p ->> 'empleadoId', ''), '--')
        || ', Área: ' || coalesce(nullif(p ->> 'empleadoArea', ''), 'General') || E') ha reportado el siguiente estado:\n\n'
        || '• *Fecha:* ' || coalesce(nullif(p ->> 'fecha', ''), to_char(c.creado_en AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD')) || E'\n'
        || '• *Estado:* ' || coalesce(nullif(p ->> 'textoEstado', ''), nullif(p ->> 'tipo', ''), 'Ausencia Fuera de Área')
        || coalesce(E'\n• *Detalle / Motivo:* ' || nullif(p ->> 'observacion', ''), '') || E'\n'
        || E'• *Condición:* Preliminar (Fuera de geocerca)\n\n'
        || '👉 *Acción requerida:* Esta novedad requiere regularización por parte de Supervisión en el módulo de Asistencia dentro del período actual.';
  ELSIF c.tipo = 'RECORDATORIO_INVITADOS' THEN
    cuenta := jsonb_array_length(coalesce(p -> 'pedidos', '[]'));
    SELECT string_agg('• ' || CASE WHEN x ->> 'subtipo' = 'ALMUERZO_EXTRA' OR x ->> 'tipoSolicitud' = 'ALMUERZO_EXTRA' THEN '🍱' ELSE '🥪' END
                      || ' ' || coalesce(x ->> 'fecha', '') || ': ' || coalesce(x ->> 'invitado', '') || ' (x' || coalesce(x ->> 'cantidad', '')
                      || ') - Por: ' || coalesce(nullif(x ->> 'solicitante', ''), x ->> 'empleadoNombre', ''), E'\n' ORDER BY i)
      INTO resumen FROM jsonb_array_elements(coalesce(p -> 'pedidos', '[]')) WITH ORDINALITY t(x, i) WHERE i <= 5;
    msg := E'🔔 *TCONTROL - Recordatorio para Sup. Admin*\n\n'
        || 'Estimado(a) *Sup. Admin*, existen *' || cuenta || E'* solicitud(es) de refrigerios o almuerzos de invitados pendientes de revisión:\n\n'
        || coalesce(resumen, '') || E'\n' || CASE WHEN cuenta > 5 THEN '...y ' || (cuenta - 5) || E' más.\n' ELSE '' END || E'\n'
        || '👉 Favor ingresar al panel de Supervisor (pestaña *Invitados & Catering*) para confirmar los pedidos con cocina.';
  ELSIF c.tipo = 'CANCELACION_INVITADO' THEN
    lbl := CASE WHEN p ->> 'subtipo' = 'ALMUERZO_EXTRA' OR p ->> 'tipoSolicitud' = 'ALMUERZO_EXTRA' THEN '🍱 Almuerzo Extra'
                WHEN p ->> 'subtipo' = 'REFRIGERIO_SANDUCHE' THEN '🥪 Sánduche' ELSE '🍪 Break Galletas' END;
    msg := E'🗑️ *TCONTROL - Solicitud de Invitado Cancelada / Eliminada*\n\n'
        || E'Estimado(a) *Sup. Admin*, se ha retirado una solicitud de invitados en la hoja *ALMUERZOS_EXTRA*:\n\n'
        || '• *Servicio:* ' || lbl || ' (x' || coalesce(nullif(p ->> 'cantidad', ''), '1') || E')\n'
        || '• *Fecha:* ' || coalesce(nullif(p ->> 'fecha', ''), 'Hoy') || E'\n'
        || '• *Invitado:* ' || coalesce(nullif(p ->> 'invitado', ''), 'Invitado') || E'\n'
        || '• *Solicitante:* ' || coalesce(nullif(p ->> 'solicitante', ''), 'Colaborador') || E'\n'
        || '• *Eliminado por:* ' || coalesce(nullif(p ->> 'eliminadoPor', ''), 'Supervisor') || E'\n\n'
        || 'ℹ️ _El registro ha sido eliminado del sistema y de la lista de cocina._';
  ELSIF c.tipo = 'NUEVO_EMPLEADO' THEN
    -- 1. Bienvenida al colaborador (el legado pedía crear un PIN de 4 dígitos; ahora la contraseña se crea con la cédula, D-06)
    IF nullif(p ->> 'telefono', '') IS NOT NULL THEN
      msg := '👋 *¡Hola, ' || coalesce(nullif(p ->> 'nombre', ''), 'Colaborador') || E'! Bienvenido/a a TCONTROL.*\n\n'
          || E'Te informamos que has sido registrado/a en el sistema de control de asistencia.\n\n'
          || E'👤 *Tus Datos de Acceso:*\n'
          || '🆔 *ID:* ' || coalesce(p ->> 'id', '') || E'\n'
          || '🏢 *Área:* ' || coalesce(nullif(p ->> 'area', ''), 'General') || E'\n'
          || '💼 *Cargo:* ' || coalesce(nullif(p ->> 'cargo', ''), 'Personal') || E'\n\n'
          || E'🌐 *Enlace de Ingreso a la App:*\n'
          || '👉 ' || coalesce(enl ->> 'app', '') || E'\n\n'
          || E'📱 *Instrucciones para tu primer ingreso:*\n'
          || E'1. Abre el enlace arriba desde tu teléfono o computador.\n'
          || '2. Digita tu número de ID (' || coalesce(p ->> 'id', '') || E').\n'
          || E'3. El sistema te solicitará crear tu contraseña personal (ten a mano tu número de cédula).\n\n'
          || '_¡Muchos éxitos y bienvenido/a al equipo!_ ✨';
      IF private.encolar_wa(p ->> 'id', p ->> 'nombre', p ->> 'telefono', msg, 'BIENVENIDA_NUEVO_EMPLEADO', 'AUTOMATICO', NULL, c.id, c.creado_en) THEN
        n := n + 1;
      END IF;
    END IF;
    SELECT CASE e.rol::text WHEN 'SUPERVISOR' THEN '🛡️ Supervisor' WHEN 'EMPLEADO' THEN '👤 Empleado regular' ELSE '👑 Supervisor Admin' END
      INTO rol_txt FROM core.empleados e WHERE e.id = p ->> 'id';
    msg := E'🔔 *[TCONTROL] Nuevo Colaborador Registrado*\n\n'
        || E'Se ha registrado un nuevo usuario en la plataforma:\n\n'
        || '👤 *Colaborador:* ' || coalesce(nullif(p ->> 'nombre', ''), 'Colaborador') || E'\n'
        || '🆔 *ID:* ' || coalesce(p ->> 'id', '') || E'\n'
        || '🏢 *Área:* ' || coalesce(nullif(p ->> 'area', ''), 'General') || E'\n'
        || '💼 *Cargo:* ' || coalesce(nullif(p ->> 'cargo', ''), 'Personal') || E'\n'
        || '📱 *WhatsApp:* ' || coalesce(nullif(p ->> 'telefono', ''), 'No registrado') || E'\n'
        || '🛡️ *Rol:* ' || coalesce(rol_txt, '👤 Empleado regular') || E'\n'
        || '✍️ *Registrado por:* ' || coalesce(nullif(p ->> 'creado_por', ''), 'Supervisor') || E'\n'
        || '📅 *Fecha:* ' || to_char(c.creado_en AT TIME ZONE 'America/Guayaquil', 'FMDD/FMMM/YYYY, FMHH24:MI:SS') || E'\n\n'
        || '🌐 *Panel Supervisor:* ' || coalesce(enl ->> 'supervisor', '');
  ELSE
    RETURN -1;
  END IF;

  -- Destinatarios: Sup. Admin y Admin (avisos de invitados y novedades); también supervisores para un nuevo colaborador
  FOR dest IN
    SELECT e.id, e.nombre, e.telefono FROM core.empleados e
     WHERE e.activo AND nullif(e.telefono, '') IS NOT NULL AND e.id IS DISTINCT FROM p ->> 'id'
       AND e.rol::text = ANY (CASE WHEN admins THEN ARRAY['SUPERVISOR_ADMIN', 'ADMIN'] ELSE ARRAY['SUPERVISOR', 'SUPERVISOR_ADMIN', 'ADMIN'] END)
     ORDER BY e.id
  LOOP
    IF private.encolar_wa(dest.id, dest.nombre, dest.telefono, msg, c.tipo, 'AUTOMATICO', NULL, c.id, c.creado_en) THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

-- ───────────── Cola del worker ─────────────
-- Reclama hasta p_limite trabajos listos (WHATSAPP_MENSAJE y EXPORTAR_SHEETS). Antes: expande los eventos,
-- devuelve a la cola los trabajos colgados y descarta los mensajes vencidos (más de 12 h sin poder enviarse:
-- un "no registras ingreso" de ayer ya no sirve).
CREATE OR REPLACE FUNCTION private.worker_tomar(p_limite int DEFAULT 10) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE c core.cola_notificaciones; n int; tomados jsonb;
BEGIN
  FOR c IN SELECT * FROM core.cola_notificaciones
            WHERE estado = 'PENDIENTE' AND tipo NOT IN ('WHATSAPP_MENSAJE', 'EXPORTAR_SHEETS')
            ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 50
  LOOP
    n := private.expandir_evento(c);
    UPDATE core.cola_notificaciones
       SET estado = CASE WHEN n > 0 THEN 'ENVIADO' ELSE 'DESCARTADO' END, procesado_en = now(),
           resultado = jsonb_build_object('mensajes', greatest(n, 0)),
           error = CASE WHEN n = 0 THEN 'Sin destinatarios con WhatsApp' WHEN n < 0 THEN 'Tipo de aviso desconocido' END
     WHERE id = c.id;
  END LOOP;

  UPDATE core.cola_notificaciones SET estado = 'PENDIENTE', tomado_en = NULL
   WHERE estado = 'PROCESANDO' AND tomado_en < now() - interval '10 minutes';

  WITH venc AS (
    UPDATE core.cola_notificaciones SET estado = 'DESCARTADO', procesado_en = now(), error = 'Vencido: no se pudo enviar en 12 horas'
     WHERE estado = 'PENDIENTE' AND tipo = 'WHATSAPP_MENSAJE' AND creado_en < now() - interval '12 hours'
    RETURNING id)
  UPDATE core.whatsapp_logs l SET estado = 'ERROR', detalle_respuesta = 'Vencido: el servicio de WhatsApp no estuvo disponible en 12 horas', ts = now()
    FROM venc WHERE l.cola_id = venc.id;

  WITH t AS (
    SELECT id FROM core.cola_notificaciones
     WHERE estado = 'PENDIENTE' AND tipo IN ('WHATSAPP_MENSAJE', 'EXPORTAR_SHEETS') AND disponible_en <= now()
     ORDER BY id FOR UPDATE SKIP LOCKED LIMIT greatest(coalesce(p_limite, 10), 1)),
  u AS (
    UPDATE core.cola_notificaciones q SET estado = 'PROCESANDO', tomado_en = now(), intentos = q.intentos + 1
      FROM t WHERE q.id = t.id
    RETURNING q.id, q.tipo, q.payload, q.intentos)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'tipo', u.tipo, 'payload', u.payload, 'intentos', u.intentos,
           'imagen', (SELECT p.imagen FROM core.whatsapp_plantillas p WHERE p.clave = u.payload ->> 'plantilla' AND p.activa))
           ORDER BY u.id), '[]')
    INTO tomados FROM u;
  RETURN tomados;
END $$;

DROP FUNCTION IF EXISTS private.worker_resultado(bigint, boolean, text, boolean, jsonb);
-- Resultado de un trabajo. Con p_reintentar y menos de 3 intentos vuelve a la cola (2, 4 min…); si no, queda ERROR.
-- p_simulado: el worker corre en modo simulación (no llamó a OpenWA); la auditoría lo muestra como SIMULADO.
CREATE OR REPLACE FUNCTION private.worker_resultado(p_id bigint, p_ok boolean, p_detalle text,
  p_reintentar boolean DEFAULT false, p_resultado jsonb DEFAULT NULL, p_simulado boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE c core.cola_notificaciones; reintenta boolean;
BEGIN
  SELECT * INTO c FROM core.cola_notificaciones WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  reintenta := NOT p_ok AND p_reintentar AND c.intentos < 3;
  UPDATE core.cola_notificaciones
     SET estado = CASE WHEN p_ok THEN 'ENVIADO' WHEN reintenta THEN 'PENDIENTE' ELSE 'ERROR' END,
         disponible_en = CASE WHEN reintenta THEN now() + c.intentos * interval '2 minutes' ELSE disponible_en END,
         procesado_en = now(), tomado_en = NULL, error = CASE WHEN p_ok THEN NULL ELSE left(p_detalle, 1000) END,
         resultado = coalesce(p_resultado, resultado)
   WHERE id = p_id;
  UPDATE core.whatsapp_logs
     SET estado = CASE WHEN p_ok AND p_simulado THEN 'SIMULADO' WHEN p_ok THEN 'ENVIADO' WHEN reintenta THEN 'EN_COLA' ELSE 'ERROR' END,
         detalle_respuesta = CASE WHEN reintenta THEN 'Reintentando: ' ELSE '' END || left(coalesce(p_detalle, CASE WHEN p_ok THEN 'OK' END, ''), 1000),
         ts = now()
   WHERE cola_id = p_id;
END $$;

-- Estado del servicio para el panel (conectado, número emisor) y la página de diagnóstico
CREATE OR REPLACE FUNCTION private.worker_latido(p_estado jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  INSERT INTO core.configuracion (clave, valor, actualizado_en, actualizado_por)
  VALUES ('whatsapp_worker', coalesce(p_estado, '{}') || jsonb_build_object('ultimo_latido', now()), now(), 'worker')
  ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now(), actualizado_por = 'worker'
$$;

-- Lo que el worker necesita de la configuración (la URL de OpenWA del panel; la llave nunca está en la base)
CREATE OR REPLACE FUNCTION private.worker_config() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT private.whatsapp_config()
$$;

-- ───────────── Exportar a Google Sheets (crearReporteGoogleSheets) ─────────────
CREATE OR REPLACE FUNCTION api.sup_exportar_sheets(p_nombre text, p_encabezados jsonb, p_filas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE nombre text := left(regexp_replace(coalesce(nullif(trim(p_nombre), ''), 'Reporte_Personalizado'), '[/\\?*\[\]:]', '_', 'g'), 30);
        cid bigint;
BEGIN
  PERFORM private.exigir_supervisor();
  -- Nunca sobrescribir hojas del sistema (HOJAS_PROTEGIDAS)
  IF upper(trim(nombre)) = ANY (ARRAY['EMPLEADOS','REGISTROS','VACACIONES','CALCULAR_VACACIONES','DESVINCULADOS','DISPOSITIVOS',
       'ALMUERZOS_EXTRA','CONFIGURACION','LOGS_WHATSAPP','ACTUALIZAR','AUDITORIA_ALMUERZOS','BASE','CONSUMO_ALMUERZOS',
       'CULTURA_PREGUNTAS','HISTORIAL_MENU','REPORTE_MANTENIMIENTO']) THEN
    RAISE EXCEPTION 'Nombre de reporte no permitido: coincide con una hoja del sistema (%)', nombre USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_encabezados) <> 'array' OR jsonb_array_length(p_encabezados) = 0
     OR jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) = 0 THEN
    RAISE EXCEPTION 'No se proporcionaron datos suficientes para el reporte' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_filas) > 5000 THEN RAISE EXCEPTION 'El reporte supera las 5000 filas' USING ERRCODE = '22023'; END IF;
  INSERT INTO core.cola_notificaciones (tipo, payload)
  VALUES ('EXPORTAR_SHEETS', jsonb_build_object('nombre', nombre, 'encabezados', p_encabezados, 'filas', p_filas,
                                                'solicitadoPor', private.nombre_sesion()))
  RETURNING id INTO cid;
  RETURN jsonb_build_object('ok', true, 'id', cid);
END $$;

CREATE OR REPLACE FUNCTION api.sup_estado_exportacion(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE c core.cola_notificaciones;
BEGIN
  PERFORM private.exigir_supervisor();
  SELECT * INTO c FROM core.cola_notificaciones WHERE id = p_id AND tipo = 'EXPORTAR_SHEETS';
  IF NOT FOUND THEN RAISE EXCEPTION 'Exportación no encontrada' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('estado', c.estado, 'url', c.resultado ->> 'url', 'error', c.error,
    'servicioActivo', coalesce((private.cfg('whatsapp_worker') ->> 'ultimo_latido')::timestamptz > now() - interval '3 minutes', false));
END $$;

-- ───────────── Estado del sistema: + últimas tareas programadas ─────────────
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
    'worker', jsonb_build_object('ultimoLatido', w ->> 'ultimo_latido', 'modo', w ->> 'modo', 'sesionActiva', w ->> 'sesion_activa',
                                 'sheets', w ->> 'sheets', 'error', w ->> 'error',
                                 'activo', coalesce((w ->> 'ultimo_latido')::timestamptz > now() - interval '3 minutes', false)),
    'tareas', (SELECT coalesce(jsonb_agg(jsonb_build_object('tarea', t.tarea, 'fecha', to_char(t.fecha, 'YYYY-MM-DD'),
                 'inicio', to_char(t.inicio AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS'), 'resultado', t.resultado, 'error', t.error)
                 ORDER BY t.tarea), '[]')
               FROM (SELECT DISTINCT ON (tarea) * FROM core.tareas_ejecuciones ORDER BY tarea, fecha DESC) t));
END $$;

REVOKE ALL ON FUNCTION private.cap(text), private.nombre_corto(text), private.plantilla_wa(text),
  private.formatear_wa(text, core.empleados, timestamp), private.encolar_wa(text, text, text, text, text, text, text, bigint, timestamptz),
  private.resetear_autorizaciones_extras(), private.autocompletar_salidas(date), private.aviso_no_registro(timestamp),
  private.correr_tarea(text, date, timestamp), private.worker_tareas(timestamp), private.expandir_evento(core.cola_notificaciones),
  private.worker_tomar(int), private.worker_resultado(bigint, boolean, text, boolean, jsonb, boolean), private.worker_latido(jsonb),
  private.worker_config(), api.sup_exportar_sheets(text, jsonb, jsonb), api.sup_estado_exportacion(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.worker_tareas(timestamp), private.worker_tomar(int),
  private.worker_resultado(bigint, boolean, text, boolean, jsonb, boolean), private.worker_latido(jsonb), private.worker_config() TO tcontrol_worker;
GRANT EXECUTE ON FUNCTION api.sup_exportar_sheets(text, jsonb, jsonb), api.sup_estado_exportacion(bigint) TO supervisor;
