#!/usr/bin/env node

/**
 * SQL Migration Linter for Global Connect
 *
 * Validates migration files against safe patterns before they reach the database.
 * Runs locally via `pnpm lint:migrations` and in CI on PRs touching supabase/migrations/.
 *
 * Checks:
 *   1. Naming convention (timestamp_prefix_description.sql)
 *  2. Dangerous operations (DROP TABLE, TRUNCATE, unparameterized DELETE)
 *   3. Permissive RLS policies (USING true, USING 1=1)
 *   4. Data manipulation in migrations (INSERT/UPDATE/DELETE of rows)
 *   5. SECURITY DEFINER functions without proper revocation
 *   6. GRANT ALL usage
 *   7. Missing IF EXISTS / OR EXISTS guards on DROP/CREATE
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations')

// ─── Severity levels ────────────────────────────────────────────────────────

const SEVERITY = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
}

// ─── Rules ──────────────────────────────────────────────────────────────────

const rules = [
  {
    id: 'naming-convention',
    severity: SEVERITY.ERROR,
    pattern: null,
    check: (content, filename) => {
      // Timestamp format: YYYYMMDDHHMMSS_name.sql or YYYYMMDD_NNN_name.sql
      const validName = /^\d{8,14}[_\d]*_?[a-z][a-z0-9_]*\.sql$/.test(filename)
      if (!validName) {
        return {
          message: `Migration filename "${filename}" does not follow convention: YYYYMMDDHHMMSS_description.sql (lowercase, underscores)`,
        }
      }
      return null
    },
  },
  {
    id: 'drop-table',
    severity: SEVERITY.ERROR,
    pattern: /(?:^|\s)DROP\s+TABLE\s+(?!IF\s+EXISTS)/im,
    message: 'DROP TABLE without IF EXISTS — migration will fail if table does not exist',
  },
  {
    id: 'drop-function',
    severity: SEVERITY.WARN,
    pattern: /(?:^|\s)DROP\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?!IF\s+EXISTS)/im,
    message: 'DROP FUNCTION without IF EXISTS — consider adding IF EXISTS for idempotency',
  },
  {
    id: 'drop-view',
    severity: SEVERITY.WARN,
    pattern: /(?:^|\s)DROP\s+(?:OR\s+REPLACE\s+)?VIEW\s+/im,
    message: 'DROP VIEW in migration — ensure this is intentional and uses IF EXISTS',
  },
  {
    id: 'truncate',
    severity: SEVERITY.ERROR,
    pattern: /(?:^|\s)TRUNCATE\s/im,
    message: 'TRUNCATE in migration — this deletes all data without logging. Use DELETE with WHERE instead',
  },
  {
    id: 'grant-all',
    severity: SEVERITY.WARN,
    pattern: /GRANT\s+ALL\b/im,
    message: 'GRANT ALL found — consider granting only the specific privileges needed (SELECT, INSERT, UPDATE, DELETE)',
  },
  {
    id: 'rls-using-true',
    severity: SEVERITY.WARN,
    pattern: /USING\s*\(\s*true\s*\)/im,
    message: 'RLS policy with USING (true) — this allows ALL authenticated/anon users to see this data. Ensure this is intentional',
  },
  {
    id: 'rls-using-1-eq-1',
    severity: SEVERITY.WARN,
    pattern: /USING\s*\(\s*1\s*=\s*1\s*\)/im,
    message: 'RLS policy with USING (1=1) — this allows ALL users. Ensure this is intentional',
  },
  {
    id: 'security-definer',
    severity: SEVERITY.INFO,
    pattern: /SECURITY\s+DEFINER/im,
    message: 'SECURITY DEFINER function found — ensure EXECUTE is revoked from anon/public and granted only to authenticated',
  },
  {
    id: 'hardcoded-uuid',
    severity: SEVERITY.INFO,
    pattern: /'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/im,
    message: 'Hardcoded UUID found — avoid embedding real data in migrations. Use seed data or application-level setup instead',
  },
  {
    id: 'insert-into',
    severity: SEVERITY.WARN,
    pattern: /(?:^|\s)INSERT\s+INTO\s+/im,
    message: 'INSERT INTO in migration — data manipulation should be in seed files, not migrations. If this is reference/seed data, add a noqa comment',
  },
  {
    id: 'update-where',
    severity: SEVERITY.WARN,
    check: (content) => {
      // Find UPDATE without WHERE (dangerous — updates all rows)
      const updateNoWhere = /UPDATE\s+\w+\s+SET\b(?![\s\S]*?WHERE)/im
      // But allow UPDATE inside functions (they typically have WHERE clauses later)
      if (updateNoWhere.test(content)) {
        // Check if it's inside a function body
        const lines = content.split('\n')
        let inFunction = false
        for (const line of lines) {
          if (/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i.test(line)) inFunction = true
          if (inFunction && /\$\$/.test(line) && line.split('$$').length > 2) inFunction = false
          if (/UPDATE\s+\w+\s+SET/i.test(line) && !inFunction) {
            // Check remaining text for WHERE
            const remainingIdx = content.indexOf(line)
            const chunk = content.slice(remainingIdx, remainingIdx + 500)
            if (!/WHERE/i.test(chunk)) {
              return { message: 'UPDATE without WHERE clause found outside a function — this will update ALL rows' }
            }
          }
        }
      }
      return null
    },
  },
  {
    id: 'delete-from-no-where',
    severity: SEVERITY.ERROR,
    check: (content) => {
      // Only flag DELETE FROM outside function bodies that lacks WHERE
      const lines = content.split('\n')
      let inFunction = false
      let dollarDepth = 0
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION/i.test(line)) inFunction = true
        dollarDepth += (line.match(/\$\$/g) || []).length
        if (inFunction && dollarDepth >= 2) { inFunction = false; dollarDepth = 0 }

        if (/DELETE\s+FROM/i.test(line) && !inFunction) {
          // Check next few lines for WHERE
          const nextLines = lines.slice(i, i + 5).join('\n')
          if (!/WHERE/i.test(nextLines)) {
            return { message: `DELETE FROM without WHERE at line ${i + 1} — this will delete ALL rows in the table` }
          }
        }
      }
      return null
    },
  },
  {
    id: 'alter-drop-column',
    severity: SEVERITY.WARN,
    pattern: /ALTER\s+TABLE\s+.*DROP\s+COLUMN/im,
    message: 'DROP COLUMN in migration — this is destructive and irreversible. Consider renaming instead or using a soft-delete pattern',
  },
  {
    id: 'security-definer-no-search-path',
    severity: SEVERITY.WARN,
    check: (content) => {
      // Find SECURITY DEFINER functions that lack SET search_path
      const lines = content.split('\n')
      const definerLines = []
      const searchPathLines = []
      for (let i = 0; i < lines.length; i++) {
        if (/SECURITY\s+DEFINER/i.test(lines[i])) definerLines.push(i)
        if (/SET\s+search_path\s+TO/i.test(lines[i])) searchPathLines.push(i)
      }
      // If there are SECURITY DEFINER functions but no SET search_path at all
      if (definerLines.length > 0 && searchPathLines.length === 0) {
        return { message: `SECURITY DEFINER function(s) found without SET search_path — this is a privilege escalation risk. Add SET search_path TO 'public' to each function` }
      }
      // If there are fewer search_path declarations than SECURITY DEFINER, warn
      if (definerLines.length > searchPathLines.length) {
        return { message: `Found ${definerLines.length} SECURITY DEFINER function(s) but only ${searchPathLines.length} SET search_path — ensure every function has it` }
      }
      return null
    },
  },
  {
    id: 'grant-to-anon-on-definer',
    severity: SEVERITY.WARN,
    pattern: /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+.*\bTO\s+[^;]*\banon\b/im,
    message: 'GRANT EXECUTE ON FUNCTION ... TO anon — SECURITY DEFINER functions should not be accessible to anonymous users. Use authenticated only',
  },
  {
    id: 'revoke-missing-for-definer',
    severity: SEVERITY.WARN,
    check: (content) => {
      const hasSecurityDefiner = /SECURITY\s+DEFINER/i.test(content)
      if (!hasSecurityDefiner) return null

      const hasRevokeAnon = /REVOKE\s+(?:ALL|EXECUTE)\s+ON\s+FUNCTION/i.test(content)
      const hasGrantAuthenticated = /GRANT\s+EXECUTE\s+ON\s+FUNCTION/i.test(content)

      if (!hasRevokeAnon && !hasGrantAuthenticated) {
        return {
          message: 'SECURITY DEFINER function without REVOKE/GRANT — ensure EXECUTE is revoked from anon and granted to authenticated',
        }
      }
      return null
    },
  },
]

// ─── Noqa comment support ────────────────────────────────────────────────────

// Lines like: -- noqa: drop-table, grant-all
// Or at file level: -- noqa: all (disables all rules for the file)
function hasNoqaComment(content, lineNum, ruleId) {
  const lines = content.split('\n')

  // File-level noqa
  if (/--\s*noqa:\s*all\b/i.test(content.slice(0, 500))) return true
  if (new RegExp(`--\\s*noqa:.*\\b${ruleId}\\b`, 'i').test(content.slice(0, 500))) return true

  // Line-level noqa
  if (lineNum !== null && lineNum < lines.length) {
    const line = lines[lineNum]
    if (/--\s*noqa:\s*all\b/i.test(line)) return true
    if (new RegExp(`--\\s*noqa:.*\\b${ruleId}\\b`, 'i').test(line)) return true
  }

  return false
}

// ─── Runner ──────────────────────────────────────────────────────────────────

function findLineNumbers(content, pattern) {
  const lines = []
  const regex = new RegExp(pattern.source, pattern.flags)
  const linesArr = content.split('\n')
  for (let i = 0; i < linesArr.length; i++) {
    if (regex.test(linesArr[i])) {
      lines.push(i + 1)
    }
  }
  return lines.length > 0 ? lines : null
}

function lintFile(filepath, filename) {
  const content = readFileSync(filepath, 'utf-8')
  const findings = []

  for (const rule of rules) {
    if (rule.pattern) {
      const match = rule.pattern.exec(content)
      if (match) {
        const lineNum = content.substring(0, match.index).split('\n').length
        if (!hasNoqaComment(content, lineNum - 1, rule.id)) {
          findings.push({
            rule: rule.id,
            severity: rule.severity,
            line: lineNum,
            message: rule.message,
          })
        }
      }
    } else if (rule.check) {
      const result = rule.check(content, filename)
      if (result) {
        const line = result.line || (rule.pattern ? findLineNumbers(content, rule.pattern) : null) || '?'
        if (!hasNoqaComment(content, null, rule.id)) {
          findings.push({
            rule: rule.id,
            severity: rule.severity,
            line,
            message: result.message || rule.message,
          })
        }
      }
    }
  }

  return findings
}

function run() {
  console.log('\n🔍 SQL Migration Linter\n')
  console.log('━'.repeat(50))

  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    console.log('\n⚠️  No migration files found in', MIGRATIONS_DIR)
    process.exit(0)
  }

  let totalErrors = 0
  let totalWarnings = 0
  let totalInfo = 0
  const fileResults = new Map()

  for (const file of files) {
    const filepath = join(MIGRATIONS_DIR, file)
    const findings = lintFile(filepath, file)

    if (findings.length > 0) {
      fileResults.set(file, findings)
      for (const f of findings) {
        if (f.severity === SEVERITY.ERROR) totalErrors++
        else if (f.severity === SEVERITY.WARN) totalWarnings++
        else totalInfo++
      }
    }
  }

  // Print results
  for (const [file, findings] of fileResults) {
    console.log(`\n📄 ${file}`)
    for (const f of findings) {
      const icon = f.severity === SEVERITY.ERROR ? '❌' : f.severity === SEVERITY.WARN ? '⚠️' : 'ℹ️'
      console.log(`   ${icon} L${f.line} [${f.rule}] ${f.message}`)
    }
  }

  console.log('\n' + '━'.repeat(50))
  console.log(`\n📊 Summary: ${files.length} files checked`)
  console.log(`   ❌ Errors:   ${totalErrors}`)
  console.log(`   ⚠️  Warnings: ${totalWarnings}`)
  console.log(`   ℹ️  Info:     ${totalInfo}`)

  if (totalErrors > 0) {
    console.log('\n❌ Migration lint failed with errors. Fix the issues above before merging.\n')
    process.exit(1)
  } else if (totalWarnings > 0) {
    console.log('\n⚠️  Migration lint passed with warnings. Review them before merging.\n')
    process.exit(0)
  } else {
    console.log('\n✅ All migrations passed lint checks.\n')
    process.exit(0)
  }
}

run()