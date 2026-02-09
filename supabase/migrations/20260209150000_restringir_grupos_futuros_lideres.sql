-- Migración: 20260209150000_restringir_grupos_futuros_lideres.sql
-- Objetivo: Los líderes/colíderes/miembros NO pueden ver grupos de temporadas futuras
-- Los directores de etapa y roles superiores SÍ pueden ver grupos futuros

-- 1. Actualizar puede_ver_grupo para excluir grupos futuros de líderes/miembros
CREATE OR REPLACE FUNCTION public.puede_ver_grupo(p_user_id uuid, p_grupo_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_superior boolean := false;
  v_is_director_etapa boolean := false;
  v_is_grupo_futuro boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_grupo_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Admin/Pastor/Director General: acceso total (incluye grupos inactivos/futuros)
  SELECT TRUE INTO v_is_superior
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = p_user_id AND rs.nombre_interno IN ('admin','pastor','director-general')
  LIMIT 1;

  IF v_is_superior THEN
    RETURN TRUE;
  END IF;

  -- Director de Etapa: acceso si está asignado explícitamente al grupo (incluye futuros)
  SELECT TRUE INTO v_is_director_etapa
  FROM public.usuario_roles ur
  JOIN public.roles_sistema rs ON rs.id = ur.rol_id
  WHERE ur.usuario_id = p_user_id AND rs.nombre_interno = 'director-etapa'
  LIMIT 1;

  IF v_is_director_etapa THEN
    IF EXISTS (
      SELECT 1
      FROM public.director_etapa_grupos deg
      JOIN public.segmento_lideres sl ON deg.director_etapa_id = sl.id
      WHERE deg.grupo_id = p_grupo_id
        AND sl.usuario_id = p_user_id
        AND sl.tipo_lider = 'director_etapa'
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Líder/Colíder/Miembro: solo si pertenece al grupo Y el grupo NO es futuro
  -- Primero verificamos si el grupo es de una temporada futura
  SELECT EXISTS (
    SELECT 1 FROM public.grupos g
    JOIN public.temporadas t ON t.id = g.temporada_id
    WHERE g.id = p_grupo_id AND t.fecha_inicio > CURRENT_DATE
  ) INTO v_is_grupo_futuro;

  -- Si el grupo es futuro, los líderes/miembros NO pueden verlo, SALVO que esté activo y en temporada activa
  IF v_is_grupo_futuro THEN
    -- Verificar excepción: Grupo Activo AND Temporada Activa
    IF NOT EXISTS (
      SELECT 1 FROM public.grupos g
      JOIN public.temporadas t ON t.id = g.temporada_id
      WHERE g.id = p_grupo_id 
        AND g.activo IS TRUE 
        AND t.activa IS TRUE
    ) THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Para grupos no-futuros, verificar membresía normal
  IF EXISTS (
    SELECT 1 FROM public.grupo_miembros gm
    WHERE gm.grupo_id = p_grupo_id AND gm.usuario_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.puede_ver_grupo(uuid, uuid) IS 'Verifica si un usuario puede ver un grupo. Los líderes/miembros NO pueden ver grupos de temporadas futuras.';
