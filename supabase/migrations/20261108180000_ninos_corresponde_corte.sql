-- noqa: insert-into (no data is written here)
-- Niños: the salón rules in SQL measure the age on the salón's reference date
-- (fecha de corte and promoción), as the desk does
-- (odd/tasks/ninos-checkin-pco.md, T2g, S9.5).
--
-- Why: the desk (lib/platform/ninos/sugerir-salon.ts, fechaReferencia /
-- edadParaSalon, T1d) places a child by its age on the salón's reference
-- date, so a child moves up once per cycle and not on its birthday.
-- ninos_salon_corresponde and ninos_salon_esperado (20261108160000) took the
-- age on the service date, so «Mover» and Esperados could disagree with the
-- desk for a salón with a corte.
--
-- What:
--   1. ninos_edad_meses(nacimiento, fecha) → integer, internal: completed
--      months as the TS edadEnMeses (a month counts once its day of the month
--      is reached); NULL for no birth date or one after the date.
--   2. ninos_salon_fecha_referencia(corte_mes, corte_dia, promocion_mes,
--      promocion_dia, fecha) → date, internal, as the TS fechaReferencia:
--        - no rule: the date;
--        - corte and promoción: the first corte on or after the last
--          promoción on or before the date (corte 1 dic, promoción 1 ago:
--          from 1 ago 2026 every service uses 1 dic 2026);
--        - only a corte: the last corte; only a promoción: the last promoción.
--      A day past the end of the month is its last day (29 Feb → 28 Feb).
--   3. ninos_edad_para_salon(nacimiento, fecha, corte, promoción) → integer,
--      internal, as the TS edadParaSalon: NULL when (1) is NULL on the date;
--      otherwise the months on the reference date, 0 for a child born after
--      it (a baby after the last corte).
--   4. ninos_salon_corresponde: as in 20261108160000, with the age of each
--      Waumba age salón (and of the Waumba salones that open Plus to a child
--      with special needs) taken by (3) with that salón's rule. A child with
--      neither birth date nor grade still corresponds to every active salón.
--      Same signature, still internal.
--   5. ninos_salon_esperado: as in 20261108160000, with the age salones
--      chosen by (3) too.
--
-- Every function runs with definer rights and search_path ''.
--
-- Rollback: re-run sections 1 and 4 of 20261108160000_ninos_mover_corresponde.sql
-- (ninos_salon_corresponde, ninos_salon_esperado), then
--   DROP FUNCTION IF EXISTS public.ninos_edad_para_salon(date, date, integer, integer, integer, integer);
--   DROP FUNCTION IF EXISTS public.ninos_salon_fecha_referencia(integer, integer, integer, integer, date);
--   DROP FUNCTION IF EXISTS public.ninos_edad_meses(date, date);

