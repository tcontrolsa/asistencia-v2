# 09 — Arquitectura Frontend y Componentes

**Sistema:** TCONTROL — Sistema de Gestión y Control Biométrico de Asistencia (2026)  
**Fecha de Análisis:** 2026-09-29  
**Estado:** [VERIFIED]  

---

## 1. Visión General del Frontend

El frontend de TCONTROL está estructurado como una **Single Page Application (SPA) modular y progresiva (PWA)** en el lado del colaborador, acompañada de dashboards administrativos especializados para roles operativos.

- **Filosofía de Render:** Vanilla DOM Manipulation directo sin intermediarios virtuales (Virtual DOM). Los cambios de vista se ejecutan mediante manipulaciones de clases (`.hidden`, `.active`) y renderizado directo de templates literals (`innerHTML`).
- **Sistema de Diseño (Design System):**
  - **Paleta de Colores Corporativa:**
    - Primario (Rojo TCONTROL): `#dc2626` / `#ef4444` / `#b91c1c`
    - Fondo Oscuro Principal: `#0f172a` (Slate 900)
    - Fondos de Tarjeta Glass: `rgba(255, 255, 255, 0.95)` con `backdrop-filter: blur(8px)`
    - Bordes y Separadores: `#e2e8f0` (Slate 200) / `#cbd5e1`
    - Éxito (Puntual / Presente): `#16a34a` / `#22c55e`
    - Advertencia (Atraso / Espera): `#f59e0b` / `#d97706`
    - Información (Almuerzos / Modo): `#0284c7` / `#38bdf8`
  - **Tipografía:**
    - Display / Títulos: *Outfit* (Google Fonts: 600, 700, 800)
    - UI y Tablas: *Plus Jakarta Sans* y *Inter* (400, 500, 600, 700)
    - Datos Numéricos y Horarios: *Fira Code* / *JetBrains Mono* (monospace tabular)
  - **Efectos y Microinteracciones:**
    - Animación de impacto eléctrico en Splash Screen (rayo SVG con filtro Gaussian Blur `filter="url(#lightningGlow)"` sobre la letra "N" del logotipo).
    - Mecanismo "Pull-to-Refresh" móvil (`JS/tcontrol_core.js:L328-407`) con ícono giratorio `#ptr-indicator` y retroalimentación háptica.
    - Badges animados de pulso para llamadas a la acción (`.whatsapp-pulse`, `.emergencia-pulse`).

---

## 2. Mapa de Rutas, Pantallas y Cadena de Dependencias

```text
Ruta / URL                        Página HTML            Script Core                  Servicio / Backend
──────────────────────────────────────────────────────────────────────────────────────────────────────────
asistencia.tcontrolsa.com/        index.html             JS/index_core.js             FirebaseBackend -> Firestore
asistencia.tcontrolsa.com/#almuerzo                      JS/tcontrol_core.js          OpenWAService -> WhatsApp
asistencia.tcontrolsa.com/#history                       sw.js (Cache Storage)        Google Apps Script (Saldos)
──────────────────────────────────────────────────────────────────────────────────────────────────────────
.../supervisor.html               supervisor.html        JS/supervisor_core.js        FirebaseBackend (onSnapshot)
                                                         JS/supervisor/*.js           SheetJS / jsPDF
──────────────────────────────────────────────────────────────────────────────────────────────────────────
.../guardia.html                  guardia.html           JS/guardia_core.js           FirebaseBackend (Terminal)
──────────────────────────────────────────────────────────────────────────────────────────────────────────
.../catering.html                 catering.html          JS/catering_core.js          FirebaseBackend (Comedor)
──────────────────────────────────────────────────────────────────────────────────────────────────────────
.../admin_config.html             admin_config.html      JS/admin_config_core.js      FirebaseBackend / Sheets
──────────────────────────────────────────────────────────────────────────────────────────────────────────
.../ubicacion.html                ubicacion.html         JS/ubicacion_core.js         Leaflet / Firestore
──────────────────────────────────────────────────────────────────────────────────────────────────────────
.../diagnostico.html              diagnostico.html       JS/diagnostico_core.js       TCLogger / GAS Ping
──────────────────────────────────────────────────────────────────────────────────────────────────────────
.../visor_empleado.html           visor_empleado.html    Script embebido              Firebase SDK directo
──────────────────────────────────────────────────────────────────────────────────────────────────────────
.../offline.html                  offline.html           Autónomo (Sin JS externo)    Service Worker Fallback
```

