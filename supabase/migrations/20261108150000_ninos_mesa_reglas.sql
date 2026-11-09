-- noqa: drop-function (ninos_checkin gains an optional trailing p_forzados; the previous form is replaced, not overloaded)
-- Niños T2d (odd/tasks/ninos-checkin-pco.md, S9.1, S9.3, S5): rules at the
-- check-in desk.
--
-- Why: the desk did not know who is a visitor (ninos_es_visitante answered
-- one child at a time and nobody called it), and a full salón could only be
-- warned about: S9.1 "Avisa y ofrece otro salón, pero deja forzar" asks that
-- forcing a full room is allowed and audited (who forced it), never blocked.
--
-- What (every function runs with an empty search_path):
--   1. ninos_checkins.forzado_por uuid NULL (FK usuarios, as entrada_por):
--      who checked the child in over the room's quota. NULL = not forced
--      (every existing row). Readable as the rest of the row (same SELECT
--      grant and policy).
--   2. ninos_es_visitante_lote(nino_ids, fecha) → (nino_id, visitas_previas,
--      visitante): ninos_es_visitante (20261108100000) for a batch, with the
--      same authority (operates some area of Niños, 42501 'sin_autoridad')
--      and scope (every child of the caller's campuses; one outside refuses
--      the whole batch, 42501). visitas_previas = distinct check-in fechas
--      before p_fecha; visitante while it is below 3 (S8.3 / S9.3: visits 1
--      to 3). Each child once; at most 50 ('demasiados_ninos', 22023).
--   3. ninos_checkin(nino_ids, turno, fecha, salon_ids, forzados) — the
--      20261108110000 body with an optional trailing p_forzados (DEFAULT
--      NULL): the children whose full room the desk forced get forzado_por =
--      the caller. Every id must be one of p_nino_ids, else nothing is
--      written ('forzado_fuera_del_ingreso', 22023). The server never checks
--      the quota itself (the desk is never blocked). Without p_forzados (or
--      NULL / empty) the behavior and the result are unchanged; the old
--      4-argument calls resolve to it through the default. The old signature
--      is dropped so only one function remains.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_es_visitante_lote(uuid[], date);
--   DROP FUNCTION IF EXISTS public.ninos_checkin(uuid[], uuid, date, uuid[], uuid[]);
--   re-run block 4 of 20261108110000 (ninos_checkin with its REVOKE/GRANT);
--   ALTER TABLE public.ninos_checkins DROP COLUMN IF EXISTS forzado_por;

-- ── 1. who forced the room ───────────────────────────────────────────

ALTER TABLE public.ninos_checkins
  ADD COLUMN IF NOT EXISTS forzado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ninos_checkins.forzado_por IS
  'Who checked the child in over the room quota (S9.1, ninos_checkin p_forzados); NULL = not forced.';

