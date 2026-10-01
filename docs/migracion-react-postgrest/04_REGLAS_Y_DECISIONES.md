# 04 — Reglas de negocio verificadas y decisiones pendientes

Extraídas del código en `ac53c18`. Las reglas marcadas ⚠️ tienen versiones distintas en distintos módulos: **la IA no debe elegir**; el dueño del negocio responde en la tabla de decisiones (§2) antes de la Fase 1.

## 1. Reglas verificadas

| # | Regla | Valor actual | Evidencia |
|---|---|---|---|
| R-01 | Geocerca oficina | Haversine, centro **-0.1288771313385675, -78.47896772889067** (Quito), radio **250 m** (configurable en `configuracion/sistema`) | `tcontrol_core.js`, `index_core.js` → `verificarDistanciaEmpresa` |
| R-02 | Geocerca modo campo | Base del propio empleado (`baseLat/baseLng`, la fija él con "Fijar base"), radio **300 m**; sin base no puede marcar en campo ⚠️ D-07 | `verificarDistanciaEmpresa`, `fijarBaseCampo` |
| R-03 | Hora de entrada de referencia | **07:30** (07:00 en día festivo, solo en panel supervisor) | `supervisor_core.js` `HORA_ENTRADA_REF = 450`, línea ~12570 |
| R-04 | Minutos de atraso | Si entrada > 07:30 + **5 min** de tolerancia, atraso = entrada − 07:30 (desde 07:30, no desde 07:35) ⚠️ D-01 | `index_core.js` → `calcularMinutosAtraso`; supervisor `mins - refEnt > 5` |
| R-05 | Justificación de entrada tardía | La app pide motivo si la entrada es posterior a **07:45** ⚠️ D-01 | `esEntradaTardia`, `HORA_ENTRADA_LIMITE` |
| R-06 | Pasantes | Sin atraso ni bolsa de 4 h; "Por Regularizar" solo si falta entrada o salida; flujo de salida propio | `esEmpleadoPasante` (cargo/área/tipo contiene PASANTE/PASANTÍA) |
| R-07 | Hora de salida | **16:15** lunes a viernes; salida antes pide confirmación, tipo y motivo | `HORA_SALIDA_REF = 975`, `esAntesDeSalida` |
| R-08 | Jornada ordinaria neta | Tramos recortados a [07:30, 16:15]; se restan **45 min** de almuerzo si trabajó > 4 h y no hubo pausa real (salida entre 11:30 y 14:30 con regreso ≥ 30 min después). Esperado: **480 min** en día laborable, 0 en festivo | `calcularNetWorkedOrdinario` |
| R-09 | Bolsa de 4 horas por período | 240 min de libre disponibilidad por período (no pasantes) que absorben déficit no justificado; solo el excedente cuenta como "tiempo por justificar"/descuento | `supervisor_core.js` `saldoBeneficio4h` |
| R-10 | Por Regularizar | Tras la bolsa, tiempo por justificar > **60 min**; "Sin Entrada"/"Sin Salida" si neto < 240; inasistencia sin justificar; se excluye el día en curso | `obtenerFechasPendientesRegularizarEmpleado` |
| R-11 | Cumpleaños | Beneficio institucional de **4 h** (240 min justificados) si ese día tiene faltante | modal Gestión de jornada (`esCumpleHoy`) |
| R-12 | Horas extra automáticas | SALIDA > referencia + **45 min** → `horasExtra = SI`, `autoriza = 'SISTEMA (>45 MIN)'`; modo CAMPO → `SI` / `'SISTEMA (CAMPO)'` ⚠️ D-02 (referencia de fin de semana) | `firebase_backend.js` → `guardarRegistro` |
| R-13 | Autorización de extras en Taller | Coordinadores autorizan por día (en la ENTRADA de hoy); se reinicia a diario | `actualizarAutorizacionExtras`, `resetearAutorizacionesDiarias` |
| R-14 | Almuerzo | Elección hasta **09:30** (`almuerzo_activo`); si la SALIDA es antes de 09:30, almuerzo = NO; el supervisor puede cambiarlo; cocina marca consumo una vez por día | `horaLimiteAlmuerzoPasada`, `guardarRegistro`, `marcarAlmuerzoConsumido` |
| R-15 | Invitados | No fechas pasadas; para hoy: almuerzo extra hasta **09:40**, sánduche hasta **08:40**, galletas sin límite; fechas futuras sin corte; **no disponible para Taller** (área o cargo) | `crearSolicitudInvitado` |
| R-16 | Período | Del **26** del mes anterior al **25** del mes ⚠️ D-03 | `index_core.js` (`dia >= 26`), `supervisor_core.js` |
| R-17 | Doble marcación | Rechazar si la última marcación de hoy es del mismo tipo | `guardarRegistro` |
| R-18 | Ausencia por día | Una novedad por empleado y día; la nueva reemplaza a la anterior | `guardarRegistro` |
| R-19 | Emergencia | El estado ("A salvo" o "Requiere ayuda", más comentario) exige ENTRADA de hoy y se guarda en ella | `guardarRegistro` tipo `ESTADO`, `enviarReporteEmergencia` |
| R-20 | Inasistencias | Se cuentan desde `fecha_ingreso` (o primera marcación); nunca el día en curso | `obtenerFechaInicioEfectivaEmpleado` |
| R-21 | Autocompletar salidas | Últimos 7 días (sin hoy), activos que no sean "SIN ASISTENCIA", con ENTRADA/RETORNO_CAMPO y sin SALIDA/SALIDA_CAMPO → SALIDA 16:15 L-V (15:15 fin de semana ⚠️ D-02), `AUTO_COMPLETAR`, `justificado NO`, "No registró salida" | `autocompletar_salidas.gs` |
| R-22 | Dispositivo | Un dispositivo activo por empleado | `registrarDispositivoConPIN` |
| R-23 | WhatsApp automático | "No registró entrada" a la hora de corte (**08:15**) en días configurados (L-V), una vez por día | `openwa_service.js` → `ejecutarChequeoAutomatico` |
| R-24 | Feriados | Tres listas distintas (ver D-17) ⚠️ | `index_core.js` `esFeriado`, `supervisor_core.js` `esFeriadoODomingo`, `api_completa.gs` `esFeriadoEcuador` |

