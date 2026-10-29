/**
 * The Niños link/toggle tabs copy the TabsSistema segmented look (T7c of
 * odd/tasks/sistema-diseno-v2.md): inverted active tab, no orange, no blur.
 */
import { clasePestana, LISTA_PESTANAS } from '@/components/ninos/pestanas-sistema'

describe('pestanas-sistema', () => {
  it('uses the segmented list surface without blur', () => {
    expect(LISTA_PESTANAS).toBe('inline-flex items-center rounded-xl border border-border bg-card p-[3px]')
  })

  it('inverts the active tab and mutes the inactive one', () => {
    const activa = clasePestana(true)
    expect(activa).toContain('bg-foreground text-background')
    expect(activa).toContain('pointer-coarse:min-h-11')
    expect(activa).not.toMatch(/orange|text-white/)

    const inactiva = clasePestana(false)
    expect(inactiva).toContain('text-muted-foreground hover:text-foreground')
    expect(inactiva).not.toContain('bg-foreground')
  })
})
