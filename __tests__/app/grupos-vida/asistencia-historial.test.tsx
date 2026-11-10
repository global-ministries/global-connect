/**
 * /grupos-vida/[id]/asistencia/historial (RSC), S6 of odd/tasks/home-por-rol.md:
 * whoever may see the group (puede_ver_grupo, e.g. a Colíder) reads the
 * attendance history; the controls that write stay behind puede_editar_grupo.
 * Whoever may not see the group gets "Sin permisos" and no report is loaded.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

const createSupabaseServerClient = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => createSupabaseServerClient() }))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/components/asistencia/GraficoTendencia.client', () => ({ __esModule: true, default: () => null }))
// The real history component, wrapped so its props can be checked too.
const propsHistorial = jest.fn()
jest.mock('@/components/asistencia/HistorialAsistencia.client', () => {
  const Real = jest.requireActual('@/components/asistencia/HistorialAsistencia.client').default
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => {
      propsHistorial(props)
      return (
        <div data-testid="historial-asistencia">
          <Real {...props} />
        </div>
      )
    },
  }
})
// The page header renders behind Suspense — synchronous test double.
jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo, accionPrincipal }: { titulo?: string; accionPrincipal?: React.ReactNode }) => (
    <header>
      <h1>{titulo}</h1>
      {accionPrincipal}
    </header>
  ),
}))

import HistorialAsistenciaPage from '@/app/(auth)/grupos-vida/[id]/asistencia/historial/page'

const authId = '11111111-1111-1111-1111-111111111111'
const usuarioId = '22222222-2222-2222-2222-222222222222'
const grupoId = '33333333-3333-3333-3333-333333333333'
const reporte = {
  kpis: {
    asistencia_promedio: 80,
    total_reuniones: 2,
    miembro_mas_constante: { id: null, nombre: 'Ana', asistencias: 2 },
    miembro_mas_ausencias: { id: null, nombre: 'Luis', ausencias: 1 },
  },
  series_temporales: [],
  eventos_historial: [
    { id: '44444444-4444-4444-4444-444444444444', fecha: '2026-11-01', tema: 'Reunión', presentes: 4, total: 5, porcentaje: 80 },
  ],
}
const hrefEditarEvento = `/grupos-vida/33333333-3333-3333-3333-333333333333/asistencia/editar/${reporte.eventos_historial[0].id}`

function sesion({ puedeVer, puedeEditar }: { puedeVer: boolean; puedeEditar: boolean }) {
  const usuarios = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(async () => ({ data: { id: usuarioId }, error: null })),
  }
  return {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: authId } } })) },
    from: jest.fn((tabla: string) => {
      if (tabla === 'usuarios') return usuarios
      throw new Error(`Unexpected table ${tabla}`)
    }),
    usuarios,
    rpc: jest.fn(async (name: string) => {
      if (name === 'puede_ver_grupo') return { data: puedeVer, error: null }
      if (name === 'puede_editar_grupo') return { data: puedeEditar, error: null }
      if (name === 'obtener_detalle_grupo') return { data: puedeVer ? { nombre: 'Grupo Norte' } : null, error: null }
      if (name === 'obtener_reporte_asistencia_grupo') return { data: reporte, error: null }
      return { data: null, error: null }
    }),
  }
}

async function renderizar(permisos: { puedeVer: boolean; puedeEditar: boolean }) {
  const cliente = sesion(permisos)
  createSupabaseServerClient.mockResolvedValue(cliente)
  render(await HistorialAsistenciaPage({ params: Promise.resolve({ id: grupoId }), searchParams: Promise.resolve({}) }))
  return cliente
}

beforeEach(() => {
  jest.clearAllMocks()
})

it('shows the history to someone who may see the group but not edit it, without the register action', async () => {
  const cliente = await renderizar({ puedeVer: true, puedeEditar: false })

  expect(screen.getByTestId('historial-asistencia')).toBeInTheDocument()
  expect(screen.queryByText('Sin permisos')).toBeNull()
  expect(screen.queryByText('Registrar nuevo')).toBeNull()
  expect(screen.queryByRole('link', { name: /registrar/i })).toBeNull()
  expect(document.querySelector(`a[href="/grupos-vida/${grupoId}/asistencia"]`)).toBeNull()
  expect(document.querySelector(`a[href="${hrefEditarEvento}"]`)).toBeNull()
  expect(document.querySelectorAll(`a[href="${hrefEditarEvento.replace('/editar', '')}"]`).length).toBeGreaterThan(0)
  expect(cliente.usuarios.eq).toHaveBeenCalledWith('auth_id', authId)
  expect(cliente.rpc).toHaveBeenCalledWith('puede_ver_grupo', { p_user_id: usuarioId, p_grupo_id: grupoId })
  expect(propsHistorial).toHaveBeenCalledWith(expect.objectContaining({ grupoId, reporte }))
})

it('shows "Sin permisos" to someone who may not see the group and loads no report', async () => {
  const cliente = await renderizar({ puedeVer: false, puedeEditar: false })

  expect(screen.getByText('Sin permisos')).toBeInTheDocument()
  expect(screen.queryByTestId('historial-asistencia')).toBeNull()
  expect(cliente.rpc).not.toHaveBeenCalledWith('obtener_reporte_asistencia_grupo', expect.anything())
})

it('keeps the register action for someone who may edit the group', async () => {
  await renderizar({ puedeVer: true, puedeEditar: true })

  expect(screen.getByTestId('historial-asistencia')).toBeInTheDocument()
  expect(screen.getByText('Registrar nuevo').closest('a')).toHaveAttribute('href', `/grupos-vida/${grupoId}/asistencia`)
  expect(document.querySelectorAll(`a[href="${hrefEditarEvento}"]`).length).toBeGreaterThan(0)
})
