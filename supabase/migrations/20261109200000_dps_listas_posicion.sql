-- noqa: insert-into
-- DPS planning: lists by position and several people per cell
-- (odd/tasks/dps-asistencia-pco.md, T14a, T14b; S12.1-S12.4, L56, L57,
-- S12.2 as amended by L59) and
-- the follow-up of the T11c/T13 review (T13c, L55). Builds on
-- 20261108200000..208000.
--
-- The user asked (L56): "que en un mismo puesto se puedan elegir dos personas
-- y que se puedan elegir personas segun su posicion, es decir en cantantes
-- solo cantantes de la banda, comunicador solo los comunicadores autorizados,
-- en host solo los host autorizados, lo mismo para productores .. el
-- director de dps tenga esas listas donde agrega a esas personas", and chose
-- (L56, L57): productores edited by the DPS direction and the Producción
-- Creativa direction, hosts and comunicadores by the DPS direction; Cantantes
-- = a «Cantantes» sub-equipo of Global Music, plus one sub-equipo per
-- instrument, filled by Miguel from Dream Team; a name without an account is
-- written by hand («Sin cuenta»); several people in every cell. After
-- seeing it (L59): "los productores también debería ser en dream team no??
-- porque productor es un rol o puesto dentro de producción creativa", and
-- chose a «Productores» sub-equipo of Producción Creativa: the productores
-- are whoever serves there, like Cantantes with Global Music.
--
-- Re-runnable: staging already ran the first version of this file (with a
-- stored productores list); running this one on top leaves the same result
-- as on a fresh database.
--
-- What:
--   1. T14a (S12.1). Under the Global Music node (dps_raiz_musica()) the
--      active sub-equipos «Cantantes», «Piano», «Bajo», «Batería» and
--      «Guitarra eléctrica», with the experiencia of Global Music, each with
--      the roles of a sub-área (coordinador / coordinador, entrenador /
--      lider, voluntario / voluntario, as the Waumba and UpStreet sub-áreas
--      of 20261003161000 and 20261007100000), so people are placed with the
--      Dream Team screens. Their puestos of the Sunday plan move there:
--      «Líder de alabanza» to Cantantes, each instrument to its sub-equipo;
--      «Líder de banda» and «Asistente técnico» stay on Global Music. A
--      puesto keeps its id, so its convocados (they hang from puesto_id) stay
--      as they are. Idempotent and additive: equipos and roles are inserted
--      only when missing (dream_team_equipos_parent_label_uniq,
--      dream_team_roles_equipo_label_uniq); a puesto moves only from Global
--      Music and only when its sub-equipo is active and has no active puesto
--      of that name. Without the Global Music node, a NOTICE and nothing.
--      Transition: the 19 servidores are still on the Global Music node
--      itself, the PARENT of the new sub-equipos, so a puesto of Cantantes
--      would refuse them (a servicio had to be in the puesto's subtree).
--      dps_equipos_para_puesto(equipo) is that subtree plus, only inside
--      Global Music, the puesto's ancestors up to the Global Music node:
--      dps_convocar, dps_copiar_plan and dps_candidatos_puesto use it, so
--      someone still on Global Music can be convocado in a puesto of its
--      sub-equipos; once Miguel moves them they are found in the sub-equipo.
--      Nowhere else does a servicio above the puesto count.
--      L59: under «Producción Creativa» (the active direct child of the DPS
--      root with that label) the active sub-equipo «Productores», with the
--      experiencia of its parent and the same three roles; inserted only
--      when missing. Without Producción Creativa, a NOTICE and nothing.
--   2. S12.2. dps_listas_personas (lista 'hosts' or 'comunicadores',
--      persona_id, agregado_por, created_at; one row per lista and person):
--      who may be picked in those columns of the sheet. The Productores and
--      Cantantes lists are not stored: they are the people with an active
--      servicio in the «Productores» sub-equipo of Producción Creativa (L59)
--      or the «Cantantes» sub-equipo of Global Music (and below), placed
--      from Dream Team. Where the first version of this file already ran,
--      the stored productores rows are deleted and the CHECK on lista is
--      replaced (dps_listas_personas_lista_check, dropped and added again).
--      For authenticated:
--        dps_lista_puede_editar(lista) -> boolean   hosts and comunicadores:
--            a configurator (dps_exigir_configurador's rule); productores,
--            cantantes and anything else: false.
--        dps_lista_leer(lista) -> {lista, puede_editar, personas: [{persona_id,
--            nombre, iniciales}] by nombre}   dps_puede_ver; the four lists.
--        dps_lista_agregar(lista, persona) / dps_lista_quitar(lista, persona)
--            -> the list as dps_lista_leer   hosts and comunicadores only
--            (else 'lista_invalida'); dps_lista_puede_editar, else
--            'sin_autoridad'; idempotent. Taking someone off a list (or out
--            of a sub-equipo) leaves the plans where they already are as
--            they are.
--   3. S12.3, S12.4. dps_plan_personas: the people of the Productor, Host,
--      Comunicador and Cantantes cells of a plan, in order (posicion), each
--      a persona of the system or a written name (never both, S7.3); at most
--      3 per cell, 8 in Cantantes. Existing values are copied in once (the
--      single *_persona_id / *_texto columns and the text of
--      campos.cantantes), so nothing is lost. dps_plan_campo now takes, for
--      productor, host, comunicador and cantantes: null or [] (clears), one
--      {"persona_id"} | {"texto"} object (as before) or an array of them;
--      cantantes still takes a plain string too (one written name, as
--      before). Repeated people or names are kept once. A persona must be
--      on the column's list or already be in that cell of that plan
--      (existing values are kept, S12.4); a written name is always allowed.
--      The old columns keep the first entry and campos.cantantes the names
--      joined with ', ', so anything reading them still reads the cell.
--      dps_plan_json adds `personas` {productor, host, comunicador,
--      cantantes: [{persona_id, texto, nombre}]}; every other key is as
--      before.
--   4. T13c (L55). The horarios of dps_plan_campo('horarios') and
--      dps_config_guardar follow dps_plan_horarios_guardar: 1 to 4 services
--      (dps_horarios_normalizar still sorts and drops repeats, so what is
--      stored is strictly ascending) and the llegada not after the first
--      ('llegada_invalida'), also for dps_plan_campo('llegada').
--      dps_orden_item_guardar and dps_orden_mover read the row again under
--      the plan lock and raise 'item_invalido' when it was deleted in
--      between (they returned null / a position before).
--   5. Internal (no EXECUTE for PUBLIC, anon or authenticated):
--      dps_es_configurador() (dps_exigir_configurador now uses it),
--      dps_equipo_cantantes(), dps_equipo_produccion_creativa(),
--      dps_equipo_productores(), dps_equipos_para_puesto(equipo),
--      dps_lista_equipo(lista), dps_lista_tiene(lista, persona).
--
-- Errors: 'sin_autoridad' (42501); 22023 for lista_invalida (an unknown
-- list, or productores / cantantes for agregar / quitar), persona_invalida,
-- demasiadas_personas (more than 3, or 8 in Cantantes),
-- persona_fuera_de_lista, valor_invalido, persona_o_texto, llegada_invalida,
-- horarios_invalidos, item_invalido.
--
-- Suite: supabase/tests/dps-planificacion-listas.test.sql.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.dps_lista_quitar(text, uuid), public.dps_lista_agregar(text, uuid),
--     public.dps_lista_leer(text), public.dps_lista_puede_editar(text), public.dps_lista_tiene(text, uuid),
--     public.dps_lista_equipo(text), public.dps_equipos_para_puesto(uuid), public.dps_equipo_productores(),
--     public.dps_equipo_produccion_creativa(), public.dps_equipo_cantantes();
--   re-run, in this order, dps_exigir_configurador, dps_plan_campo and
--   dps_config_guardar of 20261108201000, dps_convocar and
--   dps_candidatos_puesto of 20261108202000, dps_copiar_plan of
--   20261108204000, dps_plan_json of 20261108206000 and
--   dps_orden_item_guardar / dps_orden_mover of 20261108208000; then
--   DROP FUNCTION IF EXISTS public.dps_es_configurador();
--   restore dps_horarios_normalizar from 20261108200000 (1 to 6);
--   DROP TABLE IF EXISTS public.dps_plan_personas, public.dps_listas_personas;
--   (the old single columns kept the first entry of each cell; a second or
--   third person is lost). The sub-equipos (also Productores) and roles stay (delete them only
--   while no servicio points at them); move the puestos back with
--   UPDATE public.dps_puestos SET equipo_id = '<Global Music id>' WHERE id IN (...).

-- ── 1. Global Music sub-equipos and their puestos (T14a) ─────────────

DO $$
DECLARE
  v_subequipos constant text[] := ARRAY['Cantantes', 'Piano', 'Bajo', 'Batería', 'Guitarra eléctrica'];
  v_musica uuid := public.dps_raiz_musica();
  v_fila record;
  v_destino uuid;
BEGIN
  IF v_musica IS NULL THEN
    RAISE NOTICE 'dps listas: Global Music not found, sub-equipos skipped';
    RETURN;
  END IF;

  INSERT INTO public.dream_team_equipos (experiencia, parent_equipo_id, label, activo)
  SELECT m.experiencia, m.id, s.label, true
    FROM public.dream_team_equipos m
   CROSS JOIN unnest(v_subequipos) AS s(label)
   WHERE m.id = v_musica
     AND NOT EXISTS (SELECT 1 FROM public.dream_team_equipos e WHERE e.parent_equipo_id = m.id AND e.label = s.label);

  INSERT INTO public.dream_team_roles (equipo_id, label, nivel, activo)
  SELECT e.id, r.label, r.nivel, true
    FROM public.dream_team_equipos e
   CROSS JOIN (VALUES ('coordinador', 'coordinador'), ('entrenador', 'lider'), ('voluntario', 'voluntario')) AS r(label, nivel)
   WHERE e.parent_equipo_id = v_musica AND e.label = ANY (v_subequipos)
     AND NOT EXISTS (SELECT 1 FROM public.dream_team_roles x WHERE x.equipo_id = e.id AND x.label = r.label);

  FOR v_fila IN
    SELECT * FROM (VALUES
      ('Líder de alabanza', 'Cantantes'),
      ('Piano', 'Piano'),
      ('Bajo', 'Bajo'),
      ('Batería', 'Batería'),
      ('Guitarra eléctrica', 'Guitarra eléctrica')
    ) AS t(puesto, subequipo)
  LOOP
    SELECT e.id INTO v_destino
      FROM public.dream_team_equipos e
     WHERE e.parent_equipo_id = v_musica AND e.label = v_fila.subequipo AND e.activo;
    IF v_destino IS NULL THEN
      RAISE NOTICE 'dps listas: sub-equipo % is not active, puesto % left on Global Music', v_fila.subequipo, v_fila.puesto;
      CONTINUE;
    END IF;
    UPDATE public.dps_puestos p
       SET equipo_id = v_destino, updated_at = now()
     WHERE p.activo AND p.equipo_id = v_musica AND lower(btrim(p.nombre)) = lower(v_fila.puesto)
       AND NOT EXISTS (SELECT 1 FROM public.dps_puestos x
                        WHERE x.activo AND x.equipo_id = v_destino AND lower(btrim(x.nombre)) = lower(v_fila.puesto));
  END LOOP;
END;
$$;

-- L59: Producción Creativa › Productores, placed from Dream Team.
DO $$
DECLARE
  v_pc uuid;
BEGIN
  SELECT e.id INTO v_pc
    FROM public.dream_team_equipos e
   WHERE e.parent_equipo_id = public.dps_raiz() AND e.label = 'Producción Creativa' AND e.activo
   ORDER BY e.created_at, e.id
   LIMIT 1;
  IF v_pc IS NULL THEN
    RAISE NOTICE 'dps listas: Producción Creativa not found, sub-equipo Productores skipped';
    RETURN;
  END IF;

  INSERT INTO public.dream_team_equipos (experiencia, parent_equipo_id, label, activo)
  SELECT pc.experiencia, pc.id, 'Productores', true
    FROM public.dream_team_equipos pc
   WHERE pc.id = v_pc
     AND NOT EXISTS (SELECT 1 FROM public.dream_team_equipos e WHERE e.parent_equipo_id = pc.id AND e.label = 'Productores');

  INSERT INTO public.dream_team_roles (equipo_id, label, nivel, activo)
  SELECT e.id, r.label, r.nivel, true
    FROM public.dream_team_equipos e
   CROSS JOIN (VALUES ('coordinador', 'coordinador'), ('entrenador', 'lider'), ('voluntario', 'voluntario')) AS r(label, nivel)
   WHERE e.parent_equipo_id = v_pc AND e.label = 'Productores'
     AND NOT EXISTS (SELECT 1 FROM public.dream_team_roles x WHERE x.equipo_id = e.id AND x.label = r.label);
END;
$$;

-- ── 2. tables ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dps_listas_personas (
  lista text NOT NULL CONSTRAINT dps_listas_personas_lista_check CHECK (lista IN ('hosts', 'comunicadores')),
  persona_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  agregado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lista, persona_id)
);
CREATE INDEX IF NOT EXISTS dps_listas_personas_persona_idx ON public.dps_listas_personas (persona_id);
-- L59: where the first version ran, productores were stored here; they are
-- the Productores sub-equipo now.
DELETE FROM public.dps_listas_personas WHERE lista NOT IN ('hosts', 'comunicadores');
ALTER TABLE public.dps_listas_personas DROP CONSTRAINT IF EXISTS dps_listas_personas_lista_check;
ALTER TABLE public.dps_listas_personas
  ADD CONSTRAINT dps_listas_personas_lista_check CHECK (lista IN ('hosts', 'comunicadores'));

CREATE TABLE IF NOT EXISTS public.dps_plan_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.dps_planes(id) ON DELETE CASCADE,
  columna text NOT NULL CHECK (columna IN ('productor', 'host', 'comunicador', 'cantantes')),
  posicion integer NOT NULL CHECK (posicion BETWEEN 0 AND 7),
  persona_id uuid REFERENCES public.usuarios(id) ON DELETE CASCADE,
  -- 4000: the old campos.cantantes text is copied in as one written name.
  texto text CHECK (btrim(texto) <> '' AND char_length(texto) <= 4000),
  -- S7.3: a persona of the system or a written name, never both.
  CONSTRAINT dps_plan_personas_uno CHECK (num_nonnulls(persona_id, texto) = 1),
  CONSTRAINT dps_plan_personas_posicion_uq UNIQUE (plan_id, columna, posicion)
);
CREATE UNIQUE INDEX IF NOT EXISTS dps_plan_personas_persona_uidx
  ON public.dps_plan_personas (plan_id, columna, persona_id) WHERE persona_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dps_plan_personas_persona_idx ON public.dps_plan_personas (persona_id);

