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
 *   8. SECURITY DEFINER functions without REVOKE ... FROM PUBLIC in the same
 *      file (ERROR for migrations from 20261003 on)
 *
 * An optional first argument lints another directory instead of
 * supabase/migrations (to try the rules on fixture files).
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'

const MIGRATIONS_DIR = process.argv[2]
  ? resolve(process.argv[2])
  : join(import.meta.dirname, '..', 'migrations')

// Migrations from this date on must revoke EXECUTE from PUBLIC on every
// SECURITY DEFINER function they create or replace (security-definer-revoke-public).
const DEFINER_REVOKE_REQUIRED_FROM = '20261003'

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
    // A TRUNCATE statement starts its line. Anchoring there keeps the rule from
    // firing on comments and on the privilege name in GRANT/REVOKE lists
    // (`grant select, …, truncate on table …` deletes nothing).
    pattern: /^\s*TRUNCATE\s/im,
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
  /**
   * Rule 8 (NEW — S01 audit):
   * SECURITY DEFINER public RPCs accepting caller-supplied p_auth_id without
   * binding it to auth.uid() are an identity-confusion risk.
   *
   * A p_auth_id is "hardened" when the function body contains, BEFORE any use:
   *   IF p_auth_id IS DISTINCT FROM auth.uid() THEN RETURN false; END IF;
   *
   * A p_auth_id is "unbound" when:
   *   - The RPC accepts p_auth_id AND
   *   - The body does NOT contain the IS DISTINCT FROM auth.uid() guard AND
   *   - The body uses p_auth_id to look up usuarios.auth_id = p_auth_id
   *
   * Note: This rule flags the pattern as INFO (not ERROR) because many existing
   * RPCs use the unbound pattern with acceptable business justification. The probe
   * test (F(OC/security-definer)) is the authoritative audit tool.
   */
  {
    id: 'security-definer-unbound-auth-id',
    severity: SEVERITY.INFO,
    check: (content, filename) => {
      const hasSecurityDefiner = /SECURITY\s+DEFINER/i.test(content)
      if (!hasSecurityDefiner) return null

      const lines = content.split('\n')
      const findings = []

      // Find all CREATE FUNCTION public.name(...) declarations
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const createMatch = line.match(
          /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)/i,
        )
        if (!createMatch) continue

        const funcName = createMatch[1]
        const startLine = i + 1

        // Collect parameter list (may span multiple lines)
        let params = ''
        if (line.includes('(')) {
          params = line.substring(line.indexOf('('))
          if (!params.includes(')')) {
            for (let j = i + 1; j < lines.length; j++) {
              params += '\n' + lines[j]
              if (lines[j].includes(')')) break
            }
          }
        } else {
          for (let j = i + 1; j < lines.length; j++) {
            params += '\n' + lines[j]
            if (lines[j].includes(')')) break
          }
        }

        const openParen = params.indexOf('(')
        const closeParen = params.lastIndexOf(')')
        params = params.substring(openParen + 1, closeParen)

        const hasAuthIdParam = /\bp_auth_id\b/.test(params)
        if (!hasAuthIdParam) continue

        // Scan forward for SECURITY DEFINER and $$ body delimiters
        let hasDefiner = false
        let dollarStartLine = -1
        for (let k = i; k < Math.min(i + 20, lines.length); k++) {
          const scanLine = lines[k]
          if (/SECURITY\s+DEFINER/i.test(scanLine)) hasDefiner = true
          if (/\$\$/i.test(scanLine)) { dollarStartLine = k; break }
        }
        if (!hasDefiner || dollarStartLine === -1) continue

        // Collect function body from $$ to $$
        const bodyLines = []
        let dollarFound = false
        for (let m = dollarStartLine; m < lines.length; m++) {
          const bodyLine = lines[m]
          bodyLines.push(bodyLine)
          if (/\$/i.test(bodyLine)) {
            if (dollarFound) break
            dollarFound = true
          }
        }
        const body = bodyLines.join('\n')

        // Check for hardening guard
        const hasGuard = /\bp_auth_id\s+IS\s+DISTINCT\s+FROM\s+auth\.uid\(\)/i.test(body)
        if (!hasGuard) {
          findings.push(`public.${funcName} (line ${startLine})`)
        }
      }

      if (findings.length === 0) return null

      return {
        message: `SECURITY DEFINER RPC(s) accepting p_auth_id without IS DISTINCT FROM auth.uid() guard: ${findings.join(', ')}`,
        line: 1,
      }
    },
  },
  /**
   * Rule 9: from 2026-10-03 on, every SECURITY DEFINER function (or procedure)
   * that a migration creates or replaces needs a REVOKE ALL | EXECUTE ... FROM
   * PUBLIC naming it in the same file. What a new function gets by default
   * depends on the role that creates it and on the database, and CREATE OR
   * REPLACE keeps the ACL the function already had, so only an explicit REVOKE
   * says who may call it everywhere. `REVOKE ... ON ALL FUNCTIONS IN SCHEMA s
   * FROM PUBLIC` counts for every function of s. Statements are read with
   * comments, strings and function bodies masked, so a CREATE FUNCTION inside a
   * DO block or dynamic SQL is not seen. Older migrations already ran and are
   * not checked.
   */
  {
    id: 'security-definer-revoke-public',
    severity: SEVERITY.ERROR,
    check: (content, filename) => {
      const stamp = /^\d{8}/.exec(filename)?.[0]
      if (!stamp || stamp < DEFINER_REVOKE_REQUIRED_FROM) return null

      const missing = definerRoutinesWithoutRevokeFromPublic(content)
      if (missing.length === 0) return null

      return {
        message: `SECURITY DEFINER function(s) without REVOKE ... FROM PUBLIC in this file: ${missing.map((m) => `${m.display} (line ${m.line})`).join(', ')}. Add REVOKE ALL ON FUNCTION <name>(<argument types>) FROM PUBLIC, anon; and grant EXECUTE only to the roles that call it`,
        line: missing[0].line,
      }
    },
  },
]

