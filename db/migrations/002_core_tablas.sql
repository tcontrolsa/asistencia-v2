-- 002 — Tablas de la aplicación (esquema core) y credenciales (private)
-- Referencia: docs/migracion-react-postgrest/03_DATOS_REALES.md §4 y §7

-- ───────────── Catálogos ─────────────
DO $$ BEGIN
  CREATE TYPE core.rol_app AS ENUM ('EMPLEADO','SUPERVISOR','SUPERVISOR_ADMIN','ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE core.tipo_asistencia AS ENUM ('NORMAL','SOLO_ALMUERZO','SIN_ASISTENCIA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE core.justificado AS ENUM ('SI','NO','PENDIENTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE core.origen AS ENUM ('APP','GUARDIA','KIOSCO','SUPERVISOR','SISTEMA','IMPORTADO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───────────── Configuración ─────────────
CREATE TABLE IF NOT EXISTS core.configuracion (
  clave          text PRIMARY KEY,
  valor          jsonb NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_por text
);

-- Un horario por tipo de día (D-02). LABORABLE = lunes a viernes no feriado.
CREATE TABLE IF NOT EXISTS core.horarios (
  tipo_dia             text PRIMARY KEY CHECK (tipo_dia IN ('LABORABLE','SABADO','DOMINGO','FERIADO')),
  entrada              time NOT NULL,
  salida               time NOT NULL,
  tolerancia_min       int  NOT NULL DEFAULT 5,   -- R-04
  limite_justificacion time NOT NULL,             -- R-05
  umbral_extra_min     int  NOT NULL DEFAULT 45   -- R-12
);

CREATE TABLE IF NOT EXISTS core.feriados (
  fecha  date PRIMARY KEY,
  nombre text NOT NULL,
  ambito text NOT NULL DEFAULT 'NACIONAL'
);

-- ───────────── Personas ─────────────
CREATE TABLE IF NOT EXISTS core.empleados (
  id                     text PRIMARY KEY,
  cedula                 text,
  nombre                 text NOT NULL,
  area                   text,
  cargo                  text,              -- texto original, se conserva
  rol                    core.rol_app NOT NULL DEFAULT 'EMPLEADO',
  activo                 boolean NOT NULL DEFAULT true,
  es_pasante             boolean NOT NULL DEFAULT false,          -- R-06
  tipo_asistencia        core.tipo_asistencia NOT NULL DEFAULT 'NORMAL',
  puede_autorizar_extras boolean NOT NULL DEFAULT false,          -- pestaña Extras
  auth_extras            boolean NOT NULL DEFAULT false,          -- R-13 (del día)
  telefono               text,              -- 593XXXXXXXXX
  fecha_nacimiento       date,
  fecha_ingreso          date,
  base_lat               double precision,  -- D-07: la asigna el supervisor
  base_lng               double precision,
  base_radio_m           int NOT NULL DEFAULT 300,                -- R-02
  base_asignada_por      text,
  url_rol_pagos          text,              -- antes `id_dispositivo` (D-10)
  foto_path              text,              -- D-05: ruta en el almacenamiento de archivos
  foto_legado            text,              -- URL o base64 original, hasta migrar a archivo
  cultura_habilitada     boolean NOT NULL DEFAULT true,
  creado_en              timestamptz NOT NULL DEFAULT now(),
  actualizado_en         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS empleados_activo_idx ON core.empleados (activo);

-- Cuentas de guardia individuales (D-14). Los guardias no son empleados de nómina.
CREATE TABLE IF NOT EXISTS core.guardias (
  usuario   text PRIMARY KEY,
  nombre    text NOT NULL,
  activo    boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.dispositivos (
  token         text PRIMARY KEY,
  empleado_id   text NOT NULL REFERENCES core.empleados(id) ON UPDATE CASCADE,
  activo        boolean NOT NULL DEFAULT true,
  registrado_en timestamptz NOT NULL DEFAULT now(),
  ultimo_uso    timestamptz
);
-- R-22: un dispositivo activo por empleado
CREATE UNIQUE INDEX IF NOT EXISTS dispositivos_un_activo ON core.dispositivos (empleado_id) WHERE activo;

CREATE TABLE IF NOT EXISTS core.desvinculaciones (
  id                bigserial PRIMARY KEY,
  empleado_id       text NOT NULL REFERENCES core.empleados(id) ON UPDATE CASCADE,
  fecha             date,
  motivo            text,
  observaciones     text,
  desvinculado_por  text,
  registrado_en     timestamptz NOT NULL DEFAULT now(),
  snapshot          jsonb,                 -- copia de la ficha al desvincular
  legacy_id         text UNIQUE
);

-- ───────────── Asistencia ─────────────
CREATE TABLE IF NOT EXISTS core.marcaciones (
  id                        bigserial PRIMARY KEY,
  empleado_id               text NOT NULL REFERENCES core.empleados(id) ON UPDATE CASCADE,
  tipo                      text NOT NULL CHECK (tipo IN
                              ('ENTRADA','SALIDA','ENTRADA_CAMPO','SALIDA_CAMPO','RETORNO_CAMPO','SOLO_ALMUERZO')),
  ts_servidor               timestamptz NOT NULL DEFAULT now(),   -- hora oficial (D-15)
  ts_dispositivo            timestamptz,                          -- solo auditoría
  fecha                     date NOT NULL,                        -- en America/Guayaquil
  hora                      time(0) NOT NULL,
  lat                       double precision,
  lng                       double precision,
  distancia_m               int,
  dispositivo               text,
  modo                      text NOT NULL DEFAULT 'OFICINA' CHECK (modo IN ('OFICINA','CAMPO')),
  almuerzo                  boolean,                              -- SI/NO; null = sin dato
  horas_extra               boolean NOT NULL DEFAULT false,
  autoriza                  text,
  tipo_salida               text CHECK (tipo_salida IN ('FINAL','PERMISO','PERMISO_CON_SALIDA_TEMPRANA',
                              'TRABAJO_CAMPO','SALIDA_PASANTE','SALIDA_TEMPRANA_JUSTIFICADA')),
  motivo_entrada_tardia     text,                                 -- D-09
  quien_justifica_entrada   text,
  motivo_salida             text,
  razon_permiso             text,
  quien_justifica           text,
  justificado               core.justificado NOT NULL DEFAULT 'NO',
  razon_justificacion       text,
  observacion               text,
  menu                      jsonb,                                -- D-09
  estado_emergencia         text,                                 -- R-19 (solo en ENTRADA)
  estado_emergencia_ts      timestamptz,
  origen                    core.origen NOT NULL DEFAULT 'APP',
  creado_por                text,
  legacy_id                 text UNIQUE,
  legacy_raw                jsonb
);
CREATE INDEX IF NOT EXISTS marcaciones_emp_fecha_idx ON core.marcaciones (empleado_id, fecha, ts_servidor);
CREATE INDEX IF NOT EXISTS marcaciones_fecha_idx ON core.marcaciones (fecha);

-- Ausencias y novedades del día: una por empleado y fecha (R-18).
CREATE TABLE IF NOT EXISTS core.novedades (
  id               bigserial PRIMARY KEY,
  empleado_id      text NOT NULL REFERENCES core.empleados(id) ON UPDATE CASCADE,
  fecha            date NOT NULL,
  tipo             text NOT NULL CHECK (tipo IN ('VACACIONES','PERMISO','PERMISO_PERSONAL','PERMISO_MEDICO',
                     'CALAMIDAD_DOMESTICA','FALTA','FALTA_JUSTIFICADA','SALIDA_JUSTIFICADA','TRABAJO_DE_CAMPO',
                     'SALIDA_A_CAMPO','JUSTIFICACION','INASISTENCIA','FERIADO','CUMPLEANOS')),
  justificado      core.justificado NOT NULL DEFAULT 'SI',
  motivo           text,
  quien_justifica  text,
  observacion      text,
  hora_inicio      time,          -- trabajo de campo por horario
  hora_fin         time,
  autoriza         text,
  origen           core.origen NOT NULL DEFAULT 'SUPERVISOR',
  creado_por       text,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  legacy_id        text UNIQUE,
  legacy_raw       jsonb,
  UNIQUE (empleado_id, fecha)
);

-- Permisos parciales y tiempo justificado por día (modal "Gestión de jornada").
-- Separado de novedades para que registrar una ausencia no borre los minutos.
CREATE TABLE IF NOT EXISTS core.ajustes_dia (
  empleado_id               text NOT NULL REFERENCES core.empleados(id) ON UPDATE CASCADE,
  fecha                     date NOT NULL,
  min_permiso_personal      int NOT NULL DEFAULT 0 CHECK (min_permiso_personal >= 0),
  min_permiso_medico        int NOT NULL DEFAULT 0 CHECK (min_permiso_medico >= 0),
  min_justificados          int NOT NULL DEFAULT 0 CHECK (min_justificados >= 0),
  razon                     text,
  quien_justifica           text,
  actualizado_en            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empleado_id, fecha)
);

-- Saldo de vacaciones arrastrado del año anterior (col. F de CALCULAR_vacaciones, D-04)
CREATE TABLE IF NOT EXISTS core.vacaciones_saldo_inicial (
  empleado_id text NOT NULL REFERENCES core.empleados(id) ON UPDATE CASCADE,
  anio        int  NOT NULL,
  dias        numeric(6,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (empleado_id, anio)
);

-- ───────────── Almuerzo, menú e invitados ─────────────
CREATE TABLE IF NOT EXISTS core.consumo_almuerzos (
  empleado_id    text NOT NULL REFERENCES core.empleados(id) ON UPDATE CASCADE,
  fecha          date NOT NULL,
  ts             timestamptz NOT NULL DEFAULT now(),
  registrado_por text,
  PRIMARY KEY (empleado_id, fecha)          -- una vez por día (R-14)
);

CREATE TABLE IF NOT EXISTS core.menu_semanal (
  dia   text PRIMARY KEY CHECK (dia IN ('lunes','martes','miercoles','jueves','viernes','sabado','domingo')),
  sopa  text,
  plato text,
  jugo  text,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.historial_menu (
  id        bigserial PRIMARY KEY,
  fecha     date,
  dia       text,
  sopa      text,
  plato     text,
  jugo      text,
  legacy_id text UNIQUE
);

CREATE TABLE IF NOT EXISTS core.solicitudes_invitados (
  id                      text PRIMARY KEY,           -- inv_YYYYMMDD_hhmmss_emp_xxxx
  fecha                   date NOT NULL,
  hora                    time(0),
  tipo_solicitud          text NOT NULL DEFAULT 'ALMUERZO_EXTRA',
  subtipo                 text NOT NULL CHECK (subtipo IN ('ALMUERZO_EXTRA','REFRIGERIO_SANDUCHE','REFRIGERIO_GALLETAS')),
  cantidad                int NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  invitado                text,
  empresa                 text,
  empleado_id             text REFERENCES core.empleados(id) ON UPDATE CASCADE,
  empleado_nombre         text,
  empleado_area           text,
  hora_servicio           text,
  observaciones           text,
  observaciones_completas text,
  estado                  text NOT NULL DEFAULT 'SOLICITADO' CHECK (estado IN ('SOLICITADO','CONFIRMADO','ENTREGADO','CANCELADO')),
  creado_por              text,
  actualizado_por         text,
  actualizado_en          timestamptz,
  ts                      timestamptz NOT NULL DEFAULT now(),
  legacy_raw              jsonb
);
CREATE INDEX IF NOT EXISTS solicitudes_invitados_fecha_idx ON core.solicitudes_invitados (fecha);

-- ───────────── Cultura, emergencias, WhatsApp ─────────────
CREATE TABLE IF NOT EXISTS core.cultura_preguntas (
  id           text PRIMARY KEY,
  tipo         text,
  pilar        text,
  clase_pilar  text,
  icono_pilar  text,
  pregunta     text NOT NULL,
  pista        text,
  opciones     jsonb NOT NULL DEFAULT '[]',   -- [{letra, texto, correcta}]
  activo       boolean NOT NULL DEFAULT true,
  orden        int
);

CREATE TABLE IF NOT EXISTS core.emergencias (
  id             bigserial PRIMARY KEY,
  nombre         text NOT NULL,
  activa         boolean NOT NULL DEFAULT true,
  habilitado_por text,
  inicio         timestamptz NOT NULL DEFAULT now(),
  fin            timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS emergencias_una_activa ON core.emergencias ((true)) WHERE activa;

-- Configuración de WhatsApp SIN la API key (va en el worker, §5.5)
CREATE TABLE IF NOT EXISTS core.whatsapp_plantillas (
  clave    text PRIMARY KEY,           -- no_registro, ausente, vacaciones, permiso, salida_faltante, emergencia, personalizada_*
  nombre   text NOT NULL,
  texto    text NOT NULL,
  imagen_url text,
  activa   boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS core.whatsapp_logs (
  id                bigserial PRIMARY KEY,
  ts                timestamptz NOT NULL DEFAULT now(),
  empleado_id       text,
  nombre_empleado   text,
  telefono          text,
  tipo_notificacion text,
  estado            text,
  detalle_respuesta text,
  enviado_por       text,
  legacy_id         text UNIQUE
);

-- ───────────── Auditoría ─────────────
CREATE TABLE IF NOT EXISTS core.auditoria (
  id       bigserial PRIMARY KEY,
  ts       timestamptz NOT NULL DEFAULT now(),
  usuario  text,
  rol      text,
  tabla    text NOT NULL,
  accion   text NOT NULL,
  clave    text,
  antes    jsonb,
  despues  jsonb,
  legacy_id text UNIQUE
);
CREATE INDEX IF NOT EXISTS auditoria_tabla_ts_idx ON core.auditoria (tabla, ts DESC);

-- ───────────── Privado ─────────────
CREATE TABLE IF NOT EXISTS private.credenciales (
  usuario           text PRIMARY KEY,           -- ID de empleado o usuario de guardia
  tipo_cuenta       text NOT NULL CHECK (tipo_cuenta IN ('EMPLEADO','GUARDIA')),
  password_hash     text,                       -- bcrypt; null = debe crear contraseña (D-06)
  debe_cambiar      boolean NOT NULL DEFAULT true,
  intentos_fallidos int NOT NULL DEFAULT 0,
  bloqueado_hasta   timestamptz,
  actualizado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private.secretos (
  clave text PRIMARY KEY,
  valor text NOT NULL
);

CREATE TABLE IF NOT EXISTS private.schema_migrations (
  version    text PRIMARY KEY,
  aplicada_en timestamptz NOT NULL DEFAULT now()
);
