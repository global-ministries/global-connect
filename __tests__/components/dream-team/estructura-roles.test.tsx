/**
 * `<EstructuraClient>` — roles and subequipos of a team (criteria 2, 5 and 6
 * of odd/tasks/dream-team-estructura-rediseno.md), on design system v2: they
 * now live in the node panel (a box opens it; Roles is one of its tabs)
 * instead of the old detail cards. Same rules: the roles list with usage, the
 * switch, the level (odd/tasks/uno-a-uno.md, T1), rename, add-rol, and
 * "Agregar subequipo"; whoever cannot edit reads it all without a control.
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
  cambiarNivelRol,
  crearEquipo,
  crearRol,
  renombrarRol,
} from '@/app/(auth)/admin/dream-team/estructura/actions'

const replace = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: jest.fn() }),
  usePathname: () => '/admin/dream-team/estructura',
}))
jest.mock('@/hooks/useCampus', () => ({ useCampus: () => ({ campusId: null, campusActivo: null }) }))
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
  cambiarNivelRol: jest.fn(),
}))
const toastSuccess = jest.fn()
const toastError = jest.fn()
jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: toastSuccess, error: toastError, info: jest.fn() }),
}))
jest.mock('@/components/ui/desktop-header', () => ({ DesktopHeader: () => null }))

const ok = { ok: true }
beforeEach(() => {
  for (const mock of [replace, refresh, toastSuccess, toastError]) mock.mockClear()
  jest.mocked(cambiarActivoRol).mockResolvedValue(ok as never)
  jest.mocked(cambiarNivelRol).mockResolvedValue(ok as never)
  jest.mocked(crearRol).mockResolvedValue(ok as never)
  jest.mocked(renombrarRol).mockResolvedValue(ok as never)
  jest.mocked(crearEquipo).mockResolvedValue(ok as never)
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

const panel = () => within(screen.getByRole('dialog'))

/** Opens the panel of `equipoId` (through `?equipo=`) on its Roles tab. */
async function abrirRoles(overrides: Partial<EstructuraClientProps> = {}) {
  const user = userEvent.setup()
  render(<EstructuraClient {...props(overrides)} />)
  await user.click(panel().getByRole('tab', { name: /^Roles/ }))
  return user
}

const roles = panel
// The level selectors (and, read-only, the level text) repeat the level names: a rol is its first match.
const filaDeRol = (nombre: string) =>
  within(panel().getByRole('list', { name: 'Roles de este equipo' })).getAllByText(nombre, { ignore: 'option' })[0].closest('li') as HTMLElement
const nivelDe = (nombre: string) => within(filaDeRol(nombre)).getByRole('combobox', { name: `Nivel del rol ${nombre}` })
const nivelNuevo = () => roles().getByRole('combobox', { name: 'Nivel del rol nuevo' })

describe('roles of a team (criterion 2)', () => {
  it('lists every rol with how many people hold it', async () => {
    await abrirRoles()
    expect(within(filaDeRol('Coordinador')).getByText('1 persona')).toBeInTheDocument()
    expect(within(filaDeRol('Facilitador')).getByText('8 personas')).toBeInTheDocument()
    expect(within(filaDeRol('Director')).getByText('Nadie lo tiene todavía')).toBeInTheDocument()
    expect(within(filaDeRol('Líder')).getByText('Nadie lo tiene todavía')).toBeInTheDocument()
  })

  it('says a disabled rol cannot be assigned', async () => {
    await abrirRoles()
    expect(within(filaDeRol('Voluntario')).getByText('Desactivado: no se puede asignar')).toBeInTheDocument()
    expect(within(filaDeRol('Voluntario')).getByRole('switch', { name: 'Rol Voluntario' })).toHaveAttribute('aria-checked', 'false')
    expect(within(filaDeRol('Facilitador')).getByRole('switch', { name: 'Rol Facilitador' })).toHaveAttribute('aria-checked', 'true')
  })

  it('says so when a team has no roles yet', async () => {
    await abrirRoles({ equipoId: ID_INSIDE })
    expect(roles().getByText('Este equipo todavía no tiene roles.')).toBeInTheDocument()
    expect(roles().getByRole('button', { name: 'Agregar' })).toBeInTheDocument()
  })

  it('has no Roles tab for a Grupos de Vida node', () => {
    render(<EstructuraClient {...props({ equipoId: ID_GDV_GRUPO })} />)
    expect(panel().queryByRole('tab', { name: /^Roles/ })).not.toBeInTheDocument()
    expect(panel().queryByRole('list', { name: 'Roles de este equipo' })).not.toBeInTheDocument()
  })
})

