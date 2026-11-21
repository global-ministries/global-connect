-- Personas: a search that finds people the way directors type them, and the
-- «¿Es alguna de estas personas?» check before creating one
-- (odd/tasks/dream-team-estructura-correcciones.md, T4, S6a, S6b).
--
-- WHY
--   Directors did not find people with talleres_buscar_personas (ILIKE on
--   nombre, apellido or email: "jose" never finds «José», "Paez Isaac" finds
--   nobody, a cédula or a phone finds nobody), so they registered them again
--   and the person ended up twice. Nothing warned them before creating.
--
-- WHAT
--   1. personas_buscar_coincidencias(q, limite)  (internal, service_role)
--        The ids of the people matching q, ordered by apellido, nombre, id.
--        - Accents and case are ignored (dream_team_normalizar_etiqueta, the
--          fixed Spanish accent map already used by the loader; the unaccent
--          extension is not installed in this project).
--        - Words in any order: q is split on blanks and EVERY word must be
--          contained in the person's nombre, apellido, email, cédula or
--          teléfono ('%' and '_' are literal).
--        - A word made only of digits, dots and hyphens (optionally after a
--          V or E) is compared by its digits (E keeps its letter), so
--          "12.345.678", "V-12345678" and "0414-123" match the stored
--          cédula or teléfono digits.
--        - A query that is only a phone or a cédula ("0414 123 4567",
--          "+58 414 1234567", "12 345 678") is one number: its digits must
--          be contained in the cédula or teléfono digits, or the number
--          normalized like usuarios.telefono (normalizar_telefono_ve) must
--          equal the stored teléfono digits.
--        Fewer than 2 characters (after trimming) return nothing; q is cut at
--        100 characters; limite is clamped to 1..50 (NULL = 20).
--   2. personas_buscar(p_q, p_limit = 20)
--        The Dream Team search (GET /api/dream-team/usuarios/buscar). SAME
--        gate as talleres_buscar_personas (an active grant among the eight
--        Dream Team / Talleres writing capabilities, 42501
--        'sin_autoridad_para_buscar' otherwise), same minimum length and
--        same limit; same columns: id, nombre, apellido, email (cédula and
--        teléfono are matched, never returned).
--   3. personas_posibles_duplicados(p_nombre, p_apellido, p_cedula, p_telefono)
--        Who may already be the person about to be registered. Same gate as
--        dream_team_persona_por_cedula (dream_team_puede_registrar_persona(
--        NULL), 42501 'sin_autoridad'). A person matches by:
--          'cedula'   the normalized cédula (normalizar_cedula_ve) is equal;
--          'telefono' the normalized teléfono (normalizar_telefono_ve) is
--                     equal (only 7 or more digits are compared);
--          'nombre'   the first word of nombre is one of the person's nombre
--                     words AND the first word of apellido is one of the
--                     person's apellido words, ignoring accents and case
--                     («Isaac Paez» matches «Isaac José Paez Cordero»).
--        Returns at most 10: id, nombre, apellido, campus (the principal
--        campus name, or any of theirs), servicios (Dream Team servicios not
--        retirado), tiene_cuenta (auth_id is set) and coincide (sorted
--        reasons). Ordered by cédula match, teléfono match, account first,
--        apellido, nombre, id. Nothing is written; the form never blocks.
--
-- talleres_buscar_personas is left as it is for its other callers (Talleres).
--
-- SAFETY
--   New functions only; no table, policy or trigger changes. The two RPCs run
--   as definer with an empty search_path, EXECUTE revoked from PUBLIC
--   and anon and granted to authenticated; the helper only to service_role.
--   Every usuarios row is scanned with the normalization functions: fine for
--   this table's size (thousands of rows), revisit with a trigram index if it
--   grows a lot.
--
-- Suite: supabase/tests/personas-buscar.test.sql.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.personas_posibles_duplicados(text, text, text, text);
--   DROP FUNCTION IF EXISTS public.personas_buscar(text, integer);
--   DROP FUNCTION IF EXISTS public.personas_buscar_coincidencias(text, integer);
--   and point app/api/dream-team/usuarios/buscar back to talleres_buscar_personas.

CREATE OR REPLACE FUNCTION public.personas_buscar_coincidencias(p_q text, p_limite integer DEFAULT 20)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_q        text := left(btrim(coalesce(p_q, '')), 100);
  v_limite   integer := least(greatest(coalesce(p_limite, 20), 1), 50);
  v_patrones text[] := '{}';
  v_telefono text;
  v_palabra  text;
  v_norm     text;
