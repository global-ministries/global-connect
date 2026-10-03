-- noqa: grant-to-anon-on-definer (anon executes verificar_certificado_publico on purpose; see below)
-- Public certificate verification through one RPC instead of an open table
-- (security phase 3, batch L4).
--
-- lib/platform/talleres/verificar-certificado.ts looked a certificate up with
-- a sessionless anon client: SELECT ... FROM taller_certificados WHERE
-- codigo_verificacion = <code>. That needed an anon grant on the table plus
-- the policy taller_certificados_select_anon (revocado_at IS NULL, for anon
-- and authenticated), so anybody holding the public anon key could drop the
-- filter and list every non-revoked certificate, persona_id and
-- pdf_storage_path included, not only the one whose code they hold.
--
-- verificar_certificado_publico(p_codigo) answers exactly the old question:
-- at most one row, the certificate whose codigo_verificacion equals p_codigo
-- and whose revocado_at is NULL, with the nine columns the app selected
-- (NON_SENSITIVE_COLUMNS, same names and types). A NULL or empty code returns
-- no rows. The code is compared as given; the app validates its format first
-- and never trimmed it. Anon may execute it ON PURPOSE: this is the public
-- verification page, reachable without signing in. Knowing a code is the
-- only way to read a certificate as anon now.
--
-- Then anon loses every privilege on taller_certificados (table and column
-- level), and the policy taller_certificados_select_anon is kept for
-- authenticated only: lib/platform/talleres/participante.ts embeds
-- taller_certificados (persona_id, fecha_completitud) under the person's own
-- inscriptions, and that read relies on this policy; there is no
-- own-certificate policy to fall back to. Narrowing what a signed-in person
-- can list is left for a later batch.
--
-- taller_certificados is created by 20260811130000, so it exists everywhere
-- this file runs; no to_regclass guard.

CREATE OR REPLACE FUNCTION public.verificar_certificado_publico(p_codigo text)
RETURNS TABLE (
  id uuid,
  codigo_verificacion text,
  taller_id uuid,
  persona_id uuid,
  nombre_taller_snapshot text,
  nombre_participante_snapshot text,
  nombre_pareja_snapshot text,
  fecha_completitud timestamptz,
  firmantes_snapshot jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.codigo_verificacion, c.taller_id, c.persona_id,
         c.nombre_taller_snapshot, c.nombre_participante_snapshot,
         c.nombre_pareja_snapshot, c.fecha_completitud, c.firmantes_snapshot
    FROM public.taller_certificados c
   WHERE p_codigo IS NOT NULL
     AND p_codigo <> ''
     AND c.codigo_verificacion = p_codigo
     AND c.revocado_at IS NULL
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.verificar_certificado_publico(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verificar_certificado_publico(text) TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.taller_certificados FROM anon;
REVOKE ALL (id, inscripcion_id, codigo_verificacion, taller_id, persona_id,
            nombre_taller_snapshot, nombre_participante_snapshot,
            fecha_completitud, firmantes_snapshot, pdf_storage_path,
            revocado_at, motivo_revocacion, version, created_at,
            nombre_pareja_snapshot)
  ON TABLE public.taller_certificados FROM anon;

ALTER POLICY taller_certificados_select_anon ON public.taller_certificados TO authenticated;
