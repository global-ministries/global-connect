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

  it('lider sees P (always) + L items (Mis-Grupos, Próximas Sesiones)', () => {
    // Criterion 7 — the P group is open to any authenticated caller, so it
    // rides along with every other role group now, not just a bare [].
    // T0 — Recursos is deleted (placeholder screen with no real data).
    const items = getTalleresNavItems(
      ['talleres_crecimiento.lead.read'],
      { isEnabled: true },
    )
    expect(items.map((i) => i.id)).toEqual([
      'talleres_participante_explorar',
      'talleres_participante_mis_talleres',
      'talleres_participante_historial',
      'talleres_participante_certificados',
      'talleres_grupos_mis_grupos',
      'talleres_sesiones_proximas',
    ])
  })

  it('coordinador sees P (always) + C items', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.coordinator.read'],
      { isEnabled: true },
    )
    // 4 P (criterion 7) + 5 C items. Finding #5 — the global inscripciones
    // view is now admin-keyed (moved out of Coordinación), so a pure
    // coordinador still does not see it.
    expect(items.length).toBe(4 + 5)
    expect(
      items.every(
        (i) =>
          i.id.startsWith('talleres_participante_') ||
          i.id.startsWith('talleres_coordinacion_'),
      ),
    ).toBe(true)
  })

  it('director.read alone sees P (always) + only its own D-group items (no L/C superset — PR H)', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.director.read'],
      { isEnabled: true },
    )
    // PR H — the director.read → L/C superset is gone. A pure director
    // sees the 4 P items (criterion 7 — always present) + the 7 items
    // keyed to director.read, in canonical order.
    expect(items.map((i) => i.id)).toEqual([
      'talleres_participante_explorar',
      'talleres_participante_mis_talleres',
      'talleres_participante_historial',
      'talleres_participante_certificados',
      'talleres_direccion_resumen_global',
      'talleres_direccion_temporadas',
      'talleres_direccion_talleres',
      'talleres_direccion_periodos',
      'talleres_direccion_equipos',
      'talleres_direccion_solicitudes',
      'talleres_direccion_reportes',
    ])
    // No L / C items leak in without their own capability.
    expect(items.map((i) => i.id)).not.toContain('talleres_grupos_mis_grupos')
    expect(items.map((i) => i.id)).not.toContain('talleres_coordinacion_resumen')
    // metricas needs metrics.read; the global inscripciones view is now
    // admin-keyed (admin.manage) — neither is inherited by director.read.
    expect(items.map((i) => i.id)).not.toContain('talleres_direccion_metricas')
    expect(items.map((i) => i.id)).not.toContain('talleres_admin_inscripciones_global')
  })

  it('metrics.read holder sees P (always) + talleres_pendientes (T6) + talleres_reportes (T7, both shared C/D items) + the metricas item', () => {
    // T6 (odd/tasks/talleres-consolidar-pantallas.md) — talleres_pendientes
    // (/talleres/pendientes) is keyed to metrics.read: the one capability
    // BOTH coordinador and director are auto-granted, so one nav item
    // (one href -> one requiredCapability) can gate a page meant for
    // either role. T7 — talleres_reportes (/talleres/reportes) reuses the
    // exact same reasoning.
    const items = getTalleresNavItems(
      ['talleres_crecimiento.metrics.read'],
      { isEnabled: true },
    )
    expect(items.map((i) => i.id)).toEqual([
      'talleres_participante_explorar',
      'talleres_participante_mis_talleres',
      'talleres_participante_historial',
      'talleres_participante_certificados',
      'talleres_pendientes',
      'talleres_reportes',
      'talleres_direccion_metricas',
    ])
  })

  it('user with no capabilities sees only the 4 P items (odd/tasks/talleres-autoinscripcion.md, criterion 7)', () => {
    // The participant items (Explorar / Mis Talleres / Historial /
    // Certificados) are open to ANY authenticated member — a member joins
    // with zero talleres capabilities and self-enrolling is how they
    // become a participant. Every other role group still requires its own
    // capability, unchanged.
    const items = getTalleresNavItems([], { isEnabled: true })
    expect(items.length).toBe(4)
    expect(items.map((i) => i.id)).toEqual([
      'talleres_participante_explorar',
      'talleres_participante_mis_talleres',
      'talleres_participante_historial',
      'talleres_participante_certificados',
    ])
  })

  it('operational/admin items still require their own capability exactly as before — none leak in with zero caps', () => {
    const items = getTalleresNavItems([], { isEnabled: true })
    const ids = items.map((i) => i.id)
    expect(ids.some((id) => id.startsWith('talleres_grupos_'))).toBe(false)
    expect(ids.some((id) => id.startsWith('talleres_sesiones_'))).toBe(false)
    expect(ids.some((id) => id.startsWith('talleres_coordinacion_'))).toBe(false)
    expect(ids.some((id) => id.startsWith('talleres_direccion_'))).toBe(false)
    expect(ids.some((id) => id.startsWith('talleres_admin_'))).toBe(false)
  })
})

