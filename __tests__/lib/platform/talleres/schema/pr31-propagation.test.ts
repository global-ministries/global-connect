/**
 * PR31 — open_edicion_global propagation dry-run probe.
 * F(talleres/schema/pr31-propagation) — verifies the PR31 migration
 * file satisfies acceptance criteria for the propagation fix BEFORE
 * application (mirrors the F4 schema-migration-dry-run pattern, see
 * __tests__/lib/platform/talleres/schema/ediciones-globales-rpcs.test.ts).
 *
 * Background — bug reported 2026-08-16:
 *   open_edicion_global (PR29-C) only updated the global row. It
 *   also tried to propagate to locales via the junction table
 *   taller_edicion_global_participantes, but the production data
 *   flow (PR29-B + PR29-F.1 backfill) actually associates talleres
 *   to a global via taller_ediciones.edicion_global_id (the FK
 *   column). The junction was never populated for the current
 *   production data — so open_edicion_global('2026') flipped the
 *   global to 'abierto' but left every local in 'borrador', and
 *   /talleres/explorar showed nothing.
 *
 * Decision — Model A:
 *   `taller_ediciones.edicion_global_id` is the source of truth.
 *   The junction table is dropped and propagation logic walks via
 *   the FK column.
 *
 * Acceptance criteria (PR31 scope):
 *  1. Migration file exists with the PR31 naming convention
 *     (`<ts>_pr31_open_edicion_global_propagate.sql`).
 *  2. DROP TABLE IF EXISTS public.taller_edicion_global_participantes.
 *  3. DROP VIEW IF EXISTS public.v_taller_ediciones_globales_con_participantes
 *     (the optional view, idempotent even if it never existed).
 *  4. Recreates open_edicion_global to UPDATE locales via
 *     `taller_ediciones.edicion_global_id = p_id`.
 *  5. Recreates close_edicion_global with the same FK-driven locale
 *     lookup; the active-enrollment guard uses taller_inscripciones
 *     (estado IN 'pendiente','aprobado').
 *  6. Recreates cancel_edicion_global without mutating locales (the
 *     junction DELETE was removed because the junction no longer
 *     exists).
 *  7. Recreates create_edicion_global so p_taller_ids is accepted
 *     for client compatibility but IGNORED (the function no longer
 *     inserts into the junction).
 *  8. DROP FUNCTION IF EXISTS public.add_taller_to_edicion_global.
 *  9. DROP FUNCTION IF EXISTS public.remove_taller_from_edicion_global.
 * 10. Re-asserts GRANT EXECUTE ON FUNCTION … TO authenticated for the
 *     four surviving functions (idempotency in case of partial
 *     prior deploy).
 * 11. All four surviving functions are SECURITY DEFINER with
 *     SET search_path = public.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function findMigration(pattern: RegExp): string | null {
  const allFiles = readdirSync(MIGRATIONS_DIR)
  const sqlFiles = allFiles.filter((f: string): boolean => f.endsWith('.sql'))
  for (const file of sqlFiles) {
    if (pattern.test(file)) {
      return join(MIGRATIONS_DIR, file)
    }
  }
  return null
}

const SURVIVING_FUNCTIONS = [
  'open_edicion_global',
  'close_edicion_global',
  'cancel_edicion_global',
  'create_edicion_global',
] as const

const DROPPED_FUNCTIONS = [
  'add_taller_to_edicion_global',
  'remove_taller_from_edicion_global',
] as const

describe('PR31 migration — open_edicion_global propagates via FK', () => {
  const migrationPath = findMigration(/_pr31_open_edicion_global_propagate\.sql$/)

  it('PR31 migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('File discovery', () => {
    it('uses the PR31 naming convention (suffix _pr31_open_edicion_global_propagate.sql)', () => {
      expect(migrationPath).toMatch(
        /_pr31_open_edicion_global_propagate\.sql$/
      )
    })
  })

  describe('Junction table drop (§1)', () => {
    it('DROP TABLE IF EXISTS public.taller_edicion_global_participantes', () => {
      // The junction is the bug source — must be dropped so the
      // production data flow can only be via the FK column.
      expect(content).toMatch(
        /DROP\s+TABLE\s+IF\s+EXISTS\s+public\.taller_edicion_global_participantes/i
      )
    })

    it('DROP VIEW IF EXISTS public.v_taller_ediciones_globales_con_participantes', () => {
      // The optional view that referenced the junction — guarded
      // with IF EXISTS so re-runs and pre-existing view absence
      // are both safe.
      expect(content).toMatch(
        /DROP\s+VIEW\s+IF\s+EXISTS\s+public\.v_taller_ediciones_globales_con_participantes/i
      )
    })
  })

  describe('open_edicion_global (§2) — FK-driven propagation', () => {
    it('is defined with CREATE OR REPLACE FUNCTION', () => {
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.open_edicion_global/i
      )
    })

    it('propagates to locales via taller_ediciones.edicion_global_id = p_id', () => {
      // The propagation UPDATE walks via the FK column on
      // taller_ediciones, NOT the junction table. The WHERE clause
      // must match `edicion_global_id = p_id`.
      expect(content).toMatch(
        /open_edicion_global[\s\S]*?UPDATE\s+public\.taller_ediciones[\s\S]*?SET\s+estado\s*=\s*'abierto'[\s\S]*?WHERE\s+edicion_global_id\s*=\s*p_id[\s\S]*?AND\s+estado\s*=\s*'borrador'/i
      )
    })

    it('does NOT reference the dropped junction inside open_edicion_global', () => {
      // Belt-and-suspenders: the propagation must NOT touch
      // taller_edicion_global_participantes (it doesn't exist
      // after the §1 drop).
      // Capture only the open_edicion_global function body and
      // assert no junction reference. We anchor on CREATE OR
      // REPLACE FUNCTION so the slice does not include the file
      // header (which mentions the junction in prose comments).
      const fnBody = content.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.open_edicion_global\b[\s\S]*?END;\s*\$func\$;/i,
      )?.[0]
      expect(fnBody).toBeDefined()
      expect(fnBody ?? '').not.toMatch(/taller_edicion_global_participantes/i)
    })

    it('is SECURITY DEFINER and SET search_path = public', () => {
      const fnBody = content.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.open_edicion_global\b[\s\S]*?END;\s*\$func\$;/i,
      )?.[0]
      expect(fnBody).toBeDefined()
      expect(fnBody ?? '').toMatch(/SECURITY\s+DEFINER/i)
      expect(fnBody ?? '').toMatch(/SET\s+search_path\s*=\s*public/i)
    })
  })

  describe('close_edicion_global (§3) — FK-driven + enrollment guard', () => {
    it('is defined with CREATE OR REPLACE FUNCTION', () => {
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.close_edicion_global/i
      )
    })

    it('propagates to locales via taller_ediciones.edicion_global_id = p_id', () => {
      // Same FK-driven lookup as open. Both the force branch and
      // the inscriptions-aware branch must use the FK column.
      expect(content).toMatch(
        /close_edicion_global[\s\S]*?UPDATE\s+public\.taller_ediciones[\s\S]*?SET\s+estado\s*=\s*'cerrado'[\s\S]*?WHERE\s+edicion_global_id\s*=\s*p_id/i
      )
    })

    it('respects active inscriptions via taller_inscripciones', () => {
      // The non-force branch must consult taller_inscripciones
      // (estado IN 'pendiente','aprobado') to decide which locales
      // to skip closing. Same contract as PR29-C.
      const fnBody = content.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.close_edicion_global\b[\s\S]*?END;\s*\$func\$;/i,
      )?.[0]
      expect(fnBody).toBeDefined()
      expect(fnBody ?? '').toMatch(/taller_inscripciones/i)
      expect(fnBody ?? '').toMatch(
        /estado\s+IN\s*\(\s*'pendiente'\s*,\s*'aprobado'\s*\)/i
      )
    })

    it('does NOT reference the dropped junction inside close_edicion_global', () => {
      const fnBody = content.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.close_edicion_global\b[\s\S]*?END;\s*\$func\$;/i,
      )?.[0]
      expect(fnBody).toBeDefined()
      expect(fnBody ?? '').not.toMatch(/taller_edicion_global_participantes/i)
    })

    it('returns locales_cerradas + locales_no_cerradas counts', () => {
      // Contract preserved from PR29-C.
      expect(content).toMatch(/locales_cerradas/i)
      expect(content).toMatch(/locales_no_cerradas/i)
    })
  })

  describe('cancel_edicion_global (§4) — no locale mutation, no junction', () => {
    it('is defined with CREATE OR REPLACE FUNCTION', () => {
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.cancel_edicion_global/i
      )
    })

    it('does NOT delete from the (dropped) junction', () => {
      // The previous implementation deleted from
      // taller_edicion_global_participantes; PR31 removes that
      // DELETE because the junction no longer exists.
      const fnBody = content.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.cancel_edicion_global\b[\s\S]*?END;\s*\$func\$;/i,
      )?.[0]
      expect(fnBody).toBeDefined()
      expect(fnBody ?? '').not.toMatch(/taller_edicion_global_participantes/i)
      expect(fnBody ?? '').not.toMatch(/DELETE\s+FROM\s+public\.taller_edicion/i)
    })

    it('still requires p_motivo NOT NULL (MOTIVO_REQUIRED gate)', () => {
      expect(content).toMatch(/MOTIVO_REQUIRED/i)
    })

    it('allows transition from borrador OR abierto', () => {
      expect(content).toMatch(/'borrador'\s*,\s*'abierto'/i)
    })
  })

  describe('create_edicion_global (§5) — signature compat, taller_ids ignored', () => {
    it('is defined with CREATE OR REPLACE FUNCTION', () => {
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_edicion_global/i
      )
    })

    it('accepts the 6-parameter signature (p_taller_ids still there)', () => {
      // The client posts p_taller_ids for backwards compat — the
      // signature MUST still accept it (form still posts the
      // field). The parameter is IGNORED at runtime.
      expect(content).toMatch(
        /create_edicion_global[\s\S]*?p_taller_ids\s+uuid\[\]/i
      )
    })

    it('does NOT insert into the (dropped) junction', () => {
      // The previous implementation inserted into
      // taller_edicion_global_participantes; PR31 removes that
      // INSERT because the junction no longer exists.
      const fnBody = content.match(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_edicion_global\b[\s\S]*?END;\s*\$func\$;/i,
      )?.[0]
      expect(fnBody).toBeDefined()
      expect(fnBody ?? '').not.toMatch(/taller_edicion_global_participantes/i)
    })
  })

  describe('Junction-only RPCs dropped (§6)', () => {
    it('DROP FUNCTION IF EXISTS public.add_taller_to_edicion_global', () => {
      expect(content).toMatch(
        /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.add_taller_to_edicion_global/i
      )
    })

    it('DROP FUNCTION IF EXISTS public.remove_taller_from_edicion_global', () => {
      expect(content).toMatch(
        /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.remove_taller_from_edicion_global/i
      )
    })
  })

  describe('Grants — surviving functions EXECUTE to authenticated (§7)', () => {
    for (const fn of SURVIVING_FUNCTIONS) {
      it(`GRANT EXECUTE ON FUNCTION public.${fn} (matching signature) TO authenticated`, () => {
        // The migration re-asserts GRANT EXECUTE after CREATE OR
        // REPLACE so a partial prior deploy cannot strand the
        // grant. Accept any arity for create/close (which take
        // multiple parameters).
        expect(content).toMatch(
          // eslint-disable-next-line security/detect-non-literal-regexp -- fn comes from SURVIVING_FUNCTIONS (fixed local list)
          new RegExp(
            `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\b[\\s\\S]*?TO\\s+authenticated`,
            'i',
          )
        )
      })
    }
  })

  describe('Capability gate — surviving functions contract', () => {
    // All four surviving functions must validate capabilities via
    // auth_has_talleres_capability (director.write OR admin.manage)
    // and reject UNAUTHENTICATED callers.
    function bodySlice(fnName: string): string {
      // Anchor on CREATE OR REPLACE FUNCTION so the slice does
      // not include the file header (which mentions capability
      // gates in prose comments). The non-greedy match + the
      // anchored CREATE OR REPLACE keep each function body
      // isolated.
      // eslint-disable-next-line security/detect-non-literal-regexp -- fnName comes from SURVIVING_FUNCTIONS (fixed local list)
      const re = new RegExp(
        `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fnName}\\b[\\s\\S]*?END;\\s*\\$func\\$;`,
        'i',
      )
      return content.match(re)?.[0] ?? ''
    }

    for (const fn of SURVIVING_FUNCTIONS) {
      describe(fn, () => {
        it('checks talleres_crecimiento.director.write capability', () => {
          const slice = bodySlice(fn)
          expect(slice).toMatch(
            /auth_has_talleres_capability\(\s*'talleres_crecimiento\.director\.write'/i
          )
        })

        it('checks talleres_crecimiento.admin.manage capability', () => {
          const slice = bodySlice(fn)
          expect(slice).toMatch(
            /auth_has_talleres_capability\(\s*'talleres_crecimiento\.admin\.manage'/i
          )
        })

        it('rejects unauthenticated callers with UNAUTHENTICATED', () => {
          const slice = bodySlice(fn)
          expect(slice).toMatch(/UNAUTHENTICATED/i)
        })

        it('rejects unauthorized callers with FORBIDDEN', () => {
          const slice = bodySlice(fn)
          expect(slice).toMatch(/FORBIDDEN/i)
        })

        it('is SECURITY DEFINER', () => {
          const slice = bodySlice(fn)
          expect(slice).toMatch(/SECURITY\s+DEFINER/i)
        })

        it('has SET search_path = public', () => {
          const slice = bodySlice(fn)
          expect(slice).toMatch(/SET\s+search_path\s*=\s*public/i)
        })
      })
    }
  })

  describe('No destructive DDL on existing tables — invariant I-6', () => {
    // PR31 drops the junction table (it OWNS that table — it's
    // part of the PR29-C feature being unwound). It must NOT drop
    // or truncate any other table (taller_ediciones, talleres,
    // taller_ediciones_globales, taller_inscripciones are all
    // pre-existing and protected).
    //
    // The assertion is anchored on a single DROP statement (no
    // [\s\S]*? between DROP TABLE and the table name) so that
    // header comments mentioning taller_ediciones don't trip it.
    it('does not DROP taller_ediciones', () => {
      expect(content).not.toMatch(/DROP\s+TABLE[^;]*?public\.taller_ediciones\b/i)
    })

    it('does not DROP talleres (the taller catalog)', () => {
      // A DROP on `public.talleres` (without _ediciones_) would
      // destroy the taller catalog. The DROP TABLE in §1 targets
      // taller_edicion_global_participantes only.
      expect(content).not.toMatch(/DROP\s+TABLE[^;]*?public\.talleres\b/i)
    })

    it('does not DROP taller_inscripciones', () => {
      expect(content).not.toMatch(/DROP\s+TABLE[^;]*?taller_inscripciones\b/i)
    })

    it('does not DROP taller_ediciones_globales', () => {
      // The global header must remain — it holds the globales
      // table that the surviving functions read from.
      expect(content).not.toMatch(/DROP\s+TABLE[^;]*?public\.taller_ediciones_globales\b/i)
    })

    it('does not TRUNCATE', () => {
      expect(content).not.toMatch(/TRUNCATE/i)
    })

    it('drops exactly the junction table taller_edicion_global_participantes', () => {
      // The only DROP TABLE allowed is the junction. We confirm
      // it appears at least once and is the ONLY DROP TABLE in
      // the file.
      const dropMatches = content.match(/DROP\s+TABLE\s+IF\s+EXISTS\s+public\.\w+/gi) ?? []
      expect(dropMatches).toHaveLength(1)
      expect(dropMatches[0]).toMatch(/taller_edicion_global_participantes/i)
    })
  })

  describe('Junction references — exact count', () => {
    // The only references to taller_edicion_global_participantes
    // allowed in the file are:
    //   - The DROP TABLE statement (§1)
    //   - The COMMENT ON FUNCTION … 'junction' text in §2/§3/§4/§5
    //     (which mention the drop in prose, not DDL).
    // Each of the four surviving functions (§2-§5) and the DROP
    // statements (§6) MUST NOT reference the junction in DDL.
    it('DROP statements are the only DDL touching the junction', () => {
      // Find every line that mentions the junction name. Lines
      // containing INSERT/UPDATE/DELETE/SELECT/FROM/JOIN against
      // it must all be the §1 DROP block (or its IF EXISTS
      // counterpart). We assert: any line that contains the
      // junction name and also matches a non-DROP DML verb is a
      // regression.
      //
      // We additionally filter out lines whose content sits
      // inside a single-quoted string literal (e.g. a COMMENT ON
      // FUNCTION … IS '…' body — those legitimately mention the
      // junction name in prose).
      const lines = content.split('\n')
      const offending: string[] = []
      let inSingleQuoted = false
      for (const line of lines) {
        if (!line.includes('taller_edicion_global_participantes')) continue
        // DROP TABLE and SQL comment lines are fine.
        if (/DROP\s+TABLE/i.test(line)) continue
        if (/^--/.test(line.trim())) continue
        // COMMENT ON FUNCTION header line — fine.
        if (/^\s*COMMENT\b/i.test(line)) continue
        // Inside a single-quoted string body (the IS '…' part of
        // a COMMENT ON FUNCTION statement, which may span
        // multiple lines) — fine.
        if (inSingleQuoted) {
          if (line.includes("'")) inSingleQuoted = false
          continue
        }
        // Check whether the line starts a string-literal body.
        // Pattern: an IS '…' header on the previous line(s) and
        // this line opens the value.
        if (/^\s*'/.test(line)) continue
        if (/\bINSERT\b/i.test(line) || /\bUPDATE\b/i.test(line) ||
            /\bDELETE\b/i.test(line) || /\bSELECT\b/i.test(line) ||
            /\bFROM\b/i.test(line) || /\bJOIN\b/i.test(line)) {
          offending.push(line.trim())
        }
      }
      expect(offending).toEqual([])
    })
  })

  describe('No dropped-function references inside surviving function bodies', () => {
    // The dropped RPCs (add_taller_to_edicion_global,
    // remove_taller_from_edicion_global) must not be invoked from
    // the surviving RPCs (they wouldn't compile after the DROP).
    // We assert this by scanning only the function bodies — the
    // §6 DROP statements themselves obviously mention them.
    const DROPPED_FUNCTION_NAMES = DROPPED_FUNCTIONS

    function fnBody(fnName: string): string {
      // Same pattern as bodySlice — capture only the function body
      // between CREATE OR REPLACE FUNCTION … and END; $func$;.
      // eslint-disable-next-line security/detect-non-literal-regexp -- fnName comes from SURVIVING_FUNCTIONS (fixed local list)
      const re = new RegExp(
        `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fnName}\\b[\\s\\S]*?END;\\s*\\$func\\$;`,
        'i',
      )
      return content.match(re)?.[0] ?? ''
    }

    for (const fn of SURVIVING_FUNCTIONS) {
      describe(fn, () => {
        for (const dropped of DROPPED_FUNCTION_NAMES) {
          it(`does not invoke ${dropped}`, () => {
            const body = fnBody(fn)
            expect(body).not.toMatch(
              // eslint-disable-next-line security/detect-non-literal-regexp -- dropped is from DROPPED_FUNCTION_NAMES (fixed local list)
              new RegExp(`\\b${dropped}\\b`, 'i')
            )
          })
        }
      })
    }
  })
})