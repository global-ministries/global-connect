-- noqa: insert-into
-- DPS planning: service notices by e-mail (odd/tasks/dps-asistencia-pco.md,
-- T16b; S14.1, S14.2, S14.4, S14.5; L70-L73; artboards
-- design/dps-avisos-correo 01-06). Builds on 20261109210000_dps_avisos.sql.
--
-- The user asked (L70): "otra cosa que veo es el envio de emails de avisos
-- para servir un domingo al enviar aviso.. mira como lo hace planning
-- center", and chose (L71) "Confirmar sin iniciar sesión" and "Correo
-- inmediato a quien envió". Approved designs (L73): one e-mail per person and
-- send, «Confirmar» opens a page with a big button (link scanners never
-- confirm), the link never undoes a «No puedo», the page shows puesto and
-- fecha without a name, and the e-mail to the planner replies to the person
-- who cannot.
--
-- What:
--   1. dps_avisos.version: 1 on the first notice, + 1 on every send that
--      changes what the person was told (nueva over an old row, cambio,
--      quitado). A confirm link is bound to the version it was sent with.
--   2. dps_avisos_correos: the e-mail outbox (RLS on, no policies, no
--      privilege for anon or authenticated), like taller_avisos_envios:
--        tipo 'avisos'    one row per person and send (clave 'avisos:<persona>:
--                         md5 of the sorted aviso:version list', so the same
--                         notices never queue twice); datos.bloques = the
--                         notices of that send (dps_aviso_json + aviso_id,
--                         version, aviso 'nueva' | 'cambio' | 'quitado' and
--                         confirmar = it asks for an answer), ordered
--                         nuevas, cambios, quitados, then by fecha;
--                         responder_* = the planner who sent (Reply-To).
--        tipo 'no_puede'  one row per «No puedo» (clave 'no_puede:<aviso>:<n>',
--                         n = the answer's number: the trigger fires once per
--                         answer that becomes no_puede), to whoever sent that notice
--                         (enviado_por); datos = the person, the service, the
--                         motivo and «Cómo queda el puesto» (per role: the
--                         people in it with their state, cubiertos = not
--                         no_puede, cantidad = cupos of the puesto, or the
--                         people of the column); responder_* = the person.
--      estado 'pendiente' | 'enviado' | 'fallido' | 'sin_correo' (nobody to
--      write to: the notice is only in the panel), intentos, a 10-minute
--      lease, vence (the last fecha: never sent after it, 'vencido').
--   3. dps_avisos_tokens: the SHA-256 (hex) of each confirm link, with the
--      aviso and version it confirms. The raw token never reaches the
--      database at rest: the app derives it (HMAC of aviso:version) and
--      registers its hash before sending.
--   4. dps_avisos_enviar (same signature) also bumps version, queues the
--      e-mails of the send (dps_avisos_correos_encolar) and returns
--      por_correo / solo_panel (notices whose person has / has no e-mail).
--      Closures (cerrar) send nothing, as before.
--      dps_avisos_pendientes (same signature) adds tiene_correo to each
--      person, por_correo / solo_panel and remitente {nombre, email} (the
--      caller: replies reach them).
--   5. Trigger dps_avisos_no_puede (AFTER UPDATE OF estado): an aviso that
--      becomes no_puede queues the planner e-mail, from the app or from
--      anywhere; it never blocks the answer (errors become a WARNING).
--   6. Service_role only (the app with the admin client):
--        dps_avisos_correos_reclamar(limite, tope_diario)  leases due rows
--            (vencidos first marked fallido 'vencido'; the daily cap counts
--            today's enviados and the rows in lease; serialized);
--        dps_avisos_correos_resultado(id, ok, error)  enviado, or back to
--            pendiente after 2^intentos minutes, fallido after 5 attempts;
--        dps_avisos_correos_soltar(ids)  T16d: gives back the leased rows a
--            run did not start (its time budget ran out): due now, the
--            attempt returned; returns how many;
--        dps_avisos_tokens_registrar(tokens)  [{hash, aviso_id, version}],
--            up to 200, unknown avisos ignored, idempotent;
--        dps_aviso_token_leer(token) / dps_aviso_token_confirmar(token)  the
--            public confirm page (S14.2): {estado} with 'invalido' (bad or
--            unknown token: nothing else), 'vencido' (the plan date passed:
--            fecha only), 'quitado', 'no_puede' (never undone), 'ya_confirmado',
--            'cambio' (another version was sent since: what changed, nothing
--            confirmed), 'por_confirmar' (leer) / 'confirmado' (confirmar
--            writes estado confirmo, respondido_at, clears cambio). Besides
--            estado: plan_id, fecha, tipo, titulo, serie, roles {nombre,
--            equipo}, horarios, llegada, respondido_at and, for cambio,
--            antes. Never a name or another person's data.
--      The confirm RPCs are not granted to anon (no definer function is,
--      odd/tasks/seguridad-definer-fase1-anon.md): the public page calls them
--      on the server with the service client.
--   7. Internal (no EXECUTE for PUBLIC, anon, authenticated or service_role:
--      only the definer functions above call them; T16d):
--      dps_correo_valido(text), dps_avisos_correos_encolar(uuid, jsonb),
--      dps_avisos_no_puede_encolar(uuid), dps_avisos_no_puede_trg(),
--      dps_aviso_token_vista(uuid, text).
--
-- Errors: 'demasiados' (22023) in dps_avisos_tokens_registrar and
-- dps_avisos_correos_soltar; the rest as
-- 20261109210000.
--
-- Suite: supabase/tests/dps-avisos-correo.test.sql.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS dps_avisos_no_puede ON public.dps_avisos;
--   DROP FUNCTION IF EXISTS public.dps_aviso_token_confirmar(text), public.dps_aviso_token_leer(text),
--     public.dps_aviso_token_vista(uuid, text), public.dps_avisos_tokens_registrar(jsonb),
--     public.dps_avisos_correos_soltar(uuid[]), public.dps_avisos_correos_resultado(uuid, boolean, text),
--     public.dps_avisos_correos_reclamar(integer, integer),
--     public.dps_avisos_no_puede_trg(), public.dps_avisos_no_puede_encolar(uuid),
--     public.dps_avisos_correos_encolar(uuid, jsonb), public.dps_correo_valido(text);
--   re-run the CREATE OR REPLACE FUNCTION blocks of dps_avisos_pendientes and
--   dps_avisos_enviar from 20261109210000;
--   DROP TABLE IF EXISTS public.dps_avisos_tokens, public.dps_avisos_correos;
--   ALTER TABLE public.dps_avisos DROP COLUMN IF EXISTS version;

-- ── 1. tables ────────────────────────────────────────────────────────

ALTER TABLE public.dps_avisos ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.dps_avisos DROP CONSTRAINT IF EXISTS dps_avisos_version_check;
ALTER TABLE public.dps_avisos ADD CONSTRAINT dps_avisos_version_check CHECK (version >= 1);
COMMENT ON COLUMN public.dps_avisos.version IS
  'T16b: + 1 on every send that changes what the person was told; a confirm link is bound to it.';

CREATE TABLE IF NOT EXISTS public.dps_avisos_correos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL,
  tipo text NOT NULL,
  persona_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  email text,
  nombre text,
  responder_nombre text,
  responder_email text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  vence date,
  estado text NOT NULL DEFAULT 'pendiente',
  intentos integer NOT NULL DEFAULT 0,
  disponible_en timestamptz NOT NULL DEFAULT now(),
  enviado_en timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dps_avisos_correos_clave_key UNIQUE (clave)
);
CREATE INDEX IF NOT EXISTS dps_avisos_correos_pendientes_idx
  ON public.dps_avisos_correos (disponible_en) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS dps_avisos_correos_persona_idx ON public.dps_avisos_correos (persona_id);