## 2. Decisiones pendientes (responder antes de la Fase 1)

| ID | Pregunta | Situación actual | Recomendación |
|---|---|---|---|
| D-01 | ¿Cuál es la regla de atraso? | Minutos desde 07:30 con 5 min de tolerancia, pero justificación obligatoria recién después de 07:45 | Confirmar que ambas son intencionales y parametrizarlas por separado |
| D-02 | Salida de referencia en sábado, domingo y feriado | Panel supervisor: **15:00** en sábado, domingo y feriado (entrada 07:00); marca de horas extra al guardar: **15:00** sábado y **07:30** domingo (casi todo el domingo cuenta como extra); autocompletar: **15:15** sábado y domingo. ¿El sábado es laborable y cuántas horas se esperan? | Definir un solo horario por tipo de día en una tabla `horarios` |
| D-03 | ¿Período 26–25 para todos los cálculos y reportes? | Sí en historial y detalle; los reportes también ofrecen mes calendario y quincenas | Confirmar |
| D-04 | Vacaciones | Los saldos salen de fórmulas de la hoja `CALCULAR_vacaciones` (no están en el código) | Entregar las fórmulas; reimplementar en SQL con pruebas contra los valores actuales |
| D-05 | Fotos de perfil | URLs de Drive o base64 en la base | Almacenamiento de archivos (disco del servidor, MinIO/S3) y solo la ruta en la base |
| D-06 | Contraseñas | SHA-256 sin sal, filtradas; mínimo 4 caracteres | Todos crean contraseña nueva en el primer ingreso; mínimo 6 (y 8 para supervisores/admin) |
| D-07 | Base de modo campo | El empleado fija su propia base en cualquier lugar | Bases asignadas por supervisor o sitios/proyectos predefinidos |
| D-08 | "Reporte fuera de área" | El empleado se auto-justifica (`justificado: 'SI'`) | Guardar como `PENDIENTE` hasta aprobación y mostrar en "Por Regularizar" |
| D-09 | Motivos y menú | Se capturan pero no se guardan | Guardarlos (son evidencia laboral) |
| D-10 | Roles de pago | Enlace de SharePoint por empleado en el campo `id_dispositivo` | Mantener enlace en `url_rol_pagos` |
| D-11 | Google Sheets | Histórico, cálculos y exportes | Postgres como fuente única; Sheets solo como exportación opcional |
| D-12 | WhatsApp | OpenWA en PC local + túnel público | Worker en servidor con llave en variable de entorno; evaluar API oficial de Meta |
| D-13 | Hosting | GitHub Pages (repo público) | Repo privado; servidor propio o VPS para PostgreSQL + PostgREST + frontend |
| D-14 | Guardia | Una clave compartida | Cuentas individuales por guardia |
| D-15 | Hora oficial | Hora del teléfono en `hora` | Hora del servidor; hora del teléfono solo como auditoría |
| D-16 | `diagnostico.html` | Pruebas de conectividad de la arquitectura vieja | Reemplazar por una página de estado del sistema o eliminar |
| D-17 | Feriados | Tres listas distintas; la del supervisor repite Carnaval y Viernes Santo de 2026 en todos los años | Tabla `feriados` mantenida por admin, con feriados trasladados |
| D-18 | "Faltas injustificadas se toman como vacaciones" | Solo es un aviso de texto | Confirmar si debe descontarse automáticamente |
| D-19 | Suplantación de GPS | No detectable en una app web | Aceptar el límite o sumar un QR rotativo en la entrada |
| D-20 ✅ | Backend de `asistencia-v2` | Hoy es Node/Express (`POST /api/action`) sobre PostgreSQL, sin autenticación; no se encontró PostgREST (ver `06_DIAGNOSTICO_V2_ACTUAL.md` §1) | Montar PostgREST 12 sobre la misma base según §4 del prompt maestro y retirar el Express al terminar la Fase 2 |
| D-21 ✅ | Centro de la geocerca | Código legado: `-0.1288771, -78.4789677`; base actual: `-0.129202, -78.477511` (≈165 m de diferencia) | Confirmar cuál es la coordenada correcta de la planta |
| D-22 ✅ | Frontend `asistencia-v2` actual | Construido con la documentación errónea (selfie, menú Dieta/Vegetariano, kiosco, tema oscuro) | Conservarlo como prototipo y rehacer en TypeScript portando marcado y CSS de `legacy/` |
| D-23 ✅ | Módulo Kiosco (PinPad compartido) | No existe en el legado | Eliminar, salvo que se apruebe como funcionalidad nueva |

