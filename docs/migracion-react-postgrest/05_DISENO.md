# 05 — Diseño visual a conservar

El objetivo es que el usuario no note el cambio de tecnología. Cada módulo tiene hoy su propia identidad visual: **no la unifiques ni la "modernices"** sin aprobación.

## 1. Estrategia técnica
1. **Portar primero, refactorizar después:** importa los CSS actuales (`legacy/CSS/*.css`) como hojas globales por módulo, conservando nombres de clases, y construye los componentes React con ese mismo marcado. Solo después, y con pruebas visuales en verde, se pueden convertir a CSS Modules.
2. **No introducir otra librería de estilos** (Tailwind, MUI, etc.). La app del empleado usa Bootstrap 5.3.0; el resto, CSS propio.
3. **Pruebas visuales:** Playwright con capturas en 375×812 (móvil) y 1440×900 (escritorio), comparando contra las capturas de referencia de `capturas/`.
4. Conserva **textos, emojis, íconos y orden** de opciones exactamente como están en `legacy/`.

## 2. Identidad por módulo (tokens reales)

| Módulo | Hoja | Tipografía | Íconos | Tokens principales |
|---|---|---|---|---|
| App del empleado (`index.html`) | `CSS/index.css` + Bootstrap 5.3.0 | Pila del sistema (`-apple-system, Segoe UI, Roboto…`) | Font Awesome 6.0.0-beta3 + Bootstrap Icons 1.11 | `--primary #e11d48`, `--primary-dark #be123c`, `--primary-light #ffe4e6`, `--success #16a34a`, `--warning #d97706`, `--danger #ef4444`, grises `--gray-50 #f8fafc` … `--gray-900 #0f172a`, radios 10/16/24 px, sombras `0 2px 8px / 0 4px 20px / 0 8px 32px`, transición `0.25s cubic-bezier(0.4,0,0.2,1)` |
| Supervisor (`supervisor.html`) | `CSS/supervisor.css` (~6 400 líneas) + estilos en línea | Plus Jakarta Sans 400–800; Fira Code (monoespaciada) | Font Awesome 6.4.0 | `--red #dc2626`, `--red-dk #b91c1c`, `--green #16a34a`, `--amber #d97706`, `--blue #2563eb`, `--indigo #6366f1`, `--teal #0d9488`, `--purple #8b5cf6`, `--pink #ec489a` (cada uno con variante `-lt`), grises `--g50…--g900`, radios `--r 10px` / `--rsm 6px`, tipografía fluida con `clamp()` (`--fxs` a `--f3xl`), `--sidebar-width clamp(180px, 25vw, 260px)` |
| Guardia | `CSS/guardia.css` | Pila del sistema | Font Awesome | `--primary #dc2626`, `--success #22c55e`, `--warning #eab308`, `--info #3b82f6` |
| Catering | `CSS/catering.css` | Pila del sistema | Font Awesome | Revisar en Fase 0 |
| Configuración | `CSS/admin_config.css` | Outfit | Font Awesome | Revisar en Fase 0 |
| Ubicación | `CSS/ubicacion.css` | Inter, Outfit, JetBrains Mono | Font Awesome + Leaflet 1.9.4 + markercluster 1.4.1 | Revisar en Fase 0 |
| Visor de empleado | estilos en línea | Outfit, Plus Jakarta Sans, Fira Code | Font Awesome | Revisar en Fase 0 |

PWA (`manifest.json`): nombre "TCONTROL Asistencia", `short_name` "TCONTROL", `theme_color #dc2626`, `background_color #0f172a`, `display: standalone`, orientación vertical, atajo "Registrar Entrada", íconos 192 y 512.

## 3. Elementos distintivos que no pueden perderse
- **Splash de la app del empleado:** grúa con cable que baja el logo gris metálico y un rayo que lo transforma en el logo rojo/blanco (`index.html` `#initialSplash`, `CSS/index.css`).
- **Barra de navegación inferior** del empleado: Credencial, Almuerzo, Resumen, Extras (solo coordinadores), Pagos, Estado (oculta), Perfil, Master (solo admin).
- **Pantalla de confirmación** a pantalla completa después de marcar, con ícono según tipo (entrada, salida, campo, permiso) y lista de detalles (`mostrarSplashTransicion`).
- Tarjetas "glass", cuadrículas de opciones con emoji (`.razon-item`), chips de estado, *badges* de rol (corona para Admin Master), avatar con respaldo de inicial, toasts y overlay de carga con texto y subtexto.
- **Panel supervisor:** barra lateral con íconos y panel colapsable en móvil, subpestañas tipo "pill" pegajosas, tarjetas KPI clicables que filtran tablas, tablas con doble barra de desplazamiento sincronizada, modales grandes con encabezado en degradado.
- Animaciones de cumpleaños, insignias de puntualidad, indicador de pull-to-refresh.
- Modal de aviso legal LOPDP (texto íntegro en `JS/tcontrol_core.js` → `TCONTROL_LEGAL` y `abrirModalAvisoPrivacidad`).
- Imágenes: `assets/images/Logotipo T Control.png`, `logo gris-blanco.png`, `logo rojo_blanco.png`, `logo-blanco.png`, `assets/icons/icon-192.png`, `icon-512.png`.

## 4. Capturas de referencia (las toma el usuario antes de empezar)
Guardar en `docs/migracion-react-postgrest/capturas/` con nombre `modulo_pantalla_estado_ancho.png`. Tomar cada una en **móvil (375 px)** y, si aplica, en **escritorio (1440 px)**. Usar un empleado de prueba para no exponer datos reales.

**App del empleado:** splash · vincular dispositivo · login · crear contraseña · actualizar datos · inicio (sin marcar / con entrada / jornada completa / estado reportado) · selector de almuerzo · motivo de atraso · tipo de salida · confirmación de salida anticipada · pantalla de confirmación · fuera de área (aviso y modal) · justificación masiva · resumen/historial · almuerzo (con quiz) · solicitud de invitado · pagos · extras · perfil · estado de emergencia · Panel Master · aviso legal · cumpleaños.

**Guardia:** login · búsqueda · registro con almuerzo · presentes.
**Catering:** login · lista · consumido.
**Supervisor:** login · Asistencia (control diario con cada filtro, directorio tarjetas y tabla, mapa en sus 3 vistas) · detalle de colaborador · modal gestión de jornada · desgloses (inasistencias, histórico, vacaciones) · Dashboard · Reportes (cada vista y el creador de columnas) · Gestión & Servicios (emergencias, menú, cultura, invitados) · WhatsApp (servidor, plantillas, automático, logs, envío masivo) · Opciones (personal, roles, desvinculación, eliminación, sistema).
**Otros:** configuración · ubicación · visor de empleado · página sin conexión.
