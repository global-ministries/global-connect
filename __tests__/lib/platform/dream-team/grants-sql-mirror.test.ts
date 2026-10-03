/**
 * Pins the role -> capability mapping of lib/platform/dream-team/grants.ts to
 * the grants-table block of supabase/tests/dream-team-cargar-voluntarios.test.sql.
 *
 * The volunteer loader (public.dream_team_cargar_voluntarios) runs in SQL and
 * cannot call TypeScript, so public.dream_team_grants_de_servicio mirrors
 * buildGrantsForServicio. Both sides are checked against the SAME table: the
 * SQL suite checks the database function, this test checks the TypeScript one.
 * When grants.ts changes, this test fails until the table changes; then the
 * SQL suite fails until a new migration updates the SQL mirror.
 *
 * Both branches of buildGrantsForServicio are pinned: the generic role map and
 * the experience-specific capability (its experiences and its lead and director
 * tiers). The table holds every known role label under every experience with a
 * capability of its own, and every mapped label under one experience without
 * one, so a new experience, a new or removed tier label, or a changed tier
 * capability fails here.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  buildGrantsForServicio,
  experiencesWithSpecificCapability,
  leadOrDirectorRoleLabels,
  mappedRoleLabels,
} from '@/lib/platform/dream-team/grants'

const SQL_SUITE = path.resolve(
  __dirname,
  '../../../../supabase/tests/dream-team-cargar-voluntarios.test.sql',
)
const BEGIN_MARKER = '-- grants-table:begin'
const END_MARKER = '-- grants-table:end'
const EQUIPO_ID = 'equipo-pin'
const ROL_ID = 'rol-pin'

type Alcance = 'equipo' | 'rol' | 'none'

interface PinnedGrant {
  readonly experiencia: string
  readonly rol: string
  readonly capabilityKey: string
  readonly experience: string
  readonly scopeType: string
  readonly alcance: Alcance
}

const TUPLE =
  /^\('([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '(equipo|rol|none)'\),?$/

function readPinnedTable(): readonly PinnedGrant[] {
  const sql = fs.readFileSync(SQL_SUITE, 'utf-8')
  const begin = sql.indexOf(BEGIN_MARKER)
  const end = sql.indexOf(END_MARKER)
  if (begin < 0 || end < begin) {
    throw new Error(`grants-table markers not found in ${SQL_SUITE}`)
  }
  return sql
    .slice(begin + BEGIN_MARKER.length, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const match = TUPLE.exec(line)
      if (!match) throw new Error(`unparsed grants-table line: ${line}`)
      const [, experiencia, rol, capabilityKey, experience, scopeType, alcance] = match
      return { experiencia, rol, capabilityKey, experience, scopeType, alcance: alcance as Alcance }
    })
}

function normalize(label: string): string {
  return label.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function alcanceOf(scopeId: string | undefined): Alcance | string {
  if (scopeId === undefined) return 'none'
  if (scopeId === EQUIPO_ID) return 'equipo'
  if (scopeId === ROL_ID) return 'rol'
  return `other:${scopeId}`
}

function asKey(row: Omit<PinnedGrant, 'experiencia' | 'rol'>): string {
  return [row.capabilityKey, row.experience, row.scopeType, row.alcance].join('|')
}

const table = readPinnedTable()
const pairs = [...new Set(table.map((row) => `${row.experiencia}\u0000${row.rol}`))].map((pair) => {
  const [experiencia, rol] = pair.split('\u0000')
  return { experiencia, rol }
})
const pinnedPairs = new Set(table.map((row) => `${row.experiencia}|${normalize(row.rol)}`))

// The (experiencia, label) pairs the table lacks, as "experiencia/label".
function missingPairs(experiences: readonly string[], labels: readonly string[]): readonly string[] {
  return experiences.flatMap((experiencia) =>
    labels
      .filter((label) => !pinnedPairs.has(`${experiencia}|${label}`))
      .map((label) => `${experiencia}/${label}`),
  )
}

describe('grants.ts and its SQL mirror share one pinned table', () => {
  it('reads a non-empty table with no duplicate rows', () => {
    expect(table.length).toBeGreaterThan(0)
    const keys = table.map((row) => `${row.experiencia}|${row.rol}|${asKey(row)}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(pairs)('buildGrantsForServicio matches the table for $rol under $experiencia', ({ experiencia, rol }) => {
    const actual = buildGrantsForServicio({ id: EQUIPO_ID, experiencia }, { id: ROL_ID, label: rol })
      .map((grant) =>
        asKey({
          capabilityKey: grant.capabilityKey,
          experience: grant.experience,
          scopeType: grant.scopeType,
          alcance: alcanceOf(grant.scopeId) as Alcance,
        }),
      )
      .sort()
    const expected = table
      .filter((row) => row.experiencia === experiencia && row.rol === rol)
      .map(asKey)
      .sort()

    expect(actual).toEqual(expected)
  })

  it('covers coordinador, entrenador, lider, voluntario and director under ninos', () => {
    const ninosRoles = new Set(table.filter((row) => row.experiencia === 'ninos').map((row) => normalize(row.rol)))
    for (const rol of ['coordinador', 'entrenador', 'lider', 'voluntario', 'director']) {
      expect(ninosRoles).toContain(rol)
    }
  })

  it('covers every role label grants.ts maps to capabilities', () => {
    const pinnedRoles = new Set(table.map((row) => normalize(row.rol)))
    const missing = mappedRoleLabels().filter((label) => !pinnedRoles.has(label))
    expect(missing).toEqual([])
  })

  it('pins every known role label under every experience with a capability of its own', () => {
    const knownLabels = [...new Set([...mappedRoleLabels(), ...leadOrDirectorRoleLabels()])]
    expect(experiencesWithSpecificCapability().length).toBeGreaterThan(0)
    expect(missingPairs(experiencesWithSpecificCapability(), knownLabels)).toEqual([])
  })

  it('pins every mapped role label under an experience without a capability of its own', () => {
    const specific = new Set(experiencesWithSpecificCapability())
    const withoutOwn = [...new Set(table.map((row) => row.experiencia))].filter((e) => !specific.has(e))
    expect(withoutOwn.length).toBeGreaterThan(0)
    expect(missingPairs(withoutOwn, mappedRoleLabels())).toEqual([])
  })
})
