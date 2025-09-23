-- Desambiguar versiones antiguas de listar_usuarios_con_permisos
-- Ejecuta esto primero si el editor te dice que el nombre no es único

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Dropear TODAS las sobrecargas existentes en public.listar_usuarios_con_permisos
  FOR r IN
    SELECT pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'listar_usuarios_con_permisos'
  LOOP
    EXECUTE format('DROP FUNCTION public.listar_usuarios_con_permisos(%s);', r.args);
  END LOOP;
END $$;
