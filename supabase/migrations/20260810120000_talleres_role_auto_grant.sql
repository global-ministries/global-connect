-- ════════════════════════════════════════════════════════════════════
-- PR3 — DT-011 — Talleres auto-grant / auto-revoke trigger.
-- Fase 5 (operating). Additive only, no destructive DDL (I-6).
--
-- This migration mirrors the F4 pastoral auto-grant precedent
-- (supabase/migrations/20260727000000_pastoral_auto_grant_on_role.sql),
-- but is keyed on (a) the dream_team_servicios + dream_team_equipos
-- join filtered to experiencia = 'talleres_crecimiento', and (b) the
-- taller_grupo_asignaciones table (which is a Fase 5 sibling — it does
-- not exist yet on staging, so the trigger body is written defensively
-- to no-op cleanly until PR6 introduces the table).
--
-- Inheritance table (design §4, the source of truth for the
-- source-of-truth role → capability mapping):
--
--   Source-of-truth row                                       Auto-granted (scope = taller_id)
--   ────────────────────────────────────────────────────────  ─────────────────────────────────
--   dream_team_servicios (experiencia='talleres_crecimiento')  director.{read,write} +
--     rol ∈ {director}  AND  estado='activo'                    admin.manage + metrics.read
--   dream_team_servicios (experiencia='talleres_crecimiento')  coordinator.{read,write} +
--     rol ∈ {coordinador} AND  estado='activo'                   metrics.read (scope = taller_id,
--                                                              where taller_id = equipo_id of
--                                                              the linked talleres_crecimiento_cohorte)
--   taller_grupo_asignaciones                                   lead.{read,write}
--     rol='lider' AND activo=true
--   taller_grupo_asignaciones                                   volunteer.read
--     rol='voluntario' AND activo=true
--
-- Source attribution (design §14):
--   * 'role-auto-grant' — granted by the dream_team_servicios trigger
--     (coordinator/director capabilities, scoped to taller_id).
--   * 'taller-asignacion-auto-grant' — granted by the
--     taller_grupo_asignaciones trigger (lead/volunteer capabilities,
--     scoped to grupo_id).
--   Manual grants (source != 'role-auto-grant' AND
--   source != 'taller-asignacion-auto-grant') are banned by the
--   proposal §Capabilities; reconciliation only ever touches the two
--   auto-grant sources.
--
-- Identity resolution: persona_id in dream_team_capability_grants
-- references public.usuarios.id. Direct auth.uid() NEVER matches
-- usuarios.id — the canonical pattern (proven by
-- 20260725130000_pastoral_capability_helper_drift_fix.sql) is to
-- look up the grants by an inner join. The trigger only writes
-- grants when a role assignment row changes, so it never needs to
-- resolve auth.uid() (it operates on the supplied NEW/OLD row).
-- ════════════════════════════════════════════════════════════════════

-- 1) Static mapping: source-of-truth role name (as stored in
--    dream_team_roles.label) → (capability_key, scope_type) tuples.
--    This table is the single source of truth for the trigger; it
--    mirrors the F4 `pastoral_role_capability_map` precedent.
--
--    The role labels match the F2 dream_team_roles convention
--    (label text identifies the role; lookup is by label). For
--    Fase 5 the canonical labels are:
--      'director'       → talleres director set
--      'coordinador'    → talleres coordinator set
--    (lead/volunteer live on taller_grupo_asignaciones and are
--    handled in step 4 below.)
--
--    ADITIVO: does not modify any F2 table; the mapping is
--    owned by Fase 5 and the trigger is the only consumer.

CREATE TABLE IF NOT EXISTS public.talleres_role_capability_map (
  rol text NOT NULL,
  capability_key text NOT NULL,
  scope_type text NOT NULL,
  PRIMARY KEY (rol, capability_key, scope_type)
);

