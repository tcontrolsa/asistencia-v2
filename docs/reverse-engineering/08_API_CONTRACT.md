# 08 — Contrato de Interfaces y APIs

**Sistema:** TCONTROL — Sistema de Gestión y Control Biométrico de Asistencia (2026)  
**Fecha de Análisis:** 2026-09-29  
**Estado:** [VERIFIED]  

---

## 1. Visión General de la Capa de APIs

El sistema TCONTROL expone y consume tres grupos principales de interfaces:
1. **Google Apps Script REST/JSONP API:** Endpoint publicado en Google Infrastructure que opera como puente para Google Sheets y sincronizaciones contables.
2. **Firebase Firestore Web SDK Client Interface:** Protocolo RPC/WebChannel sobre HTTPS y Long-Polling que ejecuta operaciones atómicas en colecciones.
3. **OpenWA / WAHA WhatsApp HTTP API:** Microservicio REST para la interacción y emisión de mensajes en la red de WhatsApp.

---

## 2. API de Google Apps Script (Backend REST / JSONP)

- **URL Base:** `https://script.google.com/macros/s/AKfycbxgmtQXWi-qDYyjT8kG6jsIEWZPbXXcHtLMaYqTlx2Allv7qkb9oe6ZGYt6lP6lCPZb/exec`
- **Autenticación:** Parámetro o cabecera `apiKey = '[REDACTED]'` (`backend/apps_script/api_completa.gs:L138,178`).
- **Formato de Respuesta:** `application/javascript` (JSONP: `callbackName({ ... })`) para peticiones `GET`; `application/json` para peticiones `POST`.

---

### EP-GAS-001: Consulta de Saldos de Vacaciones
- **Método:** `GET` (JSONP)
- **Acción:** `obtenerVacacionesEmpleado`
- **Propósito:** Recuperar días adjudicados, tomados y restantes de vacaciones calculados en la hoja `CALCULAR_vacaciones` por el motor de fórmulas de Sheets.
- **Autenticación:** `apiKey: '[REDACTED]'`
- **Permisos:** Empleado (consulta individual) o Supervisor (consulta de plantilla).
- **Request Parameters:**
  ```text
  GET /exec?accion=obtenerVacacionesEmpleado&empleadoId=0042&apiKey=[REDACTED]&callback=cb_1234
  ```
- **Response Payload (Éxito):**
  ```json
  {
    "ok": true,
    "vacaciones": [
      { "fecha": "2026-03-10", "tipo": "VACACIONES", "id": "0042" }
    ],
    "kpiVacaciones": {
      "adjudicadas": 30,
      "tomadas": 12,
      "restantes": 18
    },
    "kpiVacacionesIndividual": {
      "0042": { "adjudicadas": 30, "tomadas": 12, "restantes": 18 }
    }
  }
  ```
- **Errores:**
  - `401 / Error JSON`: `"No autorizado: API Key inválida o ausente"`
  - `500`: `"Error al consultar hoja CALCULAR_vacaciones"`
- **Modelo / Tabla Afectada:** Hoja Sheets `CALCULAR_vacaciones`, Hoja `VACACIONES`.
- **Consumidor:** `JS/firebase_backend.js:L186-330` (con caché local de 6 horas), `index_core.js`, `supervisor_core.js`.

---

### EP-GAS-002: Consulta de Registros Históricos Archivados
- **Método:** `GET` (JSONP)
- **Acción:** `obtenerRegistrosArchivados`
- **Propósito:** Recuperar marcaciones que tienen más de 60 días de antigüedad y residen en la hoja `REGISTROS` para generación de reportes anuales.
- **Autenticación:** `apiKey: '[REDACTED]'`
- **Permisos:** Supervisor / RRHH.
- **Request Parameters:**
  ```text
  GET /exec?accion=obtenerRegistrosArchivados&empleadoId=0042&apiKey=[REDACTED]&callback=cb_5678
  ```
