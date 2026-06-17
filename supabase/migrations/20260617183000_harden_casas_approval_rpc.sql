-- Harden direct execution of the Casas Anfitrionas approval mutation RPC.
-- This corrective migration is additive/idempotent: it replaces function logic only.

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
  v_rows_updated integer;
BEGIN
  IF p_auth_id IS NULL OR p_auth_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'sin_permisos';
  END IF;

  SELECT id INTO v_usuario_id
  FROM public.usuarios
  WHERE auth_id = p_auth_id;

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'usuario_no_encontrado';
  END IF;

  IF NOT public.puede_aprobar_casa_anfitriona(p_auth_id, p_casa_id) THEN
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

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'casa_no_encontrada';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'accion', p_accion,
    'estado', CASE WHEN p_accion = 'aprobar' THEN 'aprobada' ELSE 'rechazada' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.procesar_aprobacion_casa_anfitriona(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.procesar_aprobacion_casa_anfitriona(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.procesar_aprobacion_casa_anfitriona(uuid, uuid, text, text) TO authenticated, service_role;
