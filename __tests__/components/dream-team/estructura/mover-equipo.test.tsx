/**
 * `<MoverEquipoDialogo>` — «Mover a…» (odd/tasks/dream-team-estructura-correcciones.md,
 * T3, S5): pick the new equipo above from the ones the viewer manages
 * (searchable by name), confirm with origin, destination and what moves with
 * it, then moverEquipo. A refusal shows the action's Spanish message and
 * keeps the dialog open.
 */
import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { MoverEquipoDialogo, type MoverEquipoDialogoProps } from '@/components/dream-team/estructura/mover-equipo'
import { moverEquipo } from '@/app/(auth)/admin/dream-team/estructura/actions'

jest.mock('@/app/(auth)/admin/dream-team/estructura/actions', () => ({ moverEquipo: jest.fn() }))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }

const DESTINOS: MoverEquipoDialogoProps['destinos'] = [
  { id: 'exp', label: 'Dirección de Experiencia', ruta: ['Dirección de Experiencia'], profundidad: 0 },
  { id: 'pt', label: 'Producción Técnica', ruta: ['Dirección de Experiencia', 'DPS', 'Producción Técnica'], profundidad: 2 },
  { id: 'con', label: 'Dirección de Conexión', ruta: ['Dirección de Conexión'], profundidad: 0 },
]

function renderDialogo(props: Partial<MoverEquipoDialogoProps> = {}) {
  const base: MoverEquipoDialogoProps = {
    equipo: { id: 'baut', label: 'Bautizos', origen: 'DPS', subequipos: 2, personas: 12 },
    destinos: DESTINOS,
    onClose: jest.fn(),
    onHecho: jest.fn(),
    toast: toast as never,
  }
  const todas = { ...base, ...props }
  return { ...render(<MoverEquipoDialogo {...todas} />), props: todas }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(moverEquipo).mockResolvedValue({ ok: true } as never)
})

describe('MoverEquipoDialogo — picker', () => {
  it('lists the destinations with their path and filters them by name, ignoring accents', async () => {
    renderDialogo()
    const dialogo = screen.getByRole('dialog', { name: 'Mover «Bautizos» a…' })
    const lista = within(dialogo).getByRole('list', { name: 'Equipos de destino' })
    expect(within(lista).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Dirección de Experiencia',
      'Producción Técnica, en Dirección de Experiencia › DPS',
      'Dirección de Conexión',
    ])

    await userEvent.type(within(dialogo).getByLabelText('Buscar equipo'), 'conexion')
    expect(within(lista).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Dirección de Conexión'])

    await userEvent.clear(within(dialogo).getByLabelText('Buscar equipo'))
    await userEvent.type(within(dialogo).getByLabelText('Buscar equipo'), 'zzz')
    expect(within(dialogo).getByText('Ningún equipo coincide con «zzz».')).toBeInTheDocument()
  })

  it('says so when there is nowhere the viewer can move it', () => {
    renderDialogo({ destinos: [] })
    expect(screen.getByText('No hay otro equipo que dirijas al que puedas moverlo.')).toBeInTheDocument()
  })

  it('closes with Cancelar without moving', async () => {
    const { props } = renderDialogo()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(props.onClose).toHaveBeenCalled()
    expect(moverEquipo).not.toHaveBeenCalled()
  })
})

describe('MoverEquipoDialogo — confirmation', () => {
  it('names origin, destination and what moves with it, then moves', async () => {
    const { props } = renderDialogo()
    await userEvent.click(screen.getByRole('button', { name: 'Dirección de Conexión' }))

    const dialogo = screen.getByRole('dialog', { name: '¿Mover «Bautizos»?' })
    expect(within(dialogo).getByText('Pasará de «DPS» a «Dirección de Conexión».')).toBeInTheDocument()
    expect(
      within(dialogo).getByText('Con él se mueven 2 subequipos y 12 personas; todos siguen en sus equipos con sus roles.'),
    ).toBeInTheDocument()
    expect(moverEquipo).not.toHaveBeenCalled()

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Sí, mover' }))

    await waitFor(() => expect(moverEquipo).toHaveBeenCalledWith({ id: 'baut', nuevoPadreId: 'con' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('«Bautizos» ahora está en «Dirección de Conexión».'))
    expect(props.onClose).toHaveBeenCalled()
    expect(props.onHecho).toHaveBeenCalled()
  })

  it('goes back to the list with Volver', async () => {
    renderDialogo()
    await userEvent.click(screen.getByRole('button', { name: 'Dirección de Conexión' }))
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.getByRole('dialog', { name: 'Mover «Bautizos» a…' })).toBeInTheDocument()
    expect(moverEquipo).not.toHaveBeenCalled()
  })

  it('shows the Spanish refusal and stays open', async () => {
    const mensaje = 'Para moverlo tienes que dirigir el equipo donde está y el equipo destino (o uno superior a cada uno).'
    jest.mocked(moverEquipo).mockResolvedValue({ ok: false, error: 'forbidden', message: mensaje } as never)
    const { props } = renderDialogo()
    await userEvent.click(screen.getByRole('button', { name: 'Dirección de Conexión' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sí, mover' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(mensaje))
    expect(props.onClose).not.toHaveBeenCalled()
    expect(props.onHecho).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '¿Mover «Bautizos»?' })).toBeInTheDocument()
  })
})
