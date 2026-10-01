-- Fase 5 (bloque F): Opciones adicionales (centro de configuración del Administrador General).
-- Carga de personal (formulario, pegado de Excel, archivo ACTUALIZAR), asignación de roles, desvinculación con
-- historial, baja de colaboradores y orden de actualización forzada de terminales.
-- Reglas: fecha oficial = private.hoy() (Guayaquil); nada se borra físicamente (las marcaciones y el histórico
-- se conservan, R-LOPDP); solo el Administrador General opera esta sección, como en el legado (esAdminMaster).

-- Funciones de una versión previa de este archivo (no versionada) que este bloque reemplaza
DROP FUNCTION IF EXISTS api.sup_desvincular_colaborador(text, date, text, text);
DROP FUNCTION IF EXISTS api.sup_historial_desvinculados();
DROP FUNCTION IF EXISTS api.sup_reactivar_colaborador(text);
DROP FUNCTION IF EXISTS api.sup_eliminar_colaboradores(text[]);
DROP FUNCTION IF EXISTS api.sup_forzar_actualizacion_terminales();
DROP FUNCTION IF EXISTS api.sup_info_actualizacion_forzada();
DROP FUNCTION IF EXISTS api.sup_carga_masiva_empleados(jsonb);

ALTER TABLE core.empleados ADD COLUMN IF NOT EXISTS eliminado_en timestamptz;      -- baja sin desvinculación ("Eliminar")

CREATE OR REPLACE FUNCTION private.exigir_admin() RETURNS void
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF private.nivel() < 4 THEN
    RAISE EXCEPTION 'Solo el Administrador General puede realizar esta acción.' USING ERRCODE = '42501';
  END IF;
END $$;

-- Retira el acceso de un colaborador dado de baja: sesiones invalidadas y teléfonos desvinculados
CREATE OR REPLACE FUNCTION private.retirar_acceso(p_empleado_id text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  UPDATE private.credenciales SET sesiones_validas_desde = date_trunc('second', now()) WHERE usuario = p_empleado_id;
  UPDATE core.dispositivos SET activo = false WHERE empleado_id = p_empleado_id AND activo;
$$;

-- ───────────── Datos de la sección ─────────────
-- Historial (cargarHistorialDesvinculados): desvinculados archivados + inactivos en base sin desvinculación,
-- con su cantidad de registros; y la última orden de actualización forzada.
CREATE OR REPLACE FUNCTION api.sup_opciones_datos()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM private.exigir_admin();
  RETURN jsonb_build_object(
    'desvinculados', (
      SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'origen' DESC, x ->> 'fechaDesvinculacion' DESC, x ->> 'nombre'), '[]') FROM (
        SELECT jsonb_build_object(
          'id', d.empleado_id, 'nombre', coalesce(e.nombre, d.snapshot ->> 'nombre', 'Colaborador (' || d.empleado_id || ')'),
          'area', coalesce(e.area, d.snapshot ->> 'area', ''), 'cargo', coalesce(e.cargo, d.snapshot ->> 'cargo', ''),
          'fechaDesvinculacion', coalesce(to_char(d.fecha, 'YYYY-MM-DD'), '—'), 'motivo', coalesce(d.motivo, 'Desvinculación laboral'),
          'supervisor', coalesce(d.desvinculado_por, 'Admin'), 'observaciones', coalesce(d.observaciones, ''),
          'totalRegs', (SELECT count(*) FROM core.marcaciones m WHERE m.empleado_id = d.empleado_id)
                       + (SELECT count(*) FROM core.novedades n WHERE n.empleado_id = d.empleado_id),
          'origen', 'ARCHIVADO') AS x
        FROM (SELECT DISTINCT ON (empleado_id) * FROM core.desvinculaciones ORDER BY empleado_id, fecha DESC NULLS LAST, id DESC) d
        LEFT JOIN core.empleados e ON e.id = d.empleado_id
        UNION ALL
        SELECT jsonb_build_object(
          'id', e.id, 'nombre', e.nombre, 'area', coalesce(e.area, ''), 'cargo', coalesce(e.cargo, ''),
          'fechaDesvinculacion', CASE WHEN e.eliminado_en IS NOT NULL THEN 'Baja en base' ELSE 'Inactivo en base' END,
          'motivo', CASE WHEN e.eliminado_en IS NOT NULL THEN 'Inactivo / Eliminado en base' ELSE 'Marcado Inactivo' END,
          'supervisor', 'Pendiente de archivar', 'observaciones', CASE WHEN e.area IS NOT NULL THEN 'Área: ' || e.area ELSE '' END,
          'totalRegs', (SELECT count(*) FROM core.marcaciones m WHERE m.empleado_id = e.id)
                       + (SELECT count(*) FROM core.novedades n WHERE n.empleado_id = e.id),
          'origen', 'INACTIVO_BASE')
        FROM core.empleados e
        WHERE NOT e.activo AND NOT EXISTS (SELECT 1 FROM core.desvinculaciones d WHERE d.empleado_id = e.id)) s),
    'actualizacionForzada', coalesce(private.cfg('forzar_actualizacion_info'), '{}'::jsonb));
