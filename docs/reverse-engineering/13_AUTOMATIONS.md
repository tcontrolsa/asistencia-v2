# 13 — Automatizaciones, Tareas Programadas y Background Jobs

**Sistema:** TCONTROL — Sistema de Gestión y Control Biométrico de Asistencia (2026)  
**Fecha de Análisis:** 2026-09-29  
**Estado:** [VERIFIED]  

---

## 1. Inventario de Automatizaciones y Procesos en Segundo Plano

| Automatización / Tarea | Motor / Entorno | Frecuencia / Trigger | Archivo Fuente | Función Principal | Estado |
|---|---|---|---|---|---|
| **Archivado Diario de Firestore a Sheets** | Google Apps Script (Cloud) | Cron diario a las 20:00 (Ventana 20:00-21:00) | `backend/apps_script/archivador_diario.gs` | `ejecutarArchivadoDiario()` | [VERIFIED] |
| **Autocompletado de Salidas Faltantes** | Google Apps Script (Cloud) | Tarea nocturna programada (Medianoche) | `backend/apps_script/autocompletar_salidas.gs` | `autoCompletarSalidasFaltantesSheets()` | [VERIFIED] |
| **Regularización de Fines de Semana** | Google Apps Script (Cloud) | Previo al autocompletado y manual | `backend/apps_script/autocompletar_salidas.gs` | `regularizarSalidasFinDeSemana()` | [VERIFIED] |
| **Mantenimiento y Horas Extras Automáticas** | Google Apps Script (Cloud) | Programado o bajo demanda | `backend/apps_script/mantenimiento_registros.gs` | `ejecutarMantenimiento()` | [VERIFIED] |
| **Sincronización Automática al Editar Registros** | Google Sheets Event Engine | Trigger simple `onEdit(e)` | `backend/apps_script/copiar_base.gs` | `onEdit()` -> `procesarRegistros()` | [VERIFIED] |
| **Service Worker Cache & Offline Sync** | Navegador (Web Worker) | Eventos de red `fetch`, `install`, `activate` | `sw.js` | Handlers del Service Worker v2.00 | [VERIFIED] |
| **Orquestador Resiliente de Túnel WhatsApp** | Python 3 (Daemon local) | Bucle continuo `while not _detener_servicio` | `services/whatsapp/iniciar_tunel.py` | `main()`, `limpiar_salida()` | [VERIFIED] |

---

## 2. Detalle de Automatizaciones

---

### AUTO-001: Archivador Diario y Purge de Firestore (`archivador_diario.gs`)
- **Propósito:** Evita el crecimiento indefinido de la base operacional en Firestore y garantiza la transferencia segura de registros con más de 60 días de antigüedad hacia las hojas históricas de Google Sheets.
- **Configuración del Activador:**
  ```javascript
  ScriptApp.newTrigger('ejecutarArchivadoDiario')
    .timeBased()
    .everyDays(1)
    .atHour(20) // Programado a las 20:00 (hora de Ecuador)
    .create();
  ```
- **Flujo de Ejecución:**
  1. Calcula la fecha de corte: `limite.setDate(limite.getDate() - 60)` a las 00:00:00.
  2. Descarga de forma recursiva con paginación (`pageSize=300`, `pageToken`) todos los registros de la colección `registros` de Firestore vía HTTP REST API.
  3. Clasifica registros: si `tipo == 'VACACIONES'` lo destina a la hoja `VACACIONES`; de lo contrario, a la hoja `REGISTROS`.
  4. Escribe en bloque (`setValues`) en Google Sheets.
  5. Agrupa los nombres de documentos en bloques de 100 y ejecuta llamadas POST `:commit` con operación `delete` hacia Firestore REST API para liberar espacio.

---

### AUTO-002: Autocompletado y Regularización de Salidas (`autocompletar_salidas.gs`)
- **Propósito:** Detectar jornadas inconclusas en los últimos 7 días (empleados que registraron entrada pero olvidaron timbrar su salida) e insertar automáticamente una salida oficial del sistema para que el cómputo de horas de nómina no quede truncado.
- **Flujo de Ejecución:**
  1. Ejecuta primero `regularizarSalidasFinDeSemana()` para asegurar que ninguna salida de sábado o domingo tenga horas erróneas (ajusta a las 15:15:00).
  2. Carga la lista de empleados activos ignorando a los que tienen cargo `SIN ASISTENCIA`.
  3. Mapea la presencia en los últimos 7 días.
  4. Si existe `ENTRADA` y no existe `SALIDA`:
     - Si la fecha corresponde a Sábado o Domingo: fija hora de salida en **`15:15:00`**.
     - Si la fecha corresponde a Lunes a Viernes: fija hora de salida en **`16:15:00`**.
     - Asigna atributos distintivos:
       - `DISPOSITIVO = 'AUTO_COMPLETAR'`
       - `QUIEN_JUSTIFICA = 'SISTEMA'`
       - `RAZON_SALIDA_TEMPRANA = 'No registró salida'`
       - `HORAS_EXTRA = 'NO'`
  5. Escribe las nuevas filas en lote en la hoja `REGISTROS`.