-- ── 2. visitors in a batch ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_es_visitante_lote(p_nino_ids uuid[], p_fecha date)
RETURNS TABLE (nino_id uuid, visitas_previas integer, visitante boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
BEGIN
  IF public.ninos_usuario_actual() IS NULL OR NOT public.ninos_puede_operar_algun_area() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'No tienes permiso para operar Niños.';
  END IF;
  IF p_nino_ids IS NULL OR p_fecha IS NULL OR array_position(p_nino_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'datos_invalidos' USING ERRCODE = '22023',
      HINT = 'Indica los niños y la fecha.';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_nino_ids) x) > 50 THEN
    RAISE EXCEPTION 'demasiados_ninos' USING ERRCODE = '22023',
      HINT = 'Consulta como máximo 50 niños a la vez.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_nino_ids) x WHERE NOT public.ninos_en_mi_alcance(x)) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'Uno de esos niños no es de un campus donde operas Niños.';
  END IF;
  RETURN QUERY
  SELECT n.id,
         v.previas,
         v.previas < 3
    FROM (SELECT DISTINCT x AS id FROM unnest(p_nino_ids) x) n
    CROSS JOIN LATERAL (SELECT count(DISTINCT c.fecha)::int AS previas
                          FROM public.ninos_checkins c
                         WHERE c.nino_id = n.id AND c.fecha < p_fecha) v
   ORDER BY n.id;
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_es_visitante_lote(uuid[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_es_visitante_lote(uuid[], date) TO authenticated;

-- ── 3. check-in with the forced children ─────────────────────────────

DROP FUNCTION IF EXISTS public.ninos_checkin(uuid[], uuid, date, uuid[]);

-- Checks in the children of one family visit. p_salon_ids is aligned with
-- p_nino_ids. Every child shares one code. Returns one row per child with the
-- room occupancy after the check-in and whether it went over capacity.
-- p_forzados (T2d): children whose full room was forced at the desk.
CREATE OR REPLACE FUNCTION public.ninos_checkin(
  p_nino_ids uuid[], p_turno_id uuid, p_fecha date, p_salon_ids uuid[], p_forzados uuid[] DEFAULT NULL
)
RETURNS TABLE (nino_id uuid, salon_id uuid, codigo text, ocupacion integer, capacidad integer,
               sobre_capacidad boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  v_campus uuid;
  v_actor uuid := public.ninos_usuario_actual();
  v_visita uuid := gen_random_uuid();
  v_codigo text;
  v_intentos integer := 0;
  i integer;
  v_salon public.ninos_salones%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_nino_ids IS NULL OR p_salon_ids IS NULL OR cardinality(p_nino_ids) = 0
     OR cardinality(p_nino_ids) <> cardinality(p_salon_ids) THEN
    RAISE EXCEPTION 'p_nino_ids and p_salon_ids must be non-empty and aligned' USING ERRCODE = '22023';
  END IF;
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'p_fecha is required' USING ERRCODE = '22023';
  END IF;
  -- T2d: a forced child must be one of this check-in.
  IF p_forzados IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(p_forzados) f(id)
                                         WHERE f.id IS NULL OR NOT f.id = ANY (p_nino_ids)) THEN
    RAISE EXCEPTION 'forzado_fuera_del_ingreso' USING ERRCODE = '22023',
      HINT = 'Solo puedes forzar el cupo de un niño que estás registrando.';
  END IF;

  SELECT t.campus_id INTO v_campus FROM public.dream_team_turnos t
   WHERE t.id = p_turno_id AND t.activo
     AND (t.tipo = 'semanal'
          -- A dated turno only on a planned date, with an active horario of an active event.
          OR (public.ninos_turno_ocurre_en(t.id, p_fecha)
              AND EXISTS (SELECT 1 FROM public.ninos_evento_horarios h
                            JOIN public.ninos_eventos e ON e.id = h.evento_id
                           WHERE h.turno_id = t.id AND h.activo AND e.activo)));
  IF v_campus IS NULL THEN
    RAISE EXCEPTION 'unknown or inactive turno' USING ERRCODE = '22023';
  END IF;

  FOR i IN 1 .. cardinality(p_nino_ids) LOOP
    SELECT * INTO v_salon FROM public.ninos_salones s WHERE s.id = p_salon_ids[i];
    IF NOT FOUND OR NOT v_salon.activo OR v_salon.campus_id <> v_campus THEN
      RAISE EXCEPTION 'room % is not an active room of the turno campus', p_salon_ids[i] USING ERRCODE = '22023';
    END IF;
    IF NOT public.ninos_puede_operar(v_salon.equipo_id) THEN
      RAISE EXCEPTION 'not allowed to check in to room %', v_salon.nombre USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = p_nino_ids[i]) THEN
      RAISE EXCEPTION 'child % has no ficha', p_nino_ids[i] USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Serialize code issuance for this campus + fecha + turno.
  PERFORM pg_advisory_xact_lock(hashtextextended('ninos_checkin:' || v_campus || ':' || p_fecha || ':' || p_turno_id, 0));

  LOOP
    v_codigo := lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.ninos_checkins c
      WHERE c.campus_id = v_campus AND c.fecha = p_fecha AND c.turno_id = p_turno_id
        AND c.codigo = v_codigo AND c.salida_at IS NULL);
    v_intentos := v_intentos + 1;
    IF v_intentos > 200 THEN
      RAISE EXCEPTION 'no free code for this turno' USING ERRCODE = '53000';
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo, entrada_por, -- noqa: insert-into
                                       forzado_por)
    SELECT n.nino, n.salon, p_turno_id, v_campus, p_fecha, v_visita, v_codigo, v_actor,
           CASE WHEN n.nino = ANY (coalesce(p_forzados, '{}')) THEN v_actor END
    FROM unnest(p_nino_ids, p_salon_ids) AS n(nino, salon);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'a child is already checked in for this turno' USING ERRCODE = '23505';
  END;

  RETURN QUERY
  SELECT n.nino, n.salon, v_codigo,
         (SELECT count(*)::int FROM public.ninos_checkins c
           WHERE c.salon_id = n.salon AND c.fecha = p_fecha AND c.turno_id = p_turno_id AND c.salida_at IS NULL),
         s.capacidad,
         (SELECT count(*) FROM public.ninos_checkins c
           WHERE c.salon_id = n.salon AND c.fecha = p_fecha AND c.turno_id = p_turno_id AND c.salida_at IS NULL) > s.capacidad
  FROM unnest(p_nino_ids, p_salon_ids) AS n(nino, salon)
  JOIN public.ninos_salones s ON s.id = n.salon;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_checkin(uuid[], uuid, date, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_checkin(uuid[], uuid, date, uuid[], uuid[]) TO authenticated;
