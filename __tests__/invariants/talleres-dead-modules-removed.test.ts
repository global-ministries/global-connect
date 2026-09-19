/**
 * T0 — remove the 10 dead `lib/platform/talleres/*` modules.
 *
 * odd/tasks/talleres-consolidar-pantallas.md, "Problema y porqué":
 * `state`, `state-machine`, `types`, `events`, `recurrence`,
 * `participation-kinds`, `participation-ledger-talleres-writer`,
 * `solicitudes-retiro` (the loader — not `solicitudes-retiro-actions`,
 * which stays alive), `capabilities`, `index` are imported only by each
 * other and by their own tests. No screen, action, or API consumes them.
 *
 * This guard asserts both halves stay gone:
 *   1. Each module file is absent from `lib/platform/talleres/`.
 *   2. No source file (outside `openspec/**`, which is historical design
 *      prose, not code) imports any of them — neither via the `@/...`
 *      alias nor a relative specifier.
 */

import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../..')
const TALLERES_DIR = path.join(REPO_ROOT, 'lib', 'platform', 'talleres')
const THIS_FILE = path.resolve(__filename)

const DEAD_MODULES = [
  'state',
  'state-machine',
  'types',
  'events',
  'recurrence',
  'participation-kinds',
  'participation-ledger-talleres-writer',
  'solicitudes-retiro',
  'capabilities',
  'index',
] as const

const SCAN_DIRS = ['app', 'lib', 'components', 'hooks', 'emails', '__tests__']

const EXCLUDED_DIR_SEGMENTS = new Set(['node_modules', '.next', '.git', 'coverage'])
// openspec/** is historical design prose (Markdown), not code — excluded per T0 scope.
const EXCLUDED_PATH_SEGMENTS = ['openspec']

const SCANNABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

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

describe('T0 — dead lib/platform/talleres modules removed', () => {
  it('none of the 10 dead module files exist', () => {
    const present = DEAD_MODULES.filter((name) =>
      fs.existsSync(path.join(TALLERES_DIR, `${name}.ts`)),
    )
    expect(present).toEqual([])
  })

  it('no source file imports a dead module via the @/ alias', async () => {
    const violations: Array<{ file: string; module: string }> = []

    for (const dir of SCAN_DIRS) {
      for await (const file of walk(path.join(REPO_ROOT, dir))) {
        if (path.resolve(file) === THIS_FILE) continue
        const content = await fs.promises.readFile(file, 'utf-8')
        for (const name of DEAD_MODULES) {
          // eslint-disable-next-line security/detect-non-literal-regexp -- name comes from the fixed local DEAD_MODULES list, no user input
          const aliasQuoted = new RegExp(`['"]@/lib/platform/talleres/${name}['"]`)
          const bareIndexQuoted = /['"]@\/lib\/platform\/talleres['"]/
          if (
            aliasQuoted.test(content) ||
            (name === 'index' && bareIndexQuoted.test(content))
          ) {
            violations.push({ file: path.relative(REPO_ROOT, file), module: name })
          }
        }
      }
    }

    if (violations.length > 0) {
      console.error(
        `dead talleres modules still imported (alias): ${violations
          .map((v) => `${v.file} -> ${v.module}`)
          .join(', ')}`,
      )
    }
    expect(violations).toEqual([])
  })

  it('no remaining lib/platform/talleres file imports a dead module via a relative specifier', async () => {
    const violations: Array<{ file: string; module: string }> = []

    for await (const file of walk(TALLERES_DIR)) {
      const content = await fs.promises.readFile(file, 'utf-8')
      for (const name of DEAD_MODULES) {
        // eslint-disable-next-line security/detect-non-literal-regexp -- name comes from the fixed local DEAD_MODULES list, no user input
        const relativeQuoted = new RegExp(`['"]\\./${name}['"]`)
        if (relativeQuoted.test(content)) {
          violations.push({ file: path.relative(REPO_ROOT, file), module: name })
        }
      }
    }

    if (violations.length > 0) {
      console.error(
        `dead talleres modules still imported (relative): ${violations
          .map((v) => `${v.file} -> ${v.module}`)
          .join(', ')}`,
      )
    }
    expect(violations).toEqual([])
  })
})
