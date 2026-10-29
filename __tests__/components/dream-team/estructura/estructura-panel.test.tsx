/**
 * `<EstructuraClient>` — the node panel opened from the org chart (S12 of
 * odd/tasks/sistema-diseno-v2.md). Carries over the intents of the old team
 * detail suite: the team's path, people of the branch and taller; renaming
 * (pre-filled, trimmed, never unchanged or empty, a failure does not
 * refresh); deactivating only after confirming; activating at once; a
 * subequipo row opens that node; and who sees what — a director (no
 * org.manage) reads without one action, a Grupos de Vida node is read-only
 * even for an admin, the real Grupos de Vida dirección stays editable.
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

beforeEach(() => {
  for (const mock of [replace, refresh, toastSuccess, toastError]) mock.mockClear()
  jest.mocked(renombrarEquipo).mockResolvedValue({ ok: true } as never)
  jest.mocked(cambiarActivoEquipo).mockResolvedValue({ ok: true } as never)
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

const panel = (nombre?: string) => within(screen.getByRole('dialog', nombre ? { name: nombre } : {}))
const ACCIONES = ['Subequipo', 'Renombrar', 'Desactivar', 'Activar']

describe('what the panel shows', () => {
  it('names the team with its path, its people and its taller', async () => {
    render(<EstructuraClient {...props()} />)
    const dialogo = screen.getByRole('dialog', { name: 'De Hombre a Hombre' })
    expect(dialogo).toHaveAccessibleDescription('Dirección de Conexión › Grupos de Corto Plazo')
    expect(panel().getByText('9')).toBeInTheDocument()
    await userEvent.click(panel().getByRole('tab', { name: 'Taller' }))
    expect(panel().getByRole('link', { name: /De Hombre a Hombre|Abrir taller/ })).toHaveAttribute('href', '/talleres/de-hombre-a-hombre')
  })

  it('opens a subequipo from its row, through the URL', async () => {
    render(<EstructuraClient {...props({ equipoId: ID_GCP })} />)
    await userEvent.click(panel().getByRole('button', { name: 'Abrir Parejas' }))
    expect(replace).toHaveBeenLastCalledWith(`/admin/dream-team/estructura?equipo=${ID_PAREJAS}`, { scroll: false })
    expect(screen.getByRole('dialog', { name: 'Parejas' })).toBeInTheDocument()
  })
})

describe('renaming and deactivating a team', () => {
  async function abrirRenombrar() {
    const user = userEvent.setup()
    render(<EstructuraClient {...props()} />)
    await user.click(panel().getByRole('button', { name: 'Renombrar' }))
    return { user, dialogo: within(await screen.findByRole('dialog', { name: 'Renombrar equipo' })) }
  }

  it('renames through a dialog with one field, pre-filled', async () => {
    const { user, dialogo } = await abrirRenombrar()
    const campo = dialogo.getByLabelText('Nombre del equipo')
    expect(campo).toHaveValue('De Hombre a Hombre')
    await user.clear(campo)
    await user.type(campo, '  Hombre a Hombre  ')
    await user.click(dialogo.getByRole('button', { name: 'Guardar' }))
    expect(renombrarEquipo).toHaveBeenCalledWith({ id: ID_DHAH, label: 'Hombre a Hombre' })
    expect(toastSuccess).toHaveBeenCalledWith('Equipo renombrado correctamente.')
    expect(refresh).toHaveBeenCalled()
  })

  it('will not save an unchanged or empty name', async () => {
    const { user, dialogo } = await abrirRenombrar()
    expect(dialogo.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    await user.clear(dialogo.getByLabelText('Nombre del equipo'))
    expect(dialogo.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  it('reports a failed rename and does not refresh', async () => {
    jest.mocked(renombrarEquipo).mockResolvedValue({ ok: false, error: 'forbidden' } as never)
    const { user, dialogo } = await abrirRenombrar()
    await user.type(dialogo.getByLabelText('Nombre del equipo'), ' 2')
    await user.click(dialogo.getByRole('button', { name: 'Guardar' }))
    expect(toastError).toHaveBeenCalledWith('No tienes permiso para esta acción.')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('asks before deactivating and then calls cambiarActivoEquipo', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props()} />)
    await user.click(panel().getByRole('button', { name: 'Desactivar' }))
    expect(cambiarActivoEquipo).not.toHaveBeenCalled()
    const confirmar = within(screen.getByRole('alertdialog', { name: 'Desactivar «De Hombre a Hombre»' }))
    await user.click(confirmar.getByRole('button', { name: 'Sí, desactivar' }))
    expect(cambiarActivoEquipo).toHaveBeenCalledWith({ id: ID_DHAH, activo: false })
    expect(toastSuccess).toHaveBeenCalledWith('Equipo desactivado.')
    expect(refresh).toHaveBeenCalled()
  })

  it('activates an inactive team straight away', async () => {
    const user = userEvent.setup()
    render(<EstructuraClient {...props({ equipoId: ID_ATRACCION })} />)
    await user.click(panel().getAllByRole('button', { name: 'Activar' })[0])
    expect(cambiarActivoEquipo).toHaveBeenCalledWith({ id: ID_ATRACCION, activo: true })
    expect(toastSuccess).toHaveBeenCalledWith('Equipo activado.')
  })
})

describe('who sees what (criterion 6)', () => {
  it('lets a director read their branch without a single action', () => {
    render(<EstructuraClient {...props({ equipoId: ID_GCP, puedeEditar: false })} />)
    for (const accion of ACCIONES) expect(panel().queryByRole('button', { name: accion })).not.toBeInTheDocument()
    expect(panel().queryByRole('switch')).not.toBeInTheDocument()
    expect(panel().queryByRole('link', { name: 'Asígnalo en Servidores' })).not.toBeInTheDocument()
    expect(panel().getByText('Antholy Ludovic Gómez')).toBeInTheDocument()
  })

  it('offers no action on a Grupos de Vida node even to an editor', () => {
    render(<EstructuraClient {...props({ equipoId: ID_GDV_GRUPO })} />)
    expect(panel('Grupo Alfa').getByText('Solo lectura')).toBeInTheDocument()
    expect(panel().getByText('Lidia Líder')).toBeInTheDocument()
    for (const accion of ACCIONES) expect(panel().queryByRole('button', { name: accion })).not.toBeInTheDocument()
    expect(panel().queryByRole('tab')).not.toBeInTheDocument()
  })

  it('keeps the structure editable for the real Grupos de Vida dirección', () => {
    render(<EstructuraClient {...props({ equipoId: ID_GDV })} />)
    expect(panel().getByRole('button', { name: 'Renombrar' })).toBeInTheDocument()
  })
})
