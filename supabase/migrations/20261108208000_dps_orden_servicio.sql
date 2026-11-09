-- noqa: insert-into
-- DPS planning: the order of the service and each plan's own horarios
-- (odd/tasks/dps-asistencia-pco.md, T13; S10, L48; artboard
-- docs/design-system/prototipos/planificacion-dps/02-plan-domingo-orden.html;
-- the PDF of the 8-nov plan, L9). Builds on 20261108200000..206000.
--
-- What:
--   1. dps_orden_items: the rows of a plan's order, by posicion (0..n-1, one
--      per plan). A row is an 'encabezado' (a section: Pre servicio,
--      Ensayo general, Banda…) with its fase, or an 'item' with título,
--      duración in seconds (the artboard edits m:ss; 0 to 4 h), notas and
--      responsable (free text). The fase of a header says when its items
--      happen: 'pre' (before the service, timed once from the llegada),
--      'servicio' (repeated at each horario of the plan) or 'post' (after
--      each service). Items take the fase of the header above them; items
--      before any header are 'servicio'. Times are not stored: the screen
--      computes them from the plan's horarios and llegada, so changing a
--      horario or a duración moves every time at once. At most 150 rows.
--      RLS on, no policies, no privilege for anon or authenticated. ON
--      DELETE CASCADE with the plan; dps_plan_mover keeps them (they hang
--      from plan_id).
--   2. For authenticated:
--        dps_plan_horarios_guardar(plan, horarios jsonb, llegada time) -> plan JSON
--            dps_exigir_planificador. 1 to 4 services 'HH:MM', strictly
--            ascending (no sorting: the list is what the screen shows), and a
--            llegada not after the first service. One evening service (a
--            Cena del Señor at 19:00) is a list of one. The defaults of
--            dps_config still apply to plans created later. The end of each
--            service is not stored: it is its start plus the service part of
--            the order.
--        dps_orden_leer(plan) -> {plan_id, puede_editar, items}  dps_puede_ver.
--        dps_orden_plantilla(plan) -> the order   on an empty order only
--            ('destino_con_orden'): the sections of the PDF with one or
--            three generic items each (Montaje 45 min, Reunión general 15,
--            Ensayo general 60 — 7:00, 7:45 and 8:00 from a 7:00 llegada).
--        dps_orden_agregar(plan, tipo, titulo, duracion_seg, posicion, fase) -> item
--            posicion NULL or past the end = last, below 0 = first; the
--            rows from there shift down. fase only for a header (NULL =
--            'servicio'); an item ignores it.
--        dps_orden_item_guardar(item, titulo, duracion_seg, notas, responsable, fase) -> item
--            the whole row (the screen sends it after each inline edit);
--            blank notas / responsable are NULL; a header keeps duración 0
--            and no notas, and changes its fase.
--        dps_orden_mover(item, posicion) -> integer (its new posicion, clamped)
--        dps_orden_eliminar(item) -> boolean   the rows below move up.
--        dps_orden_copiar(origen, destino, reemplazar) -> integer (rows copied)
--            «Copiar orden del domingo anterior»: a destino with an order
--            needs reemplazar ('destino_con_orden').
--      Writes need dps_exigir_planificador and lock the plan row FOR UPDATE,
--      so concurrent edits of one order take turns and posiciones stay
--      contiguous (the unique constraint is deferred to the end of each
--      statement's transaction to allow the shifts).
--   3. Internal: dps_orden_item_json(item).
--
-- Errors: 'sin_autoridad' (42501); 22023 for plan_invalido, item_invalido,
-- horarios_invalidos, llegada_invalida, tipo_invalido, titulo_invalido,
-- duracion_invalida, valor_invalido (notas over 500 or responsable over 80),
-- fase_invalida, posicion_invalida, orden_lleno, destino_con_orden.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.dps_orden_copiar(uuid, uuid, boolean),
--     public.dps_orden_eliminar(uuid), public.dps_orden_mover(uuid, integer),
--     public.dps_orden_item_guardar(uuid, text, integer, text, text, text),
--     public.dps_orden_agregar(uuid, text, text, integer, integer, text),
--     public.dps_orden_plantilla(uuid), public.dps_orden_leer(uuid),
--     public.dps_orden_item_json(uuid), public.dps_plan_horarios_guardar(uuid, jsonb, time);
--   DROP TABLE IF EXISTS public.dps_orden_items;

-- ── 1. table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dps_orden_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.dps_planes(id) ON DELETE CASCADE,
  posicion integer NOT NULL CHECK (posicion >= 0),
  tipo text NOT NULL CHECK (tipo IN ('encabezado', 'item')),
  titulo text NOT NULL CHECK (btrim(titulo) <> '' AND char_length(titulo) <= 120),
  duracion_seg integer NOT NULL DEFAULT 0 CHECK (duracion_seg BETWEEN 0 AND 14400),
  notas text CHECK (btrim(notas) <> '' AND char_length(notas) <= 500),
  responsable text CHECK (btrim(responsable) <> '' AND char_length(responsable) <= 80),
  fase text CHECK (fase IN ('pre', 'servicio', 'post')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT dps_orden_items_posicion_uq UNIQUE (plan_id, posicion) DEFERRABLE INITIALLY DEFERRED,
  -- A header has a fase and no duración nor notas; an item has no fase.
  CONSTRAINT dps_orden_items_forma CHECK (
    (tipo = 'encabezado' AND fase IS NOT NULL AND duracion_seg = 0 AND notas IS NULL AND responsable IS NULL)
    OR (tipo = 'item' AND fase IS NULL))
);

COMMENT ON TABLE public.dps_orden_items IS
  'DPS order of the service: headers (with fase pre/servicio/post) and items by posicion per plan. Only through the dps_* functions.';

ALTER TABLE public.dps_orden_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dps_orden_items FROM PUBLIC, anon, authenticated;

-- ── 2. helpers ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_orden_item_json(p_item_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object('id', o.id, 'posicion', o.posicion, 'tipo', o.tipo, 'titulo', o.titulo,
                            'duracion_seg', o.duracion_seg, 'notas', o.notas, 'responsable', o.responsable, 'fase', o.fase)
    FROM public.dps_orden_items o WHERE o.id = p_item_id;
$$;
REVOKE ALL ON FUNCTION public.dps_orden_item_json(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. horarios ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_plan_horarios_guardar(p_plan_id uuid, p_horarios jsonb, p_llegada time)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_lista text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dps_planes p WHERE p.id = p_plan_id) THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_horarios IS NULL OR jsonb_typeof(p_horarios) <> 'array'
     OR jsonb_array_length(p_horarios) NOT BETWEEN 1 AND 4
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_horarios) h
                 WHERE jsonb_typeof(h) <> 'string' OR NOT (h #>> '{}') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN
    RAISE EXCEPTION 'horarios_invalidos' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(h ORDER BY o) INTO v_lista FROM jsonb_array_elements_text(p_horarios) WITH ORDINALITY AS x(h, o);
  -- Strictly ascending: 'HH:MM' compares as text.
  IF EXISTS (SELECT 1 FROM generate_subscripts(v_lista, 1) i WHERE i > 1 AND v_lista[i] COLLATE "C" <= v_lista[i - 1] COLLATE "C") THEN
    RAISE EXCEPTION 'horarios_invalidos' USING ERRCODE = '22023';
  END IF;
  IF p_llegada IS NULL OR p_llegada > v_lista[1]::time THEN
    RAISE EXCEPTION 'llegada_invalida' USING ERRCODE = '22023';
  END IF;

  UPDATE public.dps_planes
     SET horarios = to_jsonb(v_lista), llegada = p_llegada, updated_at = now(), updated_by = v_actor
   WHERE id = p_plan_id;
  RETURN public.dps_plan_json(p_plan_id);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_plan_horarios_guardar(uuid, jsonb, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_plan_horarios_guardar(uuid, jsonb, time) TO authenticated;

-- ── 4. order ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_orden_leer(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT public.dps_puede_ver() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dps_planes p WHERE p.id = p_plan_id) THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'plan_id', p_plan_id,
    'puede_editar', public.dps_puede_planificar(),
    'items', coalesce((SELECT jsonb_agg(public.dps_orden_item_json(o.id) ORDER BY o.posicion)
                         FROM public.dps_orden_items o WHERE o.plan_id = p_plan_id), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.dps_orden_leer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_orden_leer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_orden_plantilla(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
BEGIN
  PERFORM 1 FROM public.dps_planes p WHERE p.id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dps_orden_items o WHERE o.plan_id = p_plan_id) THEN
    RAISE EXCEPTION 'destino_con_orden' USING ERRCODE = '22023';
  END IF;

  -- The sections of the PDF of the 8-nov plan (L9), with generic items.
  INSERT INTO public.dps_orden_items (plan_id, posicion, tipo, titulo, duracion_seg, fase, updated_by) -- noqa: insert-into
  SELECT p_plan_id, t.o, t.tipo, t.titulo, t.seg, t.fase, v_actor
    FROM (VALUES
      (0, 'encabezado', 'Pre servicio', 0, 'pre'),
      (1, 'item', 'Montaje', 2700, NULL),
      (2, 'item', 'Reunión general y oración', 900, NULL),
      (3, 'encabezado', 'Ensayo general', 0, 'pre'),
      (4, 'item', 'Ensayo general', 3600, NULL),
      (5, 'encabezado', 'Ambiente', 0, 'servicio'),
      (6, 'item', 'Cuenta regresiva', 180, NULL),
      (7, 'encabezado', 'Opener', 0, 'servicio'),
      (8, 'item', 'Opener', 120, NULL),
      (9, 'encabezado', 'Bienvenida', 0, 'servicio'),
      (10, 'item', 'Bienvenida y anuncios', 240, NULL),
      (11, 'encabezado', 'Banda', 0, 'servicio'),
      (12, 'item', 'Canción 1', 300, NULL),
      (13, 'item', 'Canción 2', 300, NULL),
      (14, 'item', 'Canción 3', 300, NULL),
      (15, 'encabezado', 'Dar', 0, 'servicio'),
      (16, 'item', 'Momento de dar', 240, NULL),
      (17, 'encabezado', 'Versintro', 0, 'servicio'),
      (18, 'item', 'Versintro', 60, NULL),
      (19, 'encabezado', 'Mensaje', 0, 'servicio'),
      (20, 'item', 'Mensaje', 2100, NULL),
      (21, 'encabezado', 'Recap', 0, 'servicio'),
      (22, 'item', 'Recap y oración final', 180, NULL),
      (23, 'encabezado', 'Post servicio', 0, 'post'),
      (24, 'item', 'Salida y música de cierre', 300, NULL)
    ) AS t(o, tipo, titulo, seg, fase);
  RETURN public.dps_orden_leer(p_plan_id);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_orden_plantilla(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_orden_plantilla(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_orden_agregar(p_plan_id uuid, p_tipo text, p_titulo text, p_duracion_seg integer,
                                                   p_posicion integer DEFAULT NULL, p_fase text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_titulo text := nullif(btrim(p_titulo), '');
  v_total integer;
  v_posicion integer;
  v_id uuid;
BEGIN
  PERFORM 1 FROM public.dps_planes p WHERE p.id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('encabezado', 'item') THEN
    RAISE EXCEPTION 'tipo_invalido' USING ERRCODE = '22023';
  END IF;
  IF v_titulo IS NULL OR char_length(v_titulo) > 120 THEN
    RAISE EXCEPTION 'titulo_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_tipo = 'item' AND (p_duracion_seg IS NULL OR p_duracion_seg NOT BETWEEN 0 AND 14400) THEN
    RAISE EXCEPTION 'duracion_invalida' USING ERRCODE = '22023';
  END IF;
  IF p_tipo = 'encabezado' AND p_fase IS NOT NULL AND p_fase NOT IN ('pre', 'servicio', 'post') THEN
    RAISE EXCEPTION 'fase_invalida' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_total FROM public.dps_orden_items o WHERE o.plan_id = p_plan_id;
  IF v_total >= 150 THEN
    RAISE EXCEPTION 'orden_lleno' USING ERRCODE = '22023';
  END IF;

  v_posicion := least(greatest(coalesce(p_posicion, v_total), 0), v_total);
  UPDATE public.dps_orden_items SET posicion = posicion + 1 WHERE plan_id = p_plan_id AND posicion >= v_posicion;
  INSERT INTO public.dps_orden_items (plan_id, posicion, tipo, titulo, duracion_seg, fase, updated_by) -- noqa: insert-into
  VALUES (p_plan_id, v_posicion, p_tipo, v_titulo,
          CASE WHEN p_tipo = 'item' THEN p_duracion_seg ELSE 0 END,
          CASE WHEN p_tipo = 'encabezado' THEN coalesce(p_fase, 'servicio') END, v_actor)
  RETURNING id INTO v_id;
  RETURN public.dps_orden_item_json(v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_orden_agregar(uuid, text, text, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_orden_agregar(uuid, text, text, integer, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_orden_item_guardar(p_item_id uuid, p_titulo text, p_duracion_seg integer,
                                                        p_notas text, p_responsable text, p_fase text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_item public.dps_orden_items%ROWTYPE;
  v_titulo text := nullif(btrim(p_titulo), '');
  v_notas text := nullif(btrim(p_notas), '');
  v_responsable text := nullif(btrim(p_responsable), '');
BEGIN
  SELECT o.* INTO v_item FROM public.dps_orden_items o WHERE o.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_invalido' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.dps_planes p WHERE p.id = v_item.plan_id FOR UPDATE;
  IF v_titulo IS NULL OR char_length(v_titulo) > 120 THEN
    RAISE EXCEPTION 'titulo_invalido' USING ERRCODE = '22023';
  END IF;

  IF v_item.tipo = 'encabezado' THEN
    IF p_fase IS NOT NULL AND p_fase NOT IN ('pre', 'servicio', 'post') THEN
      RAISE EXCEPTION 'fase_invalida' USING ERRCODE = '22023';
    END IF;
    UPDATE public.dps_orden_items
       SET titulo = v_titulo, fase = coalesce(p_fase, fase), updated_at = now(), updated_by = v_actor
     WHERE id = p_item_id;
  ELSE
    IF p_duracion_seg IS NULL OR p_duracion_seg NOT BETWEEN 0 AND 14400 THEN
      RAISE EXCEPTION 'duracion_invalida' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_notas) > 500 OR char_length(v_responsable) > 80 THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    END IF;
    UPDATE public.dps_orden_items
       SET titulo = v_titulo, duracion_seg = p_duracion_seg, notas = v_notas, responsable = v_responsable,
           updated_at = now(), updated_by = v_actor
     WHERE id = p_item_id;
  END IF;
  RETURN public.dps_orden_item_json(p_item_id);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_orden_item_guardar(uuid, text, integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_orden_item_guardar(uuid, text, integer, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_orden_mover(p_item_id uuid, p_posicion integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_plan uuid;
  v_desde integer;
  v_hasta integer;
  v_total integer;
BEGIN
  SELECT o.plan_id INTO v_plan FROM public.dps_orden_items o WHERE o.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_posicion IS NULL THEN
    RAISE EXCEPTION 'posicion_invalida' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.dps_planes p WHERE p.id = v_plan FOR UPDATE;
  -- Read again under the lock: another move may have shifted it.
  SELECT o.posicion INTO v_desde FROM public.dps_orden_items o WHERE o.id = p_item_id;
  SELECT count(*) INTO v_total FROM public.dps_orden_items o WHERE o.plan_id = v_plan;
  v_hasta := least(greatest(p_posicion, 0), v_total - 1);

  IF v_hasta > v_desde THEN
    UPDATE public.dps_orden_items SET posicion = posicion - 1
     WHERE plan_id = v_plan AND posicion > v_desde AND posicion <= v_hasta;
  ELSIF v_hasta < v_desde THEN
    UPDATE public.dps_orden_items SET posicion = posicion + 1
     WHERE plan_id = v_plan AND posicion >= v_hasta AND posicion < v_desde;
  END IF;
  IF v_hasta <> v_desde THEN
    UPDATE public.dps_orden_items SET posicion = v_hasta, updated_at = now(), updated_by = v_actor WHERE id = p_item_id;
  END IF;
  RETURN v_hasta;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_orden_mover(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_orden_mover(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_orden_eliminar(p_item_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_plan uuid;
  v_posicion integer;
BEGIN
  PERFORM public.dps_exigir_planificador();
  SELECT o.plan_id INTO v_plan FROM public.dps_orden_items o WHERE o.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_invalido' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.dps_planes p WHERE p.id = v_plan FOR UPDATE;
  DELETE FROM public.dps_orden_items o WHERE o.id = p_item_id RETURNING o.posicion INTO v_posicion;
  IF v_posicion IS NULL THEN
    RAISE EXCEPTION 'item_invalido' USING ERRCODE = '22023';
  END IF;
  UPDATE public.dps_orden_items SET posicion = posicion - 1 WHERE plan_id = v_plan AND posicion > v_posicion;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_orden_eliminar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_orden_eliminar(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_orden_copiar(p_origen_id uuid, p_destino_id uuid, p_reemplazar boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_copiados integer;
BEGIN
  IF p_origen_id IS NULL OR p_destino_id IS NULL OR p_origen_id = p_destino_id
     OR NOT EXISTS (SELECT 1 FROM public.dps_planes p WHERE p.id = p_origen_id) THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.dps_planes p WHERE p.id = p_destino_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dps_orden_items o WHERE o.plan_id = p_destino_id) THEN
    IF NOT coalesce(p_reemplazar, false) THEN
      RAISE EXCEPTION 'destino_con_orden' USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.dps_orden_items o WHERE o.plan_id = p_destino_id;
  END IF;

  INSERT INTO public.dps_orden_items (plan_id, posicion, tipo, titulo, duracion_seg, notas, responsable, fase, updated_by) -- noqa: insert-into
  SELECT p_destino_id, o.posicion, o.tipo, o.titulo, o.duracion_seg, o.notas, o.responsable, o.fase, v_actor
    FROM public.dps_orden_items o WHERE o.plan_id = p_origen_id;
  GET DIAGNOSTICS v_copiados = ROW_COUNT;
  RETURN v_copiados;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_orden_copiar(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_orden_copiar(uuid, uuid, boolean) TO authenticated;
