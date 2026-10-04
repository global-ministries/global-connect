-- D3 follow-up (odd/tasks/seguridad-pendientes-talleres.md): pending links by
-- cédula for fichas that hold a service role, migration 20261004110000.
--
-- Covers:
--   a. Catalog: table has RLS on, no anon/authenticated grants; the RPCs are
--      definer with search_path pinned, not executable by anon or PUBLIC; the
--      internal predicate is not executable by authenticated.
--   b. Listing: the director de etapa of the person's active group and an admin
--      see the request, masked (initials, cédula with only the last 3 digits);
--      an unrelated leader and a session-less caller see nothing.
--   c. Resolving: the unrelated leader gets NO_ENCONTRADO and nothing changes;
--      the director de etapa approves, usuarios.auth_id is set, a second open
--      request for the same ficha is rejected, a repeated resolve is
--      YA_RESUELTO; approval never overwrites a ficha that already has an
--      account (FICHA_YA_VINCULADA); a rejection leaves the ficha untouched.
--   d. anon cannot execute either RPC (42501).
--
-- Actors are picked from live staging data (a director de etapa with an active
-- group, an admin, a leader-only person). The person, the requesting accounts
-- and the requests are fixtures. Run against STAGING inside BEGIN...ROLLBACK;
-- the last statement lists the failing cases (empty = all ok).

BEGIN;

\ir ../migrations/20261004110000_vinculos_por_cedula_pendientes.sql

CREATE TEMP TABLE t_res (caso text, ok boolean, detalle text) ON COMMIT DROP;

CREATE FUNCTION pg_temp.como(p_auth uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_auth IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
  END IF;
  PERFORM set_config('request.jwt.claim.role',
    CASE WHEN p_auth IS NULL THEN 'anon' ELSE 'authenticated' END, true);
END $$;

CREATE FUNCTION pg_temp.ok(p_caso text, p_ok boolean, p_detalle text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_res VALUES (p_caso, coalesce(p_ok, false), p_detalle);
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO PUBLIC;
GRANT ALL ON t_res TO PUBLIC;

-- Fixtures and actors.
CREATE TEMP TABLE t_ctx ON COMMIT DROP AS
WITH de AS (
  SELECT g.id AS grupo_id, u.auth_id AS de_auth
  FROM public.director_etapa_grupos deg
  JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id AND sl.tipo_lider = 'director_etapa'
  JOIN public.usuarios u ON u.id = sl.usuario_id
  JOIN public.grupos g ON g.id = deg.grupo_id
  WHERE g.activo AND g.eliminado IS NOT TRUE AND u.auth_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.usuario_roles ur JOIN public.roles_sistema rs ON rs.id = ur.rol_id
      WHERE ur.usuario_id = u.id AND rs.nombre_interno IN ('admin', 'pastor'))
  ORDER BY g.id LIMIT 1
)
SELECT
  de.grupo_id,
  de.de_auth,
  (SELECT u.auth_id FROM public.usuarios u
     JOIN public.usuario_roles ur ON ur.usuario_id = u.id
     JOIN public.roles_sistema rs ON rs.id = ur.rol_id
   WHERE rs.nombre_interno = 'admin' AND u.auth_id IS NOT NULL
   ORDER BY u.id LIMIT 1) AS admin_auth,
  (SELECT u.auth_id FROM public.usuarios u
     JOIN public.usuario_roles ur ON ur.usuario_id = u.id
     JOIN public.roles_sistema rs ON rs.id = ur.rol_id
   WHERE rs.nombre_interno = 'lider' AND u.auth_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.usuario_roles r2 JOIN public.roles_sistema s2 ON s2.id = r2.rol_id
       WHERE r2.usuario_id = u.id AND s2.nombre_interno NOT IN ('lider', 'miembro'))
     AND NOT EXISTS (
       SELECT 1 FROM public.segmento_lideres sl WHERE sl.usuario_id = u.id)
   ORDER BY u.id LIMIT 1) AS lider_auth,
  gen_random_uuid() AS ficha_id,
  gen_random_uuid() AS ficha2_id,
  gen_random_uuid() AS sol1,
  gen_random_uuid() AS sol2,
  gen_random_uuid() AS sol3
FROM de;

INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'vp-test-' || x || '@example.test'
FROM t_ctx, unnest(ARRAY[sol1, sol2, sol3]) AS x;

