-- Fase 5 (bloque E): panel de Notificaciones WhatsApp.
-- La configuración y las plantillas viven en la base SIN la API key de OpenWA (va en una variable de entorno del
-- worker, D-12). Los envíos del panel (prueba, masivos, individuales) se encolan en core.cola_notificaciones
-- como WHATSAPP_MENSAJE con su fila en core.whatsapp_logs (estado EN_COLA); el worker de la Fase 6 los envía y
-- actualiza el log. El estado de conexión es el último latido que publica el worker.

ALTER TABLE core.whatsapp_plantillas ADD COLUMN IF NOT EXISTS imagen text;          -- data URL (JPEG ≤ 1200 px)
ALTER TABLE core.whatsapp_plantillas ADD COLUMN IF NOT EXISTS personalizada boolean NOT NULL DEFAULT false;
ALTER TABLE core.whatsapp_plantillas ADD COLUMN IF NOT EXISTS actualizado_en timestamptz;
ALTER TABLE core.whatsapp_logs ADD COLUMN IF NOT EXISTS mensaje text;
ALTER TABLE core.whatsapp_logs ADD COLUMN IF NOT EXISTS origen text;
ALTER TABLE core.whatsapp_logs ADD COLUMN IF NOT EXISTS cola_id bigint REFERENCES core.cola_notificaciones(id) ON DELETE SET NULL;

-- Configuración con los nombres del panel (servidorUrl, activo, autoEnvioNoRegistro, horaCorteNoRegistro, enlaceApp)
CREATE OR REPLACE FUNCTION private.whatsapp_config() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object(
    'servidorUrl', coalesce(c ->> 'servidor_url', ''),
    'activo', coalesce((c ->> 'activo')::boolean, false),
    'autoEnvioNoRegistro', coalesce((c ->> 'auto_envio_no_registro')::boolean, false),
    'horaCorteNoRegistro', coalesce(c ->> 'hora_corte_no_registro', '08:15'),
    'diasEnvio', coalesce(c -> 'dias_envio', '[1,2,3,4,5]'::jsonb),
    'enlaceApp', coalesce(c ->> 'enlace_app', 'https://tcontrol.ec/asistencia'))
  FROM (SELECT coalesce(private.cfg('whatsapp'), '{}'::jsonb) AS c) x
$$;

-- Plantillas (para componer mensajes) y estado del servicio de envío: cualquier supervisor
CREATE OR REPLACE FUNCTION api.sup_whatsapp_plantillas()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE w jsonb := coalesce(private.cfg('whatsapp_worker'), '{}'::jsonb);
BEGIN
  PERFORM private.exigir_supervisor();
  RETURN jsonb_build_object(
    'config', private.whatsapp_config(),
    'plantillas', (SELECT coalesce(jsonb_object_agg(p.clave, jsonb_build_object('nombre', p.nombre, 'texto', p.texto,
                     'imagen', p.imagen, 'personalizada', p.personalizada)), '{}') FROM core.whatsapp_plantillas p WHERE p.activa),
    'servicio', jsonb_build_object(
      'conectado', coalesce((w ->> 'ultimo_latido')::timestamptz > now() - interval '3 minutes', false)
                   AND coalesce((w ->> 'sesion_activa')::boolean, false),
      'ultimoLatido', w ->> 'ultimo_latido', 'numeroEmisor', w ->> 'numero_emisor', 'nombreEmisor', w ->> 'nombre_emisor',
      'error', w ->> 'error'));
END $$;

