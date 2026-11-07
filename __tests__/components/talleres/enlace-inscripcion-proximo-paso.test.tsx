/**
 * @jest-environment jsdom
 *
 * T2 (odd/tasks/proximo-paso.md, S3) — on the Próximo Paso taller page a
 * director gets the public URL of the QR page, a copy button and the QR
 * itself (qrcode, already a dependency) to put on the announcement.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { EnlaceInscripcionProximoPaso } from '@/components/talleres/enlace-inscripcion-proximo-paso'

const writeText = jest.fn()
const qrSvg = jest.fn()

// qrcode needs TextEncoder, which jsdom lacks; the poster's own helper is mocked, the base URL rule is real.
jest.mock('@/lib/platform/ninos/cartel', () => ({
  ...jest.requireActual('@/lib/platform/ninos/cartel'),
  qrSvg: (texto: string) => qrSvg(texto),
}))

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  qrSvg.mockReset().mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
  Object.assign(navigator, { clipboard: { writeText } })
  process.env.NEXT_PUBLIC_SITE_URL = 'https://global.test/'
})

it('shows the public URL and copies it', async () => {
  render(<EnlaceInscripcionProximoPaso />)

  expect(screen.getByRole('heading', { name: 'Enlace de inscripción' })).toBeInTheDocument()
  expect(await screen.findByText('https://global.test/proximo-paso')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }))

  await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://global.test/proximo-paso'))
  expect(await screen.findByText('Enlace copiado')).toBeInTheDocument()
})

it('renders the QR of that URL with a download link', async () => {
  render(<EnlaceInscripcionProximoPaso />)

  const qr = await screen.findByRole('img', { name: 'Código QR de https://global.test/proximo-paso' })
  expect(qrSvg).toHaveBeenCalledWith('https://global.test/proximo-paso')
  expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
  expect(screen.getByRole('link', { name: 'Descargar QR' })).toHaveAttribute('download', 'proximo-paso-qr.svg')
})

it('says so when the copy fails', async () => {
  writeText.mockRejectedValue(new Error('denied'))
  render(<EnlaceInscripcionProximoPaso />)
  await screen.findByText('https://global.test/proximo-paso')

  fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }))

  expect(await screen.findByText('No se pudo copiar. Selecciona el enlace y cópialo.')).toBeInTheDocument()
})