END $$;

-- ───────────── Roles (guardarAsignacionRol) ─────────────
CREATE OR REPLACE FUNCTION api.sup_asignar_rol(p_empleado_id text, p_rol text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE e core.empleados;
BEGIN
  PERFORM private.exigir_admin();
  SELECT * INTO e FROM core.empleados WHERE id = p_empleado_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Colaborador no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF e.rol = 'ADMIN' THEN
    RAISE EXCEPTION 'El Administrador General es permanente y su rol no se puede modificar.' USING ERRCODE = '22023';
  END IF;
  PERFORM private.cambiar_rol(p_empleado_id, private.rol_desde_selector(p_rol));
  RETURN jsonb_build_object('ok', true, 'rol', (SELECT private.supervisor_legado(rol) FROM core.empleados WHERE id = p_empleado_id));
END $$;

-- ───────────── Carga masiva (formulario, pegado de Excel y archivo ACTUALIZAR) ─────────────
-- Cada elemento: {id, nombre, area, cargo, cedula?, telefono?, supervisor? (NO|SI|SUPERVISOR ADMIN), activo? (SI|NO),
-- fechaNacimiento?, baseLat?, baseLng?}. Crea o actualiza; los nuevos crean su contraseña con la cédula (D-06).
CREATE OR REPLACE FUNCTION api.sup_carga_masiva_empleados(p_empleados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  it jsonb; v_id text; v_nombre text; v_area text; v_cargo text; v_cedula text; v_tel text; v_fn date;
  v_activo boolean; v_rol core.rol_app; v_lat double precision; v_lng double precision;
  creados int := 0; actualizados int := 0; omitidos jsonb := '[]';
  v_sup text := private.nombre_sesion();
BEGIN
  PERFORM private.exigir_admin();
  IF p_empleados IS NULL OR jsonb_typeof(p_empleados) <> 'array' OR jsonb_array_length(p_empleados) = 0 THEN
    RAISE EXCEPTION 'No hay datos válidos para guardar.' USING ERRCODE = '22023';
  END IF;
  FOR it IN SELECT value FROM jsonb_array_elements(p_empleados) LOOP
    v_id := trim(coalesce(it ->> 'id', ''));
    v_nombre := nullif(trim(coalesce(it ->> 'nombre', '')), '');
    v_area := upper(nullif(trim(coalesce(it ->> 'area', '')), ''));
    v_cargo := nullif(trim(coalesce(it ->> 'cargo', '')), '');
    IF v_id = '' OR v_id !~ '^[0-9A-Za-z_-]+$' OR v_nombre IS NULL THEN
      omitidos := omitidos || jsonb_build_object('id', v_id, 'motivo', 'ID o nombre no válido');
      CONTINUE;
    END IF;
    v_cedula := nullif(regexp_replace(coalesce(it ->> 'cedula', ''), '\D', '', 'g'), '');
    v_tel := private.normalizar_telefono(it ->> 'telefono');
    v_fn := CASE WHEN coalesce(it ->> 'fechaNacimiento', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (it ->> 'fechaNacimiento')::date END;
    v_activo := upper(coalesce(nullif(trim(it ->> 'activo'), ''), 'SI')) <> 'NO';
    v_lat := CASE WHEN coalesce(it ->> 'baseLat', '') ~ '^-?\d+(\.\d+)?$' THEN (it ->> 'baseLat')::double precision END;
    v_lng := CASE WHEN coalesce(it ->> 'baseLng', '') ~ '^-?\d+(\.\d+)?$' THEN (it ->> 'baseLng')::double precision END;
    IF EXISTS (SELECT 1 FROM core.empleados WHERE id = v_id) THEN
      UPDATE core.empleados SET nombre = v_nombre, area = coalesce(v_area, area), cargo = coalesce(v_cargo, cargo),
             cedula = coalesce(v_cedula, cedula), telefono = coalesce(v_tel, telefono), fecha_nacimiento = coalesce(v_fn, fecha_nacimiento),
             base_lat = coalesce(v_lat, base_lat), base_lng = coalesce(v_lng, base_lng), activo = v_activo,
             es_pasante = private.texto_es_pasante(coalesce(v_cargo, cargo), coalesce(v_area, area)),
             tipo_asistencia = private.texto_tipo_asistencia(coalesce(v_cargo, cargo), coalesce(v_area, area)),
             puede_autorizar_extras = private.texto_puede_autorizar_extras(coalesce(v_cargo, cargo)),
             eliminado_en = CASE WHEN v_activo THEN NULL ELSE eliminado_en END
       WHERE id = v_id;
      IF it ? 'supervisor' AND nullif(trim(it ->> 'supervisor'), '') IS NOT NULL THEN
        PERFORM private.cambiar_rol(v_id, private.rol_desde_selector(it ->> 'supervisor'));
      END IF;
      IF NOT v_activo THEN PERFORM private.retirar_acceso(v_id); END IF;
      actualizados := actualizados + 1;
    ELSE
      IF v_area IS NULL OR v_cargo IS NULL THEN
        omitidos := omitidos || jsonb_build_object('id', v_id, 'motivo', 'Área y cargo son obligatorios para un colaborador nuevo');
        CONTINUE;
      END IF;
      IF EXISTS (SELECT 1 FROM private.credenciales WHERE usuario = v_id) THEN
        omitidos := omitidos || jsonb_build_object('id', v_id, 'motivo', 'El ID ya está en uso por otra cuenta');
        CONTINUE;
      END IF;
      v_rol := private.rol_desde_selector(it ->> 'supervisor');
      INSERT INTO core.empleados (id, cedula, nombre, area, cargo, rol, activo, es_pasante, tipo_asistencia, puede_autorizar_extras,
        telefono, fecha_nacimiento, fecha_ingreso, base_lat, base_lng, cultura_habilitada)
      VALUES (v_id, v_cedula, v_nombre, v_area, v_cargo, v_rol, v_activo, private.texto_es_pasante(v_cargo, v_area),
        private.texto_tipo_asistencia(v_cargo, v_area), private.texto_puede_autorizar_extras(v_cargo), v_tel, v_fn, private.hoy(),
        v_lat, v_lng, true);
      INSERT INTO private.credenciales (usuario, tipo_cuenta, password_hash, debe_cambiar) VALUES (v_id, 'EMPLEADO', NULL, true);
      IF v_activo THEN
        PERFORM private.encolar('NUEVO_EMPLEADO', jsonb_build_object('id', v_id, 'nombre', v_nombre, 'area', v_area, 'cargo', v_cargo,
          'telefono', v_tel, 'creado_por', v_sup));
      END IF;
      creados := creados + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'procesados', creados + actualizados, 'creados', creados, 'actualizados', actualizados, 'omitidos', omitidos);
END $$;

-- ───────────── Baja ("Eliminar Usuarios"): sin borrar el histórico ─────────────
CREATE OR REPLACE FUNCTION api.sup_eliminar_colaboradores(p_ids text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE r record; det jsonb := '[]'; n int := 0;
BEGIN
  PERFORM private.exigir_admin();
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN RAISE EXCEPTION 'Selecciona al menos un colaborador para eliminar' USING ERRCODE = '22023'; END IF;
  FOR r IN SELECT id, nombre, rol FROM core.empleados WHERE id = ANY (p_ids) LOOP
    IF r.rol = 'ADMIN' THEN CONTINUE; END IF;
    UPDATE core.empleados SET activo = false, eliminado_en = coalesce(eliminado_en, now()) WHERE id = r.id;
    PERFORM private.retirar_acceso(r.id);
    det := det || jsonb_build_object('id', r.id, 'nombre', r.nombre);
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'totalEliminados', n, 'detalles', det,
    'mensaje', format('Se procesó la eliminación de %s colaborador(es). Su histórico de asistencia se conserva.', n));
END $$;

-- ───────────── Desvinculación (confirmarDesvinculacionColaborador) ─────────────
CREATE OR REPLACE FUNCTION api.sup_desvincular_colaborador(p_empleado_id text, p_fecha date DEFAULT NULL, p_motivo text DEFAULT NULL,
                                                           p_observaciones text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE e core.empleados; regs int;
BEGIN
  PERFORM private.exigir_admin();
  SELECT * INTO e FROM core.empleados WHERE id = p_empleado_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Colaborador no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF e.rol = 'ADMIN' THEN RAISE EXCEPTION 'El Administrador General no puede desvincularse.' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM core.desvinculaciones WHERE empleado_id = p_empleado_id) AND NOT e.activo THEN
    RAISE EXCEPTION 'El colaborador ya está desvinculado.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO core.desvinculaciones (empleado_id, fecha, motivo, observaciones, desvinculado_por, snapshot)
  VALUES (p_empleado_id, coalesce(p_fecha, private.hoy()), coalesce(nullif(trim(p_motivo), ''), 'Desvinculación laboral'),
          nullif(trim(coalesce(p_observaciones, '')), ''),
          private.nombre_sesion() || coalesce(' (' || private.jwt_empleado_id() || ')', ''), to_jsonb(e) - 'foto_legado');
  UPDATE core.empleados SET activo = false WHERE id = p_empleado_id;
  PERFORM private.retirar_acceso(p_empleado_id);
  SELECT (SELECT count(*) FROM core.marcaciones WHERE empleado_id = p_empleado_id)
       + (SELECT count(*) FROM core.novedades WHERE empleado_id = p_empleado_id) INTO regs;
  RETURN jsonb_build_object('ok', true, 'registrosRespaldados', regs,
    'mensaje', format('Colaborador %s desvinculado y archivado correctamente (%s registros conservados).', e.nombre, regs));
END $$;

-- ───────────── Actualización forzada de terminales ─────────────
-- La app del empleado ya lee sistema.forzar_actualizacion (mi_contexto); las terminales y el panel lo consultan
-- con api.version_forzada.
CREATE OR REPLACE FUNCTION api.sup_forzar_actualizacion()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE ts bigint := (extract(epoch FROM now()) * 1000)::bigint; info jsonb;
BEGIN
  PERFORM private.exigir_admin();
  UPDATE core.configuracion SET valor = jsonb_set(valor, '{forzar_actualizacion}', to_jsonb(ts)), actualizado_en = now(),
         actualizado_por = private.jwt_usuario()
   WHERE clave = 'sistema';
  info := jsonb_build_object('ts', ts, 'version', 'v3.00_' || to_char(private.hoy(), 'YYYYMMDD'),
    'fecha', to_char(now() AT TIME ZONE 'America/Guayaquil', 'DD/MM/YYYY HH24:MI:SS'), 'por', private.nombre_sesion());
  INSERT INTO core.configuracion (clave, valor, actualizado_en, actualizado_por) VALUES ('forzar_actualizacion_info', info, now(), private.jwt_usuario())
  ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = now(), actualizado_por = EXCLUDED.actualizado_por;
  RETURN jsonb_build_object('ok', true, 'info', info);
END $$;

CREATE OR REPLACE FUNCTION api.version_forzada() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce((private.cfg('sistema') ->> 'forzar_actualizacion')::bigint, 0)
$$;

REVOKE ALL ON FUNCTION private.retirar_acceso(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.sup_opciones_datos(), api.sup_asignar_rol(text, text), api.sup_carga_masiva_empleados(jsonb),
  api.sup_eliminar_colaboradores(text[]), api.sup_desvincular_colaborador(text, date, text, text), api.sup_forzar_actualizacion(),
  api.version_forzada() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.sup_opciones_datos(), api.sup_asignar_rol(text, text), api.sup_carga_masiva_empleados(jsonb),
  api.sup_eliminar_colaboradores(text[]), api.sup_desvincular_colaborador(text, date, text, text), api.sup_forzar_actualizacion() TO admin;
GRANT EXECUTE ON FUNCTION api.version_forzada() TO anon, empleado, guardia;
