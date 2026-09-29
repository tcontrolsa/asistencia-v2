# 04 — Catálogo y Mapa de Funcionalidades

**Sistema:** TCONTROL — Sistema de Gestión y Control Biométrico de Asistencia (2026)  
**Fecha de Análisis:** 2026-09-29  
**Estado:** [VERIFIED]  

---

## 1. Módulo: App del Colaborador (PWA Móvil)

---

### FUNC-EMP-001: Vinculación Inicial del Dispositivo (Enrollment de Token)
- **ID:** `FUNC-EMP-001`
- **Nombre:** Registro y Vinculación Inicial de Smartphone
- **Descripción:** Vincula el navegador del teléfono del colaborador a su registro laboral mediante la generación de un token criptográfico único (`DEV_XXXX`), evitando accesos no autorizados desde múltiples dispositivos.
- **Actor:** Empleado
- **Entrada:** Cédula / ID de empleado, creación de nuevo PIN numérico de 4 dígitos.
- **Proceso:**
  1. Verifica que el ID exista en la base y esté activo (`activo == 'SI'`).
  2. Comprueba si el empleado ya tiene un PIN registrado en Firestore.
  3. Si no tiene PIN, solicita confirmación y calcula el hash SHA-256 (`hashPassword`).
  4. Genera `deviceToken` con formato `DEV_XXXX` (`tcontrol_core.js:L457`).
  5. Guarda en Firestore: colección `dispositivos/{deviceToken}` con `{ id_empleado, activo: true, fecha_registro, ultimo_uso }` y actualiza `empleados/{id}` con `{ deviceToken, pin: hashedPin }`.
  6. Guarda `TCONTROL_DEVICE_TOKEN` en `localStorage`.
- **Resultado:** Dispositivo enrolado exitosamente; redirige a la pantalla de credencial.
- **Pantalla:** `index.html` (Vista Login / Modal Registro Dispositivo)
- **Endpoint / Acción:** `FirebaseBackend.registrarDispositivoConPIN` (`JS/firebase_backend.js:L556`)
- **Componente:** `JS/index_core.js` -> `registrarDispositivo()`
- **Servicio:** `FirebaseBackend` (o fallback GAS `registrarDispositivo`)
- **Modelo / Tabla:** Colecciones `dispositivos`, `empleados` (o Hojas Sheets `DISPOSITIVOS`, `EMPLEADOS`)
- **Integraciones:** Ninguna
- **Permisos:** Empleado con ID registrado en nómina

---

### FUNC-EMP-002: Autenticación por PIN y Apertura de Sesión
- **ID:** `FUNC-EMP-002`
- **Nombre:** Desbloqueo de Credencial por PIN
- **Descripción:** Valida la identidad del colaborador al abrir la PWA para acceder a su credencial digital interactiva.
- **Actor:** Empleado
- **Entrada:** PIN numérico de 4 dígitos ingresado en teclado virtual en pantalla.
- **Proceso:**
  1. Lee `TCONTROL_DEVICE_TOKEN` desde `localStorage`.
  2. Verifica que el token esté activo en la colección `dispositivos`.
  3. Obtiene el PIN almacenado en el documento del colaborador (`empleados/{id}`).
  4. Compara hash SHA-256 del PIN ingresado con el valor almacenado en BD (o texto plano si fue asignado de forma legacy).
  5. Si es válido, carga datos del perfil en memoria (`empActual`) y libera la interfaz.
- **Resultado:** Sesión desbloqueada; muestra la credencial virtual del colaborador.
- **Pantalla:** `index.html` (Modal PIN)
- **Endpoint / Acción:** `FirebaseBackend.verificarPIN` (`JS/firebase_backend.js:L390`)
- **Componente:** `JS/index_core.js` -> `verificarPIN()`
- **Servicio:** `FirebaseBackend`
- **Modelo / Tabla:** Colección `empleados`, `dispositivos`
- **Integraciones:** Web Crypto API (`crypto.subtle`) con fallback `sha256PureJs`
- **Permisos:** Colaborador activo

---

