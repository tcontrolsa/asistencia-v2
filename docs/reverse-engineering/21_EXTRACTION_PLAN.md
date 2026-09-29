# 21 — Plan de Extracción y Clasificación de Componentes

**Sistema:** TCONTROL — Sistema de Gestión y Control Biométrico de Asistencia (2026)  
**Fecha de Análisis:** 2026-09-29  
**Estado:** [VERIFIED]  

---

## 1. Criterios de Clasificación para la Reconstrucción

Para garantizar una transición limpia hacia una nueva arquitectura sin perder comportamiento, cada archivo y elemento del proyecto se clasifica bajo una de las 7 acciones canónicas:

- **`COPY`:** Elemento estático inalterable (imágenes, iconos, audios, avisos legales aprobados) que se traslada directamente.
- **`REIMPLEMENT`:** Lógica de negocio crítica que debe construirse en el nuevo stack conservando estrictamente el comportamiento, las fórmulas matemáticas y los contratos de entrada/salida.
- **`REFACTOR`:** Código monolítico o procedural legacy que debe reestructurarse bajo patrones modernos (TypeScript, componentes React/Vue/Svelte, inyección de dependencias) para eliminar duplicación y código espagueti.
- **`MIGRATE`:** Datos persistentes en Cloud Firestore y Google Sheets que deben exportarse, validarse y cargarse en el nuevo motor de base de datos.
- **`RECONFIGURE`:** Parámetros de entorno, coordenadas GPS, URLs y puertos que deben adaptarse al nuevo ambiente de hosting o nube.
- **`REGENERATE`:** Archivos derivados, cachés o manifests que deben generarse automáticamente en el nuevo pipeline de construcción.
- **`DISCARD`:** Código muerto, scripts temporales de desarrollo, librerías obsoletas o volcados redundantes que no deben formar parte del nuevo repositorio.

---

## 2. Matriz Detallada de Extracción por Componente

