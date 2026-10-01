# TCONTROL Asistencia — App del empleado y terminales (Fases 3 y 4)

React 18 + TypeScript + Vite, React Router, TanStack Query, zod y PWA (`vite-plugin-pwa`).
Porta 1:1 la app del empleado del legado (`index.html` + `JS/index_core.js`): mismo marcado, CSS
(`src/styles/legacy-index.css` = `CSS/index.css`), textos, emojis e íconos (Font Awesome 6.4, Bootstrap 5.3.0).

Toda regla de negocio vive en la base (`db/migrations/008_app_empleado.sql`); la app solo muestra y llama a RPC de PostgREST.

## Desarrollo

```bash
node db/scripts/pgrst-dev.js     # emulador mínimo de PostgREST (solo desarrollo, puerto 3001)
npm --prefix app run dev          # http://localhost:5180 (proxy /rest → PGRST_PROXY_TARGET)
node db/scripts/sembrar-dev.js    # cuentas de prueba (ver db/seeds/dev_prueba_*.sql)
```

`app/.env.development.local` (no versionado) define `PGRST_PROXY_TARGET=http://localhost:3001`.
Con PostgREST real: `PGRST_PROXY_TARGET=http://192.168.10.129:3001`.
En producción la URL de la API se define con `VITE_POSTGREST_URL` (no es secreto); por defecto `./rest`.

## Producción

```bash
npm --prefix app run build            # genera app/dist (PWA con service worker)
npm --prefix app run check:secrets    # §7: verifica que ningún secreto del .env esté en dist/
```

## Pantallas

Credencial (marcación con motivo de atraso, almuerzo, salida anticipada con motivos, permiso con regreso,
campo, reporte "fuera de área", popup de almuerzo, cumpleaños, insignias), justificación masiva de faltas,
Resumen (estadísticas, logros, historial por semana), Almuerzo (Cultura Tcontrol, menú, invitados),
Pagos, Extras (coordinadores), Estado de emergencia, Perfil (datos, foto, contraseña, seguridad) y Panel Master.

## Terminales (Fase 4)

Una página por actor, como el legado (`rollupOptions.input` en `vite.config.ts`):

| Página | Legado | Notas |
|---|---|---|
| `guardia.html` | `guardia.html` + `JS/guardia_core.js` + `CSS/guardia.css` | Usuario y contraseña de cada guardia (D-14) en lugar de la clave compartida; pide cambiar la contraseña temporal; registrar / presentes / GPS |
| `catering.html` | `catering.html` + `JS/catering_core.js` + `CSS/catering.css` | ID y **contraseña** del supervisor (antes PIN); no desvincula su teléfono; filtros, búsqueda, recarga cada 45 s |
| `kiosco.html` | — (nuevo, D-23) | Marcado y CSS de la terminal de guardia; cada colaborador usa su ID y contraseña (P-02); no guarda sesión y vuelve al inicio tras 60 s sin actividad |

Cada módulo guarda su sesión con su propia clave (`usarClaveSesion`), así que la app del empleado, la guardia y el
catering pueden convivir en el mismo navegador. La hora de la advertencia de salida anticipada es la del servidor (`api.ahora`).

## Panel de supervisor (Fase 5)

`supervisor.html` (sesión propia `TCONTROL_SESION_SUPERVISOR`). Estructura en `src/supervisor/`:

| Carpeta / archivo | Contenido |
|---|---|
| `legado/*.ts` | Motor de cálculo portado 1:1 de `JS/supervisor_core.js` y `supervisor_reportes_custom.js` (D-24): utilidades, control diario, detalle, dashboard, reportes, desgloses |
| `store.ts`, `nav.ts`, `reportesEstado.ts` | Estado del panel (`empCache`, períodos…), navegación y modales, filtros compartidos de Dashboard y Reportes |
| `ui/*.tsx` | Paneles y modales con el marcado y CSS del legado (`styles/legacy-supervisor*.css`) |
| `excel.ts` | SheetJS y html2pdf.js cargados bajo demanda (fuera del precache del PWA) |

Hechos: Control diario, Detalle de empleado, Gestión de jornada, Registro manual, Eventos futuros, Trabajo en campo,
Almuerzo extra, Directorio, Mapa, Dashboard (KPIs, detalle por colaborador, rankings, resumen mensual, desgloses
histórico y de vacaciones) y Reporte interactivo (períodos, quincenas, filtros, vistas y columnas, Excel, impresión,
reporte individual) y Gestión & Servicios (emergencias, menú semanal, Cultura Tcontrol, invitados & catering) y Notificaciones WhatsApp (servidor, recordatorio automático, plantillas con simulador, auditoría, envío masivo e individual en cola) y Opciones adicionales del Admin (carga de personal, roles, desvinculaciones, bajas, actualización forzada). Paridad de números: `node app/scripts/paridad-supervisor.mjs [--periodos N] [--detalle]`.
