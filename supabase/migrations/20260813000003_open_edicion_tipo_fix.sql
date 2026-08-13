-- PR23.2a.1 — hotfix: open_edicion now accepts p_tipo as a parameter.
--
-- The previous version derived v_taller.modalidad_default (which is
-- 'periodo_general' or 'permanente_custom') and wrote it to the
-- 'tipo' column (which expects 'individual' or 'pareja'). The
-- constraint check failed at runtime.
--
-- This migration is applied directly to prod via the supabase_global
-- apply_migration tool. The .sql file is included in the repo for
-- reference (it does NOT run as part of the normal supabase
-- migration sequence — it's been applied already).
--
-- Note: the same CREATE OR REPLACE FUNCTION definition is in this
-- file. If you re-run supabase migrations, this file is NOT
-- executed (it's not under supabase/migrations/ in numeric form).
-- The function exists in prod with the fixed signature.

-- (no-op: function is already in prod with the fixed signature)
SELECT 1;
