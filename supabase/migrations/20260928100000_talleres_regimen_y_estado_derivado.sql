-- T1 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — moves tipo,
-- vinculo and regimen from the edicion form to the taller's own
-- configuration, adds the date columns an edicion needs to derive its
-- state, and introduces talleres_estado_efectivo()/talleres_refrescar_
-- estados() so "abierto"/"en_curso"/"cerrado" stop being a button someone
-- has to remember to press (docs/talleres-de-punta-a-punta.md §5, "el
-- estado de una edicion se deriva de sus fechas").
--
-- Verified against STAGING before writing this file:
--   * taller_ediciones/talleres columns and constraints (information_schema
--     + pg_constraint).
--   * pg_get_functiondef(open_edicion) — it INSERTs taller_ediciones with an
--     explicit column list that does not include fecha_inicio/fecha_fin/
--     cierre_inscripcion, so three new NULLable columns do not break it.
--   * pg_policies for taller_ediciones, taller_inscripciones,
--     talleres_crecimiento_cohortes — the only three places in the whole
--     supabase/migrations tree that test `estado IN ('abierto','en_curso')`
--     as a policy predicate (grepped for the pattern; the one other hit,
--     a partial index on the now-renamed talleres_crecimiento_metadata, no
--     longer exists as a live object).
--   * staging's one real taller_ediciones row (De Hombre a Hombre) and its
--     cohorte/sesiones — see the dated backfill below.
--
-- Policies changed by part E (byte-for-byte copies of their live
-- pg_get_expr() output except the one substitution described there):
--   taller_ediciones_select, taller_inscripciones_insert,
--   talleres_crecimiento_cohortes_select.

-- ===========================================================================
-- A. talleres: configuration columns, additive
-- ===========================================================================

ALTER TABLE public.talleres
  ADD COLUMN tipo text NOT NULL DEFAULT 'individual',
  ADD COLUMN vinculo text NULL,
  ADD COLUMN regimen text NOT NULL DEFAULT 'temporada',
  ADD COLUMN cierre_inscripcion_offset_dias integer NOT NULL DEFAULT 0,
  ADD COLUMN intervalo_ediciones_dias integer NULL;

ALTER TABLE public.talleres
  ADD CONSTRAINT talleres_tipo_check CHECK (tipo IN ('individual', 'pareja')),
  ADD CONSTRAINT talleres_vinculo_check CHECK (vinculo IS NULL OR vinculo IN ('matrimonio', 'novios')),
  -- test case (11): vinculo only makes sense for a taller de pareja.
  ADD CONSTRAINT talleres_vinculo_requiere_pareja_check CHECK (tipo = 'pareja' OR vinculo IS NULL),
  ADD CONSTRAINT talleres_regimen_check CHECK (regimen IN ('temporada', 'cadencia')),
  ADD CONSTRAINT talleres_intervalo_ediciones_dias_check CHECK (intervalo_ediciones_dias IS NULL OR intervalo_ediciones_dias > 0);

COMMENT ON COLUMN public.talleres.tipo IS
  'Configuracion del taller (T1): individual|pareja. Snapshotted onto every taller_ediciones row it opens.';
COMMENT ON COLUMN public.talleres.vinculo IS
  'Configuracion del taller (T1): matrimonio|novios|NULL = cualquiera. Solo aplica si tipo = pareja.';
COMMENT ON COLUMN public.talleres.regimen IS
  'Configuracion del taller (T1): temporada|cadencia. modalidad_default se mantiene como espejo derivado via trigger, para lectores viejos.';
COMMENT ON COLUMN public.talleres.cierre_inscripcion_offset_dias IS
  'Dias relativos a la primera clase en los que cierra la inscripcion de una edicion (negativo cierra antes, positivo permite entrar tarde). Default 0.';
COMMENT ON COLUMN public.talleres.intervalo_ediciones_dias IS
  'Cadencia en dias entre ediciones adelantadas para un taller regimen=cadencia (Proximo Paso: 28). NULL = no adelanta.';

-- Backfill regimen from the existing modalidad_default (this is a plain
-- data fix against the CURRENT source of truth, run BEFORE the mirror
-- trigger below exists, so it does not loop back on itself).
UPDATE public.talleres
SET regimen = CASE modalidad_default
                WHEN 'permanente_custom' THEN 'cadencia'
                ELSE 'temporada'
              END;

-- Backfill tipo/vinculo on staging from each taller's most recent edicion,
-- when one exists (only "De Hombre a Hombre" has one today: tipo=
-- individual, link_type=NULL — verified on staging, matches the default
-- already set above, kept explicit here so the rule is data-driven, not
-- coincidental).
UPDATE public.talleres t
SET tipo = e.tipo,
    vinculo = e.link_type
FROM (
  SELECT DISTINCT ON (taller_id) taller_id, tipo, link_type
  FROM public.taller_ediciones
  WHERE taller_id IS NOT NULL
  ORDER BY taller_id, created_at DESC
) e
WHERE t.id = e.taller_id;

-- Mirror trigger: modalidad_default stays a derived read-only-in-spirit
-- column for old readers. Fires on INSERT and on UPDATE OF regimen only,
-- exactly as decided (odd/tasks/talleres-temporadas-y-ediciones.md,
-- "Configuracion del taller").
CREATE OR REPLACE FUNCTION public.talleres_sync_modalidad_default_from_regimen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.modalidad_default := CASE NEW.regimen
                              WHEN 'cadencia' THEN 'permanente_custom'
                              ELSE 'periodo_general'
                            END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_talleres_modalidad_default_mirror
  BEFORE INSERT OR UPDATE OF regimen ON public.talleres
  FOR EACH ROW
  EXECUTE FUNCTION public.talleres_sync_modalidad_default_from_regimen();

-- Explicit override: Proximo Paso is regimen=cadencia even though its
-- stored modalidad_default was 'periodo_general' on staging (verified) —
-- the mechanical backfill above would have left it wrong. Goes through the
-- trigger just created, so modalidad_default flips to 'permanente_custom'
-- as a side effect.
UPDATE public.talleres
SET regimen = 'cadencia',
    intervalo_ediciones_dias = 28
WHERE slug = 'proximo-paso';

-- ===========================================================================
-- B. taller_ediciones: date columns, additive
-- ===========================================================================

ALTER TABLE public.taller_ediciones
  ADD COLUMN fecha_inicio date NULL,
  ADD COLUMN fecha_fin date NULL,
  ADD COLUMN cierre_inscripcion date NULL;

ALTER TABLE public.taller_ediciones
  ADD CONSTRAINT taller_ediciones_fecha_fin_no_antes_de_inicio_check
    CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio);

