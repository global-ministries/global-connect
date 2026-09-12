/**
 * W04 — DT-024 — Byte-identity verifier for protected files.
 * F(pastoral/byte-identity) — CI runs git diff to verify protected files unchanged.
 *
 * Protected files (I-1 to I-16):
 *  - lib/platform/{grants,participation,navigation,routeGuard,persona,preflight,flags,family}.ts
 *  - lib/platform/dream-team/
 *  - lib/platform/adapters/grupos-vida.ts
 *  - lib/platform/operating-core/{kinds,state,capture-states,participation-read-guard,capture-ux-types,types}.ts
 *
 * This test runs in CI by PR and fails if any protected file has changed.
 *
 * Allowlist with rationale:
 *   PR24 (2026-08-14) intentionally modified
 *   `lib/platform/navigation.ts` to fix the E2E-found sidebar 404 —
 *   the talleres admin availableHref pointed at `/admin/talleres`
 *   even though that page was removed in PR21.1.
 *
 *   PR25 (2026-08-14) retargeted the same talleres admin
 *   availableHref from `/talleres/direccion/talleres` to
 *   `/admin/talleres/abstracto` (the wizard entry-point). Mirror of
 *   the allow-list in
 *   `tests/byte-identity/protected-files.test.ts`.
 *
 *   PR28 (2026-08-15) merged `talleres_admin` into `talleres_participation`
 *   in `lib/platform/navigation.ts` — the parent id, label, and
 *   capability changed (admin-only entries now live under the
 *   sub-menu, not as a separate top-level item). The byte-identity
 *   guard still passes because the protected file changed, but the
 *   change is allow-listed for the same reason as PR24/PR25.
 */

import { execSync } from 'node:child_process'
import { resolveMainRef } from '../../../../tests/helpers/git-ref'

const PROTECTED_PATHS = [
  'lib/platform/grants.ts',
  'lib/platform/participation.ts',
  'lib/platform/navigation.ts',
  'lib/platform/routeGuard.ts',
  'lib/platform/persona.ts',
  'lib/platform/preflight.ts',
  'lib/platform/flags.ts',
  'lib/platform/family.ts',
  'lib/platform/dream-team/',
  'lib/platform/adapters/grupos-vida.ts',
  'lib/platform/operating-core/kinds.ts',
  'lib/platform/operating-core/state.ts',
  'lib/platform/operating-core/capture-states.ts',
  'lib/platform/operating-core/participation-read-guard.ts',
  'lib/platform/operating-core/capture-ux/capture-ux-types.ts',
  'lib/platform/operating-core/types.ts',
]

