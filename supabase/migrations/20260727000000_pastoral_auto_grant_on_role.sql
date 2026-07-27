-- ════════════════════════════════════════════════════════════════════
-- W24 — DT-093 (recap pastoral) — Auto-grant pastoral capabilities
-- when a user receives a role in `usuario_roles`.
--
-- Issue: #363 (status:approved, type:feature)
-- Change: fase-04-seguimiento-pastoral (recap Opción B, W24)
--
-- What this migration does:
--   1. Defines a helper `assign_pastoral_capabilities_for_role(persona_id, rol)` that
--      inserts a fixed set of `dream_team_capability_grants` (experience='pastoral')
--      for the persona, using `source='role-auto-grant'` so they can be reconciled
--      safely on role changes.
--   2. Defines trigger function `sync_pastoral_grants_on_role_change()` that runs
--      AFTER INSERT/UPDATE/DELETE on `public.usuario_roles` and:
--      * On INSERT/UPDATE: looks up `roles_sistema.nombre_interno` for the row,
--        then delegates to `assign_pastoral_capabilities_for_role(...)`.
--      * On DELETE: revokes every grant currently tagged `source='role-auto-grant'`
--        for that persona and the rol that was just unassigned.
--   3. Attaches the trigger to `public.usuario_roles`.
--
-- Strict safety constraints honoured:
--   * Additive: no destructive DDL on existing tables.
--   * RLS preserved on `dream_team_capability_grants` (writes still require
--     service_role / privileged RPC); the trigger is `SECURITY DEFINER` so
--     it bypasses RLS for the cascading auto-grant only.
--   * Idempotent: uses `WHERE NOT EXISTS` (NOT `ON CONFLICT`) because the existing
--     UNIQUE(persna_id, capability_key, experience, scope_type, scope_id, source)
--     treats NULL `scope_id` as DISTINCT in PostgreSQL, so `ON CONFLICT` could not
--     de-duplicate rows where every column is identical except `scope_id IS NULL`.
--   * `revoked_at` is never set; deletes are physical so re-assigning the same
--     role later cleanly re-creates the row. The helper always inserts active rows.
--
-- Mapping (per task spec, aligned with PLATFORM_CAPABILITIES at
-- `lib/platform/experiences.ts:60-77`):
--   admin             → pastoral.admin.manage, pastoral.read.all               (experience)
--   pastor            → pastoral.read.all, pastoral.metrics.read,
--                       pastoral.crisis.detect, pastoral.mentor.cascade.resolve (experience)
--   director-general  → pastoral.read.all                                      (experience)
--   director-etapa    → pastoral.one_on_one.read                               (one_on_one)
--   lider             → pastoral.one_on_one.create, read, write_notes,
--                       validate_step, complete                                (one_on_one)
--   colider           → pastoral.one_on_one.read                               (one_on_one)
--   miembro           → ∅ (no pastoral grants)
--
-- The runtime gates (`requirePastoralSession`, `route-access.ts`) check
-- `scopeType` against `PLATFORM_CAPABILITIES`, so we insert with the canonical
-- scope_types `experience` / `one_on_one` (not the legacy Spanish spelling
-- `experiencia` that was normalized away by 20260725140000 and 20260725230000).
-- ════════════════════════════════════════════════════════════════════

-- 1) Static mapping table: rol → (capability_key, scope_type).
--    Owned by postgres, never read by RLS — this is the single source of truth
--    that the trigger consults on every role change.

CREATE TABLE IF NOT EXISTS public.pastoral_role_capability_map (
  rol text NOT NULL,
  capability_key text NOT NULL,
  scope_type text NOT NULL,
  PRIMARY KEY (rol, capability_key, scope_type)
);

