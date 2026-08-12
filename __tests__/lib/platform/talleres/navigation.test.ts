/**
 * PR17 — DT-071 — Pure helper tests for talleres navigation.
 *
 * Tests the data layer (getTalleresNavItems, groupTalleresNavItems,
 * TALLERES_NAV_ITEMS table invariants, resolveTalleresNavViewItems).
 * Hook tests live in a separate file using @jest-environment node.
 */

import {
  TALLERES_NAV_ITEMS,
  getTalleresNavItems,
  type TalleresNavItemId,
} from '@/lib/platform/talleres/route-access'
import {
  groupTalleresNavItems,
} from '@/lib/platform/talleres/navigation'
import {
  resolveTalleresNavViewItems,
} from '@/components/ui/platform-talleres-navigation-view-items'

// ─── getTalleresNavItems — capability filter ──────────────────────────────

describe('getTalleresNavItems — capability filter', () => {
  it('participante sees only P items when they hold participation.read', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.participation.read'],
      { isEnabled: true },
    )
    expect(items.length).toBe(4)
    expect(items.every((i) => i.id.startsWith('talleres_participante_'))).toBe(true)
  })

  it('lider sees L items (Mis-Grupos, Próximas Sesiones, Recursos)', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.lead.read'],
      { isEnabled: true },
    )
    expect(items.map((i) => i.id)).toEqual([
      'talleres_grupos_mis_grupos',
      'talleres_sesiones_proximas',
      'talleres_recursos',
    ])
  })

  it('coordinador sees only C items', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.coordinator.read'],
      { isEnabled: true },
    )
    expect(items.length).toBe(5)
    expect(items.every((i) => i.id.startsWith('talleres_coordinacion_'))).toBe(true)
  })

  it('director sees all read items via director.read superset', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.director.read'],
      { isEnabled: true },
    )
    // 4 P + 3 L + 5 C + 7 D = 19
    expect(items.length).toBe(19)
    expect(items.map((i) => i.id)).toContain('talleres_participante_explorar')
    expect(items.map((i) => i.id)).toContain('talleres_grupos_mis_grupos')
    expect(items.map((i) => i.id)).toContain('talleres_coordinacion_resumen')
    expect(items.map((i) => i.id)).toContain('talleres_direccion_resumen_global')
  })

  it('metrics.read holder sees the metricas item (not other director items)', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.metrics.read'],
      { isEnabled: true },
    )
    expect(items.map((i) => i.id)).toEqual(['talleres_direccion_metricas'])
  })

  it('user with no capabilities sees nothing', () => {
    expect(getTalleresNavItems([], { isEnabled: true })).toEqual([])
  })
})

describe('getTalleresNavItems — kill switch', () => {
  it('returns empty array when feature flag is off, regardless of caps', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.director.read'],
      { isEnabled: false },
    )
    expect(items).toEqual([])
  })
})

describe('getTalleresNavItems — multi-role union', () => {
  it('user with participation + lead caps sees P + L groups (union)', () => {
    const items = getTalleresNavItems(
      [
        'talleres_crecimiento.participation.read',
        'talleres_crecimiento.lead.read',
      ],
      { isEnabled: true },
    )
    expect(items.length).toBe(4 + 3)
    expect(items.map((i) => i.id)).toContain('talleres_participante_explorar')
    expect(items.map((i) => i.id)).toContain('talleres_grupos_mis_grupos')
  })

  it('user with P + C + D caps sees all groups (director.read superset covers L too)', () => {
    const items = getTalleresNavItems(
      [
        'talleres_crecimiento.participation.read',
        'talleres_crecimiento.coordinator.read',
        'talleres_crecimiento.director.read',
      ],
      { isEnabled: true },
    )
    // 4 P + 3 L (via director.read superset) + 5 C + 7 D = 19
    expect(items.length).toBe(19)
  })

  it('canonical order is preserved (matches TALLERES_NAV_ITEMS order)', () => {
    const items = getTalleresNavItems(
      [
        'talleres_crecimiento.participation.read',
        'talleres_crecimiento.lead.read',
        'talleres_crecimiento.coordinator.read',
      ],
      { isEnabled: true },
    )
    const orderInTable = TALLERES_NAV_ITEMS.map((i) => i.id)
    const returnedOrder = items.map((i) => i.id)
    let cursor = 0
    for (const id of returnedOrder) {
      while (cursor < orderInTable.length && orderInTable[cursor] !== id) cursor++
      expect(cursor).toBeLessThan(orderInTable.length)
      cursor++
    }
  })
})

