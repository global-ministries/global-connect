/**
 * @jest-environment node
 *
 * T10 (odd/tasks/talleres-reserva-publica.md, S6) — Explorar brings the
 * first clase of each open edición: `talleres_primeras_clases` (the first
 * programada sesión from today on, a definer because members cannot read
 * other grupos' sesiones), else the edición's own fecha_inicio. The RPC is
 * best effort: an error or a missing function falls back to fecha_inicio.
 */

import { loadParticipanteContext, loadParticipanteExplorar } from '@/lib/platform/talleres/participante'

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

const flagsMock = jest.requireMock('@/lib/platform/talleres/flags').isTalleresEnabled as jest.Mock
const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const findPersonaByAuthIdMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .findPlatformSessionPersonaByAuthId as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock

const PERSONA_ID = '00000000-0000-0000-0000-000000000001'

const EDICIONES = [
  {
    id: 'ed-1',
    nombre_snapshot: 'Noviembre 2026',
    tipo: 'individual',
    link_type: null,
    estado: 'abierto',
    taller_id: 'taller-1',
    cierre_inscripcion: '2026-11-20',
    fecha_inicio: '2026-11-26',
    taller: { slug: 'mujer-de-hoy', nombre: 'Mujer de Hoy', modalidad_default: 'permanente_custom', descripcion: null },
  },
  {
    id: 'ed-2',
    nombre_snapshot: 'Diciembre 2026',
    tipo: 'individual',
    link_type: null,
    estado: 'abierto',
    taller_id: 'taller-2',
    cierre_inscripcion: '2026-12-01',
    fecha_inicio: '2026-12-05',
    taller: { slug: 'de-hombre-a-hombre', nombre: 'De Hombre a Hombre', modalidad_default: 'permanente_custom', descripcion: null },
  },
  {
    id: 'ed-3',
    nombre_snapshot: 'Sin fecha',
    tipo: 'individual',
    link_type: null,
    estado: 'abierto',
    taller_id: 'taller-3',
    cierre_inscripcion: null,
    fecha_inicio: null,
    taller: { slug: 'parejas', nombre: 'Parejas', modalidad_default: 'permanente_custom', descripcion: null },
  },
]

function setup(rpc: jest.Mock | undefined): { from: jest.Mock } {
  flagsMock.mockReset().mockReturnValue(true)
  findPersonaByAuthIdMock.mockReset().mockResolvedValue({ id: PERSONA_ID, authId: 'auth-1', globalRoles: [] })
  resolveSessionMock.mockReset().mockResolvedValue({
    personaId: PERSONA_ID,
    subjectAuthId: 'auth-1',
    globalRoles: [],
    contexts: [],
    capabilities: [
      { key: 'talleres_crecimiento.participation.read', experience: 'talleres_crecimiento', scopeType: 'taller', source: 'test' },
    ],
  })
  const responses: Record<string, unknown> = { taller_ediciones: EDICIONES }
  const builderFor = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thenable
    const b: Record<string, any> = {}
    for (const m of ['select', 'eq', 'in', 'order', 'or']) b[m] = jest.fn(() => b)
    b['then'] = (resolve: (r: { data: unknown; error: null }) => void) =>
      Promise.resolve({ data: responses[table] ?? [], error: null }).then(resolve)
    return b
  }
  const from = jest.fn((table: string) => builderFor(table))
  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null }) },
    from,
    ...(rpc ? { rpc } : {}),
  })
  return { from }
}

async function cargar() {
  const ctx = await loadParticipanteContext()
  if (!ctx.ok) throw new Error('expected ok:true')
  return loadParticipanteExplorar(ctx.context)
}

function rpcCon(primeras: unknown, error: unknown = null): jest.Mock {
  return jest.fn((nombre: string) => {
    if (nombre === 'talleres_primeras_clases') return Promise.resolve({ data: primeras, error })
    return Promise.resolve({ data: [], error: null })
  })
}

describe('loadParticipanteExplorar — primera_clase (T10)', () => {
  it('asks talleres_primeras_clases once with every edición id', async () => {
    const rpc = rpcCon([])
    setup(rpc)
    await cargar()
    const llamadas = rpc.mock.calls.filter(([nombre]) => nombre === 'talleres_primeras_clases')
    expect(llamadas).toEqual([['talleres_primeras_clases', { p_edicion_ids: ['ed-1', 'ed-2', 'ed-3'] }]])
  })

  it('selects fecha_inicio for the fallback', async () => {
    setup(rpcCon([]))
    await cargar()
    const select = (createSupabaseServerClientMock.mock.results[0]?.value as Promise<{ from: jest.Mock }>)
    const cliente = await select
    const builder = cliente.from.mock.results.find((r, i) => cliente.from.mock.calls[i]?.[0] === 'taller_ediciones')
    expect(builder?.value.select.mock.calls[0][0]).toMatch(/fecha_inicio/)
  })

  it('uses the sesión date when the RPC has one, else fecha_inicio, else null', async () => {
    setup(rpcCon([{ edicion_id: 'ed-1', fecha: '2026-11-28' }]))
    const filas = await cargar()
    expect(filas.map((f) => [f.id, f.primera_clase])).toEqual([
      ['ed-1', '2026-11-28'],
      ['ed-2', '2026-12-05'],
      ['ed-3', null],
    ])
  })

  it('falls back to fecha_inicio when the RPC fails', async () => {
    setup(rpcCon(null, { code: '42883', message: 'function does not exist' }))
    const filas = await cargar()
    expect(filas.map((f) => f.primera_clase)).toEqual(['2026-11-26', '2026-12-05', null])
  })

  it('falls back to fecha_inicio when the client cannot call RPCs at all', async () => {
    setup(undefined)
    const filas = await cargar()
    expect(filas.map((f) => f.primera_clase)).toEqual(['2026-11-26', '2026-12-05', null])
  })
})
