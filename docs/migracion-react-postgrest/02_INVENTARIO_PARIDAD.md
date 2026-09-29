# 02 — Inventario de paridad funcional (checklist)

Extraído del código en el commit `ac53c18`. Cada casilla debe quedar implementada en la versión nueva **y** con una prueba que la cubra. En la **Fase 0**, la IA debe recorrer `legacy/` y completar lo que falte (este inventario puede no ser exhaustivo en detalles de cada modal). Entre paréntesis: archivo y función de referencia.

Leyenda: 🔒 = requiere rol distinto de empleado · ⚠️ = hay decisión pendiente en `04_REGLAS_Y_DECISIONES.md`.

---

## 0. Roles y acceso actuales

| Rol (hoy) | Cómo se determina hoy | Accede a |
|---|---|---|
| Empleado | Cualquier `empleados` activo | App del empleado (`index.html`) |
| Coordinador de producción/taller | `cargo` contiene (producción o taller) y (coordinador/jefe/supervisor), o "asistente" + "producción" (`index_core.js` → `actualizarInterfazSegunCargo`) | + pestaña **Extras** en la app del empleado |
| Guardia | Una clave compartida, escrita en el código (`firebase_backend.js` → `verificarClaveGuardia`) | `guardia.html` |
| Supervisor | `empleados.supervisor = 'SI'` o `'SUPERVISOR'` | `supervisor.html` (Asistencia, Dashboard, Gestión & Servicios), `catering.html`, `ubicacion.html` |
| Supervisor Admin | `supervisor` = `SUPERVISOR ADMIN` / `SUPERVISOR_ADMIN` / `ADMIN_SUPERVISOR` / `ADMIN` | + Reportes, Notificaciones WhatsApp, `visor_empleado.html`, `admin_config.html` |
| Admin Master | Hoy: `id === "1058"` en el código ⚠️ | + Opciones adicionales, pestaña **Panel Master** en la app del empleado |

En la versión nueva los roles se guardan en la base (no en el código) y se aplican con RLS.

---

## 1. App del empleado (`index.html`, `JS/index_core.js`) — PWA móvil

### 1.1 Acceso y cuenta
- [ ] Splash animado (grúa, logo gris → rojo con rayo) mientras carga (`hideSplash`, `index.html` `#initialSplash`).
- [ ] Vinculación de dispositivo: ID/cédula + contraseña; primer ingreso crea contraseña (mín. 4 caracteres ⚠️); un dispositivo activo por empleado, al vincular uno nuevo se desactivan los anteriores (`verificarEstadoCuentaEmpleado`, `confirmarRegistroInicial`, `firebase_backend.js` → `registrarDispositivoConPIN`).
- [ ] Inicio de sesión con ID + contraseña (`renderAuthScreen`, `verificarPIN`).
- [ ] Vista previa del empleado al escribir el ID (nombre, foto, área, cargo; si ya tiene contraseña) (`verificarEstadoCuentaEmpleadoDebounced`).
- [ ] Pantalla de actualización de datos personales obligatoria si faltan datos (`renderUpdateDataScreen`, `guardarDatosPersonales`).
- [ ] Migración forzada de contraseña antigua (`renderMigrarPasswordScreen`) → en la versión nueva se reemplaza por "crear contraseña nueva" en el primer ingreso ⚠️ D-06.
- [ ] Cambio de contraseña desde el perfil (actual + nueva + confirmación) (`mostrarModalCambioPassword`, `ejecutarCambioPasswordDirecto`).
- [ ] Cerrar sesión (`cerrarSesion`).
- [ ] Actualización forzada remota de terminales (bandera de configuración que obliga a recargar) (`verificarActualizacionForzada`).

