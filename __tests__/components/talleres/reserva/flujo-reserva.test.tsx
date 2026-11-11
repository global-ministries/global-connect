/**
 * The public reservation flow (T5b, design/talleres-reserva/03–05): an
 * existing person confirms with a code and sends; a new person fills the
 * ficha; a full horario offers "avísame". The browser posts to
 * /api/talleres/reserva/* (mocked fetch).
 */
import { fireEvent, render, screen } from '@testing-library/react'

import { FlujoReserva } from '@/components/talleres/reserva/flujo-reserva'
import type { TallerPublico } from '@/lib/platform/talleres/reserva-publica'

const EDICION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CODIGO_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TOKEN = 'T'.repeat(43)

const taller: TallerPublico = {
  slug: 'mujer-de-hoy',
  nombre: 'Mujer de Hoy',
  descripcion: null,
  pareja: false,
  vinculo: null,
  generoRequerido: 'Femenino',
  duracionMinutos: 90,
  ediciones: [
    {
      id: EDICION,
      fechaInicio: '2026-11-19',
      fechaFin: null,
      cierreInscripcion: null,
      lugar: 'Salón 4',
      clases: 6,
      hora: '19:00',
      cupo: 30,
      lugaresLibres: 6,
      lleno: false,
      facilitadores: [],
    },
    {
      id: OTRA,
      fechaInicio: '2026-11-21',
      fechaFin: null,
      cierreInscripcion: null,
      lugar: 'Salón 2',
      clases: 6,
      hora: '09:00',
      cupo: 30,
      lugaresLibres: 14,
      lleno: false,
      facilitadores: [],
    },
  ],
}

type Respuestas = Record<string, unknown[]>

function mockFetch(respuestas: Respuestas) {
  const llamadas: { ruta: string; cuerpo: Record<string, unknown> }[] = []
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const ruta = String(url).replace('/api/talleres/reserva/', '')
    llamadas.push({ ruta, cuerpo: JSON.parse(String(init?.body)) })
    const cola = respuestas[ruta] ?? []
    const r = cola.shift() ?? { estado: 'error' }
    return { json: async () => r } as Response
  }) as jest.Mock
  return llamadas
}

const abrir = () => render(<FlujoReserva taller={taller} edicionId={EDICION} abierto onAbiertoChange={() => {}} />)
const continuar = (nombre = 'Continuar') => fireEvent.click(screen.getByRole('button', { name: nombre }))

