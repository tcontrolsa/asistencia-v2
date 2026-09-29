# 03 — Datos reales y migración a PostgreSQL

Verificado contra el código (`JS/firebase_backend.js`, `backend/apps_script/*.gs`) en `ac53c18`. Hoy los datos viven en **dos lugares**: Firestore (operación diaria, ~60 días) y Google Sheets (histórico, vacaciones, desvinculados, almuerzos extra). La base nueva debe unificar ambos.

## 1. Firestore — colecciones y campos reales

### `empleados` (ID del documento = ID/cédula como texto, p. ej. `"10"`, `"1058"`)
| Campo | Valores reales | Notas para migrar |
|---|---|---|
| `id` | `"10"`, `"1058"` | A veces número en vez de texto: normalizar a texto. |
| `nombre` | Mayúsculas | |
| `area`, `cargo` | Texto libre | `cargo` tiene valores con semántica: `SOLO ALMUERZO` / `SOLO_ALMUERZO` / `SIN ASISTENCIA` (no marcan asistencia), cargos con "PASANTE" (sin atraso), coordinadores de producción/taller (pestaña Extras). Convertir en **columnas explícitas** (`tipo_asistencia`, `es_pasante`, `puede_autorizar_extras`) sin perder el texto original. |
| `activo` | `'SI'`, `'si'`, `'NO'`, `true`, `false` (inconsistente) | Normalizar a boolean. |
| `supervisor` / `rol` | `'SI'`, `'NO'`, `'SUPERVISOR'`, `'SUPERVISOR ADMIN'`, `'SUPERVISOR_ADMIN'`, `'ADMIN_SUPERVISOR'`, `'ADMIN'` | Mapear a enum de rol. Admin Master hoy = ID 1058 en el código. |
| `pin` | SHA-256 hex (64), texto plano corto (legado) o vacío | **No migrar como credencial válida** (ver D-06). Solo `tiene_password` boolean. |
| `deviceToken` | `DEV_XXXXXXXX` | Tabla `dispositivos`. |
| `id_dispositivo` | **URL del rol de pagos** (SharePoint), pese al nombre | Renombrar a `url_rol_pagos`. |
| `foto_url` | URL de Google Drive, `lh3.googleusercontent.com`, o **base64 JPEG** | Migrar a almacenamiento de archivos (D-05). |
| `telefono` / `celular` | Texto | Para WhatsApp (normalizar a `593XXXXXXXXX`). |
| `fechaNacimiento` | `YYYY-MM-DD` | |
| `fecha_ingreso` | `YYYY-MM-DD` | Afecta cálculo de inasistencias (no cuenta días previos). |
| `baseLat`, `baseLng` | Número o null | Base para modo campo. |
| `authExtras` | `'SI'`/`'NO'` | |
| `cultura_habilitada`, `cultura_activa` | boolean (duplicados) | Unificar. |
| `creado`, `esSupervisor`, `cedula`, `estado`, `tipo` | Varios, parcial | Revisar en Fase 0. |

### `registros` (un documento por marcación; ID `{empleadoId}_{tipo}_{fecha}_{hhmmss}`)
Campos: `empleadoId`, `nombre`, `fecha` (`YYYY-MM-DD`; en datos viejos también `DD/MM/YYYY`), `hora` (`HH:mm:ss`, **hora del teléfono**), `timestamp` (Firestore; hora del servidor en marcaciones normales), `tipo`, `almuerzo` (`SI`/`NO`/vacío), `lat`, `lng`, `dispositivo` (`DEV_…`, `GUARDIA`, `APP_COLABORADOR_EXTERNO`, `MANUAL`…), `modo` (`OFICINA`/`CAMPO`), `horasExtra` (`SI`/`NO`), `autoriza` (`SISTEMA (>45 MIN)`, `SISTEMA (CAMPO)`, nombre de supervisor), `justificado`, `quien_justifica`, `razon_justificac`, `razon_ausencia`, `observacion(es)`, `estado` y `estado_timestamp` (emergencia, en la ENTRADA del día), `permiso_personal_mins`, `permiso_medico_mins`, `tiempo_justificado_mins`, `razon_permiso`.

**No se persisten hoy** aunque la app los envía: `razon_salida`, `razon_entrada_tardia`, `quien_justifica_entrada`, `tipo_salida`, y el menú (`sopa`, `almidon`, `proteina1`, `proteina2`, `ensalada`, `otro`, `jugo`). Ver D-09.

