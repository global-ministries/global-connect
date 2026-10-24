-- ═══════════════════════════════════════════════════════════════════
-- Remove the unused pastoral module and the empty legacy 1:1 tables.
--
-- The pastoral module (1:1 del líder, tríadas, pastor dashboard, crisis
-- scan, pastoral grant admin, asistido roadmap) never closed its own loop
-- and was never reachable in production: its routes were gated by unset
-- NEXT_PUBLIC_PASTORAL_* flags and no code outside the module used it. The
-- application code is removed in the same change. A new 1:1 model replaces
-- it later (odd/tasks/uno-a-uno.md, T3).
--
-- Production never had the pastoral objects: they exist on staging only.
-- Production holds just the two legacy tables uno_a_uno_reuniones and
-- uno_a_uno_participantes, verified empty (0 rows) on 2026-10-15. Every
-- step below is guarded (IF EXISTS / to_regclass / to_regprocedure), so on
-- production the pastoral part is a no-op and only the two empty tables go.
--
-- Data safety:
--   * Step 0 aborts the whole migration if either uno_a_uno_* table holds a
--     single row. Those tables are only dropped while empty.
--   * Every staging row this migration deletes (the nine pastoral tables and
--     the 63 dream_team_capability_grants rows with experience = 'pastoral',
--     118 rows in all) was exported to a local backup file before applying.
--   * No CASCADE anywhere. The order below drops every dependent first; if a
--     drop still fails because something else depends on an object, the
--     migration stops instead of silently taking that dependent with it.
--
-- Kept on purpose:
--   * The pastoral_* values of the enum operating_core_participation_kind
--     (Postgres cannot drop enum values safely) and the sensitivity column of
--     operating_core_participation_eventos (talleres uses it).
--   * The one staging row of operating_core_participation_eventos with kind
--     pastoral_one_on_one_completed: that ledger is append-only (its
--     enforce_participation_append_only trigger refuses DELETE), the row is
--     valid for the kept enum value, and nothing reads it.
--   * The scope types one_on_one and triada in the check constraint
--     dream_team_grants_scope_type_canonical (no row uses them after step 3).
--   * Users, groups and memberships the old pastoral seed migrations created.
--   * Every earlier migration file (history).
--
-- Order:
--   0. Data-safety guard on uno_a_uno_reuniones / uno_a_uno_participantes.
--   1. Trigger trg_sync_pastoral_grants_on_role_change on usuario_roles.
--   2. Functions sync_pastoral_grants_on_role_change(),
--      assign_pastoral_capabilities_for_role(uuid, text).
--   3. dream_team_capability_grants rows with experience = 'pastoral'.
--   4. The nine pastoral tables, children before parents (their policies and
--      indexes go with each table; the only foreign keys are child -> parent
--      inside the module).
--   5. Functions auth_user_is_pastoral_actor_for_triada(uuid),
--      auth_user_is_pastoral_actor(uuid), auth_has_pastoral_capability(text),
--      get_personas_under_me(uuid) (after the tables, whose policies call
--      them). No non-pastoral function, view or policy references them
--      (checked on staging through pg_depend, pg_proc.prosrc and pg_policy).
--   6. The five pastoral enums (only the dropped tables used them).
--   7. uno_a_uno_participantes, then uno_a_uno_reuniones.
--
-- Rollback: re-run the migrations that created the objects, in order:
--   20260722143357_pastoral_helper_auth_has_capability.sql
--   20260722143358_pastoral_tables_part1_one_on_one.sql
--   20260722172128_pastoral_tables_part2_triada.sql
--   20260723170000_pastoral_crisis_keyword_catalog.sql
--   20260723170001_pastoral_crisis_detection_log.sql
--   20260725120000_pastoral_capability_grants_rls_fix.sql
--   20260725130000_pastoral_capability_helper_drift_fix.sql
--   20260725240000_pastoral_rls_fix_join_auth_uid.sql
--   20260727000000_pastoral_auto_grant_on_role.sql
--   20260727010000_pastoral_hierarchical_visibility.sql
--   20260929160000_gdv_dg_regla_en_tablero_y_casas.sql (get_personas_under_me)
--   20261003100000_cierres_pastoral_y_debug.sql
--   20261003160000_identidades_en_politicas.sql
-- then restore the rows from the staging backup file. The two uno_a_uno_*
-- tables predate the migration history; if ever needed, recreate them empty:
--   uno_a_uno_reuniones (id uuid pk default uuid_generate_v4(), grupo_id uuid
--     not null -> grupos on delete cascade, lider_usuario_id uuid not null ->
--     usuarios on delete restrict, fecha date not null, hora time,
--     notas_privadas text, fecha_registro timestamptz not null default now())
--   uno_a_uno_participantes (id uuid pk default uuid_generate_v4(),
--     reunion_id uuid not null -> uno_a_uno_reuniones on delete cascade,
--     miembro_usuario_id uuid not null -> usuarios on delete cascade,
--     unique (reunion_id, miembro_usuario_id))
--   with every privilege revoked from PUBLIC, anon and authenticated and
--   granted to service_role only (20260716120000_operating_core_events.sql).
--
-- supabase/tests/quitar-modulo-pastoral.test.sql pins the result.
-- ═══════════════════════════════════════════════════════════════════

