/**
 * @jest-environment node
 *
 * /proximo-paso (odd/tasks/proximo-paso.md T2, S3): reads the open ediciones
 * through proximo_paso_ediciones_abiertas with the visitor's own client (anon
 * or signed in), never the service role, and hands them to the form.
 */

import ProximoPasoPage from '@/app/proximo-paso/page'
import { RegistroProximoPaso } from '@/components/proximo-paso/registro-proximo-paso'

const rpc = jest.fn()
const getUser = jest.fn()
const isTalleresEnabled = jest.fn()
const createSupabaseAdminClient = jest.fn()

jest.mock('@/components/proximo-paso/registro-proximo-paso', () => ({ RegistroProximoPaso: () => null }))
jest.mock('@/lib/platform/talleres/flags', () => ({ isTalleresEnabled: () => isTalleresEnabled() }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientOrNull: async () => ({ rpc: (...a: unknown[]) => rpc(...a), auth: { getUser: () => getUser() } }),
}))

function buscar(node: unknown, tipo: unknown): { props: Record<string, unknown> } | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const hijo of node) {
      const r = buscar(hijo, tipo)
      if (r) return r
    }
    return null
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> }
  if (el.type === tipo) return el as { props: Record<string, unknown> }
  if (typeof el.type === 'function' && el.type !== tipo) {
    return buscar((el.type as (p: unknown) => unknown)(el.props), tipo)
  }
  return buscar(el.props?.children, tipo)
}

beforeEach(() => {
  jest.clearAllMocks()
  isTalleresEnabled.mockReturnValue(true)
  getUser.mockResolvedValue({ data: { user: null } })
  rpc.mockResolvedValue({
    data: [{ edicion_id: 'ed-dic', nombre: 'Diciembre 2026', fecha_inicio: '2026-12-06', fecha_fin: '2026-12-27', cupo_restante: null, clases: [] }],
    error: null,
  })
})

it('passes the open ediciones, the session and ?edicion= to the form', async () => {
  const arbol = await ProximoPasoPage({ searchParams: Promise.resolve({ edicion: 'ed-dic' }) })
  const form = buscar(arbol, RegistroProximoPaso)

  expect(rpc).toHaveBeenCalledWith('proximo_paso_ediciones_abiertas')
  expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  expect(form?.props).toEqual({
    ediciones: [
      { id: 'ed-dic', nombre: 'Diciembre 2026', fechaInicio: '2026-12-06', fechaFin: '2026-12-27', cupoRestante: null, clases: [] },
    ],
    conSesion: false,
    edicionInicial: 'ed-dic',
  })
})

it('does not read anything while talleres are off', async () => {
  isTalleresEnabled.mockReturnValue(false)
  const arbol = await ProximoPasoPage({ searchParams: Promise.resolve({}) })

  expect(rpc).not.toHaveBeenCalled()
  expect(buscar(arbol, RegistroProximoPaso)).toBeNull()
})

it('shows a retry notice instead of the form when the read fails', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
  const arbol = await ProximoPasoPage({ searchParams: Promise.resolve({}) })

  expect(buscar(arbol, RegistroProximoPaso)).toBeNull()
})
