import type { ReactElement } from 'react'

import CreateGroupPage from '@/app/(auth)/grupos-vida/crear/page'

const createSupabaseServerClient = jest.fn()
const createSupabaseAdminClient = jest.fn()
const getUserWithRoles = jest.fn()

jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (...args: unknown[]) => getUserWithRoles(...args) }))
jest.mock('@/components/forms/GroupCreateForm', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/ui/sistema-diseno', () => ({
  ContenedorDashboard: ({ children }: { children: unknown }) => children,
  TarjetaSistema: ({ children }: { children: unknown }) => children,
}))

const authId = '11111111-1111-1111-1111-111111111111'
const usuarioId = '22222222-2222-2222-2222-222222222222'

const ALL_SEGMENTS = ['s1', 's2', 's3', 's4', 's5'].map((id) => ({ id, nombre: `Segmento ${id}` }))

describe('CreateGroupPage segments by role', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('lists only the assigned segments to a director general (2 of 5)', async () => {
    setup({ roles: ['director-general'], assigned: ['s2', 's4'] })

    expect(segmentIds(await renderedForm())).toEqual(['s2', 's4'])
  })

  it('lists nothing to a director general without assignments', async () => {
    setup({ roles: ['director-general'], assigned: [] })

    expect(segmentIds(await renderedForm())).toEqual([])
  })

  it('keeps every segment for an admin, even one who is also director general', async () => {
    setup({ roles: ['admin', 'director-general'], assigned: ['s2'] })

    expect(segmentIds(await renderedForm())).toEqual(ALL_SEGMENTS.map((s) => s.id))
  })

  it('keeps every segment for a pastor who is also director general', async () => {
    setup({ roles: ['pastor', 'director-general'], assigned: ['s2'] })

    expect(segmentIds(await renderedForm())).toEqual(ALL_SEGMENTS.map((s) => s.id))
  })

  it('keeps the director de etapa segments as they are today', async () => {
    const { server } = setup({ roles: ['director-etapa'], assigned: [], directorSegments: [{ id: 's3', nombre: 'Segmento s3' }] })

    expect(segmentIds(await renderedForm())).toEqual(['s3'])
    expect(server.rpc).toHaveBeenCalledWith('obtener_segmentos_para_director', { p_auth_id: authId })
  })

  it('hands a director de etapa their own segmento_lideres entries, named after them', async () => {
    const { admin } = setup({ roles: ['director-etapa'], assigned: [], directorSegments: [{ id: 's3', nombre: 'Segmento s3' }], propias: [{ id: 'sl-1', segmento_id: 's3' }] })

    const form = await renderedForm()

    expect(form.props.directoresPropios).toEqual([{ id: 'sl-1', segmento_id: 's3', nombre: 'Ana Pérez' }])
    expect(admin.from).toHaveBeenCalledWith('segmento_lideres')
  })

  it('does not look up own entries for a director general who is also director de etapa', async () => {
    const { admin } = setup({ roles: ['director-general', 'director-etapa'], assigned: ['s2'], propias: [{ id: 'sl-1', segmento_id: 's2' }] })

    const form = await renderedForm()

    expect(form.props.directoresPropios).toEqual([])
    expect(admin.from).not.toHaveBeenCalledWith('segmento_lideres')
  })
})

async function renderedForm() {
  const page = (await CreateGroupPage()) as ReactElement<{ children: ReactElement<{ children: ReactElement }> }>
  return page.props.children.props.children as ReactElement<{
    segmentos: { id: string; nombre: string }[]
    directoresPropios: { id: string; segmento_id: string; nombre: string }[]
  }>
}

function segmentIds(form: ReactElement<{ segmentos: { id: string }[] }>) {
  return form.props.segmentos.map((s) => s.id)
}

function setup({ roles, assigned, directorSegments = [], propias = [] }: { roles: string[]; assigned: string[]; directorSegments?: { id: string; nombre: string }[]; propias?: { id: string; segmento_id: string }[] }) {
  const chain = (result: unknown, single?: unknown) => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'order', 'limit']) c[m] = () => c
    c.maybeSingle = () => Promise.resolve({ data: single ?? null, error: null })
    c.then = (resolve: (v: unknown) => unknown) => resolve({ data: result, error: null })
    return c
  }
  const server = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: authId } } }) },
    rpc: jest.fn().mockResolvedValue({ data: directorSegments, error: null }),
    from: jest.fn((table: string) => {
      if (table === 'temporadas') return chain([{ id: 't1', nombre: 'Temporada 1' }])
      if (table === 'segmentos') return chain(ALL_SEGMENTS)
      throw new Error(`Unexpected table ${table}`)
    }),
  }
  const admin = {
    from: jest.fn((table: string) => {
      if (table === 'usuarios') return chain(null, { id: usuarioId, nombre: 'Ana', apellido: 'Pérez' })
      if (table === 'director_general_segmentos') return chain(assigned.map((segmento_id) => ({ segmento_id })))
      if (table === 'segmentos') return chain(ALL_SEGMENTS.filter((s) => assigned.includes(s.id)))
      if (table === 'segmento_lideres') return chain(propias)
      throw new Error(`Unexpected admin table ${table}`)
    }),
  }
  createSupabaseServerClient.mockResolvedValue(server)
  createSupabaseAdminClient.mockReturnValue(admin)
  getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles, platformSession: null })
  return { server, admin }
}
