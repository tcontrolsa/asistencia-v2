# 01 — Inventario del Repositorio

**Sistema:** TCONTROL — Sistema de Gestión y Control Biométrico de Asistencia (2026)  
**Dominio de Producción:** `asistencia.tcontrolsa.com`  
**Fecha de Análisis:** 2026-09-29  
**Estado:** [VERIFIED]  

---

## 1. Información General del Control de Versiones

| Parámetro | Valor / Estado | Evidencia |
|---|---|---|
| **Sistema VCS** | Git | [VERIFIED] Directorio `.git/` presente en la raíz del repositorio |
| **Rama Principal Activa** | `main` | [VERIFIED] `git status` -> `On branch main` |
| **Commit Actual** | `ac53c18 commit 48` | [VERIFIED] `git log -n 1 --oneline` |
| **Estado del Working Tree** | Modificación local no commiteada en `JS/tcontrol_core.js` (adición de implementación pura de `sha256PureJs` como fallback criptográfico) | [VERIFIED] `git status`, `git diff JS/tcontrol_core.js` |
| **Políticas de Ignorados** | Configurado en `.gitignore` (excluye `backend/data/firestore_empleados.json`, `tools/scratch/`, `.env*`, etc.) | [VERIFIED] `.gitignore:L1-91` |

---

## 2. Inventario Completo de Archivos y Directorios

### 2.1 Archivos en la Raíz del Proyecto

| Archivo | Tipo / Módulo | Tamaño (aprox) | Líneas | Propósito y Responsabilidad | Estado |
|---|---|---|---|---|---|
| `CNAME` | Infraestructura DNS | 25 B | 1 | Define el dominio canónico `asistencia.tcontrolsa.com` para GitHub Pages | [VERIFIED] |
| `.gitignore` | Configuración VCS | 1.1 KB | 91 | Exclusiones de Git (temporales, claves, volcados JSON locales) | [VERIFIED] |
| `.gitattributes` | Configuración VCS | 66 B | 2 | Normalización de fin de línea LF/CRLF | [VERIFIED] |
| `README.md` | Documentación | 8.8 KB | 121 | Arquitectura general, roles, estructura de directorios y marco LOPDP | [VERIFIED] |
| `SECURITY.md` | Política de Seguridad | 1.7 KB | 20 | Declaración normativa conforme a LOPDP (Ecuador) y reporte de vulnerabilidades | [VERIFIED] |
| `index.html` | Frontend PWA | 12.2 KB | 237 | Punto de entrada del colaborador (Credencial, geocerca GPS, almuerzos, trivia, emergencias) | [VERIFIED] |
| `supervisor.html` | Frontend Dashboard | 365.5 KB | 5,195 | Consola central de supervisión, aprobación de asistencia, reportes, mapa, WhatsApp | [VERIFIED] |
| `guardia.html` | Frontend Garita | 8.2 KB | 173 | Terminal de garita para marcación rápida de personal sin smartphone o eventuales | [VERIFIED] |
| `catering.html` | Frontend Comedor | 3.5 KB | 88 | Terminal para proveedor de alimentación: conteo de raciones y despacho | [VERIFIED] |
| `admin_config.html` | Frontend Admin | 15.1 KB | 294 | Configuración de geocerca central, tolerancias, horarios, reseteo de PIN | [VERIFIED] |
| `ubicacion.html` | Frontend GPS | 6.0 KB | 125 | Monitoreo interactivo en mapa satelital Leaflet del personal en campo | [VERIFIED] |
| `visor_empleado.html` | Herramienta Admin | 37.0 KB | 899 | Simulador de credenciales e inspector de estados biométricos y de asistencia | [VERIFIED] |
| `diagnostico.html` | Herramienta Soporte | 2.2 KB | 52 | Validador interactivo de conectividad Firestore y Google Apps Script | [VERIFIED] |
| `offline.html` | Contingencia PWA | 6.3 KB | 185 | Pantalla offline mostrada por el Service Worker cuando no hay red | [VERIFIED] |
| `manifest.json` | PWA Manifest | 1.0 KB | 45 | Metadatos de instalación en Android/iOS/Desktop (standalone, theme-color `#dc2626`) | [VERIFIED] |
| `sw.js` | Service Worker | 7.3 KB | 198 | Motor de almacenamiento en caché PWA (v2.00, estrategia Stale-While-Revalidate para assets) | [VERIFIED] |
| `firestore.rules` | Reglas de Seguridad | 2.7 KB | 78 | Reglas de control de acceso y validación de esquemas en Google Cloud Firestore | [VERIFIED] |
| `iniciar_tunel_whatsapp.bat` | Launcher Windows | 245 B | 10 | Lanzador de acceso directo para iniciar el servicio de túnel WhatsApp | [VERIFIED] |