describe('enabling and disabling a rol (criterion 5)', () => {
  it('disables an active rol through cambiarActivoRol', async () => {
    const user = await abrirRoles()
    await user.click(within(filaDeRol('Facilitador')).getByRole('switch', { name: 'Rol Facilitador' }))
    expect(cambiarActivoRol).toHaveBeenCalledWith({ id: `rol-${ID_DHAH}-facilitador`, activo: false })
    expect(toastSuccess).toHaveBeenCalledWith('Rol desactivado.')
    expect(refresh).toHaveBeenCalled()
  })

  it('enables a disabled rol', async () => {
    const user = await abrirRoles()
    await user.click(within(filaDeRol('Voluntario')).getByRole('switch', { name: 'Rol Voluntario' }))
    expect(cambiarActivoRol).toHaveBeenCalledWith({ id: `rol-${ID_DHAH}-voluntario`, activo: true })
    expect(toastSuccess).toHaveBeenCalledWith('Rol activado.')
  })

  it('reports a failure and does not refresh', async () => {
    jest.mocked(cambiarActivoRol).mockResolvedValue({ ok: false, error: 'not-found' } as never)
    const user = await abrirRoles()
    await user.click(within(filaDeRol('Facilitador')).getByRole('switch', { name: 'Rol Facilitador' }))
    expect(toastError).toHaveBeenCalledWith('No se encontró el elemento (puede haber sido modificado por otra persona).')
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('the level of a rol', () => {
  it('shows each rol at its level', async () => {
    await abrirRoles()
    expect(nivelDe('Director')).toHaveValue('director')
    expect(nivelDe('Coordinador')).toHaveValue('coordinador')
    expect(nivelDe('Facilitador')).toHaveValue('lider')
    expect(nivelDe('Voluntario')).toHaveValue('voluntario')
    expect(within(nivelDe('Facilitador')).getAllByRole('option').map((opcion) => opcion.textContent)).toEqual([
      'Director',
      'Coordinador',
      'Líder',
      'Voluntario',
    ])
  })

  it('changes it through cambiarNivelRol and refreshes', async () => {
    const user = await abrirRoles()
    await user.selectOptions(nivelDe('Facilitador'), 'coordinador')
    expect(cambiarNivelRol).toHaveBeenCalledWith({ id: `rol-${ID_DHAH}-facilitador`, nivel: 'coordinador' })
    expect(toastSuccess).toHaveBeenCalledWith('Nivel del rol actualizado.')
    expect(refresh).toHaveBeenCalled()
  })

  it('reports a failure and does not refresh', async () => {
    jest.mocked(cambiarNivelRol).mockResolvedValue({ ok: false, error: 'internal', message: 'Falló la base' } as never)
    const user = await abrirRoles()
    await user.selectOptions(nivelDe('Facilitador'), 'director')
    expect(toastError).toHaveBeenCalledWith('Falló la base')
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('renaming a rol', () => {
  it('opens a dialog starting from the stored name and calls renombrarRol', async () => {
    const user = await abrirRoles()
    const lapiz = within(filaDeRol('Facilitador')).getByRole('button', { name: 'Renombrar el rol Facilitador' })
    expect(lapiz).toHaveAttribute('title', 'Renombrar rol')
    await user.click(lapiz)

    const dialogo = await screen.findByRole('dialog', { name: 'Renombrar rol' })
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
  const agregar = () => roles().getByRole('button', { name: 'Agregar' })
  const campoNuevo = () => roles().getByRole('textbox', { name: 'Nombre del rol nuevo' })

  it('calls crearRol for this team, clears the field and refreshes', async () => {
    const user = await abrirRoles()
    expect(agregar()).toBeDisabled()
    await user.type(campoNuevo(), '  Cocinero ')
    await user.click(agregar())
    expect(crearRol).toHaveBeenCalledWith({ equipoId: ID_DHAH, label: 'Cocinero', nivel: 'voluntario' })
    expect(toastSuccess).toHaveBeenCalledWith('Rol agregado correctamente.')
    expect(campoNuevo()).toHaveValue('')
    expect(refresh).toHaveBeenCalled()
  })

  it('suggests the level from the typed name', async () => {
    const user = await abrirRoles()
    expect(nivelNuevo()).toHaveValue('voluntario')
    await user.type(campoNuevo(), 'Entrenador')
    expect(nivelNuevo()).toHaveValue('lider')
    await user.click(agregar())
    expect(crearRol).toHaveBeenCalledWith({ equipoId: ID_DHAH, label: 'Entrenador', nivel: 'lider' })
  })

  it('keeps a level picked by hand while the name changes, and resets after adding', async () => {
    const user = await abrirRoles()
    await user.selectOptions(nivelNuevo(), 'coordinador')
    await user.type(campoNuevo(), 'Director técnico')
    expect(nivelNuevo()).toHaveValue('coordinador')
    await user.click(agregar())
    expect(crearRol).toHaveBeenCalledWith({ equipoId: ID_DHAH, label: 'Director técnico', nivel: 'coordinador' })
    expect(nivelNuevo()).toHaveValue('voluntario')
  })

  it('keeps what was typed when it fails', async () => {
    jest.mocked(crearRol).mockResolvedValue({ ok: false, error: 'internal', message: 'Falló la base' } as never)
    const user = await abrirRoles()
    await user.type(campoNuevo(), 'Cocinero')
    await user.click(agregar())
    expect(toastError).toHaveBeenCalledWith('Falló la base')
    expect(campoNuevo()).toHaveValue('Cocinero')
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('read-only viewers (criterion 6)', () => {
  it('see each rol with its level and state, and nothing to change', async () => {
    await abrirRoles({ puedeEditar: false })
    const lista = within(panel().getByRole('list', { name: 'Roles de este equipo' }))
    expect(lista.queryByRole('switch')).not.toBeInTheDocument()
    expect(lista.queryByRole('button')).not.toBeInTheDocument()
    expect(lista.queryByRole('combobox')).not.toBeInTheDocument()
    expect(panel().queryByRole('textbox')).not.toBeInTheDocument()
    expect(panel().queryByRole('form', { name: 'Agregar rol' })).not.toBeInTheDocument()
    expect(within(filaDeRol('Facilitador')).getByText('Líder')).toBeInTheDocument()
    expect(within(filaDeRol('Voluntario')).getAllByText('Voluntario')).toHaveLength(2)
    expect(within(filaDeRol('Voluntario')).getByText('Desactivado')).toBeInTheDocument()
    expect(within(filaDeRol('Facilitador')).getByText('Activo')).toBeInTheDocument()
    expect(within(filaDeRol('Facilitador')).getByText('8 personas')).toBeInTheDocument()
  })

  it('get no quick actions and no floating button', () => {
    render(<EstructuraClient {...props({ puedeEditar: false })} />)
    for (const accion of ['Subequipo', 'Renombrar', 'Desactivar', 'Activar']) {
      expect(panel().queryByRole('button', { name: accion })).not.toBeInTheDocument()
    }
    expect(screen.queryAllByRole('button', { name: 'Agregar subequipo', hidden: true })).toHaveLength(0)
  })
})

describe('adding a subequipo', () => {
  it('names it in a dialog and creates it inside the open team', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props({ equipoId: ID_GCP })} />)
    await user.click(panel().getByRole('button', { name: 'Subequipo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar subequipo' })
    expect(within(dialogo).getByText('Se creará dentro de «Grupos de Corto Plazo».')).toBeInTheDocument()
    const crear = within(dialogo).getByRole('button', { name: 'Crear' })
    expect(crear).toBeDisabled()
    await user.type(within(dialogo).getByLabelText('Nombre del subequipo'), '  Solteros ')
    await user.click(crear)
    expect(crearEquipo).toHaveBeenCalledWith({ parentEquipoId: ID_GCP, label: 'Solteros' })
    expect(toastSuccess).toHaveBeenCalledWith('Subequipo creado correctamente.')
    expect(refresh).toHaveBeenCalled()
  })

  it('is available on an inactive team too', () => {
    render(<EstructuraClient {...props({ equipoId: ID_ATRACCION })} />)
    expect(panel().getByRole('button', { name: 'Subequipo' })).toBeInTheDocument()
    // The quick action, and the fix of the "Inactivo" problem in Resumen.
    expect(panel().getAllByRole('button', { name: 'Activar' }).length).toBeGreaterThan(0)
  })
})
