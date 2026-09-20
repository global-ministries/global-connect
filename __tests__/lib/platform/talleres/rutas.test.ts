/**
 * T1 (odd/tasks/talleres-consolidar-pantallas.md) — pure URL builders for
 * the new /talleres/[taller]/[edicion]/[grupo] tree, plus the old→new
 * route map (docs/talleres-de-punta-a-punta.md §8, "De 32 a once").
 *
 * The builders never touch the network or the DB — every dynamic
 * segment (slug, edicionId, grupoId) is passed in by the caller.
 */

import fs from 'node:fs'
import path from 'node:path'

import {
  rutaCatalogo,
  rutaTaller,
  rutaEdicion,
  rutaGrupo,
  rutaPendientes,
  rutaReportes,
  rutaTemporadas,
  rutaTemporada,
  rutaTemporadaCrear,
  rutaExplorar,
  rutaMiRecorrido,
  rutaCertificado,
  TALLERES_RUTAS_ANTIGUAS,
} from '@/lib/platform/talleres/rutas'

describe('rutas — pure URL builders', () => {
  it('rutaCatalogo', () => {
    expect(rutaCatalogo()).toBe('/talleres')
  })

  it('rutaTaller(slug)', () => {
    expect(rutaTaller('proximo-paso')).toBe('/talleres/proximo-paso')
  })

  it('rutaEdicion(slug, edicionId)', () => {
    expect(rutaEdicion('proximo-paso', 'ed-1')).toBe('/talleres/proximo-paso/ed-1')
  })

  it('rutaGrupo(slug, edicionId, grupoId)', () => {
    expect(rutaGrupo('proximo-paso', 'ed-1', 'grupo-1')).toBe(
      '/talleres/proximo-paso/ed-1/grupo-1',
    )
  })

  it('rutaPendientes', () => {
    expect(rutaPendientes()).toBe('/talleres/pendientes')
  })

  it('rutaReportes', () => {
    expect(rutaReportes()).toBe('/talleres/reportes')
  })

  it('rutaTemporadas / rutaTemporada / rutaTemporadaCrear', () => {
    expect(rutaTemporadas()).toBe('/talleres/temporadas')
    expect(rutaTemporada('temp-1')).toBe('/talleres/temporadas/temp-1')
    // T8 — "crear", not "nueva": 4 of the app's 6 creation routes use
    // "crear", and the same object in Grupos de Vida is already
    // grupos-vida/temporadas/crear. The docs/talleres-de-punta-a-punta.md
    // tree said "nueva"; the doc was fixed, not the app.
    expect(rutaTemporadaCrear()).toBe('/talleres/temporadas/crear')
  })

  it('rutaExplorar', () => {
    expect(rutaExplorar()).toBe('/talleres/explorar')
  })

  it('rutaMiRecorrido / rutaCertificado', () => {
    expect(rutaMiRecorrido()).toBe('/talleres/mi-recorrido')
    expect(rutaCertificado('cert-1')).toBe('/talleres/mi-recorrido/certificados/cert-1')
  })

  it('every builder rejects an empty dynamic segment (no silent //  in the URL)', () => {
    expect(() => rutaTaller('')).toThrow()
    expect(() => rutaEdicion('slug', '')).toThrow()
    expect(() => rutaGrupo('slug', 'ed', '')).toThrow()
    expect(() => rutaTemporada('')).toThrow()
    expect(() => rutaCertificado('')).toThrow()
  })
})

