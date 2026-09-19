/**
 * @jest-environment node
 *
 * PR17 — DT-071 (resolver variant) — resolver-only smoke test.
 *
 * The full hook behavior is verified in `navigation.test.ts` via the
 * `resolveTalleresNavViewItems` SSR/RSC variant. This file exists to
 * document the resolver as the canonical SSR entry-point without
 * pulling in @testing-library/react (which requires jsdom).
 */

import {
  resolveTalleresNavViewItems,
} from '@/components/ui/platform-talleres-navigation-view-items'

describe('resolveTalleresNavViewItems — SSR/RSC smoke', () => {
  it('renders P group when only participation.read is held', () => {
    const groups = resolveTalleresNavViewItems({
      sessionCapabilities: ['talleres_crecimiento.participation.read'],
      isEnabled: true,
    })
    expect(groups.map((g) => g.id)).toEqual(['P'])
  })

  it('renders the P group (always) + only the D group when director.read is held (PR H — no L/C superset)', () => {
    const groups = resolveTalleresNavViewItems({
      sessionCapabilities: ['talleres_crecimiento.director.read'],
      isEnabled: true,
    })
    // PR H — the director.read → L/C superset is gone; a pure director
    // sees only the Dirección group besides P. odd/tasks/talleres-
    // autoinscripcion.md criterion 7 — P is now open to any authenticated
    // caller, so it rides along even without participation.read.
    expect(groups.map((g) => g.id)).toEqual(['P', 'D'])
  })

  it('returns empty when feature flag is off', () => {
    expect(
      resolveTalleresNavViewItems({
        sessionCapabilities: ['talleres_crecimiento.director.read'],
        isEnabled: false,
      }),
    ).toEqual([])
  })
})
