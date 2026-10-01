-- 019 — Simulador de Vista (visor_empleado.html, P-16).
-- El legado escribía en localStorage una sesión falsa del colaborador (SIM_<id>) con la que se podía marcar en su
-- nombre. Ahora el servidor emite una sesión de SOLO LECTURA (30 min) para Sup. Admin y Admin: el JWT lleva
-- `simulado` y `simulado_por`; private.verificar_sesion valida a quien simula y pone la transacción en solo lectura,
-- de modo que cualquier marcación o cambio falla en la base (también dentro de funciones SECURITY DEFINER).
-- Cada simulación queda en core.auditoria.

-- Lista para el selector de personal (sin PIN ni contraseñas: solo si ya la creó)
CREATE OR REPLACE FUNCTION api.sup_simular_lista()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM private.exigir_supervisor_admin();
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'nombre', e.nombre, 'area', e.area, 'cargo', e.cargo, 'activo', e.activo,
      'supervisor', private.supervisor_legado(e.rol), 'rol', e.rol::text,
      'latitud', e.base_lat, 'longitud', e.base_lng,
      'tienePassword', (SELECT c.password_hash IS NOT NULL FROM private.credenciales c WHERE c.usuario = e.id))
      ORDER BY e.nombre), '[]')
    FROM core.empleados e WHERE e.eliminado_en IS NULL);
END $$;

CREATE OR REPLACE FUNCTION api.sup_simular_empleado(p_empleado_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  e core.empleados;
  quien text := private.jwt_usuario();
  rol text;
  ahora timestamptz := date_trunc('second', now());
  claims jsonb;
BEGIN
  PERFORM private.exigir_supervisor_admin();
  SELECT * INTO e FROM core.empleados WHERE id = p_empleado_id AND activo AND eliminado_en IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador no encontrado o inactivo' USING ERRCODE = 'P0002'; END IF;
  rol := CASE e.rol::text WHEN 'SUPERVISOR' THEN 'supervisor' WHEN 'SUPERVISOR_ADMIN' THEN 'supervisor_admin'
                          WHEN 'ADMIN' THEN 'admin' ELSE 'empleado' END;
  -- Un Sup. Admin no puede ver con permisos iguales o superiores a los suyos
  IF private.nivel_rol(rol) >= private.nivel() AND private.nivel() < 4 THEN
    RAISE EXCEPTION 'Solo el Administrador puede simular a un Supervisor Admin o Administrador' USING ERRCODE = '42501';
  END IF;
  claims := jsonb_build_object('role', rol, 'usuario', e.id, 'empleado_id', e.id, 'rol_app', e.rol,
    'iat', extract(epoch FROM ahora)::bigint, 'exp', extract(epoch FROM ahora + interval '30 minutes')::bigint,
    'debe_cambiar', false, 'simulado', true, 'simulado_por', quien);
  INSERT INTO core.auditoria (usuario, rol, tabla, accion, clave, despues)
  VALUES (quien, private.jwt_rol(), 'simulacion', 'SIMULAR', e.id,
          jsonb_build_object('empleado', e.nombre, 'rol_simulado', rol, 'expira', ahora + interval '30 minutes'));
  RETURN jsonb_build_object('ok', true, 'token', private.jwt_firmar(claims), 'expira', ahora + interval '30 minutes',
                            'nombre', e.nombre);
END $$;

-- Validación de cada petición: + sesiones simuladas
CREATE OR REPLACE FUNCTION private.verificar_sesion() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  cl jsonb := private.claims();
  v_rol text := private.jwt_rol();
  v_usuario text := cl ->> 'usuario';
  c private.credenciales;
  ruta text := coalesce(current_setting('request.path', true), '');
BEGIN
  IF v_rol = 'anon' OR v_rol IS NULL THEN RETURN; END IF;
  IF coalesce((cl ->> 'simulado')::boolean, false) THEN
    -- Sigue vigente solo mientras quien simula conserve su cuenta, su rol (≥ Sup. Admin) y su contraseña
    SELECT * INTO c FROM private.credenciales x WHERE x.usuario = cl ->> 'simulado_por';
    IF NOT FOUND OR coalesce(private.nivel_rol(private.rol_de_cuenta(c.usuario)), 0) < 3
       OR to_timestamp((cl ->> 'iat')::bigint) < c.sesiones_validas_desde
       OR NOT EXISTS (SELECT 1 FROM core.empleados WHERE id = v_usuario AND activo) THEN
      RAISE EXCEPTION 'La vista simulada terminó. Vuelve a iniciarla desde el simulador.' USING ERRCODE = 'PT401';
    END IF;
    PERFORM set_config('transaction_read_only', 'on', true);
    RETURN;
  END IF;
  SELECT * INTO c FROM private.credenciales x WHERE x.usuario = v_usuario;
  IF NOT FOUND OR private.rol_de_cuenta(v_usuario) IS DISTINCT FROM v_rol THEN
    RAISE EXCEPTION 'Sesión no válida. Inicie sesión nuevamente.' USING ERRCODE = 'PT401';
  END IF;
  IF to_timestamp((cl ->> 'iat')::bigint) < c.sesiones_validas_desde THEN
    RAISE EXCEPTION 'Su contraseña cambió. Inicie sesión nuevamente.' USING ERRCODE = 'PT401';
  END IF;
  IF cl ? 'dispositivo' AND NOT EXISTS (
       SELECT 1 FROM core.dispositivos d WHERE d.token = cl ->> 'dispositivo' AND d.empleado_id = v_usuario AND d.activo) THEN
    RAISE EXCEPTION 'Este dispositivo fue desvinculado. Inicie sesión nuevamente.' USING ERRCODE = 'PT401';
  END IF;
  IF c.debe_cambiar AND ruta NOT IN ('/rpc/cambiar_password', '/rpc/mi_sesion') THEN
    RAISE EXCEPTION 'Debe cambiar su contraseña antes de continuar.' USING ERRCODE = 'PT403';
  END IF;
END $$;

REVOKE ALL ON FUNCTION api.sup_simular_lista(), api.sup_simular_empleado(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.sup_simular_lista(), api.sup_simular_empleado(text) TO supervisor_admin;
