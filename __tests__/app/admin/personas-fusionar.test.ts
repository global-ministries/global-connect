/**
 * @jest-environment node
 *
 * /admin/personas/fusionar (T5, S6c): only admin and pastor reach it
 * (es_admin_o_pastor, the same rule the RPCs enforce); anyone else gets a
 * 404 and a signed-out visitor goes to /login.
 */
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: jest.fn() }))
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
}))
jest.mock('@/components/personas/fusionar-personas', () => ({ FusionarPersonas: () => null }))

import FusionarPersonasPage from '@/app/(auth)/admin/personas/fusionar/page'
import { FusionarPersonas } from '@/components/personas/fusionar-personas'

const crearCliente = jest.requireMock('@/lib/supabase/server').createSupabaseServerClient as jest.Mock

let rpc: jest.Mock

function setup({ user = { id: 'auth-1' } as { id: string } | null, esAdmin = true as unknown, error = null as unknown } = {}) {
  rpc = jest.fn().mockResolvedValue({ data: esAdmin, error })
  crearCliente.mockReset().mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
    rpc,
  })
}

/** Whether the rendered tree contains an element of the given type. */
function contiene(nodo: unknown, tipo: unknown): boolean {
  if (!nodo || typeof nodo !== 'object') return false
  const el = nodo as { type?: unknown; props?: { children?: unknown } }
  if (el.type === tipo) return true
  const hijos = el.props?.children
  return Array.isArray(hijos) ? hijos.some((h) => contiene(h, tipo)) : contiene(hijos, tipo)
}

describe('/admin/personas/fusionar', () => {
  it('redirects a signed-out visitor to /login', async () => {
    setup({ user: null })
    await expect(FusionarPersonasPage()).rejects.toThrow('NEXT_REDIRECT /login')
  })

  it('is a 404 for someone who is not admin or pastor', async () => {
    setup({ esAdmin: false })
    await expect(FusionarPersonasPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(rpc).toHaveBeenCalledWith('es_admin_o_pastor', { p_auth_id: 'auth-1' })
  })

  it('is a 404 when the check fails', async () => {
    setup({ esAdmin: null, error: { message: 'boom' } })
    await expect(FusionarPersonasPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('renders the flow for admin or pastor', async () => {
    setup()
    const pagina = await FusionarPersonasPage()
    expect(contiene(pagina, FusionarPersonas)).toBe(true)
  })
})
