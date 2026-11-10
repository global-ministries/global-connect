-- Upcoming birthdays of the caller's groupmates (odd/tasks/home-por-rol.md,
-- T8; S14a, L18–L19).
--
-- Why: "¿Los miembros ven los cumpleaños de su grupo? si" (L18). A plain
-- Miembro cannot read their groupmates' birth dates today: RLS on usuarios
-- (puede_ver_usuario) only lets Líder and Colíder see the other members, and
-- obtener_detalle_grupo does not return fecha_nacimiento. The home needs only
-- the day and month, so this function answers exactly that and nothing else.
--
-- What:
--   public.proximos_cumpleanos_mis_grupos(p_dias int DEFAULT 30) → TABLE
--   (usuario_id, nombre, apellido, grupo_id, grupo_nombre, mes, dia, proxima):
--     · the caller is auth.uid() (no auth id parameter); no session, no rows;
--     · their groups: a grupo_miembros row with fecha_salida IS NULL (any rol)
--       in a group that is activo and not eliminado;
--     · the OTHER current members of those groups (fecha_salida IS NULL) with
--       a fecha_nacimiento, one row per person and shared group;
--     · whose next birthday falls in [today, today + p_dias], today being the
--       Caracas date; 29 Feb falls on 28 Feb when the year is not leap;
--     · p_dias is clamped to 1..60 (NULL → 30);
--     · never the birth year nor the age: mes, dia and the next birthday date;
--     · ordered by proxima, nombre.
--
-- Blast radius: one new function, read only. No existing object changes. It
-- runs as definer with an empty search_path and fully qualified names;
-- EXECUTE is revoked from PUBLIC and anon and granted to authenticated.
-- Exposure is bounded to day and month of people who share a current group
-- with the caller.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.proximos_cumpleanos_mis_grupos(integer);

CREATE OR REPLACE FUNCTION public.proximos_cumpleanos_mis_grupos(p_dias integer DEFAULT 30)
RETURNS TABLE (
  usuario_id uuid,
  nombre text,
  apellido text,
  grupo_id uuid,
  grupo_nombre text,
  mes integer,
  dia integer,
  proxima date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH params AS (
    SELECT (now() AT TIME ZONE 'America/Caracas')::date AS hoy,
           LEAST(GREATEST(COALESCE(p_dias, 30), 1), 60) AS dias
  ),
  yo AS (
    SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid() AND auth.uid() IS NOT NULL
  ),
  mis_grupos AS (
    SELECT DISTINCT g.id, g.nombre
      FROM public.grupo_miembros gm
      JOIN yo ON yo.id = gm.usuario_id
      JOIN public.grupos g ON g.id = gm.grupo_id
     WHERE gm.fecha_salida IS NULL
       AND g.activo
       AND NOT g.eliminado
  ),
  companeros AS (
    SELECT DISTINCT u.id, u.nombre, u.apellido, mg.id AS grupo_id, mg.nombre AS grupo_nombre,
           EXTRACT(MONTH FROM u.fecha_nacimiento)::integer AS mes,
           EXTRACT(DAY FROM u.fecha_nacimiento)::integer AS dia
      FROM mis_grupos mg
      JOIN public.grupo_miembros gm ON gm.grupo_id = mg.id AND gm.fecha_salida IS NULL
      JOIN public.usuarios u ON u.id = gm.usuario_id
     WHERE u.fecha_nacimiento IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM yo WHERE yo.id = u.id)
  ),
  con_fecha AS (
    SELECT c.*,
           (SELECT min(f.fecha)
              FROM (SELECT make_date(a.anio, c.mes,
                             CASE WHEN c.mes = 2
                                  THEN LEAST(c.dia, EXTRACT(DAY FROM make_date(a.anio, 3, 1) - 1)::integer)
                                  ELSE c.dia END) AS fecha
                      FROM (VALUES (EXTRACT(YEAR FROM p.hoy)::integer),
                                   (EXTRACT(YEAR FROM p.hoy)::integer + 1)) AS a(anio)) f
             WHERE f.fecha >= p.hoy) AS proxima
      FROM companeros c
      CROSS JOIN params p
  )
  SELECT cf.id, cf.nombre, cf.apellido, cf.grupo_id, cf.grupo_nombre, cf.mes, cf.dia, cf.proxima
    FROM con_fecha cf
    CROSS JOIN params p
   WHERE cf.proxima <= p.hoy + p.dias
   ORDER BY cf.proxima, cf.nombre, cf.apellido, cf.grupo_nombre;
$$;

COMMENT ON FUNCTION public.proximos_cumpleanos_mis_grupos(integer) IS
  'Upcoming birthdays (day, month and next date; never the year) of the other current members of the '
  'caller''s active groups (auth.uid()), within p_dias days (1..60) from today in Caracas.';

REVOKE ALL ON FUNCTION public.proximos_cumpleanos_mis_grupos(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proximos_cumpleanos_mis_grupos(integer) TO authenticated;