COMMENT ON TABLE public.dps_listas_personas IS
  'Who may be picked as host or comunicador in the DPS sheet (S12.2). Only through the dps_* functions.';
COMMENT ON TABLE public.dps_plan_personas IS
  'The people of the Productor, Host, Comunicador and Cantantes cells of a DPS plan, in order (S12.4). Only through the dps_* functions.';

ALTER TABLE public.dps_listas_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dps_plan_personas ENABLE ROW LEVEL SECURITY;
-- Default privileges hand anon and authenticated everything; start from none.
REVOKE ALL ON public.dps_listas_personas, public.dps_plan_personas FROM PUBLIC, anon, authenticated;

-- The values already loaded, once per plan and cell (S12.4).
INSERT INTO public.dps_plan_personas (plan_id, columna, posicion, persona_id, texto)
SELECT p.id, c.columna, 0, c.persona_id, c.texto
  FROM public.dps_planes p
 CROSS JOIN LATERAL (VALUES
   ('productor', p.productor_persona_id, p.productor_texto),
   ('host', p.host_persona_id, p.host_texto),
   ('comunicador', p.comunicador_persona_id, p.comunicador_texto),
   ('cantantes', NULL::uuid, CASE WHEN jsonb_typeof(p.campos -> 'cantantes') = 'string' THEN nullif(btrim(p.campos ->> 'cantantes'), '') END)
 ) AS c(columna, persona_id, texto)
 WHERE num_nonnulls(c.persona_id, c.texto) = 1
   AND NOT EXISTS (SELECT 1 FROM public.dps_plan_personas x WHERE x.plan_id = p.id AND x.columna = c.columna);