---

### 2.2 Directorio `JS/` (Lógica de Cliente y Motores de Negocio)

| Archivo | Líneas | Propósito y Dependencias | Estado |
|---|---|---|---|
| `JS/tcontrol_core.js` | 621 | Objeto global `window.TCONTROL_CONFIG`, `window.TCONTROL_LEGAL` (LOPDP), hashing SHA-256 (`crypto.subtle` + fallback `sha256PureJs`), cálculo de distancia Haversine, formateadores de hora/fecha y pull-to-refresh | [VERIFIED] |
| `JS/config.js` | 18 | Declaración básica heredada del endpoint de Google Apps Script y coordenadas centrales | [VERIFIED] |
| `JS/firebase_backend.js` | 4,254 | Motor maestro de persistencia y enrutador (`FirebaseBackend.procesarAccion`). Implementa más de 45 operaciones en Firestore y puente fallback hacia Apps Script | [VERIFIED] |
| `JS/openwa_service.js` | 1,588 | Servicio de notificaciones WhatsApp vía OpenWA/WAHA con Cloudflare Tunnel, verificación de contactos y plantillas institucionales con soporte de imágenes Base64 | [VERIFIED] |
| `JS/index_core.js` | 7,617 | Lógica completa de la App del Empleado: ciclo de registro de dispositivo con PIN, captura biométrica de selfie en canvas, geolocalización, pedidos de menú, trivia de cultura y rol de pagos | [VERIFIED] |
| `JS/supervisor_core.js` | 12,146 | Lógica central del Panel de Supervisión: KPIs en tiempo real, cálculo de horas laboradas, atrasos, horas extras automáticas/manuales, aprobaciones y justificaciones | [VERIFIED] |
| `JS/supervisor/supervisor_reportes_custom.js` | 1,675 | Generador visual de reportes interactivos, constructor de consultas y exportación masiva a Excel (SheetJS) y PDF (jsPDF / autoTable) | [VERIFIED] |
| `JS/supervisor/supervisor_whatsapp.js` | 1,230 | Interfaz de mensajería masiva para supervisión: envío de recordatorios de marcación, alertas de salida no registrada, avisos de ausencia y gestión de plantillas | [VERIFIED] |
| `JS/supervisor/supervisor_directorio.js` | 1,166 | Gestión de colaboradores: altas, modificación de datos laborales, cambio de modalidad (oficina/campo/taller), reseteo de PIN y desvinculación a base pasiva LOPDP | [VERIFIED] |
| `JS/supervisor/supervisor_mapa.js` | 825 | Visualizador Leaflet con clustering de coordenadas de marcación del personal y control de geocercas | [VERIFIED] |
| `JS/supervisor/supervisor_invitados.js` | 792 | Gestión de autorizaciones de almuerzos para visitantes corporativos, clientes y personal eventual | [VERIFIED] |
| `JS/supervisor/supervisor_emergencias.js` | 565 | Tablero de mando para emergencias y simulacros: activación de alerta general y seguimiento de respuestas del personal en planta/campo | [VERIFIED] |
| `JS/supervisor/supervisor_cultura.js` | 513 | Banco de preguntas institucionales de cultura corporativa TCONTROL, ranking de colaboradores y asignación por área | [VERIFIED] |
| `JS/guardia_core.js` | 546 | Lógica de la terminal de garita: autenticación por clave maestra de guardia, búsqueda por ID, registro de entrada/salida y consulta de presentes | [VERIFIED] |
| `JS/catering_core.js` | 543 | Lógica de terminal de comedor: login de supervisor, listado filtrable por tipo de dieta (normal/dieta/vegetariano) y despacho con timestamp | [VERIFIED] |
| `JS/admin_config_core.js` | 429 | Lógica de configuración administrativa: guardado en Firestore/Sheets de parámetros de geocerca, horarios límite y modo mantenimiento | [VERIFIED] |
| `JS/ubicacion_core.js` | 444 | Lógica del mapa en vivo independiente (`ubicacion.html`) con auto-refresco cada 60 segundos y clustering | [VERIFIED] |
| `JS/diagnostico_core.js` | 294 | Pruebas de conectividad HTTP/JSONP con Apps Script, latencia con Firestore y visor de logs locales | [VERIFIED] |
| `JS/logger.js` | 89 | Sistema de logging unificado `window.TCLogger` con buffer circular de 200 entradas y descarga en JSON | [VERIFIED] |
| `JS/firebase_migration.js` | 138 | Herramienta de migración en lote (batch commit de 500 docs) desde Google Sheets hacia Cloud Firestore | [VERIFIED] |