CREATE OR REPLACE FUNCTION api.sup_guardar_whatsapp_config(p_config jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE hc text := coalesce(p_config ->> 'horaCorteNoRegistro', '08:15');
BEGIN
  PERFORM private.exigir_supervisor_admin();
  IF hc !~ '^\d{2}:\d{2}$' THEN RAISE EXCEPTION 'Hora de corte no válida' USING ERRCODE = '22023'; END IF;
  IF p_config ? 'apiKey' THEN
    RAISE EXCEPTION 'La API key de OpenWA se configura en el servidor, no desde el panel' USING ERRCODE = '22023';
  END IF;
  INSERT INTO core.configuracion (clave, valor, actualizado_en, actualizado_por)
  VALUES ('whatsapp', jsonb_build_object(
            'servidor_url', trim(coalesce(p_config ->> 'servidorUrl', '')),
            'activo', coalesce((p_config ->> 'activo')::boolean, true),
            'auto_envio_no_registro', coalesce((p_config ->> 'autoEnvioNoRegistro')::boolean, false),
            'hora_corte_no_registro', hc,
            'enlace_app', trim(coalesce(p_config ->> 'enlaceApp', 'https://tcontrol.ec/asistencia'))),
          now(), private.jwt_usuario())
  ON CONFLICT (clave) DO UPDATE SET valor = core.configuracion.valor || EXCLUDED.valor, actualizado_en = now(),
                                    actualizado_por = EXCLUDED.actualizado_por;
  RETURN jsonb_build_object('ok', true, 'config', private.whatsapp_config());
END $$;

CREATE OR REPLACE FUNCTION api.sup_guardar_plantilla_wa(p_clave text, p_nombre text, p_texto text, p_imagen text DEFAULT NULL,
                                                        p_quitar_imagen boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM private.exigir_supervisor_admin();
  IF nullif(trim(p_clave), '') IS NULL OR p_clave !~ '^[a-z_0-9]+$' THEN RAISE EXCEPTION 'Plantilla no válida' USING ERRCODE = '22023'; END IF;
  IF p_imagen IS NOT NULL AND (p_imagen !~ '^data:image/(jpeg|png|webp|gif);base64,' OR length(p_imagen) > 3000000) THEN
    RAISE EXCEPTION 'Imagen no válida o demasiado grande' USING ERRCODE = '22023';
  END IF;
  INSERT INTO core.whatsapp_plantillas (clave, nombre, texto, imagen, personalizada, activa, actualizado_en)
  VALUES (p_clave, coalesce(nullif(trim(p_nombre), ''), p_clave), coalesce(p_texto, ''), p_imagen, p_clave LIKE 'custom\_%', true, now())
  ON CONFLICT (clave) DO UPDATE SET nombre = coalesce(nullif(trim(p_nombre), ''), core.whatsapp_plantillas.nombre),
    texto = coalesce(p_texto, core.whatsapp_plantillas.texto),
    imagen = CASE WHEN p_quitar_imagen THEN NULL ELSE coalesce(p_imagen, core.whatsapp_plantillas.imagen) END,
    activa = true, actualizado_en = now();
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION api.sup_eliminar_plantilla_wa(p_clave text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM private.exigir_supervisor_admin();
  DELETE FROM core.whatsapp_plantillas WHERE clave = p_clave AND personalizada;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solo se eliminan plantillas personalizadas' USING ERRCODE = '22023'; END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION api.sup_whatsapp_logs(p_limite int DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM private.exigir_supervisor_admin();
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'fecha', to_char(l.ts AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD'),
            'hora', to_char(l.ts AT TIME ZONE 'America/Guayaquil', 'HH24:MI:SS'),
            'nombreEmpleado', l.nombre_empleado, 'idEmpleado', l.empleado_id, 'telefono', l.telefono,
            'tipoNotificacion', l.tipo_notificacion, 'estado', l.estado, 'origen', coalesce(l.origen, 'MANUAL'),
            'detalleRespuesta', l.detalle_respuesta, 'supervisor', l.enviado_por) ORDER BY l.ts DESC, l.id DESC), '[]')
          FROM (SELECT * FROM core.whatsapp_logs ORDER BY ts DESC, id DESC LIMIT least(greatest(coalesce(p_limite, 100), 1), 500)) l);
END $$;

