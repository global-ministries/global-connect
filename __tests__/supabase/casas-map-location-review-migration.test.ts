import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
const testsDir = join(process.cwd(), 'supabase', 'tests')
const rpcSignatures = [
  ['obtener_mapa_grupos_vida_host_homes', 'obtener_mapa_grupos_vida_host_homes(uuid, text)'],
  ['obtener_grupos_sin_casa_anfitriona', 'obtener_grupos_sin_casa_anfitriona(uuid, text)'],
  ['obtener_casas_revision_pendiente', 'obtener_casas_revision_pendiente(uuid)'],
  ['asignar_casa_anfitriona_a_grupo', 'asignar_casa_anfitriona_a_grupo(uuid, uuid, uuid)'],
  ['procesar_revision_ubicacion_casa', 'procesar_revision_ubicacion_casa(uuid, uuid, text, text)'],
  ['obtener_mapa_miembros', 'obtener_mapa_miembros(uuid, text)'],
] as const
const readOnlyRpcSignatures = [
  'obtener_mapa_grupos_vida_host_homes(uuid, text)',
  'obtener_grupos_sin_casa_anfitriona(uuid, text)',
  'obtener_casas_revision_pendiente(uuid)',
  'obtener_mapa_miembros(uuid, text)',
] as const
const mutatingRpcSignatures = [
  'asignar_casa_anfitriona_a_grupo(uuid, uuid, uuid)',
  'procesar_revision_ubicacion_casa(uuid, uuid, text, text)',
] as const
const authBoundFunctionNames = [
  'casas_map_user_can_view_group',
  'obtener_mapa_grupos_vida_host_homes',
  'obtener_grupos_sin_casa_anfitriona',
  'obtener_casas_revision_pendiente',
  'puede_asignar_casa_anfitriona_a_grupo',
  'asignar_casa_anfitriona_a_grupo',
  'procesar_revision_ubicacion_casa',
  'obtener_mapa_miembros',
] as const

function readMigration(): string {
  const file = readdirSync(migrationsDir).find((name) => name.endsWith('_casas_map_location_review.sql'))
  if (!file) throw new Error('Missing Casas map location review migration')
  return readFileSync(join(migrationsDir, file), 'utf8')
}

function readMigrationBySuffix(suffix: string): string {
  const file = readdirSync(migrationsDir).find((name) => name.endsWith(suffix))
  if (!file) throw new Error(`Missing Casas migration with suffix ${suffix}`)
  return readFileSync(join(migrationsDir, file), 'utf8')
}

function readSqlTest(name: string): string {
  return readFileSync(join(testsDir, name), 'utf8')
}

function readDoc(name: string): string {
  return readFileSync(join(process.cwd(), 'docs', name), 'utf8')
}

function stripSqlCommentLines(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
}

function extractFunctionBody(sql: string, name: string): string {
  const pattern = new RegExp(String.raw`CREATE OR REPLACE FUNCTION public\.${name}\([\s\S]*?\nAS \$\$\n([\s\S]*?)\n\$\$;`, 'm')
  const match = sql.match(pattern)
  if (!match?.[1]) throw new Error(`Missing function body for ${name}`)
  return match[1]
}