---

### 2.3 Directorio `CSS/` (Diseño Visual y Temas)

| Archivo | Líneas | Ámbito de Estilo | Estado |
|---|---|---|---|
| `CSS/supervisor.css` | 5,792 | Estilos completos del panel de supervisión (temas, sidebar colapsable, modales, tablas dinámicas, insignia LOPDP) | [VERIFIED] |
| `CSS/index.css` | 4,454 | Estilos de la PWA de empleado: credencial virtual, splash screen animado con rayo y grúa, cámara selfie, animaciones de botón | [VERIFIED] |
| `CSS/guardia.css` | 540 | Interfaz de alto contraste y botones táctiles grandes para pantallas de garita de seguridad | [VERIFIED] |
| `CSS/ubicacion.css` | 428 | Interfaz tipo centro de operaciones oscuro (dark glassmorphism) para mapa satelital Leaflet | [VERIFIED] |
| `CSS/admin_config.css` | 298 | Formularios de ajustes del sistema, switches y cuadrícula de parámetros | [VERIFIED] |
| `CSS/catering.css` | 270 | Botones de conteo rápido y listas de comensales para tablet de comedor | [VERIFIED] |
| `CSS/diagnostico.css` | 91 | Terminal de consola y cajas de estado de conexión | [VERIFIED] |

---

### 2.4 Directorio `backend/` (Servidor, Automatizaciones y Esquemas)

