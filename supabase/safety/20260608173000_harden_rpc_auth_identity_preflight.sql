-- ============================================================================
-- Safe production preflight: user-facing RPC identity hardening
--
-- This file is read-only verification guidance. It does not apply the migration.
-- Never use this issue to delete, truncate, backfill, or clean production data.
-- ============================================================================

-- 1) Confirm current target functions and grants before applying migration.
select
  p.oid::regprocedure::text as signature,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'registrar_asistencia',
    'agregar_miembro_a_grupo',
    'actualizar_rol_miembro',
    'eliminar_miembro_de_grupo'
  )
order by signature;

-- Expected before migration:
-- - security_definer = true
-- - anon_execute may be true, which is the vulnerability being fixed.

-- 2) Save definitions before applying the migration for manual rollback planning.
select
  p.oid::regprocedure::text as signature,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'registrar_asistencia',
    'agregar_miembro_a_grupo',
    'actualizar_rol_miembro',
    'eliminar_miembro_de_grupo'
  )
order by signature;

-- 3) Post-application read-only verification.
select
  p.oid::regprocedure::text as signature,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
  position('p_auth_id IS DISTINCT FROM auth.uid()' in pg_get_functiondef(p.oid)) > 0 as checks_auth_uid
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'registrar_asistencia',
    'agregar_miembro_a_grupo',
    'actualizar_rol_miembro',
    'eliminar_miembro_de_grupo'
  )
order by signature;

-- Expected after migration:
-- - anon_execute = false for every target function.
-- - authenticated_execute = true for normal application flows.
-- - service_role_execute = true for trusted admin/server scripts.
-- - checks_auth_uid = true for identity spoofing protection.

-- 4) Same-pattern audit candidates. Do not change them blindly in this migration.
select
  p.oid::regprocedure::text as signature,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  position('p_auth_id' in pg_get_function_arguments(p.oid)) > 0 as has_p_auth_id,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and position('p_auth_id' in pg_get_function_arguments(p.oid)) > 0
order by signature;
