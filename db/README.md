# Base de datos — TCONTROL Asistencia (PostgreSQL + PostgREST)

Fase 1 del plan de `docs/migracion-react-postgrest/00_PROMPT_MAESTRO.md`.

## Esquemas

| Esquema | Expuesto por PostgREST | Contenido |
|---|---|---|
| `public` | No | Tablas actuales del Express (`empleados`, `registros`, …). **No se modifican**; son la fuente del ETL. |
| `core` | No | Tablas nuevas con RLS (`empleados`, `marcaciones`, `novedades`, `ajustes_dia`, …). |
| `api` | **Sí** | Vistas `security_invoker` (aplican RLS) y funciones RPC. |
| `private` | No | Credenciales (bcrypt), secretos, reglas de negocio y helpers. |

Roles: `authenticator` (con el que se conecta PostgREST) → `anon`, `empleado`, `guardia`, `supervisor`, `supervisor_admin`, `admin`. Jerarquía: `admin ⊃ supervisor_admin ⊃ supervisor ⊃ empleado`.

## Comandos

Todos apuntan a `asistencia_v2_dev` salvo `--db` y, para la base real, `--produccion` explícito.

```bash
node db/scripts/clonar-dev.js            # crea asistencia_v2_dev y copia public.* desde la base real (solo lectura)
node db/scripts/migrate.js               # aplica db/migrations/*.sql pendientes
node db/scripts/migrate.js --reset       # (solo dev) borra api/core/private y vuelve a migrar
node db/etl/etl.js                       # public.* + CONTROL_ASISTENCIA_2026.xlsx → core.*  (idempotente)
node db/etl/etl.js --simular             # igual, pero revierte al final
node db/scripts/test.js                  # pruebas de reglas, permisos y autenticación (dentro de BEGIN…ROLLBACK)
node db/scripts/generar-secretos.js      # completa en .env la clave de authenticator y el secreto JWT (sin mostrarlos)
node db/scripts/probar-http.js --url http://192.168.10.129:3001   # prueba de humo contra PostgREST levantado
```

El reporte de conciliación queda en `db/etl/reportes/` (no versionado: contiene IDs de empleados).

## Reglas de negocio (003_reglas.sql)

| Función | Regla |
|---|---|
| `private.hoy()`, `private.ahora_local()` | Fecha y hora en America/Guayaquil (nunca UTC) |
| `private.tipo_dia`, `private.horario` | LABORABLE 07:30–16:15; SÁBADO/DOMINGO/FERIADO 07:00–15:15 (D-02) |
| `private.minutos_atraso` | Tolerancia 5 min, cuenta desde la referencia; pasantes y SIN ASISTENCIA = 0 (R-04, R-06) |
| `private.requiere_motivo_entrada` | Motivo obligatorio después de 07:45 (R-05) |
| `private.es_salida_anticipada`, `private.horas_extra_auto` | Salida anticipada; extra automática si salida > referencia + 45 min o modo CAMPO (R-07, R-12) |
| `private.almuerzo_abierto`, `private.almuerzo_en_salida` | Corte 09:30 (R-14) |
| `private.validar_solicitud_invitado` | Cortes 09:40 / 08:40, sin fechas pasadas, sin Taller (R-15) |
| `private.periodo` | Período 26–25 (R-16) |
| `private.validar_geocerca` | Haversine; oficina -0.12910, -78.47815, 250 m (D-21); campo: base asignada, 300 m (R-02) |
| `private.vacaciones_adjudicadas` | Tabla de `CALCULAR_vacaciones` (D-04) |

Horarios, cortes y coordenadas viven en `core.horarios` y `core.configuracion`; no se repiten en el frontend.

## PostgREST

`db/postgrest/docker-compose.yml` levanta PostgREST 12 en el puerto 3001, al lado del Express. Requiere en `.env`:
`PGRST_AUTHENTICATOR_PASSWORD`, `PGRST_DB_URI` (usuario `authenticator`), `PGRST_JWT_SECRET`. El login que emite el JWT es de la Fase 2.

## Autenticación (007_autenticacion.sql, Fase 2)

| RPC | Quién | Qué hace |
|---|---|---|
| `api.login(p_usuario, p_password, p_dispositivo?)` | anon | bcrypt; 5 fallos → bloqueo 15 min (HTTP 429); sin contraseña → `CREAR_PASSWORD` (403); vincula el dispositivo |
| `api.crear_password(p_usuario, p_cedula, p_password, p_dispositivo?)` | anon | Primer ingreso (D-06): exige la cédula registrada; mínimo 6 (8 para supervisor/admin/guardia) |
| `api.cambiar_password(p_actual, p_nueva)` | sesión | Cambia y devuelve sesión nueva; invalida las anteriores |
| `api.resetear_password(p_empleado_id, p_password_temporal?)` | supervisor+ | Sin temporal: el colaborador vuelve a crearla con su cédula. Con temporal: debe cambiarla al ingresar. No sobre roles iguales o superiores (salvo admin) |
| `api.resetear_passwords_todos()` | admin | Reseteo masivo |
| `api.guardar_guardia(p_usuario, p_nombre, p_activo, p_password?)` | supervisor_admin+ | Cuentas individuales de guardia (D-14) |
| `api.mi_sesion()` | sesión | Datos de la sesión actual |

