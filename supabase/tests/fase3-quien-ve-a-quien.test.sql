-- Who sees whom, migration 20261003190000: usuarios rows through RLS,
-- puede_ver_usuario, obtener_conyugue and the four views that lose
-- authenticated.
--
-- Covers, once before and once after the migration block, as the admin, the
-- general director, the director de etapa, the leader and one plain member
-- (own session, role authenticated), and as service_role; plus a second
-- leader (lider2) whose group holds a married member, for c:
--   a. usuarios: the visible set through RLS (count and md5 of the sorted
--      ids). After: admin and the general director see every row (the
--      director general through usuarios_can_view_profile_photos, kept); the
--      director de etapa exactly self plus the members of their assigned
--      groups; the leader exactly self plus the members of the groups where
--      they are Líder or Colíder; the member only self. service_role: same
--      digest before and after.
--   b. puede_ver_usuario(<session person>, target) over every usuarios row,
--      after: exactly the R1 set per identity (for the general director: self
--      plus the members of the groups gdv_dg_ve_grupo gives them). Asking as
--      somebody else is false; service_role asking as the leader gets the
--      leader's set.
--   c. obtener_conyugue, after: a leader gets the row only for a person in
--      one of their groups (lider2 on a married member of their group; both
--      leaders get no row on a married person outside their groups); the director de etapa, the general director and the
--      admin get both; the member gets none; service_role gets both, equal to
--      the rows before.
--   d. Views: count per identity before and after. The four revoked views
--      raise 42501 after for every authenticated identity; the other four
--      return the same count as before; service_role counts are unchanged.
--   e. Catalog: md5 of both functions after; anon and PUBLIC cannot execute.
--
-- The migration is copied byte for byte between the two marker comments below.
-- Run against STAGING inside BEGIN...ROLLBACK. The last statement returns the
-- failing cases (kind 'failure', none expected), then summary rows.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_qv_failures (case_name text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE t_qv_ident (label text, auth_id uuid, uid uuid) ON COMMIT DROP;
CREATE TEMP TABLE t_qv_vis (phase text, label text, n int, digest text, ms numeric) ON COMMIT DROP;
CREATE TEMP TABLE t_qv_view (phase text, label text, view_name text, result text) ON COMMIT DROP;
CREATE TEMP TABLE t_qv_cony (phase text, label text, probe text, result text) ON COMMIT DROP;
CREATE TEMP TABLE t_qv_fn (label text, ids uuid[]) ON COMMIT DROP;

INSERT INTO t_qv_ident
SELECT v.label, v.a, u.id
FROM (VALUES ('admin', '5df3b990-af3d-49b5-a061-025bc3598983'::uuid),
             ('dg',    '9f23ae7c-7008-4bd6-b449-89c326f8d1af'::uuid),
             ('de',    'ee0efdea-2d85-479a-88ab-85720903aa2a'::uuid),
             ('lider', '2efa6e21-bbf0-4fb3-a8fa-96e16b3e881d'::uuid),
             ('lider2', 'd0678df2-b5bf-4e73-a097-18a9cfaaf084'::uuid),
             ('miembro', '372eac6c-b598-463e-ad9f-0be5c4ae7032'::uuid)) v(label, a)
JOIN public.usuarios u ON v.a = u.auth_id;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_qv_failures(case_name, detail) VALUES (p_case, p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_session(p_mode text, p_auth uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true),
          set_config('request.jwt.claim.sub', '', true),
          set_config('request.jwt.claim.role', '', true);
  IF p_mode = 'user' THEN
    PERFORM set_config('request.jwt.claim.sub', p_auth::text, true),
            set_config('request.jwt.claims', json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  ELSIF p_mode = 'service' THEN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true),
            set_config('request.jwt.claims', '{"role":"service_role"}', true);
  END IF;
END;
$$;

-- Expected R1 sets, computed as postgres from the tables.
CREATE OR REPLACE FUNCTION pg_temp.expected(p_label text)
RETURNS uuid[] LANGUAGE sql AS $$
  WITH me AS (SELECT uid FROM t_qv_ident WHERE label = p_label)
  SELECT array_agg(DISTINCT x ORDER BY x) FROM (
    SELECT uid AS x FROM me
    UNION SELECT u.id FROM public.usuarios u WHERE p_label = 'admin'
    UNION SELECT gm.usuario_id FROM public.grupo_miembros gm, me
     WHERE p_label = 'dg' AND public.gdv_dg_ve_grupo(me.uid, gm.grupo_id)
    UNION SELECT gm.usuario_id FROM public.grupo_miembros gm
      JOIN public.director_etapa_grupos deg ON deg.grupo_id = gm.grupo_id
      JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id, me
     WHERE sl.usuario_id = me.uid AND sl.tipo_lider = 'director_etapa'
    UNION SELECT gm.usuario_id FROM public.grupo_miembros l
      JOIN public.grupo_miembros gm ON gm.grupo_id = l.grupo_id, me
     WHERE l.usuario_id = me.uid AND l.rol IN ('Líder', 'Colíder')
  ) s;
$$;

-- Couples: one whose spouse belongs to a group the leader leads, one outside.
CREATE TEMP TABLE t_qv_couple (probe text, usuario_id uuid) ON COMMIT DROP;
INSERT INTO t_qv_couple
SELECT 'in_leader_group', x FROM (
  SELECT ru.usuario1_id AS x FROM public.relaciones_usuarios ru WHERE ru.tipo_relacion = 'conyuge'
  UNION SELECT ru.usuario2_id FROM public.relaciones_usuarios ru WHERE ru.tipo_relacion = 'conyuge') c
WHERE x <> (SELECT uid FROM t_qv_ident WHERE label = 'lider2')
  AND x = ANY (pg_temp.expected('lider2'))
LIMIT 1;
INSERT INTO t_qv_couple
SELECT 'stranger', x FROM (
  SELECT ru.usuario1_id AS x FROM public.relaciones_usuarios ru WHERE ru.tipo_relacion = 'conyuge'
  UNION SELECT ru.usuario2_id FROM public.relaciones_usuarios ru WHERE ru.tipo_relacion = 'conyuge') c
WHERE NOT x = ANY (pg_temp.expected('lider'))
  AND NOT x = ANY (pg_temp.expected('lider2'))
LIMIT 1;

CREATE OR REPLACE FUNCTION pg_temp.probe(p_phase text, p_label text, p_mode text, p_auth uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_ids uuid[];
  v_t0 timestamptz;
  v_ms numeric;
  v_view text;
  v_n bigint;
  v_res text;
  c record;
BEGIN
  PERFORM pg_temp.set_session(p_mode, p_auth);
  IF p_mode = 'user' THEN SET LOCAL ROLE authenticated; ELSE SET LOCAL ROLE service_role; END IF;

  v_t0 := clock_timestamp();
  SELECT array_agg(u.id ORDER BY u.id) INTO v_ids FROM public.usuarios u;
  v_ms := round(extract(epoch FROM clock_timestamp() - v_t0) * 1000, 1);
  INSERT INTO t_qv_vis VALUES (p_phase, p_label, coalesce(cardinality(v_ids), 0), md5(coalesce(v_ids::text, '')), v_ms);

  IF p_phase = 'after' THEN
    INSERT INTO t_qv_fn
    SELECT p_label, array_agg(u.id ORDER BY u.id)
    FROM (SELECT id FROM public.usuarios) u
    WHERE public.puede_ver_usuario(
      CASE WHEN p_mode = 'user' THEN (SELECT get_my_internal_id())
           ELSE (SELECT uid FROM t_qv_ident WHERE label = 'lider') END, u.id);
  END IF;

  FOREACH v_view IN ARRAY ARRAY['v_solicitudes_pendientes','v_historial_miembro','v_mapa_grupos_vida',
      'v_salud_miembros_grupo','v_directores_etapa_segmento','v_casas_anfitrionas_disponibles',
      'v_lideres_con_pareja','v_grupos_supervisiones'] LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', v_view) INTO v_n;
      v_res := v_n::text;
    EXCEPTION WHEN insufficient_privilege THEN
      v_res := '42501';
    END;
    INSERT INTO t_qv_view VALUES (p_phase, p_label, v_view, v_res);
  END LOOP;

  FOR c IN SELECT * FROM t_qv_couple LOOP
    SELECT coalesce(string_agg(x.id::text, ','), 'none') INTO v_res FROM public.obtener_conyugue(c.usuario_id) x;
    INSERT INTO t_qv_cony VALUES (p_phase, p_label, c.probe, v_res);
  END LOOP;

  RESET ROLE;
END;
$$;

GRANT ALL ON ALL TABLES IN SCHEMA pg_temp TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

SELECT pg_temp.probe('before', i.label, 'user', i.auth_id) FROM t_qv_ident i;
SELECT pg_temp.probe('before', 'service', 'service', NULL);

-- migration begin
-- Who sees whom in usuarios, who may ask for a spouse, and who reads four of
-- the reporting views (security phase 3, batch L6).
--
--   puede_ver_usuario(p_viewer_id, p_target_user_id)
--     Before: it mixed id kinds. Branch (a) and (c) compared usuarios.id, (b)
--     passed p_viewer_id to obtener_roles_usuario, which expects an auth id,
--     and the usuarios policy called it with (auth.uid(), id). So (a) and (c)
--     never matched and only admin/pastor saw anybody through it.
--     Now both arguments are usuarios.id. Unless the request role is
--     service_role, p_viewer_id must be the session person, else false. Then:
--     self; admin or pastor see everybody; a director general sees the members
--     of the groups gdv_dg_ve_grupo gives them; a director de etapa sees the
--     members of the groups assigned to them in director_etapa_grupos; a Líder
--     or Colíder sees the members of their groups; nobody else sees anybody.
--     Membership is any grupo_miembros row, as in puede_ver_grupo.
--   Policy "Los usuarios pueden ver perfiles según su rol" on usuarios now
--     passes (SELECT get_my_internal_id()) instead of auth.uid(). The other two
--     SELECT policies stay as they are; usuarios_can_view_profile_photos still
--     lets admin, pastor and director-general read every row (accepted).
--   obtener_conyugue(p_usuario_id)
--     Gate: directors (etapa and general), pastor and admin may ask about
--     anybody; a Líder or Colíder only about a member of one of their groups;
--     anybody else and no session get no row. service_role skips the gate.
--   Views v_directores_etapa_segmento (read only with the service role, from
--     app/api/segmentos/[segmentoId]/directores-etapa/ubicaciones/route.ts,
--     after a role check), v_casas_anfitrionas_disponibles,
--     v_lideres_con_pareja and v_grupos_supervisiones (no reader in the app):
--     authenticated loses SELECT. The views run as their owner, so this is
--     the only gate. v_solicitudes_pendientes, v_historial_miembro,
--     v_mapa_grupos_vida and v_salud_miembros_grupo are read with the session
--     client (the last one from a leader page) and are left unchanged.

CREATE OR REPLACE FUNCTION public.puede_ver_usuario(p_viewer_id uuid, p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only about the person in the session; only service_role may ask about
  -- somebody else.
  IF coalesce(auth.role(), '') <> 'service_role'
     AND (auth.uid() IS NULL
          OR p_viewer_id IS DISTINCT FROM (SELECT u.id FROM public.usuarios u WHERE u.auth_id = auth.uid())) THEN
    RETURN false;
  END IF;

  IF p_viewer_id IS NULL OR p_target_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_viewer_id = p_target_user_id THEN
    RETURN true;
  END IF;

  IF EXISTS (SELECT 1 FROM public.usuario_roles ur
               JOIN public.roles_sistema rs ON rs.id = ur.rol_id
              WHERE ur.usuario_id = p_viewer_id
                AND rs.nombre_interno IN ('admin', 'pastor')) THEN
    RETURN true;
  END IF;

  -- Director general: members of the groups the single DG rule gives them.
  IF EXISTS (SELECT 1 FROM public.usuario_roles ur
               JOIN public.roles_sistema rs ON rs.id = ur.rol_id
              WHERE ur.usuario_id = p_viewer_id
                AND rs.nombre_interno = 'director-general')
     AND EXISTS (SELECT 1 FROM public.grupo_miembros gm
                  WHERE gm.usuario_id = p_target_user_id
                    AND public.gdv_dg_ve_grupo(p_viewer_id, gm.grupo_id)) THEN
    RETURN true;
  END IF;

  -- Director de etapa: members of the groups assigned to them.
  IF EXISTS (SELECT 1 FROM public.grupo_miembros gm
               JOIN public.director_etapa_grupos deg ON deg.grupo_id = gm.grupo_id
               JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
              WHERE gm.usuario_id = p_target_user_id
                AND sl.usuario_id = p_viewer_id
                AND sl.tipo_lider = 'director_etapa') THEN
    RETURN true;
  END IF;

  -- Líder or Colíder: members of their groups.
  RETURN EXISTS (SELECT 1 FROM public.grupo_miembros lead
                   JOIN public.grupo_miembros gm ON gm.grupo_id = lead.grupo_id
                  WHERE lead.usuario_id = p_viewer_id
                    AND lead.rol IN ('Líder', 'Colíder')
                    AND gm.usuario_id = p_target_user_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.puede_ver_usuario(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_ver_usuario(uuid, uuid) TO authenticated, service_role;

DROP POLICY "Los usuarios pueden ver perfiles según su rol" ON public.usuarios;
CREATE POLICY "Los usuarios pueden ver perfiles según su rol" ON public.usuarios
  FOR SELECT TO public
  USING (public.puede_ver_usuario((SELECT public.get_my_internal_id()), id));

CREATE OR REPLACE FUNCTION public.obtener_conyugue(p_usuario_id uuid)
RETURNS TABLE(id uuid, nombre text, apellido text, foto_perfil_url text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT u.id, u.nombre, u.apellido, u.foto_perfil_url
  FROM public.relaciones_usuarios ru
  JOIN public.usuarios u ON u.id = CASE
    WHEN ru.usuario1_id = p_usuario_id THEN ru.usuario2_id
    ELSE ru.usuario1_id
  END
  WHERE (ru.usuario1_id = p_usuario_id OR ru.usuario2_id = p_usuario_id)
    AND ru.tipo_relacion = 'conyuge'
    AND (
      coalesce(auth.role(), '') = 'service_role'
      OR EXISTS (
        SELECT 1
        FROM public.usuarios me
        WHERE me.auth_id = auth.uid()
          AND (
            EXISTS (SELECT 1 FROM public.usuario_roles ur
                      JOIN public.roles_sistema rs ON rs.id = ur.rol_id
                     WHERE ur.usuario_id = me.id
                       AND rs.nombre_interno IN ('admin', 'pastor', 'director-general', 'director-etapa'))
            OR EXISTS (SELECT 1 FROM public.grupo_miembros lead
                         JOIN public.grupo_miembros gm ON gm.grupo_id = lead.grupo_id
                        WHERE lead.usuario_id = me.id
                          AND lead.rol IN ('Líder', 'Colíder')
                          AND gm.usuario_id = p_usuario_id)
          )
      )
    )
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.obtener_conyugue(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_conyugue(uuid) TO authenticated, service_role;

REVOKE ALL ON public.v_directores_etapa_segmento FROM anon, authenticated;
REVOKE ALL ON public.v_casas_anfitrionas_disponibles FROM anon, authenticated;
REVOKE ALL ON public.v_lideres_con_pareja FROM anon, authenticated;
REVOKE ALL ON public.v_grupos_supervisiones FROM anon, authenticated;
-- migration end

SELECT pg_temp.probe('after', i.label, 'user', i.auth_id) FROM t_qv_ident i;
SELECT pg_temp.probe('after', 'service', 'service', NULL);

DO $$
DECLARE
  r record;
  v_all int := (SELECT count(*) FROM public.usuarios);
  v_exp uuid[];
  v_got uuid[];
BEGIN
  IF (SELECT count(*) FROM t_qv_ident) <> 6 THEN
    PERFORM pg_temp.fail('setup', 'identities: ' || (SELECT count(*) FROM t_qv_ident));
  END IF;
  IF (SELECT count(*) FROM t_qv_couple) <> 2 THEN
    PERFORM pg_temp.fail('setup', 'couples: ' || (SELECT count(*) FROM t_qv_couple));
  END IF;

  -- a. usuarios through RLS
  FOR r IN SELECT * FROM t_qv_vis WHERE phase = 'after' LOOP
    IF r.label IN ('admin', 'dg') THEN
      IF NOT coalesce(r.n = v_all, false) THEN
        PERFORM pg_temp.fail('a.usuarios', r.label || ' sees ' || r.n || ' of ' || v_all);
      END IF;
    ELSIF r.label = 'service' THEN
      IF NOT coalesce(r.digest = (SELECT digest FROM t_qv_vis WHERE phase = 'before' AND label = 'service'), false) THEN
        PERFORM pg_temp.fail('a.usuarios', 'service digest changed');
      END IF;
    ELSE
      v_exp := pg_temp.expected(r.label);
      IF NOT coalesce(r.digest = md5(v_exp::text), false) THEN
        PERFORM pg_temp.fail('a.usuarios', r.label || ' sees ' || r.n || ', expected ' || cardinality(v_exp));
      END IF;
    END IF;
  END LOOP;

  -- b. puede_ver_usuario
  FOR r IN SELECT * FROM t_qv_fn LOOP
    v_exp := pg_temp.expected(CASE WHEN r.label = 'service' THEN 'lider' ELSE r.label END);
    IF NOT coalesce(r.ids = v_exp, false) THEN
      PERFORM pg_temp.fail('b.puede_ver_usuario', r.label || ' got ' || coalesce(cardinality(r.ids), 0)
        || ', expected ' || cardinality(v_exp));
    END IF;
  END LOOP;
  PERFORM pg_temp.set_session('user', (SELECT auth_id FROM t_qv_ident WHERE label = 'lider'));
  IF NOT coalesce(NOT public.puede_ver_usuario((SELECT uid FROM t_qv_ident WHERE label = 'admin'),
                                               (SELECT uid FROM t_qv_ident WHERE label = 'miembro')), false) THEN
    PERFORM pg_temp.fail('b.puede_ver_usuario', 'leader asking as the admin got true');
  END IF;
  PERFORM pg_temp.set_session('nobody', NULL);
  IF NOT coalesce(NOT public.puede_ver_usuario((SELECT uid FROM t_qv_ident WHERE label = 'admin'),
                                               (SELECT uid FROM t_qv_ident WHERE label = 'miembro')), false) THEN
    PERFORM pg_temp.fail('b.puede_ver_usuario', 'no session got true');
  END IF;

  -- c. obtener_conyugue
  FOR r IN SELECT a.*, b.result AS before_result FROM t_qv_cony a
             JOIN t_qv_cony b ON b.phase = 'before' AND b.label = a.label AND b.probe = a.probe
            WHERE a.phase = 'after' LOOP
    IF r.label = 'miembro' OR (r.label IN ('lider', 'lider2') AND NOT (SELECT c.usuario_id FROM t_qv_couple c
                                     WHERE c.probe = r.probe) = ANY (pg_temp.expected(r.label))) THEN
      IF NOT coalesce(r.result = 'none', false) THEN
        PERFORM pg_temp.fail('c.conyugue', r.label || '/' || r.probe || ' got ' || r.result);
      END IF;
    ELSIF NOT coalesce(r.result = r.before_result AND r.result <> 'none', false) THEN
      PERFORM pg_temp.fail('c.conyugue', r.label || '/' || r.probe || ' got ' || r.result || ' before ' || r.before_result);
    END IF;
  END LOOP;

  -- d. views
  FOR r IN SELECT a.*, b.result AS before_result FROM t_qv_view a
             JOIN t_qv_view b ON b.phase = 'before' AND b.label = a.label AND b.view_name = a.view_name
            WHERE a.phase = 'after' LOOP
    IF r.label <> 'service' AND r.view_name IN ('v_directores_etapa_segmento', 'v_casas_anfitrionas_disponibles',
                                                'v_lideres_con_pareja', 'v_grupos_supervisiones') THEN
      IF NOT coalesce(r.result = '42501', false) THEN
        PERFORM pg_temp.fail('d.views', r.label || '/' || r.view_name || ' got ' || r.result);
      END IF;
    ELSIF NOT coalesce(r.result = r.before_result, false) THEN
      PERFORM pg_temp.fail('d.views', r.label || '/' || r.view_name || ' ' || r.before_result || ' -> ' || r.result);
    END IF;
  END LOOP;

  -- e. catalog
  IF has_function_privilege('anon', 'public.puede_ver_usuario(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.obtener_conyugue(uuid)', 'EXECUTE') THEN
    PERFORM pg_temp.fail('e.catalog', 'anon can execute');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
              WHERE p.oid IN ('public.puede_ver_usuario(uuid,uuid)'::regprocedure, 'public.obtener_conyugue(uuid)'::regprocedure)
                AND a.grantee = 0) THEN
    PERFORM pg_temp.fail('e.catalog', 'PUBLIC can execute');
  END IF;
END;
$$;

SELECT kind, case_name, detail FROM (
  SELECT 1 o, 'failure' kind, case_name, detail FROM t_qv_failures
  UNION ALL SELECT 2, 'usuarios', label, phase || ' n=' || n || ' ms=' || ms FROM t_qv_vis
  UNION ALL SELECT 3, 'conyugue', label || '/' || probe, phase || ' ' || (result <> 'none')::text FROM t_qv_cony
  UNION ALL SELECT 4, 'views', label, phase || ' ' || string_agg(view_name || '=' || result, ' ' ORDER BY view_name)
    FROM t_qv_view GROUP BY label, phase
  UNION ALL SELECT 5, 'md5', p.proname, md5(pg_get_functiondef(p.oid))
    FROM pg_proc p WHERE p.oid IN ('public.puede_ver_usuario(uuid,uuid)'::regprocedure, 'public.obtener_conyugue(uuid)'::regprocedure)
) s ORDER BY o, case_name, detail;

ROLLBACK;
