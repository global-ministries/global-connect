-- Behavioural test for talleres_role_capability_map access control
-- (migration 20260918130000_talleres_capability_map_rls.sql).
--
-- Run it through the Supabase MCP execute_sql (or psql) as the owner role.
-- It is one DO block that always ends in RAISE, so nothing persists.
-- PASS: the error message is 'ROLLBACK_OK all_pass'.
-- FAIL: 'ROLLBACK_OK FAILURES: ...' lists every broken expectation.
--
-- Observed 2026-09-18: production before the migration listed 9 failures
-- (anon read and inserted, a member deleted every row); staging before the
-- migration failed only on privileges; both passed after it.
do $$
declare
  v_member_auth uuid;
  v_member_id   uuid;
  v_fail  text[] := '{}';
  v_n     int;
  v_ok    boolean;
begin
  -- A real signed-in member who holds no Dream Team / talleres grant.
  select u.auth_id, u.id into v_member_auth, v_member_id
  from public.usuarios u
  where u.auth_id is not null
    and not exists (select 1 from public.dream_team_capability_grants g
                    where g.persona_id = u.id and g.revoked_at is null)
  order by u.id limit 1;
  if v_member_id is null then raise exception 'no plain member found'; end if;

  -- 1. Privileges: anon and authenticated must hold no write privilege.
  foreach v_ok in array array[
    has_table_privilege('anon',          'public.talleres_role_capability_map', 'INSERT,UPDATE,DELETE,TRUNCATE'),
    has_table_privilege('authenticated', 'public.talleres_role_capability_map', 'INSERT,UPDATE,DELETE,TRUNCATE')]
  loop
    if v_ok then v_fail := v_fail || 'write privilege still granted'::text; end if;
  end loop;

  -- 2. RLS must be enabled.
  if not (select relrowsecurity from pg_class where oid = 'public.talleres_role_capability_map'::regclass) then
    v_fail := v_fail || 'rls disabled'::text;
  end if;

  -- 3. anon (what PostgREST uses with the public key) cannot read or write.
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    select count(*) into v_n from public.talleres_role_capability_map;
    if v_n > 0 then v_fail := v_fail || format('anon reads %s rows', v_n); end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.talleres_role_capability_map (rol, capability_key, scope_type)
    values ('zz_rls_probe_anon', 'talleres_crecimiento.admin.manage', 'taller');
    v_fail := v_fail || 'anon inserted a mapping'::text;
  exception
    when insufficient_privilege then null;
    when others then v_fail := v_fail || ('anon insert unexpected: ' || sqlerrm);
  end;
  reset role;

  -- 4. A signed-in member cannot read or write either.
  perform set_config('request.jwt.claims', json_build_object('sub', v_member_auth, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    select count(*) into v_n from public.talleres_role_capability_map;
    if v_n > 0 then v_fail := v_fail || format('member reads %s rows', v_n); end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.talleres_role_capability_map (rol, capability_key, scope_type)
    values ('zz_rls_probe_member', 'talleres_crecimiento.admin.manage', 'taller');
    v_fail := v_fail || 'member inserted a mapping'::text;
  exception
    when insufficient_privilege then null;
    when others then v_fail := v_fail || ('member insert unexpected: ' || sqlerrm);
  end;
  begin
    delete from public.talleres_role_capability_map;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_fail := v_fail || format('member deleted %s rows', v_n); end if;
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 5. The auto-grant path (SECURITY DEFINER, owner postgres) still works.
  select public.assign_talleres_capabilities_for_role(v_member_id, 'director', gen_random_uuid()) into v_n;
  if v_n <> 4 then v_fail := v_fail || format('auto-grant inserted %s grants, expected 4', v_n); end if;

  if cardinality(v_fail) = 0 then
    raise exception 'ROLLBACK_OK all_pass';
  else
    raise exception 'ROLLBACK_OK FAILURES: %', array_to_string(v_fail, ' | ');
  end if;
end $$;
