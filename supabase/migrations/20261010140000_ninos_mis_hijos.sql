-- Niños: "Mis hijos" in Mi Perfil, read side (odd/tasks/ninos-mis-hijos.md,
-- task M1).
--
-- A logged-in parent sees their children. A child of mine is a person linked
-- to me in relaciones_usuarios (child → me as 'padre' or 'tutor', or me →
-- child as 'hijo') who has a ninos_fichas row or a known birth date under 13.
-- That is exactly the rule of ninos_familia_hijos (the check-in team's view of
-- a family), reused here so both sides always agree. Every linked parent or
-- tutor has the same rights; a 'conyuge' (or any other) link gives nothing.
--
-- What (definer functions, empty search path, fully qualified names):
--   1. ninos_es_mi_hijo(uuid) → boolean. Internal: no client may execute it;
--      every parent RPC checks it first. "Me" is always
--      ninos_usuario_actual(), never a parameter.
--   2. ninos_mis_hijos() → jsonb, for authenticated users: my children with an
--      explicit allowlist of fields — identity, age, tiene_ficha, the ficha
--      fields a parent keeps up to date (grado, alergias,
--      necesidades_especiales, habitos, notas, puede_comer, cambio_panal,
--      autoriza_imagen, escolarizado), the active pickup people, the other
--      linked parents' names (never their contact data) and
--      puede_editar_identidad (false when the child has an own account).
--      Never the room, VIP, check-ins or any other staff field. '[]' without
--      children; 'sin_autoridad' (42501) without a current user.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_mis_hijos();
--   DROP FUNCTION IF EXISTS public.ninos_es_mi_hijo(uuid);

CREATE OR REPLACE FUNCTION public.ninos_es_mi_hijo(p_nino_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_nino_id IS NOT NULL
     AND public.ninos_usuario_actual() IS NOT NULL
     AND EXISTS (SELECT 1
                   FROM jsonb_array_elements(public.ninos_familia_hijos(public.ninos_usuario_actual())) e(h)
                  WHERE (e.h ->> 'id')::uuid = p_nino_id);
$$;
REVOKE ALL ON FUNCTION public.ninos_es_mi_hijo(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ninos_mis_hijos()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_yo uuid := public.ninos_usuario_actual();
BEGIN
  IF v_yo IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', u.id, 'nombre', u.nombre, 'apellido', u.apellido,
             'fecha_nacimiento', u.fecha_nacimiento, 'genero', u.genero,
             'edad', extract(year FROM age(public.ninos_hoy()::timestamp, u.fecha_nacimiento::timestamp))::integer,
             'tiene_ficha', f.usuario_id IS NOT NULL,
             'grado', f.grado, 'alergias', f.alergias, 'necesidades_especiales', f.necesidades_especiales,
             'habitos', f.habitos, 'notas', f.notas, 'puede_comer', f.puede_comer,
             'cambio_panal', f.cambio_panal, 'autoriza_imagen', f.autoriza_imagen,
             'escolarizado', f.escolarizado,
             'autorizados', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                'id', a.id, 'nombre', a.nombre, 'telefono', a.telefono, 'relacion', a.relacion)
                                ORDER BY a.created_at, a.nombre), '[]'::jsonb)
                               FROM public.ninos_autorizados_retiro a WHERE a.nino_id = u.id AND a.activo),
             'otros_padres', (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre', pa.nombre, 'apellido', pa.apellido)
                                 ORDER BY pa.apellido, pa.nombre), '[]'::jsonb)
                                FROM public.usuarios pa
                               WHERE pa.id <> v_yo
                                 AND pa.id IN (SELECT r.usuario2_id FROM public.relaciones_usuarios r
                                                WHERE r.usuario1_id = u.id AND r.tipo_relacion IN ('padre', 'tutor')
                                               UNION
                                               SELECT r.usuario1_id FROM public.relaciones_usuarios r
                                                WHERE r.usuario2_id = u.id AND r.tipo_relacion = 'hijo')),
             'puede_editar_identidad', u.auth_id IS NULL)
             ORDER BY u.fecha_nacimiento, u.nombre), '[]'::jsonb)
    FROM public.usuarios u
    LEFT JOIN public.ninos_fichas f ON f.usuario_id = u.id
    WHERE u.id IN (SELECT (e.h ->> 'id')::uuid FROM jsonb_array_elements(public.ninos_familia_hijos(v_yo)) e(h))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_mis_hijos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_mis_hijos() TO authenticated;
