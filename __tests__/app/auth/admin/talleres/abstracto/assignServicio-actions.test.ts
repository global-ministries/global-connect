/**
 * @jest-environment node
 *
 * Cimiento 4 — Tests for the assignServicio server action.
 *
 * Assigns a persona as coordinador/director of an abstract taller by
 * activating a dream_team servicio on that taller's single equipo. The
 * capability auto-grant trigger (estado='activo') then materializes the
 * scoped grants — the action never writes grants directly.
 *
 * Auth mirrors openEdicion: talleres flag → readonly platform session →
 * capability gate (director.write OR admin.manage).
 *
 * Covers:
 *   - not-found when the talleres flag is off
 *   - unauthorized when no user is signed in
 *   - forbidden when caps are insufficient
 *   - invalid-input when ids are empty or rol is out of the set
 *   - no-equipo when the taller has no cohorte-linked equipo yet
 *   - no-role when the requested rol label is not seeded on the equipo
 *   - success: creates a servicio with estado='activo' (rol resolved
 *     server-side from the label, never a client rol_id)
 *   - idempotent: returns the existing active servicio, no new insert
 */

import {
  assignServicio,
  type AssignServicioInput,
} from '@/app/(auth)/admin/talleres/abstracto/[slug]/actions'

jest.mock('@/lib/platform/talleres/flags', () => ({
  isTalleresEnabled: jest.fn(() => true),
}))

jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: jest.fn(),
}))

jest.mock('@/lib/auth/platformSessionReadOnly', () => ({
  findPlatformSessionPersonaByAuthId: jest.fn(),
  resolveReadOnlyPlatformSession: jest.fn(),
}))

jest.mock('@/lib/platform/dream-team/repository-supabase', () => ({
  createSupabaseDreamTeamRepository: jest.fn(),
}))

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags')
  .isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock
const createRepoMock = jest.requireMock('@/lib/platform/dream-team/repository-supabase')
  .createSupabaseDreamTeamRepository as jest.Mock

interface RoleStub {
  id: string
  equipoId: string
  label: string
  activo: boolean
}

interface ServicioStub {
  id: string
  personaId: string
  equipoId: string
  rolId: string
  estado: string
  fechaInicio: string
  motivoActual: string
  version: number
}

interface SetupOpts {
  isEnabled?: boolean
  user?: { id: string } | null
  hasSession?: boolean
  capabilities?: string[]
  edicionRows?: Array<{ id: string }>
  cohorteRows?: Array<{ dream_team_equipo_id: string }>
  roles?: RoleStub[]
  existingServicios?: ServicioStub[]
}

let createServicioArg: Record<string, unknown> | null = null
let listServiciosArg: Record<string, unknown> | null = null

function makeThenable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const passthrough = () => chain
  chain.select = passthrough
  chain.eq = passthrough
  chain.in = passthrough
  chain.limit = passthrough
  chain.order = passthrough
  chain.maybeSingle = () => Promise.resolve(result)
  chain.single = () => Promise.resolve(result)
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

function setup(opts: SetupOpts): void {
  createServicioArg = null
  listServiciosArg = null

  flagsMock.mockReset().mockReturnValue(opts.isEnabled ?? true)

  const hasSession = opts.hasSession ?? true
  resolveSessionMock.mockReset().mockResolvedValue(
    hasSession
      ? {
          personaId: 'p-1',
          subjectAuthId: 'auth-1',
          globalRoles: [],
          contexts: [],
          capabilities: (opts.capabilities ?? []).map((key) => ({
            key,
            experience: 'talleres_crecimiento',
            scopeType: 'taller',
            source: 'test',
          })),
        }
      : null,
  )

  const edicionRows = opts.edicionRows ?? [{ id: 'ed-1' }]
  const cohorteRows = opts.cohorteRows ?? [{ dream_team_equipo_id: 'eq-1' }]

  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: opts.user === undefined ? { id: 'auth-1' } : opts.user },
        error: null,
      }),
    },
    from: jest.fn((table: string) => {
      if (table === 'taller_ediciones') {
        return makeThenable({ data: edicionRows, error: null })
      }
      if (table === 'talleres_crecimiento_cohortes') {
        return makeThenable({ data: cohorteRows, error: null })
      }
      return makeThenable({ data: [], error: null })
    }),
  })

  const roles = opts.roles ?? [
    { id: 'rol-coord', equipoId: 'eq-1', label: 'coordinador', activo: true },
    { id: 'rol-dir', equipoId: 'eq-1', label: 'director', activo: true },
  ]
  const existing = opts.existingServicios ?? []

  createRepoMock.mockReset().mockReturnValue({
    listRolesPorEquipo: jest.fn().mockResolvedValue(roles),
    listServicios: jest.fn((filtros: Record<string, unknown>) => {
      listServiciosArg = filtros
      return Promise.resolve(existing)
    }),
    createServicio: jest.fn((input: Record<string, unknown>) => {
      createServicioArg = input
      return Promise.resolve({ id: 'srv-new', version: 1, ...input })
    }),
  })
}

