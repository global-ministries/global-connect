/**
 * Public QR page of Próximo Paso (odd/tasks/proximo-paso.md T2, S3): pick the
 * edición, then create the account (or, signed in, just enroll).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { RegistroProximoPaso } from '@/components/proximo-paso/registro-proximo-paso'
import type { EdicionProximoPaso } from '@/lib/platform/talleres/proximo-paso-registro'

const registrarseEnProximoPaso = jest.fn()
const inscribirmeEnProximoPaso = jest.fn()
const refresh = jest.fn()

jest.mock('@/app/proximo-paso/actions', () => ({
  registrarseEnProximoPaso: (...a: unknown[]) => registrarseEnProximoPaso(...a),
  inscribirmeEnProximoPaso: (...a: unknown[]) => inscribirmeEnProximoPaso(...a),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const clases = [
  { numero: 1, tema: 'Sígueme', fecha: '2026-12-06' },
  { numero: 2, tema: 'Intimidad con Dios', fecha: '2026-12-13' },
  { numero: 3, tema: 'Compañerismo', fecha: '2026-12-20' },
  { numero: 4, tema: 'Influencia', fecha: '2026-12-27' },
]
const ediciones: EdicionProximoPaso[] = [
  { id: 'ed-dic', nombre: 'Diciembre 2026', fechaInicio: '2026-12-06', fechaFin: '2026-12-27', cupoRestante: null, clases },
  { id: 'ed-ene', nombre: 'Enero 2027', fechaInicio: '2027-01-03', fechaFin: '2027-01-24', cupoRestante: 3, clases: [] },
  { id: 'ed-feb', nombre: 'Febrero 2027', fechaInicio: '2027-02-07', fechaFin: '2027-02-28', cupoRestante: 0, clases: [] },
]
const RESUMEN = { id: 'ed-dic', nombre: 'Diciembre 2026', fechaInicio: '2026-12-06' }

function llenarFormulario() {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Pérez' } })
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '0412 555 1234' } })
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@example.com' } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secreto123' } })
}

beforeEach(() => jest.clearAllMocks())

describe('RegistroProximoPaso', () => {
  it('explains the 4 Sunday clases and lists the open ediciones with their first Sunday and cupo', () => {
    render(<RegistroProximoPaso ediciones={ediciones} conSesion={false} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Inscríbete en Próximo Paso' })).toBeInTheDocument()
    expect(screen.getByText(/4 clases, una cada domingo/)).toBeInTheDocument()
    expect(screen.getByText('Sígueme · Intimidad con Dios · Compañerismo · Influencia')).toBeInTheDocument()

    const dic = screen.getByRole('radio', { name: /Diciembre 2026/ })
    expect(dic).toBeChecked()
    expect(screen.getByText('Primera clase el domingo 6 de diciembre · termina el 27 de diciembre')).toBeInTheDocument()
    expect(screen.getByText('Quedan 3 cupos')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Febrero 2027/ })).toBeDisabled()
    expect(screen.getByText('Sin cupos')).toBeInTheDocument()
  })

  it('preselects the edición of the link and points the sign-in back to it', () => {
    render(<RegistroProximoPaso ediciones={ediciones} conSesion={false} edicionInicial="ed-ene" />)

    expect(screen.getByRole('radio', { name: /Enero 2027/ })).toBeChecked()
    expect(screen.getByRole('link', { name: 'Inicia sesión' })).toHaveAttribute(
      'href',
      `/?redirect=${encodeURIComponent('/proximo-paso?edicion=ed-ene')}`,
    )
  })

  it('shows the field errors without sending an incomplete form', async () => {
    render(<RegistroProximoPaso ediciones={ediciones} conSesion={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta e inscribirme' }))

    expect(await screen.findByText('Escribe tu nombre.')).toBeInTheDocument()
    expect(screen.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeInTheDocument()
    expect(registrarseEnProximoPaso).not.toHaveBeenCalled()
  })

  it('creates the account for the chosen edición and confirms it', async () => {
    registrarseEnProximoPaso.mockResolvedValue({ ok: true, estado: 'inscrito', edicion: RESUMEN })
    render(<RegistroProximoPaso ediciones={ediciones} conSesion={false} />)

    llenarFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta e inscribirme' }))

    expect(
      await screen.findByRole('heading', {
        name: 'Quedaste inscrito en Próximo Paso — Diciembre 2026, primera clase el domingo 6 de diciembre',
      }),
    ).toBeInTheDocument()
    expect(registrarseEnProximoPaso).toHaveBeenCalledWith({
      edicionId: 'ed-dic',
      nombre: 'Ana',
      apellido: 'Pérez',
      telefono: '0412 555 1234',
      email: 'ana@example.com',
      password: 'secreto123',
    })
    expect(screen.getByRole('link', { name: 'Ver mis clases' })).toHaveAttribute('href', '/talleres/mi-recorrido')
  })

  it('asks to open the email when the account must be confirmed first', async () => {
    registrarseEnProximoPaso.mockResolvedValue({ ok: true, estado: 'confirmar_correo', email: 'ana@example.com', edicion: RESUMEN })
    render(<RegistroProximoPaso ediciones={ediciones} conSesion={false} />)

    llenarFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta e inscribirme' }))

    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument()
    expect(screen.getByText(/ana@example\.com/)).toBeInTheDocument()
    expect(screen.getByText(/Diciembre 2026/)).toBeInTheDocument()
  })

  it('sends an existing account to sign in and continue', async () => {
    const loginHref = `/?redirect=${encodeURIComponent('/proximo-paso?edicion=ed-dic')}`
    registrarseEnProximoPaso.mockResolvedValue({
      ok: false,
      error: 'CUENTA_EXISTENTE',
      message: 'Ya tienes una cuenta con ese correo. Inicia sesión y te inscribimos en Diciembre 2026.',
      loginHref,
    })
    render(<RegistroProximoPaso ediciones={ediciones} conSesion={false} />)

    llenarFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta e inscribirme' }))

    expect(await screen.findByText(/Ya tienes una cuenta con ese correo/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Iniciar sesión y seguir' })).toHaveAttribute('href', loginHref)
  })

  it('shows the server field errors on their fields', async () => {
    registrarseEnProximoPaso.mockResolvedValue({
      ok: false,
      error: 'invalid-input',
      message: 'Revisa los datos marcados.',
      errores: { password: 'Elige una contraseña más segura: mezcla letras y números.' },
    })
    render(<RegistroProximoPaso ediciones={ediciones} conSesion={false} />)

    llenarFormulario()
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta e inscribirme' }))

    expect(await screen.findByText('Elige una contraseña más segura: mezcla letras y números.')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'true')
  })

  it('lets a signed-in person enroll with one tap, without the account form', async () => {
    inscribirmeEnProximoPaso.mockResolvedValue({ ok: true, estado: 'inscrito', edicion: RESUMEN })
    render(<RegistroProximoPaso ediciones={ediciones} conSesion edicionInicial="ed-dic" />)

    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }))

    await waitFor(() => expect(inscribirmeEnProximoPaso).toHaveBeenCalledWith('ed-dic'))
    expect(await screen.findByRole('heading', { name: /Quedaste inscrito en Próximo Paso/ })).toBeInTheDocument()
  })

  it('shows the enrollment failure of a signed-in person', async () => {
    inscribirmeEnProximoPaso.mockResolvedValue({ ok: false, error: 'YA_INSCRITO', message: 'Ya tienes una inscripción en esta edición.' })
    render(<RegistroProximoPaso ediciones={ediciones} conSesion />)

    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya tienes una inscripción en esta edición.')
  })

  it('says when there is no open edición', () => {
    render(<RegistroProximoPaso ediciones={[]} conSesion={false} />)

    expect(screen.getByText('No hay fechas abiertas en este momento')).toBeInTheDocument()
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
  })
})