// ─── groupTalleresNavItems — role grouping ────────────────────────────────

describe('groupTalleresNavItems — role grouping', () => {
  it('groups items by P/L/C/D with correct titles', () => {
    const items = getTalleresNavItems(
      [
        'talleres_crecimiento.participation.read',
        'talleres_crecimiento.lead.read',
        'talleres_crecimiento.coordinator.read',
        'talleres_crecimiento.director.read',
      ],
      { isEnabled: true },
    )
    const groups = groupTalleresNavItems(items)
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]))

    expect(groups.length).toBeGreaterThanOrEqual(4)
    expect(byId['P']?.title).toBe('Para Mí')
    expect(byId['L']?.title).toBe('Como Líder')
    expect(byId['C']?.title).toBe('Coordinación')
    expect(byId['D']?.title).toBe('Dirección')
  })

  it('omits groups with zero items', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.participation.read'],
      { isEnabled: true },
    )
    const groups = groupTalleresNavItems(items)
    expect(groups.length).toBe(1)
    expect(groups[0]?.id).toBe('P')
  })

  it('preserves canonical order within each group', () => {
    const items = getTalleresNavItems(
      [
        'talleres_crecimiento.participation.read',
        'talleres_crecimiento.lead.read',
      ],
      { isEnabled: true },
    )
    const groups = groupTalleresNavItems(items)
    const pGroup = groups.find((g) => g.id === 'P')
    const lGroup = groups.find((g) => g.id === 'L')
    expect(pGroup?.items.map((i) => i.id)).toEqual([
      'talleres_participante_explorar',
      'talleres_participante_mis_talleres',
      'talleres_participante_historial',
      'talleres_participante_certificados',
    ])
    expect(lGroup?.items.map((i) => i.id)).toEqual([
      'talleres_grupos_mis_grupos',
      'talleres_sesiones_proximas',
      'talleres_recursos',
    ])
  })
})

// ─── Resolver (SSR / RSC variant) ──────────────────────────────────────────

describe('resolveTalleresNavViewItems — SSR / RSC variant', () => {
  it('returns grouped items synchronously when flag is on', () => {
    const groups = resolveTalleresNavViewItems({
      sessionCapabilities: ['talleres_crecimiento.participation.read'],
      isEnabled: true,
    })
    expect(groups.length).toBe(1)
    expect(groups[0]?.id).toBe('P')
  })

  it('returns empty when flag is off (kill switch wins)', () => {
    const groups = resolveTalleresNavViewItems({
      sessionCapabilities: ['talleres_crecimiento.director.read'],
      isEnabled: false,
    })
    expect(groups).toEqual([])
  })
})

// ─── Table invariants ─────────────────────────────────────────────────────

describe('TALLERES_NAV_ITEMS — table invariants', () => {
  it('every item id is unique', () => {
    const ids = TALLERES_NAV_ITEMS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every required capability is a valid talleres_crecimiento capability', () => {
    const capPattern = /^talleres_crecimiento\.[a-z._]+$/
    for (const item of TALLERES_NAV_ITEMS) {
      expect(item.requiredCapability).toMatch(capPattern)
    }
  })

  it('every href starts with /talleres/', () => {
    for (const item of TALLERES_NAV_ITEMS) {
      expect(item.href.startsWith('/talleres/')).toBe(true)
    }
  })

  it('every TalleresNavItemId is mapped to a role group', () => {
    const allIds = new Set<TalleresNavItemId>(
      TALLERES_NAV_ITEMS.map((i) => i.id) as TalleresNavItemId[],
    )
    expect(allIds.size).toBe(TALLERES_NAV_ITEMS.length)
    const groupPrefixes = [
      'talleres_participante_',
      'talleres_grupos_',
      'talleres_sesiones_',
      'talleres_recursos',
      'talleres_coordinacion_',
      'talleres_direccion_',
    ]
    for (const id of allIds) {
      const matches = groupPrefixes.some((p) => id.startsWith(p))
      expect(matches).toBe(true)
    }
  })
})
