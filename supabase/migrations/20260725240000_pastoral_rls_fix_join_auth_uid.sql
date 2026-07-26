-- ══════════════════════════════════════════════════════════════════════════════
-- F4 staging RLS fix: join auth.uid() through usuarios, not direct compare
-- ══════════════════════════════════════════════════════════════════════════════
--
-- The M2/M7/M8 pastoral RLS policies used `mentor_oficial_persona_id = auth.uid()`
-- and similar auth.uid() comparisons. But `auth.uid()` is the auth.users.id
-- (e.g. Ana's auth id is 6b213580-eb7c-420f-bd4e-7779bf264e7b), NOT personas.id
-- (Ana's persona is 1aea87c1-e674-44a9-a2db-91a17d02cc43). The pastoral tables
-- reference personas, so the comparison never matches and RLS silently blocks.
--
-- This migration:
--   1. Creates SECURITY DEFINER helpers (auth_user_is_pastoral_actor and
--      auth_user_is_pastoral_actor_for_triada) that bypass RLS for the
--      cross-table check, breaking the recursion.
--   2. Recreates pastoral RLS policies with the correct logic:
--      JOIN public.usuarios ON u.auth_id = auth.uid().
--   3. Drops the old `pastoral_triada_select_miembro` policy that caused
--      infinite recursion (it subqueried pastoral_triada_miembros which
--      subqueried back into pastoral_triada).
--   4. Grants SELECT (and appropriate mutating) privileges to the
--      authenticated role on all pastoral tables.
--
-- Already applied to staging via raw migration run.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. SECURITY DEFINER helpers (break the recursion cycle)
CREATE OR REPLACE FUNCTION auth_user_is_pastoral_actor(actor_pastoral_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = actor_pastoral_id
      AND auth_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION auth_user_is_pastoral_actor_for_triada(p_triada_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pastoral_triada_miembros m
    JOIN public.usuarios u ON u.id = m.persona_id
    WHERE m.triada_id = p_triada_id AND u.auth_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM usuarios
    WHERE id IN (SELECT t.mentor_oficial_persona_id FROM pastoral_triada t WHERE t.id = p_triada_id)
      AND auth_id = auth.uid()
  )
$$;

-- 2. Drop broken policies (idempotent guards)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pastoral_triada' AND policyname='pastoral_triada_select_mentor') THEN
    DROP POLICY pastoral_triada_select_mentor ON pastoral_triada;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pastoral_triada' AND policyname='pastoral_triada_select_miembro') THEN
    DROP POLICY pastoral_triada_select_miembro ON pastoral_triada;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pastoral_triada_miembros' AND policyname='pastoral_triada_miembros_select') THEN
    DROP POLICY pastoral_triada_miembros_select ON pastoral_triada_miembros;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pastoral_one_on_one' AND policyname='pastoral_one_on_one_select_mentor') THEN
    DROP POLICY pastoral_one_on_one_select_mentor ON pastoral_one_on_one;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pastoral_one_on_one' AND policyname='pastoral_one_on_one_select_asistido') THEN
    DROP POLICY pastoral_one_on_one_select_asistido ON pastoral_one_on_one;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pastoral_one_on_one' AND policyname='pastoral_one_on_one_select_pastoral_read') THEN
    DROP POLICY pastoral_one_on_one_select_pastoral_read ON pastoral_one_on_one;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pastoral_one_on_one_participantes' AND policyname='pastoral_one_on_one_participantes_select') THEN
    DROP POLICY pastoral_one_on_one_participantes_select ON pastoral_one_on_one_participantes;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pastoral_one_on_one_notas' AND policyname='pastoral_one_on_one_notas_select') THEN
    DROP POLICY pastoral_one_on_one_notas_select ON pastoral_one_on_one_notas;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pastoral_triada_eventos' AND policyname='pastoral_triada_eventos_select') THEN
    DROP POLICY pastoral_triada_eventos_select ON pastoral_triada_eventos;
  END IF;
END $$;

-- 3. Recreate with the auth.uid() → usuarios.auth_id join
CREATE POLICY pastoral_triada_select_mentor ON pastoral_triada FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = mentor_oficial_persona_id AND u.auth_id = auth.uid())
  OR auth_has_pastoral_capability('pastoral.read.all')
);

CREATE POLICY pastoral_triada_select_miembro ON pastoral_triada FOR SELECT USING (
  mentor_oficial_persona_id = auth.uid()
  OR auth_user_is_pastoral_actor_for_triada(id)
  OR auth_has_pastoral_capability('pastoral.read.all')
);

CREATE POLICY pastoral_triada_miembros_select ON pastoral_triada_miembros FOR SELECT USING (
  auth_user_is_pastoral_actor(persona_id)
  OR EXISTS (
    SELECT 1 FROM usuarios
    WHERE id IN (SELECT t.mentor_oficial_persona_id FROM pastoral_triada t WHERE t.id = triada_id)
      AND auth_id = auth.uid()
  )
  OR auth_has_pastoral_capability('pastoral.read.all')
);

CREATE POLICY pastoral_one_on_one_select_mentor ON pastoral_one_on_one FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = mentor_oficial_persona_id AND u.auth_id = auth.uid())
  OR auth_has_pastoral_capability('pastoral.read.all')
);

