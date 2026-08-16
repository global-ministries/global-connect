-- ════════════════════════════════════════════════════════════════════
-- PR29-F.1 — Corrective migration for 2 bugs discovered after PR29-E.
--
-- Bug #A: Backfill missed taller_edicion_global_participantes.
-- The admin UI for `/admin/talleres/ediciones-globales/[id]` reads from
-- the junction table, but PR29-B only populated the FK column
-- (edicion_global_id) on public.taller_ediciones. Result: Legacy
-- showed 0 talleres even though ediciones locales pointed to it.
-- Fix: read from taller_ediciones via edicion_global_id, join on
-- taller_id (the FK column from taller_ediciones → talleres.id,
-- added in PR23.2b when talleres_crecimiento_metadata was renamed
-- to taller_ediciones), and insert the junction rows.
-- ON CONFLICT (edicion_global_id, taller_id) DO NOTHING makes the
-- migration idempotent and preserves any manual additions.
--
-- Bug #B: FK violation on taller_ediciones_globales.created_by_persona_id.
-- The FK points to public.usuarios(id), but auth.uid() returns
-- auth.users.id — these are different tables. Same systemic bug
-- documented for dream_team_capability_grants.persona_id.
-- Fix: drop the FK and leave the column as a free-form audit field.
-- A future PR can add a separate auth_user_id → persona_id mapping
-- table to restore FK enforcement when ready.
--
-- No toca archivos protegidos (invariante I-6: ningún DROP sobre
-- tablas de datos, solo DROP CONSTRAINT sobre la FK problemática).
-- ════════════════════════════════════════════════════════════════════

-- �══════════════════════════════════════════════════════════════════╗
-- ║ 1) Backfill de taller_edicion_global_participantes                ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Estrategia:
--   - Para cada fila de public.taller_ediciones con
--     edicion_global_id IS NOT NULL, buscamos el taller asociado
--     via taller_id (FK directa a public.talleres.id).
--   - Filtramos por taller.estado = 'active' para no insertar
--     talleres archivados en la junction.
--   - ON CONFLICT (edicion_global_id, taller_id) DO NOTHING preserva
--     filas preexistentes (tests manuales del usuario) y hace la
--     migration idempotente en re-runs. La constraint UNIQUE
--     garantiza 1 fila por (global, taller) aunque haya N ediciones
--     locales apuntando al mismo taller.

DO $do$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.taller_edicion_global_participantes (edicion_global_id, taller_id)
  SELECT
    tcm.edicion_global_id,
    t.id
  FROM public.taller_ediciones tcm
  JOIN public.talleres t ON t.id = tcm.taller_id
  WHERE tcm.edicion_global_id IS NOT NULL
    AND t.estado = 'active'
  ON CONFLICT (edicion_global_id, taller_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'PR29-F.1 backfilled % junction rows', v_count;
END
$do$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 2) Drop FK en taller_ediciones_globales.created_by_persona_id     ║
-- ╚══════════════════════════════════════════════════════════════════�
--
-- La columna queda como uuid NULL libre (sin constraint) para que
-- el INSERT desde el UI no falle con auth.uid() (auth.users.id).
-- El audit trail sigue funcionando: cuando esté lista la tabla de
-- mapeo auth_user_id → persona_id, restauramos el FK en otro PR.
-- La columna ya era nullable en PR29-B, así que este cambio es
-- puramente estructural (constraint-only, no schema-shape).

ALTER TABLE public.taller_ediciones_globales
  DROP CONSTRAINT IF EXISTS taller_ediciones_globales_created_by_persona_id_fkey;

COMMENT ON COLUMN public.taller_ediciones_globales.created_by_persona_id IS
  'Audit field: who created this edicion_global. NOT FK-enforced because auth.uid() returns auth.users.id (not public.usuarios.id). Same systemic issue as dream_team_capability_grants.persona_id. Restore FK in a future PR with an auth_user_id → persona_id mapping table.';