INSERT INTO public.usuarios (id, nombre, apellido, genero, estado_civil, cedula)
SELECT ficha_id, 'Zacarias', 'Quintero', 'Otro'::public.enum_genero, 'Soltero'::public.enum_estado_civil, '87654321' FROM t_ctx
UNION ALL
SELECT ficha2_id, 'Yolanda', 'Rivas', 'Otro'::public.enum_genero, 'Soltero'::public.enum_estado_civil, '87654999' FROM t_ctx;

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT c.ficha_id, rs.id FROM t_ctx c, public.roles_sistema rs WHERE rs.nombre_interno = 'lider'
UNION ALL
SELECT c.ficha2_id, rs.id FROM t_ctx c, public.roles_sistema rs WHERE rs.nombre_interno = 'lider';

INSERT INTO public.grupo_miembros (grupo_id, usuario_id, rol)
SELECT grupo_id, ficha_id, 'Miembro'::public.enum_rol_grupo FROM t_ctx
UNION ALL
SELECT grupo_id, ficha2_id, 'Miembro'::public.enum_rol_grupo FROM t_ctx;

CREATE TEMP TABLE t_req ON COMMIT DROP AS
SELECT gen_random_uuid() AS r1, gen_random_uuid() AS r2, gen_random_uuid() AS r3;
GRANT ALL ON t_ctx, t_req TO PUBLIC;

INSERT INTO public.vinculos_pendientes (id, ficha_id, auth_user_id)
SELECT r.r1, c.ficha_id, c.sol1 FROM t_ctx c, t_req r
UNION ALL SELECT r.r2, c.ficha_id, c.sol2 FROM t_ctx c, t_req r
UNION ALL SELECT r.r3, c.ficha2_id, c.sol3 FROM t_ctx c, t_req r;

SELECT pg_temp.ok('fixtures: actors found',
  de_auth IS NOT NULL AND admin_auth IS NOT NULL AND lider_auth IS NOT NULL)
FROM t_ctx;

-- a. Catalog.
SELECT pg_temp.ok('a: rls on', relrowsecurity)
FROM pg_class WHERE oid = 'public.vinculos_pendientes'::regclass;
SELECT pg_temp.ok('a: no table grants for anon/authenticated',
  NOT has_table_privilege('anon', 'public.vinculos_pendientes', 'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated', 'public.vinculos_pendientes', 'SELECT,INSERT,UPDATE,DELETE'));
SELECT pg_temp.ok('a: ' || p.proname || ' definer + search_path',
  p.prosecdef AND p.proconfig @> ARRAY['search_path=public'])
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('vinculos_pendientes_listar', 'vinculo_pendiente_resolver', 'vinculo_pendiente_puede_resolver');
SELECT pg_temp.ok('a: anon cannot execute ' || f,
  NOT has_function_privilege('anon', f, 'EXECUTE'))
FROM unnest(ARRAY['public.vinculos_pendientes_listar()',
                  'public.vinculo_pendiente_resolver(uuid, boolean)',
                  'public.vinculo_pendiente_puede_resolver(uuid, uuid)']) AS f;
SELECT pg_temp.ok('a: authenticated cannot execute the internal predicate',
  NOT has_function_privilege('authenticated', 'public.vinculo_pendiente_puede_resolver(uuid, uuid)', 'EXECUTE'));

SET LOCAL ROLE authenticated;

-- b. Listing.
SELECT pg_temp.como(de_auth) FROM t_ctx;
SELECT pg_temp.ok('b: director de etapa sees both requests for the ficha',
  (SELECT count(*) FROM public.vinculos_pendientes_listar() l, t_ctx c WHERE l.ficha_id = c.ficha_id) = 2);
SELECT pg_temp.ok('b: masked name and cedula',
  l.nombre_enmascarado = 'Z. Q.' AND l.cedula_enmascarada = '*****321',
  l.nombre_enmascarado || ' ' || l.cedula_enmascarada)
FROM public.vinculos_pendientes_listar() l, t_ctx c WHERE l.ficha_id = c.ficha_id LIMIT 1;

SELECT pg_temp.como(admin_auth) FROM t_ctx;
SELECT pg_temp.ok('b: admin sees the requests',
  (SELECT count(*) FROM public.vinculos_pendientes_listar() l, t_ctx c
   WHERE l.ficha_id IN (c.ficha_id, c.ficha2_id)) = 3);

