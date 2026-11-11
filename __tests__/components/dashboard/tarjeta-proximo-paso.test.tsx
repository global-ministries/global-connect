/**
 * T8 (odd/tasks/proximo-paso.md, L22/L24; design/proximo-paso 08–09) — the
 * Próximo Paso card of the home: abiertas (orange, the 4 Sundays, enroll in
 * a dialog without leaving the home), inscrito (reminder with the first
 * class, time and place), sin fecha (soft). Hidden when the person already
 * did Próximo Paso is the section's rule (pantalla-inicio.test.tsx).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { TarjetaProximoPaso } from '@/components/dashboard/tarjeta-proximo-paso'
import type { EdicionProximoPaso } from '@/lib/platform/talleres/proximo-paso-registro'

const inscribirmeEnProximoPaso = jest.fn()
const refresh = jest.fn()

jest.mock('@/app/proximo-paso/actions', () => ({ inscribirmeEnProximoPaso: (...a: unknown[]) => inscribirmeEnProximoPaso(...a) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
jest.mock('@/components/ui/detalle-responsivo', () => ({ useEsEscritorio: () => true }))

const enero: EdicionProximoPaso = {
  id: 'ed-ene',
  nombre: 'Enero 2027',
  fechaInicio: '2027-01-03',
  fechaFin: '2027-01-24',
  cupoRestante: 30,
  clases: [
    { numero: 1, tema: 'Sígueme', fecha: '2027-01-03' },
    { numero: 2, tema: 'Intimidad con Dios', fecha: '2027-01-10' },
    { numero: 3, tema: 'Compañerismo', fecha: '2027-01-17' },
    { numero: 4, tema: 'Influencia', fecha: '2027-01-24' },
  ],
  hora: '10:00',
  lugar: 'Auditorio principal',
  indicaciones: null,
}
const marzo: EdicionProximoPaso = { ...enero, id: 'ed-mar', nombre: 'Marzo 2027', fechaInicio: '2027-03-07', hora: null, lugar: null }
const RESUMEN = { id: 'ed-ene', nombre: 'Enero 2027', fechaInicio: '2027-01-03' }

/** A promise the test resolves when it wants. */
function pendiente<T>() {
  let resolver!: (v: T) => void
  const promesa = new Promise<T>((r) => (resolver = r))
  return { promesa, resolver }
}

beforeEach(() => jest.clearAllMocks())

