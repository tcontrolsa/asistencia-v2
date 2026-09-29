-- 001 — Esquemas, extensiones y roles de PostgREST
-- core    : tablas de la aplicación (NO expuesto por PostgREST)
-- api     : vistas y funciones RPC (único esquema expuesto)
-- private : credenciales, secretos y funciones internas (NO expuesto)
--
-- Los roles son del clúster (compartidos entre bases). La contraseña de
-- `authenticator` la fija scripts/migrate.js desde PGRST_AUTHENTICATOR_PASSWORD.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS api;
CREATE SCHEMA IF NOT EXISTS private;

DO $$
DECLARE r text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER;
  END IF;
  FOREACH r IN ARRAY ARRAY['anon','empleado','guardia','supervisor','supervisor_admin','admin'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
    EXECUTE format('GRANT %I TO authenticator', r);
  END LOOP;
END $$;

-- Jerarquía: admin ⊃ supervisor_admin ⊃ supervisor ⊃ empleado. guardia y anon van aparte.
GRANT empleado TO supervisor;
GRANT supervisor TO supervisor_admin;
GRANT supervisor_admin TO admin;

REVOKE ALL ON SCHEMA core, private FROM PUBLIC;
REVOKE ALL ON SCHEMA api FROM PUBLIC;
GRANT USAGE ON SCHEMA api TO anon, empleado, guardia;
-- Las vistas de api usan security_invoker: los roles necesitan USAGE en core
-- (los permisos de tabla y RLS se definen en 004).
GRANT USAGE ON SCHEMA core TO empleado, guardia;
GRANT USAGE ON SCHEMA private TO anon, empleado, guardia;

-- Las funciones nuevas no se ejecutan por PUBLIC salvo GRANT explícito.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA api REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA core REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Zona horaria oficial (§3 del prompt maestro). No se cambia la de la base para no
-- alterar al Express que convive en producción; las funciones convierten siempre de
-- forma explícita con private.ahora_local(), y las sesiones de PostgREST usan esta zona.
ALTER ROLE authenticator SET timezone TO 'America/Guayaquil';
