-- noqa: drop-function (rollback note only; ninos_checkout and ninos_retiro_opciones gain an optional trailing argument; the previous forms are replaced, not overloaded)
-- Niños T2a (odd/tasks/ninos-checkin-pco.md, S6 "pickup per child"): the
-- door marks which children of a code leave.
--
-- Why: ninos_checkout released every open check-in of codigo + turno +
-- fecha (20261012130100), so a family could not leave one child and pick
-- up the other later.
--
-- What (every function runs with an empty search_path):
--   1. ninos_checkout(codigo, turno, fecha, retirado_por, motivo_otra,
--      nino_ids) — redefined from 20261012130100. Without the list (NULL,
--      the default) it behaves as before: the whole code. With the list,
--      only those children: every id must be an open check-in of that code
--      in that turno and fecha ('nino_no_esta_adentro', 22023; an empty
--      list is 'sin_ninos', 22023), so nothing is written when any id is
--      wrong. The room authority and the pickup-list check apply to the
--      children released. The rows are locked first, so two doors releasing
--      the same child cannot both succeed. The children still inside keep
--      the code: ninos_checkin only avoids codes of open check-ins.
--   2. ninos_retiro_opciones(codigo, turno, fecha, nino_ids) — the pick list
--      for the marked children (NULL = every child still inside, as before);
--      same refusals as 1.
--   3. ninos_retiros_recientes(turno, fecha, limite) — «Últimos retiros» at
--      the door: the last pickups of the service (child, room, when, with
--      whom, other-person flag) and how many children are inside / already
--      out, counting only the rooms the caller operates. Same authority as
--      ninos_buscar_codigo.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_retiros_recientes(uuid, date, integer);
--   DROP FUNCTION IF EXISTS public.ninos_retiro_opciones(text, uuid, date, uuid[]);
--   DROP FUNCTION IF EXISTS public.ninos_checkout(text, uuid, date, text, text, uuid[]);
--   re-run blocks 4 and 5 of 20261012130100 with their REVOKE/GRANT.

-- ── 1. check-out ─────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.ninos_checkout(text, uuid, date, text, text);

