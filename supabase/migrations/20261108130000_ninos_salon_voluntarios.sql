-- noqa: insert-into (every INSERT lives inside an RPC body; no data is written here)
-- Niños: the salón of each volunteer and today's volunteers of a salón
-- (odd/tasks/ninos-checkin-pco.md, T2c, S7, S5, L27).
--
-- Why: ninos_salones.equipo_id is the area (Waumba Land, Upstreet) and its
-- sub-equipos are functional (Anfitriones, Líderes, Producción…), so nothing
-- said which volunteer serves which salón. L27: "Asignar el salón en la
-- planilla de voluntarios" — each Niños volunteer has a habitual salón chosen
-- in /ninos/voluntarios, changeable for one service; the rest are
-- «Anfitriones / mesa».
--
-- What:
--   1. ninos_voluntario_salon (servicio → habitual salón) and
--      ninos_voluntario_salon_dia (servicio, turno, fecha → salón of that
--      service; salon_id NULL = «Anfitriones / mesa» that day). RLS on, no
--      privileges for anon or authenticated: only the functions below read or
--      write them. The effective salón of a service is the day row when there
--      is one, else the habitual.
--   2. ninos_voluntario_salon_asignar(servicio, salon, turno, fecha):
--      without turno and fecha it sets the habitual salón (NULL clears it);
--      with both it sets the salón of that service (NULL = mesa). A day value
--      equal to the habitual removes the day row (the service follows the
--      habitual again), which is how «solo hoy» is undone.
--      Authority: ninos_puede_marcar_voluntarios on the volunteer's equipo
--      (who marks them in the planilla). The salón must be active and of the
--      volunteer's campus: the servicio's equipo is under a Niños area of that
--      campus (ninos_voluntarios_equipos) and the person's principal campus is
--      that campus or unknown (the roster rule). The day must be one the turno
--      happens on (ninos_turno_ocurre_en), not before ninos_hoy() - 14.
--   3. ninos_voluntarios_salones(turno, fecha): for the planilla, the active
--      salones of the turno's campus and, for the volunteers of the roster the
--      caller may mark, their effective salón, habitual salón and whether the
--      value is only for that service. Read-only.
--   4. ninos_salon_voluntarios(salon, turno, fecha): for the salón screen, the
--      roster volunteers (ninos_voluntarios_del_turno) whose effective salón is
--      this one: the expected ones with their mark, plus the non-expected
--      marked presente; `asignados` counts every roster volunteer whose
--      effective salón is this one; plus the salón's rules. Authority:
--      ninos_puede_ver_salon, as ninos_lista_salon. Read-only: it never
--      freezes a past roster (ninos_voluntarios_congelar).
--
-- Errors: the message is a short code (42501 sin_autoridad; 22023 for the
-- rest) and the HINT a Spanish sentence the screens show as is.
--
-- Every function runs with definer rights and search_path ''.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_salon_voluntarios(uuid, uuid, date);
--   DROP FUNCTION IF EXISTS public.ninos_voluntarios_salones(uuid, date);
--   DROP FUNCTION IF EXISTS public.ninos_voluntario_salon_asignar(uuid, uuid, uuid, date);
--   DROP TABLE IF EXISTS public.ninos_voluntario_salon_dia;
--   DROP TABLE IF EXISTS public.ninos_voluntario_salon;

