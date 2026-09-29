# 01 — Correcciones verificadas a `docs/reverse-engineering/`

Verificado contra el código en el commit `ac53c18` (2026-09-29). Los documentos de ingeniería inversa marcan como `[VERIFIED]` afirmaciones que **no existen en el código**. Una IA que los tome como especificación construiría funciones inexistentes (por ejemplo, captura biométrica facial, con implicaciones legales bajo la LOPDP) y un modelo de datos incompatible con los datos reales.

**Regla:** ante cualquier diferencia, manda el código de `legacy/` y este paquete. No uses `MASTER_RECONSTRUCTION_SPEC.md`.

| # | Afirmación incorrecta | Dónde aparece | Realidad en el código (evidencia) |
|---|---|---|---|
| C-01 | La marcación captura una **selfie / biometría facial** (cámara, `<video>`, `canvas` 640×480, "foto" en `registros`) | 01, 03, 04, 07, 09, 10, 17, 23, 24, MASTER | **No existe.** No hay `getUserMedia` en todo el proyecto. El único `canvas` reduce a 160 px la **foto de perfil** que sube el empleado (`JS/index_core.js` → `triggerProfilePhotoUpload`) y la guarda como base64 en `empleados.foto_url`. |
| C-02 | El almuerzo es una opción de menú **Normal / Dieta / Vegetariano** | 03, 04, 05, 06, 07, 09, 10, 19 | `almuerzo` es **`SI` / `NO`** (planta o fuera). Las elecciones de menú (sopa, almidón, proteína 1 y 2, ensalada, otro, jugo) se envían desde la app pero **no se guardan** (`firebase_backend.js` → `guardarRegistro`). El menú semanal es `configuracion/menu_semanal` con `{sopa, plato, jugo}` por día. |
| C-03 | Sede en **Guayaquil** (-2.148…, -79.919…) | 04, 17, 23, MASTER | Sede en **Quito**: `LAT -0.1288771313385675`, `LNG -78.47896772889067`, radio **250 m** (`JS/tcontrol_core.js`, `configuracion/sistema`). |
| C-04 | Un documento por día `YYYY-MM-DD_EMP-XXXX` con subobjetos `entrada`/`salida` | 23, 24, MASTER | **Un documento por marcación**, ID `{empleadoId}_{tipo}_{fecha}_{hhmmss}`, campos planos. IDs de empleado sin prefijo (`"10"`, `"1058"`). Ver `03_DATOS_REALES.md`. |
| C-05 | Hoja histórica con columnas `ID_Registro, Hora_Entrada, Minutos_Atraso, Foto_Entrada_URL…` | MASTER | Columnas reales A–Y: `FECHA, ID, NOMBRE, TIPO, ALMUERZO, HORA, LAT, LNG, DISPOSITIVO, TIMESTAMP, DIA, MODO, HORAS_EXTRA, AUTORIZA, RAZON_SALIDA_TEMPRANA, QUIEN_JUSTIFICA, RAZON_ENTRADA_TARDIA, QUIEN_JUSTIFICA_ENTRADA, TIPO_SALIDA, RAZON_PERMISO, JUSTIFICADO, RAZON_JUSTIFICAC, PERMISO_PERSONAL_MINS, PERMISO_MEDICO_MINS, TIEMPO_JUSTIFICADO_MINS` (`api_completa.gs` → `COLUMNAS`). El documento 07 sí las tiene bien. |
| C-06 | `consumo_almuerzos` con `opcion_menu`, estados `RESERVADO/CONSUMIDO/CANCELADO` | 07, 24, MASTER | Solo se crea al **despachar**: `{empleadoId, nombre, fecha, timestamp, hora}`, ID `{empleadoId}_{fecha}`. La "reserva" es `almuerzo: 'SI'` en la ENTRADA (o registro `SOLO_ALMUERZO`). |
| C-07 | `solicitudes_invitados` con `nombre_invitado, tipo_almuerzo, estado PENDIENTE/APROBADO/CONSUMIDO` | 07 | Campos reales: `fecha, hora, tipoSolicitud, subtipo (ALMUERZO_EXTRA / REFRIGERIO_SANDUCHE / REFRIGERIO_GALLETAS), cantidad, invitado, empresa, empleadoId, empleadoNombre, empleadoArea, horaServicio, observaciones, observacionesCompletas, estado (SOLICITADO / CONFIRMADO / ENTREGADO / CANCELADO), creadoPor, timestamp`. |
| C-08 | Tipos `SALIDA_ALMUERZO`, `RETORNO_ALMUERZO` | 04 | No existen. Tipos reales en `03_DATOS_REALES.md` §2. |
| C-09 | `tipo_salida` = `ORDINARIA / COMISION / MEDICA` | 07 | Valores reales: `FINAL, PERMISO, PERMISO_CON_SALIDA_TEMPRANA, TRABAJO_CAMPO, SALIDA_PASANTE, SALIDA_TEMPRANA_JUSTIFICADA` (y hoy **no se persisten**, ver D-09). |
| C-10 | WhatsApp al supervisor **por cada atraso** | MASTER | No existe. Notificaciones reales en `02_INVENTARIO_PARIDAD.md` §6. |
| C-11 | Catering muestra raciones por categoría (Normal, Dieta, Vegetariano, Invitado) | 04, 09, 10 | Catering lista a quienes marcaron almuerzo `SI` hoy y permite marcar "consumido". Solo inicia sesión un **supervisor**. |
| C-12 | `theme_color #1e3a8a`, Excel con encabezado azul `#1e3a8a` | 04, 19, MASTER | `manifest.json` usa `theme_color #dc2626` y `background_color #0f172a`. Paletas reales en `05_DISENO.md`. |
| C-13 | Firebase SDK "modular" | 09, 21, MASTER | SDK **compat** 10.11.0 (`firebase-app-compat.js`, `firebase-firestore-compat.js`). |
| C-14 | Bootstrap 5.3.2 / Font Awesome 6.4.2 | MASTER | Bootstrap **5.3.0** (solo app del empleado), Font Awesome **6.4.0** (y 6.0.0-beta3 en `JS/index.html`, que es una copia antigua). |
| C-15 | Archivos `asistencia.html`, `guardia_panel.js` | 25, MASTER | Son `index.html` y `JS/guardia_core.js`. |
| C-16 | PIN de 4 dígitos que "nunca viaja ni se guarda en texto claro" | 10, MASTER | Contraseña de **mínimo 4 caracteres**. Se envía como SHA-256 sin sal (y en algunos flujos también en claro, `rawPin`). A la fecha de la auditoría había **9 contraseñas en texto plano** y el hash funciona como contraseña. |
| C-17 | Retención de fotos por 60 días; triggers a las **20:00 y 23:59** | 01, 03, 05, 06, 10, 12, 13, 19, 20, 21, 24, MASTER | No hay retención de fotos. Los horarios de los activadores de Apps Script **no están en el repositorio** (se configuran en el editor de Apps Script); hay que leerlos allí (`Activadores`). El archivador automático sí conserva **60 días** en Firestore (`archivador_diario.gs`). |
| C-18 | Servidor WhatsApp "Baileys" | 23, MASTER | Servidor **OpenWA** (panel propio en `http://192.168.10.129:2785`, llaves `owa_k1_…`, endpoints `/api/sessions/{id}/messages/send-text`). |

## Qué sí es aprovechable

Los documentos 06 (reglas), 07 (columnas de Sheets y parte de Firestore), 08 (contrato de API), 11 (configuración) y 13 (automatizaciones) tienen bastante información correcta. Úsalos como mapa, pero contrasta cada dato con el código antes de implementarlo.