INSERT INTO public.talleres_role_capability_map (rol, capability_key, scope_type) VALUES
  -- director (F5 bootstrap: inherits the full director set)
  ('director',    'talleres_crecimiento.director.read',    'taller'),
  ('director',    'talleres_crecimiento.director.write',   'taller'),
  ('director',    'talleres_crecimiento.admin.manage',     'taller'),
  ('director',    'talleres_crecimiento.metrics.read',     'taller'),
  -- coordinador (F5: scoped coordinator set, per design §4)
  ('coordinador', 'talleres_crecimiento.coordinator.read',  'taller'),
  ('coordinador', 'talleres_crecimiento.coordinator.write', 'taller'),
  ('coordinador', 'talleres_crecimiento.metrics.read',     'taller')
ON CONFLICT DO NOTHING;

-- 2) Helper: insert grants for a given persona + (rol, taller_id).
--    Idempotent (WHERE NOT EXISTS, mirroring the pastoral precedent;
--    ON CONFLICT cannot de-duplicate rows where the UNIQUE constraint
--    treats NULL scope_id as DISTINCT in PostgreSQL).
--    Taller_id is the scope_id (the talleres_crecimiento scope under
--    which the role is exercised; for director/coordinador grants
--    this is the talleres_crecimiento_cohortes.dream_team_equipo_id
--    that the servicio references).

