-- Función para sugerir nombre de grupo usando conteo GLOBAL (ignorando RLS vía SECURITY DEFINER)
-- Retorna el siguiente nombre disponible basado en: "<ubicacion> <segmento.nombre> <N>" o con guion si el segmento termina en número

CREATE OR REPLACE FUNCTION public.sugerir_nombre_grupo(
  p_ubicacion text,
  p_temporada_id uuid,
  p_segmento_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_segmento_nombre text;
  v_base text;
  v_ends_with_number boolean;
  v_max integer := 0;
  r record;
  v_nombre text;
  v_rem text;
BEGIN
  IF p_ubicacion IS NULL OR p_temporada_id IS NULL OR p_segmento_id IS NULL THEN
    RAISE EXCEPTION 'Parametros invalidos';
  END IF;

  -- Obtener nombre de segmento
  SELECT s.nombre INTO v_segmento_nombre FROM public.segmentos s WHERE s.id = p_segmento_id;
  IF v_segmento_nombre IS NULL THEN
    RAISE EXCEPTION 'Segmento invalido';
  END IF;

  v_base := trim(p_ubicacion || ' ' || v_segmento_nombre);
  v_ends_with_number := right(trim(v_segmento_nombre), 1) ~ '^[0-9]$';

  FOR r IN
    SELECT g.nombre
    FROM public.grupos g
    WHERE g.temporada_id = p_temporada_id
      AND g.segmento_id = p_segmento_id
      AND g.nombre ILIKE v_base || '%'
  LOOP
    v_nombre := trim(coalesce(r.nombre, ''));
    -- Si empieza con la base, tomamos el resto y detectamos sufijo numérico con o sin guion
    IF position(v_base in v_nombre) = 1 THEN
      v_rem := btrim(substring(v_nombre from char_length(v_base) + 1), ' ');
      IF v_rem ~ '^\-\s*\d+$' THEN
        v_rem := btrim(substring(v_rem from 2), ' '); -- quitar '-'
      END IF;
      IF v_rem ~ '^\d+$' THEN
        v_max := greatest(v_max, v_rem::int);
      END IF;
    END IF;
  END LOOP;

  v_max := v_max + 1;
  IF v_ends_with_number THEN
    RETURN v_base || ' - ' || v_max;
  ELSE
    RETURN v_base || ' ' || v_max;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sugerir_nombre_grupo(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sugerir_nombre_grupo(text, uuid, uuid) TO anon, authenticated, service_role;
