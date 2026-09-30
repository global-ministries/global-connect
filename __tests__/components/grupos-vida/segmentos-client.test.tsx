/**
 * `<SegmentosClient>` — island of /grupos-vida/segmentos.
 *
 * The view model has its own suite; here: what each row shows (name, three
 * metrics, the "sin director" badge only when there is one), the actions
 * ("Editar", "Directores" and the icon-only "Más acciones" menu with the single
 * destructive item), who sees them, and the deletion flow: a segment with
 * anything attached shows an inline message with "Entendido" and never calls
 * the server action; a segment with nothing attached keeps the confirmation.
 */
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { SegmentosClient } from '@/components/grupos-vida/segmentos/segmentos-client'
import { construirVistaSegmentos, type EntradaVistaSegmentos } from '@/lib/platform/grupos-vida/segmentos-vista'

const crearSegmento = jest.fn()
const editarSegmento = jest.fn()
const eliminarSegmento = jest.fn()
jest.mock('@/lib/actions/segmentos.actions', () => ({
  crearSegmento: (...a: unknown[]) => crearSegmento(...a),
  editarSegmento: (...a: unknown[]) => editarSegmento(...a),
  eliminarSegmento: (...a: unknown[]) => eliminarSegmento(...a),
}))

const toast = { success: jest.fn(), error: jest.fn(), info: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => toast }))

const MAT = 'seg-mat'
const NUEVO = 'seg-nuevo'
const HOMBRES = 'seg-hombres'

const grupo = (id: string, segmentoId: string, extra: Record<string, unknown> = {}) => ({
  id,
  segmentoId,
  activo: true,
  eliminado: false,
  estadoAprobacion: 'aprobado',
  ...extra,
})

function vista() {
  const entrada: EntradaVistaSegmentos = {
    segmentos: [
      { id: MAT, nombre: 'Matrimonios' },
      { id: NUEVO, nombre: 'Nuevo' },
      { id: HOMBRES, nombre: 'Hombre +36' },
    ],
    grupos: [
      grupo('g1', MAT),
      grupo('g2', MAT),
      grupo('g3', MAT, { activo: false, estadoAprobacion: 'pendiente' }),
      grupo('g4', HOMBRES),
    ],
    lideres: [
      { id: 'sl-1', segmentoId: MAT, tipoLider: 'director_etapa' },
      { id: 'sl-2', segmentoId: MAT, tipoLider: 'director_etapa' },
    ],
    enlaces: [
      { directorId: 'sl-1', grupoId: 'g1' },
      { directorId: 'sl-2', grupoId: 'g2' },
    ],
    directoresGenerales: [],
  }
  return construirVistaSegmentos(entrada)
}

const filaDe = (nombre: string) => screen.getByRole('article', { name: nombre })
const menuDe = (nombre: string) => screen.getByRole('button', { name: `Más acciones de ${nombre}` })

beforeEach(() => {
  eliminarSegmento.mockReset().mockResolvedValue({ success: true })
  crearSegmento.mockReset()
  editarSegmento.mockReset()
  Object.values(toast).forEach((f) => f.mockReset())
})

describe('SegmentosClient — rows', () => {
  it('shows the name and the three metrics of each segment', () => {
    render(<SegmentosClient vista={vista()} puedeGestionar />)
    const fila = filaDe('Matrimonios')
    expect(within(fila).getByRole('heading', { name: 'Matrimonios' })).toBeInTheDocument()
    expect(within(fila).getByText('2 directores')).toBeInTheDocument()
    expect(within(fila).getByText('2 grupos activos')).toBeInTheDocument()
    expect(within(fila).getByText('1 pendiente')).toBeInTheDocument()
  })

  it('shows the "sin director" badge only for a segment with active groups without director', () => {
    render(<SegmentosClient vista={vista()} puedeGestionar />)
    expect(within(filaDe('Hombre +36')).getByText('1 sin director')).toBeInTheDocument()
    expect(within(filaDe('Matrimonios')).queryByText(/sin director/)).not.toBeInTheDocument()
    expect(within(filaDe('Nuevo')).queryByText(/sin director/)).not.toBeInTheDocument()
  })

  it('links "Directores" to the directors screen of that segment', () => {
    render(<SegmentosClient vista={vista()} puedeGestionar />)
    expect(within(filaDe('Matrimonios')).getByRole('link', { name: 'Directores' })).toHaveAttribute(
      'href',
      `/grupos-vida/segmentos/${MAT}/directores`,
    )
  })

  it('shows the computed footer', () => {
    render(<SegmentosClient vista={vista()} puedeGestionar />)
    expect(screen.getByText('3 segmentos · 2 directores de etapa · 3 grupos activos')).toBeInTheDocument()
  })
})

