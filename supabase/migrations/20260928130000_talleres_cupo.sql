-- T6 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — cupo: the
-- edicion's capacity is the sum of its (non-cancelled) taller_grupos'
-- capacidad. Public self-enroll is denied once that capacity is reached
-- (docs/talleres-de-punta-a-punta.md §5, "el cupo cierra la puerta de la
-- gente, nunca la mano del director"); a director/coordinator/admin can
-- always enrol someone ANYWAY, but the excess is visible and recorded
-- (sobre_cupo, sobre_cupo_por, sobre_cupo_en).
--
-- Verified against STAGING before writing this file:
--   * taller_inscripciones columns/constraints — estado CHECK is exactly
--     ('pendiente'|'aprobado'|'no_aprobado'|'retirado'), no 'completado' at
--     the DB level (that value only exists on the app-level InscripcionEstado
--     type via unit_estado); UNIQUE (taller_id, cohorte_id,
--     persona_principal_id), no partial predicate.
--   * taller_grupos columns/constraints — estado CHECK is exactly
--     ('activo'|'completado'|'cancelado'), capacidad > 0.
--   * talleres_crecimiento_cohortes.taller_id is the edicion id (1 cohorte
--     per edicion in practice — talleres_instanciar_edicion inserts exactly
--     one, no UNIQUE constraint exists at the DB level).
--   * live pg_policy for taller_ediciones_select and taller_inscripciones_
--     insert/select (pg_get_expr on polqual/polwithcheck) — reused verbatim
--     as this migration's authority predicates.
--   * talleres_equipo_de_edicion(uuid), talleres_equipo_de_cohorte(uuid),
--     auth_has_talleres_capability_scoped(text, uuid), talleres_estado_
--     efectivo(taller_ediciones) — all STABLE, existing helpers reused
--     as-is, no changes.
--   * grepped supabase/migrations for `INSERT INTO public.taller_
--     inscripciones` and `talleres_inscribir` — the only INSERT is
--     explorar/actions.ts's self-enroll (never sets sobre_cupo, so it
--     defaults false); no existing RPC named talleres_inscribir_* exists,
--     so this migration introduces the first one.
--
-- WHO OCCUPIES A SEAT — read the CHECK constraint plus the app's own
-- semantics (components/talleres/labels.ts, lib/platform/talleres/
-- inscripciones-types.ts): 'pendiente' (self-enrolled, awaiting review)
-- and 'aprobado' (accepted) both hold the seat while the review is
-- pending or settled favorably. 'no_aprobado' (rejected) and 'retirado'
-- (withdrawn) free it — the person is not attending, so counting them
-- would make an edicion look full when seats are actually open.
--
-- SAFETY: additive only (3 new nullable/defaulted columns + 1 CHECK, 3
-- new functions, 1 new trigger). No existing policy, function signature,
-- or RPC call site changes. No data migration (every existing row is
-- sobre_cupo=false with both metadata columns NULL, which already
-- satisfies the new CHECK).
--
-- ROLLBACK:
--   DROP TRIGGER trg_taller_inscripciones_cupo ON public.taller_inscripciones;
--   DROP FUNCTION public.talleres_inscripciones_cupo_gate();
--   DROP FUNCTION public.talleres_inscribir_sobre_cupo(uuid, uuid);
--   DROP FUNCTION public.talleres_inscripciones_sobre_cupo_personas(uuid[]);
--   DROP FUNCTION public.talleres_cupo_edicion(uuid);
--   DROP FUNCTION public.talleres_cupo_edicion_calculo(uuid);
--   ALTER TABLE public.taller_inscripciones
--     DROP CONSTRAINT taller_inscripciones_sobre_cupo_metadata_check,
--     DROP COLUMN sobre_cupo_en, DROP COLUMN sobre_cupo_por, DROP COLUMN sobre_cupo;

-- ===========================================================================
-- A. taller_inscripciones: the excess-tracking columns
-- ===========================================================================

ALTER TABLE public.taller_inscripciones
  ADD COLUMN sobre_cupo boolean NOT NULL DEFAULT false,
  ADD COLUMN sobre_cupo_por uuid NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  ADD COLUMN sobre_cupo_en timestamptz NULL;

ALTER TABLE public.taller_inscripciones
  ADD CONSTRAINT taller_inscripciones_sobre_cupo_metadata_check CHECK (
    (sobre_cupo = false AND sobre_cupo_por IS NULL AND sobre_cupo_en IS NULL)
    OR (sobre_cupo = true AND sobre_cupo_por IS NOT NULL AND sobre_cupo_en IS NOT NULL)
  );

