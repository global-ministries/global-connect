/**
 * T1 — remove the unused create-taller wizard and its RPC.
 *
 * `app/(auth)/admin/talleres/nuevo/**` was the old admin wizard for
 * `create_taller_with_initial_state` (PR21). It has no inbound links from
 * any other screen and the RPC creates orphan `dream_team_equipos` rows
 * (see odd/tasks/talleres-equipo-en-organigrama.md, "Problema y porqué").
 * Acceptance criterion 7: the RPC no longer exists and the route 404s.
 *
 * This guard asserts both halves stay gone:
 *   1. The route directory `app/(auth)/admin/talleres/nuevo` is absent.
 *   2. No source file (outside `supabase/migrations/**`, which keeps the
 *      historical CREATE and the new DROP for the record) references
 *      `create_taller_with_initial_state`.
 */

import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../..')
const OLD_WIZARD_DIR = path.join(REPO_ROOT, 'app', '(auth)', 'admin', 'talleres', 'nuevo')
const THIS_FILE = path.resolve(__filename)

const SCAN_DIRS = ['app', 'lib', 'components', 'hooks', 'pages', 'scripts', '__tests__', 'tests', 'emails', 'database', 'supabase']

const EXCLUDED_DIR_SEGMENTS = new Set(['node_modules', '.next', '.git', 'coverage'])
// supabase/migrations is historical record — excluded per T1 scope.
const EXCLUDED_PATH_SEGMENTS = ['supabase/migrations']

const SCANNABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sql'])

const TARGET = 'create_taller_with_initial_state'

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (EXCLUDED_DIR_SEGMENTS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    const relative = path.relative(REPO_ROOT, full)
    if (EXCLUDED_PATH_SEGMENTS.some((segment) => relative.startsWith(segment))) continue
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (entry.isFile() && SCANNABLE_EXTENSIONS.has(path.extname(entry.name))) {
      yield full
    }
  }
}

describe('T1 — old taller wizard removed', () => {
  it('app/(auth)/admin/talleres/nuevo does not exist', () => {
    expect(fs.existsSync(OLD_WIZARD_DIR)).toBe(false)
  })

  it('no source file (outside supabase/migrations) references create_taller_with_initial_state', async () => {
    const violations: string[] = []

    for (const dir of SCAN_DIRS) {
      for await (const file of walk(path.join(REPO_ROOT, dir))) {
        if (path.resolve(file) === THIS_FILE) continue
        const content = await fs.promises.readFile(file, 'utf-8')
        if (content.includes(TARGET)) {
          violations.push(path.relative(REPO_ROOT, file))
        }
      }
    }

    if (violations.length > 0) {
      console.error(`${TARGET} still referenced in: ${violations.join(', ')}`)
    }
    expect(violations).toEqual([])
  })
})