const validInput: AssignServicioInput = {
  taller_id: 't-1',
  persona_id: 'per-1',
  rol: 'coordinador',
}

describe('assignServicio — kill switch & auth', () => {
  it('returns not-found when isTalleresEnabled is false', async () => {
    setup({ isEnabled: false })
    const result = await assignServicio(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not-found')
  })

  it('returns unauthorized when no user is signed in', async () => {
    setup({ user: null })
    const result = await assignServicio(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthorized')
  })
})

describe('assignServicio — capability gate', () => {
  it('returns forbidden when neither director.write nor admin.manage is held', async () => {
    setup({ capabilities: ['talleres_crecimiento.coordinator.write'] })
    const result = await assignServicio(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('forbidden')
  })
})

describe('assignServicio — input validation', () => {
  it('rejects an empty taller_id', async () => {
    setup({ capabilities: ['talleres_crecimiento.director.write'] })
    const result = await assignServicio({ ...validInput, taller_id: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects an empty persona_id', async () => {
    setup({ capabilities: ['talleres_crecimiento.director.write'] })
    const result = await assignServicio({ ...validInput, persona_id: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })

  it('rejects a rol outside the allowed set', async () => {
    setup({ capabilities: ['talleres_crecimiento.director.write'] })
    const result = await assignServicio({
      ...validInput,
      // @ts-expect-error — deliberately out-of-set to prove runtime guard
      rol: 'lider',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('invalid-input')
  })
})

describe('assignServicio — equipo & role resolution', () => {
  it('returns no-equipo when the taller has no ediciones (hence no equipo)', async () => {
    setup({
      capabilities: ['talleres_crecimiento.director.write'],
      edicionRows: [],
    })
    const result = await assignServicio(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('no-equipo')
  })

  it('returns no-equipo when no cohorte links an equipo yet', async () => {
    setup({
      capabilities: ['talleres_crecimiento.director.write'],
      cohorteRows: [],
    })
    const result = await assignServicio(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('no-equipo')
  })

  it('returns no-role when the requested rol label is not seeded', async () => {
    setup({
      capabilities: ['talleres_crecimiento.director.write'],
      roles: [{ id: 'rol-dir', equipoId: 'eq-1', label: 'director', activo: true }],
    })
    const result = await assignServicio({ ...validInput, rol: 'coordinador' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('no-role')
  })
})

describe('assignServicio — happy path', () => {
  it('creates a servicio with estado=activo, resolving rolId from the label', async () => {
    setup({ capabilities: ['talleres_crecimiento.director.write'] })
    const result = await assignServicio(validInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.servicioId).toBe('srv-new')
      expect(result.already).toBeFalsy()
    }
    expect(createServicioArg).not.toBeNull()
    expect(createServicioArg?.['estado']).toBe('activo')
    expect(createServicioArg?.['equipoId']).toBe('eq-1')
    // rol 'coordinador' → the seeded 'coordinador' role id (never a client rol_id)
    expect(createServicioArg?.['rolId']).toBe('rol-coord')
    expect(createServicioArg?.['personaId']).toBe('per-1')
    expect(createServicioArg?.['motivoActual']).toBe('admin_asignacion')
  })

  it('resolves the director label to the director role id', async () => {
    setup({ capabilities: ['talleres_crecimiento.admin.manage'] })
    const result = await assignServicio({ ...validInput, rol: 'director' })
    expect(result.ok).toBe(true)
    expect(createServicioArg?.['rolId']).toBe('rol-dir')
  })
})

describe('assignServicio — idempotency', () => {
  it('returns the existing active servicio without inserting a new one', async () => {
    setup({
      capabilities: ['talleres_crecimiento.director.write'],
      existingServicios: [
        {
          id: 'srv-existing',
          personaId: 'per-1',
          equipoId: 'eq-1',
          rolId: 'rol-coord',
          estado: 'activo',
          fechaInicio: '2026-01-01T00:00:00.000Z',
          motivoActual: 'admin_asignacion',
          version: 1,
        },
      ],
    })
    const result = await assignServicio(validInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.servicioId).toBe('srv-existing')
      expect(result.already).toBe(true)
    }
    // no new insert
    expect(createServicioArg).toBeNull()
    // idempotency check filtered by equipo + persona + estado='activo'
    expect(listServiciosArg?.['equipoId']).toBe('eq-1')
    expect(listServiciosArg?.['personaId']).toBe('per-1')
    expect(listServiciosArg?.['estado']).toBe('activo')
  })
})
