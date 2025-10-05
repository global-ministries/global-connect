-- Limpieza: eliminar función obsoleta ya reemplazada por listar_usuarios_con_permisos + endpoint /api/usuarios/buscar-para-relacion
-- Solo se creó en la migración 20251004100000_funcion_buscar_usuarios_gestion.sql y nunca se volvió a usar.

DROP FUNCTION IF EXISTS public.buscar_usuarios_para_gestion(text, uuid);