// Allowlist: paths that may change in this PR with a documented rationale.
// Must match the allow-list in tests/byte-identity/protected-files.test.ts.
const INTENTIONALLY_CHANGED_IN_HEAD: ReadonlySet<string> = new Set([
  //
  // feature/dream-team-base (2026-09-10): this branch turns Dream Team from an
  // empty scaffold into the working volunteer umbrella for the whole church.
  // The guard was written while Dream Team was frozen scaffolding; this is
  // exactly the kind of deliberate change it exists to surface, so every
  // touched path is declared here rather than weakening the guard.
  //
  //   route-access.ts   — org.manage added to both capability lists (the
  //                       structure admin was hitting notFound on every
  //                       screen), plus a presence check for the equipo-scoped
  //                       dream_team.direct, which can never resolve without a
  //                       node id.
  //   grants.ts         — role labels now match case- and diacritic-insensitively
  //                       (the SQL trigger seeds lowercase, the map expected
  //                       capitalized, so generic capabilities were never
  //                       minted); the director role mints the equipo-scoped
  //                       dream_team.direct instead of the global capability.
  //   repository*.ts    — createEquipo/createRol/updateEquipo/updateRol (the
  //                       org tree could only be seeded by hand-written
  //                       migrations) and applyServicioGrants.
  //   types.ts          — experiencia typed as PlatformExperienceKey so the
  //                       catalog and the database cannot drift apart.
  //   arbol.ts          — new: builds the org tree, treating an unresolvable
  //                       parent as a root, which is the normal shape of a
  //                       scoped read.
  //   personas.ts       — new: one bulk name lookup for the listing screens.
  //   lideres-gdv.ts    — new (2026-09-11): reads Grupos de Vida leaders via
  //                       the dream_team_lideres_gdv() RPC, surfaced
  //                       read-only in the servidores/mi-equipo screens.
  //   servidores.ts     — new (2026-09-11): pure Servidor union + helpers so
  //                       both screens share one notion of "a person
  //                       serving" across the two sources.
  //   capabilities.ts   — new (2026-09-11): the pure capability gates moved
  //                       out of route-access.ts so the client-side sidebar
  //                       can import them without pulling in
  //                       createSupabaseServerClient.
  //   navigation.ts     — new (2026-09-11): the sidebar's Dream Team entry
  //                       (three items) and the client-safe flag reader that
  //                       backs it.
  //
  // 20260911140000_dream_team_estructura_gdv.sql (2026-09-11): the Grupos de
  // Vida branch gets its real hierarchy (Dirección → Segmentos → Grupos) and
  // every node gets its responsables, instead of 110 leaders hanging flat off
  // the root.
  //
  //   arbol.ts            — construirArbol generalized (generic over the
  //                         node shape) so it also builds the tree merged
  //                         with the virtual Grupos de Vida branch, WITHOUT
  //                         changing its existing real-only behaviour.
  //   estructura-gdv.ts   — new: reads the virtual branch (dirección,
  //                         segmentos, grupos vigentes) with their
  //                         responsables via dream_team_estructura_gdv().
  //   estructura-arbol.ts — new: merges real equipos with the virtual
  //                         branch into the tree builder's input, and
  //                         derives director/coordinador responsables for
  //                         real nodes from dream_team_servicios.
  //   lideres-gdv.ts      — dream_team_lideres_gdv() changed shape (one row
  //                         per person AND GROUP, `equipoId` now the group's
  //                         id); the `grupos` count column is gone.
  'lib/platform/dream-team/arbol.ts',
  'lib/platform/dream-team/capabilities.ts',
  'lib/platform/dream-team/estructura-arbol.ts',
  'lib/platform/dream-team/estructura-gdv.ts',
  'lib/platform/dream-team/grants.ts',
  'lib/platform/dream-team/lideres-gdv.ts',
  'lib/platform/dream-team/navigation.ts',
  'lib/platform/dream-team/personas.ts',
  'lib/platform/dream-team/repository-fake.ts',
  'lib/platform/dream-team/repository-supabase.ts',
  'lib/platform/dream-team/repository.ts',
  'lib/platform/dream-team/route-access.ts',
  'lib/platform/dream-team/servidores.ts',
  'lib/platform/dream-team/types.ts',

  // PR24 (2026-08-14): fix sidebar 404 — talleres admin href /admin/talleres
  // (404) -> /talleres/direccion/talleres (real route). One-line string.
  //
  // PR25 (2026-08-14): retarget the same talleres admin href to
  // /admin/talleres/abstracto (real wizard entry-point). Mirror of
  // the global allow-list — same one-line string change to a
  // protected file, no structural impact on the navigation registry.
  //
  // PR28 (2026-08-15): merge talleres_admin into talleres_participation
  // (parent id, label, capability change). Same protected file, same
  // one-line structural change reflected in the registry, no impact
  // on the byte-identity contract.
  'lib/platform/navigation.ts',
])

describe('Byte-identity — protected files unchanged (I-1 to I-16)', () => {
  it('no diff on protected files between main and HEAD', () => {
    let diffOutput: string

    try {
      diffOutput = execSync(
        `git diff ${resolveMainRef()}..HEAD -- ${PROTECTED_PATHS.join(' ')}`,
        { encoding: 'utf-8', cwd: process.cwd() },
      )
    } catch (err: unknown) {
      // git diff returns non-zero when there's no diff
      const error = err as { status?: number; stdout?: string }
      if (error.status === 0) {
        diffOutput = error.stdout ?? ''
      } else {
        // Actual error
        throw err
      }
    }

    // Filter out changes that are explicitly allow-listed in this PR.
    // Each allow-listed file must have a rationale in the comment above
    // and `INTENTIONALLY_CHANGED_IN_HEAD` must declare it.
    const filteredDiff = diffOutput
      .split(/^diff --git /m)
      .filter((block) => block.trim().length > 0)
      .filter((block) => {
        const headerMatch = block.match(/^a\/(.+?)\s+b\//)
        if (!headerMatch) return true
        const changedPath = headerMatch[1]
        return !INTENTIONALLY_CHANGED_IN_HEAD.has(changedPath)
      })
      .join('diff --git ')

    // If filteredDiff is empty, no unprotected files changed — test passes
    expect(filteredDiff.trim()).toBe('')
  })

  it('protected files exist and are accessible', () => {
    const { existsSync, statSync } = require('node:fs')

    for (const path of PROTECTED_PATHS) {
      const fullPath = require('path').join(process.cwd(), path)
      // Check parent directory exists for directories
      const pathOrParent = path.endsWith('/') ? fullPath : require('path').dirname(fullPath)

      if (path.endsWith('/')) {
        // Directory — just check parent exists
        expect(existsSync(pathOrParent)).toBe(true)
      } else {
        expect(existsSync(fullPath)).toBe(true)
      }
    }
  })
})