-- ── 3. internal helpers ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_es_configurador()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT public.ninos_usuario_actual() IS NOT NULL AND (
    public.es_admin_o_pastor(auth.uid())
    OR EXISTS (SELECT 1 FROM (SELECT public.dps_raiz() AS id) r
                WHERE r.id IS NOT NULL
                  AND (public.auth_has_dream_team_capability_in_tree('dream_team.direct', r.id)
                       OR public.auth_has_dream_team_capability_in_tree('dream_team.org.manage', r.id))));
$$;
REVOKE ALL ON FUNCTION public.dps_es_configurador() FROM PUBLIC, anon, authenticated;

-- Same rule as 20261108201000, now read from dps_es_configurador.
CREATE OR REPLACE FUNCTION public.dps_exigir_configurador()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT public.dps_es_configurador() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  RETURN public.ninos_usuario_actual();
END;
$$;
REVOKE ALL ON FUNCTION public.dps_exigir_configurador() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dps_equipo_cantantes()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT e.id
    FROM public.dream_team_equipos e
    JOIN public.dream_team_equipos m ON m.id = e.parent_equipo_id
   WHERE m.id = public.dps_raiz_musica() AND e.label = 'Cantantes' AND e.activo AND e.experiencia = m.experiencia
   ORDER BY e.created_at, e.id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.dps_equipo_cantantes() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dps_equipo_produccion_creativa()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT e.id
    FROM public.dream_team_equipos e
   WHERE e.parent_equipo_id = public.dps_raiz() AND e.label = 'Producción Creativa' AND e.activo
   ORDER BY e.created_at, e.id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.dps_equipo_produccion_creativa() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dps_equipo_productores()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT e.id
    FROM public.dream_team_equipos e
    JOIN public.dream_team_equipos pc ON pc.id = e.parent_equipo_id
   WHERE pc.id = public.dps_equipo_produccion_creativa() AND e.label = 'Productores' AND e.activo
     AND e.experiencia = pc.experiencia
   ORDER BY e.created_at, e.id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.dps_equipo_productores() FROM PUBLIC, anon, authenticated;