### FUNC-EMP-003: Marcación Biométrico-Satelital (Entrada / Salida / Campo)
- **ID:** `FUNC-EMP-003`
- **Nombre:** Registro de Asistencia con Geocerca GPS y Captura Fotográfica
- **Descripción:** Captura la presencia del colaborador mediante validación simultánea de coordenadas satelitales (dentro del radio de la empresa o en campo) y fotografía selfie de verificación.
- **Actor:** Empleado
- **Entrada:** Tipo de evento (`ENTRADA`, `SALIDA`, `SALIDA_ALMUERZO`, `RETORNO_ALMUERZO`, `SALIDA_CAMPO`, `RETORNO_CAMPO`), coordenadas GPS actuales, selfie capturada por cámara web.
- **Proceso:**
  1. Invoca `navigator.geolocation.getCurrentPosition` con `enableHighAccuracy: true`.
  2. Determina coordenadas centrales: usa las del colaborador (`baseLat`, `baseLng`) si existen; de lo contrario usa `LAT_EMPRESA`, `LNG_EMPRESA`.
  3. Ejecuta fórmula de Haversine (`calcularDistancia`). Si `distancia > RADIO_METROS` (250m) y no es evento de campo, bloquea el registro con alerta visual.
  4. Activa cámara frontal `<video>`, proyecta frame al `<canvas>`, comprime a Base64 JPEG.
  5. Evalúa si la entrada es tardía (`hora > 07:45`) o la salida es anticipada (`hora < 16:15`), solicitando motivo de justificación.
  6. Construye ID determinístico: `{id}_{tipo}_{fecha}_{horaSinDosPuntos}`.
  7. Persiste el documento en Firestore (`registros/{id}`).
- **Resultado:** Marcación confirmada con sonido y vibración háptica; actualiza el estado de la credencial en tiempo real.
- **Pantalla:** `index.html` (Vista `home`, modal de cámara)
- **Endpoint / Acción:** `FirebaseBackend.guardarRegistro` (`JS/firebase_backend.js:L1014`)
- **Componente:** `JS/index_core.js` -> `ejecutarMarcacion()`
- **Servicio:** `FirebaseBackend` / `navigator.geolocation` / `navigator.mediaDevices`
- **Modelo / Tabla:** Colección `registros` (y respaldo en Hoja `REGISTROS`)
- **Integraciones:** LOPDP Ecuador Art. 25 (Consentimiento biométrico puntual)
- **Permisos:** Empleado enrolado

---

### FUNC-EMP-004: Selección y Reserva del Menú de Almuerzos
- **ID:** `FUNC-EMP-004`
- **Nombre:** Pedido de Menú Diario de Comedor
- **Descripción:** Permite al colaborador elegir su opción de alimentación para el día en curso antes de la hora límite oficial (09:30 AM).
- **Actor:** Empleado
- **Entrada:** Opción de plato: `Normal`, `Dieta`, `Vegetariano`, o `No almuerzo`.
- **Proceso:**
  1. Valida si la hora actual es menor o igual a `HORA_LIMITE_ALMUERZO` (09:30).
  2. Si superó las 09:30, bloquea la selección a menos que el supervisor haya deshabilitado la restricción.
  3. Registra la preferencia en el registro diario del empleado (`almuerzo = opcion`) en `registros`.
  4. Crea o actualiza el documento en `consumo_almuerzos/{fecha}_{empleadoId}` con estado `pendiente`.
- **Resultado:** Menú reservado; la opción elegida se refleja en la credencial y en la terminal de Catering.
- **Pantalla:** `index.html` (Vista `almuerzo`)
- **Endpoint / Acción:** `FirebaseBackend.guardarRegistro` / `actualizarAlmuerzoSupervisor`
- **Componente:** `JS/index_core.js` -> `seleccionarOpcionAlmuerzo()`
- **Servicio:** `FirebaseBackend`
- **Modelo / Tabla:** Colecciones `registros`, `consumo_almuerzos`
- **Integraciones:** Ninguna
- **Permisos:** Empleado activo

---