---

### AUTO-003: Mantenimiento, Deduplicación y Horas Extras (`mantenimiento_registros.gs`)
- **Propósito:** Limpieza de inconsistencias en la base de datos de Google Sheets y cálculo automatizado de beneficios de sobretiempo.
- **Flujo de Ejecución:**
  1. `completarCamposVacios()`: Cruza contra la hoja `EMPLEADOS` y rellena celdas vacías de la Columna C (`NOMBRE`) y calcula el día de la semana para celdas vacías de la Columna K (`DIA`).
  2. `eliminarDuplicados()`: Escanea filas y elimina físicamente duplicados de `Fecha + ID + Tipo`, conservando la primera ocurrencia y removiendo las posteriores en orden inverso (`reverse()`).
  3. `autorizarHorasExtrasAutomaticas()`: Evalúa salidas efectivas que exceden en más de 45 minutos el horario regular:
     - Lunes a Viernes: Salida > 17:00 (16:15 + 45 min).
     - Sábado: Salida > 15:45 (15:00 + 45 min).
     - Domingo / Feriado: Toda jornada > 45 minutos.
     - Asigna automáticamente `HORAS_EXTRA = 'SI'` y `AUTORIZA = 'SISTEMA (>45 MIN)'`.
  4. `verificarConflictosVacaciones()`: Compara marcaciones físicas de asistencia contra la hoja `VACACIONES`, alertando si un colaborador timbró en un día que estaba formalmente de vacaciones.
  5. `crearHojaReporte()`: Genera la pestaña `REPORTE_MANTENIMIENTO` con un resumen ejecutivo estilizado agrupado por colaborador.

---

### AUTO-004: Service Worker PWA (`sw.js`)
- **Propósito:** Manejo del ciclo de vida offline y actualización automática del cliente web.
- **Estrategias:**
  - **Pre-caching en Instalación:** Altera el estado del worker a `skipWaiting()` tras precachear los 13 archivos críticos del app shell.
  - **Stale-While-Revalidate:** Aplica a assets estáticos (imágenes de logotipos, fuentes tipográficas de Google, librerías CSS de CDNs). Sirve inmediatamente la versión local de la caché y actualiza en segundo plano desde la red.
  - **Network First con Fallback Offline:** Aplica a la navegación HTML (`index.html`). Intenta la red; si no hay internet o falla el servidor, sirve la copia en caché o redirige a `offline.html`.
  - **Mensajería Inter-proceso:** Escucha mensajes `{ type: 'FORCE_PURGE_CACHE' }` y `{ type: 'SKIP_WAITING' }` para forzar actualizaciones inmediatas en clientes cuando el supervisor o administrador publica cambios.

---

### AUTO-005: Proceso de Monitoreo y Resiliencia del Túnel WhatsApp (`iniciar_tunel.py`)
- **Propósito:** Mantener disponible la mensajería WhatsApp para la PWA HTTPS sin intervención humana ante fallos de red.
- **Mecanismos de Resiliencia:**
  1. *Limpieza de Procesos Huérfanos:* Al iniciar, ejecuta `taskkill /F /IM cloudflared.exe` para asegurar que ningún túnel congelado anterior bloquee los puertos locales.
  2. *Detección de URL Dinámica:* Lee en tiempo real el stdout de `cloudflared` mediante regex `https://[a-zA-Z0-9-]+\.trycloudflare\.com`.
  3. *Sincronización Inmediata:* Al obtener la URL, ejecuta un PATCH HTTP a Firestore REST API para que todos los teléfonos y computadoras reciban la nueva URL vía `onSnapshot` en menos de 1 segundo.
  4. *Manejo de Rate-Limit (Código 1015 / HTTP 429):* Si Cloudflare bloquea temporalmente por exceso de túneles efímeros, restaura la configuración a la IP local (`http://192.168.10.129:2785`) y espera 60 segundos antes de reintentar.
  5. *Graceful Shutdown:* Si el usuario presiona `Ctrl+C`, captura las señales `SIGINT`/`SIGTERM`, mata el subproceso de `cloudflared` y restaura Firestore a la IP local para no dejar a los clientes apuntando a un dominio muerto.