describe('abiertas', () => {
  const pintar = (disponibles = [enero]) =>
    render(<TarjetaProximoPaso estado={{ variante: 'abiertas', edicion: disponibles[0], disponibles }} hoy="2026-11-11" nombre="Daniela" />)

  it('asks for action with the edición, its cupos, time, place and the 4 Sundays', () => {
    pintar()

    const tarjeta = screen.getByRole('article', { name: 'Próximo Paso · Enero 2027' })
    expect(within(tarjeta).getByText('Inscripciones abiertas')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Quedan 30 cupos')).toBeInTheDocument()
    expect(within(tarjeta).getByText(/Empieza el domingo 3 de enero/)).toBeInTheDocument()
    expect(within(tarjeta).getByText('10:00 a. m.')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Auditorio principal')).toBeInTheDocument()
    expect(within(within(tarjeta).getByRole('list', { name: 'Las 4 clases' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Sígueme'),
      expect.stringContaining('Intimidad con Dios'),
      expect.stringContaining('Compañerismo'),
      expect.stringContaining('Influencia'),
    ])
    expect(within(tarjeta).getByRole('link', { name: 'Qué es Próximo Paso' })).toHaveAttribute('href', '/proximo-paso')
    expect(within(tarjeta).getByRole('button', { name: 'Inscribirme' })).toBeInTheDocument()
  })

  it('enrolls from the dialog, calling the action once, and turns into the inscrito card', async () => {
    const respuesta = pendiente<unknown>()
    inscribirmeEnProximoPaso.mockReturnValue(respuesta.promesa)
    pintar()

    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Inscribirte en Próximo Paso' })
    expect(within(dialogo).getByText('Domingos 3, 10, 17 y 24 de enero')).toBeInTheDocument()
    expect(within(dialogo).getByText(/Te inscribes como Daniela/)).toBeInTheDocument()
    const confirmar = within(dialogo).getByRole('button', { name: 'Confirmar inscripción' })
    fireEvent.click(confirmar)
    fireEvent.click(confirmar)
    await waitFor(() => expect(inscribirmeEnProximoPaso).toHaveBeenCalledTimes(1))
    fireEvent.click(confirmar)
    expect(inscribirmeEnProximoPaso).toHaveBeenCalledWith('ed-ene')

    await act(async () => respuesta.resolver({ ok: true, estado: 'inscrito', edicion: RESUMEN }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Inscripción confirmada')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Inscribirme' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Listo. Estás en Próximo Paso, Enero 2027.')
    expect(refresh).toHaveBeenCalled()
    expect(inscribirmeEnProximoPaso).toHaveBeenCalledTimes(1)
  })

  it('shows the failure inside the dialog and stays', async () => {
    inscribirmeEnProximoPaso.mockResolvedValue({ ok: false, error: 'CUPO_LLENO', message: 'Esta edición ya no tiene cupos disponibles.' })
    pintar()

    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirmar inscripción' }))

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Esta edición ya no tiene cupos disponibles.')
  })

  it('lets the person choose the date in the dialog with several open', async () => {
    inscribirmeEnProximoPaso.mockResolvedValue({ ok: true, estado: 'inscrito', edicion: { id: 'ed-mar', nombre: 'Marzo 2027', fechaInicio: '2027-03-07' } })
    pintar([enero, marzo])

    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.click(within(dialogo).getByRole('radio', { name: /Marzo 2027/ }))
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar inscripción' }))

    await waitFor(() => expect(inscribirmeEnProximoPaso).toHaveBeenCalledWith('ed-mar'))
  })
})

describe('inscrito', () => {
  it('reminds the first class with the days left, time, place, its clases and the calendar', () => {
    render(<TarjetaProximoPaso estado={{ variante: 'inscrito', inscripcion: { estado: 'inscrito', edicion: enero } }} hoy="2026-11-11" nombre="Daniela" />)

    const tarjeta = screen.getByRole('article', { name: 'Próximo Paso · Enero 2027' })
    expect(within(tarjeta).getByText('Inscripción confirmada')).toBeInTheDocument()
    expect(within(tarjeta).getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Faltan 53 días')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Estás inscrito. Tu primera clase es el domingo 3 de enero: Sígueme.')).toBeInTheDocument()
    expect(within(tarjeta).getByText('10:00 a. m.')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Auditorio principal')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Próxima')).toBeInTheDocument()
    expect(within(tarjeta).getByRole('link', { name: 'Ver mis clases' })).toHaveAttribute('href', '/talleres/mi-recorrido')
    expect(within(tarjeta).getByRole('link', { name: 'Agregar al calendario' }).getAttribute('href')).toMatch(/^data:text\/calendar/)
    expect(screen.queryByRole('button', { name: 'Inscribirme' })).not.toBeInTheDocument()
  })

  it('never says confirmed for a pendiente inscripción', () => {
    render(<TarjetaProximoPaso estado={{ variante: 'inscrito', inscripcion: { estado: 'pendiente', edicion: enero } }} hoy="2026-11-11" nombre={null} />)

    expect(screen.getByText('Pendiente de confirmar')).toBeInTheDocument()
    expect(screen.getByText('Recibimos tu inscripción. La coordinación la confirmará. La primera clase es el domingo 3 de enero.')).toBeInTheDocument()
    expect(screen.queryByText('Inscripción confirmada')).not.toBeInTheDocument()
  })

  it('names the next class once the edición started', () => {
    render(<TarjetaProximoPaso estado={{ variante: 'inscrito', inscripcion: { estado: 'inscrito', edicion: enero } }} hoy="2027-01-11" nombre={null} />)

    expect(screen.getByText('Estás inscrito. Tu próxima clase es el domingo 17 de enero: Compañerismo.')).toBeInTheDocument()
    expect(screen.queryByText(/Faltan/)).not.toBeInTheDocument()
  })
})

describe('sin fecha', () => {
  it('is a soft card without a primary action', () => {
    render(<TarjetaProximoPaso estado={{ variante: 'sin-fecha' }} hoy="2026-11-11" nombre="Daniela" />)

    const tarjeta = screen.getByRole('article', { name: 'Próximo Paso' })
    expect(within(tarjeta).getByText('Sin fecha abierta')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Empieza el primer domingo de cada mes. Cuando abramos la próxima fecha, la verás aquí para inscribirte.')).toBeInTheDocument()
    expect(within(tarjeta).getByRole('link', { name: 'Qué es Próximo Paso' })).toHaveAttribute('href', '/proximo-paso')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
