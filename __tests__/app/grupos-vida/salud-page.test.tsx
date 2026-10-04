/**
 * /grupos-vida/[id]/salud (RSC): member health is for director de etapa and
 * above. A leader, even one who may edit the group, gets "Sin permisos" and
 * nothing is fetched; a director who may edit the group gets the view.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

const createSupabaseServerClient = jest.fn()
const getUserWithRoles = jest.fn()
const obtenerSaludMiembrosGrupo = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (client: unknown) => getUserWithRoles(client) }))
jest.mock('@/lib/actions/asistencia-avanzada.actions', () => ({
  obtenerSaludMiembrosGrupo: (id: string) => obtenerSaludMiembrosGrupo(id),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
const propsVista = jest.fn()
jest.mock('@/components/grupos/VistaSaludMiembros.client', () => ({
  __esModule: true,
  default: (props: unknown) => {
    propsVista(props)
    return <div data-testid="vista-salud" />
  },
}))
// ContenedorDashboard lazy-loads its header behind Suspense — synchronous test double.
jest.mock('@/components/ui/sistema-diseno', () => ({
  ...jest.requireActual('@/components/ui/sistema-diseno'),
  ContenedorDashboard: ({ children, titulo }: { children: React.ReactNode; titulo?: string }) => (
    <section>
      <h1>{titulo}</h1>
      {children}
    </section>
  ),
}))

import SaludMiembrosPage from '@/app/(auth)/grupos-vida/[id]/salud/page'

const authId = '11111111-1111-1111-1111-111111111111'
const grupoId = '33333333-3333-3333-3333-333333333333'

function sesion() {
  return {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: authId } } })) },
    rpc: jest.fn(async (name: string) => {
      if (name === 'puede_editar_grupo') return { data: true, error: null }
      if (name === 'obtener_detalle_grupo') return { data: { nombre: 'Grupo Norte' }, error: null }
      return { data: null, error: null }
    }),
  }
}

async function renderizar(roles: string[]) {
  const cliente = sesion()
  createSupabaseServerClient.mockResolvedValue(cliente)
  getUserWithRoles.mockResolvedValue({ user: { id: authId }, roles })
  render(await SaludMiembrosPage({ params: Promise.resolve({ id: grupoId }) }))
  return cliente
}

beforeEach(() => {
  jest.clearAllMocks()
  obtenerSaludMiembrosGrupo.mockResolvedValue({ success: true, data: [] })
})

it('shows "Sin permisos" to a leader and fetches nothing', async () => {
  const cliente = await renderizar(['lider'])

  expect(screen.getByText('Sin permisos')).toBeInTheDocument()
  expect(screen.queryByTestId('vista-salud')).toBeNull()
  expect(obtenerSaludMiembrosGrupo).not.toHaveBeenCalled()
  expect(cliente.rpc).not.toHaveBeenCalled()
})

it('shows the health view to a director de etapa who may edit the group', async () => {
  await renderizar(['director-etapa'])

  expect(screen.getByTestId('vista-salud')).toBeInTheDocument()
  expect(obtenerSaludMiembrosGrupo).toHaveBeenCalledWith(grupoId)
  expect(propsVista).toHaveBeenCalledWith(expect.objectContaining({ grupoId, miembros: [] }))
})
