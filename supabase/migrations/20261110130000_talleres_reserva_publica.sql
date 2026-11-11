-- T5a (odd/tasks/talleres-reserva-publica.md) — storage for the public
-- reservation of Grupos de Corto Plazo talleres (S3, S4, S11, S12, S13).
-- The functions that read and write it are in 20261110140000.
--
-- Adds:
--   A. talleres.publico boolean NOT NULL DEFAULT false (the taller is
--      listed on the public page; Próximo Paso stays false, S10),
--      talleres.genero_requerido enum_genero NULL (Masculino or Femenino
--      only, e.g. De Hombre a Hombre / Mujer de Hoy) and
--      taller_ediciones.lugar text NULL. This migration marks NO taller as
--      publico: the data is set afterwards, on purpose, per taller.
--   B. invitaciones_acceso.origen also accepts 'taller_publico' (the
--      account invitation of a new person who reserved publicly, S4).
--   C. reserva_publica_limites: one row per consumed unit of a public
--      action (ip hash, action, optional key hash). Never a raw cédula.
--   D. taller_reserva_codigos: the one-time codes that prove an existing
--      person (S3, S11) and the short-lived token a verified code yields.
--      Only hashes are stored.
--   E. taller_avisame_lugar: people who asked to be told when a place
--      frees up in a full edición (S13: everyone is notified).
--   F. avisos_persona: generic in-app notices for a person (the code
--      notice of S11, later the taller notices of T7). The owner reads
--      the non-expired ones and may only set leido_at; RPCs mis_avisos()
--      and aviso_marcar_leido(uuid) run as the caller (RLS applies).
--
-- C, D and E have RLS on and no grant for anon or authenticated: only the
-- service_role functions of 20261110140000 touch them.
--
-- Rollback (in this order, only while no row uses them):
--   DROP FUNCTION IF EXISTS public.aviso_marcar_leido(uuid), public.mis_avisos();
--   DROP TABLE IF EXISTS public.avisos_persona, public.taller_avisame_lugar,
--     public.taller_reserva_codigos, public.reserva_publica_limites;
--   ALTER TABLE public.invitaciones_acceso DROP CONSTRAINT invitaciones_acceso_origen_check,
--     ADD CONSTRAINT invitaciones_acceso_origen_check CHECK (origen IN ('taller_pareja'));
--   ALTER TABLE public.taller_ediciones DROP COLUMN IF EXISTS lugar;
--   ALTER TABLE public.talleres DROP COLUMN IF EXISTS genero_requerido, DROP COLUMN IF EXISTS publico;

-- ===========================================================================
-- A. Taller and edición columns
-- ===========================================================================

ALTER TABLE public.talleres
  ADD COLUMN publico boolean NOT NULL DEFAULT false,
  ADD COLUMN genero_requerido public.enum_genero NULL
    CONSTRAINT talleres_genero_requerido_check
      CHECK (genero_requerido IS NULL OR genero_requerido IN ('Masculino', 'Femenino'));

COMMENT ON COLUMN public.talleres.publico IS
  'True when the taller is offered on the public reservation page (Grupos de Corto Plazo). Default false; set per taller, never by a migration.';
COMMENT ON COLUMN public.talleres.genero_requerido IS
  'When set, only a principal of this género may reserve publicly (e.g. Mujer de Hoy: Femenino). NULL: anyone.';

ALTER TABLE public.taller_ediciones
  ADD COLUMN lugar text NULL
    CONSTRAINT taller_ediciones_lugar_check CHECK (lugar IS NULL OR length(lugar) BETWEEN 1 AND 200);

COMMENT ON COLUMN public.taller_ediciones.lugar IS
  'Where the edición meets, shown on the public page. NULL: not announced yet.';

-- ===========================================================================
-- B. invitaciones_acceso.origen
-- ===========================================================================

ALTER TABLE public.invitaciones_acceso
  DROP CONSTRAINT invitaciones_acceso_origen_check,
  ADD CONSTRAINT invitaciones_acceso_origen_check
    CHECK (origen IN ('taller_pareja', 'taller_publico'));

-- ===========================================================================
-- C. reserva_publica_limites
-- ===========================================================================