describe('TALLERES_RUTAS_ANTIGUAS — old→new route map', () => {
  it('every entry has a non-empty origen starting with /talleres or /admin/talleres', () => {
    for (const entry of TALLERES_RUTAS_ANTIGUAS) {
      expect(entry.origen.length).toBeGreaterThan(0)
      expect(
        entry.origen.startsWith('/talleres/') || entry.origen.startsWith('/admin/talleres/'),
      ).toBe(true)
    }
  })

  it('every origen is unique', () => {
    const origenes = TALLERES_RUTAS_ANTIGUAS.map((e) => e.origen)
    expect(new Set(origenes).size).toBe(origenes.length)
  })

  it('T10: every entry is activa (acceptance criterion 1 — no old URL 404s)', () => {
    const inactivas = TALLERES_RUTAS_ANTIGUAS.filter((e) => !e.activa).map((e) => e.origen)
    expect(inactivas).toEqual([])
  })

  it('puente:true iff destino is null (a bridge page resolves it at request time instead)', () => {
    for (const entry of TALLERES_RUTAS_ANTIGUAS) {
      expect(entry.puente).toBe(entry.destino === null)
    }
  })

  it('T10 trap disarmed: the 2 stopgap redirects no longer chain into a route T10 deletes', () => {
    // odd/tasks/talleres-consolidar-pantallas.md, T10: /talleres/grupos and
    // /talleres/sesiones used to point at /talleres/equipo/mis-grupos and
    // /talleres/equipo/proximas-sesiones — both old routes T10 removes.
    // Resolved to their final destination (/talleres, which now carries
    // both "mis grupos" and "próximas sesiones" as catalog sections) so
    // deleting those two old routes can never re-break these menu items.
    const activas = TALLERES_RUTAS_ANTIGUAS.filter((e) => e.activa)
    const grupos = activas.find((e) => e.origen === '/talleres/grupos')
    const sesiones = activas.find((e) => e.origen === '/talleres/sesiones')
    expect(grupos?.destino).toBe('/talleres')
    expect(sesiones?.destino).toBe('/talleres')
  })

  it('T10 guard: no destino is itself an origen (no redirect chains through another old route)', () => {
    // odd/tasks/talleres-consolidar-pantallas.md, T10: the exact trap the
    // parent caught before this task ran — /talleres/grupos redirected to
    // /talleres/equipo/mis-grupos, an old route T10 deletes. Every destino
    // must be a FINAL destination, never another entry's origen, or
    // deleting that origen's route 404s the redirect all over again.
    const origenes = new Set(TALLERES_RUTAS_ANTIGUAS.map((e) => e.origen))
    const chained = TALLERES_RUTAS_ANTIGUAS.filter(
      (e) => e.destino !== null && origenes.has(e.destino),
    ).map((e) => `${e.origen} -> ${e.destino}`)
    expect(chained).toEqual([])
  })

  it('T10: /admin/talleres/inscripciones now covers the cross-edición audit via the pendientes filter', () => {
    // T6 resolved the "pendiente cruzado por taller" half; T10 closes the
    // rest — the state filter on /talleres/pendientes (default "pendiente")
    // covers the cross-edición audit that had no 1:1 replacement before.
    const entry = TALLERES_RUTAS_ANTIGUAS.find((e) => e.origen === '/admin/talleres/inscripciones')
    expect(entry?.destino).toBe('/talleres/pendientes')
    expect(entry?.activa).toBe(true)
  })

  it('the deleted screens (Recursos, Métricas) still redirect — no destino-less dead end', () => {
    const recursos = TALLERES_RUTAS_ANTIGUAS.find((e) => e.origen === '/talleres/equipo/recursos')
    const metricas = TALLERES_RUTAS_ANTIGUAS.find((e) => e.origen === '/talleres/direccion/metricas')
    expect(recursos?.destino).not.toBeNull()
    expect(metricas?.destino).not.toBeNull()
  })
})

// ─── T10 — every origen actually resolves ──────────────────────────────
//
// Two independent checks, matching the two mechanisms rutas.ts documents:
//   1. A `puente:true` entry's own ORIGEN must exist as a real page.tsx
//      (the bridge page replacing the old content, doing the lookup +
//      redirect at request time).
//   2. A `puente:false` entry's DESTINO must exist as a real page.tsx,
//      AND next.config.mjs's `redirects()` must contain a matching
//      source/destination pair (so the mapping isn't just documented in
//      rutas.ts but actually wired).
//
// Route existence reuses talleres-nav-routes-exist.test.ts's own
// technique (walk app/, strip route-group segments) rather than
// importing a shared helper — same one-file-per-guard convention as
// every other __tests__/invariants/talleres-*.test.ts file.

const REPO_ROOT = path.resolve(__dirname, '../../../..')
const APP_DIR = path.join(REPO_ROOT, 'app')
const NEXT_CONFIG_PATH = path.join(REPO_ROOT, 'next.config.mjs')

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

