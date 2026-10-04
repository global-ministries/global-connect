-- Direcciones and usuarios columns, migration 20261004100000 (D1 and D2 of
-- odd/tasks/seguridad-pendientes-talleres.md).
--
-- Fixtures, made as postgres inside the transaction: three new direcciones,
-- OWN linked to the plain member, MEMBER linked to a person the leader may
-- edit (puede_editar_usuario), STRANGER linked to a person neither the leader
-- nor the member may see or edit.
--
-- Covers, as admin, the director de etapa, the leader and the plain member
-- (own session, role authenticated), plus anon:
--   a. SELECT direcciones: admin sees all three; the director de etapa sees
--      all three (puede_ver_usuario_ficha lets directors see every person);
--      the leader sees MEMBER, not STRANGER; the member sees OWN only.
--      anon raises 42501.
--   b. UPDATE direcciones: the member updates OWN (1 row) and not STRANGER
--      (0 rows); the leader updates MEMBER (1 row) and not STRANGER (0 rows).
--   c. DELETE direcciones as any session raises 42501.
--   d. usuarios: the member updates own telefono (1 row) and own
--      foto_perfil_url (1 row); updating own cedula, email, auth_id,
--      familia_id, fecha_registro, estado_civil or direccion_id raises 42501;
--      the leader updates the MEMBER person's telefono (1 row) and not the
--      STRANGER's (0 rows). anon UPDATE raises 42501.
--   e. Catalog: the two new definer functions are not executable by anon or
--      PUBLIC; actualizar_usuario_y_direccion is not executable by
--      authenticated.
--
-- The migration is copied byte for byte between the two marker comments. For
-- RED, run the file with the block between the markers removed. Run against
-- STAGING inside BEGIN...ROLLBACK. The last statement returns the failing
-- cases (kind 'failure', none expected), then the observed values.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_du_failures (case_name text, detail text) ON COMMIT DROP;
CREATE TEMP TABLE t_du_obs (case_name text, result text) ON COMMIT DROP;
CREATE TEMP TABLE t_du_ident (label text, auth_id uuid, uid uuid) ON COMMIT DROP;
CREATE TEMP TABLE t_du_fix (label text, direccion_id uuid, usuario_id uuid) ON COMMIT DROP;

INSERT INTO t_du_ident
SELECT v.label, v.a, u.id
FROM (VALUES ('admin',   '5df3b990-af3d-49b5-a061-025bc3598983'::uuid),
             ('de',      'ee0efdea-2d85-479a-88ab-85720903aa2a'::uuid),
             ('lider',   '2efa6e21-bbf0-4fb3-a8fa-96e16b3e881d'::uuid),
             ('miembro', '372eac6c-b598-463e-ad9f-0be5c4ae7032'::uuid)) v(label, a)
JOIN public.usuarios u ON v.a = u.auth_id;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_du_failures(case_name, detail) VALUES (p_case, p_detail);
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
  ELSIF p_mode = 'anon' THEN
    PERFORM set_config('request.jwt.claim.role', 'anon', true),
            set_config('request.jwt.claims', '{"role":"anon"}', true);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.auth_of(p_label text)
RETURNS uuid LANGUAGE sql AS $$ SELECT auth_id FROM t_du_ident WHERE label = p_label $$;
CREATE OR REPLACE FUNCTION pg_temp.uid_of(p_label text)
RETURNS uuid LANGUAGE sql AS $$ SELECT uid FROM t_du_ident WHERE label = p_label $$;
CREATE OR REPLACE FUNCTION pg_temp.dir_of(p_label text)
RETURNS uuid LANGUAGE sql AS $$ SELECT direccion_id FROM t_du_fix WHERE label = p_label $$;
CREATE OR REPLACE FUNCTION pg_temp.usr_of(p_label text)
RETURNS uuid LANGUAGE sql AS $$ SELECT usuario_id FROM t_du_fix WHERE label = p_label $$;