COMMENT ON COLUMN public.taller_inscripciones.sobre_cupo IS
  'T6 (talleres-temporadas-y-ediciones) - true when this row was placed above the edicion''s cupo by a director/coordinator/admin via talleres_inscribir_sobre_cupo, bypassing the BEFORE INSERT gate (trg_taller_inscripciones_cupo).';
COMMENT ON COLUMN public.taller_inscripciones.sobre_cupo_por IS
  'Who placed this sobre-cupo enrollment (usuarios.id of the caller of talleres_inscribir_sobre_cupo). NULL unless sobre_cupo = true.';
COMMENT ON COLUMN public.taller_inscripciones.sobre_cupo_en IS
  'When this sobre-cupo enrollment was placed (now() inside talleres_inscribir_sobre_cupo). NULL unless sobre_cupo = true.';

-- ===========================================================================
-- B. talleres_cupo_edicion_calculo(uuid) — internal aggregate, no authority
--    check, no EXECUTE grant to authenticated. Shared by the public RPC
--    (talleres_cupo_edicion, which adds the authority check) and the
--    BEFORE INSERT gate (which runs already-authorized by RLS, and reads
--    it as the owner via this SECURITY DEFINER function so a plain
--    self-enroll participant's own limited taller_grupos/taller_
--    inscripciones visibility never undercounts the aggregate). Same
--    "internal helper, no EXECUTE for authenticated" pattern as
--    talleres_instanciar_edicion (20260926171945_talleres_instanciar_
--    edicion.sql).
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_cupo_edicion_calculo(p_edicion_id uuid)
RETURNS TABLE (cupo integer, ocupados integer, disponibles integer, sobre_cupo integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_cupo integer;
  v_ocupados integer;
  v_sobre_cupo integer;
BEGIN
  -- cupo = sum of capacidad of the edicion's non-cancelled taller_grupos.
  -- 0 when the edicion has no grupos yet (or all are cancelled) — this
  -- migration's convention for "sin cupo definido" (no limit): documented
  -- on the RPC below and read that way by the app (T6, item 6).
  SELECT COALESCE(SUM(g.capacidad), 0)::integer INTO v_cupo
  FROM public.taller_grupos g
  JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
  WHERE c.taller_id = p_edicion_id
    AND g.estado <> 'cancelado';

  -- ocupados = inscripciones in an accepted state (pendiente or aprobado —
  -- see this file's header for why). sobre_cupo = how many of those were
  -- explicitly placed above cupo.
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE i.estado IN ('pendiente', 'aprobado')), 0)::integer,
    COALESCE(COUNT(*) FILTER (WHERE i.sobre_cupo), 0)::integer
  INTO v_ocupados, v_sobre_cupo
  FROM public.taller_inscripciones i
  JOIN public.talleres_crecimiento_cohortes c ON c.id = i.cohorte_id
  WHERE c.taller_id = p_edicion_id;

  RETURN QUERY SELECT v_cupo, v_ocupados, GREATEST(v_cupo - v_ocupados, 0), v_sobre_cupo;
END;
$function$;

COMMENT ON FUNCTION public.talleres_cupo_edicion_calculo(uuid) IS
  'T6 internal aggregate (no authority check) shared by talleres_cupo_edicion and the cupo gate trigger. Not granted to authenticated — call talleres_cupo_edicion instead.';

REVOKE ALL ON FUNCTION public.talleres_cupo_edicion_calculo(uuid) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- C. talleres_cupo_edicion(uuid) — public RPC, authority = "anyone who can
--    SELECT the edicion". DECISION: SECURITY DEFINER re-checking the exact
--    live taller_ediciones_select predicate (verbatim, verified against
--    staging pg_policy above), NOT invoker. Running this as invoker would
--    undercount ocupados/sobre_cupo for a plain self-enroll participant
--    (taller_inscripciones_select only shows them their OWN row, and
--    taller_grupos has no public read policy at all) — exactly the
--    audience (Explorar, "cupo completo") that most needs an accurate
--    count while holding no coordinator/director capability at all.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_cupo_edicion(p_edicion_id uuid)
RETURNS TABLE (cupo integer, ocupados integer, disponibles integer, sobre_cupo integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.taller_ediciones te
    WHERE te.id = p_edicion_id
      AND (
        public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read'::text, public.talleres_equipo_de_edicion(te.id))
        OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, public.talleres_equipo_de_edicion(te.id))
        OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, public.talleres_equipo_de_edicion(te.id))
        OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read'::text, public.talleres_equipo_de_edicion(te.id))
        OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read'::text, public.talleres_equipo_de_edicion(te.id))
        OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read'::text, public.talleres_equipo_de_edicion(te.id))
        OR (auth.uid() IS NOT NULL AND public.talleres_estado_efectivo(te.*) = ANY (ARRAY['abierto'::text, 'en_curso'::text]))
      )
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_edicion' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT * FROM public.talleres_cupo_edicion_calculo(p_edicion_id);
END;
$function$;