| Elemento / Archivo | Tipo de Recurso | Acción Recomendada | Motivo y Justificación Técnica |
|---|---|---|---|
| `assets/images/*.png` | Recursos Gráficos | **`COPY`** | Logotipos corporativos oficiales de TCONTROL (fondos oscuros, claros, versiones rojas). |
| `assets/icons/*.png` | Recursos PWA | **`COPY`** | Íconos de aplicación (192px, 512px) aprobados para pantalla de inicio. |
| `assets/legacy_media/*.gif` | Animaciones | **`DISCARD`** | Animaciones antiguas de respaldo; la nueva UI debe implementar microinteracciones CSS/SVG modernas. |
| `JS/tcontrol_core.js` (Fórmula Haversine) | Regla Matemática | **`REIMPLEMENT`** | El cálculo geodésico de 250m debe mantenerse idéntico en el nuevo sistema. |
| `JS/tcontrol_core.js` (sha256PureJs) | Criptografía | **`REFACTOR`** | En un stack moderno con soporte HTTPS garantizado se debe usar Web Crypto API nativo o biblioteca criptográfica estándar, manteniendo fallback. |
| `JS/tcontrol_core.js` (TCONTROL_LEGAL) | Texto Normativo | **`COPY`** | Descargos legales y cláusulas aprobadas bajo la Ley Orgánica de Protección de Datos Personales (LOPDP). |
| `JS/firebase_backend.js` | Capa de Persistencia | **`REFACTOR`** | Archivo monolítico de 4,254 líneas con más de 45 métodos acoplados. Debe modularizarse en Servicios desacoplados (e.g. `AttendanceService`, `EmployeeService`, `CateringService`). |
| `JS/index_core.js` | Lógica de Empleado | **`REFACTOR`** | Monolito de 7,617 líneas con manipulación directa del DOM. Debe transformarse en vistas/componentes modernos con tipado estricto. |
| `JS/supervisor_core.js` | Lógica de Supervisión | **`REFACTOR`** | Monolito de 12,146 líneas. Requiere segmentación en módulos independientes de dominio con estado reactivo. |
| `JS/supervisor/supervisor_*.js` | Submódulos Supervisor | **`REFACTOR`** | Reorganizar en módulos de features (`features/reports`, `features/directory`, `features/map`, `features/whatsapp`). |
| `JS/openwa_service.js` | Integración WhatsApp | **`REFACTOR`** | La lógica de normalización de números ecuatorianos y plantillas debe conservarse (**`REIMPLEMENT`**), pero el transporte HTTP debe desacoplarse. |
| `JS/logger.js` | Diagnóstico | **`REFACTOR`** | Migrar a un servicio estándar de logging estructurado con exportación remota opcional. |
| `CSS/*.css` | Hojas de Estilo | **`REFACTOR`** | Extraer las variables CSS de diseño (`:root`) a un Design System centralizado (CSS Modules o Vanilla Tokens). |
| `firestore.rules` | Reglas de Seguridad | **`REIMPLEMENT`** | Preservar las reglas de inmutabilidad de logs y la prohibición de eliminación de colaboradores activos. |
| `backend/apps_script/api_completa.gs` | Backend GAS | **`REFACTOR`** | Mantener endpoints esenciales de nómina y cálculos de vacaciones de Sheets; eliminar funciones redundantes ya asumidas por Firestore. |
| `backend/apps_script/archivador_diario.gs` | Automatización Cron | **`REIMPLEMENT`** | La política de retención de 60 días y migración batch a Sheets debe preservarse exactamente con la misma frecuencia (20:00). |
| `backend/apps_script/autocompletar_salidas.gs` | Automatización Cron | **`REIMPLEMENT`** | La regla de 15:15:00 en fines de semana y 16:15:00 en laborables debe conservarse sin alteraciones. |
| `backend/apps_script/mantenimiento_registros.gs` | Sanitización y HE | **`REIMPLEMENT`** | La regla de cálculo automático de horas extras (>45 min post-jornada) debe conservarse. |
| `services/whatsapp/iniciar_tunel.py` | Microservicio Local | **`REFACTOR`** | Reestructurar como servicio Docker / systemd o binario independiente con manejo de señales multiplataforma. |
| `iniciar_tunel_whatsapp.bat` | Launcher Windows | **`RECONFIGURE`** | Adaptar paths absolutos (`C:\Users\tcontrol\...`) a variables de entorno o ejecutables portables. |
| Colección Firestore `empleados` | Base de Datos | **`MIGRATE`** | Exportar documentos existentes de colaboradores y cargar en la nueva base. |
| Colección Firestore `registros` | Base de Datos | **`MIGRATE`** | Migrar los últimos 60 días de marcaciones operativas activas. |
| Hojas Sheets `REGISTROS` / `VACACIONES` | Data Warehouse | **`MIGRATE`** | Conservar la hoja de cálculo como histórico inalterable de auditoría laboral. |
| `sw.js` | Service Worker | **`REGENERATE`** | Regenerar en la nueva versión con precaching automatizado de los nuevos bundles. |
| `manifest.json` | PWA Manifest | **`RECONFIGURE`** | Actualizar scope, start_url y colores si se rediseña la paleta. |
| `CNAME` | DNS | **`RECONFIGURE`** | Apuntar el registro DNS del dominio `asistencia.tcontrolsa.com` al nuevo proveedor de hosting. |
| `tools/scratch/*` (51 archivos) | Pruebas Ad-Hoc | **`DISCARD`** | Scripts de pruebas locales temporales; no deben transferirse al código de producción del nuevo sistema. |
| `backend/data/firestore_empleados.json` | Volcado de Producción | **`DISCARD`** | Archivo temporal con datos reales que debe regenerarse mediante exportación segura bajo demanda. |
| Passwords y Claves en Código | Secretos | **`DISCARD`** | Claves quemadas (`TCONTROL2026`, `TCONTROL_SECURE_...`) deben descartarse y manejarse mediante variables de entorno seguras. |