CREATE INDEX IF NOT EXISTS dps_avisos_correos_no_puede_idx
  ON public.dps_avisos_correos ((datos ->> 'aviso_id')) WHERE tipo = 'no_puede';

ALTER TABLE public.dps_avisos_correos DROP CONSTRAINT IF EXISTS dps_avisos_correos_forma_check;
ALTER TABLE public.dps_avisos_correos
  ADD CONSTRAINT dps_avisos_correos_forma_check
  CHECK (char_length(clave) BETWEEN 1 AND 200 AND tipo IN ('avisos', 'no_puede') AND jsonb_typeof(datos) = 'object'
         AND (email IS NULL OR char_length(email) <= 254) AND (nombre IS NULL OR char_length(nombre) <= 120)
         AND (responder_nombre IS NULL OR char_length(responder_nombre) <= 200)
         AND (responder_email IS NULL OR char_length(responder_email) <= 254)
         AND intentos >= 0 AND (error IS NULL OR char_length(error) <= 500));
ALTER TABLE public.dps_avisos_correos DROP CONSTRAINT IF EXISTS dps_avisos_correos_estado_check;
ALTER TABLE public.dps_avisos_correos
  ADD CONSTRAINT dps_avisos_correos_estado_check
  CHECK (estado IN ('pendiente', 'enviado', 'fallido', 'sin_correo') AND (estado <> 'pendiente' OR email IS NOT NULL));