-- Encola mensajes ya compuestos: [{empleadoId, nombre, telefono, mensaje, plantilla?}]
CREATE OR REPLACE FUNCTION api.sup_encolar_whatsapp(p_mensajes jsonb, p_tipo text, p_origen text DEFAULT 'MANUAL')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE m jsonb; tel text; cid bigint; n int := 0; sin int := 0; quien text := private.nombre_sesion();
BEGIN
  PERFORM private.exigir_supervisor();
  IF p_mensajes IS NULL OR jsonb_typeof(p_mensajes) <> 'array' OR jsonb_array_length(p_mensajes) = 0 THEN
    RAISE EXCEPTION 'No hay mensajes para enviar' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_mensajes) > 300 THEN RAISE EXCEPTION 'Demasiados mensajes en un solo envío' USING ERRCODE = '22023'; END IF;
  FOR m IN SELECT value FROM jsonb_array_elements(p_mensajes) LOOP
    tel := private.normalizar_telefono(m ->> 'telefono');
    IF length(coalesce(tel, '')) < 9 THEN tel := NULL; END IF;   -- normalizarNumeroParaWhatsApp
    IF tel IS NULL OR nullif(trim(m ->> 'mensaje'), '') IS NULL THEN
      sin := sin + 1;
      INSERT INTO core.whatsapp_logs (empleado_id, nombre_empleado, telefono, tipo_notificacion, estado, detalle_respuesta, enviado_por, mensaje, origen)
      VALUES (m ->> 'empleadoId', m ->> 'nombre', 'SIN_NUMERO', p_tipo, 'SIN_TELEFONO',
              'El colaborador ' || coalesce(m ->> 'nombre', '') || ' no tiene teléfono registrado.', quien, m ->> 'mensaje', p_origen);
      CONTINUE;
    END IF;
    INSERT INTO core.cola_notificaciones (tipo, payload)
    VALUES ('WHATSAPP_MENSAJE', jsonb_build_object('telefono', tel, 'mensaje', m ->> 'mensaje', 'plantilla', m ->> 'plantilla',
                                                   'empleadoId', m ->> 'empleadoId', 'nombre', m ->> 'nombre', 'tipo', p_tipo))
    RETURNING id INTO cid;
    INSERT INTO core.whatsapp_logs (empleado_id, nombre_empleado, telefono, tipo_notificacion, estado, detalle_respuesta, enviado_por, mensaje, origen, cola_id)
    VALUES (m ->> 'empleadoId', m ->> 'nombre', tel, p_tipo, 'EN_COLA', 'Pendiente de envío', quien, m ->> 'mensaje', p_origen, cid);
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'encolados', n, 'sinTelefono', sin);
END $$;

-- Chat abierto con wa.me desde el mensaje individual (solo auditoría)
CREATE OR REPLACE FUNCTION api.sup_log_wame(p_empleado_id text, p_telefono text, p_mensaje text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM private.exigir_supervisor();
  INSERT INTO core.whatsapp_logs (empleado_id, nombre_empleado, telefono, tipo_notificacion, estado, detalle_respuesta, enviado_por, mensaje, origen)
  VALUES (p_empleado_id, (SELECT nombre FROM core.empleados WHERE id = p_empleado_id), p_telefono, 'INDIVIDUAL_WAME', 'ABIERTO_WAME',
          'Chat abierto en wa.me', private.nombre_sesion(), p_mensaje, 'MANUAL');
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION private.whatsapp_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION api.sup_whatsapp_plantillas(), api.sup_guardar_whatsapp_config(jsonb),
  api.sup_guardar_plantilla_wa(text, text, text, text, boolean), api.sup_eliminar_plantilla_wa(text), api.sup_whatsapp_logs(int),
  api.sup_encolar_whatsapp(jsonb, text, text), api.sup_log_wame(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.sup_whatsapp_plantillas(), api.sup_encolar_whatsapp(jsonb, text, text), api.sup_log_wame(text, text, text) TO supervisor;
GRANT EXECUTE ON FUNCTION api.sup_guardar_whatsapp_config(jsonb), api.sup_guardar_plantilla_wa(text, text, text, text, boolean),
  api.sup_eliminar_plantilla_wa(text), api.sup_whatsapp_logs(int) TO supervisor_admin;

-- guardarTelefonoDesdeModalWa: cualquier supervisor registra el celular del colaborador
CREATE OR REPLACE FUNCTION api.sup_guardar_telefono(p_empleado_id text, p_telefono text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE tel text := private.normalizar_telefono(p_telefono);
BEGIN
  PERFORM private.exigir_supervisor();
  IF length(coalesce(tel, '')) < 9 THEN
    RAISE EXCEPTION 'Por favor ingresa un número celular válido (ej: 0984660105)' USING ERRCODE = '22023';
  END IF;
  UPDATE core.empleados SET telefono = tel WHERE id = p_empleado_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador no encontrado' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('ok', true, 'telefono', tel);
END $$;
REVOKE ALL ON FUNCTION api.sup_guardar_telefono(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.sup_guardar_telefono(text, text) TO supervisor;
