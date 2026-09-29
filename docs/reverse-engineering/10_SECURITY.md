# 10 — Modelo de Seguridad y Protección de Datos

**Sistema:** TCONTROL — Sistema de Gestión y Control Biométrico de Asistencia (2026)  
**Marco Legal:** Ley Orgánica de Protección de Datos Personales (LOPDP - Registro Oficial Sup. 459, Ecuador)  
**Fecha de Análisis:** 2026-09-29  
**Estado:** [VERIFIED]  

---

## 1. Matriz de Roles y Control de Acceso (RBAC)

El sistema define 5 niveles de privilegios estrictamente delimitados:

| Rol | Ámbito de Operación | Factor de Autenticación | Almacenamiento de Sesión | Capacidades Permitidas | Restricciones Estrictas |
|---|---|---|---|---|---|
| **EMPLEADO** | `index.html` (Móvil / PWA) | Token de Dispositivo (`DEV_XXXX`) + PIN (Hash SHA-256) | `localStorage` (`TCONTROL_DEVICE_TOKEN`) | Registrar marcaciones propias con GPS/Foto, solicitar almuerzo propio, ver historial propio, rol de pagos, trivias y botón de emergencia. | No puede ver datos de otros empleados, no puede alterar horarios, no puede justificar faltas, no puede ver reportes globales. |
| **GUARDIA** | `guardia.html` (Garita) | Clave Maestra de Caseta (`CLAVE_GUARDIA = '[REDACTED]'`) | `sessionStorage` (`GUARDIA_SESSION`) | Registrar timbrados para cualquier colaborador por ID, consultar conteo y lista de presentes en planta física. | No puede ver saldos de vacaciones, sueldos, justificar horas ni alterar configuraciones del sistema. |
| **CATERING** | `catering.html` (Comedor) | ID + PIN de Supervisor / Encargado de Cocina | `sessionStorage` (`CATERING_SESSION`) | Visualizar raciones del día (Normal, Dieta, Vegetariano, Invitados), marcar ración como despachada/consumida. | Acceso restringido exclusivamente al módulo de alimentación. |
| **SUPERVISOR** | `supervisor.html` (Dashboard) | ID de Empleado con `supervisor == 'SI'` + PIN SHA-256 | `sessionStorage` (`SUPERVISOR_SESSION`) | Ver dashboard en vivo, aprobar horas extras, justificar ausencias médicas/personales, enviar WhatsApps a su equipo, exportar XLSX/PDF. | Restringido al área asignada en su perfil (salvo permiso ampliado). No puede modificar geocercas centrales ni purgar bases. |
| **ADMIN_MASTER** | `admin_config.html`, `supervisor.html` | ID `1058` / Credencial Master (`ADMIN_ID = "1058"`) | `sessionStorage` (`SUPERVISOR_SESSION` con flag master) | Acceso total a todas las áreas, modificar geocerca (lat/lng/radio), alterar horarios corporativos, desvincular personal, resetear PINs masivamente y migrar datos. | Sujeto a logs de auditoría patronal inmutables en Firestore. |

---

## 2. Autenticación y Criptografía

### 2.1 Hashing de Credenciales (PIN)
- **Algoritmo:** Secure Hash Algorithm 256-bit (**SHA-256**) (`JS/tcontrol_core.js:L56-135`).
- **Implementación Primaria:** Web Cryptography API nativa del navegador:
  ```javascript
  const encoder = new TextEncoder();
  const data = encoder.encode(str.toString().trim());
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  ```
- **Implementación de Contingencia (Fallback Puro):** `sha256PureJs(ascii)` en caso de que la PWA se ejecute en navegadores antiguos o contextos no seguros (`crypto.subtle` requiere HTTPS).
- **Almacenamiento:** El hash hexadecimal de 64 caracteres se persiste en el atributo `pin` del documento `empleados/{id}`.

### 2.2 Vinculación por Token de Dispositivo (Hardware Binding)
- Para evitar que un empleado comparta su PIN con un compañero para que marque por él desde otro teléfono, cada navegador genera un token pseudoaleatorio:
  ```javascript
  function generarDeviceToken(prefix = 'DEV') {
      return prefix + '_' + Math.random().toString(36).substr(2, 9).toUpperCase();
  }
  ```
- El token se registra en la colección `dispositivos/{token}` vinculándolo a un único `id_empleado`. Si el colaborador intenta abrir la app desde otro teléfono, el sistema detecta que el nuevo dispositivo no está vinculado y exige re-enrolamiento con validación previa de RRHH.

---

## 3. Seguridad a Nivel de Base de Datos (Cloud Firestore Rules)

