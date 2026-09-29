-- 004 — Identidad desde el JWT, permisos, RLS y auditoría (§5.1, §5.2)
-- PostgREST cambia al rol del claim `role` y deja los claims en request.jwt.claims.
-- Las reglas se basan en los claims (no en current_user) para que funcionen igual
-- dentro de funciones SECURITY DEFINER.

CREATE OR REPLACE FUNCTION private.claims() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

-- Rol efectivo: el de SET ROLE que hace PostgREST (no cambia dentro de SECURITY DEFINER).
-- Solo sin SET ROLE (conexión directa de administración) se toma el claim.
CREATE OR REPLACE FUNCTION private.jwt_rol() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN current_setting('role') <> 'none' THEN current_setting('role')
              ELSE coalesce(private.claims() ->> 'role', 'anon') END
$$;

-- ID del empleado autenticado (null para guardia/anon)
CREATE OR REPLACE FUNCTION private.jwt_empleado_id() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT nullif(private.claims() ->> 'empleado_id', '') $$;

-- Usuario autenticado (empleado o guardia), para auditoría
CREATE OR REPLACE FUNCTION private.jwt_usuario() RETURNS text
LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(private.claims() ->> 'usuario', ''), private.jwt_empleado_id()) $$;

-- empleado 1 < supervisor 2 < supervisor_admin 3 < admin 4; guardia 0; anon -1
CREATE OR REPLACE FUNCTION private.nivel() RETURNS int
LANGUAGE sql STABLE AS $$
  SELECT CASE private.jwt_rol()
    WHEN 'empleado' THEN 1 WHEN 'supervisor' THEN 2 WHEN 'supervisor_admin' THEN 3 WHEN 'admin' THEN 4
    WHEN 'guardia' THEN 0 ELSE -1 END
$$;

CREATE OR REPLACE FUNCTION private.es_supervisor() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT private.nivel() >= 2 $$;

CREATE OR REPLACE FUNCTION private.es_supervisor_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT private.nivel() >= 3 $$;

CREATE OR REPLACE FUNCTION private.es_propio(p_empleado_id text) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT p_empleado_id IS NOT NULL AND p_empleado_id = private.jwt_empleado_id() $$;

GRANT EXECUTE ON FUNCTION private.claims(), private.jwt_rol(), private.jwt_empleado_id(), private.jwt_usuario(),
  private.nivel(), private.es_supervisor(), private.es_supervisor_admin(), private.es_propio(text)
  TO anon, empleado, guardia;

-- ───────────── Permisos de tabla (solo lectura en Fase 1; escrituras por RPC en fases 2–5) ─────────────
REVOKE ALL ON ALL TABLES IN SCHEMA core FROM PUBLIC, anon, empleado, guardia;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, empleado, guardia;

GRANT SELECT ON core.empleados, core.marcaciones, core.novedades, core.ajustes_dia,
  core.vacaciones_saldo_inicial, core.consumo_almuerzos, core.solicitudes_invitados,
  core.configuracion, core.horarios, core.feriados, core.menu_semanal, core.cultura_preguntas,
  core.emergencias, core.dispositivos
  TO empleado;
GRANT SELECT ON core.historial_menu TO supervisor;
GRANT SELECT ON core.desvinculaciones, core.whatsapp_plantillas, core.whatsapp_logs, core.auditoria,
  core.guardias
  TO supervisor_admin;

-- ───────────── RLS ─────────────
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'core' LOOP
    EXECUTE format('ALTER TABLE core.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Datos personales: el empleado solo lo suyo; supervisor y superiores, todo.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['marcaciones','novedades','ajustes_dia','vacaciones_saldo_inicial',
                           'consumo_almuerzos','solicitudes_invitados','dispositivos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS leer_propio_o_supervisor ON core.%I', t);
    EXECUTE format($p$CREATE POLICY leer_propio_o_supervisor ON core.%I FOR SELECT
                      USING (private.es_supervisor() OR private.es_propio(empleado_id))$p$, t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS leer_propio_o_supervisor ON core.empleados;
CREATE POLICY leer_propio_o_supervisor ON core.empleados FOR SELECT
  USING (private.es_supervisor() OR private.es_propio(id));

-- Catálogos y configuración: cualquier usuario autenticado (empleado o superior).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['configuracion','horarios','feriados','menu_semanal','cultura_preguntas','emergencias'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS leer_autenticado ON core.%I', t);
    EXECUTE format('CREATE POLICY leer_autenticado ON core.%I FOR SELECT USING (private.nivel() >= 1)', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS leer_supervisor ON core.historial_menu;
CREATE POLICY leer_supervisor ON core.historial_menu FOR SELECT USING (private.es_supervisor());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['desvinculaciones','whatsapp_plantillas','whatsapp_logs','auditoria','guardias'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS leer_supervisor_admin ON core.%I', t);
    EXECUTE format('CREATE POLICY leer_supervisor_admin ON core.%I FOR SELECT USING (private.es_supervisor_admin())', t);
  END LOOP;
END $$;

-- ───────────── Auditoría ─────────────
-- Se omite durante el ETL (SET app.etl = 'on').
CREATE OR REPLACE FUNCTION private.auditar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE fila jsonb;
BEGIN
  IF current_setting('app.etl', true) = 'on' THEN RETURN coalesce(NEW, OLD); END IF;
  fila := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  INSERT INTO core.auditoria (usuario, rol, tabla, accion, clave, antes, despues)
  VALUES (coalesce(private.jwt_usuario(), session_user), private.jwt_rol(), TG_TABLE_NAME, TG_OP,
          coalesce(fila ->> 'id', fila ->> 'clave', fila ->> 'token', fila ->> 'usuario', fila ->> 'dia',
                   (fila ->> 'empleado_id') || '|' || coalesce(fila ->> 'fecha', fila ->> 'anio', ''),
                   fila ->> 'tipo_dia'),
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN coalesce(NEW, OLD);
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['empleados','marcaciones','novedades','ajustes_dia','vacaciones_saldo_inicial',
                           'consumo_almuerzos','solicitudes_invitados','configuracion','horarios','feriados',
                           'menu_semanal','cultura_preguntas','emergencias','desvinculaciones',
                           'whatsapp_plantillas','dispositivos','guardias'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS auditar ON core.%I', t);
    EXECUTE format('CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON core.%I
                    FOR EACH ROW EXECUTE FUNCTION private.auditar()', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.tocar_actualizado_en() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.actualizado_en := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS tocar_actualizado_en ON core.empleados;
CREATE TRIGGER tocar_actualizado_en BEFORE UPDATE ON core.empleados
  FOR EACH ROW EXECUTE FUNCTION private.tocar_actualizado_en();
