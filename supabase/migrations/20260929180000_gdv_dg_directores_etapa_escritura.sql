-- Grupos de Vida — only admin and pastor write the director general -> director
-- de etapa marks.
--
-- The write policy of public.dg_directores_etapa (dg_de_manage, FOR ALL) let any
-- person with the director-general role insert and delete the marks of ANY
-- director general, which would let a director general widen their own scope.
-- The policy is replaced so that only admin and pastor write. SELECT
-- (dg_de_select) is not touched.
--
-- The helper is es_admin_o_pastor(auth.uid()): a security definer function that
-- resolves the person through usuarios.auth_id. The sibling table's policy
-- (dg_segmentos_admin_pastor) calls es_superadmin(auth.uid()), but that helper
-- compares usuario_roles.usuario_id with the AUTH id, which only matches the few
-- accounts whose usuarios.id equals their auth id, so it does not recognise an
-- admin in general.

drop policy if exists dg_de_manage on public.dg_directores_etapa;

create policy dg_de_manage on public.dg_directores_etapa
  for all
  using (public.es_admin_o_pastor((select auth.uid())))
  with check (public.es_admin_o_pastor((select auth.uid())));
