-- Niños: rooms, child records, authorized pickups and the Sunday check-in
-- (odd/tasks/ninos-checkin.md, task N1).
--
-- What:
--   1. ninos_salones, ninos_fichas, ninos_autorizados_retiro, ninos_checkins.
--   2. Authority helpers (SECURITY DEFINER, search_path ''), all scoped to an
--      area equipo (the Waumba Land or Upstreet node a room belongs to):
--        ninos_puede_configurar(equipo)  admin/pastor, or dream_team.org.manage,
--                                        dream_team.direct or dream_team.coordinate
--                                        granted on that equipo or an ancestor
--                                        (Directora de Niños, area coordinators).
--        ninos_puede_operar(equipo)      configurar, or an active servicio in a
--                                        direct child equipo labelled
--                                        'Anfitriones' (check-in and check-out).
--        ninos_puede_ver_salon(equipo)   operar, or dream_team.lead in the tree,
--                                        or an active servicio in the child
--                                        'Líderes' equipo (read the live list).
--      ninos_puede_operar_algun_area() is operar on any equipo that owns a room;
--      it gates the child records, which are not tied to one area.
--   3. RLS on every table; authenticated gets only the privileges it needs.
--      Check-ins have no direct write privilege: they change through RPCs.
--   4. RPCs: ninos_checkin, ninos_checkout, ninos_lista_salon.
--
-- Code uniqueness: a family visit shares one 4-digit code. It is unique per
-- campus + fecha + turno among open check-ins; ninos_checkin serializes code
-- issuance with a transaction advisory lock on that key, then picks a code no
-- open check-in uses. A shared code cannot be a plain unique index.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.ninos_lista_salon(uuid, date, uuid);
--   DROP FUNCTION IF EXISTS public.ninos_checkout(text, uuid, date, text);
--   DROP FUNCTION IF EXISTS public.ninos_checkin(uuid[], uuid, date, uuid[]);
--   DROP TABLE IF EXISTS public.ninos_checkins, public.ninos_autorizados_retiro,
--     public.ninos_fichas, public.ninos_salones;
--   DROP FUNCTION IF EXISTS public.ninos_fichas_touch(),
--     public.ninos_puede_operar_algun_area(), public.ninos_puede_ver_salon(uuid),
--     public.ninos_sirve_en_subarea(uuid, text[]),
--     public.ninos_puede_operar(uuid), public.ninos_puede_configurar(uuid),
--     public.ninos_usuario_actual();

-- ── tables ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ninos_salones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campus(id),
  equipo_id uuid NOT NULL REFERENCES public.dream_team_equipos(id),
  area text NOT NULL CHECK (area IN ('waumba', 'upstreet')),
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  capacidad integer NOT NULL DEFAULT 20 CHECK (capacidad > 0),
  edad_min_meses integer CHECK (edad_min_meses >= 0),
  edad_max_meses integer CHECK (edad_max_meses >= 0),
  grado_min integer CHECK (grado_min BETWEEN 0 AND 12),
  grado_max integer CHECK (grado_max BETWEEN 0 AND 12),
  es_necesidades_especiales boolean NOT NULL DEFAULT false,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (edad_min_meses IS NULL OR edad_max_meses IS NULL OR edad_min_meses <= edad_max_meses),
  CHECK (grado_min IS NULL OR grado_max IS NULL OR grado_min <= grado_max),
  UNIQUE (campus_id, nombre)
);

CREATE TABLE IF NOT EXISTS public.ninos_fichas (
  usuario_id uuid PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  grado integer CHECK (grado BETWEEN 0 AND 12),
  alergias text,
  necesidades_especiales text,
  habitos text,
  notas text,
  puede_comer boolean,
  cambio_panal boolean,
  autoriza_imagen boolean,
  escolarizado boolean,
  salon_preferido_id uuid REFERENCES public.ninos_salones(id) ON DELETE SET NULL,
  es_vip_desde date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.ninos_autorizados_retiro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nino_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (btrim(nombre) <> ''),
  telefono text,
  relacion text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ninos_autorizados_retiro_nino_idx ON public.ninos_autorizados_retiro (nino_id);

CREATE TABLE IF NOT EXISTS public.ninos_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nino_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  salon_id uuid NOT NULL REFERENCES public.ninos_salones(id),
  turno_id uuid NOT NULL REFERENCES public.dream_team_turnos(id),
  campus_id uuid NOT NULL REFERENCES public.campus(id),
  fecha date NOT NULL,
  visita_id uuid NOT NULL,
  codigo text NOT NULL CHECK (codigo ~ '^[0-9]{3,4}$'),
  entrada_at timestamptz NOT NULL DEFAULT now(),
  entrada_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  salida_at timestamptz,
  salida_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  retirado_por_nombre text,
  CONSTRAINT ninos_checkins_un_turno UNIQUE (nino_id, fecha, turno_id)
);
CREATE INDEX IF NOT EXISTS ninos_checkins_codigo_abierto_idx
  ON public.ninos_checkins (campus_id, fecha, turno_id, codigo) WHERE salida_at IS NULL;
