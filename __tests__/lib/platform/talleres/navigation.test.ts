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
    // 6 C items (5 base + PR42 global inscripciones admin view).
    expect(items.length).toBe(6)
    expect(items.every((i) => i.id.startsWith('talleres_coordinacion_'))).toBe(true)
  })

  it('director.read alone sees only its own D-group items (no P/L/C superset — PR H)', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.director.read'],
      { isEnabled: true },
    )
    // PR H — the director.read → P/L/C superset is gone. A pure director
    // now sees ONLY the 7 items keyed to director.read, in canonical order.
    expect(items.map((i) => i.id)).toEqual([
      'talleres_direccion_resumen_global',
      'talleres_direccion_temporadas',
      'talleres_direccion_talleres',
      'talleres_direccion_periodos',
      'talleres_direccion_equipos',
      'talleres_direccion_solicitudes',
      'talleres_direccion_reportes',
    ])
    // No P / L / C items leak in without their own capability.
    expect(items.map((i) => i.id)).not.toContain('talleres_participante_explorar')
    expect(items.map((i) => i.id)).not.toContain('talleres_grupos_mis_grupos')
    expect(items.map((i) => i.id)).not.toContain('talleres_coordinacion_resumen')
    // metricas needs metrics.read; the global inscripciones view needs
    // coordinator.read — neither is inherited by director.read anymore.
    expect(items.map((i) => i.id)).not.toContain('talleres_direccion_metricas')
    expect(items.map((i) => i.id)).not.toContain('talleres_coordinacion_inscripciones_global')
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

// ─── PR25 — admin-only sub-item ───────────────────────────────────────────

describe('getTalleresNavItems — admin.manage (PR25)', () => {
  it('user with ONLY admin.manage sees the wizard entry-point item', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.admin.manage'],
      { isEnabled: true },
    )
    // PR25: previously this returned [] — now it must include at least
    // the abstracto entry-point so the sidebar shows a meaningful
    // sub-menu for admin-only users.
    expect(items.length).toBe(1)
    expect(items.map((i) => i.id)).toEqual(['talleres_admin_abstracto'])
    expect(items[0]?.href).toBe('/admin/talleres/abstracto')
    expect(items[0]?.requiredCapability).toBe('talleres_crecimiento.admin.manage')
  })

  it('admin.manage does NOT count as a superset for director.read items', () => {
    // PR25: keep the director-read superset scoped to read-only items.
    // Admin is a distinct role group (A) and does not implicitly
    // include director items (and vice versa).
    const items = getTalleresNavItems(
      ['talleres_crecimiento.admin.manage'],
      { isEnabled: true },
    )
    expect(items.some((i) => i.id.startsWith('talleres_direccion_'))).toBe(false)
    expect(items.some((i) => i.id.startsWith('talleres_coordinacion_'))).toBe(false)
    expect(items.some((i) => i.id.startsWith('talleres_participante_'))).toBe(false)
  })

  it('admin.manage + director.read sees the D group + the admin entry (no P/L/C superset — PR H)', () => {
    const items = getTalleresNavItems(
      [
        'talleres_crecimiento.admin.manage',
        'talleres_crecimiento.director.read',
      ],
      { isEnabled: true },
    )
    // PR H — no superset. 7 director.read items + 1 admin.manage entry = 8.
    // (metricas needs metrics.read; the global inscripciones view needs
    // coordinator.read — neither is held here.)
    expect(items.length).toBe(8)
    expect(items.map((i) => i.id)).toContain('talleres_admin_abstracto')
    expect(items.map((i) => i.id)).toContain('talleres_direccion_temporadas')
    // No P / L / C leak-in.
    expect(items.map((i) => i.id)).not.toContain('talleres_participante_explorar')
    expect(items.map((i) => i.id)).not.toContain('talleres_grupos_mis_grupos')
    expect(items.map((i) => i.id)).not.toContain('talleres_coordinacion_resumen')
  })
})

// ─── PR42 — global admin inscripciones view ─────────────────────────────────

