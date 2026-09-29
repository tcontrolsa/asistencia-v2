# 11 — Parámetros de Configuración y Entornos

**Sistema:** TCONTROL — Sistema de Gestión y Control Biométrico de Asistencia (2026)  
**Fecha de Análisis:** 2026-09-29  
**Estado:** [VERIFIED]  

---

## 1. Visión General de la Configuración

TCONTROL no utiliza archivos `.env` convencionales en el navegador debido a que es una aplicación web servida de forma estática en GitHub Pages. La configuración se gestiona mediante tres mecanismos integrados:
1. **Constantes Core en Código (`window.TCONTROL_CONFIG`):** Parámetros por defecto y fallbacks inmutables en cliente.
2. **Colección `configuracion` en Cloud Firestore:** Parámetros dinámicos modificables en caliente sin necesidad de hacer redeploy del código.
3. **Almacenamiento Local (`localStorage`):** Feature flags y preferencias locales de estación.

---

## 2. Parámetros Globales Maestros (`JS/tcontrol_core.js` / `JS/config.js`)

| Parámetro | Valor Predeterminado | Tipo | Propósito y Comportamiento | Evidencia |
|---|---|---|---|---|
| `API_URL` | `https://script.google.com/macros/s/AKfycbxgmtQXWi-qDYyjT8kG6jsIEWZPbXXcHtLMaYqTlx2Allv7qkb9oe6ZGYt6lP6lCPZb/exec` | String (URL) | Endpoint de Google Apps Script para sincronización y cálculos | `JS/tcontrol_core.js:L8` |
| `ADMIN_ID` | `"1058"` | String | Identificador del Administrador Master con privilegios absolutos | `JS/tcontrol_core.js:L9` |
| `LAT_EMPRESA` | `-0.1288771313385675` | Float (Latitud) | Coordenada latitud central de la sede corporativa | `JS/tcontrol_core.js:L10` |
| `LNG_EMPRESA` | `-78.47896772889067` | Float (Longitud) | Coordenada longitud central de la sede corporativa | `JS/tcontrol_core.js:L11` |
| `RADIO_METROS` | `250` | Integer | Radio esférico de tolerancia para marcación física | `JS/tcontrol_core.js:L12` |
| `HORA_INICIO_ESPERADA`| `"07:30"` | String (HH:mm) | Hora oficial de inicio de jornada ordinaria | `JS/tcontrol_core.js:L14` |
| `HORA_ENTRADA_LIMITE` | `"07:45"` | String (HH:mm) | Umbral de gracia; entradas posteriores exigen justificación | `JS/tcontrol_core.js:L15` |
| `HORA_LIMITE_ALMUERZO`| `"09:30"` | String (HH:mm) | Hora tope para selección de menú en comedor | `JS/tcontrol_core.js:L13` |
| `HORA_SALIDA` | `"16:15"` | String (HH:mm) | Hora oficial de finalización de jornada de Lunes a Viernes | `JS/tcontrol_core.js:L16` |
| `ALMUERZO_ACTIVO` | `true` | Boolean | Activa/desactiva la restricción de horario de almuerzo | `JS/tcontrol_core.js:L17` |
| `WHATSAPP_NUMBER` | `"593963561149"` | String (E.164) | Número telefónico de mesa de ayuda / soporte TI | `JS/tcontrol_core.js:L18` |
| `WHATSAPP_MESSAGE` | `"Hola, necesito soporte técnico para el sistema CONTROL 2026"` | String | Mensaje inicial al pulsar botón flotante de WhatsApp | `JS/tcontrol_core.js:L19` |

---

## 3. Configuración de Firebase Firestore (`JS/firebase_backend.js`)

```javascript
const firebaseConfig = {
    apiKey: "[REDACTED]",
    authDomain: "tcontrol-asistencia.firebaseapp.com",
    projectId: "tcontrol-asistencia",
    storageBucket: "tcontrol-asistencia.firebasestorage.app",
    messagingSenderId: "400445408344",
    appId: "1:400445408344:web:1ef803575febd8d311362d",
    measurementId: "G-X0NRST4Y8L"
};
```