// ─── SQL scanning (rules that need statement boundaries) ───────────────────

/**
 * Returns the SQL with comments and the contents of string literals and
 * dollar-quoted bodies replaced by spaces (newlines kept), so every character
 * keeps its offset and line. Quoted identifiers are kept as written. On the
 * masked text a keyword that only appears in a comment, a string or a function
 * body never matches, and every semicolon left ends a top-level statement.
 */
function maskSql(sql) {
  const blank = (text) => text.replace(/[^\n]/g, ' ')
  let out = ''
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    const next = sql[i + 1]
    const prev = sql[i - 1] ?? ''
    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i)
      const stop = end === -1 ? sql.length : end
      out += blank(sql.slice(i, stop))
      i = stop
    } else if (ch === '/' && next === '*') {
      // Block comments nest in PostgreSQL.
      let depth = 1
      let j = i + 2
      while (j < sql.length && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2 }
        else if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2 }
        else j++
      }
      out += blank(sql.slice(i, j))
      i = j
    } else if (ch === "'") {
      // '' is a quote inside any string; E'...' strings also take backslash escapes.
      const backslashEscapes = /[eE]/.test(prev) && !/[\w$]/.test(sql[i - 2] ?? '')
      let j = i + 1
      while (j < sql.length) {
        if (backslashEscapes && sql[j] === '\\') { j += 2; continue }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue }
          break
        }
        j++
      }
      const closed = j < sql.length
      out += "'" + blank(sql.slice(i + 1, Math.min(j, sql.length))) + (closed ? "'" : '')
      i = j + 1
    } else if (ch === '"') {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') { j += 2; continue }
          break
        }
        j++
      }
      out += sql.slice(i, j + 1)
      i = j + 1
    } else if (ch === '$' && !/[\w$]/.test(prev)) {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64))?.[0]
      if (!tag) {
        out += ch
        i++
        continue
      }
      const end = sql.indexOf(tag, i + tag.length)
      const bodyEnd = end === -1 ? sql.length : end
      out += tag + blank(sql.slice(i + tag.length, bodyEnd)) + (end === -1 ? '' : tag)
      i = end === -1 ? sql.length : end + tag.length
    } else {
      out += ch
      i++
    }
  }
  return out
}

