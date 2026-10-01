# Worker de integraciones (Fase 6)

Proceso Node pequeño que hace lo que PostgreSQL no hace solo (la imagen no trae `pg_cron`):

| Cada | Qué | Función en la base |
|---|---|---|
| 1 min | Latido: estado de OpenWA (sesión lista, número emisor) para el panel y `diagnostico.html` | `private.worker_latido` |
| 1 min | Tareas programadas: reset de autorizaciones de horas extra (00:05), autocompletar salidas (00:30), aviso WhatsApp "no registró entrada" (hora de corte y días del panel) | `private.worker_tareas` |
| 5 s | Cola: avisos por evento → mensajes, envío por OpenWA (1,2 s entre mensajes), exportación a Google Sheets | `private.worker_tomar` / `private.worker_resultado` |

Las horas de las tareas están en `core.configuracion.tareas`; cada tarea corre **una vez por día** y queda en
`core.tareas_ejecuciones` (visible en `diagnostico.html`). Si el worker estuvo apagado, al volver ejecuta las tareas
del día que ya pasaron su hora. Los mensajes que no se pudieron enviar en 12 h se descartan como vencidos.

## Seguridad

- Se conecta con el rol `tcontrol_worker`, que **solo** puede ejecutar `private.worker_*` (no lee tablas).
- La API key de OpenWA y las credenciales de Google viven solo en variables de entorno del servidor (D-12).
- `WHATSAPP_MODO=simulacion` (por defecto) no llama a OpenWA: la auditoría muestra los mensajes como `SIMULADO`.
  La base de desarrollo es copia de datos reales: **no usar `real` contra ella** salvo con `WHATSAPP_SOLO_NUMEROS`.

## Variables (`.env` de la raíz)

`WORKER_DB_URI` (la generan `node db/scripts/generar-secretos.js` y `migrate.js`), `WHATSAPP_MODO`, `OPENWA_URL`
(si falta, la del panel), `OPENWA_API_KEY`, `OPENWA_SESION` (si falta, la sesión lista de `/api/sessions`),
`WHATSAPP_SOLO_NUMEROS`, `WHATSAPP_PAUSA_MS`, `GOOGLE_CREDENCIALES` (ruta al JSON de una cuenta de servicio) y
`SHEETS_ID` (archivo de Google Sheets compartido con esa cuenta como editor).

## Uso

```bash
cd worker && npm ci
node src/index.js --una-vez     # un ciclo (latido, tareas y cola) y termina
node src/index.js               # servicio
```

En el servidor: servicio `worker` de `db/postgrest/docker-compose.yml` (`docker compose --env-file ../../.env up -d worker`).