## 3. Defectos actuales que NO deben replicarse
1. Roles y sesión en `localStorage`; admin por ID fijo `1058`; autenticación en el navegador.
2. Reglas de Firestore abiertas; secretos en el frontend.
3. Fechas "hoy" con `toISOString()` (UTC).
4. Hora de marcación tomada del teléfono.
5. `justificarDia` sobrescribe el `timestamp` original de las marcaciones.
6. `eliminarDuplicados()` conserva la primera fila por (fecha, ID, tipo) aunque sea la automática.
7. Motivos y menú capturados pero no guardados (D-09).
8. El aviso automático de WhatsApp depende de que un supervisor tenga el panel abierto.
9. Funciones auxiliares duplicadas con comportamientos distintos entre archivos; tres listas de feriados.
10. Valores inconsistentes (`activo` = `'SI'`/`'si'`/`true`; `supervisor` con 6 variantes).
11. Texto con doble codificación (`MIÃ‰RCOLES`) en la columna DIA de registros antiguos.

## 4. Decisiones respondidas

| ID | Respuesta del usuario (2026-09-29) | Consecuencia |
|---|---|---|
| D-20 | PostgREST sobre **la misma base PostgreSQL** que hoy usa el Express | Fase 1 crea los esquemas `api` y `private` en esa base; el Express se retira cuando el nuevo frontend deje de usarlo |
| D-21 | Centro de la planta: **-0.12910, -78.47815** | Reemplaza a R-01 (el legado y la base actual quedan desactualizados); radio 250 m sin cambio |
| D-22 | Sí: el frontend actual queda como prototipo; se rehace en TypeScript portando pantallas y estilos del legado | — |
| D-23 | **Se conserva el Kiosco** (funcionalidad nueva aprobada, no existe en el legado) | Debe cumplir las mismas reglas del servidor (hora oficial, geocerca, doble marcación) |
| Legado | No se copia como `legacy/`; la fuente de verdad es el repo `GitHub/Asistencia` (commit `ac53c18`) | Las rutas `legacy/...` de este paquete se leen como `../../Asistencia/...` |
| D-01 | OK: referencia **07:30**, tolerancia **5 min** (atraso contado desde 07:30 si entra después de 07:35), justificación obligatoria después de **07:45**. Tres parámetros separados en `configuracion` | R-04/R-05 confirmadas |
| D-02 | Sábado, domingo y feriado: entrada **07:00**, salida **15:15**. Lunes a viernes: 07:30–16:15 | Tabla `horarios` por tipo de día (`LABORABLE`, `SABADO`, `DOMINGO`, `FERIADO`). La marca automática de horas extra (+45 min) y el autocompletar usan la salida del tipo de día. Reemplaza los 15:00 / 07:30 / 15:15 del legado |
| D-03 | OK: período **26–25** para historial, bolsa de 4 h, Por Regularizar y saldos; los reportes conservan además mes calendario y quincenas | — |
| D-04 | Fórmulas entregadas en `CONTROL_ASISTENCIA_2026.xlsx` (no versionado). Ver §5 | — |
| D-05, D-07, D-08, D-09, D-14, D-15, D-17 | OK a la recomendación | D-17: falta la lista oficial de feriados |
| D-06 | OK: todos crean contraseña nueva; mínimo 6 (empleado) / 8 (supervisor, admin); 5 fallos → 15 min; el supervisor puede resetear | Kiosco y guardia: ver pregunta abierta P-02 |
| D-23 (bis) | Kiosco **sin cámara** | Se elimina `CameraCapture` |

