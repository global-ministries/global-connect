/**
 * FormularioSegmento — the create and edit form of a segment. The table has no
 * description column, so the form only asks for the name and sends only it.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import GestionSegmentosModales from '@/components/grupos/FormularioSegmento.client'

const crearSegmento = jest.fn()
const editarSegmento = jest.fn()
jest.mock('@/lib/actions/segmentos.actions', () => ({
  crearSegmento: (...a: unknown[]) => crearSegmento(...a),
  editarSegmento: (...a: unknown[]) => editarSegmento(...a),
  eliminarSegmento: jest.fn(),
}))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))

beforeEach(() => {
  jest.clearAllMocks()
  crearSegmento.mockResolvedValue({ success: true })
  editarSegmento.mockResolvedValue({ success: true })
})

describe('FormularioSegmento', () => {
  it('asks only for the name and creates the segment sending only it', async () => {
    render(<GestionSegmentosModales segmentos={[]} trigger="boton" />)
    await userEvent.click(screen.getByRole('button', { name: /Crear Segmento/ }))

    expect(screen.queryByLabelText(/Descripción/)).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: /Nombre/ }), '  Jóvenes ')
    await userEvent.click(screen.getAllByRole('button', { name: 'Crear Segmento' }).at(-1) as HTMLElement) // the submit button

    await waitFor(() => expect(crearSegmento).toHaveBeenCalledWith({ nombre: 'Jóvenes' }))
  })

  it('edits the segment sending only the name', async () => {
    const segmento = { id: 'seg-1', nombre: 'Matrimonios' }
    render(<GestionSegmentosModales segmentos={[segmento]} trigger="editar" segmentoEditar={segmento} />)
    await userEvent.click(screen.getByRole('button', { name: /Editar/ }))

    expect(screen.queryByLabelText(/Descripción/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar Cambios' }))

    await waitFor(() => expect(editarSegmento).toHaveBeenCalledWith('seg-1', { nombre: 'Matrimonios' }))
  })
})
