-- noqa: insert-into
-- Dream Team: a reusable volunteer loader with a dry run (T4 of
-- odd/tasks/ninos-voluntarios-waumba.md, decisions D6-D9).
--
-- What:
--   1. public.dream_team_normalizar_etiqueta(text): trim, strip Spanish
--      accents and lower-case, the SQL twin of normalizeLabel in
--      lib/platform/dream-team/grants.ts.
--   2. public.dream_team_clave_nombre(nombre, apellido): the one key every
--      full name is compared or looked up by: "nombre apellido" in NFC,
--      through dream_team_normalizar_etiqueta, every run of characters that
--      are not letters or digits turned into one space, trimmed. So
--      "José-María  Pérez" and "jose maria perez" give the same key.
--   3. public.dream_team_grants_de_servicio(equipo, experiencia, rol, label):
--      the capabilities a servicio mints when it becomes activo, mirroring
--      buildGrantsForServicio in grants.ts row for row.
--   4. public.dream_team_cargar_voluntarios(p_fuente, p_filas, p_actor,
--      p_campus_id, p_aplicar): reconciles a converted spreadsheet (one JSON
--      object per row) with usuarios and dream_team_servicios. It is used for
--      the initial load of every area (Waumba Land now, UpStreet and
--      Estudiantes later); afterwards the coordinators maintain their people
--      from the app (T7).
--
-- Per row: resolve the equipo by walking equipo_ruta from a root, then the rol
-- of that equipo; resolve the person (the rules below); create a missing
-- person, or fill only the NULL columns of an existing one; keep the
-- unmodelled columns (extras) in persona_datos_importados under the row's
-- fila; create the servicio activo with its history row, its verificaciones
-- and its capability grants, unless a non-retired servicio for the same
-- (persona, equipo, rol) exists. The report has one row per input row:
-- persona_accion is existente, existente_por_nombre, creada, revisar,
-- conflicto or error; servicio_accion is creado, existente, omitido or error.
-- detalle explains the row in Spanish, for the person who reviews the report.
--
-- Dry run (p_aplicar = false, the default): the function does exactly the same
-- work inside a block and then raises a private SQLSTATE (DTSIM) that only
-- that block catches. The block's subtransaction rolls back every write; the
-- report lives in a local variable, which a rollback does not touch, so the
-- caller gets the same report and the database is unchanged. Each row also
-- runs in its own block: a row that fails (a bad date, an invalid genero)
-- rolls back alone and is reported as error with the database message.
--
-- Choices, with their evidence:
--   - SECURITY INVOKER. The loader is run by privileged roles only (postgres
--     through the Supabase MCP, or service_role), which already own or bypass
--     RLS on every table it touches. EXECUTE is revoked from PUBLIC, anon and
--     authenticated, so the Data API cannot reach it, and definer rights would
--     add nothing.
--   - Grants are written here, not through dream_team_apply_servicio_grants:
--     that RPC authorizes the caller through auth.uid(), which is NULL for the
--     MCP connection. The write is the same: reactivate a revoked row or
--     insert one, null-safe on scope_id, source dream-team-servicio.
--   - The role -> capability mapping lives in TypeScript and the SQL loader
--     cannot call TypeScript, so dream_team_grants_de_servicio mirrors it. The
--     two sides are pinned to ONE table: the grants-table block of
--     supabase/tests/dream-team-cargar-voluntarios.test.sql. That suite checks
--     this function against it on the database, and
--     __tests__/lib/platform/dream-team/grants-sql-mirror.test.ts checks
--     buildGrantsForServicio against it in Jest. The table covers both
--     branches: every role label grants.ts maps, and every known label under
--     every experiencia with a capability of its own (its lead and director
--     tiers) plus one without. A change to grants.ts fails Jest until the
--     table changes, and then fails the SQL suite until this mirror changes in
--     a new migration.
--   - Label normalization: normalizeLabel strips every combining mark after
--     NFD; this one translates the accented Latin letters Spanish uses
--     (áéíóúüñ, upper and lower case, plus a few neighbours). The role labels
--     and names in play are Spanish.
--   - dream_team_servicios.fecha_inicio is NOT NULL DEFAULT now(), and the app
--     itself stamps a new servicio with the moment it is created (POST
--     /api/dream-team/servicios). So a row without fecha_inicio starts at the
--     load; a row with one starts at local midnight of that date in the
--     church's time zone (app.zona_horaria, falling back to America/Caracas,
--     as talleres_hoy does), so the date shows the same in Venezuela.
--   - The history row: the app writes one row per state change and, for a
--     servicio it creates, a first row whose estado_anterior equals its birth
--     state (POST writes postulado -> postulado). A loaded servicio is born
--     activo, so its single row is activo -> activo, motivo admin_asignacion,
--     actor p_actor (the real person running the load), detalle_motivo
--     "Carga inicial: <fuente>". No made-up en_orientacion step.
--   - One verificacion pendiente per requisito of the rol, as POST does.
--   - A new person is what createUser writes: usuarios (no auth), the miembro
--     row in usuario_roles, plus usuario_campus with p_campus_id as principal
--     (D7). genero and estado_civil come from the row and must be valid.
--   - Existing persons are never overwritten (D7): only NULL fecha_nacimiento,
--     telefono, bautizado, fecha_bautizo, talla_franela and redes_sociales are
--     filled, and detalle lists them. Values the usuarios CHECKs would reject
--     are left out with a note instead of failing the row: a fecha_bautizo
--     for someone not baptized or in the future, bautizado = false for someone
--     with a stored fecha_bautizo, a talla over 10 chars, redes over 300
--     chars. talla_franela is stored upper(btrim(value)).
--   - persona_datos_importados: one row per (persona, fuente), its datos
--     keyed by fila: {"filas": {"<fila>": {...extras of that row}}}. Every
--     row resolved to a person writes its fila's entry, {} when the row has
--     no extras, because rule 1 below reads it. Nothing is lost when a person
--     is on several rows (two sub-areas), a re-run of a fila replaces only
--     that fila's entry ({} when its extras are now empty or missing), and an
--     identical re-run writes nothing. The column comment on datos says the
--     same.
--   - The person. The user's rule: never link a row to the wrong person; a
--     row left for review is the accepted cost. A full name is compared only
--     as a whole key (dream_team_clave_nombre), never word by word, and an
--     age is taken today in the church's time zone (as fecha_inicio below).
--     The first rule that applies wins:
--     0. persona_id names an existing usuario: existente.
--     1. persona_datos_importados already holds this fila for this fuente:
--        that person, existente ("ya resuelta en una carga anterior"). So a
--        re-run resolves every row as the run that wrote it, crear_sin_cedula
--        included (it does not create the person twice), and a row once
--        settled with persona_id keeps its person without it. The key only
--        holds while the row agrees with the person: a stored cedula or a
--        known birth date that differs from the row's is conflicto (the
--        spreadsheet was re-sorted or corrected since), and a fila held by
--        several people is revisar. It also needs the same name key, or
--        both birth dates known and equal; otherwise revisar (the candidate
--        is reported, nothing is written). A minor row against a person
--        with no stored birth date is revisar too. A row settled by this
--        rule writes no usuarios column (not even a NULL one) and only its
--        own fila entry; it only ensures the servicio. A fila number used twice in p_filas is an
--        error on each of those rows, since it would key two rows.
--     2. The row's cedula is on other rows of p_filas under another name
--        key: every such row is revisar, so no name claims it.
--     3. The cedula belongs to a usuario (usuarios_cedula_key first, then the
--        stored values normalized, for rows written before the usuarios
--        trigger; several holders: revisar):
--        a. both birth dates known and equal: existente;
--        b. both known and different: conflicto;
--        c. the row is a minor (under 18): revisar, since a child is often
--           listed with a parent's cedula, even under the same name;
--        d. the same name key: existente;
--        e. otherwise revisar.
--        revisar and conflicto write nothing and report the holder in
--        persona_id, for the reviewer to confirm with persona_id.
--     4. Nobody holds the cedula: creada.
--     5. No cedula: crear_sin_cedula = true always creates the person, even
--        when people of the same name key exist, and detalle lists them
--        ("ojo: ..."); else the row links by itself (existente_por_nombre)
--        only when it has a birth date and exactly one namesake was born that
--        day. A row without a birth date never links by itself, since a name
--        alone is a guess. Every other row is revisar, and its detalle lists
--        every namesake with the stored birth date or "sin fecha" (or says
--        there are none), so the reviewer can set persona_id or
--        crear_sin_cedula.
--     When the stored name key differs from the row's, detalle names the
--     stored person, so the dry run shows who every existing row went to.
--
-- Blast radius: four new functions and a new comment on
-- persona_datos_importados.datos; no table, policy or trigger changes.
-- Nothing calls the functions but a privileged session.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.dream_team_cargar_voluntarios(text, jsonb, uuid, uuid, boolean);
--   DROP FUNCTION IF EXISTS public.dream_team_grants_de_servicio(uuid, text, uuid, text);
--   DROP FUNCTION IF EXISTS public.dream_team_clave_nombre(text, text);
--   DROP FUNCTION IF EXISTS public.dream_team_normalizar_etiqueta(text);
--   COMMENT ON COLUMN public.persona_datos_importados.datos IS
--     'The unmodelled columns as a JSON object, keyed by spreadsheet column.';

