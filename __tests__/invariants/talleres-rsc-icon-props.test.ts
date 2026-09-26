/**
 * Guard — a server page under app/(auth)/talleres must never hand a
 * component (a lucide icon is a forwardRef object) to a `'use client'`
 * component through an `icono={...}` prop.
 *
 * Why this exists: on 2026-09-26 the grupo screen crashed in production
 * ("Minified React error #441") for a grupo with no sesiones, no team and
 * no reporte. Vercel's server log held the real message:
 *
 *   Error: Functions cannot be passed directly to Client Components unless
 *   you explicitly expose it by marking it with "use server".
 *     {$$typeof: ..., render: function, displayName: ...}
 *
 * `EstadoVacio` was `'use client'` and six talleres server pages passed it
 * `icono={Users}` and friends. Jest cannot see the server/client boundary,
 * so every page test stayed green while every empty state in production
 * was a black screen. This guard resolves each `icono={Identifier}` usage
 * in a server page to the imported component's source file and fails if
 * that file starts with `'use client'`.
 */

import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../..')
const TALLERES_APP_DIR = path.join(REPO_ROOT, 'app', '(auth)', 'talleres')

function walkPages(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkPages(full, out)
    else if (entry.name === 'page.tsx') out.push(full)
  }
  return out
}

function isClientModule(source: string): boolean {
  return /^\s*(['"])use client\1/.test(source)
}

function resolveImport(specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? path.join(REPO_ROOT, specifier.slice(2))
    : null
  if (!base) return null
  for (const candidate of [`${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx')]) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/** `import { A, B as C } from '...'` → local name → module specifier. */
function importedComponents(source: string): Map<string, string> {
  const map = new Map<string, string>()
  const re = /import\s+(?:(\w+)|\{([^}]+)\})\s+from\s+['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const [, defaultName, named, specifier] = m
    if (defaultName) map.set(defaultName, specifier)
    if (named) {
      for (const part of named.split(',')) {
        const local = part.trim().split(/\s+as\s+/).pop()?.trim()
        if (local) map.set(local, specifier)
      }
    }
  }
  return map
}

describe('talleres server pages never pass an icon component into a client component', () => {
  const serverPages = walkPages(TALLERES_APP_DIR).filter(
    (file) => !isClientModule(fs.readFileSync(file, 'utf8')),
  )

  it('finds the talleres server pages', () => {
    expect(serverPages.length).toBeGreaterThan(0)
  })

  it.each(serverPages.map((file) => [path.relative(REPO_ROOT, file), file]))(
    '%s',
    (_label, file) => {
      const source = fs.readFileSync(file, 'utf8')
      const imports = importedComponents(source)
      const offenders: string[] = []
      // `[^>]*` already spans newlines, so multi-line JSX opening tags match
      // without the dotAll flag (which the repo's TS target does not allow).
      const usage = /<([A-Z][A-Za-z0-9]*)\b[^>]*\bicono=\{[A-Z][A-Za-z0-9]*\}/g
      let m: RegExpExecArray | null
      while ((m = usage.exec(source)) !== null) {
        const component = m[1]
        const specifier = imports.get(component)
        const resolved = specifier ? resolveImport(specifier) : null
        if (resolved && isClientModule(fs.readFileSync(resolved, 'utf8'))) {
          offenders.push(`${component} (${path.relative(REPO_ROOT, resolved)})`)
        }
      }
      expect(offenders).toEqual([])
    },
  )
})