INSERT INTO public.pastoral_role_capability_map (rol, capability_key, scope_type) VALUES
  -- admin
  ('admin',            'pastoral.admin.manage',                 'experience'),
  ('admin',            'pastoral.read.all',                     'experience'),
  -- pastor
  ('pastor',           'pastoral.read.all',                     'experience'),
  ('pastor',           'pastoral.metrics.read',                 'experience'),
  ('pastor',           'pastoral.crisis.detect',                'experience'),
  ('pastor',           'pastoral.mentor.cascade.resolve',       'experience'),
  -- director-general
  ('director-general', 'pastoral.read.all',                     'experience'),
  -- director-etapa
  ('director-etapa',   'pastoral.one_on_one.read',              'one_on_one'),
  -- lider
  ('lider',            'pastoral.one_on_one.create',            'one_on_one'),
  ('lider',            'pastoral.one_on_one.read',              'one_on_one'),
  ('lider',            'pastoral.one_on_one.write_notes',       'one_on_one'),
  ('lider',            'pastoral.one_on_one.validate_step',     'one_on_one'),
  ('lider',            'pastoral.one_on_one.complete',          'one_on_one'),
  -- colider
  ('colider',          'pastoral.one_on_one.read',              'one_on_one')
  -- miembro: no pastoral grants on purpose
ON CONFLICT DO NOTHING;

-- 2) Helper: insert grants for a given persona + rol. Idempotent (WHERE NOT EXISTS).

CREATE OR REPLACE FUNCTION public.assign_pastoral_capabilities_for_role(
  p_persona_id uuid,
  p_rol        text
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
    'pastoral',
    m.scope_type,
    NULL,
    'role-auto-grant',
    now()
  FROM public.pastoral_role_capability_map m
  WHERE m.rol = p_rol
    AND NOT EXISTS (
      SELECT 1 FROM public.dream_team_capability_grants g
      WHERE g.persona_id   = p_persona_id
        AND g.capability_key = m.capability_key
        AND g.experience     = 'pastoral'
        AND g.scope_type     = m.scope_type
        AND g.source         = 'role-auto-grant'
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_pastoral_capabilities_for_role(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_pastoral_capabilities_for_role(uuid, text) TO service_role;

-- 3) Trigger function: reconcile grants whenever a role link changes.

CREATE OR REPLACE FUNCTION public.sync_pastoral_grants_on_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_persona_id uuid;
  v_rol        text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_persona_id := OLD.usuario_id;
    SELECT rs.nombre_interno INTO v_rol
      FROM public.roles_sistema rs
      WHERE rs.id = OLD.rol_id;
    IF v_rol IS NULL THEN
      RETURN OLD;
    END IF;
    -- Remove every pastoral role-auto-grant tied to this persona + rol.
    DELETE FROM public.dream_team_capability_grants g
      USING public.pastoral_role_capability_map m
      WHERE g.persona_id     = v_persona_id
        AND g.experience     = 'pastoral'
        AND g.source         = 'role-auto-grant'
        AND m.rol            = v_rol
        AND m.capability_key = g.capability_key
        AND m.scope_type     = g.scope_type;
    RETURN OLD;
  END IF;

  -- INSERT or UPDATE: figure out the rol name and grant.
  v_persona_id := NEW.usuario_id;
  SELECT rs.nombre_interno INTO v_rol
    FROM public.roles_sistema rs
    WHERE rs.id = NEW.rol_id;
  IF v_rol IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.assign_pastoral_capabilities_for_role(v_persona_id, v_rol);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_pastoral_grants_on_role_change() FROM PUBLIC, anon, authenticated;

-- 4) Trigger: AFTER INSERT OR UPDATE OR DELETE on usuario_roles, per row.

DROP TRIGGER IF EXISTS trg_sync_pastoral_grants_on_role_change ON public.usuario_roles;
CREATE TRIGGER trg_sync_pastoral_grants_on_role_change
  AFTER INSERT OR UPDATE OR DELETE ON public.usuario_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_pastoral_grants_on_role_change();

-- No RLS changes needed: `usuario_roles` is already managed by service_role / RPC.
-- The trigger is SECURITY DEFINER, so even authenticated callers of INSERT/UPDATE/
-- DELETE on `usuario_roles` (if any exist) will fire the grant reconciliation.
