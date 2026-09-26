-- ════════════════════════════════════════════════════════════════════
-- Fix latent uuid/text mismatch in
-- sync_talleres_grants_on_servicio_change (the auto-grant/auto-revoke
-- trigger function on public.dream_team_servicios).
--
-- ROOT CAUSE (verified in production, reproduced on staging): this
-- function's UPDATE branch and DELETE branch both compare
--   g.scope_id = v_taller_old
-- where public.dream_team_capability_grants.scope_id is TEXT and
-- v_taller_old is a local uuid variable (assigned from
-- OLD.equipo_id / dream_team_servicios.equipo_id, a uuid column).
-- Comparing text = uuid with no cast has no operator, so Postgres
-- raises:
--     42883: operator does not exist: text = uuid
-- and the whole dream_team_servicios statement rolls back with it.
--
-- BLAST RADIUS: any equipo with experiencia='talleres_crecimiento'
-- whose rol is in talleres_role_capability_map (director,
-- coordinador) hits this on every UPDATE of the row (e.g.
-- postulado→activo, activo→en_pausa, activo→activo with a rol
-- change) and on every DELETE. The DELETE branch:
--
--   DELETE FROM public.dream_team_capability_grants g
--     USING public.talleres_role_capability_map m
--     WHERE g.persona_id = v_persona_old AND ...
--       AND g.scope_id = v_taller_old            -- ← bare compare
--       AND m.capability_key = g.capability_key;
--
-- and the UPDATE branch's "revoke prior grants" step:
--
--   DELETE FROM public.dream_team_capability_grants g
--     USING public.talleres_role_capability_map m
--     WHERE g.persona_id = v_persona_new AND ...
--       AND g.scope_id = v_taller_old            -- ← bare compare
--       AND m.capability_key = g.capability_key AND m.rol = ...;
--
-- both crash before the function ever reaches the INSERT-as-activo
-- PERFORM public.assign_talleres_capabilities_for_role(...) call —
-- which is why this stayed latent: the INSERT path (a brand-new
-- servicio row going straight to estado='activo') never runs either
-- DELETE branch, so 20260822000002_talleres_fix_assign_capabilities_
-- uuid_text.sql (which cast p_taller_id::text inside that helper)
-- fixed the INSERT path but missed these two DELETE branches, which
-- only fire on UPDATE/DELETE of an existing dream_team_servicios row.
--
-- FIX: cast v_taller_old::text at both comparison sites. scope_id
-- stays TEXT (its canonical type, matching assign_talleres_
-- capabilities_for_role's p_taller_id::text cast and the scoped RLS
-- gate's own p_equipo_id::text cast). Nothing else in the function
-- body changes — same branches, same control flow, same trigger.
--
-- SAFETY: additive / forward-only (CREATE OR REPLACE, body only). No
-- data touched, no DDL on the trigger, the map table, or any other
-- object. Privileges are preserved by CREATE OR REPLACE; the REVOKE
-- is re-stated below only to keep this migration self-contained and
-- match the original grant posture from 20260810120000_talleres_
-- role_auto_grant.sql.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sync_talleres_grants_on_servicio_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
        AND g.scope_id       = v_taller_old::text
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
        AND g.scope_id       = v_taller_old::text
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