-- Pick the MEMBER and STRANGER persons with the service role, through the
-- existing predicates.
SELECT pg_temp.set_session('service', NULL);
INSERT INTO t_du_fix (label, usuario_id)
SELECT 'own', pg_temp.uid_of('miembro');
INSERT INTO t_du_fix (label, usuario_id)
SELECT 'member', u.id FROM public.usuarios u
 WHERE u.id NOT IN (SELECT uid FROM t_du_ident)
   AND public.puede_editar_usuario(pg_temp.auth_of('lider'), u.id)
 LIMIT 1;
INSERT INTO t_du_fix (label, usuario_id)
SELECT 'stranger', u.id FROM public.usuarios u
 WHERE u.id NOT IN (SELECT uid FROM t_du_ident)
   AND u.familia_id IS NULL
   AND NOT public.puede_ver_usuario(pg_temp.uid_of('lider'), u.id)
   AND NOT public.puede_ver_usuario_ficha(pg_temp.auth_of('lider'), u.id)
   AND NOT public.puede_ver_usuario(pg_temp.uid_of('miembro'), u.id)
   AND NOT public.puede_ver_usuario_ficha(pg_temp.auth_of('miembro'), u.id)
 LIMIT 1;
SELECT pg_temp.set_session('none', NULL);

UPDATE t_du_fix SET direccion_id = gen_random_uuid();
INSERT INTO public.direcciones (id, calle, barrio)
SELECT direccion_id, 'Calle prueba ' || label, 'Barrio prueba' FROM t_du_fix;
UPDATE public.usuarios u SET direccion_id = f.direccion_id
  FROM t_du_fix f WHERE u.id = f.usuario_id;