### 1.2 Inicio (Home) y marcación
- [ ] Tarjeta de estado del día: ENTRADA / SALIDA con horas, reloj en vivo, botón único dinámico (Registrar Entrada / Salida / Retorno de campo / "Estado reportado hoy" / "Jornada completa") (`renderHomePage`, `calcularStatusActual`).
- [ ] Validación de geocerca con indicador "📍 Xm / 250m"; en modo campo usa la base del empleado con radio 300 m (`verificarDistanciaEmpresa`) ⚠️ D-07.
- [ ] Selector de modo Oficina / Campo y "Fijar base de campo" con la ubicación actual (`cambiarModo`, `fijarBaseCampo`).
- [ ] ENTRADA: selector de almuerzo Planta/Fuera antes de la hora límite (09:30) y menú del día (`mostrarLunchSelector`, `seleccionarLugar`, `confirmarMenuYOpcion`) ⚠️ D-09.
- [ ] ENTRADA tardía (> hora límite de entrada): pide motivo y quién justifica (`esEntradaTardia`, `mostrarModalRazonEntrada`, `procesarRazonEntrada*`).
- [ ] SALIDA antes de la hora de salida: confirmación de salida anticipada, tipo de salida (Permiso con regreso / Salida a campo / Salida final) y motivo (`mostrarModalConfirmacionSalidaAnticipada`, `mostrarModalTipoSalida*`, `mostrarModalRazonSalida`, `mostrarModalRazonPermiso*` con opciones médico/personal).
- [ ] Pasantes: flujo de salida propio (`SALIDA_PASANTE`) y sin cómputo de atraso (`esEmpleadoPasante`).
- [ ] Animación de confirmación a pantalla completa tras marcar (título, subtítulo con hora, detalles) (`mostrarSplashTransicion`).
- [ ] Bloqueo de doble marcación del mismo tipo seguido en el día (`firebase_backend.js` → `guardarRegistro`).
- [ ] "¿Fuera del área de registro?": reporte del estado del día (Vacación, Permiso personal, Permiso médico, Falta justificada, Campo) con observación; aviso de regularización obligatoria; notifica al supervisor por WhatsApp (`abrirModalReporteFueraArea`, `guardarReporteFueraArea`, `notificarSupervisorEstadoFueraArea`) ⚠️ D-08.
- [ ] Justificación masiva de faltas pasadas del período (lista de días con checkbox + motivo; opción "saltar") (`obtenerDiasFaltantes`, `renderFaltasMasivas`, `procesarJustificacionMasiva`).
- [ ] Popup de almuerzo cuando corresponde (`evaluarPopupAlmuerzo`, `mostrarPopupAlmuerzo`).
- [ ] Aviso "Falta foto de perfil" con instrucciones.
- [ ] Insignias de puntualidad y su detalle (`generarInsigniasHTMLCompacto`, `mostrarDetalleInsignia`).
- [ ] Cumpleaños: tarjeta y animación de celebración (`esCumpleanos`, `celebrarCumpleanos`).
- [ ] Botón flotante de emergencia visible solo si hay emergencia activa (`fabEmergencia`).
- [ ] Botón de soporte por WhatsApp con formulario (fecha del incidente, descripción) (`abrirWhatsAppSoporte`).
- [ ] Pull-to-refresh (`tcontrol_core.js`).

### 1.3 Historial
- [ ] Historial agrupado por semana, plegable (`renderHistoryPage`, `actualizarHistorialAgrupado`, `toggleSemana`).
- [ ] Período de corte del 26 al 25 ⚠️ D-03; incluye registros archivados en Sheets (`obtenerRegistrosEmpleado`).
- [ ] Estadísticas del período: atrasos, minutos de atraso, horas, duración de jornada (`calcularEstadisticas`, `calcularMinutosAtraso`, `calcularDuracion`).
- [ ] Descarga de períodos anteriores (`descargarPeriodosAnteriores`).

### 1.4 Almuerzo e invitados
- [ ] Pestaña Almuerzo: registrar/cambiar almuerzo del día (`renderAlmuerzoPage`, `registrarAlmuerzoTab`).
- [ ] Pregunta de "Cultura Tcontrol" del día (quiz con pista), si está habilitada global y para el empleado (`renderAlmuerzoQuiz`, `responderQuizAlmuerzo`).
- [ ] Solicitudes para invitados: Almuerzo extra, Refrigerio sánduche, Break galletas; cantidad, invitado, empresa, hora de servicio, observaciones, fecha hoy/futura; cortes horarios; no disponible para personal de Taller; cancelar solicitud; notifica a Supervisores Admin por WhatsApp (`abrirModalSolicitudInvitado`, `enviarSolicitudInvitado`, `cancelarSolicitudInvitado`).