### FUNC-EMP-005: Trivia de Cultura Corporativa TCONTROL
- **ID:** `FUNC-EMP-005`
- **Nombre:** Evaluación Lúdica de Cultura y Valores
- **Descripción:** Módulo de gamificación que presenta preguntas institucionales (valores corporativos, seguridad industrial, políticas de calidad).
- **Actor:** Empleado
- **Entrada:** Selección de respuesta múltiple (A, B, C, D).
- **Proceso:**
  1. Verifica si el módulo está activo para la empresa y para el empleado (`cultura_habilitada !== false`).
  2. Carga preguntas desde `configuracion/cultura_preguntas`.
  3. Comprueba si el colaborador ya respondió en el día o ciclo actual.
  4. Acumula puntos y genera retroalimentación visual inmediata.
- **Resultado:** Puntuación registrada en el perfil del colaborador.
- **Pantalla:** `index.html` (Sección Cultura)
- **Endpoint / Acción:** `FirebaseBackend.obtenerPreguntasCultura`, `guardarRespuestaCultura`
- **Componente:** `JS/index_core.js` -> `iniciarTriviaCultura()`
- **Servicio:** `FirebaseBackend`
- **Modelo / Tabla:** Colección `configuracion/cultura_preguntas`, `empleados/{id}`
- **Integraciones:** Ninguna
- **Permisos:** Empleado con cultura activa

---

### FUNC-EMP-006: Botón de Pánico y Reporte de Emergencias
- **ID:** `FUNC-EMP-006`
- **Nombre:** Notificación Inmediata de Estado en Emergencia
- **Descripción:** Permite a los colaboradores reportar su condición física y localización exacta ante una catástrofe, sismo o simulacro de seguridad.
- **Actor:** Empleado
- **Entrada:** Estado (`ESTOY_BIEN`, `NECESITO_AYUDA`, `FUERA_DE_PLANTA`), comentario opcional, GPS automático.
- **Proceso:**
  1. Lee coordenadas satelitales inmediatas.
  2. Guarda el estado en `emergencias_respuestas/{fecha}_{empleadoId}` o log de emergencia con timestamp exacto.
  3. Emite alerta en el tablero del supervisor en tiempo real.
- **Resultado:** Estado reportado al Comité de Seguridad Operacional.
- **Pantalla:** `index.html` (Botón flotante `#fabEmergencia` y vista `estado`)
- **Endpoint / Acción:** `FirebaseBackend.toggleEmergencia` / registro directo en Firestore
- **Componente:** `JS/index_core.js` -> `reportarEstadoEmergencia()`
- **Servicio:** `FirebaseBackend`
- **Modelo / Tabla:** Colección `configuracion/emergencia`, `logs`
- **Integraciones:** Ninguna
- **Permisos:** Todos los empleados

---

### FUNC-EMP-007: Consulta de Historial y Saldos de Vacaciones
- **ID:** `FUNC-EMP-007`
- **Nombre:** Consulta de Marcaciones Propias y Saldo Vacacional
- **Descripción:** Visualización de horas trabajadas, atrasos del mes y días de vacaciones restantes.
- **Actor:** Empleado
- **Entrada:** Mes/año o consulta de saldo actual.
- **Proceso:**
  1. Consulta marcaciones en Firestore para el mes en curso.
  2. Invoca caché o endpoint de Google Apps Script `obtenerVacacionesEmpleado` para traer KPIs individuales (`adjudicadas`, `tomadas`, `restantes`).
- **Resultado:** Gráficos de cumplimiento y tabla detallada de asistencia.
- **Pantalla:** `index.html` (Vista `history`)
- **Endpoint / Acción:** `FirebaseBackend.obtenerVacacionesEmpleado` (`JS/firebase_backend.js:L186`)
- **Componente:** `JS/index_core.js` -> `renderizarHistorial()`
- **Servicio:** `FirebaseBackend` -> Google Sheets `CALCULAR_vacaciones`
- **Modelo / Tabla:** Colección `registros`, Hoja Sheets `CALCULAR_vacaciones`
- **Integraciones:** Motor de cálculo en Google Apps Script
- **Permisos:** Empleado autenticado (solo puede ver sus propios datos)

