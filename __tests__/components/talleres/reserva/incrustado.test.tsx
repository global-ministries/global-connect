/**
 * The embedded reservation (T6 of odd/tasks/talleres-reserva-publica.md,
 * S2 S18; design/talleres-reserva/07): `?embed=1` renders only the flow,
 * sends its height to the page that embeds it, closes the modal of
 * public/embed.js and keeps every link inside the embedded mode.
 */
import { fireEvent, render, screen } from '@testing-library/react'

import { TarjetaTaller } from '@/components/talleres/reserva/tarjeta-taller'
import { TallerIncrustado } from '@/components/talleres/reserva/taller-incrustado'
import { leerModoIncrustado, rutaCatalogoDe, rutaTallerDe, SIN_INCRUSTAR } from '@/components/talleres/reserva/modo-incrustado'
import type { EdicionPublica, TallerPublico } from '@/lib/platform/talleres/reserva-publica'

const EDICION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTRA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const edicion = (id: string, hora: string, lugar: string): EdicionPublica => ({
  id,
  fechaInicio: '2026-11-19',
  fechaFin: null,
  cierreInscripcion: null,
  lugar,
  clases: 6,
  hora,
  cupo: 30,
  lugaresLibres: 6,
  lleno: false,
  facilitadores: [],
})

const taller: TallerPublico = {
  slug: 'mujer-de-hoy',
  nombre: 'Mujer de Hoy',
  descripcion: null,
  pareja: false,
  vinculo: null,
  generoRequerido: 'Femenino',
  duracionMinutos: 90,
  ediciones: [edicion(EDICION, '19:00', 'Salón 4'), edicion(OTRA, '09:00', 'Salón 2')],
}

const TARJETA = leerModoIncrustado({ embed: '1' })
const MODAL = leerModoIncrustado({ embed: '1', modal: '1' })

const parentReal = window.parent
let postMessage: jest.Mock

beforeEach(() => {
  postMessage = jest.fn()
  // Inside an iframe: window.parent is the page that embeds it.
  Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage } })
})

afterEach(() => {
  Object.defineProperty(window, 'parent', { configurable: true, value: parentReal })
})

describe('leerModoIncrustado', () => {
  it('reads embed, modal, a valid edición and the way back from the query', () => {
    expect(leerModoIncrustado({})).toEqual(SIN_INCRUSTAR)
    expect(leerModoIncrustado({ embed: '0', modal: '1' })).toEqual(SIN_INCRUSTAR)
    expect(leerModoIncrustado({ embed: '1', modal: '1', edicion: EDICION, catalogo: '1' })).toEqual({
      incrustado: true,
      modal: true,
      edicion: EDICION,
      desdeCatalogo: true,
    })
    expect(leerModoIncrustado({ embed: '1', edicion: 'x' }).edicion).toBeNull()
  })

  it('keeps the embedded mode in the catalog and taller links', () => {
    expect(rutaCatalogoDe(SIN_INCRUSTAR)).toBe('/talleres/reservar')
    expect(rutaCatalogoDe(TARJETA)).toBe('/talleres/reservar?embed=1')
    expect(rutaTallerDe('parejas', TARJETA)).toBe('/talleres/reservar/parejas?embed=1&catalogo=1')
    expect(rutaTallerDe('parejas', MODAL)).toBe('/talleres/reservar/parejas?embed=1&modal=1&catalogo=1')
    render(<TarjetaTaller taller={taller} href={rutaTallerDe(taller.slug, TARJETA)} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/talleres/reservar/mujer-de-hoy?embed=1&catalogo=1')
  })
})

describe('TallerIncrustado', () => {
  it('as a card: the flow without the public header, starting on the horario, and its height to the parent', () => {
    render(<TallerIncrustado taller={taller} modo={TARJETA} />)

    expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Mujer de Hoy' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Elige tu horario' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cerrar la reserva' })).not.toBeInTheDocument()
    expect(postMessage).toHaveBeenCalledWith({ type: 'global-taller:resize', height: expect.any(Number) }, '*')
  })

  it('in the modal: the close button and Esc ask embed.js to close it', () => {
    render(<TallerIncrustado taller={taller} modo={MODAL} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar la reserva' }))
    expect(postMessage).toHaveBeenCalledWith({ type: 'global-taller:close' }, '*')

    postMessage.mockClear()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(postMessage).toHaveBeenCalledWith({ type: 'global-taller:close' }, '*')
  })

  it('a pinned edición shows only that horario and starts on the cédula', () => {
    render(<TallerIncrustado taller={taller} modo={leerModoIncrustado({ embed: '1', edicion: OTRA })} />)

    expect(screen.queryByRole('heading', { name: 'Elige tu horario' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Cédula')).toBeInTheDocument()
    expect(screen.getAllByText(/Salón 2/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Salón 4/)).not.toBeInTheDocument()
  })

  it('opens the member app in a new tab and keeps "Ver otros talleres" embedded', async () => {
    const respuestas: Record<string, unknown> = {
      identificar: { estado: 'codigo', codigoId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', emailMascara: 'v***@g***.com' },
      'codigo/verificar': { estado: 'ok', nombre: 'Valentina', token: 'T'.repeat(43) },
      crear: { estado: 'ya_inscrito' },
    }
    global.fetch = jest.fn(async (url: RequestInfo | URL) => ({
      json: async () => respuestas[String(url).replace('/api/talleres/reserva/', '')],
    }) as Response) as jest.Mock
    render(<TallerIncrustado taller={taller} modo={leerModoIncrustado({ embed: '1', edicion: EDICION })} />)
    fireEvent.change(screen.getByLabelText('Cédula'), { target: { value: '15.598.745' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.change(await screen.findByLabelText('Código de 6 dígitos'), { target: { value: '042917' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verificar código' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar solicitud' }))

    const app = await screen.findByRole('link', { name: 'Ver en la app' })
    expect(app).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'Ver otros talleres' })).toHaveAttribute('href', '/talleres/reservar?embed=1')
  })
})