BEGIN
  IF char_length(v_q) < 2 THEN
    RETURN;
  END IF;

  IF v_q ~ '^\+?[0-9 .()\-]+$' OR v_q ~* '^[ve][ .\-]?[0-9 .\-]+$' THEN
    -- One number: a phone or a cédula, whatever its spacing.
    v_norm := regexp_replace(v_q, '\D', '', 'g');
    IF v_q ~* '^e' THEN
      v_norm := 'e' || v_norm;
    END IF;
    IF char_length(v_norm) < 2 THEN
      RETURN;
    END IF;
    v_patrones := ARRAY['%' || v_norm || '%'];
    v_telefono := nullif(regexp_replace(coalesce(public.normalizar_telefono_ve(v_q), ''), '\D', '', 'g'), '');
  ELSE
    FOR v_palabra IN SELECT w FROM regexp_split_to_table(v_q, '\s+') AS w WHERE w <> '' LOOP
      v_norm := public.dream_team_normalizar_etiqueta(v_palabra);
      IF v_norm ~ '^[0-9.\-]+$' AND v_norm ~ '[0-9]' THEN
        v_norm := regexp_replace(v_norm, '\D', '', 'g');
      ELSIF v_norm ~ '^[ve][0-9.\-]+$' AND v_norm ~ '[0-9]' THEN
        v_norm := CASE WHEN v_norm LIKE 'e%' THEN 'e' ELSE '' END || regexp_replace(v_norm, '\D', '', 'g');
      END IF;
      v_patrones := v_patrones
        || ('%' || replace(replace(replace(v_norm, '\', '\\'), '%', '\%'), '_', '\_') || '%');
    END LOOP;
  END IF;

  IF cardinality(v_patrones) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id
    FROM public.usuarios u
   WHERE concat_ws(' ',
           public.dream_team_normalizar_etiqueta(u.nombre),
           public.dream_team_normalizar_etiqueta(u.apellido),
           lower(u.email),
           lower(regexp_replace(coalesce(u.cedula, ''), '[\s.\-]', '', 'g')),
           regexp_replace(coalesce(u.telefono, ''), '\D', '', 'g')) LIKE ALL (v_patrones)
      OR (v_telefono IS NOT NULL AND regexp_replace(coalesce(u.telefono, ''), '\D', '', 'g') = v_telefono)
   ORDER BY u.apellido, u.nombre, u.id
   LIMIT v_limite;
END;
$$;

COMMENT ON FUNCTION public.personas_buscar_coincidencias(text, integer) IS
  'Internal: ids of the people whose nombre, apellido, email, cédula or teléfono contain every word of '
  'q, ignoring accents and case; a phone or cédula query is compared by its digits. Ordered by '
  'apellido, nombre, id. 20261121110000_personas_buscar_sin_acentos.sql.';

REVOKE ALL ON FUNCTION public.personas_buscar_coincidencias(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.personas_buscar_coincidencias(text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.personas_buscar(p_q text, p_limit integer DEFAULT 20)
RETURNS TABLE (id uuid, nombre text, apellido text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid;
BEGIN
  SELECT u.id INTO v_actor FROM public.usuarios u WHERE u.auth_id = auth.uid();

  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.dream_team_capability_grants g
     WHERE g.persona_id = v_actor
       AND g.revoked_at IS NULL
       AND g.capability_key IN (
         'dream_team.org.manage',
         'dream_team.director.coordinate',
         'dream_team.direct',
         'dream_team.coordinate',
         'dream_team.requirements.manage',
         'talleres_crecimiento.admin.manage',
         'talleres_crecimiento.director.write',
         'talleres_crecimiento.coordinator.write'
       )
  ) THEN
    RAISE EXCEPTION 'sin_autoridad_para_buscar' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT u.id, u.nombre::text, u.apellido::text, u.email::text
    FROM public.personas_buscar_coincidencias(p_q, p_limit) c
    JOIN public.usuarios u ON u.id = c.id
   ORDER BY u.apellido, u.nombre, u.id;
END;
$$;

COMMENT ON FUNCTION public.personas_buscar(text, integer) IS
  'Dream Team person search: every word of q in nombre, apellido, email, cédula or teléfono, ignoring '
  'accents and case; a phone or cédula query by its digits. Gate of talleres_buscar_personas '
  '(42501 sin_autoridad_para_buscar). Returns id, nombre, apellido, email; limit 1..50 (20).';

REVOKE ALL ON FUNCTION public.personas_buscar(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personas_buscar(text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.personas_posibles_duplicados(
  p_nombre   text,
  p_apellido text,
  p_cedula   text DEFAULT NULL,
  p_telefono text DEFAULT NULL
)
RETURNS TABLE (
  id           uuid,
  nombre       text,
  apellido     text,
  campus       text,
  servicios    integer,
  tiene_cuenta boolean,
  coincide     text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor    uuid;
  v_cedula   text := public.normalizar_cedula_ve(nullif(btrim(coalesce(p_cedula, '')), ''));
  v_telefono text := public.normalizar_telefono_ve(nullif(btrim(coalesce(p_telefono, '')), ''));
  v_nombre   text := split_part(btrim(regexp_replace(public.dream_team_normalizar_etiqueta(coalesce(p_nombre, '')), '[^[:alnum:]]+', ' ', 'g')), ' ', 1);
  v_apellido text := split_part(btrim(regexp_replace(public.dream_team_normalizar_etiqueta(coalesce(p_apellido, '')), '[^[:alnum:]]+', ' ', 'g')), ' ', 1);
BEGIN
  SELECT u.id INTO v_actor FROM public.usuarios u WHERE u.auth_id = auth.uid();

  IF v_actor IS NULL OR NOT public.dream_team_puede_registrar_persona(NULL) THEN
    RAISE EXCEPTION 'sin_autoridad' USING ERRCODE = '42501';
  END IF;

  IF v_telefono IS NOT NULL AND char_length(regexp_replace(v_telefono, '\D', '', 'g')) < 7 THEN
    v_telefono := NULL;
  END IF;
  IF char_length(v_nombre) < 2 OR char_length(v_apellido) < 2 THEN
    v_nombre := NULL;
  END IF;

  RETURN QUERY
  WITH hallados AS (
    SELECT u.id AS persona_id, 'cedula'::text AS por
      FROM public.usuarios u
     WHERE v_cedula IS NOT NULL
       AND (u.cedula = v_cedula OR public.normalizar_cedula_ve(u.cedula) = v_cedula)
    UNION ALL
    SELECT u.id, 'telefono'::text
      FROM public.usuarios u
     WHERE v_telefono IS NOT NULL
       AND (u.telefono = v_telefono OR public.normalizar_telefono_ve(u.telefono) = v_telefono)
    UNION ALL
    SELECT u.id, 'nombre'::text
      FROM public.usuarios u
     WHERE v_nombre IS NOT NULL
       AND v_nombre = ANY (regexp_split_to_array(public.dream_team_normalizar_etiqueta(u.nombre), '[^[:alnum:]]+'))
       AND v_apellido = ANY (regexp_split_to_array(public.dream_team_normalizar_etiqueta(u.apellido), '[^[:alnum:]]+'))
  ),
  razones AS (
    SELECT h.persona_id, array_agg(DISTINCT h.por ORDER BY h.por) AS coincide
      FROM hallados h
     GROUP BY h.persona_id
  )
  SELECT u.id,
         u.nombre::text,
         u.apellido::text,
         (SELECT c.nombre::text
            FROM public.usuario_campus uc
            JOIN public.campus c ON c.id = uc.campus_id
           WHERE uc.usuario_id = u.id
           ORDER BY uc.es_campus_principal DESC, c.nombre
           LIMIT 1),
         (SELECT count(*)::integer
            FROM public.dream_team_servicios s
           WHERE s.persona_id = u.id AND s.estado <> 'retirado'::public.dream_team_estado),
         (u.auth_id IS NOT NULL),
         r.coincide
    FROM razones r
    JOIN public.usuarios u ON u.id = r.persona_id
   ORDER BY ('cedula' = ANY (r.coincide)) DESC,
            ('telefono' = ANY (r.coincide)) DESC,
            (u.auth_id IS NOT NULL) DESC,
            u.apellido, u.nombre, u.id
   LIMIT 10;
END;
$$;

COMMENT ON FUNCTION public.personas_posibles_duplicados(text, text, text, text) IS
  'Who may already be the person about to be registered: same normalized cédula, same normalized '
  'teléfono, or first nombre word and first apellido word among theirs (accents and case ignored). '
  'At most 10, with campus, servicios not retirado and tiene_cuenta. Gate of dream_team_persona_por_cedula.';

REVOKE ALL ON FUNCTION public.personas_posibles_duplicados(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personas_posibles_duplicados(text, text, text, text) TO authenticated, service_role;