---

### FUNC-EMP-008: Visor de Rol de Pagos Institucional
- **ID:** `FUNC-EMP-008`
- **Nombre:** Acceso a Rol de Pagos Digital
- **Descripción:** Enlace seguro hacia la visualización de la planilla salarial del empleado.
- **Actor:** Empleado
- **Entrada:** Clic en botón `Rol de Pagos`.
- **Proceso:** Abre el enlace asignado al empleado en el campo `id_dispositivo` o enlace externo parametrizado por Talento Humano.
- **Resultado:** Abre el documento en pestaña segura.
- **Pantalla:** `index.html` (Vista `pagos`)
- **Componente:** `JS/index_core.js`
- **Permisos:** Empleado activo

---

## 2. Módulo: Panel de Supervisión y RRHH (`supervisor.html`)

---

### FUNC-SUP-001: Autenticación de Supervisor y Selección de Área
- **ID:** `FUNC-SUP-001`
- **Nombre:** Acceso al Panel de Control de Asistencia
- **Descripción:** Valida credenciales de supervisión (ID + PIN) y filtra automáticamente los colaboradores según el área bajo mando del supervisor.
- **Actor:** Supervisor / RRHH / Administrador Master
- **Entrada:** ID de empleado supervisor y PIN numérico.
- **Proceso:**
  1. Valida que el empleado tenga marca `supervisor == 'SI'`.
  2. Valida hash de PIN.
  3. Carga áreas autorizadas (o todas si es `ADMIN_MASTER` / ID `1058`).
  4. Establece sesión en `sessionStorage` (`SUPERVISOR_SESSION`).
- **Resultado:** Acceso concedido al dashboard.
- **Pantalla:** `supervisor.html` (Modal Login)
- **Endpoint / Acción:** `FirebaseBackend.obtenerDatosSupervisor`
- **Componente:** `JS/supervisor_core.js` -> `loginSupervisor()`
- **Servicio:** `FirebaseBackend`
- **Modelo / Tabla:** Colección `empleados`
- **Permisos:** Rol `SUPERVISOR` o `ADMIN_MASTER`

---

### FUNC-SUP-002: Dashboard de Control en Tiempo Real (Live Monitor)
- **ID:** `FUNC-SUP-002`
- **Nombre:** Monitor de Asistencia, Puntualidad y Ausentismo
- **Descripción:** Métricas consolidadas en tiempo real: total de presentes en planta, en campo, ausentes, atrasados y personas en almuerzo.
- **Actor:** Supervisor
- **Entrada:** Selector de fecha (por defecto hoy) y filtro de área.
- **Proceso:**
  1. Se suscribe vía `onSnapshot` a `registros` donde `fecha == fechaSeleccionada`.
  2. Cruza con el catálogo activo de `empleados`.
  3. Clasifica estados: Presente (marcó entrada y no salida), En Campo (`MODO == 'CAMPO'`), Atrasado (`entrada > 07:45`), Ausente (sin entrada pasada la hora límite), En Almuerzo (entre salida y retorno).
  4. Actualiza contadores y listado con avatares fotográficos.
- **Resultado:** Tablero de control actualizado dinámicamente cada vez que un colaborador timbra.
- **Pantalla:** `supervisor.html` (Pestaña Asistencia / Monitor)
- **Componente:** `JS/supervisor_core.js` -> `procesarRegistrosTiempoReal()`
- **Servicio:** `FirebaseBackend` (`db.collection('registros')`)
- **Modelo / Tabla:** Colecciones `registros`, `empleados`
- **Permisos:** Supervisor del área correspondiente

---