describe('SegmentosClient — who sees the actions', () => {
  it('gives an admin "Editar" and a 44px icon-only "Más acciones" button per row', () => {
    render(<SegmentosClient vista={vista()} puedeGestionar />)
    expect(within(filaDe('Matrimonios')).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(menuDe('Matrimonios')).toHaveClass('h-11', 'w-11')
    expect(menuDe('Matrimonios')).toHaveTextContent('')
    expect(screen.getAllByRole('button', { name: /^Más acciones de / })).toHaveLength(3)
  })

  it('gives everyone else only the "Directores" link', () => {
    render(<SegmentosClient vista={vista()} puedeGestionar={false} />)
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Más acciones de / })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Directores' })).toHaveLength(3)
  })
})

describe('SegmentosClient — deleting', () => {
  it('offers only "Eliminar segmento" in the menu', async () => {
    render(<SegmentosClient vista={vista()} puedeGestionar />)
    await userEvent.click(menuDe('Matrimonios'))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Eliminar segmento'])
  })

  it('explains inline why a segment with groups cannot be deleted, without calling the action', async () => {
    render(<SegmentosClient vista={vista()} puedeGestionar />)
    await userEvent.click(menuDe('Matrimonios'))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Eliminar segmento' }))

    const aviso = within(filaDe('Matrimonios')).getByRole('status')
    expect(aviso).toHaveTextContent('No se puede eliminar Matrimonios: tiene 2 grupos activos, 1 otro grupo y 2 líderes asignados.')
    expect(screen.queryByText(/Esta acción no se puede deshacer/)).not.toBeInTheDocument()
    expect(eliminarSegmento).not.toHaveBeenCalled()

    await userEvent.click(within(aviso).getByRole('button', { name: 'Entendido' }))
    expect(within(filaDe('Matrimonios')).queryByRole('status')).not.toBeInTheDocument()
    expect(eliminarSegmento).not.toHaveBeenCalled()
  })

  it('keeps the confirmation and the delete for a segment with nothing attached', async () => {
    render(<SegmentosClient vista={vista()} puedeGestionar />)
    await userEvent.click(menuDe('Nuevo'))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Eliminar segmento' }))

    expect(within(filaDe('Nuevo')).queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText(/Esta acción no se puede deshacer/)).toBeInTheDocument()
    expect(eliminarSegmento).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(eliminarSegmento).toHaveBeenCalledWith(NUEVO)
    expect(toast.success).toHaveBeenCalledWith('Segmento eliminado')
  })

  it('shows the message of the server when it refuses', async () => {
    eliminarSegmento.mockResolvedValue({ success: false, error: 'No se puede eliminar Nuevo: tiene 1 líder asignado.' })
    render(<SegmentosClient vista={vista()} puedeGestionar />)
    await userEvent.click(menuDe('Nuevo'))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Eliminar segmento' }))
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(toast.error).toHaveBeenCalledWith('No se puede eliminar Nuevo: tiene 1 líder asignado.')
  })

  it('cancels the confirmation without deleting', async () => {
    render(<SegmentosClient vista={vista()} puedeGestionar />)
    await userEvent.click(menuDe('Nuevo'))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Eliminar segmento' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText(/Esta acción no se puede deshacer/)).not.toBeInTheDocument()
    expect(eliminarSegmento).not.toHaveBeenCalled()
  })
})

describe('SegmentosClient — editing', () => {
  it('opens the edit form with the name of the segment', async () => {
    render(<SegmentosClient vista={vista()} puedeGestionar />)
    await userEvent.click(within(filaDe('Matrimonios')).getByRole('button', { name: 'Editar' }))
    expect(screen.getByText('Editar Segmento')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Matrimonios')
  })
})