## 5. Regla de vacaciones (D-04), extraída de `CALCULAR_vacaciones`

- **Años de servicio** `y` = años completos entre `fecha_ingreso` y el **31/12 del año en curso** (`DATEDIF(ingreso, DATE(año,12,31), "y")`).
- **Días adjudicados del año (B)** según `y`:

| y | < 1 | 1–5 | 6 | 7 | 8 | 9 | 10–12 | 13 | 14 | 15 | 16 | 17–19 | ≥ 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| días | 0 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 |

- **Saldo del año anterior (A)**: dato manual por empleado (col. F), no calculado. Se migra como `saldo_inicial` del año.
- **Total** = A + B. **Tomadas** = cantidad de filas `TIPO = 'VACACIONES'` en la hoja `VACACIONES` para el ID con `FECHA <= hoy`. **Restantes** = Total − Tomadas.
- La columna E ("años de servicio") es un valor escrito a mano; no se usa en el cálculo.

Preguntas abiertas: ver P-03 y P-04.

## 6. Preguntas abiertas (2026-09-29)

| ID | Pregunta | Contexto |
|---|---|---|
| P-01 | ¿Cuál es la lista oficial de feriados? | D-17 |
| P-02 | ¿Kiosco y guardia marcan con la contraseña del empleado, o el kiosco usa un PIN aparte? | D-06 |
| P-03 | "Tomadas" cuenta **todas** las fechas de la hoja `VACACIONES`, incluidas 127 filas de **2025**. ¿El saldo del año anterior (A) ya descuenta esos días de 2025? Si es así, hoy se descuentan dos veces | D-04 |
| P-04 | La tabla de días tiene saltos (10–12 años = 16; 17–19 = 21). ¿Es intencional o debería subir un día por año? | D-04 |
| P-05 | D-18: ¿las faltas injustificadas se descuentan de vacaciones o solo se muestra el aviso (como hoy)? | Sin respuesta explícita; se mantiene el aviso |
| P-06 | Fin de semana/feriado 07:00–15:15: ¿todo lo trabajado es hora extra o solo lo que pase de 15:15 + 45 min? ¿Hay atraso si entra después de 07:05? | D-02 |
| P-07 | Hay 5 selfies (base64) guardadas por el prototipo v2 en `registros.raw_data->'foto'` (29-sep, 2 empleados). ¿Se eliminan esas fotos? ¿Esas 20 marcaciones del prototipo son reales o de prueba? | C-01, LOPDP |
| P-08 | ¿Qué sistema está en producción hoy: el legado Firebase (y la base PostgreSQL es una copia) o ya se marca contra el Express? ¿Cómo se sincronizan? | Define el ETL y la Fase 7 |
| P-09 | ¿Quiénes son Supervisor Admin y Admin Master? En la base solo quedó `SUPERVISOR` (4 personas) | Roles de la Fase 1 |
| P-10 | La hoja `VACACIONES` tiene **días repetidos** (mismo empleado y fecha en varias filas) y `COUNTIFS` los cuenta dos veces: 8 empleados afectados (el mayor, 19 filas para 10 días). La base nueva cuenta **días distintos**. ¿Se corrige así (recomendado) o se replica el conteo de la hoja? | D-04; ver reporte de conciliación del ETL |
| P-11 | Tres registros de desvinculados con tipo `SALIDA_DE_TCONTROL` / `SALIDA_TCONTROL` (ago-2026) no corresponden a ningún tipo conocido y no se importaron. ¿Se descartan o equivalen a `SALIDA`? | ETL |

**Supuestos de la Fase 1 (a confirmar):** mientras se responde P-09, el ID `1058` queda como `ADMIN` (paridad con el legado) y los otros 3 supervisores como `SUPERVISOR`; en fin de semana y feriado el límite para exigir motivo de atraso es 07:15 (P-06); feriados 2026 cargados desde la lista de `supervisor_core.js` como `PROVISIONAL` (P-01); solicitudes de invitados históricas sin estado se importan como `ENTREGADO`.

## 7. Respuestas del 2026-09-29 (tarde)