### FUNC-SUP-003: Justificación de Jornadas, Atrasos y Salidas Tempranas
- **ID:** `FUNC-SUP-003`
- **Nombre:** Gestión de Justificaciones Laborales
- **Descripción:** Permite a RRHH justificar una falta (médica, calamidad, permiso), un atraso o una salida anticipada, registrando el supervisor responsable y el tiempo justificado en minutos.
- **Actor:** Supervisor / RRHH
- **Entrada:** Empleado ID, fecha, tipo de novedad, razón (`MÉDICA`, `PERSONAL`, `CALAMIDAD`, `COMISIÓN`), minutos justificados, observaciones.
- **Proceso:**
  1. Si no existía registro de asistencia, crea un registro de tipo `FALTA_JUSTIFICADA` o actualiza el existente con `justificado = 'SI'`.
  2. Registra campos de auditoría: `quien_justifica`, `razon_justificac`, `tiempo_justificado_mins`, `permiso_medico_mins`, `permiso_personal_mins`.
  3. Actualiza el documento en Firestore y sincroniza con Google Sheets (`actualizarRegistroGeneral`).
- **Resultado:** Novedad regularizada; no se descuenta en los reportes de nómina.
- **Pantalla:** `supervisor.html` (Modal Justificación)
- **Endpoint / Acción:** `FirebaseBackend.justificarDia` / `actualizarRegistroGeneral`
- **Componente:** `JS/supervisor_core.js` -> `guardarJustificacion()`
- **Servicio:** `FirebaseBackend`
- **Modelo / Tabla:** Colección `registros`, Hoja `REGISTROS`
- **Permisos:** Supervisor autorizado

---

### FUNC-SUP-004: Autorización y Cálculo de Horas Extras
- **ID:** `FUNC-SUP-004`
- **Nombre:** Aprobación de Jornada Extraordinaria
- **Descripción:** Evalúa los colaboradores que superaron su horario ordinario (más de 45 minutos después de las 16:15 en laborables o 15:15 en fines de semana) y permite al supervisor aprobar o rechazar el sobretiempo.
- **Actor:** Supervisor
- **Entrada:** Registro ID, estado (`SI` / `NO`), justificación de la labor realizada.
- **Proceso:**
  1. Calcula exceso de jornada sobre las 16:15:00.
  2. Actualiza campos `horasExtra = 'SI'` y `autoriza = 'SUPERVISOR: {Nombre}'`.
  3. Persiste en Firestore y Sheets.
- **Resultado:** Horas extras computables para la exportación de nómina.
- **Pantalla:** `supervisor.html` (Pestaña Horas Extras)
- **Endpoint / Acción:** `FirebaseBackend.actualizarRegistroGeneral`
- **Componente:** `JS/supervisor_core.js` -> `autorizarHorasExtra()`
- **Servicio:** `FirebaseBackend`
- **Modelo / Tabla:** Colección `registros`, Hoja `REGISTROS`
- **Permisos:** Supervisor del área

---

### FUNC-SUP-005: Directorio de Personal, Altas y Desvinculaciones (LOPDP)
- **ID:** `FUNC-SUP-005`
- **Nombre:** Mantenimiento de Catálogo de Empleados
- **Descripción:** Alta de colaboradores, asignación de áreas, configuración de geocercas personales (`baseLat`/`baseLng`), reseteo de contraseñas PIN y desvinculación con traspaso seguro al archivo pasivo de auditoría patronal.
- **Actor:** RRHH / Administrador Master
- **Entrada:** Datos personales, cargo, área, cédula, estado.
- **Proceso:**
  1. **Edición:** Modifica campos en `empleados/{id}`.
  2. **Reseteo PIN:** Borra el campo `pin` en `empleados/{id}` y marca `activo: false` en sus dispositivos para forzar re-enrolamiento.
  3. **Desvinculación:** Mueve el documento a la colección `empleados_desvinculados/{id}`, marca `activo = 'NO'` en la base principal, desactiva tokens de dispositivo y crea registro en la hoja `DESVINCULADOS` amparado en el Art. 21 de la LOPDP.
- **Resultado:** Base de personal actualizada con custodia legal de registros pasivos.
- **Pantalla:** `supervisor.html` (Pestaña Directorio)
- **Endpoint / Acción:** `FirebaseBackend.actualizarEmpleado`, `desvincularColaborador`, `resetearPinesTodosLosEmpleados`
- **Componente:** `JS/supervisor/supervisor_directorio.js`
- **Servicio:** `FirebaseBackend`
- **Modelo / Tabla:** Colecciones `empleados`, `empleados_desvinculados`, `dispositivos`
- **Permisos:** Administrador Master / RRHH

