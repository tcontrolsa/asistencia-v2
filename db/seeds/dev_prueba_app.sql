-- Empleado de prueba SOLO para asistencia_v2_dev (pruebas manuales de la app del empleado).
-- Uso: node db/scripts/sembrar-dev.js
-- Credenciales de prueba: ID PRUEBA01 · cédula 0999999999 · contraseña que se crea en la app: Prueba-App-2026
SET app.etl = 'on';
DELETE FROM core.marcaciones WHERE empleado_id = 'PRUEBA01';
DELETE FROM core.novedades WHERE empleado_id = 'PRUEBA01';
DELETE FROM core.dispositivos WHERE empleado_id = 'PRUEBA01';
DELETE FROM core.fotos WHERE empleado_id = 'PRUEBA01';
DELETE FROM private.credenciales WHERE usuario = 'PRUEBA01';
INSERT INTO core.empleados (id, cedula, nombre, area, cargo, rol, activo, telefono, fecha_ingreso)
VALUES ('PRUEBA01', '0999999999', 'PRUEBA APP EMPLEADO', 'TI', 'ANALISTA', 'EMPLEADO', true, NULL, '2020-01-15')
ON CONFLICT (id) DO UPDATE SET telefono = NULL, activo = true, foto_legado = NULL;
INSERT INTO private.credenciales (usuario, tipo_cuenta, password_hash, debe_cambiar) VALUES ('PRUEBA01', 'EMPLEADO', NULL, true);
-- Una marcación de hace una semana para que aparezcan días faltantes
INSERT INTO core.marcaciones (empleado_id, tipo, fecha, hora, ts_servidor, almuerzo, origen)
VALUES ('PRUEBA01', 'ENTRADA', private.hoy() - 7, '07:25', (private.hoy() - 7 + time '07:25') AT TIME ZONE 'America/Guayaquil', true, 'IMPORTADO');
RESET app.etl;
