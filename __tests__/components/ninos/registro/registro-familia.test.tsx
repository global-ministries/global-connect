/**
 * Public family pre-registration wizard (/ninos/registro), odd/tasks/ninos-registro-pasos.md R1.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { RegistroFamilia } from '@/components/ninos/registro/registro-familia'

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

const campus = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nombre: 'Campus Uno' }]
const otroCampus = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', nombre: 'Campus Dos' }

const escribir = (etiqueta: string, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
const pulsar = (nombre: string | RegExp) => fireEvent.click(screen.getByRole('button', { name: nombre }))
const continuar = () => pulsar('Continuar')

function elegir(grupo: string, opcion: string) {
  fireEvent.click(within(screen.getByRole('group', { name: grupo })).getByRole('button', { name: opcion }))
}

function pasoPadre() {
  escribir('Tu nombre', 'Ana')
  escribir('Tu apellido', 'Prueba')
  escribir('Teléfono', '04140000000')
  continuar()
}

function pasoHijo(i = 1, nombre = 'Sol') {
  escribir(`Nombre del niño ${i}`, nombre)
  escribir(`Fecha de nacimiento del niño ${i}`, '2021-03-04')
  elegir(`Género del niño ${i}`, 'Niña')
}

function pasoSaludSinNada(nombre = 'Sol') {
  elegir(`¿${nombre} tiene alergias?`, 'No')
  elegir(`¿${nombre} tiene alguna necesidad especial?`, 'No')
  continuar()
}

/** Steps 1–5 with the minimum data, ending on the review. */
function hastaRevisar() {
  pasoPadre()
  pasoHijo()
  continuar()
  pasoSaludSinNada()
  pulsar('Saltar este paso')
  pulsar('Continuar sin correo')
}

const cuerpo = () => JSON.parse(fetchMock.mock.calls[0][1].body)
const ok = { ok: true, status: 200, json: async () => ({ ok: true }) }

