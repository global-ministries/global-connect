/**
 * T2d (odd/tasks/proximo-paso.md, S3 / L11) — the code step waits for a code:
 * six digit boxes, paste or autofill fills them all, and the code is sent on
 * its own once the six digits are there, never twice.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { PasoCodigo } from '@/components/proximo-paso/paso-codigo'

const confirmarCodigoProximoPaso = jest.fn()
const reenviarCodigoProximoPaso = jest.fn()

jest.mock('@/app/proximo-paso/actions', () => ({
  confirmarCodigoProximoPaso: (...a: unknown[]) => confirmarCodigoProximoPaso(...a),
  reenviarCodigoProximoPaso: (...a: unknown[]) => reenviarCodigoProximoPaso(...a),
}))

const RESUMEN = { id: 'ed-dic', nombre: 'Diciembre 2026', fechaInicio: '2026-12-06' }
const INVALIDO = 'Ese código no funcionó. Usa el código del correo más reciente: cuando pides uno nuevo, los anteriores dejan de servir.'
const onInscrito = jest.fn()
const onSesionAbierta = jest.fn()

function renderPaso() {
  render(
    <PasoCodigo email="ana@example.com" edicion={RESUMEN} onInscrito={onInscrito} onSesionAbierta={onSesionAbierta} onCambiarCorreo={jest.fn()} />,
  )
  const grupo = screen.getByRole('group', { name: 'Código de 6 dígitos' })
  return within(grupo).getAllByRole('textbox') as HTMLInputElement[]
}

const valores = (cajas: HTMLInputElement[]) => cajas.map((c) => c.value).join('')
const pegar = (caja: HTMLInputElement, texto: string) => fireEvent.paste(caja, { clipboardData: { getData: () => texto } })

/** A promise the test resolves when it wants. */
function pendiente<T>() {
  let resolver!: (v: T) => void
  const promesa = new Promise<T>((r) => (resolver = r))
  return { promesa, resolver }
}

beforeEach(() => jest.clearAllMocks())