CREATE OR REPLACE FUNCTION public.assign_talleres_capabilities_for_role(
  p_persona_id uuid,
  p_rol        text,
  p_taller_id  uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  INSERT INTO public.dream_team_capability_grants (
    persona_id, capability_key, experience, scope_type, scope_id, source, granted_at
  )
  SELECT
    p_persona_id,
    m.capability_key,
    'talleres_crecimiento',
    m.scope_type,
    p_taller_id,
    'role-auto-grant',
    now()
  FROM public.talleres_role_capability_map m
  WHERE m.rol = p_rol
    AND NOT EXISTS (
      SELECT 1 FROM public.dream_team_capability_grants g
      WHERE g.persona_id   = p_persona_id
        AND g.capability_key = m.capability_key
        AND g.experience     = 'talleres_crecimiento'
        AND g.scope_type     = m.scope_type
        AND g.scope_id       = p_taller_id
        AND g.source         = 'role-auto-grant'
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_talleres_capabilities_for_role(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_talleres_capabilities_for_role(uuid, text, uuid) TO service_role;

-- 3) Trigger function: reconcile grants whenever a role link on
--    dream_team_servicios changes for the talleres experience.
--
--    The trigger runs AFTER INSERT OR UPDATE OR DELETE per row and:
--      * Looks up the linked dream_team_equipos.experiencia — only
--        fires reconciliation for experiencia = 'talleres_crecimiento'.
--      * Computes the rol label from dream_team_roles.label.
--      * On INSERT/UPDATE: if estado='activo' and experiencia matches,
--        grant the canonical capability set scoped to taller_id
--        (where taller_id is dream_team_servicios.equipo_id — the F2
--        equipo that is the talleres_crecimiento cohort equipo).
--        If estado != 'activo', revoke any existing role-auto-grant
--        for that (persona, taller) pair.
--      * On DELETE: revoke any existing role-auto-grant for that
--        (persona, taller) pair.
--      * On UPDATE where the rol changes: revoke grants for the OLD
--        rol before granting for the NEW rol.

CREATE OR REPLACE FUNCTION public.sync_talleres_grants_on_servicio_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_experiencia   text;
  v_rol_new       text;
  v_rol_old       text;
  v_taller_new    uuid;
  v_taller_old    uuid;
  v_estado_new    text;
  v_estado_old    text;
  v_persona_new   uuid;
  v_persona_old   uuid;
BEGIN
  -- ── DELETE: revoke everything we ever granted for (persona, taller) ──
  IF TG_OP = 'DELETE' THEN
    v_persona_old := OLD.persona_id;
    v_taller_old  := OLD.equipo_id;
    DELETE FROM public.dream_team_capability_grants g
      USING public.talleres_role_capability_map m
      WHERE g.persona_id     = v_persona_old
        AND g.experience     = 'talleres_crecimiento'
        AND g.source         = 'role-auto-grant'
        AND g.scope_id       = v_taller_old
        AND m.capability_key = g.capability_key;
    RETURN OLD;
  END IF;

  -- ── INSERT or UPDATE: discover experiencia + rol ──
  v_persona_new := NEW.persona_id;
  v_taller_new  := NEW.equipo_id;
  v_estado_new  := NEW.estado::text;

  SELECT eq.experiencia, r.label
    INTO v_experiencia, v_rol_new
    FROM public.dream_team_equipos eq
    JOIN public.dream_team_roles    r ON r.id = NEW.rol_id
   WHERE eq.id = NEW.equipo_id;

  -- Only the talleres experience triggers reconciliation.
  IF v_experiencia IS DISTINCT FROM 'talleres_crecimiento' THEN
    RETURN NEW;
  END IF;

  -- Not in the canonical mapping → no-op.
  IF v_rol_new IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.talleres_role_capability_map m WHERE m.rol = v_rol_new
     ) THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, compare with OLD so a rol change revokes the previous grants.
  IF TG_OP = 'UPDATE' THEN
    v_estado_old := OLD.estado::text;
    v_taller_old := OLD.equipo_id;
    SELECT r.label
      INTO v_rol_old
      FROM public.dream_team_roles r
     WHERE r.id = OLD.rol_id;

    -- Revoke prior grants (rol or scope moved, regardless of estado).
    DELETE FROM public.dream_team_capability_grants g
      USING public.talleres_role_capability_map m
      WHERE g.persona_id     = v_persona_new
        AND g.experience     = 'talleres_crecimiento'
        AND g.source         = 'role-auto-grant'
        AND g.scope_id       = v_taller_old
        AND m.capability_key = g.capability_key
        AND m.rol            = COALESCE(v_rol_old, '__none__');
  END IF;

  -- Grant only when estado='activo'. Otherwise leave the row revoked.
  IF v_estado_new = 'activo' THEN
    PERFORM public.assign_talleres_capabilities_for_role(
      v_persona_new, v_rol_new, v_taller_new
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_talleres_grants_on_servicio_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_talleres_grants_on_servicio_change ON public.dream_team_servicios;
CREATE TRIGGER trg_sync_talleres_grants_on_servicio_change
  AFTER INSERT OR UPDATE OR DELETE ON public.dream_team_servicios
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_talleres_grants_on_servicio_change();

-- 4) Trigger function for taller_grupo_asignaciones: group-scoped
--    grants for lead/volunteer (per design §4). This is the Fase 5
--    sibling to F4's role trigger; it scopes lead/volunteer grants
--    to the group (scope_id = grupo_id) and tags them with
--    source='taller-asignacion-auto-grant' so reconciliation can
--    distinguish them from role-auto-grant rows.
--
--    The trigger body guards on the existence of
--    public.taller_grupo_asignaciones (added by PR6); until then
--    the trigger function is registered but inert (no attachment).
--    This keeps the migration order-independent: PR3 can ship
--    before PR6 without breaking the build.

CREATE OR REPLACE FUNCTION public.sync_talleres_grants_on_grupo_asignacion_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_grupo_id    uuid;
  v_persona_id  uuid;
  v_rol         text;
  v_activo      boolean;
  v_cap_key     text;
BEGIN
  -- Resolve the relevant values from the operation.
  IF TG_OP = 'DELETE' THEN
    v_grupo_id   := OLD.grupo_id;
    v_persona_id := OLD.persona_id;
    v_rol        := OLD.rol::text;
    v_activo     := false; -- on DELETE, always revoke
  ELSE
    v_grupo_id   := NEW.grupo_id;
    v_persona_id := NEW.persona_id;
    v_rol        := NEW.rol::text;
    v_activo     := NEW.activo;
  END IF;

  -- Map rol → capability_key (F5 inheritance table, design §4).
  IF v_rol = 'lider' THEN
    v_cap_key := 'talleres_crecimiento.lead.read';
    -- lead.write is granted atomically with lead.read (same trigger).
    IF TG_OP = 'DELETE' OR NOT v_activo THEN
      DELETE FROM public.dream_team_capability_grants
       WHERE persona_id     = v_persona_id
         AND experience     = 'talleres_crecimiento'
         AND scope_id       = v_grupo_id
         AND source         = 'taller-asignacion-auto-grant'
         AND capability_key IN (
           'talleres_crecimiento.lead.read',
           'talleres_crecimiento.lead.write'
         );
    ELSE
      -- Idempotent grant.
      INSERT INTO public.dream_team_capability_grants (
        persona_id, capability_key, experience, scope_type, scope_id, source, granted_at
      )
      SELECT v_persona_id, c, 'talleres_crecimiento', 'taller', v_grupo_id,
             'taller-asignacion-auto-grant', now()
      FROM (VALUES
        ('talleres_crecimiento.lead.read'),
        ('talleres_crecimiento.lead.write')
      ) AS caps(c)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.dream_team_capability_grants g
        WHERE g.persona_id     = v_persona_id
          AND g.capability_key = c
          AND g.experience     = 'talleres_crecimiento'
          AND g.scope_id       = v_grupo_id
          AND g.source         = 'taller-asignacion-auto-grant'
      );
    END IF;

  ELSIF v_rol = 'voluntario' THEN
    v_cap_key := 'talleres_crecimiento.volunteer.read';
    IF TG_OP = 'DELETE' OR NOT v_activo THEN
      DELETE FROM public.dream_team_capability_grants
       WHERE persona_id     = v_persona_id
         AND experience     = 'talleres_crecimiento'
         AND scope_id       = v_grupo_id
         AND source         = 'taller-asignacion-auto-grant'
         AND capability_key = 'talleres_crecimiento.volunteer.read';
    ELSE
      INSERT INTO public.dream_team_capability_grants (
        persona_id, capability_key, experience, scope_type, scope_id, source, granted_at
      )
      SELECT v_persona_id, 'talleres_crecimiento.volunteer.read',
             'talleres_crecimiento', 'taller', v_grupo_id,
             'taller-asignacion-auto-grant', now()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.dream_team_capability_grants g
        WHERE g.persona_id     = v_persona_id
          AND g.capability_key = 'talleres_crecimiento.volunteer.read'
          AND g.experience     = 'talleres_crecimiento'
          AND g.scope_id       = v_grupo_id
          AND g.source         = 'taller-asignacion-auto-grant'
      );
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_talleres_grants_on_grupo_asignacion_change() FROM PUBLIC, anon, authenticated;

-- Attach the trigger ONLY if the taller_grupo_asignaciones table exists
-- (it is added in PR6 — the assignment table migration). The DO block
-- is a no-op if the table is missing, keeping the migration order-independent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'taller_grupo_asignaciones'
  ) THEN
    DROP TRIGGER IF EXISTS trg_sync_talleres_grants_on_grupo_asignacion_change
      ON public.taller_grupo_asignaciones;
    CREATE TRIGGER trg_sync_talleres_grants_on_grupo_asignacion_change
      AFTER INSERT OR UPDATE OR DELETE ON public.taller_grupo_asignaciones
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_talleres_grants_on_grupo_asignacion_change();
  END IF;
END
$$;

-- No RLS changes: `dream_team_servicios` and `dream_team_capability_grants`
-- are already managed by service_role / privileged RPC. The trigger is
-- SECURITY DEFINER, so even authenticated callers of INSERT/UPDATE/DELETE
-- on `dream_team_servicios` (if any) fire the reconciliation. RLS on
-- `taller_grupo_asignaciones` (when it lands) is owned by PR6.
