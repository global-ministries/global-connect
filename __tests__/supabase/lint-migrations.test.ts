/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// The linter is a CLI script (it calls process.exit), so it runs as a child
// process over a temp directory of fixture migrations, the same way CI runs it.
const LINTER = resolve(__dirname, '../../supabase/tests/lint-migrations.mjs')
const RULE = '[security-definer-revoke-public]'

const dirs: string[] = []

function lint(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'lint-migrations-'))
  dirs.push(dir)
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql)
  const run = spawnSync(process.execPath, [LINTER, dir], { encoding: 'utf8' })
  const ruleLines = run.stdout.split('\n').filter((line) => line.includes(RULE))
  return { status: run.status, ruleLines }
}

const definer = (name: string, body = 'SELECT true') => `
CREATE OR REPLACE FUNCTION ${name}(p_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$ ${body} $$;
`

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

describe('lint-migrations: a SECURITY DEFINER function must revoke PUBLIC (from 20261003 on)', () => {
  it('flags a definer function that has no REVOKE ... FROM PUBLIC', () => {
    const { status, ruleLines } = lint({ '20261003150000_sin_revoke.sql': definer('public.zz_bad') })

    expect(status).toBe(1)
    expect(ruleLines).toHaveLength(1)
    expect(ruleLines[0]).toContain('public.zz_bad (line 2)')
  })

  it('accepts REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon', () => {
    const { status, ruleLines } = lint({
      '20261003150000_con_revoke.sql': `${definer('public.zz_ok')}
REVOKE ALL ON FUNCTION public.zz_ok(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.zz_ok(uuid) TO authenticated, service_role;
`,
    })

    expect(ruleLines).toEqual([])
    expect(status).toBe(0)
  })

  it('accepts REVOKE ... ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC', () => {
    const { status, ruleLines } = lint({
      '20261003150000_todo_el_esquema.sql': `${definer('public.zz_one')}${definer('zz_two')}
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
`,
    })

    expect(ruleLines).toEqual([])
    expect(status).toBe(0)
  })

  it('reads SECURITY DEFINER only in the function header, never in a body or a string', () => {
    const { ruleLines } = lint({
      '20261003150000_cuerpos.sql': `
CREATE FUNCTION public.zz_invoker() RETURNS text LANGUAGE sql
AS $$ SELECT 'not a SECURITY DEFINER function' $$;
${definer('public.zz_said_twice', "SELECT 'SECURITY DEFINER' IS NOT NULL")}
DO $do$
BEGIN
  EXECUTE 'CREATE FUNCTION public.zz_dynamic() RETURNS int LANGUAGE sql SECURITY DEFINER AS ''SELECT 1''';
END
$do$;
`,
    })

    expect(ruleLines).toHaveLength(1)
    expect(ruleLines[0]).toContain('public.zz_said_twice')
    expect(ruleLines[0].split('zz_said_twice')).toHaveLength(2)
    expect(ruleLines[0]).not.toContain('zz_invoker')
    expect(ruleLines[0]).not.toContain('zz_dynamic')
  })

  it('never errors on a migration older than 20261003', () => {
    const { status, ruleLines } = lint({ '20261002235959_antigua.sql': definer('public.zz_old') })

    expect(ruleLines).toEqual([])
    expect(status).toBe(0)
  })
})