### Otras colecciones
| Colección | Campos reales |
|---|---|
| `dispositivos` (ID = token) | `id_dispositivo`, `id_empleado`, `fecha_registro`, `ultimo_uso`, `activo` |
| `configuracion/sistema` | `valor: { ubicacion:{lat,lng,radio}, horarios:{hora_almuerzo, hora_entrada_limite, hora_salida, almuerzo_activo, hora_inicio, hora_fin, marcacion_automatica, tiempo_automatico}, registro:{tolerancia_gps, requiere_foto, permite_registro_manual}, otras:{whatsapp_number, mensaje_soporte, modo_mantenimiento} }` |
| `configuracion/emergencia` | `activa`, `nombre`, `habilitadoPor`, `fecha` |
| `configuracion/menu_semanal` | `lunes…domingo: { sopa, plato, jugo }` |
| `configuracion/cultura_preguntas` | `habilitado`, `preguntas[]: {id, tipo, pilar, clasePilar, iconoPilar, pregunta, pista, opciones[{letra, texto, correcta}], activo}` |
| `configuracion/whatsapp` | `servidorUrl`, `servidorUrlLocal`, `apiKey`, `activo`, `autoEnvioNoRegistro`, `horaCorteNoRegistro`, `diasEnvio[]`, plantillas (`plantillaNoRegistro`, `plantillaAusente`, `plantillaVacaciones`, `plantillaPermiso`, `plantillaSalidaFaltante`, `plantillaEmergencia`…), `imagenesPlantillas{}` |
| `consumo_almuerzos` (ID `{empleadoId}_{fecha}`) | `empleadoId`, `nombre`, `fecha`, `timestamp`, `hora` |
| `auditoria_almuerzos` | Cambios de almuerzo por supervisor y menús archivados |
| `solicitudes_invitados` | `fecha`, `hora`, `tipoSolicitud`, `subtipo` (`ALMUERZO_EXTRA`, `REFRIGERIO_SANDUCHE`, `REFRIGERIO_GALLETAS`), `cantidad`, `invitado`, `empresa`, `empleadoId`, `empleadoNombre`, `empleadoArea`, `horaServicio`, `observaciones`, `observacionesCompletas`, `estado` (`SOLICITADO`, `CONFIRMADO`, `ENTREGADO`, `CANCELADO`), `creadoPor`, `actualizadoPor`, `fechaActualizacion`, `timestamp` |
| `empleados_desvinculados` | Copia del empleado + `fechaDesvinculacion`, `motivoDesvinculacion`, `desvinculadoPor`, `observaciones`, `timestampDesvinculacion` |
| `logs_whatsapp` | `fecha`, `hora`, `nombreEmpleado`, `idEmpleado`, `tipoNotificacion`, `estado`, `detalleRespuesta`, `createdAt` |
| `logs` | Eventos generales |

## 2. Tipos de registro reales
Marcaciones: `ENTRADA`, `SALIDA`, `ENTRADA_CAMPO`, `SALIDA_CAMPO`, `RETORNO_CAMPO`, `SOLO_ALMUERZO`, `ESTADO` (emergencia; no crea documento, actualiza la ENTRADA).
Ausencias / novedades: `VACACIONES`/`VACACION`, `PERMISO`, `PERMISO_PERSONAL`, `PERMISO_MEDICO`, `CALAMIDAD_DOMESTICA`, `FALTA`, `FALTA_JUSTIFICADA`, `SALIDA_JUSTIFICADA`, `TRABAJO_DE_CAMPO`, `SALIDA_A_CAMPO`, `JUSTIFICACION`, `INASISTENCIA`, `FERIADO`.
`tipo_salida`: `FINAL`, `PERMISO`, `PERMISO_CON_SALIDA_TEMPRANA`, `TRABAJO_CAMPO`, `SALIDA_PASANTE`, `SALIDA_TEMPRANA_JUSTIFICADA`.

