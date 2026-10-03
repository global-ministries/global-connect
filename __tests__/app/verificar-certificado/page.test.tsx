/**
 * @jest-environment node
 *
 * The public verification page looks the certificate up in-process through
 * the shared server function. It must not fetch its own API, so it works
 * without NEXT_PUBLIC_BASE_URL / VERCEL_URL being set or well-formed.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import VerificarCertificadoPage from '@/app/verificar-certificado/[codigo]/page'

jest.mock('@/lib/platform/talleres/verificar-certificado', () => ({
  verifyPublicCertificate: jest.fn(),
}))

const verifyPublicCertificateMock = jest.requireMock('@/lib/platform/talleres/verificar-certificado')
  .verifyPublicCertificate as jest.Mock

const VALID_CODE = 'abcdefghijkmnpqr'
const ORIGINAL_ENV = process.env

async function renderPage(codigo: string) {
  const element = await VerificarCertificadoPage({ params: Promise.resolve({ codigo }) })
  return renderToStaticMarkup(element)
}

let fetchSpy: jest.SpyInstance

beforeEach(() => {
  verifyPublicCertificateMock.mockReset()
  process.env = { ...ORIGINAL_ENV }
  delete process.env['NEXT_PUBLIC_BASE_URL']
  delete process.env['VERCEL_URL']
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('the page must not fetch'))
})

afterEach(() => {
  fetchSpy.mockRestore()
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('VerificarCertificadoPage', () => {
  it('shows a valid certificate without any base URL configured and without fetching', async () => {
    verifyPublicCertificateMock.mockResolvedValue({
      valid: true,
      taller_title: 'Finanzas con Propósito',
      participant_name: 'Ana Pérez',
      partner_name: null,
      completion_date: '2026-05-01',
      signers: ['Pastor Juan'],
    })

    const html = await renderPage(VALID_CODE)

    expect(verifyPublicCertificateMock).toHaveBeenCalledWith(VALID_CODE)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(html).toContain('Certificado válido')
    expect(html).toContain('Finanzas con Propósito')
    expect(html).toContain('Ana Pérez')
    expect(html).toContain('Pastor Juan')
    expect(html).not.toContain('Junto a')
  })

  // T2c (odd/tasks/talleres-cierre-de-edicion.md) — a couple's certificate
  // names the partner, same copy as the authenticated certificate page.
  it("shows the partner on a couple's certificate", async () => {
    verifyPublicCertificateMock.mockResolvedValue({
      valid: true,
      taller_title: 'Matrimonio sobre la Roca',
      participant_name: 'Ana Pérez',
      partner_name: 'Luis Gómez',
      completion_date: '2026-05-01',
      signers: [],
    })

    const html = await renderPage(VALID_CODE)

    expect(html).toContain('Junto a Luis Gómez')
  })

  it('shows the neutral not-found message for an unknown or revoked certificate', async () => {
    verifyPublicCertificateMock.mockResolvedValue({ valid: false, reason: 'not-found' })

    const html = await renderPage(VALID_CODE)

    expect(html).toContain('Certificado no encontrado o revocado.')
    expect(html).not.toContain('Certificado válido')
  })

  it('shows the neutral not-found message when the lookup throws', async () => {
    verifyPublicCertificateMock.mockRejectedValue(new Error('supabaseUrl is required.'))

    const html = await renderPage(VALID_CODE)

    expect(html).toContain('Certificado no encontrado o revocado.')
    expect(html).not.toContain('supabaseUrl')
  })
})