---

## 3. Desglose de Vistas y Componentes por Módulo

### 3.1 Módulo Colaborador (`index.html` + `CSS/index.css` + `JS/index_core.js`)

1. **Splash Screen Industrial (`#initialSplash`):**
   - Animación de grúa con trolley y gancho que desciende el logotipo.
   - Transformación del isotipo de escala de grises a rojo y blanco de alta saturación.
   - Descarga eléctrica animada sobre el centro del logotipo con onda expansiva (`.shockwave-ring`).
2. **Credencial Virtual (`#viewHome`):**
   - Fotografía del colaborador con borde dinámico (Verde: Entrada registrada; Rojo: Salida o fuera de turno).
   - Chip de estado laboral: `Presente en Planta`, `En Terreno / Campo`, `En Almuerzo`, `Jornada Finalizada`.
   - Botón de acción principal de timbrado con GPS y selector de modo.
   - Modal de cámara web para captura selfie con recuadro guía ovalado.
3. **Selector de Menú de Almuerzo (`#viewAlmuerzo`):**
   - Tarjetas interactivas con fotografías para menú `Normal`, `Dieta`, `Vegetariano`, o `No almuerzo`.
   - Reloj de cuenta regresiva con hora límite 09:30 AM.
4. **Resumen de Asistencia y Vacaciones (`#viewHistory`):**
   - Donut charts y barras de progreso de puntualidad.
   - Tarjetas KPI de vacaciones: Días devengados, días disfrutados y saldo disponible para goce.
   - Lista detallada de timbrados diarios agrupados por semana.
5. **Trivia de Cultura (`#viewCultura`):**
   - Tarjetas de preguntas institucionales con temporizador de respuesta.
6. **Módulo de Emergencia (`#fabEmergencia` / `#viewEstado`):**
   - Botón flotante accesible globalmente para reporte de sismo, evacuación o alerta.

---

### 3.2 Módulo de Supervisión (`supervisor.html` + `CSS/supervisor.css` + `JS/supervisor_core.js`)

1. **Barra Lateral de Navegación (Sidebar Colapsable):**
   - Opciones: Monitor en Vivo, Justificaciones, Horas Extras, Vacaciones, Directorio, Almuerzos/Invitados, Cultura, Radar GPS, Reportes y Notificaciones WhatsApp.
   - Estado colapsado persistido en `localStorage.sidebarCollapsed`.
2. **Monitor en Tiempo Real (Live Monitor):**
   - Tarjetas superiores de conteo rápido:
     - `Presentes`: Total timbrados con entrada activa.
     - `En Campo`: Total timbrados en modalidad de proyecto externo.
     - `Atrasados`: Total timbrados después de 07:45.
     - `Ausentes`: Colaboradores sin entrada pasadas las 08:15.
     - `En Almuerzo`: Colaboradores en intervalo de comida.
   - Tabla reactiva con avatares, hora de entrada, hora de salida, tiempo laborado acumulado y botón de acciones rápidas.
3. **Modal de Justificación Laboral:**
   - Formulario para asociar certificados del IESS, calamidades domésticas o comisiones de servicio con campos de tiempo en minutos.
4. **Diseñador de Reportes (`supervisor_reportes_custom.js`):**
   - Sistema de chips interactivos drag-and-drop / clic para seleccionar columnas activas a exportar.
   - Selector de fechas con atajos rápidos: `Hoy`, `Ayer`, `Esta Semana`, `Mes Actual`, `Mes Anterior`, `Personalizado`.
   - Botones de exportación instantánea a Excel `.xlsx` formateado o PDF.
5. **Consola de WhatsApp (`supervisor_whatsapp.js`):**
   - Bandeja de destinatarios filtrada por condición (ej. marcar a todos los ausentes de hoy).
   - Editor de plantillas institucionales con previsualización en vivo estilo burbuja de chat de WhatsApp.
   - Cargador de imágenes con compresión a Base64 para volantes informativos.

---

### 3.3 Módulo Terminal de Guardia (`guardia.html` + `CSS/guardia.css`)
- **Diseño Ergonómico:** Tipografías grandes (24px+), inputs numéricos amplios y botones táctiles de más de 60px de altura para uso ágil con guantes o pantallas resistivas.
- **Teclado Virtual / Input Numérico:** Campo de búsqueda rápida que filtra instantáneamente al teclear los primeros dígitos de la cédula o ID.
- **Doble Panel:** Pestaña `Registrar` (búsqueda y confirmación de timbrado) y Pestaña `Presentes` (listado alfabético de quiénes permanecen en planta).

