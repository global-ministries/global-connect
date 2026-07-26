-- ══════════════════════════════════════════════════════════════════════════════
-- F4 staging RLS fix: join personas through usuarios.auth_id, not auth.uid()
-- ══════════════════════════════════════════════════════════════════════════════
--
-- The pastoral RLS policies from M2/M7/M8 use `mentor_oficial_persona_id = auth.uid()`
-- and similar auth.uid() comparisons. But `auth.uid()` is the auth.users.id
-- (e.g. Ana's auth id is 6b213580-eb7c-420f-bd4e-7779bf264e7b), NOT
-- personas.id (Ana's persona is 1aea87c1-e674-44a9-a2db-91a17d02cc43). The
-- pastoral tables reference personas, not auth.users rows.
--
-- Result: Ana has pastoral.* grants and is a líder of Demo Pastoral
-- Barquisimeto, but RLS blocked the triada from showing because the
-- policy compared her auth_id (6b213580) to her mentor_oficial_persona_id
-- (1aea87c1) which is a different uuid space.
--
-- This migration rewrites the pastoral RLS policies to JOIN through
-- public.usuarios.auth_id = auth.uid() so the comparison is against
-- the right table.
--
-- Already applied to staging via raw migration run.
-- ══════════════════════════════════════════════════════════════════════════════

-- Drop the broken policies (only the ones we know exist; idempotent)
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
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pastoral_one_on_one' AND policyname='pastoral_one_on_one_select_asistido_pastoral_read') THEN
    DROP POLICY pastoral_one_on_one_select_asistido_pastoral_read ON pastoral_one_on_one;
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

-- Recreate with the correct auth.uid() → usuarios.auth_id join
CREATE POLICY pastoral_triada_select_mentor ON pastoral_triada FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = mentor_oficial_persona_id AND u.auth_id = auth.uid())
  OR auth_has_pastoral_capability('pastoral.read.all')
);

CREATE POLICY pastoral_triada_select_miembro ON pastoral_triada FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM pastoral_triada_miembros m
    JOIN public.usuarios u ON u.id = m.persona_id
    WHERE m.triada_id = pastoral_triada.id AND u.auth_id = auth.uid()
  )
);

CREATE POLICY pastoral_triada_miembros_select ON pastoral_triada_miembros FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = persona_id AND u.auth_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id IN (SELECT t.mentor_oficial_persona_id FROM pastoral_triada t WHERE t.id = triada_id)
      AND u.auth_id = auth.uid()
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
  EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = persona_id AND u.auth_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM pastoral_one_on_one oo
    WHERE oo.id = one_on_one_id
      AND (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = oo.mentor_oficial_persona_id AND u.auth_id = auth.uid())
           OR auth_has_pastoral_capability('pastoral.read.all'))
  )
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