| ID | Respuesta | Implementación |
|---|---|---|
| P-10 | **Replicar la hoja**: las filas repetidas cuentan como días tomados | `core.vacaciones_saldo_inicial.dias_duplicados_legado` (migración 006). 8 empleados, 23 filas. Con esto 93 de 95 empleados dan igual que `CALCULAR_vacaciones`; los 2 restantes: 1036 tiene una vacación del 29-sep aún no pasada a la hoja `VACACIONES` (correcto), y 1053 tiene el 22-sep como VACACIONES en la hoja `VACACIONES` y como FALTA en `REGISTROS` (**revisar**; hoy gana FALTA) |

**Fase 2 — supuestos a confirmar:** (1) para crear la contraseña en el primer ingreso se pide la **cédula registrada** (sin ese dato, cualquiera que conozca un ID —son números correlativos— podría adueñarse de la cuenta); quien no tenga cédula registrada recibe una contraseña temporal de su supervisor. (2) Duración de sesión: empleado y guardia 30 días (PWA con dispositivo vinculado), supervisor y admin 12 horas. (3) Al vincular un dispositivo nuevo se cierra la sesión del anterior (R-22). (4) Un supervisor no puede resetear a otro supervisor ni a un admin; un supervisor admin sí resetea supervisores.

## 8. Respuestas del 2026-09-29 (Fase 2 → 3)

| ID | Respuesta | Implementación |
|---|---|---|
| P-09 | 1058 = ADMIN; 7, 8 y 1000 = SUPERVISOR (no hay Supervisor Admin por ahora) | Ya así en el ETL |
| Supuestos Fase 2 | Confirmados: cédula al crear contraseña; sesión 30 días (empleado/guardia) y 12 h (supervisor/admin) | 007 |
| P-02 | El kiosco marca con la **contraseña del empleado** | `api.marcar_kiosco` (Fase 3) |
| P-07 | **Borrar** las 5 selfies de la base real | Se quita `raw_data->'foto'` de esos registros (se conservan las marcaciones) |
| 1053 | El 22-sep fue **vacación** | En choques, la VACACIONES de la hoja prevalece sobre una FALTA del mismo día |

## 9. Respuestas del 2026-09-30 (Fase 3, app del empleado)

| ID | Respuesta | Implementación |
|---|---|---|
| P-12 | Modo CAMPO solo a **más de 250 km** de la planta (es la regla del legado, no un error) | `core.configuracion.app_empleado.campo_distancia_minima_m = 250000` |
| P-13 | Re-entrada tras "Voy a regresar (Permiso)": el legado dejaba el botón en "JORNADA FINALIZADA" (defecto); se corrige | Botón "REGISTRAR RE-ENTRADA" tras una salida con permiso y luego "REGISTRAR SALIDA" |
| P-14 | Motivo de entrada tardía (D-01): en el legado la pantalla existía pero nunca se mostraba; se activa | `api.marcar` exige motivo si la primera ENTRADA del día pasa del límite (07:45) |
| D-07 | Confirmado: el empleado ya no fija su base de campo | La app muestra "Proyecto asignado por supervisor" |
| P-15 | Aviso legal LOPDP, cláusula 2: hablaba de "fotografía / selfie" biométrica que no existe; se ajusta | Nueva cláusula "Fotografía de Perfil (Sin Captura Biométrica)" |

## 10. Fase 4 — terminales (2026-09-30)

| Tema | Legado | Nuevo |
|---|---|---|
| Acceso guardia | Clave compartida `TCONTROL2026` escrita en el JS | Usuario y contraseña por guardia (D-14); contraseña temporal que se cambia al primer ingreso |
| R-14 en guardia | La guardia guardaba "En planta" a cualquier hora | El servidor aplica R-14 igual que en la app; el aviso de éxito indica cuando el almuerzo quedó fuera de planta |
| Salida anticipada | Advertencia con la hora del teléfono | Misma advertencia (16:15) con la hora del servidor |
| Acceso catering | ID + PIN de 4 dígitos | ID + contraseña del supervisor; sin vincular dispositivo |
| Kiosco | No existía | Nuevo (D-23), sin cámara, con la contraseña del colaborador (P-02), estilo de la terminal de guardia |
| Actualización forzada remota | `forzar_actualizacion_ts` en Firestore cada 15 min | Service worker con `autoUpdate` y comprobación cada 15 min (igual que la app) |

## 11. Fase 5 — panel de supervisor (2026-09-30)

**D-24 (nueva).** El panel conserva el motor de cálculo del legado portado 1:1 a TypeScript
(`app/src/supervisor/legado/*.ts`: detalle, control diario, dashboard, reportes, desgloses). La base entrega los
registros con la forma del legado (`private.registros_legado`) para que los mismos cálculos den los mismos números:

