# 06 — Diagnóstico del proyecto `asistencia-v2` actual (Fase 0)

Revisión hecha el 2026-09-29 sobre la rama `main` (commit `2e50ab6` más cambios sin confirmar) contra los documentos 00–05 de este paquete. El código legado está en `C:\Users\tcontrol\Documents\GitHub\Asistencia` (commit `ac53c18`); **todavía no está copiado como `legacy/`** dentro de este repositorio, como pide `00_PROMPT_MAESTRO.md`.

## 1. Backend: no es PostgREST

| Qué dice el paquete | Qué hay hoy |
|---|---|
| PostgreSQL 16 + **PostgREST 12**, esquema `api` con vistas y RPC, JWT con `role`, RLS | Servidor **Node/Express** (`X-Powered-By: Express`) en `http://192.168.10.129:3000`, un único endpoint `POST /api/action` con `{accion, ...}` que imita las funciones de `firebase_backend.js` sobre PostgreSQL |
| Login por `api.login()` con bcrypt y JWT | `verificarPIN` devuelve `{ok/valido}`; no hay token; la sesión se guarda en `localStorage`/`sessionStorage` |
| RLS por rol | No hay sesión en las peticiones: cualquiera que llegue a la API puede invocar cualquier acción |

Ningún puerto del servidor (3001–9000) respondió como PostgREST y en el repositorio no hay SQL, `docker-compose` ni código del servidor Express. **Ver D-20.**

## 2. Hallazgo de seguridad urgente (fuera de este repositorio)

`POST /api/action {accion: "obtenerEmpleados"}` **sin autenticación** devuelve los 105 empleados con el campo `pin` incluido (además de cédula, teléfono, fecha de nacimiento). El frontend además descarga esa lista completa para el login. Es el defecto §5.1/§5.5 del prompt maestro, agravado. Acción inmediata recomendada, independiente de la migración: quitar `pin` de todas las respuestas del Express y dejar de exponer la API por el túnel público (`iniciar_tunel.bat` → `trycloudflare.com`) hasta tener autenticación.

## 3. Diferencias del frontend con el paquete

El frontend v2 se construyó a partir de `docs/reverse-engineering/` (lo cita `src/services/rules.js`), que según `01_CORRECCIONES_DOCUMENTACION.md` tiene errores. Reproduce varios:

| # | Problema | Dónde | Referencia |
|---|---|---|---|
| F-01 | Captura de **selfie / "verificación biométrica"** con `getUserMedia` | `components/CameraCapture.jsx`, `KioskoPage.jsx`, `MiAsistenciaPage.jsx` | C-01 (no existe en legado; riesgo LOPDP) |
| F-02 | Menú **Normal / Dieta / Vegetariano** y KPIs de cocina por menú | `rules.js`, `CateringPage.jsx`, `SupervisorPage.jsx` | C-02, C-11 (almuerzo es `SI`/`NO`) |
| F-03 | Tipos inventados: `Salida Almuerzo`, `ALMUERZO_RESERVA`, `ALMUERZO_SALIDA`, `EMERGENCIA_REPORTE`; dispositivo `GARITA_SEGURIDAD` | `KioskoPage.jsx`, `api.js` | C-08; `03_DATOS_REALES.md` §2 (reales: `ESTADO`, `SOLO_ALMUERZO`, dispositivo `GUARDIA`) |
| F-04 | Módulo **Kiosco con PinPad** | `KioskoPage.jsx`, `PinPad.jsx` | No existe en el legado (§3 "no agregues funcionalidades") |
| F-05 | "Hoy" con `toISOString()` (UTC) en ~15 lugares | `api.js`, todas las páginas | Prohibido (§3); bug real después de las 19:00 |
| F-06 | Hora y fecha de la marcación tomadas del navegador | `api.js` → `normalizarRegistro` | §5.3, D-15 |
| F-07 | Login de supervisor **fijo con el ID `1058`**; textos "Supervisor 1058" | `SupervisorPage.jsx` (l. 121, 520, 540, 572, 1037) | §5.1 |
| F-08 | Contraseña en SHA-256 sin sal calculada en el cliente | `services/crypto.js` | §5.6, D-06 |
| F-09 | Sesión del colaborador, geocercas e invitados en `localStorage` | `MiAsistenciaPage.jsx`, `SupervisorPage.jsx` (l. 622, 635, 663) | §5.1; invitados deben ir a `solicitudes_invitados` |
| F-10 | Regla de atraso: cuenta minutos **desde 07:45**; el legado cuenta desde 07:30 con 5 min de tolerancia | `rules.js` → `evaluarEntrada` | R-04, R-05, D-01 |
| F-11 | Modo campo **sin geocerca**; el legado usa la base del empleado con radio 300 m | `rules.js` → `validarGeocerca` | R-02, D-07 |
| F-12 | Salida de fin de semana 15:15 aplicada a horas extra | `rules.js` → `evaluarSalida` | D-02 (hay tres valores distintos) |
| F-13 | Reglas de negocio en el frontend (`rules.js`) | — | §3: deben vivir en SQL/`configuracion` |
| F-14 | Diseño propio: tema oscuro, íconos `lucide-react`, sin Bootstrap ni Font Awesome, sin splash de grúa ni barra inferior | Todo `src/` | `05_DISENO.md` (paridad visual 1:1) |
| F-15 | JavaScript sin TypeScript, sin React Router, TanStack Query, zod ni PWA | `package.json` | §4 stack objetivo |
| F-16 | La URL de la API se puede cambiar desde la interfaz (`tcontrol_api_url`) | `Navbar.jsx`, `api.js` | Riesgo: redirigir credenciales a otro servidor |

Lo que sí se aprovecha: la separación en cuatro entradas (`index`, `supervisor`, `guardia`, `catering`), la fórmula Haversine y las coordenadas de Quito en `rules.js`, y la exportación con SheetJS.

## 4. Diferencia de datos detectada

La configuración que devuelve hoy la base (`obtenerConfiguraciones`) tiene `ubicacion = {lat: -0.129202, lng: -78.477511, radio: 250}`, a **unos 165 m** del centro documentado en R-01 (`-0.1288771…, -78.4789677…`). Con un radio de 250 m cambia quién queda dentro. También reporta `modo_mantenimiento: true`. **Ver D-21.**

## 5. Conclusión

El frontend actual no es una base válida para la paridad 1:1: difiere en arquitectura, reglas, flujos, tipos de datos y diseño. Recomendación: conservarlo como prototipo y seguir el prompt maestro desde la Fase 1 (esquema SQL + PostgREST) con un frontend nuevo en TypeScript que porte el marcado y CSS de `legacy/`. Pendiente la respuesta a D-20 a D-23.
