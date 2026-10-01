-- director_etapa_grupos: one link per (director, group), and retire an unsafe RPC.
--
-- 0. Lock. SHARE ROW EXCLUSIVE blocks concurrent writes (reads stay allowed) for the rest
--    of the transaction, so no insert can recreate a duplicate between the dedupe and
--    ADD CONSTRAINT.
-- 1. Dedupe. Idempotent clean-up of duplicate (director_etapa_id, grupo_id) pairs,
--    keeping the lowest id. It is a no-op in production (188 rows) and staging
--    (207 rows) today, but keeps fresh or drifted environments from failing step 2.
-- 2. UNIQUE (director_etapa_id, grupo_id). Concurrent assigns (two requests, or a
--    couple's spouse insert racing the pre-check in the API) can no longer create
--    duplicate links. Guarded through pg_constraint so re-running does not fail.
-- 3. DROP asignar_director_etapa_a_grupo(uuid, uuid, uuid, text). Defined by
--    20251006151500 but never applied in production or staging. It is unsafe: it trusts
--    a caller-supplied p_auth_id and its role check never raises. No app code calls
--    it; assignments go through the API routes, which check roles.
--
-- Rollback:
--   ALTER TABLE public.director_etapa_grupos DROP CONSTRAINT director_etapa_grupos_director_grupo_key;
--   (Deleted duplicates cannot be restored; there are none in production or staging.
--    The dropped function is NOT recommended to be recreated: see 20251006151500.)

LOCK TABLE public.director_etapa_grupos IN SHARE ROW EXCLUSIVE MODE;

DELETE FROM public.director_etapa_grupos d
 WHERE d.id IN (
   SELECT dup.id
     FROM (
       SELECT id,
              row_number() OVER (PARTITION BY director_etapa_id, grupo_id ORDER BY id) AS rn
         FROM public.director_etapa_grupos
     ) dup
    WHERE dup.rn > 1
 );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.director_etapa_grupos'::regclass
       AND conname = 'director_etapa_grupos_director_grupo_key'
  ) THEN
    ALTER TABLE public.director_etapa_grupos
      ADD CONSTRAINT director_etapa_grupos_director_grupo_key UNIQUE (director_etapa_id, grupo_id);
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.asignar_director_etapa_a_grupo(uuid, uuid, uuid, text);
