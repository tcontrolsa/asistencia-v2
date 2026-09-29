# Prompt maestro — Reconstrucción de TCONTROL Asistencia en React + PostgREST

> Cómo usarlo: copia la carpeta del sistema actual como `legacy/` dentro del nuevo repositorio,
> copia esta carpeta `docs/migracion-react-postgrest/` y dile a la IA:
> **"Lee `docs/migracion-react-postgrest/00_PROMPT_MAESTRO.md` y síguelo al pie de la letra. Empieza por la Fase 0."**

---

## 1. Tu rol y el objetivo

Eres el ingeniero responsable de reconstruir el sistema **TCONTROL Asistencia** (control de asistencia, almuerzos, invitados, vacaciones, emergencias y notificaciones WhatsApp de TCONTROL S.A., Quito, Ecuador) con **React + PostgreSQL + PostgREST**, con **paridad funcional y visual 1:1** con el sistema actual, corrigiendo únicamente los defectos de seguridad e integridad listados en este paquete.

No es un rediseño. Un usuario (empleado, guardia, cocina, supervisor, admin) debe poder hacer exactamente lo mismo que hoy, en las mismas pantallas, con los mismos textos, colores, íconos y flujos.

## 2. Jerarquía de fuentes de verdad (obligatoria)

1. **El código legado en `legacy/`** es la fuente de verdad del comportamiento. Si algo no está en el código, no existe.
2. **Este paquete** (`docs/migracion-react-postgrest/`): inventario de paridad, datos reales, reglas y decisiones.
3. **`docs/reverse-engineering/`** solo sirve como mapa de navegación. **Contiene errores verificados** (ver `01_CORRECCIONES_DOCUMENTACION.md`): no implementes nada que solo aparezca ahí. En particular, **no existe captura de selfie ni biometría facial**, el almuerzo es `SI/NO` (no "Normal/Dieta/Vegetariano") y la sede está en **Quito (-0.1289, -78.4790)**, no en Guayaquil. Ignora `MASTER_RECONSTRUCTION_SPEC.md`.

Si el código es ambiguo o dos módulos se contradicen (hay varios casos en `04_REGLAS_Y_DECISIONES.md`), **no elijas tú: pregunta**, y registra la respuesta en `04_REGLAS_Y_DECISIONES.md`.

## 3. Reglas de trabajo

- **No agregues funcionalidades** que no existan en `legacy/` (ni cámara, ni biometría, ni notificaciones nuevas) salvo las correcciones de la sección 5.
- **No elimines funcionalidades.** Cada ítem de `02_INVENTARIO_PARIDAD.md` debe quedar implementado y marcado con su prueba.
- **No cambies reglas de negocio** (horarios, cortes, umbrales, cálculos). Deben vivir en un solo lugar (tabla `configuracion` o funciones SQL) y no repetirse en el frontend.
- **Conserva textos en español**, mensajes, íconos (Font Awesome 6.4), emojis y el orden de las opciones tal como están.
- **Diseño:** porta los tokens CSS existentes (`05_DISENO.md`); no cambies a otra librería de estilos ni a otra paleta. Compara cada pantalla contra las capturas de referencia en `docs/migracion-react-postgrest/capturas/`.
- **Trabaja por fases** (sección 6). Al terminar cada fase, detente y entrega: qué se hizo, qué pruebas pasan, qué supuestos tomaste y qué preguntas quedan. No avances sin aprobación.
- Commits pequeños y descriptivos. Nunca borres `legacy/`.
- Todas las fechas y horas en zona **America/Guayaquil**. Prohibido derivar "hoy" con `toISOString()` (da UTC y después de las 19:00 devuelve el día siguiente; fue un bug real).

## 4. Stack objetivo

- **Frontend:** React 18 + TypeScript + Vite; React Router; TanStack Query para datos; formularios con validación (zod). PWA con `vite-plugin-pwa` (manifest y service worker equivalentes a los actuales). Mapas con Leaflet (`react-leaflet` + markercluster). Exportes con SheetJS (xlsx) y html2pdf/impresión, como hoy.
- **Backend:** PostgreSQL 16 + PostgREST 12. Esquema `api` expuesto (vistas y funciones RPC), esquema `private` no expuesto (credenciales, secretos). Extensiones: `pgcrypto` (bcrypt), `pg_cron` (tareas programadas). Toda la lógica de negocio que hoy corre en el navegador (`legacy/JS/firebase_backend.js`) pasa a **funciones SQL (RPC)** con validación en servidor.
- **Workers:** un proceso pequeño del lado servidor (Node o similar) para lo que PostgreSQL no hace: envío de WhatsApp vía OpenWA y exportaciones a Google Sheets si se mantienen. Las llaves van en variables de entorno, nunca en el frontend.
- **Archivos (fotos de perfil):** hoy son URLs de Google Drive o base64 dentro del campo `foto_url`. Define almacenamiento de archivos (ver decisiones).