- Los motivos que escribe el colaborador (`motivo_entrada_tardia`, `motivo_salida`, `tipo_salida`, `razon_permiso`)
  se entregan solo para mostrar (`*_empleado`) y no justifican (D-08). Las filas del archivo de Sheets sin editar
  sí exponen `razon_salida`, `razon_entrada_tardia` y `tipo_salida`, como las leía `normR`.
- Los reportes del colaborador pendientes de aprobación (D-08) llegan como tipo `ESTADO` con `pendiente_aprobacion`.
- Los minutos de `ajustes_dia` van en la ENTRADA del día (o en el primer registro); un día solo con minutos llega
  como `AJUSTE_TIEMPO`.
- Las ausencias importadas de Firestore sin editar se entregan como las normalizaba el legado: `justificado` vacío =
  `SI` y la hora del documento o, si falta, la de su `timestamp` (migración 013). Los datos guardados no cambian.

**Paridad de reportes** (`node app/scripts/paridad-supervisor.mjs --periodos 6`, base de desarrollo): el motor se
aplica a los registros como los veía el legado (copia de Firestore + filas de la hoja + vacaciones de la hoja) y a los
de la base nueva. Detalle por colaborador y período: 95 % idéntico; reporte mensual por colaborador (asistencias,
faltas, atrasos, permisos, por justificar, a descontar, almuerzos, extras, entradas/salidas): 616 de 648 filas
idénticas. Todas las diferencias vienen de los datos de origen, no del cálculo: salidas `AUTO_COMPLETAR` y
marcaciones que solo existen en la hoja (el legado las ocultaba si Firestore tenía registros ese día), usuarios de
prueba y una hora cruda anómala (1058, 29/09).

