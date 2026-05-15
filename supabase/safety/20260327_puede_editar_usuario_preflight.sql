-- ==========================================================================
-- Preflight seguro para producción: puede_editar_usuario
--
-- Este archivo es de verificación/manual safety. NO aplica la migración.
-- Las consultas de preflight son read-only. La sección de rollback es una
-- plantilla: solo usarla pegando la definición anterior guardada.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1) Preflight: confirmar funciones y dependencias
-- --------------------------------------------------------------------------

select
  to_regprocedure('public.puede_editar_usuario(uuid, uuid)') as puede_editar_usuario,
  to_regprocedure('public.es_director_general_de_grupo(uuid, uuid)') as es_director_general_de_grupo;

-- Esperado:
-- - es_director_general_de_grupo NO debe ser null.
-- - puede_editar_usuario normalmente NO debe ser null en producción.
--   Si es null, detenerse y documentar que esta migración crea la función.

-- --------------------------------------------------------------------------
-- 2) Backup: guardar definición actual ANTES de aplicar la migración
-- --------------------------------------------------------------------------

with current_function as (
  select to_regprocedure('public.puede_editar_usuario(uuid, uuid)') as function_oid
)
select
  case
    when function_oid is null then 'FUNCTION_NOT_FOUND: detenerse y documentar que esta migración creará la función por primera vez.'
    else pg_get_functiondef(function_oid)
  end as current_function_definition
from current_function;

-- Guardar la salida completa en un archivo/nota segura.
-- Ese texto es el rollback principal.

-- --------------------------------------------------------------------------
-- 3) Auditoría read-only de la migración local
-- --------------------------------------------------------------------------

-- Revisión manual requerida sobre:
-- supabase/migrations/20260327_001_puede_editar_usuario.sql
--
-- Permitido en esta migración:
-- - CREATE OR REPLACE FUNCTION public.puede_editar_usuario(...)
-- - REVOKE ALL ON FUNCTION public.puede_editar_usuario(uuid, uuid) FROM PUBLIC
-- - GRANT EXECUTE ON FUNCTION public.puede_editar_usuario(uuid, uuid) TO authenticated
--
-- No debe contener:
-- - DELETE
-- - DROP TABLE / DROP SCHEMA
-- - TRUNCATE
-- - UPDATE de datos
-- - INSERT de datos
-- - ALTER TABLE destructivo

-- --------------------------------------------------------------------------
-- 4) Smoke tests manuales POST-aplicación
-- --------------------------------------------------------------------------
-- Reemplazar los UUIDs por casos reales conocidos.
-- Cada consulta es read-only: solo ejecuta SELECT contra la RPC.

-- 4.1 Admin/Pastor debe poder editar al objetivo
-- with params as (
--   select
--     '<ADMIN_OR_PASTOR_AUTH_ID>'::uuid as actor_auth_id,
--     '<TARGET_USER_ID>'::uuid as target_user_id
-- )
-- select 'admin_or_pastor_can_edit' as scenario,
--        public.puede_editar_usuario(actor_auth_id, target_user_id) as allowed
-- from params;
-- Esperado: allowed = true

-- 4.2 Usuario debe poder editarse a sí mismo
-- with params as (
--   select
--     '<USER_AUTH_ID>'::uuid as actor_auth_id,
--     '<SAME_USER_INTERNAL_ID>'::uuid as target_user_id
-- )
-- select 'self_edit' as scenario,
--        public.puede_editar_usuario(actor_auth_id, target_user_id) as allowed
-- from params;
-- Esperado: allowed = true

-- 4.3 Líder con miembro activo en su grupo debe poder editar
-- with params as (
--   select
--     '<LEADER_AUTH_ID>'::uuid as actor_auth_id,
--     '<ACTIVE_MEMBER_IN_LEADER_GROUP_USER_ID>'::uuid as target_user_id
-- )
-- select 'leader_same_active_group' as scenario,
--        public.puede_editar_usuario(actor_auth_id, target_user_id) as allowed
-- from params;
-- Esperado: allowed = true

-- 4.4 Líder fuera de alcance NO debe poder editar
-- with params as (
--   select
--     '<LEADER_AUTH_ID>'::uuid as actor_auth_id,
--     '<USER_OUTSIDE_LEADER_GROUP_USER_ID>'::uuid as target_user_id
-- )
-- select 'leader_outside_scope_denied' as scenario,
--        public.puede_editar_usuario(actor_auth_id, target_user_id) as allowed
-- from params;
-- Esperado: allowed = false

-- 4.5 Director de etapa con grupo asignado debe poder editar miembro activo
-- with params as (
--   select
--     '<DIRECTOR_ETAPA_AUTH_ID>'::uuid as actor_auth_id,
--     '<ACTIVE_MEMBER_IN_ASSIGNED_GROUP_USER_ID>'::uuid as target_user_id
-- )
-- select 'director_etapa_assigned_group' as scenario,
--        public.puede_editar_usuario(actor_auth_id, target_user_id) as allowed
-- from params;
-- Esperado: allowed = true

-- 4.6 Director general dentro de su alcance debe poder editar
-- with params as (
--   select
--     '<DIRECTOR_GENERAL_AUTH_ID>'::uuid as actor_auth_id,
--     '<ACTIVE_MEMBER_IN_DG_SCOPE_USER_ID>'::uuid as target_user_id
-- )
-- select 'director_general_scoped_group' as scenario,
--        public.puede_editar_usuario(actor_auth_id, target_user_id) as allowed
-- from params;
-- Esperado: allowed = true

-- 4.7 Director general fuera de alcance NO debe poder editar
-- with params as (
--   select
--     '<DIRECTOR_GENERAL_AUTH_ID>'::uuid as actor_auth_id,
--     '<USER_OUTSIDE_DG_SCOPE_USER_ID>'::uuid as target_user_id
-- )
-- select 'director_general_outside_scope_denied' as scenario,
--        public.puede_editar_usuario(actor_auth_id, target_user_id) as allowed
-- from params;
-- Esperado: allowed = false

-- --------------------------------------------------------------------------
-- 5) Rollback template
-- --------------------------------------------------------------------------
-- Si hay que volver atrás, pegar y ejecutar AQUÍ la definición completa que
-- salió de pg_get_functiondef(...) antes de aplicar la migración.
--
-- IMPORTANTE:
-- - No inventar una función rollback a mano.
-- - No usar DROP FUNCTION salvo revisión explícita.
-- - Reaplicar grants anteriores si eran distintos.
--
-- Ejemplo de forma, NO ejecutar tal cual:
--
-- CREATE OR REPLACE FUNCTION public.puede_editar_usuario(...)
-- RETURNS boolean
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- AS $$
--   -- definición anterior guardada
-- $$;