## 3. Google Sheets (histórico y cálculos)
| Hoja | Contenido | Migración |
|---|---|---|
| `REGISTROS` | Histórico de marcaciones, 25 columnas A–Y (ver `01_CORRECCIONES…` C-05) | Importar a `marcaciones`. Fechas en varios formatos (Date, `YYYY-MM-DD`, `DD/MM/YYYY`); `DIA` con valores antiguos dañados (`MIÃ‰RCOLES`, `SÃBADO`). |
| `VACACIONES` | Días de vacación (mismas columnas) | Importar a `novedades`. |
| `CALCULAR_vacaciones` | **Saldos de vacaciones calculados con fórmulas** (col. A/B = ID, G = adjudicadas, I = tomadas, J = restantes) | ⚠️ **Las fórmulas no están en el repositorio.** Exportarlas y reimplementarlas en SQL (D-04). |
| `EMPLEADOS` | Maestro en Sheets (A ID, B nombre, C área, D activo, E foto, F rol de pagos, G PIN, H token, I supervisor, M teléfono, N cargo, R nacimiento, S/T base) | Conciliar con Firestore. Columnas J, K, L, O, P, Q sin mapear: revisar. |
| `DESVINCULADOS` | Colaboradores desvinculados y sus registros respaldados | Importar. |
| `ALMUERZOS_EXTRA` | Histórico de pedidos de invitados | Importar a `solicitudes_invitados`. |
| `CONSUMO_ALMUERZOS`, `AUDITORIA_ALMUERZOS`, `HISTORIAL_MENU` | Consumos y menús | Importar. |
| `CONFIGURACION`, `CULTURA_PREGUNTAS`, `LOGS_WHATSAPP`, `DISPOSITIVOS` | Copias de configuración y logs | Importar lo que no esté en Firestore. |
| `ACTUALIZAR`, `BASE`, `REPORTE_MANTENIMIENTO`, `Rep_*` | Hojas de trabajo | No migrar como datos; `ACTUALIZAR` es un flujo de carga masiva que hay que replicar o reemplazar. |

## 4. Propuesta de esquema PostgreSQL (punto de partida para la Fase 1)
- `empleados` (id text PK, nombre, area, cargo, rol enum, activo bool, es_pasante bool, tipo_asistencia enum, puede_autorizar_extras bool, auth_extras bool, telefono, fecha_nacimiento date, fecha_ingreso date, base_lat, base_lng, url_rol_pagos, foto_path, cultura_habilitada bool, creado_en, actualizado_en)
- `private.credenciales` (empleado_id PK/FK, password_hash bcrypt, debe_cambiar bool, intentos_fallidos, bloqueado_hasta) — **nunca expuesta** por PostgREST.
- `dispositivos` (token PK, empleado_id FK, activo, registrado_en, ultimo_uso)
- `marcaciones` (id bigserial, empleado_id FK, tipo enum, ts_servidor timestamptz default now(), ts_dispositivo timestamptz, fecha date y hora time generadas en America/Guayaquil a partir de `ts_servidor`, lat, lng, distancia_m, dispositivo, modo, almuerzo bool, horas_extra bool, autoriza, tipo_salida, motivo_entrada_tardia, quien_justifica_entrada, motivo_salida, quien_justifica, menu jsonb, origen enum [app, guardia, supervisor, sistema, importado], estado_emergencia, estado_emergencia_ts, legacy_id text)
- `novedades` (ausencias/justificaciones por día: empleado_id, fecha, tipo, justificado enum [SI, NO, PENDIENTE], motivo, quien_justifica, minutos_permiso_personal, minutos_permiso_medico, minutos_justificados, creado_por, origen)
- `vacaciones_saldos` (o vista calculada, según D-04), `feriados` (fecha, nombre, ámbito)
- `configuracion` (clave, valor jsonb) con los mismos parámetros actuales
- `menu_semanal`, `cultura_preguntas`, `consumo_almuerzos`, `solicitudes_invitados`, `emergencias` (evento) + estado por colaborador, `desvinculaciones`, `whatsapp_config` (sin API key; la llave va en el worker), `whatsapp_plantillas`, `whatsapp_logs`, `auditoria` (quién cambió qué y cuándo).

## 5. Reglas para el ETL
1. Idempotente y re-ejecutable (usa `legacy_id` para no duplicar).
2. Deduplicar Firestore vs `REGISTROS`: hoy la misma marcación puede estar en ambos (clave `empleadoId|fecha|tipo|hh:mm`).
3. Normalizar fechas y horas a America/Guayaquil; conservar el valor original en una columna de auditoría si hubo conversión.
4. Reporte de conciliación por empleado y mes: marcaciones, atrasos, horas extra, almuerzos, vacaciones (origen vs destino).
5. No importar contraseñas (D-06).