### 1.5 Perfil
- [ ] Datos: foto, nombre, rol (Supervisor / Pasantía), contadores del mes (entradas, días, salidas), vacaciones disponibles y tomadas (`renderProfilePage`).
- [ ] Editar: nombre, teléfono, fecha de nacimiento, URL de foto o subida de foto (reducida a 160 px) (`guardarPerfilEmpleado`, `triggerProfilePhotoUpload`).
- [ ] Sección "Seguridad y conectividad" (token del dispositivo, estado GPS).
- [ ] Aviso legal LOPDP (modal completo) (`tcontrol_core.js` → `abrirModalAvisoPrivacidad`).

### 1.6 Otras pestañas
- [ ] **Roles de Pago**: visor del documento del empleado (enlace en `empleados.id_dispositivo`, hoy una URL de SharePoint) con "Abrir externamente" (`renderPagosPage`) ⚠️ D-10.
- [ ] 🔒 **Extras** (coordinadores): lista de personal de Taller/Producción con autorización de horas extra del día, filtros, marcar todos (`renderHorasExtrasPage`, `toggleAutorizacionExtra`).
- [ ] 🔒 **Panel Master** (admin): accesos a Supervisor, Catering, Guardia, Configuración, Diagnóstico, Ubicación (`renderAdminPage`).
- [ ] **Estado de emergencia**: "¿Cuál es tu estado actual?" (A salvo / Requiere ayuda) + comentario; se guarda en la ENTRADA de hoy (`renderEstadoPage`, `enviarReporteEmergencia`).

---

## 2. Terminal de guardia (`guardia.html`, `JS/guardia_core.js`) 🔒
- [ ] Acceso con clave (hoy compartida) y sesión persistente (`login`, `verificarEstadoSesion`).
- [ ] Buscar empleado por ID, ver foto y estado de hoy (`buscar`, `obtenerEstado`).
- [ ] Registrar ENTRADA (con elección de almuerzo) o SALIDA en nombre del empleado, con GPS del terminal; dispositivo `GUARDIA` (`registrar`, `seleccionarAlmuerzo`).
- [ ] Pestaña "Presentes": lista de quienes están dentro hoy (`cargarPresentes`).
- [ ] Actualización remota forzada (`verificarActualizacionRemotaGuardia`).

## 3. Catering / cocina (`catering.html`, `JS/catering_core.js`) 🔒 supervisor
- [ ] Login de supervisor (ID + contraseña); solo `esSupervisor` (`intentarLoginCatering`).
- [ ] Lista del día: quienes marcaron almuerzo en planta (ENTRADA o SOLO_ALMUERZO con `almuerzo = SI`), con foto, área y hora de entrada (`cargarListaCatering`).
- [ ] Marcar "consumido" (una vez por empleado y día) (`marcarConsumido`, `registrarConsumo`).
- [ ] Estadísticas, filtros (pendientes/consumidos), búsqueda, recarga automática y manual, preferencias recordadas (`actualizarStats`, `filtrarPor`, `iniciarRecargaAutomatica`).

## 4. Panel de supervisor (`supervisor.html`, `JS/supervisor_core.js` y `JS/supervisor/*`) 🔒

### 4.1 Asistencia
- [ ] **Control diario**: tabla del día con filtros por tarjeta (Presentes, Sin marcar, En campo, Vacaciones, Permisos, Tardanzas, Almuerzo planta, Almuerzo fuera, Ya salieron, Por Regularizar), búsqueda, orden, columnas configurables, cambio de almuerzo, razón de ausencia por fecha, registro manual, notificar por WhatsApp (`cargarAsistencia`, `setFiltroAsistencia`, `guardarRazonAusencia*`, `actualizarAlmuerzo`).
- [ ] **Directorio**: tarjetas/tabla, KPIs (total, activos, inactivos, supervisores, con WhatsApp, cumpleaños), filtros por área, rol, estado, almuerzo, cumpleaños (hoy/7/15/30 días), exportar Excel, editar ficha, crear empleado con siguiente ID disponible (`supervisor_directorio.js`).
- [ ] **Mapa de asistencia**: matriz empleados × días, rangos (semana/mes/personalizado), navegación, filtros KPI/estado/área, vistas matriz/tarjetas/cobertura, exportar Excel (`supervisor_mapa.js`).

