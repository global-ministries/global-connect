/**
 * `<PanelNodo>` per-node management (odd/tasks/dream-team-estructura-correcciones.md,
 * T3, S4, S5): whoever directs the equipo or one above it gets the quick
 * actions Subequipo · Renombrar · Desactivar (puedeGestionar), and «Mover a…»
 * when they also direct its current parent (`mover`). Roles and turnos keep
 * their own gate (puedeEditar, org.manage).
 *
 * jsdom has no matchMedia, so `DetalleResponsivo` renders the desktop side panel.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PanelNodo, type PanelNodoProps } from '@/components/dream-team/estructura/panel-nodo'
import { crearEquipo, moverEquipo } from '@/app/(auth)/admin/dream-team/estructura/actions'
import type { DetalleEquipo } from '@/lib/platform/dream-team/estructura-vista'

jest.mock('@/app/(auth)/admin/dream-team/estructura/actions', () => ({
  crearEquipo: jest.fn(),
  renombrarEquipo: jest.fn(),
  cambiarActivoEquipo: jest.fn(),
  moverEquipo: jest.fn(),
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

const detalle: DetalleEquipo = {
  id: 'eq-baut',
  label: 'Bautizos',
  ruta: ['Dirección de Experiencia', 'DPS', 'Bautizos'],
  experienciaLabel: 'DPS',
  activo: true,
  editable: true,
  responsable: null,
  personasRama: 12,
  esRama: true,
  taller: null,
  hijos: [],
  roles: [{ id: 'rol-vol', label: 'Voluntario', labelOriginal: 'Voluntario', nivel: 'voluntario', activo: true, uso: 12 }],
}

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }

const MOVER: NonNullable<PanelNodoProps['mover']> = {
  origen: 'DPS',
  subequipos: 2,
  destinos: [{ id: 'eq-con', label: 'Dirección de Conexión', ruta: ['Dirección de Conexión'], profundidad: 0 }],
}

function renderPanel(props: Partial<PanelNodoProps> = {}) {
  const base: PanelNodoProps = {
    abierto: true,
    onCambioAbierto: jest.fn(),
    detalle,
    direccionId: 'dir-exp',
    problemas: [],
    puedeEditar: false,
    onAbrirNodo: jest.fn(),
    onActualizado: jest.fn(),
    toast: toast as never,
  }
  const todas = { ...base, ...props }
  return { ...render(<PanelNodo {...todas} />), props: todas }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(crearEquipo).mockResolvedValue({ ok: true } as never)
  jest.mocked(moverEquipo).mockResolvedValue({ ok: true } as never)
})

describe('PanelNodo — a director of the branch (no org.manage)', () => {
  it('gets Subequipo · Renombrar · Desactivar and «Mover a…», but no rol editor', async () => {
    renderPanel({ puedeGestionar: true, mover: MOVER })
    const panel = screen.getByRole('dialog', { name: 'Bautizos' })
    for (const accion of ['Subequipo', 'Renombrar', 'Desactivar', 'Mover a…']) {
      expect(within(panel).getByRole('button', { name: accion })).toBeInTheDocument()
    }
    await userEvent.click(within(panel).getByRole('tab', { name: /Roles/ }))
    expect(screen.queryByRole('form', { name: 'Agregar rol' })).not.toBeInTheDocument()
  })

  it('creates a subequipo under this equipo', async () => {
    renderPanel({ puedeGestionar: true })
    await userEvent.click(screen.getByRole('button', { name: 'Subequipo' }))
    await userEvent.type(screen.getByLabelText('Nombre del subequipo'), 'Recepción')
    await userEvent.click(screen.getByRole('button', { name: 'Crear' }))
    await waitFor(() => expect(crearEquipo).toHaveBeenCalledWith({ parentEquipoId: 'eq-baut', label: 'Recepción' }))
  })

  it('opens «Mover a…» with the destinations and moves after confirming', async () => {
    const { props } = renderPanel({ puedeGestionar: true, mover: MOVER })
    await userEvent.click(screen.getByRole('button', { name: 'Mover a…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dirección de Conexión' }))
    expect(screen.getByText('Pasará de «DPS» a «Dirección de Conexión».')).toBeInTheDocument()
    expect(screen.getByText('Con él se mueven 2 subequipos y 12 personas; todos siguen en sus equipos con sus roles.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sí, mover' }))
    await waitFor(() => expect(moverEquipo).toHaveBeenCalledWith({ id: 'eq-baut', nuevoPadreId: 'eq-con' }))
    await waitFor(() => expect(props.onActualizado).toHaveBeenCalled())
  })

  it('has no «Mover a…» without authority over the current parent', () => {
    renderPanel({ puedeGestionar: true })
    expect(screen.getByRole('button', { name: 'Renombrar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mover a…' })).not.toBeInTheDocument()
  })
})

describe('PanelNodo — no authority', () => {
  it('a reader without puedeGestionar nor puedeEditar gets no quick action', () => {
    renderPanel({ puedeGestionar: false, mover: MOVER })
    for (const accion of ['Subequipo', 'Renombrar', 'Desactivar', 'Mover a…']) {
      expect(screen.queryByRole('button', { name: accion })).not.toBeInTheDocument()
    }
  })

  it('a Grupos de Vida node stays read-only even for whoever manages', () => {
    renderPanel({ puedeGestionar: true, mover: MOVER, detalle: { ...detalle, editable: false } })
    expect(screen.queryByRole('button', { name: 'Mover a…' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Renombrar' })).not.toBeInTheDocument()
  })
})

// T7 (B2): the DPS anchors (DPS, Global Music, Producción Creativa, Productores,
// Cantantes) are resolved by label and parent; the RPCs refuse renaming, moving
// and deactivating them, so the panel does not offer it.
describe('PanelNodo — a DPS anchor', () => {
  it('keeps «+ Subequipo» but offers neither Renombrar, Desactivar nor «Mover a…»', () => {
    renderPanel({ puedeGestionar: true, mover: MOVER, esAnclaDps: true, detalle: { ...detalle, id: 'eq-dps', label: 'DPS' } })
    const panel = screen.getByRole('dialog', { name: 'DPS' })
    expect(within(panel).getByRole('button', { name: 'Subequipo' })).toBeInTheDocument()
    for (const accion of ['Renombrar', 'Desactivar', 'Mover a…']) {
      expect(within(panel).queryByRole('button', { name: accion })).not.toBeInTheDocument()
    }
  })

  it('an ordinary equipo keeps all four', () => {
    renderPanel({ puedeGestionar: true, mover: MOVER, esAnclaDps: false })
    for (const accion of ['Subequipo', 'Renombrar', 'Desactivar', 'Mover a…']) {
      expect(screen.getByRole('button', { name: accion })).toBeInTheDocument()
    }
  })
})

describe('PanelNodo — org.manage as before', () => {
  it('without puedeGestionar, puedeEditar still gives the quick actions', () => {
    renderPanel({ puedeEditar: true })
    expect(screen.getByRole('button', { name: 'Subequipo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeInTheDocument()
  })
})