## 5. Lo que NO debes replicar (correcciones obligatorias)

1. **Autenticación en servidor.** Login por RPC `api.login(empleado_id, password)` que verifica con `crypt()` (bcrypt) y devuelve un JWT con `role` y `empleado_id`. Límite de intentos (p. ej. 5 fallos → 15 min). Nada de roles en `localStorage` ni de `id === "1058"` como admin: los roles salen de la base.
2. **RLS en todas las tablas.** El empleado solo lee y crea lo suyo; guardia, catering, supervisor, supervisor admin y admin según `02_INVENTARIO_PARIDAD.md`.
3. **La hora oficial de una marcación es la del servidor** (`now()`), no la del teléfono. Guarda la hora del dispositivo solo como dato de auditoría.
4. **Geocerca validada en servidor** (Haversine con las mismas coordenadas y radios), además de la validación visual en el cliente.
5. **Sin secretos en el frontend:** ni la API key de Apps Script, ni la clave compartida del guardia, ni la API key de OpenWA.
6. **Contraseñas:** las actuales (SHA-256 sin sal, 9 en texto plano, hashes filtrados públicamente) no se migran como válidas. Todos crean contraseña nueva en el primer ingreso (ver decisión D-06).
7. **Tareas automáticas en servidor** (pg_cron / worker), no en el navegador de un supervisor. Hoy el aviso automático de WhatsApp "no registró entrada" solo se ejecuta si un supervisor tiene el panel abierto.
8. **Persistir lo que hoy se pierde:** los motivos de atraso y salida temprana, el tipo de salida, el motivo de permiso y el menú elegido se capturan en la app pero `guardarRegistro` no los guarda (ver decisión D-09).
9. No reproduzcas los bugs listados en `04_REGLAS_Y_DECISIONES.md` §3.

## 6. Fases y entregables

| Fase | Entregable | Puerta de aprobación |
|---|---|---|
| **0. Verificación** | Recorre `legacy/` y completa/corrige `02_INVENTARIO_PARIDAD.md` y `03_DATOS_REALES.md`. Lista toda duda en `04_REGLAS_Y_DECISIONES.md`. **Sin escribir código de la app.** | El usuario responde las decisiones pendientes. |
| **1. Datos** | Esquema SQL, roles, políticas RLS, funciones RPC de lectura, script de migración (ETL) desde Firestore + Google Sheets, y pruebas SQL (pgTAP o equivalentes) de reglas y permisos. | Conteos de migración cuadran con el origen (empleados, registros por mes, vacaciones, desvinculados, invitados). |
| **2. Autenticación** | Login, vinculación de dispositivo, cambio y reseteo de contraseña, roles en JWT. | Pruebas de acceso por rol pasan. |
| **3. App del empleado** | Todas las pantallas del módulo Empleado (§1 del inventario) como PWA. | Capturas lado a lado + checklist. |
| **4. Guardia y catering** | Módulos Guardia y Catering. | Idem. |
| **5. Supervisor** | Panel de supervisor, subpanel por subpanel (§4 del inventario), incluido Admin. | Idem, más reportes con los mismos números que el sistema actual para un mismo período. |
| **6. Automatizaciones e integraciones** | Autocompletar salidas, reset de autorizaciones, avisos WhatsApp, exportes, archivo (si aplica). | Ejecución programada verificada. |
| **7. Operación en paralelo** | Ambos sistemas corriendo ≥ 2 semanas; reporte diario de diferencias (marcaciones, atrasos, horas extra, almuerzos, vacaciones). | Diferencias explicadas o corregidas. |
| **8. Corte** | Plan de corte, comunicación al personal, respaldo final y plan de reversa. | Aprobación del usuario. |

## 7. Criterios de aceptación globales

- 100 % de los ítems de `02_INVENTARIO_PARIDAD.md` implementados con prueba asociada.
- Todas las reglas de `04_REGLAS_Y_DECISIONES.md` cubiertas por pruebas automáticas con los casos límite (07:30, 07:35, 07:45, 09:30, 09:40, 08:40, 16:15, salida +45 min, fin de semana, feriado, pasante, modo campo).
- Reportes del mismo período iguales entre el sistema actual y el nuevo (tolerancia cero en conteos).
- Cada pantalla coincide con su captura de referencia en estructura, textos, colores y estados (vacío, cargando, error).
- Ningún secreto en el bundle del frontend (verificar con búsqueda en `dist/`).
- Un usuario sin sesión no puede leer ni escribir nada por PostgREST (probar con `curl`).
