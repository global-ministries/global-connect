-- Only the server changes usuario_roles (security phase 3).
--
-- What: drops every INSERT, UPDATE and DELETE policy on public.usuario_roles
-- and revokes INSERT, UPDATE, DELETE and TRUNCATE on the table from anon and
-- authenticated. The SELECT policy and the read privileges stay exactly as
-- they are (read exposure is a later batch). service_role keeps every
-- privilege and bypasses RLS.
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
-- Rollback (as captured on staging, 2026-10-03; the policies apply to PUBLIC):
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.usuario_roles TO anon, authenticated;
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

-- Writes only through the service role.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.usuario_roles FROM anon, authenticated;
