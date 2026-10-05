/**
 * `<EstructuraClient>` — island for /admin/dream-team/estructura.
 *
 * Replaces the old nested-list suite (per-row rol chips, per-row edit and
 * "add sub-equipo" icons, everything in one card): the screen is now a
 * navigable org chart on the left and the detail of the selected team on the
 * right. Acceptance criteria 1-4 and 6 of
 * odd/tasks/dream-team-estructura-rediseno.md are expressed with the
 * staging-shaped fixture (tests/helpers/estructura-fixture.ts).
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EstructuraClient, type EstructuraClientProps } from '@/components/dream-team/estructura/estructura-client'
import { contarUso } from '@/lib/platform/dream-team/estructura-vista'
import {
  ID_ATRACCION,
  ID_CONEXION,
  ID_DHAH,
  ID_GCP,
  ID_GDV,
  ID_GDV_GRUPO,
  ID_PAREJAS,
  arbolEstructura,
  rolesPorEquipoEstructura,
  serviciosEstructura,
  talleresEstructura,
} from '@/tests/helpers/estructura-fixture'
import { cambiarActivoEquipo, renombrarEquipo } from '@/app/(auth)/admin/dream-team/estructura/actions'

const replace = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: jest.fn() }),
}))

// The shift cards (turnos-*.tsx) import their own server actions.
jest.mock('@/app/(auth)/admin/dream-team/estructura/turnos-actions', () => ({
  crearTurno: jest.fn(),
  cambiarActivoTurno: jest.fn(),
  guardarTurnosEquipo: jest.fn(),
}))

jest.mock('@/app/(auth)/admin/dream-team/estructura/actions', () => ({
  crearEquipo: jest.fn(),
  renombrarEquipo: jest.fn(),
  cambiarActivoEquipo: jest.fn(),
  crearRol: jest.fn(),
  renombrarRol: jest.fn(),
  cambiarActivoRol: jest.fn(),
}))

const toastSuccess = jest.fn()
const toastError = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: toastSuccess, error: toastError, info: jest.fn() }),
}))

// ContenedorDashboard lazy-loads its header behind Suspense — same synchronous
// test double as __tests__/app/dashboard-page.test.tsx.
jest.mock('@/components/ui/sistema-diseno', () => ({
  ...jest.requireActual('@/components/ui/sistema-diseno'),
  ContenedorDashboard: ({ children, titulo }: { children: React.ReactNode; titulo?: string }) => (
    <section>
      <h1>{titulo}</h1>
      {children}
    </section>
  ),
}))

const CLAVE_PANEL = 'dream-team:estructura:panel'
const ok = { ok: true, equipo: {} }

beforeEach(() => {
  replace.mockClear()
  refresh.mockClear()
  toastSuccess.mockClear()
  toastError.mockClear()
  jest.mocked(renombrarEquipo).mockResolvedValue(ok as never)
  jest.mocked(cambiarActivoEquipo).mockResolvedValue(ok as never)
  window.localStorage.clear()
})

function props(overrides: Partial<EstructuraClientProps> = {}): EstructuraClientProps {
  return {
    arbol: arbolEstructura,
    rolesPorEquipo: rolesPorEquipoEstructura,
    uso: contarUso(serviciosEstructura),
    talleres: talleresEstructura,
    equipoId: ID_DHAH,
    puedeEditar: false,
    ...overrides,
  }
}

const panel = () => screen.getByRole('complementary', { name: 'Organigrama' })
const detalle = () => screen.getByRole('region', { name: 'Detalle del equipo' })
const filaDelArbol = (nombre: string) =>
  within(panel()).getByRole('button', { name: (accesible) => accesible.startsWith(nombre) })

describe('EstructuraClient — tree panel (criteria 1 and 4)', () => {
  it('shows each team with its people and no role chips, and folds the inactive roots', () => {
    render(<EstructuraClient {...props({ equipoId: ID_CONEXION })} />)
    expect(filaDelArbol('Dirección de Conexión')).toHaveTextContent('38')
    expect(filaDelArbol('Dirección de Experiencia')).toHaveTextContent('0')
    expect(within(panel()).queryByText('Coordinador')).not.toBeInTheDocument()
    expect(within(panel()).queryByText('Director')).not.toBeInTheDocument()

    const inactivas = within(panel()).getByRole('button', { name: /Inactivas · 2/ })
    expect(inactivas).toHaveAttribute('aria-expanded', 'false')
    expect(within(panel()).queryByText('Dirección de Atracción')).not.toBeInTheDocument()
  })

  it('opens the inactive group on demand', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props({ equipoId: ID_CONEXION })} />)
    await user.click(within(panel()).getByRole('button', { name: /Inactivas · 2/ }))
    expect(within(panel()).getByRole('button', { name: /Inactivas · 2/ })).toHaveAttribute('aria-expanded', 'true')
    expect(filaDelArbol('Dirección de Atracción')).toBeInTheDocument()
    expect(filaDelArbol('Dirección de Servicios Ministeriales')).toBeInTheDocument()
  })

  it('starts with the branch of the selected team open and the rest closed', () => {
    render(<EstructuraClient {...props({ equipoId: ID_DHAH })} />)
    expect(filaDelArbol('Grupos de Corto Plazo')).toBeInTheDocument()
    expect(filaDelArbol('Parejas')).toBeInTheDocument()
    expect(within(panel()).queryByText('Segmento Hombres')).not.toBeInTheDocument()
    expect(within(panel()).queryByText('Inside Out')).not.toBeInTheDocument()
  })

  it('marks the selected team, and selecting another one updates the URL and the detail', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props({ equipoId: ID_DHAH })} />)
    expect(filaDelArbol('De Hombre a Hombre')).toHaveAttribute('aria-pressed', 'true')
    expect(filaDelArbol('Parejas')).toHaveAttribute('aria-pressed', 'false')

    await user.click(filaDelArbol('Parejas'))

    expect(replace).toHaveBeenCalledWith(`?equipo=${ID_PAREJAS}`, { scroll: false })
    expect(within(detalle()).getByRole('heading', { name: 'Parejas', level: 2 })).toBeInTheDocument()
    expect(filaDelArbol('Parejas')).toHaveAttribute('aria-pressed', 'true')
    expect(filaDelArbol('De Hombre a Hombre')).toHaveAttribute('aria-pressed', 'false')
  })

  it('folds and unfolds a node with its own chevron, named after the node', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props({ equipoId: ID_DHAH })} />)

    await user.click(within(panel()).getByRole('button', { name: 'Contraer Grupos de Corto Plazo' }))
    expect(within(panel()).queryByText('Parejas')).not.toBeInTheDocument()

    await user.click(within(panel()).getByRole('button', { name: 'Expandir Grupos de Corto Plazo' }))
    expect(filaDelArbol('Parejas')).toBeInTheDocument()

    await user.click(within(panel()).getByRole('button', { name: 'Expandir Dirección de Grupos de Vida' }))
    expect(filaDelArbol('Segmento Hombres')).toBeInTheDocument()
    expect(within(panel()).getByRole('button', { name: 'Contraer Dirección de Grupos de Vida' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('searches ignoring case and diacritics, keeping the ancestors of the match', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props({ equipoId: ID_CONEXION })} />)
    await user.type(within(panel()).getByRole('searchbox', { name: 'Buscar equipo' }), 'PAREJAS')

    expect(filaDelArbol('Dirección de Conexión')).toBeInTheDocument()
    expect(filaDelArbol('Grupos de Corto Plazo')).toBeInTheDocument()
    expect(filaDelArbol('Parejas')).toBeInTheDocument()
    expect(within(panel()).queryByText('Mujer de Hoy')).not.toBeInTheDocument()
    expect(within(panel()).queryByText('Dirección de Experiencia')).not.toBeInTheDocument()
  })

  it('says so when nothing matches', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props()} />)
    await user.type(within(panel()).getByRole('searchbox', { name: 'Buscar equipo' }), 'zzz')
    expect(within(panel()).getByText('Ningún equipo coincide con esa búsqueda.')).toBeInTheDocument()
  })

  it('starts with the inactive group open when an inactive direccion is selected', () => {
    render(<EstructuraClient {...props({ equipoId: ID_ATRACCION })} />)
    expect(filaDelArbol('Dirección de Atracción')).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('EstructuraClient — collapsing the panel (criterion 3)', () => {
  it('closes to a narrow rail and opens again, remembering the choice', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props()} />)
    const cerrar = within(panel()).getByRole('button', { name: 'Cerrar el organigrama' })
    expect(cerrar).toHaveAttribute('aria-expanded', 'true')

    await user.click(cerrar)
    expect(screen.queryByRole('complementary', { name: 'Organigrama' })).not.toBeInTheDocument()
    const abrir = screen.getByRole('button', { name: 'Abrir el organigrama' })
    expect(abrir).toHaveAttribute('aria-expanded', 'false')
    expect(window.localStorage.getItem(CLAVE_PANEL)).toBe('cerrado')
    expect(within(detalle()).getByRole('heading', { name: 'De Hombre a Hombre', level: 2 })).toBeInTheDocument()

    await user.click(abrir)
    expect(panel()).toBeInTheDocument()
    expect(window.localStorage.getItem(CLAVE_PANEL)).toBe('abierto')
  })

  it('stays closed after a reload when it was closed', () => {
    window.localStorage.setItem(CLAVE_PANEL, 'cerrado')
    render(<EstructuraClient {...props()} />)
    expect(screen.queryByRole('complementary', { name: 'Organigrama' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir el organigrama' })).toBeInTheDocument()
  })

  it('opens by default and still works when the browser refuses storage', async () => {
    const user = userEvent.setup()
    const leer = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const escribir = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      render(<EstructuraClient {...props()} />)
      expect(panel()).toBeInTheDocument()
      await user.click(within(panel()).getByRole('button', { name: 'Cerrar el organigrama' }))
      expect(screen.getByRole('button', { name: 'Abrir el organigrama' })).toBeInTheDocument()
    } finally {
      leer.mockRestore()
      escribir.mockRestore()
    }
  })
})

describe('EstructuraClient — team detail (criterion 2)', () => {
  it('shows path, badges, responsable, people, taller and the sub-equipos empty state', () => {
    render(<EstructuraClient {...props({ equipoId: ID_DHAH })} />)
    const zona = within(detalle())

    const ruta = zona.getByRole('navigation', { name: 'Ruta del equipo' })
    expect(within(ruta).getByText('Dirección de Conexión')).toBeInTheDocument()
    expect(within(ruta).getByText('Grupos de Corto Plazo')).toBeInTheDocument()
    expect(within(ruta).getByText('De Hombre a Hombre')).toHaveAttribute('aria-current', 'page')

    const titulo = zona.getByRole('heading', { name: 'De Hombre a Hombre', level: 2 })
    const cabecera = within(titulo.parentElement as HTMLElement)
    expect(cabecera.getByText('Talleres de Crecimiento')).toBeInTheDocument()
    expect(cabecera.getByText('Activo')).toBeInTheDocument()

    const responsable = zona.getByRole('region', { name: 'Responsable' })
    expect(within(responsable).getByText('Edmir Muñoz')).toBeInTheDocument()
    expect(within(responsable).getByText('Coordinador')).toBeInTheDocument()

    const personas = zona.getByRole('region', { name: 'Personas' })
    expect(within(personas).getByText('9')).toBeInTheDocument()
    expect(within(personas).getByText('en este equipo')).toBeInTheDocument()
    expect(within(personas).getByRole('link', { name: 'Ver en Mi equipo' })).toHaveAttribute(
      'href',
      `/dream-team/mi-equipo?direccion=${ID_CONEXION}`,
    )

    const taller = zona.getByRole('region', { name: 'Taller vinculado' })
    expect(within(taller).getByText('De Hombre a Hombre')).toBeInTheDocument()
    expect(within(taller).getByRole('link', { name: 'Abrir taller' })).toHaveAttribute('href', '/talleres/de-hombre-a-hombre')

    expect(zona.getByText('Sin sub-equipos')).toBeInTheDocument()
  })

  it('says a team has no taller and, without a responsable, points to Servidores', () => {
    render(<EstructuraClient {...props({ equipoId: ID_GCP, puedeEditar: true })} />)
    const zona = within(detalle())
    expect(within(zona.getByRole('region', { name: 'Taller vinculado' })).getByText('Este equipo no tiene un taller.')).toBeInTheDocument()
    const responsable = zona.getByRole('region', { name: 'Responsable' })
    expect(within(responsable).getByText('Sin responsable')).toBeInTheDocument()
    expect(within(responsable).getByRole('link', { name: 'Asígnalo en Servidores' })).toHaveAttribute(
      'href',
      `/admin/dream-team/servidores?equipo=${ID_GCP}`,
    )
  })

  it('counts the whole branch for a team with teams inside', () => {
    render(<EstructuraClient {...props({ equipoId: ID_GCP })} />)
    const personas = within(detalle()).getByRole('region', { name: 'Personas' })
    expect(within(personas).getByText('37')).toBeInTheDocument()
    expect(within(personas).getByText('en toda la rama')).toBeInTheDocument()
  })

  it('lists the sub-equipos with responsable and count, and choosing one navigates', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props({ equipoId: ID_GCP })} />)
    const lista = within(detalle()).getByRole('region', { name: 'Sub-equipos' })
    expect(within(lista).getByText('4 equipos dentro')).toBeInTheDocument()
    const filas = within(lista).getAllByRole('button')
    expect(filas.map((fila) => fila.textContent)).toEqual([
      'De Hombre a HombreEdmir Muñoz — Coordinador9 personas',
      'Mujer de HoyEdith Pérez — Coordinador6 personas',
      'ParejasLudovic Gómez — Coordinador8 personas',
      'Punto de PartidaJose Jimenez — Coordinador14 personas',
    ])

    await user.click(within(lista).getByRole('button', { name: /^Parejas/ }))
    expect(replace).toHaveBeenCalledWith(`?equipo=${ID_PAREJAS}`, { scroll: false })
    expect(within(detalle()).getByRole('heading', { name: 'Parejas', level: 2 })).toBeInTheDocument()
  })

  it('marks an inactive team as such', () => {
    render(<EstructuraClient {...props({ equipoId: ID_ATRACCION, puedeEditar: true })} />)
    expect(within(detalle()).getByText('Inactivo')).toBeInTheDocument()
    expect(within(detalle()).getByRole('button', { name: 'Activar' })).toBeInTheDocument()
  })

  it('renders the empty state when the caller reaches no team', () => {
    render(<EstructuraClient {...props({ arbol: [], equipoId: '' })} />)
    expect(screen.getByText('No se encontraron equipos')).toBeInTheDocument()
  })
})

describe('EstructuraClient — renaming and deactivating a team', () => {
  it('renames through a dialog with one field, pre-filled', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props({ equipoId: ID_DHAH, puedeEditar: true })} />)
    await user.click(within(detalle()).getByRole('button', { name: 'Renombrar' }))

    const dialogo = await screen.findByRole('dialog')
    const campo = within(dialogo).getByLabelText('Nombre del equipo')
    expect(campo).toHaveValue('De Hombre a Hombre')
    await user.clear(campo)
    await user.type(campo, '  Hombre a Hombre  ')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    expect(renombrarEquipo).toHaveBeenCalledWith({ id: ID_DHAH, label: 'Hombre a Hombre' })
    expect(toastSuccess).toHaveBeenCalledWith('Equipo renombrado correctamente.')
    expect(refresh).toHaveBeenCalled()
  })

  it('will not save an unchanged or empty name', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props({ equipoId: ID_DHAH, puedeEditar: true })} />)
    await user.click(within(detalle()).getByRole('button', { name: 'Renombrar' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByRole('button', { name: 'Guardar' })).toBeDisabled()
    await user.clear(within(dialogo).getByLabelText('Nombre del equipo'))
    expect(within(dialogo).getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  it('reports a failed rename and does not refresh', async () => {
    const user = userEvent.setup()
    jest.mocked(renombrarEquipo).mockResolvedValue({ ok: false, error: 'forbidden' } as never)
    render(<EstructuraClient {...props({ equipoId: ID_DHAH, puedeEditar: true })} />)
    await user.click(within(detalle()).getByRole('button', { name: 'Renombrar' }))
    const dialogo = await screen.findByRole('dialog')
    await user.type(within(dialogo).getByLabelText('Nombre del equipo'), ' 2')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))
    expect(toastError).toHaveBeenCalledWith('No tienes permiso para esta acción.')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('asks before deactivating and then calls cambiarActivoEquipo', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props({ equipoId: ID_DHAH, puedeEditar: true })} />)
    await user.click(within(detalle()).getByRole('button', { name: 'Desactivar' }))
    expect(cambiarActivoEquipo).not.toHaveBeenCalled()
    expect(screen.getByText('Desactivar "De Hombre a Hombre"')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))
    expect(cambiarActivoEquipo).toHaveBeenCalledWith({ id: ID_DHAH, activo: false })
    expect(toastSuccess).toHaveBeenCalledWith('Equipo desactivado.')
    expect(refresh).toHaveBeenCalled()
  })

  it('activates an inactive team straight away', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props({ equipoId: ID_ATRACCION, puedeEditar: true })} />)
    await user.click(within(detalle()).getByRole('button', { name: 'Activar' }))
    expect(cambiarActivoEquipo).toHaveBeenCalledWith({ id: ID_ATRACCION, activo: true })
    expect(toastSuccess).toHaveBeenCalledWith('Equipo activado.')
  })
})

describe('EstructuraClient — read-only viewers (criterion 6)', () => {
  it('shows everything without a single action button', () => {
    render(<EstructuraClient {...props({ equipoId: ID_GCP, puedeEditar: false })} />)
    const zona = within(detalle())
    for (const nombre of ['Renombrar', 'Desactivar', 'Activar', 'Agregar sub-equipo']) {
      expect(zona.queryByRole('button', { name: nombre })).not.toBeInTheDocument()
    }
    expect(zona.queryByRole('switch')).not.toBeInTheDocument()
    expect(zona.queryByRole('link', { name: 'Asígnalo en Servidores' })).not.toBeInTheDocument()
    expect(zona.getByText('Sin responsable')).toBeInTheDocument()
  })

  it('offers no action on a Grupos de Vida node even to an editor', () => {
    render(<EstructuraClient {...props({ equipoId: ID_GDV_GRUPO, puedeEditar: true })} />)
    const zona = within(detalle())
    expect(zona.getByRole('heading', { name: 'Grupo Alfa', level: 2 })).toBeInTheDocument()
    expect(zona.getByText('Grupos de Vida')).toBeInTheDocument()
    expect(zona.getByText('Lidia Líder')).toBeInTheDocument()
    for (const nombre of ['Renombrar', 'Desactivar', 'Agregar sub-equipo']) {
      expect(zona.queryByRole('button', { name: nombre })).not.toBeInTheDocument()
    }
    expect(zona.queryByRole('link', { name: 'Asígnalo en Servidores' })).not.toBeInTheDocument()
  })

  it('keeps the structure editable for the real Grupos de Vida direccion', () => {
    render(<EstructuraClient {...props({ equipoId: ID_GDV, puedeEditar: true })} />)
    expect(within(detalle()).getByRole('button', { name: 'Renombrar' })).toBeInTheDocument()
  })
})
