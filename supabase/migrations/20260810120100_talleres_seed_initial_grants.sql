-- ════════════════════════════════════════════════════════════════════
-- PR3 — DT-012 — F5 bootstrap seed: initial director grants.
-- Fase 5 (operating). Additive only, no destructive DDL (I-6).
--
-- Bootstrap seed: this migration is a no-op if no director service
-- exists yet (the typical staging/empty state on first deploy). It
-- exists so that, in environments where one or more director
-- servicios already exist (e.g. a database seeded from a previous
-- F5 run, or a greenfield install with a hand-picked director),
-- every active director for the talleres experience receives the
-- canonical director capability set right away — without waiting
-- for an INSERT/UPDATE/DELETE event to fire the auto-grant trigger
-- (DT-011).
--
-- Identity:
--   * Grants are tagged source = 'role-auto-grant' so reconciliation
--     treats them identically to trigger-granted rows.
--   * Idempotent: ON CONFLICT DO NOTHING on the canonical UNIQUE
--     constraint (persona_id, capability_key, experience,
--     scope_type, scope_id, source). scope_id = s.equipo_id matches
--     the runtime auto-grant (DT-011) which sets scope_id := p_taller_id
--     (= dream_team_servicios.equipo_id) per design §3 (F5 1:1
--     taller↔equipo model). One row per (director, taller) — exactly
--     matching what the trigger would produce on the next mutation.
--   * No manual grants: every row is system-managed (source
--     attribution is mandatory by design §14).
--
-- Companion trigger: the auto-grant trigger in DT-011
-- (20260810120000_talleres_role_auto_grant.sql) is the source of
-- truth for runtime reconciliation. This seed only closes the
-- bootstrap gap for personas that were director BEFORE PR3 landed.
-- ════════════════════════════════════════════════════════════════════

-- Director capability set per design §4:
--   director.read, director.write, admin.manage, metrics.read.
-- The four rows use experience='talleres_crecimiento',
-- scope_type='taller' and scope_id=s.equipo_id — identical to the
-- runtime auto-grant in DT-011 so the bootstrap row matches what
-- the trigger would produce on the next mutation (closes R3-3).

INSERT INTO public.dream_team_capability_grants (
  persona_id, capability_key, experience, scope_type, scope_id, source, granted_at
)
SELECT
  s.persona_id,
  c.capability_key,
  'talleres_crecimiento',
  'taller',
  s.equipo_id,
  'role-auto-grant',
  now()
FROM public.dream_team_servicios s
JOIN public.dream_team_equipos   eq ON eq.id = s.equipo_id
JOIN public.dream_team_roles      r  ON r.id  = s.rol_id
CROSS JOIN (VALUES
  ('talleres_crecimiento.director.read'),
  ('talleres_crecimiento.director.write'),
  ('talleres_crecimiento.admin.manage'),
  ('talleres_crecimiento.metrics.read')
) AS c(capability_key)
WHERE eq.experiencia = 'talleres_crecimiento'
  AND s.estado       = 'activo'
  AND r.label        = 'director'
ON CONFLICT DO NOTHING;

-- No RLS changes: writes flow through service_role / privileged RPC
-- exactly like the auto-grant trigger in DT-011.
