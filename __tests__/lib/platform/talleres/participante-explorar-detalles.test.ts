/**
 * @jest-environment node
 *
 * R3a (odd/tasks/talleres-rediseno.md, S1) — each Explorar card shows the
 * hora, the lugar, the number of clases and the cupo of the edición
 * (design/talleres-interior/20 and 21), and who the taller is for. They come
 * from the edición itself (lugar, recurrence_rule.start_time,
 * sesiones_snapshot), the taller (genero_requerido, inscripcion_automatica)
 * and talleres_cupo_edicion.
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

const createSupabaseServerClientMock = jest.requireMock('@/lib/supabase/server')
  .createSupabaseServerClient as jest.Mock
const resolveSessionMock = jest.requireMock('@/lib/auth/platformSessionReadOnly')
  .resolveReadOnlyPlatformSession as jest.Mock

const EDICIONES = [
  {
    id: 'ed-1',
    nombre_snapshot: 'Noviembre 2026',
    tipo: 'individual',
    link_type: null,
    estado: 'abierto',
    taller_id: 'taller-1',
    cierre_inscripcion: null,
    fecha_inicio: '2026-11-27',
    lugar: '  Salón 1 ',
    recurrence_rule: { freq: 'weekly', start_time: '19:30:00' },
    sesiones_snapshot: 6,
    taller: {
      slug: 'de-hombre-a-hombre',
      nombre: 'De Hombre a Hombre',
      modalidad_default: 'permanente_custom',
      descripcion: 'Seis viernes.',
      genero_requerido: 'Masculino',
      inscripcion_automatica: true,
    },
  },
  {
    id: 'ed-2',
    nombre_snapshot: 'Diciembre 2026',
    tipo: 'individual',
    link_type: null,
    estado: 'abierto',
    taller_id: 'taller-2',
    cierre_inscripcion: null,
    fecha_inicio: '2026-12-05',
    lugar: '',
    recurrence_rule: { start_time: 'luego' },
    sesiones_snapshot: 0,
    taller: { slug: 'punto-de-partida', nombre: 'Punto de Partida', modalidad_default: 'permanente_custom', descripcion: null },
  },
]

function setup(cupos: Record<string, unknown>): void {
  resolveSessionMock.mockReset().mockResolvedValue({ personaId: 'p-1', capabilities: [] })
  const builder = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- thenable
    const b: Record<string, any> = {}
    for (const m of ['select', 'eq', 'in', 'order', 'or']) b[m] = jest.fn(() => b)
    b['then'] = (resolve: (r: { data: unknown; error: null }) => void) =>
      Promise.resolve({ data: table === 'taller_ediciones' ? EDICIONES : [], error: null }).then(resolve)
    return b
  }
  const rpc = jest.fn((nombre: string, args: { p_edicion_id?: string }) => {
    if (nombre === 'talleres_cupo_edicion') return Promise.resolve({ data: cupos[args.p_edicion_id ?? ''] ?? [], error: null })
    return Promise.resolve({ data: [], error: null })
  })
  createSupabaseServerClientMock.mockReset().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null }) },
    from: jest.fn(builder),
    rpc,
  })
}

async function cargar() {
  const ctx = await loadParticipanteContext()
  if (!ctx.ok) throw new Error('expected ok:true')
  return loadParticipanteExplorar(ctx.context)
}

describe('loadParticipanteExplorar — hora, lugar, clases y cupo (R3a)', () => {
  it('reads lugar, recurrence_rule and sesiones_snapshot, and the taller audience and approval mode', async () => {
    setup({})
    await cargar()
    const cliente = await (createSupabaseServerClientMock.mock.results[0]?.value as Promise<{ from: jest.Mock }>)
    const i = cliente.from.mock.calls.findIndex(([t]) => t === 'taller_ediciones')
    const select = cliente.from.mock.results[i]?.value.select.mock.calls[0][0] as string
    expect(select).toMatch(/lugar/)
    expect(select).toMatch(/recurrence_rule/)
    expect(select).toMatch(/sesiones_snapshot/)
    expect(select).toMatch(/genero_requerido/)
    expect(select).toMatch(/inscripcion_automatica/)
  })

  it('gives the hora as HH:MM, the trimmed lugar, the clases and who it is for', async () => {
    setup({})
    const [primera, segunda] = await cargar()
    expect(primera).toMatchObject({
      hora: '19:30',
      lugar: 'Salón 1',
      clases: 6,
      genero_requerido: 'Masculino',
      inscripcion_automatica: true,
    })
    expect(segunda).toMatchObject({
      hora: null,
      lugar: null,
      clases: null,
      genero_requerido: null,
      inscripcion_automatica: false,
    })
  })

  it('gives the cupo when the edición has one, and null without a cupo', async () => {
    setup({ 'ed-1': [{ cupo: 24, ocupados: 12, disponibles: 12, sobre_cupo: 0, unidad: 'personas' }] })
    const [primera, segunda] = await cargar()
    expect(primera?.cupo).toEqual({ total: 24, ocupados: 12, disponibles: 12, unidad: 'personas' })
    expect(primera?.cupo_completo).toBe(false)
    expect(segunda?.cupo).toBeNull()
  })

  it('a full cupo is still cupo_completo', async () => {
    setup({ 'ed-1': [{ cupo: 15, ocupados: 15, disponibles: 0, sobre_cupo: 0, unidad: 'parejas' }] })
    const [primera] = await cargar()
    expect(primera?.cupo).toEqual({ total: 15, ocupados: 15, disponibles: 0, unidad: 'parejas' })
    expect(primera?.cupo_completo).toBe(true)
  })
})
