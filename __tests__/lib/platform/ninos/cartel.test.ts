/**
 * @jest-environment node
 *
 * N8 — QR poster: the registration URL and its server-rendered SVG.
 */
import { qrSvg, urlBaseCartel, urlRegistro } from '@/lib/platform/ninos/cartel'

describe('cartel', () => {
  it('builds the public registration URL, with the campus when given', () => {
    expect(urlRegistro('https://app.test/', null)).toBe('https://app.test/ninos/registro')
    expect(urlRegistro('https://app.test', 'c1')).toBe('https://app.test/ninos/registro?campus=c1')
  })
  it('prefers NEXT_PUBLIC_SITE_URL, then the request origin', () => {
    expect(urlBaseCartel({ NEXT_PUBLIC_SITE_URL: 'https://site.test/' }, 'https://req.test')).toBe('https://site.test')
    expect(urlBaseCartel({}, 'https://req.test')).toBe('https://req.test')
  })
  it('renders an SVG QR', async () => {
    const svg = await qrSvg('https://app.test/ninos/registro')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('<path')
  })
})
