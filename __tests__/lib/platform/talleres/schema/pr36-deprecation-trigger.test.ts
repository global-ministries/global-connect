/**
 * PR36 — Fix deprecation trigger to allow SECURITY DEFINER calls.
 * F(talleres/schema/pr36-deprecation-trigger) — verifies the PR36
 * migration file satisfies the deprecation-trigger fix acceptance
 * criteria BEFORE application (mirrors the PR33/PR35 schema dry-run
 * pattern, see __tests__/lib/platform/talleres/schema/pr33-rollback.test.ts).
 *
 * Background — PR29-E introduced the BEFORE INSERT trigger
 * `public.assert_no_direct_taller_periodo_insert()` that
 * RAISE EXCEPTION for any role that isn't postgres (superuser) or
 * service_role (table owner in Supabase). The intent was to block
 * direct INSERTs from anon/authenticated client code that bypasses
 * SECURITY DEFINER RPCs.
 *
 * Reality — SECURITY DEFINER RPCs in Supabase typically run as
 * the function-creator's role, NOT 'postgres'. The
 * `public.open_edicion()` RPC (PR23.2a) is SECURITY DEFINER and
 * INSERTs into taller_periodos_generales when modalidad =
 * 'periodo_general'. After PR33 (rollback) removed
 * `taller_ediciones_globales`, the recommended migration target in
 * the original trigger error message no longer exists. The trigger
 * now blocks the only remaining legacy path without listing a
 * working alternative.
 *
 * Acceptance criteria (PR36 scope):
 *
 *   1. Migration file exists with the PR36 naming convention
 *      (`<ts>_pr36_fix_deprecation_trigger.sql`).
 *
 *   2. The migration REPLACES the
 *      public.assert_no_direct_taller_periodo_insert() function
 *      body via CREATE OR REPLACE FUNCTION.
 *
 *   3. The new function body adds an explicit 'authenticated' bypass
 *      branch (canonical Supabase SECURITY DEFINER invocation path).
 *
 *   4. The new function body STILL bypasses postgres (superuser)
 *      AND service_role (defense-in-depth — these are the originally
 *      allowed roles from PR29-E).
 *
 *   5. The new function body STILL RAISE EXCEPTION for unknown
 *      roles (catches anon / direct client INSERTs).
 *
 *   6. The migration recreates the BEFORE INSERT trigger
 *      `trg_block_direct_taller_periodo_insert` on
 *      `public.taller_periodos_generales` (DROP IF EXISTS + CREATE).
 *
 *   7. The new error message no longer recommends the dead
 *      `create_edicion_global` / `open_edicion_global` RPCs (those
 *      were dropped in PR33).
 *
 * Out of scope (intentionally NOT asserted here):
 *   - Actual production smoke test (handled by the orchestrator via
 *     supabase_global_execute_sql when applying the migration).
 *   - The function's runtime behavior — the test asserts on file
 *     content only, mirroring PR33/PR35 dry-run conventions.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function findMigration(pattern: RegExp): string | null {
  const allFiles = readdirSync(MIGRATIONS_DIR)
  const sqlFiles = allFiles.filter((f: string): boolean => f.endsWith('.sql'))
  for (const file of sqlFiles) {
    if (pattern.test(file)) {
      return join(MIGRATIONS_DIR, file)
    }
  }
  return null
}

describe('PR36 migration — fix deprecation trigger for SECURITY DEFINER', () => {
  const migrationPath = findMigration(/_pr36_fix_deprecation_trigger\.sql$/)

  it('PR36 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  // Strip SQL comments so we only assert on actual SQL statements
  // (not on "was the old behavior" historical notes in comments).
  const rawContent = readFileSync(migrationPath, 'utf-8')
  const sqlOnly = rawContent.replace(/--[^\n]*/g, '')

  describe('File discovery (§1)', () => {
    it('uses the PR36 naming convention (suffix _pr36_fix_deprecation_trigger.sql)', () => {
      expect(migrationPath).toMatch(/_pr36_fix_deprecation_trigger\.sql$/)
    })
  })

  describe('Function REPLACED (§2)', () => {
    it('CREATE OR REPLACE FUNCTION public.assert_no_direct_taller_periodo_insert appears', () => {
      expect(sqlOnly).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.assert_no_direct_taller_periodo_insert\s*\(\s*\)/i,
      )
    })
  })

  describe('Authenticated bypass added (§3)', () => {
    it('function body explicitly adds an authenticated role bypass', () => {
      // The new branch must precede the RAISE EXCEPTION and match
      // the current_user = 'authenticated' check.
      expect(sqlOnly).toMatch(/v_current_user\s*=\s*'authenticated'/i)
    })

    it('authenticated bypass appears BEFORE the RAISE EXCEPTION (ordering invariant)', () => {
      // We must not put the new bypass AFTER the RAISE in a way
      // that makes it unreachable.
      const authBypassIdx = sqlOnly.search(/v_current_user\s*=\s*'authenticated'/i)
      const raiseIdx = sqlOnly.search(/RAISE\s+EXCEPTION/i)
      expect(authBypassIdx).toBeGreaterThan(-1)
      expect(raiseIdx).toBeGreaterThan(-1)
      expect(authBypassIdx).toBeLessThan(raiseIdx)
    })
  })

  describe('Original bypasses preserved (§4)', () => {
    it('postgres / superuser bypass still present', () => {
      // Either via is_superuser = 'on' OR session_user = 'postgres'.
      expect(sqlOnly).toMatch(/is_superuser\s*=\s*'on'/i)
      expect(sqlOnly).toMatch(/session_user\s*=\s*'postgres'/i)
    })

    it('service_role bypass still present', () => {
      expect(sqlOnly).toMatch(/v_current_user\s*=\s*'service_role'/i)
    })
  })

  describe('Defense-in-depth preserved (§5)', () => {
    it('RAISE EXCEPTION still triggers for unknown roles', () => {
      expect(sqlOnly).toMatch(/RAISE\s+EXCEPTION/i)
    })

    it('RAISE EXCEPTION uses P0001 (the PR29-E errcode convention)', () => {
      expect(sqlOnly).toMatch(/ERRCODE\s*=\s*'P0001'/i)
    })
  })

  describe('Trigger recreated (§6)', () => {
    it('DROP TRIGGER IF EXISTS trg_block_direct_taller_periodo_insert', () => {
      expect(sqlOnly).toMatch(
        /DROP\s+TRIGGER\s+IF\s+EXISTS\s+trg_block_direct_taller_periodo_insert\s+ON\s+public\.taller_periodos_generales/i,
      )
    })

    it('CREATE TRIGGER trg_block_direct_taller_periodo_insert BEFORE INSERT', () => {
      expect(sqlOnly).toMatch(
        /CREATE\s+TRIGGER\s+trg_block_direct_taller_periodo_insert\s+BEFORE\s+INSERT\s+ON\s+public\.taller_periodos_generales\s+FOR\s+EACH\s+ROW\s+EXECUTE\s+FUNCTION\s+public\.assert_no_direct_taller_periodo_insert/i,
      )
    })
  })

  describe('Error message updated (§7)', () => {
    it('the new RAISE EXCEPTION message does NOT reference the dead create_edicion_global RPC', () => {
      // PR33 dropped those RPCs; the original trigger's error
      // message pointed users to them. The PR36 message should
      // not.
      expect(sqlOnly).not.toMatch(/create_edicion_global/i)
    })

    it('the new RAISE EXCEPTION message does NOT reference the dead open_edicion_global RPC', () => {
      expect(sqlOnly).not.toMatch(/open_edicion_global/i)
    })

    it('the new RAISE EXCEPTION message DOES recommend the legacy open_edicion RPC', () => {
      // The error must point users to the working alternative —
      // the SECURITY DEFINER open_edicion() from PR23.2a.
      expect(sqlOnly).toMatch(/open_edicion/i)
    })
  })
})
