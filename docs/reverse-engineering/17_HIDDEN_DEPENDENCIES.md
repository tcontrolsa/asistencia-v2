# 17 — Dependencias Ocultas y Factores Críticos de Entorno

**Sistema:** TCONTROL — Sistema de Gestión y Control Biométrico de Asistencia (2026)  
**Fecha de Análisis:** 2026-09-29  
**Estado:** [VERIFIED]  

---

## 1. Direcciones IP y Puertos Hardcoded en el Código

| Elemento | Valor Hardcoded | Ubicación en el Código | Impacto / Riesgo si se Migra sin Reconfigurar |
|---|---|---|---|
| **Dirección IP LAN** | `192.168.10.129` | `JS/openwa_service.js:L9,10,353,409,538`<br/>`sw.js:L105`<br/>`services/whatsapp/iniciar_tunel.py:L33,65`<br/>`services/whatsapp/whatsapp_cors_bridge.py:L6,31` | Si la máquina donde corre el servidor de WhatsApp cambia de IP en la red o se aloja en otra subred (ej: `192.168.1.X` o `10.0.0.X`), las conexiones LAN y el proxy Python fallarán por timeout. |
| **Puerto OpenWA** | `2785` | `JS/openwa_service.js:L9,10`<br/>`sw.js:L108`<br/>`services/whatsapp/iniciar_tunel.py:L33,65`<br/>`services/whatsapp/whatsapp_cors_bridge.py:L6,31` | Debe coincidir exactamente con el puerto donde la instancia de OpenWA/WAHA esté levantada. |
| **Puerto CORS Bridge**| `2786` | `services/whatsapp/iniciar_tunel.py:L34,158`<br/>`services/whatsapp/whatsapp_cors_bridge.py:L7,84` | Puerto local en `127.0.0.1`. Si otro servicio en la máquina ocupa el puerto 2786, el proxy fallará al iniciar. |
| **Puerto Legacy** | `8081` | `sw.js:L109`<br/>`JS/openwa_service.js:L124` | Puerto anterior del servicio de WhatsApp mantenido en listas blancas y rutinas de migración. |

---

## 2. Rutas Absolutas y Nombres de Usuario de Sistema Operativo

| Ruta / Elemento | Valor en el Código | Ubicación | Impacto en Reconstrucción |
|---|---|---|---|
| **Ruta a Binario Cloudflared** | `C:\Users\tcontrol\bin\cloudflared.exe` | `services/whatsapp/iniciar_tunel.py:L36` | **Alta dependencia de usuario Windows:** Si el sistema se ejecuta en otro equipo con usuario diferente (ej: `C:\Users\Admin\...` o en Linux `/usr/local/bin/cloudflared`), el script fallará salvo que `cloudflared` esté en el PATH del sistema (`iniciar_tunel.py:L166` tiene fallback con `shutil.which`). |
| **Comando de Muerte de Procesos** | `taskkill /F /IM cloudflared.exe` | `services/whatsapp/iniciar_tunel.py:L183` | Dependencia exclusiva del comando de sistema `taskkill` de Windows. En Linux/macOS debe reemplazarse por `killall` o `pkill`. |
| **Scripts por Lotes Batch** | `iniciar_tunel_whatsapp.bat` | Raíz y `services/whatsapp/` | Sintaxis `cmd.exe` (`%~dp0`, `@echo off`). Requiere archivo `.sh` equivalente para entornos Unix/Docker. |

---

## 3. Identificadores, Claves y Parámetros Mágicos (Magic Constants)

| Constante | Valor | Ubicación | Significado y Efecto de Negocio |
|---|---|---|---|
| `ADMIN_ID` | `"1058"` | `JS/tcontrol_core.js:L9` | Define el ID del colaborador que posee bypass y permisos de superadministrador en la UI y configuración. |
| `CLAVE_GUARDIA` | `[REDACTED]` | `backend/apps_script/api_completa.gs:L14`<br/>`JS/guardia_core.js` | Contraseña fija para activar y operar el terminal de garita de seguridad. |
| `GAS API Key` | `[REDACTED]` | `backend/apps_script/api_completa.gs:L138,178` | Token exigido en el backend de Google Apps Script para aceptar peticiones GET/POST. |
| `OpenWA Session UUID` | `5a509468-647a-4973-b10c-bf87d04666ea` | `JS/openwa_service.js:L75,502,563,670` | UUID específico de la sesión de WhatsApp configurada en el servidor local. |
| `Túneles Obsoletos Hardcoded` | `quote-bacteria-valve-lights`, `trails-aids-spending-targeted`, `sleeps-element-creates-taught` | `JS/openwa_service.js:L125-127,352` | Subdominios temporales de Cloudflare de pruebas pasadas que el sistema detecta para limpiar automáticamente del `localStorage`. |

---

## 4. Dependencias del Hardware y APIs del Navegador (Client Capabilities)

Para que el sistema funcione en un dispositivo cliente, este debe soportar obligatoriamente:

1. **API de Geolocalización (`navigator.geolocation`):**
   - Requiere obligatoriamente **contexto seguro (HTTPS)**.
   - En Android/iOS requiere que el usuario conceda permiso de ubicación `Precisa` (no aproximada).
2. **MediaDevices / Cámara Web (`navigator.mediaDevices.getUserMedia`):**
   - Requiere HTTPS.
   - Utilizado para proyectar la cámara frontal hacia un elemento `<video>` y transferir el fotograma al `<canvas>` para la compresión de la selfie.
3. **Web Cryptography API (`window.crypto.subtle`):**
   - Requiere HTTPS.
   - El sistema cuenta con fallback matemático puro (`sha256PureJs`), pero la vía nativa es la principal.
4. **Vibración Háptica (`navigator.vibrate`):**
   - Emitida en timbrados exitosos. Soportada en Android; ignorada silenciosamente en iOS Safari.
5. **Service Worker & CacheStorage API:**
   - Requiere HTTPS.
   - Permite la instalación PWA (A2HS: Add to Home Screen) y la contingencia offline.

---

## 5. Dependencias Implícitas de Zona Horaria y Calendario

- **Zona Horaria del Sistema:** `America/Guayaquil` (GMT-5 / UTC-5) inalterable.
- Todos los cálculos de horas en Google Apps Script (`Session.getScriptTimeZone()`) asumen GMT-5. Si el servidor de ejecución de Apps Script o el cliente móvil estuvieran en otra zona horaria sin normalizar, los timbrados se desfasarían.
- **Feriados de Ecuador Hardcoded en Código:**  
  La función `esFeriadoEcuador()` en `backend/apps_script/api_completa.gs:L86-124` contiene listas fijas de feriados nacionales y de Quito, además de fechas móviles para **2024, 2025 y 2026** (Carnaval, Viernes Santo).
  - *Riesgo Oculto:* A partir del año 2027, las fechas móviles no están declaradas en el código y no serán reconocidas como feriados automáticamente salvo actualización del script.