- **Response Payload (Éxito):**
  ```json
  {
    "ok": true,
    "registros": [
      {
        "fecha": "2026-01-15",
        "empleadoId": "0042",
        "nombre": "PEREZ JUAN",
        "tipo": "ENTRADA",
        "almuerzo": "Normal",
        "hora": "07:25:00",
        "lat": "-0.128877",
        "lng": "-78.478967",
        "dispositivo": "DEV_X89K2",
        "timestamp": "2026-01-15T12:25:00.000Z",
        "dia": "JUEVES",
        "modo": "OFICINA",
        "horasExtra": "NO",
        "autoriza": "",
        "justificado": "SI",
        "tiempo_justificado_mins": 0
      }
    ]
  }
  ```
- **Consumidor:** `supervisor_reportes_custom.js`.

---

### EP-GAS-003: Archivador Diario en Lote (Post-Batch)
- **Método:** `POST`
- **Acción:** `archivarRegistros`
- **Propósito:** Escribir en Google Sheets paquetes masivos de marcaciones transferidas desde Firestore antes de ser purgadas.
- **Autenticación:** `apiKey: '[REDACTED]'`
- **Permisos:** Sistema interno / Scripts de mantenimiento.
- **Request Body (JSON):**
  ```json
  {
    "apiKey": "[REDACTED]",
    "accion": "archivarRegistros",
    "registros": [
      {
        "fecha": "2026-07-01",
        "empleadoId": "0001",
        "nombre": "DEMO EMPLEADO",
        "tipo": "ENTRADA",
        "almuerzo": "Normal",
        "hora": "07:30:00",
        "lat": -0.128877,
        "lng": -78.478967,
        "dispositivo": "DEV_DEMO",
        "timestamp": "2026-07-01T12:30:00Z",
        "dia": "MIERCOLES",
        "modo": "OFICINA",
        "horasExtra": "NO"
      }
    ],
    "almuerzosExtra": []
  }
  ```
- **Response Payload:** `{"ok": true, "mensaje": "Registros archivados exitosamente"}`
- **Modelo / Tabla Afectada:** Hoja Sheets `REGISTROS` y `VACACIONES`.
- **Consumidor:** `backend/apps_script/archivador_diario.gs`.

---

### EP-GAS-004: Exportación Completa para Migración
- **Método:** `GET` (JSONP)
- **Acción:** `exportarBaseDatosParaFirebase`
- **Propósito:** Descarga la totalidad de empleados, registros históricos, dispositivos y parámetros de configuración para poblar Cloud Firestore desde cero.
- **Autenticación:** `apiKey: '[REDACTED]'`
- **Permisos:** Administrador Master.
- **Response:** Objeto consolidado `{ empleados: [...], registros: [...], dispositivos: [...], configuracion: {...} }`.
- **Consumidor:** `JS/firebase_migration.js:L33`.

---

## 3. Interfaz del Motor Firestore (FirebaseBackend)

Operaciones ejecutadas vía SDK en `JS/firebase_backend.js` a través del enrutador central `FirebaseBackend.procesarAccion(params)`:

