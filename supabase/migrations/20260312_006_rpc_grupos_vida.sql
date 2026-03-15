-- Migración 006: RPCs para Grupos de Vida
-- 4 funciones: obtener cónyuge, permisos de casas, aprobación de casa, asignación de líder matrimonio.
-- CREATE OR REPLACE para idempotencia.

-- RPC 1: Obtener cónyuge de un usuario
CREATE OR REPLACE FUNCTION public.obtener_conyugue(p_usuario_id uuid)
RETURNS TABLE (id uuid, nombre text, apellido text, foto_perfil_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT u.id, u.nombre, u.apellido, u.foto_perfil_url
  FROM public.relaciones_usuarios ru
  JOIN public.usuarios u ON u.id = CASE
    WHEN ru.usuario1_id = p_usuario_id THEN ru.usuario2_id
    ELSE ru.usuario1_id
  END
  WHERE (ru.usuario1_id = p_usuario_id OR ru.usuario2_id = p_usuario_id)
    AND ru.tipo_relacion = 'conyuge'
  LIMIT 1;
$$;

-- RPC 2: Verificar si un usuario puede gestionar casas anfitrionas
CREATE OR REPLACE FUNCTION public.puede_gestionar_casas(p_auth_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  internal_user_id uuid;
  es_superior boolean;
BEGIN
  SELECT u.id INTO internal_user_id
  FROM public.usuarios u
  WHERE u.auth_id = p_auth_id;

  IF internal_user_id IS NULL THEN RETURN FALSE; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.usuario_roles ur
    JOIN public.roles_sistema rs ON ur.rol_id = rs.id
    WHERE ur.usuario_id = internal_user_id
      AND rs.nombre_interno IN ('admin','pastor','director-general','director-etapa')
  ) INTO es_superior;

  RETURN es_superior;
END;
$$;

-- RPC 3: Procesar aprobación o rechazo de casa anfitriona
CREATE OR REPLACE FUNCTION public.procesar_aprobacion_casa_anfitriona(
  p_auth_id uuid,
  p_casa_id uuid,
  p_accion text,
  p_notas text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_usuario_id uuid;
BEGIN
  SELECT id INTO v_usuario_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'usuario_no_encontrado';
  END IF;

  IF NOT public.puede_gestionar_casas(p_auth_id) THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;

  IF p_accion = 'aprobar' THEN
    UPDATE public.casas_anfitrionas
    SET aprobada = true,
        activa = true,
        aprobada_por = v_usuario_id,
        aprobada_en = now(),
        actualizado_en = now()
    WHERE id = p_casa_id;
  ELSIF p_accion = 'rechazar' THEN
    UPDATE public.casas_anfitrionas
    SET aprobada = false,
        activa = false,
        notas_privadas = COALESCE(p_notas, notas_privadas),
        actualizado_en = now()
    WHERE id = p_casa_id;
  ELSE
    RAISE EXCEPTION 'accion_invalida';
  END IF;

  RETURN jsonb_build_object('ok', true, 'accion', p_accion);
END;
$$;

-- RPC 4: Asignar líder con cónyuge a un grupo (matrimonio en liderazgo)
CREATE OR REPLACE FUNCTION public.asignar_lider_matrimonio(
  p_auth_id uuid,
  p_grupo_id uuid,
  p_lider_id uuid,
  p_incluir_conyugue boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_conyugue_id uuid;
  v_resultado jsonb;
BEGIN
  -- Verificar permisos
  IF NOT public.puede_editar_grupo(p_auth_id, p_grupo_id) THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;

  -- Asignar líder principal
  INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol)
  VALUES (p_grupo_id, p_lider_id, 'Líder')
  ON CONFLICT (grupo_id, usuario_id) DO UPDATE SET rol = 'Líder', fecha_salida = NULL;

  v_resultado := jsonb_build_object('lider_asignado', p_lider_id);

  -- Incluir cónyuge como co-líder si se solicita
  IF p_incluir_conyugue THEN
    SELECT c.id INTO v_conyugue_id
    FROM public.obtener_conyugue(p_lider_id) c;

    IF v_conyugue_id IS NOT NULL THEN
      INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol)
      VALUES (p_grupo_id, v_conyugue_id, 'Líder')
      ON CONFLICT (grupo_id, usuario_id) DO UPDATE SET rol = 'Líder', fecha_salida = NULL;

      v_resultado := v_resultado || jsonb_build_object('conyugue_asignado', v_conyugue_id);
    ELSE
      v_resultado := v_resultado || jsonb_build_object('advertencia', 'sin_conyugue_registrado');
    END IF;
  END IF;

  RETURN v_resultado;
END;
$$;
