# 18 — Comportamientos Implícitos del Sistema

**Sistema:** TCONTROL — Sistema de Gestión y Control Biométrico de Asistencia (2026)  
**Fecha de Análisis:** 2026-09-29  
**Estado:** [VERIFIED]  

---

## 1. Catálogo de Comportamientos Implícitos

Los siguientes comportamientos fueron descubiertos mediante ingeniería inversa analizando el flujo de ejecución del código fuente, condiciones de borde y lógica no descrita formalmente en los manuales de usuario:

---

### IMP-001: Deduplicación Silenciosa por Identificador Compuesto
- **Regla:** `docId = {empleadoId}_{tipo}_{fecha}_{horaSinDosPuntos}`
- **Comportamiento:** Si un colaborador pulsa repetidamente el botón de marcación debido a lentitud aparente de su conexión móvil, la aplicación no genera registros duplicados ni emite un error de colisión de clave única. En su lugar, Firestore sobreescribe silenciosamente el mismo documento con los datos más recientes.
- **Evidencia en Código:** `JS/firebase_backend.js:L88-90`, `JS/firebase_migration.js:L89`.

---

### IMP-002: Inferencia Automática del Tipo de Evento en Garita
- **Regla:** Detección de paridad en marcaciones diarias.
- **Comportamiento:** En `guardia.html`, al ingresar el ID de un colaborador, el guardia no tiene que elegir manualmente entre "Entrada" o "Salida". El sistema evalúa el historial del día:
  - Si el colaborador no tiene marcaciones hoy -> sugiere automáticamente **`ENTRADA`**.
  - Si el último registro fue `ENTRADA` o `RETORNO_ALMUERZO` -> sugiere automáticamente **`SALIDA`** (o `SALIDA_ALMUERZO`).
  - Si el último registro fue `SALIDA` -> sugiere automáticamente **`ENTRADA`** (retorno o turno extra).
- **Evidencia en Código:** `JS/guardia_core.js:L180-220`.

---

### IMP-003: Asignación Forzada de "NO ALMUERZO" Pasadas las 09:30 AM
- **Regla:** Restricción de horario de cocina.
- **Comportamiento:** Si un colaborador timbra su entrada después de las 09:30 AM, el campo `almuerzo` se fuerza internamente a `'NO'`, y el panel de selección de menú se desactiva con candado. El sistema no le permite al colaborador seleccionar plato aun cuando sea su primer timbrado del día.
- **Evidencia en Código:** `JS/tcontrol_core.js:L13,17`, `JS/index_core.js`.

---

### IMP-004: Salida Diferenciada en Fines de Semana para Autocompletado
- **Regla:** Salida a las 15:15:00 en fines de semana vs 16:15:00 en laborables.
- **Comportamiento:** Cuando el script de autocompletado de Google Apps Script (`autocompletar_salidas.gs`) corre por la noche para cerrar jornadas abiertas:
  - Si el día fue Sábado o Domingo, la salida se fija a las **`15:15:00`**.
  - Si el día fue de Lunes a Viernes, la salida se fija a las **`16:15:00`**.
  - Además, se asegura que el campo `HORAS_EXTRA` quede en `'NO'` y `AUTORIZA` en blanco, para no premiar con sobretiempo falso a quien olvidó timbrar su salida.
- **Evidencia en Código:** `backend/apps_script/autocompletar_salidas.gs:L181-183,450-456`.

---

### IMP-005: Transformación Dinámica de URLs de Google Drive a Googleusercontent CDN
- **Regla:** Reescritura de enlaces de fotos en tiempo de ejecución.
- **Comportamiento:** Los administradores suelen pegar enlaces de fotos compartidos desde Google Drive (ej: `https://drive.google.com/file/d/1A2B3C.../view?usp=sharing`). Si el navegador intentara cargar esa URL directamente en una etiqueta `<img src="...">`, fallaría o abriría la interfaz de Google Drive.
- **Transformación:** La función `fixFotoUrl()` intercepta la cadena, extrae mediante expresiones regulares el `fileId` y lo reescribe al vuelo:
  ```text
  https://lh3.googleusercontent.com/d/{fileId}=w200
  ```
  Esto permite cargar la imagen directamente como recurso binario con redimensionamiento dinámico en los servidores de Google.