---

### FUNC-SUP-006: Diseñador de Reportes y Exportación Masiva (Excel / PDF)
- **ID:** `FUNC-SUP-006`
- **Nombre:** Generador Dinámico de Reportes de Asistencia
- **Descripción:** Herramienta interactiva para construir informes con filtros por colaborador, rango de fechas y tipo de evento, exportando directamente a Microsoft Excel (XLSX) con estilos corporativos o a documentos PDF de alta resolución.
- **Actor:** Supervisor / RRHH
- **Entrada:** Rango de fechas, selección de empleados/áreas, columnas activas (chips interactivos).
- **Proceso:**
  1. Consulta histórico en Firestore y Google Sheets.
  2. Normaliza horas y fechas con zona horaria de Ecuador (`America/Guayaquil` / GMT-5).
  3. Si es XLSX: genera libro con SheetJS (`XLSX.utils.book_new()`), aplica colores de encabezado azul marino `#1e3a8a` y descarga automática.
  4. Si es PDF: genera documento formateado mediante jsPDF + autoTable con logotipos corporativos y pie legal LOPDP.
- **Resultado:** Archivo descargado en la estación de trabajo.
- **Pantalla:** `supervisor.html` (Pestaña Reportes)
- **Endpoint / Acción:** `FirebaseBackend.obtenerRegistrosArchivados`
- **Componente:** `JS/supervisor/supervisor_reportes_custom.js`
- **Servicio:** SheetJS / jsPDF
- **Modelo / Tabla:** Colección `registros`, Hoja `REGISTROS`
- **Permisos:** Supervisor

---

### FUNC-SUP-007: Notificaciones Masivas e Individuales por WhatsApp
- **ID:** `FUNC-SUP-007`
- **Nombre:** Centro de Alertas y Mensajería WhatsApp
- **Descripción:** Envío de recordatorios automáticos y manuales a colaboradores sin timbrar, avisos de ausencia, alertas de salida no marcada o comunicados personalizados con imagen adjunta.
- **Actor:** Supervisor
- **Entrada:** Filtro de destinatarios (ej: ausentes de hoy), selección de plantilla, imagen adjunta opcional.
- **Proceso:**
  1. Verifica conexión con el túnel Cloudflare (`OpenWAService.probarConexion`).
  2. Normaliza el número telefónico a formato internacional (`5939XXXXXXXX@c.us`).
  3. Reemplaza variables en la plantilla (`{nombre}`, `{hora}`, `{fecha}`, `{link}`).
  4. Despacha vía HTTP POST a OpenWA (`/api/sessions/.../send-text` o `/send-image`).
  5. Registra el log en la colección `logs_whatsapp`.
- **Resultado:** Mensaje institucional entregado al teléfono móvil del colaborador.
- **Pantalla:** `supervisor.html` (Pestaña Notificaciones WhatsApp)
- **Endpoint / Acción:** `OpenWAService.enviarMensajeTexto`, `enviarMensajeImagen`, `FirebaseBackend.registrarLogWhatsApp`
- **Componente:** `JS/supervisor/supervisor_whatsapp.js`, `JS/openwa_service.js`
- **Servicio:** Microservicio Python + OpenWA / WAHA
- **Modelo / Tabla:** Colección `logs_whatsapp`
- **Permisos:** Supervisor

---

