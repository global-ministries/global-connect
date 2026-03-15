-- Eliminar RPCs de debug de producción
-- Estas funciones eran herramientas de desarrollo para cambiar roles desde el frontend

DROP FUNCTION IF EXISTS public.debug_cambiar_rol(uuid, text);
DROP FUNCTION IF EXISTS public.debug_cambiar_rol_usuario(uuid, text);
