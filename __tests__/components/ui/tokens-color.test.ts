/**
 * Readable status text tokens and the brand color token (docs/design-system.md).
 * The fill tokens (`--warning`…) are not text-safe; `--*-text` are tuned to
 * at least 4.5:1 on cards, the page and their own tint (10% light, 13% dark).
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

function bloque(selector: string): string {
  const inicio = css.indexOf(`${selector} {`)
  expect(inicio).toBeGreaterThanOrEqual(0)
  return css.slice(inicio, css.indexOf('\n}', inicio))
}

const TEXTOS = ['success', 'warning', 'info', 'danger', 'brand'] as const

describe('color tokens', () => {
  it.each(TEXTOS)('%s has a text token in light and dark', (nombre) => {
    expect(bloque(':root')).toContain(`--${nombre}-text: oklch(`)
    expect(bloque('.dark')).toContain(`--${nombre}-text: oklch(`)
    expect(bloque('@theme inline')).toContain(`--color-${nombre}-text: var(--${nombre}-text);`)
  })

  it('exposes the brand orange to Tailwind', () => {
    const tema = bloque('@theme inline')
    expect(tema).toContain('--color-brand: var(--brand-primary);')
    expect(tema).toContain('--color-brand-foreground: var(--brand-primary-foreground);')
    expect(tema).toContain('--color-brand-tint: var(--brand-accent-strong);')
  })
})