describe('PasoCodigo', () => {
  it('shows six numeric boxes, the first one ready for the one-time-code autofill', () => {
    const cajas = renderPaso()

    expect(cajas).toHaveLength(6)
    cajas.forEach((c, i) => {
      expect(c).toHaveAttribute('inputmode', 'numeric')
      expect(c).toHaveAccessibleName(`Dígito ${i + 1} de 6`)
    })
    expect(cajas[0]).toHaveAttribute('autocomplete', 'one-time-code')
    cajas.slice(1).forEach((c) => expect(c).toHaveAttribute('autocomplete', 'off'))
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument()
  })

  it.each(['717988', '717 988'])('fills every box from a paste of %j in any box and sends it once', async (texto) => {
    confirmarCodigoProximoPaso.mockResolvedValue({ ok: true, estado: 'inscrito', edicion: RESUMEN })
    const cajas = renderPaso()

    pegar(cajas[3], texto)

    expect(valores(cajas)).toBe('717988')
    await waitFor(() => expect(onInscrito).toHaveBeenCalledWith({ ok: true, estado: 'inscrito', edicion: RESUMEN }))
    expect(confirmarCodigoProximoPaso).toHaveBeenCalledTimes(1)
    expect(confirmarCodigoProximoPaso).toHaveBeenCalledWith({ email: 'ana@example.com', token: '717988', edicionId: 'ed-dic' })
  })

  it('fills every box when the autofill writes the whole code in the first one', async () => {
    confirmarCodigoProximoPaso.mockResolvedValue({ ok: true, estado: 'inscrito', edicion: RESUMEN })
    const cajas = renderPaso()

    fireEvent.change(cajas[0], { target: { value: '123456' } })

    expect(valores(cajas)).toBe('123456')
    await waitFor(() => expect(confirmarCodigoProximoPaso).toHaveBeenCalledTimes(1))
  })

  it('moves to the next box on each digit and sends the code once the sixth is typed', async () => {
    confirmarCodigoProximoPaso.mockResolvedValue({ ok: true, estado: 'inscrito', edicion: RESUMEN })
    const cajas = renderPaso()

    '12345'.split('').forEach((d, i) => {
      fireEvent.change(cajas[i], { target: { value: d } })
      expect(cajas[i + 1]).toHaveFocus()
    })
    expect(confirmarCodigoProximoPaso).not.toHaveBeenCalled()
    fireEvent.change(cajas[5], { target: { value: '6' } })

    await waitFor(() => expect(confirmarCodigoProximoPaso).toHaveBeenCalledTimes(1))
    expect(confirmarCodigoProximoPaso).toHaveBeenCalledWith({ email: 'ana@example.com', token: '123456', edicionId: 'ed-dic' })
  })

  it('ignores letters', () => {
    const cajas = renderPaso()
    act(() => cajas[0].focus())

    fireEvent.change(cajas[0], { target: { value: 'a' } })

    expect(cajas[0]).toHaveValue('')
    expect(cajas[0]).toHaveFocus()
  })

  it('shows «Revisando tu código…» with the boxes locked and never sends twice while it checks', async () => {
    const respuesta = pendiente<unknown>()
    confirmarCodigoProximoPaso.mockReturnValue(respuesta.promesa)
    const cajas = renderPaso()

    pegar(cajas[0], '123456')

    expect(await screen.findByText('Revisando tu código…')).toBeInTheDocument()
    cajas.forEach((c) => expect(c).toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }))
    fireEvent.submit(cajas[0].closest('form') as HTMLFormElement)
    pegar(cajas[2], '123456')
    expect(confirmarCodigoProximoPaso).toHaveBeenCalledTimes(1)

    await act(async () => respuesta.resolver({ ok: true, estado: 'inscrito', edicion: RESUMEN }))
    expect(confirmarCodigoProximoPaso).toHaveBeenCalledTimes(1)
  })

  it('clears the boxes, focuses the first and asks for the newest email on a wrong code', async () => {
    confirmarCodigoProximoPaso.mockResolvedValue({ ok: false, error: 'CODIGO_INVALIDO', message: INVALIDO })
    const cajas = renderPaso()

    pegar(cajas[0], '000000')

    expect(await screen.findByRole('alert')).toHaveTextContent(INVALIDO)
    expect(valores(cajas)).toBe('')
    cajas.forEach((c) => expect(c).toBeEnabled())
    await waitFor(() => expect(cajas[0]).toHaveFocus())
  })

  it('keeps the code for another try when the server could not check it', async () => {
    const message = 'No pudimos revisar tu código en este momento. Espera unos segundos y vuelve a intentarlo.'
    confirmarCodigoProximoPaso.mockResolvedValueOnce({ ok: false, error: 'internal', message })
    confirmarCodigoProximoPaso.mockResolvedValueOnce({ ok: true, estado: 'inscrito', edicion: RESUMEN })
    const cajas = renderPaso()

    pegar(cajas[0], '123456')
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(valores(cajas)).toBe('123456')

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(onInscrito).toHaveBeenCalled())
    expect(confirmarCodigoProximoPaso).toHaveBeenCalledTimes(2)
  })

  it('asks for the 6 digits on «Confirmar» without calling the server', async () => {
    const cajas = renderPaso()

    fireEvent.change(cajas[0], { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe los 6 dígitos del código.')
    expect(confirmarCodigoProximoPaso).not.toHaveBeenCalled()
  })

  it('goes back and clears the previous box on Backspace in an empty box', () => {
    const cajas = renderPaso()
    fireEvent.change(cajas[0], { target: { value: '1' } })
    fireEvent.change(cajas[1], { target: { value: '2' } })
    expect(cajas[2]).toHaveFocus()

    fireEvent.keyDown(cajas[2], { key: 'Backspace' })

    expect(cajas[1]).toHaveFocus()
    expect(valores(cajas)).toBe('1')
  })

  it('moves between the boxes with the arrow keys', () => {
    const cajas = renderPaso()
    act(() => cajas[2].focus())

    fireEvent.keyDown(cajas[2], { key: 'ArrowLeft' })
    expect(cajas[1]).toHaveFocus()
    fireEvent.keyDown(cajas[1], { key: 'ArrowRight' })
    expect(cajas[2]).toHaveFocus()
    act(() => cajas[0].focus())
    fireEvent.keyDown(cajas[0], { key: 'ArrowLeft' })
    expect(cajas[0]).toHaveFocus()
    act(() => cajas[5].focus())
    fireEvent.keyDown(cajas[5], { key: 'ArrowRight' })
    expect(cajas[5]).toHaveFocus()
  })

  it('says to use only the newest email after a resend', async () => {
    jest.useFakeTimers()
    try {
      reenviarCodigoProximoPaso.mockResolvedValue({ ok: true, message: 'Te enviamos un código nuevo. Usa solo el de este último correo.' })
      renderPaso()

      act(() => jest.advanceTimersByTime(60_000))
      fireEvent.click(screen.getByRole('button', { name: 'Reenviar código' }))

      expect(await screen.findByText('Te enviamos un código nuevo. Usa solo el de este último correo.')).toBeInTheDocument()
    } finally {
      jest.useRealTimers()
    }
  })
})
