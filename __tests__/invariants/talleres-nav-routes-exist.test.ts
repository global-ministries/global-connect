/**
 * T0 — every talleres nav item must point at a route that exists.
 *
 * odd/tasks/talleres-consolidar-pantallas.md, "Problema y porqué": three
 * menu items ("Mis Grupos", "Próximas Sesiones", "Recursos") pointed at
 * `/talleres/{grupos,sesiones,recursos}`, none of which existed — a
 * silent 404 from the sidebar.
 *
 * This guard is written generically against `TALLERES_NAV_ITEMS`
 * (`lib/platform/talleres/route-access.ts`), not against today's fixed
 * list of hrefs, so it keeps guarding the nav catalog through the rest
 * of the consolidation (T2–T10) as routes move under the new
 * `/talleres/[taller]/...` tree.
 *
 * A Next.js App Router route "exists" when there is a `page.tsx`/`page.ts`
 * under `app/` whose path — after stripping parenthesized route-group
 * segments, which are invisible in the URL — matches the href exactly
 * (dynamic segments like `[id]` match literally; no nav item uses one
 * today, but the matcher does not special-case that away).
 */

import fs from 'node:fs'
import path from 'node:path'

import { TALLERES_NAV_ITEMS } from '@/lib/platform/talleres/route-access'

const REPO_ROOT = path.resolve(__dirname, '../..')
const APP_DIR = path.join(REPO_ROOT, 'app')

const EXCLUDED_DIR_SEGMENTS = new Set(['node_modules', '.next', '.git'])
const PAGE_FILENAMES = new Set(['page.tsx', 'page.ts'])

function isRouteGroupSegment(segment: string): boolean {
  return segment.startsWith('(') && segment.endsWith(')')
}

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
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (entry.isFile() && PAGE_FILENAMES.has(entry.name)) {
      yield full
    }
  }
}

/** Builds the set of every concrete URL path served by an app/ page file. */
async function buildRouteSet(): Promise<Set<string>> {
  const routes = new Set<string>()
  for await (const pageFile of walk(APP_DIR)) {
    const relativeToApp = path.relative(APP_DIR, path.dirname(pageFile))
    const segments = relativeToApp === '' ? [] : relativeToApp.split(path.sep)
    const urlSegments = segments.filter((segment) => !isRouteGroupSegment(segment))
    routes.add('/' + urlSegments.join('/'))
  }
  return routes
}

describe('talleres nav catalog — every href resolves to an existing route', () => {
  it('every TALLERES_NAV_ITEMS.href has a matching app/ page file', async () => {
    const routes = await buildRouteSet()

    const missing = TALLERES_NAV_ITEMS.filter((item) => !routes.has(item.href)).map(
      (item) => `${item.id} -> ${item.href}`,
    )

    if (missing.length > 0) {
      console.error(`talleres nav items with no matching route: ${missing.join(', ')}`)
    }
    expect(missing).toEqual([])
  })
})
