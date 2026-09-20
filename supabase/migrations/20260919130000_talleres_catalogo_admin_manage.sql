-- T2 (odd/tasks/talleres-consolidar-pantallas.md) — talleres write
-- policies must also accept admin.manage, tree-scoped.
--
-- WHY
--   T1's talleres_mis_permisos.sql header already flagged this
--   asymmetry: create_taller_abstract accepts director.write OR
--   admin.manage (20260918160000_create_taller_abstract_equipo_choice.sql),
--   and every other talleres-owned table's write policies already OR in
--   admin.manage (talleres_crecimiento_cohortes, taller_ediciones — see
--   20260918190000_talleres_scoped_policies_core.sql) — but the three
--   direct write policies on public.talleres itself
--   (talleres_insert_director, talleres_update_director,
--   talleres_delete_director) only ever checked director.write. Net
--   effect: an admin-only identity (admin.manage, no director.write)
--   can CREATE a taller through the RPC, then cannot rename, delete, or
--   directly re-insert it.
--
-- WHAT
--   ALTER POLICY on the same three policies, same tree-scoped shape as
--   every other table in this group
--   (auth_has_talleres_capability_scoped('talleres_crecimiento.<key>',
--   dream_team_equipo_id)): OR in
--   auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage',
--   dream_team_equipo_id) alongside the existing director.write branch.
--   Policy names and command bindings are unchanged — only the
--   USING/WITH CHECK bodies grow the new OR branch.
--
--   talleres_select_all (PUBLIC, USING (true) for any authenticated
--   user — the catalog is meant to be broadly browsable) is untouched,
--   per this task's explicit scope.
--
-- SAFETY
--   ALTER POLICY rewrites USING/WITH CHECK in place — the table is
--   never left without a matching policy for its command. No table,
--   column, or policy is dropped or renamed. The existing
--   director.write branch is preserved byte-for-byte; only a new OR
--   branch is added.
--
-- ROLLBACK
--   Re-apply each ALTER POLICY below with only the director.write
--   branch (drop the admin.manage OR clause) via ALTER POLICY.

ALTER POLICY talleres_insert_director ON public.talleres
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', dream_team_equipo_id)
  );

ALTER POLICY talleres_update_director ON public.talleres
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', dream_team_equipo_id)
  )
  WITH CHECK (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', dream_team_equipo_id)
  );

ALTER POLICY talleres_delete_director ON public.talleres
  USING (
    public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', dream_team_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', dream_team_equipo_id)
  );
