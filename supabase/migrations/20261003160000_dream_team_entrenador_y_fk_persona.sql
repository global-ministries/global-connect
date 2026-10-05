-- Dream Team: a foreign key from dream_team_servicios.persona_id to usuarios(id)
-- (T1 of odd/tasks/ninos-voluntarios-waumba.md, which also makes "entrenador"
-- grant what "lider" grants).
--
-- What: dream_team_servicios.persona_id references usuarios(id), ON DELETE
-- RESTRICT. The key is added NOT VALID and then validated: the ADD holds its
-- lock only for an instant, and the check of the existing rows runs under SHARE
-- UPDATE EXCLUSIVE, which does not block reads or writes of the table.
--
-- Why: persona_id had no key, so a servicio could point at a person who does
-- not exist, and deleting a usuario would leave its servicios orphaned. Checked
-- read-only before writing this: 0 orphans out of 38 servicios on staging and
-- 0 out of 38 on production.
--
-- Why RESTRICT, from the evidence:
--   - No flow deletes usuarios. The app has no delete of usuarios, no SQL
--     function deletes from usuarios, usuarios has no DELETE policy, and there
--     is no duplicate merge. Deleting an auth user sets usuarios.auth_id to
--     NULL (usuarios_auth_id_fkey) and keeps the row.
--   - CASCADE would silently delete a person's service history. SET NULL is not
--     possible (persona_id is NOT NULL) and would lose who served anyway.
--   - RESTRICT is what the talleres history tables already do
--     (taller_asistencias, taller_certificados, taller_eventos, ...).
--   A future merge of duplicate people must move the servicios to the person
--   that stays before deleting the other one.
--
-- Entrenador: the role → capability mapping lives only in TypeScript
-- (lib/platform/dream-team/grants.ts). dream_team_apply_servicio_grants
-- receives the grants already computed and maps no label, and no SQL function,
-- policy or catalog table maps Dream Team role labels (checked on staging).
-- dream_team_capability_grants.scope_type already accepts 'equipo', the scope
-- type ninos.team.serve now uses. So that part needs no SQL.
--
-- idx_dream_team_servicios_persona already indexes persona_id, so the RESTRICT
-- check that a usuarios delete runs does not scan the table.
--
-- Rollback:
--   ALTER TABLE public.dream_team_servicios
--     DROP CONSTRAINT IF EXISTS dream_team_servicios_persona_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.dream_team_servicios'::regclass
       AND conname = 'dream_team_servicios_persona_id_fkey'
  ) THEN
    ALTER TABLE public.dream_team_servicios
      ADD CONSTRAINT dream_team_servicios_persona_id_fkey
      FOREIGN KEY (persona_id) REFERENCES public.usuarios (id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.dream_team_servicios
  VALIDATE CONSTRAINT dream_team_servicios_persona_id_fkey;