// ─── PR25 — admin-only sub-item ───────────────────────────────────────────

describe('getTalleresNavItems — admin.manage (PR25)', () => {
  it('user with ONLY admin.manage sees P (always) + the admin entry-points', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.admin.manage'],
      { isEnabled: true },
    )
    // PR25: the abstracto wizard entry-point. Finding #5: the global
    // inscripciones view moved from Coordinación to Administración, so
    // admin.manage now also sees it. Both live under group A. Criterion 7:
    // the 4 P items ride along too (canonical order puts P before A).
    expect(items.length).toBe(4 + 2)
    const adminItems = items.filter((i) => i.id.startsWith('talleres_admin_'))
    expect(adminItems.map((i) => i.id)).toEqual([
      'talleres_admin_abstracto',
      'talleres_admin_inscripciones_global',
    ])
    expect(adminItems[0]?.href).toBe('/admin/talleres/abstracto')
    expect(adminItems[0]?.requiredCapability).toBe('talleres_crecimiento.admin.manage')
  })

  it('admin.manage does NOT count as a superset for director/coordinator items (P still rides along — criterion 7)', () => {
    // PR25: keep the director-read superset scoped to read-only items.
    // Admin is a distinct role group (A) and does not implicitly
    // include director/coordinator items. The P group is the one
    // exception — it is open to ANY authenticated caller, not a superset
    // granted by admin.manage.
    const items = getTalleresNavItems(
      ['talleres_crecimiento.admin.manage'],
      { isEnabled: true },
    )
    expect(items.some((i) => i.id.startsWith('talleres_direccion_'))).toBe(false)
    expect(items.some((i) => i.id.startsWith('talleres_coordinacion_'))).toBe(false)
    expect(items.filter((i) => i.id.startsWith('talleres_participante_')).length).toBe(4)
  })

  it('admin.manage + director.read sees P (always) + the D group + the admin entries (no L/C superset — PR H)', () => {
    const items = getTalleresNavItems(
      [
        'talleres_crecimiento.admin.manage',
        'talleres_crecimiento.director.read',
      ],
      { isEnabled: true },
    )
    // PR H — no L/C superset. 4 P (criterion 7) + 7 director.read items +
    // 2 admin.manage entries (abstracto + the admin-keyed global
    // inscripciones view) = 13. (metricas needs metrics.read; not held
    // here.)
    expect(items.length).toBe(13)
    expect(items.map((i) => i.id)).toContain('talleres_admin_abstracto')
    expect(items.map((i) => i.id)).toContain('talleres_admin_inscripciones_global')
    expect(items.map((i) => i.id)).toContain('talleres_direccion_temporadas')
    expect(items.map((i) => i.id)).toContain('talleres_participante_explorar')
    // No L / C leak-in.
    expect(items.map((i) => i.id)).not.toContain('talleres_grupos_mis_grupos')
    expect(items.map((i) => i.id)).not.toContain('talleres_coordinacion_resumen')
  })
})

// ─── PR42 → finding #5 — global inscripciones view is admin-keyed ────────────

