/**
 * Public one-screen registration (/ninos/registro), odd/tasks/ninos-v2.md N4b, S5–S6, prototype 01.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { RegistroPublico } from '@/components/ninos/registro-rapido/registro-publico'

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

const campus = [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nombre: 'Campus Uno' }]
const otroCampus = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', nombre: 'Campus Dos' }
const salones = [
  { id: 's1', nombre: 'Preescolar', area: 'waumba' as const, edadMinMeses: 36, edadMaxMeses: 71, gradoMin: null, gradoMax: null, esNecesidadesEspeciales: false, activo: true, orden: 1, campusId: campus[0].id },
]

const escribir = (etiqueta: string, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
const pulsar = (nombre: string | RegExp) => fireEvent.click(screen.getByRole('button', { name: nombre }))
const elegir = (grupo: string, opcion: string) => fireEvent.click(within(screen.getByRole('group', { name: grupo })).getByRole('button', { name: opcion }))
const enviar = () => pulsar('Enviar registro')
const cuerpo = () => JSON.parse(fetchMock.mock.calls[0][1].body)
const ok = { ok: true, status: 200, json: async () => ({ ok: true }) }

function llenarPadre() {
  escribir('Tu nombre', 'Ana')
  escribir('Tu apellido', 'Prueba')
  escribir('Teléfono', '04140000000')
  elegir('Eres mamá o papá', 'Mamá')
}

function llenarHijo(n = 1, nombre = 'Sol') {
  escribir(`Nombre del niño ${n}`, nombre)
  escribir(`Fecha de nacimiento del niño ${n}`, '2021-03-04')
  elegir(`Género del niño ${n}`, 'Niña')
  elegir(`¿${nombre} tiene alergias?`, 'No')
  elegir(`¿${nombre} tiene alguna condición médica o necesidad especial?`, 'No')
}

function llenarTodo() {
  llenarPadre()
  llenarHijo()
}

describe('RegistroPublico', () => {
  it('is one page with the three sections and «Para después» folded', () => {
    render(<RegistroPublico campus={campus} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Registra a tu familia' })).toBeInTheDocument()
    for (const titulo of ['Tú', 'Tus niños', '¿Quién los retira?']) expect(screen.getByRole('heading', { name: titulo })).toBeInTheDocument()
    expect(screen.getByText('Para después').closest('details')).not.toHaveAttribute('open')
    expect(screen.queryByText(/Paso \d de/)).not.toBeInTheDocument()
  })

  it('sends the old body shape plus the parent género and shows the end state', async () => {
    fetchMock.mockResolvedValue(ok)
    render(<RegistroPublico campus={campus} />)
    llenarTodo()
    enviar()

    expect(await screen.findByText('¡Listo, gracias!')).toBeInTheDocument()
    expect(screen.getByText('Acércate a la mesa de Niños con Sol.')).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ninos/preregistro')
    expect(init.method).toBe('POST')
    const body = cuerpo()
    expect(Object.keys(body).sort()).toEqual(['autorizados', 'campusId', 'hijos', 'padre', 'sitioWeb'])
    expect(body).toMatchObject({
      campusId: campus[0].id,
      padre: { nombre: 'Ana', apellido: 'Prueba', telefono: '04140000000', genero: 'Femenino', email: '', cedula: '' },
      autorizados: [],
      sitioWeb: '',
    })
    expect(body.hijos).toEqual([
      {
        nombre: 'Sol', apellido: 'Prueba', fechaNacimiento: '2021-03-04', genero: 'Femenino', grado: '', salonPreferidoId: '', alergias: '',
        necesidadesEspeciales: '', habitos: '', notas: '', puedeComer: null, cambioPanal: null, autorizaImagen: null, escolarizado: null,
      },
    ])
    expect(screen.queryByText(/crear tu cuenta/)).not.toBeInTheDocument()
  })

  it('the bar says what is missing; sending lists it, focuses the first field and posts nothing', () => {
    render(<RegistroPublico campus={campus} />)
    expect(screen.getByText(/^Faltan 10 datos: Tu nombre…$/)).toBeInTheDocument()
    llenarPadre()
    escribir('Nombre del niño 1', 'Sol')
    enviar()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Fecha de nacimiento del niño 1')).toHaveFocus()
    expect(screen.getByText('Elige una fecha de nacimiento válida.')).toBeInTheDocument()
    const resumen = screen.getByText(/^Revisa/).closest('[role="alert"]') as HTMLElement
    expect(resumen).toHaveTextContent('Revisa 4 datos antes de enviar')
    fireEvent.click(within(resumen).getByRole('link', { name: 'Alergias de Sol' }))
    expect(document.getElementById('rr-nino-1-tiene-alergias')).toHaveFocus()
  })

  it('shows the under-13 rule on the child card and does not send', () => {
    render(<RegistroPublico campus={campus} />)
    llenarTodo()
    escribir('Fecha de nacimiento del niño 1', '2012-08-30')
    const aviso = 'Con esa fecha Sol tendría 14 años. Niños recibe menores de 13: revisa la fecha o quita a Sol de este registro.'
    expect(screen.getByText(aviso)).toBeInTheDocument()
    enviar()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the suggested salón live from the birth date', () => {
    render(<RegistroPublico campus={campus} salones={salones} />)
    escribir('Fecha de nacimiento del niño 1', '2022-02-09')
    expect(screen.getByText('Preescolar')).toBeInTheDocument()
  })

  it('a complete section folds to one line when left, and «Editar» opens it again', async () => {
    render(<RegistroPublico campus={campus} />)
    llenarPadre()
    const tu = screen.getByRole('region', { name: 'Tú' })
    fireEvent.blur(within(tu).getByLabelText('Tu nombre'), { relatedTarget: screen.getByLabelText('Nombre del niño 1') })
    expect(screen.queryByLabelText('Tu nombre')).not.toBeInTheDocument()
    expect(within(tu).getByText('Ana Prueba · mamá')).toBeInTheDocument()
    expect(within(tu).getByText('04140000000')).toHaveClass('font-mono')
    pulsar('Editar tus datos')
    await waitFor(() => expect(screen.getByLabelText('Tu nombre')).toHaveFocus())
  })

  it('an incomplete section does not fold', () => {
    render(<RegistroPublico campus={campus} />)
    escribir('Tu nombre', 'Ana')
    fireEvent.blur(screen.getByLabelText('Tu nombre'), { relatedTarget: screen.getByLabelText('Nombre del niño 1') })
    expect(screen.getByLabelText('Tu nombre')).toBeInTheDocument()
  })

  it('asks for the allergies only on Sí and sends none on No', async () => {
    fetchMock.mockResolvedValue(ok)
    render(<RegistroPublico campus={campus} />)
    llenarTodo()
    expect(screen.queryByLabelText('Alergias de Sol')).not.toBeInTheDocument()
    elegir('¿Sol tiene alergias?', 'Sí')
    enviar()
    expect(screen.getByLabelText('Alergias de Sol')).toHaveFocus()
    escribir('Alergias de Sol', 'Maní')
    enviar()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(cuerpo().hijos[0]).toMatchObject({ alergias: 'Maní', necesidadesEspeciales: '' })
  })

  it('the parent picks up by default; another person needs a name', async () => {
    fetchMock.mockResolvedValue(ok)
    render(<RegistroPublico campus={campus} />)
    llenarTodo()
    const retiran = screen.getByRole('region', { name: '¿Quién los retira?' })
    expect(within(retiran).getByText('Ana Prueba')).toBeInTheDocument()
    expect(within(retiran).getByText('Tú · siempre')).toBeInTheDocument()
    pulsar('Agregar a alguien más')
    escribir('Teléfono del autorizado 1', '04241111111')
    enviar()
    expect(screen.getByLabelText('Nombre del autorizado 1')).toHaveFocus()
    escribir('Nombre del autorizado 1', 'Abuela Rosa')
    expect(screen.getByText(/^Todo listo: 1 niño · 2 personas retiran$/)).toBeInTheDocument()
    enviar()
    await screen.findByText('¡Listo, gracias!')
    expect(cuerpo().autorizados).toEqual([{ nombre: 'Abuela Rosa', telefono: '04241111111', relacion: '' }])
    expect(screen.getByText('Al terminar, retiras tú o Abuela con ese código.')).toBeInTheDocument()
  })

  it('keeps the optional email, cédula and photos in «Para después»; a bad email opens it', async () => {
    fetchMock.mockResolvedValue(ok)
    render(<RegistroPublico campus={campus} />)
    llenarTodo()
    escribir('Tu correo (opcional)', 'no-es-correo')
    enviar()
    expect(screen.getByText('Para después').closest('details')).toHaveAttribute('open')
    expect(screen.getByText('Escribe un correo válido o déjalo vacío.')).toBeInTheDocument()
    expect(screen.getByLabelText('Cédula (opcional)')).toHaveAccessibleDescription(/encontrarte y no registrarte dos veces/i)
    escribir('Tu correo (opcional)', 'familia@example.com')
    elegir('¿Autorizas fotos de tus niños en las actividades?', 'No')
    enviar()
    expect(await screen.findByText('Te enviaremos un correo para crear tu cuenta cuando confirmemos en la mesa.')).toBeInTheDocument()
    expect(cuerpo().padre.email).toBe('familia@example.com')
    expect(cuerpo().hijos[0].autorizaImagen).toBe(false)
    expect(document.querySelector('a[href*="signup"]')).toBeNull()
  })

  it('copies the parent surname to the children, adds and removes children', () => {
    render(<RegistroPublico campus={campus} />)
    escribir('Tu apellido', 'Prueba')
    expect(screen.getByLabelText('Apellido del niño 1')).toHaveValue('Prueba')
    pulsar('Agregar otro niño')
    expect(screen.getByLabelText('Apellido del niño 2')).toHaveValue('Prueba')
    escribir('Nombre del niño 2', 'Luz')
    pulsar('Quitar a Luz Prueba')
    expect(screen.queryByLabelText('Nombre del niño 2')).not.toBeInTheDocument()
  })

  it.each([
    [{ ok: false, status: 500, json: async () => { throw new Error('no body') } }, 'Tuvimos un problema al enviar. Intenta de nuevo en un momento; tus datos siguen aquí.'],
    [{ ok: false, status: 400, json: async () => ({ errores: ['El teléfono no es válido.'] }) }, 'El teléfono no es válido.'],
    [{ ok: false, status: 429, json: async () => ({ errores: ['limite'] }) }, /Espera unos minutos/],
  ])('keeps every answer when the server refuses (%#)', async (respuesta, mensaje) => {
    fetchMock.mockResolvedValueOnce(respuesta)
    render(<RegistroPublico campus={campus} />)
    llenarTodo()
    enviar()
    expect(await screen.findByText(mensaje)).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del niño 1')).toHaveValue('Sol')
    fetchMock.mockResolvedValueOnce(ok)
    enviar()
    await screen.findByText('¡Listo, gracias!')
  })

  it('keeps every answer when the network fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    render(<RegistroPublico campus={campus} />)
    llenarTodo()
    enviar()
    expect(await screen.findByText(/Revisa tu conexión/)).toBeInTheDocument()
    expect(screen.getByLabelText('Tu nombre')).toHaveValue('Ana')
  })

  it('has a hidden honeypot field out of the tab order', () => {
    render(<RegistroPublico campus={campus} />)
    const trampa = document.querySelector('input[name="sitioWeb"]') as HTMLInputElement
    expect(trampa.tabIndex).toBe(-1)
    expect(trampa.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('asks for the campus only when there are several, and takes it from the QR', async () => {
    const { unmount } = render(<RegistroPublico campus={campus} />)
    expect(screen.queryByLabelText('Campus')).not.toBeInTheDocument()
    unmount()

    fetchMock.mockResolvedValue(ok)
    const { unmount: fuera } = render(<RegistroPublico campus={[...campus, otroCampus]} />)
    llenarTodo()
    enviar()
    expect(screen.getByText('Elige tu campus.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    fuera()

    render(<RegistroPublico campus={[...campus, otroCampus]} campusInicial={otroCampus.id} />)
    llenarTodo()
    enviar()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(cuerpo().campusId).toBe(otroCampus.id)
  })
})
