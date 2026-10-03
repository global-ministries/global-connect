/**
 * @jest-environment jsdom
 *
 * Inscripción en pareja (odd/tasks/talleres-inscripcion-en-pareja.md P2) —
 * the partner picker that replaces the leaders-only SelectLeaderModal in
 * Explorar. Real DOM interaction (jsdom) with the three Explorar server
 * actions mocked:
 *
 *   - matrimonio: the registered spouse is offered first, with "No es mi
 *     cónyuge actual" falling back to the cédula search;
 *   - novios, or no registered spouse: straight to the cédula search, which
 *     only shows the masked name and asks for confirmation;
 *   - an edición without vínculo asks "¿Se inscriben como matrimonio o como
 *     novios?" first and forwards the answer.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const inscribirseMock = jest.fn()
const conyugeMock = jest.fn()
const buscarMock = jest.fn()

jest.mock('@/app/(auth)/talleres/explorar/actions', () => ({
  inscribirseATaller: (...args: unknown[]) => inscribirseMock(...args),
  miConyugeRegistrado: (...args: unknown[]) => conyugeMock(...args),
  buscarParejaPorCedula: (...args: unknown[]) => buscarMock(...args),
}))

import { SelectorPareja } from '@/components/talleres/selector-pareja'

const NO_CONFIRMADA =
  'No pudimos confirmar a tu pareja con esos datos. Revisa la cédula o pide ayuda a la coordinación del taller.'

const onCerrar = jest.fn()
const onInscrito = jest.fn()

function renderSelector(vinculoEdicion: 'matrimonio' | 'novios' | null) {
  return render(
    <SelectorPareja
      edicionId="ed-1"
      vinculoEdicion={vinculoEdicion}
      onCerrar={onCerrar}
      onInscrito={onInscrito}
    />,
  )
}

async function buscarCedula(cedula: string) {
  fireEvent.change(await screen.findByLabelText(/cédula de tu pareja/i), { target: { value: cedula } })
  fireEvent.click(screen.getByRole('button', { name: /^buscar$/i }))
}

beforeEach(() => {
  inscribirseMock.mockReset().mockResolvedValue({ ok: true, inscripcionId: 'insc-1' })
  conyugeMock.mockReset().mockResolvedValue({ ok: true, conyuge: null })
  buscarMock.mockReset()
  onCerrar.mockReset()
  onInscrito.mockReset()
})

describe('SelectorPareja — registered spouse first (matrimonio)', () => {
  it('offers the registered spouse by default and enrolls with modo conyuge_registrado', async () => {
    conyugeMock.mockResolvedValue({
      ok: true,
      conyuge: { nombre: 'Ana', apellido: 'García', fotoUrl: null },
    })
    renderSelector('matrimonio')

    expect(await screen.findByText('Ana García')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /no es mi cónyuge actual/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /inscribirnos juntos/i }))

    await waitFor(() =>
      expect(inscribirseMock).toHaveBeenCalledWith({
        edicionId: 'ed-1',
        pareja: { modo: 'conyuge_registrado' },
      }),
    )
    await waitFor(() => expect(onInscrito).toHaveBeenCalledTimes(1))
    expect(buscarMock).not.toHaveBeenCalled()
  })

  it('after "No es mi cónyuge actual", searches by cédula and flags the dismissed spouse', async () => {
    conyugeMock.mockResolvedValue({
      ok: true,
      conyuge: { nombre: 'Ana', apellido: 'García', fotoUrl: null },
    })
    buscarMock.mockResolvedValue({ ok: true, encontrada: true, nombreMostrado: 'María G.' })
    renderSelector('matrimonio')

    fireEvent.click(await screen.findByRole('button', { name: /no es mi cónyuge actual/i }))
    await buscarCedula('V-12.345.678')

    expect(buscarMock).toHaveBeenCalledWith('ed-1', 'V-12.345.678')
    expect(await screen.findByText('María G.')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: /sí, es mi pareja/i }))

    await waitFor(() =>
      expect(inscribirseMock).toHaveBeenCalledWith({
        edicionId: 'ed-1',
        pareja: { modo: 'cedula', cedula: 'V-12.345.678', conyugeDescartado: true },
      }),
    )
    await waitFor(() => expect(onInscrito).toHaveBeenCalledTimes(1))
  })

  it('goes straight to the cédula search when there is no registered spouse, without the dismissed flag', async () => {
    buscarMock.mockResolvedValue({ ok: true, encontrada: true, nombreMostrado: 'María G.' })
    renderSelector('matrimonio')

    await buscarCedula('12345678')
    fireEvent.click(await screen.findByRole('button', { name: /sí, es mi pareja/i }))

    await waitFor(() =>
      expect(inscribirseMock).toHaveBeenCalledWith({
        edicionId: 'ed-1',
        pareja: { modo: 'cedula', cedula: '12345678' },
      }),
    )
    expect(screen.queryByRole('button', { name: /no es mi cónyuge actual/i })).not.toBeInTheDocument()
  })

  it('falls back to the cédula search when the spouse lookup fails', async () => {
    conyugeMock.mockResolvedValue({ ok: false, error: 'internal', message: 'x' })
    renderSelector('matrimonio')
    expect(await screen.findByLabelText(/cédula de tu pareja/i)).toBeInTheDocument()
  })
})

describe('SelectorPareja — cédula search outcomes', () => {
  it('shows the neutral message for a not-found cédula and offers no confirmation', async () => {
    buscarMock.mockResolvedValue({ ok: true, encontrada: false, message: NO_CONFIRMADA })
    renderSelector('novios')

    await buscarCedula('12345678')

    expect(await screen.findByText(NO_CONFIRMADA)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sí, es mi pareja/i })).not.toBeInTheDocument()
    expect(inscribirseMock).not.toHaveBeenCalled()
  })

  it('shows the throttle message when the member ran out of searches', async () => {
    const limite = 'Hiciste demasiadas búsquedas hoy. Prueba mañana o pide ayuda a la coordinación.'
    buscarMock.mockResolvedValue({ ok: false, error: 'LIMITE_ALCANZADO', message: limite })
    renderSelector('novios')

    await buscarCedula('12345678')

    expect(await screen.findByText(limite)).toBeInTheDocument()
    expect(inscribirseMock).not.toHaveBeenCalled()
  })

  it('lets the member search another cédula after a match', async () => {
    buscarMock.mockResolvedValue({ ok: true, encontrada: true, nombreMostrado: 'María G.' })
    renderSelector('novios')

    await buscarCedula('12345678')
    fireEvent.click(await screen.findByRole('button', { name: /buscar otra cédula/i }))

    expect(await screen.findByLabelText(/cédula de tu pareja/i)).toBeInTheDocument()
    expect(screen.queryByText('María G.')).not.toBeInTheDocument()
  })

  it('does not search an empty cédula', async () => {
    renderSelector('novios')
    expect(await screen.findByRole('button', { name: /^buscar$/i })).toBeDisabled()
    expect(buscarMock).not.toHaveBeenCalled()
  })

  it('shows an enrollment failure inside the dialog and keeps it open', async () => {
    buscarMock.mockResolvedValue({ ok: true, encontrada: true, nombreMostrado: 'María G.' })
    inscribirseMock.mockResolvedValue({
      ok: false,
      error: 'PAREJA_NO_CONFIRMADA',
      message: NO_CONFIRMADA,
    })
    renderSelector('novios')

    await buscarCedula('12345678')
    fireEvent.click(await screen.findByRole('button', { name: /sí, es mi pareja/i }))

    expect(await screen.findByText(NO_CONFIRMADA)).toBeInTheDocument()
    expect(onInscrito).not.toHaveBeenCalled()
  })
})

describe('SelectorPareja — vínculo', () => {
  it('novios: never looks up a registered spouse', async () => {
    renderSelector('novios')
    expect(await screen.findByLabelText(/cédula de tu pareja/i)).toBeInTheDocument()
    expect(conyugeMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/se inscriben como matrimonio o como novios/i)).not.toBeInTheDocument()
  })

  it('a fixed vínculo never asks the question', async () => {
    renderSelector('matrimonio')
    await waitFor(() => expect(conyugeMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/se inscriben como matrimonio o como novios/i)).not.toBeInTheDocument()
  })

  it('an open vínculo asks first; "Novios" goes to the cédula search and sends the vínculo', async () => {
    buscarMock.mockResolvedValue({ ok: true, encontrada: true, nombreMostrado: 'María G.' })
    renderSelector(null)

    expect(screen.getByText('¿Se inscriben como matrimonio o como novios?')).toBeInTheDocument()
    expect(conyugeMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^novios$/i }))
    await buscarCedula('12345678')
    fireEvent.click(await screen.findByRole('button', { name: /sí, es mi pareja/i }))

    await waitFor(() =>
      expect(inscribirseMock).toHaveBeenCalledWith({
        edicionId: 'ed-1',
        pareja: { modo: 'cedula', cedula: '12345678', vinculo: 'novios' },
      }),
    )
    expect(conyugeMock).not.toHaveBeenCalled()
  })

  it('an open vínculo answered "Matrimonio" offers the registered spouse and sends the vínculo', async () => {
    conyugeMock.mockResolvedValue({
      ok: true,
      conyuge: { nombre: 'Ana', apellido: 'García', fotoUrl: null },
    })
    renderSelector(null)

    fireEvent.click(screen.getByRole('button', { name: /^matrimonio$/i }))
    fireEvent.click(await screen.findByRole('button', { name: /inscribirnos juntos/i }))

    await waitFor(() =>
      expect(inscribirseMock).toHaveBeenCalledWith({
        edicionId: 'ed-1',
        pareja: { modo: 'conyuge_registrado', vinculo: 'matrimonio' },
      }),
    )
  })
})

describe('SelectorPareja — closing', () => {
  it('"Cancelar" calls onCerrar without enrolling', async () => {
    renderSelector('novios')
    fireEvent.click(await screen.findByRole('button', { name: /cancelar/i }))
    expect(onCerrar).toHaveBeenCalledTimes(1)
    expect(inscribirseMock).not.toHaveBeenCalled()
  })
})