COMMENT ON FUNCTION public.talleres_cupo_edicion(uuid) IS
  'T6 (talleres-temporadas-y-ediciones) - cupo/ocupados/disponibles/sobre_cupo for an edicion. cupo=0 means "sin cupo definido" (no limit), not zero seats. Authority mirrors taller_ediciones_select verbatim.';

GRANT EXECUTE ON FUNCTION public.talleres_cupo_edicion(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.talleres_cupo_edicion(uuid) FROM PUBLIC, anon;

-- ===========================================================================
-- D. The gate — BEFORE INSERT trigger on taller_inscripciones. Applies to
--    EVERY insert path (self-enroll RLS branch AND the coordinator/
--    director/admin write RLS branch alike) unless the row itself already
--    carries sobre_cupo = true, which only talleres_inscribir_sobre_cupo
--    (part E) ever sets. A row that would not occupy a seat anyway
--    (estado NOT IN pendiente/aprobado — e.g. inserting a pre-retired or
--    pre-rejected record directly) never needs the override and is never
--    gated.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_inscripciones_cupo_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_calculo record;
BEGIN
  IF NEW.sobre_cupo THEN
    RETURN NEW;
  END IF;

  IF NEW.estado NOT IN ('pendiente', 'aprobado') THEN
    RETURN NEW;
  END IF;

  -- NEW.taller_id is the edicion id (taller_inscripciones.taller_id FKs to
  -- taller_ediciones(id) — a long-standing naming quirk of this table, see
  -- this feature's own docs). The aggregate below counts rows already in
  -- the table, so it correctly excludes NEW (BEFORE INSERT semantics).
  SELECT * INTO v_calculo FROM public.talleres_cupo_edicion_calculo(NEW.taller_id);

  IF v_calculo.cupo > 0 AND v_calculo.ocupados >= v_calculo.cupo THEN
    RAISE EXCEPTION 'CUPO_LLENO' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.talleres_inscripciones_cupo_gate() IS
  'T6 - BEFORE INSERT gate on taller_inscripciones: raises P0001 CUPO_LLENO when the edicion has a defined cupo (>0) that is already full and the new row does not carry sobre_cupo = true.';

DROP TRIGGER IF EXISTS trg_taller_inscripciones_cupo ON public.taller_inscripciones;
CREATE TRIGGER trg_taller_inscripciones_cupo
  BEFORE INSERT ON public.taller_inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.talleres_inscripciones_cupo_gate();

-- ===========================================================================
-- E. talleres_inscribir_sobre_cupo(uuid, uuid) — the director/coordinator/
--    admin override. Authority scoped to the edicion's own node
--    (talleres_equipo_de_edicion), mirroring the write branch of the live
--    taller_inscripciones_insert policy (director.write/coordinator.write/
--    admin.manage). Mirrors explorar/actions.ts's self-enroll insert shape
--    (taller_id, cohorte_id, persona_principal_id, estado) since no
--    existing coordinator-enrolment RPC was found (grepped supabase/
--    migrations for `talleres_inscribir` — no hits before this file);
--    estado stays 'pendiente' so a sobre-cupo placement enters the exact
--    same downstream review/grupo-assignment pipeline as every other new
--    inscripcion, rather than forking the state machine.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_inscribir_sobre_cupo(
  p_edicion_id uuid,
  p_persona_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor_id uuid;
  v_equipo_id uuid;
  v_cohorte_id uuid;
  v_inscripcion_id uuid;
  v_calculo record;
BEGIN
  SELECT u.id INTO v_actor_id FROM public.usuarios u WHERE u.auth_id = auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  v_equipo_id := public.talleres_equipo_de_edicion(p_edicion_id);
  IF v_equipo_id IS NULL THEN
    RAISE EXCEPTION 'EDICION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write'::text, v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_cohorte_id
  FROM public.talleres_crecimiento_cohortes
  WHERE taller_id = p_edicion_id
  ORDER BY created_at
  LIMIT 1;
  IF v_cohorte_id IS NULL THEN
    RAISE EXCEPTION 'EDICION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.taller_inscripciones
    WHERE taller_id = p_edicion_id
      AND cohorte_id = v_cohorte_id
      AND persona_principal_id = p_persona_id
  ) THEN
    RAISE EXCEPTION 'YA_INSCRITO' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.taller_inscripciones (
    taller_id, cohorte_id, persona_principal_id, estado,
    sobre_cupo, sobre_cupo_por, sobre_cupo_en
  ) VALUES (
    p_edicion_id, v_cohorte_id, p_persona_id, 'pendiente',
    true, v_actor_id, now()
  )
  RETURNING id INTO v_inscripcion_id;

  SELECT * INTO v_calculo FROM public.talleres_cupo_edicion_calculo(p_edicion_id);

  RETURN jsonb_build_object(
    'inscripcion_id', v_inscripcion_id,
    'cupo', v_calculo.cupo,
    'ocupados', v_calculo.ocupados,
    'sobre_cupo', v_calculo.sobre_cupo
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_inscribir_sobre_cupo(uuid, uuid) IS
  'T6 (talleres-temporadas-y-ediciones) - director/coordinator/admin places a persona in an edicion above its cupo, recording who and when. Bypasses trg_taller_inscripciones_cupo via sobre_cupo = true. Raises 42501 sin_permisos_para_este_taller / P0002 EDICION_NOT_FOUND / P0001 YA_INSCRITO.';

GRANT EXECUTE ON FUNCTION public.talleres_inscribir_sobre_cupo(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.talleres_inscribir_sobre_cupo(uuid, uuid) FROM PUBLIC, anon;

-- ===========================================================================
-- F. talleres_inscripciones_sobre_cupo_personas(uuid[]) — resolves the
--    sobre_cupo_por name for the inscritos table's "Sobre el cupo" badge
--    tooltip, WITHOUT a raw usuarios embed (usuarios RLS would hide the
--    name from a scoped coordinator/director the same way bug #3 did for
--    persona_principal_id — see talleres_coord_inscripciones_personas,
--    20260823000001). A NEW small function rather than widening that
--    heavily-reused one (grants/asignar-grupo/admin-inscripciones/
--    pendientes/grupo-detalle callers, plus its own dedicated test suite)
--    — same re-check-the-select-policy pattern, narrow blast radius.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_inscripciones_sobre_cupo_personas(
  p_inscripcion_ids uuid[]
)
RETURNS TABLE (
  inscripcion_id uuid,
  sobre_cupo_por_nombre text,
  sobre_cupo_por_apellido text,
  sobre_cupo_en timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id                AS inscripcion_id,
    u.nombre            AS sobre_cupo_por_nombre,
    u.apellido          AS sobre_cupo_por_apellido,
    i.sobre_cupo_en
  FROM public.taller_inscripciones i
  LEFT JOIN public.usuarios u ON u.id = i.sobre_cupo_por
  WHERE i.id = ANY (p_inscripcion_ids)
    AND i.sobre_cupo = true
    -- Mirror of the live taller_inscripciones_select (verbatim terms,
    -- fail-closed), same pattern as talleres_coord_inscripciones_personas.
    AND (
      i.persona_principal_id IN (
        SELECT usuarios.id FROM public.usuarios WHERE usuarios.auth_id = auth.uid()
      )
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read'::text, public.talleres_equipo_de_cohorte(i.cohorte_id))
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, public.talleres_equipo_de_cohorte(i.cohorte_id))
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, public.talleres_equipo_de_cohorte(i.cohorte_id))
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read'::text, public.talleres_equipo_de_cohorte(i.cohorte_id))
      OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read'::text, public.talleres_equipo_de_cohorte(i.cohorte_id))
      OR public.talleres_es_miembro_del_grupo(i.grupo_id)
    );
$$;

COMMENT ON FUNCTION public.talleres_inscripciones_sobre_cupo_personas(uuid[]) IS
  'T6 - resolves sobre_cupo_por''s display name for the inscritos table badge tooltip, re-applying taller_inscripciones_select (fail-closed) instead of a raw usuarios embed.';

GRANT EXECUTE ON FUNCTION public.talleres_inscripciones_sobre_cupo_personas(uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.talleres_inscripciones_sobre_cupo_personas(uuid[]) FROM PUBLIC, anon;
