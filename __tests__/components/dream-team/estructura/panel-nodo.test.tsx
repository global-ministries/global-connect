/**
 * `<PanelNodo>` — the detail panel of one org chart box (S12 of
 * odd/tasks/sistema-diseno-v2.md, prototype estructura/07-b-escritorio.html):
 * name, experiencia and estado, quick actions (Subequipo · Renombrar ·
 * Desactivar/Activar) for whoever manages the structure, and the tabs
 * Resumen · Roles · Turnos · Taller. A director reads; a Grupos de Vida node
 * is read-only for everyone.
 *
 * jsdom has no matchMedia, so `DetalleResponsivo` renders the desktop side panel.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PanelNodo, type PanelNodoProps } from '@/components/dream-team/estructura/panel-nodo'
import {
  cambiarActivoEquipo,
  cambiarActivoRol,
  cambiarNivelRol,
  crearEquipo,
  crearRol,
} from '@/app/(auth)/admin/dream-team/estructura/actions'
import { guardarTurnosEquipo } from '@/app/(auth)/admin/dream-team/estructura/turnos-actions'
import type { DetalleEquipo } from '@/lib/platform/dream-team/estructura-vista'
import type { Turno } from '@/lib/platform/dream-team/turnos'

jest.mock('@/app/(auth)/admin/dream-team/estructura/actions', () => ({
  crearEquipo: jest.fn(),
  renombrarEquipo: jest.fn(),
  cambiarActivoEquipo: jest.fn(),
  crearRol: jest.fn(),
  renombrarRol: jest.fn(),
  cambiarActivoRol: jest.fn(),
  cambiarNivelRol: jest.fn(),
}))

jest.mock('@/app/(auth)/admin/dream-team/estructura/turnos-actions', () => ({
  crearTurno: jest.fn(),
  cambiarActivoTurno: jest.fn(),
  guardarTurnosEquipo: jest.fn(),
}))

const ok = { ok: true } as never

const detalle: DetalleEquipo = {
  id: 'eq-pp',
  label: 'Punto de Partida',
  ruta: ['Dirección de Conexión', 'Talleres', 'Punto de Partida'],
  experienciaLabel: 'Conexión',
  activo: true,
  editable: true,
  responsable: null,
  personasRama: 4,
  esRama: false,
  taller: null,
  hijos: [
    { id: 'eq-bienvenida', label: 'Bienvenida', responsable: { nombre: 'Ana Pérez', rol: 'Coordinador' }, personasRama: 3 },
  ],
  roles: [
    { id: 'rol-coord', label: 'Coordinador', labelOriginal: 'Coordinador', nivel: 'coordinador', activo: true, uso: 0 },
    { id: 'rol-vol', label: 'Voluntario', labelOriginal: 'Voluntario', nivel: 'voluntario', activo: true, uso: 4 },
  ],
}

const turnos: readonly Turno[] = [
  { id: 't-dom9', campusId: 'c1', nombre: 'Domingo 9:00', diaSemana: 0, hora: '09:00', orden: 1, activo: true },
  { id: 't-dom11', campusId: 'c1', nombre: 'Domingo 11:00', diaSemana: 0, hora: '11:00', orden: 2, activo: true },
  { id: 't-retiro', campusId: 'c1', nombre: 'Retiro', diaSemana: 0, hora: '08:00', orden: 3, activo: true, tipo: 'fechas' },
]

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }

function renderPanel(props: Partial<PanelNodoProps> = {}) {
  const base: PanelNodoProps = {
    abierto: true,
    onCambioAbierto: jest.fn(),
    detalle,
    direccionId: 'dir-conexion',
    problemas: ['sin_responsable', 'roles_sin_asignar'],
    puedeEditar: true,
    turnos: { turnos, campusId: 'c1', propios: [], efectivos: ['t-dom9', 't-dom11'] },
    onAbrirNodo: jest.fn(),
    onActualizado: jest.fn(),
    toast: toast as never,
  }
  const todas = { ...base, ...props }
  return { ...render(<PanelNodo {...todas} />), props: todas }
}

beforeEach(() => {
  jest.clearAllMocks()
  for (const accion of [cambiarActivoEquipo, cambiarActivoRol, cambiarNivelRol, crearEquipo, crearRol, guardarTurnosEquipo]) {
    jest.mocked(accion).mockResolvedValue(ok)
  }
})

describe('PanelNodo — header and tabs', () => {
  it('names the node and shows its experiencia and estado', () => {
    renderPanel()
    const panel = screen.getByRole('dialog', { name: 'Punto de Partida' })
    expect(within(panel).getByText('Dirección de Conexión › Talleres')).toBeInTheDocument()
    expect(within(panel).getByText('Conexión')).toBeInTheDocument()
    expect(within(panel).getByText('Activo')).toBeInTheDocument()
    expect(within(panel).getByText('2 cosas por revisar')).toBeInTheDocument()
  })

  it('has the tabs Resumen · Roles · Turnos · Taller, Resumen first', async () => {
    renderPanel()
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent?.trim())
    expect(tabs).toEqual([
      expect.stringMatching(/^Resumen/),
      expect.stringMatching(/^Roles/),
      expect.stringMatching(/^Turnos/),
      expect.stringMatching(/^Taller/),
    ])
    expect(screen.getByRole('tab', { name: /Resumen/ })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(screen.getByRole('tab', { name: /Taller/ }))
    expect(screen.getByText('Este equipo no tiene un taller.')).toBeInTheDocument()
  })

  it('links the taller when the team has one', async () => {
    renderPanel({ detalle: { ...detalle, taller: { nombre: 'Parejas que Crecen', href: '/talleres/parejas' } } })
    await userEvent.click(screen.getByRole('tab', { name: /Taller/ }))
    expect(screen.getByText('Parejas que Crecen')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir taller/ })).toHaveAttribute('href', '/talleres/parejas')
  })
})

describe('PanelNodo — Resumen', () => {
  it('lists each problem with its fix', async () => {
    renderPanel()
    expect(screen.getByText('Este equipo no tiene responsable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Asignar en Servidores' })).toHaveAttribute(
      'href',
      '/admin/dream-team/servidores?equipo=eq-pp',
    )
    expect(screen.getByText('1 rol activo que nadie tiene')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Ver roles' }))
    expect(screen.getByRole('tab', { name: /Roles/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows the people of the branch with a link to Mi equipo', () => {
    renderPanel()
    expect(screen.getByRole('link', { name: /Ver su gente en Mi equipo/ })).toHaveAttribute(
      'href',
      '/dream-team/mi-equipo?direccion=dir-conexion',
    )
  })

  it('opens a subequipo from its row', async () => {
    const { props } = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir Bienvenida' }))
    expect(props.onAbrirNodo).toHaveBeenCalledWith('eq-bienvenida')
  })
})

describe('PanelNodo — permissions', () => {
  it('gives whoever manages the structure the quick actions and the editors', async () => {
    renderPanel()
    expect(screen.getByRole('button', { name: 'Subequipo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Renombrar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /Roles/ }))
    expect(screen.getByRole('switch', { name: 'Rol Coordinador' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('combobox', { name: 'Nivel del rol Coordinador' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nombre del rol nuevo' })).toBeInTheDocument()
  })

  it('lets a director read without any editor', async () => {
    renderPanel({ puedeEditar: false })
    expect(screen.queryByRole('button', { name: 'Subequipo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Renombrar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Asignar en Servidores' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /Roles/ }))
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getAllByText('Coordinador').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('tab', { name: /Turnos/ }))
    expect(screen.getByText('Domingo 9:00')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar turnos/ })).not.toBeInTheDocument()
  })

  it('keeps a Grupos de Vida node read-only even for an admin', () => {
    renderPanel({
      detalle: { ...detalle, id: 'gdv-jov', label: 'Segmento Jóvenes', editable: false, experienciaLabel: 'Grupos de Vida', roles: [] },
      problemas: [],
    })
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Renombrar' })).not.toBeInTheDocument()
    expect(screen.getByText(/se gestiona desde Grupos de Vida/)).toBeInTheDocument()
    expect(screen.getByText('Solo lectura')).toBeInTheDocument()
  })
})

describe('PanelNodo — quick actions', () => {
  it('asks before deactivating, with the focus on Cancelar', async () => {
    const { props } = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar' }))
    const dialogo = await screen.findByRole('alertdialog', { name: 'Desactivar «Punto de Partida»' })
    const cancelar = within(dialogo).getByRole('button', { name: 'Cancelar' })
    await waitFor(() => expect(cancelar).toHaveFocus())

    await userEvent.click(cancelar)
    expect(cambiarActivoEquipo).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Desactivar' }))
    const otra = await screen.findByRole('alertdialog', { name: 'Desactivar «Punto de Partida»' })
    await userEvent.click(within(otra).getByRole('button', { name: 'Sí, desactivar' }))
    await waitFor(() => expect(cambiarActivoEquipo).toHaveBeenCalledWith({ id: 'eq-pp', activo: false }))
    await waitFor(() => expect(props.onActualizado).toHaveBeenCalled())
    expect(toast.success).toHaveBeenCalledWith('Equipo desactivado.')
  })

  it('activates an inactive team without asking', async () => {
    renderPanel({ detalle: { ...detalle, activo: false }, problemas: ['inactivo'] })
    expect(screen.getByText('Inactivo', { selector: '[data-estado] *' })).toBeInTheDocument()
    // The quick action and the fix of the Inactivo problem.
    const activar = screen.getAllByRole('button', { name: 'Activar' })
    expect(activar).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument()
    await userEvent.click(activar[0])
    await waitFor(() => expect(cambiarActivoEquipo).toHaveBeenCalledWith({ id: 'eq-pp', activo: true }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('creates a subequipo inside the node', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Subequipo' }))
    await userEvent.type(screen.getByLabelText('Nombre del subequipo'), 'Recepción')
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }))
    await waitFor(() => expect(crearEquipo).toHaveBeenCalledWith({ parentEquipoId: 'eq-pp', label: 'Recepción' }))
  })
})

describe('PanelNodo — Roles', () => {
  it('turns a rol off, changes its level and adds one with the suggested level', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('tab', { name: /Roles/ }))

    await userEvent.click(screen.getByRole('switch', { name: 'Rol Coordinador' }))
    await waitFor(() => expect(cambiarActivoRol).toHaveBeenCalledWith({ id: 'rol-coord', activo: false }))

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Nivel del rol Voluntario' }), 'lider')
    await waitFor(() => expect(cambiarNivelRol).toHaveBeenCalledWith({ id: 'rol-vol', nivel: 'lider' }))

    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre del rol nuevo' }), 'Coordinador')
    expect(screen.getByRole('combobox', { name: 'Nivel del rol nuevo' })).toHaveValue('coordinador')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    await waitFor(() =>
      expect(crearRol).toHaveBeenCalledWith({ equipoId: 'eq-pp', label: 'Coordinador', nivel: 'coordinador' }),
    )
  })
})

describe('PanelNodo — Turnos', () => {
  it('shows the inherited shifts and saves an own choice', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('tab', { name: /Turnos/ }))
    expect(screen.getByText(/Heredados del equipo superior/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Editar turnos/ }))
    const semanales = screen.getByRole('group', { name: 'Semanales' })
    expect(screen.getByRole('group', { name: 'Por fechas' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Heredar del superior' })).not.toBeInTheDocument()

    await userEvent.click(within(semanales).getByRole('checkbox', { name: /Domingo 11:00/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar turnos' }))
    await waitFor(() => expect(guardarTurnosEquipo).toHaveBeenCalledWith({ equipoId: 'eq-pp', turnoIds: ['t-dom9'] }))
  })

  it('goes back to inheriting from its own choice', async () => {
    renderPanel({ turnos: { turnos, campusId: 'c1', propios: ['t-dom9'], efectivos: ['t-dom9'] } })
    await userEvent.click(screen.getByRole('tab', { name: /Turnos/ }))
    expect(screen.getByText(/Elegidos para este equipo/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Editar turnos/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Heredar del superior' }))
    await waitFor(() => expect(guardarTurnosEquipo).toHaveBeenCalledWith({ equipoId: 'eq-pp', turnoIds: [] }))
  })

  it('jumps from the Sin turno problem to editing the shifts', async () => {
    renderPanel({ problemas: ['sin_turno'], turnos: { turnos, campusId: 'c1', propios: [], efectivos: [] } })
    await userEvent.click(screen.getByRole('button', { name: 'Elegir turnos' }))
    expect(screen.getByRole('tab', { name: /Turnos/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('group', { name: 'Semanales' })).toBeInTheDocument()
  })
})