Las reglas de seguridad implementadas en `firestore.rules` imponen principios de mínima exposición y protección contra borrados destructivos:

1. **Protección Antidestrucción de Empleados:**
   ```text
   match /empleados/{empleadoId} {
     allow read: if true;
     allow create, update: if request.resource.data.keys().hasAll(['id']);
     allow delete: if false; // TERMINANTEMENTE PROHIBIDO BORRAR EMPLEADOS
   }
   ```
2. **Inmutabilidad de Auditorías y Bitácoras Legales:**
   Las colecciones `auditoria_almuerzos`, `logs_whatsapp` y `logs` solo permiten la creación de documentos, prohibiendo modificaciones o eliminaciones posteriores:
   ```text
   match /logs_whatsapp/{logId} {
     allow read: if true;
     allow create: if true;
     allow update, delete: if false; // INMUTABLE
   }
   ```
3. **Custodia Pasiva de Desvinculaciones (LOPDP):**
   ```text
   match /empleados_desvinculados/{desvinculadoId} {
     allow read, create, update: if true;
     allow delete: if false; // CUSTODIA LEGAL INALTERABLE
   }
   ```
4. **Protección de Parámetros Globales:**
   La colección `configuracion` no puede ser borrada bajo ninguna circunstancia (`allow delete: if false;`).

---

## 4. Seguridad en el Transporte de Datos y Prevención de Amenazas

### 4.1 Protección contra Contenido Mixto (Mixed Content Prevention)
- Dado que el sitio web se sirve bajo `https://asistencia.tcontrolsa.com`, cualquier petición a un servidor local `http://192.168.10.129` es abortada inmediatamente por los navegadores modernos (Chrome, Safari, Edge).
- El sistema cuenta con detección preventiva `_esInseguroEnHttps(url)` (`JS/openwa_service.js:L344-346`). Si detecta intento de conexión HTTP desde HTTPS, aborta la petición antes de que el navegador dispare una alerta de seguridad y conmuta automáticamente a la URL del túnel Cloudflare HTTPS (`*.trycloudflare.com`).

### 4.2 CORS (Cross-Origin Resource Sharing)
- Las llamadas a Google Apps Script se ejecutan mediante **JSONP** (`<script src="...">`) para evitar los bloqueos de pre-flight OPTIONS de los navegadores.
- Para el microservicio de WhatsApp, el script `whatsapp_cors_bridge.py` (`services/whatsapp/whatsapp_cors_bridge.py:L10-15`) actúa como proxy intermedio inyectando cabeceras seguras:
  ```http
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
  Access-Control-Allow-Headers: *
  Access-Control-Max-Age: 86400
  ```

### 4.3 Sanitización y Prevención de Cross-Site Scripting (XSS)
- Todas las cadenas renderizadas en modales, tablas y descargas pasan por la función de sanitización HTML `escapeHtml` (`JS/tcontrol_core.js:L428-437`):
  ```javascript
  function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
  }
  ```

---

## 5. Cumplimiento Normativo de Privacidad (LOPDP Ecuador)

El sistema opera bajo los principios de la **Ley Orgánica de Protección de Datos Personales de la República del Ecuador (Registro Oficial Suplemento 459)**:

1. **Principio de Finalidad Estricta (Art. 7):**
   - Las coordenadas GPS y fotografías biométricas se recaban exclusivamente para verificar la identidad y presencia laboral al momento del timbrado.
2. **Minimización y Prohibición de Rastreo Continuo:**
   - Declarado explícitamente en el aviso legal institucional (`JS/tcontrol_core.js:L554-560`):  
     > *"El sistema NO efectúa rastreo continuo, ni monitorea los desplazamientos del colaborador en tiempo real fuera del segundo exacto en que presiona el botón de marcación."*
3. **Tratamiento de Datos Biométricos Sensibles (Art. 25):**
   - Las fotos selfie se capturan como factor biométrico no invasivo de autenticación de presencia y no se someten a perfilamiento comercial ni se transfieren a terceros.
4. **Conservación y Archivo de Desvinculaciones (Art. 21):**
   - Al terminar la relación laboral, los datos no se destruyen para preservar la evidencia exigida por el Código del Trabajo, Ministerio del Trabajo, SRI e IESS durante el plazo de prescripción patronal.
5. **Modal Institucional de Aviso de Privacidad y Derechos ARCO:**
   - La plataforma incluye en todos sus módulos la función `abrirModalAvisoPrivacidad()` (`JS/tcontrol_core.js:L485-609`) informando los derechos de Acceso, Rectificación, Actualización, Eliminación y Oposición.
