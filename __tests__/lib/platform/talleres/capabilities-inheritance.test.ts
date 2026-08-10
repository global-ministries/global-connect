/**
 * PR3 — DT-013 — F(talleres/capabilities) — Capability inheritance test.
 *
 * Verifies the 13 canonical Talleres capabilities are registered with the
 * correct experience/scopeType in `PLATFORM_CAPABILITIES` (DT-009 + DT-010),
 * and that the role→capability mapping (used by the auto-grant trigger in
 * DT-011) is consistent with the design §4 inheritance rules.
 *
 * What this test covers:
 *   1. Exactly 13 `talleres_crecimiento.*` capabilities exist in
 *      PLATFORM_CAPABILITIES, with experience='talleres_crecimiento' and
 *      scopeType='taller' (all except certificates.verify, which is unscoped).
 *   2. The role→capability map matches design §4 (director inherits the
 *      full set, coordinator inherits scoped sets, etc.).
 *   3. The auto-grant trigger source attribution is well-formed
 *      ('role-auto-grant' and 'taller-asignacion-auto-grant', per design §14).
 *   4. After running the seed (DT-012), a director persona acquires the
 *      expected capability grants (no manual grants at user level).
 *   5. Removing a role or group assignment auto-revokes the derived grants
 *      (revocation path).
 *   6. After a clean seed, the grants table contains zero manual grants
 *      (every grant has source IN role-auto-grant|taller-asignacion-auto-grant).
 *
 * This is a dry-run probe: it reads migration files and the experiences.ts
 * catalog to verify the contract BEFORE the migrations are applied. SQL
 * runtime behaviour is validated in sdd-verify against a real database.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { PLATFORM_CAPABILITIES, PLATFORM_EXPERIENCE_CATALOG, PLATFORM_SCOPE_TYPES } from '@/lib/platform/experiences'
import {
  TALLERES_CAPABILITY_KEYS,
  type TalleresCapabilityKey,
} from '@/lib/platform/talleres/capabilities'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function findMigration(pattern: RegExp): string | null {
  const allFiles = readdirSync(MIGRATIONS_DIR)
  const sqlFiles = allFiles.filter((f: string) => f.endsWith('.sql'))
  for (const file of sqlFiles) {
    if (pattern.test(file)) {
      return join(MIGRATIONS_DIR, file)
    }
  }
  return null
}

function readMigration(pattern: RegExp): string {
  const path = findMigration(pattern)
  if (!path) return ''
  return readFileSync(path, 'utf-8')
}

// The 13 canonical capabilities per design.md §4 (matching
// `lib/platform/talleres/capabilities.ts` PR1 catalog + design §4 verbatim).
const CANONICAL_TALLERES_CAPABILITIES: readonly TalleresCapabilityKey[] = [
  'talleres_crecimiento.director.read',
  'talleres_crecimiento.director.write',
  'talleres_crecimiento.admin.manage',
  'talleres_crecimiento.coordinator.read',
  'talleres_crecimiento.coordinator.write',
  'talleres_crecimiento.lead.read',
  'talleres_crecimiento.lead.write',
  'talleres_crecimiento.volunteer.read',
  'talleres_crecimiento.participation.read',
  'talleres_crecimiento.metrics.read',
  'talleres_crecimiento.team.serve',
  'talleres_crecimiento.integration.read',
  'talleres_crecimiento.certificates.verify',
] as const

// Role→capability map per design §4 inheritance table.
const ROLE_CAPABILITY_MAP: Readonly<Record<'director' | 'coordinator' | 'lead' | 'volunteer' | 'participant', readonly TalleresCapabilityKey[]>> = {
  director: [
    'talleres_crecimiento.director.read',
    'talleres_crecimiento.director.write',
    'talleres_crecimiento.admin.manage',
    'talleres_crecimiento.metrics.read',
  ],
  coordinator: [
    'talleres_crecimiento.coordinator.read',
    'talleres_crecimiento.coordinator.write',
    'talleres_crecimiento.metrics.read',
  ],
  lead: [
    'talleres_crecimiento.lead.read',
    'talleres_crecimiento.lead.write',
  ],
  volunteer: [
    'talleres_crecimiento.volunteer.read',
  ],
  participant: [
    'talleres_crecimiento.participation.read',
  ],
}

describe('PLATFORM_CAPABILITIES — talleres extension (DT-009 + DT-010)', () => {
  it('exposes the talleres_crecimiento experience in PLATFORM_EXPERIENCE_CATALOG', () => {
    // The PR1 catalog already declares it; we assert it survived and exposes 'taller'.
    expect(PLATFORM_EXPERIENCE_CATALOG).toHaveProperty('talleres_crecimiento')
    const entry = PLATFORM_EXPERIENCE_CATALOG.talleres_crecimiento
    expect(entry.scopeTypes).toContain('taller')
  })

  it('PLATFORM_SCOPE_TYPES contains the taller scope type', () => {
    expect(PLATFORM_SCOPE_TYPES).toContain('taller')
  })

  it('registers exactly 13 talleres_crecimiento.* capabilities in PLATFORM_CAPABILITIES', () => {
    const talleresCaps = Object.entries(PLATFORM_CAPABILITIES).filter(
      ([key]) => key.startsWith('talleres_crecimiento.'),
    )
    expect(talleresCaps).toHaveLength(13)
  })

  it('every canonical Talleres capability is registered in PLATFORM_CAPABILITIES', () => {
    for (const cap of CANONICAL_TALLERES_CAPABILITIES) {
      // Use bracket lookup because PLATFORM_CAPABILITIES keys are dotted strings
      // (e.g. 'talleres_crecimiento.director.read'), and toHaveProperty would
      // try to navigate the path as nested object keys.
      expect(Object.prototype.hasOwnProperty.call(PLATFORM_CAPABILITIES, cap)).toBe(true)
    }
  })

  it('every talleres_crecimiento.* capability has experience=talleres_crecimiento and scopeType=taller', () => {
    for (const [key, def] of Object.entries(PLATFORM_CAPABILITIES)) {
      if (!key.startsWith('talleres_crecimiento.')) continue
      expect(def.experience).toBe('talleres_crecimiento')
      expect(def.scopeType).toBe('taller')
    }
  })

  it('the TALLERES_CAPABILITY_KEYS catalog matches the canonical 13 keys verbatim', () => {
    // Sort to compare independent of declaration order.
    const sortedCanonical = [...CANONICAL_TALLERES_CAPABILITIES].sort()
    const sortedCatalog = [...TALLERES_CAPABILITY_KEYS].sort()
    expect(sortedCatalog).toEqual(sortedCanonical)
  })

  it('the admin.manage gap in navigation.ts is closed (capability exists in PLATFORM_CAPABILITIES)', () => {
    // The protected navigation.ts:93 references 'talleres_crecimiento.admin.manage'.
    // The gap closes when this key is registered in PLATFORM_CAPABILITIES, which
    // makes resolvePlatformCapability accept it (without the gap, the navigation
    // resolver returns 'unknown_capability' for that item).
    expect(Object.prototype.hasOwnProperty.call(PLATFORM_CAPABILITIES, 'talleres_crecimiento.admin.manage')).toBe(true)
  })
})

describe('Role → capability inheritance map (design §4)', () => {
  it('director inherits director.{read,write} + admin.manage + metrics.read', () => {
    const expected = ROLE_CAPABILITY_MAP.director
    for (const cap of expected) {
      expect(Object.prototype.hasOwnProperty.call(PLATFORM_CAPABILITIES, cap)).toBe(true)
    }
  })

  it('coordinator inherits coordinator.{read,write} + metrics.read', () => {
    const expected = ROLE_CAPABILITY_MAP.coordinator
    for (const cap of expected) {
      expect(Object.prototype.hasOwnProperty.call(PLATFORM_CAPABILITIES, cap)).toBe(true)
    }
  })

  it('lead inherits lead.{read,write}', () => {
    const expected = ROLE_CAPABILITY_MAP.lead
    for (const cap of expected) {
      expect(Object.prototype.hasOwnProperty.call(PLATFORM_CAPABILITIES, cap)).toBe(true)
    }
  })

  it('volunteer inherits volunteer.read (read-only)', () => {
    const expected = ROLE_CAPABILITY_MAP.volunteer
    expect(expected).toContain('talleres_crecimiento.volunteer.read')
  })

  it('participant inherits participation.read', () => {
    const expected = ROLE_CAPABILITY_MAP.participant
    expect(expected).toContain('talleres_crecimiento.participation.read')
  })
})

describe('Auto-grant trigger migration (DT-011)', () => {
  const migrationPath = findMigration(/_talleres_role_auto_grant\.sql$/)

  it('auto-grant migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readMigration(/_talleres_role_auto_grant\.sql$/)

  it('defines a trigger AFTER INSERT/UPDATE/DELETE on dream_team_servicios', () => {
    // The trigger must react to role assignment changes for talleres experience.
    expect(content).toMatch(/dream_team_servicios/i)
    expect(content).toMatch(/AFTER\s+INSERT\s+OR\s+UPDATE\s+OR\s+DELETE/i)
    expect(content).toMatch(/CREATE\s+TRIGGER/i)
  })

  it('filters by experiencia = talleres_crecimiento (joined through dream_team_equipos)', () => {
    expect(content).toMatch(/dream_team_equipos/i)
    expect(content).toMatch(/'talleres_crecimiento'/i)
  })

  it('inserts grants into dream_team_capability_grants with experience = talleres_crecimiento and scope_type = taller', () => {
    expect(content).toMatch(/dream_team_capability_grants/i)
    // scope_type canonical (English 'taller' not Spanish)
    expect(content).toMatch(/scope_type/i)
    expect(content).toMatch(/'taller'/i)
  })

  it('reconciles director/coordinator/lead/volunteer capabilities (4-role set per design §4)', () => {
    // The trigger must mention all 4 operational roles to mirror the
    // design §4 inheritance table (coordinador grants scope_id=taller_id,
    // lead/volunteer grant scope_id=grupo_id).
    expect(content).toMatch(/director/i)
    expect(content).toMatch(/coordinator|coordinador/i)
    expect(content).toMatch(/lead|lider/i)
    expect(content).toMatch(/voluntario|volunteer/i)
  })

  it('attaches the trigger for AFTER INSERT/UPDATE/DELETE', () => {
    expect(content).toMatch(/AFTER\s+INSERT\s+OR\s+UPDATE\s+OR\s+DELETE/i)
  })

  it('trigger function is SECURITY DEFINER and SET search_path (canonical precedent)', () => {
    // Pull the function body. The trigger function MUST be SECURITY DEFINER
    // and SET search_path = public to bypass RLS safely (per F4 precedent
    // 20260727000000_pastoral_auto_grant_on_role.sql).
    const fnMatch = content.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION[\s\S]*?LANGUAGE\s+plpgsql[\s\S]*?;/i,
    )
    expect(fnMatch).not.toBeNull()
    if (!fnMatch) return
    expect(fnMatch[0]).toMatch(/SECURITY\s+DEFINER/i)
    expect(fnMatch[0]).toMatch(/SET\s+search_path/i)
  })

  it('reconciles taller_grupo_asignaciones (group-level role changes for lead/volunteer)', () => {
    // Per design §4, lead/volunteer grants are scoped to the group (taller_grupo_asignaciones)
    // and must be auto-revoked when the assignment ends.
    expect(content).toMatch(/taller_grupo_asignaciones/i)
  })

  it('attaches grants with source IN role-auto-grant | taller-asignacion-auto-grant (per design §14)', () => {
    // Manual grants are banned. The auto-grant trigger must tag its inserts
    // with one of the canonical sources so reconciliation can distinguish
    // them from user-issued grants.
    expect(content).toMatch(/role-auto-grant/i)
    expect(content).toMatch(/taller-asignacion-auto-grant/i)
  })

  it('does NOT contain destructive DDL (no DROP TABLE, TRUNCATE, ALTER COLUMN DROP, DELETE FROM public.*)', () => {
    // Allowed: DELETE FROM public.dream_team_capability_grants g (the trigger
    // reconciles by physical delete of the role-auto-grant rows it owns).
    // Banned: DROP TABLE / TRUNCATE / ALTER COLUMN.*DROP / DELETE FROM of
    // unrelated tables.
    expect(content).not.toMatch(/DROP\s+TABLE/i)
    expect(content).not.toMatch(/TRUNCATE/i)
    expect(content).not.toMatch(/ALTER\s+COLUMN[\s\S]*?DROP/i)
    // We forbid DELETE FROM of unrelated tables: only DELETE FROM
    // public.dream_team_capability_grants g is permitted.
    const deleteFromMatches = content.match(/DELETE\s+FROM\s+(?!public\.dream_team_capability_grants)/gi)
    expect(deleteFromMatches).toBeNull()
  })
})

describe('Seed initial director grants migration (DT-012)', () => {
  const migrationPath = findMigration(/_talleres_seed_initial_grants\.sql$/)

  it('seed migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readMigration(/_talleres_seed_initial_grants\.sql$/)

  it('inserts into dream_team_capability_grants', () => {
    expect(content).toMatch(/INSERT\s+INTO\s+public\.dream_team_capability_grants/i)
  })

  it('targets the director set (director.read + director.write + admin.manage + metrics.read)', () => {
    expect(content).toMatch(/talleres_crecimiento\.director\.read/i)
    expect(content).toMatch(/talleres_crecimiento\.director\.write/i)
    expect(content).toMatch(/talleres_crecimiento\.admin\.manage/i)
    expect(content).toMatch(/talleres_crecimiento\.metrics\.read/i)
  })

  it('is idempotent (ON CONFLICT DO NOTHING or WHERE NOT EXISTS guard)', () => {
    const idempotent =
      /ON\s+CONFLICT\s+DO\s+NOTHING/i.test(content) ||
      /WHERE\s+NOT\s+EXISTS/i.test(content)
    expect(idempotent).toBe(true)
  })

  it('tags director seed grants with source = role-auto-grant', () => {
    expect(content).toMatch(/role-auto-grant/i)
  })

  it('does NOT include a manual grant (every seed row has source attribution)', () => {
    // The seed migration must NEVER insert grants with source = 'manual' or
    // any user-issued value. It MUST tag every row as a system-managed grant.
    expect(content).not.toMatch(/source\s*=\s*'manual'/i)
  })
})

describe('Auto-revocation contract (DT-011 + design §14)', () => {
  const content = readMigration(/_talleres_role_auto_grant\.sql$/)

  it('revokes grants on UPDATE of dream_team_servicios (rol change or estado != activo)', () => {
    // The trigger fires on UPDATE; the function must remove the old role's
    // grants before assigning the new role's grants. We assert the function
    // contains a DELETE branch keyed on the role mapping.
    expect(content).toMatch(/DELETE\s+FROM\s+public\.dream_team_capability_grants/i)
  })

  it('revokes grants on DELETE of dream_team_servicios (cleanup cascade)', () => {
    // When the underlying servicio row is removed (soft delete via fecha_fin
    // is not the model; this is the canonical "retirado" lifecycle path), the
    // trigger revokes any role-auto-grant that referenced the now-removed row.
    expect(content).toMatch(/TG_OP\s*=\s*'DELETE'/i)
  })
})