describe('RegistroFamilia', () => {
  it('walks every step and posts the same payload shape as the old form', async () => {
    fetchMock.mockResolvedValue(ok)
    render(<RegistroFamilia campus={campus} />)
    expect(screen.getByText('Paso 1 de 6')).toBeInTheDocument()
    hastaRevisar()
    expect(screen.getByRole('heading', { name: 'Revisa y envía' })).toBeInTheDocument()
    pulsar('Enviar registro')

    await screen.findByText(/Acércate a la mesa de check-in con tus niños/)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ninos/preregistro')
    expect(init.method).toBe('POST')
    const body = cuerpo()
    expect(Object.keys(body).sort()).toEqual(['autorizados', 'campusId', 'hijos', 'padre', 'sitioWeb'])
    expect(body).toMatchObject({
      campusId: campus[0].id,
      padre: { nombre: 'Ana', apellido: 'Prueba', telefono: '04140000000', email: '', cedula: '' },
      autorizados: [],
      sitioWeb: '',
    })
    expect(body.hijos).toEqual([
      {
        nombre: 'Sol',
        apellido: 'Prueba',
        fechaNacimiento: '2021-03-04',
        genero: 'Femenino',
        grado: '',
        salonPreferidoId: '',
        alergias: '',
        necesidadesEspeciales: '',
        habitos: '',
        notas: '',
        puedeComer: null,
        cambioPanal: null,
        autorizaImagen: null,
        escolarizado: null,
      },
    ])
  })

  it('does not advance with invalid data and focuses the first invalid field', () => {
    render(<RegistroFamilia campus={campus} />)
    continuar()
    expect(screen.getByText('Paso 1 de 6')).toBeInTheDocument()
    expect(screen.getByText('Escribe tu nombre.')).toBeInTheDocument()
    expect(screen.getByLabelText('Tu nombre')).toHaveFocus()

    pasoPadre()
    escribir('Nombre del niño 1', 'Sol')
    continuar()
    expect(screen.getByText('Paso 2 de 6')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha de nacimiento del niño 1')).toHaveFocus()
    expect(screen.getByText('Elige si es niño o niña.')).toBeInTheDocument()
  })

  it('blocks the children step on a future birth date with the shared validation', () => {
    render(<RegistroFamilia campus={campus} />)
    pasoPadre()
    pasoHijo()
    escribir('Fecha de nacimiento del niño 1', '2099-01-01')
    continuar()
    expect(screen.getByText('Paso 2 de 6')).toBeInTheDocument()
    expect(screen.getByText('Elige una fecha de nacimiento válida.')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha de nacimiento del niño 1')).toHaveFocus()
  })

  it('moves focus to the step heading and marks the current step', () => {
    render(<RegistroFamilia campus={campus} />)
    pasoPadre()
    expect(screen.getByRole('heading', { name: 'Tus niños' })).toHaveFocus()
    const actual = screen.getByRole('list', { name: 'Pasos' }).querySelector('[aria-current="step"]')
    expect(actual).toHaveTextContent('Tus niños')
  })

  it('keeps the data when going back', () => {
    render(<RegistroFamilia campus={campus} />)
    pasoPadre()
    pasoHijo()
    pulsar('Atrás')
    expect(screen.getByLabelText('Tu nombre')).toHaveValue('Ana')
    continuar()
    expect(screen.getByLabelText('Nombre del niño 1')).toHaveValue('Sol')
    expect(within(screen.getByRole('group', { name: 'Género del niño 1' })).getByRole('button', { name: 'Niña' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('prefills the child surname with the parent one, adds and removes children', () => {
    render(<RegistroFamilia campus={campus} />)
    pasoPadre()
    expect(screen.getByLabelText('Apellido del niño 1')).toHaveValue('Prueba')
    pulsar('Agregar otro niño')
    expect(screen.getByLabelText('Apellido del niño 2')).toHaveValue('Prueba')
    escribir('Apellido del niño 2', 'Otro')
    expect(screen.getByLabelText('Apellido del niño 2')).toHaveValue('Otro')
    pulsar('Quitar niño 2')
    expect(screen.queryByLabelText('Nombre del niño 2')).not.toBeInTheDocument()
  })

  it('asks for the allergies only on Sí and sends none on No', async () => {
    fetchMock.mockResolvedValue(ok)
    render(<RegistroFamilia campus={campus} />)
    pasoPadre()
    pasoHijo()
    continuar()
    expect(screen.queryByLabelText('Alergias de Sol')).not.toBeInTheDocument()
    continuar()
    expect(screen.getByText('Paso 3 de 6')).toBeInTheDocument()

    elegir('¿Sol tiene alergias?', 'Sí')
    escribir('Alergias de Sol', 'Maní')
    elegir('¿Sol tiene alguna necesidad especial?', 'Sí')
    continuar()
    expect(screen.getByText('Paso 3 de 6')).toBeInTheDocument()
    expect(screen.getByLabelText('Necesidades especiales de Sol')).toHaveFocus()

    elegir('¿Sol tiene alguna necesidad especial?', 'No')
    expect(screen.queryByLabelText('Necesidades especiales de Sol')).not.toBeInTheDocument()
    continuar()
    pulsar('Saltar este paso')
    pulsar('Continuar sin correo')
    pulsar('Enviar registro')
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(cuerpo().hijos[0]).toMatchObject({ alergias: 'Maní', necesidadesEspeciales: '' })
  })

  it('lets the parent add a pickup person and validates its name', async () => {
    fetchMock.mockResolvedValue(ok)
    render(<RegistroFamilia campus={campus} />)
    pasoPadre()
    pasoHijo()
    continuar()
    pasoSaludSinNada()
    pulsar('Agregar persona')
    escribir('Teléfono del autorizado 1', '04241111111')
    continuar()
    expect(screen.getByLabelText('Nombre del autorizado 1')).toHaveFocus()
    escribir('Nombre del autorizado 1', 'Abuela')
    continuar()
    pulsar('Continuar sin correo')
    pulsar('Enviar registro')
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(cuerpo().autorizados).toEqual([{ nombre: 'Abuela', telefono: '04241111111', relacion: '' }])
  })

  it('validates the optional email and shows the account copy when given', async () => {
    fetchMock.mockResolvedValue(ok)
    render(<RegistroFamilia campus={campus} />)
    pasoPadre()
    pasoHijo()
    continuar()
    pasoSaludSinNada()
    pulsar('Saltar este paso')
    escribir('Tu correo (opcional)', 'no-es-correo')
    continuar()
    expect(screen.getByText('Escribe un correo válido o déjalo vacío.')).toBeInTheDocument()
    escribir('Tu correo (opcional)', 'familia@example.com')
    continuar()
    pulsar('Enviar registro')

    expect(await screen.findByText('Te enviaremos un correo para crear tu cuenta cuando confirmemos en la mesa.')).toBeInTheDocument()
    expect(cuerpo().padre.email).toBe('familia@example.com')
    expect(document.querySelector('a[href*="signup"]')).toBeNull()
  })

  it('shows no account copy without an email and nothing of the family back', async () => {
    fetchMock.mockResolvedValue(ok)
    render(<RegistroFamilia campus={campus} />)
    hastaRevisar()
    pulsar('Enviar registro')
    await screen.findByText(/Acércate a la mesa de check-in con tus niños/)
    expect(screen.queryByText(/crear tu cuenta/)).not.toBeInTheDocument()
    expect(screen.queryByText('Sol')).not.toBeInTheDocument()
  })

  it('jumps from the review to a step and back to the review', () => {
    render(<RegistroFamilia campus={campus} />)
    hastaRevisar()
    expect(screen.getByText('Ana Prueba')).toBeInTheDocument()
    pulsar('Editar tus datos')
    expect(screen.getByText('Paso 1 de 6')).toBeInTheDocument()
    escribir('Tu nombre', 'Ana María')
    pulsar('Guardar y revisar')
    expect(screen.getByRole('heading', { name: 'Revisa y envía' })).toBeInTheDocument()
    expect(screen.getByText('Ana María Prueba')).toBeInTheDocument()
  })

  it('sends a child added from the review only after its health step is answered', async () => {
    fetchMock.mockResolvedValue(ok)
    render(<RegistroFamilia campus={campus} />)
    hastaRevisar()
    pulsar('Editar tus niños')
    expect(screen.getByText('Paso 2 de 6')).toBeInTheDocument()
    pulsar('Agregar otro niño')
    pasoHijo(2, 'Luz')
    pulsar('Guardar y revisar')

    expect(screen.getByText('Paso 3 de 6')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: '¿Sol tiene alergias?' })).getByRole('button', { name: 'No' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    pulsar('Guardar y revisar')
    expect(screen.getByText('Paso 3 de 6')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar registro' })).not.toBeInTheDocument()

    elegir('¿Luz tiene alergias?', 'No')
    elegir('¿Luz tiene alguna necesidad especial?', 'No')
    pulsar('Guardar y revisar')
    expect(screen.getByRole('heading', { name: 'Revisa y envía' })).toBeInTheDocument()
    pulsar('Enviar registro')
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(cuerpo().hijos.map((h: { nombre: string }) => h.nombre)).toEqual(['Sol', 'Luz'])
    expect(cuerpo().hijos[1]).toMatchObject({ apellido: 'Prueba', fechaNacimiento: '2021-03-04', genero: 'Femenino', alergias: '' })
  })

  it('shows a server-fault message when the server fails without details', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('no body') } })
    render(<RegistroFamilia campus={campus} />)
    hastaRevisar()
    pulsar('Enviar registro')
    expect(await screen.findByText('Tuvimos un problema al enviar. Intenta de nuevo en un momento; tus datos siguen aquí.')).toBeInTheDocument()
    expect(screen.queryByText(/Revisa tu conexión/)).not.toBeInTheDocument()
    expect(screen.getByText('Ana Prueba')).toBeInTheDocument()
  })

  it('shows the server validation errors when it rejects the data', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ errores: ['El teléfono no es válido.'] }) })
    render(<RegistroFamilia campus={campus} />)
    hastaRevisar()
    pulsar('Enviar registro')
    expect(await screen.findByText('El teléfono no es válido.')).toBeInTheDocument()
    expect(screen.queryByText(/Tuvimos un problema/)).not.toBeInTheDocument()
    expect(screen.getByText('Ana Prueba')).toBeInTheDocument()
  })

  it('keeps every answer and offers a retry when rate limited', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ errores: ['limite'] }) })
    render(<RegistroFamilia campus={campus} />)
    hastaRevisar()
    pulsar('Enviar registro')
    expect(await screen.findByText(/Espera unos minutos/)).toBeInTheDocument()
    expect(screen.getByText('Ana Prueba')).toBeInTheDocument()

    fetchMock.mockResolvedValueOnce(ok)
    pulsar('Enviar registro')
    await screen.findByText(/Acércate a la mesa de check-in con tus niños/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps every answer when the network fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    render(<RegistroFamilia campus={campus} />)
    hastaRevisar()
    pulsar('Enviar registro')
    expect(await screen.findByText(/Revisa tu conexión/)).toBeInTheDocument()
    expect(screen.queryByText(/Tuvimos un problema/)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Revisa y envía' })).toBeInTheDocument()
    expect(screen.getByText('Ana Prueba')).toBeInTheDocument()
  })

  it('has a hidden honeypot field out of the tab order', () => {
    render(<RegistroFamilia campus={campus} />)
    const trampa = document.querySelector('input[name="sitioWeb"]') as HTMLInputElement
    expect(trampa).not.toBeNull()
    expect(trampa.tabIndex).toBe(-1)
    expect(trampa.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('asks for the campus in the first step only when there are several', () => {
    const { unmount } = render(<RegistroFamilia campus={campus} />)
    expect(screen.queryByLabelText('Campus')).not.toBeInTheDocument()
    unmount()

    render(<RegistroFamilia campus={[...campus, otroCampus]} />)
    escribir('Tu nombre', 'Ana')
    escribir('Tu apellido', 'Prueba')
    escribir('Teléfono', '04140000000')
    continuar()
    expect(screen.getByText('Elige tu campus.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Campus'), { target: { value: otroCampus.id } })
    continuar()
    expect(screen.getByText('Paso 2 de 6')).toBeInTheDocument()
  })

  it('preselects the campus from the QR', async () => {
    fetchMock.mockResolvedValue(ok)
    render(<RegistroFamilia campus={[...campus, otroCampus]} campusInicial={otroCampus.id} />)
    hastaRevisar()
    pulsar('Enviar registro')
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(cuerpo().campusId).toBe(otroCampus.id)
  })
})