CREATE POLICY pastoral_one_on_one_select_asistido ON pastoral_one_on_one FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM pastoral_one_on_one_participantes p
    JOIN public.usuarios u ON u.id = p.persona_id
    WHERE p.one_on_one_id = pastoral_one_on_one.id AND u.auth_id = auth.uid()
  )
);

CREATE POLICY pastoral_one_on_one_select_pastoral_read ON pastoral_one_on_one FOR SELECT USING (
  auth_has_pastoral_capability('pastoral.read.all')
);

CREATE POLICY pastoral_one_on_one_participantes_select ON pastoral_one_on_one_participantes FOR SELECT USING (
  auth_user_is_pastoral_actor(persona_id)
  OR EXISTS (
    SELECT 1 FROM usuarios
    WHERE id IN (SELECT oo.mentor_oficial_persona_id FROM pastoral_one_on_one oo WHERE oo.id = one_on_one_id)
      AND auth_id = auth.uid()
  )
  OR auth_has_pastoral_capability('pastoral.read.all')
);

CREATE POLICY pastoral_one_on_one_notas_select ON pastoral_one_on_one_notas FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = autor_persona_id AND u.auth_id = auth.uid())
  OR auth_has_pastoral_capability('pastoral.read.all')
);

CREATE POLICY pastoral_triada_eventos_select ON pastoral_triada_eventos FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = actor_persona_id AND u.auth_id = auth.uid()
  )
  OR auth_has_pastoral_capability('pastoral.read.all')
);

-- 4. Grants (idempotent)
GRANT SELECT ON pastoral_triada TO authenticated;
GRANT SELECT, INSERT, UPDATE ON pastoral_triada TO authenticated;
GRANT SELECT ON pastoral_triada_miembros TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pastoral_triada_miembros TO authenticated;
GRANT SELECT ON pastoral_triada_eventos TO authenticated;
GRANT SELECT, INSERT ON pastoral_triada_eventos TO authenticated;
GRANT SELECT ON pastoral_one_on_one TO authenticated;
GRANT SELECT, INSERT, UPDATE ON pastoral_one_on_one TO authenticated;
GRANT SELECT ON pastoral_one_on_one_notas TO authenticated;
GRANT SELECT, INSERT ON pastoral_one_on_one_notas TO authenticated;
GRANT SELECT ON pastoral_one_on_one_participantes TO authenticated;
GRANT SELECT, INSERT, DELETE ON pastoral_one_on_one_participantes TO authenticated;
GRANT SELECT ON pastoral_crisis_detection_log TO authenticated;
GRANT SELECT ON pastoral_crisis_keyword_catalog TO authenticated;