SELECT pg_temp.como(lider_auth) FROM t_ctx;
SELECT pg_temp.ok('b: unrelated leader sees nothing',
  (SELECT count(*) FROM public.vinculos_pendientes_listar() l, t_ctx c
   WHERE l.ficha_id IN (c.ficha_id, c.ficha2_id)) = 0);

-- c. Resolving.
SELECT pg_temp.ok('c: unrelated leader cannot resolve',
  public.vinculo_pendiente_resolver(r1, true) ->> 'codigo' = 'NO_ENCONTRADO')
FROM t_req;

SELECT pg_temp.como(de_auth) FROM t_ctx;
SELECT pg_temp.ok('c: director de etapa approves',
  public.vinculo_pendiente_resolver(r1, true) ->> 'estado' = 'aprobado')
FROM t_req;
SELECT pg_temp.ok('c: repeated resolve is YA_RESUELTO',
  public.vinculo_pendiente_resolver(r1, false) ->> 'codigo' = 'YA_RESUELTO')
FROM t_req;
SELECT pg_temp.ok('c: other request for the same ficha is closed',
  public.vinculo_pendiente_resolver(r2, true) ->> 'codigo' = 'YA_RESUELTO')
FROM t_req;

SELECT pg_temp.ok('c: director de etapa rejects',
  public.vinculo_pendiente_resolver(r3, false) ->> 'estado' = 'rechazado')
FROM t_req;

SELECT pg_temp.como(NULL);
SELECT pg_temp.ok('b: no session sees nothing',
  (SELECT count(*) FROM public.vinculos_pendientes_listar()) = 0);

RESET ROLE;

SELECT pg_temp.ok('c: approved ficha now has the account',
  (SELECT auth_id FROM public.usuarios WHERE id = c.ficha_id) = c.sol1)
FROM t_ctx c;
SELECT pg_temp.ok('c: rejected ficha untouched',
  (SELECT auth_id FROM public.usuarios WHERE id = c.ficha2_id) IS NULL)
FROM t_ctx c;
SELECT pg_temp.ok('c: states recorded',
  (SELECT string_agg(estado, ',' ORDER BY estado) FROM public.vinculos_pendientes
   WHERE id IN (r.r1, r.r2, r.r3)) = 'aprobado,rechazado,rechazado'
  AND NOT EXISTS (SELECT 1 FROM public.vinculos_pendientes
                  WHERE id IN (r.r1, r.r2, r.r3) AND (resuelto_en IS NULL OR resuelto_por IS NULL)))
FROM t_req r;

-- Approval never overwrites a ficha that already has an account.
UPDATE public.usuarios u SET auth_id = c.sol2 FROM t_ctx c WHERE u.id = c.ficha2_id;
INSERT INTO public.vinculos_pendientes (ficha_id, auth_user_id)
SELECT ficha2_id, sol3 FROM t_ctx;
CREATE TEMP TABLE t_req4 ON COMMIT DROP AS
SELECT vp.id AS r4 FROM public.vinculos_pendientes vp, t_ctx c
WHERE vp.ficha_id = c.ficha2_id AND vp.estado = 'pendiente';
GRANT ALL ON t_req4 TO PUBLIC;
SET LOCAL ROLE authenticated;
SELECT pg_temp.como(admin_auth) FROM t_ctx;
SELECT pg_temp.ok('c: FICHA_YA_VINCULADA when the ficha got an account',
  public.vinculo_pendiente_resolver(r4, true) ->> 'codigo' = 'FICHA_YA_VINCULADA')
FROM t_req4;
RESET ROLE;
SELECT pg_temp.ok('c: that ficha keeps its account',
  (SELECT auth_id FROM public.usuarios WHERE id = c.ficha2_id) = c.sol2)
FROM t_ctx c;

-- d. anon.
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.vinculos_pendientes_listar();
  PERFORM pg_temp.ok('d: anon listar refused', false);
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM pg_temp.ok('d: anon listar refused', true);
END $$;
DO $$
BEGIN
  PERFORM public.vinculo_pendiente_resolver(gen_random_uuid(), true);
  PERFORM pg_temp.ok('d: anon resolver refused', false);
EXCEPTION WHEN insufficient_privilege THEN
  PERFORM pg_temp.ok('d: anon resolver refused', true);
END $$;
RESET ROLE;

SELECT caso, detalle FROM t_res WHERE NOT ok
UNION ALL
SELECT 'total cases', count(*)::text FROM t_res;

ROLLBACK;
