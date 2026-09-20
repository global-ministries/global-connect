/**
 * PR17 — DT-071 — Pure helper tests for talleres navigation.
 *
 * Tests the data layer (getTalleresNavItems, groupTalleresNavItems,
 * TALLERES_NAV_ITEMS table invariants, resolveTalleresNavViewItems).
 * Hook tests live in a separate file using @jest-environment node.
 *
 * T10 (odd/tasks/talleres-consolidar-pantallas.md) — rewritten. Every
 * role-prefixed OLD item (Coordinación, Dirección, the líder's own Mis
 * Grupos/Próximas Sesiones, the admin wizard, the admin-keyed global
 * inscripciones view) is deleted along with its old screen; the table
 * now holds only the 5 items backing the approved ~12-route tree:
 * talleres_participante_explorar, talleres_participante_mi_recorrido,
 * talleres_pendientes, talleres_reportes, talleres_temporadas.
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
  it('user with no capabilities sees only the 2 P items (odd/tasks/talleres-autoinscripcion.md, criterion 7)', () => {
    // The participant items (Explorar / Mi Recorrido) are open to ANY
    // authenticated member — a member joins with zero talleres
    // capabilities and self-enrolling is how they become a participant.
    const items = getTalleresNavItems([], { isEnabled: true })
    expect(items.map((i) => i.id)).toEqual([
      'talleres_participante_explorar',
      'talleres_participante_mi_recorrido',
    ])
  })

  it('metrics.read holder sees P (always) + talleres_pendientes (T6) + talleres_reportes (T7)', () => {
    // Both are keyed to metrics.read: the one capability BOTH coordinador
    // and director are auto-granted, so one nav item (one href -> one
    // requiredCapability) can gate a page meant for either role.
    const items = getTalleresNavItems(
      ['talleres_crecimiento.metrics.read'],
      { isEnabled: true },
    )
    expect(items.map((i) => i.id)).toEqual([
      'talleres_participante_explorar',
      'talleres_participante_mi_recorrido',
      'talleres_pendientes',
      'talleres_reportes',
    ])
  })

  it('director.read holder sees P (always) + talleres_temporadas', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.director.read'],
      { isEnabled: true },
    )
    expect(items.map((i) => i.id)).toEqual([
      'talleres_participante_explorar',
      'talleres_participante_mi_recorrido',
      'talleres_temporadas',
    ])
  })

  it('admin.manage alone sees only the 2 P items — no admin-only item exists anymore (the abstracto wizard is deleted)', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.admin.manage'],
      { isEnabled: true },
    )
    expect(items.map((i) => i.id)).toEqual([
      'talleres_participante_explorar',
      'talleres_participante_mi_recorrido',
    ])
  })

  it('coordinator.read alone sees only the 2 P items — every old Coordinación item is deleted', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.coordinator.read'],
      { isEnabled: true },
    )
    expect(items.map((i) => i.id)).toEqual([
      'talleres_participante_explorar',
      'talleres_participante_mi_recorrido',
    ])
  })

  it('lead.read alone sees only the 2 P items — Mis Grupos/Próximas Sesiones are deleted (their content lives in the /talleres catalog now)', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.lead.read'],
      { isEnabled: true },
    )
    expect(items.map((i) => i.id)).toEqual([
      'talleres_participante_explorar',
      'talleres_participante_mi_recorrido',
    ])
  })

  it('director.read + metrics.read sees the full union: P + pendientes + reportes + temporadas', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.director.read', 'talleres_crecimiento.metrics.read'],
      { isEnabled: true },
    )
    expect(items.map((i) => i.id)).toEqual([
      'talleres_participante_explorar',
      'talleres_participante_mi_recorrido',
      'talleres_pendientes',
      'talleres_reportes',
      'talleres_temporadas',
    ])
  })

  it('canonical order is preserved (matches TALLERES_NAV_ITEMS order)', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.director.read', 'talleres_crecimiento.metrics.read'],
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

// ─── groupTalleresNavItems — role grouping ────────────────────────────────

describe('groupTalleresNavItems — role grouping', () => {
  it('omits groups with zero items', () => {
    const items = getTalleresNavItems([], { isEnabled: true })
    const groups = groupTalleresNavItems(items)
    expect(groups.length).toBe(1)
    expect(groups[0]?.id).toBe('P')
    expect(groups[0]?.title).toBe('Para Mí')
  })

  it('T6 — groups talleres_pendientes under its own "Pendientes" bucket (never dropped for lacking a P/D prefix)', () => {
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
    expect(byId['B']?.items.map((i) => i.id)).toEqual(['talleres_pendientes'])
  })

  it('T8 — groups talleres_temporadas under the existing D "Dirección" bucket, not its own bucket', () => {
    const items = getTalleresNavItems(
      ['talleres_crecimiento.director.read'],
      { isEnabled: true },
    )
    const groups = groupTalleresNavItems(items)
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]))
    expect(byId['D']?.title).toBe('Dirección')
    expect(byId['D']?.items.map((i) => i.id)).toEqual(['talleres_temporadas'])
    // No new lettered bucket was invented for it.
    expect(groups.map((g) => g.id)).not.toContain('S')
  })

  it('T10: L, C, A groups never appear — no surviving item maps to them', () => {
    const items = getTalleresNavItems(
      [
        'talleres_crecimiento.lead.read',
        'talleres_crecimiento.coordinator.read',
        'talleres_crecimiento.director.read',
        'talleres_crecimiento.metrics.read',
        'talleres_crecimiento.admin.manage',
      ],
      { isEnabled: true },
    )
    const groups = groupTalleresNavItems(items)
    const groupIds = groups.map((g) => g.id)
    expect(groupIds).not.toContain('L')
    expect(groupIds).not.toContain('C')
    expect(groupIds).not.toContain('A')
    expect(groupIds.sort()).toEqual(['B', 'D', 'P', 'R'].sort())
  })

  it('preserves canonical order within the P group', () => {
    const items = getTalleresNavItems([], { isEnabled: true })
    const groups = groupTalleresNavItems(items)
    const pGroup = groups.find((g) => g.id === 'P')
    expect(pGroup?.items.map((i) => i.id)).toEqual([
      'talleres_participante_explorar',
      'talleres_participante_mi_recorrido',
    ])
  })
})

// ─── Resolver (SSR / RSC variant) ──────────────────────────────────────────

describe('resolveTalleresNavViewItems — SSR / RSC variant', () => {
  it('returns grouped items synchronously when flag is on', () => {
    const groups = resolveTalleresNavViewItems({
      sessionCapabilities: [],
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
  it('holds exactly the 5 items backing the approved ~12-route tree (T10)', () => {
    expect(TALLERES_NAV_ITEMS.map((i) => i.id)).toEqual([
      'talleres_participante_explorar',
      'talleres_participante_mi_recorrido',
      'talleres_pendientes',
      'talleres_reportes',
      'talleres_temporadas',
    ])
  })

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
    expect(participantItems.length).toBe(2)
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

  it('every href starts with /talleres/ — no /admin/talleres/... item survives T10', () => {
    for (const item of TALLERES_NAV_ITEMS) {
      expect(item.href.startsWith('/talleres/')).toBe(true)
    }
  })

  it('every TalleresNavItemId is mapped to a role group', () => {
    const allIds = new Set<TalleresNavItemId>(
      TALLERES_NAV_ITEMS.map((i) => i.id) as TalleresNavItemId[],
    )
    expect(allIds.size).toBe(TALLERES_NAV_ITEMS.length)
    // T6/T7/T8 — talleres_pendientes, talleres_reportes and
    // talleres_temporadas are exact-id exceptions (see groupIdForItemId
    // in navigation.ts): none of them belongs to a single role-prefixed
    // bucket by id shape, only by meaning.
    const exactIdExceptions = new Set<TalleresNavItemId>([
      'talleres_pendientes',
      'talleres_reportes',
      'talleres_temporadas',
    ])
    for (const id of allIds) {
      const matches = id.startsWith('talleres_participante_') || exactIdExceptions.has(id)
      expect(matches).toBe(true)
    }
  })
})
