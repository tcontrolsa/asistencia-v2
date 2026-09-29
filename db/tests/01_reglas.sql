-- Pruebas de reglas de negocio (§7 del prompt maestro: casos límite).
-- Fechas de referencia: 2026-09-28 lunes laborable · 2026-09-26 sábado · 2026-09-27 domingo · 2026-10-09 feriado.
-- El runner ejecuta el archivo dentro de BEGIN … ROLLBACK.

CREATE FUNCTION pg_temp.ok(cond boolean, nombre text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'FALLA: %', nombre; END IF;
  RAISE NOTICE 'ok - %', nombre;
END $$;

CREATE FUNCTION pg_temp.eq(obtenido anyelement, esperado anyelement, nombre text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF obtenido IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'FALLA: % (obtenido %, esperado %)', nombre, obtenido, esperado;
  END IF;
  RAISE NOTICE 'ok - %', nombre;
END $$;

-- Tipo de día y horario (D-02)
SELECT pg_temp.eq(private.tipo_dia('2026-09-28'), 'LABORABLE', 'lunes es LABORABLE');
SELECT pg_temp.eq(private.tipo_dia('2026-09-26'), 'SABADO', 'sábado es SABADO');
SELECT pg_temp.eq(private.tipo_dia('2026-09-27'), 'DOMINGO', 'domingo es DOMINGO');
SELECT pg_temp.eq(private.tipo_dia('2026-10-09'), 'FERIADO', '9 de octubre es FERIADO');
SELECT pg_temp.eq((private.horario('2026-09-28')).salida, '16:15'::time, 'salida laborable 16:15');
SELECT pg_temp.eq((private.horario('2026-09-26')).entrada, '07:00'::time, 'entrada sábado 07:00');
SELECT pg_temp.eq((private.horario('2026-10-09')).salida, '15:15'::time, 'salida feriado 15:15');

-- Atraso (R-04, D-01): referencia 07:30, tolerancia 5 min, se cuenta desde 07:30
SELECT pg_temp.eq(private.minutos_atraso('2026-09-28', '07:30', false), 0, 'atraso 07:30 = 0');
SELECT pg_temp.eq(private.minutos_atraso('2026-09-28', '07:35', false), 0, 'atraso 07:35 = 0 (tolerancia)');
SELECT pg_temp.eq(private.minutos_atraso('2026-09-28', '07:35:59', false), 0, 'atraso 07:35:59 = 0 (ignora segundos)');
SELECT pg_temp.eq(private.minutos_atraso('2026-09-28', '07:36', false), 6, 'atraso 07:36 = 6 (desde 07:30)');
SELECT pg_temp.eq(private.minutos_atraso('2026-09-28', '07:45', false), 15, 'atraso 07:45 = 15');
SELECT pg_temp.eq(private.minutos_atraso('2026-09-28', '09:30', false), 120, 'atraso 09:30 = 120');
SELECT pg_temp.eq(private.minutos_atraso('2026-09-28', '08:00', true), 0, 'pasante sin atraso (R-06)');
SELECT pg_temp.eq(private.minutos_atraso('2026-09-28', '08:00', false, 'SIN_ASISTENCIA'), 0, 'SIN ASISTENCIA sin atraso');
SELECT pg_temp.eq(private.minutos_atraso('2026-09-26', '07:05', false), 0, 'sábado 07:05 = 0');
SELECT pg_temp.eq(private.minutos_atraso('2026-09-26', '07:06', false), 6, 'sábado 07:06 = 6 (desde 07:00)');
SELECT pg_temp.eq(private.minutos_atraso('2026-10-09', '07:30', false), 30, 'feriado 07:30 = 30');

-- Motivo de entrada tardía (R-05)
SELECT pg_temp.eq(private.requiere_motivo_entrada('2026-09-28', '07:45'), false, 'motivo no requerido a las 07:45');
SELECT pg_temp.eq(private.requiere_motivo_entrada('2026-09-28', '07:46'), true, 'motivo requerido a las 07:46');

-- Salida anticipada (R-07)
SELECT pg_temp.eq(private.es_salida_anticipada('2026-09-28', '16:14'), true, 'salida 16:14 es anticipada');
SELECT pg_temp.eq(private.es_salida_anticipada('2026-09-28', '16:15'), false, 'salida 16:15 no es anticipada');
SELECT pg_temp.eq(private.es_salida_anticipada('2026-09-26', '15:14'), true, 'sábado salida 15:14 anticipada');
SELECT pg_temp.eq(private.es_salida_anticipada('2026-09-26', '15:15'), false, 'sábado salida 15:15 normal');

-- Horas extra automáticas (R-12, D-02): salida + 45 min
SELECT pg_temp.eq((private.horas_extra_auto('SALIDA', '2026-09-28', '17:00', 'OFICINA')).horas_extra, false, 'salida 17:00 (+45) sin extra');
SELECT pg_temp.eq((private.horas_extra_auto('SALIDA', '2026-09-28', '17:01', 'OFICINA')).autoriza, 'SISTEMA (>45 MIN)', 'salida 17:01 (+46) con extra');
SELECT pg_temp.eq((private.horas_extra_auto('SALIDA', '2026-09-26', '16:00', 'OFICINA')).horas_extra, false, 'sábado salida 16:00 sin extra');
SELECT pg_temp.eq((private.horas_extra_auto('SALIDA', '2026-09-26', '16:01', 'OFICINA')).horas_extra, true, 'sábado salida 16:01 con extra');
SELECT pg_temp.eq((private.horas_extra_auto('SALIDA', '2026-09-27', '16:01', 'OFICINA')).horas_extra, true, 'domingo salida 16:01 con extra');
SELECT pg_temp.eq((private.horas_extra_auto('ENTRADA', '2026-09-28', '07:30', 'CAMPO')).autoriza, 'SISTEMA (CAMPO)', 'modo campo siempre con extra');
SELECT pg_temp.eq((private.horas_extra_auto('SALIDA', '2026-09-28', '18:00', 'CAMPO')).autoriza, 'SISTEMA (CAMPO)', 'campo conserva autoriza de campo');
SELECT pg_temp.eq((private.horas_extra_auto('ENTRADA', '2026-09-28', '18:00', 'OFICINA')).horas_extra, false, 'ENTRADA tarde no genera extra');

-- Almuerzo (R-14): elección hasta 09:30 inclusive; salida antes de 09:30 fuerza NO
SELECT pg_temp.eq(private.almuerzo_abierto('09:30'), true, 'almuerzo abierto a las 09:30');
SELECT pg_temp.eq(private.almuerzo_abierto('09:30:59'), true, 'almuerzo abierto a las 09:30:59');
SELECT pg_temp.eq(private.almuerzo_abierto('09:31'), false, 'almuerzo cerrado a las 09:31');
SELECT pg_temp.eq(private.almuerzo_en_salida('09:29', true), false, 'salida 09:29 → almuerzo NO');
SELECT pg_temp.eq(private.almuerzo_en_salida('09:30', true), true, 'salida 09:30 conserva almuerzo');

-- Invitados (R-15)
SELECT pg_temp.eq(private.validar_solicitud_invitado('ALMUERZO_EXTRA', '2026-09-28', 'TI', 'ANALISTA', '2026-09-28 09:40'), NULL, 'almuerzo extra hoy a las 09:40 permitido');
SELECT pg_temp.ok(private.validar_solicitud_invitado('ALMUERZO_EXTRA', '2026-09-28', 'TI', 'ANALISTA', '2026-09-28 09:41') LIKE '%09:40%', 'almuerzo extra hoy a las 09:41 rechazado');
SELECT pg_temp.eq(private.validar_solicitud_invitado('REFRIGERIO_SANDUCHE', '2026-09-28', 'TI', 'ANALISTA', '2026-09-28 08:40'), NULL, 'sánduche hoy a las 08:40 permitido');
SELECT pg_temp.ok(private.validar_solicitud_invitado('REFRIGERIO_SANDUCHE', '2026-09-28', 'TI', 'ANALISTA', '2026-09-28 08:41') LIKE '%08:40%', 'sánduche hoy a las 08:41 rechazado');
SELECT pg_temp.eq(private.validar_solicitud_invitado('REFRIGERIO_GALLETAS', '2026-09-28', 'TI', 'ANALISTA', '2026-09-28 15:00'), NULL, 'galletas sin límite horario');
SELECT pg_temp.eq(private.validar_solicitud_invitado('ALMUERZO_EXTRA', '2026-09-29', 'TI', 'ANALISTA', '2026-09-28 15:00'), NULL, 'fecha futura sin corte');
SELECT pg_temp.ok(private.validar_solicitud_invitado('ALMUERZO_EXTRA', '2026-09-27', 'TI', 'ANALISTA', '2026-09-28 07:00') LIKE '%fechas pasadas%', 'fecha pasada rechazada');
SELECT pg_temp.ok(private.validar_solicitud_invitado('REFRIGERIO_GALLETAS', '2026-09-29', 'Taller', 'SOLDADOR', '2026-09-28 07:00') LIKE '%Taller%', 'área Taller rechazada');
SELECT pg_temp.ok(private.validar_solicitud_invitado('REFRIGERIO_GALLETAS', '2026-09-29', 'PRODUCCION', 'JEFE DE TÁLLER', '2026-09-28 07:00') LIKE '%Taller%', 'cargo con Táller (tilde) rechazado');

-- Período 26–25 (R-16, D-03)
SELECT pg_temp.eq((private.periodo('2026-09-26')).inicio, '2026-09-26'::date, 'período del 26-sep inicia 26-sep');
SELECT pg_temp.eq((private.periodo('2026-09-26')).fin, '2026-10-25'::date, 'período del 26-sep termina 25-oct');
SELECT pg_temp.eq((private.periodo('2026-09-25')).inicio, '2026-08-26'::date, 'período del 25-sep inicia 26-ago');
SELECT pg_temp.eq((private.periodo('2026-01-10')).inicio, '2025-12-26'::date, 'período de enero cruza el año');
SELECT pg_temp.eq((private.periodo('2026-12-31')).fin, '2027-01-25'::date, 'período de fin de año termina en 2027');

-- Geocerca (R-01, R-02, D-21): centro -0.12910, -78.47815, radio 250 m; campo 300 m
SELECT pg_temp.eq((private.validar_geocerca(-0.12910, -78.47815, 'OFICINA', NULL, NULL, NULL)).distancia_m, 0, 'distancia al centro = 0');
SELECT pg_temp.eq((private.validar_geocerca(-0.12910 + 0.00224, -78.47815, 'OFICINA', NULL, NULL, NULL)).dentro, true, '249 m dentro de 250');
SELECT pg_temp.eq((private.validar_geocerca(-0.12910 + 0.00226, -78.47815, 'OFICINA', NULL, NULL, NULL)).dentro, false, '251 m fuera de 250');
SELECT pg_temp.eq((private.validar_geocerca(-0.12910, -78.47815, 'OFICINA', NULL, NULL, NULL)).radio_m, 250, 'radio oficina 250');
SELECT pg_temp.eq((private.validar_geocerca(-0.2, -78.5, 'CAMPO', NULL, NULL, NULL)).dentro, false, 'campo sin base no permite marcar');
SELECT pg_temp.eq((private.validar_geocerca(-0.2 + 0.0026, -78.5, 'CAMPO', -0.2, -78.5, 300)).dentro, true, 'campo a ~289 m de la base dentro');
SELECT pg_temp.eq((private.validar_geocerca(-0.2 + 0.0028, -78.5, 'CAMPO', -0.2, -78.5, 300)).dentro, false, 'campo a ~311 m de la base fuera');
SELECT pg_temp.ok((private.validar_geocerca(NULL, NULL, 'OFICINA', NULL, NULL, NULL)).dentro IS FALSE, 'sin GPS no se marca');

-- Vacaciones (D-04): años al 31/12 y tabla de la hoja
SELECT pg_temp.eq(private.vacaciones_adjudicadas('2026-03-01', 2026), 0, 'menos de 1 año = 0');
SELECT pg_temp.eq(private.vacaciones_adjudicadas('2025-12-31', 2026), 11, '1 año exacto al 31/12 = 11');
SELECT pg_temp.eq(private.vacaciones_adjudicadas('2021-06-15', 2026), 11, '5 años = 11');
SELECT pg_temp.eq(private.vacaciones_adjudicadas('2020-06-15', 2026), 12, '6 años = 12');
SELECT pg_temp.eq(private.vacaciones_adjudicadas('2017-06-15', 2026), 15, '9 años = 15');
SELECT pg_temp.eq(private.vacaciones_adjudicadas('2016-06-15', 2026), 16, '10 años = 16');
SELECT pg_temp.eq(private.vacaciones_adjudicadas('2014-06-15', 2026), 16, '12 años = 16');
SELECT pg_temp.eq(private.vacaciones_adjudicadas('2013-06-15', 2026), 17, '13 años = 17');
SELECT pg_temp.eq(private.vacaciones_adjudicadas('2010-06-15', 2026), 20, '16 años = 20');
SELECT pg_temp.eq(private.vacaciones_adjudicadas('2007-06-15', 2026), 21, '19 años = 21');
SELECT pg_temp.eq(private.vacaciones_adjudicadas('2006-06-15', 2026), 22, '20 años = 22');
SELECT pg_temp.eq(private.vacaciones_adjudicadas(NULL, 2026), NULL::int, 'sin fecha de ingreso = sin dato');

-- Clasificación desde el texto legado
SELECT pg_temp.eq(private.texto_es_pasante('PASANTE DE INGENIERIA', 'TI'), true, 'cargo con PASANTE');
SELECT pg_temp.eq(private.texto_es_pasante('ANALISTA', 'PASANTÍA'), true, 'área con PASANTÍA');
SELECT pg_temp.eq(private.texto_tipo_asistencia('SIN ASISTENCIA', ''), 'SIN_ASISTENCIA'::core.tipo_asistencia, 'SIN ASISTENCIA');
SELECT pg_temp.eq(private.texto_tipo_asistencia('SOLO_ALMUERZO', ''), 'SOLO_ALMUERZO'::core.tipo_asistencia, 'SOLO_ALMUERZO');
SELECT pg_temp.eq(private.texto_puede_autorizar_extras('COORDINADOR DE PRODUCCIÓN'), true, 'coordinador de producción autoriza extras');
SELECT pg_temp.eq(private.texto_puede_autorizar_extras('ASISTENTE DE PRODUCCION'), true, 'asistente de producción autoriza extras');
SELECT pg_temp.eq(private.texto_puede_autorizar_extras('SOLDADOR TALLER'), false, 'operario de taller no autoriza');

-- Hoy siempre en Guayaquil, nunca en UTC (§3)
SELECT pg_temp.eq(private.hoy(), (now() AT TIME ZONE 'America/Guayaquil')::date, 'hoy() en America/Guayaquil');
SET LOCAL timezone = 'UTC';
SELECT pg_temp.eq(private.hoy(), (now() AT TIME ZONE 'America/Guayaquil')::date, 'hoy() no depende de la zona de la sesión');
