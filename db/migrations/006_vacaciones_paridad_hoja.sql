-- 006 — P-10: replicar el conteo de la hoja CALCULAR_vacaciones.
-- La hoja VACACIONES tiene filas repetidas (mismo empleado y fecha) y COUNTIFS las cuenta todas.
-- core.novedades guarda un día una sola vez (R-18); la diferencia se conserva como ajuste histórico
-- para que "tomadas" y "restantes" den exactamente lo mismo que la hoja.

ALTER TABLE core.vacaciones_saldo_inicial
  ADD COLUMN IF NOT EXISTS dias_duplicados_legado int NOT NULL DEFAULT 0;

COMMENT ON COLUMN core.vacaciones_saldo_inicial.dias_duplicados_legado IS
  'Filas repetidas de la hoja VACACIONES (mismo empleado y fecha) que COUNTIFS contaba como días tomados (P-10).';

DROP VIEW IF EXISTS api.vacaciones_saldo;
CREATE VIEW api.vacaciones_saldo WITH (security_invoker = true) AS
  WITH p AS (
    SELECT extract(year FROM private.hoy())::int AS anio, private.hoy() AS hoy,
           (private.cfg('vacaciones') ->> 'tomadas_desde')::date AS desde),
  t AS (
    SELECT e.id, p.anio, e.fecha_ingreso,
           coalesce(s.dias, 0) AS saldo_anterior,
           private.vacaciones_adjudicadas(e.fecha_ingreso, p.anio) AS adjudicadas,
           (SELECT count(*) FROM core.novedades n
             WHERE n.empleado_id = e.id AND n.tipo = 'VACACIONES' AND n.fecha <= p.hoy
               AND (p.desde IS NULL OR n.fecha >= p.desde))::int
             + coalesce(s.dias_duplicados_legado, 0) AS tomadas,
           coalesce(s.dias_duplicados_legado, 0) AS duplicados_legado
    FROM core.empleados e CROSS JOIN p
    LEFT JOIN core.vacaciones_saldo_inicial s ON s.empleado_id = e.id AND s.anio = p.anio)
  SELECT t.id AS empleado_id, t.anio, t.fecha_ingreso,
         private.anios_servicio(t.fecha_ingreso, t.anio) AS anios_servicio,
         t.saldo_anterior, t.adjudicadas,
         t.saldo_anterior + coalesce(t.adjudicadas, 0) AS total,
         t.tomadas, t.duplicados_legado,
         t.saldo_anterior + coalesce(t.adjudicadas, 0) - t.tomadas AS restantes
  FROM t;

GRANT SELECT ON api.vacaciones_saldo TO empleado;