describe('FlujoReserva', () => {
  it('existing person: cédula → code → identity confirmed → request received', async () => {
    const llamadas = mockFetch({
      identificar: [{ estado: 'codigo', codigoId: CODIGO_ID, emailMascara: 'v***@g***.com' }],
      'codigo/verificar': [{ estado: 'ok', nombre: 'Valentina', token: TOKEN }],
      crear: [{ estado: 'ok', porVerificar: false, cuentaNueva: false }],
    })
    abrir()
    fireEvent.change(screen.getByLabelText('Cédula'), { target: { value: '15.598.745' } })
    continuar()

    expect(await screen.findByText('Revisa tu correo')).toBeInTheDocument()
    expect(screen.getByText('v***@g***.com')).toBeInTheDocument()
    expect(llamadas[0]).toEqual({ ruta: 'identificar', cuerpo: { edicionId: EDICION, slug: 'mujer-de-hoy', cedula: '15598745', sitio_web: '' } })

    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '042917' } })
    continuar('Verificar código')
    expect(await screen.findByText('¡Hola, Valentina!')).toBeInTheDocument()

    continuar('Enviar solicitud')
    expect(await screen.findByText('Solicitud recibida')).toBeInTheDocument()
    expect(screen.getByText('Pendiente de aprobación')).toBeInTheDocument()
    expect(screen.getByText('Síguela en la app')).toBeInTheDocument()
    expect(llamadas[2]).toEqual({ ruta: 'crear', cuerpo: { edicionId: EDICION, principal: { token: TOKEN }, sitio_web: '' } })
  })

  it('a wrong code shows the attempts left and stays on the code', async () => {
    mockFetch({
      identificar: [{ estado: 'codigo', codigoId: CODIGO_ID, emailMascara: 'v***@g***.com' }],
      'codigo/verificar': [{ estado: 'invalido', intentosRestantes: 4, mensaje: 'Ese código no coincide. Te quedan 4 intentos.' }],
    })
    abrir()
    fireEvent.change(screen.getByLabelText('Cédula'), { target: { value: '15598745' } })
    continuar()
    await screen.findByText('Revisa tu correo')
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '000000' } })
    continuar('Verificar código')
    expect(await screen.findByText('Ese código no coincide. Te quedan 4 intentos.')).toBeInTheDocument()
    expect(screen.getByText('Revisa tu correo')).toBeInTheDocument()
  })

  it('new person: the ficha is checked before sending, then the account invitation is announced', async () => {
    const llamadas = mockFetch({
      identificar: [{ estado: 'nuevo' }],
      crear: [{ estado: 'ok', porVerificar: false, cuentaNueva: true }],
    })
    abrir()
    fireEvent.change(screen.getByLabelText('Cédula'), { target: { value: '27441903' } })
    continuar()
    expect(await screen.findByText('Aún no estás en Global')).toBeInTheDocument()

    continuar('Enviar solicitud')
    expect(await screen.findByText('Revisa los datos marcados.')).toBeInTheDocument()
    expect(screen.getByText('Escribe el nombre.')).toBeInTheDocument()
    expect(llamadas.filter((l) => l.ruta === 'crear')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Daniela' } })
    fireEvent.change(screen.getByLabelText('Apellido'), { target: { value: 'Mujica' } })
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), { target: { value: '1995-04-02' } })
    fireEvent.change(screen.getByLabelText('Teléfono con WhatsApp'), { target: { value: '0414 123 4567' } })
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'daniela@example.com' } })
    fireEvent.click(screen.getByRole('checkbox'))
    continuar('Enviar solicitud')

    expect(await screen.findByText('Activa tu cuenta Global')).toBeInTheDocument()
    expect(screen.getByText('daniela@example.com')).toBeInTheDocument()
    const crear = llamadas.find((l) => l.ruta === 'crear')
    expect(crear?.cuerpo.principal).toEqual({
      ficha_nueva: {
        cedula: '27441903',
        nombre: 'Daniela',
        apellido: 'Mujica',
        fecha_nacimiento: '1995-04-02',
        telefono: '0414 123 4567',
        email: 'daniela@example.com',
        genero: 'Femenino',
      },
    })
  })

  it('full at send time: other horarios and avísame (S13)', async () => {
    const llamadas = mockFetch({
      identificar: [{ estado: 'codigo', codigoId: CODIGO_ID, emailMascara: null }],
      'codigo/verificar': [{ estado: 'ok', nombre: 'Valentina', token: TOKEN }],
      crear: [{ estado: 'cupo_lleno', mensaje: 'lleno' }],
      avisame: [{ estado: 'ok' }],
    })
    abrir()
    fireEvent.change(screen.getByLabelText('Cédula'), { target: { value: '15598745' } })
    continuar()
    await screen.findByText('Revisa tu correo')
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '042917' } })
    continuar('Verificar código')
    await screen.findByText('¡Hola, Valentina!')
    continuar('Enviar solicitud')

    expect(await screen.findByText('El jueves se llenó')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reservar el sábado' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'v@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Avísame' }))
    expect(await screen.findByText(/te avisamos a ti y a las demás personas anotadas/)).toBeInTheDocument()
    expect(llamadas.at(-1)).toEqual({ ruta: 'avisame', cuerpo: { edicionId: EDICION, nombre: 'Valentina', email: 'v@example.com', sitio_web: '' } })
  })
})