describe('Casas map location review DB foundation', () => {
  it('creates additive tables, indexes, and RLS without historical backfill', () => {
    const sql = readMigration()
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.casa_anfitriona_location_reviews')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.casa_anfitriona_audit_events')
    expect(sql).toContain('ALTER TABLE public.casa_anfitriona_location_reviews ENABLE ROW LEVEL SECURITY;')
    expect(sql).toContain('ALTER TABLE public.casa_anfitriona_audit_events ENABLE ROW LEVEL SECURITY;')
    for (const indexName of [
      'idx_casa_location_reviews_casa',
      'idx_casa_location_reviews_proposed_direction',
      'idx_casa_location_reviews_requested_by',
      'idx_casa_location_reviews_decision_by',
      'idx_casa_location_reviews_pending',
      'idx_casa_audit_events_casa_created',
      'idx_casa_audit_events_actor',
      'idx_casa_audit_events_grupo',
      'idx_casas_map_approved_location',
    ]) expect(sql).toContain(indexName)
    for (const indexSql of [
      'CREATE INDEX IF NOT EXISTS idx_casa_location_reviews_requested_by\nON public.casa_anfitriona_location_reviews(requested_by_user_id);',
      'CREATE INDEX IF NOT EXISTS idx_casa_location_reviews_decision_by\nON public.casa_anfitriona_location_reviews(decision_by_user_id);',
      'CREATE INDEX IF NOT EXISTS idx_casa_audit_events_grupo\nON public.casa_anfitriona_audit_events(grupo_id);',
    ]) expect(sql).toContain(indexSql)
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b|\bTRUNCATE\b|\bDELETE\s+FROM\s+public\./i)
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.casa_anfitriona_(location_reviews|audit_events)\s+SELECT/i)
    expect(sql).not.toMatch(/UPDATE\s+public\.casas_anfitrionas\s+SET\s+direccion_id/i)
  })

  it('defines secured RPC contracts for host-home map, queues, assignment, review, and member layer', () => {
    const sql = readMigration()
    for (const [name, signature] of rpcSignatures) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${name}(`)
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC;`)
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM anon;`)
      expect(sql).not.toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO anon`)
    }
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.casas_map_auth_matches_actor(')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.casas_map_director_general_can_view_group(')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.casas_map_actor_can_approve_review(')
    expect(extractFunctionBody(sql, 'casas_map_auth_matches_actor')).toContain("coalesce(v_request_role, '') = 'service_role'")
    expect(extractFunctionBody(sql, 'casas_map_auth_matches_actor')).toContain('p_auth_id IS NOT DISTINCT FROM auth.uid()')
    for (const name of authBoundFunctionNames) expect(extractFunctionBody(sql, name)).toContain('public.casas_map_auth_matches_actor(p_auth_id)')
    for (const signature of readOnlyRpcSignatures) expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated, service_role;`)
    for (const signature of mutatingRpcSignatures) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM authenticated;`)
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`)
      expect(sql).not.toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated`)
    }
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.casas_map_director_general_can_view_group(uuid, uuid) FROM authenticated;')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.casas_map_actor_can_approve_review(uuid, uuid) FROM authenticated;')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.casas_map_user_can_view_group(uuid, uuid) FROM authenticated;')
    expect(sql).not.toContain('GRANT EXECUTE ON FUNCTION public.casas_map_user_can_view_group(uuid, uuid) TO authenticated')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.casas_map_director_general_can_view_group(uuid, uuid) TO service_role;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.casas_map_actor_can_approve_review(uuid, uuid) TO service_role;')
    expect(sql.match(/SECURITY DEFINER SET search_path TO 'public'/g)).toHaveLength(11)
  })

  it('patches Casas map actor matching for PostgREST JSON JWT claims without broad mutation grants', () => {
    const sql = readMigrationBySuffix('_fix_casas_map_auth_service_role_claims.sql')
    const body = extractFunctionBody(sql, 'casas_map_auth_matches_actor')

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.casas_map_auth_matches_actor(')
    expect(sql).toContain("SECURITY DEFINER SET search_path TO 'public'")
    expect(body).toContain("current_setting('request.jwt.claim.role', true)")
    expect(body).toContain("current_setting('request.jwt.claims', true)")
    expect(body).toContain("v_claims_raw::jsonb ->> 'role'")
    expect(body).toContain('EXCEPTION WHEN others THEN')
    expect(body).toContain("coalesce(v_request_role, '') = 'service_role'")
    expect(body).toContain("coalesce(v_claims_role, '') = 'service_role'")
    expect(body).toContain('p_auth_id IS NOT DISTINCT FROM auth.uid()')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.casas_map_auth_matches_actor(uuid) FROM authenticated;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.casas_map_auth_matches_actor(uuid) TO service_role;')

    for (const signature of mutatingRpcSignatures) {
      expect(sql).not.toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated`)
      expect(sql).not.toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated, service_role`)
    }
  })

  it('hardens mutating RPCs with assignment authorization, eligibility, and concurrency protection', () => {
    const sql = readMigration()
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.puede_asignar_casa_anfitriona_a_grupo(')
    expect(sql).toContain("rs.nombre_interno IN ('admin', 'pastor')")
    expect(sql).toContain("rs.nombre_interno = 'director-general'")
    expect(sql).toContain("rs.nombre_interno = 'director-etapa'")
    expect(sql).toContain("gm.rol = 'Líder'")
    expect(sql).toContain('ca.aprobada = true')
    expect(sql).toContain('ca.activa = true')
    expect(sql).toContain('ca.direccion_id IS NOT NULL')
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('casas_map_assign:' || p_casa_id::text, 0))")
    expect(sql).toContain('FOR UPDATE')
    const assignmentAuthBody = extractFunctionBody(sql, 'puede_asignar_casa_anfitriona_a_grupo')
    expect(assignmentAuthBody).toContain("gm.rol = 'Líder'")
    expect(assignmentAuthBody).not.toContain('IF (v_is_lider OR EXISTS')
    expect(assignmentAuthBody).toContain('public.casas_map_director_general_can_view_group(v_user_id, g.id)')
    expect(assignmentAuthBody).toContain('public.casas_map_director_general_can_view_group(v_user_id, owner_group.id)')

    const viewBody = extractFunctionBody(sql, 'casas_map_user_can_view_group')
    expect(viewBody).toContain('public.casas_map_director_general_can_view_group(v_user_id, p_grupo_id)')

    const dgScopeBody = extractFunctionBody(sql, 'casas_map_director_general_can_view_group')
    expect(dgScopeBody).toContain('public.director_general_segmentos')
    expect(dgScopeBody).toContain('public.dg_directores_etapa')

    const reviewBody = extractFunctionBody(sql, 'procesar_revision_ubicacion_casa')
    expect(reviewBody).toContain('public.casas_map_actor_can_approve_review(p_auth_id, v_review.casa_anfitriona_id)')
    expect(reviewBody).not.toContain('public.puede_aprobar_casa_anfitriona')

    const reviewAuthBody = extractFunctionBody(sql, 'casas_map_actor_can_approve_review')
    expect(reviewAuthBody).toContain('public.casas_map_director_general_can_view_group(v_actor_user_id, g.id)')
    expect(reviewAuthBody).not.toContain('v_has_director_etapa_assignments')
  })

  it('deduplicates member map pins per user while keeping director-general scope centralized', () => {
    const sql = readMigration()
    const contracts = readSqlTest('casas_map_rpc_contracts.sql')
    const memberMapBody = extractFunctionBody(sql, 'obtener_mapa_miembros')
    expect(memberMapBody).toContain('DISTINCT ON (u.id)')
    expect(memberMapBody).toContain('ORDER BY u.id, g.nombre, g.id')
    for (const token of [
      'director-general with assigned DE sees directly scoped same-segment group',
      'director-general with assigned DE sees same-segment out-of-DE review',
      'director-general with assigned DE hides out-of-segment group',
      'director-general with assigned DE gets one member pin despite multiple visible memberships',
    ]) expect(contracts).toContain(token)
  })

  it('adds bounded migration safety notes and PR1 deploy verification guidance', () => {
    const sql = readMigration()
    const inventory = readSqlTest('casas_map_inventory.sql')
    expect(sql).toContain("SET lock_timeout = '5s';")
    expect(sql).toContain("SET statement_timeout = '30s';")
    expect(sql).toContain('RESET lock_timeout;')
    expect(sql).toContain('RESET statement_timeout;')
    expect(sql).toContain('If an index statement times out, retry during a quieter deployment window')
    expect(inventory).toContain('PR1 deploy verification checklist')
    expect(inventory).toContain('Expected pass criteria')
    expect(inventory).toContain('Fix-forward / rollback actions')
  })

  it('documents deterministic inventory and executable RPC behavior checks', () => {
    const inventory = readSqlTest('casas_map_inventory.sql')
    const contracts = readSqlTest('casas_map_rpc_contracts.sql')
    for (const token of ['casas_total', 'groups_with_manual_address', 'pending_location_reviews', 'current_legacy_map_count']) expect(inventory).toContain(token)
    expect(inventory).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bTRUNCATE\b/i)
    for (const token of [
      'BEGIN;',
      'ROLLBACK;',
      "set_config('request.jwt.claim.sub'",
      'approved host home appears on host-home map',
      'pending location change keeps old approved coordinates visible',
      'approval switches map to new approved coordinates',
      'rejection preserves previous approved coordinates',
      'pending-only host home stays hidden',
      'manual group address is ignored',
      'scoped missing-host-home queue hides out-of-scope groups',
      'pending review queue exposes scoped pending work to admin',
      'pending review queue hides pending work from director etapa',
      'ordinary member cannot assign Casa Anfitriona',
      'authenticated role cannot execute assignment RPC',
      'authenticated role cannot execute review RPC',
      'service role approves review using supplied admin actor',
      'service role rejects out-of-scope leader assignment',
      'service role rejects unauthorized review actor',
      'global leader role alone cannot assign owned Casa to unmanaged group',
      'assignment succeeds for scoped leader',
      'assignment writes audit event',
      'Casa already assigned to another active group is denied',
      'approval writes review audit event',
      'rejection writes review audit event',
      'member layer returns one scoped member pin for director',
      'member layer hides pins from ordinary member',
      'spoofed p_auth_id is denied',
    ]) expect(contracts).toContain(token)
    expect(contracts).toContain('INSERT INTO auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)')
    expect(contracts).toContain('INSERT INTO public.usuarios')
    expect(contracts.indexOf('INSERT INTO auth.users')).toBeLessThan(contracts.indexOf('INSERT INTO public.usuarios'))
    expect(contracts).toContain("set_config('request.jwt.claim.sub', pg_temp.fixture_id('admin_auth_id')::text, true)")
    expect(contracts.replace(/pg_temp\.fixture_id\(/g, '')).not.toContain('fixture_id(')
    expect(contracts).toContain('public.asignar_casa_anfitriona_a_grupo(')
    expect(contracts).toContain('public.procesar_revision_ubicacion_casa(')
    expect(contracts).toContain('public.obtener_mapa_miembros(')
    expect(contracts).not.toMatch(/TODO|placeholder|replace the fixture/i)
  })

  it('defines PR8 guarded backfill as a manual dry-run-first utility for approved Casas only', () => {
    const sql = readMigrationBySuffix('_casas_map_guarded_backfill.sql')
    const body = extractFunctionBody(sql, 'casas_map_backfill_approved_location_audit')
    const dryRunBranchIndex = body.indexOf('IF p_dry_run THEN')
    const approvalGateIndex = body.indexOf('backfill_requires_explicit_approval_reference')
    const insertIndex = body.indexOf('INSERT INTO public.casa_anfitriona_audit_events')

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.casas_map_backfill_approved_location_audit(')
    expect(sql).toContain('p_dry_run boolean DEFAULT true')
    expect(sql).toContain('p_approval_reference text DEFAULT NULL')
    expect(sql).toContain("current_setting('request.jwt.claim.role', true)")
    expect(sql).toContain("<> 'service_role'")
    expect(sql).toContain('IF p_dry_run THEN')
    expect(sql).toContain('ca.aprobada = true')
    expect(sql).toContain('ca.activa = true')
    expect(sql).toContain('ca.direccion_id IS NOT NULL')
    expect(sql).toContain("event_type = 'approved_location_backfill'")
    expect(sql).toContain('ON CONFLICT DO NOTHING')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.casas_map_backfill_approved_location_audit(uuid, boolean, text) FROM PUBLIC;')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.casas_map_backfill_approved_location_audit(uuid, boolean, text) FROM anon;')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.casas_map_backfill_approved_location_audit(uuid, boolean, text) FROM authenticated;')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.casas_map_backfill_approved_location_audit(uuid, boolean, text) TO service_role;')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_casa_audit_events_approved_location_backfill_once')
    expect(sql).toContain("lower(v_approval_reference) IN ('approval-reference', 'approved-change-id', 'placeholder', 'replace-me', 'changeme', 'todo', 'tbd')")
    expect(sql).toContain("'approval_reference', v_approval_reference")
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('casas_map_backfill_approved_location_audit', 0))")
    expect([
      ...body.matchAll(/WHERE\s+ca\.aprobada = true\s+AND ca\.activa = true\s+AND ca\.direccion_id IS NOT NULL/g),
    ]).toHaveLength(2)
    expect(dryRunBranchIndex).toBeGreaterThan(-1)
    expect(approvalGateIndex).toBeGreaterThan(dryRunBranchIndex)
    expect(insertIndex).toBeGreaterThan(approvalGateIndex)
    expect(body.slice(dryRunBranchIndex, insertIndex)).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i)
    expect(sql).not.toMatch(/UPDATE\s+public\.(grupos|casas_anfitrionas)\s+SET|DELETE\s+FROM\s+public\.|TRUNCATE\s+|DROP\s+(TABLE|COLUMN)/i)
  })

  it('keeps the PR8 backfill boundary away from manual addresses and pending review creation', () => {
    const sql = readMigrationBySuffix('_casas_map_guarded_backfill.sql')
    expect(sql).not.toContain('direccion_anfitrion_id')
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.casa_anfitriona_location_reviews/i)
    expect(sql).not.toMatch(/UPDATE\s+public\.casas_anfitrionas/i)
    expect(sql).not.toMatch(/ca\.aprobada\s*=\s*false|ca\.activa\s*=\s*false|ca\.direccion_id\s+IS\s+NULL/i)
    expect(sql).toContain("'approved_location_backfill'")
    expect(sql).toContain("'source', 'pr8_guarded_backfill'")
  })

  it('documents PR8 production gates, staging smoke, advisors, and post-backfill verification', () => {
    const safetySql = readSqlTest('casas_map_production_safety.sql')
    const runbook = readDoc('casas-anfitrionas-map-operations.md')
    const executableSafetySql = stripSqlCommentLines(safetySql)

    for (const token of [
      'PR8 production safety gate',
      'dry-run inventory',
      'staging smoke',
      'explicit approval',
      'post-backfill verification',
      'Supabase Security Advisor',
      'Supabase Performance Advisor',
    ]) {
      expect(safetySql).toContain(token)
      expect(runbook).toContain(token)
    }

    expect(safetySql).toContain('p_dry_run => true')
    expect(safetySql).toContain('casas_map_backfill_approved_location_audit')
    expect(safetySql).toContain("set_config('request.jwt.claim.role', 'service_role', true)")
    expect(safetySql).toContain("set_config('request.jwt.claim.sub', '<approved-admin-auth-id>', true)")
    expect(safetySql).toContain("casas_map.run_post_backfill_assertions")
    expect(safetySql).toContain("current_setting('casas_map.run_post_backfill_assertions', true)")
    expect(safetySql).toContain("RAISE NOTICE 'post-backfill assertions skipped")
    expect(safetySql).toContain("RAISE EXCEPTION 'post_backfill_missing_audit_snapshots")
    expect(safetySql).toContain("RAISE EXCEPTION 'post_backfill_duplicate_audit_snapshots")
    expect(safetySql).toContain("p_approval_reference => '<release-ticket-or-change-id>'")
    expect(runbook).toContain("set_config('casas_map.run_post_backfill_assertions', 'off', false)")
    expect(runbook).toContain("set_config('casas_map.run_post_backfill_assertions', 'on', false)")
    expect(runbook).toContain('Use `\\i` only in `psql`; the Supabase SQL Editor does not support it.')
    expect(runbook).toContain('same explicit transaction because `set_config(..., true)` is transaction-local')
    expect(runbook).toContain('Supabase SQL Editor path')
    expect(runbook).toContain('do not use `\\i` in the SQL Editor')
    expect(runbook).toContain('it manages its own `BEGIN`/`ROLLBACK` fixture transaction')
    expect(runbook).toContain('-- Paste the contents of supabase/tests/casas_map_production_safety.sql here.')
    expect(safetySql).toContain('inside one explicit BEGIN/COMMIT transaction')
    expect(safetySql).toContain('SQL Editor does not support \\i includes')
    expect(runbook).toContain('safe end-to-end')

    const assertionGuardIndex = executableSafetySql.indexOf('IF NOT v_run_post_backfill_assertions THEN')
    const assertionReturnIndex = executableSafetySql.indexOf('RETURN;', assertionGuardIndex)
    const firstAssertionRaiseIndex = executableSafetySql.indexOf('RAISE EXCEPTION', assertionReturnIndex)
    expect(assertionGuardIndex).toBeGreaterThan(-1)
    expect(assertionReturnIndex).toBeGreaterThan(assertionGuardIndex)
    expect(firstAssertionRaiseIndex).toBeGreaterThan(assertionReturnIndex)
    expect(executableSafetySql).not.toContain('p_dry_run => false')
    expect(executableSafetySql).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bTRUNCATE\b/i)
    expect(runbook).toContain('No live production SQL, migration, deploy, or Supabase advisor command is executed by this PR.')
    expect(runbook).toContain('No feature flag currently exists for this slice')
    expect(runbook).toContain('Monitor for the first 2 hours after release')

    for (const signature of readOnlyRpcSignatures) {
      expect(runbook).toContain(`REVOKE EXECUTE ON FUNCTION public.${signature} FROM authenticated;`)
      expect(runbook).toContain(`REVOKE EXECUTE ON FUNCTION public.${signature} FROM service_role;`)
      expect(runbook).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated, service_role;`)
    }
  })
})