El JWT (HS256) lo firma la base con `private.secretos.jwt_secret` = `PGRST_JWT_SECRET`. Claims: `role`, `usuario`, `empleado_id`, `rol_app`, `dispositivo`, `debe_cambiar`, `iat`, `exp` (empleado y guardia 30 días, supervisor/admin 12 h; en `core.configuracion.auth`).
`private.verificar_sesion()` corre antes de cada petición (`PGRST_DB_PRE_REQUEST`) y rechaza con 401 si la cuenta se desactivó, cambió de rol, cambió o se reseteó la contraseña, o si se vinculó otro dispositivo; con 403 si debe cambiar la contraseña.

## App del empleado (008_app_empleado.sql, Fase 3)

`api.mi_contexto`, `mis_registros`, `mis_dias_faltantes`, `marcar` (geocerca, hora del servidor, doble marcación,
motivo de atraso, almuerzo, horas extra automáticas), `reportar_estado_hoy` (D-08, queda PENDIENTE y se encola el aviso),
`justificar_faltas`, `cambiar_almuerzo`, `crear_solicitud_invitado` / `cancelar_solicitud_invitado`, `guardar_perfil`,
`subir_foto` / `foto` (image/jpeg), `personal_taller` / `autorizar_extras`, `reportar_estado_emergencia`,
`cambiar_emergencia`, `cultura_pregunta_del_dia` / `responder_cultura` (la respuesta correcta no sale al cliente) y `cerrar_sesion`.
Los avisos de WhatsApp quedan en `core.cola_notificaciones` para el worker (Fase 6).

Pruebas por hora con reloj simulado: `private.ahora_local()` respeta `app.ahora` solo si la sesión tiene
`app.permitir_reloj_simulado = on` y no es `authenticator` (nunca a través de PostgREST).

Desarrollo sin Docker: `node db/scripts/pgrst-dev.js` emula lo que la app usa de PostgREST (solo desarrollo).

## Guardia, catering y kiosco (009_guardia_catering_kiosco.sql, Fase 4)

`private.marcar_asistido` aplica las mismas reglas que `api.marcar` a una marcación hecha por un tercero: activo,
SIN_ASISTENCIA, tipo que corresponde (ENTRADA → SALIDA → jornada completada), geocerca con el GPS del terminal,
almuerzo obligatorio en la ENTRADA y R-14 (después de las 09:30 el almuerzo queda fuera de planta; el legado no lo
aplicaba en la guardia).

- Guardia: `api.guardia_buscar`, `api.marcar_guardia` (origen y dispositivo `GUARDIA`, `creado_por` = usuario del guardia), `api.presentes_hoy`.
- Catering (supervisor): `api.lista_catering`, `api.marcar_consumido` (una vez por día, con quien lo registró).
- Kiosco (anon, con la contraseña del colaborador): `api.kiosco_identificar`, `api.marcar_kiosco` (origen `KIOSCO`); los fallos cuentan para el bloqueo.

Cuentas de prueba de desarrollo: `db/seeds/dev_prueba_terminales.sql`.

## Panel de supervisor (Fase 5)

Lectura con la forma de registro del legado (D-24, `private.registros_legado`):

- `api.sup_datos(p_desde?)`: fichas, registros de los últimos 60 días, emergencia activa, solicitudes de invitados,
  saldos de vacaciones y feriados. `api.sup_registros(desde, hasta, empleado?)` y
  `api.sup_solicitudes_invitados(desde, hasta)` traen rangos anteriores (reportes, anual, histórico).
- Escritura (010–012): almuerzo, ausencias, gestión de jornada, permisos, edición de horas, registro manual, eventos
  futuros, trabajo en campo, solicitudes de invitados, ficha y alta de colaboradores, foto.
- Gestión & Servicios (014): `api.sup_emergencia_estado`, `api.cambiar_emergencia`, `api.sup_menu` / `api.sup_guardar_menu`,
  `api.sup_cultura` / `api.sup_guardar_cultura` / `api.sup_cultura_global`, `api.sup_estado_invitado`,
  `api.sup_eliminar_invitado`, `api.sup_notificar_invitados` (avisos de WhatsApp en `core.cola_notificaciones`).
- Los cálculos (jornada neta, bolsa de 4 h, por regularizar, KPIs, reportes) se hacen en el navegador con el motor
  portado del legado; `node app/scripts/paridad-supervisor.mjs` compara sus números contra los datos del legado.

## Pendiente para fases siguientes

- Tareas programadas (autocompletar salidas, avisos WhatsApp): la imagen actual no tiene `pg_cron`; irán en el worker.