- **Evidencia en Código:** `JS/tcontrol_core.js:L22-53`.

---

### IMP-006: Normalización Inteligente de Números Móviles de Ecuador
- **Regla:** Formateo automático de prefijos internacionales WhatsApp.
- **Comportamiento:** La función `normalizarNumero()` en `openwa_service.js` corrige automáticamente errores humanos comunes al tipear números de celular ecuatorianos:
  1. Si tiene 10 dígitos y empieza con `09` (ej: `0984660105`) -> lo convierte a `593984660105@c.us`.
  2. Si tiene 9 dígitos y empieza con `9` (ej: `984660105`) -> añade `593` -> `593984660105@c.us`.
  3. Si tiene 13 dígitos y empieza con `59309` (ej: `5930984660105`) -> remueve el cero intermedio -> `593984660105@c.us`.
  4. Si ya contiene `@lid` o `@c.us`, preserva el sufijo original.
- **Evidencia en Código:** `JS/openwa_service.js:L317-341`.

---

### IMP-007: Desactivación Automática de Pull-to-Refresh en Panel de Supervisión
- **Regla:** Prevención de pérdida de datos por gestos táctiles involuntarios.
- **Comportamiento:** El gesto táctil de deslizar hacia abajo para recargar la página (Pull-to-Refresh) está habilitado en la app del empleado para refrescar credenciales, pero se desactiva explícitamente si la URL contiene `supervisor` o si existe el elemento `#btnMobileMenu`. Esto previene que un supervisor pierda una justificación a medio redactar al hacer scroll en una tabla larga.
- **Evidencia en Código:** `JS/tcontrol_core.js:L330-332`.

---

### IMP-008: Tolerancia a Fallos en Cascada para Vacaciones (Stale-While-Error)
- **Regla:** Retorno de datos obsoletos preferible a pantalla de error.
- **Comportamiento:** Al consultar saldos de vacaciones, si Google Sheets tarda más de 15 segundos o arroja un error de cuota/red, el sistema no muestra un mensaje de error al colaborador. En su lugar, el bloque `catch` busca en `localStorage` la última versión exitosa registrada (incluso si tiene más de 6 horas) y la presenta en pantalla con la bandera interna `desdeCache: true`.
- **Evidencia en Código:** `JS/firebase_backend.js:L280-324`.

---

### IMP-009: Invalidación en Cascada de Tokens al Desvincular
- **Regla:** Revocación instantánea de acceso físico al despedir o finiquitar.
- **Comportamiento:** Cuando RRHH pulsa "Desvincular Colaborador", la función no solo traslada el perfil a `empleados_desvinculados`, sino que ejecuta una consulta en la colección `dispositivos` buscando todos los tokens asociados a ese `id_empleado` y establece `activo: false`. Si el extrabajador intenta abrir la app en su teléfono minutos después, el token es rechazado y se le impide ver la credencial de la empresa.
- **Evidencia en Código:** `JS/firebase_backend.js:L124-127,1506-1517`.

---

### IMP-010: Limpieza Automática de Túneles Muertos en Clientes
- **Regla:** Auto-sanación de URLs de Cloudflare obsoletas en `localStorage`.
- **Comportamiento:** Al inicializar `openwa_service.js`, el cliente inspecciona si su configuración local todavía tiene registradas URLs de túneles temporales de prueba que ya fueron cerrados (ej. `quote-bacteria-valve-lights`, `trails-aids-spending-targeted`). Si las detecta, las purga automáticamente y restaura la configuración a la IP del servidor base `192.168.10.129:2785`.
- **Evidencia en Código:** `JS/openwa_service.js:L123-132`.