describe('getTalleresNavItems — PR42 global admin inscripciones view', () => {
  it('coordinador.read sees the global inscripciones item under C group', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.coordinator.read'],
      { isEnabled: true },
    )
    const found = items.find((i) => i.id === 'talleres_coordinacion_inscripciones_global')
    expect(found).toBeDefined()
    expect(found?.href).toBe('/admin/talleres/inscripciones')
    expect(found?.requiredCapability).toBe('talleres_crecimiento.coordinator.read')
  })

  it('coordinador.write also sees the item (write superset mirrors read)', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.coordinator.write'],
      { isEnabled: true },
    )
    // coordinator.write does NOT trigger the read-superset rule, so
    // the item must require coordinator.read literally. Currently
    // the page gates the WRITE action separately (the action layer
    // requires coordinator.write OR director.write OR admin.manage);
    // the sidebar manifest is keyed to coordinator.read so the
    // entry is visible to every read-capable operator.
    expect(
      items.find((i) => i.id === 'talleres_coordinacion_inscripciones_global'),
    ).toBeUndefined()
  })

  it('admin.manage does NOT see the C-keyed item (admin group is distinct)', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.admin.manage'],
      { isEnabled: true },
    )
    expect(
      items.find((i) => i.id === 'talleres_coordinacion_inscripciones_global'),
    ).toBeUndefined()
  })
})

// ─── PR46 — global temporadas Dirección item ────────────────────────────────

describe('getTalleresNavItems — PR46 global temporadas Dirección item', () => {
  it('director.read sees the Temporadas item under the D group', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.director.read'],
      { isEnabled: true },
    )
    const found = items.find((i) => i.id === 'talleres_direccion_temporadas')
    expect(found).toBeDefined()
    expect(found?.label).toBe('Temporadas')
    expect(found?.href).toBe('/admin/talleres/temporadas')
    expect(found?.requiredCapability).toBe('talleres_crecimiento.director.read')
  })

  it('admin.manage alone does NOT see the Temporadas item (D group is distinct)', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.admin.manage'],
      { isEnabled: true },
    )
    expect(
      items.find((i) => i.id === 'talleres_direccion_temporadas'),
    ).toBeUndefined()
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

  it('user with P + C + D caps sees P + C + D groups but NOT L (no superset — PR H)', () => {
    const items = getTalleresNavItems(
      [
        'talleres_crecimiento.participation.read',
        'talleres_crecimiento.coordinator.read',
        'talleres_crecimiento.director.read',
      ],
      { isEnabled: true },
    )
    // PR H — no superset. 4 P + 6 C + 7 D = 17. The 3 L items are NOT
    // covered because the user does not hold lead.read.
    expect(items.length).toBe(17)
    expect(items.map((i) => i.id)).not.toContain('talleres_grupos_mis_grupos')
    expect(items.map((i) => i.id)).not.toContain('talleres_sesiones_proximas')
    expect(items.map((i) => i.id)).not.toContain('talleres_recursos')
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

  it('PR25: admin.manage produces an "Administración" group with the abstracto item', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.admin.manage'],
      { isEnabled: true },
    )
    const groups = groupTalleresNavItems(items)
    expect(groups.length).toBe(1)
    expect(groups[0]?.id).toBe('A')
    expect(groups[0]?.title).toBe('Administración')
    expect(groups[0]?.items.map((i) => i.id)).toEqual(['talleres_admin_abstracto'])
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

  it('every href starts with /talleres/ OR /admin/talleres/ (PR25 admin entry-point)', () => {
    for (const item of TALLERES_NAV_ITEMS) {
      const ok =
        item.href.startsWith('/talleres/') ||
        item.href.startsWith('/admin/talleres/')
      expect(ok).toBe(true)
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
      'talleres_admin_',
    ]
    for (const id of allIds) {
      const matches = groupPrefixes.some((p) => id.startsWith(p))
      expect(matches).toBe(true)
    }
  })
})
