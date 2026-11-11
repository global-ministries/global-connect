/**
 * Public QR page of Próximo Paso (odd/tasks/proximo-paso.md T2, S3; T8 with
 * design/proximo-paso 01–07): the landing with the next edición and the 4
 * Sundays, «Elegir fecha» only with several open ediciones, «Tus datos», the
 * code, «¡Listo!» with the calendar, one tap with a session, and the states.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { RegistroProximoPaso } from '@/components/proximo-paso/registro-proximo-paso'
import type { EdicionProximoPaso } from '@/lib/platform/talleres/proximo-paso-registro'

const registrarseEnProximoPaso = jest.fn()
const inscribirmeEnProximoPaso = jest.fn()
const confirmarCodigoProximoPaso = jest.fn()
const reenviarCodigoProximoPaso = jest.fn()
const refresh = jest.fn()

jest.mock('@/app/proximo-paso/actions', () => ({
  registrarseEnProximoPaso: (...a: unknown[]) => registrarseEnProximoPaso(...a),
  inscribirmeEnProximoPaso: (...a: unknown[]) => inscribirmeEnProximoPaso(...a),
  confirmarCodigoProximoPaso: (...a: unknown[]) => confirmarCodigoProximoPaso(...a),
  reenviarCodigoProximoPaso: (...a: unknown[]) => reenviarCodigoProximoPaso(...a),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const clasesEnero = [
  { numero: 1, tema: 'Sígueme', fecha: '2027-01-03' },
  { numero: 2, tema: 'Intimidad con Dios', fecha: '2027-01-10' },
  { numero: 3, tema: 'Compañerismo', fecha: '2027-01-17' },
  { numero: 4, tema: 'Influencia', fecha: '2027-01-24' },
]
const enero: EdicionProximoPaso = {
  id: 'ed-ene',
  nombre: 'Enero 2027',
  fechaInicio: '2027-01-03',
  fechaFin: '2027-01-24',
  cupoRestante: 30,
  clases: clasesEnero,
  hora: '10:00',
  lugar: 'Auditorio principal',
  indicaciones: null,
}
const febrero: EdicionProximoPaso = {
  ...enero,
  id: 'ed-feb',
  nombre: 'Febrero 2027',
  fechaInicio: '2027-02-07',
  fechaFin: '2027-02-28',
  cupoRestante: 0,
  clases: clasesEnero.map((c, i) => ({ ...c, fecha: `2027-02-${String(7 + i * 7).padStart(2, '0')}` })),
}
const marzo: EdicionProximoPaso = {
  ...enero,
  id: 'ed-mar',
  nombre: 'Marzo 2027',
  fechaInicio: '2027-03-07',
  fechaFin: '2027-03-28',
  cupoRestante: 6,
  hora: null,
  lugar: null,
  clases: clasesEnero.map((c, i) => ({ ...c, fecha: `2027-03-${String(7 + i * 7).padStart(2, '0')}` })),
}
const RESUMEN_ENERO = { id: 'ed-ene', nombre: 'Enero 2027', fechaInicio: '2027-01-03' }
const LOGIN_ENERO = `/?redirect=${encodeURIComponent('/proximo-paso?edicion=ed-ene')}`

function llenarDatos() {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Pérez' } })
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '0412 555 1234' } })
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'ana@example.com' } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secreto123' } })
}

const DATOS = { nombre: 'Ana', apellido: 'Pérez', telefono: '0412 555 1234', email: 'ana@example.com', password: 'secreto123' }

beforeEach(() => jest.clearAllMocks())

describe('landing (01)', () => {
  it('shows the next edición with its first Sunday, time, place and cupos, and the 4 clases as Sundays', () => {
    render(<RegistroProximoPaso ediciones={[enero]} conSesion={false} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Tu primer paso en Global' })).toBeInTheDocument()
    const tarjeta = screen.getByRole('article', { name: 'Enero 2027' })
    expect(within(tarjeta).getByText('Inscripciones abiertas')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Empieza el domingo 3 de enero')).toBeInTheDocument()
    expect(within(tarjeta).getByText('10:00 a. m.')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Auditorio principal')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Quedan 30')).toBeInTheDocument()

    const clases = within(screen.getByRole('region', { name: 'Las 4 clases' })).getAllByRole('listitem')
    expect(clases.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Clase 1 · domingo 3 de eneroSígueme'),
      expect.stringContaining('Clase 2 · domingo 10 de eneroIntimidad con Dios'),
      expect.stringContaining('Clase 3 · domingo 17 de eneroCompañerismo'),
      expect.stringContaining('Clase 4 · domingo 24 de eneroInfluencia'),
    ])
    expect(screen.getByRole('link', { name: 'Inicia sesión' })).toHaveAttribute('href', LOGIN_ENERO)
  })

  it('renders no time or place line when the edición has none', () => {
    render(<RegistroProximoPaso ediciones={[marzo]} conSesion={false} />)

    expect(screen.queryByRole('list', { name: 'Hora y lugar' })).not.toBeInTheDocument()
  })

  it('goes straight to «Tus datos» with one open date, skipping «Elegir fecha»', () => {
    render(<RegistroProximoPaso ediciones={[enero]} conSesion={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'Quiero inscribirme' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Tus datos' })).toBeInTheDocument()
    expect(screen.getByText(/^Paso /).textContent).toBe('Paso 1 de 2 · Tus datos')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cambiar' })).not.toBeInTheDocument()
  })

  it('says how many dates have cupo and asks for the date first with several', () => {
    render(<RegistroProximoPaso ediciones={[enero, febrero, marzo]} conSesion={false} />)

    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === 'Hay 2 fechas con cupo')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quiero inscribirme' }))

    expect(screen.getByRole('heading', { level: 1, name: '¿Cuándo quieres empezar?' })).toBeInTheDocument()
    expect(screen.getByText(/^Paso /).textContent).toBe('Paso 1 de 3 · Fecha')
    expect(screen.getByRole('radio', { name: /Enero 2027/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Febrero 2027/ })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /Febrero 2027/ })).toHaveAccessibleDescription('Sin cupos')
    expect(screen.getByRole('radio', { name: /Marzo 2027/ })).toHaveAccessibleDescription('Quedan 6 cupos')
    expect(screen.getByText('Domingos 7, 14, 21 y 28 de marzo')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Marzo 2027/ }))
    expect(screen.getByText('Empiezas el domingo 7 de marzo')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Tus datos' })).toBeInTheDocument()
    expect(screen.getByText(/^Paso /).textContent).toBe('Paso 2 de 3 · Tus datos')
    expect(screen.getByText('Próximo Paso · Marzo 2027')).toBeInTheDocument()
  })

  it('preselects the edición of the link', () => {
    render(<RegistroProximoPaso ediciones={[enero, marzo]} conSesion={false} edicionInicial="ed-mar" />)

    expect(screen.getByRole('article', { name: 'Marzo 2027' })).toBeInTheDocument()
  })
})

describe('tus datos and code (03, 04)', () => {
  it('shows the field errors without sending an incomplete form', async () => {
    render(<RegistroProximoPaso ediciones={[enero]} conSesion={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quiero inscribirme' }))

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByText('Escribe tu nombre.')).toBeInTheDocument()
    expect(screen.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true')
    expect(registrarseEnProximoPaso).not.toHaveBeenCalled()
  })

  it('shows the server field errors on their fields', async () => {
    registrarseEnProximoPaso.mockResolvedValue({
      ok: false,
      error: 'invalid-input',
      message: 'Revisa los datos marcados.',
      errores: { password: 'Elige una contraseña más segura: mezcla letras y números.' },
    })
    render(<RegistroProximoPaso ediciones={[enero]} conSesion={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quiero inscribirme' }))

    llenarDatos()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByText('Elige una contraseña más segura: mezcla letras y números.')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-invalid', 'true')
  })

  it('switches to the 6-digit code step when the account must be confirmed', async () => {
    registrarseEnProximoPaso.mockResolvedValue({ ok: true, estado: 'confirmar_correo', email: 'ana@example.com', edicion: RESUMEN_ENERO })
    render(<RegistroProximoPaso ediciones={[enero]} conSesion={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quiero inscribirme' }))

    llenarDatos()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument()
    expect(registrarseEnProximoPaso).toHaveBeenCalledWith({ edicionId: 'ed-ene', ...DATOS })
    expect(screen.getByText(/^Paso /).textContent).toBe('Paso 2 de 2 · Confirmar correo')
    expect(within(screen.getByRole('group', { name: 'Código de 6 dígitos' })).getAllByRole('textbox')).toHaveLength(6)
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
  })

  it('goes back to «Tus datos» with the data kept on «Cambiar correo»', async () => {
    registrarseEnProximoPaso.mockResolvedValue({ ok: true, estado: 'confirmar_correo', email: 'ana@example.com', edicion: RESUMEN_ENERO })
    render(<RegistroProximoPaso ediciones={[enero]} conSesion={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quiero inscribirme' }))
    llenarDatos()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar correo' }))

    expect(screen.getByLabelText('Correo')).toHaveValue('ana@example.com')
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana')
  })

  it('continues signed in when the code was right but the enrollment did not go through', async () => {
    registrarseEnProximoPaso.mockResolvedValue({ ok: true, estado: 'confirmar_correo', email: 'ana@example.com', edicion: RESUMEN_ENERO })
    confirmarCodigoProximoPaso.mockResolvedValue({
      ok: false,
      error: 'CUENTA_SIN_INSCRIPCION',
      message: 'Tu cuenta quedó creada, pero no pudimos inscribirte. Inténtalo de nuevo.',
      sesionAbierta: true,
    })
    render(<RegistroProximoPaso ediciones={[enero]} conSesion={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quiero inscribirme' }))
    llenarDatos()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    const caja = within(await screen.findByRole('group', { name: 'Código de 6 dígitos' })).getAllByRole('textbox')[0]

    fireEvent.paste(caja, { clipboardData: { getData: () => '123456' } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Tu cuenta quedó creada, pero no pudimos inscribirte.')
    expect(screen.getByRole('button', { name: 'Inscribirme' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  })
})

describe('¡Listo! (05)', () => {
  it('confirms with the 4 Sundays, the time and place, and calendar links for each and for all', async () => {
    registrarseEnProximoPaso.mockResolvedValue({ ok: true, estado: 'inscrito', edicion: RESUMEN_ENERO })
    render(<RegistroProximoPaso ediciones={[enero]} conSesion={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quiero inscribirme' }))
    llenarDatos()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('heading', { level: 1, name: '¡Listo, Ana!' })).toBeInTheDocument()
    expect(screen.getByText('Inscripción confirmada')).toBeInTheDocument()
    expect(screen.getByText('10:00 a. m.')).toBeInTheDocument()
    expect(screen.getByText('Auditorio principal')).toBeInTheDocument()

    const domingos = within(screen.getByRole('region', { name: 'Tus 4 domingos' }))
    const uno = domingos.getByRole('link', { name: 'Agregar Sígueme, domingo 3 de enero, a tu calendario' })
    expect(uno.getAttribute('href')).toMatch(/^data:text\/calendar;charset=utf-8,/)
    expect(decodeURIComponent(uno.getAttribute('href') ?? '')).toContain('DTSTART:20270103T140000Z')
    expect(uno).toHaveAttribute('download')
    const todas = domingos.getByRole('link', { name: 'Agregar los 4 a mi calendario' })
    expect(decodeURIComponent(todas.getAttribute('href') ?? '').match(/BEGIN:VEVENT/g)).toHaveLength(4)
    expect(domingos.getAllByRole('link', { name: /^Agregar .*, domingo .*, a tu calendario$/ })).toHaveLength(4)
    expect(domingos.getByRole('link', { name: 'Google Calendar' }).getAttribute('href')).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?/)

    expect(screen.getByRole('link', { name: 'Ver mis clases' })).toHaveAttribute('href', '/talleres/mi-recorrido')
  })

  it('says the coordinación will confirm a pendiente enrollment, without claiming it is done', async () => {
    registrarseEnProximoPaso.mockResolvedValue({ ok: true, estado: 'pendiente', edicion: RESUMEN_ENERO })
    render(<RegistroProximoPaso ediciones={[enero]} conSesion={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quiero inscribirme' }))
    llenarDatos()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Recibimos tu inscripción' })).toBeInTheDocument()
    expect(screen.getByText('La coordinación la confirmará. La primera clase es el domingo 3 de enero.')).toBeInTheDocument()
    expect(screen.queryByText('Inscripción confirmada')).not.toBeInTheDocument()
    expect(screen.queryByText(/¡Listo/)).not.toBeInTheDocument()
  })
})

describe('con sesión (06)', () => {
  it('enrolls with one tap, without the account form', async () => {
    inscribirmeEnProximoPaso.mockResolvedValue({ ok: true, estado: 'inscrito', edicion: RESUMEN_ENERO })
    render(<RegistroProximoPaso ediciones={[enero]} conSesion persona={{ nombre: 'Ana' }} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cambiar fecha' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }))

    await waitFor(() => expect(inscribirmeEnProximoPaso).toHaveBeenCalledWith('ed-ene'))
    expect(await screen.findByRole('heading', { level: 1, name: '¡Listo, Ana!' })).toBeInTheDocument()
    expect(inscribirmeEnProximoPaso).toHaveBeenCalledTimes(1)
  })

  it('offers «Cambiar fecha» with several open dates', () => {
    render(<RegistroProximoPaso ediciones={[enero, marzo]} conSesion persona={{ nombre: 'Ana' }} />)

    expect(screen.getByRole('button', { name: 'Cambiar fecha' })).toBeInTheDocument()
  })

  it('offers sign-in when the session expired before enrolling', async () => {
    inscribirmeEnProximoPaso.mockResolvedValue({ ok: false, error: 'unauthorized', message: 'Inicia sesión para inscribirte.', loginHref: LOGIN_ENERO })
    render(<RegistroProximoPaso ediciones={[enero]} conSesion />)

    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Inicia sesión para inscribirte.')
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', LOGIN_ENERO)
  })

  it('shows the enrollment failure of a signed-in person', async () => {
    inscribirmeEnProximoPaso.mockResolvedValue({ ok: false, error: 'CUENTA_EN_REVISION', message: 'Tu cuenta quedó creada. La coordinación debe revisarla antes de inscribirte; te avisaremos.' })
    render(<RegistroProximoPaso ediciones={[enero]} conSesion />)

    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La coordinación debe revisarla')
  })
})

describe('states (07)', () => {
  it('1 · without open dates still explains Próximo Paso, with no way to enroll', () => {
    render(<RegistroProximoPaso ediciones={[]} conSesion={false} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Pronto abrimos la próxima fecha' })).toBeInTheDocument()
    expect(screen.getByText(/Ahora mismo no hay inscripciones abiertas\./)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Las 4 clases' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Sígueme'),
      expect.stringContaining('Intimidad con Dios'),
      expect.stringContaining('Compañerismo'),
      expect.stringContaining('Influencia'),
    ])
    expect(screen.queryByRole('button', { name: 'Quiero inscribirme' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
  })

  it('2 · cupo lleno keeps the data and enrolls in the next date with cupo', async () => {
    registrarseEnProximoPaso
      .mockResolvedValueOnce({ ok: false, error: 'CUPO_LLENO', message: 'No quedan cupos en esta edición.' })
      .mockResolvedValueOnce({ ok: true, estado: 'inscrito', edicion: { id: 'ed-mar', nombre: 'Marzo 2027', fechaInicio: '2027-03-07' } })
    render(<RegistroProximoPaso ediciones={[enero, marzo]} conSesion={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Quiero inscribirme' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    llenarDatos()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Enero se llenó' })).toBeInTheDocument()
    expect(screen.getByText(/Tus datos siguen aquí, no tienes que escribirlos otra vez\./)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme en Marzo 2027' }))

    expect(await screen.findByRole('heading', { level: 1, name: '¡Listo, Ana!' })).toBeInTheDocument()
    expect(registrarseEnProximoPaso).toHaveBeenLastCalledWith({ edicionId: 'ed-mar', ...DATOS })
  })

  it('3 · a link to a closed date offers the next one', () => {
    render(<RegistroProximoPaso ediciones={[enero]} conSesion={false} edicionInicial="ed-dic" />)

    expect(screen.getByRole('heading', { level: 1, name: 'Las inscripciones de esa fecha cerraron' })).toBeInTheDocument()
    expect(screen.getByText(/La próxima fecha empieza el domingo 3 de enero\./)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme en Enero 2027' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Tus datos' })).toBeInTheDocument()
  })

  it('6 · a signed-in person already enrolled sees their place, not the form', () => {
    render(
      <RegistroProximoPaso
        ediciones={[enero]}
        conSesion
        persona={{ nombre: 'Ana' }}
        inscripcion={{ estado: 'inscrito', edicion: enero }}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Ya tienes tu lugar' })).toBeInTheDocument()
    expect(screen.getByText('Inscripción confirmada')).toBeInTheDocument()
    expect(screen.getByText('Próxima clase')).toBeInTheDocument()
    expect(screen.getByText('10:00 a. m.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Inscribirme' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver mis clases' })).toHaveAttribute('href', '/talleres/mi-recorrido')
  })

  it('6 · YA_INSCRITO from the server shows the same place', async () => {
    inscribirmeEnProximoPaso.mockResolvedValue({ ok: false, error: 'YA_INSCRITO', message: 'Ya tienes una inscripción en esta edición.' })
    render(<RegistroProximoPaso ediciones={[enero]} conSesion />)

    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Ya tienes tu lugar' })).toBeInTheDocument()
  })
})