| Acción | Método / Operación Firestore | Entrada Requerida | Salida / Documento Afectado |
|---|---|---|---|
| `verificarDispositivo` | `db.collection('dispositivos').doc(token).get()` | `deviceToken` | `{ registrado: boolean, tienePin: boolean, empleado: {...} }` |
| `verificarPIN` | Lectura de `empleados/{id}` + comparación hash | `pin`, `deviceToken`, `empleadoId` | `{ valido: boolean, empleado: {...} }` |
| `registrarDispositivo` | `batch.set(dispositivos)` + `emp.update({pin, deviceToken})` | `empleadoId`, `pin`, `deviceToken` | `{ ok: true, registrado: true }` |
| `guardarRegistro` | `db.collection('registros').doc(docId).set(data)` | Objeto de marcación completo | `{ ok: true, id: docId, timestamp: Date }` |
| `obtenerRegistros` | `db.collection('registros').where('empleadoId', '==', id)` | `empleadoId` | `{ ok: true, registros: [...] }` |
| `obtenerEstado` | `db.collection('registros').where('fecha', '==', hoy)` | `id`, `deviceToken` | `{ estado: 'ENTRADA'/'SALIDA', almuerzo: 'Normal' }` |
| `actualizarAlmuerzoSupervisor` | Update en `registros` y `consumo_almuerzos` | `empleadoId`, `fecha`, `opcion` | `{ ok: true }` |
| `marcarAlmuerzoConsumido` | `consumo_almuerzos.doc().update({ consumido: true })` | `empleadoId`, `fecha` | `{ ok: true, hora_consumo: string }` |
| `justificarDia` | `registros.doc().set({ justificado: 'SI', ... })` | Datos de justificación | `{ ok: true }` |
| `actualizarRegistroGeneral` | Update de campos de auditoría y horas extras | `registroId`, campos a actualizar | `{ ok: true }` |
| `desvincularColaborador` | Mueve a `empleados_desvinculados` y apaga `activo` | `empleadoId`, motivo | `{ ok: true }` |
| `toggleEmergencia` | Update `configuracion/emergencia` | `activa: boolean`, `nombre` | `{ ok: true, estado: boolean }` |
| `guardarConfiguraciones` | `configuracion/sistema.set(config)` | Parámetros del sistema | `{ ok: true }` |

---

## 4. API del Microservicio de WhatsApp (OpenWA / WAHA)

- **URL Base:** Servida vía túnel seguro Cloudflare HTTPS (`https://*.trycloudflare.com`) o red local (`http://192.168.10.129:2785`).
- **Autenticación:** Cabeceras HTTP:
  - `X-API-Key: [REDACTED]`
  - `Authorization: Bearer [REDACTED]`
- **Session ID Canónico:** `5a509468-647a-4973-b10c-bf87d04666ea` (`JS/openwa_service.js:L75`).

---

### EP-WA-001: Verificación de Existencia de Contacto WhatsApp
- **Método:** `GET`
- **Ruta:** `/api/sessions/{session}/contacts/check/{cleanPhoneNumber}`
- **Propósito:** Comprueba si un número celular está registrado activamente en la red de WhatsApp antes de despachar mensajes, previniendo penalizaciones de spam.
- **Request Headers:**
  ```http
  Accept: application/json
  X-API-Key: [REDACTED]
  ```
- **Response Payload:**
  ```json
  {
    "number": "593984660105",
    "exists": true,
    "whatsappId": "593984660105@c.us"
  }
  ```
- **Consumidor:** `JS/openwa_service.js` -> `resolverChatId()`.

---

### EP-WA-002: Envío de Mensaje de Texto Institucional
- **Método:** `POST`
- **Ruta Principal:** `/api/sessions/{session}/messages/send-text`
- **Ruta Fallback 1:** `/api/sendText`
- **Ruta Fallback 2:** `/api/messages/sendText`
- **Request Payload:**
  ```json
  {
    "chatId": "593984660105@c.us",
    "text": "🔔 *NOTIFICACIÓN DE ASISTENCIA — TCONTROL*\n\nEstimado/a *JUAN PEREZ*..."
  }
  ```
- **Response Payload:**
  ```json
  {
    "ok": true,
    "messageId": "true_593984660105@c.us_3EB0...",
    "status": "SENT"
  }
  ```
- **Consumidor:** `JS/openwa_service.js` -> `enviarMensajeTexto()`.

---

### EP-WA-003: Envío de Mensaje con Imagen Adjunta (Base64)
- **Método:** `POST`
- **Ruta Principal:** `/api/sessions/{session}/messages/send-image`
- **Rutas Fallback:** `/api/sendImage`, `/api/sendImageBase64`, `/api/sessions/{session}/messages/send-file`
- **Request Payload:**
  ```json
  {
    "chatId": "593984660105@c.us",
    "base64": "/9j/4AAQSkZJRgABAQE...",
    "mimetype": "image/jpeg",
    "caption": "📋 *AVISO DE AUSENCIA LABORAL — TCONTROL*..."
  }
  ```
- **Consumidor:** `JS/openwa_service.js` -> `enviarMensajeImagen()`.