CREATE TABLE IF NOT EXISTS public.dps_avisos_tokens (
  hash text PRIMARY KEY,
  aviso_id uuid NOT NULL REFERENCES public.dps_avisos(id) ON DELETE CASCADE,
  version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dps_avisos_tokens_aviso_idx ON public.dps_avisos_tokens (aviso_id);
ALTER TABLE public.dps_avisos_tokens DROP CONSTRAINT IF EXISTS dps_avisos_tokens_forma_check;
ALTER TABLE public.dps_avisos_tokens
  ADD CONSTRAINT dps_avisos_tokens_forma_check CHECK (hash ~ '^[0-9a-f]{64}$' AND version >= 1);

COMMENT ON TABLE public.dps_avisos_correos IS
  'DPS e-mail outbox (S14.1, S14.4): one row per person and send (avisos) or per «No puedo» (no_puede). Only through the dps_* functions; sent by the app with the service client.';
COMMENT ON TABLE public.dps_avisos_tokens IS
  'DPS confirm links (S14.2): SHA-256 of each token with the aviso and version it confirms. Only through the dps_* functions.';

ALTER TABLE public.dps_avisos_correos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dps_avisos_tokens ENABLE ROW LEVEL SECURITY;
-- Default privileges hand anon and authenticated everything; start from none.
REVOKE ALL ON public.dps_avisos_correos, public.dps_avisos_tokens FROM PUBLIC, anon, authenticated;

-- ── 2. internal helpers ──────────────────────────────────────────────

-- The address of a ficha when it looks like one (trimmed), else NULL.
CREATE OR REPLACE FUNCTION public.dps_correo_valido(p_email text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE WHEN btrim(p_email) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND char_length(btrim(p_email)) <= 254
              THEN btrim(p_email) END;
$$;
REVOKE ALL ON FUNCTION public.dps_correo_valido(text) FROM PUBLIC, anon, authenticated, service_role;

-- Queues the e-mails of one send: p_tocados = [{aviso_id, tipo}] of the
-- notices it delivered. One row per person (sin_correo without an e-mail).
-- Returns {por_correo, solo_panel}: notices per channel.
CREATE OR REPLACE FUNCTION public.dps_avisos_correos_encolar(p_actor uuid, p_tocados jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_rem_nombre text;
  v_rem_email text;
  v_resultado jsonb;
BEGIN
  SELECT nullif(concat_ws(' ', btrim(u.nombre), btrim(u.apellido)), ''), public.dps_correo_valido(u.email)
    INTO v_rem_nombre, v_rem_email
    FROM public.usuarios u WHERE u.id = p_actor;

  WITH t AS (
    SELECT DISTINCT (x ->> 'aviso_id')::uuid AS aviso_id, x ->> 'tipo' AS tipo
      FROM jsonb_array_elements(coalesce(p_tocados, '[]'::jsonb)) x
  ), b AS (
    SELECT v.persona_id, v.id, v.version, v.fecha, t.tipo,
           public.dps_aviso_json(v.id)
             || jsonb_build_object('aviso_id', v.id, 'version', v.version, 'aviso', t.tipo,
                                   'confirmar', t.tipo IN ('nueva', 'cambio') AND v.estado = 'pendiente') AS bloque
      FROM t JOIN public.dps_avisos v ON v.id = t.aviso_id
  ), personas AS (
    SELECT b.persona_id,
           jsonb_agg(b.bloque ORDER BY CASE b.tipo WHEN 'nueva' THEN 0 WHEN 'cambio' THEN 1 ELSE 2 END, b.fecha, b.id) AS bloques,
           string_agg(b.id::text || ':' || b.version, ',' ORDER BY b.id) AS firma,
           count(*)::int AS avisos,
           max(b.fecha) AS vence
      FROM b GROUP BY b.persona_id
  ), filas AS (
    INSERT INTO public.dps_avisos_correos AS c -- noqa: insert-into
      (clave, tipo, persona_id, email, nombre, responder_nombre, responder_email, datos, vence, estado)
    SELECT 'avisos:' || pe.persona_id || ':' || md5(pe.firma), 'avisos', pe.persona_id,
           public.dps_correo_valido(u.email), left(nullif(split_part(btrim(u.nombre), ' ', 1), ''), 120),
           left(v_rem_nombre, 200), v_rem_email,
           jsonb_build_object('bloques', pe.bloques, 'avisos', pe.avisos), pe.vence,
           CASE WHEN public.dps_correo_valido(u.email) IS NULL THEN 'sin_correo' ELSE 'pendiente' END
      FROM personas pe JOIN public.usuarios u ON u.id = pe.persona_id
    ON CONFLICT ON CONSTRAINT dps_avisos_correos_clave_key DO NOTHING
    RETURNING c.estado, (c.datos ->> 'avisos')::int AS avisos
  )
  SELECT jsonb_build_object(
           'por_correo', coalesce(sum(f.avisos) FILTER (WHERE f.estado = 'pendiente'), 0),
           'solo_panel', coalesce(sum(f.avisos) FILTER (WHERE f.estado = 'sin_correo'), 0))
    INTO v_resultado
    FROM filas f;
  RETURN v_resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_avisos_correos_encolar(uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- Queues the e-mail to the planner for one «No puedo» (S14.4). Returns
-- whether a row was written (false: not no_puede, nobody sent it, or already
-- queued for this answer).
CREATE OR REPLACE FUNCTION public.dps_avisos_no_puede_encolar(p_aviso_id uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_aviso public.dps_avisos%ROWTYPE;
  v_persona text;
  v_persona_email text;
  v_planificador text;
  v_planificador_email text;
  v_puestos jsonb;
  v_filas integer;
BEGIN
  SELECT * INTO v_aviso FROM public.dps_avisos v WHERE v.id = p_aviso_id;
  IF NOT FOUND OR v_aviso.estado <> 'no_puede' OR v_aviso.enviado_por IS NULL THEN
    RETURN false;
  END IF;
  SELECT nullif(concat_ws(' ', btrim(u.nombre), btrim(u.apellido)), ''), public.dps_correo_valido(u.email)
    INTO v_persona, v_persona_email
    FROM public.usuarios u WHERE u.id = v_aviso.persona_id;
  SELECT left(nullif(split_part(btrim(u.nombre), ' ', 1), ''), 120), public.dps_correo_valido(u.email)
    INTO v_planificador, v_planificador_email
    FROM public.usuarios u WHERE u.id = v_aviso.enviado_por;

  -- «Cómo queda el puesto»: each role of the notice with the people in it now.
  WITH roles AS (
    SELECT r.rol, r.o FROM jsonb_array_elements(v_aviso.roles) WITH ORDINALITY AS r(rol, o)
  ), gente AS (
    SELECT ro.o, x.nombre, x.estado, x.posicion
      FROM roles ro
     CROSS JOIN LATERAL (
       SELECT concat_ws(' ', u.nombre, u.apellido) AS nombre,
              CASE WHEN a.id IS NULL OR a.quitado THEN 'sin_avisar' ELSE a.estado END AS estado,
              row_number() OVER (ORDER BY c.created_at, c.id)::int AS posicion
         FROM public.dps_convocados c
         JOIN public.usuarios u ON u.id = c.persona_id
         LEFT JOIN public.dps_avisos a ON a.plan_id = c.plan_id AND a.persona_id = c.persona_id
        WHERE ro.rol ->> 'origen' = 'puesto' AND c.plan_id = v_aviso.plan_id
          AND c.puesto_id = (ro.rol ->> 'puesto_id')::uuid
       UNION ALL
       SELECT coalesce(concat_ws(' ', u.nombre, u.apellido), pp.texto),
              CASE WHEN pp.persona_id IS NULL THEN 'sin_cuenta'
                   WHEN a.id IS NULL OR a.quitado THEN 'sin_avisar' ELSE a.estado END,
              pp.posicion + 1
         FROM public.dps_plan_personas pp
         LEFT JOIN public.usuarios u ON u.id = pp.persona_id
         LEFT JOIN public.dps_avisos a ON a.plan_id = pp.plan_id AND a.persona_id = pp.persona_id
        WHERE ro.rol ->> 'origen' = 'columna' AND pp.plan_id = v_aviso.plan_id AND pp.columna = ro.rol ->> 'columna'
     ) x
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'nombre', ro.rol ->> 'nombre', 'equipo', ro.rol ->> 'equipo',
           'cantidad', CASE WHEN ro.rol ->> 'origen' = 'puesto'
                            THEN (SELECT pu.cantidad FROM public.dps_puestos pu WHERE pu.id = (ro.rol ->> 'puesto_id')::uuid)
                            ELSE (SELECT count(*) FROM gente g WHERE g.o = ro.o) END,
           'cubiertos', (SELECT count(*) FROM gente g WHERE g.o = ro.o AND g.estado <> 'no_puede'),
           'personas', coalesce((SELECT jsonb_agg(jsonb_build_object('nombre', g.nombre, 'estado', g.estado) ORDER BY g.posicion, g.nombre)
                                   FROM gente g WHERE g.o = ro.o), '[]'::jsonb))
           ORDER BY ro.o), '[]'::jsonb)
    INTO v_puestos
    FROM roles ro;

  INSERT INTO public.dps_avisos_correos AS c -- noqa: insert-into
    (clave, tipo, persona_id, email, nombre, responder_nombre, responder_email, datos, vence, estado)
  SELECT 'no_puede:' || v_aviso.id || ':'
           || (SELECT count(*) + 1 FROM public.dps_avisos_correos x
                WHERE x.tipo = 'no_puede' AND x.datos ->> 'aviso_id' = v_aviso.id::text),
         'no_puede', v_aviso.enviado_por, v_planificador_email, v_planificador, left(v_persona, 200), v_persona_email,
         public.dps_aviso_json(v_aviso.id)
           || jsonb_build_object('aviso_id', v_aviso.id, 'persona', v_persona, 'puestos', v_puestos),
         v_aviso.fecha,
         CASE WHEN v_planificador_email IS NULL THEN 'sin_correo' ELSE 'pendiente' END
  ON CONFLICT ON CONSTRAINT dps_avisos_correos_clave_key DO NOTHING;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_avisos_no_puede_encolar(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dps_avisos_no_puede_trg()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- The e-mail never blocks the answer.
  BEGIN
    PERFORM public.dps_avisos_no_puede_encolar(NEW.id);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'dps_avisos_no_puede: % %', SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_avisos_no_puede_trg() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS dps_avisos_no_puede ON public.dps_avisos;
CREATE TRIGGER dps_avisos_no_puede
  AFTER UPDATE OF estado ON public.dps_avisos
  FOR EACH ROW
  WHEN (NEW.estado = 'no_puede' AND OLD.estado IS DISTINCT FROM 'no_puede')
  EXECUTE FUNCTION public.dps_avisos_no_puede_trg();

-- What the public confirm page may show for a notice (S14.5: no name).
CREATE OR REPLACE FUNCTION public.dps_aviso_token_vista(p_aviso_id uuid, p_estado text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN p_estado = 'invalido' OR v.id IS NULL THEN jsonb_build_object('estado', 'invalido')
    WHEN p_estado = 'vencido' THEN jsonb_build_object('estado', 'vencido', 'plan_id', v.plan_id, 'fecha', p.fecha, 'tipo', p.tipo)
    ELSE jsonb_build_object(
      'estado', p_estado, 'plan_id', v.plan_id, 'fecha', v.fecha, 'tipo', p.tipo, 'titulo', p.titulo, 'serie', s.nombre,
      'roles', coalesce((SELECT jsonb_agg(jsonb_build_object('nombre', r ->> 'nombre', 'equipo', r ->> 'equipo') ORDER BY o)
                           FROM jsonb_array_elements(v.roles) WITH ORDINALITY AS t(r, o)), '[]'::jsonb),
      'horarios', v.horarios, 'llegada', to_char(v.llegada, 'HH24:MI'),
      'respondido_at', CASE WHEN p_estado IN ('ya_confirmado', 'confirmado', 'no_puede') THEN v.respondido_at END,
      'antes', CASE WHEN p_estado = 'cambio' THEN jsonb_build_object(
                 'roles', (SELECT jsonb_agg(jsonb_build_object('nombre', r ->> 'nombre', 'equipo', r ->> 'equipo') ORDER BY o)
                             FROM jsonb_array_elements(v.roles_antes) WITH ORDINALITY AS t(r, o)),
                 'fecha', v.fecha_antes, 'horarios', v.horarios_antes, 'llegada', to_char(v.llegada_antes, 'HH24:MI')) END)
  END
    FROM (SELECT 1) uno
    LEFT JOIN public.dps_avisos v ON v.id = p_aviso_id
    LEFT JOIN public.dps_planes p ON p.id = v.plan_id
    LEFT JOIN public.dps_series s ON s.id = p.serie_id;
$$;
REVOKE ALL ON FUNCTION public.dps_aviso_token_vista(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- ── 3. planner ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dps_avisos_pendientes(p_plan_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_ids uuid[];
BEGIN
  v_ids := public.dps_avisos_preparar(p_plan_ids);
  RETURN (
    WITH d AS MATERIALIZED (
      SELECT x.* FROM public.dps_avisos_diff(v_ids) x
    ), f AS MATERIALIZED (
      SELECT d.plan_id, d.persona_id, d.tipo, d.reinicia, d.claves, d.roles,
             v.roles AS roles_avisados, v.claves AS claves_avisadas, v.fecha AS fecha_avisada,
             v.horarios AS horarios_avisados, v.llegada AS llegada_avisada, v.estado AS estado_aviso,
             pl.fecha, pl.horarios, pl.llegada, u.nombre, u.apellido,
             public.dps_correo_valido(u.email) IS NOT NULL AS tiene_correo,
             jsonb_build_object(
               'plan_id', d.plan_id, 'fecha', pl.fecha, 'tipo', pl.tipo, 'titulo', pl.titulo, 'serie', s.nombre,
               'persona_id', d.persona_id, 'nombre', concat_ws(' ', u.nombre, u.apellido),
               'iniciales', public.dps_iniciales(u.nombre, u.apellido), 'tiene_cuenta', u.auth_id IS NOT NULL,
               -- S14.1: without an e-mail in the ficha the notice is only in the panel.
               'tiene_correo', public.dps_correo_valido(u.email) IS NOT NULL) AS base
        FROM d
        JOIN public.dps_planes pl ON pl.id = d.plan_id
        LEFT JOIN public.dps_series s ON s.id = pl.serie_id
        JOIN public.usuarios u ON u.id = d.persona_id
        LEFT JOIN public.dps_avisos v ON v.id = d.aviso_id
    )
    SELECT jsonb_build_object(
      -- A no_puede taken out (cerrar) counts too: only a send closes it (L67).
      'total', (SELECT count(*) FROM f WHERE f.tipo IN ('nueva', 'cambio', 'quitado', 'cerrar')),
      'por_correo', (SELECT count(*) FROM f WHERE f.tipo IN ('nueva', 'cambio', 'quitado') AND f.tiene_correo),
      'solo_panel', (SELECT count(*) FROM f WHERE f.tipo IN ('nueva', 'cambio', 'quitado') AND NOT f.tiene_correo),
      'remitente', (SELECT jsonb_build_object('nombre', concat_ws(' ', u.nombre, u.apellido), 'email', public.dps_correo_valido(u.email))
                      FROM public.usuarios u WHERE u.id = v_actor),
      'nuevas', coalesce((
        SELECT jsonb_agg(f.base || jsonb_build_object(
                 'roles', f.roles,
                 'automatico', EXISTS (SELECT 1 FROM jsonb_array_elements(f.roles) r WHERE (r ->> 'automatico')::boolean),
                 -- Who said no_puede in one of these puestos and no longer holds it (02: «reemplaza a …»).
                 'reemplaza', (SELECT coalesce(jsonb_agg(DISTINCT concat_ws(' ', u2.nombre, u2.apellido)), '[]'::jsonb)
                                 FROM public.dps_avisos v2
                                 JOIN public.usuarios u2 ON u2.id = v2.persona_id
                                WHERE v2.plan_id = f.plan_id AND v2.persona_id <> f.persona_id
                                  AND v2.estado = 'no_puede' AND v2.claves && f.claves
                                  AND NOT EXISTS (SELECT 1 FROM d d2
                                                   WHERE d2.plan_id = v2.plan_id AND d2.persona_id = v2.persona_id
                                                     AND d2.claves && f.claves)))
                 ORDER BY f.fecha, f.nombre, f.apellido, f.persona_id)
          FROM f WHERE f.tipo = 'nueva'), '[]'::jsonb),
      'cambios', coalesce((
        SELECT jsonb_agg(f.base || jsonb_build_object(
                 'roles', f.roles, 'reinicia', f.reinicia, 'estado', f.estado_aviso,
                 'horarios', f.horarios, 'llegada', to_char(f.llegada, 'HH24:MI'),
                 'roles_antes', CASE WHEN f.claves <> f.claves_avisadas THEN f.roles_avisados END,
                 'fecha_antes', CASE WHEN f.fecha_avisada <> f.fecha THEN f.fecha_avisada END,
                 'horarios_antes', CASE WHEN f.horarios_avisados <> f.horarios THEN f.horarios_avisados END,
                 'llegada_antes', CASE WHEN f.llegada_avisada <> f.llegada THEN to_char(f.llegada_avisada, 'HH24:MI') END)
                 ORDER BY f.fecha, f.nombre, f.apellido, f.persona_id)
          FROM f WHERE f.tipo = 'cambio'), '[]'::jsonb),
      'quitados', coalesce((
        SELECT jsonb_agg(f.base || jsonb_build_object('roles', f.roles_avisados)
                 ORDER BY f.fecha, f.nombre, f.apellido, f.persona_id)
          FROM f WHERE f.tipo = 'quitado'), '[]'::jsonb),
      'no_reciben', jsonb_build_object(
        'ya_respondieron', coalesce((
          SELECT jsonb_agg(f.base || jsonb_build_object('roles', f.roles_avisados)
                   ORDER BY f.fecha, f.nombre, f.apellido, f.persona_id)
            FROM f WHERE f.tipo = 'cerrar'), '[]'::jsonb),
        'sin_cuenta', coalesce((
          SELECT jsonb_agg(jsonb_build_object('plan_id', pp.plan_id, 'fecha', pl.fecha, 'columna', pp.columna, 'nombre', pp.texto)
                   ORDER BY pl.fecha, pp.columna, pp.posicion)
            FROM public.dps_plan_personas pp
            JOIN public.dps_planes pl ON pl.id = pp.plan_id
           WHERE pp.plan_id = ANY (v_ids) AND pp.texto IS NOT NULL), '[]'::jsonb),
        'sin_cambios', (SELECT count(*) FROM f WHERE f.tipo = 'igual')))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.dps_avisos_pendientes(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_avisos_pendientes(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.dps_avisos_enviar(p_plan_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := public.dps_exigir_planificador();
  v_ids uuid[];
  v_resultado jsonb;
  v_tocados jsonb;
  v_correo jsonb;
BEGIN
  v_ids := public.dps_avisos_preparar(p_plan_ids);
  IF cardinality(v_ids) = 0 THEN
    RETURN jsonb_build_object('enviados', 0, 'nuevas', 0, 'cambios', 0, 'quitados', 0, 'cerrados', 0,
                              'por_correo', 0, 'solo_panel', 0);
  END IF;
  -- The convocados writers take this lock, dps_plan_campo the plan row: the
  -- assignments stay still while the notices are written.
  PERFORM pg_advisory_xact_lock(hashtext('dps_convocados:' || x.id::text))
     FROM unnest(v_ids) AS x(id)
    ORDER BY x.id;
  PERFORM 1 FROM public.dps_planes p WHERE p.id = ANY (v_ids) ORDER BY p.id FOR UPDATE;

  WITH d AS MATERIALIZED (
    SELECT x.*, pl.fecha, pl.horarios, pl.llegada
      FROM public.dps_avisos_diff(v_ids) x
      JOIN public.dps_planes pl ON pl.id = x.plan_id
     WHERE x.tipo IN ('nueva', 'cambio', 'quitado', 'cerrar')
  ), nuevas AS (
    INSERT INTO public.dps_avisos AS v (plan_id, persona_id, claves, roles, fecha, horarios, llegada, enviado_por) -- noqa: insert-into
    SELECT d.plan_id, d.persona_id, d.claves, d.roles, d.fecha, d.horarios, d.llegada, v_actor
      FROM d WHERE d.tipo = 'nueva'
    ON CONFLICT ON CONSTRAINT dps_avisos_unico DO UPDATE
       SET claves = excluded.claves, roles = excluded.roles, fecha = excluded.fecha,
           horarios = excluded.horarios, llegada = excluded.llegada,
           roles_antes = NULL, fecha_antes = NULL, horarios_antes = NULL, llegada_antes = NULL,
           estado = 'pendiente', motivo = NULL, respondido_at = NULL,
           quitado = false, cambio = false, visto_at = NULL,
           enviado_at = now(), enviado_por = excluded.enviado_por,
           -- T16b: an old link never confirms this new notice.
           version = v.version + 1
    RETURNING v.id
  ), cambios AS (
    UPDATE public.dps_avisos v
       SET claves = d.claves, roles = d.roles, fecha = d.fecha, horarios = d.horarios, llegada = d.llegada,
           roles_antes = CASE WHEN v.claves <> d.claves THEN v.roles END,
           fecha_antes = CASE WHEN v.fecha <> d.fecha THEN v.fecha END,
           horarios_antes = CASE WHEN v.horarios <> d.horarios THEN v.horarios END,
           llegada_antes = CASE WHEN v.llegada <> d.llegada THEN v.llegada END,
           -- S13.4: another puesto (or date) asks again; only the hours keep the answer.
           estado = CASE WHEN d.reinicia THEN 'pendiente' ELSE v.estado END,
           motivo = CASE WHEN d.reinicia THEN NULL ELSE v.motivo END,
           respondido_at = CASE WHEN d.reinicia THEN NULL ELSE v.respondido_at END,
           cambio = true, visto_at = NULL, enviado_at = now(), enviado_por = v_actor,
           version = v.version + 1
      FROM d
     WHERE v.id = d.aviso_id AND d.tipo = 'cambio'
    RETURNING v.id
  ), quitados AS (
    UPDATE public.dps_avisos v
       SET quitado = true, cambio = false,
           -- A no_puede taken out gets no «Ya no estás programado».
           visto_at = CASE WHEN d.tipo = 'cerrar' THEN now() END,
           enviado_at = CASE WHEN d.tipo = 'quitado' THEN now() ELSE v.enviado_at END,
           enviado_por = CASE WHEN d.tipo = 'quitado' THEN v_actor ELSE v.enviado_por END,
           version = CASE WHEN d.tipo = 'quitado' THEN v.version + 1 ELSE v.version END
      FROM d
     WHERE v.id = d.aviso_id AND d.tipo IN ('quitado', 'cerrar')
    RETURNING v.id, d.tipo
  )
  SELECT jsonb_build_object(
           'nuevas', (SELECT count(*) FROM nuevas),
           'cambios', (SELECT count(*) FROM cambios),
           'quitados', (SELECT count(*) FROM quitados q WHERE q.tipo = 'quitado'),
           'cerrados', (SELECT count(*) FROM quitados q WHERE q.tipo = 'cerrar')),
         coalesce((SELECT jsonb_agg(jsonb_build_object('aviso_id', n.id, 'tipo', 'nueva')) FROM nuevas n), '[]'::jsonb)
           || coalesce((SELECT jsonb_agg(jsonb_build_object('aviso_id', c.id, 'tipo', 'cambio')) FROM cambios c), '[]'::jsonb)
           || coalesce((SELECT jsonb_agg(jsonb_build_object('aviso_id', q.id, 'tipo', 'quitado')) FROM quitados q WHERE q.tipo = 'quitado'),
                       '[]'::jsonb)
    INTO v_resultado, v_tocados;

  -- S14.1: one e-mail per person with everything of this send (a later
  -- statement: it reads the notices as just written).
  v_correo := public.dps_avisos_correos_encolar(v_actor, v_tocados);
  RETURN v_resultado || v_correo || jsonb_build_object(
    'enviados', (v_resultado ->> 'nuevas')::int + (v_resultado ->> 'cambios')::int + (v_resultado ->> 'quitados')::int);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_avisos_enviar(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dps_avisos_enviar(uuid[]) TO authenticated;

-- ── 4. the outbox (service_role) ─────────────────────────────────────

-- Leases up to p_limite due e-mails for 10 minutes (attempt + 1), within
-- p_tope_diario per UTC day (Resend's quota day), counting today's enviados
-- and the rows in lease. Rows whose last fecha passed are marked fallido
-- 'vencido' first, so a notice is never sent late.
CREATE OR REPLACE FUNCTION public.dps_avisos_correos_reclamar(p_limite integer DEFAULT 50, p_tope_diario integer DEFAULT 100)
RETURNS TABLE (id uuid, tipo text, email text, nombre text, responder_nombre text, responder_email text, datos jsonb, intentos integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
DECLARE
  v_ocupados integer;
  v_limite integer;
BEGIN
  IF p_limite IS NULL OR p_limite < 1 OR p_limite > 100 THEN
    RAISE EXCEPTION 'limite_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_tope_diario IS NULL OR p_tope_diario < 0 OR p_tope_diario > 10000 THEN
    RAISE EXCEPTION 'tope_invalido' USING ERRCODE = '22023';
  END IF;
  -- Two runs at once (the immediate dispatch and the cron) never pass the cap.
  PERFORM pg_advisory_xact_lock(hashtext('dps_avisos_correos_reclamar'));

  UPDATE public.dps_avisos_correos e
     SET estado = 'fallido', error = 'vencido'
   WHERE e.estado = 'pendiente' AND e.vence IS NOT NULL AND e.vence < public.ninos_hoy();

  SELECT count(*) INTO v_ocupados
    FROM public.dps_avisos_correos e
   WHERE (e.estado = 'enviado' AND (e.enviado_en AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date)
      OR (e.estado = 'pendiente' AND e.intentos > 0 AND e.disponible_en > now());
  v_limite := least(p_limite, greatest(p_tope_diario - v_ocupados, 0));
  IF v_limite = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH lote AS (
    SELECT e.id
      FROM public.dps_avisos_correos e
     WHERE e.estado = 'pendiente' AND e.disponible_en <= now()
     -- The planner's «No puedo» first: it is the urgent one.
     ORDER BY (e.tipo = 'no_puede') DESC, e.disponible_en, e.created_at, e.id
     LIMIT v_limite
     FOR UPDATE SKIP LOCKED
  ), tomados AS (
    UPDATE public.dps_avisos_correos e
       SET disponible_en = now() + interval '10 minutes', intentos = e.intentos + 1
      FROM lote l
     WHERE e.id = l.id
    RETURNING e.id, e.tipo, e.email, e.nombre, e.responder_nombre, e.responder_email, e.datos, e.intentos, e.created_at
  )
  SELECT t.id, t.tipo, t.email, t.nombre, t.responder_nombre, t.responder_email, t.datos, t.intentos
    FROM tomados t
   ORDER BY (t.tipo = 'no_puede') DESC, t.created_at, t.id;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_avisos_correos_reclamar(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dps_avisos_correos_reclamar(integer, integer) TO service_role;

-- Records one send: enviado, or back to pendiente after 2^intentos minutes,
-- fallido after the fifth attempt. Only a leased (pendiente) row changes.
CREATE OR REPLACE FUNCTION public.dps_avisos_correos_resultado(p_id uuid, p_ok boolean, p_error text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF p_ok THEN
    UPDATE public.dps_avisos_correos e
       SET estado = 'enviado', enviado_en = now(), error = NULL
     WHERE e.id = p_id AND e.estado = 'pendiente';
  ELSE
    UPDATE public.dps_avisos_correos e
       SET estado = CASE WHEN e.intentos >= 5 THEN 'fallido' ELSE 'pendiente' END,
           disponible_en = now() + make_interval(mins => power(2, least(e.intentos, 6))::integer),
           error = left(coalesce(nullif(btrim(p_error), ''), 'Error desconocido'), 500)
     WHERE e.id = p_id AND e.estado = 'pendiente';
  END IF;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_avisos_correos_resultado(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dps_avisos_correos_resultado(uuid, boolean, text) TO service_role;

-- T16d: gives back the leased rows a run did not start (its time budget ran
-- out before the route's limit): due now and the attempt returned, so they
-- go with the next run as if never taken. Only a row still in its lease
-- (pendiente, taken, not yet due) changes. Returns how many.
CREATE OR REPLACE FUNCTION public.dps_avisos_correos_soltar(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_filas integer;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(p_ids) > 100 THEN
    RAISE EXCEPTION 'demasiados' USING ERRCODE = '22023';
  END IF;
  UPDATE public.dps_avisos_correos e
     SET disponible_en = now(), intentos = e.intentos - 1
   WHERE e.id = ANY (p_ids) AND e.estado = 'pendiente' AND e.intentos > 0 AND e.disponible_en > now();
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_avisos_correos_soltar(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dps_avisos_correos_soltar(uuid[]) TO service_role;

-- Registers the hashes of the confirm links an e-mail carries, before it is
-- sent. Returns how many are new.
CREATE OR REPLACE FUNCTION public.dps_avisos_tokens_registrar(p_tokens jsonb)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_filas integer;
BEGIN
  IF jsonb_typeof(p_tokens) IS DISTINCT FROM 'array' THEN
    RETURN 0;
  END IF;
  IF jsonb_array_length(p_tokens) > 200 THEN
    RAISE EXCEPTION 'demasiados' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.dps_avisos_tokens AS t (hash, aviso_id, version) -- noqa: insert-into
  SELECT DISTINCT ON (x.hash) x.hash, x.aviso_id, x.version
    FROM jsonb_to_recordset(p_tokens) AS x(hash text, aviso_id uuid, version integer)
    JOIN public.dps_avisos v ON v.id = x.aviso_id
   WHERE x.hash ~ '^[0-9a-f]{64}$' AND x.version >= 1
  ON CONFLICT (hash) DO NOTHING;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas;
END;
$$;
REVOKE ALL ON FUNCTION public.dps_avisos_tokens_registrar(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dps_avisos_tokens_registrar(jsonb) TO service_role;

-- ── 5. the public confirm page (service_role) ────────────────────────

CREATE OR REPLACE FUNCTION public.dps_aviso_token_leer(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_token public.dps_avisos_tokens%ROWTYPE;
  v_aviso public.dps_avisos%ROWTYPE;
  v_fecha date;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{43}$' THEN
    RETURN jsonb_build_object('estado', 'invalido');
  END IF;
  SELECT * INTO v_token FROM public.dps_avisos_tokens t
   WHERE t.hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'invalido');
  END IF;
  SELECT * INTO v_aviso FROM public.dps_avisos v WHERE v.id = v_token.aviso_id;
  SELECT p.fecha INTO v_fecha FROM public.dps_planes p WHERE p.id = v_aviso.plan_id;
  RETURN public.dps_aviso_token_vista(v_aviso.id,
    CASE WHEN v_aviso.id IS NULL THEN 'invalido'
         WHEN v_fecha < public.ninos_hoy() THEN 'vencido'
         WHEN v_aviso.quitado THEN 'quitado'
         WHEN v_aviso.estado = 'no_puede' THEN 'no_puede'
         WHEN v_aviso.estado = 'confirmo' THEN 'ya_confirmado'
         WHEN v_aviso.version <> v_token.version THEN 'cambio'
         ELSE 'por_confirmar' END);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_aviso_token_leer(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dps_aviso_token_leer(text) TO service_role;

CREATE OR REPLACE FUNCTION public.dps_aviso_token_confirmar(p_token text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_token public.dps_avisos_tokens%ROWTYPE;
  v_aviso public.dps_avisos%ROWTYPE;
  v_fecha date;
  v_estado text;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{43}$' THEN
    RETURN jsonb_build_object('estado', 'invalido');
  END IF;
  SELECT * INTO v_token FROM public.dps_avisos_tokens t
   WHERE t.hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado', 'invalido');
  END IF;
  SELECT * INTO v_aviso FROM public.dps_avisos v WHERE v.id = v_token.aviso_id FOR UPDATE;
  SELECT p.fecha INTO v_fecha FROM public.dps_planes p WHERE p.id = v_aviso.plan_id;
  v_estado := CASE WHEN v_aviso.id IS NULL THEN 'invalido'
                   WHEN v_fecha < public.ninos_hoy() THEN 'vencido'
                   WHEN v_aviso.quitado THEN 'quitado'
                   -- S14.5: the link never undoes a «No puedo».
                   WHEN v_aviso.estado = 'no_puede' THEN 'no_puede'
                   WHEN v_aviso.estado = 'confirmo' THEN 'ya_confirmado'
                   -- Another notice was sent since: never confirm what the person did not see.
                   WHEN v_aviso.version <> v_token.version THEN 'cambio'
                   ELSE 'confirmado' END;
  IF v_estado = 'confirmado' THEN
    UPDATE public.dps_avisos
       SET estado = 'confirmo', motivo = NULL, respondido_at = now(), cambio = false
     WHERE id = v_aviso.id;
  END IF;
  RETURN public.dps_aviso_token_vista(v_aviso.id, v_estado);
END;
$$;
REVOKE ALL ON FUNCTION public.dps_aviso_token_confirmar(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dps_aviso_token_confirmar(text) TO service_role;