-- The equipos whose servicios may fill a puesto of p_equipo: its subtree
-- and, inside Global Music only, its ancestors up to the Global Music node
-- (the S12.1 transition: people still on Global Music fill the puestos of
-- its sub-equipos).
CREATE OR REPLACE FUNCTION public.dps_equipos_para_puesto(p_equipo_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH RECURSIVE arbol AS MATERIALIZED (
    SELECT d.equipo_id AS eq, d.parent_equipo_id AS padre FROM public.dps_equipos() d
  ), musica AS MATERIALIZED (
    SELECT s AS eq FROM public.dps_subarbol(public.dps_raiz_musica()) s
  ), arriba AS (
    SELECT a.padre AS eq, 1 AS profundidad FROM arbol a WHERE a.eq = p_equipo_id AND a.eq IN (SELECT m.eq FROM musica m)
    UNION ALL
    SELECT a.padre, ar.profundidad + 1 FROM arriba ar JOIN arbol a ON a.eq = ar.eq WHERE ar.profundidad < 16
  )
  SELECT s FROM public.dps_subarbol(p_equipo_id) s
  UNION
  SELECT ar.eq FROM arriba ar WHERE ar.eq IN (SELECT m.eq FROM musica m);
$$;
REVOKE ALL ON FUNCTION public.dps_equipos_para_puesto(uuid) FROM PUBLIC, anon, authenticated;

-- The sub-equipo behind a list kept in Dream Team: Productores (L59) or
-- Cantantes; NULL for the stored lists.
CREATE OR REPLACE FUNCTION public.dps_lista_equipo(p_lista text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_lista WHEN 'productores' THEN public.dps_equipo_productores()
                      WHEN 'cantantes' THEN public.dps_equipo_cantantes() END;
$$;
REVOKE ALL ON FUNCTION public.dps_lista_equipo(text) FROM PUBLIC, anon, authenticated;

-- Whether the person is on the list: a row of dps_listas_personas, or for
-- 'productores' and 'cantantes' an active servicio in their sub-equipo or below.
CREATE OR REPLACE FUNCTION public.dps_lista_tiene(p_lista text, p_persona_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE
           WHEN p_lista IN ('productores', 'cantantes') THEN EXISTS (
             SELECT 1 FROM public.dream_team_servicios s
              WHERE s.persona_id = p_persona_id AND s.estado = 'activo'
                AND s.equipo_id IN (SELECT x FROM public.dps_subarbol(public.dps_lista_equipo(p_lista)) x))
           ELSE EXISTS (SELECT 1 FROM public.dps_listas_personas l WHERE l.lista = p_lista AND l.persona_id = p_persona_id)
         END;
$$;
REVOKE ALL ON FUNCTION public.dps_lista_tiene(text, uuid) FROM PUBLIC, anon, authenticated;

-- ── 4. lists (S12.2) ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_lista_puede_editar(p_lista text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  -- Productores and cantantes are placed in Dream Team (L59), not here.
  SELECT public.ninos_usuario_actual() IS NOT NULL AND CASE
           WHEN p_lista IN ('hosts', 'comunicadores') THEN public.dps_es_configurador()
           ELSE false
         END;
$$;
REVOKE ALL ON FUNCTION public.dps_lista_puede_editar(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_lista_puede_editar(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_lista_leer(p_lista text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT public.dps_puede_ver() THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_lista IS NULL OR p_lista NOT IN ('productores', 'hosts', 'comunicadores', 'cantantes') THEN
    RAISE EXCEPTION 'lista_invalida' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'lista', p_lista,
    'puede_editar', public.dps_lista_puede_editar(p_lista),
    'personas', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'persona_id', u.id, 'nombre', concat_ws(' ', u.nombre, u.apellido),
                          'iniciales', public.dps_iniciales(u.nombre, u.apellido))
                          ORDER BY u.nombre, u.apellido, u.id), '[]'::jsonb)
                   FROM public.usuarios u
                  WHERE CASE WHEN p_lista IN ('productores', 'cantantes')
                             THEN u.id IN (SELECT s.persona_id FROM public.dream_team_servicios s
                                            WHERE s.estado = 'activo'
                                              AND s.equipo_id IN (SELECT x FROM public.dps_subarbol(public.dps_lista_equipo(p_lista)) x))
                             ELSE u.id IN (SELECT l.persona_id FROM public.dps_listas_personas l WHERE l.lista = p_lista) END));
END;
$$;
REVOKE ALL ON FUNCTION public.dps_lista_leer(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_lista_leer(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_lista_agregar(p_lista text, p_persona_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.ninos_usuario_actual();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_lista IS NULL OR p_lista NOT IN ('hosts', 'comunicadores') THEN
    RAISE EXCEPTION 'lista_invalida' USING ERRCODE = '22023';
  END IF;
  IF NOT public.dps_lista_puede_editar(p_lista) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_persona_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_persona_id) THEN
    RAISE EXCEPTION 'persona_invalida' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.dps_listas_personas (lista, persona_id, agregado_por) -- noqa: insert-into
  VALUES (p_lista, p_persona_id, v_actor)
  ON CONFLICT (lista, persona_id) DO NOTHING;
  RETURN public.dps_lista_leer(p_lista);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_lista_agregar(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_lista_agregar(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_lista_quitar(p_lista text, p_persona_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF public.ninos_usuario_actual() IS NULL THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  IF p_lista IS NULL OR p_lista NOT IN ('hosts', 'comunicadores') THEN
    RAISE EXCEPTION 'lista_invalida' USING ERRCODE = '22023';
  END IF;
  IF NOT public.dps_lista_puede_editar(p_lista) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.dps_listas_personas l WHERE l.lista = p_lista AND l.persona_id = p_persona_id;
  RETURN public.dps_lista_leer(p_lista);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_lista_quitar(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_lista_quitar(text, uuid) TO authenticated;

-- ── 5. convocados: the S12.1 transition ──────────────────────────────

-- As 20261108202000; the servicio may also sit on an ancestor inside Global Music.
CREATE OR REPLACE FUNCTION public.dps_convocar(p_plan_id uuid, p_puesto_id uuid, p_servicio_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_puesto public.dps_puestos%ROWTYPE;
  v_servicio public.dream_team_servicios%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_plan_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.dps_planes p WHERE p.id = p_plan_id) THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT pu.* INTO v_puesto FROM public.dps_puestos pu WHERE pu.id = p_puesto_id AND pu.activo;
  IF NOT FOUND OR NOT public.dps_equipo_valido(v_puesto.equipo_id) THEN
    RAISE EXCEPTION 'puesto_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT s.* INTO v_servicio FROM public.dream_team_servicios s WHERE s.id = p_servicio_id AND s.estado = 'activo';
  IF NOT FOUND OR v_servicio.equipo_id NOT IN (SELECT x FROM public.dps_equipos_para_puesto(v_puesto.equipo_id) x) THEN
    RAISE EXCEPTION 'servicio_invalido' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('dps_convocados:' || p_plan_id::text));
  INSERT INTO public.dps_convocados (plan_id, puesto_id, servicio_id, persona_id, created_by) -- noqa: insert-into
  VALUES (p_plan_id, p_puesto_id, p_servicio_id, v_servicio.persona_id, v_actor)
  ON CONFLICT (plan_id, puesto_id, persona_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT c.id INTO v_id FROM public.dps_convocados c
     WHERE c.plan_id = p_plan_id AND c.puesto_id = p_puesto_id AND c.persona_id = v_servicio.persona_id;
  END IF;
  PERFORM public.dps_asistencia_resincronizar(p_plan_id, ARRAY[v_servicio.persona_id]);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_convocar(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_convocar(uuid, uuid, uuid) TO authenticated;

-- As 20261108204000; the servicio may also sit on an ancestor inside Global Music.
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
     AND s.equipo_id IN (SELECT x FROM public.dps_equipos_para_puesto(pu.equipo_id) x)
  ON CONFLICT (plan_id, puesto_id, persona_id) DO NOTHING;
  GET DIAGNOSTICS v_copiados = ROW_COUNT;

  PERFORM public.dps_directores_sincronizar(p_destino_id);
  PERFORM public.dps_asistencia_resincronizar(p_destino_id, NULL);
  RETURN jsonb_build_object('copiados', v_copiados, 'omitidos', v_total - v_copiados);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_copiar_plan(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_copiar_plan(uuid, uuid, boolean) TO authenticated;

-- As 20261108202000; the candidates may also sit on an ancestor inside Global Music.
CREATE OR REPLACE FUNCTION public.dps_candidatos_puesto(p_puesto_id uuid, p_plan_id uuid, p_busqueda text DEFAULT NULL)
RETURNS TABLE (
  servicio_id uuid,
  persona_id uuid,
  nombre text,
  apellido text,
  iniciales text,
  equipo_id uuid,
  equipo text,
  rol text,
  ya_convocado_en_plan boolean,
  en_este_puesto boolean,
  puestos_del_dia jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_puesto public.dps_puestos%ROWTYPE;
  v_plan public.dps_planes%ROWTYPE;
  v_busqueda text := nullif(btrim(p_busqueda), '');
  v_patron text;
BEGIN
  PERFORM public.dps_exigir_planificador();
  SELECT p.* INTO v_plan FROM public.dps_planes p WHERE p.id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  SELECT pu.* INTO v_puesto FROM public.dps_puestos pu WHERE pu.id = p_puesto_id AND pu.activo;
  IF NOT FOUND OR NOT public.dps_equipo_valido(v_puesto.equipo_id) THEN
    RAISE EXCEPTION 'puesto_invalido' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_busqueda) > 100 THEN
    RAISE EXCEPTION 'busqueda_invalida' USING ERRCODE = '22023';
  END IF;
  v_patron := '%' || replace(replace(replace(coalesce(v_busqueda, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
  SELECT sv.id, sv.persona_id, u.nombre, u.apellido, public.dps_iniciales(u.nombre, u.apellido),
         sv.equipo_id, e.label, ro.label,
         EXISTS (SELECT 1 FROM public.dps_convocados c WHERE c.plan_id = p_plan_id AND c.persona_id = sv.persona_id),
         EXISTS (SELECT 1 FROM public.dps_convocados c
                  WHERE c.plan_id = p_plan_id AND c.puesto_id = p_puesto_id AND c.persona_id = sv.persona_id),
         (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'plan_id', c.plan_id, 'mismo_plan', c.plan_id = p_plan_id, 'tipo', pl.tipo, 'titulo', pl.titulo,
                   'puesto_id', c.puesto_id, 'puesto', pu.nombre, 'equipo', pe.label)
                   ORDER BY c.plan_id = p_plan_id DESC, pl.tipo, pe.label, pu.nombre), '[]'::jsonb)
            FROM public.dps_convocados c
            JOIN public.dps_planes pl ON pl.id = c.plan_id
            JOIN public.dps_puestos pu ON pu.id = c.puesto_id
            JOIN public.dream_team_equipos pe ON pe.id = pu.equipo_id
           WHERE c.persona_id = sv.persona_id AND pl.fecha = v_plan.fecha)
    FROM public.dream_team_servicios sv
    JOIN public.usuarios u ON u.id = sv.persona_id
    JOIN public.dream_team_equipos e ON e.id = sv.equipo_id
    JOIN public.dream_team_roles ro ON ro.id = sv.rol_id
   WHERE sv.estado = 'activo'
     AND sv.equipo_id IN (SELECT s FROM public.dps_equipos_para_puesto(v_puesto.equipo_id) s)
     AND (v_busqueda IS NULL OR concat_ws(' ', u.nombre, u.apellido) ILIKE v_patron)
   ORDER BY 9, u.nombre, u.apellido, e.label, sv.id
   LIMIT 200;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_candidatos_puesto(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_candidatos_puesto(uuid, uuid, text) TO authenticated;

-- ── 6. horarios (T13c) ───────────────────────────────────────────────

-- As 20261108200000 with 1 to 4 services (dps_plan_horarios_guardar's limit).
CREATE OR REPLACE FUNCTION public.dps_horarios_normalizar(p_horarios jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  IF p_horarios IS NULL OR jsonb_typeof(p_horarios) <> 'array' THEN
    RAISE EXCEPTION 'horarios_invalidos' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_horarios) < 1
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_horarios) h
                 WHERE jsonb_typeof(h) <> 'string' OR NOT (h #>> '{}') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN
    RAISE EXCEPTION 'horarios_invalidos' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_agg(DISTINCT h #>> '{}' ORDER BY h #>> '{}') INTO v_resultado
    FROM jsonb_array_elements(p_horarios) h;
  IF jsonb_array_length(v_resultado) > 4 THEN
    RAISE EXCEPTION 'horarios_invalidos' USING ERRCODE = '22023';
  END IF;
  RETURN v_resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_horarios_normalizar(jsonb) FROM PUBLIC, anon, authenticated;

-- As 20261108201000; the llegada may not come after the first service.
CREATE OR REPLACE FUNCTION public.dps_config_guardar(p_horarios jsonb, p_llegada time)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_configurador();
  v_horarios jsonb := public.dps_horarios_normalizar(p_horarios);
BEGIN
  IF p_llegada IS NULL OR p_llegada > (v_horarios ->> 0)::time THEN
    RAISE EXCEPTION 'llegada_invalida' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.dps_config AS c (id, horarios, llegada, updated_by) -- noqa: insert-into
  VALUES (true, v_horarios, p_llegada, v_actor)
  ON CONFLICT (id) DO UPDATE
     SET horarios = excluded.horarios, llegada = excluded.llegada, updated_at = now(), updated_by = excluded.updated_by;
  RETURN jsonb_build_object('horarios', v_horarios, 'llegada', to_char(p_llegada, 'HH24:MI'));
END;
$$;
REVOKE ALL ON FUNCTION public.dps_config_guardar(jsonb, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_config_guardar(jsonb, time) TO authenticated;

-- ── 7. plan JSON and cells (S12.3, S12.4) ────────────────────────────

-- As 20261108206000 plus `personas`.
CREATE OR REPLACE FUNCTION public.dps_plan_json(p_plan_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
           'id', p.id, 'fecha', p.fecha, 'tipo', p.tipo, 'titulo', p.titulo, 'semana', p.semana,
           'serie', CASE WHEN s.id IS NOT NULL THEN jsonb_build_object(
                      'id', s.id, 'nombre', s.nombre, 'color', s.color, 'imagen_path', s.imagen_path,
                      'semanas', s.semanas, 'primer_domingo', s.primer_domingo,
                      'sinopsis', s.sinopsis, 'enlace_recurso', s.enlace_recurso) END,
           'horarios', p.horarios, 'llegada', to_char(p.llegada, 'HH24:MI'),
           'productor', public.dps_persona_json(p.productor_persona_id, p.productor_texto),
           'host', public.dps_persona_json(p.host_persona_id, p.host_texto),
           'comunicador', public.dps_persona_json(p.comunicador_persona_id, p.comunicador_texto),
           'campos', p.campos, 'updated_at', p.updated_at,
           'evento', CASE WHEN p.evento_id IS NOT NULL THEN (
                       SELECT jsonb_build_object(
                                'id', p.evento_id,
                                'dia', count(*) FILTER (WHERE e.fecha < p.fecha OR (e.fecha = p.fecha AND e.id <= p.id)),
                                'dias', count(*))
                         FROM public.dps_planes e WHERE e.evento_id = p.evento_id) END,
           'con_asistencia', EXISTS (SELECT 1 FROM public.dps_asistencias a WHERE a.plan_id = p.id),
           'personas', (SELECT jsonb_build_object(
                           'productor', coalesce(jsonb_agg(x.e ORDER BY x.posicion) FILTER (WHERE x.columna = 'productor'), '[]'::jsonb),
                           'host', coalesce(jsonb_agg(x.e ORDER BY x.posicion) FILTER (WHERE x.columna = 'host'), '[]'::jsonb),
                           'comunicador', coalesce(jsonb_agg(x.e ORDER BY x.posicion) FILTER (WHERE x.columna = 'comunicador'), '[]'::jsonb),
                           'cantantes', coalesce(jsonb_agg(x.e ORDER BY x.posicion) FILTER (WHERE x.columna = 'cantantes'), '[]'::jsonb))
                          FROM (SELECT pp.columna, pp.posicion,
                                       jsonb_build_object('persona_id', pp.persona_id, 'texto', pp.texto,
                                         'nombre', CASE WHEN pp.persona_id IS NOT NULL THEN concat_ws(' ', u.nombre, u.apellido) ELSE pp.texto END) AS e
                                  FROM public.dps_plan_personas pp
                                  LEFT JOIN public.usuarios u ON u.id = pp.persona_id
                                 WHERE pp.plan_id = p.id) x))
    FROM public.dps_planes p
    LEFT JOIN public.dps_series s ON s.id = p.serie_id
   WHERE p.id = p_plan_id;
$$;
REVOKE ALL ON FUNCTION public.dps_plan_json(uuid) FROM PUBLIC, anon, authenticated;

-- As 20261108201000 except: llegada / horarios keep the llegada not after
-- the first service (T13c); productor, host, comunicador and cantantes take
-- several people (S12.3, S12.4); see the header.
CREATE OR REPLACE FUNCTION public.dps_plan_campo(p_plan_id uuid, p_campo text, p_valor jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_tipo text := jsonb_typeof(p_valor);
  v_plan public.dps_planes%ROWTYPE;
  v_items jsonb;
  v_item jsonb;
  v_max integer;
  v_max_texto integer;
  v_lista text;
  v_personas uuid[] := ARRAY[]::uuid[];
  v_textos text[] := ARRAY[]::text[];
  v_persona uuid;
  v_texto text;
  v_horarios jsonb;
BEGIN
  SELECT p.* INTO v_plan FROM public.dps_planes p WHERE p.id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'plan_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_valor IS NULL OR v_tipo = 'null' THEN
    v_tipo := 'null';
  END IF;

  IF p_campo = 'titulo' THEN
    IF v_tipo NOT IN ('null', 'string') OR char_length(btrim(p_valor #>> '{}')) > 120 THEN
      RAISE EXCEPTION 'titulo_invalido' USING ERRCODE = '22023';
    END IF;
    UPDATE public.dps_planes SET titulo = nullif(btrim(p_valor #>> '{}'), '') WHERE id = p_plan_id;

  ELSIF p_campo = 'llegada' THEN
    IF v_tipo <> 'string' OR NOT (p_valor #>> '{}') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR (p_valor #>> '{}')::time > (v_plan.horarios ->> 0)::time THEN
      RAISE EXCEPTION 'llegada_invalida' USING ERRCODE = '22023';
    END IF;
    UPDATE public.dps_planes SET llegada = (p_valor #>> '{}')::time WHERE id = p_plan_id;

  ELSIF p_campo = 'horarios' THEN
    v_horarios := public.dps_horarios_normalizar(p_valor);
    IF v_plan.llegada > (v_horarios ->> 0)::time THEN
      RAISE EXCEPTION 'llegada_invalida' USING ERRCODE = '22023';
    END IF;
    UPDATE public.dps_planes SET horarios = v_horarios WHERE id = p_plan_id;

  ELSIF p_campo IN ('productor', 'host', 'comunicador', 'cantantes') THEN
    v_max := CASE WHEN p_campo = 'cantantes' THEN 8 ELSE 3 END;
    v_max_texto := CASE WHEN p_campo = 'cantantes' THEN 4000 ELSE 120 END;
    v_lista := CASE p_campo WHEN 'productor' THEN 'productores' WHEN 'host' THEN 'hosts'
                            WHEN 'comunicador' THEN 'comunicadores' ELSE 'cantantes' END;
    IF v_tipo = 'null' THEN
      v_items := '[]'::jsonb;
    ELSIF v_tipo = 'object' THEN
      v_items := jsonb_build_array(p_valor);
    ELSIF v_tipo = 'array' THEN
      v_items := p_valor;
    ELSIF v_tipo = 'string' AND p_campo = 'cantantes' THEN
      -- The old shape of Cantantes: one written name.
      v_items := CASE WHEN nullif(btrim(p_valor #>> '{}'), '') IS NULL THEN '[]'::jsonb
                      ELSE jsonb_build_array(jsonb_build_object('texto', p_valor #>> '{}')) END;
    ELSE
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_items) > 50 THEN
      RAISE EXCEPTION 'demasiadas_personas' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT t.e FROM jsonb_array_elements(v_items) WITH ORDINALITY AS t(e, o) ORDER BY t.o LOOP
      IF jsonb_typeof(v_item) <> 'object' THEN
        RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_item) k WHERE k NOT IN ('persona_id', 'texto'))
         OR num_nonnulls(nullif(v_item -> 'persona_id', 'null'::jsonb),
                         nullif(btrim(nullif(v_item -> 'texto', 'null'::jsonb) #>> '{}'), '')) <> 1 THEN
        RAISE EXCEPTION 'persona_o_texto' USING ERRCODE = '22023';
      END IF;
      v_persona := NULL;
      v_texto := NULL;
      IF v_item ? 'persona_id' AND jsonb_typeof(v_item -> 'persona_id') <> 'null' THEN
        IF jsonb_typeof(v_item -> 'persona_id') <> 'string'
           OR (v_item ->> 'persona_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          RAISE EXCEPTION 'persona_invalida' USING ERRCODE = '22023';
        END IF;
        v_persona := (v_item ->> 'persona_id')::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_persona) THEN
          RAISE EXCEPTION 'persona_invalida' USING ERRCODE = '22023';
        END IF;
        CONTINUE WHEN v_persona = ANY (v_personas);
      ELSE
        IF jsonb_typeof(v_item -> 'texto') <> 'string' OR char_length(btrim(v_item ->> 'texto')) > v_max_texto THEN
          RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
        END IF;
        v_texto := btrim(v_item ->> 'texto');
        CONTINUE WHEN EXISTS (SELECT 1 FROM unnest(v_textos) t WHERE lower(t) = lower(v_texto));
      END IF;
      v_personas := v_personas || v_persona;
      v_textos := v_textos || v_texto;
    END LOOP;

    IF cardinality(v_personas) > v_max THEN
      RAISE EXCEPTION 'demasiadas_personas' USING ERRCODE = '22023';
    END IF;
    -- S12.3: from the column's list, or already in this cell (S12.4).
    IF EXISTS (SELECT 1 FROM unnest(v_personas) AS x(persona_id)
                WHERE x.persona_id IS NOT NULL
                  AND NOT public.dps_lista_tiene(v_lista, x.persona_id)
                  AND NOT EXISTS (SELECT 1 FROM public.dps_plan_personas pp
                                   WHERE pp.plan_id = p_plan_id AND pp.columna = p_campo AND pp.persona_id = x.persona_id)) THEN
      RAISE EXCEPTION 'persona_fuera_de_lista' USING ERRCODE = '22023';
    END IF;

    -- One writer per plan at a time: the cell is rewritten whole.
    PERFORM 1 FROM public.dps_planes p WHERE p.id = p_plan_id FOR UPDATE;
    DELETE FROM public.dps_plan_personas pp WHERE pp.plan_id = p_plan_id AND pp.columna = p_campo;
    INSERT INTO public.dps_plan_personas (plan_id, columna, posicion, persona_id, texto) -- noqa: insert-into
    SELECT p_plan_id, p_campo, (x.o - 1)::integer, x.persona_id, x.texto
      FROM unnest(v_personas, v_textos) WITH ORDINALITY AS x(persona_id, texto, o);

    -- The old single columns and campos.cantantes follow the cell.
    IF p_campo = 'productor' THEN
      UPDATE public.dps_planes SET productor_persona_id = v_personas[1], productor_texto = v_textos[1] WHERE id = p_plan_id;
    ELSIF p_campo = 'host' THEN
      UPDATE public.dps_planes SET host_persona_id = v_personas[1], host_texto = v_textos[1] WHERE id = p_plan_id;
    ELSIF p_campo = 'comunicador' THEN
      UPDATE public.dps_planes SET comunicador_persona_id = v_personas[1], comunicador_texto = v_textos[1] WHERE id = p_plan_id;
    ELSE
      UPDATE public.dps_planes
         SET campos = CASE WHEN cardinality(v_personas) = 0 THEN campos - 'cantantes'
                           ELSE jsonb_set(campos, '{cantantes}', to_jsonb(left(
                                  (SELECT string_agg(coalesce(x.texto, concat_ws(' ', u.nombre, u.apellido)), ', ' ORDER BY x.o)
                                     FROM unnest(v_personas, v_textos) WITH ORDINALITY AS x(persona_id, texto, o)
                                     LEFT JOIN public.usuarios u ON u.id = x.persona_id), 4000))) END
       WHERE id = p_plan_id;
    END IF;

  ELSIF p_campo IN ('opener', 'anuncios', 'closer', 'historia_vida', 'sinopsis_override', 'notas') THEN
    IF v_tipo NOT IN ('null', 'string') OR char_length(p_valor #>> '{}') > 4000 THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    END IF;
    UPDATE public.dps_planes
       SET campos = CASE WHEN nullif(btrim(p_valor #>> '{}'), '') IS NULL THEN campos - p_campo
                         ELSE jsonb_set(campos, ARRAY[p_campo], to_jsonb(btrim(p_valor #>> '{}'))) END
     WHERE id = p_plan_id;

  ELSIF p_campo = 'canciones' THEN
    IF v_tipo = 'null' THEN
      UPDATE public.dps_planes SET campos = campos - 'canciones' WHERE id = p_plan_id;
    ELSIF v_tipo <> 'array' THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    ELSIF jsonb_array_length(p_valor) > 10
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_valor) c
                   WHERE jsonb_typeof(c) <> 'string' OR char_length(c #>> '{}') > 200) THEN
      RAISE EXCEPTION 'valor_invalido' USING ERRCODE = '22023';
    ELSIF jsonb_array_length(p_valor) = 0 THEN
      UPDATE public.dps_planes SET campos = campos - 'canciones' WHERE id = p_plan_id;
    ELSE
      UPDATE public.dps_planes
         SET campos = jsonb_set(campos, '{canciones}',
               (SELECT jsonb_agg(btrim(t.c #>> '{}') ORDER BY t.o) FROM jsonb_array_elements(p_valor) WITH ORDINALITY AS t(c, o)))
       WHERE id = p_plan_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'campo_invalido' USING ERRCODE = '22023';
  END IF;

  UPDATE public.dps_planes SET updated_at = now(), updated_by = v_actor WHERE id = p_plan_id;
  RETURN public.dps_plan_json(p_plan_id);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'plan_duplicado' USING ERRCODE = '22023';
END;
$$;
REVOKE ALL ON FUNCTION public.dps_plan_campo(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_plan_campo(uuid, text, jsonb) TO authenticated;

-- ── 8. order: the row may vanish before the lock (T13c) ──────────────

-- As 20261108208000; the row is read again under the plan lock.
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
  -- Deleted while waiting for the lock.
  SELECT o.* INTO v_item FROM public.dps_orden_items o WHERE o.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_invalido' USING ERRCODE = '22023';
  END IF;
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

-- As 20261108208000; the row is read again under the plan lock.
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
  -- Read again under the lock: another move may have shifted it, or a delete removed it.
  SELECT o.posicion INTO v_desde FROM public.dps_orden_items o WHERE o.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_invalido' USING ERRCODE = '22023';
  END IF;
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