-- ── 0) Data-safety guard ──────────────────────────────────────────────
-- Abort everything if a legacy 1:1 table holds any row. EXECUTE so the
-- block also runs where a table does not exist.

DO $guard$
DECLARE
  v_tbl text;
  v_rows bigint;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['public.uno_a_uno_reuniones', 'public.uno_a_uno_participantes'] LOOP
    IF to_regclass(v_tbl) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM %s', v_tbl) INTO v_rows;
      IF v_rows > 0 THEN
        RAISE EXCEPTION 'quitar_modulo_pastoral: % holds % row(s); refusing to drop it. Back it up and decide first.', v_tbl, v_rows;
      END IF;
    END IF;
  END LOOP;
END
$guard$;

-- ── 1) Trigger on usuario_roles ───────────────────────────────────────

DO $trigger$
BEGIN
  IF to_regclass('public.usuario_roles') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_sync_pastoral_grants_on_role_change ON public.usuario_roles;
  END IF;
END
$trigger$;

-- ── 2) Grant-sync functions ───────────────────────────────────────────

DROP FUNCTION IF EXISTS public.sync_pastoral_grants_on_role_change();
DROP FUNCTION IF EXISTS public.assign_pastoral_capabilities_for_role(uuid, text);

-- ── 3) Pastoral capability grants ─────────────────────────────────────
-- 63 rows on staging, 0 on production (backed up before applying).

DO $grants$
BEGIN
  IF to_regclass('public.dream_team_capability_grants') IS NOT NULL THEN
    DELETE FROM public.dream_team_capability_grants WHERE experience = 'pastoral';
  END IF;
END
$grants$;

-- ── 4) Pastoral tables, children before parents ───────────────────────

DROP TABLE IF EXISTS public.pastoral_crisis_detection_log;
DROP TABLE IF EXISTS public.pastoral_one_on_one_notas;
DROP TABLE IF EXISTS public.pastoral_one_on_one_participantes;
DROP TABLE IF EXISTS public.pastoral_triada_eventos;
DROP TABLE IF EXISTS public.pastoral_triada_miembros;
DROP TABLE IF EXISTS public.pastoral_one_on_one;
DROP TABLE IF EXISTS public.pastoral_triada;
DROP TABLE IF EXISTS public.pastoral_crisis_keyword_catalog;
DROP TABLE IF EXISTS public.pastoral_role_capability_map;

-- ── 5) Pastoral helper functions ──────────────────────────────────────

DROP FUNCTION IF EXISTS public.auth_user_is_pastoral_actor_for_triada(uuid);
DROP FUNCTION IF EXISTS public.auth_user_is_pastoral_actor(uuid);
DROP FUNCTION IF EXISTS public.auth_has_pastoral_capability(text);
DROP FUNCTION IF EXISTS public.get_personas_under_me(uuid);

-- ── 6) Pastoral enums ─────────────────────────────────────────────────

DROP TYPE IF EXISTS public.pastoral_one_on_one_estado;
DROP TYPE IF EXISTS public.pastoral_triada_contexto;
DROP TYPE IF EXISTS public.pastoral_triada_estado;
DROP TYPE IF EXISTS public.pastoral_triada_evento_tipo;
DROP TYPE IF EXISTS public.pastoral_triada_motivo_disolucion;

-- ── 7) Empty legacy 1:1 tables (step 0 proved them empty) ─────────────

DROP TABLE IF EXISTS public.uno_a_uno_participantes;
DROP TABLE IF EXISTS public.uno_a_uno_reuniones;
