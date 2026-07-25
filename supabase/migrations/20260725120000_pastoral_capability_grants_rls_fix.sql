GRANT SELECT ON TABLE public.dream_team_capability_grants TO authenticated;

DROP POLICY IF EXISTS "dream_team_capability_grants_read_own"
  ON public.dream_team_capability_grants;

CREATE POLICY "dream_team_capability_grants_read_own_pastoral"
  ON public.dream_team_capability_grants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios AS u
      WHERE u.id = dream_team_capability_grants.persona_id
        AND u.auth_id = (SELECT auth.uid())
    )
  );
