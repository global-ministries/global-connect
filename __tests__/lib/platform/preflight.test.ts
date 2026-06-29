import {
  PLATFORM_UNO_A_UNO_REQUIRED_STEPS,
  registerPlatformUnoAUnoDecision,
  runPlatformUnoAUnoPreflight,
  _resetPlatformUnoAUnoPreflight,
  type PlatformUnoAUnoPreflightResult,
} from '@/lib/platform/preflight'

describe('lib/platform/preflight', () => {
  beforeEach(() => {
    _resetPlatformUnoAUnoPreflight()
  })

  describe('runPlatformUnoAUnoPreflight', () => {
    it('denies by default because no formal decision has been registered', () => {
      const result = runPlatformUnoAUnoPreflight()

      expect(result).toEqual({
        ok: false,
        reason: 'no_formal_decision',
        missing: PLATFORM_UNO_A_UNO_REQUIRED_STEPS,
      })
    })

    it('returns the registered baseline decision with evidence', () => {
      const decision: PlatformUnoAUnoPreflightResult = {
        ok: true,
        decision: 'baseline',
        evidence: {
          migration_version: '20260629_001',
          rls_verified: 'true',
          rollback_script: 'supabase/migrations/20260629_001_uno_a_uno_baseline_rollback.sql',
        },
      }

      registerPlatformUnoAUnoDecision(decision)

      expect(runPlatformUnoAUnoPreflight()).toEqual(decision)
    })

    it('returns the registered archive decision with evidence', () => {
      const decision: PlatformUnoAUnoPreflightResult = {
        ok: true,
        decision: 'archive',
        evidence: {
          archive_date: '2026-06-29',
          backup_location: 's3://backups/global-connect/uno_a_uno/archive.tar.gz',
        },
      }

      registerPlatformUnoAUnoDecision(decision)

      expect(runPlatformUnoAUnoPreflight()).toEqual(decision)
    })

    it('returns the registered reintroduce decision with evidence', () => {
      const decision: PlatformUnoAUnoPreflightResult = {
        ok: true,
        decision: 'reintroduce',
        evidence: {
          feature_issue: '#240',
          rls_verified: 'true',
          rollback_script: 'supabase/migrations/20260629_001_uno_a_uno_reintroduce_rollback.sql',
        },
      }

      registerPlatformUnoAUnoDecision(decision)

      expect(runPlatformUnoAUnoPreflight()).toEqual(decision)
    })

    it('returns the default denial after the registry is reset', () => {
      registerPlatformUnoAUnoDecision({
        ok: true,
        decision: 'baseline',
        evidence: {
          migration_version: '20260629_001',
          rls_verified: 'true',
          rollback_script: 'supabase/migrations/20260629_001_uno_a_uno_baseline_rollback.sql',
        },
      })
      _resetPlatformUnoAUnoPreflight()

      const result = runPlatformUnoAUnoPreflight()

      expect(result).toEqual({
        ok: false,
        reason: 'no_formal_decision',
        missing: PLATFORM_UNO_A_UNO_REQUIRED_STEPS,
      })
    })
  })

  describe('type gate', () => {
    it('blocks registration without the required baseline evidence fields', () => {
      // @ts-expect-error evidence must contain migration_version, rls_verified, rollback_script
      registerPlatformUnoAUnoDecision({ ok: true, decision: 'baseline', evidence: {} })
      _resetPlatformUnoAUnoPreflight()

      expect(runPlatformUnoAUnoPreflight().ok).toBe(false)
    })

    it('blocks registration without the required archive evidence fields', () => {
      // @ts-expect-error evidence must contain archive_date, backup_location
      registerPlatformUnoAUnoDecision({ ok: true, decision: 'archive', evidence: {} })
      _resetPlatformUnoAUnoPreflight()

      expect(runPlatformUnoAUnoPreflight().ok).toBe(false)
    })

    it('blocks registration without the required reintroduce evidence fields', () => {
      // @ts-expect-error evidence must contain feature_issue, rls_verified, rollback_script
      registerPlatformUnoAUnoDecision({ ok: true, decision: 'reintroduce', evidence: {} })
      _resetPlatformUnoAUnoPreflight()

      expect(runPlatformUnoAUnoPreflight().ok).toBe(false)
    })

    it('blocks registration of an explicit denial result', () => {
      const denial = {
        ok: false,
        reason: 'no_formal_decision',
        missing: ['baseline_migration'],
      } as const
      // @ts-expect-error only ok:true decisions can be registered
      registerPlatformUnoAUnoDecision(denial)
      _resetPlatformUnoAUnoPreflight()

      expect(runPlatformUnoAUnoPreflight().ok).toBe(false)
    })
  })
})
