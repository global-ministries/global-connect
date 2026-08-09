-- ════════════════════════════════════════════════════════════════════
-- PR2 — DT-006 / DT-007 / DT-008 — Talleres auth + scope helpers
-- Fase 5 (operating). Additive only, no destructive DDL (I-6).
--
-- DT-006: auth_has_talleres_capability(p_capability_key text) —
--   signature byte-identical to F4 precedent
--   (20260722143357_pastoral_helper_auth_has_capability.sql).
-- DT-007: scope helpers puede_editar_taller_grupo /
--   puede_gestionar_participantes_taller_grupo / puede_ver_taller_grupo
--   (all LANGUAGE sql STABLE SECURITY DEFINER).
-- DT-008: GRANT EXECUTE ON FUNCTION ... TO authenticated, service_role.
--
-- Identity resolution (canonical, proven): grants store persona references
-- via `public.usuarios.id`, and the authenticated identity is resolved with
-- `usuarios.auth_id = auth.uid()`. This follows the pastoral drift-fix
-- (20260725130000_pastoral_capability_helper_drift_fix.sql) — NEVER compare
-- the grants persona column directly against auth.uid() (auth.uid() is
-- auth.users.id; the grants table holds usuarios.id, so the two never meet
-- without the usuarios join).
--
-- Grants live in the F2 table `public.dream_team_capability_grants`
-- (20260707183000_dream_team_base.sql), reused by F4.
-- ════════════════════════════════════════════════════════════════════

-- DT-006 — main capability gate used by every RLS policy.
CREATE OR REPLACE FUNCTION public.auth_has_talleres_capability(p_capability_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dream_team_capability_grants g
    WHERE g.persona_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
      AND g.capability_key = p_capability_key
      AND g.experience = 'talleres_crecimiento'
      AND g.revoked_at IS NULL
  )
$$;

-- DT-007 — Scope helpers (group-scoped RLS gates).
-- Every helper resolves the caller through auth.uid() server-side and
-- checks the granted capability set for the given taller group scope.
-- The experience and scope filters keep cross-experience grants isolated.

-- Can edit a workshop group: leads, coordinators and directors that hold
-- the matching write capability for that group's scope.
CREATE OR REPLACE FUNCTION public.puede_editar_taller_grupo(p_grupo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dream_team_capability_grants g
    WHERE g.persona_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
      AND g.experience = 'talleres_crecimiento'
      AND g.capability_key IN (
        'talleres_crecimiento.lead.write',
        'talleres_crecimiento.coordinator.write',
        'talleres_crecimiento.director.write'
      )
      AND g.scope_type = 'taller'
      AND g.scope_id = p_grupo_id
      AND g.revoked_at IS NULL
  )
$$;

-- Can manage participants of that group (enrollment decisions require
-- coordinator/director authority per enrollment spec: approval and
-- rejection are coordinator/director actions only).
CREATE OR REPLACE FUNCTION public.puede_gestionar_participantes_taller_grupo(p_grupo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dream_team_capability_grants g
    WHERE g.persona_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
      AND g.experience = 'talleres_crecimiento'
      AND g.capability_key IN (
        'talleres_crecimiento.coordinator.write',
        'talleres_crecimiento.director.write'
      )
      AND g.scope_type = 'taller'
      AND g.scope_id = p_grupo_id
      AND g.revoked_at IS NULL
  )
$$;

-- Can view that group (leaders, volunteers, coordinators, directors with
-- the matching read capability for its scope).
CREATE OR REPLACE FUNCTION public.puede_ver_taller_grupo(p_grupo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dream_team_capability_grants g
    WHERE g.persona_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
      AND g.experience = 'talleres_crecimiento'
      AND g.capability_key IN (
        'talleres_crecimiento.lead.read',
        'talleres_crecimiento.volunteer.read',
        'talleres_crecimiento.coordinator.read',
        'talleres_crecimiento.director.read'
      )
      AND g.scope_type = 'taller'
      AND g.scope_id = p_grupo_id
      AND g.revoked_at IS NULL
  )
$$;

-- DT-008 — Restrict execution; RLS policies evaluate these internally.
REVOKE ALL ON FUNCTION public.auth_has_talleres_capability(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_has_talleres_capability(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.puede_editar_taller_grupo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.puede_editar_taller_grupo(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.puede_gestionar_participantes_taller_grupo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_participantes_taller_grupo(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.puede_ver_taller_grupo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.puede_ver_taller_grupo(uuid) TO authenticated, service_role;