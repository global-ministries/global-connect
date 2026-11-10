/**
 * "Compartir" of a taller (T6 of odd/tasks/talleres-reserva-publica.md,
 * S2 S18; design/talleres-reserva/08): public link with copy and QR, the
 * embed snippet per mode and edición, the live preview and the notice for a
 * taller that is not public yet.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'

import { CompartirTaller } from '@/components/talleres/compartir/compartir-taller'
import { codigoIncrustar, urlVistaPrevia } from '@/components/talleres/compartir/codigo-incrustar'

jest.mock('qrcode', () => ({
  toString: jest.fn(async () => '<svg data-testid="qr"></svg>'),
  toDataURL: jest.fn(async () => 'data:image/png;base64,AAAA'),
}))

const notificar = { success: jest.fn(), error: jest.fn() }
jest.mock('@/hooks/use-notificaciones', () => ({ useNotificaciones: () => notificar }))

const BASE = 'https://miembros.yosoyglobal.org'
const EDICION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EMBED = `<script src="${BASE}/embed.js" async></script>`

describe('codigoIncrustar', () => {
  it('writes the snippet of each mode for embed.js', () => {
    const base = { base: `${BASE}/`, slug: 'mujer-de-hoy', nombre: 'Mujer de Hoy', edicion: null }

    expect(codigoIncrustar({ ...base, modo: 'modal' })).toBe(
      `${EMBED}\n<a href="${BASE}/talleres/reservar/mujer-de-hoy" data-global-taller="mujer-de-hoy" data-modo="modal">Reservar mi lugar</a>`,
    )
    expect(codigoIncrustar({ ...base, modo: 'tarjeta', edicion: EDICION })).toBe(
      `${EMBED}\n<a href="${BASE}/talleres/reservar/mujer-de-hoy" data-global-taller="mujer-de-hoy" data-modo="tarjeta" data-edicion="${EDICION}">Mujer de Hoy</a>`,
    )
    expect(codigoIncrustar({ ...base, modo: 'catalogo', edicion: EDICION })).toBe(
      `${EMBED}\n<a href="${BASE}/talleres/reservar" data-global-taller="" data-modo="catalogo">Grupos de Corto Plazo</a>`,
    )
    expect(codigoIncrustar({ ...base, nombre: 'Hombres <& "Padres">', modo: 'tarjeta' })).toContain('>Hombres &lt;&amp; &quot;Padres&quot;&gt;</a>')
  })

  it('previews the same embedded page embed.js would load', () => {
    expect(urlVistaPrevia({ slug: 'parejas', modo: 'modal', edicion: null })).toBe('/talleres/reservar/parejas?embed=1&modal=1')
    expect(urlVistaPrevia({ slug: 'parejas', modo: 'tarjeta', edicion: EDICION })).toBe(`/talleres/reservar/parejas?embed=1&edicion=${EDICION}`)
    expect(urlVistaPrevia({ slug: 'parejas', modo: 'catalogo', edicion: EDICION })).toBe('/talleres/reservar?embed=1')
  })
})

describe('CompartirTaller', () => {
  const props = {
    base: BASE,
    slug: 'mujer-de-hoy',
    nombre: 'Mujer de Hoy',
    publico: true,
    ediciones: [{ id: EDICION, nombre: 'Mujer de Hoy · enero 2027' }],
  }
  const codigo = () => screen.getByLabelText('Código para incrustar').textContent
  const vista = () => screen.getByTitle(/Vista previa/)

  beforeEach(() => {
    notificar.success.mockClear()
    Object.assign(navigator, { clipboard: { writeText: jest.fn(async () => undefined) } })
  })

  it('copies the public link and draws its QR', async () => {
    render(<CompartirTaller {...props} />)

    expect(screen.getByRole('textbox', { name: 'Enlace público' })).toHaveValue(`${BASE}/talleres/reservar/mujer-de-hoy`)
    expect(await screen.findByTestId('qr')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' })))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${BASE}/talleres/reservar/mujer-de-hoy`)
    expect(notificar.success).toHaveBeenCalledWith('Enlace copiado')
  })

  it('changes the snippet and the preview with the mode and the edición, and copies the snippet', async () => {
    render(<CompartirTaller {...props} />)
    expect(screen.getByRole('button', { name: 'Botón con ventana' })).toHaveAttribute('aria-pressed', 'true')
    expect(vista()).toHaveAttribute('src', '/talleres/reservar/mujer-de-hoy?embed=1&modal=1')

    fireEvent.click(screen.getByRole('button', { name: 'Tarjeta incrustada' }))
    fireEvent.click(screen.getByLabelText('Mujer de Hoy · enero 2027'))
    expect(codigo()).toContain(`data-modo="tarjeta" data-edicion="${EDICION}"`)
    expect(vista()).toHaveAttribute('src', `/talleres/reservar/mujer-de-hoy?embed=1&edicion=${EDICION}`)

    fireEvent.click(screen.getByRole('button', { name: 'Solo el catálogo' }))
    expect(screen.queryByText('Qué edición mostrar')).not.toBeInTheDocument()
    expect(codigo()).toContain('data-modo="catalogo"')

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copiar código' })))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(codigo())
    expect(screen.getByText('Funciona en cualquier sitio web donde lo pegues.')).toBeInTheDocument()
  })

  it('warns when the taller is not public yet and holds the preview', async () => {
    render(<CompartirTaller {...props} publico={false} />)

    expect(screen.getByText('Este taller no aparece en la página pública todavía.')).toBeInTheDocument()
    expect(screen.queryByTitle(/Vista previa/)).not.toBeInTheDocument()
    expect(screen.getByText('La vista previa aparece cuando el taller sea público')).toBeInTheDocument()
    await screen.findByTestId('qr')
  })

  it('does not warn for a public taller', async () => {
    render(<CompartirTaller {...props} />)

    expect(screen.queryByText('Este taller no aparece en la página pública todavía.')).not.toBeInTheDocument()
    await screen.findByTestId('qr')
  })
})