| Archivo | Líneas | Lenguaje / Motor | Responsabilidad Técnica | Estado |
|---|---|---|---|---|
| `backend/apps_script/api_completa.gs` | 5,089 | Google Apps Script (V8) | API REST / JSONP completa: sincronización bidireccional, enrutador `procesarAccion`, archivador histórico, gestión de hojas `REGISTROS`, `EMPLEADOS`, `VACACIONES`, `CALCULAR_vacaciones`, `DESVINCULADOS`, `ALMUERZOS_EXTRA` | [VERIFIED] |
| `backend/apps_script/mantenimiento_registros.gs` | 788 | Google Apps Script (V8) | Sanitización de registros: autocompletado de días de la semana vacíos, deduplicación física de registros, autorización automática de horas extras (>45 min) y detección de cruces entre vacaciones y asistencia | [VERIFIED] |
| `backend/apps_script/autocompletar_salidas.gs` | 501 | Google Apps Script (V8) | Cron job nocturno para cerrar turnos abiertos: inserta salidas a las 16:15 en laborables y 15:15 en fines de semana con marca `AUTO_COMPLETAR` | [VERIFIED] |
| `backend/apps_script/archivador_diario.gs` | 342 | Google Apps Script (V8) | Tarea programada (trigger diario 20:00): extrae registros con más de 60 días de antigüedad desde Firestore REST API, los respalda en Google Sheets y los elimina de Firestore en lotes | [VERIFIED] |
| `backend/apps_script/copiar_base.gs` | 283 | Google Apps Script (V8) | Sincronización y formateo de asistencias y ausencias diarias hacia la hoja `BASE` para compatibilidad con sistemas legados | [VERIFIED] |
| `backend/data/firestore_empleados.example.json` | 23 | JSON | Estructura canónica del documento de empleado en Firestore | [VERIFIED] |

---

### 2.5 Directorio `services/whatsapp/` (Microservicio de Mensajería y Puentes)

| Archivo | Líneas | Lenguaje / Runtime | Responsabilidad Técnica | Estado |
|---|---|---|---|---|
| `services/whatsapp/iniciar_tunel.py` | 249 | Python 3 | Inicia el puente CORS en el puerto local 2786, levanta el proceso `cloudflared.exe`, detecta la URL pública HTTPS `trycloudflare.com` y la registra en Firestore (`configuracion/whatsapp`). Posee autorrecuperación en caso de caída o rate-limit (error 1015/429) | [VERIFIED] |
| `services/whatsapp/whatsapp_cors_bridge.py` | 89 | Python 3 | Servidor proxy HTTP multihilo que inyecta cabeceras `Access-Control-Allow-Origin: *` hacia el servidor local de OpenWA (`192.168.10.129:2785`) | [VERIFIED] |
| `services/whatsapp/iniciar_tunel_whatsapp.bat` | 10 | Batch | Script de ejecución rápida para Windows del orquestador del túnel | [VERIFIED] |

---

### 2.6 Directorio `assets/` (Recursos Estáticos)

| Subdirectorio / Archivo | Tipo | Propósito | Estado |
|---|---|---|---|
| `assets/icons/icon-192.png` | PNG (192x192) | Ícono estándar PWA para pantallas de inicio de smartphones | [VERIFIED] |
| `assets/icons/icon-512.png` | PNG (512x512) | Ícono de alta resolución para splash screen PWA | [VERIFIED] |
| `assets/images/Logotipo T Control.png` | PNG | Logotipo oficial de alta resolución | [VERIFIED] |
| `assets/images/logo rojo_blanco.png` | PNG | Versión corporativa con isotipo en rojo | [VERIFIED] |
| `assets/images/logo-blanco.png` | PNG | Logotipo monocromático blanco para fondos oscuros | [VERIFIED] |
| `assets/images/logo gris-blanco.png` | PNG | Logotipo en escala de grises utilizado en el estado inicial de la animación del splash | [VERIFIED] |
| `assets/legacy_media/*.gif` | GIF | Animaciones de respaldo para selección de almuerzo | [VERIFIED] |

---

### 2.7 Archivos Temporales e Ignorados

| Ruta | Descripción | Estado |
|---|---|---|
| `tools/scratch/` | Directorio local que contiene 51 scripts de pruebas temporales PowerShell/JS/Python y volcados de texto generados en análisis pasados (`arch_response.txt`, `vac_response.txt`) | [VERIFIED] Excluido por `.gitignore:L41` |
| `backend/data/firestore_empleados.json` | Volcado con datos de producción reales de colaboradores | [VERIFIED] Excluido por `.gitignore:L39` |
| `.vscode/settings.json`, `.claude/launch.json` | Configuraciones locales de editores | [VERIFIED] Presentes |