-- ── 1. tables ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ninos_voluntario_salon (
  servicio_id uuid PRIMARY KEY REFERENCES public.dream_team_servicios(id) ON DELETE CASCADE,
  salon_id uuid NOT NULL REFERENCES public.ninos_salones(id) ON DELETE CASCADE,
  updated_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ninos_voluntario_salon_salon_idx ON public.ninos_voluntario_salon (salon_id);

CREATE TABLE IF NOT EXISTS public.ninos_voluntario_salon_dia (
  servicio_id uuid NOT NULL REFERENCES public.dream_team_servicios(id) ON DELETE CASCADE,
  turno_id uuid NOT NULL REFERENCES public.dream_team_turnos(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  salon_id uuid REFERENCES public.ninos_salones(id) ON DELETE CASCADE,
  updated_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (servicio_id, turno_id, fecha)
);
CREATE INDEX IF NOT EXISTS ninos_voluntario_salon_dia_turno_idx ON public.ninos_voluntario_salon_dia (turno_id, fecha);
CREATE INDEX IF NOT EXISTS ninos_voluntario_salon_dia_salon_idx ON public.ninos_voluntario_salon_dia (salon_id);

COMMENT ON TABLE public.ninos_voluntario_salon IS
  'Habitual salón of a Niños volunteer (servicio). Written only by ninos_voluntario_salon_asignar.';
COMMENT ON TABLE public.ninos_voluntario_salon_dia IS
  'Salón of a Niños volunteer for one turno and fecha (salon_id NULL = Anfitriones / mesa). Overrides the habitual.';

ALTER TABLE public.ninos_voluntario_salon ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ninos_voluntario_salon_dia ENABLE ROW LEVEL SECURITY;
-- Default privileges hand anon and authenticated everything; start from none.
REVOKE ALL ON public.ninos_voluntario_salon FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ninos_voluntario_salon_dia FROM PUBLIC, anon, authenticated;

-- ── 2. assign ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_voluntario_salon_asignar(
  p_servicio_id uuid,
  p_salon_id uuid,
  p_turno_id uuid DEFAULT NULL,
  p_fecha date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
  v_servicio public.dream_team_servicios%ROWTYPE;
  v_turno public.dream_team_turnos%ROWTYPE;
  v_salon public.ninos_salones%ROWTYPE;
  v_campus uuid;
  v_habitual uuid;
  v_del_dia boolean := false;
  v_efectivo uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'No tienes permiso para asignar el salón de este voluntario.';
  END IF;
  SELECT sv.* INTO v_servicio FROM public.dream_team_servicios sv WHERE sv.id = p_servicio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'servicio_no_encontrado' USING ERRCODE = '22023',
      HINT = 'El voluntario no existe.';
  END IF;
  IF NOT public.ninos_puede_marcar_voluntarios(v_servicio.equipo_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'No tienes permiso para asignar el salón de este voluntario.';
  END IF;
  IF (p_turno_id IS NULL) <> (p_fecha IS NULL) THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023',
      HINT = 'Para un solo servicio indica el horario y la fecha.';
  END IF;

  IF p_turno_id IS NOT NULL THEN
    SELECT t.* INTO v_turno FROM public.dream_team_turnos t WHERE t.id = p_turno_id AND t.activo;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'turno_invalido' USING ERRCODE = '22023',
        HINT = 'El horario no existe o está inactivo.';
    END IF;
    IF NOT public.ninos_turno_ocurre_en(p_turno_id, p_fecha) OR p_fecha < public.ninos_hoy() - 14 THEN
      RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023',
        HINT = 'Ese horario no tiene servicio en esa fecha, o la fecha tiene más de 14 días.';
    END IF;
    v_campus := v_turno.campus_id;
  END IF;

  IF p_salon_id IS NOT NULL THEN
    SELECT s.* INTO v_salon FROM public.ninos_salones s WHERE s.id = p_salon_id AND s.activo;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'salon_invalido' USING ERRCODE = '22023',
        HINT = 'El salón no existe o está desactivado.';
    END IF;
    IF v_campus IS NOT NULL AND v_campus <> v_salon.campus_id THEN
      RAISE EXCEPTION 'salon_otro_campus' USING ERRCODE = '22023',
        HINT = 'El salón es de otro campus que el horario.';
    END IF;
    v_campus := v_salon.campus_id;
  END IF;

  -- The volunteer belongs to that campus: a Niños equipo there, principal campus that one or unknown.
  IF v_campus IS NOT NULL AND (
       NOT EXISTS (SELECT 1 FROM public.ninos_voluntarios_equipos(v_campus) q WHERE q.equipo_id = v_servicio.equipo_id)
       OR EXISTS (SELECT 1 FROM public.usuario_campus uc
                   WHERE uc.usuario_id = v_servicio.persona_id AND uc.es_campus_principal AND uc.campus_id <> v_campus)) THEN
    RAISE EXCEPTION 'salon_otro_campus' USING ERRCODE = '22023',
      HINT = 'El voluntario no sirve en Niños de ese campus.';
  END IF;

  IF p_turno_id IS NULL THEN
    IF p_salon_id IS NULL THEN
      DELETE FROM public.ninos_voluntario_salon v WHERE v.servicio_id = p_servicio_id;
    ELSE
      INSERT INTO public.ninos_voluntario_salon AS v (servicio_id, salon_id, updated_by)
      VALUES (p_servicio_id, p_salon_id, v_actor)
      ON CONFLICT (servicio_id) DO UPDATE
         SET salon_id = excluded.salon_id, updated_by = excluded.updated_by, updated_at = now()
       WHERE v.salon_id IS DISTINCT FROM excluded.salon_id;
    END IF;
    v_efectivo := p_salon_id;
  ELSE
    SELECT v.salon_id INTO v_habitual FROM public.ninos_voluntario_salon v WHERE v.servicio_id = p_servicio_id;
    IF p_salon_id IS NOT DISTINCT FROM v_habitual THEN
      DELETE FROM public.ninos_voluntario_salon_dia d
       WHERE d.servicio_id = p_servicio_id AND d.turno_id = p_turno_id AND d.fecha = p_fecha;
    ELSE
      INSERT INTO public.ninos_voluntario_salon_dia AS d (servicio_id, turno_id, fecha, salon_id, updated_by)
      VALUES (p_servicio_id, p_turno_id, p_fecha, p_salon_id, v_actor)
      ON CONFLICT (servicio_id, turno_id, fecha) DO UPDATE
         SET salon_id = excluded.salon_id, updated_by = excluded.updated_by, updated_at = now()
       WHERE d.salon_id IS DISTINCT FROM excluded.salon_id;
      v_del_dia := true;
    END IF;
    v_efectivo := p_salon_id;
  END IF;

  RETURN jsonb_build_object('servicio_id', p_servicio_id, 'salon_id', v_efectivo, 'es_del_dia', v_del_dia);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntario_salon_asignar(uuid, uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_voluntario_salon_asignar(uuid, uuid, uuid, date) TO authenticated;

-- ── 3. salones of the planilla ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_voluntarios_salones(p_turno_id uuid, p_fecha date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_turno public.dream_team_turnos%ROWTYPE;
  v_equipos uuid[];
  v_salones jsonb;
  v_asignaciones jsonb;
BEGIN
  IF public.ninos_usuario_actual() IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'No tienes permiso para ver los salones de estos voluntarios.';
  END IF;
  SELECT t.* INTO v_turno FROM public.dream_team_turnos t WHERE t.id = p_turno_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'turno_invalido' USING ERRCODE = '22023',
      HINT = 'El horario no existe.';
  END IF;
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023',
      HINT = 'Indica la fecha del servicio.';
  END IF;
  SELECT coalesce(array_agg(m.equipo_id), ARRAY[]::uuid[]) INTO v_equipos
    FROM public.ninos_voluntarios_marcables(v_turno.campus_id) m;
  IF cardinality(v_equipos) = 0 THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'No tienes permiso para ver los salones de estos voluntarios.';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre) ORDER BY s.orden, s.nombre), '[]'::jsonb)
    INTO v_salones
    FROM public.ninos_salones s
   WHERE s.campus_id = v_turno.campus_id AND s.activo;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'servicio_id', x.servicio_id, 'salon_id', x.salon_id, 'salon', se.nombre,
           'habitual_id', x.habitual_id, 'es_del_dia', x.es_del_dia) ORDER BY x.servicio_id), '[]'::jsonb)
    INTO v_asignaciones
    FROM (
      SELECT r.servicio_id, h.salon_id AS habitual_id, d.servicio_id IS NOT NULL AS es_del_dia,
             CASE WHEN d.servicio_id IS NOT NULL THEN d.salon_id ELSE h.salon_id END AS salon_id
        FROM public.ninos_voluntarios_del_turno(p_turno_id, p_fecha) r
        LEFT JOIN public.ninos_voluntario_salon h ON h.servicio_id = r.servicio_id
        LEFT JOIN public.ninos_voluntario_salon_dia d
          ON d.servicio_id = r.servicio_id AND d.turno_id = p_turno_id AND d.fecha = p_fecha
       WHERE r.equipo_id = ANY (v_equipos)
         AND (h.servicio_id IS NOT NULL OR d.servicio_id IS NOT NULL)
    ) x
    LEFT JOIN public.ninos_salones se ON se.id = x.salon_id;

  RETURN jsonb_build_object('salones', v_salones, 'asignaciones', v_asignaciones);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_voluntarios_salones(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_voluntarios_salones(uuid, date) TO authenticated;

-- ── 4. volunteers of a salón ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_salon_voluntarios(p_salon_id uuid, p_turno_id uuid, p_fecha date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_salon public.ninos_salones%ROWTYPE;
  v_asignados integer;
  v_voluntarios jsonb;
BEGIN
  SELECT s.* INTO v_salon FROM public.ninos_salones s WHERE s.id = p_salon_id;
  IF NOT FOUND OR NOT public.ninos_puede_ver_salon(v_salon.equipo_id) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501',
      HINT = 'No tienes permiso para ver este salón.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dream_team_turnos t
                  WHERE t.id = p_turno_id AND t.campus_id = v_salon.campus_id) THEN
    RAISE EXCEPTION 'turno_invalido' USING ERRCODE = '22023',
      HINT = 'El horario no es de este campus.';
  END IF;
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'fecha_invalida' USING ERRCODE = '22023',
      HINT = 'Indica la fecha del servicio.';
  END IF;

  WITH del_salon AS (
    SELECT r.servicio_id, r.esperado
      FROM public.ninos_voluntarios_del_turno(p_turno_id, p_fecha) r
      LEFT JOIN public.ninos_voluntario_salon h ON h.servicio_id = r.servicio_id
      LEFT JOIN public.ninos_voluntario_salon_dia d
        ON d.servicio_id = r.servicio_id AND d.turno_id = p_turno_id AND d.fecha = p_fecha
     WHERE (CASE WHEN d.servicio_id IS NOT NULL THEN d.salon_id ELSE h.salon_id END) = p_salon_id
  )
  SELECT (SELECT count(*) FROM del_salon)::int,
         coalesce(jsonb_agg(jsonb_build_object(
           'servicio_id', x.servicio_id, 'nombre', u.nombre, 'apellido', u.apellido, 'rol', ro.label,
           'esperado', x.esperado, 'estado', a.estado, 'marcado_at', a.marcado_at)
           ORDER BY u.nombre, u.apellido, x.servicio_id)
           FILTER (WHERE x.esperado OR a.estado = 'presente'), '[]'::jsonb)
    INTO v_asignados, v_voluntarios
    FROM del_salon x
    JOIN public.dream_team_servicios sv ON sv.id = x.servicio_id
    JOIN public.usuarios u ON u.id = sv.persona_id
    LEFT JOIN public.dream_team_roles ro ON ro.id = sv.rol_id
    LEFT JOIN public.dream_team_asistencias a
      ON a.servicio_id = x.servicio_id AND a.turno_id = p_turno_id AND a.fecha = p_fecha;

  RETURN jsonb_build_object(
    'salon_id', v_salon.id, 'capacidad', v_salon.capacidad,
    'ninos_por_voluntario', v_salon.ninos_por_voluntario, 'min_voluntarios', v_salon.min_voluntarios,
    'asignados', coalesce(v_asignados, 0), 'voluntarios', v_voluntarios);
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_salon_voluntarios(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_salon_voluntarios(uuid, uuid, date) TO authenticated;