## 6. Insumos que debe entregar el usuario (no están en el código)
- [ ] Copia de la hoja de cálculo completa **con fórmulas** (Archivo → Descargar → .xlsx), en especial `CALCULAR_vacaciones`.
- [ ] Captura de **Activadores** del proyecto de Apps Script (función, frecuencia y hora).
- [ ] Exportación completa de Firestore (o acceso para el ETL).
- [ ] Lista de feriados oficiales a usar desde 2027.
- [ ] Capturas de pantalla de referencia (ver `05_DISENO.md` §4).

## 7. Base PostgreSQL actual (`asistencia` en 192.168.10.129:5432) — inventario del 2026-09-29

PostgreSQL 16.15 (imagen Alpine). Solo esquema `public`, sin RLS, sin claves foráneas, sin funciones ni vistas. Extensiones instaladas: `plpgsql`; disponible: `pgcrypto`. **No hay `pg_cron` ni `pgtap`** en la imagen: las tareas programadas irán al worker (o a una imagen propia con `pg_cron`). El Express se conecta con `tcontrol`, que es **superusuario** (con él no se aplica RLS).

| Tabla | Filas | Observaciones |
|---|---|---|
| `empleados` | 105 | `activo` todo `'SI'`; `rol` solo `EMPLEADO` (101) / `SUPERVISOR` (4): **se perdió la distinción Supervisor Admin / Admin**. `fecha_ingreso` **vacía en los 105** (fuente: hoja `CALCULAR_vacaciones` col. D). `telefono` vacío en 104 (fuente: hoja `EMPLEADOS` col. M). 28 fotos en base64. `raw_data` vacío: faltan `authExtras`, `id_dispositivo` (rol de pagos), `baseLat/baseLng` originales, `cultura_activa`. `pin` presente (no se migra, D-06). |
| `registros` | 23 791 | Solo **2026-03-26 → 2026-09-29** (la hoja `REGISTROS` tiene 23 974 filas). `raw_data` guarda el documento original con `tipoSalida`, `razonEntradaTardia`, `razonSalidaTemprana`, `quienJustificaEntrada` (casi siempre vacíos, ver D-09). `modo` mezcla `OFICINA`/`EMPRESA` (normalizar). `almuerzo` vacío en 5 378. `timestamp` es texto `Date.toString()` de JS. 70 filas de empleados que ya no existen (desvinculados). 2 duplicados por `empleado|fecha|tipo|hh:mm`. Tipos presentes: ENTRADA, SALIDA, SOLO_ALMUERZO, FALTA, TRABAJO_DE_CAMPO, PERMISO_MEDICO, SALIDA_JUSTIFICADA, ENTRADA_CAMPO, FERIADO, FALTA_JUSTIFICADA, CALAMIDAD_DOMESTICA, PERMISO_PERSONAL, SALIDA_CAMPO, VACACIONES (3), **CUMPLEANOS** (nuevo, 2). |
| `configuracion` | 2 | `sistema` (ubicación, horarios, registro, otras, emergencia, supervisores) y `menu_semanal`. Falta `cultura_preguntas`, `whatsapp`. |
| `emergencias` | 1 | Evento actual. |
| `estados_emergencia` | 0 | |
| `almuerzos_extra` | 0 | Estructura distinta a `solicitudes_invitados` (C-07). |

**No existen todavía:** `dispositivos`, `consumo_almuerzos`, `solicitudes_invitados` (76 filas en hoja `ALMUERZOS_EXTRA`), `vacaciones` (887 filas en hoja `VACACIONES`; en la base solo 3), `desvinculados` (1 309 filas en hoja), `auditoria_almuerzos`, `historial_menu`, `cultura_preguntas`, `logs_whatsapp`, feriados, credenciales.

**Registros escritos por el prototipo v2** (sin `raw_data` de Firestore): 20 ENTRADA de 2 empleados (28 y 29-sep). **5 de ellos guardan una selfie en base64 en `raw_data->'foto'`** (C-01, LOPDP): decidir si se eliminan (P-07).

Fuentes para el ETL, entonces: base actual (marcaciones 26-mar → hoy) + libro `CONTROL_ASISTENCIA_2026.xlsx` (maestro de empleados completo, vacaciones, desvinculados, invitados, consumos, menú, cultura, logs) + Firestore si sigue operando (ver P-08).
