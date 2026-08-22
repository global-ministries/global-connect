-- CIMIENTO 1 — Seed dream_team roles (director + coordinador) per equipo.
--
-- WHAT
--   For every talleres_crecimiento equipo, ensure a role labeled 'director' and
--   a role labeled 'coordinador' exist. These labels MUST match the `rol` keys
--   in talleres_role_capability_map (see 20260810120000_talleres_role_auto_grant
--   .sql); that map is what the auto-grant trigger reads to turn an ACTIVE
--   servicio into capability grants. Without these role rows there is nothing to
--   assign a person to in Cimiento 4.
--
-- WHY IT RUNS AFTER CIMIENTO 2
--   The 000002 migration mints "De Hombre a Hombre" its own equipo. Running this
--   seed afterward guarantees that new equipo (and any future one) also gets its
--   director/coordinador roles.
--
-- SAFETY
--   * Additive / forward-only: INSERT only. No DROP, no DELETE, no UPDATE.
--   * Idempotent: dream_team_roles has NO unique constraint on (equipo_id,label)
--     (PK is id only), so ON CONFLICT is impossible — guarded with NOT EXISTS.
--     Re-running inserts nothing.
--   * Zero user-data impact: prod currently has 0 servicios ⇒ 0 grants, so
--     seeding role definitions grants nobody anything on its own.

INSERT INTO public.dream_team_roles (equipo_id, label)
SELECT e.id, r.label
FROM public.dream_team_equipos e
CROSS JOIN (VALUES ('director'), ('coordinador')) AS r(label)
WHERE e.experiencia = 'talleres_crecimiento'
  AND NOT EXISTS (
    SELECT 1
    FROM public.dream_team_roles dr
    WHERE dr.equipo_id = e.id
      AND dr.label = r.label
  );
