/**
 * @jest-environment jsdom
 *
 * T7 hardening (odd/tasks/talleres-temporadas-y-ediciones.md, item 5,
 * 20260928140000_talleres_paso6_hardening.sql) — `CrearTallerAbstractoForm`
 * asks for "Régimen" (temporada|cadencia) instead of the old technical
 * "Modalidad default" (periodo_general|permanente_custom), and sends BOTH
 * `regimen` (which wins server-side) and a `modalidad_default` derived 1:1
 * from it, so `create_taller_abstract`'s `regimen` column stops silently
 * falling back to its own column default (see the RPC's own T7 hardening
 * fix, 20260928140000_talleres_paso6_hardening.sql).
 */

import { fireEvent, render, screen } from '@testing-library/react'

const createTallerAbstractMock = jest.fn()
const refreshMock = jest.fn()
const successMock = jest.fn()
const errorMock = jest.fn()

jest.mock('@/app/(auth)/admin/talleres/abstracto/nuevo/actions', () => ({
  createTallerAbstract: (...args: unknown[]) => createTallerAbstractMock(...args),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}))

jest.mock('@/hooks/use-notificaciones', () => ({
  useNotificaciones: () => ({ success: successMock, error: errorMock, info: jest.fn() }),
}))

import { CrearTallerAbstractoForm } from '@/components/talleres/crear-taller-form'
import type { OpcionesEquipoTaller } from '@/lib/platform/talleres/equipo-organigrama'

function baseOpciones(): OpcionesEquipoTaller {
  return {
    vincular: [{ id: 'equipo-1', ruta: 'Conexión › Nodo Libre' }],
    crearBajo: [{ id: 'padre-1', ruta: 'Conexión' }],
  }
}

beforeEach(() => {
  createTallerAbstractMock.mockReset()
  refreshMock.mockReset()
  successMock.mockReset()
  errorMock.mockReset()
})

function abrirYCompletarNombreYEquipo(): void {
  fireEvent.click(screen.getByRole('button', { name: /crear grupo de corto plazo/i }))
  fireEvent.change(screen.getByLabelText(/^nombre/i), { target: { value: 'Matrimonio sobre la Roca' } })
  fireEvent.change(screen.getByLabelText(/^equipo/i), { target: { value: 'equipo-1' } })
}

describe('CrearTallerAbstractoForm — régimen', () => {
  it('renders a "Régimen" select, not the old "Modalidad default"', () => {
    render(<CrearTallerAbstractoForm opciones={baseOpciones()} />)
    fireEvent.click(screen.getByRole('button', { name: /crear grupo de corto plazo/i }))

    expect(screen.getByLabelText(/^régimen$/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/modalidad default/i)).not.toBeInTheDocument()
  })

  it('defaults to "Por temporada de la dirección" and sends regimen=temporada + modalidad_default=periodo_general', async () => {
    createTallerAbstractMock.mockResolvedValue({ ok: true, tallerId: 't-1', slug: 'matrimonio-sobre-la-roca' })
    render(<CrearTallerAbstractoForm opciones={baseOpciones()} />)
    abrirYCompletarNombreYEquipo()

    fireEvent.click(screen.getByRole('button', { name: /^crear taller$/i }))

    expect(createTallerAbstractMock).toHaveBeenCalledTimes(1)
    const input = createTallerAbstractMock.mock.calls[0]?.[0]
    expect(input.regimen).toBe('temporada')
    expect(input.modalidad_default).toBe('periodo_general')
  })

  it('switching to "Por cadencia propia" sends regimen=cadencia + modalidad_default=permanente_custom', async () => {
    createTallerAbstractMock.mockResolvedValue({ ok: true, tallerId: 't-1', slug: 'proximo-paso' })
    render(<CrearTallerAbstractoForm opciones={baseOpciones()} />)
    abrirYCompletarNombreYEquipo()

    fireEvent.change(screen.getByLabelText(/^régimen$/i), { target: { value: 'cadencia' } })
    fireEvent.click(screen.getByRole('button', { name: /^crear taller$/i }))

    expect(createTallerAbstractMock).toHaveBeenCalledTimes(1)
    const input = createTallerAbstractMock.mock.calls[0]?.[0]
    expect(input.regimen).toBe('cadencia')
    expect(input.modalidad_default).toBe('permanente_custom')
  })

  it('resets régimen to temporada after a successful create', async () => {
    createTallerAbstractMock.mockResolvedValue({ ok: true, tallerId: 't-1', slug: 'proximo-paso' })
    render(<CrearTallerAbstractoForm opciones={baseOpciones()} />)
    abrirYCompletarNombreYEquipo()
    fireEvent.change(screen.getByLabelText(/^régimen$/i), { target: { value: 'cadencia' } })
    fireEvent.click(screen.getByRole('button', { name: /^crear taller$/i }))

    await screen.findByRole('button', { name: /crear grupo de corto plazo/i })

    fireEvent.click(screen.getByRole('button', { name: /crear grupo de corto plazo/i }))
    expect(screen.getByLabelText(/^régimen$/i)).toHaveValue('temporada')
  })
})