---

### 3.4 Módulo Terminal de Catering (`catering.html` + `CSS/catering.css`)
- **Dashboard de Despacho:**
  - 3 contadores grandes en la parte superior: `TOTAL SOLICITADO`, `PENDIENTES POR ENTREGAR`, `CONSUMIDOS`.
  - Filtro por tabs: `Todos`, `Pendientes`, `Consumidos`.
  - Tarjetas de empleado con badge de tipo de menú (Etiqueta Azul: Normal; Verde: Dieta; Naranja: Vegetariano; Violeta: Invitado).
  - Botón verde `Entregar` que cambia a gris `Entregado HH:mm` una vez presionado.

---

### 3.5 Módulo de Configuración Administrativa (`admin_config.html` + `CSS/admin_config.css`)
- Cuadrícula de 6 tarjetas de control:
  1. *Ubicación de la Empresa:* Inputs de latitud, longitud, radio en metros y botón `Usar mi ubicación actual`.
  2. *Horarios Laborales:* Inputs de tipo `time` para jornada ordinaria, tolerancia y almuerzo.
  3. *Parámetros de Registro:* Switches para forzar foto selfie obligatoria o permitir registro manual.
  4. *Usuarios Supervisores:* Lista dinámica de supervisores activos con botón para añadir por ID.
  5. *Soporte y Mantenimiento:* Teléfono institucional de WhatsApp y switch de `Modo Mantenimiento`.
  6. *Conexión y Migración:* Botones de migración completa Sheets -> Firestore y reseteo masivo de contraseñas.

---

### 3.6 Módulo de Rastreo Satelital (`ubicacion.html` + `CSS/ubicacion.css`)
- **Tema:** Dark Cyberpunk / Centro de Operaciones con panel de vidrio flotante (`backdrop-filter: blur(12px)`).
- **Controles Flotantes:**
  - `Ir a Centro de Control` (centra en casa matriz).
  - `Ver a Todo el Personal` (`map.fitBounds` de todos los marcadores).
  - `Mostrar/Ocultar Geocerca` (dibuja círculo semitransparente rojo de 250m).
- **Contador Regresivo:** Indicador superior de recarga automática cada 60 segundos (`Próxima recarga en 59s...`).

---

## 4. Gestión de Estado en Cliente

El estado del cliente no depende de librerías como Redux o Vuex, sino de un patrón **Reactive Store & Cache Layer**:

| Clave de Almacenamiento | Ubicación | Contenido | Ámbito / Propósito |
|---|---|---|---|
| `TCONTROL_DEVICE_TOKEN` | `localStorage` | `DEV_A8K2J9X...` | Identidad de hardware del dispositivo móvil enrolado |
| `tcontrol_user_profile` | `localStorage` | Objeto JSON con ID, nombre, área, foto | Datos estáticos del empleado para carga offline |
| `tcontrol_use_firebase` | `localStorage` | `'true'` o `'false'` | Feature flag de persistencia (Firestore vs GAS) |
| `tcontrol_vacaciones_cache_v3`| `localStorage` | Objeto JSON con saldo y días tomados | Caché de 6 horas para no sobrecargar Google Sheets |
| `tcontrol_almuerzos_extra_cache_v2` | `localStorage` | Lista de almuerzos de invitados | Caché local con fecha de sincronización |
| `tcontrol_config_whatsapp` | `localStorage` | Objeto de configuración de WhatsApp | URL del servidor y API key local |
| `SUPERVISOR_SESSION` | `sessionStorage` | Objeto JSON con sesión del supervisor | Sesión activa temporal en pestaña del supervisor |
| `GUARDIA_SESSION` | `sessionStorage` | Token de guardia | Autenticación en caseta de seguridad |
| `CATERING_SESSION` | `sessionStorage` | Token de catering | Autenticación en caseta de comedor |
| `sidebarCollapsed` | `localStorage` | `'true'` o `'false'` | Preferencia visual del panel lateral |
| `TCLogger` Buffer | Memoria RAM (`window.TCLogger`) | 200 entradas JSON | Buffer circular de depuración y soporte técnico |