CREATE TABLE public.reserva_publica_limites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  accion text NOT NULL CHECK (accion ~ '^[a-z_]{1,40}$'),
  clave text NULL CHECK (clave IS NULL OR clave ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reserva_publica_limites_ip_idx
  ON public.reserva_publica_limites (accion, ip_hash, created_at DESC);
CREATE INDEX reserva_publica_limites_clave_idx
  ON public.reserva_publica_limites (accion, clave, created_at DESC) WHERE clave IS NOT NULL;

COMMENT ON TABLE public.reserva_publica_limites IS
  'Rate limits of the public reservation: one row per consumed unit. ip_hash is the app''s salted SHA-256 of the client IP; clave is the SHA-256 hex of a per-subject key (a normalized cédula, a code id), never the raw value. Written only by reserva_publica_consumir (service_role).';

ALTER TABLE public.reserva_publica_limites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reserva_publica_limites FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- D. taller_reserva_codigos
-- ===========================================================================

CREATE TABLE public.taller_reserva_codigos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  edicion_id uuid NOT NULL REFERENCES public.taller_ediciones(id) ON DELETE CASCADE,
  codigo_hash text NOT NULL CHECK (codigo_hash ~ '^[0-9a-f]{64}$'),
  expira_en timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  intentos integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  bloqueado boolean NOT NULL DEFAULT false,
  usado_en timestamptz NULL,
  reenvios integer NOT NULL DEFAULT 0 CHECK (reenvios >= 0),
  ultimo_envio_en timestamptz NOT NULL DEFAULT now(),
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  token_hash text NULL UNIQUE CHECK (token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'),
  token_expira_en timestamptz NULL,
  token_usado_en timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX taller_reserva_codigos_usuario_idx
  ON public.taller_reserva_codigos (usuario_id, edicion_id);

COMMENT ON TABLE public.taller_reserva_codigos IS
  'One-time codes of the public reservation. codigo_hash is the app''s salted hash of a 6-digit code sent by email and in-app (10 minutes, 5 attempts, single use, up to 3 resends 60 s apart). A verified code stores token_hash (30 minutes, single use) that talleres_reserva_crear exchanges for the inscription. Service_role functions only.';

ALTER TABLE public.taller_reserva_codigos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.taller_reserva_codigos FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- E. taller_avisame_lugar
-- ===========================================================================

CREATE TABLE public.taller_avisame_lugar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_id uuid NOT NULL REFERENCES public.taller_ediciones(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 120),
  email text NOT NULL CHECK (length(email) <= 254),
  usuario_id uuid NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  notificado_en timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX taller_avisame_lugar_edicion_email_key
  ON public.taller_avisame_lugar (edicion_id, lower(email));

COMMENT ON TABLE public.taller_avisame_lugar IS
  'Who asked to be told when a full edición frees a place (S13: everyone is notified, first come first served). One row per edición and email (case-insensitive). Service_role functions only.';

ALTER TABLE public.taller_avisame_lugar ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.taller_avisame_lugar FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- F. avisos_persona
-- ===========================================================================

CREATE TABLE public.avisos_persona (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo ~ '^[a-z_]{1,40}$'),
  titulo text NOT NULL CHECK (length(titulo) BETWEEN 1 AND 160),
  cuerpo text NULL CHECK (cuerpo IS NULL OR length(cuerpo) <= 1000),
  url text NULL CHECK (url IS NULL OR (length(url) <= 500 AND url ~ '^/')),
  datos jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(datos) = 'object'),
  leido_at timestamptz NULL,
  expira_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX avisos_persona_persona_idx
  ON public.avisos_persona (persona_id, created_at DESC);

COMMENT ON TABLE public.avisos_persona IS
  'In-app notices for one person. The owner (usuarios.auth_id = auth.uid()) reads the rows not yet expired and may only set leido_at; everything else is written by service_role. url is an in-app path. A codigo_reserva notice carries a one-time code and expires with it.';

ALTER TABLE public.avisos_persona ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.avisos_persona FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.avisos_persona TO authenticated;
GRANT UPDATE (leido_at) ON TABLE public.avisos_persona TO authenticated;

-- ninos_usuario_actual(): the caller's usuarios.id (definer, granted to
-- authenticated), the existing helper for exactly this lookup.
CREATE POLICY avisos_persona_select_propio ON public.avisos_persona
  FOR SELECT TO authenticated
  USING (
    persona_id = (SELECT public.ninos_usuario_actual())
    AND (expira_at IS NULL OR expira_at > now())
  );

CREATE POLICY avisos_persona_update_propio ON public.avisos_persona
  FOR UPDATE TO authenticated
  USING (
    persona_id = (SELECT public.ninos_usuario_actual())
    AND (expira_at IS NULL OR expira_at > now())
  )
  WITH CHECK (persona_id = (SELECT public.ninos_usuario_actual()));

-- The caller's notices not yet expired, newest first (at most 100).
CREATE OR REPLACE FUNCTION public.mis_avisos()
RETURNS SETOF public.avisos_persona
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT a.*
    FROM public.avisos_persona a
   WHERE a.persona_id = (SELECT public.ninos_usuario_actual())
     AND (a.expira_at IS NULL OR a.expira_at > now())
   ORDER BY a.created_at DESC
   LIMIT 100;
$function$;

COMMENT ON FUNCTION public.mis_avisos() IS
  'The caller''s non-expired avisos_persona rows, newest first, at most 100. Runs as the caller: RLS limits it to the owner.';

REVOKE ALL ON FUNCTION public.mis_avisos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mis_avisos() TO authenticated, service_role;

-- True when the caller's notice became read now; false when it is not
-- theirs, expired or already read.
CREATE OR REPLACE FUNCTION public.aviso_marcar_leido(p_aviso_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  UPDATE public.avisos_persona
     SET leido_at = now()
   WHERE id = p_aviso_id AND leido_at IS NULL;
  RETURN FOUND;
END;
$function$;

COMMENT ON FUNCTION public.aviso_marcar_leido(uuid) IS
  'Sets leido_at on one of the caller''s non-expired, unread notices. Runs as the caller (RLS + column grant on leido_at). Returns whether a row changed.';

REVOKE ALL ON FUNCTION public.aviso_marcar_leido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aviso_marcar_leido(uuid) TO authenticated, service_role;
