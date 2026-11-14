-- R4a (odd/tasks/talleres-rediseno.md, S10; L12, L13) — the team edits,
-- from the app, the subject and the message of each automatic talleres
-- notice, with data variables; in a taller with a plantilla de clases,
-- also a class reminder of its own per clase. Approved designs:
-- design/talleres-avisos/01–04 («Decisiones» notes = this contract).
--
-- L12 (user, relayed): edit "el asunto y el texto de cada aviso" with
-- variables (nombre, taller, fecha, hora, lugar, indicaciones) and a
-- preview; in Próximo Paso, a message per clase.
-- L13 (user): per-clase message for any taller with plantilla de clases;
-- only subject and message are editable (the bell title stays automatic).
--
-- Adds:
--   A. taller_aviso_textos: one custom text per (taller, tipo[, clase de la
--      plantilla]). No row = the text the SQL builders write today,
--      unchanged. Only the 7 editable kinds («Cambio de fecha» stays fixed,
--      written by talleres_suspender_edicion). asunto 1..200 on one line,
--      mensaje 1..1000 (design 02: "un asunto vacío o de más de 200
--      caracteres y un mensaje de más de 1000"). clase_id only for
--      recordatorio_clase. RLS: readable by whoever reads the notices
--      center of that taller (coordinator/director read or write,
--      admin.manage, scoped to the taller's equipo); no direct writes.
--   B. talleres_aviso_variables(): the closed list of variables per kind
--      and the ones allowed in the subject (always present). The app reads
--      it, the save RPC validates against it: one list.
--   C. talleres_aviso_texto_render(plantilla, datos): replaces {var} with
--      its value and DROPS every line with a variable that is null or
--      empty («Si a una línea le falta un dato, la línea no sale»). After a
--      value ending in '.', a '.' right after the {var} is not repeated
--      («7:00 p. m.» never becomes «7:00 p. m..»). Blank-line runs left by
--      dropped lines collapse to one; edges are trimmed.
--   D. talleres_aviso_texto_guardar / talleres_aviso_texto_restaurar
--      (authenticated, same writers as talleres_avisos_config_guardar).
--      Errors (22023): AVISO_NO_EDITABLE, CLASE_SOLO_EN_RECORDATORIO,
--      CLASE_INVALIDA, ASUNTO_VACIO, ASUNTO_DEMASIADO_LARGO, MENSAJE_VACIO,
--      MENSAJE_DEMASIADO_LARGO, 'VARIABLE_DESCONOCIDA: {x}[, {y}]',
--      'VARIABLE_NO_PERMITIDA_EN_ASUNTO: {x}[, {y}]', LLAVE_SIN_CERRAR;
--      42501 sin_permisos_para_este_taller; P0002 taller_no_encontrado.
--   E. taller_sesiones.plantilla_clase_id (nullable, ON DELETE SET NULL):
--      the plantilla clase a sesión was created from (design 03: "Lo
--      seguro es que cada sesión recuerde de qué clase de la plantilla
--      salió"). generate_taller_sesiones fills it; programada sesiones
--      already created get it by an unambiguous tema match inside their
--      taller. A sesión without it (extra, recovered, no plantilla, tema
--      edited) uses the general text.
--   F. Rendering: talleres_aviso_emitir (the one writer) resolves the
--      custom text when its caller passes p_datos.variables: the clase's
--      text (p_datos.plantilla_clase_id) first, then the general text of
--      the kind, else the caller's default text exactly as today. nombre
--      (first name) and taller are filled by emitir; the builder passes
--      the rest. 'variables' and 'plantilla_clase_id' are not stored.
--      Rendered message capped at 1000 (avisos_persona.cuerpo), subject at
--      200; an empty render keeps the default. Queued notices keep the
--      text they were written with (nothing is re-rendered).
--      Builders re-created with their data (same bodies otherwise):
--      talleres_aviso_inscripcion (recibida, aprobada, rechazada, grupo),
--      talleres_avisos_recordatorios_encolar, talleres_avisame_notificar,
--      talleres_avisos_certificado_trg.
--   G. talleres_avisos_panel adds "textos": [{tipo, clase_id, asunto,
--      mensaje, editado_por, editado_en}] (design 01: "Personalizado ·
--      quién · cuándo").
--
-- Functions re-created here (newest previous definition):
--   talleres_aviso_emitir            20261110230000_talleres_avisos.sql
--   talleres_avisame_notificar       20261110230000_talleres_avisos.sql
--   talleres_avisos_certificado_trg  20261110230000_talleres_avisos.sql
--   talleres_avisos_panel            20261110230000_talleres_avisos.sql
--   talleres_aviso_inscripcion       20261111130000_talleres_avisos_detalles.sql
--   talleres_avisos_recordatorios_encolar 20261111130000_talleres_avisos_detalles.sql
--   generate_taller_sesiones         20260927130000_talleres_configuracion_hardening.sql
--
-- Rollback (in this order):
--   1. Re-run the CREATE OR REPLACE FUNCTION blocks of the files above for
--      the 7 re-created functions (emitir, avisame_notificar,
--      certificado_trg and panel from 20261110230000; aviso_inscripcion
--      and recordatorios_encolar from 20261111130000;
--      generate_taller_sesiones from 20260927130000), and their COMMENT ON
--      FUNCTION statements (20261110230000:243 for emitir, 20261111130000:360
--      for recordatorios_encolar).
--   2. DROP TABLE IF EXISTS public.taller_aviso_textos;  (drops its policy,
--      which depends on talleres_aviso_textos_puede, so it goes first)
--   3. DROP FUNCTION IF EXISTS
--        public.talleres_aviso_texto_restaurar(uuid, text, uuid),
--        public.talleres_aviso_texto_guardar(uuid, text, uuid, text, text),
--        public.talleres_aviso_texto_render(text, jsonb),
--        public.talleres_aviso_variables(),
--        public.talleres_aviso_textos_puede(uuid, boolean);
--   4. DROP INDEX IF EXISTS public.taller_sesiones_plantilla_clase_idx;
--      ALTER TABLE public.taller_sesiones DROP COLUMN IF EXISTS plantilla_clase_id;

-- ===========================================================================
-- A. taller_aviso_textos
-- ===========================================================================

CREATE TABLE public.taller_aviso_textos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id uuid NOT NULL REFERENCES public.talleres(id) ON DELETE CASCADE,
  tipo text NOT NULL
    CONSTRAINT taller_aviso_textos_tipo_check
    CHECK (tipo IN ('inscripcion_recibida', 'inscripcion_aprobada', 'inscripcion_rechazada', 'grupo_asignado',
                    'recordatorio_clase', 'certificado_listo', 'lugar_disponible')),
  clase_id uuid NULL REFERENCES public.taller_plantilla_clases(id) ON DELETE CASCADE,
  asunto text NOT NULL
    CONSTRAINT taller_aviso_textos_asunto_check
    CHECK (length(asunto) BETWEEN 1 AND 200 AND asunto !~ '[\r\n]'),
  mensaje text NOT NULL
    CONSTRAINT taller_aviso_textos_mensaje_check
    CHECK (length(mensaje) BETWEEN 1 AND 1000),
  updated_by uuid NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT taller_aviso_textos_clase_check CHECK (clase_id IS NULL OR tipo = 'recordatorio_clase')
);

CREATE UNIQUE INDEX taller_aviso_textos_unico
  ON public.taller_aviso_textos (taller_id, tipo, (coalesce(clase_id, '00000000-0000-0000-0000-000000000000'::uuid)));
CREATE INDEX taller_aviso_textos_clase_idx
  ON public.taller_aviso_textos (clase_id) WHERE clase_id IS NOT NULL;
CREATE INDEX taller_aviso_textos_updated_by_idx
  ON public.taller_aviso_textos (updated_by) WHERE updated_by IS NOT NULL;

COMMENT ON TABLE public.taller_aviso_textos IS
  'R4 (S10): custom subject and message of an automatic talleres notice, per taller and tipo; clase_id (a taller_plantilla_clases row of the same taller) only for recordatorio_clase. No row = the default text of the SQL builders. Variables {x} from talleres_aviso_variables(). Written only by talleres_aviso_texto_guardar/_restaurar; read by the notices center readers of the taller.';

-- Who can read (p_escribir false) or write (true) the notices of a taller:
-- the same capabilities as talleres_avisos_panel (read) and
-- talleres_avisos_config_guardar (write), scoped to the taller's equipo.
CREATE OR REPLACE FUNCTION public.talleres_aviso_textos_puede(p_taller_id uuid, p_escribir boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT coalesce((
    SELECT public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', t.dream_team_equipo_id)
        OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', t.dream_team_equipo_id)
        OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', t.dream_team_equipo_id)
        OR (NOT coalesce(p_escribir, true)
            AND (public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', t.dream_team_equipo_id)
                 OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', t.dream_team_equipo_id)))
      FROM public.talleres t
     WHERE t.id = p_taller_id), false);
$function$;

COMMENT ON FUNCTION public.talleres_aviso_textos_puede(uuid, boolean) IS
  'R4: true when the caller may read (p_escribir false: coordinator/director read or write, admin.manage) or write (coordinator/director write, admin.manage) the notices of the taller, scoped to its equipo. Same checks as talleres_avisos_panel / talleres_avisos_config_guardar.';

REVOKE ALL ON FUNCTION public.talleres_aviso_textos_puede(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_aviso_textos_puede(uuid, boolean) TO authenticated, service_role;

ALTER TABLE public.taller_aviso_textos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.taller_aviso_textos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.taller_aviso_textos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.taller_aviso_textos TO service_role;

CREATE POLICY taller_aviso_textos_select ON public.taller_aviso_textos
  FOR SELECT TO authenticated
  USING (public.talleres_aviso_textos_puede(taller_id, false));

-- ===========================================================================
-- B. Variables per kind (one list for the app and the database)
-- ===========================================================================

-- {"<tipo>": {"variables": [...], "asunto": [...]}}. "asunto" are the
-- variables that always have a value (design 02: "El asunto solo admite
-- datos que siempre existen").
CREATE OR REPLACE FUNCTION public.talleres_aviso_variables()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'inscripcion_recibida', jsonb_build_object(
      'variables', jsonb_build_array('nombre', 'taller', 'edicion', 'fecha', 'hora', 'lugar', 'indicaciones'),
      'asunto', jsonb_build_array('nombre', 'taller', 'edicion')),
    'inscripcion_aprobada', jsonb_build_object(
      'variables', jsonb_build_array('nombre', 'taller', 'edicion', 'fecha', 'hora', 'lugar', 'indicaciones'),
      'asunto', jsonb_build_array('nombre', 'taller', 'edicion')),
    'inscripcion_rechazada', jsonb_build_object(
      'variables', jsonb_build_array('nombre', 'taller', 'edicion', 'mensaje_no_aprobado'),
      'asunto', jsonb_build_array('nombre', 'taller', 'edicion')),
    'grupo_asignado', jsonb_build_object(
      'variables', jsonb_build_array('nombre', 'taller', 'edicion', 'grupo', 'facilitadores', 'fecha', 'hora', 'lugar', 'indicaciones'),
      'asunto', jsonb_build_array('nombre', 'taller', 'edicion', 'grupo')),
    'recordatorio_clase', jsonb_build_object(
      'variables', jsonb_build_array('nombre', 'taller', 'edicion', 'numero', 'clase', 'grupo', 'facilitadores', 'fecha', 'hora', 'lugar', 'indicaciones'),
      'asunto', jsonb_build_array('nombre', 'taller', 'edicion', 'grupo', 'numero')),
    'certificado_listo', jsonb_build_object(
      'variables', jsonb_build_array('nombre', 'taller', 'edicion'),
      'asunto', jsonb_build_array('nombre', 'taller', 'edicion')),
    'lugar_disponible', jsonb_build_object(
      'variables', jsonb_build_array('nombre', 'taller', 'edicion', 'fecha'),
      'asunto', jsonb_build_array('nombre', 'taller', 'edicion'))
  );
$function$;

COMMENT ON FUNCTION public.talleres_aviso_variables() IS
  'R4: the closed list of variables per editable notice kind ("variables") and those allowed in the subject ("asunto"). Shared by the app (chips, client validation) and talleres_aviso_texto_guardar.';

REVOKE ALL ON FUNCTION public.talleres_aviso_variables() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_aviso_variables() TO authenticated, service_role;

-- ===========================================================================
-- C. Render
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_aviso_texto_render(p_plantilla text, p_datos jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_linea text;
  v_lineas text[] := '{}'::text[];
  v_resto text;
  v_salida text;
  v_m text[];
  v_valor text;
  v_pos integer;
BEGIN
  IF p_plantilla IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_linea IN ARRAY string_to_array(replace(replace(p_plantilla, E'\r\n', E'\n'), E'\r', E'\n'), E'\n') LOOP
    IF btrim(v_linea, E' \t') = '' THEN
      v_lineas := v_lineas || ''::text;
      CONTINUE;
    END IF;

    -- A line with a variable that has no value does not go out.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM regexp_matches(v_linea, '\{([^{}]*)\}', 'g') AS r(m)
       WHERE nullif(btrim(coalesce(p_datos ->> r.m[1], '')), '') IS NULL);

    -- One left-to-right pass: a value is never scanned again for {var}.
    v_salida := '';
    v_resto := v_linea;
    LOOP
      v_m := regexp_match(v_resto, '\{([^{}]*)\}');
      EXIT WHEN v_m IS NULL;
      v_pos := strpos(v_resto, '{' || v_m[1] || '}');
      v_valor := btrim(p_datos ->> v_m[1]);
      v_salida := v_salida || left(v_resto, v_pos - 1) || v_valor;
      v_resto := substr(v_resto, v_pos + length(v_m[1]) + 2);
      IF right(v_valor, 1) = '.' AND left(v_resto, 1) = '.' THEN
        v_resto := substr(v_resto, 2);
      END IF;
    END LOOP;
    v_lineas := v_lineas || (v_salida || v_resto);
  END LOOP;

  v_salida := regexp_replace(array_to_string(v_lineas, E'\n'), E'\n{3,}', E'\n\n', 'g');
  RETURN btrim(v_salida, E' \t\n');
END;
$function$;

COMMENT ON FUNCTION public.talleres_aviso_texto_render(text, jsonb) IS
  'R4: renders a notice template: {var} → p_datos value; a line with a null/empty variable is dropped; no repeated period after a value ending in "."; blank-line runs collapse to one; trimmed.';

REVOKE ALL ON FUNCTION public.talleres_aviso_texto_render(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_aviso_texto_render(text, jsonb) TO authenticated, service_role;

-- ===========================================================================
-- D. Save / restore
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.talleres_aviso_texto_guardar(
  p_taller_id uuid, p_tipo text, p_clase_id uuid, p_asunto text, p_mensaje text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_def jsonb := public.talleres_aviso_variables() -> p_tipo;
  v_permitidas text[];
  v_en_asunto text[];
  v_asunto text;
  v_mensaje text;
  v_malas text;
  v_usuario uuid;
  v_fila public.taller_aviso_textos%ROWTYPE;
BEGIN
  IF p_tipo IS NULL OR v_def IS NULL THEN
    RAISE EXCEPTION 'AVISO_NO_EDITABLE' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.talleres t WHERE t.id = p_taller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'taller_no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.talleres_aviso_textos_puede(p_taller_id, true) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;
  IF p_clase_id IS NOT NULL THEN
    IF p_tipo <> 'recordatorio_clase' THEN
      RAISE EXCEPTION 'CLASE_SOLO_EN_RECORDATORIO' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.taller_plantilla_clases c WHERE c.id = p_clase_id AND c.taller_id = p_taller_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CLASE_INVALIDA' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_asunto := btrim(regexp_replace(coalesce(p_asunto, ''), '\s+', ' ', 'g'));
  v_mensaje := btrim(replace(replace(coalesce(p_mensaje, ''), E'\r\n', E'\n'), E'\r', E'\n'), E' \t\n');
  IF v_asunto = '' THEN
    RAISE EXCEPTION 'ASUNTO_VACIO' USING ERRCODE = '22023';
  END IF;
  IF length(v_asunto) > 200 THEN
    RAISE EXCEPTION 'ASUNTO_DEMASIADO_LARGO' USING ERRCODE = '22023';
  END IF;
  IF v_mensaje = '' THEN
    RAISE EXCEPTION 'MENSAJE_VACIO' USING ERRCODE = '22023';
  END IF;
  IF length(v_mensaje) > 1000 THEN
    RAISE EXCEPTION 'MENSAJE_DEMASIADO_LARGO' USING ERRCODE = '22023';
  END IF;

  v_permitidas := ARRAY(SELECT jsonb_array_elements_text(v_def -> 'variables'));
  v_en_asunto := ARRAY(SELECT jsonb_array_elements_text(v_def -> 'asunto'));

  -- Unknown variables, in order of first appearance (asunto, then mensaje).
  SELECT string_agg('{' || x.nombre || '}', ', ' ORDER BY x.campo, x.orden) INTO v_malas
    FROM (
      SELECT DISTINCT ON (r.m[1]) r.m[1] AS nombre, f.campo, r.orden
        FROM unnest(ARRAY[v_asunto, v_mensaje]) WITH ORDINALITY AS f(texto, campo)
        CROSS JOIN LATERAL regexp_matches(f.texto, '\{([^{}]*)\}', 'g') WITH ORDINALITY AS r(m, orden)
       ORDER BY r.m[1], f.campo, r.orden
    ) x
   WHERE NOT (x.nombre = ANY (v_permitidas));
  IF v_malas IS NOT NULL THEN
    RAISE EXCEPTION 'VARIABLE_DESCONOCIDA: %', v_malas USING ERRCODE = '22023';
  END IF;

  SELECT string_agg('{' || x.nombre || '}', ', ' ORDER BY x.orden) INTO v_malas
    FROM (
      SELECT DISTINCT ON (r.m[1]) r.m[1] AS nombre, r.orden
        FROM regexp_matches(v_asunto, '\{([^{}]*)\}', 'g') WITH ORDINALITY AS r(m, orden)
       ORDER BY r.m[1], r.orden
    ) x
   WHERE NOT (x.nombre = ANY (v_en_asunto));
  IF v_malas IS NOT NULL THEN
    RAISE EXCEPTION 'VARIABLE_NO_PERMITIDA_EN_ASUNTO: %', v_malas USING ERRCODE = '22023';
  END IF;

  IF regexp_replace(v_asunto, '\{[^{}]*\}', '', 'g') ~ '[{}]'
     OR regexp_replace(v_mensaje, '\{[^{}]*\}', '', 'g') ~ '[{}]' THEN
    RAISE EXCEPTION 'LLAVE_SIN_CERRAR' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_usuario FROM public.usuarios u WHERE u.auth_id = auth.uid() LIMIT 1;

  INSERT INTO public.taller_aviso_textos AS x (taller_id, tipo, clase_id, asunto, mensaje, updated_by, updated_at)
  VALUES (p_taller_id, p_tipo, p_clase_id, v_asunto, v_mensaje, v_usuario, now())
  ON CONFLICT (taller_id, tipo, (coalesce(clase_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  DO UPDATE SET asunto = EXCLUDED.asunto, mensaje = EXCLUDED.mensaje,
                updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
  RETURNING x.* INTO v_fila;

  RETURN jsonb_build_object(
    'id', v_fila.id, 'taller_id', v_fila.taller_id, 'tipo', v_fila.tipo, 'clase_id', v_fila.clase_id,
    'asunto', v_fila.asunto, 'mensaje', v_fila.mensaje,
    'updated_by', v_fila.updated_by, 'updated_at', v_fila.updated_at);
END;
$function$;

COMMENT ON FUNCTION public.talleres_aviso_texto_guardar(uuid, text, uuid, text, text) IS
  'R4: saves (upsert) the custom subject and message of one notice kind of a taller (p_clase_id: a plantilla clase, recordatorio_clase only). Validates against talleres_aviso_variables(). coordinator/director write or admin.manage of the taller''s equipo.';

REVOKE ALL ON FUNCTION public.talleres_aviso_texto_guardar(uuid, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_aviso_texto_guardar(uuid, text, uuid, text, text) TO authenticated, service_role;

-- Back to the default text: deletes the custom text. Returns whether a
-- row was deleted.
CREATE OR REPLACE FUNCTION public.talleres_aviso_texto_restaurar(p_taller_id uuid, p_tipo text, p_clase_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_filas integer;
BEGIN
  IF p_tipo IS NULL OR (public.talleres_aviso_variables() -> p_tipo) IS NULL THEN
    RAISE EXCEPTION 'AVISO_NO_EDITABLE' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.talleres t WHERE t.id = p_taller_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'taller_no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.talleres_aviso_textos_puede(p_taller_id, true) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.taller_aviso_textos x
   WHERE x.taller_id = p_taller_id AND x.tipo = p_tipo AND x.clase_id IS NOT DISTINCT FROM p_clase_id;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas > 0;
END;
$function$;

COMMENT ON FUNCTION public.talleres_aviso_texto_restaurar(uuid, text, uuid) IS
  'R4: «Restaurar texto predeterminado»: deletes the custom text of (taller, tipo[, clase]). Same writers as talleres_aviso_texto_guardar.';

REVOKE ALL ON FUNCTION public.talleres_aviso_texto_restaurar(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_aviso_texto_restaurar(uuid, text, uuid) TO authenticated, service_role;

-- ===========================================================================
-- E. taller_sesiones.plantilla_clase_id
-- ===========================================================================

ALTER TABLE public.taller_sesiones
  ADD COLUMN IF NOT EXISTS plantilla_clase_id uuid NULL
    REFERENCES public.taller_plantilla_clases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS taller_sesiones_plantilla_clase_idx
  ON public.taller_sesiones (plantilla_clase_id) WHERE plantilla_clase_id IS NOT NULL;

COMMENT ON COLUMN public.taller_sesiones.plantilla_clase_id IS
  'R4: the taller_plantilla_clases row this sesión was created from (generate_taller_sesiones). Picks the per-clase class reminder text. NULL: extra/recovered sesión or no plantilla → general text.';

-- Programada sesiones already created from a plantilla: the plantilla
-- clase of their taller with the same tema (trimmed, case-insensitive),
-- only when exactly one clase of that taller has that tema.
UPDATE public.taller_sesiones s
   SET plantilla_clase_id = pc.id
  FROM public.taller_grupos g
  JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
  JOIN public.taller_ediciones te ON te.id = c.taller_id
  JOIN public.taller_plantilla_clases pc ON pc.taller_id = te.taller_id
 WHERE g.id = s.grupo_id
   AND s.estado = 'programada'
   AND s.plantilla_clase_id IS NULL
   AND nullif(btrim(coalesce(s.tema, '')), '') IS NOT NULL
   AND lower(btrim(pc.tema)) = lower(btrim(s.tema))
   AND NOT EXISTS (
     SELECT 1 FROM public.taller_plantilla_clases o
      WHERE o.taller_id = pc.taller_id AND o.id <> pc.id AND lower(btrim(o.tema)) = lower(btrim(s.tema)));

-- generate_taller_sesiones: body of 20260927130000 with one change — the
-- plantilla branch also stores the clase it copied (plantilla_clase_id).
CREATE OR REPLACE FUNCTION public.generate_taller_sesiones(p_grupo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id       uuid;
  v_cap_ok        boolean;
  v_sesiones      integer;
  v_anchor        date;
  v_numero        integer;
  v_created       integer := 0;
  v_taller_id     uuid;
  v_cadencia_dias integer;
  v_plantilla     RECORD;
  v_total         integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  v_cap_ok := public.auth_has_talleres_capability('talleres_crecimiento.director.write')
              OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage');
  IF NOT v_cap_ok THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage'
      USING ERRCODE = '42501';
  END IF;

  SELECT e.sesiones_snapshot,
         COALESCE(c.started_at::date, CURRENT_DATE),
         e.taller_id
    INTO v_sesiones, v_anchor, v_taller_id
    FROM public.taller_grupos g
    JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
    JOIN public.taller_ediciones e ON e.id = c.taller_id
   WHERE g.id = p_grupo_id;

  IF v_sesiones IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo % has no resolvable edición/sesiones_snapshot', p_grupo_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', public.talleres_equipo_de_grupo(p_grupo_id))
          OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', public.talleres_equipo_de_grupo(p_grupo_id))) THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage in this grupo''s tree'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_total
    FROM public.taller_plantilla_clases
   WHERE taller_id = v_taller_id AND activo = true;

  -- A5 hardening (odd/tasks/talleres-configuracion-del-taller.md T7): read
  -- ONCE, ahead of the branch, so BOTH paths below (plantilla-driven and
  -- fallback) use the SAME COALESCE(cadencia_dias, 7).
  SELECT t.cadencia_dias INTO v_cadencia_dias
    FROM public.talleres t
   WHERE t.id = v_taller_id;
  v_cadencia_dias := COALESCE(v_cadencia_dias, 7);

  IF v_total > 0 THEN
    -- The plantilla's own `numero` is an ORDERING KEY ONLY: the
    -- instantiated clase's numero (and its date offset) is its POSITION
    -- among the active rows (taller_sesiones_validate_insert requires
    -- strictly sequential numero per grupo). R4: the sesión remembers the
    -- plantilla clase it came from (per-clase reminder text).
    FOR v_plantilla IN
      SELECT id, tema, (row_number() OVER (ORDER BY numero))::integer AS pos
        FROM public.taller_plantilla_clases
       WHERE taller_id = v_taller_id AND activo = true
       ORDER BY numero
    LOOP
      INSERT INTO public.taller_sesiones (
        grupo_id, numero, tema, fecha_programada, estado, plantilla_clase_id
      ) VALUES (
        p_grupo_id, v_plantilla.pos, v_plantilla.tema,
        v_anchor + ((v_plantilla.pos - 1) * v_cadencia_dias), 'programada', v_plantilla.id
      )
      ON CONFLICT (grupo_id, numero) DO NOTHING;

      IF FOUND THEN
        v_created := v_created + 1;
      END IF;
    END LOOP;
  ELSE
    v_total := v_sesiones;

    FOR v_numero IN 1..v_sesiones LOOP
      INSERT INTO public.taller_sesiones (
        grupo_id, numero, fecha_programada, estado
      ) VALUES (
        p_grupo_id, v_numero, v_anchor + ((v_numero - 1) * v_cadencia_dias), 'programada'
      )
      ON CONFLICT (grupo_id, numero) DO NOTHING;

      IF FOUND THEN
        v_created := v_created + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'grupo_id', p_grupo_id,
    'total', v_total,
    'created', v_created
  );
END;
$function$;

-- ===========================================================================
-- F. Rendering in the one writer and the builders' data
-- ===========================================================================

-- The one writer of an automatic notice (body of 20261110230000). R4:
-- when p_datos.variables is an object, the custom text of (taller, tipo,
-- p_datos.plantilla_clase_id) — else of (taller, tipo) — replaces the
-- subject and the message; without one, p_asunto/p_cuerpo go out as
-- today. The persona's email/first name are now read before the in-app
-- row (same values) so {nombre} can be filled.
CREATE OR REPLACE FUNCTION public.talleres_aviso_emitir(
  p_tipo text, p_clave text, p_persona_id uuid, p_taller_id uuid, p_edicion_id uuid,
  p_titulo text, p_cuerpo text, p_url text, p_asunto text, p_datos jsonb,
  p_cta text DEFAULT NULL, p_email text DEFAULT NULL, p_nombre text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_taller text;
  v_datos jsonb;
  v_nuevo boolean := false;
  v_filas integer;
  v_variables jsonb;
  v_clase uuid;
  v_texto record;
  v_cuerpo text := p_cuerpo;
  v_asunto text := p_asunto;
  v_render text;
BEGIN
  IF NOT public.talleres_aviso_activo(p_taller_id, p_tipo) THEN
    RETURN false;
  END IF;

  SELECT t.nombre INTO v_taller FROM public.talleres t WHERE t.id = p_taller_id;
  v_variables := CASE WHEN jsonb_typeof(p_datos -> 'variables') = 'object' THEN p_datos -> 'variables' END;
  v_clase := CASE WHEN p_datos ->> 'plantilla_clase_id' ~ '^[0-9a-fA-F-]{36}$'
                  THEN (p_datos ->> 'plantilla_clase_id')::uuid END;
  v_datos := (coalesce(p_datos, '{}'::jsonb) - 'variables' - 'plantilla_clase_id')
    || jsonb_build_object('taller_id', p_taller_id, 'edicion_id', p_edicion_id, 'taller', v_taller);

  IF p_persona_id IS NOT NULL THEN
    SELECT coalesce(v_email, nullif(btrim(u.email), '')),
           coalesce(v_nombre, nullif(split_part(btrim(u.nombre), ' ', 1), ''))
      INTO v_email, v_nombre
      FROM public.usuarios u WHERE u.id = p_persona_id;
  END IF;

  -- R4: the custom text (clase first, then general), else the default.
  IF v_variables IS NOT NULL THEN
    SELECT x.asunto, x.mensaje INTO v_texto
      FROM public.taller_aviso_textos x
     WHERE x.taller_id = p_taller_id AND x.tipo = p_tipo
       AND (x.clase_id IS NULL OR x.clase_id = v_clase)
     ORDER BY x.clase_id NULLS LAST
     LIMIT 1;
    IF FOUND THEN
      v_variables := jsonb_build_object('nombre', v_nombre, 'taller', v_taller) || v_variables;
      v_render := nullif(public.talleres_aviso_texto_render(v_texto.mensaje, v_variables), '');
      IF v_render IS NOT NULL THEN
        v_cuerpo := CASE WHEN length(v_render) > 1000 THEN left(v_render, 999) || '…' ELSE v_render END;
      END IF;
      v_render := nullif(btrim(regexp_replace(
        coalesce(public.talleres_aviso_texto_render(v_texto.asunto, v_variables), ''), '\s+', ' ', 'g')), '');
      IF v_render IS NOT NULL THEN
        v_asunto := v_render;
      END IF;
    END IF;
  END IF;

  IF p_persona_id IS NOT NULL THEN
    INSERT INTO public.avisos_persona (persona_id, tipo, titulo, cuerpo, url, datos, clave, expira_at)
    VALUES (p_persona_id, p_tipo, p_titulo, v_cuerpo, p_url, v_datos, p_clave,
            CASE WHEN v_datos ? 'expira_at' THEN (v_datos ->> 'expira_at')::timestamptz END)
    ON CONFLICT (persona_id, clave) WHERE clave IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    v_nuevo := v_filas > 0;
  END IF;

  IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    v_email := NULL;
  END IF;

  INSERT INTO public.taller_avisos_envios (clave, tipo, taller_id, edicion_id, persona_id, email, nombre, asunto, datos, estado)
  VALUES (p_clave, p_tipo, p_taller_id, p_edicion_id, p_persona_id, v_email, left(v_nombre, 120), left(v_asunto, 200),
          v_datos || jsonb_build_object('titulo', p_titulo, 'cuerpo', v_cuerpo, 'url', p_url, 'cta', p_cta),
          CASE WHEN v_email IS NULL THEN 'sin_correo' ELSE 'pendiente' END)
  ON CONFLICT (clave) DO NOTHING;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  RETURN v_nuevo OR v_filas > 0;
END;
$function$;

COMMENT ON FUNCTION public.talleres_aviso_emitir(text, text, uuid, uuid, uuid, text, text, text, text, jsonb, text, text, text) IS
  'T7: writes one automatic notice (in-app row + email outbox row) keyed by p_clave when the taller''s switch for p_tipo is on. Idempotent. Internal (triggers and job functions). R4: with p_datos.variables, a custom text of taller_aviso_textos (per plantilla_clase_id first) replaces subject and message.';

REVOKE ALL ON FUNCTION public.talleres_aviso_emitir(text, text, uuid, uuid, uuid, text, text, text, text, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_aviso_emitir(text, text, uuid, uuid, uuid, text, text, text, text, jsonb, text, text, text) TO service_role;

-- talleres_aviso_inscripcion: body of 20261111130000; R4 adds the
-- variables of each kind to p_datos (default texts unchanged).
CREATE OR REPLACE FUNCTION public.talleres_aviso_inscripcion(p_inscripcion_id uuid, p_evento text, p_motivo text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_i public.taller_inscripciones%ROWTYPE;
  v_te public.taller_ediciones%ROWTYPE;
  v_taller public.talleres%ROWTYPE;
  v_tipo text;
  v_titulo text;
  v_cuerpo text;
  v_asunto text;
  v_cta text;
  v_url text := '/talleres/mi-recorrido';
  v_filas jsonb := '[]'::jsonb;
  v_grupo jsonb;
  v_sufijo text;
  v_mensaje text;
  v_persona uuid;
  v_emitidos integer := 0;
  v_det jsonb;
  v_det_texto text;
  v_det_filas jsonb := '[]'::jsonb;
  v_variables jsonb;
BEGIN
  SELECT * INTO v_i FROM public.taller_inscripciones i WHERE i.id = p_inscripcion_id;
  SELECT te.* INTO v_te
    FROM public.talleres_crecimiento_cohortes c
    JOIN public.taller_ediciones te ON te.id = c.taller_id
   WHERE c.id = v_i.cohorte_id;
  SELECT * INTO v_taller FROM public.talleres t WHERE t.id = v_te.taller_id;
  IF v_taller.id IS NULL THEN
    RETURN 0;
  END IF;

  -- T10: the practical details (NULL pieces are left out).
  v_det := public.talleres_aviso_detalles(v_te.id);
  v_det_texto := nullif(public.talleres_aviso_detalles_texto(v_det), '');
  IF v_det ->> 'fecha' IS NOT NULL THEN
    v_det_filas := v_det_filas || jsonb_build_array(jsonb_build_array('Empieza', concat_ws(' · ', v_det ->> 'fecha', v_det ->> 'hora')));
  END IF;
  IF v_det ->> 'lugar' IS NOT NULL THEN
    v_det_filas := v_det_filas || jsonb_build_array(jsonb_build_array('Lugar', v_det ->> 'lugar'));
  END IF;
  IF v_det ->> 'indicaciones' IS NOT NULL THEN
    v_det_filas := v_det_filas || jsonb_build_array(jsonb_build_array('Indicaciones', v_det ->> 'indicaciones'));
  END IF;

  -- R4: data of the custom texts (nombre is filled by talleres_aviso_emitir).
  v_variables := jsonb_build_object('taller', v_taller.nombre, 'edicion', v_te.nombre_snapshot);

  IF p_evento = 'recibida' THEN
    v_tipo := 'inscripcion_recibida';
    v_titulo := 'Recibimos tu solicitud';
    v_cuerpo := format('Recibimos tu inscripción en %s. La coordinación revisa cada inscripción y te avisa en unos días.', v_taller.nombre)
      || coalesce(' ' || v_det_texto, '');
    v_asunto := format('Recibimos tu solicitud para %s', v_taller.nombre);
    v_cta := 'Ver mi inscripción';
    v_sufijo := v_i.id::text;
    v_filas := jsonb_build_array(jsonb_build_array('Taller', v_te.nombre_snapshot), jsonb_build_array('Estado', 'Esperando aprobación'))
      || v_det_filas;
    v_variables := v_variables || jsonb_build_object(
      'fecha', v_det ->> 'fecha', 'hora', v_det ->> 'hora', 'lugar', v_det ->> 'lugar', 'indicaciones', v_det ->> 'indicaciones');
  ELSIF p_evento = 'aprobada' THEN
    v_tipo := 'inscripcion_aprobada';
    v_titulo := 'Aprobamos tu inscripción';
    v_cuerpo := format('Tienes tu lugar en %s.', v_taller.nombre)
      || coalesce(' ' || v_det_texto, '')
      || ' Pronto te avisamos tu grupo y quién lo facilita.';
    v_asunto := format('Aprobamos tu inscripción en %s', v_taller.nombre);
    v_cta := 'Ver mi taller';
    v_sufijo := v_i.id::text;
    v_filas := jsonb_build_array(jsonb_build_array('Taller', v_te.nombre_snapshot)) || v_det_filas;
    v_variables := v_variables || jsonb_build_object(
      'fecha', v_det ->> 'fecha', 'hora', v_det ->> 'hora', 'lugar', v_det ->> 'lugar', 'indicaciones', v_det ->> 'indicaciones');
  ELSIF p_evento = 'rechazada' THEN
    v_tipo := 'inscripcion_rechazada';
    v_titulo := 'Tu inscripción no fue aprobada';
    v_mensaje := nullif(btrim(coalesce(v_i.mensaje_no_aprobado, '')), '');
    v_variables := v_variables || jsonb_build_object('mensaje_no_aprobado', v_mensaje);
    IF v_mensaje IS NOT NULL AND v_mensaje !~ '[.!?…]$' THEN
      v_mensaje := v_mensaje || '.';
    END IF;
    v_cuerpo := format('No pudimos aprobar tu inscripción en %s.', v_taller.nombre)
      || CASE WHEN v_mensaje IS NOT NULL THEN ' ' || v_mensaje ELSE '' END
      || ' Si tienes dudas, habla con la coordinación del taller.';
    v_asunto := format('Tu inscripción en %s no fue aprobada', v_taller.nombre);
    v_cta := NULL;
    v_url := NULL;
    v_sufijo := v_i.id::text;
  ELSIF p_evento = 'grupo' THEN
    IF v_i.grupo_id IS NULL THEN
      RETURN 0;
    END IF;
    v_grupo := public.talleres_aviso_grupo_info(v_i.grupo_id);
    v_tipo := 'grupo_asignado';
    v_titulo := 'Tu grupo y quién lo facilita';
    v_cuerpo := format('Ya tienes grupo en %s: %s.', v_taller.nombre, v_grupo ->> 'grupo')
      || CASE WHEN v_grupo ->> 'facilitadores' IS NOT NULL THEN format(' Facilita %s.', v_grupo ->> 'facilitadores') ELSE '' END
      || CASE WHEN v_grupo ->> 'fecha' IS NOT NULL
              THEN ' Empieza el ' || rtrim(concat_ws(' · ', v_grupo ->> 'fecha', v_grupo ->> 'hora', v_grupo ->> 'lugar'), '.') || '.'
              ELSE '' END
      || coalesce(' ' || nullif(public.talleres_aviso_detalles_texto(
           jsonb_build_object('indicaciones', v_det ->> 'indicaciones')), ''), '');
    v_asunto := format('Tu grupo de %s: %s', v_taller.nombre, v_grupo ->> 'grupo');
    v_cta := 'Ver mi taller';
    v_sufijo := v_i.id::text || ':' || v_i.grupo_id::text;
    v_filas := jsonb_build_array(jsonb_build_array('Grupo', v_grupo ->> 'grupo'));
    IF v_grupo ->> 'facilitadores' IS NOT NULL THEN
      v_filas := v_filas || jsonb_build_array(jsonb_build_array('Facilita', v_grupo ->> 'facilitadores'));
    END IF;
    IF v_grupo ->> 'fecha' IS NOT NULL THEN
      v_filas := v_filas || jsonb_build_array(jsonb_build_array('Empieza', concat_ws(' · ', v_grupo ->> 'fecha', v_grupo ->> 'hora')));
    END IF;
    IF v_grupo ->> 'lugar' IS NOT NULL THEN
      v_filas := v_filas || jsonb_build_array(jsonb_build_array('Lugar', v_grupo ->> 'lugar'));
    END IF;
    IF v_det ->> 'indicaciones' IS NOT NULL THEN
      v_filas := v_filas || jsonb_build_array(jsonb_build_array('Indicaciones', v_det ->> 'indicaciones'));
    END IF;
    v_variables := v_variables || jsonb_build_object(
      'grupo', v_grupo ->> 'grupo', 'facilitadores', v_grupo ->> 'facilitadores',
      'fecha', v_grupo ->> 'fecha', 'hora', v_grupo ->> 'hora',
      'lugar', nullif(btrim(coalesce(v_grupo ->> 'lugar', '')), ''), 'indicaciones', v_det ->> 'indicaciones');
  ELSE
    RAISE EXCEPTION 'evento_invalido' USING ERRCODE = '22023';
  END IF;

  FOREACH v_persona IN ARRAY ARRAY[v_i.persona_principal_id, v_i.companero_id] LOOP
    CONTINUE WHEN v_persona IS NULL;
    CONTINUE WHEN p_evento = 'recibida' AND v_persona = v_i.companero_id
                  AND coalesce((to_jsonb(v_i) ->> 'por_verificar')::boolean, false);
    IF public.talleres_aviso_emitir(
         v_tipo, v_tipo || ':' || v_sufijo || ':' || v_persona::text, v_persona, v_taller.id, v_te.id,
         v_titulo, v_cuerpo, v_url, v_asunto,
         jsonb_build_object('inscripcion_id', v_i.id, 'filas', v_filas, 'variables', v_variables), v_cta) THEN
      v_emitidos := v_emitidos + 1;
    END IF;
  END LOOP;

  RETURN v_emitidos;
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_aviso_inscripcion(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_aviso_inscripcion(uuid, text, text) TO service_role;

-- «Mañana es tu clase»: body of 20261111130000; R4 adds the variables and
-- the sesión's plantilla clase (per-clase text first).
CREATE OR REPLACE FUNCTION public.talleres_avisos_recordatorios_encolar(p_ahora timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_manana date := (p_ahora AT TIME ZONE 'America/Caracas')::date + 1;
  v_fila record;
  v_info jsonb;
  v_hora text;
  v_cuerpo text;
  v_indicaciones text;
  v_n integer := 0;
BEGIN
  FOR v_fila IN
    SELECT s.id AS sesion_id, s.numero, s.tema, s.fecha_programada, s.meeting_time_override, s.plantilla_clase_id,
           g.id AS grupo_id, te.id AS edicion_id, te.lugar, te.indicaciones, te.recurrence_rule, te.nombre_snapshot,
           t.id AS taller_id, t.nombre AS taller, p.persona_id
      FROM public.taller_sesiones s
      JOIN public.taller_grupos g ON g.id = s.grupo_id
      JOIN public.talleres_crecimiento_cohortes c ON c.id = g.cohorte_id
      JOIN public.taller_ediciones te ON te.id = c.taller_id
      JOIN public.talleres t ON t.id = te.taller_id
      JOIN public.taller_inscripciones i ON i.grupo_id = g.id AND i.estado = 'aprobado'
      CROSS JOIN LATERAL (VALUES (i.persona_principal_id), (i.companero_id)) p(persona_id)
     WHERE s.estado = 'programada'
       AND s.fecha_programada = v_manana
       AND g.estado <> 'cancelado'
       AND te.estado <> 'cancelado'
       AND te.cerrada_en IS NULL
       AND p.persona_id IS NOT NULL
     ORDER BY s.id, p.persona_id
  LOOP
    v_info := public.talleres_aviso_grupo_info(v_fila.grupo_id);
    v_hora := public.talleres_aviso_hora(coalesce(
      v_fila.meeting_time_override,
      CASE WHEN v_fila.recurrence_rule ->> 'start_time' ~ '^\d{2}:\d{2}'
           THEN substring(v_fila.recurrence_rule ->> 'start_time' FROM '^\d{2}:\d{2}')::time END));
    v_indicaciones := nullif(btrim(coalesce(v_fila.indicaciones, '')), '');
    v_cuerpo := 'Clase ' || v_fila.numero
      || CASE WHEN nullif(btrim(coalesce(v_fila.tema, '')), '') IS NOT NULL THEN ': ' || btrim(v_fila.tema) ELSE '' END
      || ' de ' || v_fila.taller || ' · ' || rtrim(concat_ws(' · ', public.talleres_aviso_fecha(v_fila.fecha_programada), v_hora, v_fila.lugar), '.') || '.'
      || CASE WHEN v_info ->> 'facilitadores' IS NOT NULL THEN ' Facilita ' || (v_info ->> 'facilitadores') || '.' ELSE '' END
      || coalesce(' ' || nullif(public.talleres_aviso_detalles_texto(jsonb_build_object('indicaciones', v_indicaciones)), ''), '');
    IF public.talleres_aviso_emitir(
         'recordatorio_clase', 'recordatorio_clase:' || v_fila.sesion_id::text || ':' || v_fila.persona_id::text,
         v_fila.persona_id, v_fila.taller_id, v_fila.edicion_id,
         'Mañana es tu clase', v_cuerpo, '/talleres/mi-recorrido', format('Mañana es tu clase de %s', v_fila.taller),
         jsonb_build_object(
           'sesion_id', v_fila.sesion_id,
           'expira_at', ((v_fila.fecha_programada + 1)::timestamp AT TIME ZONE 'America/Caracas'),
           'filas', jsonb_build_array(
             jsonb_build_array('Cuándo', concat_ws(' · ', public.talleres_aviso_fecha(v_fila.fecha_programada), v_hora)))
             || CASE WHEN v_fila.lugar IS NOT NULL THEN jsonb_build_array(jsonb_build_array('Dónde', v_fila.lugar)) ELSE '[]'::jsonb END
             || CASE WHEN v_info ->> 'facilitadores' IS NOT NULL
                     THEN jsonb_build_array(jsonb_build_array('Facilita', v_info ->> 'facilitadores')) ELSE '[]'::jsonb END
             || CASE WHEN v_indicaciones IS NOT NULL
                     THEN jsonb_build_array(jsonb_build_array('Indicaciones', v_indicaciones)) ELSE '[]'::jsonb END,
           'plantilla_clase_id', v_fila.plantilla_clase_id,
           'variables', jsonb_build_object(
             'taller', v_fila.taller, 'edicion', v_fila.nombre_snapshot,
             'numero', v_fila.numero::text, 'clase', nullif(btrim(coalesce(v_fila.tema, '')), ''),
             'grupo', v_info ->> 'grupo', 'facilitadores', v_info ->> 'facilitadores',
             'fecha', public.talleres_aviso_fecha(v_fila.fecha_programada), 'hora', v_hora,
             'lugar', nullif(btrim(coalesce(v_fila.lugar, '')), ''), 'indicaciones', v_indicaciones)),
         'Ver mi taller') THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION public.talleres_avisos_recordatorios_encolar(timestamptz) IS
  'T7: writes «Mañana es tu clase» (in-app + email outbox) for every programada sesión of tomorrow (America/Caracas) to the aprobadas of its grupo, once per sesión and persona. Returns the new notices. service_role (daily route). T10: carries the edición''s indicaciones. R4: custom text per plantilla clase, then general, then default.';

REVOKE ALL ON FUNCTION public.talleres_avisos_recordatorios_encolar(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_avisos_recordatorios_encolar(timestamptz) TO service_role;

-- «Avísame»: body of 20261110230000; R4 adds the variables.
CREATE OR REPLACE FUNCTION public.talleres_avisame_notificar(p_edicion_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_te public.taller_ediciones%ROWTYPE;
  v_taller public.talleres%ROWTYPE;
  v_cupo integer;
  v_disponibles integer;
  v_fila record;
  v_url text;
  v_cuerpo text;
  v_n integer := 0;
BEGIN
  SELECT * INTO v_te FROM public.taller_ediciones te WHERE te.id = p_edicion_id;
  IF v_te.id IS NULL OR public.talleres_estado_efectivo(v_te) <> 'abierto' THEN
    RETURN 0;
  END IF;
  SELECT c.cupo, c.disponibles INTO v_cupo, v_disponibles FROM public.talleres_cupo_edicion_calculo(p_edicion_id) c;
  IF coalesce(v_cupo, 0) = 0 OR coalesce(v_disponibles, 0) = 0 THEN
    RETURN 0;
  END IF;
  SELECT * INTO v_taller FROM public.talleres t WHERE t.id = v_te.taller_id;
  IF NOT public.talleres_aviso_activo(v_taller.id, 'lugar_disponible') THEN
    RETURN 0;
  END IF;

  v_url := '/talleres/reservar/' || v_taller.slug;
  v_cuerpo := format('Se liberó un lugar en %s', v_taller.nombre)
    || CASE WHEN v_te.fecha_inicio >= public.talleres_hoy() THEN format(' (empieza el %s)', public.talleres_aviso_fecha(v_te.fecha_inicio)) ELSE '' END
    || '. Avisamos a todas las personas que esperaban: quien reserve primero se queda con el lugar.';

  FOR v_fila IN
    UPDATE public.taller_avisame_lugar a
       SET notificado_en = now()
     WHERE a.edicion_id = p_edicion_id AND a.notificado_en IS NULL
    RETURNING a.id, a.nombre, a.email, a.usuario_id
  LOOP
    PERFORM public.talleres_aviso_emitir(
      'lugar_disponible', 'lugar_disponible:' || v_fila.id::text, v_fila.usuario_id, v_taller.id, v_te.id,
      'Se liberó un lugar', v_cuerpo, v_url, format('Se liberó un lugar en %s', v_taller.nombre),
      jsonb_build_object(
        'filas', jsonb_build_array(jsonb_build_array('Taller', v_te.nombre_snapshot)),
        'variables', jsonb_build_object(
          'taller', v_taller.nombre, 'edicion', v_te.nombre_snapshot,
          'fecha', CASE WHEN v_te.fecha_inicio >= public.talleres_hoy() THEN public.talleres_aviso_fecha(v_te.fecha_inicio) END)),
      'Reservar mi lugar', v_fila.email, split_part(btrim(v_fila.nombre), ' ', 1));
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_avisame_notificar(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talleres_avisame_notificar(uuid) TO service_role;

-- Certificado: body of 20261110230000; R4 adds the variables.
CREATE OR REPLACE FUNCTION public.talleres_avisos_certificado_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_te public.taller_ediciones%ROWTYPE;
  v_taller public.talleres%ROWTYPE;
BEGIN
  BEGIN
    IF NEW.revocado_at IS NULL THEN
      SELECT * INTO v_te FROM public.taller_ediciones te WHERE te.id = NEW.taller_id;
      SELECT * INTO v_taller FROM public.talleres t WHERE t.id = v_te.taller_id;
      IF v_taller.id IS NOT NULL THEN
        PERFORM public.talleres_aviso_emitir(
          'certificado_listo', 'certificado_listo:' || NEW.id::text, NEW.persona_id, v_taller.id, v_te.id,
          'Tu certificado está listo',
          format('Completaste %s. Descarga tu certificado o guárdalo en la app.', v_taller.nombre),
          '/talleres/mi-recorrido/certificados/' || NEW.id::text,
          format('Completaste %s: tu certificado está listo', v_taller.nombre),
          jsonb_build_object('certificado_id', NEW.id,
                             'filas', jsonb_build_array(jsonb_build_array('Taller', v_te.nombre_snapshot)),
                             'variables', jsonb_build_object('taller', v_taller.nombre, 'edicion', v_te.nombre_snapshot)),
          'Ver mi certificado');
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'talleres_avisos: % (%), certificado %', SQLERRM, SQLSTATE, NEW.id;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_avisos_certificado_trg() FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- G. Notices center: the custom texts
-- ===========================================================================

-- Body of 20261110230000 plus "textos": every custom text of the taller
-- with who edited it and when.
CREATE OR REPLACE FUNCTION public.talleres_avisos_panel(p_taller_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_taller public.talleres%ROWTYPE;
  v_mes timestamptz := (date_trunc('month', now() AT TIME ZONE 'America/Caracas')) AT TIME ZONE 'America/Caracas';
  v_editar boolean;
BEGIN
  SELECT * INTO v_taller FROM public.talleres t WHERE t.id = p_taller_id;
  IF v_taller.id IS NULL THEN
    RAISE EXCEPTION 'taller_no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  v_editar := public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', v_taller.dream_team_equipo_id)
           OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_taller.dream_team_equipo_id)
           OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_taller.dream_team_equipo_id);
  IF NOT (v_editar
          OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', v_taller.dream_team_equipo_id)
          OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.read', v_taller.dream_team_equipo_id)) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'config', v_taller.avisos_config,
    'puede_editar', v_editar,
    'mes', coalesce((
      SELECT jsonb_object_agg(x.tipo, x.n)
        FROM (SELECT e.tipo, count(*) AS n FROM public.taller_avisos_envios e
               WHERE e.taller_id = p_taller_id AND e.created_at >= v_mes GROUP BY e.tipo) x), '{}'::jsonb),
    'resumen', (
      SELECT jsonb_build_object(
        'enviados_mes', count(*) FILTER (WHERE e.created_at >= v_mes),
        'sin_entregar', count(*) FILTER (WHERE e.estado = 'fallido'),
        'sin_correo', count(*) FILTER (WHERE e.estado = 'sin_correo' AND e.created_at >= v_mes))
        FROM public.taller_avisos_envios e WHERE e.taller_id = p_taller_id),
    'historial', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', h.id, 'tipo', h.tipo, 'persona', h.persona, 'estado', h.estado, 'intentos', h.intentos,
               'error', h.error, 'creado_en', h.created_at, 'enviado_en', h.enviado_en, 'leido_en', h.leido_at,
               'en_app', h.en_app, 'telefono', h.telefono, 'texto', h.texto)
             ORDER BY h.created_at DESC, h.id)
        FROM (
          SELECT e.id, e.tipo, e.estado, e.intentos, e.error, e.created_at, e.enviado_en,
                 coalesce(nullif(btrim(concat_ws(' ', u.nombre, u.apellido)), ''), e.nombre, 'Sin nombre') AS persona,
                 ap.leido_at, (ap.id IS NOT NULL) AS en_app,
                 CASE WHEN e.estado IN ('sin_correo', 'fallido') THEN nullif(btrim(u.telefono), '') END AS telefono,
                 concat_ws(E'\n', e.datos ->> 'titulo', e.datos ->> 'cuerpo') AS texto
            FROM public.taller_avisos_envios e
            LEFT JOIN public.usuarios u ON u.id = e.persona_id
            LEFT JOIN public.avisos_persona ap ON ap.persona_id = e.persona_id AND ap.clave = e.clave
           WHERE e.taller_id = p_taller_id
           ORDER BY e.created_at DESC, e.id
           LIMIT 50) h), '[]'::jsonb),
    'textos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'tipo', x.tipo, 'clase_id', x.clase_id, 'asunto', x.asunto, 'mensaje', x.mensaje,
               'editado_por', nullif(btrim(concat_ws(' ', u.nombre, u.apellido)), ''), 'editado_en', x.updated_at)
             ORDER BY x.tipo, x.clase_id NULLS FIRST)
        FROM public.taller_aviso_textos x
        LEFT JOIN public.usuarios u ON u.id = x.updated_by
       WHERE x.taller_id = p_taller_id), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_avisos_panel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_avisos_panel(uuid) TO authenticated, service_role;
