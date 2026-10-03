-- Only the server changes usuario_roles (security phase 3).
--
-- What: drops every INSERT, UPDATE and DELETE policy on public.usuario_roles;
-- anon loses every privilege on the table and authenticated keeps only SELECT,
-- with its read policy unchanged (read exposure is a later batch). A final
-- check raises if anon or authenticated still hold anything else, at table or
-- column level. service_role keeps every privilege and bypasses RLS.
--
-- Why: three write policies apply to every role and only ask whether the
-- session holds a leadership role, never which row is written:
--   "Solo los líderes pueden asignar roles (insert)"  WITH CHECK tiene_rol_de_liderazgo(auth.uid())
--   "Solo los líderes pueden asignar roles (update)"  USING tiene_rol_de_liderazgo(auth.uid())
--   "Solo los líderes pueden eliminar roles"          USING tiene_rol_de_liderazgo(auth.uid())
-- So any account with a leadership role (lider, director-etapa,
-- director-general, pastor, admin) can give itself or anybody the admin role,
-- or change or remove anybody's roles, through the REST API.
--
-- The policies were created by hand and their names may differ between
-- projects, so the DO block finds them by command (polcmd a, w, d), drops them
-- all and reports their names in a NOTICE. A policy FOR ALL would also cover
-- reads, so it is left alone; the REVOKE closes writes in any case, because
-- privileges are checked before policies.
--
-- Callers (rg "from('usuario_roles')" in app, lib, components and hooks;
-- staging pg_proc, 2026-10-03). Every write goes through the service-role
-- client (createSupabaseAdminClient), which this change does not touch:
--   app/api/usuarios/cambiar-rol/route.ts:43,51  delete + insert, after checking admin
--   lib/actions/user.actions.ts:405               insert of the miembro role for a new person
--   lib/actions/gdv-directores.actions.ts:68      insert of the director-general role
--   app/api/import/grupos/route.ts:146            insert of the miembro role
-- The other calls only read: lib/actions/gdv-directores.actions.ts:61,272,289,
-- lib/actions/dg-segmentos.actions.ts:53,
-- lib/platform/grupos-vida/directores-datos.ts:90,
-- app/api/lideres/buscar/route.ts:44,
-- app/api/segmentos/[segmentoId]/directores-etapa/candidatos/route.ts:47, and
-- the embedded selects of hooks/use-usuarios.ts and hooks/use-usuario-detalle.ts.
-- In the database the only function that writes the table is
-- dream_team_cargar_voluntarios (invoker), executable only by service_role; the
-- trigger trg_sync_pastoral_grants_on_role_change runs its function as definer.
-- No view reads the table.
--
-- Grants: anon and authenticated held SELECT, INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES, TRIGGER and, on PostgreSQL 17, MAINTAIN. REVOKE ALL
-- takes every one of them on any version (a list of names would miss
-- MAINTAIN), and GRANT SELECT gives authenticated back its read. anon reads
-- nothing here today (the read policy asks for auth.role() = 'authenticated'),
-- and its reads of usuarios, segmento_lideres and director_general_segmentos,
-- whose policies look into usuario_roles, already fail with 42501 on
-- functions phase 1 closed to anon, so no working anon path changes. No column
-- grant existed on staging, and a table-level REVOKE also removes column
-- grants (tested on staging); the final check still looks at both levels, so
-- a grant this file cannot revoke (another grantor) fails the migration.
--
-- Rollback (as captured on staging, 2026-10-03; the policies apply to PUBLIC):
--   GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
--     ON public.usuario_roles TO anon, authenticated;   (MAINTAIN on PostgreSQL 17+)
--   CREATE POLICY "Solo los líderes pueden asignar roles (insert)" ON public.usuario_roles
--     FOR INSERT WITH CHECK (tiene_rol_de_liderazgo(auth.uid()));
--   CREATE POLICY "Solo los líderes pueden asignar roles (update)" ON public.usuario_roles
--     FOR UPDATE USING (tiene_rol_de_liderazgo(auth.uid()));
--   CREATE POLICY "Solo los líderes pueden eliminar roles" ON public.usuario_roles
--     FOR DELETE USING (tiene_rol_de_liderazgo(auth.uid()));

DO $$
DECLARE
  v_policy record;
  v_dropped text[] := '{}';
BEGIN
  FOR v_policy IN
    SELECT pol.polname
      FROM pg_policy pol
     WHERE pol.polrelid = 'public.usuario_roles'::regclass
       AND pol.polcmd IN ('a', 'w', 'd')
     ORDER BY pol.polname
  LOOP
    EXECUTE format('DROP POLICY %I ON public.usuario_roles', v_policy.polname);
    v_dropped := v_dropped || v_policy.polname::text;
  END LOOP;

  RAISE NOTICE 'usuario_roles: dropped % write policies: %',
    cardinality(v_dropped),
    coalesce(nullif(array_to_string(v_dropped, ', '), ''), '(none)');
END;
$$;

-- Writes only through the service role; anon gets nothing, authenticated reads.
REVOKE ALL ON public.usuario_roles FROM anon, authenticated;
GRANT SELECT ON public.usuario_roles TO authenticated;

-- Fail loudly if anything else is left for anon, authenticated or PUBLIC: a
-- table privilege other than authenticated's SELECT, or any column grant.
DO $$
DECLARE
  v_left text;
BEGIN
  SELECT string_agg(x.what, ', ' ORDER BY x.what) INTO v_left
    FROM (
      SELECT format('table %s %s', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
                    a.privilege_type) AS what
        FROM pg_class c, aclexplode(c.relacl) a
       WHERE c.oid = 'public.usuario_roles'::regclass
         AND (a.grantee IN (0::oid, 'anon'::regrole::oid, 'authenticated'::regrole::oid))
         AND NOT (a.grantee = 'authenticated'::regrole::oid AND a.privilege_type = 'SELECT')
      UNION ALL
      SELECT format('column %s %s %s', att.attname,
                    CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, a.privilege_type)
        FROM pg_attribute att, aclexplode(att.attacl) a
       WHERE att.attrelid = 'public.usuario_roles'::regclass
         AND att.attnum > 0 AND NOT att.attisdropped
         AND a.grantee IN (0::oid, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
      UNION ALL
      SELECT format('column_privileges %s %s %s', cp.column_name, cp.grantee, cp.privilege_type)
        FROM information_schema.column_privileges cp
       WHERE cp.table_schema = 'public' AND cp.table_name = 'usuario_roles'
         AND cp.grantee IN ('PUBLIC', 'anon', 'authenticated')
         AND NOT (cp.grantee = 'authenticated' AND cp.privilege_type = 'SELECT')) x;

  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'usuario_roles still grants: %', v_left;
  END IF;
END;
$$;
