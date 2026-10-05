-- T4 (odd/tasks/ninos-voluntarios-waumba.md, decisions D6-D9) — the reusable
-- volunteer loader public.dream_team_cargar_voluntarios(p_fuente, p_filas,
-- p_actor, p_campus_id, p_aplicar), its full-name key
-- public.dream_team_clave_nombre and its SQL mirror of the role -> capability
-- mapping, public.dream_team_grants_de_servicio
-- (migration 20261003163000_dream_team_cargar_voluntarios.sql).
--
-- Covers:
--   a. Every persona_accion (existente, existente_por_nombre, creada, revisar,
--      conflicto, error) and servicio_accion (creado, existente, omitido, error).
--   b. The strict person rules (the user's rule: no row may land on the wrong
--      person; rows left for review are the accepted cost). A cedula whose
--      holder has another known birth date is conflicto; a minor on someone's
--      cedula is revisar, under another name (a parent without a birth date)
--      and under the very same one (a junior); a cedula whose holder has
--      another name key is revisar; the same birth date links whatever the
--      spelling and names the stored person; an adult with the same name key
--      links when the stored birth date is unknown; a cedula found on rows of
--      the payload under different name keys leaves every such row for
--      review and creates nobody. Review rows write nothing for anyone.
--   c. Fill-only-null: an existing person gets only the empty columns filled; a
--      populated column is never changed. A value a usuarios CHECK would reject
--      (bautizado = false over a stored fecha_bautizo) is skipped with a note
--      and the rest of the row still loads.
--   d. A row without a cedula: persona_id names the person; crear_sin_cedula
--      always creates one, even when namesakes exist, and detalle lists them;
--      otherwise it links by itself only when the row has a birth date and
--      exactly one namesake was born that day. A row without a birth date
--      never links by itself. Every other row is revisar, and its detalle
--      lists every namesake with the stored birth date or "sin fecha".
--      Namesakes are found by the name key, so a hyphen or a space between
--      names does not matter.
--   e. Duplicates inside the payload: the later row is existente.
--   f. A new person: usuarios row without auth, miembro role, principal campus;
--      a row with bautizado = false and a fecha_bautizo is created without it.
--   g. persona_datos_importados: extras are kept per persona and fuente, keyed
--      by fila, so a person on several rows loses nothing and a corrected
--      re-run replaces only its own fila's entry. Every resolved row writes
--      its fila's entry, {} without extras; a re-run whose fila has empty or
--      missing extras empties that entry, and an identical re-run does not
--      touch the row at all.
--   h. A new servicio: activo, fecha_inicio, one history row with the actor,
--      one verificacion per requisito of the rol.
--   i. Grants for coordinador / entrenador / voluntario under a ninos equipo.
--   j. Dry run: the same report, and every touched table is unchanged.
--   k. Idempotence: a second apply of the same payload creates nothing and
--      changes no table, because every resolved fila goes back to its person
--      through its persona_datos_importados entry ("ya resuelta en una carga
--      anterior"); a row that still says crear_sin_cedula does not create the
--      person again; a row once settled with persona_id keeps its person
--      without it. A corrected re-run changes only persona_datos_importados.
--      The entry is not trusted against the row: another cedula or birth date
--      is conflicto, a fila held by two people is revisar, and a fila number
--      used twice in one payload is an error, all without writes.
--   l. Security: SECURITY INVOKER, search_path set, no EXECUTE for PUBLIC, anon
--      or authenticated on the four functions, and an authenticated session
--      is refused.
--   m. The SQL mirror of the role -> capability mapping matches the table
--      between the grants-table markers below. The Jest test
--      __tests__/lib/platform/dream-team/grants-sql-mirror.test.ts pins
--      lib/platform/dream-team/grants.ts to the SAME table, so a change on
--      either side fails one of the two suites.
--   n. Argument checks.
--   o. The name key: case, accents (composed or not), hyphens, apostrophes,
--      no-break spaces and runs of spaces do not matter.
--
-- Run against STAGING inside BEGIN…ROLLBACK — nothing here is kept. REPEATABLE
-- READ keeps the table fingerprints of j and k stable while other sessions
-- write to staging. The minors' birth dates (2019, 2020) keep them minors
-- until 2037. Fixtures are synthetic and live under this file's own
-- ca000000-... namespace; their cedulas (E999000NN) are foreign-style numbers
-- no real person here has. The MCP connection is `postgres`, so the loader runs
-- as the table owner; only the l case switches to authenticated. The last
-- statement is a SELECT of the failing cases (0 failing cases = all ok),
-- because the MCP tool returns only the last result-producing statement.
--
-- Fixtures:
--   equipos  01 ZZ Carga Raíz (root, experiencia) › 02 ZZ Carga Niños (ninos)
--            › 03 ZZ Carga Sala (ninos) and 04 ZZ Carga Montaje (ninos)
--   roles    11 Sala coordinador, 12 Sala entrenador, 13 Sala voluntario,
--            14 Montaje voluntario; requisito 15 on rol 13
--   campus   16
--   usuarios 20 actor
--            21 E99900001 Zzcarga Existente (telefono and talla set, rest NULL)
--            22 E99900002 Zzotro Diferente (target of the name conflict)
--            23 Zzsolo Nombrado, no cedula, born 2000-01-02
--            24, 25 Zzdoble Gemelo, no cedula (two people, same name)
--            26 Zzoverride Destino, no cedula (persona_id override target)
--            27 E99900007 Zzseis Dosroles, already voluntario in Sala (servicio 31)
--            28 E99900009 Zzsiete Nobautizado, bautizado = false
--            40 E99900040 Zzpadre Zzfam, born 1970-01-01 (a parent's cedula)
--            41 E99900041 Zzmadre Zzotrafam, no birth date (a parent's cedula)
--            42 E99900042 Zzjunior Zzigual, no birth date (a junior's parent)
--            43 E99900043 Zzrosa De Zzleon, born 1985-03-03 (the same person)
--            44 E99900044 Zzana Zzgomez, no birth date (the same adult)
--            45 E99900045 Zzunico Zzapellido (a row with no apellido)
--            46 E99900046 Zzocho Fechabautizo, bautizado NULL with a fecha_bautizo
--            47 Zznueve Sinfecha, no cedula, no birth date (one namesake)
--            48, 49 Zzdiez Triple, no cedula, both born 2002-02-02, and
--            50 Zzdiez Triple, no cedula, no birth date (three namesakes)
--            51 E99900051 Zzdoce Zzblanco (its cedula on rows of two names)
--            53 Zzana Lucia Zzguion-Zzpaz, no cedula, born 2003-03-03
--            54 Zzhijo Zzotrafam, no cedula, no birth date (the child's own
--               record, for persona_id)

BEGIN ISOLATION LEVEL REPEATABLE READ;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_cv_failures (case_name text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_cv_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

-- Runs a query that returns one scalar and compares its text form.
CREATE OR REPLACE FUNCTION pg_temp.assert_eq(p_case text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  EXECUTE p_sql INTO v_actual;
  IF v_actual IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got ' || coalesce(v_actual, 'NULL'));
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- The statement must fail with p_sqlstate; its effects roll back with the
-- exception block, so a rejected statement leaves no trace.
CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

-- ── report tables and table fingerprints ────────────────────────────

CREATE TEMP TABLE t_cv_simulacro (
  fila int, cedula text, persona_id uuid, persona_accion text,
  servicio_id uuid, servicio_accion text, detalle text
) ON COMMIT DROP;
CREATE TEMP TABLE t_cv_carga1 (LIKE t_cv_simulacro) ON COMMIT DROP;
CREATE TEMP TABLE t_cv_carga2 (LIKE t_cv_simulacro) ON COMMIT DROP;
CREATE TEMP TABLE t_cv_carga3 (LIKE t_cv_simulacro) ON COMMIT DROP;
CREATE TEMP TABLE t_cv_carga4 (LIKE t_cv_simulacro) ON COMMIT DROP;
CREATE TEMP TABLE t_cv_carga5 (LIKE t_cv_simulacro) ON COMMIT DROP;
CREATE TEMP TABLE t_cv_carga6 (LIKE t_cv_simulacro) ON COMMIT DROP;
CREATE TEMP TABLE t_cv_carga7 (LIKE t_cv_simulacro) ON COMMIT DROP;
CREATE TEMP TABLE t_cv_carga8 (LIKE t_cv_simulacro) ON COMMIT DROP;
CREATE TEMP TABLE t_cv_carga8b (LIKE t_cv_simulacro) ON COMMIT DROP;
CREATE TEMP TABLE t_cv_carga8c (LIKE t_cv_simulacro) ON COMMIT DROP;
CREATE TEMP TABLE t_cv_carga9 (LIKE t_cv_simulacro) ON COMMIT DROP;
CREATE TEMP TABLE t_cv_carga10 (LIKE t_cv_simulacro) ON COMMIT DROP;

CREATE TEMP TABLE t_cv_payload (filas jsonb) ON COMMIT DROP;

-- Runs the loader over t_cv_payload and stores its report in p_tabla. A
-- failing call is recorded instead of aborting the suite.
CREATE OR REPLACE FUNCTION pg_temp.cargar(p_tabla text, p_aplicar boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'INSERT INTO %I SELECT * FROM public.dream_team_cargar_voluntarios(%L, (SELECT filas FROM t_cv_payload), %L::uuid, %L::uuid, %L)',
    p_tabla, 'zz-carga-prueba',
    'ca000000-0000-4000-8000-000000000020', 'ca000000-0000-4000-8000-000000000016', p_aplicar);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail('loader call into ' || p_tabla, 'error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

-- One md5 per table the loader can touch, over every row of the table.
CREATE TEMP TABLE t_cv_huellas (momento text, tabla text, huella text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.huellas(p_momento text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_tabla text;
  v_huella text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY[
    'usuarios', 'usuario_roles', 'usuario_campus', 'persona_datos_importados',
    'dream_team_servicios', 'dream_team_estados_historial',
    'dream_team_requisitos_verificacion', 'dream_team_capability_grants'
  ] LOOP
    EXECUTE format('SELECT md5(coalesce(string_agg(t::text, %L ORDER BY t::text), %L)) FROM public.%I t',
                   '|', '', v_tabla)
      INTO v_huella;
    INSERT INTO t_cv_huellas VALUES (p_momento, v_tabla, v_huella);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.tablas_cambiadas(p_antes text, p_despues text)
RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(a.tabla, ', ' ORDER BY a.tabla), '')
    FROM t_cv_huellas a
    JOIN t_cv_huellas d ON d.tabla = a.tabla AND d.momento = p_despues
   WHERE a.momento = p_antes
     AND a.huella IS DISTINCT FROM d.huella;
$$;

-- ── fixtures ────────────────────────────────────────────────────────

INSERT INTO public.campus (id, nombre, codigo) VALUES
  ('ca000000-0000-4000-8000-000000000016', 'ZZ Campus Carga', 'ZZCARGA');

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  ('ca000000-0000-4000-8000-000000000001', 'experiencia', NULL, 'ZZ Carga Raíz', true),
  ('ca000000-0000-4000-8000-000000000002', 'ninos', 'ca000000-0000-4000-8000-000000000001', 'ZZ Carga Niños', true),
  ('ca000000-0000-4000-8000-000000000003', 'ninos', 'ca000000-0000-4000-8000-000000000002', 'ZZ Carga Sala', true),
  ('ca000000-0000-4000-8000-000000000004', 'ninos', 'ca000000-0000-4000-8000-000000000002', 'ZZ Carga Montaje', true);

INSERT INTO public.dream_team_roles (id, equipo_id, label, activo) VALUES
  ('ca000000-0000-4000-8000-000000000011', 'ca000000-0000-4000-8000-000000000003', 'coordinador', true),
  ('ca000000-0000-4000-8000-000000000012', 'ca000000-0000-4000-8000-000000000003', 'entrenador', true),
  ('ca000000-0000-4000-8000-000000000013', 'ca000000-0000-4000-8000-000000000003', 'voluntario', true),
  ('ca000000-0000-4000-8000-000000000014', 'ca000000-0000-4000-8000-000000000004', 'voluntario', true);

INSERT INTO public.dream_team_requisitos (id, equipo_id, rol_id, codigo, label, tipo, obligatoriedad) VALUES
  ('ca000000-0000-4000-8000-000000000015', 'ca000000-0000-4000-8000-000000000003',
   'ca000000-0000-4000-8000-000000000013', 'zz_carga_doc', 'ZZ documento', 'documento', 'requerido');

INSERT INTO public.usuarios (id, auth_id, cedula, nombre, apellido, telefono, fecha_nacimiento,
                             talla_franela, bautizado, estado_civil, genero) VALUES
  ('ca000000-0000-4000-8000-000000000020', NULL, NULL, 'Zzactor', 'Carga', NULL, NULL, NULL, NULL, 'Soltero', 'Otro'),
  ('ca000000-0000-4000-8000-000000000021', NULL, 'E99900001', 'Zzcarga', 'Existente', '04140000001', NULL, 'M', NULL, 'Soltero', 'Femenino'),
  ('ca000000-0000-4000-8000-000000000022', NULL, 'E99900002', 'Zzotro', 'Diferente', NULL, NULL, NULL, NULL, 'Soltero', 'Masculino'),
  ('ca000000-0000-4000-8000-000000000023', NULL, NULL, 'Zzsolo', 'Nombrado', NULL, '2000-01-02', NULL, NULL, 'Soltero', 'Masculino'),
  ('ca000000-0000-4000-8000-000000000024', NULL, NULL, 'Zzdoble', 'Gemelo', NULL, NULL, NULL, NULL, 'Soltero', 'Masculino'),
  ('ca000000-0000-4000-8000-000000000025', NULL, NULL, 'Zzdoble', 'Gemelo', NULL, NULL, NULL, NULL, 'Soltero', 'Masculino'),
  ('ca000000-0000-4000-8000-000000000026', NULL, NULL, 'Zzoverride', 'Destino', NULL, NULL, NULL, NULL, 'Soltero', 'Otro'),
  ('ca000000-0000-4000-8000-000000000027', NULL, 'E99900007', 'Zzseis', 'Dosroles', NULL, NULL, NULL, NULL, 'Soltero', 'Otro'),
  ('ca000000-0000-4000-8000-000000000028', NULL, 'E99900009', 'Zzsiete', 'Nobautizado', NULL, NULL, NULL, false, 'Soltero', 'Otro'),
  ('ca000000-0000-4000-8000-000000000040', NULL, 'E99900040', 'Zzpadre', 'Zzfam', NULL, '1970-01-01', NULL, NULL, 'Casado', 'Masculino'),
  ('ca000000-0000-4000-8000-000000000041', NULL, 'E99900041', 'Zzmadre', 'Zzotrafam', NULL, NULL, NULL, NULL, 'Soltero', 'Femenino'),
  ('ca000000-0000-4000-8000-000000000042', NULL, 'E99900042', 'Zzjunior', 'Zzigual', NULL, NULL, NULL, NULL, 'Casado', 'Masculino'),
  ('ca000000-0000-4000-8000-000000000043', NULL, 'E99900043', 'Zzrosa', 'De Zzleon', NULL, '1985-03-03', NULL, NULL, 'Soltero', 'Femenino'),
  ('ca000000-0000-4000-8000-000000000044', NULL, 'E99900044', 'Zzana', 'Zzgomez', NULL, NULL, NULL, NULL, 'Soltero', 'Femenino'),
  ('ca000000-0000-4000-8000-000000000045', NULL, 'E99900045', 'Zzunico', 'Zzapellido', NULL, NULL, NULL, NULL, 'Soltero', 'Otro'),
  ('ca000000-0000-4000-8000-000000000047', NULL, NULL, 'Zznueve', 'Sinfecha', NULL, NULL, NULL, NULL, 'Soltero', 'Femenino'),
  ('ca000000-0000-4000-8000-000000000048', NULL, NULL, 'Zzdiez', 'Triple', NULL, '2002-02-02', NULL, NULL, 'Soltero', 'Masculino'),
  ('ca000000-0000-4000-8000-000000000049', NULL, NULL, 'Zzdiez', 'Triple', NULL, '2002-02-02', NULL, NULL, 'Soltero', 'Masculino'),
  ('ca000000-0000-4000-8000-000000000050', NULL, NULL, 'Zzdiez', 'Triple', NULL, NULL, NULL, NULL, 'Soltero', 'Masculino'),
  ('ca000000-0000-4000-8000-000000000051', NULL, 'E99900051', 'Zzdoce', 'Zzblanco', NULL, NULL, NULL, NULL, 'Soltero', 'Otro'),
  ('ca000000-0000-4000-8000-000000000053', NULL, NULL, 'Zzana Lucia', 'Zzguion-Zzpaz', NULL, '2003-03-03', NULL, NULL, 'Soltero', 'Femenino'),
  ('ca000000-0000-4000-8000-000000000054', NULL, NULL, 'Zzhijo', 'Zzotrafam', NULL, NULL, NULL, NULL, 'Soltero', 'Masculino');

INSERT INTO public.usuarios (id, auth_id, cedula, nombre, apellido, bautizado, fecha_bautizo, estado_civil, genero) VALUES
  ('ca000000-0000-4000-8000-000000000046', NULL, 'E99900046', 'Zzocho', 'Fechabautizo', NULL, '2005-05-05', 'Soltero', 'Otro');

INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado) VALUES
  ('ca000000-0000-4000-8000-000000000031', 'ca000000-0000-4000-8000-000000000027',
   'ca000000-0000-4000-8000-000000000003', 'ca000000-0000-4000-8000-000000000013', 'activo');

-- The payload has the converter's shape (one object per spreadsheet row).
-- Rows: 1 existing by cedula (fill-only-null; the name key and the equipo
-- labels ignore case and accents), 2 a cedula held under another name, 3 match
-- by name, 4 several by name, 5 none by name, 6 crear_sin_cedula, 7 persona_id
-- override, 8 new by cedula, 9 duplicate of 8, 10 same person in another
-- sub-area, 11 another rol in the same equipo, 12 servicio already there,
-- 13 unknown equipo label, 14 unknown rol, 15 override to a missing persona,
-- 16 invalid genero, 17 fecha_bautizo for someone not baptized, 18 a child on
-- her father's cedula (another birth date), 19 a child on his mother's cedula
-- (she has no birth date), 20 a junior: a child under the very name of the
-- cedula's holder, who has no birth date, 21 the same birth date under
-- another spelling, 22 an adult with the same name key whose stored birth
-- date is unknown, 23 a row with no apellido, 24 bautizado false for someone
-- with a stored fecha_bautizo, 25 a name without cedula whose only namesake
-- has another birth date, 26 a name without cedula whose two namesakes have
-- no birth date, 27 crear_sin_cedula over two namesakes, 28 a row without
-- cedula or birth date whose one namesake has no birth date either, 29 the
-- same row with crear_sin_cedula, 30 a birth date that two of three namesakes
-- share (the third has none), 31 and 32 a held cedula under two name keys in
-- the payload (a blank nombre, an initial), 33 the same cedula with
-- persona_id, 34 and 35 a new cedula under two names, 36 a hyphenated name
-- without cedula whose namesake is spelled with spaces (and the reverse).
INSERT INTO t_cv_payload (filas) VALUES ($json$[
  {"fila": 1, "cedula": "e-99.900.001", "nombre_completo": "ZZCARGA Existénte",
   "nombre": "ZZCARGA", "apellido": "Existénte", "genero": "Femenino", "estado_civil": "Soltero",
   "fecha_nacimiento": "1990-05-06", "telefono": "0424-999.99.99",
   "equipo_ruta": ["zz carga raiz", "ZZ CARGA NIÑOS", "ZZ Carga Sala"], "rol": "Voluntario",
   "fecha_inicio": "2024-03-10", "bautizado": true, "fecha_bautizo": "2010-01-01",
   "talla_franela": "s", "redes_sociales": "@zzcarga",
   "extras": {"seccion": "Sala", "gdv": "ZZ grupo"}, "revisar": ["genero inferido"]},
  {"fila": 2, "cedula": "E99900002", "nombre": "Zzcarga", "apellido": "Nadie",
   "genero": "Masculino", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario",
   "extras": {"seccion": "Sala"}, "revisar": []},
  {"fila": 3, "cedula": null, "nombre": "ZZSOLO", "apellido": "Nombrado", "fecha_nacimiento": "2000-01-02",
   "genero": "Masculino", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "entrenador", "revisar": []},
  {"fila": 4, "cedula": null, "nombre": "Zzdoble", "apellido": "Gemelo", "genero": "Masculino", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario", "revisar": []},
  {"fila": 5, "cedula": null, "nombre": "Zznadie", "apellido": "Sincedula", "genero": "Masculino", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario", "revisar": []},
  {"fila": 6, "cedula": null, "nombre": "Zznuevo", "apellido": "Sincedula", "genero": "Masculino", "estado_civil": "Casado",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "coordinador",
   "crear_sin_cedula": true, "revisar": []},
  {"fila": 7, "cedula": null, "persona_id": "ca000000-0000-4000-8000-000000000026",
   "nombre": "Cualquiera", "apellido": "Cosa", "genero": "Otro", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Montaje"], "rol": "voluntario", "revisar": []},
  {"fila": 8, "cedula": "E99900008", "nombre": "Zznueva", "apellido": "Persona", "genero": "Femenino",
   "estado_civil": "Soltero", "fecha_nacimiento": "2012-04-05", "telefono": "04121234567",
   "talla_franela": " xl ", "bautizado": false, "fecha_bautizo": "2015-05-05",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario",
   "extras": {"seccion": "Sala"}, "revisar": []},
  {"fila": 9, "cedula": "E99900008", "nombre": "Zznueva", "apellido": "Persona", "genero": "Femenino",
   "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario",
   "extras": {"seccion": "Sala", "dones": "servicio"}, "revisar": []},
  {"fila": 10, "cedula": "E99900008", "nombre": "Zznueva", "apellido": "Persona", "genero": "Femenino",
   "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Montaje"], "rol": "voluntario",
   "extras": {"seccion": "Montaje"}, "revisar": []},
  {"fila": 11, "cedula": "E99900007", "nombre": "Zzseis", "apellido": "Dosroles", "genero": "Otro", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "coordinador", "revisar": []},
  {"fila": 12, "cedula": "E99900007", "nombre": "Zzseis", "apellido": "Dosroles", "genero": "Otro", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario", "revisar": []},
  {"fila": 13, "cedula": "E99900001", "nombre": "Zzcarga", "apellido": "Existente", "genero": "Femenino", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ No Existe"], "rol": "voluntario", "revisar": []},
  {"fila": 14, "cedula": "E99900001", "nombre": "Zzcarga", "apellido": "Existente", "genero": "Femenino", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "animador", "revisar": []},
  {"fila": 15, "cedula": null, "persona_id": "ca000000-0000-4000-8000-000000000099",
   "nombre": "Zzfantasma", "apellido": "Nadie", "genero": "Otro", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario", "revisar": []},
  {"fila": 16, "cedula": "E99900016", "nombre": "Zzmal", "apellido": "Genero", "genero": "X", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario", "revisar": []},
  {"fila": 17, "cedula": "E99900009", "nombre": "Zzsiete", "apellido": "Nobautizado", "genero": "Otro", "estado_civil": "Soltero",
   "fecha_bautizo": "2011-11-11",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario", "revisar": []},
  {"fila": 18, "cedula": "E99900040", "nombre": "Zzhija", "apellido": "Zzfam", "genero": "Femenino", "estado_civil": "Soltero",
   "fecha_nacimiento": "2010-05-05", "telefono": "04120000018", "talla_franela": "s",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario",
   "extras": {"seccion": "Sala"}, "revisar": []},
  {"fila": 19, "cedula": "E99900041", "nombre": "Zzhijo", "apellido": "Zzotrafam", "genero": "Masculino", "estado_civil": "Soltero",
   "fecha_nacimiento": "2019-06-06", "telefono": "04120000019", "redes_sociales": "@zzhijo",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario",
   "extras": {"seccion": "Sala"}, "revisar": []},
  {"fila": 20, "cedula": "E99900042", "nombre": "Zzjunior", "apellido": "Zzigual", "genero": "Masculino", "estado_civil": "Soltero",
   "fecha_nacimiento": "2020-07-07", "telefono": "04120000020",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario",
   "extras": {"seccion": "Sala"}, "revisar": []},
  {"fila": 21, "cedula": "E99900043", "nombre": "Zzrosa María", "apellido": "Zzleón", "genero": "Femenino", "estado_civil": "Soltero",
   "fecha_nacimiento": "1985-03-03", "talla_franela": "m",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Montaje"], "rol": "voluntario", "revisar": []},
  {"fila": 22, "cedula": "E99900044", "nombre": "Zzana", "apellido": "Zzgómez", "genero": "Femenino", "estado_civil": "Soltero",
   "fecha_nacimiento": "1980-08-08", "telefono": "04120000022",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario",
   "extras": {"seccion": "Sala"}, "revisar": []},
  {"fila": 23, "cedula": "E99900045", "nombre": "Zzunico", "apellido": "", "genero": "Otro", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Montaje"], "rol": "voluntario", "revisar": []},
  {"fila": 24, "cedula": "E99900046", "nombre": "Zzocho", "apellido": "Fechabautizo", "genero": "Otro", "estado_civil": "Soltero",
   "bautizado": false, "telefono": "04120000024",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario", "revisar": []},
  {"fila": 25, "cedula": null, "nombre": "Zzsolo", "apellido": "Nombrado", "fecha_nacimiento": "2001-01-01",
   "genero": "Masculino", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario", "revisar": []},
  {"fila": 26, "cedula": null, "nombre": "Zzdoble", "apellido": "Gemelo", "fecha_nacimiento": "1999-09-09",
   "genero": "Masculino", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario", "revisar": []},
  {"fila": 27, "cedula": null, "nombre": "Zzdoble", "apellido": "Gemelo", "genero": "Masculino", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Montaje"], "rol": "voluntario",
   "crear_sin_cedula": true, "revisar": []},
  {"fila": 28, "cedula": null, "nombre": "Zznueve", "apellido": "Sinfecha", "genero": "Femenino", "estado_civil": "Soltero",
   "telefono": "04120000028",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario",
   "extras": {"seccion": "Sala"}, "revisar": []},
  {"fila": 29, "cedula": null, "nombre": "Zznueve", "apellido": "Sinfecha", "genero": "Femenino", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Montaje"], "rol": "voluntario",
   "crear_sin_cedula": true, "revisar": []},
  {"fila": 30, "cedula": null, "nombre": "Zzdiez", "apellido": "Triple", "fecha_nacimiento": "2002-02-02",
   "genero": "Masculino", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario", "revisar": []},
  {"fila": 31, "cedula": "E99900051", "nombre": "", "apellido": "Zzblanco", "genero": "Otro", "estado_civil": "Soltero",
   "telefono": "04120000031",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario", "revisar": []},
  {"fila": 32, "cedula": "E99900051", "nombre": "J.", "apellido": "Zzblanco", "genero": "Otro", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario", "revisar": []},
  {"fila": 33, "cedula": "E99900051", "persona_id": "ca000000-0000-4000-8000-000000000051",
   "nombre": "", "apellido": "Zzblanco", "genero": "Otro", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Montaje"], "rol": "voluntario", "revisar": []},
  {"fila": 34, "cedula": "E99900060", "nombre": "Zzclash", "apellido": "Uno", "genero": "Otro", "estado_civil": "Soltero",
   "fecha_nacimiento": "1991-01-01",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario", "revisar": []},
  {"fila": 35, "cedula": "e-99.900.060", "nombre": "Zzclash", "apellido": "Dos", "genero": "Otro", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Sala"], "rol": "voluntario", "revisar": []},
  {"fila": 36, "cedula": null, "nombre": "Zzana-Lucía", "apellido": "Zzguion Zzpaz", "fecha_nacimiento": "2003-03-03",
   "genero": "Femenino", "estado_civil": "Soltero",
   "equipo_ruta": ["ZZ Carga Raíz", "ZZ Carga Niños", "ZZ Carga Montaje"], "rol": "voluntario", "revisar": []}
]$json$::jsonb);

-- The payload as first loaded; the k re-runs build theirs from it.
CREATE TEMP TABLE t_cv_payload0 ON COMMIT DROP AS SELECT filas FROM t_cv_payload;

-- ── m. the pinned role -> capability table ──────────────────────────
-- One row per capability: (experiencia of the equipo, rol label,
-- capability_key, experience, scope_type, alcance). alcance says what scope_id
-- holds: the equipo id, the rol id, or none (NULL). Both branches of the
-- mapping are here: every known role label under every experiencia with a
-- capability of its own (dps, estudiantes, talleres_crecimiento, ninos,
-- the_living_room) and under one without (experiencia). The Jest test
-- grants-sql-mirror.test.ts parses the lines between the markers and requires
-- that coverage, so keep one tuple per line in exactly this format.

CREATE TEMP TABLE t_cv_grants_tabla (
  experiencia text, rol text, capability_key text, experience text, scope_type text, alcance text
) ON COMMIT DROP;

INSERT INTO t_cv_grants_tabla (experiencia, rol, capability_key, experience, scope_type, alcance) VALUES
-- grants-table:begin
  ('ninos', 'coordinador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'coordinador', 'dream_team.coordinate', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'coordinador', 'ninos.team.serve', 'ninos', 'equipo', 'equipo'),
  ('ninos', 'entrenador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'entrenador', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'entrenador', 'ninos.team.serve', 'ninos', 'equipo', 'equipo'),
  ('ninos', 'Líder', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'Líder', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'Líder', 'ninos.team.serve', 'ninos', 'equipo', 'equipo'),
  ('ninos', 'voluntario', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'voluntario', 'ninos.team.serve', 'ninos', 'equipo', 'equipo'),
  ('ninos', 'director', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'director', 'dream_team.direct', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'director', 'ninos.team.serve', 'ninos', 'equipo', 'equipo'),
  ('ninos', 'Líder de grupo', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'Líder de grupo', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'Líder de grupo', 'dream_team.gdv.lead', 'grupos_vida', 'grupo', 'rol'),
  ('ninos', 'Líder de grupo', 'ninos.team.serve', 'ninos', 'equipo', 'equipo'),
  ('ninos', 'Facilitador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'Facilitador', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'Facilitador', 'ninos.team.serve', 'ninos', 'equipo', 'equipo'),
  ('ninos', 'Voluntario de Cámara', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('ninos', 'Voluntario de Cámara', 'ninos.team.serve', 'ninos', 'equipo', 'equipo'),
  ('ninos', 'Anfitrión', 'ninos.team.serve', 'ninos', 'equipo', 'equipo'),
  ('estudiantes', 'coordinador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'coordinador', 'dream_team.coordinate', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'coordinador', 'estudiantes.team.lead', 'estudiantes', 'equipo', 'equipo'),
  ('estudiantes', 'entrenador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'entrenador', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'entrenador', 'estudiantes.team.lead', 'estudiantes', 'equipo', 'equipo'),
  ('estudiantes', 'Líder', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'Líder', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'Líder', 'estudiantes.team.lead', 'estudiantes', 'equipo', 'equipo'),
  ('estudiantes', 'voluntario', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'voluntario', 'estudiantes.team.serve', 'estudiantes', 'equipo', 'equipo'),
  ('estudiantes', 'director', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'director', 'dream_team.direct', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'director', 'estudiantes.team.lead', 'estudiantes', 'equipo', 'equipo'),
  ('estudiantes', 'Líder de grupo', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'Líder de grupo', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'Líder de grupo', 'dream_team.gdv.lead', 'grupos_vida', 'grupo', 'rol'),
  ('estudiantes', 'Líder de grupo', 'estudiantes.team.lead', 'estudiantes', 'equipo', 'equipo'),
  ('estudiantes', 'Facilitador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'Facilitador', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'Facilitador', 'estudiantes.team.lead', 'estudiantes', 'equipo', 'equipo'),
  ('estudiantes', 'Voluntario de Cámara', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('estudiantes', 'Voluntario de Cámara', 'estudiantes.team.serve', 'estudiantes', 'equipo', 'equipo'),
  ('experiencia', 'coordinador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'coordinador', 'dream_team.coordinate', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'entrenador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'entrenador', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'Líder', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'Líder', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'voluntario', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'director', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'director', 'dream_team.direct', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'Líder de grupo', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'Líder de grupo', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'Líder de grupo', 'dream_team.gdv.lead', 'grupos_vida', 'grupo', 'rol'),
  ('experiencia', 'Facilitador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'Facilitador', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('experiencia', 'Voluntario de Cámara', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'coordinador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'coordinador', 'dream_team.coordinate', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'coordinador', 'dps.team.lead', 'dps', 'equipo', 'equipo'),
  ('dps', 'entrenador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'entrenador', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'entrenador', 'dps.team.lead', 'dps', 'equipo', 'equipo'),
  ('dps', 'Líder', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'Líder', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'Líder', 'dps.team.lead', 'dps', 'equipo', 'equipo'),
  ('dps', 'voluntario', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'voluntario', 'dps.team.serve', 'dps', 'equipo', 'equipo'),
  ('dps', 'director', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'director', 'dream_team.direct', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'director', 'dps.team.director', 'dps', 'equipo', 'equipo'),
  ('dps', 'Líder de grupo', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'Líder de grupo', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'Líder de grupo', 'dream_team.gdv.lead', 'grupos_vida', 'grupo', 'rol'),
  ('dps', 'Líder de grupo', 'dps.team.lead', 'dps', 'equipo', 'equipo'),
  ('dps', 'Facilitador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'Facilitador', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'Facilitador', 'dps.team.lead', 'dps', 'equipo', 'equipo'),
  ('dps', 'Voluntario de Cámara', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('dps', 'Voluntario de Cámara', 'dps.team.serve', 'dps', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'coordinador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'coordinador', 'dream_team.coordinate', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'coordinador', 'talleres_crecimiento.team.serve', 'talleres_crecimiento', 'taller', 'equipo'),
  ('talleres_crecimiento', 'entrenador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'entrenador', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'entrenador', 'talleres_crecimiento.team.serve', 'talleres_crecimiento', 'taller', 'equipo'),
  ('talleres_crecimiento', 'Líder', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'Líder', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'Líder', 'talleres_crecimiento.team.serve', 'talleres_crecimiento', 'taller', 'equipo'),
  ('talleres_crecimiento', 'voluntario', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'voluntario', 'talleres_crecimiento.team.serve', 'talleres_crecimiento', 'taller', 'equipo'),
  ('talleres_crecimiento', 'director', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'director', 'dream_team.direct', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'director', 'talleres_crecimiento.team.serve', 'talleres_crecimiento', 'taller', 'equipo'),
  ('talleres_crecimiento', 'Líder de grupo', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'Líder de grupo', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'Líder de grupo', 'dream_team.gdv.lead', 'grupos_vida', 'grupo', 'rol'),
  ('talleres_crecimiento', 'Líder de grupo', 'talleres_crecimiento.team.serve', 'talleres_crecimiento', 'taller', 'equipo'),
  ('talleres_crecimiento', 'Facilitador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'Facilitador', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'Facilitador', 'talleres_crecimiento.team.serve', 'talleres_crecimiento', 'taller', 'equipo'),
  ('talleres_crecimiento', 'Voluntario de Cámara', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('talleres_crecimiento', 'Voluntario de Cámara', 'talleres_crecimiento.team.serve', 'talleres_crecimiento', 'taller', 'equipo'),
  ('the_living_room', 'coordinador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'coordinador', 'dream_team.coordinate', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'coordinador', 'the_living_room.team.serve', 'the_living_room', 'experience', 'none'),
  ('the_living_room', 'entrenador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'entrenador', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'entrenador', 'the_living_room.team.serve', 'the_living_room', 'experience', 'none'),
  ('the_living_room', 'Líder', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'Líder', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'Líder', 'the_living_room.team.serve', 'the_living_room', 'experience', 'none'),
  ('the_living_room', 'voluntario', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'voluntario', 'the_living_room.team.serve', 'the_living_room', 'experience', 'none'),
  ('the_living_room', 'director', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'director', 'dream_team.direct', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'director', 'the_living_room.team.serve', 'the_living_room', 'experience', 'none'),
  ('the_living_room', 'Líder de grupo', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'Líder de grupo', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'Líder de grupo', 'dream_team.gdv.lead', 'grupos_vida', 'grupo', 'rol'),
  ('the_living_room', 'Líder de grupo', 'the_living_room.team.serve', 'the_living_room', 'experience', 'none'),
  ('the_living_room', 'Facilitador', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'Facilitador', 'dream_team.lead', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'Facilitador', 'the_living_room.team.serve', 'the_living_room', 'experience', 'none'),
  ('the_living_room', 'Voluntario de Cámara', 'dream_team.serve', 'dream_team', 'equipo', 'equipo'),
  ('the_living_room', 'Voluntario de Cámara', 'the_living_room.team.serve', 'the_living_room', 'experience', 'none')
-- grants-table:end
;

SELECT pg_temp.assert_eq('m: the SQL mirror of the role -> capability mapping matches the pinned table',
  $q$WITH pares AS (SELECT DISTINCT experiencia, rol FROM t_cv_grants_tabla),
          actual AS (
            SELECT p.experiencia, p.rol, g.capability_key, g.experience, g.scope_type,
                   CASE WHEN g.scope_id IS NULL THEN 'none'
                        WHEN g.scope_id = 'ca000000-0000-4000-8000-0000000000e1' THEN 'equipo'
                        WHEN g.scope_id = 'ca000000-0000-4000-8000-0000000000e2' THEN 'rol'
                        ELSE 'other:' || g.scope_id END AS alcance
              FROM pares p
             CROSS JOIN LATERAL public.dream_team_grants_de_servicio(
               'ca000000-0000-4000-8000-0000000000e1'::uuid, p.experiencia,
               'ca000000-0000-4000-8000-0000000000e2'::uuid, p.rol) g),
          diff AS (
            SELECT 'extra' AS lado, x.* FROM (SELECT * FROM actual EXCEPT ALL SELECT * FROM t_cv_grants_tabla) x
            UNION ALL
            SELECT 'missing', y.* FROM (SELECT * FROM t_cv_grants_tabla EXCEPT ALL SELECT * FROM actual) y)
     SELECT coalesce(string_agg(lado || ' ' || experiencia || '/' || rol || '/' || capability_key
                                || '/' || scope_type || '/' || alcance, '; '), '')
       FROM diff$q$,
  '');

SELECT pg_temp.assert_eq('m: the mirror maps an unknown role under an unknown experience to nothing',
  $q$SELECT count(*) FROM public.dream_team_grants_de_servicio(
       'ca000000-0000-4000-8000-0000000000e1'::uuid, 'experiencia',
       'ca000000-0000-4000-8000-0000000000e2'::uuid, 'Anfitrión')$q$,
  '0');

-- ── l. security ─────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('l: the loader is SECURITY INVOKER with its own search_path',
  $q$SELECT p.prosecdef::text || ',' || (p.proconfig IS NOT NULL AND EXISTS (
            SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))::text
       FROM pg_proc p
      WHERE p.oid = 'public.dream_team_cargar_voluntarios(text,jsonb,uuid,uuid,boolean)'::regprocedure$q$,
  'false,true');

SELECT pg_temp.assert_eq('l: no EXECUTE for PUBLIC, anon or authenticated on the four functions',
  $q$SELECT concat_ws(', ',
       (SELECT string_agg(f || ' ' || r, ', ' ORDER BY f, r)
          FROM unnest(ARRAY[
                 'public.dream_team_cargar_voluntarios(text,jsonb,uuid,uuid,boolean)',
                 'public.dream_team_grants_de_servicio(uuid,text,uuid,text)',
                 'public.dream_team_clave_nombre(text,text)',
                 'public.dream_team_normalizar_etiqueta(text)']) AS f
         CROSS JOIN unnest(ARRAY['anon', 'authenticated']) AS r
         WHERE has_function_privilege(r, f::regprocedure, 'EXECUTE')),
       (SELECT string_agg(p.oid::regprocedure::text || ' PUBLIC', ', ')
          FROM pg_proc p
         CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
         WHERE p.oid IN ('public.dream_team_cargar_voluntarios(text,jsonb,uuid,uuid,boolean)'::regprocedure,
                         'public.dream_team_grants_de_servicio(uuid,text,uuid,text)'::regprocedure,
                         'public.dream_team_clave_nombre(text,text)'::regprocedure,
                         'public.dream_team_normalizar_etiqueta(text)'::regprocedure)
           AND a.grantee = 0))$q$,
  '');

-- ── o. the name key ─────────────────────────────────────────────────

SELECT pg_temp.assert_eq('o: the name key ignores case, accents, hyphens, apostrophes and extra spaces',
  $q$SELECT concat_ws(' | ',
       public.dream_team_clave_nombre('  José-María ', 'O''Brien   PÉREZ'),
       public.dream_team_clave_nombre(U&'Jose\0301', U&'Nun\0303ez'),
       public.dream_team_clave_nombre(U&'Ana\00A0Lucía', E'Zzguion-Zzpaz\t'),
       public.dream_team_clave_nombre('Ana', NULL),
       public.dream_team_clave_nombre(NULL, NULL))$q$,
  'jose maria o brien perez | jose nunez | ana lucia zzguion zzpaz | ana | ');

-- ── n. argument checks ──────────────────────────────────────────────

SELECT pg_temp.assert_raises('n: an actor that is not a usuario is rejected',
  $q$SELECT * FROM public.dream_team_cargar_voluntarios('zz-carga-prueba', '[]'::jsonb,
       'ca000000-0000-4000-8000-000000000099', 'ca000000-0000-4000-8000-000000000016', false)$q$,
  '22023');

SELECT pg_temp.assert_raises('n: p_filas must be a JSON array',
  $q$SELECT * FROM public.dream_team_cargar_voluntarios('zz-carga-prueba', '{}'::jsonb,
       'ca000000-0000-4000-8000-000000000020', 'ca000000-0000-4000-8000-000000000016', false)$q$,
  '22023');

SELECT pg_temp.assert_raises('n: a missing campus is rejected',
  $q$SELECT * FROM public.dream_team_cargar_voluntarios('zz-carga-prueba', '[]'::jsonb,
       'ca000000-0000-4000-8000-000000000020', 'ca000000-0000-4000-8000-000000000099', false)$q$,
  '22023');

SELECT pg_temp.assert_raises('n: a blank fuente is rejected',
  $q$SELECT * FROM public.dream_team_cargar_voluntarios('  ', '[]'::jsonb,
       'ca000000-0000-4000-8000-000000000020', 'ca000000-0000-4000-8000-000000000016', false)$q$,
  '22023');

-- ── j. dry run ──────────────────────────────────────────────────────

SELECT pg_temp.huellas('antes');
SELECT pg_temp.cargar('t_cv_simulacro', false);
SELECT pg_temp.huellas('simulacro');

SELECT pg_temp.assert_eq('j: the dry run reports every row',
  $q$SELECT count(*) FROM t_cv_simulacro$q$, '36');

SELECT pg_temp.assert_eq('j: the dry run leaves every touched table unchanged',
  $q$SELECT pg_temp.tablas_cambiadas('antes', 'simulacro')$q$, '');

SELECT pg_temp.assert_eq('j: the dry run created no usuario',
  $q$SELECT count(*) FROM public.usuarios WHERE nombre IN ('Zznueva', 'Zznuevo')$q$, '0');

-- ── first apply ─────────────────────────────────────────────────────

SELECT pg_temp.cargar('t_cv_carga1', true);
SELECT pg_temp.huellas('carga1');

SELECT pg_temp.assert_eq('j: the dry run and the apply give the same report',
  $q$SELECT count(*) FROM (
       (SELECT fila, cedula, persona_accion, servicio_accion, detalle FROM t_cv_simulacro
        EXCEPT ALL
        SELECT fila, cedula, persona_accion, servicio_accion, detalle FROM t_cv_carga1)
       UNION ALL
       (SELECT fila, cedula, persona_accion, servicio_accion, detalle FROM t_cv_carga1
        EXCEPT ALL
        SELECT fila, cedula, persona_accion, servicio_accion, detalle FROM t_cv_simulacro)) d$q$,
  '0');

-- ── a. every action, row by row ─────────────────────────────────────

SELECT pg_temp.assert_eq('a: persona_accion and servicio_accion per row',
  $q$SELECT string_agg(fila || ':' || persona_accion || '/' || servicio_accion, ' ' ORDER BY fila)
       FROM t_cv_carga1$q$,
  '1:existente/creado 2:revisar/omitido 3:existente_por_nombre/creado 4:revisar/omitido '
  || '5:revisar/omitido 6:creada/creado 7:existente/creado 8:creada/creado 9:existente/existente '
  || '10:existente/creado 11:existente/creado 12:existente/existente 13:error/error 14:error/error '
  || '15:error/omitido 16:error/error 17:existente/creado 18:conflicto/omitido 19:revisar/omitido '
  || '20:revisar/omitido 21:existente/creado 22:existente/creado 23:revisar/omitido 24:existente/creado '
  || '25:revisar/omitido 26:revisar/omitido 27:creada/creado 28:revisar/omitido 29:creada/creado '
  || '30:revisar/omitido 31:revisar/omitido 32:revisar/omitido 33:existente/creado 34:revisar/omitido '
  || '35:revisar/omitido 36:existente_por_nombre/creado');

SELECT pg_temp.assert_eq('a: the report gives the normalized cedula',
  $q$SELECT string_agg(fila || ':' || coalesce(cedula, '-'), ' ' ORDER BY fila)
       FROM t_cv_carga1 WHERE fila IN (1, 3, 8, 16, 35)$q$,
  '1:E99900001 3:- 8:E99900008 16:E99900016 35:E99900060');

SELECT pg_temp.assert_eq('a: persona_id of the resolved rows',
  $q$SELECT string_agg(fila || ':' || coalesce(right(persona_id::text, 2), '-'), ' ' ORDER BY fila)
       FROM t_cv_carga1
      WHERE fila IN (1, 2, 3, 4, 5, 7, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
                     28, 30, 31, 32, 33, 34, 35, 36)$q$,
  '1:21 2:22 3:23 4:- 5:- 7:26 11:27 12:27 13:- 15:- 16:- 17:28 18:40 19:41 20:42 21:43 22:44 23:45 '
  || '24:46 25:- 26:- 28:- 30:- 31:- 32:- 33:51 34:- 35:- 36:53');

SELECT pg_temp.assert_eq('a: rows 8, 9 and 10 are the same new person',
  $q$SELECT count(DISTINCT persona_id)::text || ',' || bool_and(persona_id IS NOT NULL)::text
       FROM t_cv_carga1 WHERE fila IN (8, 9, 10)$q$,
  '1,true');

SELECT pg_temp.assert_eq('a: row 12 reports the servicio that was already there',
  $q$SELECT servicio_id::text FROM t_cv_carga1 WHERE fila = 12$q$,
  'ca000000-0000-4000-8000-000000000031');

SELECT pg_temp.assert_eq('a: omitted and failed rows report no servicio',
  $q$SELECT count(*) FROM t_cv_carga1
      WHERE servicio_accion IN ('omitido', 'error') AND servicio_id IS NOT NULL$q$,
  '0');

SELECT pg_temp.assert_eq('a: detalle of the rows that explain themselves',
  $q$SELECT string_agg(fila || '=' || coalesce(detalle, '-'), ' | ' ORDER BY fila)
       FROM t_cv_carga1
      WHERE fila IN (1, 2, 3, 4, 5, 7, 8, 9, 11, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
                     27, 28, 29, 30, 31, 32, 33, 34, 35, 36)$q$,
  '1=se completó: fecha_nacimiento, bautizado, fecha_bautizo, redes_sociales'
  || ' | 2=la cédula es de "Zzotro Diferente" y la fila dice "Zzcarga Nadie";'
  || ' si es la misma persona, indicar persona_id'
  || ' | 3=-'
  || ' | 4=sin cédula ni fecha de nacimiento; 2 persona(s) del mismo nombre:'
  || ' ca000000-0000-4000-8000-000000000024 (sin fecha), ca000000-0000-4000-8000-000000000025 (sin fecha);'
  || ' indicar persona_id o crear_sin_cedula = true'
  || ' | 5=sin cédula y sin nadie del mismo nombre; indicar persona_id o crear_sin_cedula = true'
  || ' | 7=persona_id indicado en la fila; en la base: "Zzoverride Destino"'
  || ' | 8=fecha_bautizo ignorada: bautizado = false'
  || ' | 9=-'
  || ' | 11=ya sirve en este equipo como voluntario'
  || ' | 13=no existe el equipo "ZZ No Existe" en la ruta'
  || ' | 14=el equipo "ZZ Carga Sala" no tiene el rol activo "animador"'
  || ' | 15=persona_id ca000000-0000-4000-8000-000000000099 no existe'
  || ' | 17=fecha_bautizo no se completó: bautizado = false'
  || ' | 18=la cédula es de "Zzpadre Zzfam" (nacimiento 1970-01-01) y la fila dice "Zzhija Zzfam" (nacimiento 2010-05-05)'
  || ' | 19=menor con la cédula de "Zzmadre Zzotrafam"; confirmar con persona_id'
  || ' | 20=menor con la cédula de "Zzjunior Zzigual"; confirmar con persona_id'
  || ' | 21=en la base: "Zzrosa De Zzleon"; se completó: talla_franela'
  || ' | 22=se completó: fecha_nacimiento, telefono'
  || ' | 23=la cédula es de "Zzunico Zzapellido" y la fila dice "Zzunico";'
  || ' si es la misma persona, indicar persona_id'
  || ' | 24=bautizado no se completó: ya tiene fecha_bautizo; se completó: telefono'
  || ' | 25=sin cédula; 1 persona(s) del mismo nombre, ninguna con nacimiento 2001-01-01:'
  || ' ca000000-0000-4000-8000-000000000023 (nacimiento 2000-01-02);'
  || ' indicar persona_id o crear_sin_cedula = true'
  || ' | 26=sin cédula; 2 persona(s) del mismo nombre, ninguna con nacimiento 1999-09-09:'
  || ' ca000000-0000-4000-8000-000000000024 (sin fecha), ca000000-0000-4000-8000-000000000025 (sin fecha);'
  || ' indicar persona_id o crear_sin_cedula = true'
  || ' | 27=ojo: 2 persona(s) con el mismo nombre:'
  || ' ca000000-0000-4000-8000-000000000024 (sin fecha), ca000000-0000-4000-8000-000000000025 (sin fecha)'
  || ' | 28=sin cédula ni fecha de nacimiento; 1 persona(s) del mismo nombre:'
  || ' ca000000-0000-4000-8000-000000000047 (sin fecha); indicar persona_id o crear_sin_cedula = true'
  || ' | 29=ojo: 1 persona(s) con el mismo nombre: ca000000-0000-4000-8000-000000000047 (sin fecha)'
  || ' | 30=sin cédula; 3 persona(s) del mismo nombre, 2 con nacimiento 2002-02-02:'
  || ' ca000000-0000-4000-8000-000000000048 (nacimiento 2002-02-02),'
  || ' ca000000-0000-4000-8000-000000000049 (nacimiento 2002-02-02),'
  || ' ca000000-0000-4000-8000-000000000050 (sin fecha); indicar persona_id o crear_sin_cedula = true'
  || ' | 31=la cédula aparece en las filas 32 con nombres distintos; indicar persona_id o corregir la cédula'
  || ' | 32=la cédula aparece en las filas 31, 33 con nombres distintos; indicar persona_id o corregir la cédula'
  || ' | 33=persona_id indicado en la fila; en la base: "Zzdoce Zzblanco"'
  || ' | 34=la cédula aparece en las filas 35 con nombres distintos; indicar persona_id o corregir la cédula'
  || ' | 35=la cédula aparece en las filas 34 con nombres distintos; indicar persona_id o corregir la cédula'
  || ' | 36=-');

SELECT pg_temp.assert_eq('a: a row that fails mid-way reports the database error',
  $q$SELECT detalle FROM t_cv_carga1 WHERE fila = 16$q$,
  'error 22P02: invalid input value for enum public.enum_genero: "X"');

-- ── b. the strict person rules ─────────────────────────────────────

SELECT pg_temp.assert_eq('b: a cedula under another name wrote nothing for its holder',
  $q$SELECT (SELECT count(*) FROM public.dream_team_servicios
              WHERE persona_id = 'ca000000-0000-4000-8000-000000000022')::text || ',' ||
            (SELECT count(*) FROM public.persona_datos_importados
              WHERE persona_id = 'ca000000-0000-4000-8000-000000000022')::text || ',' ||
            (SELECT nombre || ' ' || apellido FROM public.usuarios
              WHERE id = 'ca000000-0000-4000-8000-000000000022')$q$,
  '0,0,Zzotro Diferente');

-- A minor listed with a parent's cedula, under another name or the very same
-- one, must not hand the parent the servicio, the ninos grants or the child's
-- birth date, phone, size and social; nor may it land on the child's own
-- record by name (54). Nor may a cedula row with a blank apellido (45), a row
-- without cedula or birth date (47), or a birth date that several namesakes
-- share (48, 49, 50).
SELECT pg_temp.assert_eq('b: a parent''s cedula, a junior, another name key or a namesake wrote nothing',
  $q$SELECT string_agg(concat_ws('|', right(u.id::text, 2),
              coalesce(u.fecha_nacimiento::text, '-'), coalesce(u.telefono, '-'),
              coalesce(u.talla_franela, '-'), coalesce(u.redes_sociales, '-'),
              (SELECT count(*) FROM public.dream_team_servicios s WHERE s.persona_id = u.id),
              (SELECT count(*) FROM public.persona_datos_importados d WHERE d.persona_id = u.id),
              (SELECT count(*) FROM public.dream_team_capability_grants g WHERE g.persona_id = u.id)),
            ' ' ORDER BY u.id)
       FROM public.usuarios u
      WHERE u.id IN ('ca000000-0000-4000-8000-000000000040', 'ca000000-0000-4000-8000-000000000041',
                     'ca000000-0000-4000-8000-000000000042', 'ca000000-0000-4000-8000-000000000045',
                     'ca000000-0000-4000-8000-000000000047', 'ca000000-0000-4000-8000-000000000048',
                     'ca000000-0000-4000-8000-000000000049', 'ca000000-0000-4000-8000-000000000050',
                     'ca000000-0000-4000-8000-000000000054')$q$,
  '40|1970-01-01|-|-|-|0|0|0 41|-|-|-|-|0|0|0 42|-|-|-|-|0|0|0 45|-|-|-|-|0|0|0 '
  || '47|-|-|-|-|0|0|0 48|2002-02-02|-|-|-|0|0|0 49|2002-02-02|-|-|-|0|0|0 50|-|-|-|-|0|0|0 '
  || '54|-|-|-|-|0|0|0');

SELECT pg_temp.assert_eq('b: a cedula under two names in the payload is left for review; with persona_id it loads',
  $q$SELECT concat_ws('|', coalesce(u.telefono, '-'),
                       (SELECT string_agg(e.label || '/' || r.label, ',' ORDER BY e.label)
                          FROM public.dream_team_servicios s
                          JOIN public.dream_team_equipos e ON e.id = s.equipo_id
                          JOIN public.dream_team_roles r ON r.id = s.rol_id
                         WHERE s.persona_id = u.id))
       FROM public.usuarios u WHERE u.id = 'ca000000-0000-4000-8000-000000000051'$q$,
  '-|ZZ Carga Montaje/voluntario');

SELECT pg_temp.assert_eq('b: the same birth date links another spelling to the stored person',
  $q$SELECT concat_ws('|', u.fecha_nacimiento, coalesce(u.talla_franela, '-'),
                       (SELECT string_agg(e.label || '/' || r.label, ',')
                          FROM public.dream_team_servicios s
                          JOIN public.dream_team_equipos e ON e.id = s.equipo_id
                          JOIN public.dream_team_roles r ON r.id = s.rol_id
                         WHERE s.persona_id = u.id AND s.estado = 'activo'))
       FROM public.usuarios u WHERE u.id = 'ca000000-0000-4000-8000-000000000043'$q$,
  '1985-03-03|M|ZZ Carga Montaje/voluntario');

SELECT pg_temp.assert_eq('b: an adult with the same name key links when the stored birth date is unknown',
  $q$SELECT concat_ws('|', u.fecha_nacimiento, u.telefono,
                       (SELECT string_agg(e.label || '/' || r.label, ',')
                          FROM public.dream_team_servicios s
                          JOIN public.dream_team_equipos e ON e.id = s.equipo_id
                          JOIN public.dream_team_roles r ON r.id = s.rol_id
                         WHERE s.persona_id = u.id AND s.estado = 'activo'))
       FROM public.usuarios u WHERE u.id = 'ca000000-0000-4000-8000-000000000044'$q$,
  '1980-08-08|04120000022|ZZ Carga Sala/voluntario');

-- ── c. fill-only-null ───────────────────────────────────────────────

SELECT pg_temp.assert_eq('c: an existing person gets only its empty columns filled',
  $q$SELECT concat_ws('|', nombre, apellido, cedula, telefono, talla_franela, fecha_nacimiento,
                       bautizado, fecha_bautizo, redes_sociales, genero, estado_civil)
       FROM public.usuarios WHERE id = 'ca000000-0000-4000-8000-000000000021'$q$,
  'Zzcarga|Existente|E99900001|04140000001|M|1990-05-06|t|2010-01-01|@zzcarga|Femenino|Soltero');

SELECT pg_temp.assert_eq('c: a fecha_bautizo is not filled for someone not baptized',
  $q$SELECT coalesce(bautizado::text, 'NULL') || ',' || coalesce(fecha_bautizo::text, 'NULL')
       FROM public.usuarios WHERE id = 'ca000000-0000-4000-8000-000000000028'$q$,
  'false,NULL');

SELECT pg_temp.assert_eq('c: bautizado = false is not filled over a stored fecha_bautizo; the row still loads',
  $q$SELECT concat_ws('|', coalesce(u.bautizado::text, 'NULL'), u.fecha_bautizo, u.telefono,
                       (SELECT count(*) FROM public.dream_team_servicios s
                         WHERE s.persona_id = u.id AND s.estado = 'activo'))
       FROM public.usuarios u WHERE u.id = 'ca000000-0000-4000-8000-000000000046'$q$,
  'NULL|2005-05-05|04120000024|1');

SELECT pg_temp.assert_eq('c: a person matched by name and an override target keep their data',
  $q$SELECT string_agg(concat_ws('|', nombre, apellido, coalesce(cedula, '-'), coalesce(fecha_nacimiento::text, '-')),
                       ' ' ORDER BY id)
       FROM public.usuarios
      WHERE id IN ('ca000000-0000-4000-8000-000000000023', 'ca000000-0000-4000-8000-000000000026')$q$,
  'Zzsolo|Nombrado|-|2000-01-02 Zzoverride|Destino|-|-');

-- ── d. / f. new persons ─────────────────────────────────────────────

SELECT pg_temp.assert_eq('f: crear_sin_cedula creates a person with no cedula and no account',
  $q$SELECT concat_ws('|', coalesce(u.cedula, '-'), u.genero, u.estado_civil, coalesce(u.auth_id::text, '-'))
       FROM public.usuarios u WHERE u.nombre = 'Zznuevo' AND u.apellido = 'Sincedula'$q$,
  '-|Masculino|Casado|-');

SELECT pg_temp.assert_eq('f: the new person by cedula keeps the normalized cedula and the clean columns',
  $q$SELECT concat_ws('|', u.cedula, u.genero, u.estado_civil, u.fecha_nacimiento, u.telefono,
                       u.talla_franela, u.bautizado, coalesce(u.fecha_bautizo::text, 'NULL'),
                       coalesce(u.auth_id::text, '-'))
       FROM public.usuarios u WHERE u.nombre = 'Zznueva' AND u.apellido = 'Persona'$q$,
  'E99900008|Femenino|Soltero|2012-04-05|04121234567|XL|f|NULL|-');

SELECT pg_temp.assert_eq('f: a new person whose row says bautizado false with a fecha_bautizo is created without it',
  $q$SELECT concat_ws('|', c.persona_accion, c.servicio_accion, c.detalle,
                       coalesce(u.bautizado::text, 'NULL'), coalesce(u.fecha_bautizo::text, 'NULL'))
       FROM t_cv_carga1 c JOIN public.usuarios u ON u.id = c.persona_id
      WHERE c.fila = 8$q$,
  'creada|creado|fecha_bautizo ignorada: bautizado = false|false|NULL');

SELECT pg_temp.assert_eq('f: every new person is a miembro with the principal campus',
  $q$SELECT string_agg(u.nombre || ':' ||
            (SELECT count(*) FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
              WHERE ur.usuario_id = u.id AND rs.nombre_interno = 'miembro')::text || ':' ||
            (SELECT string_agg(uc.campus_id::text || '/' || uc.es_campus_principal::text, ',')
               FROM public.usuario_campus uc WHERE uc.usuario_id = u.id),
            ' ' ORDER BY u.nombre)
       FROM public.usuarios u WHERE u.nombre IN ('Zznueva', 'Zznuevo')$q$,
  'Zznueva:1:ca000000-0000-4000-8000-000000000016/true Zznuevo:1:ca000000-0000-4000-8000-000000000016/true');

SELECT pg_temp.assert_eq('d: rows left for review and failed rows created nobody',
  $q$SELECT count(*) FROM public.usuarios
      WHERE (nombre = 'Zznadie' AND apellido = 'Sincedula') OR cedula IN ('E99900016', 'E99900060')
         OR nombre IN ('Zzfantasma', 'Cualquiera', 'Zzclash')$q$,
  '0');

SELECT pg_temp.assert_eq('d: a hyphenated name finds its namesake spelled with spaces, and the reverse',
  $q$SELECT concat_ws('|', c.persona_accion, right(c.persona_id::text, 2),
                       (SELECT string_agg(e.label || '/' || r.label, ',')
                          FROM public.dream_team_servicios s
                          JOIN public.dream_team_equipos e ON e.id = s.equipo_id
                          JOIN public.dream_team_roles r ON r.id = s.rol_id
                         WHERE s.persona_id = c.persona_id))
       FROM t_cv_carga1 c WHERE c.fila = 36$q$,
  'existente_por_nombre|53|ZZ Carga Montaje/voluntario');

SELECT pg_temp.assert_eq('d: the persona_id override puts the servicio on that person',
  $q$SELECT count(*) FROM public.dream_team_servicios
      WHERE persona_id = 'ca000000-0000-4000-8000-000000000026'
        AND equipo_id = 'ca000000-0000-4000-8000-000000000004'
        AND rol_id = 'ca000000-0000-4000-8000-000000000014' AND estado = 'activo'$q$,
  '1');

SELECT pg_temp.assert_eq('d: crear_sin_cedula creates a new person even when namesakes exist',
  $q$SELECT string_agg(c.fila || ':' || n.nombre || ' ' || n.apellido || '=' || n.personas
                       || ',' || (c.persona_id NOT IN (
                            'ca000000-0000-4000-8000-000000000024', 'ca000000-0000-4000-8000-000000000025',
                            'ca000000-0000-4000-8000-000000000047'))::text,
                       ' ' ORDER BY c.fila)
       FROM t_cv_carga1 c
       JOIN public.usuarios u ON u.id = c.persona_id
      CROSS JOIN LATERAL (SELECT u.nombre, u.apellido, count(*) AS personas
                            FROM public.usuarios x
                           WHERE x.nombre = u.nombre AND x.apellido = u.apellido) n
      WHERE c.fila IN (27, 29)$q$,
  '27:Zzdoble Gemelo=3,true 29:Zznueve Sinfecha=2,true');

-- ── e. duplicates and two sub-areas ─────────────────────────────────

SELECT pg_temp.assert_eq('e: the duplicate row added no second servicio; the other sub-area did',
  $q$SELECT string_agg(e.label || '/' || r.label, ', ' ORDER BY e.label)
       FROM public.dream_team_servicios s
       JOIN public.dream_team_equipos e ON e.id = s.equipo_id
       JOIN public.dream_team_roles r ON r.id = s.rol_id
       JOIN public.usuarios u ON u.id = s.persona_id
      WHERE u.cedula = 'E99900008'$q$,
  'ZZ Carga Montaje/voluntario, ZZ Carga Sala/voluntario');

SELECT pg_temp.assert_eq('e: a person with another rol in the equipo gets the new servicio too',
  $q$SELECT string_agg(r.label || '/' || s.estado, ', ' ORDER BY r.label)
       FROM public.dream_team_servicios s JOIN public.dream_team_roles r ON r.id = s.rol_id
      WHERE s.persona_id = 'ca000000-0000-4000-8000-000000000027'$q$,
  'coordinador/activo, voluntario/activo');

-- ── g. persona_datos_importados ─────────────────────────────────────

SELECT pg_temp.assert_eq('g: extras are kept per persona and fuente, under their fila',
  $q$SELECT d.datos::text FROM public.persona_datos_importados d
      WHERE d.persona_id = 'ca000000-0000-4000-8000-000000000021' AND d.fuente = 'zz-carga-prueba'$q$,
  '{"filas": {"1": {"gdv": "ZZ grupo", "seccion": "Sala"}}}');

SELECT pg_temp.assert_eq('g: a person on several rows keeps the extras of every row, each under its fila',
  $q$SELECT d.datos::text FROM public.persona_datos_importados d
       JOIN public.usuarios u ON u.id = d.persona_id
      WHERE u.cedula = 'E99900008' AND d.fuente = 'zz-carga-prueba'$q$,
  '{"filas": {"8": {"seccion": "Sala"}, "9": {"dones": "servicio", "seccion": "Sala"}, '
  || '"10": {"seccion": "Montaje"}}}');

SELECT pg_temp.assert_eq('g: a resolved row without extras keeps an empty entry for its fila',
  $q$SELECT string_agg(right(d.persona_id::text, 2) || '=' || d.datos::text, ' ' ORDER BY d.persona_id)
       FROM public.persona_datos_importados d
      WHERE d.persona_id IN ('ca000000-0000-4000-8000-000000000023', 'ca000000-0000-4000-8000-000000000026')$q$,
  '23={"filas": {"3": {}}} 26={"filas": {"7": {}}}');

-- ── h. the new servicio ─────────────────────────────────────────────

SELECT pg_temp.assert_eq('h: the servicio is activo, admin_asignacion, version 1, from the row fecha_inicio',
  $q$SELECT concat_ws('|', s.estado, s.motivo_actual, s.version,
                       (s.fecha_inicio AT TIME ZONE 'America/Caracas')::date, coalesce(s.fecha_fin::text, '-'))
       FROM public.dream_team_servicios s
      WHERE s.id = (SELECT servicio_id FROM t_cv_carga1 WHERE fila = 1)$q$,
  'activo|admin_asignacion|1|2024-03-10|-');

SELECT pg_temp.assert_eq('h: without fecha_inicio the servicio starts at the load',
  $q$SELECT (s.fecha_inicio = now())::text FROM public.dream_team_servicios s
      WHERE s.id = (SELECT servicio_id FROM t_cv_carga1 WHERE fila = 3)$q$,
  'true');

SELECT pg_temp.assert_eq('h: one history row, signed by the actor',
  $q$SELECT string_agg(concat_ws('|', h.estado_anterior, h.estado_nuevo, h.motivo, h.actor_persona_id,
                                 h.detalle_motivo, (h.paused_grants_snapshot IS NULL)), ' ')
       FROM public.dream_team_estados_historial h
      WHERE h.servicio_id = (SELECT servicio_id FROM t_cv_carga1 WHERE fila = 1)$q$,
  'activo|activo|admin_asignacion|ca000000-0000-4000-8000-000000000020|Carga inicial: zz-carga-prueba|t');

SELECT pg_temp.assert_eq('h: every created servicio has exactly one history row',
  $q$SELECT count(*) FROM t_cv_carga1 c
      WHERE c.servicio_accion = 'creado'
        AND (SELECT count(*) FROM public.dream_team_estados_historial h WHERE h.servicio_id = c.servicio_id) <> 1$q$,
  '0');

SELECT pg_temp.assert_eq('h: one pending verificacion per requisito of the rol',
  $q$SELECT (SELECT string_agg(v.requisito_id::text || '/' || v.estado, ',')
               FROM public.dream_team_requisitos_verificacion v
              WHERE v.servicio_id = (SELECT servicio_id FROM t_cv_carga1 WHERE fila = 1)) || ';' ||
            (SELECT count(*) FROM public.dream_team_requisitos_verificacion v
              WHERE v.servicio_id = (SELECT servicio_id FROM t_cv_carga1 WHERE fila = 3))::text$q$,
  'ca000000-0000-4000-8000-000000000015/pendiente;0');

-- ── i. grants under a ninos equipo ──────────────────────────────────

SELECT pg_temp.assert_eq('i: voluntario, entrenador and coordinador get their capabilities on the sub-area',
  $q$SELECT string_agg(quien || '=' || caps, ' ' ORDER BY quien)
       FROM (SELECT CASE WHEN g.persona_id = 'ca000000-0000-4000-8000-000000000021' THEN 'voluntario'
                         WHEN g.persona_id = 'ca000000-0000-4000-8000-000000000023' THEN 'entrenador'
                         ELSE 'coordinador' END AS quien,
                    string_agg(concat_ws('/', g.capability_key, g.experience, g.scope_type,
                                         right(g.scope_id, 2), (g.revoked_at IS NULL)),
                               ',' ORDER BY g.capability_key) AS caps
               FROM public.dream_team_capability_grants g
              WHERE g.source = 'dream-team-servicio'
                AND g.persona_id IN (
                      'ca000000-0000-4000-8000-000000000021', 'ca000000-0000-4000-8000-000000000023',
                      (SELECT id FROM public.usuarios WHERE nombre = 'Zznuevo' AND apellido = 'Sincedula'))
              GROUP BY 1) x$q$,
  'coordinador=dream_team.coordinate/dream_team/equipo/03/t,dream_team.serve/dream_team/equipo/03/t,ninos.team.serve/ninos/equipo/03/t'
  || ' entrenador=dream_team.lead/dream_team/equipo/03/t,dream_team.serve/dream_team/equipo/03/t,ninos.team.serve/ninos/equipo/03/t'
  || ' voluntario=dream_team.serve/dream_team/equipo/03/t,ninos.team.serve/ninos/equipo/03/t');

SELECT pg_temp.assert_eq('i: no grants for rows that did not create a servicio',
  $q$SELECT count(*) FROM public.dream_team_capability_grants g
      WHERE g.source = 'dream-team-servicio'
        AND g.persona_id IN ('ca000000-0000-4000-8000-000000000022', 'ca000000-0000-4000-8000-000000000024',
                             'ca000000-0000-4000-8000-000000000025', 'ca000000-0000-4000-8000-000000000040',
                             'ca000000-0000-4000-8000-000000000041', 'ca000000-0000-4000-8000-000000000042',
                             'ca000000-0000-4000-8000-000000000054')$q$,
  '0');

-- ── k. idempotence ──────────────────────────────────────────────────

-- The same payload again, crear_sin_cedula rows included: every fila resolved
-- by the first apply goes back to its person through its entry.
SELECT pg_temp.cargar('t_cv_carga2', true);
SELECT pg_temp.huellas('carga2');

SELECT pg_temp.assert_eq('k: a second apply creates nothing',
  $q$SELECT string_agg(fila || ':' || persona_accion || '/' || servicio_accion, ' ' ORDER BY fila)
       FROM t_cv_carga2$q$,
  '1:existente/existente 2:revisar/omitido 3:existente/existente 4:revisar/omitido '
  || '5:revisar/omitido 6:existente/existente 7:existente/existente 8:existente/existente '
  || '9:existente/existente 10:existente/existente 11:existente/existente 12:existente/existente '
  || '13:error/error 14:error/error 15:error/omitido 16:error/error 17:existente/existente '
  || '18:conflicto/omitido 19:revisar/omitido 20:revisar/omitido 21:existente/existente '
  || '22:existente/existente 23:revisar/omitido 24:existente/existente 25:revisar/omitido '
  || '26:revisar/omitido 27:existente/existente 28:revisar/omitido 29:existente/existente '
  || '30:revisar/omitido 31:revisar/omitido 32:revisar/omitido 33:existente/existente '
  || '34:revisar/omitido 35:revisar/omitido 36:existente/existente');

SELECT pg_temp.assert_eq('k: a second apply changes no table',
  $q$SELECT pg_temp.tablas_cambiadas('carga1', 'carga2')$q$, '');

SELECT pg_temp.assert_eq('k: the second apply reports the same persons and servicios as the first',
  $q$SELECT count(*) FROM t_cv_carga1 a JOIN t_cv_carga2 b USING (fila)
      WHERE a.persona_id IS DISTINCT FROM b.persona_id
         OR (a.servicio_id IS NOT NULL AND a.servicio_id IS DISTINCT FROM b.servicio_id)$q$,
  '0');

SELECT pg_temp.assert_eq('k: the second apply says the fila was resolved before, crear_sin_cedula included',
  $q$SELECT string_agg(fila || '=' || coalesce(detalle, '-'), ' | ' ORDER BY fila)
       FROM t_cv_carga2 WHERE fila IN (3, 6, 21, 27, 29, 36)$q$,
  '3=ya resuelta en una carga anterior | 6=ya resuelta en una carga anterior'
  || ' | 21=ya resuelta en una carga anterior; en la base: "Zzrosa De Zzleon"'
  || ' | 27=ya resuelta en una carga anterior | 29=ya resuelta en una carga anterior'
  || ' | 36=ya resuelta en una carga anterior');

-- A corrected re-run: the spreadsheet fixed row 9's extras (array index 8).
UPDATE t_cv_payload SET filas = jsonb_set(filas, '{8,extras}', '{"dones": "enseñanza"}');

SELECT pg_temp.cargar('t_cv_carga3', true);
SELECT pg_temp.huellas('carga3');

SELECT pg_temp.assert_eq('g: a corrected re-run replaces that fila''s extras and keeps the other filas',
  $q$SELECT d.datos::text FROM public.persona_datos_importados d
       JOIN public.usuarios u ON u.id = d.persona_id
      WHERE u.cedula = 'E99900008' AND d.fuente = 'zz-carga-prueba'$q$,
  '{"filas": {"8": {"seccion": "Sala"}, "9": {"dones": "enseñanza"}, "10": {"seccion": "Montaje"}}}');

SELECT pg_temp.assert_eq('k: a corrected re-run changes only persona_datos_importados',
  $q$SELECT pg_temp.tablas_cambiadas('carga2', 'carga3')$q$, 'persona_datos_importados');

SELECT pg_temp.assert_eq('k: a corrected re-run reports the same actions as the second apply',
  $q$SELECT count(*) FROM t_cv_carga2 a JOIN t_cv_carga3 b USING (fila)
      WHERE (a.persona_accion, a.servicio_accion, a.persona_id, a.servicio_id)
            IS DISTINCT FROM (b.persona_accion, b.servicio_accion, b.persona_id, b.servicio_id)$q$,
  '0');

SELECT pg_temp.assert_eq('g: a corrected re-run leaves the other persons'' extras as they were',
  $q$SELECT d.datos::text FROM public.persona_datos_importados d
      WHERE d.persona_id = 'ca000000-0000-4000-8000-000000000021' AND d.fuente = 'zz-carga-prueba'$q$,
  '{"filas": {"1": {"gdv": "ZZ grupo", "seccion": "Sala"}}}');

-- A re-run where row 9's extras are now empty and row 10's are missing
-- (array indexes 8 and 9): their entries are emptied, row 8's stays.
UPDATE t_cv_payload SET filas = jsonb_set(jsonb_set(filas, '{8,extras}', '{}'), '{9}', (filas -> 9) - 'extras');

SELECT pg_temp.cargar('t_cv_carga4', true);
SELECT pg_temp.huellas('carga4');

SELECT pg_temp.assert_eq('g: a re-run with empty or missing extras empties those filas'' entries',
  $q$SELECT d.datos::text FROM public.persona_datos_importados d
       JOIN public.usuarios u ON u.id = d.persona_id
      WHERE u.cedula = 'E99900008' AND d.fuente = 'zz-carga-prueba'$q$,
  '{"filas": {"8": {"seccion": "Sala"}, "9": {}, "10": {}}}');

SELECT pg_temp.assert_eq('k: a re-run that only drops extras changes only persona_datos_importados',
  $q$SELECT pg_temp.tablas_cambiadas('carga3', 'carga4')$q$, 'persona_datos_importados');

-- The same payload again: the datos row must not be written at all, which the
-- table fingerprints cannot see (now() is the same in one transaction), so
-- compare the row version (ctid and xmin) too.
CREATE TEMP TABLE t_cv_version ON COMMIT DROP AS
  SELECT d.ctid::text || '/' || d.xmin::text AS version
    FROM public.persona_datos_importados d
    JOIN public.usuarios u ON u.id = d.persona_id
   WHERE u.cedula = 'E99900008' AND d.fuente = 'zz-carga-prueba';

SELECT pg_temp.cargar('t_cv_carga5', true);
SELECT pg_temp.huellas('carga5');

SELECT pg_temp.assert_eq('g: an identical re-run without extras does not touch the datos row',
  $q$SELECT (d.ctid::text || '/' || d.xmin::text = (SELECT version FROM t_cv_version))::text
       FROM public.persona_datos_importados d
       JOIN public.usuarios u ON u.id = d.persona_id
      WHERE u.cedula = 'E99900008' AND d.fuente = 'zz-carga-prueba'$q$,
  'true');

SELECT pg_temp.assert_eq('k: an identical re-run without extras changes no table',
  $q$SELECT pg_temp.tablas_cambiadas('carga4', 'carga5')$q$, '');

-- Row 6 alone, still saying crear_sin_cedula: it finds the person the first
-- apply created and creates no other.
UPDATE t_cv_payload SET filas = jsonb_build_array(filas -> 5);

SELECT pg_temp.cargar('t_cv_carga6', true);

SELECT pg_temp.assert_eq('k: a re-run that keeps crear_sin_cedula finds the person it created and creates no other',
  $q$SELECT string_agg(c.fila || ':' || c.persona_accion || '/' || c.servicio_accion || ' '
                       || coalesce(c.detalle, '-') || ' ' || (c.persona_id = a.persona_id)::text || ' '
                       || (SELECT count(*) FROM public.usuarios u
                            WHERE u.nombre = 'Zznuevo' AND u.apellido = 'Sincedula'), ' | ')
       FROM t_cv_carga6 c JOIN t_cv_carga1 a USING (fila)$q$,
  '6:existente/existente ya resuelta en una carga anterior true 1');

-- Row 19 (a child on her mother's cedula, revisar) settled with persona_id on
-- the child's own record, then loaded again without it: the fila keeps that
-- person and the mother is never touched.
UPDATE t_cv_payload
   SET filas = jsonb_build_array((SELECT p.filas -> 18 FROM t_cv_payload0 p)
                                 || '{"persona_id": "ca000000-0000-4000-8000-000000000054"}'::jsonb);

SELECT pg_temp.cargar('t_cv_carga7', true);

UPDATE t_cv_payload SET filas = jsonb_build_array((SELECT p.filas -> 18 FROM t_cv_payload0 p));

SELECT pg_temp.cargar('t_cv_carga8', true);

SELECT pg_temp.assert_eq('k: a revisar row settled with persona_id keeps its person on a re-run without it',
  $q$SELECT concat_ws(' | ',
       (SELECT string_agg(concat_ws(' ', fila || ':' || persona_accion || '/' || servicio_accion,
                                    right(persona_id::text, 2), detalle), ', ')
          FROM t_cv_carga7),
       (SELECT string_agg(concat_ws(' ', fila || ':' || persona_accion || '/' || servicio_accion,
                                    right(persona_id::text, 2), detalle), ', ')
          FROM t_cv_carga8),
       (SELECT concat_ws('/', u.fecha_nacimiento, u.telefono, u.redes_sociales,
                         (SELECT count(*) FROM public.dream_team_servicios s WHERE s.persona_id = u.id))
          FROM public.usuarios u WHERE u.id = 'ca000000-0000-4000-8000-000000000054'),
       (SELECT concat_ws('/', coalesce(u.fecha_nacimiento::text, '-'), coalesce(u.telefono, '-'),
                         (SELECT count(*) FROM public.dream_team_servicios s WHERE s.persona_id = u.id),
                         (SELECT count(*) FROM public.persona_datos_importados d WHERE d.persona_id = u.id))
          FROM public.usuarios u WHERE u.id = 'ca000000-0000-4000-8000-000000000041'))$q$,
  '19:existente/creado 54 persona_id indicado en la fila; se completó: fecha_nacimiento, telefono, redes_sociales'
  || ' | 19:existente/existente 54 ya resuelta en una carga anterior'
  || ' | 2019-06-06/04120000019/@zzhijo/1 | -/-/0/0');

-- Fila 19 again, now under another name and without a birth date: neither
-- the name key nor a known birth date ties it to 54, so it is revisar with 54
-- as the candidate and nothing is written. With the birth date back (known
-- and equal on both sides) the other name still resolves to 54.
UPDATE t_cv_payload
   SET filas = (SELECT jsonb_build_array(
                         (p.filas -> 18) || '{"nombre": "Zzotra", "apellido": "Persona", "fecha_nacimiento": null}'::jsonb)
                  FROM t_cv_payload0 p);

SELECT pg_temp.huellas('antes8b');
SELECT pg_temp.cargar('t_cv_carga8b', true);
SELECT pg_temp.huellas('carga8b');

UPDATE t_cv_payload
   SET filas = (SELECT jsonb_build_array(
                         (p.filas -> 18) || '{"nombre": "Zzotra", "apellido": "Persona"}'::jsonb)
                  FROM t_cv_payload0 p);

SELECT pg_temp.cargar('t_cv_carga8c', false);

SELECT pg_temp.assert_eq('k: a resolved fila under another name and no shared birth date is revisar, no writes',
  $q$SELECT concat_ws(' | ',
       (SELECT string_agg(concat_ws(' ', fila || ':' || persona_accion || '/' || servicio_accion,
                                    right(persona_id::text, 2)), ', ')
          FROM t_cv_carga8b),
       pg_temp.tablas_cambiadas('antes8b', 'carga8b'),
       (SELECT string_agg(concat_ws(' ', fila || ':' || persona_accion, right(persona_id::text, 2)), ', ')
          FROM t_cv_carga8c))$q$,
  '19:revisar/omitido 54 |  | 19:existente 54');

-- The fila key is not trusted against the row: fila 1 now gives another
-- person's cedula, fila 21 another birth date, fila 3 is held by two people
-- (as if an earlier run had given it to 26 too), and fila 70 is used twice.
-- None of them writes anything.
UPDATE public.persona_datos_importados d
   SET datos = jsonb_set(d.datos, '{filas,3}', '{}')
 WHERE d.persona_id = 'ca000000-0000-4000-8000-000000000026' AND d.fuente = 'zz-carga-prueba';

UPDATE t_cv_payload
   SET filas = (SELECT jsonb_build_array(
                         (p.filas -> 0) || '{"cedula": "E99900040"}'::jsonb,
                         p.filas -> 2,
                         (p.filas -> 20) || '{"fecha_nacimiento": "1986-03-03"}'::jsonb,
                         (p.filas -> 4) || '{"fila": 70}'::jsonb,
                         (p.filas -> 4) || '{"fila": 70, "crear_sin_cedula": true}'::jsonb)
                  FROM t_cv_payload0 p);

SELECT pg_temp.huellas('antes9');
SELECT pg_temp.cargar('t_cv_carga9', true);
SELECT pg_temp.huellas('carga9');

SELECT pg_temp.assert_eq('k: a fila whose row now disagrees, held by two people or used twice is not loaded',
  $q$SELECT string_agg(concat_ws(' ', fila || ':' || persona_accion || '/' || servicio_accion,
                                 coalesce(right(persona_id::text, 2), '-'), detalle), ' | ' ORDER BY fila)
       FROM t_cv_carga9$q$,
  '1:conflicto/omitido 21 la fila ya se cargó como "Zzcarga Existente" (cédula E99900001, nacimiento 1990-05-06)'
  || ' y ahora dice "ZZCARGA Existénte" (cédula E99900040, nacimiento 1990-05-06);'
  || ' si es la misma persona, indicar persona_id'
  || ' | 3:revisar/omitido - la fila ya se cargó para 2 personas:'
  || ' ca000000-0000-4000-8000-000000000023, ca000000-0000-4000-8000-000000000026; indicar persona_id'
  || ' | 21:conflicto/omitido 43 la fila ya se cargó como "Zzrosa De Zzleon" (cédula E99900043, nacimiento 1985-03-03)'
  || ' y ahora dice "Zzrosa María Zzleón" (cédula E99900043, nacimiento 1986-03-03);'
  || ' si es la misma persona, indicar persona_id'
  || ' | 70:error/error - la fila 70 aparece 2 veces en p_filas'
  || ' | 70:error/error - la fila 70 aparece 2 veces en p_filas');

SELECT pg_temp.assert_eq('k: rows the fila key does not settle write nothing',
  $q$SELECT pg_temp.tablas_cambiadas('antes9', 'carga9')$q$, '');

-- Two people an earlier load settled (their filas 80 and 81 are recorded),
-- neither with a stored birth date. Fila 80 now gives a minor's birth date
-- under the same name and cedula (a junior on a parent's record): revisar,
-- nothing written. Fila 81 is the same adult again, now with a birth date,
-- phone and talla: existente, and no usuarios column is filled, not even a
-- NULL one; only the servicio is ensured.
INSERT INTO public.usuarios (id, auth_id, cedula, nombre, apellido, estado_civil, genero) VALUES
  ('ca000000-0000-4000-8000-000000000060', NULL, 'E99900062', 'Zzjunior', 'Mismo', 'Soltero', 'Masculino'),
  ('ca000000-0000-4000-8000-000000000061', NULL, 'E99900063', 'Zzadulto', 'Rerun', 'Soltero', 'Femenino');
INSERT INTO public.persona_datos_importados (persona_id, fuente, datos) VALUES
  ('ca000000-0000-4000-8000-000000000060', 'zz-carga-prueba', '{"filas": {"80": {}}}'),
  ('ca000000-0000-4000-8000-000000000061', 'zz-carga-prueba', '{"filas": {"81": {}}}');

CREATE TEMP TABLE t_cv_version10 ON COMMIT DROP AS
  SELECT 'u' AS tabla, u.id, u.ctid::text || '/' || u.xmin::text AS version
    FROM public.usuarios u
   WHERE u.id IN ('ca000000-0000-4000-8000-000000000060', 'ca000000-0000-4000-8000-000000000061')
  UNION ALL
  SELECT 'd', d.persona_id, d.ctid::text || '/' || d.xmin::text
    FROM public.persona_datos_importados d
   WHERE d.persona_id = 'ca000000-0000-4000-8000-000000000060';

UPDATE t_cv_payload
   SET filas = (SELECT jsonb_build_array(
                         ((p.filas -> 0) - 'extras' - 'persona_id' - 'crear_sin_cedula')
                           || '{"fila": 80, "nombre": "Zzjunior", "apellido": "Mismo", "cedula": "E99900062",
                                "fecha_nacimiento": "2015-01-01", "telefono": "04120000080"}'::jsonb,
                         ((p.filas -> 0) - 'extras' - 'persona_id' - 'crear_sin_cedula')
                           || '{"fila": 81, "nombre": "Zzadulto", "apellido": "Rerun", "cedula": "E99900063",
                                "fecha_nacimiento": "1980-01-01", "telefono": "04120000081",
                                "talla_franela": "L"}'::jsonb)
                  FROM t_cv_payload0 p);

SELECT pg_temp.cargar('t_cv_carga10', true);

SELECT pg_temp.assert_eq('p: a junior re-run is revisar and a settled re-run is existente',
  $q$SELECT string_agg(concat_ws(' ', fila || ':' || persona_accion || '/' || servicio_accion,
                                 right(persona_id::text, 2), detalle), ' | ' ORDER BY fila)
       FROM t_cv_carga10$q$,
  '80:revisar/omitido 60 la fila ya se cargó como "Zzjunior Mismo" (sin fecha de nacimiento) y ahora es'
  || ' de un menor; si es la misma persona, indicar persona_id'
  || ' | 81:existente/creado 61 ya resuelta en una carga anterior');

SELECT pg_temp.assert_eq('p: rule 1 rows change no usuarios row and the revisar row writes nothing',
  $q$SELECT concat_ws(' | ',
       (SELECT count(*) FROM t_cv_version10 v
          JOIN public.usuarios u ON v.tabla = 'u' AND u.id = v.id AND u.ctid::text || '/' || u.xmin::text = v.version),
       (SELECT count(*) FROM t_cv_version10 v
          JOIN public.persona_datos_importados d ON v.tabla = 'd' AND d.persona_id = v.id
           AND d.ctid::text || '/' || d.xmin::text = v.version),
       (SELECT concat_ws('/', coalesce(u.fecha_nacimiento::text, '-'), coalesce(u.telefono, '-'),
                         coalesce(u.talla_franela, '-'))
          FROM public.usuarios u WHERE u.id = 'ca000000-0000-4000-8000-000000000061'),
       (SELECT count(*) FROM public.dream_team_servicios s
         WHERE s.persona_id = 'ca000000-0000-4000-8000-000000000060'),
       (SELECT count(*) FROM public.dream_team_servicios s
         WHERE s.persona_id = 'ca000000-0000-4000-8000-000000000061'))$q$,
  '2 | 1 | -/-/- | 0 | 1');

-- ── l. an authenticated session cannot run the loader ───────────────

-- The helpers run as authenticated here; grant them explicitly, since a
-- default ACL may keep new functions (temp ones too) from PUBLIC.
GRANT INSERT, SELECT ON t_cv_failures TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.fail(text, text), pg_temp.assert_raises(text, text, text) TO authenticated;

SET LOCAL ROLE authenticated;

SELECT pg_temp.assert_raises('l: an authenticated session cannot execute the loader',
  $q$SELECT * FROM public.dream_team_cargar_voluntarios('zz-carga-prueba', '[]'::jsonb,
       'ca000000-0000-4000-8000-000000000020', 'ca000000-0000-4000-8000-000000000016', false)$q$,
  '42501');

RESET ROLE;

SELECT count(*) AS failing_cases, coalesce(string_agg(case_name, E'\n'), 'all cases ok') AS detail
  FROM t_cv_failures;

ROLLBACK;
