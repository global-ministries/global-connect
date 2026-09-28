-- T7 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — hardening
-- round after an independent reviewer's pass over 1ea5c31..HEAD. Fixes 13
-- defects across the four paso-6 migrations (20260928100000/110000/120000/
-- 130000). Every function/policy/trigger below is verified against its
-- LIVE definition on staging before being touched here (pg_get_functiondef/
-- pg_policies/pg_trigger) — see this task's own delegation report for the
-- exact queries. No table is dropped; Grupos de Vida (grupos, grupo_
-- miembros, segmento_lideres, roles_sistema, usuario_roles, temporadas) is
-- not referenced anywhere in this file.
--
-- ───────────────────────────────────────────────────────────────────────
-- 1. Self-enroll can forge sobre_cupo.
--    (a) taller_inscripciones_insert's self-enroll WITH CHECK branch gains
--        `AND sobre_cupo = false AND sobre_cupo_por IS NULL` — every other
--        term is copied byte-for-byte from the live pg_get_expr() output.
--    (b) talleres_inscripciones_cupo_gate: a row carrying sobre_cupo=true
--        now requires the transaction-local session flag
--        talleres.sobre_cupo_autorizado='1', else P0001
--        SOBRE_CUPO_NO_AUTORIZADO. talleres_inscribir_sobre_cupo sets that
--        flag right before its own INSERT — the only place that is allowed
--        to.
-- 2. taller_ediciones.temporada_id was never guarded: a director could
--    UPDATE an edicion they own to point at ANY temporada, including one
--    outside their own tree. New trigger
--    trg_taller_ediciones_temporada_misma_direccion (BEFORE INSERT OR
--    UPDATE OF temporada_id) reuses the exact ancestor walk
--    trg_talleres_temporada_talleres_misma_direccion already used, now
--    factored into a shared helper, talleres_nodo_en_arbol(p_nodo, p_raiz).
-- 3. talleres_crear_edicion / talleres_agregar_taller_a_temporada /
--    talleres_instanciar_edicion (when p_temporada_id is given) now refuse
--    a temporada whose estado is not 'borrador' or 'abierto' with P0001
--    TEMPORADA_NO_DISPONIBLE. Authority is unchanged (still scoped exactly
--    as each function already scoped it before this migration).
-- 4. open_edicion loses its EXECUTE grant for authenticated — every path
--    that creates an edicion for a real user now goes through
--    talleres_crear_edicion / the temporada RPCs, which apply the T1-T7
--    rules (dates, temporada state, …) that open_edicion's 11-arg legacy
--    surface never enforced. postgres/service_role keep EXECUTE so the
--    legacy SQL suites (which call it as postgres) keep working — see the
--    accompanying test-file edits for the 3 call sites that ran it as
--    authenticated and now run it as postgres instead.
-- 5. create_taller_abstract never set `regimen`: since it defaulted to
--    'temporada' on every insert, trg_talleres_modalidad_default_mirror
--    (T1) silently overwrote whatever p_modalidad_default the caller
--    passed back to 'periodo_general'. New optional p_regimen (wins when
--    given; otherwise derived from p_modalidad_default) is set explicitly
--    on the INSERT — arity changes 6→7 args, so the old signature is
--    DROPped first (same "extend by DROP+CREATE" pattern open_edicion's
--    own history already used for PR46's temporada_id).
-- 6. Cupo gate hardening: pg_advisory_xact_lock(hashtext('talleres_cupo:'
--    || edicion_id)) serializes concurrent attempts against the same
--    edicion before counting; the trigger becomes BEFORE INSERT OR UPDATE
--    OF estado so an UPDATE that moves a row INTO an occupying estado
--    (e.g. retirado → pendiente) is gated exactly like an INSERT already
--    was — a transition that was ALREADY occupying (e.g. aprobado →
--    pendiente) is not re-gated.
-- 7. Seats/pareja: talleres_cupo_edicion gains `unidad` ('personas' |
--    'parejas', from the edicion's own tipo) so the UI can say "N de M
--    parejas" instead of a bare number — the underlying accounting was
--    already 1 inscripcion = 1 seat (a pareja is one row), nothing to fix
--    there. talleres_cupo_edicion_calculo's own sobre_cupo count now
--    excludes retirado/no_aprobado rows, same as the ocupados count
--    already did.
-- 8. talleres_inscribir_sobre_cupo gains p_companero_id (stored like
--    self-enroll does: companero_id + the edicion's own link_type, only
--    when the edicion is tipo=pareja — P0001 COMPANERO_REQUERIDO
--    otherwise), refuses P0001 EDICION_NO_ABIERTA when the edicion's
--    effective state is not abierto/en_curso, and only actually sets
--    sobre_cupo=true when the edicion is full AT INSERT TIME (a normal
--    insert with sobre_cupo=false otherwise) — arity changes 2→3 args,
--    DROP+CREATE, same reasoning as item 5.
-- 9. talleres_crear_temporada de-duplicates p_taller_ids (SELECT DISTINCT
--    unnest) and gains the same EDICION_YA_EXISTE guard inside its own
--    per-taller loop that talleres_agregar_taller_a_temporada already has.
-- 10. talleres_crear_edicion: p_adelantar := COALESCE(p_adelantar, 0)
--     before the range checks — an explicit NULL used to silently produce
--     zero ediciones (0..NULL is an empty range) instead of one.
-- 11. talleres_instanciar_edicion's derived "<Mes> <Año>" name now also
--     checks the taller's own EXISTING non-cancelled ediciones (not just
--     siblings created within the same talleres_crear_edicion call) and
--     appends the day on a collision — covers two SEPARATE calls landing
--     in the same month, which talleres_crear_edicion's own within-call
--     v_nombres_usados array could never see.
-- 12. New talleres_hoy() (STABLE, app.zona_horaria setting, fallback
--     America/Caracas) replaces CURRENT_DATE inside
--     talleres_estado_efectivo(taller_ediciones) — the only live function
--     body across the four migrations that used the server's own TZ for
--     this derivation (the historical one-time backfill's own CURRENT_DATE
--     uses are data migration statements already applied, not touched).
--
-- SAFETY: additive/replacing only. No DELETE/TRUNCATE/DROP TABLE. The two
-- DROP FUNCTION statements below (create_taller_abstract, talleres_
-- inscribir_sobre_cupo) each immediately CREATE a replacement with the
-- same name; every other object is CREATE OR REPLACE / DROP+CREATE
-- TRIGGER on its own unchanged table.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.talleres_inscribir_sobre_cupo(uuid, uuid, uuid);
--   Re-apply 20260928130000_talleres_cupo.sql's own CREATE OR REPLACE for
--     talleres_inscribir_sobre_cupo/talleres_cupo_edicion_calculo, and DROP
--     FUNCTION public.talleres_cupo_edicion(uuid) then re-apply its 20260928130000
--     4-column CREATE.
--   DROP FUNCTION IF EXISTS public.create_taller_abstract(text, text, text, text, uuid, uuid, text);
--   Re-apply 20260918220000_talleres_scoped_functions.sql's own
--     CREATE OR REPLACE FUNCTION public.create_taller_abstract(...) (6-arg).
--   GRANT EXECUTE ON FUNCTION public.open_edicion(uuid, text, text, text, integer, integer, text, timestamptz, timestamptz, jsonb, uuid) TO authenticated;
--   Re-apply 20260928100000/110000/120000/130000's own CREATE OR REPLACE
--     for talleres_estado_efectivo(taller_ediciones), talleres_crear_edicion,
--     talleres_instanciar_edicion, talleres_crear_temporada,
--     talleres_agregar_taller_a_temporada, talleres_inscripciones_cupo_gate,
--     talleres_temporada_talleres_valida_direccion, and re-apply T1's own
--     CREATE POLICY taller_inscripciones_insert.
--   DROP TRIGGER IF EXISTS trg_taller_ediciones_temporada_misma_direccion ON public.taller_ediciones;
--   DROP FUNCTION IF EXISTS public.talleres_taller_ediciones_valida_direccion_temporada();
--   DROP FUNCTION IF EXISTS public.talleres_nodo_en_arbol(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.talleres_hoy();
--   DROP TRIGGER trg_taller_inscripciones_cupo ON public.taller_inscripciones;
--     CREATE TRIGGER trg_taller_inscripciones_cupo BEFORE INSERT ON public.taller_inscripciones FOR EACH ROW EXECUTE FUNCTION public.talleres_inscripciones_cupo_gate();

-- ═══════════════════════════════════════════════════════════════════════
-- Item 12: talleres_hoy() — timezone-aware "today", used by the estado
-- derivation instead of the server's own CURRENT_DATE.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.talleres_hoy()
RETURNS date
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT (now() AT TIME ZONE COALESCE(NULLIF(current_setting('app.zona_horaria', true), ''), 'America/Caracas'))::date;
$$;

COMMENT ON FUNCTION public.talleres_hoy() IS
  'Today''s date in the church''s own configured time zone (the "app.zona_horaria" session/database setting), falling back to America/Caracas when that setting is unset or empty. Use this instead of CURRENT_DATE (the DB server''s own TZ, usually UTC) anywhere a "today" comparison should match the timezone people actually operate in — talleres_estado_efectivo is the first caller (T7 hardening, odd/tasks/talleres-temporadas-y-ediciones.md).';

REVOKE ALL ON FUNCTION public.talleres_hoy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_hoy() TO authenticated, postgres, service_role;

-- talleres_estado_efectivo(taller_ediciones): same body as
-- 20260928100000's part C, except CURRENT_DATE -> talleres_hoy() in the
-- two live comparisons (the historical backfill's own CURRENT_DATE use,
-- in that same migration, is a one-time data statement already applied
-- and is not touched).
CREATE OR REPLACE FUNCTION public.talleres_estado_efectivo(p_edicion public.taller_ediciones)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_edicion.estado IN ('borrador', 'cancelado') THEN p_edicion.estado
    WHEN p_edicion.fecha_inicio IS NULL
      OR p_edicion.fecha_fin IS NULL
      OR p_edicion.cierre_inscripcion IS NULL THEN p_edicion.estado
    WHEN public.talleres_hoy() < p_edicion.cierre_inscripcion THEN 'abierto'
    WHEN p_edicion.fecha_inicio <= public.talleres_hoy() AND public.talleres_hoy() <= p_edicion.fecha_fin THEN 'en_curso'
    ELSE 'cerrado'
  END;
$$;

COMMENT ON FUNCTION public.talleres_estado_efectivo(public.taller_ediciones) IS
  'Derives an edicion''s effective estado from its own dates (docs/talleres-de-punta-a-punta.md §5), using talleres_hoy() (T7 hardening) instead of the server''s own CURRENT_DATE. Pure computation over the passed row, no table access — safe to call on the row being evaluated inside taller_ediciones_select itself.';

-- ═══════════════════════════════════════════════════════════════════════
-- Item 2: taller_ediciones.temporada_id guard. Factor the ancestor walk
-- trg_talleres_temporada_talleres_misma_direccion already used into a
-- shared helper, and reuse it from a NEW trigger on taller_ediciones.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.talleres_nodo_en_arbol(p_nodo uuid, p_raiz uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE ancestros AS (
    SELECT e.id, e.parent_equipo_id, 1 AS profundidad
    FROM public.dream_team_equipos e
    WHERE e.id = p_nodo
    UNION ALL
    SELECT p.id, p.parent_equipo_id, a.profundidad + 1
    FROM public.dream_team_equipos p
    JOIN ancestros a ON p.id = a.parent_equipo_id
    WHERE a.profundidad < 16
  )
  SELECT EXISTS (SELECT 1 FROM ancestros WHERE id = p_raiz);
$function$;

COMMENT ON FUNCTION public.talleres_nodo_en_arbol(uuid, uuid) IS
  'True when p_raiz is p_nodo itself or one of its ancestors (walks UP from p_nodo via parent_equipo_id, depth < 16). Shared by trg_talleres_temporada_talleres_misma_direccion and trg_taller_ediciones_temporada_misma_direccion (T7 hardening, odd/tasks/talleres-temporadas-y-ediciones.md) so "this node hangs off that dirección''s tree" is checked in exactly one place.';

REVOKE ALL ON FUNCTION public.talleres_nodo_en_arbol(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_nodo_en_arbol(uuid, uuid) TO postgres, service_role;

-- Re-point the existing junction trigger function at the shared helper.
-- Same signature (trigger functions take none) — CREATE OR REPLACE in
-- place, no DROP needed.
CREATE OR REPLACE FUNCTION public.talleres_temporada_talleres_valida_direccion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_taller_equipo    uuid;
  v_temporada_equipo uuid;
BEGIN
  SELECT t.dream_team_equipo_id INTO v_taller_equipo
  FROM public.talleres t WHERE t.id = NEW.taller_id;

  SELECT tp.dream_team_equipo_id INTO v_temporada_equipo
  FROM public.talleres_temporadas tp WHERE tp.id = NEW.temporada_id;

  IF NOT public.talleres_nodo_en_arbol(v_taller_equipo, v_temporada_equipo) THEN
    RAISE EXCEPTION 'TALLER_FUERA_DE_LA_DIRECCION' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.talleres_temporada_talleres_valida_direccion() IS
  'The taller''s own dream_team_equipo_id must be the temporada''s node or a descendant of it (talleres_nodo_en_arbol, T7 hardening). P0001 TALLER_FUERA_DE_LA_DIRECCION otherwise. SECURITY DEFINER: reads talleres/talleres_temporadas/dream_team_equipos regardless of the caller''s own RLS visibility on those tables.';

-- NEW: the same guard, directly on taller_ediciones.temporada_id — closes
-- the gap where a director could UPDATE their own edicion's temporada_id
-- to point outside their tree without ever touching the junction table.
CREATE OR REPLACE FUNCTION public.talleres_taller_ediciones_valida_direccion_temporada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_taller_equipo    uuid;
  v_temporada_equipo uuid;
BEGIN
  IF NEW.temporada_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.dream_team_equipo_id INTO v_taller_equipo
  FROM public.talleres t WHERE t.id = NEW.taller_id;

  SELECT tp.dream_team_equipo_id INTO v_temporada_equipo
  FROM public.talleres_temporadas tp WHERE tp.id = NEW.temporada_id;

  IF NOT public.talleres_nodo_en_arbol(v_taller_equipo, v_temporada_equipo) THEN
    RAISE EXCEPTION 'TALLER_FUERA_DE_LA_DIRECCION' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.talleres_taller_ediciones_valida_direccion_temporada() IS
  'T7 hardening (odd/tasks/talleres-temporadas-y-ediciones.md, item 2): when NEW.temporada_id is set, the edicion''s own taller must hang off that temporada''s node or a descendant of it (talleres_nodo_en_arbol). P0001 TALLER_FUERA_DE_LA_DIRECCION otherwise. Fires on INSERT (talleres_instanciar_edicion already passes this trivially, since the junction trigger enforces the same rule) and on UPDATE OF temporada_id (previously unguarded).';

DROP TRIGGER IF EXISTS trg_taller_ediciones_temporada_misma_direccion ON public.taller_ediciones;
CREATE TRIGGER trg_taller_ediciones_temporada_misma_direccion
  BEFORE INSERT OR UPDATE OF temporada_id ON public.taller_ediciones
  FOR EACH ROW
  EXECUTE FUNCTION public.talleres_taller_ediciones_valida_direccion_temporada();

-- ═══════════════════════════════════════════════════════════════════════
-- Item 1: self-enroll sobre_cupo forgery.
-- ═══════════════════════════════════════════════════════════════════════

-- (a) taller_inscripciones_insert — byte-for-byte copy of the live policy
-- (verified via pg_get_expr before writing this file) except for the one
-- addition inside the self-enroll OR-branch.
DROP POLICY IF EXISTS taller_inscripciones_insert ON public.taller_inscripciones;
CREATE POLICY taller_inscripciones_insert ON public.taller_inscripciones
FOR INSERT
WITH CHECK (
  auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_cohorte(cohorte_id))
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.director.write'::text, talleres_equipo_de_cohorte(cohorte_id))
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, talleres_equipo_de_cohorte(cohorte_id))
  OR (
    estado = 'pendiente'::text
    AND sobre_cupo = false
    AND sobre_cupo_por IS NULL
    AND persona_principal_id IN (SELECT usuarios.id FROM usuarios WHERE usuarios.auth_id = auth.uid())
    AND (
      companero_id IS NULL
      OR (
        companero_id <> persona_principal_id
        AND EXISTS (SELECT 1 FROM usuarios u WHERE u.id = taller_inscripciones.companero_id)
        AND link_type IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM taller_ediciones te
           WHERE te.id = taller_inscripciones.taller_id
             AND te.tipo = 'pareja'::text
        )
      )
    )
    AND EXISTS (
      SELECT 1 FROM taller_ediciones te
       WHERE te.id = taller_inscripciones.taller_id
         AND talleres_estado_efectivo(te) = ANY (ARRAY['abierto'::text, 'en_curso'::text])
    )
    AND EXISTS (
      SELECT 1 FROM talleres_crecimiento_cohortes c
       WHERE c.id = taller_inscripciones.cohorte_id
         AND c.taller_id = taller_inscripciones.taller_id
    )
  )
);

-- (b) + Item 6: talleres_inscripciones_cupo_gate — sobre_cupo requires the
-- session flag; the occupancy gate itself is now serialized with an
-- advisory lock and only applies to a transition INTO an occupying estado.
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
    IF current_setting('talleres.sobre_cupo_autorizado', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'SOBRE_CUPO_NO_AUTORIZADO' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado NOT IN ('pendiente', 'aprobado') THEN
    RETURN NEW;
  END IF;

  -- Item 6: an UPDATE that keeps the row in an already-occupying estado
  -- (e.g. aprobado -> pendiente) never needs re-gating; only a transition
  -- INTO an occupying estado does (INSERT always counts as one, since
  -- there is no OLD row).
  IF TG_OP = 'UPDATE' AND OLD.estado IN ('pendiente', 'aprobado') THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent attempts against the SAME edicion so two
  -- simultaneous inserts/updates can't both read "one seat free" and both
  -- commit (NEW.taller_id is the edicion id — see this table's own
  -- long-standing naming quirk, documented in 20260928130000's header).
  PERFORM pg_advisory_xact_lock(hashtext('talleres_cupo:' || NEW.taller_id::text));

  SELECT * INTO v_calculo FROM public.talleres_cupo_edicion_calculo(NEW.taller_id);

  IF v_calculo.cupo > 0 AND v_calculo.ocupados >= v_calculo.cupo THEN
    RAISE EXCEPTION 'CUPO_LLENO' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.talleres_inscripciones_cupo_gate() IS
  'T7 hardening — BEFORE INSERT OR UPDATE OF estado gate on taller_inscripciones: raises P0001 SOBRE_CUPO_NO_AUTORIZADO when sobre_cupo=true without the talleres.sobre_cupo_autorizado session flag (only talleres_inscribir_sobre_cupo sets it); otherwise raises P0001 CUPO_LLENO when a transition INTO an occupying estado (pendiente/aprobado) would exceed a defined (>0) cupo. pg_advisory_xact_lock serializes concurrent attempts against the same edicion.';

DROP TRIGGER IF EXISTS trg_taller_inscripciones_cupo ON public.taller_inscripciones;
CREATE TRIGGER trg_taller_inscripciones_cupo
  BEFORE INSERT OR UPDATE OF estado ON public.taller_inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.talleres_inscripciones_cupo_gate();

-- ═══════════════════════════════════════════════════════════════════════
-- Item 7: talleres_cupo_edicion_calculo's sobre_cupo count excludes
-- retirado/no_aprobado (same shape as ocupados). Same signature — CREATE
-- OR REPLACE in place.
-- ═══════════════════════════════════════════════════════════════════════

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
  SELECT COALESCE(SUM(g.capacidad), 0)::integer INTO v_cupo
  FROM public.taller_grupos g
  JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
  WHERE c.taller_id = p_edicion_id
    AND g.estado <> 'cancelado';

  SELECT
    COALESCE(COUNT(*) FILTER (WHERE i.estado IN ('pendiente', 'aprobado')), 0)::integer,
    COALESCE(COUNT(*) FILTER (WHERE i.sobre_cupo AND i.estado IN ('pendiente', 'aprobado')), 0)::integer
  INTO v_ocupados, v_sobre_cupo
  FROM public.taller_inscripciones i
  JOIN public.talleres_crecimiento_cohortes c ON c.id = i.cohorte_id
  WHERE c.taller_id = p_edicion_id;

  RETURN QUERY SELECT v_cupo, v_ocupados, GREATEST(v_cupo - v_ocupados, 0), v_sobre_cupo;
END;
$function$;

COMMENT ON FUNCTION public.talleres_cupo_edicion_calculo(uuid) IS
  'T7 hardening — sobre_cupo now excludes retirado/no_aprobado rows, same as ocupados already did (a withdrawn/rejected sobre-cupo placement no longer counts as "over cupo"). Internal aggregate (no authority check), shared by talleres_cupo_edicion and the cupo gate trigger. Not granted to authenticated — call talleres_cupo_edicion instead.';

-- talleres_cupo_edicion: RETURNS TABLE shape changes (gains `unidad`), so
-- DROP FUNCTION first.
DROP FUNCTION IF EXISTS public.talleres_cupo_edicion(uuid);

CREATE FUNCTION public.talleres_cupo_edicion(p_edicion_id uuid)
RETURNS TABLE (cupo integer, ocupados integer, disponibles integer, sobre_cupo integer, unidad text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tipo text;
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

  SELECT t.tipo INTO v_tipo
  FROM public.taller_ediciones te
  JOIN public.talleres t ON t.id = te.taller_id
  WHERE te.id = p_edicion_id;

  RETURN QUERY
  SELECT c.cupo, c.ocupados, c.disponibles, c.sobre_cupo,
         CASE WHEN v_tipo = 'pareja' THEN 'parejas' ELSE 'personas' END
  FROM public.talleres_cupo_edicion_calculo(p_edicion_id) c;
END;
$function$;

COMMENT ON FUNCTION public.talleres_cupo_edicion(uuid) IS
  'T7 hardening — cupo/ocupados/disponibles/sobre_cupo/unidad for an edicion. unidad is "parejas" for a tipo=pareja edicion, "personas" otherwise (1 inscripcion already = 1 seat either way; this only makes the unit visible). cupo=0 means "sin cupo definido" (no limit), not zero seats. Authority mirrors taller_ediciones_select verbatim.';

GRANT EXECUTE ON FUNCTION public.talleres_cupo_edicion(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.talleres_cupo_edicion(uuid) FROM PUBLIC, anon;

-- ═══════════════════════════════════════════════════════════════════════
-- Item 8: talleres_inscribir_sobre_cupo gains p_companero_id, an
-- EDICION_NO_ABIERTA gate, and only actually sets sobre_cupo=true when the
-- edicion is full at insert time. Arity changes 2->3 args: DROP+CREATE.
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.talleres_inscribir_sobre_cupo(uuid, uuid);

CREATE FUNCTION public.talleres_inscribir_sobre_cupo(
  p_edicion_id uuid,
  p_persona_id uuid,
  p_companero_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor_id uuid;
  v_equipo_id uuid;
  v_edicion public.taller_ediciones%ROWTYPE;
  v_cohorte_id uuid;
  v_inscripcion_id uuid;
  v_calculo record;
  v_es_sobre_cupo boolean;
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

  SELECT * INTO v_edicion FROM public.taller_ediciones WHERE id = p_edicion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EDICION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF public.talleres_estado_efectivo(v_edicion) NOT IN ('abierto', 'en_curso') THEN
    RAISE EXCEPTION 'EDICION_NO_ABIERTA' USING ERRCODE = 'P0001';
  END IF;

  IF v_edicion.tipo = 'pareja' AND p_companero_id IS NULL THEN
    RAISE EXCEPTION 'COMPANERO_REQUERIDO' USING ERRCODE = 'P0001';
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

  SELECT * INTO v_calculo FROM public.talleres_cupo_edicion_calculo(p_edicion_id);
  v_es_sobre_cupo := v_calculo.cupo > 0 AND v_calculo.ocupados >= v_calculo.cupo;

  -- The bypass flag is transaction-local (set_config(..., true)) and is
  -- only ever read by talleres_inscripciones_cupo_gate; it is only needed
  -- (and only set) when this placement is ACTUALLY over cupo — a normal
  -- insert (edicion not full) goes through the gate exactly like any other
  -- insert and does not need it.
  IF v_es_sobre_cupo THEN
    PERFORM set_config('talleres.sobre_cupo_autorizado', '1', true);
  END IF;

  INSERT INTO public.taller_inscripciones (
    taller_id, cohorte_id, persona_principal_id, companero_id, link_type, estado,
    sobre_cupo, sobre_cupo_por, sobre_cupo_en
  ) VALUES (
    p_edicion_id, v_cohorte_id, p_persona_id,
    CASE WHEN v_edicion.tipo = 'pareja' THEN p_companero_id ELSE NULL END,
    CASE WHEN v_edicion.tipo = 'pareja' THEN v_edicion.link_type ELSE NULL END,
    'pendiente',
    v_es_sobre_cupo,
    CASE WHEN v_es_sobre_cupo THEN v_actor_id ELSE NULL END,
    CASE WHEN v_es_sobre_cupo THEN now() ELSE NULL END
  )
  RETURNING id INTO v_inscripcion_id;

  SELECT * INTO v_calculo FROM public.talleres_cupo_edicion_calculo(p_edicion_id);

  RETURN jsonb_build_object(
    'inscripcion_id', v_inscripcion_id,
    'cupo', v_calculo.cupo,
    'ocupados', v_calculo.ocupados,
    'sobre_cupo', v_es_sobre_cupo
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_inscribir_sobre_cupo(uuid, uuid, uuid) IS
  'T7 hardening — director/coordinator/admin places a persona in an edicion, recording sobre_cupo=true (with who/when) ONLY when the edicion is actually full at insert time; otherwise a normal insert. p_companero_id is required (P0001 COMPANERO_REQUERIDO) and stored like self-enroll does (companero_id + the edicion''s own link_type) when the edicion is tipo=pareja. Refuses P0001 EDICION_NO_ABIERTA unless the edicion''s effective state is abierto/en_curso. Raises 42501 sin_permisos_para_este_taller / P0002 EDICION_NOT_FOUND / P0001 YA_INSCRITO.';

GRANT EXECUTE ON FUNCTION public.talleres_inscribir_sobre_cupo(uuid, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.talleres_inscribir_sobre_cupo(uuid, uuid, uuid) FROM PUBLIC, anon;

-- ═══════════════════════════════════════════════════════════════════════
-- Items 3 + 11: talleres_instanciar_edicion gains the temporada-state
-- guard and the cross-call month-name collision check. Same signature —
-- CREATE OR REPLACE in place.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.talleres_instanciar_edicion(
  p_taller_id uuid,
  p_fecha_inicio date,
  p_temporada_id uuid,
  p_nombre text,
  p_sesiones_fallback integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_taller                   public.talleres%ROWTYPE;
  v_temporada_nombre         text;
  v_temporada_estado         text;
  v_edicion_id                uuid;
  v_event_id                  uuid;
  v_cohorte_id                 uuid;
  v_equipo_id                   uuid;
  v_pg                          RECORD;
  v_pf                          RECORD;
  v_nuevo_grupo_id               uuid;
  v_grupos_creados                jsonb := '[]'::jsonb;
  v_facilitadores_omitidos        jsonb := '[]'::jsonb;
  v_facilitadores_asignados       integer;
  v_clases_por_grupo               integer := 0;
  v_generar_resultado               jsonb;
  v_plantilla_clases_activas         integer;
  v_sesiones_snapshot                 integer;
  v_nombre                             text;
  v_fecha_fin                           date;
  v_cierre_inscripcion                  date;
  v_meses                                text[] := ARRAY[
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
BEGIN
  IF p_fecha_inicio IS NULL THEN
    RAISE EXCEPTION 'FECHA_INICIO_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_taller
  FROM public.talleres
  WHERE id = p_taller_id
    AND estado = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TALLER_NOT_FOUND_OR_INACTIVE' USING ERRCODE = 'P0002';
  END IF;

  v_equipo_id := v_taller.dream_team_equipo_id;
  IF v_equipo_id IS NULL THEN
    RAISE EXCEPTION 'TALLER_MISSING_EQUIPO: %', p_taller_id USING ERRCODE = 'P0002';
  END IF;

  IF p_temporada_id IS NOT NULL THEN
    SELECT nombre, estado INTO v_temporada_nombre, v_temporada_estado
    FROM public.talleres_temporadas
    WHERE id = p_temporada_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TEMPORADA_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    -- Item 3 (T7 hardening): a temporada that is already cerrado/cancelado
    -- can no longer receive a fresh edicion, from any caller.
    IF v_temporada_estado NOT IN ('borrador', 'abierto') THEN
      RAISE EXCEPTION 'TEMPORADA_NO_DISPONIBLE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT count(*) INTO v_plantilla_clases_activas
    FROM public.taller_plantilla_clases
   WHERE taller_id = p_taller_id AND activo = true;
  v_sesiones_snapshot := CASE WHEN v_plantilla_clases_activas > 0
                               THEN v_plantilla_clases_activas
                               ELSE COALESCE(p_sesiones_fallback, 1) END;

  v_fecha_fin := p_fecha_inicio + ((v_sesiones_snapshot - 1) * v_taller.cadencia_dias);
  v_cierre_inscripcion := p_fecha_inicio + v_taller.cierre_inscripcion_offset_dias;

  v_nombre := COALESCE(
    NULLIF(btrim(p_nombre), ''),
    v_temporada_nombre,
    v_meses[EXTRACT(MONTH FROM p_fecha_inicio)::integer] || ' ' || EXTRACT(YEAR FROM p_fecha_inicio)::text
  );

  -- Item 11 (T7 hardening): a derived "<Mes> <Año>" name can collide not
  -- only within one talleres_crear_edicion call (handled there via its own
  -- v_nombres_usados array) but ACROSS separate calls over time — check
  -- this taller's own existing non-cancelled ediciones for the same name
  -- and append the day when taken. Guarded to the derived-name branch
  -- only: an explicit p_nombre or a temporada name is never "collision"
  -- material (a temporada already forbids a second edicion of this same
  -- taller in it).
  IF NULLIF(btrim(p_nombre), '') IS NULL AND v_temporada_nombre IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.taller_ediciones te2
       WHERE te2.taller_id = p_taller_id
         AND te2.nombre_snapshot = v_nombre
         AND public.talleres_estado_efectivo(te2) <> 'cancelado'
    ) THEN
      v_nombre := v_nombre || ' (' || to_char(p_fecha_inicio, 'DD') || ')';
    END IF;
  END IF;

  INSERT INTO public.operating_core_events (
    kind, estado, title, start_date, visibility_scope, metadata
  ) VALUES (
    'workshop', 'active', v_nombre,
    to_char(p_fecha_inicio, 'YYYY-MM-DD'),
    'talleres_crecimiento',
    jsonb_build_object(
      'taller_tipo', v_taller.tipo,
      'taller_edicion', v_nombre,
      'taller_link_type', v_taller.vinculo,
      'modalidad_inscripcion', v_taller.modalidad_default,
      'taller_id', p_taller_id,
      'created_via', 'talleres_instanciar_edicion'
    )
  )
  RETURNING id INTO v_event_id;

  INSERT INTO public.taller_ediciones (
    operating_core_event_id, tipo, link_type, modalidad_inscripcion,
    estado, nombre_snapshot, sesiones_snapshot, duracion_estimada_minutos_snapshot,
    modalidad_inscripcion_snapshot, taller_id, temporada_id,
    fecha_inicio, fecha_fin, cierre_inscripcion
  ) VALUES (
    v_event_id, v_taller.tipo, v_taller.vinculo, v_taller.modalidad_default,
    'borrador', v_nombre, v_sesiones_snapshot, COALESCE(v_taller.duracion_minutos, 60),
    v_taller.modalidad_default, p_taller_id, p_temporada_id,
    p_fecha_inicio, v_fecha_fin, v_cierre_inscripcion
  )
  RETURNING id INTO v_edicion_id;

  INSERT INTO public.talleres_crecimiento_cohortes (
    taller_id, dream_team_equipo_id, edicion, started_at, ended_at
  ) VALUES (
    v_edicion_id, v_equipo_id, v_nombre, p_fecha_inicio::timestamptz, NULL
  )
  RETURNING id INTO v_cohorte_id;

  IF p_temporada_id IS NOT NULL THEN
    INSERT INTO public.talleres_temporada_talleres (temporada_id, taller_id)
    VALUES (p_temporada_id, p_taller_id)
    ON CONFLICT (temporada_id, taller_id) DO NOTHING;
  END IF;

  FOR v_pg IN
    SELECT id, nombre, capacidad
      FROM public.taller_plantilla_grupos
     WHERE taller_id = p_taller_id AND activo = true
     ORDER BY orden
  LOOP
    INSERT INTO public.taller_grupos (cohorte_id, nombre, capacidad, estado)
    VALUES (v_cohorte_id, v_pg.nombre, v_pg.capacidad, 'activo')
    RETURNING id INTO v_nuevo_grupo_id;

    v_facilitadores_asignados := 0;

    FOR v_pf IN
      SELECT pf.persona_id, pf.rol, u.nombre, u.apellido
        FROM public.taller_plantilla_facilitadores pf
        JOIN public.usuarios u ON u.id = pf.persona_id
       WHERE pf.plantilla_grupo_id = v_pg.id
       ORDER BY pf.created_at
    LOOP
      IF public.talleres_es_servidor_activo_del_taller(p_taller_id, v_pf.persona_id) THEN
        INSERT INTO public.taller_grupo_asignaciones (grupo_id, persona_id, rol)
        VALUES (v_nuevo_grupo_id, v_pf.persona_id, v_pf.rol);

        v_facilitadores_asignados := v_facilitadores_asignados + 1;
      ELSE
        v_facilitadores_omitidos := v_facilitadores_omitidos || jsonb_build_object(
          'persona_id', v_pf.persona_id,
          'nombre', v_pf.nombre,
          'apellido', v_pf.apellido,
          'plantilla_grupo', v_pg.nombre
        );
      END IF;
    END LOOP;

    INSERT INTO public.taller_reportes (grupo_id, estado, observaciones_generales)
    VALUES (v_nuevo_grupo_id, 'borrador', 'Reporte generado automáticamente al abrir la edición.');

    v_generar_resultado := public.generate_taller_sesiones(v_nuevo_grupo_id);
    v_clases_por_grupo := COALESCE((v_generar_resultado ->> 'total')::integer, 0);

    v_grupos_creados := v_grupos_creados || jsonb_build_object(
      'grupo_id', v_nuevo_grupo_id,
      'nombre', v_pg.nombre,
      'facilitadores_asignados', v_facilitadores_asignados
    );
  END LOOP;

  RETURN jsonb_build_object(
    'taller_id', p_taller_id,
    'edicion_id', v_edicion_id,
    'event_id', v_event_id,
    'periodo_id', NULL,
    'cohorte_id', v_cohorte_id,
    'temporada_id', p_temporada_id,
    'estado', 'borrador',
    'grupos_creados', v_grupos_creados,
    'facilitadores_omitidos', v_facilitadores_omitidos,
    'clases_por_grupo', v_clases_por_grupo,
    'nombre', v_nombre,
    'fecha_inicio', p_fecha_inicio,
    'fecha_fin', v_fecha_fin,
    'cierre_inscripcion', v_cierre_inscripcion
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_instanciar_edicion(uuid, date, uuid, text, integer) IS
  'T7 hardening — adds the temporada-state guard (P0001 TEMPORADA_NO_DISPONIBLE when p_temporada_id is given and that temporada is not borrador/abierto) and a cross-call month-name collision check for the derived "<Mes> <Año>" name. Internal instantiation core: no EXECUTE for anon/PUBLIC/authenticated — callable only from another SECURITY DEFINER function owned by postgres (open_edicion, talleres_crear_edicion, the temporada RPCs). Callers are responsible for their OWN authority check before calling this.';

-- ═══════════════════════════════════════════════════════════════════════
-- Items 3 + 10: talleres_crear_edicion gains the temporada-state guard and
-- COALESCEs p_adelantar before the range checks. Same signature — CREATE
-- OR REPLACE in place.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.talleres_crear_edicion(
  p_taller_id uuid,
  p_fecha_inicio date DEFAULT NULL,
  p_temporada_id uuid DEFAULT NULL,
  p_adelantar integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_taller          public.talleres%ROWTYPE;
  v_equipo_id       uuid;
  v_temporada       public.talleres_temporadas%ROWTYPE;
  v_resultado       jsonb;
  v_ediciones       jsonb := '[]'::jsonb;
  v_nombres_usados  text[] := ARRAY[]::text[];
  v_nombre_final    text;
  v_fecha_i         date;
  v_i               integer;
BEGIN
  SELECT * INTO v_taller
  FROM public.talleres
  WHERE id = p_taller_id
    AND estado = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TALLER_NOT_FOUND_OR_INACTIVE' USING ERRCODE = 'P0002';
  END IF;
  v_equipo_id := v_taller.dream_team_equipo_id;

  IF NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  -- Item 10 (T7 hardening): an explicit NULL used to make 0..NULL an empty
  -- range below, silently creating zero ediciones instead of one.
  p_adelantar := COALESCE(p_adelantar, 0);

  IF v_taller.regimen = 'temporada' THEN
    IF p_temporada_id IS NULL THEN
      RAISE EXCEPTION 'TEMPORADA_REQUERIDA' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_temporada
    FROM public.talleres_temporadas
    WHERE id = p_temporada_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TEMPORADA_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- Item 3 (T7 hardening): authority stays on the taller's own node
    -- (unchanged above) — this only checks the temporada is still
    -- available to receive a new edicion.
    IF v_temporada.estado NOT IN ('borrador', 'abierto') THEN
      RAISE EXCEPTION 'TEMPORADA_NO_DISPONIBLE' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.taller_ediciones te
       WHERE te.taller_id = p_taller_id
         AND te.temporada_id = p_temporada_id
         AND public.talleres_estado_efectivo(te) <> 'cancelado'
    ) THEN
      RAISE EXCEPTION 'EDICION_YA_EXISTE' USING ERRCODE = 'P0001';
    END IF;

    v_resultado := public.talleres_instanciar_edicion(
      p_taller_id, v_temporada.fecha_apertura::date, p_temporada_id, NULL
    );

    v_ediciones := v_ediciones || jsonb_build_object(
      'edicion_id', v_resultado ->> 'edicion_id',
      'nombre', v_resultado ->> 'nombre',
      'fecha_inicio', v_resultado ->> 'fecha_inicio',
      'fecha_fin', v_resultado ->> 'fecha_fin',
      'cierre_inscripcion', v_resultado ->> 'cierre_inscripcion',
      'grupos_creados', v_resultado -> 'grupos_creados',
      'clases_por_grupo', v_resultado -> 'clases_por_grupo',
      'facilitadores_omitidos', v_resultado -> 'facilitadores_omitidos'
    );

  ELSE -- regimen = 'cadencia'
    IF p_temporada_id IS NOT NULL THEN
      RAISE EXCEPTION 'TEMPORADA_NO_PERMITIDA' USING ERRCODE = 'P0001';
    END IF;
    IF p_fecha_inicio IS NULL THEN
      RAISE EXCEPTION 'FECHA_REQUERIDA' USING ERRCODE = 'P0001';
    END IF;
    IF p_adelantar < 0 THEN
      RAISE EXCEPTION 'ADELANTAR_INVALIDO' USING ERRCODE = 'P0001';
    END IF;
    IF p_adelantar > 6 THEN
      RAISE EXCEPTION 'ADELANTAR_MAXIMO_6' USING ERRCODE = 'P0001';
    END IF;
    IF p_adelantar > 0 AND v_taller.intervalo_ediciones_dias IS NULL THEN
      RAISE EXCEPTION 'SIN_INTERVALO' USING ERRCODE = 'P0001';
    END IF;

    FOR v_i IN 0..p_adelantar LOOP
      v_fecha_i := p_fecha_inicio + (v_i * COALESCE(v_taller.intervalo_ediciones_dias, 0));

      v_resultado := public.talleres_instanciar_edicion(
        p_taller_id, v_fecha_i, NULL, NULL
      );

      v_nombre_final := v_resultado ->> 'nombre';
      -- talleres_instanciar_edicion (item 11) now ALSO checks the taller's
      -- own existing ediciones for a name collision, so by the time this
      -- runs the returned name may already be disambiguated; this
      -- within-call check stays as a second, harmless layer (it simply
      -- never fires when the DB-level check already renamed it).
      IF v_nombre_final = ANY (v_nombres_usados) THEN
        v_nombre_final := v_nombre_final || ' (' || to_char(v_fecha_i, 'DD') || ')';

        UPDATE public.taller_ediciones
           SET nombre_snapshot = v_nombre_final
         WHERE id = (v_resultado ->> 'edicion_id')::uuid;

        UPDATE public.operating_core_events
           SET title = v_nombre_final,
               metadata = jsonb_set(metadata, '{taller_edicion}', to_jsonb(v_nombre_final))
         WHERE id = (v_resultado ->> 'event_id')::uuid;

        UPDATE public.talleres_crecimiento_cohortes
           SET edicion = v_nombre_final
         WHERE id = (v_resultado ->> 'cohorte_id')::uuid;
      END IF;
      v_nombres_usados := v_nombres_usados || v_nombre_final;

      v_ediciones := v_ediciones || jsonb_build_object(
        'edicion_id', v_resultado ->> 'edicion_id',
        'nombre', v_nombre_final,
        'fecha_inicio', v_resultado ->> 'fecha_inicio',
        'fecha_fin', v_resultado ->> 'fecha_fin',
        'cierre_inscripcion', v_resultado ->> 'cierre_inscripcion',
        'grupos_creados', v_resultado -> 'grupos_creados',
        'clases_por_grupo', v_resultado -> 'clases_por_grupo',
        'facilitadores_omitidos', v_resultado -> 'facilitadores_omitidos'
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ediciones', v_ediciones);
END;
$function$;

COMMENT ON FUNCTION public.talleres_crear_edicion(uuid, date, uuid, integer) IS
  'T7 hardening — refuses P0001 TEMPORADA_NO_DISPONIBLE when the chosen temporada is not borrador/abierto, and COALESCEs an explicit NULL p_adelantar to 0. Otherwise unchanged: by temporada (only p_temporada_id, refuses a second non-cancelled edición of this taller in it) or by cadencia (only p_fecha_inicio, optional p_adelantar up to 6).';

-- ═══════════════════════════════════════════════════════════════════════
-- Item 3: talleres_agregar_taller_a_temporada gains the same
-- temporada-state guard. Same signature — CREATE OR REPLACE in place.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.talleres_agregar_taller_a_temporada(
  p_temporada_id uuid,
  p_taller_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_temporada public.talleres_temporadas%ROWTYPE;
  v_taller    public.talleres%ROWTYPE;
  v_resultado jsonb;
BEGIN
  SELECT * INTO v_temporada FROM public.talleres_temporadas WHERE id = p_temporada_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPORADA_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_temporada.dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_temporada.dream_team_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_temporada' USING ERRCODE = '42501';
  END IF;

  -- Item 3 (T7 hardening): authority stays on the temporada's own node
  -- (unchanged above) — this only checks the temporada is still available.
  IF v_temporada.estado NOT IN ('borrador', 'abierto') THEN
    RAISE EXCEPTION 'TEMPORADA_NO_DISPONIBLE' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_taller FROM public.talleres WHERE id = p_taller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TALLER_NOT_FOUND: %', p_taller_id USING ERRCODE = 'P0002';
  END IF;
  IF v_taller.regimen <> 'temporada' THEN
    RAISE EXCEPTION 'TALLER_NO_ES_POR_TEMPORADA' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.taller_ediciones te
     WHERE te.taller_id = p_taller_id
       AND te.temporada_id = p_temporada_id
       AND public.talleres_estado_efectivo(te) <> 'cancelado'
  ) THEN
    RAISE EXCEPTION 'EDICION_YA_EXISTE' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.talleres_temporada_talleres (temporada_id, taller_id)
  VALUES (p_temporada_id, p_taller_id)
  ON CONFLICT (temporada_id, taller_id) DO NOTHING;

  v_resultado := public.talleres_instanciar_edicion(p_taller_id, v_temporada.fecha_apertura::date, p_temporada_id, NULL);

  RETURN jsonb_build_object(
    'taller_id', p_taller_id,
    'edicion_id', v_resultado ->> 'edicion_id',
    'nombre', v_resultado ->> 'nombre',
    'grupos_creados', v_resultado -> 'grupos_creados',
    'clases_por_grupo', v_resultado -> 'clases_por_grupo',
    'facilitadores_omitidos', v_resultado -> 'facilitadores_omitidos'
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_agregar_taller_a_temporada(uuid, uuid) IS
  'T7 hardening — refuses P0001 TEMPORADA_NO_DISPONIBLE when the temporada is not borrador/abierto. Otherwise unchanged: adds one taller (regimen=temporada, in this temporada''s own tree) to an existing temporada, creating its edición. Refuses P0001 EDICION_YA_EXISTE when a non-cancelled edición of this taller already lives here. Authority: director.write/admin.manage scoped to the temporada''s own node.';

-- ═══════════════════════════════════════════════════════════════════════
-- Item 9: talleres_crear_temporada de-duplicates p_taller_ids and gains
-- the same EDICION_YA_EXISTE guard talleres_agregar_taller_a_temporada
-- already has. Same signature — CREATE OR REPLACE in place.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.talleres_crear_temporada(
  p_equipo_id uuid,
  p_nombre text,
  p_fecha_apertura date,
  p_fecha_cierre date,
  p_taller_ids uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_equipo       public.dream_team_equipos%ROWTYPE;
  v_nombre       text;
  v_slug         text;
  v_temporada_id uuid;
  v_taller_id    uuid;
  v_taller       public.talleres%ROWTYPE;
  v_resultado    jsonb;
  v_ediciones    jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_equipo FROM public.dream_team_equipos WHERE id = p_equipo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EQUIPO_NOT_FOUND: %', p_equipo_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_equipo.activo THEN
    RAISE EXCEPTION 'EQUIPO_INACTIVE: %', p_equipo_id USING ERRCODE = 'P0002';
  END IF;
  IF v_equipo.experiencia <> 'talleres_crecimiento' THEN
    RAISE EXCEPTION 'EQUIPO_WRONG_EXPERIENCE: %', p_equipo_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', p_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', p_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_esta_direccion' USING ERRCODE = '42501';
  END IF;

  v_nombre := btrim(p_nombre);
  IF v_nombre IS NULL OR length(v_nombre) < 2 THEN
    RAISE EXCEPTION 'NOMBRE_REQUERIDO' USING ERRCODE = '22023';
  END IF;

  IF p_fecha_apertura IS NULL OR p_fecha_cierre IS NULL THEN
    RAISE EXCEPTION 'FECHAS_REQUERIDAS' USING ERRCODE = '22023';
  END IF;
  IF p_fecha_cierre < p_fecha_apertura THEN
    RAISE EXCEPTION 'FECHA_CIERRE_ANTES_DE_APERTURA' USING ERRCODE = '22023';
  END IF;

  v_slug := lower(regexp_replace(regexp_replace(v_nombre, '[^a-z0-9-]+', '-', 'gi'), '-+', '-', 'g'));
  v_slug := trim(BOTH '-' FROM v_slug);
  v_slug := left(v_slug, 80);
  IF length(v_slug) < 2 THEN
    RAISE EXCEPTION 'SLUG_TOO_SHORT' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.talleres_temporadas (
    nombre, slug, fecha_apertura, fecha_cierre, estado, dream_team_equipo_id
  ) VALUES (
    v_nombre, v_slug, p_fecha_apertura, p_fecha_cierre, 'borrador', p_equipo_id
  )
  RETURNING id INTO v_temporada_id;

  -- Item 9 (T7 hardening): de-duplicate p_taller_ids (a caller passing the
  -- same id twice used to attempt a second, doomed instantiation against
  -- an edicion the first pass already created) and refuse EDICION_YA_EXISTE
  -- inside the loop, same as talleres_agregar_taller_a_temporada already
  -- does — for a temporada this fresh that can only happen via a
  -- duplicate, but the check stays for the same reason it stays there.
  FOR v_taller_id IN SELECT DISTINCT t FROM unnest(COALESCE(p_taller_ids, '{}'::uuid[])) AS t
  LOOP
    SELECT * INTO v_taller FROM public.talleres WHERE id = v_taller_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TALLER_NOT_FOUND: %', v_taller_id USING ERRCODE = 'P0002';
    END IF;
    IF v_taller.regimen <> 'temporada' THEN
      RAISE EXCEPTION 'TALLER_NO_ES_POR_TEMPORADA' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.taller_ediciones te
       WHERE te.taller_id = v_taller_id
         AND te.temporada_id = v_temporada_id
         AND public.talleres_estado_efectivo(te) <> 'cancelado'
    ) THEN
      RAISE EXCEPTION 'EDICION_YA_EXISTE' USING ERRCODE = 'P0001';
    END IF;

    -- Explicit junction insert first: the trigger raises P0001
    -- TALLER_FUERA_DE_LA_DIRECCION here, before any edición work happens
    -- for this taller, when it does not hang off p_equipo_id's own tree.
    INSERT INTO public.talleres_temporada_talleres (temporada_id, taller_id)
    VALUES (v_temporada_id, v_taller_id)
    ON CONFLICT (temporada_id, taller_id) DO NOTHING;

    v_resultado := public.talleres_instanciar_edicion(v_taller_id, p_fecha_apertura, v_temporada_id, NULL);

    v_ediciones := v_ediciones || jsonb_build_object(
      'taller_id', v_taller_id,
      'edicion_id', v_resultado ->> 'edicion_id',
      'nombre', v_resultado ->> 'nombre',
      'grupos_creados', v_resultado -> 'grupos_creados',
      'clases_por_grupo', v_resultado -> 'clases_por_grupo',
      'facilitadores_omitidos', v_resultado -> 'facilitadores_omitidos'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'temporada_id', v_temporada_id,
    'slug', v_slug,
    'ediciones', v_ediciones
  );
END;
$function$;

COMMENT ON FUNCTION public.talleres_crear_temporada(uuid, text, date, date, uuid[]) IS
  'T7 hardening — de-duplicates p_taller_ids (SELECT DISTINCT unnest) and refuses P0001 EDICION_YA_EXISTE inside the per-taller loop. Otherwise unchanged: creates a temporada owned by p_equipo_id (borrador, slug derived from nombre) plus one edición per distinct p_taller_ids entry (must hang off p_equipo_id''s tree and be regimen=temporada). Authority: director.write/admin.manage scoped to p_equipo_id.';

-- ═══════════════════════════════════════════════════════════════════════
-- Item 4: open_edicion is no longer callable by authenticated. Every real
-- caller now goes through talleres_crear_edicion / the temporada RPCs;
-- postgres/service_role keep EXECUTE so the legacy SQL suites (which now
-- call it as postgres — see the accompanying test-file edits) keep
-- working.
-- ═══════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.open_edicion(uuid, text, text, text, integer, integer, text, timestamptz, timestamptz, jsonb, uuid) FROM authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Item 5: create_taller_abstract gains an optional p_regimen (wins when
-- given; otherwise derived from p_modalidad_default) and sets it
-- explicitly on the INSERT, so trg_talleres_modalidad_default_mirror (T1)
-- mirrors modalidad_default from the RIGHT regimen instead of the column
-- default ('temporada') every single call used to silently fall back to.
-- Arity changes 6->7 args: DROP+CREATE (same reasoning as items 5/8).
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.create_taller_abstract(text, text, text, text, uuid, uuid);

CREATE FUNCTION public.create_taller_abstract(
  p_nombre text,
  p_descripcion text,
  p_modalidad_default text,
  p_slug text,
  p_equipo_id uuid,
  p_parent_equipo_id uuid,
  p_regimen text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id          uuid;
  v_cap_ok           boolean;
  v_taller           public.talleres%ROWTYPE;
  v_normalized       text;
  v_regimen          text;
  v_equipo           public.dream_team_equipos%ROWTYPE;
  v_parent           public.dream_team_equipos%ROWTYPE;
  v_target_equipo_id uuid;
  v_has_children      boolean;
  v_already_linked    boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  v_cap_ok := public.auth_has_talleres_capability('talleres_crecimiento.director.write')
              OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage');
  IF NOT v_cap_ok THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage'
      USING ERRCODE = '42501';
  END IF;

  IF p_nombre IS NULL OR length(trim(p_nombre)) < 2 THEN
    RAISE EXCEPTION 'NOMBRE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF length(trim(p_nombre)) > 200 THEN
    RAISE EXCEPTION 'NOMBRE_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF p_descripcion IS NOT NULL AND length(p_descripcion) > 2000 THEN
    RAISE EXCEPTION 'DESCRIPCION_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF p_modalidad_default NOT IN ('periodo_general', 'permanente_custom') THEN
    RAISE EXCEPTION 'INVALID_MODALIDAD: %', p_modalidad_default USING ERRCODE = '22023';
  END IF;
  IF p_regimen IS NOT NULL AND p_regimen NOT IN ('temporada', 'cadencia') THEN
    RAISE EXCEPTION 'INVALID_REGIMEN: %', p_regimen USING ERRCODE = '22023';
  END IF;
  v_regimen := COALESCE(p_regimen, CASE p_modalidad_default WHEN 'permanente_custom' THEN 'cadencia' ELSE 'temporada' END);

  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    v_normalized := lower(regexp_replace(regexp_replace(trim(p_nombre), '[^a-z0-9-]+', '-', 'gi'), '-+', '-', 'g'));
    v_normalized := trim(BOTH '-' FROM v_normalized);
    v_normalized := left(v_normalized, 80);
    IF length(v_normalized) < 2 THEN
      RAISE EXCEPTION 'SLUG_TOO_SHORT' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_normalized := trim(p_slug);
    IF v_normalized !~ '^[a-z0-9-]+$' OR length(v_normalized) < 2 OR length(v_normalized) > 80 THEN
      RAISE EXCEPTION 'INVALID_SLUG' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF (p_equipo_id IS NULL) = (p_parent_equipo_id IS NULL) THEN
    RAISE EXCEPTION 'MUST_CHOOSE_EXACTLY_ONE_MODE: se requiere exactamente uno de p_equipo_id (vincular) o p_parent_equipo_id (crear nuevo)'
      USING ERRCODE = 'P0003';
  END IF;

  IF p_equipo_id IS NOT NULL THEN
    SELECT * INTO v_equipo FROM public.dream_team_equipos WHERE id = p_equipo_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EQUIPO_NOT_FOUND: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo.id)
            OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo.id)) THEN
      RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage in this equipo''s tree'
        USING ERRCODE = '42501';
    END IF;

    IF NOT v_equipo.activo THEN
      RAISE EXCEPTION 'EQUIPO_INACTIVE: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;
    IF v_equipo.experiencia <> 'talleres_crecimiento' THEN
      RAISE EXCEPTION 'EQUIPO_WRONG_EXPERIENCE: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;
    IF v_equipo.parent_equipo_id IS NULL THEN
      RAISE EXCEPTION 'EQUIPO_IS_ROOT: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.dream_team_equipos c WHERE c.parent_equipo_id = v_equipo.id
    ) INTO v_has_children;
    IF v_has_children THEN
      RAISE EXCEPTION 'EQUIPO_HAS_CHILDREN: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.talleres t
      WHERE t.dream_team_equipo_id = v_equipo.id AND t.slug <> v_normalized
    ) INTO v_already_linked;
    IF v_already_linked THEN
      RAISE EXCEPTION 'EQUIPO_ALREADY_LINKED: %', p_equipo_id USING ERRCODE = 'P0002';
    END IF;

    v_target_equipo_id := v_equipo.id;
  ELSE
    SELECT * INTO v_parent FROM public.dream_team_equipos WHERE id = p_parent_equipo_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PARENT_EQUIPO_NOT_FOUND: %', p_parent_equipo_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_parent.id)
            OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_parent.id)) THEN
      RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage in this equipo''s tree'
        USING ERRCODE = '42501';
    END IF;

    IF NOT v_parent.activo THEN
      RAISE EXCEPTION 'PARENT_EQUIPO_INACTIVE: %', p_parent_equipo_id USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.dream_team_equipos (experiencia, label, parent_equipo_id, activo)
    VALUES ('talleres_crecimiento', trim(p_nombre), v_parent.id, true)
    RETURNING id INTO v_target_equipo_id;
  END IF;

  INSERT INTO public.dream_team_roles (equipo_id, label)
  SELECT v_target_equipo_id, r.label
  FROM (VALUES ('director'), ('coordinador'), ('lider'), ('voluntario')) AS r(label)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.dream_team_roles dr
    WHERE dr.equipo_id = v_target_equipo_id AND dr.label = r.label
  );

  INSERT INTO public.talleres (slug, nombre, descripcion, modalidad_default, regimen, estado, dream_team_equipo_id)
  VALUES (v_normalized, trim(p_nombre), NULLIF(trim(p_descripcion), ''), p_modalidad_default, v_regimen, 'active', v_target_equipo_id)
  ON CONFLICT (slug) DO UPDATE
    SET nombre = EXCLUDED.nombre,
        descripcion = EXCLUDED.descripcion,
        dream_team_equipo_id = EXCLUDED.dream_team_equipo_id
  RETURNING * INTO v_taller;

  RETURN jsonb_build_object(
    'taller_id', v_taller.id,
    'slug', v_taller.slug,
    'nombre', v_taller.nombre,
    'modalidad_default', v_taller.modalidad_default,
    'regimen', v_taller.regimen,
    'estado', v_taller.estado
  );
END;
$function$;

COMMENT ON FUNCTION public.create_taller_abstract(text, text, text, text, uuid, uuid, text) IS
  'T7 hardening — gains p_regimen (DEFAULT NULL, wins when given; otherwise derived from p_modalidad_default: permanente_custom -> cadencia, else temporada) and sets talleres.regimen explicitly, so trg_talleres_modalidad_default_mirror (T1) mirrors modalidad_default from the resolved regimen instead of the column''s own default. Everything else unchanged from the 6-arg version.';

REVOKE ALL ON FUNCTION public.create_taller_abstract(text, text, text, text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_taller_abstract(text, text, text, text, uuid, uuid, text) TO authenticated, postgres, service_role;
