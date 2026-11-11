-- T8 (odd/tasks/proximo-paso.md, L24.3) — the time, the place and the
-- practical notes of Próximo Paso on the public QR page /proximo-paso, on
-- «¡Listo!» and on the home card: "hora y lugar y todos esos detalles que
-- debe saber una persona".
--
-- proximo_paso_ediciones_abiertas() (20261110160000) keeps every column,
-- filter and order it had and adds three, at the end:
--   hora         text — 'HH24:MI' of the first clase: the first
--                meeting_time_override of a live sesión of a live grupo,
--                else taller_ediciones.recurrence_rule->>'start_time';
--                NULL when neither is set. Same rule as
--                talleres_publico_taller_json (20261110140000).
--   lugar        text — taller_ediciones.lugar (20261110130000); NULL when
--                the edición has none.
--   indicaciones text — taller_ediciones.indicaciones, read as
--                to_jsonb(te)->>'indicaciones' so this works before and
--                after the migration that adds the column (talleres
--                session, 20261111130000): NULL until it exists or is set.
-- None of the three is personal data: they are what the announcement says.
--
-- RETURNS TABLE changes, so CREATE OR REPLACE is not allowed: DROP + CREATE
-- in one transaction, with the same grants (EXECUTE revoked from PUBLIC,
-- granted to anon, authenticated and service_role) and the same SECURITY
-- DEFINER with search_path pinned to public.
--
-- SAFETY: one function recreated; no table, policy or other function
-- changes. Callers that read the six old columns by name keep working.
--
-- ROLLBACK: DROP FUNCTION public.proximo_paso_ediciones_abiertas(); then
--   re-run the CREATE, COMMENT, REVOKE and GRANT of
--   20261110160000_proximo_paso_ediciones_abiertas.sql.

DROP FUNCTION IF EXISTS public.proximo_paso_ediciones_abiertas();

CREATE FUNCTION public.proximo_paso_ediciones_abiertas()
RETURNS TABLE (
  edicion_id uuid,
  nombre text,
  fecha_inicio date,
  fecha_fin date,
  cupo_restante integer,
  clases jsonb,
  hora text,
  lugar text,
  indicaciones text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    te.id,
    te.nombre_snapshot,
    te.fecha_inicio,
    te.fecha_fin,
    CASE WHEN cupo.cupo > 0 THEN greatest(cupo.cupo - cupo.ocupados, 0) END,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('numero', s.numero, 'tema', s.tema, 'fecha', s.fecha) ORDER BY s.numero)
         FROM (
           SELECT ts.numero, min(ts.tema) AS tema, min(ts.fecha_programada) AS fecha
             FROM public.taller_sesiones ts
             JOIN public.taller_grupos g ON g.id = ts.grupo_id
             JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
            WHERE c.taller_id = te.id
              AND g.estado <> 'cancelado'
              AND ts.estado <> 'cancelada'
            GROUP BY ts.numero
         ) s),
      (SELECT jsonb_agg(jsonb_build_object(
                'numero', n.numero,
                'tema', pc.tema,
                'fecha', te.fecha_inicio + (n.numero - 1) * t.cadencia_dias
              ) ORDER BY n.numero)
         FROM generate_series(1, greatest(te.sesiones_snapshot, 0)) AS n(numero)
         LEFT JOIN public.taller_plantilla_clases pc
           ON pc.taller_id = t.id AND pc.numero = n.numero AND pc.activo),
      '[]'::jsonb
    ),
    COALESCE(
      (SELECT to_char(ts.meeting_time_override, 'HH24:MI')
         FROM public.taller_sesiones ts
         JOIN public.taller_grupos g ON g.id = ts.grupo_id
         JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
        WHERE c.taller_id = te.id
          AND g.estado <> 'cancelado'
          AND ts.estado <> 'cancelada'
          AND ts.meeting_time_override IS NOT NULL
        ORDER BY ts.fecha_programada, ts.numero
        LIMIT 1),
      substring(te.recurrence_rule ->> 'start_time' FROM '^\d{2}:\d{2}')
    ),
    nullif(btrim(te.lugar), ''),
    nullif(btrim(to_jsonb(te) ->> 'indicaciones'), '')
  FROM public.talleres t
  JOIN public.taller_ediciones te ON te.taller_id = t.id
  CROSS JOIN LATERAL public.talleres_cupo_edicion_calculo(te.id) AS cupo
  WHERE t.slug = 'proximo-paso'
    AND t.estado = 'active'
    AND te.tipo = 'individual'
    AND public.talleres_estado_efectivo(te) = 'abierto'
    AND EXISTS (
      SELECT 1 FROM public.talleres_crecimiento_cohortes c WHERE c.taller_id = te.id
    )
  ORDER BY te.fecha_inicio, te.id;
$function$;

COMMENT ON FUNCTION public.proximo_paso_ediciones_abiertas() IS
  'T2/T8 proximo-paso (S3, L24) — public read for the QR page /proximo-paso and the home card: the open (talleres_estado_efectivo = abierto), individual Próximo Paso ediciones (taller slug proximo-paso) with a cohorte, ordered by fecha_inicio. Only edicion_id, nombre, fecha_inicio, fecha_fin, cupo_restante (NULL = sin cupo definido), clases [{numero, tema, fecha}], hora (HH24:MI of the first clase), lugar and indicaciones; never personas. Executable by anon and authenticated.';

REVOKE ALL ON FUNCTION public.proximo_paso_ediciones_abiertas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proximo_paso_ediciones_abiertas() TO anon, authenticated, service_role;