describe('getTalleresNavItems — global inscripciones view (finding #5)', () => {
  it('coordinador.read does NOT see the global inscripciones item (admin-only page)', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.coordinator.read'],
      { isEnabled: true },
    )
    // Finding #5 — /admin/talleres/inscripciones belongs to the
    // administrator / director general, NOT the coordinador. The item
    // is keyed to admin.manage and lives under group A now.
    expect(
      items.find((i) => i.id === 'talleres_admin_inscripciones_global'),
    ).toBeUndefined()
  })

  it('coordinador.write does NOT see the global inscripciones item either', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.coordinator.write'],
      { isEnabled: true },
    )
    expect(
      items.find((i) => i.id === 'talleres_admin_inscripciones_global'),
    ).toBeUndefined()
  })

  it('admin.manage sees the global inscripciones item under group A', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.admin.manage'],
      { isEnabled: true },
    )
    const found = items.find((i) => i.id === 'talleres_admin_inscripciones_global')
    expect(found).toBeDefined()
    expect(found?.href).toBe('/admin/talleres/inscripciones')
    expect(found?.requiredCapability).toBe('talleres_crecimiento.admin.manage')
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

  it('returns empty array when the flag is off even with zero capabilities (P items stay hidden too)', () => {
    const items = getTalleresNavItems([], { isEnabled: false })
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
    expect(items.length).toBe(4 + 2)
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
    // PR H — no superset. 4 P + 5 C + 7 D = 16. Finding #5 — the global
    // inscripciones view is admin-keyed, so it is NOT among the 5 C items
    // here (this user has no admin.manage). The 3 L items are NOT covered
    // because the user does not hold lead.read.
    expect(items.length).toBe(16)
    expect(items.map((i) => i.id)).not.toContain('talleres_grupos_mis_grupos')
    expect(items.map((i) => i.id)).not.toContain('talleres_sesiones_proximas')
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

  it('PR25 + finding #5: admin.manage produces a "Para Mí" group (criterion 7) plus "Administración" with the admin items', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.admin.manage'],
      { isEnabled: true },
    )
    const groups = groupTalleresNavItems(items)
    expect(groups.length).toBe(2)
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]))
    expect(byId['P']?.title).toBe('Para Mí')
    expect(byId['A']?.title).toBe('Administración')
    expect(byId['A']?.items.map((i) => i.id)).toEqual([
      'talleres_admin_abstracto',
      'talleres_admin_inscripciones_global',
    ])
  })

  it('T6 — groups talleres_pendientes under its own "Pendientes" bucket (never dropped for lacking a P/L/V/C/D/A prefix)', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.metrics.read'],
      { isEnabled: true },
    )
    const groups = groupTalleresNavItems(items)
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]))
    expect(byId['B']?.title).toBe('Pendientes')
    expect(byId['B']?.items.map((i) => i.id)).toEqual(['talleres_pendientes'])
  })

  it('T7 — groups talleres_reportes under its own "Reportes" bucket, separate from Pendientes', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.metrics.read'],
      { isEnabled: true },
    )
    const groups = groupTalleresNavItems(items)
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]))
    expect(byId['R']?.title).toBe('Reportes')
    expect(byId['R']?.items.map((i) => i.id)).toEqual(['talleres_reportes'])
    // Pendientes stays exactly as T6 left it — reportes does not leak in.
    expect(byId['B']?.items.map((i) => i.id)).toEqual(['talleres_pendientes'])
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

  it('every non-participant item requires a valid talleres_crecimiento capability', () => {
    const capPattern = /^talleres_crecimiento\.[a-z._]+$/
    for (const item of TALLERES_NAV_ITEMS) {
      if (item.requiredCapability === null) continue
      expect(item.requiredCapability).toMatch(capPattern)
    }
  })

  it('every P (participante) item has requiredCapability: null (any authenticated member — criterion 7)', () => {
    const participantItems = TALLERES_NAV_ITEMS.filter((i) =>
      i.id.startsWith('talleres_participante_'),
    )
    expect(participantItems.length).toBe(4)
    for (const item of participantItems) {
      expect(item.requiredCapability).toBeNull()
    }
  })

  it('no non-participant item has requiredCapability: null', () => {
    for (const item of TALLERES_NAV_ITEMS) {
      if (item.id.startsWith('talleres_participante_')) continue
      expect(item.requiredCapability).not.toBeNull()
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
      'talleres_coordinacion_',
      'talleres_direccion_',
      'talleres_admin_',
    ]
    // T6 — talleres_pendientes is an intentional exact-id exception (it
    // belongs to neither Coordinación nor Dirección alone — see
    // groupIdForItemId's own exact-id branch in navigation.ts). T7 —
    // talleres_reportes is the same kind of exception, for the same
    // reason (shared C/D item, keyed to metrics.read).
    const exactIdExceptions = new Set<TalleresNavItemId>(['talleres_pendientes', 'talleres_reportes'])
    for (const id of allIds) {
      const matches = groupPrefixes.some((p) => id.startsWith(p)) || exactIdExceptions.has(id)
      expect(matches).toBe(true)
    }
  })
})