-- Checks out the open check-ins with that code in the turno (all of them,
-- or only p_nino_ids), in the rooms the caller may operate. Returns the
-- children released.
CREATE OR REPLACE FUNCTION public.ninos_checkout(
  p_codigo text, p_turno_id uuid, p_fecha date, p_retirado_por text, p_motivo_otra text DEFAULT NULL,
  p_nino_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (nino_id uuid, salon_id uuid, salida_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  v_actor  uuid := public.ninos_usuario_actual();
  v_motivo text := nullif(btrim(coalesce(p_motivo_otra, '')), '');
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_retirado_por IS NULL OR btrim(p_retirado_por) = '' THEN
    RAISE EXCEPTION 'p_retirado_por is required' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(p_retirado_por)) > 200 OR char_length(v_motivo) > 300 THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023';
  END IF;
  IF p_nino_ids IS NOT NULL AND cardinality(p_nino_ids) = 0 THEN
    RAISE EXCEPTION 'sin_ninos' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ninos_checkins c JOIN public.ninos_salones s ON s.id = c.salon_id
    WHERE c.codigo = p_codigo AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
      AND (p_nino_ids IS NULL OR c.nino_id = ANY (p_nino_ids))
      AND NOT public.ninos_puede_operar(s.equipo_id)
  ) THEN
    RAISE EXCEPTION 'not allowed to check out this code' USING ERRCODE = '42501';
  END IF;

  -- Every marked child is still inside with this code (rows locked, so a
  -- second door waits and then finds the child already out).
  IF p_nino_ids IS NOT NULL AND (
    SELECT count(*) FROM (
      SELECT c.id FROM public.ninos_checkins c
       WHERE c.codigo = p_codigo AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
         AND c.nino_id = ANY (p_nino_ids)
         FOR UPDATE
    ) l
  ) <> (SELECT count(DISTINCT x) FROM unnest(p_nino_ids) x) OR array_position(p_nino_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'nino_no_esta_adentro' USING ERRCODE = '22023';
  END IF;

  -- Without a reason, the person must be on the list of every child released.
  IF v_motivo IS NULL AND EXISTS (
    SELECT 1 FROM public.ninos_checkins c
    WHERE c.codigo = p_codigo AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
      AND (p_nino_ids IS NULL OR c.nino_id = ANY (p_nino_ids))
      AND NOT EXISTS (SELECT 1 FROM public.ninos_personas_retiro(c.nino_id) p
                       WHERE public.ninos_clave_persona(p.nombre) = public.ninos_clave_persona(p_retirado_por))
  ) THEN
    RAISE EXCEPTION 'retiro_no_autorizado' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  UPDATE public.ninos_checkins c
     SET salida_at = now(), salida_por = v_actor, retirado_por_nombre = btrim(p_retirado_por),
         retiro_otra_persona = (v_motivo IS NOT NULL), retiro_motivo = v_motivo
   WHERE c.codigo = p_codigo AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
     AND (p_nino_ids IS NULL OR c.nino_id = ANY (p_nino_ids))
  RETURNING c.nino_id, c.salon_id, c.salida_at;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_checkout(text, uuid, date, text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_checkout(text, uuid, date, text, text, uuid[]) TO authenticated;

-- ── 2. the pick list for the marked children ─────────────────────────

DROP FUNCTION IF EXISTS public.ninos_retiro_opciones(text, uuid, date);

CREATE OR REPLACE FUNCTION public.ninos_retiro_opciones(
  p_codigo text, p_turno_id uuid, p_fecha date, p_nino_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (nombre text, telefono text, relacion text, tipo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_nino_ids IS NOT NULL AND cardinality(p_nino_ids) = 0 THEN
    RAISE EXCEPTION 'sin_ninos' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ninos_checkins c JOIN public.ninos_salones s ON s.id = c.salon_id
    WHERE c.codigo = btrim(p_codigo) AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
      AND (p_nino_ids IS NULL OR c.nino_id = ANY (p_nino_ids))
      AND NOT public.ninos_puede_operar(s.equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_nino_ids IS NOT NULL AND (
    (SELECT count(DISTINCT c.nino_id) FROM public.ninos_checkins c
      WHERE c.codigo = btrim(p_codigo) AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
        AND c.nino_id = ANY (p_nino_ids))
    <> (SELECT count(DISTINCT x) FROM unnest(p_nino_ids) x) OR array_position(p_nino_ids, NULL) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'nino_no_esta_adentro' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH adentro AS (
    SELECT c.nino_id FROM public.ninos_checkins c
     WHERE c.codigo = btrim(p_codigo) AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
       AND (p_nino_ids IS NULL OR c.nino_id = ANY (p_nino_ids))
  ), personas AS (
    SELECT a.nino_id, p.*, public.ninos_clave_persona(p.nombre) AS clave
      FROM adentro a CROSS JOIN LATERAL public.ninos_personas_retiro(a.nino_id) p
  )
  SELECT min(p.nombre), min(p.telefono), min(p.relacion),
         -- A parent of one child who is listed as authorized for another stays a parent.
         CASE WHEN bool_or(p.tipo = 'representante') THEN 'representante' ELSE 'autorizado' END
    FROM personas p
   WHERE p.clave <> ''
   GROUP BY p.clave
  HAVING count(DISTINCT p.nino_id) = (SELECT count(DISTINCT a.nino_id) FROM adentro a)
   ORDER BY bool_or(p.tipo = 'representante') DESC, min(p.nombre);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_retiro_opciones(text, uuid, date, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_retiro_opciones(text, uuid, date, uuid[]) TO authenticated;

-- ── 3. «Últimos retiros» ─────────────────────────────────────────────

-- { adentro, salieron, retiros: [{ nino_id, nombre, apellido, salon,
--   salida_at, retirado_por_nombre, otra_persona }] } newest first.
CREATE OR REPLACE FUNCTION public.ninos_retiros_recientes(p_turno_id uuid, p_fecha date, p_limite integer DEFAULT 8)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_limite integer := greatest(1, least(coalesce(p_limite, 8), 50));
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH visitas AS (
      SELECT c.nino_id, c.salida_at, c.retirado_por_nombre, c.retiro_otra_persona, s.nombre AS salon
        FROM public.ninos_checkins c
        JOIN public.ninos_salones s ON s.id = c.salon_id
       WHERE c.turno_id = p_turno_id AND c.fecha = p_fecha
         AND public.ninos_puede_operar(s.equipo_id)
    ), ultimos AS (
      SELECT v.*, u.nombre, u.apellido
        FROM visitas v JOIN public.usuarios u ON u.id = v.nino_id
       WHERE v.salida_at IS NOT NULL
       ORDER BY v.salida_at DESC, u.apellido, u.nombre
       LIMIT v_limite
    )
    SELECT jsonb_build_object(
      'adentro', (SELECT count(*) FROM visitas v WHERE v.salida_at IS NULL),
      'salieron', (SELECT count(*) FROM visitas v WHERE v.salida_at IS NOT NULL),
      'retiros', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'nino_id', l.nino_id, 'nombre', l.nombre, 'apellido', l.apellido, 'salon', l.salon,
                 'salida_at', l.salida_at, 'retirado_por_nombre', l.retirado_por_nombre,
                 'otra_persona', l.retiro_otra_persona)
               ORDER BY l.salida_at DESC, l.apellido, l.nombre)
          FROM ultimos l), '[]'::jsonb))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_retiros_recientes(uuid, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_retiros_recientes(uuid, date, integer) TO authenticated;
