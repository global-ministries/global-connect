/**
 * Pins the nivel -> capability mapping of lib/platform/dream-team/grants.ts to
 * the grants-table block of supabase/tests/dream-team-grants-por-nivel.test.sql.
 *
 * The volunteer loader (public.dream_team_cargar_voluntarios) runs in SQL and
 * cannot call TypeScript, so public.dream_team_grants_de_servicio mirrors
 * buildGrantsForServicio. Both sides are checked against the SAME table: the
 * SQL suite checks the database function, this test checks the TypeScript one.
 * When grants.ts changes, this test fails until the table changes; then the
 * SQL suite fails until a new migration updates the SQL mirror.
 *
 * Since T6 (odd/tasks/uno-a-uno.md) the grants come from the rol's nivel, so
 * the table holds every nivel under every experiencia with a capability of its
 * own and under one without, each with a free label that names no level, plus
 * the one label exception ("Líder de grupo") under every experiencia. A new
 * nivel, a new experiencia, or a changed capability fails here.
 */
import fs from 'node:fs'
import path from 'node:path'
import { buildGrantsForServicio, experiencesWithSpecificCapability } from '@/lib/platform/dream-team/grants'
import { NIVELES_ROL, esNivelRol, nivelDesdeLabel } from '@/lib/platform/dream-team/nivel-rol'

const MIGRATION = path.resolve(
  __dirname,
  '../../../../supabase/migrations/20261025100000_dream_team_grants_por_nivel.sql',
)
const SQL_SUITE = path.resolve(
  __dirname,
  '../../../../supabase/tests/dream-team-grants-por-nivel.test.sql',
)
const BEGIN_MARKER = '-- grants-table:begin'
const END_MARKER = '-- grants-table:end'
const EQUIPO_ID = 'equipo-pin'
const ROL_ID = 'rol-pin'
const LIDER_DE_GRUPO = 'lider de grupo'

type Alcance = 'equipo' | 'rol' | 'none'

interface PinnedGrant {
  readonly experiencia: string
  readonly nivel: string
  readonly rol: string
  readonly capabilityKey: string
  readonly experience: string
  readonly scopeType: string
  readonly alcance: Alcance
}

const TUPLE =
  /^\('([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '([^']*)', '(equipo|rol|none)'\),?$/

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
      const [, experiencia, nivel, rol, capabilityKey, experience, scopeType, alcance] = match
      return { experiencia, nivel, rol, capabilityKey, experience, scopeType, alcance: alcance as Alcance }
    })
}

function normalize(label: string): string {
  return label.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function alcanceOf(scopeId: string | undefined): Alcance | string {
  if (scopeId === undefined) return 'none'
  if (scopeId === EQUIPO_ID) return 'equipo'
  if (scopeId === ROL_ID) return 'rol'
  return `other:${scopeId}`
}

function asKey(row: Omit<PinnedGrant, 'experiencia' | 'nivel' | 'rol'>): string {
  return [row.capabilityKey, row.experience, row.scopeType, row.alcance].join('|')
}

const table = readPinnedTable()
const SEPARATOR = '\u0000'
const triples = [...new Set(table.map((row) => [row.experiencia, row.nivel, row.rol].join(SEPARATOR)))].map(
  (triple) => {
    const [experiencia, nivel, rol] = triple.split(SEPARATOR)
    return { experiencia, nivel, rol }
  },
)
const experiencias = [...new Set(table.map((row) => row.experiencia))]
const nivelesSinExcepcion = (experiencia: string) =>
  new Set(
    table
      .filter((row) => row.experiencia === experiencia && normalize(row.rol) !== LIDER_DE_GRUPO)
      .map((row) => row.nivel),
  )

describe('grants.ts and its SQL mirror share one pinned table', () => {
  it('reads a non-empty table with no duplicate rows and only known niveles', () => {
    expect(table.length).toBeGreaterThan(0)
    const keys = table.map((row) => `${row.experiencia}|${row.nivel}|${row.rol}|${asKey(row)}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(table.filter((row) => !esNivelRol(row.nivel))).toEqual([])
  })

  it.each(triples)(
    'buildGrantsForServicio matches the table for $rol ($nivel) under $experiencia',
    ({ experiencia, nivel, rol }) => {
      if (!esNivelRol(nivel)) throw new Error(`unknown nivel ${nivel}`)
      const actual = buildGrantsForServicio({ id: EQUIPO_ID, experiencia }, { id: ROL_ID, label: rol, nivel })
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
        .filter((row) => row.experiencia === experiencia && row.nivel === nivel && row.rol === rol)
        .map(asKey)
        .sort()

      expect(actual).toEqual(expected)
    },
  )

  it('uses free labels, so the nivel and not the label decides every non-exception row', () => {
    const labelled = table.filter(
      (row) => normalize(row.rol) !== LIDER_DE_GRUPO && nivelDesdeLabel(row.rol) !== 'voluntario',
    )
    expect(labelled).toEqual([])
  })

  it('pins every nivel under every experiencia with a capability of its own', () => {
    expect(experiencesWithSpecificCapability().length).toBeGreaterThan(0)
    const missing = experiencesWithSpecificCapability().flatMap((experiencia) =>
      NIVELES_ROL.filter(({ nivel }) => !nivelesSinExcepcion(experiencia).has(nivel)).map(
        ({ nivel }) => `${experiencia}/${nivel}`,
      ),
    )
    expect(missing).toEqual([])
  })

  it('pins every nivel under an experiencia without a capability of its own', () => {
    const specific = new Set(experiencesWithSpecificCapability())
    const withoutOwn = experiencias.filter((experiencia) => !specific.has(experiencia))
    expect(withoutOwn.length).toBeGreaterThan(0)
    for (const experiencia of withoutOwn) {
      expect([...nivelesSinExcepcion(experiencia)].sort()).toEqual(NIVELES_ROL.map(({ nivel }) => nivel).sort())
    }
  })

  it('pins the "Líder de grupo" exception under every experiencia', () => {
    const withException = new Set(
      table.filter((row) => normalize(row.rol) === LIDER_DE_GRUPO).map((row) => row.experiencia),
    )
    expect(experiencias.filter((experiencia) => !withException.has(experiencia))).toEqual([])
  })

  // S6.6: the switch only redefines the mirror; no existing grant is recalculated.
  it('the T6 migration writes no rows', () => {
    const statements = fs
      .readFileSync(MIGRATION, 'utf-8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
    expect(statements).toMatch(/CREATE OR REPLACE FUNCTION public\.dream_team_grants_de_servicio/)
    expect(statements).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i)
  })
})