const countNewlines = (text) => (text.match(/\n/g) || []).length

/** Top-level statements: the masked `code` (see maskSql) and its first `line`. */
function splitStatements(sql) {
  const masked = maskSql(sql)
  const statements = []
  let start = 0
  let line = 1
  for (let i = 0; i <= masked.length; i++) {
    if (i < masked.length && masked[i] !== ';') continue
    const code = masked.slice(start, i)
    const lead = code.search(/\S/)
    if (lead !== -1) statements.push({ code: code.trim(), line: line + countNewlines(code.slice(0, lead)) })
    line += countNewlines(code)
    start = i + 1
  }
  return statements
}

const SQL_IDENT = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`
const SQL_QUALIFIED_NAME = String.raw`${SQL_IDENT}(?:\s*\.\s*${SQL_IDENT})?`
const CREATE_ROUTINE = new RegExp(
  String.raw`^CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+(${SQL_QUALIFIED_NAME})\s*\(`,
  'i',
)
const REVOKE_ON_ROUTINES =
  /^REVOKE\s+(?!GRANT\s+OPTION\s+FOR\b)([\s\S]+?)\s+ON\s+(ALL\s+(?:FUNCTIONS|PROCEDURES|ROUTINES)\s+IN\s+SCHEMA|FUNCTION|PROCEDURE|ROUTINE)\s+([\s\S]+?)\s+FROM\s+([\s\S]+)$/i

/** Splits a list on the commas outside parentheses and double quotes. */
function splitTopLevel(text) {
  const parts = []
  let current = ''
  let depth = 0
  let quoted = false
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch === '(') depth++
    else if (!quoted && ch === ')') depth--
    if (ch === ',' && !quoted && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

/** `[schema.]name[(args)]` as { schema, name }; unquoted parts fold to lower case. */
function routineNameOf(text) {
  const match = new RegExp(`^(${SQL_QUALIFIED_NAME})`).exec(text.trim())
  if (!match) return null
  const fold = (part) => (part.startsWith('"') ? part.slice(1, -1).replace(/""/g, '"') : part.toLowerCase())
  const parts = match[1].match(new RegExp(SQL_IDENT, 'g')).map(fold)
  return parts.length === 2 ? { schema: parts[0], name: parts[1] } : { schema: null, name: parts[0] }
}

/**
 * The SECURITY DEFINER functions and procedures created or replaced in `content`
 * that no REVOKE ALL | EXECUTE ... FROM PUBLIC of the same file names. Names
 * match when they are equal and the schemas are equal or one side has none.
 */
function definerRoutinesWithoutRevokeFromPublic(content) {
  const definers = []
  const revoked = []
  for (const { code, line } of splitStatements(content)) {
    const create = CREATE_ROUTINE.exec(code)
    if (create) {
      if (/\bSECURITY\s+DEFINER\b/i.test(code)) {
        definers.push({ ...routineNameOf(create[1]), display: create[1].replace(/\s+/g, ''), line })
      }
      continue
    }

    const revoke = REVOKE_ON_ROUTINES.exec(code)
    if (!revoke || !/^(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)$/i.test(revoke[1].trim())) continue
    const grantees = revoke[4]
      .replace(/\s+(?:CASCADE|RESTRICT)\s*$/i, '')
      .replace(/\s+GRANTED\s+BY\s+[\s\S]*$/i, '')
    if (!splitTopLevel(grantees).some((grantee) => /^PUBLIC$/i.test(grantee))) continue

    const allInSchema = /^ALL\s/i.test(revoke[2])
    for (const target of splitTopLevel(revoke[3])) {
      const name = routineNameOf(target)
      if (!name) continue
      revoked.push(allInSchema ? { allInSchema: name.name } : name)
    }
  }

  const covers = (revoke, definer) =>
    revoke.allInSchema !== undefined
      ? revoke.allInSchema === (definer.schema ?? 'public')
      : revoke.name === definer.name &&
        (revoke.schema === null || definer.schema === null || revoke.schema === definer.schema)
  return definers.filter((definer) => !revoked.some((revoke) => covers(revoke, definer)))
}

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