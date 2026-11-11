/**
 * @jest-environment node
 *
 * T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — /talleres/
 * explorar must never show a stale STORED estado on its edición badges:
 * refrescarEstadosEdiciones(client) (unscoped — explorar spans every open
 * taller) runs before loadParticipanteExplorar reads, same convention the
 * catálogo/taller/edición pages already use.
 */

import ExplorarTalleresPage from '@/app/(auth)/talleres/explorar/page'
import { ExplorarTalleresClient } from '@/app/(auth)/talleres/explorar/explorar-client'

jest.mock('@/lib/platform/talleres/participante', () => ({
  requireExplorarViewer: jest.fn(),
  loadParticipanteExplorar: jest.fn(),
  loadParticipanteActiveTalleres: jest.fn(),
}))

jest.mock('@/lib/platform/talleres/refrescar-estados', () => ({
  refrescarEstadosEdiciones: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/app/(auth)/talleres/explorar/explorar-client', () => ({
  ExplorarTalleresClient: () => null,
}))

const requireExplorarViewerMock = jest.requireMock('@/lib/platform/talleres/participante')
  .requireExplorarViewer as jest.Mock
const loadParticipanteExplorarMock = jest.requireMock('@/lib/platform/talleres/participante')
  .loadParticipanteExplorar as jest.Mock
const loadParticipanteActiveTalleresMock = jest.requireMock('@/lib/platform/talleres/participante')
  .loadParticipanteActiveTalleres as jest.Mock
const refrescarEstadosEdicionesMock = jest.requireMock('@/lib/platform/talleres/refrescar-estados')
  .refrescarEstadosEdiciones as jest.Mock

// R3a — the page also reads the viewer's ficha (usuarios) and calls
// hizo_proximo_paso once; both are configurable per test.
let fichaUsuario: { data: unknown; error: unknown } = { data: null, error: null }
let rpcHizo: jest.Mock = jest.fn().mockResolvedValue({ data: false, error: null })

function buildSupabaseMock() {
  return {
    from: jest.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(fichaUsuario),
          limit: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    })),
    rpc: (...args: unknown[]) => rpcHizo(...args),
  }
}

/** Finds the first element of the given type in the tree, WITHOUT executing it. */
function findByType(node: unknown, type: unknown): { props: Record<string, unknown> } | null {
  if (node === null || node === undefined || typeof node === 'boolean') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByType(child, type)
      if (found) return found
    }
    return null
  }
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const el = node as { type: unknown; props?: { children?: unknown } }
    if (el.type === type) return el as { props: Record<string, unknown> }
    return findByType(el.props?.children, type)
  }
  return null
}

beforeEach(() => {
  fichaUsuario = { data: null, error: null }
  rpcHizo = jest.fn().mockResolvedValue({ data: false, error: null })
  const supabase = buildSupabaseMock()
  requireExplorarViewerMock.mockReset().mockResolvedValue({ supabase, personaId: 'p-1', capabilities: [] })
  loadParticipanteExplorarMock.mockReset().mockResolvedValue([])
  loadParticipanteActiveTalleresMock.mockReset().mockResolvedValue([])
  refrescarEstadosEdicionesMock.mockReset().mockResolvedValue(undefined)
})

describe('ExplorarTalleresPage — estado derivado (T5)', () => {
  it('calls refrescarEstadosEdiciones with the viewer supabase client before loadParticipanteExplorar', async () => {
    await ExplorarTalleresPage()
    expect(refrescarEstadosEdicionesMock).toHaveBeenCalledTimes(1)
    expect(loadParticipanteExplorarMock).toHaveBeenCalledTimes(1)
    const refreshOrder = refrescarEstadosEdicionesMock.mock.invocationCallOrder[0]!
    const loadOrder = loadParticipanteExplorarMock.mock.invocationCallOrder[0]!
    expect(refreshOrder).toBeLessThan(loadOrder)
  })

  it('still renders the talleres list through ExplorarTalleresClient', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await ExplorarTalleresPage()) as any
    expect(findByType(element, ExplorarTalleresClient)).not.toBeNull()
  })
})

