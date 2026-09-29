/**
 * `<EstructuraClient>` — roles and sub-equipos of the selected team
 * (criteria 2, 5 and 6 of odd/tasks/dream-team-estructura-rediseno.md):
 * the roles list with usage, the switch, rename and add-rol form, and the
 * "Agregar sub-equipo" dialog.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EstructuraClient, type EstructuraClientProps } from '@/components/dream-team/estructura/estructura-client'
import { contarUso } from '@/lib/platform/dream-team/estructura-vista'
import {
  ID_ATRACCION,
  ID_DHAH,
  ID_GCP,
  ID_GDV_GRUPO,
  ID_INSIDE,
  arbolEstructura,
  rolesPorEquipoEstructura,
  serviciosEstructura,
  talleresEstructura,
} from '@/tests/helpers/estructura-fixture'
import {
  cambiarActivoRol,
  crearEquipo,
  crearRol,
  renombrarRol,
} from '@/app/(auth)/admin/dream-team/estructura/actions'

const replace = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: jest.fn() }),
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

jest.mock('@/components/ui/sistema-diseno', () => ({
  ...jest.requireActual('@/components/ui/sistema-diseno'),
  ContenedorDashboard: ({ children, titulo }: { children: React.ReactNode; titulo?: string }) => (
    <section>
      <h1>{titulo}</h1>
      {children}
    </section>
  ),
}))

const ok = { ok: true }

beforeEach(() => {
  for (const mock of [replace, refresh, toastSuccess, toastError]) mock.mockClear()
  jest.mocked(cambiarActivoRol).mockResolvedValue(ok as never)
  jest.mocked(crearRol).mockResolvedValue(ok as never)
  jest.mocked(renombrarRol).mockResolvedValue(ok as never)
  jest.mocked(crearEquipo).mockResolvedValue(ok as never)
  window.localStorage.clear()
})

function props(overrides: Partial<EstructuraClientProps> = {}): EstructuraClientProps {
  return {
    arbol: arbolEstructura,
    rolesPorEquipo: rolesPorEquipoEstructura,
    uso: contarUso(serviciosEstructura),
    talleres: talleresEstructura,
    equipoId: ID_DHAH,
    puedeEditar: true,
    ...overrides,
  }
}

const roles = () => within(screen.getByRole('region', { name: 'Roles de este equipo' }))
const filaDeRol = (nombre: string) => roles().getByText(nombre).closest('li') as HTMLElement

describe('roles of a team (criterion 2)', () => {
  it('lists every rol with how many people hold it', () => {
    render(<EstructuraClient {...props()} />)
    expect(within(filaDeRol('Coordinador')).getByText('1 persona')).toBeInTheDocument()
    expect(within(filaDeRol('Facilitador')).getByText('8 personas')).toBeInTheDocument()
    expect(within(filaDeRol('Director')).getByText('Nadie lo tiene todavía')).toBeInTheDocument()
    expect(within(filaDeRol('Líder')).getByText('Nadie lo tiene todavía')).toBeInTheDocument()
  })

  it('says a disabled rol cannot be assigned', () => {
    render(<EstructuraClient {...props()} />)
    expect(within(filaDeRol('Voluntario')).getByText('Desactivado: no se puede asignar')).toBeInTheDocument()
    expect(within(filaDeRol('Voluntario')).getByRole('switch', { name: 'Rol Voluntario' })).toHaveAttribute('aria-checked', 'false')
    expect(within(filaDeRol('Facilitador')).getByRole('switch', { name: 'Rol Facilitador' })).toHaveAttribute('aria-checked', 'true')
  })

  it('says so when a team has no roles yet', () => {
    render(<EstructuraClient {...props({ equipoId: ID_INSIDE })} />)
    expect(roles().getByText('Este equipo todavía no tiene roles.')).toBeInTheDocument()
    expect(roles().getByRole('button', { name: 'Agregar rol' })).toBeInTheDocument()
  })

  it('shows no roles card for a Grupos de Vida node', () => {
    render(<EstructuraClient {...props({ equipoId: ID_GDV_GRUPO })} />)
    expect(screen.queryByRole('region', { name: 'Roles de este equipo' })).not.toBeInTheDocument()
  })
})

describe('enabling and disabling a rol (criterion 5)', () => {
  it('disables an active rol through cambiarActivoRol', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props()} />)
    await user.click(within(filaDeRol('Facilitador')).getByRole('switch', { name: 'Rol Facilitador' }))
    expect(cambiarActivoRol).toHaveBeenCalledWith({ id: `rol-${ID_DHAH}-facilitador`, activo: false })
    expect(toastSuccess).toHaveBeenCalledWith('Rol desactivado.')
    expect(refresh).toHaveBeenCalled()
  })

  it('enables a disabled rol', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props()} />)
    await user.click(within(filaDeRol('Voluntario')).getByRole('switch', { name: 'Rol Voluntario' }))
    expect(cambiarActivoRol).toHaveBeenCalledWith({ id: `rol-${ID_DHAH}-voluntario`, activo: true })
    expect(toastSuccess).toHaveBeenCalledWith('Rol activado.')
  })

  it('reports a failure and does not refresh', async () => {
    const user = userEvent.setup()
    jest.mocked(cambiarActivoRol).mockResolvedValue({ ok: false, error: 'not-found' } as never)
    render(<EstructuraClient {...props()} />)
    await user.click(within(filaDeRol('Facilitador')).getByRole('switch', { name: 'Rol Facilitador' }))
    expect(toastError).toHaveBeenCalledWith('No se encontró el elemento (puede haber sido modificado por otra persona).')
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('renaming a rol', () => {
  it('opens a dialog starting from the stored name and calls renombrarRol', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props()} />)
    const lapiz = within(filaDeRol('Facilitador')).getByRole('button', { name: 'Renombrar el rol Facilitador' })
    expect(lapiz).toHaveAttribute('title', 'Renombrar rol')
    await user.click(lapiz)

    const dialogo = await screen.findByRole('dialog')
    const campo = within(dialogo).getByLabelText('Nombre del rol')
    expect(campo).toHaveValue('facilitador')
    await user.clear(campo)
    await user.type(campo, 'Anfitrión')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    expect(renombrarRol).toHaveBeenCalledWith({ id: `rol-${ID_DHAH}-facilitador`, label: 'Anfitrión' })
    expect(toastSuccess).toHaveBeenCalledWith('Rol renombrado correctamente.')
    expect(refresh).toHaveBeenCalled()
  })
})

describe('adding a rol', () => {
  it('calls crearRol for this team, clears the field and refreshes', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props()} />)
    const agregar = roles().getByRole('button', { name: 'Agregar rol' })
    expect(agregar).toBeDisabled()

    const campo = roles().getByRole('textbox', { name: 'Nombre del rol nuevo' })
    await user.type(campo, '  Cocinero ')
    await user.click(agregar)

    expect(crearRol).toHaveBeenCalledWith({ equipoId: ID_DHAH, label: 'Cocinero' })
    expect(toastSuccess).toHaveBeenCalledWith('Rol agregado correctamente.')
    expect(campo).toHaveValue('')
    expect(refresh).toHaveBeenCalled()
  })

  it('keeps what was typed when it fails', async () => {
    const user = userEvent.setup()
    jest.mocked(crearRol).mockResolvedValue({ ok: false, error: 'internal', message: 'Falló la base' } as never)
    render(<EstructuraClient {...props()} />)
    const campo = roles().getByRole('textbox', { name: 'Nombre del rol nuevo' })
    await user.type(campo, 'Cocinero')
    await user.click(roles().getByRole('button', { name: 'Agregar rol' }))
    expect(toastError).toHaveBeenCalledWith('Falló la base')
    expect(campo).toHaveValue('Cocinero')
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('read-only viewers (criterion 6)', () => {
  it('see each rol with its state as a badge and nothing to change', () => {
    render(<EstructuraClient {...props({ puedeEditar: false })} />)
    expect(roles().queryByRole('switch')).not.toBeInTheDocument()
    expect(roles().queryByRole('button')).not.toBeInTheDocument()
    expect(roles().queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(filaDeRol('Voluntario')).getByText('Desactivado')).toBeInTheDocument()
    expect(within(filaDeRol('Facilitador')).getByText('Activo')).toBeInTheDocument()
    expect(within(filaDeRol('Facilitador')).getByText('8 personas')).toBeInTheDocument()
  })
})

describe('adding a sub-equipo', () => {
  it('names it in a dialog and creates it inside the selected team', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props({ equipoId: ID_GCP })} />)
    await user.click(within(screen.getByRole('region', { name: 'Detalle del equipo' })).getByRole('button', { name: 'Agregar sub-equipo' }))

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Se creará dentro de "Grupos de Corto Plazo".')).toBeInTheDocument()
    const crear = within(dialogo).getByRole('button', { name: 'Crear' })
    expect(crear).toBeDisabled()
    await user.type(within(dialogo).getByLabelText('Nombre del sub-equipo'), '  Solteros ')
    await user.click(crear)

    expect(crearEquipo).toHaveBeenCalledWith({ parentEquipoId: ID_GCP, label: 'Solteros' })
    expect(toastSuccess).toHaveBeenCalledWith('Sub-equipo creado correctamente.')
    expect(refresh).toHaveBeenCalled()
  })

  it('points editors at the button when there are no sub-equipos', () => {
    render(<EstructuraClient {...props({ equipoId: ID_DHAH })} />)
    expect(screen.getByText('Usa «Agregar sub-equipo» para crear uno dentro de este.')).toBeInTheDocument()
  })

  it('is available on an inactive team too', () => {
    render(<EstructuraClient {...props({ equipoId: ID_ATRACCION })} />)
    expect(
      within(screen.getByRole('region', { name: 'Detalle del equipo' })).getByRole('button', { name: 'Agregar sub-equipo' }),
    ).toBeInTheDocument()
  })
})
