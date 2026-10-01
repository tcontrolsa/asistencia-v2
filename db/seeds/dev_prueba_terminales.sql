-- Cuentas de prueba SOLO para asistencia_v2_dev (pruebas manuales de guardia, catering y kiosco).
-- Uso: node db/scripts/sembrar-dev.js
-- Guardia:  usuario guardia_prueba · contraseña temporal Temporal-2026 (la terminal pide cambiarla; usar Guardia-Prueba-2026)
-- Catering: ID PRUEBA_SUP (supervisor) · contraseña Super-Prueba-2026
-- Kiosco:   ID PRUEBA02 · contraseña Kiosco-Prueba-2026
-- Panel:    ID PRUEBA_ADM (Sup. Admin) · contraseña Admin-Prueba-2026
SET app.etl = 'on';
DELETE FROM core.marcaciones WHERE empleado_id IN ('PRUEBA02', 'PRUEBA_SUP');
DELETE FROM core.consumo_almuerzos WHERE empleado_id IN ('PRUEBA01', 'PRUEBA02', 'PRUEBA_SUP');
DELETE FROM private.credenciales WHERE usuario IN ('guardia_prueba', 'PRUEBA02', 'PRUEBA_SUP', 'PRUEBA_ADM');
INSERT INTO core.guardias (usuario, nombre, activo) VALUES ('guardia_prueba', 'GUARDIA DE PRUEBA', true)
ON CONFLICT (usuario) DO UPDATE SET activo = true;
INSERT INTO core.empleados (id, cedula, nombre, area, cargo, rol, activo, telefono, fecha_ingreso) VALUES
  ('PRUEBA02', '0999999998', 'PRUEBA KIOSCO', 'TI', 'ANALISTA', 'EMPLEADO', true, '0999999998', '2021-03-01'),
  ('PRUEBA_SUP', '0999999997', 'PRUEBA SUPERVISORA', 'TI', 'JEFA', 'SUPERVISOR', true, '0999999997', '2019-06-01'),
  ('PRUEBA_ADM', '0999999996', 'PRUEBA SUP ADMIN', 'TI', 'COORDINADOR', 'SUPERVISOR_ADMIN', true, NULL, '2019-06-01')
ON CONFLICT (id) DO UPDATE SET activo = true;
INSERT INTO private.credenciales (usuario, tipo_cuenta, password_hash, debe_cambiar) VALUES
  ('guardia_prueba', 'GUARDIA', crypt('Temporal-2026', gen_salt('bf', 10)), true),
  ('PRUEBA02', 'EMPLEADO', crypt('Kiosco-Prueba-2026', gen_salt('bf', 10)), false),
  ('PRUEBA_SUP', 'EMPLEADO', crypt('Super-Prueba-2026', gen_salt('bf', 10)), false),
  ('PRUEBA_ADM', 'EMPLEADO', crypt('Admin-Prueba-2026', gen_salt('bf', 10)), false);
RESET app.etl;