/** Every concrete URL path served by an app/ page file, with `[x]` segments normalized to `[*]` (the param's own name doesn't matter for existence). */
async function buildNormalizedRouteSet(): Promise<Set<string>> {
  const routes = new Set<string>()
  for await (const pageFile of walk(APP_DIR)) {
    const relativeToApp = path.relative(APP_DIR, path.dirname(pageFile))
    const segments = relativeToApp === '' ? [] : relativeToApp.split(path.sep)
    const urlSegments = segments.filter((segment) => !isRouteGroupSegment(segment))
    routes.add(normalizeBrackets('/' + urlSegments.join('/')))
  }
  return routes
}

/** Replaces every `[name]` dynamic segment with the literal `[*]`, and strips a trailing `?query`. */
function normalizeBrackets(urlPath: string): string {
  return urlPath.split('?')[0]!.replace(/\[[^\]]+\]/g, '[*]')
}

/** `[name]` -> `:name`, Next.js's own redirect path-matching syntax. */
function toNextConfigToken(urlPath: string): string {
  return urlPath.replace(/\[([^\]]+)\]/g, ':$1')
}

/** Extracts every `{ source: '...', destination: '...' }` pair from next.config.mjs's `redirects()`, in order. Text-based on purpose — importing next.config.mjs pulls in the Sentry webpack plugin's own module-load side effects. */
function readNextConfigRedirects(): ReadonlyArray<{ source: string; destination: string }> {
  const content = fs.readFileSync(NEXT_CONFIG_PATH, 'utf-8')
  const sourceRe = /source:\s*'([^']+)'/g
  const destinationRe = /destination:\s*'([^']+)'/g
  const sources = [...content.matchAll(sourceRe)].map((m) => m[1]!)
  const destinations = [...content.matchAll(destinationRe)].map((m) => m[1]!)
  expect(sources.length).toBe(destinations.length)
  return sources.map((source, i) => ({ source, destination: destinations[i]! }))
}

describe('TALLERES_RUTAS_ANTIGUAS — T10: every origen actually resolves', () => {
  it('every puente:true origen has its own bridge page.tsx (the redirect-resolving replacement)', async () => {
    const routes = await buildNormalizedRouteSet()
    const missing = TALLERES_RUTAS_ANTIGUAS.filter((e) => e.puente)
      .filter((e) => !routes.has(normalizeBrackets(e.origen)))
      .map((e) => e.origen)
    expect(missing).toEqual([])
  })

  it('every non-puente destino resolves to a real page.tsx', async () => {
    const routes = await buildNormalizedRouteSet()
    const missing = TALLERES_RUTAS_ANTIGUAS.filter((e) => !e.puente)
      .filter((e) => !routes.has(normalizeBrackets(e.destino!)))
      .map((e) => `${e.origen} -> ${e.destino}`)
    expect(missing).toEqual([])
  })

  it('every non-puente entry has a matching next.config.mjs redirect (source AND destination)', () => {
    const configRedirects = readNextConfigRedirects()
    const configSet = new Set(configRedirects.map((r) => `${r.source} -> ${r.destination}`))

    const missing = TALLERES_RUTAS_ANTIGUAS.filter((e) => !e.puente)
      .map((e) => `${toNextConfigToken(e.origen)} -> ${toNextConfigToken(e.destino!)}`)
      .filter((pair) => !configSet.has(pair))
    expect(missing).toEqual([])
  })

  it('next.config.mjs carries no extra talleres redirect absent from the inventory (single source of truth)', () => {
    const configRedirects = readNextConfigRedirects()
    const expected = new Set(
      TALLERES_RUTAS_ANTIGUAS.filter((e) => !e.puente).map(
        (e) => `${toNextConfigToken(e.origen)} -> ${toNextConfigToken(e.destino!)}`,
      ),
    )
    const extra = configRedirects
      .filter((r) => r.source.startsWith('/talleres/') || r.source.startsWith('/admin/talleres/'))
      .map((r) => `${r.source} -> ${r.destination}`)
      .filter((pair) => !expected.has(pair))
    expect(extra).toEqual([])
  })
})