-- ── 1. completed months ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_edad_meses(p_nacimiento date, p_fecha date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT nullif(greatest(m, -1), -1)
    FROM (SELECT ((extract(year FROM p_fecha) - extract(year FROM p_nacimiento)) * 12
                  + extract(month FROM p_fecha) - extract(month FROM p_nacimiento)
                  - CASE WHEN extract(day FROM p_fecha) < extract(day FROM p_nacimiento) THEN 1 ELSE 0 END)::integer AS m) x;
$$;
REVOKE ALL ON FUNCTION public.ninos_edad_meses(date, date) FROM PUBLIC, anon, authenticated;

-- ── 2. the salón's reference date ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_salon_fecha_referencia(p_corte_mes integer, p_corte_dia integer,
                                                               p_promocion_mes integer, p_promocion_dia integer, p_fecha date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  -- dia(anio, mes, dia): that calendar day, or the last day of the month.
  WITH dia AS (
    SELECT a.anio, make_date(a.anio, m.mes, least(m.dia, extract(day FROM make_date(a.anio, m.mes, 1) + interval '1 month - 1 day')::integer)) AS fecha, m.tipo
      FROM (VALUES ('corte', p_corte_mes, p_corte_dia), ('promocion', p_promocion_mes, p_promocion_dia)) AS m(tipo, mes, dia)
      CROSS JOIN generate_series(extract(year FROM p_fecha)::integer - 2, extract(year FROM p_fecha)::integer + 1) AS a(anio)
     WHERE m.mes IS NOT NULL AND m.dia IS NOT NULL
  ), ultima_promocion AS (
    SELECT max(d.fecha) AS fecha FROM dia d WHERE d.tipo = 'promocion' AND d.fecha <= p_fecha
  )
  SELECT CASE
           WHEN p_corte_mes IS NOT NULL AND p_corte_dia IS NOT NULL AND p_promocion_mes IS NOT NULL AND p_promocion_dia IS NOT NULL
             THEN (SELECT min(d.fecha) FROM dia d, ultima_promocion u WHERE d.tipo = 'corte' AND d.fecha >= u.fecha)
           WHEN p_corte_mes IS NOT NULL AND p_corte_dia IS NOT NULL
             THEN (SELECT max(d.fecha) FROM dia d WHERE d.tipo = 'corte' AND d.fecha <= p_fecha)
           WHEN p_promocion_mes IS NOT NULL AND p_promocion_dia IS NOT NULL
             THEN (SELECT u.fecha FROM ultima_promocion u)
           ELSE p_fecha
         END;
$$;
REVOKE ALL ON FUNCTION public.ninos_salon_fecha_referencia(integer, integer, integer, integer, date) FROM PUBLIC, anon, authenticated;

-- ── 3. the age for a salón ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_edad_para_salon(p_nacimiento date, p_fecha date,
                                                        p_corte_mes integer, p_corte_dia integer,
                                                        p_promocion_mes integer, p_promocion_dia integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE
           WHEN public.ninos_edad_meses(p_nacimiento, p_fecha) IS NULL THEN NULL
           ELSE coalesce(public.ninos_edad_meses(p_nacimiento,
                  public.ninos_salon_fecha_referencia(p_corte_mes, p_corte_dia, p_promocion_mes, p_promocion_dia, p_fecha)), 0)
         END;
$$;
REVOKE ALL ON FUNCTION public.ninos_edad_para_salon(date, date, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;

-- ── 4. the salón corresponds to the child ────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_salon_corresponde(p_nino_id uuid, p_salon_id uuid, p_fecha date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH nino AS (
    SELECT f.grado,
           coalesce(btrim(f.necesidades_especiales), '') <> '' AS necesidades,
           u.fecha_nacimiento::date AS nacimiento,
           public.ninos_edad_meses(u.fecha_nacimiento::date, p_fecha) AS meses
      FROM public.usuarios u
      LEFT JOIN public.ninos_fichas f ON f.usuario_id = u.id
     WHERE u.id = p_nino_id
  ), salon AS (
    SELECT s.* FROM public.ninos_salones s WHERE s.id = p_salon_id AND s.activo
  )
  SELECT coalesce((
    SELECT CASE
             WHEN n.meses IS NULL AND n.grado IS NULL THEN true
             ELSE (s.area = 'waumba' AND NOT s.es_necesidades_especiales
                   AND (s.edad_min_meses IS NOT NULL OR s.edad_max_meses IS NOT NULL)
                   AND n.meses IS NOT NULL
                   AND public.ninos_edad_para_salon(n.nacimiento, p_fecha, s.corte_mes, s.corte_dia, s.promocion_mes, s.promocion_dia)
                       BETWEEN coalesce(s.edad_min_meses, 0) AND coalesce(s.edad_max_meses, 2147483647))
               OR (s.area = 'upstreet' AND (s.grado_min IS NOT NULL OR s.grado_max IS NOT NULL)
                   AND n.grado IS NOT NULL
                   AND n.grado BETWEEN coalesce(s.grado_min, 0) AND coalesce(s.grado_max, 12))
               OR (s.area = 'waumba' AND s.es_necesidades_especiales AND n.necesidades AND n.meses IS NOT NULL
                   AND EXISTS (SELECT 1 FROM public.ninos_salones a
                                WHERE a.campus_id = s.campus_id AND a.activo
                                  AND a.area = 'waumba' AND NOT a.es_necesidades_especiales
                                  AND (a.edad_min_meses IS NOT NULL OR a.edad_max_meses IS NOT NULL)
                                  AND public.ninos_edad_para_salon(n.nacimiento, p_fecha, a.corte_mes, a.corte_dia,
                                                                   a.promocion_mes, a.promocion_dia)
                                      BETWEEN coalesce(a.edad_min_meses, 0) AND coalesce(a.edad_max_meses, 2147483647)))
           END
      FROM salon s
      LEFT JOIN nino n ON true), false);
$$;
REVOKE ALL ON FUNCTION public.ninos_salon_corresponde(uuid, uuid, date) FROM PUBLIC, anon, authenticated;

-- ── 5. the salón a pre-registered child is expected in ───────────────

CREATE OR REPLACE FUNCTION public.ninos_salon_esperado(p_nino_id uuid, p_campus_id uuid, p_fecha date)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH nino AS (
    SELECT f.salon_preferido_id, f.grado,
           coalesce(btrim(f.necesidades_especiales), '') <> '' AS necesidades,
           u.fecha_nacimiento::date AS nacimiento,
           public.ninos_edad_meses(u.fecha_nacimiento::date, p_fecha) AS meses
      FROM public.ninos_fichas f
      JOIN public.usuarios u ON u.id = f.usuario_id
     WHERE f.usuario_id = p_nino_id
  ), activos AS (
    SELECT s.* FROM public.ninos_salones s WHERE s.campus_id = p_campus_id AND s.activo
  ), por_edad AS (
    SELECT a.* FROM activos a, nino n
     WHERE a.area = 'waumba' AND NOT a.es_necesidades_especiales
       AND (a.edad_min_meses IS NOT NULL OR a.edad_max_meses IS NOT NULL)
       AND n.meses IS NOT NULL
       AND public.ninos_edad_para_salon(n.nacimiento, p_fecha, a.corte_mes, a.corte_dia, a.promocion_mes, a.promocion_dia)
           BETWEEN coalesce(a.edad_min_meses, 0) AND coalesce(a.edad_max_meses, 2147483647)
  )
  SELECT coalesce(
    (SELECT a.id FROM activos a, nino n
      WHERE a.id = n.salon_preferido_id AND public.ninos_salon_corresponde(p_nino_id, a.id, p_fecha)),
    (SELECT a.id FROM activos a, nino n
      WHERE n.necesidades AND EXISTS (SELECT 1 FROM por_edad)
        AND a.area = 'waumba' AND a.es_necesidades_especiales
      ORDER BY a.orden, a.nombre LIMIT 1),
    (SELECT a.id FROM activos a, nino n
      WHERE n.grado IS NOT NULL AND a.area = 'upstreet' AND (a.grado_min IS NOT NULL OR a.grado_max IS NOT NULL)
        AND n.grado BETWEEN coalesce(a.grado_min, 0) AND coalesce(a.grado_max, 12)
      ORDER BY a.orden, a.nombre LIMIT 1),
    (SELECT e.id FROM por_edad e ORDER BY e.orden, e.nombre LIMIT 1));
$$;
REVOKE ALL ON FUNCTION public.ninos_salon_esperado(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
