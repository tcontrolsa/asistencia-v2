-- 012 — Fase 5 (bloque B): directorio de colaboradores
-- Legado: supervisor_directorio.js (guardarEdicionEmpleadoDirectorio, guardarNuevoEmpleadoDirectorio,
-- cambiarAlmuerzoDirectorio). El PIN de marcación ya no existe (D-06): la ficha guarda la cédula, con la que
-- el colaborador crea su contraseña; el supervisor puede asignar una temporal con "Resetear PIN".

CREATE OR REPLACE FUNCTION private.normalizar_telefono(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN d IS NULL OR d = '' THEN NULL
    WHEN d ~ '^593\d{9}$' THEN d
    WHEN d ~ '^0\d{9}$' THEN '593' || substr(d, 2)
    WHEN d ~ '^9\d{8}$' THEN '593' || d
    ELSE d END
  FROM (SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') AS d) x
$$;

-- Rol desde el selector del legado ('NO' | 'SI' | 'SUPERVISOR ADMIN')
CREATE OR REPLACE FUNCTION private.rol_desde_selector(p text) RETURNS core.rol_app
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE upper(trim(coalesce(p, ''))) WHEN 'SI' THEN 'SUPERVISOR'::core.rol_app
    WHEN 'SUPERVISOR ADMIN' THEN 'SUPERVISOR_ADMIN'::core.rol_app ELSE 'EMPLEADO'::core.rol_app END
$$;

-- Cambiar el rol de un colaborador: Sup. Admin asigna Supervisor; solo el Admin asigna Sup. Admin.
-- El rol ADMIN no se cambia desde el panel.
CREATE OR REPLACE FUNCTION private.cambiar_rol(p_empleado_id text, p_rol core.rol_app) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actual core.rol_app;
BEGIN
  SELECT rol INTO actual FROM core.empleados WHERE id = p_empleado_id;
  IF actual IS NOT DISTINCT FROM p_rol OR actual = 'ADMIN' THEN RETURN; END IF;
  IF private.nivel() < 3 THEN
    RAISE EXCEPTION 'Solo Administradores y Supervisores Admin pueden cambiar el nivel de acceso.' USING ERRCODE = '42501';
  END IF;
  IF (p_rol = 'SUPERVISOR_ADMIN' OR actual = 'SUPERVISOR_ADMIN') AND private.nivel() < 4 THEN
    RAISE EXCEPTION 'Solo el Administrador General asigna o retira el rol de Supervisor Admin.' USING ERRCODE = '42501';
  END IF;
  UPDATE core.empleados SET rol = p_rol WHERE id = p_empleado_id;
  -- Un cambio de rol invalida las sesiones abiertas (verificar_sesion compara el rol del token)
  UPDATE private.credenciales SET sesiones_validas_desde = date_trunc('second', now()) WHERE usuario = p_empleado_id;
END $$;

-- Editar ficha completa (modal "Editar Ficha de Colaborador")
CREATE OR REPLACE FUNCTION api.sup_guardar_ficha(p_empleado_id text, p_nombre text, p_area text, p_cargo text,
  p_telefono text DEFAULT NULL, p_fecha_nacimiento date DEFAULT NULL, p_rol text DEFAULT NULL, p_activo text DEFAULT 'SI',
  p_cultura text DEFAULT 'SI', p_cedula text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  e core.empleados;
  v_nombre text := nullif(trim(coalesce(p_nombre, '')), '');
  v_area text := upper(nullif(trim(coalesce(p_area, '')), ''));
  v_cargo text := nullif(trim(coalesce(p_cargo, '')), '');
  v_activo boolean := upper(coalesce(p_activo, 'SI')) <> 'NO';
BEGIN
  PERFORM private.exigir_supervisor();
  SELECT * INTO e FROM core.empleados WHERE id = p_empleado_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF v_nombre IS NULL OR v_area IS NULL OR v_cargo IS NULL THEN
    RAISE EXCEPTION 'Por favor, completa los campos obligatorios (*)' USING ERRCODE = '22023';
  END IF;
  IF e.activo AND NOT v_activo AND private.nivel() < 3 THEN
    RAISE EXCEPTION 'Solo Administradores y Supervisores Admin pueden dar de baja a un colaborador.' USING ERRCODE = '42501';
  END IF;
  UPDATE core.empleados SET nombre = v_nombre, area = v_area, cargo = v_cargo,
    telefono = private.normalizar_telefono(p_telefono), fecha_nacimiento = p_fecha_nacimiento,
    activo = v_activo, cultura_habilitada = upper(coalesce(p_cultura, 'SI')) <> 'NO',
    cedula = coalesce(nullif(regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g'), ''), cedula),
    es_pasante = private.texto_es_pasante(v_cargo, v_area), tipo_asistencia = private.texto_tipo_asistencia(v_cargo, v_area),
    puede_autorizar_extras = private.texto_puede_autorizar_extras(v_cargo)
  WHERE id = p_empleado_id;
  IF p_rol IS NOT NULL THEN PERFORM private.cambiar_rol(p_empleado_id, private.rol_desde_selector(p_rol)); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Registrar nuevo colaborador (modal "Registrar Nuevo Colaborador"): queda sin contraseña; la crea con su cédula
CREATE OR REPLACE FUNCTION api.sup_crear_empleado(p_id text, p_nombre text, p_area text, p_cargo text,
  p_telefono text DEFAULT NULL, p_fecha_nacimiento date DEFAULT NULL, p_rol text DEFAULT 'NO', p_cedula text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_id text := trim(coalesce(p_id, ''));
  v_nombre text := nullif(trim(coalesce(p_nombre, '')), '');
  v_area text := upper(nullif(trim(coalesce(p_area, '')), ''));
  v_cargo text := nullif(trim(coalesce(p_cargo, '')), '');
  v_rol core.rol_app := private.rol_desde_selector(p_rol);
  v_sup text;
BEGIN
  PERFORM private.exigir_supervisor();
  IF v_id = '' OR v_nombre IS NULL OR v_area IS NULL OR v_cargo IS NULL THEN
    RAISE EXCEPTION 'Por favor, completa todos los campos requeridos (*)' USING ERRCODE = '22023';
  END IF;
  IF v_id !~ '^[0-9A-Za-z_-]+$' THEN RAISE EXCEPTION 'ID inválido' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM core.empleados WHERE id = v_id) OR EXISTS (SELECT 1 FROM private.credenciales WHERE usuario = v_id) THEN
    RAISE EXCEPTION 'Ya existe un colaborador con el ID %', v_id USING ERRCODE = '23505';
  END IF;
  IF v_rol <> 'EMPLEADO' AND private.nivel() < 3 THEN
    RAISE EXCEPTION 'Solo Administradores y Supervisores Admin pueden cambiar el nivel de acceso.' USING ERRCODE = '42501';
  END IF;
  IF v_rol = 'SUPERVISOR_ADMIN' AND private.nivel() < 4 THEN
    RAISE EXCEPTION 'Solo el Administrador General asigna o retira el rol de Supervisor Admin.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO core.empleados (id, cedula, nombre, area, cargo, rol, activo, es_pasante, tipo_asistencia, puede_autorizar_extras,
    telefono, fecha_nacimiento, fecha_ingreso, cultura_habilitada)
  VALUES (v_id, nullif(regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g'), ''), v_nombre, v_area, v_cargo, v_rol, true,
    private.texto_es_pasante(v_cargo, v_area), private.texto_tipo_asistencia(v_cargo, v_area), private.texto_puede_autorizar_extras(v_cargo),
    private.normalizar_telefono(p_telefono), p_fecha_nacimiento, private.hoy(), true);
  INSERT INTO private.credenciales (usuario, tipo_cuenta, password_hash, debe_cambiar) VALUES (v_id, 'EMPLEADO', NULL, true);
  SELECT coalesce((SELECT nombre FROM core.empleados WHERE id = private.jwt_empleado_id()), 'Supervisor') INTO v_sup;
  -- Bienvenida por WhatsApp al colaborador y aviso a supervisores (worker de la Fase 6)
  PERFORM private.encolar('NUEVO_EMPLEADO', jsonb_build_object('id', v_id, 'nombre', v_nombre, 'area', v_area, 'cargo', v_cargo,
    'telefono', private.normalizar_telefono(p_telefono), 'creado_por', v_sup));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- Almuerzo de hoy desde el directorio: '' deja el día sin asignar
CREATE OR REPLACE FUNCTION api.sup_cambiar_almuerzo(p_empleado_id text, p_almuerzo text, p_fecha date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_fecha date := coalesce(p_fecha, private.hoy());
  v_val text := upper(trim(coalesce(p_almuerzo, '')));
  v_alm boolean;
  v_id bigint;
  e core.empleados;
BEGIN
  PERFORM private.exigir_supervisor();
  IF v_val NOT IN ('SI','NO','') THEN RAISE EXCEPTION 'Valor de almuerzo inválido' USING ERRCODE = '22023'; END IF;
  v_alm := CASE v_val WHEN 'SI' THEN true WHEN 'NO' THEN false END;
  SELECT * INTO e FROM core.empleados WHERE id = p_empleado_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador no encontrado' USING ERRCODE = 'P0002'; END IF;
  SELECT id INTO v_id FROM core.marcaciones
   WHERE empleado_id = e.id AND fecha = v_fecha
   ORDER BY (tipo IN ('ENTRADA','ENTRADA_CAMPO','RETORNO_CAMPO','SOLO_ALMUERZO')) DESC, hora, id LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE core.marcaciones SET almuerzo = v_alm, editado_en = now(), editado_por = private.jwt_usuario() WHERE id = v_id;
  ELSIF v_alm IS NOT NULL AND e.tipo_asistencia = 'SIN_ASISTENCIA' AND v_fecha = private.hoy() THEN
    INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, almuerzo, modo, origen, creado_por, dispositivo)
    VALUES (e.id, 'SOLO_ALMUERZO', v_fecha, private.ahora_local()::time(0), v_alm, 'OFICINA', 'SUPERVISOR', private.jwt_usuario(), 'SUPERVISOR');
  ELSIF v_alm IS NOT NULL THEN
    RAISE EXCEPTION 'No hay registros de asistencia para esa fecha' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('ok', true, 'mensaje', 'Almuerzo actualizado');
END $$;

GRANT EXECUTE ON FUNCTION api.sup_guardar_ficha(text, text, text, text, text, date, text, text, text, text),
  api.sup_crear_empleado(text, text, text, text, text, date, text, text)
  TO supervisor;