COMMENT ON COLUMN public.taller_ediciones.fecha_inicio IS
  'Fecha de la primera clase (T1). NULL en filas legacy: talleres_estado_efectivo cae al estado guardado cuando cualquiera de las 3 fechas es NULL.';
COMMENT ON COLUMN public.taller_ediciones.fecha_fin IS
  'Fecha de la ultima clase = inicio + (clases activas - 1) x cadencia (T1/T2).';
COMMENT ON COLUMN public.taller_ediciones.cierre_inscripcion IS
  'Fecha de cierre de inscripcion = inicio + cierre_inscripcion_offset_dias del taller (T1/T2).';

-- Backfill staging's existing edicion(es). Source order for fecha_inicio:
-- (1) its cohorte's started_at, (2) the earliest taller_sesiones.
-- fecha_programada across its grupos, (3) the operating_core_event's own
-- start_date — this third source is not in the task's literal fallback
-- list, but staging's one real row (De Hombre a Hombre, edicion
-- ed1c0000-...) has NEITHER a cohorte.started_at NOR any taller_sesiones
-- (0 rows, verified), so without it fecha_inicio would stay NULL and the
-- row would never actually exercise the new derivation. start_date is
-- exactly the p_fecha_inicio_periodo that open_edicion recorded on the
-- event when this edicion was created, so it is a faithful "first class"
-- date, not a guess.
--
-- fecha_fin: latest taller_sesiones.fecha_programada when any exist, else
-- fecha_inicio + (sesiones_snapshot - 1) x taller.cadencia_dias (the same
-- formula the decisions doc gives the edicion's own fecha_fin). If that
-- would land in the past today (cerrado), it is pushed to today + 30 days
-- instead, to keep the row usable rather than silently dead-on-arrival.
-- cierre_inscripcion = fecha_inicio (offset 0 today for every taller).
WITH sourced AS (
  SELECT
    te.id,
    COALESCE(
      c.started_at::date,
      (SELECT MIN(s.fecha_programada)
         FROM public.taller_sesiones s
         JOIN public.taller_grupos g ON g.id = s.grupo_id
        WHERE g.cohorte_id = c.id),
      ev.start_date::date
    ) AS fecha_inicio_src,
    (SELECT MAX(s.fecha_programada)
       FROM public.taller_sesiones s
       JOIN public.taller_grupos g ON g.id = s.grupo_id
      WHERE g.cohorte_id = c.id) AS fecha_fin_sesiones,
    COALESCE(t.cadencia_dias, 7) AS cadencia_dias,
    te.sesiones_snapshot
  FROM public.taller_ediciones te
  JOIN public.talleres_crecimiento_cohortes c ON c.taller_id = te.id
  JOIN public.operating_core_events ev ON ev.id = te.operating_core_event_id
  JOIN public.talleres t ON t.id = te.taller_id
  WHERE te.fecha_inicio IS NULL
),
computed AS (
  SELECT
    id,
    fecha_inicio_src AS fecha_inicio,
    COALESCE(
      fecha_fin_sesiones,
      fecha_inicio_src + ((GREATEST(sesiones_snapshot, 1) - 1) * cadencia_dias)
    ) AS fecha_fin_raw
  FROM sourced
  WHERE fecha_inicio_src IS NOT NULL
)
UPDATE public.taller_ediciones te
SET fecha_inicio = c.fecha_inicio,
    cierre_inscripcion = c.fecha_inicio,
    fecha_fin = CASE
                  WHEN c.fecha_fin_raw < CURRENT_DATE THEN CURRENT_DATE + 30
                  ELSE c.fecha_fin_raw
                END
FROM computed c
WHERE te.id = c.id;

-- ===========================================================================
-- C. talleres_estado_efectivo(): the derivation rule, once
-- ===========================================================================

-- Row-typed overload: pure computation over the row's own already-visible
-- columns, no table lookup. This is the one policies call on their OWN
-- table's row (taller_ediciones_select passes the row being evaluated)
-- specifically to avoid the "infinite recursion detected in policy for
-- relation" error a self-querying id-based call would trigger there.
-- SECURITY DEFINER is deliberately NOT used: it never touches a table, so
-- there is nothing to bypass RLS for.
CREATE OR REPLACE FUNCTION public.talleres_estado_efectivo(p_edicion public.taller_ediciones)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    -- Stored borrador/cancelado always win: those are the only two manual
    -- states left (docs §5, "manual queda solo lo que es una decision
    -- humana").
    WHEN p_edicion.estado IN ('borrador', 'cancelado') THEN p_edicion.estado
    -- Legacy/incomplete rows: any missing date falls back to the stored
    -- estado rather than guessing.
    WHEN p_edicion.fecha_inicio IS NULL
      OR p_edicion.fecha_fin IS NULL
      OR p_edicion.cierre_inscripcion IS NULL THEN p_edicion.estado
    -- Before the enrollment window closes: abierto. Checked BEFORE the
    -- en_curso window on purpose — a taller with a positive
    -- cierre_inscripcion_offset_dias (entrar tarde) can have
    -- fecha_inicio <= hoy while inscription is still open, and that must
    -- stay "abierto", not flip to "en_curso".
    WHEN CURRENT_DATE < p_edicion.cierre_inscripcion THEN 'abierto'
    -- Inside the class window, enrollment already closed: en_curso.
    WHEN p_edicion.fecha_inicio <= CURRENT_DATE AND CURRENT_DATE <= p_edicion.fecha_fin THEN 'en_curso'
    -- Past fecha_fin, or past cierre_inscripcion while still before
    -- fecha_inicio (a negative offset's dead gap before class starts):
    -- both read as cerrado to the public — nothing is running and nothing
    -- can be joined.
    ELSE 'cerrado'
  END;
$$;

COMMENT ON FUNCTION public.talleres_estado_efectivo(public.taller_ediciones) IS
  'Derives an edicion''s effective estado from its own dates (docs/talleres-de-punta-a-punta.md §5). Pure computation over the passed row, no table access — safe to call on the row being evaluated inside taller_ediciones_select itself.';

-- uuid overload: for callers that only have the id (app RPCs, the other
-- two rewritten policies where a fresh row is already at hand and passed
-- directly instead — see part E). Delegates to the row-typed overload, so
-- there is exactly one place with the actual rule. Not SECURITY DEFINER:
-- it only ever reads taller_ediciones, and that table's own RLS (which,
-- after part E, already exposes abierto/en_curso rows to any authenticated
-- user) is precisely the visibility boundary this helper should respect —
-- a caller who cannot see a given edicion by any legitimate path should
-- not be able to learn its state through this function either.
CREATE OR REPLACE FUNCTION public.talleres_estado_efectivo(p_edicion_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT public.talleres_estado_efectivo(te)
  FROM public.taller_ediciones te
  WHERE te.id = p_edicion_id;
$$;

COMMENT ON FUNCTION public.talleres_estado_efectivo(uuid) IS
  'uuid convenience overload of talleres_estado_efectivo(taller_ediciones); subject to the caller''s own SELECT visibility on taller_ediciones (see comment on that overload).';

-- REVOKE/GRANT posture mirrored byte-for-byte from
-- 20260926150000_talleres_plantillas_del_taller.sql's own functions.
REVOKE ALL ON FUNCTION public.talleres_estado_efectivo(public.taller_ediciones) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_estado_efectivo(public.taller_ediciones) TO authenticated, postgres, service_role;

REVOKE ALL ON FUNCTION public.talleres_estado_efectivo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_estado_efectivo(uuid) TO authenticated, postgres, service_role;

-- ===========================================================================
-- D. talleres_refrescar_estados(): move the stored column to match
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_refrescar_estados(p_taller_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  -- No capability check beyond authentication: this only ever writes the
  -- exact value talleres_estado_efectivo() already exposes for that same
  -- row to any authenticated user (directly, or through the public
  -- abierto/en_curso branch of taller_ediciones_select) — it discloses
  -- nothing new and cannot move a row into or out of borrador/cancelado,
  -- the only two states that ARE a human decision. SECURITY DEFINER exists
  -- only to bypass taller_ediciones_update's director/admin-only USING
  -- clause, because "recompute a pure function of public dates" is not the
  -- write capability that clause is protecting.
  UPDATE public.taller_ediciones te
  SET estado = public.talleres_estado_efectivo(te)
  WHERE te.estado NOT IN ('borrador', 'cancelado')
    AND te.estado IS DISTINCT FROM public.talleres_estado_efectivo(te)
    AND (p_taller_id IS NULL OR te.taller_id = p_taller_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.talleres_refrescar_estados(uuid) IS
  'Moves taller_ediciones.estado to talleres_estado_efectivo() for every non-manual row that differs, optionally scoped to one taller. Called by loaders before they read (catalogo, explorar, taller, edicion). No scheduled job — see docs/talleres-de-punta-a-punta.md §4.';

REVOKE ALL ON FUNCTION public.talleres_refrescar_estados(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_refrescar_estados(uuid) TO authenticated, postgres, service_role;

-- ===========================================================================
-- E. Policies: read the derived state instead of the stored column
-- ===========================================================================
-- Each qual/with_check below is copied byte-for-byte from the live
-- pg_get_expr() output (captured against staging before writing this
-- migration) except for exactly one substitution per policy:
--   `estado = ANY (ARRAY['abierto'::text, 'en_curso'::text])`
--   -> `talleres_estado_efectivo(<already-in-scope row>) = ANY (ARRAY['abierto'::text, 'en_curso'::text])`
-- talleres_equipo_de_edicion/talleres_equipo_de_cohorte and every
-- auth_has_talleres_capability_scoped(...) branch are untouched.

DROP POLICY IF EXISTS taller_ediciones_select ON public.taller_ediciones;
CREATE POLICY taller_ediciones_select ON public.taller_ediciones
FOR SELECT
USING (
  auth_has_talleres_capability_scoped('talleres_crecimiento.director.read'::text, talleres_equipo_de_edicion(id))
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, talleres_equipo_de_edicion(id))
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, talleres_equipo_de_edicion(id))
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read'::text, talleres_equipo_de_edicion(id))
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read'::text, talleres_equipo_de_edicion(id))
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read'::text, talleres_equipo_de_edicion(id))
  OR (
    (auth.uid() IS NOT NULL)
    AND (talleres_estado_efectivo(taller_ediciones) = ANY (ARRAY['abierto'::text, 'en_curso'::text]))
  )
);

DROP POLICY IF EXISTS talleres_crecimiento_cohortes_select ON public.talleres_crecimiento_cohortes;
CREATE POLICY talleres_crecimiento_cohortes_select ON public.talleres_crecimiento_cohortes
FOR SELECT
USING (
  auth_has_talleres_capability_scoped('talleres_crecimiento.director.read'::text, dream_team_equipo_id)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, dream_team_equipo_id)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read'::text, dream_team_equipo_id)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.lead.read'::text, dream_team_equipo_id)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.volunteer.read'::text, dream_team_equipo_id)
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.metrics.read'::text, dream_team_equipo_id)
  OR (
    (auth.uid() IS NOT NULL)
    AND (EXISTS (
      SELECT 1
        FROM taller_ediciones te
       WHERE te.id = talleres_crecimiento_cohortes.taller_id
         AND talleres_estado_efectivo(te) = ANY (ARRAY['abierto'::text, 'en_curso'::text])
    ))
  )
);

DROP POLICY IF EXISTS taller_inscripciones_insert ON public.taller_inscripciones;
CREATE POLICY taller_inscripciones_insert ON public.taller_inscripciones
FOR INSERT
WITH CHECK (
  auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write'::text, talleres_equipo_de_cohorte(cohorte_id))
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.director.write'::text, talleres_equipo_de_cohorte(cohorte_id))
  OR auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage'::text, talleres_equipo_de_cohorte(cohorte_id))
  OR (
    estado = 'pendiente'::text
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
