-- noqa: insert-into
-- DPS planning: directors assigned on their own (odd/tasks/dps-asistencia-pco.md,
-- S8; L36-L38). Builds on 20261108200000..203000.
--
-- What:
--   1. dps_puestos.direccion_equipo_id: the dirección a director puesto
--      stands for (NULL for every other puesto); at most one active puesto
--      per dirección. dps_convocados.automatico: the row was written by the
--      sync below, not by a planner.
--   2. Internal functions (no EXECUTE for PUBLIC, anon or authenticated):
--        dps_directores_direcciones()  the direcciones that get a director
--            puesto: the DPS root itself («Director de DPS») and every ACTIVE
--            DIRECT child of the root, whatever its experiencia. Próximo Paso
--            hangs from DPS as talleres_crecimiento, outside dps_equipos(),
--            and the user listed it among the direcciones (L36), so this list
--            does not filter by experiencia. Name «Director de <label>» (at
--            most 80), orden from -1000 (root first, then by label), so they
--            open the DPS column before any other puesto (orden >= 0).
--        dps_directores_puestos_sincronizar()  makes the director puestos on
--            the DPS root follow that list: deactivates the ones whose
--            dirección is gone or inactive (or that were moved off the root),
--            renames and reorders them with the label (a name another active
--            root puesto already holds is left as is), reactivates the last
--            puesto of a dirección that comes back, adopts an active root
--            puesto that already has the name (an older «Director de media»
--            that kept its convocados) and creates the missing ones with
--            cantidad 1. Writes only when something differs (then under an
--            advisory lock), so a read in sync stays a read.
--        dps_directores_deseados()  per active director puesto, the people
--            it should hold (see dps_directores_sincronizar).
--        dps_directores_sincronizar(plan)  for plans from ninos_hoy() - 14 on
--            (older plans are history and are not rewritten): per active
--            director puesto, the people with an ACTIVE servicio on exactly
--            that equipo whose rol has nivel 'director' (no inheritance: a
--            dirección without its own director keeps «Falta 1»). Missing ones
--            are inserted automatico (servicio_id = that servicio), automatic
--            rows of someone who is no longer director there are deleted, an
--            automatic row whose servicio changed follows it; manual rows are
--            never touched (a director already convocado by hand stays
--            manual). Then dps_asistencia_resincronizar. Only when something
--            differs, under the plan's convocados lock.
--        dps_directores_retirar_sembrados()  deactivates the six «Director de
--            …» puestos seeded on the root by 20261108203000 unless they hold
--            convocados (those stay, with a NOTICE). Run once below, not on
--            every read: a planner may create a puesto with one of those
--            names later.
--   3. dps_plan_equipos and dps_asistencia_planilla run both syncs first and
--      are now VOLATILE (same signatures and shape); each convocado of
--      dps_plan_equipos carries `automatico`, and the director puestos come
--      first in their column. dps_puesto_guardar gives a new puesto an orden
--      after the non-director ones (never negative). dps_desconvocar refuses an
--      automatic row ('convocado_automatico'); dps_copiar_plan copies only
--      manual rows, checks and replaces only the destino's manual rows and
--      syncs the destino's directors afterwards. dps_convocar is unchanged:
--      the sync inserts its rows itself, so a Próximo Paso director (whose
--      servicio is outside dps_equipos()) needs no relaxed subtree check.
--   4. Runs the retirement and the puestos sync once.
--
-- Errors: 'convocado_automatico' (22023) from dps_desconvocar.
--
-- Rollback:
--   restore dps_plan_equipos, dps_asistencia_planilla, dps_desconvocar and
--   dps_copiar_plan from 20261108202000_dps_planificacion_convocados.sql and
--   dps_puesto_guardar from 20261108201000_dps_planificacion_rpcs.sql;
--   DROP FUNCTION IF EXISTS public.dps_directores_retirar_sembrados(),
--     public.dps_directores_sincronizar(uuid), public.dps_directores_deseados(),
--     public.dps_directores_puestos_sincronizar(), public.dps_directores_direcciones();
--   DELETE FROM public.dps_convocados WHERE automatico;  -- optional
--   DROP INDEX IF EXISTS public.dps_puestos_direccion_activo_uidx;
--   then drop the columns dps_convocados.automatico and
--   dps_puestos.direccion_equipo_id;
--   (the director puestos stay as ordinary puestos; reactivate the seeded
--   ones with UPDATE if wanted).

