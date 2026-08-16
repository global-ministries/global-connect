/**
 * PR29-C — RPCs for Talleres ediciones globales dry-run probe.
 * F(talleres/schema/ediciones-globales-rpcs) — verifies the PR29-C
 * migration file satisfies acceptance criteria for the 6 new RPCs
 * BEFORE application (mirrors the F4 schema-migration-dry-run pattern,
 * see __tests__/lib/platform/talleres/schema/ediciones-globales.test.ts).
 *
 * Acceptance criteria (PR29-C scope):
 *  1. Migration file exists with the PR29-C naming convention
 *     (`<ts>_pr29_c_taller_ediciones_globales_rpcs.sql`).
 *  2. Defines `create_edicion_global` with the 6 parameters
 *     (p_nombre, p_slug, p_descripcion, p_fecha_apertura,
 *      p_fecha_cierre, p_taller_ids uuid[] DEFAULT '{}') and
 *     RETURNS jsonb.
 *  3. Defines `open_edicion_global(p_id uuid)` RETURNS jsonb.
 *  4. Defines `close_edicion_global(p_id uuid, p_force_local boolean
 *     DEFAULT false)` RETURNS jsonb.
 *  5. Defines `cancel_edicion_global(p_id uuid, p_motivo text)`
 *     RETURNS jsonb.
 *  6. Defines `add_taller_to_edicion_global(p_edicion_global_id uuid,
 *     p_taller_id uuid)` RETURNS jsonb.
 *  7. Defines `remove_taller_from_edicion_global(p_edicion_global_id
 *     uuid, p_taller_id uuid)` RETURNS jsonb.
 *  8. All 6 functions are SECURITY DEFINER.
 *  9. All 6 functions have `SET search_path = public`.
 * 10. All 6 functions validate capabilities via
 *     `public.auth_has_talleres_capability` with the canonical keys
 *     `talleres_crecimiento.director.write` OR
 *     `talleres_crecimiento.admin.manage`.
 * 11. `close_edicion_global` checks active enrollments via
 *     `taller_inscripciones` (with estado IN ('pendiente','aprobado')).
 * 12. `cancel_edicion_global` requires motivo NOT NULL (RAISE
 *     EXCEPTION 'MOTIVO_REQUIRED' or equivalent gate).
 * 13. `add_taller_to_edicion_global` uses ON CONFLICT DO NOTHING.
 * 14. `remove_taller_from_edicion_global` validates estado='borrador'
 *     before deleting.
 * 15. All 6 functions have GRANT EXECUTE TO authenticated.
 * 16. No destructive DDL on existing tables (no DROP TABLE / DROP
 *     COLUMN / DELETE FROM existing tables — only the explicit
 *     cancellation DELETE FROM taller_edicion_global_participantes
 *     is permitted because the design doc defines it as part of the
 *     cancel flow).
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

const SIX_RPCS = [
  'create_edicion_global',
  'open_edicion_global',
  'close_edicion_global',
  'cancel_edicion_global',
  'add_taller_to_edicion_global',
  'remove_taller_from_edicion_global',
] as const

describe('PR29-C migration — 6 RPCs for taller_ediciones_globales', () => {
  const migrationPath = findMigration(
    /_pr29_c_taller_ediciones_globales_rpcs\.sql$/
  )

  it('PR29-C migration file exists', () => {
    expect(migrationPath).not.toBeNull()
  })

  if (!migrationPath) return

  const content = readFileSync(migrationPath, 'utf-8')

  describe('File discovery', () => {
    it('uses the PR29-C naming convention (suffix _pr29_c_taller_ediciones_globales_rpcs.sql)', () => {
      expect(migrationPath).toMatch(
        /_pr29_c_taller_ediciones_globales_rpcs\.sql$/
      )
    })
  })

  describe('create_edicion_global (§1)', () => {
    it('is defined with CREATE OR REPLACE FUNCTION', () => {
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.create_edicion_global/i
      )
    })

    it('accepts the 6 parameters: p_nombre, p_slug, p_descripcion, p_fecha_apertura, p_fecha_cierre, p_taller_ids', () => {
      expect(content).toMatch(
        /create_edicion_global[\s\S]*?p_nombre\s+text/i
      )
      expect(content).toMatch(/p_slug\s+text/i)
      expect(content).toMatch(/p_descripcion\s+text/i)
      expect(content).toMatch(/p_fecha_apertura\s+timestamptz/i)
      expect(content).toMatch(/p_fecha_cierre\s+timestamptz/i)
      expect(content).toMatch(/p_taller_ids\s+uuid\[\]/i)
    })

    it('p_taller_ids has DEFAULT uuid[]', () => {
      // The default is `'{}'::uuid[]` — accept either form.
      expect(content).toMatch(
        /p_taller_ids\s+uuid\[\][\s\S]*?DEFAULT\s+(?:'\{\}'|ARRAY\[\s*\]|'\{\}'::uuid\[\])/i
      )
    })

    it('RETURNS jsonb', () => {
      expect(content).toMatch(/create_edicion_global[\s\S]*?RETURNS\s+jsonb/i)
    })

    it('is SECURITY DEFINER', () => {
      expect(content).toMatch(
        /create_edicion_global[\s\S]*?SECURITY\s+DEFINER/i
      )
    })

    it('has SET search_path = public', () => {
      expect(content).toMatch(
        /create_edicion_global[\s\S]*?SET\s+search_path\s*=\s*public/i
      )
    })

    it('validates capabilities via auth_has_talleres_capability with the canonical keys', () => {
      // Must check director.write OR admin.manage.
      expect(content).toMatch(
        /create_edicion_global[\s\S]*?auth_has_talleres_capability\(\s*'talleres_crecimiento\.director\.write'/i
      )
      expect(content).toMatch(
        /create_edicion_global[\s\S]*?auth_has_talleres_capability\(\s*'talleres_crecimiento\.admin\.manage'/i
      )
    })

    it('validates nombre length between 2 and 120', () => {
      expect(content).toMatch(/INVALID_NOMBRE_LENGTH/i)
      expect(content).toMatch(
        /length\s*\(\s*p_nombre\s*\)\s*<\s*2|length\s*\(\s*p_nombre\s*\)\s*>\s*120/i
      )
    })

    it('validates slug format and reserved values', () => {
      // Slug regex match + reserved slugs __legacy__ and legacy-pre-pr29.
      expect(content).toMatch(/INVALID_SLUG/i)
      expect(content).toMatch(/p_slug\s+!~\s*'\^\[a-z0-9-\]\+\$'/i)
      expect(content).toMatch(/p_slug\s*=\s*'__legacy__'/i)
      expect(content).toMatch(/p_slug\s*=\s*'legacy-pre-pr29'/i)
    })

    it('validates fecha_cierre > fecha_apertura', () => {
      expect(content).toMatch(/FECHA_CIERRE_BEFORE_APERTURA/i)
    })

    it('inserts with estado = borrador (initial state always)', () => {
      expect(content).toMatch(
        /create_edicion_global[\s\S]*?INSERT\s+INTO\s+public\.taller_ediciones_globales[\s\S]*?'borrador'/i
      )
    })

    it('associates initial talleres via junction with ON CONFLICT DO NOTHING', () => {
      expect(content).toMatch(
        /INSERT\s+INTO\s+public\.taller_edicion_global_participantes[\s\S]*?ON\s+CONFLICT\s*\(\s*edicion_global_id\s*,\s*taller_id\s*\)\s+DO\s+NOTHING/i
      )
    })
  })

  describe('open_edicion_global (§2)', () => {
    it('is defined with CREATE OR REPLACE FUNCTION', () => {
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.open_edicion_global/i
      )
    })

    it('accepts p_id uuid', () => {
      expect(content).toMatch(/open_edicion_global\s*\(\s*p_id\s+uuid/i)
    })

    it('RETURNS jsonb', () => {
      expect(content).toMatch(/open_edicion_global[\s\S]*?RETURNS\s+jsonb/i)
    })

    it('is SECURITY DEFINER', () => {
      expect(content).toMatch(
        /open_edicion_global[\s\S]*?SECURITY\s+DEFINER/i
      )
    })

    it('has SET search_path = public', () => {
      expect(content).toMatch(
        /open_edicion_global[\s\S]*?SET\s+search_path\s*=\s*public/i
      )
    })

    it('validates capabilities via auth_has_talleres_capability', () => {
      expect(content).toMatch(
        /open_edicion_global[\s\S]*?auth_has_talleres_capability\(\s*'talleres_crecimiento\.director\.write'/i
      )
      expect(content).toMatch(
        /open_edicion_global[\s\S]*?auth_has_talleres_capability\(\s*'talleres_crecimiento\.admin\.manage'/i
      )
    })

    it('validates estado = borrador before transition', () => {
      expect(content).toMatch(
        /open_edicion_global[\s\S]*?INVALID_STATE_TRANSITION[\s\S]*?borrador/i
      )
    })

    it('propagates to locales: UPDATE taller_ediciones SET estado=abierto for participating borrador talleres', () => {
      // The CTE `participantes` is referenced as `par` in the UPDATE.
      expect(content).toMatch(
        /open_edicion_global[\s\S]*?UPDATE\s+public\.taller_ediciones[\s\S]*?SET\s+estado\s*=\s*'abierto'[\s\S]*?t\.id\s*=\s*par\.taller_id[\s\S]*?t\.estado\s*=\s*'borrador'/i
      )
    })

    it('surfaces fecha_apertura warning via RAISE NOTICE (does not abort)', () => {
      // The warning must use RAISE NOTICE (not RAISE EXCEPTION) and
      // be conditional on fecha_apertura > now().
      expect(content).toMatch(
        /open_edicion_global[\s\S]*?RAISE\s+NOTICE\s+'OPEN_BEFORE_FECHA_APERTURA/i
      )
    })
  })

  describe('close_edicion_global (§3)', () => {
    it('is defined with CREATE OR REPLACE FUNCTION', () => {
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.close_edicion_global/i
      )
    })

    it('accepts p_id uuid and p_force_local boolean DEFAULT false', () => {
      expect(content).toMatch(
        /close_edicion_global\s*\(\s*p_id\s+uuid\s*,\s*p_force_local\s+boolean\s+DEFAULT\s+(?:false|false)/i
      )
    })

    it('RETURNS jsonb', () => {
      expect(content).toMatch(/close_edicion_global[\s\S]*?RETURNS\s+jsonb/i)
    })

    it('is SECURITY DEFINER', () => {
      expect(content).toMatch(
        /close_edicion_global[\s\S]*?SECURITY\s+DEFINER/i
      )
    })

    it('has SET search_path = public', () => {
      expect(content).toMatch(
        /close_edicion_global[\s\S]*?SET\s+search_path\s*=\s*public/i
      )
    })

    it('validates capabilities via auth_has_talleres_capability', () => {
      expect(content).toMatch(
        /close_edicion_global[\s\S]*?auth_has_talleres_capability\(\s*'talleres_crecimiento\.director\.write'/i
      )
      expect(content).toMatch(
        /close_edicion_global[\s\S]*?auth_has_talleres_capability\(\s*'talleres_crecimiento\.admin\.manage'/i
      )
    })

    it('validates estado = abierto before transition', () => {
      expect(content).toMatch(
        /close_edicion_global[\s\S]*?INVALID_STATE_TRANSITION[\s\S]*?abierto/i
      )
    })

    it('checks active enrollments via taller_inscripciones (pendiente|aprobado)', () => {
      // The close logic must check `taller_inscripciones.estado IN
      // ('pendiente','aprobado')` to decide which locales to NOT close.
      expect(content).toMatch(/taller_inscripciones/i)
      expect(content).toMatch(
        /i\.estado\s+IN\s*\(\s*'pendiente'\s*,\s*'aprobado'\s*\)/i
      )
    })

    it('uses p_force_local to gate the force-close branch', () => {
      // Two distinct branches: p_force_local=true closes all, else
      // closes only locales without active enrollments.
      expect(content).toMatch(/p_force_local/i)
      // Without force: must NOT close locales with active enrollments.
      expect(content).toMatch(/con_inscripciones/i)
    })

    it('returns locales_cerradas + locales_no_cerradas counts', () => {
      expect(content).toMatch(/locales_cerradas/i)
      expect(content).toMatch(/locales_no_cerradas/i)
    })
  })

  describe('cancel_edicion_global (§4)', () => {
    it('is defined with CREATE OR REPLACE FUNCTION', () => {
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.cancel_edicion_global/i
      )
    })

    it('accepts p_id uuid and p_motivo text', () => {
      expect(content).toMatch(
        /cancel_edicion_global\s*\(\s*p_id\s+uuid\s*,\s*p_motivo\s+text/i
      )
    })

    it('RETURNS jsonb', () => {
      expect(content).toMatch(/cancel_edicion_global[\s\S]*?RETURNS\s+jsonb/i)
    })

    it('is SECURITY DEFINER', () => {
      expect(content).toMatch(
        /cancel_edicion_global[\s\S]*?SECURITY\s+DEFINER/i
      )
    })

    it('has SET search_path = public', () => {
      expect(content).toMatch(
        /cancel_edicion_global[\s\S]*?SET\s+search_path\s*=\s*public/i
      )
    })

    it('validates capabilities via auth_has_talleres_capability', () => {
      expect(content).toMatch(
        /cancel_edicion_global[\s\S]*?auth_has_talleres_capability\(\s*'talleres_crecimiento\.director\.write'/i
      )
      expect(content).toMatch(
        /cancel_edicion_global[\s\S]*?auth_has_talleres_capability\(\s*'talleres_crecimiento\.admin\.manage'/i
      )
    })

    it('requires p_motivo NOT NULL (MOTIVO_REQUIRED gate)', () => {
      // The cancellation function must reject NULL or empty motivo.
      expect(content).toMatch(/MOTIVO_REQUIRED/i)
      expect(content).toMatch(
        /p_motivo\s+IS\s+NULL\s+OR\s+length\s*\(\s*trim\s*\(\s*p_motivo\s*\)\s*\)\s*<\s*1/i
      )
    })

    it('allows transition from borrador OR abierto', () => {
      expect(content).toMatch(
        /cancel_edicion_global[\s\S]*?v_estado\s+NOT\s+IN\s*\(\s*'borrador'\s*,\s*'abierto'\s*\)/i
      )
    })

    it('deletes participants from junction on cancel', () => {
      expect(content).toMatch(
        /cancel_edicion_global[\s\S]*?DELETE\s+FROM\s+public\.taller_edicion_global_participantes[\s\S]*?WHERE\s+edicion_global_id\s*=\s*p_id/i
      )
    })

    it('returns motivo + participantes_removidos', () => {
      expect(content).toMatch(/participantes_removidos/i)
    })
  })

  describe('add_taller_to_edicion_global (§5)', () => {
    it('is defined with CREATE OR REPLACE FUNCTION', () => {
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.add_taller_to_edicion_global/i
      )
    })

    it('accepts p_edicion_global_id uuid and p_taller_id uuid', () => {
      expect(content).toMatch(
        /add_taller_to_edicion_global\s*\(\s*p_edicion_global_id\s+uuid\s*,\s*p_taller_id\s+uuid/i
      )
    })

    it('RETURNS jsonb', () => {
      expect(content).toMatch(
        /add_taller_to_edicion_global[\s\S]*?RETURNS\s+jsonb/i
      )
    })

    it('is SECURITY DEFINER', () => {
      expect(content).toMatch(
        /add_taller_to_edicion_global[\s\S]*?SECURITY\s+DEFINER/i
      )
    })

    it('has SET search_path = public', () => {
      expect(content).toMatch(
        /add_taller_to_edicion_global[\s\S]*?SET\s+search_path\s*=\s*public/i
      )
    })

    it('validates capabilities via auth_has_talleres_capability', () => {
      expect(content).toMatch(
        /add_taller_to_edicion_global[\s\S]*?auth_has_talleres_capability\(\s*'talleres_crecimiento\.director\.write'/i
      )
      expect(content).toMatch(
        /add_taller_to_edicion_global[\s\S]*?auth_has_talleres_capability\(\s*'talleres_crecimiento\.admin\.manage'/i
      )
    })

    it('uses ON CONFLICT DO NOTHING on the junction insert', () => {
      expect(content).toMatch(
        /add_taller_to_edicion_global[\s\S]*?INSERT\s+INTO\s+public\.taller_edicion_global_participantes[\s\S]*?ON\s+CONFLICT\s*\(\s*edicion_global_id\s*,\s*taller_id\s*\)\s+DO\s+NOTHING/i
      )
    })

    it('returns added boolean + optional warning', () => {
      expect(content).toMatch(/'added'/i)
      expect(content).toMatch(/'warning'/i)
    })
  })

  describe('remove_taller_from_edicion_global (§6)', () => {
    it('is defined with CREATE OR REPLACE FUNCTION', () => {
      expect(content).toMatch(
        /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.remove_taller_from_edicion_global/i
      )
    })

    it('accepts p_edicion_global_id uuid and p_taller_id uuid', () => {
      expect(content).toMatch(
        /remove_taller_from_edicion_global\s*\(\s*p_edicion_global_id\s+uuid\s*,\s*p_taller_id\s+uuid/i
      )
    })

    it('RETURNS jsonb', () => {
      expect(content).toMatch(
        /remove_taller_from_edicion_global[\s\S]*?RETURNS\s+jsonb/i
      )
    })

    it('is SECURITY DEFINER', () => {
      expect(content).toMatch(
        /remove_taller_from_edicion_global[\s\S]*?SECURITY\s+DEFINER/i
      )
    })

    it('has SET search_path = public', () => {
      expect(content).toMatch(
        /remove_taller_from_edicion_global[\s\S]*?SET\s+search_path\s*=\s*public/i
      )
    })

    it('validates capabilities via auth_has_talleres_capability', () => {
      expect(content).toMatch(
        /remove_taller_from_edicion_global[\s\S]*?auth_has_talleres_capability\(\s*'talleres_crecimiento\.director\.write'/i
      )
      expect(content).toMatch(
        /remove_taller_from_edicion_global[\s\S]*?auth_has_talleres_capability\(\s*'talleres_crecimiento\.admin\.manage'/i
      )
    })

    it('validates estado=borrador before allowing removal', () => {
      expect(content).toMatch(
        /remove_taller_from_edicion_global[\s\S]*?v_estado\s*<>\s*'borrador'/i
      )
      expect(content).toMatch(
        /remove_taller_from_edicion_global[\s\S]*?expected=borrador/i
      )
    })

    it('deletes from the junction table', () => {
      expect(content).toMatch(
        /remove_taller_from_edicion_global[\s\S]*?DELETE\s+FROM\s+public\.taller_edicion_global_participantes[\s\S]*?edicion_global_id\s*=\s*p_edicion_global_id[\s\S]*?AND\s+taller_id\s*=\s*p_taller_id/i
      )
    })
  })

  describe('Capability gate — universal contract', () => {
    // Every RPC must use auth_has_talleres_capability with the canonical
    // keys for director.write OR admin.manage. We assert this for all 6.
    // The slice captures the full body: from `public.${fn}(` to the
    // closing `END; $func$;` (the actual PL/pgSQL body terminator).
    function bodySlice(fnName: string): string {
      // Greedy match: from `public.${fn}(` through the first
      // `END; $func$;` after it. Non-greedy `[\s\S]*?` keeps the slice
      // tight to the first function with this name.
      // eslint-disable-next-line security/detect-non-literal-regexp -- fnName comes from SIX_RPCS (fixed local list, no user input)
      const re = new RegExp(
        `public\\.${fnName}\\b[\\s\\S]*?END;\\s*\\$func\\$;`,
        'i'
      )
      return content.match(re)?.[0] ?? ''
    }

    for (const fn of SIX_RPCS) {
      describe(fn, () => {
        it('checks talleres_crecimiento.director.write', () => {
          const slice = bodySlice(fn)
          expect(slice).toMatch(
            /auth_has_talleres_capability\(\s*'talleres_crecimiento\.director\.write'/i
          )
        })

        it('checks talleres_crecimiento.admin.manage', () => {
          const slice = bodySlice(fn)
          expect(slice).toMatch(
            /auth_has_talleres_capability\(\s*'talleres_crecimiento\.admin\.manage'/i
          )
        })

        it('rejects unauthenticated callers with UNAUTHENTICATED error', () => {
          const slice = bodySlice(fn)
          expect(slice).toMatch(/UNAUTHENTICATED/i)
        })

        it('rejects unauthorized callers with FORBIDDEN error', () => {
          const slice = bodySlice(fn)
          expect(slice).toMatch(/FORBIDDEN/i)
        })
      })
    }
  })

  describe('Grants — all 6 functions EXECUTE to authenticated', () => {
    for (const fn of SIX_RPCS) {
      it(`GRANT EXECUTE ON FUNCTION public.${fn} TO authenticated`, () => {
        expect(content).toMatch(
          // eslint-disable-next-line security/detect-non-literal-regexp -- fn comes from SIX_RPCS (fixed local list, no user input)
          new RegExp(
            `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\b[\\s\\S]*?TO\\s+authenticated`,
            'i'
          )
        )
      })
    }
  })

  describe('No destructive DDL on existing tables — invariant I-6', () => {
    // The migration creates a junction row + tables from PR29-B. It is
    // ALLOWED to DELETE FROM taller_edicion_global_participantes because
    // that's the design-defined cancellation flow. It is NOT allowed to
    // DROP/ALTER/DELETE on the pre-existing tables.
    it('does not DROP TABLE', () => {
      expect(content).not.toMatch(/DROP\s+TABLE/i)
    })

    it('does not DROP COLUMN', () => {
      expect(content).not.toMatch(/DROP\s+COLUMN/i)
    })

    it('does not DROP CONSTRAINT', () => {
      expect(content).not.toMatch(/DROP\s+CONSTRAINT/i)
    })

    it('does not DROP POLICY', () => {
      expect(content).not.toMatch(/DROP\s+POLICY/i)
    })

    it('does not TRUNCATE', () => {
      expect(content).not.toMatch(/TRUNCATE/i)
    })

    it('does not ALTER COLUMN ... TYPE', () => {
      expect(content).not.toMatch(/ALTER\s+COLUMN[\s\S]*?TYPE/i)
    })
  })
})