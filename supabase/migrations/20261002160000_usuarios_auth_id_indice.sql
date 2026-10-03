-- Index on usuarios.auth_id (follow-up of the role predicates in plpgsql).
--
-- What: a partial unique index on usuarios.auth_id, in the shape of the existing
-- unique_cedula_nonnull and unique_email_nonnull indexes.
--
-- Why: every role and permission predicate resolves the person from the session
-- with `WHERE u.auth_id = p_auth_id`, and RLS policies call them per row. The
-- column had no index on staging or production, so each call read through the
-- whole table. Unique because one account maps to one person: the predicates
-- and the app take the single row for an auth id, and both databases already
-- hold no duplicates (131 and 136 distinct non-null values, no repeats).
--
-- Rollback: DROP INDEX IF EXISTS public.unique_auth_id_nonnull;

CREATE UNIQUE INDEX IF NOT EXISTS unique_auth_id_nonnull
  ON public.usuarios USING btree (auth_id)
  WHERE (auth_id IS NOT NULL);