-- 1. Label normalization -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.dream_team_normalizar_etiqueta(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $$
  SELECT lower(translate(
    regexp_replace(p, '^\s+|\s+$', '', 'g'),
    'ÁÀÂÄÃÅáàâäãåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖÕóòôöõÚÙÛÜúùûüÑñÇçÝýÿ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCcYyy'));
$$;

COMMENT ON FUNCTION public.dream_team_normalizar_etiqueta(text) IS
  'Trims, strips Spanish accents and lower-cases a label or a name, so '
  '"Líder" and "lider" compare equal. SQL twin of normalizeLabel in '
  'lib/platform/dream-team/grants.ts.';

-- 2. The full-name key ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dream_team_clave_nombre(p_nombre text, p_apellido text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $$
  SELECT btrim(regexp_replace(
    public.dream_team_normalizar_etiqueta(
      normalize(coalesce(p_nombre, '') || ' ' || coalesce(p_apellido, ''), NFC)),
    '[^[:alnum:]]+', ' ', 'g'));
$$;

COMMENT ON FUNCTION public.dream_team_clave_nombre(text, text) IS
  'The key dream_team_cargar_voluntarios compares and looks up full names by: '
  '"nombre apellido" in NFC, trimmed, without Spanish accents and in lower '
  'case (dream_team_normalizar_etiqueta), every run of characters that are not '
  'letters or digits turned into one space, trimmed. Names match only as a '
  'whole key, never word by word.';

-- 3. The role -> capability mapping, mirrored from grants.ts ------------------

CREATE OR REPLACE FUNCTION public.dream_team_grants_de_servicio(
  p_equipo_id   uuid,
  p_experiencia text,
  p_rol_id      uuid,
  p_rol_label   text
)
RETURNS TABLE (capability_key text, experience text, scope_type text, scope_id text)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $$
  WITH rol AS (
    SELECT public.dream_team_normalizar_etiqueta(p_rol_label) AS label
  ),
  -- ROLE_TO_GENERIC_CAPABILITIES (keys already normalized).
  genericas AS (
    SELECT g.orden, g.capability_key
      FROM rol
      JOIN (VALUES
        ('voluntario',           1, 'dream_team.serve'),
        ('voluntario de camara', 1, 'dream_team.serve'),
        ('lider',                1, 'dream_team.serve'),
        ('lider',                2, 'dream_team.lead'),
        ('lider de grupo',       1, 'dream_team.serve'),
        ('lider de grupo',       2, 'dream_team.lead'),
        ('lider de grupo',       3, 'dream_team.gdv.lead'),
        ('facilitador',          1, 'dream_team.serve'),
        ('facilitador',          2, 'dream_team.lead'),
        ('entrenador',           1, 'dream_team.serve'),
        ('entrenador',           2, 'dream_team.lead'),
        ('coordinador',          1, 'dream_team.serve'),
        ('coordinador',          2, 'dream_team.coordinate'),
        ('director',             1, 'dream_team.serve'),
        ('director',             2, 'dream_team.direct')
      ) AS g(label, orden, capability_key) ON g.label = rol.label
  ),
  -- resolveExperienceSpecificCapability.
  especifica AS (
    SELECT 100 AS orden,
           CASE p_experiencia
             WHEN 'dps' THEN CASE WHEN f.es_director THEN 'dps.team.director'
                                  WHEN f.es_lider THEN 'dps.team.lead'
                                  ELSE 'dps.team.serve' END
             WHEN 'estudiantes' THEN CASE WHEN f.es_lider OR f.es_director THEN 'estudiantes.team.lead'
                                          ELSE 'estudiantes.team.serve' END
             WHEN 'talleres_crecimiento' THEN 'talleres_crecimiento.team.serve'
             WHEN 'ninos' THEN 'ninos.team.serve'
             WHEN 'the_living_room' THEN 'the_living_room.team.serve'
           END AS capability_key
      FROM (SELECT rol.label IN ('lider', 'lider de grupo', 'facilitador', 'entrenador', 'coordinador') AS es_lider,
                   rol.label = 'director' AS es_director
              FROM rol) f
  ),
  -- PLATFORM_CAPABILITIES (lib/platform/experiences.ts), for the keys above.
  capacidades AS (
    SELECT * FROM (VALUES
      ('dream_team.serve',                'dream_team',           'equipo'),
      ('dream_team.lead',                 'dream_team',           'equipo'),
      ('dream_team.coordinate',           'dream_team',           'equipo'),
      ('dream_team.direct',               'dream_team',           'equipo'),
      ('dream_team.gdv.lead',             'grupos_vida',          'grupo'),
      ('dps.team.serve',                  'dps',                  'equipo'),
      ('dps.team.lead',                   'dps',                  'equipo'),
      ('dps.team.director',               'dps',                  'equipo'),
      ('estudiantes.team.serve',          'estudiantes',          'equipo'),
      ('estudiantes.team.lead',           'estudiantes',          'equipo'),
      ('talleres_crecimiento.team.serve', 'talleres_crecimiento', 'taller'),
      ('ninos.team.serve',                'ninos',                'equipo'),
      ('the_living_room.team.serve',      'the_living_room',      'experience')
    ) AS c(capability_key, experience, scope_type)
  )
  -- scopeIdForGrant: experience -> none, grupo -> the rol, else the equipo.
  SELECT c.capability_key, c.experience, c.scope_type,
         CASE c.scope_type
           WHEN 'experience' THEN NULL
           WHEN 'grupo' THEN p_rol_id::text
           ELSE p_equipo_id::text
         END
    FROM (SELECT orden, capability_key FROM genericas
          UNION ALL
          SELECT orden, capability_key FROM especifica WHERE capability_key IS NOT NULL) k
    JOIN capacidades c ON c.capability_key = k.capability_key
   ORDER BY k.orden;
$$;

COMMENT ON FUNCTION public.dream_team_grants_de_servicio(uuid, text, uuid, text) IS
  'The capability grants a servicio mints when it becomes activo: a SQL mirror '
  'of buildGrantsForServicio in lib/platform/dream-team/grants.ts, used by '
  'dream_team_cargar_voluntarios. Both sides are pinned to the grants-table of '
  'supabase/tests/dream-team-cargar-voluntarios.test.sql (SQL suite and the '
  'Jest test grants-sql-mirror.test.ts); change them together.';

-- 4. The loader ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dream_team_cargar_voluntarios(
  p_fuente    text,
  p_filas     jsonb,
  p_actor     uuid,
  p_campus_id uuid,
  p_aplicar   boolean DEFAULT false
)
RETURNS TABLE (
  fila            int,
  cedula          text,
  persona_id      uuid,
  persona_accion  text,
  servicio_id     uuid,
  servicio_accion text,
  detalle         text
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_fuente    text := btrim(p_fuente);
  v_tz        text := coalesce(nullif(current_setting('app.zona_horaria', true), ''), 'America/Caracas');
  -- Born after this date: under 18 today in the church's time zone.
  v_hace_18   date := ((now() AT TIME ZONE v_tz) - interval '18 years')::date;
  v_miembro   uuid;
  v_reporte   jsonb := '[]'::jsonb;

  -- Every object row of p_filas (ordinal, fila, cedula, name key), for the
  -- checks that look across the payload, and the fila numbers used twice.
  v_pre_n     bigint[];
  v_pre_fila  int[];
  v_pre_ced   text[];
  v_pre_clave text[];
  v_filas_rep int[];
  v_choque    text;

  v_elem      jsonb;
  v_ord       bigint;
  v_fila      int;
  v_cedula    text;
  v_persona   uuid;
  v_p_accion  text;
  v_servicio  uuid;
  v_s_accion  text;
  v_detalle   text[];

  v_label     text;
  v_ultimo    text;
  v_ids       uuid[];
  v_equipo    uuid;
  v_exp       text;
  v_activo    boolean;
  v_rol_texto text;
  v_rol       uuid;
  v_rol_label text;

  v_nombre    text;
  v_apellido  text;
  v_clave     text;
  v_fila_nom  text;
  v_base_nom  text;
  v_override  text;
  v_crear     boolean;
  v_por_clave boolean;
  v_u         public.usuarios%ROWTYPE;

  v_fnac      date;
  v_tel       text;
  v_baut      boolean;
  v_fbaut     date;
  v_talla     text;
  v_redes     text;
  v_extras    jsonb;
  v_llenar    text[];

  v_estado    public.dream_team_estado;
  v_otros     text;
  v_inicio    timestamptz;
  v_g         record;
  v_n         integer;
  v_mismos    integer;
  v_mismo_nom text;
BEGIN
  IF p_fuente IS NULL OR v_fuente = '' THEN
    RAISE EXCEPTION 'dream_team_cargar_voluntarios: p_fuente es obligatoria' USING errcode = '22023';
  END IF;
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'dream_team_cargar_voluntarios: p_filas debe ser un arreglo json' USING errcode = '22023';
  END IF;
  IF p_aplicar IS NULL THEN
    RAISE EXCEPTION 'dream_team_cargar_voluntarios: p_aplicar es obligatorio' USING errcode = '22023';
  END IF;
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_actor) THEN
    RAISE EXCEPTION 'dream_team_cargar_voluntarios: el actor % no es un usuario', p_actor USING errcode = '22023';
  END IF;
  IF p_campus_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.campus c WHERE c.id = p_campus_id) THEN
    RAISE EXCEPTION 'dream_team_cargar_voluntarios: el campus % no existe', p_campus_id USING errcode = '22023';
  END IF;

  SELECT rs.id INTO v_miembro FROM public.roles_sistema rs WHERE rs.nombre_interno = 'miembro';
  IF v_miembro IS NULL THEN
    RAISE EXCEPTION 'dream_team_cargar_voluntarios: falta el rol de sistema miembro' USING errcode = '22023';
  END IF;

  -- The fila, cedula and name key of every object row, computed as each row
  -- computes its own (a fila out of the int range is left NULL here and fails
  -- that row below), and the fila numbers used more than once.
  SELECT array_agg(x.n ORDER BY x.n), array_agg(x.fila ORDER BY x.n),
         array_agg(x.ced ORDER BY x.n), array_agg(x.clave ORDER BY x.n)
    INTO v_pre_n, v_pre_fila, v_pre_ced, v_pre_clave
    FROM (SELECT e.n,
                 CASE WHEN jsonb_typeof(e.value -> 'fila') IS DISTINCT FROM 'number' THEN e.n::int
                      WHEN abs((e.value ->> 'fila')::numeric) < 2147483647 THEN (e.value ->> 'fila')::numeric::int
                 END AS fila,
                 public.normalizar_cedula_ve(nullif(btrim(e.value ->> 'cedula'), '')) AS ced,
                 public.dream_team_clave_nombre(e.value ->> 'nombre', e.value ->> 'apellido') AS clave
            FROM jsonb_array_elements(p_filas) WITH ORDINALITY AS e(value, n)
           WHERE jsonb_typeof(e.value) = 'object') x;

  SELECT array_agg(f.fila ORDER BY f.fila) INTO v_filas_rep
    FROM (SELECT p.fila FROM unnest(v_pre_fila) AS p(fila)
           WHERE p.fila IS NOT NULL
           GROUP BY p.fila HAVING count(*) > 1) f;

  BEGIN
    FOR v_elem, v_ord IN
      SELECT e.value, e.n FROM jsonb_array_elements(p_filas) WITH ORDINALITY AS e(value, n)
    LOOP
      v_fila := v_ord::int;
      v_cedula := NULL;
      v_persona := NULL;
      v_servicio := NULL;
      v_p_accion := NULL;
      v_s_accion := NULL;
      v_detalle := '{}';

      <<una_fila>>
      BEGIN
        IF jsonb_typeof(v_elem) IS DISTINCT FROM 'object' THEN
          v_p_accion := 'error';
          v_s_accion := 'error';
          v_detalle := ARRAY['la fila no es un objeto json'];
          EXIT una_fila;
        END IF;

        IF jsonb_typeof(v_elem -> 'fila') = 'number' THEN
          v_fila := (v_elem ->> 'fila')::numeric::int;
        END IF;
        v_cedula := public.normalizar_cedula_ve(nullif(btrim(v_elem ->> 'cedula'), ''));

        IF v_fila = ANY (v_filas_rep) THEN
          v_p_accion := 'error';
          v_s_accion := 'error';
          v_detalle := ARRAY[format('la fila %s aparece %s veces en p_filas', v_fila,
                                    (SELECT count(*) FROM unnest(v_pre_fila) AS p(fila) WHERE p.fila = v_fila))];
          EXIT una_fila;
        END IF;

        -- 1. The equipo: walk equipo_ruta from a root, label by label.
        IF jsonb_typeof(v_elem -> 'equipo_ruta') IS DISTINCT FROM 'array'
           OR jsonb_array_length(v_elem -> 'equipo_ruta') = 0 THEN
          v_p_accion := 'error';
          v_s_accion := 'error';
          v_detalle := ARRAY['falta equipo_ruta'];
          EXIT una_fila;
        END IF;

        v_equipo := NULL;
        FOR v_label IN SELECT r.value FROM jsonb_array_elements_text(v_elem -> 'equipo_ruta') AS r(value) LOOP
          SELECT array_agg(e.id) INTO v_ids
            FROM public.dream_team_equipos e
           WHERE e.parent_equipo_id IS NOT DISTINCT FROM v_equipo
             AND public.dream_team_normalizar_etiqueta(e.label) = public.dream_team_normalizar_etiqueta(v_label);

          IF v_ids IS NULL THEN
            v_p_accion := 'error';
            v_s_accion := 'error';
            v_detalle := ARRAY[format('no existe el equipo "%s" en la ruta', v_label)];
            EXIT una_fila;
          ELSIF cardinality(v_ids) > 1 THEN
            v_p_accion := 'error';
            v_s_accion := 'error';
            v_detalle := ARRAY[format('hay %s equipos "%s" en el mismo nivel de la ruta', cardinality(v_ids), v_label)];
            EXIT una_fila;
          END IF;

          v_equipo := v_ids[1];
          v_ultimo := v_label;
        END LOOP;

        SELECT e.experiencia, e.activo, e.label INTO v_exp, v_activo, v_ultimo
          FROM public.dream_team_equipos e WHERE e.id = v_equipo;
        IF NOT v_activo THEN
          v_p_accion := 'error';
          v_s_accion := 'error';
          v_detalle := ARRAY[format('el equipo "%s" está inactivo', v_ultimo)];
          EXIT una_fila;
        END IF;

        -- 1b. The rol of that equipo.
        v_rol_texto := nullif(btrim(v_elem ->> 'rol'), '');
        SELECT array_agg(r.id), min(r.label) INTO v_ids, v_rol_label
          FROM public.dream_team_roles r
         WHERE r.equipo_id = v_equipo
           AND r.activo
           AND public.dream_team_normalizar_etiqueta(r.label) = public.dream_team_normalizar_etiqueta(v_rol_texto);

        IF v_ids IS NULL THEN
          v_p_accion := 'error';
          v_s_accion := 'error';
          v_detalle := ARRAY[format('el equipo "%s" no tiene el rol activo "%s"', v_ultimo, coalesce(v_rol_texto, ''))];
          EXIT una_fila;
        ELSIF cardinality(v_ids) > 1 THEN
          v_p_accion := 'error';
          v_s_accion := 'error';
          v_detalle := ARRAY[format('el equipo "%s" tiene %s roles "%s"', v_ultimo, cardinality(v_ids), v_rol_texto)];
          EXIT una_fila;
        END IF;
        v_rol := v_ids[1];

        -- 2. The person: the first rule that applies (see the header).
        v_por_clave := false;
        v_nombre := btrim(coalesce(v_elem ->> 'nombre', ''));
        v_apellido := btrim(coalesce(v_elem ->> 'apellido', ''));
        v_clave := public.dream_team_clave_nombre(v_nombre, v_apellido);
        v_fila_nom := concat_ws(' ', nullif(v_nombre, ''), nullif(v_apellido, ''));
        v_fnac := nullif(btrim(v_elem ->> 'fecha_nacimiento'), '')::date;
        v_override := nullif(btrim(v_elem ->> 'persona_id'), '');
        v_crear := false;

        IF v_override IS NOT NULL THEN
          -- Rule 0: persona_id names the person.
          v_persona := v_override::uuid;
          IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_persona) THEN
            v_persona := NULL;
            v_p_accion := 'error';
            v_s_accion := 'omitido';
            v_detalle := ARRAY[format('persona_id %s no existe', v_override)];
            EXIT una_fila;
          END IF;
          v_p_accion := 'existente';
          v_detalle := v_detalle || 'persona_id indicado en la fila'::text;

        ELSE
          -- Rule 1: an earlier load of this fuente resolved this fila.
          SELECT array_agg(d.persona_id ORDER BY d.persona_id) INTO v_ids
            FROM public.persona_datos_importados d
           WHERE d.fuente = v_fuente
             AND jsonb_typeof(d.datos -> 'filas') = 'object'
             AND (d.datos -> 'filas') ? v_fila::text;

          IF cardinality(v_ids) > 1 THEN
            v_p_accion := 'revisar';
            v_s_accion := 'omitido';
            v_detalle := ARRAY[format('la fila ya se cargó para %s personas: %s; indicar persona_id',
                                      cardinality(v_ids), array_to_string(v_ids, ', '))];
            EXIT una_fila;
          ELSIF cardinality(v_ids) = 1 THEN
            v_persona := v_ids[1];
            SELECT * INTO v_u FROM public.usuarios u WHERE u.id = v_persona;
            IF (v_cedula IS NOT NULL AND v_u.cedula IS NOT NULL
                AND public.normalizar_cedula_ve(v_u.cedula) <> v_cedula)
               OR (v_fnac IS NOT NULL AND v_u.fecha_nacimiento IS NOT NULL
                   AND v_u.fecha_nacimiento <> v_fnac) THEN
              -- The row no longer agrees with that person: the spreadsheet
              -- was re-sorted or corrected since.
              v_p_accion := 'conflicto';
              v_s_accion := 'omitido';
              v_detalle := ARRAY[format('la fila ya se cargó como "%s" (cédula %s, nacimiento %s) y ahora dice "%s" '
                                        || '(cédula %s, nacimiento %s); si es la misma persona, indicar persona_id',
                                        concat_ws(' ', v_u.nombre, v_u.apellido), coalesce(v_u.cedula, '-'),
                                        coalesce(to_char(v_u.fecha_nacimiento, 'YYYY-MM-DD'), '-'),
                                        v_fila_nom, coalesce(v_cedula, '-'),
                                        coalesce(to_char(v_fnac, 'YYYY-MM-DD'), '-'))];
              EXIT una_fila;
            END IF;
            IF public.dream_team_clave_nombre(v_u.nombre, v_u.apellido) IS DISTINCT FROM v_clave
               AND NOT (v_fnac IS NOT NULL AND v_u.fecha_nacimiento IS NOT NULL
                        AND v_u.fecha_nacimiento = v_fnac) THEN
              -- Neither the whole name nor a known birth date ties the row to
              -- that person: the fila may now hold someone else.
              v_p_accion := 'revisar';
              v_s_accion := 'omitido';
              v_detalle := ARRAY[format('la fila ya se cargó como "%s" y ahora dice "%s"; '
                                        || 'si es la misma persona, indicar persona_id',
                                        concat_ws(' ', v_u.nombre, v_u.apellido), v_fila_nom)];
              EXIT una_fila;
            END IF;
            IF v_u.fecha_nacimiento IS NULL AND v_fnac > v_hace_18 THEN
              -- A minor against a person whose age is unknown: a child is
              -- often listed under a parent's name and cedula.
              v_p_accion := 'revisar';
              v_s_accion := 'omitido';
              v_detalle := ARRAY[format('la fila ya se cargó como "%s" (sin fecha de nacimiento) y ahora es '
                                        || 'de un menor; si es la misma persona, indicar persona_id',
                                        concat_ws(' ', v_u.nombre, v_u.apellido))];
              EXIT una_fila;
            END IF;
            v_p_accion := 'existente';
            v_por_clave := true;
            v_detalle := v_detalle || 'ya resuelta en una carga anterior'::text;
          END IF;
        END IF;

        IF v_p_accion IS NOT NULL THEN
          -- Settled by rule 0 or 1.
          NULL;

        ELSIF v_cedula IS NOT NULL THEN
          -- Rule 2: the same cedula on other rows of the payload, another name.
          SELECT string_agg(coalesce(o.fila, o.n::int)::text, ', ' ORDER BY o.n) INTO v_choque
            FROM unnest(v_pre_n, v_pre_fila, v_pre_ced, v_pre_clave) AS o(n, fila, ced, clave)
           WHERE o.ced = v_cedula
             AND o.n <> v_ord
             AND o.clave IS DISTINCT FROM v_clave;
          IF v_choque IS NOT NULL THEN
            v_p_accion := 'revisar';
            v_s_accion := 'omitido';
            v_detalle := ARRAY[format('la cédula aparece en las filas %s con nombres distintos; '
                                      || 'indicar persona_id o corregir la cédula', v_choque)];
            EXIT una_fila;
          END IF;

          -- Rule 3: who holds the cedula.
          SELECT array_agg(u.id ORDER BY u.id) INTO v_ids FROM public.usuarios u WHERE u.cedula = v_cedula;
          IF v_ids IS NULL THEN
            SELECT array_agg(u.id ORDER BY u.id) INTO v_ids
              FROM public.usuarios u
             WHERE public.normalizar_cedula_ve(u.cedula) = v_cedula;
          END IF;

          IF v_ids IS NULL THEN
            -- Rule 4: nobody, a new person.
            v_crear := true;
          ELSIF cardinality(v_ids) > 1 THEN
            v_p_accion := 'revisar';
            v_s_accion := 'omitido';
            v_detalle := ARRAY[format('%s personas con esta cédula: %s', cardinality(v_ids), array_to_string(v_ids, ', '))];
            EXIT una_fila;
          ELSE
            -- One holder. A comparison with an unknown date is NULL and falls
            -- through to the next rule.
            v_persona := v_ids[1];
            SELECT * INTO v_u FROM public.usuarios u WHERE u.id = v_persona;
            v_base_nom := concat_ws(' ', v_u.nombre, v_u.apellido);
            IF v_u.fecha_nacimiento = v_fnac THEN
              -- 3a. The same birth date: the same person, however the name is
              -- spelled (detalle names the stored one).
              v_p_accion := 'existente';
            ELSIF v_u.fecha_nacimiento <> v_fnac THEN
              -- 3b.
              v_p_accion := 'conflicto';
              v_s_accion := 'omitido';
              v_detalle := ARRAY[format('la cédula es de "%s" (nacimiento %s) y la fila dice "%s" (nacimiento %s)',
                                        v_base_nom, to_char(v_u.fecha_nacimiento, 'YYYY-MM-DD'),
                                        v_fila_nom, to_char(v_fnac, 'YYYY-MM-DD'))];
              EXIT una_fila;
            ELSIF v_fnac > v_hace_18 THEN
              -- 3c. A minor is often listed with a parent's cedula, even under
              -- the parent's very name (a junior).
              v_p_accion := 'revisar';
              v_s_accion := 'omitido';
              v_detalle := ARRAY[format('menor con la cédula de "%s"; confirmar con persona_id', v_base_nom)];
              EXIT una_fila;
            ELSIF public.dream_team_clave_nombre(v_u.nombre, v_u.apellido) = v_clave THEN
              -- 3d.
              v_p_accion := 'existente';
            ELSE
              -- 3e.
              v_p_accion := 'revisar';
              v_s_accion := 'omitido';
              v_detalle := ARRAY[format('la cédula es de "%s" y la fila dice "%s"; '
                                        || 'si es la misma persona, indicar persona_id', v_base_nom, v_fila_nom)];
              EXIT una_fila;
            END IF;
          END IF;

        ELSIF coalesce((v_elem ->> 'crear_sin_cedula')::boolean, false) THEN
          -- Rule 5: no cedula and the reviewer said this is a new person: create it
          -- even when namesakes exist (they are listed after the insert).
          v_crear := true;

        ELSE
          -- Rule 5: no cedula. Everyone with the same name key (v_mismos,
          -- listed in v_mismo_nom) and, among them, those born on the row's
          -- birth date (v_ids; none when the row has no birth date, since a
          -- name alone never links by itself).
          SELECT array_agg(m.id ORDER BY m.id) FILTER (WHERE m.fecha_nacimiento = v_fnac),
                 count(*),
                 string_agg(m.item, ', ' ORDER BY m.id)
            INTO v_ids, v_mismos, v_mismo_nom
            FROM (SELECT u.id, u.fecha_nacimiento,
                         format('%s (%s)', u.id,
                                coalesce('nacimiento ' || to_char(u.fecha_nacimiento, 'YYYY-MM-DD'),
                                         'sin fecha')) AS item
                    FROM public.usuarios u
                   WHERE public.dream_team_clave_nombre(u.nombre, u.apellido) = v_clave) m;

          IF v_fnac IS NOT NULL AND cardinality(v_ids) = 1 THEN
            v_persona := v_ids[1];
            v_p_accion := 'existente_por_nombre';
          ELSE
            -- Nobody, no birth date, nobody born that day, or several: a
            -- person decides (D7), with every namesake in view.
            v_p_accion := 'revisar';
            v_s_accion := 'omitido';
            v_detalle := ARRAY[
              CASE WHEN v_mismos = 0 THEN
                     'sin cédula y sin nadie del mismo nombre'
                   WHEN v_fnac IS NULL THEN
                     format('sin cédula ni fecha de nacimiento; %s persona(s) del mismo nombre: %s',
                            v_mismos, v_mismo_nom)
                   ELSE
                     format('sin cédula; %s persona(s) del mismo nombre, %s con nacimiento %s: %s',
                            v_mismos, coalesce(cardinality(v_ids)::text, 'ninguna'),
                            to_char(v_fnac, 'YYYY-MM-DD'), v_mismo_nom)
              END || '; indicar persona_id o crear_sin_cedula = true'];
            EXIT una_fila;
          END IF;
        END IF;

        -- The person columns of the row, cleaned so the usuarios CHECKs hold.
        v_tel := nullif(btrim(v_elem ->> 'telefono'), '');
        v_baut := (v_elem ->> 'bautizado')::boolean;
        v_fbaut := nullif(btrim(v_elem ->> 'fecha_bautizo'), '')::date;
        v_talla := nullif(upper(btrim(v_elem ->> 'talla_franela')), '');
        v_redes := nullif(btrim(v_elem ->> 'redes_sociales'), '');
        IF v_fbaut > current_date THEN
          v_detalle := v_detalle || 'fecha_bautizo ignorada: es futura'::text;
          v_fbaut := NULL;
        END IF;
        IF char_length(v_talla) > 10 THEN
          v_detalle := v_detalle || 'talla_franela ignorada: más de 10 caracteres'::text;
          v_talla := NULL;
        END IF;
        IF char_length(v_redes) > 300 THEN
          v_detalle := v_detalle || 'redes_sociales ignoradas: más de 300 caracteres'::text;
          v_redes := NULL;
        END IF;

        IF v_crear THEN
          -- 3. A new person, as createUser writes one, without an account.
          IF v_nombre = '' OR v_apellido = '' THEN
            v_p_accion := 'error';
            v_s_accion := 'omitido';
            v_detalle := ARRAY['falta el nombre o el apellido para crear la persona'];
            EXIT una_fila;
          END IF;
          IF v_baut IS FALSE AND v_fbaut IS NOT NULL THEN
            v_detalle := v_detalle || 'fecha_bautizo ignorada: bautizado = false'::text;
            v_fbaut := NULL;
          END IF;

          INSERT INTO public.usuarios (nombre, apellido, cedula, genero, estado_civil, fecha_nacimiento,
                                       telefono, bautizado, fecha_bautizo, talla_franela, redes_sociales)
          VALUES (v_nombre, v_apellido, v_cedula,
                  (v_elem ->> 'genero')::public.enum_genero,
                  (v_elem ->> 'estado_civil')::public.enum_estado_civil,
                  v_fnac, v_tel, v_baut, v_fbaut, v_talla, v_redes)
          RETURNING id INTO v_persona;

          INSERT INTO public.usuario_roles (usuario_id, rol_id)
          VALUES (v_persona, v_miembro)
          ON CONFLICT ON CONSTRAINT usuario_roles_unico DO NOTHING;

          INSERT INTO public.usuario_campus (usuario_id, campus_id, es_campus_principal)
          VALUES (v_persona, p_campus_id, true)
          ON CONFLICT ON CONSTRAINT usuario_campus_usuario_id_campus_id_key DO NOTHING;

          v_p_accion := 'creada';

          -- Every other person of the same name key, as the review rows list them.
          SELECT count(*),
                 string_agg(format('%s (%s)', u.id,
                                   coalesce('nacimiento ' || to_char(u.fecha_nacimiento, 'YYYY-MM-DD'),
                                            'sin fecha')),
                            ', ' ORDER BY u.id)
            INTO v_mismos, v_mismo_nom
            FROM public.usuarios u
           WHERE u.id <> v_persona
             AND public.dream_team_clave_nombre(u.nombre, u.apellido) = v_clave;
          IF v_mismos > 0 THEN
            v_detalle := v_detalle || format('ojo: %s persona(s) con el mismo nombre: %s', v_mismos, v_mismo_nom);
          END IF;

        ELSIF v_por_clave THEN
          -- 3. Settled by rule 1: the person was written by the load that
          -- resolved this fila; nothing of usuarios is touched again. detalle
          -- still names the stored person when the name key differs.
          IF public.dream_team_clave_nombre(v_u.nombre, v_u.apellido) IS DISTINCT FROM v_clave THEN
            v_detalle := v_detalle || format('en la base: "%s"', concat_ws(' ', v_u.nombre, v_u.apellido));
          END IF;

        ELSE
          -- 3. An existing person: fill only what is NULL, never overwrite.
          SELECT * INTO v_u FROM public.usuarios u WHERE u.id = v_persona FOR UPDATE;
          -- Who the row was matched to, when the stored name key differs.
          IF public.dream_team_clave_nombre(v_u.nombre, v_u.apellido) IS DISTINCT FROM v_clave THEN
            v_detalle := v_detalle || format('en la base: "%s"', concat_ws(' ', v_u.nombre, v_u.apellido));
          END IF;
          v_llenar := '{}';
          IF v_u.fecha_nacimiento IS NULL AND v_fnac IS NOT NULL THEN
            v_llenar := v_llenar || 'fecha_nacimiento'::text;
          END IF;
          IF v_u.telefono IS NULL AND v_tel IS NOT NULL THEN
            v_llenar := v_llenar || 'telefono'::text;
          END IF;
          IF v_u.bautizado IS NULL AND v_baut IS NOT NULL THEN
            IF v_baut IS FALSE AND v_u.fecha_bautizo IS NOT NULL THEN
              -- usuarios_fecha_bautizo_si_bautizado: a stored baptism date
              -- rules out bautizado = false.
              v_detalle := v_detalle || 'bautizado no se completó: ya tiene fecha_bautizo'::text;
            ELSE
              v_llenar := v_llenar || 'bautizado'::text;
            END IF;
          END IF;
          IF v_u.fecha_bautizo IS NULL AND v_fbaut IS NOT NULL THEN
            IF coalesce(v_u.bautizado, v_baut) IS FALSE THEN
              v_detalle := v_detalle || 'fecha_bautizo no se completó: bautizado = false'::text;
            ELSE
              v_llenar := v_llenar || 'fecha_bautizo'::text;
            END IF;
          END IF;
          IF v_u.talla_franela IS NULL AND v_talla IS NOT NULL THEN
            v_llenar := v_llenar || 'talla_franela'::text;
          END IF;
          IF v_u.redes_sociales IS NULL AND v_redes IS NOT NULL THEN
            v_llenar := v_llenar || 'redes_sociales'::text;
          END IF;

          IF cardinality(v_llenar) > 0 THEN
            UPDATE public.usuarios u
               SET fecha_nacimiento = coalesce(u.fecha_nacimiento, v_fnac),
                   telefono         = coalesce(u.telefono, v_tel),
                   bautizado        = CASE WHEN 'bautizado' = ANY (v_llenar) THEN v_baut
                                           ELSE u.bautizado END,
                   fecha_bautizo    = CASE WHEN 'fecha_bautizo' = ANY (v_llenar) THEN v_fbaut
                                           ELSE u.fecha_bautizo END,
                   talla_franela    = coalesce(u.talla_franela, v_talla),
                   redes_sociales   = coalesce(u.redes_sociales, v_redes)
             WHERE u.id = v_persona;
            v_detalle := v_detalle || ('se completó: ' || array_to_string(v_llenar, ', '));
          END IF;
        END IF;

        -- 4. The unmodelled columns, one row per (persona, fuente), keyed by
        -- fila: this fila's entry is written ({} without extras, since rule 1
        -- reads it on a re-run) or replaced, every other fila's is kept. The
        -- write is guarded, so an identical re-run writes nothing.
        v_extras := CASE WHEN jsonb_typeof(v_elem -> 'extras') = 'object' THEN v_elem -> 'extras'
                         ELSE '{}'::jsonb END;
        INSERT INTO public.persona_datos_importados AS d (persona_id, fuente, datos)
        VALUES (v_persona, v_fuente, jsonb_build_object('filas', jsonb_build_object(v_fila::text, v_extras)))
        ON CONFLICT ON CONSTRAINT persona_datos_importados_persona_fuente_key DO UPDATE
           SET datos = d.datos || jsonb_build_object('filas',
                         CASE WHEN jsonb_typeof(d.datos -> 'filas') = 'object' THEN d.datos -> 'filas'
                              ELSE '{}'::jsonb END
                         || (excluded.datos -> 'filas')),
               importado_at = now()
         WHERE (d.datos || jsonb_build_object('filas',
                  CASE WHEN jsonb_typeof(d.datos -> 'filas') = 'object' THEN d.datos -> 'filas'
                       ELSE '{}'::jsonb END
                  || (excluded.datos -> 'filas')))
               IS DISTINCT FROM d.datos;

        -- 5. The servicio.
        SELECT s.id, s.estado INTO v_servicio, v_estado
          FROM public.dream_team_servicios s
         WHERE s.persona_id = v_persona
           AND s.equipo_id = v_equipo
           AND s.rol_id = v_rol
           AND s.estado <> 'retirado'
         LIMIT 1;

        IF v_servicio IS NOT NULL THEN
          v_s_accion := 'existente';
          IF v_estado <> 'activo' THEN
            v_detalle := v_detalle || format('el servicio que ya existe está en %s', v_estado);
          END IF;
        ELSE
          SELECT string_agg(DISTINCT r.label, ', ') INTO v_otros
            FROM public.dream_team_servicios s
            JOIN public.dream_team_roles r ON r.id = s.rol_id
           WHERE s.persona_id = v_persona
             AND s.equipo_id = v_equipo
             AND s.rol_id <> v_rol
             AND s.estado <> 'retirado';
          IF v_otros IS NOT NULL THEN
            v_detalle := v_detalle || format('ya sirve en este equipo como %s', v_otros);
          END IF;

          v_inicio := coalesce((nullif(btrim(v_elem ->> 'fecha_inicio'), '')::date)::timestamp AT TIME ZONE v_tz,
                               now());

          INSERT INTO public.dream_team_servicios (persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
          VALUES (v_persona, v_equipo, v_rol, 'activo', v_inicio, 'admin_asignacion')
          RETURNING id INTO v_servicio;

          INSERT INTO public.dream_team_estados_historial
            (servicio_id, estado_anterior, estado_nuevo, motivo, detalle_motivo, actor_persona_id)
          VALUES (v_servicio, 'activo', 'activo', 'admin_asignacion', 'Carga inicial: ' || v_fuente, p_actor);

          INSERT INTO public.dream_team_requisitos_verificacion (servicio_id, requisito_id, estado)
          SELECT v_servicio, rq.id, 'pendiente'
            FROM public.dream_team_requisitos rq
           WHERE rq.rol_id = v_rol
          ON CONFLICT ON CONSTRAINT dream_team_requisitos_verificacion_servicio_id_requisito_id_key DO NOTHING;

          FOR v_g IN
            SELECT * FROM public.dream_team_grants_de_servicio(v_equipo, v_exp, v_rol, v_rol_label)
          LOOP
            UPDATE public.dream_team_capability_grants g
               SET revoked_at = NULL,
                   granted_at = now()
             WHERE g.persona_id = v_persona
               AND g.capability_key = v_g.capability_key
               AND g.experience = v_g.experience
               AND g.scope_type = v_g.scope_type
               AND g.scope_id IS NOT DISTINCT FROM v_g.scope_id
               AND g.source = 'dream-team-servicio';
            GET DIAGNOSTICS v_n = ROW_COUNT;
            IF v_n = 0 THEN
              INSERT INTO public.dream_team_capability_grants
                (persona_id, capability_key, experience, scope_type, scope_id, source, granted_at)
              VALUES
                (v_persona, v_g.capability_key, v_g.experience, v_g.scope_type, v_g.scope_id,
                 'dream-team-servicio', now());
            END IF;
          END LOOP;

          v_s_accion := 'creado';
        END IF;

      EXCEPTION
        WHEN OTHERS THEN
          -- The row's own writes roll back with this block; the rest stay.
          v_persona := NULL;
          v_servicio := NULL;
          v_p_accion := 'error';
          v_s_accion := 'error';
          v_detalle := ARRAY['error ' || SQLSTATE || ': ' || SQLERRM];
      END;

      v_reporte := v_reporte || jsonb_build_array(jsonb_build_object(
        'fila', v_fila,
        'cedula', v_cedula,
        'persona_id', v_persona,
        'persona_accion', v_p_accion,
        'servicio_id', v_servicio,
        'servicio_accion', v_s_accion,
        'detalle', nullif(array_to_string(v_detalle, '; '), '')));
    END LOOP;

    IF NOT p_aplicar THEN
      RAISE EXCEPTION 'dream_team_cargar_voluntarios: simulacro, se deshace todo' USING errcode = 'DTSIM';
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'DTSIM' THEN
      -- Dry run: every write above is rolled back; v_reporte survives.
      NULL;
  END;

  RETURN QUERY
    SELECT (r.e ->> 'fila')::int,
           r.e ->> 'cedula',
           (r.e ->> 'persona_id')::uuid,
           r.e ->> 'persona_accion',
           (r.e ->> 'servicio_id')::uuid,
           r.e ->> 'servicio_accion',
           r.e ->> 'detalle'
      FROM jsonb_array_elements(v_reporte) WITH ORDINALITY AS r(e, n)
     ORDER BY r.n;
END;
$function$;

COMMENT ON FUNCTION public.dream_team_cargar_voluntarios(text, jsonb, uuid, uuid, boolean) IS
  'Loads the volunteers of a converted spreadsheet into Dream Team (T4 of '
  'odd/tasks/ninos-voluntarios-waumba.md). p_filas is a JSON array with one '
  'object per row (fila, cedula, nombre, apellido, genero, estado_civil, '
  'fecha_nacimiento, telefono, equipo_ruta, rol, fecha_inicio, bautizado, '
  'fecha_bautizo, talla_franela, redes_sociales, extras; optional persona_id '
  'and crear_sin_cedula overrides). p_aplicar = false (default) is a dry run: '
  'the same report, nothing persisted. The person, first rule that applies: '
  'persona_id; the person an earlier load of the fuente resolved the fila to '
  '(unless the row now gives another cedula or birth date: conflicto, or '
  'matches it by neither the name key nor a known equal birth date: '
  'revisar); a '
  'cedula on other rows under another name is revisar; a cedula held by a '
  'usuario links when the birth dates are equal, is conflicto when they '
  'differ, revisar for a minor, and otherwise links only under the same '
  'full-name key (dream_team_clave_nombre), else revisar; a new cedula creates '
  'the person. Without a cedula, crear_sin_cedula always creates the person; '
  'otherwise the row links by itself only when it has a birth date and '
  'exactly one person of the same name key was born that day; any other row '
  'is left as revisar. revisar and conflicto rows write nothing. extras are '
  'kept in persona_datos_importados as {"filas": {"<fila>": {...}}}, {} for a '
  'row without extras. '
  'Existing people are never overwritten, only their NULL columns are filled, '
  'and a fila already loaded for the fuente touches no usuarios column. '
  'Privileged callers only: EXECUTE is revoked from PUBLIC, anon and '
  'authenticated.';

-- The loader writes datos keyed by spreadsheet row, not by column as the T3
-- comment (20261003162000_usuarios_ficha_voluntario.sql) says; describe it.
COMMENT ON COLUMN public.persona_datos_importados.datos IS
  'The unmodelled columns of the person, by spreadsheet row of this fuente: '
  '{"filas": {"<fila>": {"<column>": value, ...}}}. '
  'dream_team_cargar_voluntarios writes one entry per fila it resolves to the '
  'person ({} when the fila has no extras), replaces it when that fila is '
  'loaded again, and reads it on a re-run to resolve the fila to the same '
  'person; the other filas are kept.';

-- Privileged roles only. Supabase's default privileges grant EXECUTE on new
-- functions in public to anon and authenticated, so revoke explicitly.
REVOKE ALL ON FUNCTION public.dream_team_normalizar_etiqueta(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dream_team_clave_nombre(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dream_team_grants_de_servicio(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dream_team_cargar_voluntarios(text, jsonb, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.dream_team_normalizar_etiqueta(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dream_team_clave_nombre(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dream_team_grants_de_servicio(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dream_team_cargar_voluntarios(text, jsonb, uuid, uuid, boolean) TO service_role;
