/**
 * First adopters of the layout primitives (docs/design-system.md): the
 * Temporadas list uses the wide page width, the create-season and CSV import
 * forms use the form width, and the import form puts its submit action in the
 * shared action footer.
 */
import type { ReactElement } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

jest.mock('@/components/ui/desktop-header', () => ({
  DesktopHeader: ({ titulo, accionPrincipal }: { titulo?: string; accionPrincipal?: React.ReactNode }) => (
    <header>
      <h1>{titulo}</h1>
      {accionPrincipal}
    </header>
  ),
}))
jest.mock('@/components/forms/SeasonForm', () => ({ __esModule: true, default: () => <form aria-label="Temporada" /> }))
jest.mock('@/components/temporadas/TemporadasList.client', () => ({ __esModule: true, default: () => <ul aria-label="Temporadas" /> }))

const getUserWithRoles = jest.fn()
jest.mock('@/lib/getUserWithRoles', () => ({ getUserWithRoles: (...args: unknown[]) => getUserWithRoles(...args) }))
jest.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }),
  }),
}))
jest.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`)
  },
}))

import ImportarGruposPage from '@/app/(auth)/grupos-vida/importar/page'
import CreateSeasonPage from '@/app/(auth)/grupos-vida/temporadas/crear/page'
import TemporadasPage from '@/app/(auth)/grupos-vida/temporadas/page'

function columnaDe(elemento: HTMLElement) {
  return elemento.closest('[data-ancho]')
}

describe('Temporadas list', () => {
  it('uses the wide page width and renders its description', async () => {
    getUserWithRoles.mockResolvedValue({ user: { id: 'u1' }, roles: ['admin'] })
    render((await TemporadasPage()) as ReactElement)
    const lista = await screen.findByRole('list', { name: 'Temporadas' })
    expect(columnaDe(lista)).toHaveAttribute('data-ancho', 'default')
    expect(screen.getByText('Administra los períodos temporales de tu organización')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Crear Temporada/ })).toHaveAttribute('href', '/grupos-vida/temporadas/crear')
  })
})

describe('Crear temporada', () => {
  it('uses the form width', async () => {
    render(<CreateSeasonPage />)
    const formulario = await screen.findByRole('form', { name: 'Temporada' })
    expect(columnaDe(formulario)).toHaveAttribute('data-ancho', 'form')
    expect(screen.getByText('Ingresa los datos para crear una nueva temporada')).toBeInTheDocument()
  })
})

describe('Importar grupos', () => {
  it('uses the form width and puts the submit action in the action footer', async () => {
    render(<ImportarGruposPage />)
    const subir = await screen.findByRole('button', { name: 'Subir CSV' })
    expect(columnaDe(subir)).toHaveAttribute('data-ancho', 'form')
    expect(subir.closest('[data-slot="pie-acciones"]')).not.toBeNull()
    expect(subir).toBeDisabled()

    const archivo = new File(['nombre_grupo'], 'grupos.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText('Archivo CSV'), { target: { files: [archivo] } })
    expect(subir).toBeEnabled()
  })
})