### FUNC-SUP-008: Gestión de Invitados y Almuerzos Extra
- **ID:** `FUNC-SUP-008`
- **Nombre:** Autorización de Alimentación para Visitas
- **Descripción:** Registra comensales extraordinarios (clientes, auditores, proveedores o técnicos externos) con cargo al centro de costos de la empresa.
- **Actor:** Supervisor
- **Entrada:** Nombre del invitado, empresa remitente, tipo de dieta, motivo de la visita.
- **Proceso:** Inserta la solicitud en `solicitudes_invitados` y en la hoja `ALMUERZOS_EXTRA` para su preparación por el servicio de catering.
- **Resultado:** Ración sumada a la orden diaria de comedor.
- **Pantalla:** `supervisor.html` (Pestaña Invitados)
- **Componente:** `JS/supervisor/supervisor_invitados.js`
- **Servicio:** `FirebaseBackend`
- **Modelo / Tabla:** Colección `solicitudes_invitados`, Hoja `ALMUERZOS_EXTRA`
- **Permisos:** Supervisor

---

### FUNC-SUP-009: Mapa Satelital de Personal en Tiempo Real
- **ID:** `FUNC-SUP-009`
- **Nombre:** Geomonitoreo de Personal en Campo
- **Descripción:** Mapeo interactivo sobre mapa satelital Leaflet de las últimas posiciones registradas por los colaboradores, identificando quiénes están en planta central vs proyectos externos.
- **Actor:** Supervisor
- **Entrada:** Fecha de visualización, filtros de área.
- **Proceso:** Renderiza marcadores con círculos concéntricos de geocerca (250m) y popups interactivos con foto y hora de timbrado.
- **Resultado:** Representación visual espacial de la fuerza laboral.
- **Pantalla:** `supervisor.html` (Pestaña Mapa)
- **Componente:** `JS/supervisor/supervisor_mapa.js`
- **Servicio:** Leaflet + OpenStreetMap
- **Permisos:** Supervisor

---

## 3. Módulo: Terminal de Guardia (`guardia.html`)

---

### FUNC-GUA-001: Autenticación de Caseta y Clave Maestra
- **ID:** `FUNC-GUA-001`
- **Nombre:** Desbloqueo de Terminal de Garita
- **Descripción:** Activación del terminal de seguridad mediante clave de guardia (`CLAVE_GUARDIA = 'TCONTROL2026'`).
- **Actor:** Guardia de Seguridad
- **Entrada:** Contraseña maestra.
- **Proceso:** Valida clave en `FirebaseBackend.verificarClaveGuardia` o constante interna.
- **Resultado:** Acceso concedido al teclado de marcación rápida.
- **Pantalla:** `guardia.html` (Pantalla Login)
- **Componente:** `JS/guardia_core.js` -> `login()`
- **Permisos:** Guardia de seguridad de turno

---

### FUNC-GUA-002: Búsqueda y Marcación Rápida de Asistencia en Garita
- **ID:** `FUNC-GUA-002`
- **Nombre:** Registro de Terceros por Cédula / ID
- **Descripción:** Permite a guardias registrar la entrada o salida de empleados que no portan smartphone, personal eventual o conductores.
- **Actor:** Guardia
- **Entrada:** ID numérico o cédula del colaborador, selección de almuerzo (si es entrada).
- **Proceso:**
  1. Busca al colaborador en Firestore (`empleados`).
  2. Determina automáticamente el tipo de evento siguiente (`ENTRADA` o `SALIDA`) analizando el último timbrado de hoy.
  3. Registra con dispositivo `GUARDIA_TERMINAL` y GPS de garita.
- **Resultado:** Asistencia registrada inmediatamente.
- **Pantalla:** `guardia.html` (Pantalla Registro)
- **Componente:** `JS/guardia_core.js` -> `registrar()`
- **Servicio:** `FirebaseBackend.guardarRegistro`
- **Permisos:** Terminal de guardia autenticada

---

### FUNC-GUA-003: Consulta de Personal Presente en Planta
- **ID:** `FUNC-GUA-003`
- **Nombre:** Lista de Conteo Físico en Planta
- **Descripción:** Muestra a los guardias el número total y el listado de personas que ingresaron a las instalaciones y aún no han registrado su salida. Crítico para emergencias y evacuaciones.
- **Actor:** Guardia
- **Entrada:** Clic en pestaña `Presentes`.
- **Proceso:** Filtra empleados con `ENTRADA` activa y sin `SALIDA` en el día.
- **Resultado:** Listado con foto y hora de ingreso.
- **Pantalla:** `guardia.html` (Pestaña Presentes)
- **Componente:** `JS/guardia_core.js` -> `cargarPresentes()`
- **Permisos:** Terminal de guardia