- **Ajuste de Conexión de Red:**
  ```javascript
  db.settings({ experimentalForceLongPolling: true });
  ```
  Fuerza el transporte a Long-Polling HTTP en lugar de WebSockets nativos para garantizar conectividad en redes corporativas con inspección SSL y firewalls estrictos.

---

## 4. Configuración del Microservicio de WhatsApp (`JS/openwa_service.js` / Python)

| Parámetro | Valor Predeterminado | Ubicación / Origen | Propósito |
|---|---|---|---|
| `servidorUrl` | `http://192.168.10.129:2785` (LAN) o `https://*.trycloudflare.com` (Túnel) | `configuracion/whatsapp` en Firestore y `localStorage` | Endpoint activo para despacho de mensajes |
| `servidorUrlLocal` | `http://192.168.10.129:2785` | `openwa_service.js:L10` | IP interna de respaldo cuando el cliente está en la misma red LAN |
| `apiKey` | `[REDACTED]` | `openwa_service.js:L11` | Clave de autenticación para OpenWA / WAHA API |
| `sessionId` | `5a509468-647a-4973-b10c-bf87d04666ea` | `openwa_service.js:L75` | UUID de sesión de WhatsApp conectada |
| `PORT_BRIDGE` | `2786` | `services/whatsapp/iniciar_tunel.py:L34` | Puerto local del proxy inversor CORS |
| `CLOUDFLARED_PATH` | `C:\Users\tcontrol\bin\cloudflared.exe` | `services/whatsapp/iniciar_tunel.py:L36` | Ruta absoluta al binario oficial de Cloudflare |

---

## 5. Parámetros de Backend en Google Apps Script (`backend/apps_script/`)

| Constante | Valor | Archivo | Propósito |
|---|---|---|---|
| `HOJA_REGISTROS` | `"REGISTROS"` | `api_completa.gs:L3` | Nombre de hoja para marcaciones |
| `HOJA_EMPLEADOS` | `"EMPLEADOS"` | `api_completa.gs:L2` | Nombre de hoja para nómina activa |
| `HOJA_VACACIONES` | `"VACACIONES"` | `api_completa.gs:L4` | Nombre de hoja para registro de descansos |
| `HOJA_CALCULAR_VACACIONES` | `"CALCULAR_vacaciones"` | `api_completa.gs:L5` | Hoja con fórmulas de cálculo |
| `HOJA_DESVINCULADOS` | `"DESVINCULADOS"` | `api_completa.gs:L6` | Hoja pasiva para extrabajadores (LOPDP) |
| `HOJA_ALMUERZOS_EXTRA` | `"ALMUERZOS_EXTRA"` | `api_completa.gs:L8` | Hoja para comensales invitados |
| `CLAVE_GUARDIA` | `[REDACTED]` | `api_completa.gs:L14` | Clave de acceso a terminal garita |
| `FIRESTORE_PROJECT_ID`| `"tcontrol-asistencia"`| `archivador_diario.gs:L11` | ID del proyecto en Google Cloud |
| `DIAS_A_MANTENER` | `60` | `archivador_diario.gs:L12` | Período de retención en Firestore antes de migrar a Sheets |
| `Script API Key` | `[REDACTED]` | `api_completa.gs:L138,178` | Token de autorización de Google Apps Script |

---

## 6. Feature Flags y Almacenamiento Local (`localStorage`)

- `tcontrol_use_firebase`:  
  - Valor: `'true'` (por defecto) o `'false'`.  
  - Si es `'false'`, toda la app conmuta a peticiones JSONP contra Google Apps Script ignorando Firestore.
- `tcontrol_vacaciones_cache_v3`:  
  - Caducidad: 6 horas (`6 * 3600 * 1000` ms).  
  - Almacena el JSON de saldos vacacionales para responder de forma instantánea sin latencia.
- `tcontrol_almuerzos_extra_cache_v2`:  
  - Caché local de invitados autorizados.
- `sidebarCollapsed`:  
  - Controla si el panel lateral de navegación del supervisor inicia colapsado o expandido.
