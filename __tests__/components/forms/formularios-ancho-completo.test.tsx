/**
 * @jest-environment jsdom
 *
 * ui-ux-sistema U3e — the shared forms use the whole page width: their sections
 * are cards laid out by `SeccionesSistema`, their fields sit in `CamposSistema`
 * grids, and the action footer stays after the grid.
 */

import { render, screen } from '@testing-library/react'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a>,
}))
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: jest.fn(), error: jest.fn() }),
}))
jest.mock('@/lib/actions/season.actions', () => ({ createSeason: jest.fn(), updateSeason: jest.fn() }))
jest.mock('@/lib/actions/group.actions', () => ({ createGroup: jest.fn(), updateGroup: jest.fn() }))
jest.mock('@/lib/actions/user.actions', () => ({ createUser: jest.fn(), updateUser: jest.fn() }))
jest.mock('@/components/modals/SelectLeaderModal', () => ({ __esModule: true, default: () => null }))

import SeasonForm from '@/components/forms/SeasonForm'
import GroupCreateForm from '@/components/forms/GroupCreateForm'
import GroupEditForm from '@/components/forms/GroupEditForm'
import UserCreateForm from '@/components/forms/UserCreateForm'
import { UserEditForm } from '@/components/forms/UserEditForm'

beforeAll(() => {
  // The Radix switch measures itself; jsdom has no ResizeObserver.
  global.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(() => {
  global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })) as unknown as typeof fetch
})

function secciones(container: HTMLElement) {
  const grid = container.querySelector('[data-slot="secciones"]')
  if (!(grid instanceof HTMLElement)) throw new Error('Missing sections grid')
  return grid
}

/** Every named section is a direct child (a card) of the sections grid. */
function esperarSecciones(container: HTMLElement, titulos: string[]) {
  const grid = secciones(container)
  for (const titulo of titulos) {
    expect(screen.getByRole('region', { name: titulo }).parentElement).toBe(grid)
  }
}

/** Every labelled field sits in a fields grid inside the sections grid. */
function esperarCampos(container: HTMLElement, etiquetas: string[]) {
  const grid = secciones(container)
  for (const etiqueta of etiquetas) {
    const campos = screen.getByLabelText(etiqueta).closest('[data-slot="campos"]')
    expect(campos).not.toBeNull()
    expect(grid.contains(campos)).toBe(true)
  }
}

/** The action footer comes after the grid, outside it. */
function esperarPieFuera(container: HTMLElement) {
  const pie = container.querySelector('[data-slot="pie-acciones"]')
  expect(pie).not.toBeNull()
  expect(secciones(container).contains(pie)).toBe(false)
}

describe('full-width forms', () => {
  it('SeasonForm lays its card and fields out on the system grids', () => {
    const { container } = render(<SeasonForm />)

    expect(secciones(container).children).toHaveLength(1)
    esperarCampos(container, ['Nombre de la Temporada *', 'Fecha de Inicio *', 'Fecha de Fin *'])
    esperarPieFuera(container)
  })

  it('GroupCreateForm lays its card and fields out on the system grids', () => {
    const { container } = render(<GroupCreateForm temporadas={[]} segmentos={[]} />)

    expect(secciones(container).children).toHaveLength(1)
    esperarCampos(container, ['Nombre del Grupo'])
    expect(screen.getByRole('group', { name: 'Líder Inicial (opcional)' }).closest('[data-slot="campos"]')).not.toBeNull()
    esperarPieFuera(container)
  })

  it('GroupEditForm makes each section a card on the sections grid', () => {
    const { container } = render(
      <GroupEditForm
        grupo={{
          id: 'g1',
          nombre: 'Grupo Norte',
          temporada_id: '',
          segmento_id: '',
          dia_reunion: null,
          hora_reunion: null,
          activo: true,
          notas_privadas: null,
          casa_anfitriona_id: null,
          direccion: null,
        }}
        temporadas={[]}
        segmentos={[]}
        parroquias={[]}
      />,
    )

    esperarSecciones(container, ['Información Básica', 'Casa Anfitriona', 'Dirección manual de referencia', 'Notas Privadas'])
    esperarCampos(container, ['Nombre del Grupo', 'Calle', 'Barrio', 'Código Postal', 'Referencia', 'Notas (solo para líderes)'])
    esperarPieFuera(container)
  })

  it('UserCreateForm makes each section a card on the sections grid', () => {
    const { container } = render(<UserCreateForm />)

    esperarSecciones(container, ['Información Personal', 'Contacto', 'Información Adicional'])
    esperarCampos(container, ['Nombre *', 'Apellido *', 'Cédula', 'Fecha de Nacimiento', 'Email', 'Teléfono'])
    esperarPieFuera(container)
  })

  it('UserEditForm makes each section a card and spans the location section', () => {
    const { container } = render(
      <UserEditForm ocupaciones={[]} profesiones={[]} paises={[]} estados={[]} municipios={[]} parroquias={[]} />,
    )

    esperarSecciones(container, ['Foto de Perfil', 'Información Básica', 'Información de Contacto', 'Información Profesional', 'Información de Ubicación'])
    esperarCampos(container, ['Nombre *', 'Apellido *', 'Cédula', 'Fecha de Nacimiento', 'Email', 'Teléfono', 'Calle *', 'Barrio', 'Código Postal', 'Referencia', 'Latitud', 'Longitud'])
    expect(screen.getByRole('region', { name: 'Información de Ubicación' }).className).toContain('col-span-full')
    esperarPieFuera(container)
  })
})