---

## 4. Módulo: Terminal de Comedor / Catering (`catering.html`)

---

### FUNC-CAT-001: Monitor de Raciones y Dietas del Día
- **ID:** `FUNC-CAT-001`
- **Nombre:** Tablero de Conteo de Platos Solicitados
- **Descripción:** Resumen de raciones totales preparadas por categoría: Normal, Dieta, Vegetariano e Invitados.
- **Actor:** Personal de Catering / Concesionario de Alimentos
- **Entrada:** Lectura automática de solicitudes del día.
- **Proceso:** Agrupa pedidos confirmados antes de las 09:30 AM en `registros` y `solicitudes_invitados`.
- **Resultado:** Tarjetas numéricas con totales y porcentaje de despacho.
- **Pantalla:** `catering.html`
- **Componente:** `JS/catering_core.js` -> `cargarListaCatering()`
- **Permisos:** Personal de comedor autorizado con PIN

---

### FUNC-CAT-002: Despacho y Marcación de Almuerzo Consumido
- **ID:** `FUNC-CAT-002`
- **Nombre:** Registro de Entrega de Plato
- **Descripción:** Marca la ración como consumida cuando el colaborador se presenta en la línea de servicio, impidiendo duplicidad de entregas.
- **Actor:** Concesionario de Alimentos
- **Entrada:** Búsqueda por ID/nombre y clic en botón `Entregar`.
- **Proceso:**
  1. Actualiza `consumo_almuerzos/{fecha}_{id}` con `{ consumido: true, hora_consumo: timestamp }`.
  2. Registra log de auditoría en `auditoria_almuerzos`.
- **Resultado:** Plato marcado como entregado; la tarjeta cambia de color verde a gris.
- **Pantalla:** `catering.html`
- **Componente:** `JS/catering_core.js` -> `marcarConsumido()`
- **Servicio:** `FirebaseBackend.marcarAlmuerzoConsumido`
- **Permisos:** Concesionario de Alimentos

---

## 5. Módulo: Configuración del Sistema (`admin_config.html`)

---

### FUNC-ADM-001: Calibración de Geocerca Central y Parámetros Operativos
- **ID:** `FUNC-ADM-001`
- **Nombre:** Modificación de Coordenadas y Radio de Validez
- **Descripción:** Ajusta la ubicación geográfica central de la planta y el radio permitido en metros, así como los horarios límite de entrada, almuerzo y salida.
- **Actor:** Administrador Master (ID `1058`)
- **Entrada:** Latitud, Longitud, Radio (metros), Hora Inicio (07:30), Hora Límite Almuerzo (09:30), Hora Salida (16:15), Switch de Modo Mantenimiento.
- **Proceso:** Actualiza el documento `configuracion/sistema` en Firestore y sincroniza con Google Sheets.
- **Resultado:** Nuevos parámetros aplicados a todos los clientes PWA en su siguiente sincronización.
- **Pantalla:** `admin_config.html`
- **Componente:** `JS/admin_config_core.js` -> `guardarConfiguraciones()`
- **Permisos:** Administrador Master

---

### FUNC-ADM-002: Restablecimiento Masivo de Contraseñas (PIN Reset)
- **ID:** `FUNC-ADM-002`
- **Nombre:** Reseteo Global de Contraseñas de Colaboradores
- **Descripción:** Borra los PINs de toda la base de colaboradores para requerirles crear una nueva contraseña en su próximo timbrado.
- **Actor:** Administrador Master
- **Entrada:** Confirmación de seguridad explícita.
- **Proceso:** Itera en lote borrando el atributo `pin` de los documentos de `empleados`.
- **Resultado:** Todos los colaboradores deben generar un nuevo PIN.
- **Pantalla:** `admin_config.html`
- **Componente:** `JS/admin_config_core.js` -> `ejecutarReseteoPinesAdmin()`
- **Permisos:** Administrador Master