### 4.2 Detalle del colaborador
- [ ] Ficha (foto editable, nombre, ID, área, cargo, rol de pagos) editable por admin (`mostrarDetalle`, `editarMetaEmpleado`, `triggerPhotoUpload`).
- [ ] Historial por período con atrasos, horas ordinarias, extra, faltantes, permisos parciales en minutos (personal, médico, justificado) (`editarCeldaTiempo`, `guardarPermiso`).
- [ ] Modal "Gestión de jornada por fecha": horas de entrada/salida, modo, almuerzo, horas extra, razón (inasistencia, vacación, feriado, campo, otro), minutos de permiso, observación, eliminar marcaciones del día, banner de cumpleaños (`abrirModalGestionJornada`, `guardarModalGestionJornada`, `eliminarMarcacionesDiaModal`).
- [ ] Justificar tiempo (`mostrarModalJustificar`, `guardarJustificacion`).
- [ ] Programar ausencia futura (vacaciones, permisos, etc.) (`mostrarModalFuturos`, `guardarEventoFuturo`).
- [ ] Registrar trabajo en campo por días con horarios e ingeniero que autoriza (`supervisor_emergencias.js` → `guardarTrabajoEnCampoSupervisor`).
- [ ] Desglose de inasistencias, desglose histórico y diferencias (período actual/anterior), desglose de vacaciones (adjudicadas, tomadas, restantes) con exportes (`abrirModalDesgloseHistoricoBase`, `abrirModalDesgloseVacaciones`).
- [ ] Fechas por regularizar con navegación directa y solicitud de regularización por WhatsApp (`obtenerFechasPendientesRegularizarEmpleado`, `solicitarRegularizacionWhatsApp`).
- [ ] Resetear contraseña del colaborador (opcionalmente asignar una) (`resetearPasswordEmpleado`).
- [ ] Mensaje directo de WhatsApp con plantillas (`abrirModalMensajeIndividualWhatsApp`).

### 4.3 Dashboard
- [ ] KPIs: cumplimiento de asistencia, cumplimiento de vacaciones, detalle de KPIs por colaborador; resumen mensual; análisis de tardanzas; exportar Excel/PDF (`cargarDashboard`, `renderDetailedKPIs`, `exportarKPIs*`).

### 4.4 Reportes 🔒 Supervisor Admin
- [ ] Período (mes completo, 1ª y 2ª quincena, fechas personalizadas), vistas (Asistencia, H. Extra, Almuerzos, Completo), incluir desvinculados/eliminados, filtros Pasante / Sin asistencia / Almuerzos extra.
- [ ] Reporte interactivo con columnas personalizables (arrastrar y soltar), orden, filtros rápidos, plantillas (`supervisor_reportes_custom.js`).
- [ ] Exportar a Excel, a Google Sheets (hoja nueva `Rep_…`), imprimir/PDF; reporte individual (`exportarExcelReporteCustom`, `exportarGoogleSheetsReporteCustom`, `imprimirReporteCustom`).

### 4.5 Gestión & Servicios
- [ ] **Emergencias**: activar/desactivar evento (nombre), ver estado reportado por cada colaborador (`supervisor_emergencias.js`).
- [ ] **Menú semanal**: sopa, plato, jugo por día; sugerencias del historial; archivado del menú consumido (`cargarMenuSemanal`, `guardarMenuSemanal`).
- [ ] **Cultura Tcontrol**: banco de preguntas por pilar (propósito, misión, visión, valores), activar/desactivar preguntas, habilitar global y por empleado, restablecer por defecto (`supervisor_cultura.js`).
- [ ] **Invitados & Catering**: tabla con filtros (hoy/mañana/todas, KPI), cambiar estado (Solicitado → Confirmado → Entregado / Cancelado), eliminar, copiar resumen para cocina, exportar Excel/CSV, crear pedido, notificar a Supervisores Admin (`supervisor_invitados.js`).