CREATE OR REPLACE FUNCTION pg_temp.try(p_label text, p_mode text, p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_n bigint;
  v_res text;
BEGIN
  PERFORM pg_temp.set_session(p_mode, pg_temp.auth_of(p_label));
  IF p_mode = 'user' THEN SET LOCAL ROLE authenticated;
  ELSIF p_mode = 'anon' THEN SET LOCAL ROLE anon;
  END IF;
  BEGIN
    EXECUTE p_sql INTO v_n;
    v_res := coalesce(v_n::text, 'null');
  EXCEPTION WHEN insufficient_privilege THEN
    v_res := '42501';
  END;
  RESET ROLE;
  PERFORM pg_temp.set_session('none', NULL);
  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect(p_case text, p_label text, p_mode text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_res text := pg_temp.try(p_label, p_mode, p_sql);
BEGIN
  INSERT INTO t_du_obs VALUES (p_case, v_res);
  IF v_res IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || p_expected || ', got ' || v_res);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.sel(p_dir text)
RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT count(*) FROM public.direcciones WHERE id = %L', pg_temp.dir_of(p_dir))
$$;
CREATE OR REPLACE FUNCTION pg_temp.upd_dir(p_dir text)
RETURNS text LANGUAGE sql AS $$
  SELECT format('WITH x AS (UPDATE public.direcciones SET referencia = ''t'' WHERE id = %L RETURNING 1) SELECT count(*) FROM x', pg_temp.dir_of(p_dir))
$$;
CREATE OR REPLACE FUNCTION pg_temp.del_dir(p_dir text)
RETURNS text LANGUAGE sql AS $$
  SELECT format('WITH x AS (DELETE FROM public.direcciones WHERE id = %L RETURNING 1) SELECT count(*) FROM x', pg_temp.dir_of(p_dir))
$$;
CREATE OR REPLACE FUNCTION pg_temp.upd_usr(p_usr uuid, p_set text)
RETURNS text LANGUAGE sql AS $$
  SELECT format('WITH x AS (UPDATE public.usuarios SET %s WHERE id = %L RETURNING 1) SELECT count(*) FROM x', p_set, p_usr)
$$;

GRANT ALL ON ALL TABLES IN SCHEMA pg_temp TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;

-- migration begin
-- Who reads and writes direcciones, and which usuarios columns a session may
-- update (security, pending batch D1 and D2).
--
-- D1. direcciones
--   Before: SELECT open to every session, UPDATE and DELETE to any leader
--   (tiene_rol_de_liderazgo), and the own-address branch compared
--   usuarios.direccion_id with usuarios.id, so it never matched. anon held
--   every table privilege.
--   A direccion is referenced from usuarios.direccion_id, familias.direccion_id,
--   grupos.direccion_anfitrion_id, casas_anfitrionas.direccion_id and
--   casa_anfitriona_location_reviews.proposed_direccion_id. No new visibility
--   rule is made here; each branch reuses the predicate that already guards
--   the row pointing at the address:
--     puede_ver_direccion(id)  admin or pastor (es_superadmin); a person the
--       caller may see (puede_ver_usuario or puede_ver_usuario_ficha) whose
--       own or family address it is; a group the caller may see
--       (puede_ver_grupo).
--     casas_anfitrionas        the policy adds an EXISTS on that table, which
--       runs under the caller's own RLS there.
--     puede_editar_direccion(id)  admin or pastor; a person the caller may
--       edit (puede_editar_usuario), own or family address; a group the
--       caller may edit (puede_editar_grupo).
--   SELECT: puede_ver_direccion or a visible casa. UPDATE: puede_editar_direccion
--   (USING and WITH CHECK). DELETE: service_role only (no app path deletes).
--   INSERT: kept for authenticated; RETURNING needs the SELECT policy, so the
--   app creates addresses with the service client after its own check.
--   anon loses every privilege.
--   The views v_mapa_grupos_vida and v_casas_anfitrionas_disponibles run as
--   their owner and are not affected; definer RPCs neither.
--
-- D2. usuarios
--   Before: anon and authenticated held UPDATE (and INSERT) on twenty columns,
--   cedula, email, id, auth_id, familia_id, fecha_registro and estado_civil
--   among them. Every app write to usuarios already goes through the service
--   client after puede_editar_usuario (lib/actions/user.actions.ts,
--   photo.actions.ts, auth.actions.ts, app/api/import/grupos).
--   Now authenticated keeps UPDATE only on telefono, foto_perfil_url,
--   ocupacion_id and profesion_id; anon keeps no UPDATE or INSERT. direccion_id
--   is left out on purpose: pointing it at another address would open that
--   address through puede_ver_direccion.
--   The UPDATE policy "Los usuarios pueden editar perfiles según su rol"
--   called puede_ver_usuario(auth.uid(), id), mixing id kinds (always false
--   since lot 6); it now uses puede_editar_usuario(auth.uid(), id).
--   actualizar_usuario_y_direccion (invoker, no caller in the app, wrote
--   cedula and email) loses EXECUTE for PUBLIC, anon and authenticated.

CREATE OR REPLACE FUNCTION public.puede_ver_direccion(p_direccion_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_me uuid;
BEGIN
  IF v_auth IS NULL OR p_direccion_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT u.id INTO v_me FROM public.usuarios u WHERE u.auth_id = v_auth;
  IF v_me IS NULL THEN
    RETURN false;
  END IF;

  IF public.es_superadmin(v_me) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.usuarios u
                  WHERE u.direccion_id = p_direccion_id
                    AND (public.puede_ver_usuario(v_me, u.id)
                         OR public.puede_ver_usuario_ficha(v_auth, u.id)))
      OR EXISTS (SELECT 1 FROM public.familias f
                   JOIN public.usuarios u ON u.familia_id = f.id
                  WHERE f.direccion_id = p_direccion_id
                    AND (public.puede_ver_usuario(v_me, u.id)
                         OR public.puede_ver_usuario_ficha(v_auth, u.id)))
      OR EXISTS (SELECT 1 FROM public.grupos g
                  WHERE g.direccion_anfitrion_id = p_direccion_id
                    AND public.puede_ver_grupo(v_me, g.id));
END;
$function$;

REVOKE ALL ON FUNCTION public.puede_ver_direccion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_ver_direccion(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.puede_editar_direccion(p_direccion_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth uuid := auth.uid();
  v_me uuid;
BEGIN
  IF v_auth IS NULL OR p_direccion_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT u.id INTO v_me FROM public.usuarios u WHERE u.auth_id = v_auth;
  IF v_me IS NULL THEN
    RETURN false;
  END IF;

  IF public.es_superadmin(v_me) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.usuarios u
                  WHERE u.direccion_id = p_direccion_id
                    AND public.puede_editar_usuario(v_auth, u.id))
      OR EXISTS (SELECT 1 FROM public.familias f
                   JOIN public.usuarios u ON u.familia_id = f.id
                  WHERE f.direccion_id = p_direccion_id
                    AND public.puede_editar_usuario(v_auth, u.id))
      OR EXISTS (SELECT 1 FROM public.grupos g
                  WHERE g.direccion_anfitrion_id = p_direccion_id
                    AND public.puede_editar_grupo(v_auth, g.id));
END;
$function$;

REVOKE ALL ON FUNCTION public.puede_editar_direccion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_editar_direccion(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Los usuarios autenticados pueden ver todas las direcciones" ON public.direcciones;
DROP POLICY IF EXISTS "Los usuarios pueden editar su propia dirección o los líderes " ON public.direcciones;
DROP POLICY IF EXISTS "Solo los líderes pueden eliminar direcciones" ON public.direcciones;
DROP POLICY IF EXISTS "Los usuarios autenticados pueden crear direcciones" ON public.direcciones;

CREATE POLICY "direcciones_select_segun_ficha_grupo_o_casa" ON public.direcciones
  FOR SELECT TO authenticated
  USING (
    public.puede_ver_direccion(id)
    OR EXISTS (SELECT 1 FROM public.casas_anfitrionas c WHERE c.direccion_id = direcciones.id)
  );

CREATE POLICY "direcciones_update_segun_ficha_o_grupo" ON public.direcciones
  FOR UPDATE TO authenticated
  USING (public.puede_editar_direccion(id))
  WITH CHECK (public.puede_editar_direccion(id));

CREATE POLICY "direcciones_insert_con_sesion" ON public.direcciones
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

REVOKE ALL ON public.direcciones FROM anon;
REVOKE DELETE, TRUNCATE ON public.direcciones FROM authenticated;

-- D2
REVOKE INSERT, UPDATE ON public.usuarios FROM anon;
REVOKE UPDATE ON public.usuarios FROM authenticated;
GRANT UPDATE (telefono, foto_perfil_url, ocupacion_id, profesion_id) ON public.usuarios TO authenticated;

DROP POLICY IF EXISTS "Los usuarios pueden editar perfiles según su rol" ON public.usuarios;
CREATE POLICY "Los usuarios pueden editar perfiles según su rol" ON public.usuarios
  FOR UPDATE TO authenticated
  USING (public.puede_editar_usuario((SELECT auth.uid()), id))
  WITH CHECK (public.puede_editar_usuario((SELECT auth.uid()), id));

REVOKE ALL ON FUNCTION public.actualizar_usuario_y_direccion(uuid, text, text, text, text, text, date, text, text, uuid, uuid, uuid, text, text, text, text, uuid, double precision, double precision) FROM PUBLIC, anon, authenticated;
-- migration end

-- a. SELECT direcciones
SELECT pg_temp.expect('a.admin/' || d, 'admin', 'user', pg_temp.sel(d), '1') FROM unnest(ARRAY['own','member','stranger']) d;
SELECT pg_temp.expect('a.de/' || d, 'de', 'user', pg_temp.sel(d), '1') FROM unnest(ARRAY['own','member','stranger']) d;
SELECT pg_temp.expect('a.lider/member', 'lider', 'user', pg_temp.sel('member'), '1');
SELECT pg_temp.expect('a.lider/stranger', 'lider', 'user', pg_temp.sel('stranger'), '0');
SELECT pg_temp.expect('a.miembro/own', 'miembro', 'user', pg_temp.sel('own'), '1');
SELECT pg_temp.expect('a.miembro/member', 'miembro', 'user', pg_temp.sel('member'), '0');
SELECT pg_temp.expect('a.miembro/stranger', 'miembro', 'user', pg_temp.sel('stranger'), '0');
SELECT pg_temp.expect('a.anon/own', 'admin', 'anon', pg_temp.sel('own'), '42501');

-- b. UPDATE direcciones
SELECT pg_temp.expect('b.miembro/own', 'miembro', 'user', pg_temp.upd_dir('own'), '1');
SELECT pg_temp.expect('b.miembro/stranger', 'miembro', 'user', pg_temp.upd_dir('stranger'), '0');
SELECT pg_temp.expect('b.lider/member', 'lider', 'user', pg_temp.upd_dir('member'), '1');
SELECT pg_temp.expect('b.lider/stranger', 'lider', 'user', pg_temp.upd_dir('stranger'), '0');

-- c. DELETE direcciones
SELECT pg_temp.expect('c.lider/member', 'lider', 'user', pg_temp.del_dir('member'), '42501');
SELECT pg_temp.expect('c.admin/stranger', 'admin', 'user', pg_temp.del_dir('stranger'), '42501');

-- d. usuarios columns
SELECT pg_temp.expect('d.miembro/telefono', 'miembro', 'user',
  pg_temp.upd_usr(pg_temp.uid_of('miembro'), 'telefono = telefono'), '1');
SELECT pg_temp.expect('d.miembro/foto', 'miembro', 'user',
  pg_temp.upd_usr(pg_temp.uid_of('miembro'), 'foto_perfil_url = foto_perfil_url'), '1');
SELECT pg_temp.expect('d.miembro/' || c, 'miembro', 'user',
  pg_temp.upd_usr(pg_temp.uid_of('miembro'), c || ' = ' || c), '42501')
  FROM unnest(ARRAY['cedula','email','auth_id','familia_id','fecha_registro','estado_civil','direccion_id','id']) c;
SELECT pg_temp.expect('d.lider/member-telefono', 'lider', 'user',
  pg_temp.upd_usr(pg_temp.usr_of('member'), 'telefono = telefono'), '1');
SELECT pg_temp.expect('d.lider/stranger-telefono', 'lider', 'user',
  pg_temp.upd_usr(pg_temp.usr_of('stranger'), 'telefono = telefono'), '0');
SELECT pg_temp.expect('d.anon/telefono', 'admin', 'anon',
  pg_temp.upd_usr(pg_temp.uid_of('miembro'), 'telefono = telefono'), '42501');

-- e. catalog
DO $$
BEGIN
  IF to_regprocedure('public.puede_ver_direccion(uuid)') IS NULL
     OR to_regprocedure('public.puede_editar_direccion(uuid)') IS NULL THEN
    PERFORM pg_temp.fail('e.catalog', 'new functions missing');
  ELSIF has_function_privilege('anon', 'public.puede_ver_direccion(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.puede_editar_direccion(uuid)', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
                 WHERE p.oid IN ('public.puede_ver_direccion(uuid)'::regprocedure,
                                 'public.puede_editar_direccion(uuid)'::regprocedure)
                   AND a.grantee = 0) THEN
    PERFORM pg_temp.fail('e.catalog', 'anon or PUBLIC can execute a new definer function');
  END IF;
  IF has_function_privilege('authenticated',
       'public.actualizar_usuario_y_direccion(uuid,text,text,text,text,text,date,text,text,uuid,uuid,uuid,text,text,text,text,uuid,double precision,double precision)',
       'EXECUTE') THEN
    PERFORM pg_temp.fail('e.catalog', 'authenticated can execute actualizar_usuario_y_direccion');
  END IF;
  -- definer-sin-anon, check a, after the block. verificar_certificado_publico
  -- is public on purpose (lot 4, logged-out certificate lookup).
  IF EXISTS (SELECT 1 FROM pg_proc p
              WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.prokind = 'f'
                AND p.oid <> 'public.verificar_certificado_publico(text)'::regprocedure
                AND (has_function_privilege('anon', p.oid, 'EXECUTE')
                     OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0))) THEN
    PERFORM pg_temp.fail('e.definer-sin-anon', 'a public definer function is executable by anon or PUBLIC');
  END IF;
END;
$$;

SELECT kind, case_name, detail FROM (
  SELECT 1 o, 'failure' kind, case_name, detail FROM t_du_failures
  UNION ALL SELECT 2, 'fixture', label, (direccion_id IS NOT NULL AND usuario_id IS NOT NULL)::text FROM t_du_fix
  UNION ALL SELECT 3, 'observed', case_name, result FROM t_du_obs
) s ORDER BY o, case_name;

ROLLBACK;