CREATE INDEX IF NOT EXISTS ninos_checkins_salon_idx ON public.ninos_checkins (salon_id, fecha, turno_id);

-- ── authority helpers ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ninos_usuario_actual()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid() AND auth.uid() IS NOT NULL LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.ninos_puede_configurar(p_equipo_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT p_equipo_id IS NOT NULL AND (
    public.es_admin_o_pastor(auth.uid())
    OR public.auth_has_dream_team_capability_in_tree('dream_team.org.manage', p_equipo_id)
    OR public.auth_has_dream_team_capability_in_tree('dream_team.direct', p_equipo_id)
    OR public.auth_has_dream_team_capability_in_tree('dream_team.coordinate', p_equipo_id)
  );
$$;

-- An active servicio of the caller in a direct child equipo of p_equipo_id
-- with the given label (accent- and case-insensitive on the common forms).
CREATE OR REPLACE FUNCTION public.ninos_sirve_en_subarea(p_equipo_id uuid, p_labels text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dream_team_servicios s
    JOIN public.dream_team_equipos e ON e.id = s.equipo_id
    WHERE s.persona_id = public.ninos_usuario_actual()
      AND s.estado = 'activo'
      AND e.activo
      AND e.parent_equipo_id = p_equipo_id
      AND lower(translate(btrim(e.label), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = ANY (p_labels)
  );
$$;

CREATE OR REPLACE FUNCTION public.ninos_puede_operar(p_equipo_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.ninos_puede_configurar(p_equipo_id)
      OR public.ninos_sirve_en_subarea(p_equipo_id, ARRAY['anfitriones']);
$$;

CREATE OR REPLACE FUNCTION public.ninos_puede_ver_salon(p_equipo_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.ninos_puede_operar(p_equipo_id)
      OR public.auth_has_dream_team_capability_in_tree('dream_team.lead', p_equipo_id)
      OR public.ninos_sirve_en_subarea(p_equipo_id, ARRAY['lideres']);
$$;

CREATE OR REPLACE FUNCTION public.ninos_puede_operar_algun_area()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM (SELECT DISTINCT s.equipo_id FROM public.ninos_salones s WHERE s.activo) a
    WHERE public.ninos_puede_operar(a.equipo_id)
  );
$$;

REVOKE ALL ON FUNCTION public.ninos_usuario_actual() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_puede_configurar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_sirve_en_subarea(uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_puede_operar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_puede_ver_salon(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_puede_operar_algun_area() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_usuario_actual() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_puede_configurar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_sirve_en_subarea(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_puede_operar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_puede_ver_salon(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_puede_operar_algun_area() TO authenticated;

-- updated_at / updated_by on the child record (invoker trigger).
CREATE OR REPLACE FUNCTION public.ninos_fichas_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := public.ninos_usuario_actual();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.ninos_fichas_touch() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS ninos_fichas_touch ON public.ninos_fichas;
CREATE TRIGGER ninos_fichas_touch
  BEFORE INSERT OR UPDATE ON public.ninos_fichas
  FOR EACH ROW EXECUTE FUNCTION public.ninos_fichas_touch();

-- ── RLS and privileges ───────────────────────────────────────────────

ALTER TABLE public.ninos_salones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ninos_fichas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ninos_autorizados_retiro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ninos_checkins ENABLE ROW LEVEL SECURITY;

-- Default privileges hand anon and authenticated everything; start from none.
REVOKE ALL ON public.ninos_salones, public.ninos_fichas, public.ninos_autorizados_retiro,
  public.ninos_checkins FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON public.ninos_salones TO authenticated;
GRANT UPDATE (nombre, capacidad, edad_min_meses, edad_max_meses, grado_min, grado_max,
  es_necesidades_especiales, orden, activo) ON public.ninos_salones TO authenticated;
GRANT SELECT, INSERT ON public.ninos_fichas TO authenticated;
GRANT UPDATE (grado, alergias, necesidades_especiales, habitos, notas, puede_comer, cambio_panal,
  autoriza_imagen, escolarizado, salon_preferido_id, es_vip_desde) ON public.ninos_fichas TO authenticated;
GRANT SELECT, INSERT ON public.ninos_autorizados_retiro TO authenticated;
GRANT UPDATE (nombre, telefono, relacion, activo) ON public.ninos_autorizados_retiro TO authenticated;
GRANT SELECT ON public.ninos_checkins TO authenticated;

CREATE POLICY ninos_salones_select ON public.ninos_salones
  FOR SELECT TO authenticated USING (public.ninos_puede_ver_salon(equipo_id));
CREATE POLICY ninos_salones_insert ON public.ninos_salones
  FOR INSERT TO authenticated WITH CHECK (public.ninos_puede_configurar(equipo_id));
CREATE POLICY ninos_salones_update ON public.ninos_salones
  FOR UPDATE TO authenticated
  USING (public.ninos_puede_configurar(equipo_id)) WITH CHECK (public.ninos_puede_configurar(equipo_id));

CREATE POLICY ninos_fichas_select ON public.ninos_fichas
  FOR SELECT TO authenticated USING (public.ninos_puede_operar_algun_area());
CREATE POLICY ninos_fichas_insert ON public.ninos_fichas
  FOR INSERT TO authenticated WITH CHECK (public.ninos_puede_operar_algun_area());
CREATE POLICY ninos_fichas_update ON public.ninos_fichas
  FOR UPDATE TO authenticated
  USING (public.ninos_puede_operar_algun_area()) WITH CHECK (public.ninos_puede_operar_algun_area());

CREATE POLICY ninos_autorizados_retiro_select ON public.ninos_autorizados_retiro
  FOR SELECT TO authenticated USING (public.ninos_puede_operar_algun_area());
CREATE POLICY ninos_autorizados_retiro_insert ON public.ninos_autorizados_retiro
  FOR INSERT TO authenticated WITH CHECK (public.ninos_puede_operar_algun_area());
CREATE POLICY ninos_autorizados_retiro_update ON public.ninos_autorizados_retiro
  FOR UPDATE TO authenticated
  USING (public.ninos_puede_operar_algun_area()) WITH CHECK (public.ninos_puede_operar_algun_area());

CREATE POLICY ninos_checkins_select ON public.ninos_checkins
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ninos_salones s
                 WHERE s.id = salon_id AND public.ninos_puede_ver_salon(s.equipo_id)));

-- ── RPCs ─────────────────────────────────────────────────────────────

-- Checks in the children of one family visit. p_salon_ids is aligned with
-- p_nino_ids. Every child shares one code. Returns one row per child with the
-- room occupancy after the check-in and whether it went over capacity.
CREATE OR REPLACE FUNCTION public.ninos_checkin(
  p_nino_ids uuid[], p_turno_id uuid, p_fecha date, p_salon_ids uuid[]
)
RETURNS TABLE (nino_id uuid, salon_id uuid, codigo text, ocupacion integer, capacidad integer,
               sobre_capacidad boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  v_campus uuid;
  v_actor uuid := public.ninos_usuario_actual();
  v_visita uuid := gen_random_uuid();
  v_codigo text;
  v_intentos integer := 0;
  i integer;
  v_salon public.ninos_salones%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_nino_ids IS NULL OR p_salon_ids IS NULL OR cardinality(p_nino_ids) = 0
     OR cardinality(p_nino_ids) <> cardinality(p_salon_ids) THEN
    RAISE EXCEPTION 'p_nino_ids and p_salon_ids must be non-empty and aligned' USING ERRCODE = '22023';
  END IF;
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'p_fecha is required' USING ERRCODE = '22023';
  END IF;

  SELECT t.campus_id INTO v_campus FROM public.dream_team_turnos t WHERE t.id = p_turno_id AND t.activo;
  IF v_campus IS NULL THEN
    RAISE EXCEPTION 'unknown or inactive turno' USING ERRCODE = '22023';
  END IF;

  FOR i IN 1 .. cardinality(p_nino_ids) LOOP
    SELECT * INTO v_salon FROM public.ninos_salones s WHERE s.id = p_salon_ids[i];
    IF NOT FOUND OR NOT v_salon.activo OR v_salon.campus_id <> v_campus THEN
      RAISE EXCEPTION 'room % is not an active room of the turno campus', p_salon_ids[i] USING ERRCODE = '22023';
    END IF;
    IF NOT public.ninos_puede_operar(v_salon.equipo_id) THEN
      RAISE EXCEPTION 'not allowed to check in to room %', v_salon.nombre USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ninos_fichas f WHERE f.usuario_id = p_nino_ids[i]) THEN
      RAISE EXCEPTION 'child % has no ficha', p_nino_ids[i] USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Serialize code issuance for this campus + fecha + turno.
  PERFORM pg_advisory_xact_lock(hashtextextended('ninos_checkin:' || v_campus || ':' || p_fecha || ':' || p_turno_id, 0));

  LOOP
    v_codigo := lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.ninos_checkins c
      WHERE c.campus_id = v_campus AND c.fecha = p_fecha AND c.turno_id = p_turno_id
        AND c.codigo = v_codigo AND c.salida_at IS NULL);
    v_intentos := v_intentos + 1;
    IF v_intentos > 200 THEN
      RAISE EXCEPTION 'no free code for this turno' USING ERRCODE = '53000';
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO public.ninos_checkins (nino_id, salon_id, turno_id, campus_id, fecha, visita_id, codigo, entrada_por) -- noqa: insert-into
    SELECT n.nino, n.salon, p_turno_id, v_campus, p_fecha, v_visita, v_codigo, v_actor
    FROM unnest(p_nino_ids, p_salon_ids) AS n(nino, salon);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'a child is already checked in for this turno' USING ERRCODE = '23505';
  END;

  RETURN QUERY
  SELECT n.nino, n.salon, v_codigo,
         (SELECT count(*)::int FROM public.ninos_checkins c
           WHERE c.salon_id = n.salon AND c.fecha = p_fecha AND c.turno_id = p_turno_id AND c.salida_at IS NULL),
         s.capacidad,
         (SELECT count(*) FROM public.ninos_checkins c
           WHERE c.salon_id = n.salon AND c.fecha = p_fecha AND c.turno_id = p_turno_id AND c.salida_at IS NULL) > s.capacidad
  FROM unnest(p_nino_ids, p_salon_ids) AS n(nino, salon)
  JOIN public.ninos_salones s ON s.id = n.salon;
END;
$$;

-- Checks out every open check-in with that code in the turno, in the rooms
-- the caller may operate. Returns the children released.
CREATE OR REPLACE FUNCTION public.ninos_checkout(
  p_codigo text, p_turno_id uuid, p_fecha date, p_retirado_por text
)
RETURNS TABLE (nino_id uuid, salon_id uuid, salida_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_retirado_por IS NULL OR btrim(p_retirado_por) = '' THEN
    RAISE EXCEPTION 'p_retirado_por is required' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ninos_checkins c JOIN public.ninos_salones s ON s.id = c.salon_id
    WHERE c.codigo = p_codigo AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
      AND NOT public.ninos_puede_operar(s.equipo_id)
  ) THEN
    RAISE EXCEPTION 'not allowed to check out this code' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.ninos_checkins c
     SET salida_at = now(), salida_por = v_actor, retirado_por_nombre = btrim(p_retirado_por)
   WHERE c.codigo = p_codigo AND c.turno_id = p_turno_id AND c.fecha = p_fecha AND c.salida_at IS NULL
  RETURNING c.nino_id, c.salon_id, c.salida_at;
END;
$$;

-- The children present in a room for a turno, with the alerts the room needs.
CREATE OR REPLACE FUNCTION public.ninos_lista_salon(p_salon_id uuid, p_fecha date, p_turno_id uuid)
RETURNS TABLE (nino_id uuid, nombre text, apellido text, fecha_nacimiento date, codigo text,
               entrada_at timestamptz, alergias text, necesidades_especiales text, habitos text,
               puede_comer boolean, cambio_panal boolean, autoriza_imagen boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ninos_salones s
                 WHERE s.id = p_salon_id AND public.ninos_puede_ver_salon(s.equipo_id)) THEN
    RAISE EXCEPTION 'not allowed to read this room' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.nino_id, u.nombre, u.apellido, u.fecha_nacimiento::date, c.codigo, c.entrada_at,
         f.alergias, f.necesidades_especiales, f.habitos, f.puede_comer, f.cambio_panal, f.autoriza_imagen
  FROM public.ninos_checkins c
  JOIN public.usuarios u ON u.id = c.nino_id
  LEFT JOIN public.ninos_fichas f ON f.usuario_id = c.nino_id
  WHERE c.salon_id = p_salon_id AND c.fecha = p_fecha AND c.turno_id = p_turno_id AND c.salida_at IS NULL
  ORDER BY u.apellido, u.nombre;
END;
$$;

REVOKE ALL ON FUNCTION public.ninos_checkin(uuid[], uuid, date, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_checkout(text, uuid, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ninos_lista_salon(uuid, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ninos_checkin(uuid[], uuid, date, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_checkout(text, uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ninos_lista_salon(uuid, date, uuid) TO authenticated;