### 4.6 Notificaciones WhatsApp 🔒 Supervisor Admin
- [ ] **Servidor**: URL, API key (en servidor en la versión nueva), probar conexión, mensaje de prueba con plantillas (`probarConexionWhatsApp`, `probarEnvioWhatsApp`).
- [ ] **Plantillas**: no registró entrada, ausente, vacaciones, permiso, salida faltante, emergencia, más plantillas personalizadas; variables (`{nombre}`, `{hora}`, `{fecha}`, `{link}`, `{razon}`); imagen adjunta por plantilla.
- [ ] **Automático**: envío "no registró entrada" a la hora de corte (08:15 por defecto) en días configurados ⚠️ (hoy corre en el navegador del supervisor; debe pasar a servidor).
- [ ] **Logs**: historial de envíos con filtros.
- [ ] Envío masivo por categoría (sin marcar, ausentes, permisos, salida faltante, vacaciones, emergencia) con selección de destinatarios (`ejecutarEnvioMasivoWhatsApp`).

### 4.7 Opciones adicionales 🔒 Admin Master
- [ ] **Directorio y carga de personal**: formulario, pegado masivo desde Excel con vista previa, flujo con Google Sheets (descargar a hoja `ACTUALIZAR`, editar, importar) (`descargarBaseAGoogleSheetsActualizar`, `leerEImportarDesdeGoogleSheetsActualizar`, `guardarMasivoEmpleados`).
- [ ] **Roles y permisos**: asignar Supervisor / Supervisor Admin (`renderGestionRolesEmpleados`, `guardarAsignacionRol`).
- [ ] **Desvinculación**: con fecha, motivo, observaciones; traslado a histórico de desvinculados; historial con filtros y exportar Excel (`confirmarDesvinculacionColaborador`, `cargarHistorialDesvinculados`).
- [ ] **Eliminación** individual/múltiple de colaboradores (`eliminarEmpleados*`).
- [ ] Registro manual de asistencia, archivar datos históricos, forzar actualización de terminales, reseteo masivo de contraseñas (`guardarRegistroManual`, `iniciarArchivadoFirebase`, `forzarActualizacionRemotaTerminales`, `resetearPinesTodosLosEmpleados`).
- [ ] **Simulador de vista** del empleado (`visor_empleado.html`).

## 5. Páginas auxiliares 🔒
- [ ] `ubicacion.html`: mapa Leaflet con marcaciones del día (clusters, radio de la empresa, lista lateral, filtros, rotación automática) — supervisores.
- [ ] `admin_config.html`: configuración del sistema (ubicación y radio, horarios, almuerzo, parámetros de registro, WhatsApp de soporte, modo mantenimiento) — Admin / Supervisor Admin.
- [ ] `visor_empleado.html`: simular la vista de un empleado — Admin / Supervisor Admin.
- [ ] `diagnostico.html`: pruebas de conectividad (decidir si se mantiene) ⚠️.
- [ ] `offline.html`: página sin conexión de la PWA.

## 6. Procesos automáticos y notificaciones
- [ ] Autocompletar salidas faltantes de los últimos 7 días (16:15 L-V; fin de semana ⚠️ D-02), regularizar salidas automáticas de fin de semana (`autocompletar_salidas.gs`).
- [ ] Resetear autorizaciones diarias de horas extra (`api_completa.gs` → `resetearAutorizacionesDiarias`).
- [ ] Archivar registros de Firestore > 60 días a Sheets (`archivador_diario.gs`) — en PostgreSQL probablemente innecesario ⚠️ D-11.
- [ ] Mantenimiento: completar DIA/NOMBRE vacíos, eliminar duplicados, autorizar horas extra automáticas, conflictos con vacaciones, reporte (`mantenimiento_registros.gs`) — revisar cuáles siguen siendo necesarios con base relacional.
- [ ] WhatsApp: recordatorio automático "no registró entrada"; aviso a Supervisores Admin por solicitud y cancelación de invitados; aviso al supervisor por "estado fuera de área"; envíos manuales y masivos por plantilla.
- [ ] Horarios exactos de los activadores de Apps Script: **leerlos del editor de Apps Script** (no están en el repo).