/** Every string in the element tree (children and props), WITHOUT executing components. */
function textos(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (node === null || node === undefined || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(textos)
  const props = (node as { props?: Record<string, unknown> }).props ?? {}
  return Object.values(props).flatMap(textos)
}

// T9 (odd/tasks/proximo-paso.md, L21–L23) — the page hands each row the real
// estado of the viewer's own inscripción, and has no voseo instructions.
describe('ExplorarTalleresPage — estado real y español neutro (T9)', () => {
  it('adds estado_inscripcion from the viewer\'s active inscripciones to each row', async () => {
    loadParticipanteExplorarMock.mockResolvedValue([
      { id: 'ed-a', ya_inscrito: true },
      { id: 'ed-p', ya_inscrito: true },
      { id: 'ed-n', ya_inscrito: false },
    ])
    loadParticipanteActiveTalleresMock.mockResolvedValue([
      { id: 'ed-a', estado_inscripcion: 'aprobado' },
      { id: 'ed-p', estado_inscripcion: 'pendiente' },
      { id: 'ed-otra', estado_inscripcion: 'aprobado' },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await ExplorarTalleresPage()) as any
    const cliente = findByType(element, ExplorarTalleresClient)
    expect(cliente?.props.talleres).toEqual([
      { id: 'ed-a', ya_inscrito: true, estado_inscripcion: 'aprobado' },
      { id: 'ed-p', ya_inscrito: true, estado_inscripcion: 'pendiente' },
      { id: 'ed-n', ya_inscrito: false, estado_inscripcion: null },
    ])
    expect(loadParticipanteActiveTalleresMock).toHaveBeenCalledWith(
      expect.objectContaining({ personaId: 'p-1' }),
    )
  })

  it('renders no voseo instructions nor «inscripto»', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await ExplorarTalleresPage()) as any
    const texto = textos(element).join(' ')
    expect(texto).not.toMatch(/Tocá|inscripto/)
  })
})

// R3a (odd/tasks/talleres-rediseno.md, S6 S7, L5) — Próximo Paso is listed as
// a taller only to whoever has not done it; hizo_proximo_paso(usuarios.id)
// true hides it and shows the share card instead. The ficha's género reaches
// the client for «Ya inscrito» / «Ya inscrita».
describe('ExplorarTalleresPage — Próximo Paso y ficha (R3a)', () => {
  const FILAS = [
    { id: 'ed-pp', slug: 'proximo-paso', ya_inscrito: false },
    { id: 'ed-par', slug: 'parejas', ya_inscrito: false },
  ]

  async function clienteProps() {
    loadParticipanteExplorarMock.mockResolvedValue(FILAS)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RSC returns a plain element
    const element = (await ExplorarTalleresPage()) as any
    return findByType(element, ExplorarTalleresClient)?.props ?? {}
  }

  it('calls hizo_proximo_paso once with p_usuario_id = the viewer usuarios.id', async () => {
    await clienteProps()
    expect(rpcHizo).toHaveBeenCalledTimes(1)
    expect(rpcHizo).toHaveBeenCalledWith('hizo_proximo_paso', { p_usuario_id: 'p-1' })
  })

  it('true: hides the Próximo Paso taller and asks for the share card', async () => {
    rpcHizo = jest.fn().mockResolvedValue({ data: true, error: null })
    const props = await clienteProps()
    expect((props.talleres as { id: string }[]).map((t) => t.id)).toEqual(['ed-par'])
    expect(props.proximoPasoHecho).toBe(true)
  })

  it('false: lists Próximo Paso as a taller, no share card', async () => {
    rpcHizo = jest.fn().mockResolvedValue({ data: false, error: null })
    const props = await clienteProps()
    expect((props.talleres as { id: string }[]).map((t) => t.id)).toEqual(['ed-pp', 'ed-par'])
    expect(props.proximoPasoHecho).toBe(false)
  })

  it('null: lists Próximo Paso as a taller', async () => {
    rpcHizo = jest.fn().mockResolvedValue({ data: null, error: null })
    const props = await clienteProps()
    expect((props.talleres as { id: string }[]).map((t) => t.id)).toEqual(['ed-pp', 'ed-par'])
    expect(props.proximoPasoHecho).toBe(false)
  })

  it('RPC error: lists Próximo Paso as a taller', async () => {
    rpcHizo = jest.fn().mockResolvedValue({ data: null, error: { code: '42883', message: 'no existe' } })
    const props = await clienteProps()
    expect((props.talleres as { id: string }[]).map((t) => t.id)).toEqual(['ed-pp', 'ed-par'])
    expect(props.proximoPasoHecho).toBe(false)
  })

  it('hands the ficha (with its género) to the client', async () => {
    fichaUsuario = {
      data: { nombre: 'Génesis', apellido: 'Rodríguez', telefono: null, email: 'g@x.org', genero: 'Femenino' },
      error: null,
    }
    const props = await clienteProps()
    expect(props.persona).toEqual({ nombre: 'Génesis Rodríguez', telefono: null, email: 'g@x.org', genero: 'Femenino' })
  })
})