| Tema | Legado | Nuevo |
|---|---|---|
| Datos del panel | Firestore (~60 días) + Sheets en memoria | `api.sup_datos` (60 días) y `api.sup_registros` / `api.sup_solicitudes_invitados` bajo demanda para períodos anteriores, anual e histórico |
| PIN en la ficha | Campo PIN | Campo Cédula (no hay PIN, D-06) |
| Cambio de rol | Cualquier supervisor desde la ficha | Supervisor Admin asigna Supervisor; solo el Admin asigna Supervisor Admin; el rol ADMIN no se cambia desde la ficha |
| Horas extra manuales | Se recalculaban | Un valor explícito del supervisor se respeta |
| Guardar horas en Gestión de jornada | Dejaba la novedad del día | La novedad del día se elimina al guardar horas (el día deja de ser ausencia) |
| Directorio: Inactivos | Siempre 0 (solo activos en memoria) | Se conserva el comportamiento |
| Tarjetas de "Resumen Mensual" | Sin SweetAlert cargado: solo mostraban un aviso | Mismo aviso |
| Exportar a Google Sheets | Hoja nueva `Rep_…` vía Apps Script | Pendiente del worker de integraciones (Fase 6); el botón lo indica y Excel queda disponible |
| PDF de KPIs | html2pdf desde CDN | html2pdf.js 0.14 (sin la vulnerabilidad de jspdf ≤ 4.2.0) cargado bajo demanda; fuera del precache del PWA |
| Modales "Justificar" y "Desglose de inasistencias" | Código presente pero inalcanzable (sus contenedores no existen en `supervisor.html`) | No se migran |
| WhatsApp desde el panel | OpenWA llamado desde el navegador con la API key escrita en `openwa_service.js` | Configuración y plantillas en la base **sin** la llave (va en variable de entorno del worker, D-12); prueba, envíos masivos e individuales se encolan (`WHATSAPP_MENSAJE`, log `EN_COLA`) y los envía el worker de la Fase 6; "Abrir chat (wa.me)" funciona igual |
| Estado "Conectado" de OpenWA | Petición directa del navegador al servidor OpenWA | Último latido que publica el worker (`core.configuracion.whatsapp_worker`); sin worker figura "Desconectado" |
| Recordatorio automático "no registró entrada" | Solo corría si un supervisor tenía el panel abierto (defecto §5.7) | Se guarda la configuración (hora de corte, días, enlace); lo ejecuta el servidor en la Fase 6 |
| Días de envío automático | Los checkboxes no se guardaban | Se guardan en `core.configuracion.whatsapp.dias_envio` |
| Imágenes y plantillas personalizadas | `localStorage` del navegador de cada supervisor | `core.whatsapp_plantillas` (compartidas; imagen reducida a 1200 px) |
| Tabla de auditoría | Las celdas no coincidían con los encabezados (Origen bajo "Mensaje") | Filas alineadas con sus encabezados |
| Registrar celular desde el mensaje individual | `actualizarEmpleado` (cualquier supervisor) | `api.sup_guardar_telefono` (cualquier supervisor, número normalizado) |
| Opciones: flujo Google Sheets "ACTUALIZAR" | Escribía/leía una hoja vía Apps Script | Archivo Excel `ACTUALIZAR.xlsx`: se descarga, se edita y se sube con vista previa (D-11) |
| Opciones: PIN en formulario y pegado | Campo/columna PIN de 4 dígitos | Cédula (la contraseña la crea el colaborador, D-06); una columna PIN pegada se ignora |
| Opciones: "Eliminar Usuarios" | Borraba el documento del empleado | Baja lógica (`eliminado_en`, sin acceso); el histórico se conserva (LOPDP) |
| Opciones: desvincular | Movía las filas a la hoja `DESVINCULADOS` | `core.desvinculaciones` con copia de la ficha; el colaborador queda inactivo y sus registros permanecen (filtro "Desvinculados" en Reportes) |
| Opciones: archivado histórico | Traspasaba Firestore → Sheets | No aplica: la base conserva todo el histórico; el botón lo indica |
| Opciones: forzar actualización | Señal en Firestore leída por la app | `sistema.forzar_actualizacion`; la leen la app, las terminales y el panel (`api.version_forzada`, cada 15 min) |
| Opciones: acceso | Admin Master (1058 fijo en el código) | Rol `ADMIN` de la base; su rol no se puede cambiar ni dar de baja |
| Avisos a Sup. Admin de invitados (recordatorio y cancelación) | OpenWA desde el navegador | `core.cola_notificaciones` (`RECORDATORIO_INVITADOS`, `CANCELACION_INVITADO`); los envía el worker de la Fase 6 |
| Menú semanal | Firestore + archivo del anterior en la hoja `HISTORIAL_MENU` desde el navegador | `api.sup_guardar_menu` archiva y publica en una sola transacción; sugerencias desde `core.historial_menu` |
| Cultura Tcontrol | Banco en Firestore/Sheets; interruptor general guardado también en `localStorage` | `api.sup_guardar_cultura` (reemplaza el banco, valida ≥ 2 opciones) y `api.sup_cultura_global` (`core.configuracion.cultura`) |
| Pedidos de invitados cancelados | `obtenerListaConsolidadaInvitados` los omite (el filtro "Cancelado" no muestra filas) | Se conserva el comportamiento |
| Radar `ubicacion.html` | Firestore desde el navegador; geocerca escrita en el código | `api.sup_radar` (marcaciones de hoy con la geocerca de `core.configuracion.sistema`, D-21); Leaflet y fuentes empaquetados, sin CDN; recarga cada 60 s |
| `admin_config.html` | Sup. Admin / Admin Master; el aviso verde decía "guardada exitosamente" también ante errores | `api.sup_config_sistema` / `api.sup_guardar_config_sistema` (las horas de inicio, límite y salida también actualizan `core.horarios`); el aviso muestra el mensaje real (rojo en errores) |
| Modo mantenimiento | Se guardaba pero ninguna pantalla lo aplicaba | Se conserva: solo se guarda |
| "Activar/Desactivar Firebase" y "Migración a Firebase" | Botones de la transición a Firestore | No aplican; se retiran |
| Restablecer contraseñas de todos | Borraba el PIN de todas las cuentas | `api.sup_resetear_contrasenas_todos('BORRAR')`: solo cuentas de colaborador y supervisor (no Sup. Admin ni Admin, ni la del que ejecuta); cada uno crea su contraseña con su cédula |
| `diagnostico.html` | Pruebas JSONP contra la URL de Apps Script | Estado real del servidor (`api.sup_estado_sistema`, D-16): hora oficial, migración, datos de hoy, cola de notificaciones y latido del worker; requiere sesión de supervisor |
| Simulador de Vista (`visor_empleado.html`) | Escribía en `localStorage` una sesión falsa del colaborador (`SIM_<id>`) y abría la app en un iframe: el simulador podía marcar en nombre de otro | **Respuesta P-16 (2026-10-01):** sesión de solo lectura emitida por el servidor (`api.sup_simular_empleado`, migración 019): Sup. Admin y Admin, 30 min, auditada; la transacción queda en solo lectura (no se puede marcar ni modificar). El token viaja en el fragmento de la URL del iframe y no se guarda en el navegador. La ficha muestra "Contraseña: Creada/Pendiente" en lugar del PIN |

**P-16 (respondida 2026-10-01).** Sí: sesión de solo lectura emitida por el servidor (ver fila anterior). Un Sup. Admin
no puede simular a otro Sup. Admin ni al Admin.