-- ── 1. columns ───────────────────────────────────────────────────────

ALTER TABLE public.dps_puestos
  ADD COLUMN IF NOT EXISTS direccion_equipo_id uuid REFERENCES public.dream_team_equipos(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dps_puestos_direccion_activo_uidx
  ON public.dps_puestos (direccion_equipo_id) WHERE activo AND direccion_equipo_id IS NOT NULL;
COMMENT ON COLUMN public.dps_puestos.direccion_equipo_id IS
  'The dirección this director puesto stands for (S8); kept by dps_directores_puestos_sincronizar. NULL for any other puesto.';

ALTER TABLE public.dps_convocados ADD COLUMN IF NOT EXISTS automatico boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.dps_convocados.automatico IS
  'Written by dps_directores_sincronizar (the director of that dirección); not removable by hand nor copied (S8).';

-- ── 2. internal functions ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_directores_direcciones()
RETURNS TABLE (direccion_equipo_id uuid, nombre text, orden integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH raiz AS (
    SELECT public.dps_raiz() AS id
  ), d AS (
    SELECT e.id, e.label, 0 AS grupo FROM public.dream_team_equipos e JOIN raiz r ON e.id = r.id
    UNION ALL
    SELECT e.id, e.label, 1 FROM public.dream_team_equipos e JOIN raiz r ON e.parent_equipo_id = r.id WHERE e.activo
  )
  SELECT d.id, left('Director de ' || btrim(d.label), 80),
         (row_number() OVER (ORDER BY d.grupo, lower(d.label), d.id))::integer - 1001
    FROM d;
$$;
REVOKE ALL ON FUNCTION public.dps_directores_direcciones() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dps_directores_puestos_sincronizar()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_raiz uuid := public.dps_raiz();
BEGIN
  IF v_raiz IS NULL THEN
    RETURN;
  END IF;
  -- In sync: every wanted dirección has its active puesto with the wanted
  -- name and orden, and no other active director puesto is left.
  IF NOT EXISTS (
       SELECT 1
         FROM public.dps_puestos pu
         LEFT JOIN public.dps_directores_direcciones() d ON d.direccion_equipo_id = pu.direccion_equipo_id
        WHERE pu.activo AND pu.direccion_equipo_id IS NOT NULL
          AND (d.direccion_equipo_id IS NULL OR pu.equipo_id <> v_raiz OR pu.nombre <> d.nombre OR pu.orden <> d.orden)
       UNION ALL
       SELECT 1
         FROM public.dps_directores_direcciones() d
        WHERE NOT EXISTS (SELECT 1 FROM public.dps_puestos pu WHERE pu.activo AND pu.direccion_equipo_id = d.direccion_equipo_id)) THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dps_directores_puestos'));

  UPDATE public.dps_puestos pu
     SET activo = false, updated_at = now()
   WHERE pu.activo AND pu.direccion_equipo_id IS NOT NULL
     AND (pu.equipo_id <> v_raiz
          OR NOT EXISTS (SELECT 1 FROM public.dps_directores_direcciones() d WHERE d.direccion_equipo_id = pu.direccion_equipo_id));

  UPDATE public.dps_puestos pu
     SET orden = d.orden, updated_at = now()
    FROM public.dps_directores_direcciones() d
   WHERE pu.activo AND pu.direccion_equipo_id = d.direccion_equipo_id AND pu.orden <> d.orden;

  UPDATE public.dps_puestos pu
     SET nombre = d.nombre, updated_at = now()
    FROM public.dps_directores_direcciones() d
   WHERE pu.activo AND pu.direccion_equipo_id = d.direccion_equipo_id AND pu.nombre <> d.nombre
     AND NOT EXISTS (SELECT 1 FROM public.dps_puestos x
                      WHERE x.activo AND x.equipo_id = v_raiz AND x.id <> pu.id AND lower(btrim(x.nombre)) = lower(d.nombre));

  -- A dirección that comes back gets its last puesto again.
  UPDATE public.dps_puestos pu
     SET activo = true, equipo_id = v_raiz, nombre = d.nombre, orden = d.orden, updated_at = now()
    FROM public.dps_directores_direcciones() d
   WHERE pu.id = (SELECT x.id FROM public.dps_puestos x
                   WHERE NOT x.activo AND x.direccion_equipo_id = d.direccion_equipo_id
                   ORDER BY x.updated_at DESC, x.created_at DESC, x.id
                   LIMIT 1)
     AND NOT EXISTS (SELECT 1 FROM public.dps_puestos x WHERE x.activo AND x.direccion_equipo_id = d.direccion_equipo_id)
     AND NOT EXISTS (SELECT 1 FROM public.dps_puestos x
                      WHERE x.activo AND x.equipo_id = v_raiz AND lower(btrim(x.nombre)) = lower(d.nombre));

  -- An active root puesto that already carries the name becomes the director puesto.
  UPDATE public.dps_puestos pu
     SET direccion_equipo_id = d.direccion_equipo_id, nombre = d.nombre, orden = d.orden, updated_at = now()
    FROM public.dps_directores_direcciones() d
   WHERE pu.activo AND pu.equipo_id = v_raiz AND pu.direccion_equipo_id IS NULL
     AND lower(btrim(pu.nombre)) = lower(d.nombre)
     AND NOT EXISTS (SELECT 1 FROM public.dps_puestos x WHERE x.activo AND x.direccion_equipo_id = d.direccion_equipo_id);

  INSERT INTO public.dps_puestos (equipo_id, nombre, cantidad, orden, direccion_equipo_id) -- noqa: insert-into
  SELECT v_raiz, d.nombre, 1, d.orden, d.direccion_equipo_id
    FROM public.dps_directores_direcciones() d
   WHERE NOT EXISTS (SELECT 1 FROM public.dps_puestos x WHERE x.activo AND x.direccion_equipo_id = d.direccion_equipo_id)
     AND NOT EXISTS (SELECT 1 FROM public.dps_puestos x
                      WHERE x.activo AND x.equipo_id = v_raiz AND lower(btrim(x.nombre)) = lower(d.nombre));
END;
$$;
REVOKE ALL ON FUNCTION public.dps_directores_puestos_sincronizar() FROM PUBLIC, anon, authenticated;

-- Who each active director puesto should hold: the active servicios on
-- exactly its dirección whose rol is of nivel 'director' (one per person).
CREATE OR REPLACE FUNCTION public.dps_directores_deseados()
RETURNS TABLE (puesto_id uuid, servicio_id uuid, persona_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT DISTINCT ON (pu.id, s.persona_id) pu.id, s.id, s.persona_id
    FROM public.dps_puestos pu
    JOIN public.dream_team_servicios s ON s.equipo_id = pu.direccion_equipo_id AND s.estado = 'activo'
    JOIN public.dream_team_roles r ON r.id = s.rol_id AND r.nivel = 'director'
   WHERE pu.activo AND pu.direccion_equipo_id IS NOT NULL AND pu.equipo_id = public.dps_raiz()
   ORDER BY pu.id, s.persona_id, s.fecha_inicio, s.id;
$$;
REVOKE ALL ON FUNCTION public.dps_directores_deseados() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dps_directores_sincronizar(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_fecha date;
  v_raiz uuid := public.dps_raiz();
BEGIN
  SELECT p.fecha INTO v_fecha FROM public.dps_planes p WHERE p.id = p_plan_id;
  IF NOT FOUND OR v_raiz IS NULL OR v_fecha < public.ninos_hoy() - 14 THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM public.dps_convocados c
        WHERE c.plan_id = p_plan_id AND c.automatico
          AND NOT EXISTS (SELECT 1 FROM public.dps_directores_deseados() d
                           WHERE d.puesto_id = c.puesto_id AND d.persona_id = c.persona_id AND d.servicio_id = c.servicio_id)
       UNION ALL
       SELECT 1 FROM public.dps_directores_deseados() d
        WHERE NOT EXISTS (SELECT 1 FROM public.dps_convocados c
                           WHERE c.plan_id = p_plan_id AND c.puesto_id = d.puesto_id AND c.persona_id = d.persona_id)) THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dps_convocados:' || p_plan_id::text));
  DELETE FROM public.dps_convocados c
   WHERE c.plan_id = p_plan_id AND c.automatico
     AND NOT EXISTS (SELECT 1 FROM public.dps_directores_deseados() d WHERE d.puesto_id = c.puesto_id AND d.persona_id = c.persona_id);
  UPDATE public.dps_convocados c
     SET servicio_id = d.servicio_id
    FROM public.dps_directores_deseados() d
   WHERE c.plan_id = p_plan_id AND c.automatico
     AND d.puesto_id = c.puesto_id AND d.persona_id = c.persona_id AND d.servicio_id <> c.servicio_id;
  INSERT INTO public.dps_convocados (plan_id, puesto_id, servicio_id, persona_id, automatico) -- noqa: insert-into
  SELECT p_plan_id, d.puesto_id, d.servicio_id, d.persona_id, true
    FROM public.dps_directores_deseados() d
  ON CONFLICT (plan_id, puesto_id, persona_id) DO NOTHING;
  PERFORM public.dps_asistencia_resincronizar(p_plan_id, NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_directores_sincronizar(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dps_directores_retirar_sembrados()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_raiz uuid := public.dps_raiz();
  v_puesto record;
BEGIN
  IF v_raiz IS NULL THEN
    RETURN;
  END IF;
  FOR v_puesto IN
    SELECT pu.id, pu.nombre,
           EXISTS (SELECT 1 FROM public.dps_convocados c WHERE c.puesto_id = pu.id) AS con_convocados
      FROM public.dps_puestos pu
     WHERE pu.activo AND pu.equipo_id = v_raiz AND pu.direccion_equipo_id IS NULL
       AND lower(btrim(pu.nombre)) IN ('director de programación', 'director de atención al invitado', 'director de media',
                                       'director de producción técnica', 'director de social media',
                                       'director de producción creativa')
  LOOP
    IF v_puesto.con_convocados THEN
      RAISE NOTICE 'dps directores: % keeps its convocados, left active', v_puesto.nombre;
    ELSE
      UPDATE public.dps_puestos SET activo = false, updated_at = now() WHERE id = v_puesto.id;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_directores_retirar_sembrados() FROM PUBLIC, anon, authenticated;

-- ── 3. the RPCs that change ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_desconvocar(p_plan_id uuid, p_puesto_id uuid, p_persona_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_quitados integer;
BEGIN
  PERFORM public.dps_exigir_planificador();
  IF p_plan_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.dps_planes p WHERE p.id = p_plan_id) THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  -- The director of a dirección follows Dream Team, not the plan.
  IF EXISTS (SELECT 1 FROM public.dps_convocados c
              WHERE c.plan_id = p_plan_id AND c.puesto_id = p_puesto_id AND c.persona_id = p_persona_id AND c.automatico) THEN
    RAISE EXCEPTION 'convocado_automatico' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.dps_convocados c
   WHERE c.plan_id = p_plan_id AND c.puesto_id = p_puesto_id AND c.persona_id = p_persona_id;
  GET DIAGNOSTICS v_quitados = ROW_COUNT;
  PERFORM public.dps_asistencia_resincronizar(p_plan_id, ARRAY[p_persona_id]);
  RETURN v_quitados > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_desconvocar(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_desconvocar(uuid, uuid, uuid) TO authenticated;

-- A new puesto goes after the others, never among the director puestos
-- (negative orden); the default orden is the only change.
CREATE OR REPLACE FUNCTION public.dps_puesto_guardar(
  p_id uuid,
  p_equipo_id uuid,
  p_nombre text,
  p_cantidad integer DEFAULT 1,
  p_orden integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_nombre text := btrim(p_nombre);
  v_id uuid;
BEGIN
  PERFORM public.dps_exigir_planificador();
  IF NOT public.dps_equipo_valido(p_equipo_id) THEN
    RAISE EXCEPTION 'equipo_invalido' USING ERRCODE = '22023';
  END IF;
  IF v_nombre IS NULL OR v_nombre = '' OR char_length(v_nombre) > 80 THEN
    RAISE EXCEPTION 'nombre_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'cantidad_invalida' USING ERRCODE = '22023';
  END IF;
  IF p_orden IS NOT NULL AND p_orden NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'orden_invalido' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dps_puestos x
              WHERE x.activo AND x.equipo_id = p_equipo_id AND lower(btrim(x.nombre)) = lower(v_nombre)
                AND x.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'puesto_duplicado' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.dps_puestos (equipo_id, nombre, cantidad, orden) -- noqa: insert-into
    VALUES (p_equipo_id, v_nombre, p_cantidad,
            coalesce(p_orden, (SELECT greatest(coalesce(max(x.orden) + 1, 0), 0) FROM public.dps_puestos x
                                WHERE x.equipo_id = p_equipo_id AND x.activo AND x.direccion_equipo_id IS NULL)))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.dps_puestos
       SET equipo_id = p_equipo_id, nombre = v_nombre, cantidad = p_cantidad,
           orden = coalesce(p_orden, orden), updated_at = now()
     WHERE id = p_id AND activo
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'puesto_invalido' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'puesto_duplicado' USING ERRCODE = '22023';
END;
$$;
REVOKE ALL ON FUNCTION public.dps_puesto_guardar(uuid, uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_puesto_guardar(uuid, uuid, text, integer, integer) TO authenticated;

-- Only manual rows travel: the destino gets its own directors from the sync.
CREATE OR REPLACE FUNCTION public.dps_copiar_plan(p_origen_id uuid, p_destino_id uuid, p_reemplazar boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_total integer;
  v_copiados integer;
BEGIN
  IF p_origen_id IS NULL OR p_destino_id IS NULL OR p_origen_id = p_destino_id
     OR NOT EXISTS (SELECT 1 FROM public.dps_planes p WHERE p.id = p_origen_id)
     OR NOT EXISTS (SELECT 1 FROM public.dps_planes p WHERE p.id = p_destino_id) THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dps_convocados:' || p_destino_id::text));
  IF EXISTS (SELECT 1 FROM public.dps_convocados c WHERE c.plan_id = p_destino_id AND NOT c.automatico) THEN
    IF NOT coalesce(p_reemplazar, false) THEN
      RAISE EXCEPTION 'destino_con_convocados' USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.dps_convocados c WHERE c.plan_id = p_destino_id AND NOT c.automatico;
  END IF;

  SELECT count(*) INTO v_total FROM public.dps_convocados c WHERE c.plan_id = p_origen_id AND NOT c.automatico;
  INSERT INTO public.dps_convocados (plan_id, puesto_id, servicio_id, persona_id, created_by) -- noqa: insert-into
  SELECT p_destino_id, c.puesto_id, c.servicio_id, s.persona_id, v_actor
    FROM public.dps_convocados c
    JOIN public.dps_puestos pu ON pu.id = c.puesto_id AND pu.activo
    JOIN public.dream_team_servicios s ON s.id = c.servicio_id AND s.estado = 'activo'
   WHERE c.plan_id = p_origen_id AND NOT c.automatico
     AND public.dps_equipo_valido(pu.equipo_id)
     AND public.dps_en_subarbol(pu.equipo_id, s.equipo_id)
  ON CONFLICT (plan_id, puesto_id, persona_id) DO NOTHING;
  GET DIAGNOSTICS v_copiados = ROW_COUNT;

  PERFORM public.dps_directores_sincronizar(p_destino_id);
  PERFORM public.dps_asistencia_resincronizar(p_destino_id, NULL);
  RETURN jsonb_build_object('copiados', v_copiados, 'omitidos', v_total - v_copiados);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_copiar_plan(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_copiar_plan(uuid, uuid, boolean) TO authenticated;

-- VOLATILE: the directors are synced before the read.
CREATE OR REPLACE FUNCTION public.dps_plan_equipos(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT public.dps_puede_ver() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_plan_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.dps_planes p WHERE p.id = p_plan_id) THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  PERFORM public.dps_directores_puestos_sincronizar();
  PERFORM public.dps_directores_sincronizar(p_plan_id);

  RETURN (
    WITH arbol AS MATERIALIZED (
      SELECT d.equipo_id, d.label, d.ruta, d.profundidad FROM public.dps_equipos() d
    ), conv AS MATERIALIZED (
      SELECT c.id, c.puesto_id, c.persona_id, c.servicio_id, c.automatico, u.nombre, u.apellido
        FROM public.dps_convocados c
        JOIN public.usuarios u ON u.id = c.persona_id
       WHERE c.plan_id = p_plan_id
    ), puestos AS (
      SELECT pu.id, pu.equipo_id, pu.nombre, pu.cantidad, pu.orden, pu.activo,
             pu.direccion_equipo_id IS NOT NULL AS director,
             (SELECT count(*)::int FROM conv c WHERE c.puesto_id = pu.id) AS n,
             (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'convocado_id', c.id, 'persona_id', c.persona_id, 'servicio_id', c.servicio_id,
                       'nombre', concat_ws(' ', c.nombre, c.apellido), 'iniciales', public.dps_iniciales(c.nombre, c.apellido),
                       'automatico', c.automatico)
                       ORDER BY c.nombre, c.apellido, c.id), '[]'::jsonb)
                FROM conv c WHERE c.puesto_id = pu.id) AS convocados
        FROM public.dps_puestos pu
        JOIN arbol a ON a.equipo_id = pu.equipo_id
       WHERE pu.activo OR EXISTS (SELECT 1 FROM conv c WHERE c.puesto_id = pu.id)
    ), equipos AS (
      SELECT a.equipo_id, a.label, a.ruta, a.profundidad,
             jsonb_agg(jsonb_build_object(
               'puesto_id', p.id, 'nombre', p.nombre, 'cantidad', p.cantidad, 'orden', p.orden, 'activo', p.activo,
               'convocados', p.convocados, 'falta', greatest(p.cantidad - p.n, 0))
               ORDER BY p.director DESC, p.orden, lower(p.nombre), p.id) AS puestos,
             sum(greatest(p.cantidad - p.n, 0))::int AS falta,
             (SELECT count(DISTINCT c.persona_id)::int FROM conv c
                JOIN public.dps_puestos x ON x.id = c.puesto_id WHERE x.equipo_id = a.equipo_id) AS convocados
        FROM puestos p
        JOIN arbol a ON a.equipo_id = p.equipo_id
       GROUP BY a.equipo_id, a.label, a.ruta, a.profundidad
    )
    SELECT jsonb_build_object(
             'plan_id', p_plan_id,
             'puede_editar', public.dps_puede_planificar(),
             'equipos', coalesce((SELECT jsonb_agg(jsonb_build_object(
                           'equipo_id', e.equipo_id, 'equipo', e.label, 'ruta', e.ruta, 'profundidad', e.profundidad,
                           'convocados', e.convocados, 'falta', e.falta, 'puestos', e.puestos) ORDER BY e.ruta)
                                   FROM equipos e), '[]'::jsonb),
             'convocados', (SELECT count(DISTINCT c.persona_id)::int FROM conv c
                              JOIN public.dps_puestos x ON x.id = c.puesto_id
                              JOIN arbol a ON a.equipo_id = x.equipo_id),
             'falta', coalesce((SELECT sum(e.falta)::int FROM equipos e), 0))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.dps_plan_equipos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_plan_equipos(uuid) TO authenticated;

-- VOLATILE: the directors are synced before the read (after the authority checks).
CREATE OR REPLACE FUNCTION public.dps_asistencia_planilla(p_plan_id uuid, p_equipo_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_plan public.dps_planes%ROWTYPE;
  v_hoy date := public.ninos_hoy();
  v_equipos uuid[];
BEGIN
  IF public.ninos_usuario_actual() IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  SELECT p.* INTO v_plan FROM public.dps_planes p WHERE p.id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_equipo_id IS NOT NULL AND NOT public.dps_equipo_valido(p_equipo_id) THEN
    RAISE EXCEPTION 'equipo_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(x), ARRAY[]::uuid[]) INTO v_equipos
    FROM public.dps_equipos_asistibles() x
   WHERE p_equipo_id IS NULL OR x IN (SELECT s FROM public.dps_subarbol(p_equipo_id) s);
  IF cardinality(v_equipos) = 0 THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  PERFORM public.dps_directores_puestos_sincronizar();
  PERFORM public.dps_directores_sincronizar(p_plan_id);

  RETURN (
    WITH arbol AS MATERIALIZED (
      SELECT d.equipo_id, d.label, d.ruta FROM public.dps_equipos() d WHERE d.equipo_id = ANY (v_equipos)
    ), conv AS MATERIALIZED (
      SELECT c.persona_id, pu.equipo_id, pu.id AS puesto_id, pu.nombre AS puesto, pu.orden
        FROM public.dps_convocados c
        JOIN public.dps_puestos pu ON pu.id = c.puesto_id
       WHERE c.plan_id = p_plan_id
    ), marcas AS MATERIALIZED (
      SELECT a.persona_id, a.estado, a.convocado FROM public.dps_asistencias a WHERE a.plan_id = p_plan_id
    ), activos AS MATERIALIZED (
      SELECT DISTINCT s.equipo_id, s.persona_id
        FROM public.dream_team_servicios s
        JOIN arbol a ON a.equipo_id = s.equipo_id
       WHERE s.estado = 'activo'
    ), miembros AS (
      SELECT DISTINCT c.equipo_id, c.persona_id, true AS convocado
        FROM conv c JOIN arbol a ON a.equipo_id = c.equipo_id
      UNION
      -- "Vino sin convocar": under each equipo of their active servicios.
      SELECT ac.equipo_id, ac.persona_id, false
        FROM activos ac
        JOIN marcas m ON m.persona_id = ac.persona_id AND NOT m.convocado
    ), filas AS (
      SELECT mi.equipo_id, mi.persona_id, mi.convocado, m.estado, u.nombre, u.apellido,
             (SELECT coalesce(jsonb_agg(jsonb_build_object('puesto_id', c.puesto_id, 'nombre', c.puesto)
                                        ORDER BY c.orden, c.puesto), '[]'::jsonb)
                FROM conv c WHERE c.persona_id = mi.persona_id AND c.equipo_id = mi.equipo_id) AS puestos,
             (SELECT coalesce(jsonb_agg(c.puesto ORDER BY c.puesto), '[]'::jsonb)
                FROM conv c WHERE c.persona_id = mi.persona_id AND c.equipo_id <> mi.equipo_id) AS otros_puestos
        FROM miembros mi
        JOIN public.usuarios u ON u.id = mi.persona_id
        LEFT JOIN marcas m ON m.persona_id = mi.persona_id
    ), otros AS (
      SELECT ac.equipo_id, ac.persona_id, u.nombre, u.apellido
        FROM activos ac
        JOIN public.usuarios u ON u.id = ac.persona_id
       WHERE NOT EXISTS (SELECT 1 FROM conv c WHERE c.persona_id = ac.persona_id)
         AND NOT EXISTS (SELECT 1 FROM marcas m WHERE m.persona_id = ac.persona_id)
    ), equipos AS (
      SELECT a.equipo_id, a.label, a.ruta,
             (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'persona_id', f.persona_id, 'nombre', f.nombre, 'apellido', f.apellido,
                       'iniciales', public.dps_iniciales(f.nombre, f.apellido), 'convocado', f.convocado,
                       'estado', f.estado, 'puestos', f.puestos, 'otros_puestos', f.otros_puestos)
                       ORDER BY f.nombre, f.apellido, f.persona_id), '[]'::jsonb)
                FROM filas f WHERE f.equipo_id = a.equipo_id) AS personas,
             (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'persona_id', o.persona_id, 'nombre', o.nombre, 'apellido', o.apellido,
                       'iniciales', public.dps_iniciales(o.nombre, o.apellido))
                       ORDER BY o.nombre, o.apellido, o.persona_id), '[]'::jsonb)
                FROM otros o WHERE o.equipo_id = a.equipo_id) AS otros,
             (SELECT count(*) FILTER (WHERE f.estado = 'llego')::int FROM filas f WHERE f.equipo_id = a.equipo_id) AS llegaron,
             (SELECT count(*) FILTER (WHERE f.convocado AND f.estado IS NULL)::int FROM filas f WHERE f.equipo_id = a.equipo_id) AS por_llegar,
             (SELECT count(*) FILTER (WHERE f.estado = 'aviso_no_viene')::int FROM filas f WHERE f.equipo_id = a.equipo_id) AS aviso
        FROM arbol a
       WHERE EXISTS (SELECT 1 FROM filas f WHERE f.equipo_id = a.equipo_id)
          OR EXISTS (SELECT 1 FROM otros o WHERE o.equipo_id = a.equipo_id)
    ), personas AS (
      SELECT f.persona_id, bool_or(f.convocado) AS convocado, max(f.estado) AS estado FROM filas f GROUP BY f.persona_id
    )
    SELECT jsonb_build_object(
             'plan_id', v_plan.id, 'fecha', v_plan.fecha, 'tipo', v_plan.tipo, 'titulo', v_plan.titulo,
             'hoy', v_hoy, 'editable', v_plan.fecha BETWEEN v_hoy - 14 AND v_hoy,
             'equipos', coalesce((SELECT jsonb_agg(jsonb_build_object(
                           'equipo_id', e.equipo_id, 'equipo', e.label, 'ruta', e.ruta,
                           'llegaron', e.llegaron, 'por_llegar', e.por_llegar, 'aviso', e.aviso,
                           'personas', e.personas, 'otros', e.otros) ORDER BY e.ruta)
                                   FROM equipos e), '[]'::jsonb),
             'totales', (SELECT jsonb_build_object(
                           'convocados', count(*) FILTER (WHERE p.convocado),
                           'llegaron', count(*) FILTER (WHERE p.estado = 'llego'),
                           'por_llegar', count(*) FILTER (WHERE p.convocado AND p.estado IS NULL),
                           'aviso', count(*) FILTER (WHERE p.estado = 'aviso_no_viene'),
                           'sin_convocar', count(*) FILTER (WHERE NOT p.convocado))
                           FROM personas p))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.dps_asistencia_planilla(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_asistencia_planilla(uuid, uuid) TO authenticated;

-- ── 4. once ──────────────────────────────────────────────────────────

SELECT public.dps_directores_retirar_sembrados();
SELECT public.dps_directores_puestos_sincronizar();
