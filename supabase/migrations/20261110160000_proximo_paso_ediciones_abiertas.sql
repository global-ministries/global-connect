-- T2 (odd/tasks/proximo-paso.md, S3) — the public QR page /proximo-paso
-- lists the Próximo Paso ediciones a visitor without an account can pick.
-- A visitor has no session, so the page needs one narrow read that anon may
-- execute: proximo_paso_ediciones_abiertas().
--
-- What it returns, and nothing else: per edición its id, nombre (the
-- snapshot, e.g. 'Diciembre 2026'), fecha_inicio, fecha_fin, cupo_restante
-- (NULL = sin cupo definido, the convention of talleres_cupo_edicion_calculo)
-- and clases (jsonb array of {numero, tema, fecha}). No persona, no
-- inscripción, no grupo, no facilitador ever leaves this function.
--
-- Which ediciones: only those of the taller with slug 'proximo-paso' (estado
-- 'active'), tipo 'individual' (the public form never carries a pareja),
-- with a cohorte (talleres_inscribirme answers EDICION_NOT_FOUND without
-- one) and whose estado efectivo (talleres_estado_efectivo) is 'abierto'.
-- Borrador, cancelado, cerrado and en_curso ediciones are never listed, and
-- no other taller is ever reachable through it: the slug is fixed in the
-- body, there is no parameter.
--
-- clases: the edición's real clases (taller_sesiones of its non-cancelled
-- grupos, one row per numero, earliest fecha) when it has any; otherwise
-- the planned ones, sesiones_snapshot clases every talleres.cadencia_dias
-- from fecha_inicio with the tema of the taller's active plantilla.
--
-- Enrollment stays with talleres_inscribirme (unchanged): the server action
-- of /proximo-paso checks the chosen edición against this list before it
-- calls that RPC with the new account's session.
--
-- Grants: EXECUTE revoked from PUBLIC, granted to anon, authenticated and
-- service_role explicitly. It runs as its owner (definer) with search_path
-- pinned to public, so it reads the tables as their owner; it reuses the internal
-- talleres_cupo_edicion_calculo (no grant for anon or authenticated).
--
-- SAFETY: additive only (one new function). No table, policy or existing
-- function changes.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.proximo_paso_ediciones_abiertas();

CREATE OR REPLACE FUNCTION public.proximo_paso_ediciones_abiertas()
RETURNS TABLE (
  edicion_id uuid,
  nombre text,
  fecha_inicio date,
  fecha_fin date,
  cupo_restante integer,
  clases jsonb
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
    )
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
  'T2 proximo-paso (S3) — public read for the QR page /proximo-paso: the open (talleres_estado_efectivo = abierto), individual Próximo Paso ediciones (taller slug proximo-paso) with a cohorte, ordered by fecha_inicio. Only edicion_id, nombre, fecha_inicio, fecha_fin, cupo_restante (NULL = sin cupo definido) and clases [{numero, tema, fecha}]; never personas. Executable by anon and authenticated.';

REVOKE ALL ON FUNCTION public.proximo_paso_ediciones_abiertas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proximo_paso_ediciones_abiertas() TO anon, authenticated, service_role;
