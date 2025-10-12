-- Consolidar políticas de lectura de segmento_lideres usando función SECURITY DEFINER.
-- Objetivo: permitir a roles superiores, al propio líder y a cualquier usuario que necesite ver directores de etapa para crear grupos.
-- Después de esto se puede eliminar la policy temporal.

CREATE OR REPLACE FUNCTION public._puede_ver_segmento_lider(sl_row segmento_lideres)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_es_superior boolean;
BEGIN
  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  -- Rol superior
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON rs.id = ur.rol_id
    WHERE ur.usuario_id = v_user AND rs.nombre_interno IN ('admin','pastor','director-general')
  ) INTO v_es_superior;

  IF v_es_superior THEN
    RETURN true; -- ve todas las filas
  END IF;

  -- Propietario (líder/director asociado)
  IF sl_row.usuario_id = v_user THEN
    RETURN true;
  END IF;

  -- (Opcional) Podríamos extender para líderes de grupos del segmento; por ahora no.
  RETURN false;
END;$$;

-- Eliminar policy temporal si existe (no falla si no existe en supabase CLI, se puede envolver en DO).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'segmento_lideres_select_director_etapa_temporal') THEN
    EXECUTE 'DROP POLICY segmento_lideres_select_director_etapa_temporal ON public.segmento_lideres';
  END IF;
END;$$;

-- Eliminar las policies anteriores específicas si queremos consolidar (opcional, solo si conoces los nombres exactos)
-- Mantendremos las existentes de roles_superiores y self para no afectar en caliente; la nueva policy es adicional.

CREATE POLICY segmento_lideres_select_consolidada ON public.segmento_lideres
FOR SELECT USING ( public._puede_ver_segmento_lider(segmento_lideres) );
