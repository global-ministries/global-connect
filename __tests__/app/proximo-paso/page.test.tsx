/**
 * @jest-environment node
 *
 * /proximo-paso (odd/tasks/proximo-paso.md T2, S3; T8): reads the open
 * ediciones through proximo_paso_ediciones_abiertas with the visitor's own
 * client (anon or signed in), never the service role, and hands them to the
 * flow with hora and lugar. A signed-in visitor also gets their first name
 * and their own Próximo Paso inscripción (usuarios and taller_inscripciones
 * under RLS).
 */

import ProximoPasoPage from '@/app/proximo-paso/page'
import { RegistroProximoPaso } from '@/components/proximo-paso/registro-proximo-paso'

const rpc = jest.fn()
const getUser = jest.fn()
const leerUsuario = jest.fn()
const leerInscripciones = jest.fn()
const isTalleresEnabled = jest.fn()
const createSupabaseAdminClient = jest.fn()

jest.mock('@/components/proximo-paso/registro-proximo-paso', () => ({ RegistroProximoPaso: () => null }))
jest.mock('@/lib/platform/talleres/flags', () => ({ isTalleresEnabled: () => isTalleresEnabled() }))
jest.mock('@/lib/platform/ninos/fecha', () => ({ hoyEnCaracas: () => '2026-11-11' }))
jest.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => createSupabaseAdminClient() }))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientOrNull: async () => ({
    rpc: (...a: unknown[]) => rpc(...a),
    auth: { getUser: () => getUser() },
    from: (tabla: string) => ({
      select: () => ({
        eq: (_col: string, valor: unknown) => ({ maybeSingle: () => leerUsuario(tabla, valor) }),
        or: (filtro: string) => ({ in: () => leerInscripciones(tabla, filtro) }),
      }),
    }),
  }),
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

const ENERO = {
  id: 'ed-ene',
  nombre: 'Enero 2027',
  fechaInicio: '2027-01-03',
  fechaFin: '2027-01-24',
  cupoRestante: null,
  clases: [],
  hora: '10:00',
  lugar: 'Auditorio principal',
  indicaciones: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  isTalleresEnabled.mockReturnValue(true)
  getUser.mockResolvedValue({ data: { user: null } })
  rpc.mockResolvedValue({
    data: [
      {
        edicion_id: 'ed-ene',
        nombre: 'Enero 2027',
        fecha_inicio: '2027-01-03',
        fecha_fin: '2027-01-24',
        cupo_restante: null,
        clases: [],
        hora: '10:00',
        lugar: 'Auditorio principal',
        indicaciones: null,
      },
    ],
    error: null,
  })
  leerUsuario.mockResolvedValue({ data: { id: 'u-1', nombre: 'Ana María' }, error: null })
  leerInscripciones.mockResolvedValue({ data: [], error: null })
})

it('passes the open ediciones with hora and lugar, the session and ?edicion= to the flow', async () => {
  const arbol = await ProximoPasoPage({ searchParams: Promise.resolve({ edicion: 'ed-ene' }) })
  const flujo = buscar(arbol, RegistroProximoPaso)

  expect(rpc).toHaveBeenCalledWith('proximo_paso_ediciones_abiertas')
  expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  expect(leerUsuario).not.toHaveBeenCalled()
  expect(flujo?.props).toEqual({ ediciones: [ENERO], conSesion: false, edicionInicial: 'ed-ene', persona: null, inscripcion: null })
})

it('gives a signed-in visitor their first name and their own inscripción', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  leerInscripciones.mockResolvedValue({
    data: [
      {
        estado: 'aprobado',
        edicion: { id: 'ed-ene', nombre_snapshot: 'Enero 2027', fecha_inicio: '2027-01-03', fecha_fin: '2027-01-24', estado: 'abierto', taller: { slug: 'proximo-paso' } },
      },
    ],
    error: null,
  })

  const flujo = buscar(await ProximoPasoPage({ searchParams: Promise.resolve({}) }), RegistroProximoPaso)

  expect(leerUsuario).toHaveBeenCalledWith('usuarios', 'auth-1')
  expect(leerInscripciones).toHaveBeenCalledWith('taller_inscripciones', 'persona_principal_id.eq.u-1,companero_id.eq.u-1')
  expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  expect(flujo?.props).toEqual({
    ediciones: [ENERO],
    conSesion: true,
    edicionInicial: null,
    persona: { nombre: 'Ana' },
    inscripcion: { estado: 'inscrito', edicion: ENERO },
  })
})

it('does not read anything while talleres are off', async () => {
  isTalleresEnabled.mockReturnValue(false)
  const arbol = await ProximoPasoPage({ searchParams: Promise.resolve({}) })

  expect(rpc).not.toHaveBeenCalled()
  expect(buscar(arbol, RegistroProximoPaso)).toBeNull()
})

it('shows a retry notice instead of the flow when the read fails', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
  const arbol = await ProximoPasoPage({ searchParams: Promise.resolve({}) })

  expect(buscar(arbol, RegistroProximoPaso)).toBeNull()
})