**P-08 (respondida 2026-10-01).** En producción está el legado Firebase (`asistencia.tcontrolsa.com`). Fase 7: el
personal sigue marcando ahí; cada noche se copian sus marcaciones a la base nueva y se comparan los reportes.

## 12. Fase 6 — automatizaciones e integraciones (2026-10-01)

Sin `pg_cron` en la imagen: un worker Node (`worker/`) con rol propio `tcontrol_worker` (solo ejecuta
`private.worker_*`) dispara las tareas cada minuto; la decisión de qué corre y cuándo está en SQL
(`private.worker_tareas`) y cada ejecución queda en `core.tareas_ejecuciones`.

| Tema | Legado | Nuevo |
|---|---|---|
| Horario de las tareas | Activadores de Apps Script (horas no están en el repositorio, C-17) | **Confirmado (2026-10-01):** reset de autorizaciones 00:05 y autocompletar 00:30 (`core.configuracion.tareas`, editable). Si el worker estuvo caído, al volver corre lo pendiente del día |
| Autocompletar salidas | Hoja `REGISTROS`; 16:15 L-V y 15:15 sábado/domingo; un feriado entre semana quedaba a las 16:15 | Misma regla sobre `core.marcaciones`; hora de salida del tipo de día (D-02: feriado 15:15). `origen SISTEMA`, `dispositivo AUTO_COMPLETAR`, `justificado NO`, "No registró salida" |
| Regularizar fin de semana | Recorría toda la hoja en cada ejecución | Igual (en la base de desarrollo corrigió 1 salida: 1069, 04-jul, 16:15 → 15:15) |
| Reset de autorizaciones | Columna AUTH_EXTRAS de `EMPLEADOS` a NO | `core.empleados.auth_extras` a NO. La autorización del día ya vive en la ENTRADA de hoy (`api.autorizar_extras`) |
| Aviso "no registró entrada" | Solo si un supervisor tenía el panel abierto después de la hora de corte (defecto §3.8) | Lo ejecuta el servidor a la hora de corte, en los días marcados, si el panel lo tiene activo; mismo filtro "sin marcar" y plantilla `no_registro` (con su imagen) |
| Avisos por evento (invitados, novedad fuera de área, nuevo colaborador) | OpenWA desde el navegador; sin destinatarios caía en 2 teléfonos escritos en el código | Mismos textos, a Sup. Admin y Admin con teléfono (nuevo colaborador: también supervisores). Sin destinatarios se descarta (no hay teléfonos en el código) y queda en la auditoría |
| Bienvenida a nuevo colaborador | "crear y registrar tu contraseña o PIN personal de 4 dígitos" | "crear tu contraseña personal (ten a mano tu número de cédula)" (D-06) |
| Auditoría de avisos automáticos | Solo la bienvenida se registraba | Todos los mensajes quedan en `core.whatsapp_logs` (origen `AUTOMATICO`) |
| Reintentos | Sin reintento | 3 intentos (2 y 4 min); "número no registrado en WhatsApp" no se reintenta. Mensajes con más de 12 h sin enviarse se descartan como vencidos |
| Ritmo de envío | 1,2 s entre mensajes del envío masivo | 1,2 s entre todos los mensajes (`WHATSAPP_PAUSA_MS`) |
| Modo de prueba | — | `WHATSAPP_MODO=simulacion` (por defecto): no llama a OpenWA, la auditoría muestra `SIMULADO`; `WHATSAPP_SOLO_NUMEROS` limita destinatarios |
| Exportar a Google Sheets | Apps Script `crearReporteGoogleSheets` en el archivo de la hoja | Cuenta de servicio de Google (`GOOGLE_CREDENCIALES`, `SHEETS_ID`): misma pestaña `Rep_…`/`AlmExt_…`, encabezado azul, hojas del sistema protegidas. **Pendiente:** crear la cuenta de servicio y compartir el archivo con ella |
| Archivar Firestore > 60 días | `archivador_diario.gs` | No aplica (D-11): la base conserva el histórico |
| `mantenimiento_registros.gs` | Ejecución manual: completar DIA/NOMBRE, borrar duplicados, horas extra >45 min, cruces con vacaciones | No aplica: día y nombre se derivan; no hay duplicados que borrar (y conservar la primera fila era un defecto, §3.6); R-12 se aplica al marcar (`003_reglas.sql`); los cruces con vacaciones los resuelve la regla del ETL |

**Pendiente de configuración en el servidor (no en el repositorio):** `OPENWA_API_KEY` (y `OPENWA_URL` si cambia),
`WHATSAPP_MODO=real` cuando se apruebe enviar, y las credenciales de Google para Sheets.

