-- ==========================================================================
-- Migración: Revocar ejecución anónima de puede_editar_usuario
-- Contexto: producción tenía un GRANT explícito previo para anon. Revocar
-- PUBLIC no elimina permisos explícitos asignados al rol anon.
-- ==========================================================================

REVOKE EXECUTE ON FUNCTION public.puede_editar_usuario(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.puede_editar_usuario(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_editar_usuario(uuid, uuid) TO authenticated;
