-- T1 (odd/tasks/dream-team-cambiar-area.md, S3–S5) — a director moves a Dream
-- Team servicio to another área in one step, or asks a director above to do it.
--
-- Covers:
--   a. The DPS director moves Cámaras → Estacionamiento directly: the origin is
--      retired (reasignacion, version 2, history with the motivo and the
--      destination), the destination opens in the same estado with its own
--      history, its verificaciones are pendiente (as POST creates them), the
--      Cámaras grants are revoked and the Estacionamiento ones minted.
--   b. The Producción Técnica director moves Cámaras → Audio directly.
--   c. The Producción Técnica director cannot move Cámaras → Estacionamiento
--      (42501, nothing changes) but can request it; a second pending request
--      for the same servicio is refused; with authority over both áreas the
--      request is refused (move directly); the requester cannot resolve it.
--   d. The read RPC and the table RLS: the DPS director sees what she can
--      resolve, the requester sees their own, a coordinator sees nothing; no
--      direct write on the table.
--   e. The DPS director approves: the move of (a) happens, the request is
--      aprobada with who, when, the answer and the new servicio; approving it
--      again is refused.
--   f. Rejecting changes only the request.
--   g. A coordinator without director authority cannot move but requests, even
--      inside their own área (T3, S7).
--   h. Approving after the servicio was retired fails and changes nothing.
--   i. An en_orientacion servicio moves in en_orientacion and mints nothing.
--   j. A person with another active servicio in the origin keeps the grants
--      that servicio justifies.
--   k. Invalid input (22023, nothing changes): motivo, same área, rol of
--      another área, inactive área, unknown servicio, retired servicio, an
--      existing servicio with that rol in the destination.
--   l. An admin moves across experiencias; the DPS director cannot (42501).
--   m. A direct move cancels (anulada) the pending request of that servicio.
--   n. Privileges (with the destinations function of T2).
--   o. The destinations of the dialog (dream_team_cambiar_area_destinos, T2):
--      the Producción Técnica director over a Cámaras servicio gets every
--      active área but Cámaras, Audio with dirige and Estacionamiento without,
--      each with its active roles; a coordinator gets them all without dirige
--      (T3); an unknown servicio is refused; its privileges.
--   p. Coordinators (T3, S7): the Cámaras coordinator cannot move Cámaras →
--      Audio but requests it (destinations without dirige); the Atención al
--      Voluntario coordinator of Producción Técnica sees and approves it (the
--      move of (a), signed by them), cannot resolve a request whose
--      destination is outside Producción Técnica, cannot request outside what
--      they coordinate nor move directly, and cannot resolve their own
--      request; dream_team_puede_solicitar_cambio_area for the button; the
--      privileges of the two new functions.
--
-- Run against STAGING inside a transaction that is discarded. The last
-- statement raises 'SUITE_RESULT: ALL OK' (or the failing cases), which also
-- rolls everything back. Calls run under SET LOCAL ROLE authenticated with
-- request.jwt.claim.sub set to the fixture auth id; state checks run as the
-- connection role.
--
-- Identities (usuario n = auth n, all fictitious "ZZ Ca"):
--   1 ROSAURA  dream_team.direct on ZZ DPS
--   2 PT       dream_team.direct on Producción Técnica
--   3 COORD    dream_team.coordinate on ZZ DPS (no director authority)
--   4 ADMIN    system admin
--   5 AV_COORD active Coordinador servicio in Atención al Voluntario (under
--              Producción Técnica), created in p
--   6 CAM_COORD dream_team.coordinate on Cámaras, created in p
--   Volunteers (no account), servicios in Cámaras unless said otherwise:
--   10 V1 activo (its induccion completado), 11 V2 activo, 12 V3 activo,
--   13 V4 activo, 14 V5 activo, 15 V6 en_orientacion, 16 V7 activo Voluntario
--   and activo Líder, 17 V8 activo, 18 V9 activo + activo in Audio,
--   19 V10 activo, 20 V11 activo.
-- Tree: 1 ZZ DPS › 2 Producción Técnica (3 Cámaras, 4 Audio, 7 Inactiva) and
-- 5 Operaciones (6 Estacionamiento); 8 ZZ Niños (9 Sala) is another
-- experiencia. Every área has a Voluntario rol; Cámaras also a Líder.

BEGIN;

SET LOCAL search_path TO pg_temp, public;

CREATE TEMP TABLE t_ca_failures (case_name text) ON COMMIT DROP;
CREATE TEMP TABLE t_ca_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_case text, p_detail text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_ca_failures(case_name) VALUES (p_case || ': ' || p_detail);
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(p_case text, p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actual text;
BEGIN
  EXECUTE p_sql INTO v_actual;
  IF v_actual IS DISTINCT FROM p_expected THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got ' || coalesce(v_actual, 'NULL'));
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_case, 'expected ' || coalesce(p_expected, 'NULL') || ', got error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_case text, p_sql text, p_sqlstate text, p_message text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ', got none');
EXCEPTION
  WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate OR (p_message IS NOT NULL AND SQLERRM <> p_message) THEN
      PERFORM pg_temp.fail(p_case, 'expected error ' || p_sqlstate || ' ' || coalesce(p_message, '') || ', got ' || SQLSTATE || ' ' || SQLERRM);
    END IF;
END;
$$;

-- Runs a call that returns one value and keeps it under p_key; an error is a failure.
CREATE OR REPLACE FUNCTION pg_temp.guardar(p_key text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v text;
BEGIN
  EXECUTE p_sql INTO v;
  INSERT INTO t_ca_ctx (k, v) VALUES (p_key, coalesce(v, 'NULL'));
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.fail(p_key, 'unexpected error ' || SQLSTATE || ' ' || SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.ctx(p_key text) RETURNS text LANGUAGE sql AS $$
  SELECT v FROM t_ca_ctx WHERE k = p_key;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_kind text, p_n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT format('ca7a0000-0000-4000-%s-%s',
           CASE p_kind WHEN 'au' THEN 'c001' WHEN 'us' THEN 'c002' WHEN 'eq' THEN 'c003'
                       WHEN 'ro' THEN 'c004' WHEN 'se' THEN 'c005' WHEN 'rq' THEN 'c006' END,
           lpad(to_hex(p_n), 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_persona(p_n int) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id('au', p_n)::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true);
$$;

-- The three RPCs with fixture ids: servicio n, destination equipo, destination rol.
-- plpgsql so the suite still loads (and fails case by case) without the RPCs.
CREATE OR REPLACE FUNCTION pg_temp.mover(p_se int, p_eq int, p_ro int, p_motivo text, p_nota text)
RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.dream_team_cambiar_area(pg_temp.id('se', p_se), pg_temp.id('eq', p_eq), pg_temp.id('ro', p_ro), p_motivo, p_nota);
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.solicitar(p_se int, p_eq int, p_ro int, p_motivo text, p_nota text)
RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.dream_team_solicitar_cambio_area(pg_temp.id('se', p_se), pg_temp.id('eq', p_eq), pg_temp.id('ro', p_ro), p_motivo, p_nota);
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.resolver(p_key text, p_aprobar boolean, p_respuesta text)
RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.dream_team_resolver_solicitud_cambio_area(pg_temp.ctx(p_key)::uuid, p_aprobar, p_respuesta);
END;
$$;

-- Labels of fixture ids; anything else prints as its raw id.
CREATE TEMP TABLE t_ca_labels (id uuid PRIMARY KEY, label text NOT NULL) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.lbl(p_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT label FROM t_ca_labels WHERE id = p_id), p_id::text);
$$;

-- A person's servicios: 'EQ:rol:estado:motivo_actual:version:fin', sorted.
CREATE OR REPLACE FUNCTION pg_temp.servicios(p_us int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(t, ', ' ORDER BY t COLLATE "C"), '')
    FROM (SELECT pg_temp.lbl(s.equipo_id) || ':' || pg_temp.lbl(s.rol_id) || ':' || s.estado || ':' || s.motivo_actual
                 || ':' || s.version || ':' || CASE WHEN s.fecha_fin IS NULL THEN '-' ELSE 'fin' END AS t
            FROM public.dream_team_servicios s WHERE s.persona_id = pg_temp.id('us', p_us)) q;
$$;

-- A person's history: 'EQ:anterior>nuevo:motivo:actor:detalle', sorted.
CREATE OR REPLACE FUNCTION pg_temp.historial(p_us int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(t, ' | ' ORDER BY t COLLATE "C"), '')
    FROM (SELECT pg_temp.lbl(s.equipo_id) || ':' || h.estado_anterior || '>' || h.estado_nuevo || ':' || h.motivo
                 || ':' || pg_temp.lbl(h.actor_persona_id) || ':' || coalesce(h.detalle_motivo, '-') AS t
            FROM public.dream_team_estados_historial h
            JOIN public.dream_team_servicios s ON s.id = h.servicio_id
           WHERE s.persona_id = pg_temp.id('us', p_us)) q;
$$;

-- A person's verificaciones: 'EQ:codigo:estado', sorted.
CREATE OR REPLACE FUNCTION pg_temp.verificaciones(p_us int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(t, ', ' ORDER BY t COLLATE "C"), '')
    FROM (SELECT pg_temp.lbl(s.equipo_id) || ':' || rq.codigo || ':' || v.estado AS t
            FROM public.dream_team_requisitos_verificacion v
            JOIN public.dream_team_servicios s ON s.id = v.servicio_id
            JOIN public.dream_team_requisitos rq ON rq.id = v.requisito_id
           WHERE s.persona_id = pg_temp.id('us', p_us)) q;
$$;

-- A person's grants: 'key@SCOPE' (active) or 'key@SCOPE~' (revoked), sorted.
CREATE OR REPLACE FUNCTION pg_temp.grants(p_us int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(t, ', ' ORDER BY t COLLATE "C"), '')
    FROM (SELECT g.capability_key || '@' || coalesce(pg_temp.lbl(g.scope_id::uuid), '-')
                 || CASE WHEN g.revoked_at IS NULL THEN '' ELSE '~' END AS t
            FROM public.dream_team_capability_grants g
           WHERE g.persona_id = pg_temp.id('us', p_us)) q;
$$;

-- The requests of a servicio: 'estado:SOLICITANTE>EQ:rol:motivo:nota:resuelto_por:respuesta:destino', sorted.
CREATE OR REPLACE FUNCTION pg_temp.solicitudes(p_se int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (
  SELECT coalesce(string_agg(t, ', ' ORDER BY t COLLATE "C"), '')
    FROM (SELECT r.estado || ':' || pg_temp.lbl(r.solicitante_id) || '>' || pg_temp.lbl(r.equipo_destino_id) || ':'
                 || pg_temp.lbl(r.rol_destino_id) || ':' || r.motivo || ':' || coalesce(r.nota, '-') || ':'
                 || coalesce(pg_temp.lbl(r.resuelto_por), '-') || ':' || coalesce(r.respuesta, '-') || ':'
                 || CASE WHEN r.resuelto_at IS NULL THEN '-' ELSE 'at' END || ':'
                 || CASE WHEN r.servicio_destino_id IS NULL THEN '-' ELSE 'nuevo' END AS t
            FROM public.dream_team_solicitudes_cambio_area r
           WHERE r.servicio_id = pg_temp.id('se', p_se)) q);
END;
$$;

-- Fingerprint of every fixture row a move or a request can touch.
CREATE OR REPLACE FUNCTION pg_temp.huella() RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (
  SELECT md5(
    coalesce((SELECT string_agg(s.id::text || s.equipo_id::text || s.rol_id::text || s.estado::text || s.motivo_actual::text
                                || s.version::text || coalesce(s.fecha_fin::text, '') || s.updated_at::text, ',' ORDER BY s.id)
                FROM public.dream_team_servicios s WHERE s.persona_id::text LIKE 'ca7a0000-%'), '') || '/' ||
    coalesce((SELECT string_agg(h.id::text || h.estado_nuevo::text, ',' ORDER BY h.id)
                FROM public.dream_team_estados_historial h
                JOIN public.dream_team_servicios s ON s.id = h.servicio_id
               WHERE s.persona_id::text LIKE 'ca7a0000-%'), '') || '/' ||
    coalesce((SELECT string_agg(v.id::text || v.estado::text, ',' ORDER BY v.id)
                FROM public.dream_team_requisitos_verificacion v
                JOIN public.dream_team_servicios s ON s.id = v.servicio_id
               WHERE s.persona_id::text LIKE 'ca7a0000-%'), '') || '/' ||
    coalesce((SELECT string_agg(g.id::text || coalesce(g.revoked_at::text, '') || g.granted_at::text, ',' ORDER BY g.id)
                FROM public.dream_team_capability_grants g WHERE g.persona_id::text LIKE 'ca7a0000-%'), '') || '/' ||
    coalesce((SELECT string_agg(r.id::text || r.estado || coalesce(r.respuesta, '') || r.updated_at::text, ',' ORDER BY r.id)
                FROM public.dream_team_solicitudes_cambio_area r
                JOIN public.dream_team_servicios s ON s.id = r.servicio_id
               WHERE s.persona_id::text LIKE 'ca7a0000-%'), '')));
END;
$$;

-- ── fixture ──────────────────────────────────────────────────────────

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'ca-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(1, 4) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Ca', 'U' || n, 'ca-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(1, 4) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
SELECT pg_temp.id('us', n), 'ZZ Ca', 'V' || n, 'No especificado', 'Femenino'
  FROM generate_series(10, 20) AS n;

INSERT INTO public.usuario_roles (usuario_id, rol_id)
SELECT pg_temp.id('us', 4), rs.id FROM public.roles_sistema rs WHERE rs.nombre_interno = 'admin';

INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 1), 'dps',   NULL,                 'ZZ DPS',             true),
  (pg_temp.id('eq', 2), 'dps',   pg_temp.id('eq', 1),  'Producción Técnica', true),
  (pg_temp.id('eq', 3), 'dps',   pg_temp.id('eq', 2),  'Cámaras',            true),
  (pg_temp.id('eq', 4), 'dps',   pg_temp.id('eq', 2),  'Audio',              true),
  (pg_temp.id('eq', 5), 'dps',   pg_temp.id('eq', 1),  'Operaciones',        true),
  (pg_temp.id('eq', 6), 'dps',   pg_temp.id('eq', 5),  'Estacionamiento',    true),
  (pg_temp.id('eq', 7), 'dps',   pg_temp.id('eq', 2),  'Inactiva',           false),
  (pg_temp.id('eq', 8), 'ninos', NULL,                 'ZZ Niños',           true),
  (pg_temp.id('eq', 9), 'ninos', pg_temp.id('eq', 8),  'Sala',               true);

-- Rol n: 3 Cámaras Voluntario, 30 Cámaras Líder, 4 Audio, 6 Estacionamiento,
-- 7 Inactiva, 9 Sala (Voluntario).
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 3),  pg_temp.id('eq', 3), 'Voluntario', 'voluntario', true),
  (pg_temp.id('ro', 30), pg_temp.id('eq', 3), 'Líder',      'lider',      true),
  (pg_temp.id('ro', 4),  pg_temp.id('eq', 4), 'Voluntario', 'voluntario', true),
  (pg_temp.id('ro', 6),  pg_temp.id('eq', 6), 'Voluntario', 'voluntario', true),
  (pg_temp.id('ro', 7),  pg_temp.id('eq', 7), 'Voluntario', 'voluntario', true),
  (pg_temp.id('ro', 9),  pg_temp.id('eq', 9), 'Voluntario', 'voluntario', true);

INSERT INTO public.dream_team_requisitos (id, equipo_id, rol_id, codigo, label, tipo, obligatoriedad) VALUES
  (pg_temp.id('rq', 3), pg_temp.id('eq', 3), pg_temp.id('ro', 3), 'induccion', 'Inducción', 'capacitacion', 'requerido'),
  (pg_temp.id('rq', 6), pg_temp.id('eq', 6), pg_temp.id('ro', 6), 'induccion', 'Inducción', 'capacitacion', 'requerido'),
  (pg_temp.id('rq', 7), pg_temp.id('eq', 6), pg_temp.id('ro', 6), 'chaleco',   'Chaleco',   'otro',         'opcional');

INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source) VALUES
  (pg_temp.id('us', 1), 'dream_team.direct',     'dream_team', 'equipo', pg_temp.id('eq', 1)::text, 'zz-test'),
  (pg_temp.id('us', 2), 'dream_team.direct',     'dream_team', 'equipo', pg_temp.id('eq', 2)::text, 'zz-test'),
  (pg_temp.id('us', 3), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 1)::text, 'zz-test');

-- Servicio n belongs to volunteer n; 160 is V7's Líder servicio, 180 V9's Audio one.
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', v.se), pg_temp.id('us', v.us), pg_temp.id('eq', v.eq), pg_temp.id('ro', v.ro),
       v.estado::public.dream_team_estado, now() - interval '30 days', 'admin_asignacion'
  FROM (VALUES (10, 10, 3, 3, 'activo'), (11, 11, 3, 3, 'activo'), (12, 12, 3, 3, 'activo'),
               (13, 13, 3, 3, 'activo'), (14, 14, 3, 3, 'activo'), (15, 15, 3, 3, 'en_orientacion'),
               (16, 16, 3, 3, 'activo'), (160, 16, 3, 30, 'activo'), (17, 17, 3, 3, 'activo'),
               (18, 18, 3, 3, 'activo'), (180, 18, 4, 4, 'activo'), (19, 19, 3, 3, 'activo'),
               (20, 20, 3, 3, 'activo')) AS v(se, us, eq, ro, estado);

INSERT INTO public.dream_team_requisitos_verificacion (servicio_id, requisito_id, estado)
SELECT s.id, pg_temp.id('rq', 3), CASE WHEN s.id = pg_temp.id('se', 10) THEN 'completado' ELSE 'pendiente' END::public.dream_team_requisito_estado
  FROM public.dream_team_servicios s WHERE s.rol_id = pg_temp.id('ro', 3) AND s.persona_id::text LIKE 'ca7a0000-%';

-- The grants of every active servicio, written as dream_team_cargar_voluntarios does.
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source)
SELECT DISTINCT s.persona_id, k.capability_key, k.experience, k.scope_type, k.scope_id, 'dream-team-servicio'
  FROM public.dream_team_servicios s
  JOIN public.dream_team_equipos e ON e.id = s.equipo_id
  JOIN public.dream_team_roles r ON r.id = s.rol_id
 CROSS JOIN LATERAL public.dream_team_grants_de_servicio(s.equipo_id, e.experiencia, s.rol_id, r.label) k
 WHERE s.estado = 'activo' AND s.persona_id::text LIKE 'ca7a0000-%';

INSERT INTO t_ca_labels (id, label)
SELECT pg_temp.id('eq', n), l FROM (VALUES (1, 'DPS'), (2, 'PT'), (3, 'CAM'), (4, 'AUD'), (5, 'OPS'), (6, 'EST'),
                                           (7, 'INA'), (8, 'NIN'), (9, 'SALA')) AS x(n, l)
UNION ALL
SELECT pg_temp.id('ro', n), l FROM (VALUES (3, 'vol'), (30, 'lider'), (4, 'vol'), (6, 'vol'), (7, 'vol'), (9, 'vol')) AS x(n, l)
UNION ALL
SELECT pg_temp.id('us', n), l FROM (VALUES (1, 'ROSAURA'), (2, 'PT_DIR'), (3, 'COORD'), (4, 'ADMIN')) AS x(n, l);

GRANT INSERT, SELECT ON t_ca_failures, t_ca_ctx TO authenticated;
GRANT SELECT ON t_ca_labels TO authenticated;
DO $$
DECLARE
  v_f regprocedure;
BEGIN
  FOR v_f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = pg_my_temp_schema() LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_f);
  END LOOP;
END;
$$;

SELECT pg_temp.assert_eq('fixture: grants of V1 before any move',
  $q$SELECT pg_temp.grants(10)$q$, 'dps.team.serve@CAM, dream_team.serve@CAM');

-- ── a. the DPS director moves Cámaras → Estacionamiento ──────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.guardar('a', $q$SELECT pg_temp.mover(10, 6, 6, 'correccion', 'Estaba mal cargado')$q$);
RESET ROLE;

SELECT pg_temp.assert_eq('a: returns the new servicio, in Estacionamiento',
  $q$SELECT pg_temp.lbl(s.equipo_id) || ':' || pg_temp.lbl(s.persona_id) FROM public.dream_team_servicios s WHERE s.id = pg_temp.ctx('a')::uuid$q$,
  'EST:' || pg_temp.id('us', 10)::text);
SELECT pg_temp.assert_eq('a: origin retired, destination activo',
  $q$SELECT pg_temp.servicios(10)$q$, 'CAM:vol:retirado:reasignacion:2:fin, EST:vol:activo:reasignacion:1:-');
SELECT pg_temp.assert_eq('a: one history row each, signed by the director, with motivo, path and nota',
  $q$SELECT pg_temp.historial(10)$q$,
  'CAM:activo>retirado:reasignacion:ROSAURA:Corrección · Hacia ZZ DPS › Operaciones › Estacionamiento (Voluntario) · Estaba mal cargado'
  || ' | EST:activo>activo:reasignacion:ROSAURA:Corrección · Desde ZZ DPS › Producción Técnica › Cámaras (Voluntario) · Estaba mal cargado');
SELECT pg_temp.assert_eq('a: verificaciones of the destination are pendiente, the origin keeps its own',
  $q$SELECT pg_temp.verificaciones(10)$q$, 'CAM:induccion:completado, EST:chaleco:pendiente, EST:induccion:pendiente');
SELECT pg_temp.assert_eq('a: Cámaras grants revoked, Estacionamiento grants minted',
  $q$SELECT pg_temp.grants(10)$q$, 'dps.team.serve@CAM~, dps.team.serve@EST, dream_team.serve@CAM~, dream_team.serve@EST');

-- ── b. the PT director moves Cámaras → Audio ─────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar('b', $q$SELECT pg_temp.mover(11, 4, 4, 'traslado', '  ')$q$);
RESET ROLE;

SELECT pg_temp.assert_eq('b: origin retired, destination activo in Audio',
  $q$SELECT pg_temp.servicios(11)$q$, 'AUD:vol:activo:reasignacion:1:-, CAM:vol:retirado:reasignacion:2:fin');
SELECT pg_temp.assert_eq('b: history without nota (blank nota is none)',
  $q$SELECT pg_temp.historial(11)$q$,
  'AUD:activo>activo:reasignacion:PT_DIR:Traslado · Desde ZZ DPS › Producción Técnica › Cámaras (Voluntario)'
  || ' | CAM:activo>retirado:reasignacion:PT_DIR:Traslado · Hacia ZZ DPS › Producción Técnica › Audio (Voluntario)');
SELECT pg_temp.assert_eq('b: grants moved to Audio',
  $q$SELECT pg_temp.grants(11)$q$, 'dps.team.serve@AUD, dps.team.serve@CAM~, dream_team.serve@AUD, dream_team.serve@CAM~');
SELECT pg_temp.assert_eq('b: Audio has no requisito, so no verificación',
  $q$SELECT pg_temp.verificaciones(11)$q$, 'CAM:induccion:pendiente');

-- ── c. the PT director outside their subtree: request ────────────────

INSERT INTO t_ca_ctx (k, v) VALUES ('c.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('c: PT cannot move Cámaras → Estacionamiento',
  $q$SELECT pg_temp.mover(12, 6, 6, 'traslado', NULL)$q$, '42501',
  'No tienes autoridad de director sobre el área destino; envía una solicitud para que la apruebe un director de ambas áreas.');
RESET ROLE;
SELECT pg_temp.assert_eq('c: the refused move changed nothing', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('c.antes'));

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar('c', $q$SELECT pg_temp.solicitar(12, 6, 6, 'traslado', 'Pasa a estacionamiento')$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('c: one pendiente request, signed by PT',
  $q$SELECT pg_temp.solicitudes(12)$q$, 'pendiente:PT_DIR>EST:vol:traslado:Pasa a estacionamiento:-:-:-:-');
SELECT pg_temp.assert_eq('c: the request returns its id',
  $q$SELECT count(*)::text FROM public.dream_team_solicitudes_cambio_area WHERE id = pg_temp.ctx('c')::uuid$q$, '1');
SELECT pg_temp.assert_eq('c: requesting does not move the servicio',
  $q$SELECT pg_temp.servicios(12) || ' / ' || pg_temp.grants(12)$q$,
  'CAM:vol:activo:admin_asignacion:1:- / dps.team.serve@CAM, dream_team.serve@CAM');

INSERT INTO t_ca_ctx (k, v) VALUES ('c2.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('c2: a second pending request for the servicio is refused',
  $q$SELECT pg_temp.solicitar(12, 9, 9, 'traslado', NULL)$q$, '22023',
  'Este servicio ya tiene una solicitud de cambio de área pendiente.');
SELECT pg_temp.assert_raises('c3: with authority over both áreas the request is refused',
  $q$SELECT pg_temp.solicitar(17, 4, 4, 'traslado', NULL)$q$, '22023',
  'Tienes autoridad sobre ambas áreas; cambia el área directamente, sin solicitud.');
SELECT pg_temp.assert_raises('c4: the requester cannot resolve their own request',
  $q$SELECT pg_temp.resolver('c', true, NULL)$q$, '42501',
  'Solo un director con autoridad sobre ambas áreas o el coordinador de Atención al Voluntario de la dirección puede resolver esta solicitud.');
RESET ROLE;
SELECT pg_temp.assert_eq('c2–c4: the refused calls changed nothing', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('c2.antes'));

-- ── d. reading requests ──────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('d: the DPS director reads the request she can resolve, with names and paths',
  $q$SELECT string_agg(concat_ws('|', l.estado, l.puede_resolver::text, l.es_mia::text, l.persona_nombre, l.origen_ruta, l.rol_origen,
                                 l.destino_ruta, l.rol_destino, l.motivo, l.nota, l.solicitante_nombre,
                                 coalesce(l.respuesta, '-'), coalesce(l.resuelto_por_nombre, '-'),
                                 (l.created_at IS NOT NULL)::text, (l.resuelto_at IS NULL)::text,
                                 (l.servicio_id = pg_temp.id('se', 12))::text), ',')
       FROM public.dream_team_solicitudes_cambio_area() l$q$,
  'pendiente|true|false|ZZ Ca V12|ZZ DPS › Producción Técnica › Cámaras|Voluntario|ZZ DPS › Operaciones › Estacionamiento|Voluntario|traslado|Pasa a estacionamiento|ZZ Ca U2|-|-|true|true|true');
SELECT pg_temp.assert_eq('d: and the table row through RLS',
  $q$SELECT count(*)::text FROM public.dream_team_solicitudes_cambio_area$q$, '1');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('d: the requester reads their own request, without resolving it',
  $q$SELECT string_agg(l.estado || '|' || l.puede_resolver || '|' || l.es_mia, ',') FROM public.dream_team_solicitudes_cambio_area() l$q$,
  'pendiente|false|true');
SELECT pg_temp.assert_eq('d: the requester reads the row through RLS',
  $q$SELECT count(*)::text FROM public.dream_team_solicitudes_cambio_area$q$, '1');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('d: a coordinator reads nothing',
  $q$SELECT count(*)::text || '|' || (SELECT count(*) FROM public.dream_team_solicitudes_cambio_area) FROM public.dream_team_solicitudes_cambio_area()$q$,
  '0|0');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('d: no direct insert into the table',
  $q$INSERT INTO public.dream_team_solicitudes_cambio_area (servicio_id, equipo_origen_id, rol_origen_id, equipo_destino_id,
       rol_destino_id, motivo, solicitante_id)
     VALUES (pg_temp.id('se', 13), pg_temp.id('eq', 3), pg_temp.id('ro', 3), pg_temp.id('eq', 6), pg_temp.id('ro', 6),
             'traslado', pg_temp.id('us', 2))$q$, '42501');
SELECT pg_temp.assert_raises('d: no direct update of the table',
  $q$UPDATE public.dream_team_solicitudes_cambio_area SET estado = 'aprobada'$q$, '42501');
RESET ROLE;

-- ── e. the DPS director approves ─────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.guardar('e', $q$SELECT pg_temp.resolver('c', true, 'De acuerdo')$q$);
RESET ROLE;

SELECT pg_temp.assert_eq('e: approving returns the new servicio',
  $q$SELECT pg_temp.lbl(s.equipo_id) || ':' || s.estado FROM public.dream_team_servicios s WHERE s.id = pg_temp.ctx('e')::uuid$q$, 'EST:activo');
SELECT pg_temp.assert_eq('e: the request is aprobada, by the director, with her answer and the new servicio',
  $q$SELECT pg_temp.solicitudes(12)$q$, 'aprobada:PT_DIR>EST:vol:traslado:Pasa a estacionamiento:ROSAURA:De acuerdo:at:nuevo');
SELECT pg_temp.assert_eq('e: the stored new servicio is the returned one',
  $q$SELECT (servicio_destino_id = pg_temp.ctx('e')::uuid)::text FROM public.dream_team_solicitudes_cambio_area WHERE id = pg_temp.ctx('c')::uuid$q$, 'true');
SELECT pg_temp.assert_eq('e: origin retired, destination activo',
  $q$SELECT pg_temp.servicios(12)$q$, 'CAM:vol:retirado:reasignacion:2:fin, EST:vol:activo:reasignacion:1:-');
SELECT pg_temp.assert_eq('e: history signed by the approver, with the request nota',
  $q$SELECT pg_temp.historial(12)$q$,
  'CAM:activo>retirado:reasignacion:ROSAURA:Traslado · Hacia ZZ DPS › Operaciones › Estacionamiento (Voluntario) · Pasa a estacionamiento'
  || ' | EST:activo>activo:reasignacion:ROSAURA:Traslado · Desde ZZ DPS › Producción Técnica › Cámaras (Voluntario) · Pasa a estacionamiento');
SELECT pg_temp.assert_eq('e: grants moved',
  $q$SELECT pg_temp.grants(12)$q$, 'dps.team.serve@CAM~, dps.team.serve@EST, dream_team.serve@CAM~, dream_team.serve@EST');
SELECT pg_temp.assert_eq('e: verificaciones of the destination',
  $q$SELECT pg_temp.verificaciones(12)$q$, 'CAM:induccion:pendiente, EST:chaleco:pendiente, EST:induccion:pendiente');

INSERT INTO t_ca_ctx (k, v) VALUES ('e2.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('e2: approving it again is refused',
  $q$SELECT pg_temp.resolver('c', true, NULL)$q$, '22023', 'La solicitud ya fue resuelta.');
RESET ROLE;
SELECT pg_temp.assert_eq('e2: nothing changed', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('e2.antes'));

-- ── f. rejecting changes only the request ────────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar('f', $q$SELECT pg_temp.solicitar(13, 6, 6, 'correccion', NULL)$q$);
RESET ROLE;
INSERT INTO t_ca_ctx (k, v) VALUES ('f.antes', pg_temp.servicios(13) || '/' || pg_temp.historial(13) || '/' || pg_temp.grants(13)
                                               || '/' || pg_temp.verificaciones(13));
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.guardar('f.r', $q$SELECT pg_temp.resolver('f', false, 'No hay cupo')$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('f: rejecting returns NULL', $q$SELECT pg_temp.ctx('f.r')$q$, 'NULL');
SELECT pg_temp.assert_eq('f: the request is rechazada, by the director, with her answer',
  $q$SELECT pg_temp.solicitudes(13)$q$, 'rechazada:PT_DIR>EST:vol:correccion:-:ROSAURA:No hay cupo:at:-');
SELECT pg_temp.assert_eq('f: servicio, history, grants and verificaciones unchanged',
  $q$SELECT pg_temp.servicios(13) || '/' || pg_temp.historial(13) || '/' || pg_temp.grants(13) || '/' || pg_temp.verificaciones(13)$q$,
  pg_temp.ctx('f.antes'));
SELECT pg_temp.assert_eq('f: and still in Cámaras',
  $q$SELECT pg_temp.servicios(13)$q$, 'CAM:vol:activo:admin_asignacion:1:-');

-- ── g. a coordinator without director authority ──────────────────────

INSERT INTO t_ca_ctx (k, v) VALUES ('g.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_raises('g: a coordinator cannot move',
  $q$SELECT pg_temp.mover(17, 4, 4, 'correccion', NULL)$q$, '42501',
  'No tienes autoridad de director sobre el área actual de este servicio.');
RESET ROLE;
SELECT pg_temp.assert_eq('g: the refused move changed nothing', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('g.antes'));

-- Inside the DPS they coordinate: still a request, never a move.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(3);
SELECT pg_temp.guardar('g', $q$SELECT pg_temp.solicitar(17, 6, 6, 'correccion', 'Va a estacionamiento')$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('g: a coordinator requests; one pendiente request, signed by them',
  $q$SELECT pg_temp.solicitudes(17)$q$, 'pendiente:COORD>EST:vol:correccion:Va a estacionamiento:-:-:-:-');
SELECT pg_temp.assert_eq('g: the request returns its id',
  $q$SELECT count(*)::text FROM public.dream_team_solicitudes_cambio_area
      WHERE id = pg_temp.ctx('g')::uuid AND servicio_id = pg_temp.id('se', 17)$q$, '1');
SELECT pg_temp.assert_eq('g: requesting does not move the servicio',
  $q$SELECT pg_temp.servicios(17) || ' / ' || pg_temp.grants(17)$q$,
  'CAM:vol:activo:admin_asignacion:1:- / dps.team.serve@CAM, dream_team.serve@CAM');

-- ── h. approving after the servicio was retired ──────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar('h', $q$SELECT pg_temp.solicitar(14, 6, 6, 'traslado', NULL)$q$);
RESET ROLE;
-- Retired through the PATCH path meanwhile.
UPDATE public.dream_team_servicios
   SET estado = 'retirado', fecha_fin = now(), motivo_actual = 'admin_retiro', version = version + 1, updated_at = now()
 WHERE id = pg_temp.id('se', 14);
INSERT INTO public.dream_team_estados_historial (servicio_id, estado_anterior, estado_nuevo, motivo, actor_persona_id)
VALUES (pg_temp.id('se', 14), 'activo', 'retirado', 'admin_retiro', pg_temp.id('us', 1));
INSERT INTO t_ca_ctx (k, v) VALUES ('h.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('h: approving after the servicio was retired fails',
  $q$SELECT pg_temp.resolver('h', true, NULL)$q$, '22023',
  'El servicio cambió desde que se envió la solicitud (fue retirado o ya no está en esa área); no se puede aprobar.');
RESET ROLE;
SELECT pg_temp.assert_eq('h: nothing changed, the request is still pendiente', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('h.antes'));
SELECT pg_temp.assert_eq('h: request still pendiente',
  $q$SELECT pg_temp.solicitudes(14)$q$, 'pendiente:PT_DIR>EST:vol:traslado:-:-:-:-:-');

-- ── i. en_orientacion moves without grants ───────────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.guardar('i', $q$SELECT pg_temp.mover(15, 6, 6, 'correccion', NULL)$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('i: the destination is en_orientacion',
  $q$SELECT pg_temp.servicios(15)$q$, 'CAM:vol:retirado:reasignacion:2:fin, EST:vol:en_orientacion:reasignacion:1:-');
SELECT pg_temp.assert_eq('i: history keeps the estado',
  $q$SELECT pg_temp.historial(15)$q$,
  'CAM:en_orientacion>retirado:reasignacion:ROSAURA:Corrección · Hacia ZZ DPS › Operaciones › Estacionamiento (Voluntario)'
  || ' | EST:en_orientacion>en_orientacion:reasignacion:ROSAURA:Corrección · Desde ZZ DPS › Producción Técnica › Cámaras (Voluntario)');
SELECT pg_temp.assert_eq('i: no grant minted', $q$SELECT pg_temp.grants(15)$q$, '');

-- ── j. another active servicio in the origin keeps its grants ────────

SELECT pg_temp.assert_eq('j: grants before',
  $q$SELECT pg_temp.grants(16)$q$, 'dps.team.lead@CAM, dps.team.serve@CAM, dream_team.lead@CAM, dream_team.serve@CAM');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar('j', $q$SELECT pg_temp.mover(16, 4, 4, 'traslado', NULL)$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('j: the Líder servicio stays, the Voluntario one moves',
  $q$SELECT pg_temp.servicios(16)$q$,
  'AUD:vol:activo:reasignacion:1:-, CAM:lider:activo:admin_asignacion:1:-, CAM:vol:retirado:reasignacion:2:fin');
SELECT pg_temp.assert_eq('j: dream_team.serve@CAM stays (the Líder servicio mints it), dps.team.serve@CAM is revoked',
  $q$SELECT pg_temp.grants(16)$q$,
  'dps.team.lead@CAM, dps.team.serve@AUD, dps.team.serve@CAM~, dream_team.lead@CAM, dream_team.serve@AUD, dream_team.serve@CAM');

-- ── k. invalid input ─────────────────────────────────────────────────

INSERT INTO t_ca_ctx (k, v) VALUES ('k.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('k: unknown motivo',
  $q$SELECT pg_temp.mover(17, 6, 6, 'otro', NULL)$q$, '22023', 'El motivo debe ser correccion o traslado.');
SELECT pg_temp.assert_raises('k: NULL motivo',
  $q$SELECT pg_temp.mover(17, 6, 6, NULL, NULL)$q$, '22023', 'El motivo debe ser correccion o traslado.');
SELECT pg_temp.assert_raises('k: same área',
  $q$SELECT pg_temp.mover(17, 3, 30, 'correccion', NULL)$q$, '22023', 'El área destino debe ser distinta del área actual.');
SELECT pg_temp.assert_raises('k: rol of another área',
  $q$SELECT pg_temp.mover(17, 6, 4, 'correccion', NULL)$q$, '22023', 'El rol no existe, está inactivo o no pertenece al área destino.');
SELECT pg_temp.assert_raises('k: inactive área',
  $q$SELECT pg_temp.mover(17, 7, 7, 'correccion', NULL)$q$, '22023', 'El área destino no existe o está inactiva.');
SELECT pg_temp.assert_raises('k: unknown área',
  $q$SELECT pg_temp.mover(17, 99, 6, 'correccion', NULL)$q$, '22023', 'El área destino no existe o está inactiva.');
SELECT pg_temp.assert_raises('k: unknown servicio',
  $q$SELECT pg_temp.mover(99, 6, 6, 'correccion', NULL)$q$, '22023', 'El servicio no existe.');
SELECT pg_temp.assert_raises('k: retired servicio',
  $q$SELECT pg_temp.mover(14, 6, 6, 'correccion', NULL)$q$, '22023', 'El servicio está retirado y no se puede mover.');
SELECT pg_temp.assert_raises('k: the person already serves with that rol in the destination',
  $q$SELECT pg_temp.mover(18, 4, 4, 'correccion', NULL)$q$, '22023', 'La persona ya tiene un servicio en el área destino con ese rol.');
SELECT pg_temp.assert_raises('k: the same checks guard a request',
  $q$SELECT pg_temp.solicitar(17, 9, 4, 'traslado', NULL)$q$, '22023', 'El rol no existe, está inactivo o no pertenece al área destino.');
SELECT pg_temp.assert_raises('k: resolving needs a decision',
  $q$SELECT pg_temp.resolver('h', NULL, NULL)$q$, '22023', 'Indica si apruebas o rechazas la solicitud.');
SELECT pg_temp.assert_raises('k: unknown request',
  $q$SELECT public.dream_team_resolver_solicitud_cambio_area(pg_temp.id('se', 99), true, NULL)$q$, '22023', 'La solicitud no existe.');
RESET ROLE;
SELECT pg_temp.assert_eq('k: nothing changed', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('k.antes'));

-- ── l. across experiencias ───────────────────────────────────────────

INSERT INTO t_ca_ctx (k, v) VALUES ('l.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_raises('l: the DPS director cannot move into Niños',
  $q$SELECT pg_temp.mover(19, 9, 9, 'traslado', NULL)$q$, '42501',
  'No tienes autoridad de director sobre el área destino; envía una solicitud para que la apruebe un director de ambas áreas.');
RESET ROLE;
SELECT pg_temp.assert_eq('l: nothing changed', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('l.antes'));
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(4);
SELECT pg_temp.guardar('l', $q$SELECT pg_temp.mover(19, 9, 9, 'traslado', NULL)$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('l: the admin moves Cámaras → Niños',
  $q$SELECT pg_temp.servicios(19) || ' / ' || pg_temp.grants(19)$q$,
  'CAM:vol:retirado:reasignacion:2:fin, SALA:vol:activo:reasignacion:1:- / '
  || 'dps.team.serve@CAM~, dream_team.serve@CAM~, dream_team.serve@SALA, ninos.team.serve@SALA');

-- ── m. a direct move cancels the pending request ─────────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.guardar('m', $q$SELECT pg_temp.solicitar(20, 6, 6, 'traslado', NULL)$q$);
SELECT pg_temp.as_persona(1);
SELECT pg_temp.guardar('m.mover', $q$SELECT pg_temp.mover(20, 4, 4, 'correccion', NULL)$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('m: the request is anulada by the mover',
  $q$SELECT pg_temp.solicitudes(20)$q$, 'anulada:PT_DIR>EST:vol:traslado:-:ROSAURA:El servicio cambió de área.:at:-');
SELECT pg_temp.assert_eq('m: the servicio moved to Audio',
  $q$SELECT pg_temp.servicios(20)$q$, 'AUD:vol:activo:reasignacion:1:-, CAM:vol:retirado:reasignacion:2:fin');

-- ── n. privileges ────────────────────────────────────────────────────

SELECT pg_temp.assert_eq('n: authenticated executes the five RPCs and the authority check, anon none',
  $q$SELECT string_agg(p.proname, ',' ORDER BY p.proname COLLATE "C") FILTER (WHERE has_function_privilege('authenticated', p.oid, 'EXECUTE'))
            || '|' || count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE'))
            || '|' || count(*)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('dream_team_autoridad_director', 'dream_team_equipo_ruta', 'dream_team_cambiar_area_validar',
                          'dream_team_cambiar_area_mover', 'dream_team_cambiar_area', 'dream_team_solicitar_cambio_area',
                          'dream_team_resolver_solicitud_cambio_area', 'dream_team_solicitudes_cambio_area',
                          'dream_team_cambiar_area_destinos')$q$,
  'dream_team_autoridad_director,dream_team_cambiar_area,dream_team_cambiar_area_destinos,'
  || 'dream_team_resolver_solicitud_cambio_area,dream_team_solicitar_cambio_area,dream_team_solicitudes_cambio_area|0|9');
SELECT pg_temp.assert_eq('n: every new function is SECURITY DEFINER with an empty search_path',
  $q$SELECT coalesce(string_agg(p.proname, ','), '')
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('dream_team_autoridad_director', 'dream_team_equipo_ruta', 'dream_team_cambiar_area_validar',
                          'dream_team_cambiar_area_mover', 'dream_team_cambiar_area', 'dream_team_solicitar_cambio_area',
                          'dream_team_resolver_solicitud_cambio_area', 'dream_team_solicitudes_cambio_area',
                          'dream_team_cambiar_area_destinos')
        AND NOT (p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])$q$, '');
SELECT pg_temp.assert_eq('n: the table has RLS, anon nothing, authenticated only SELECT',
  $q$SELECT c.relrowsecurity || '|' || has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
            || '|' || has_table_privilege('authenticated', c.oid, 'SELECT')
            || '|' || has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE')
       FROM pg_class c WHERE c.oid = 'public.dream_team_solicitudes_cambio_area'::regclass$q$, 'true|false|true|false');
SELECT pg_temp.assert_eq('n: at most one pendiente per servicio (partial unique index)',
  $q$SELECT count(*)::text FROM pg_index i
      WHERE i.indrelid = 'public.dream_team_solicitudes_cambio_area'::regclass AND i.indisunique
        AND pg_get_expr(i.indpred, i.indrelid) LIKE '%pendiente%'$q$, '1');

-- ── o. the destinations of the dialog ────────────────────────────────

-- Fixture equipos only: staging has real ones too.
CREATE OR REPLACE FUNCTION pg_temp.destinos(p_se int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN (
  SELECT coalesce(string_agg(t, ', ' ORDER BY t COLLATE "C"), '')
    FROM (SELECT pg_temp.lbl(d.equipo_id) || ':' || d.dirige || ':' || d.experiencia || ':'
                 || (SELECT coalesce(string_agg(pg_temp.lbl((r ->> 'id')::uuid) || '/' || (r ->> 'label') || '/' || (r ->> 'nivel'),
                                                ';' ORDER BY r ->> 'label'), '-')
                       FROM jsonb_array_elements(d.roles) r) AS t
            FROM public.dream_team_cambiar_area_destinos(pg_temp.id('se', p_se)) d
           WHERE d.equipo_id::text LIKE 'ca7a0000-%') q);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.destinos(int) TO authenticated;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('o: the PT director gets every active área but Cámaras, dirige only inside PT',
  $q$SELECT pg_temp.destinos(17)$q$,
  'AUD:true:dps:vol/Voluntario/voluntario, DPS:false:dps:-, EST:false:dps:vol/Voluntario/voluntario, '
  || 'NIN:false:ninos:-, OPS:false:dps:-, PT:true:dps:-, SALA:false:ninos:vol/Voluntario/voluntario');
SELECT pg_temp.assert_eq('o: with the path of each área',
  $q$SELECT d.ruta FROM public.dream_team_cambiar_area_destinos(pg_temp.id('se', 17)) d WHERE d.equipo_id = pg_temp.id('eq', 6)$q$,
  'ZZ DPS › Operaciones › Estacionamiento');
SELECT pg_temp.as_persona(1);
SELECT pg_temp.assert_eq('o: the DPS director directs every DPS área',
  $q$SELECT pg_temp.destinos(17)$q$,
  'AUD:true:dps:vol/Voluntario/voluntario, DPS:true:dps:-, EST:true:dps:vol/Voluntario/voluntario, '
  || 'NIN:false:ninos:-, OPS:true:dps:-, PT:true:dps:-, SALA:false:ninos:vol/Voluntario/voluntario');
SELECT pg_temp.as_persona(3);
SELECT pg_temp.assert_eq('o: a coordinator gets every active área but Cámaras, none with dirige',
  $q$SELECT pg_temp.destinos(17)$q$,
  'AUD:false:dps:vol/Voluntario/voluntario, DPS:false:dps:-, EST:false:dps:vol/Voluntario/voluntario, '
  || 'NIN:false:ninos:-, OPS:false:dps:-, PT:false:dps:-, SALA:false:ninos:vol/Voluntario/voluntario');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_raises('o: an unknown servicio is refused',
  $q$SELECT pg_temp.destinos(99)$q$, '22023', 'El servicio no existe.');
RESET ROLE;
SELECT pg_temp.assert_eq('o: authenticated executes it, anon does not; SECURITY DEFINER with an empty search_path',
  $q$SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE') || '|' || has_function_privilege('anon', p.oid, 'EXECUTE')
            || '|' || has_function_privilege('public', p.oid, 'EXECUTE')
            || '|' || (p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])
       FROM pg_proc p WHERE p.oid = 'public.dream_team_cambiar_area_destinos(uuid)'::regprocedure$q$,
  'true|false|false|true');

-- ── p. coordinators request; the Atención al Voluntario coordinator approves ──

-- Fixture of p: 5 AV_COORD (Coordinador in Atención al Voluntario, under
-- Producción Técnica: their reach is Producción Técnica's subtree), 6
-- CAM_COORD (dream_team.coordinate on Cámaras); volunteers 21 and 22 in
-- Cámaras, 23 in Atención al Voluntario. Created after o, whose destinations
-- list every fixture área.
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT pg_temp.id('au', n), 'authenticated', 'authenticated', 'ca-' || n || '@example.test', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  FROM generate_series(5, 6) AS n;
INSERT INTO public.usuarios (id, auth_id, nombre, apellido, email, estado_civil, genero)
SELECT pg_temp.id('us', n), pg_temp.id('au', n), 'ZZ Ca', 'U' || n, 'ca-' || n || '@example.test', 'Soltero', 'Femenino'
  FROM generate_series(5, 6) AS n;
INSERT INTO public.usuarios (id, nombre, apellido, estado_civil, genero)
SELECT pg_temp.id('us', n), 'ZZ Ca', 'V' || n, 'No especificado', 'Femenino'
  FROM generate_series(21, 23) AS n;
INSERT INTO public.dream_team_equipos (id, experiencia, parent_equipo_id, label, activo) VALUES
  (pg_temp.id('eq', 10), 'dps', pg_temp.id('eq', 2), 'Atención al Voluntario', true);
INSERT INTO public.dream_team_roles (id, equipo_id, label, nivel, activo) VALUES
  (pg_temp.id('ro', 10), pg_temp.id('eq', 10), 'Coordinador', 'coordinador', true),
  (pg_temp.id('ro', 11), pg_temp.id('eq', 10), 'Voluntario',  'voluntario',  true);
INSERT INTO public.dream_team_servicios (id, persona_id, equipo_id, rol_id, estado, fecha_inicio, motivo_actual)
SELECT pg_temp.id('se', v.se), pg_temp.id('us', v.us), pg_temp.id('eq', v.eq), pg_temp.id('ro', v.ro),
       'activo', now() - interval '30 days', 'admin_asignacion'
  FROM (VALUES (50, 5, 10, 10), (21, 21, 3, 3), (22, 22, 3, 3), (23, 23, 10, 11)) AS v(se, us, eq, ro);
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source)
SELECT DISTINCT s.persona_id, k.capability_key, k.experience, k.scope_type, k.scope_id, 'dream-team-servicio'
  FROM public.dream_team_servicios s
  JOIN public.dream_team_equipos e ON e.id = s.equipo_id
  JOIN public.dream_team_roles r ON r.id = s.rol_id
 CROSS JOIN LATERAL public.dream_team_grants_de_servicio(s.equipo_id, e.experiencia, s.rol_id, r.label) k
 WHERE s.id IN (pg_temp.id('se', 50), pg_temp.id('se', 21), pg_temp.id('se', 22), pg_temp.id('se', 23));
INSERT INTO public.dream_team_capability_grants (persona_id, capability_key, experience, scope_type, scope_id, source) VALUES
  (pg_temp.id('us', 6), 'dream_team.coordinate', 'dream_team', 'equipo', pg_temp.id('eq', 3)::text, 'zz-test');
INSERT INTO t_ca_labels (id, label) VALUES
  (pg_temp.id('eq', 10), 'AV'), (pg_temp.id('ro', 10), 'coord'), (pg_temp.id('ro', 11), 'vol'),
  (pg_temp.id('us', 5), 'AV_COORD'), (pg_temp.id('us', 6), 'CAM_COORD');

SELECT pg_temp.assert_eq('p: fixture: the AV coordinator coordinates their node, the Cámaras one Cámaras',
  $q$SELECT pg_temp.grants(5) || ' / ' || (SELECT string_agg(g.capability_key || '@' || pg_temp.lbl(g.scope_id::uuid), ',')
       FROM public.dream_team_capability_grants g WHERE g.persona_id = pg_temp.id('us', 6))$q$,
  'dps.team.lead@AV, dream_team.coordinate@AV, dream_team.serve@AV / dream_team.coordinate@CAM');

-- The button: dream_team_puede_solicitar_cambio_area (director authority or
-- dream_team.coordinate on the equipo or an ancestor).
CREATE OR REPLACE FUNCTION pg_temp.puede_solicitar(p_us int, p_eq int) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.as_persona(p_us);
  RETURN public.dream_team_puede_solicitar_cambio_area(pg_temp.id('eq', p_eq))::text;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.puede_solicitar(int, int) TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_eq('p: puede_solicitar: CAM_COORD on Cámaras and Audio; PT_DIR, COORD, AV_COORD, ADMIN, nobody',
  $q$SELECT concat_ws(',', pg_temp.puede_solicitar(6, 3), pg_temp.puede_solicitar(6, 4), pg_temp.puede_solicitar(2, 3),
                     pg_temp.puede_solicitar(3, 6), pg_temp.puede_solicitar(5, 3), pg_temp.puede_solicitar(5, 10),
                     pg_temp.puede_solicitar(4, 9), pg_temp.puede_solicitar(1, 9))$q$,
  'true,false,true,true,false,true,true,false');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.assert_eq('p: puede_solicitar without a session is false',
  $q$SELECT public.dream_team_puede_solicitar_cambio_area(pg_temp.id('eq', 3))::text$q$, 'false');
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('p: puede_solicitar of an unknown equipo is false',
  $q$SELECT public.dream_team_puede_solicitar_cambio_area(pg_temp.id('eq', 99))::text$q$, 'false');
RESET ROLE;

-- The Cámaras coordinator: no direct move, destinations without dirige, a request.
INSERT INTO t_ca_ctx (k, v) VALUES ('p1.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_raises('p1: the Cámaras coordinator cannot move Cámaras → Audio',
  $q$SELECT pg_temp.mover(21, 4, 4, 'traslado', NULL)$q$, '42501',
  'No tienes autoridad de director sobre el área actual de este servicio.');
SELECT pg_temp.assert_eq('p1: their destinations: none with dirige, Audio among them',
  $q$SELECT count(*) FILTER (WHERE d.dirige) || '|' || count(*) FILTER (WHERE d.equipo_id = pg_temp.id('eq', 4))
       FROM public.dream_team_cambiar_area_destinos(pg_temp.id('se', 21)) d$q$, '0|1');
RESET ROLE;
SELECT pg_temp.assert_eq('p1: the refused move changed nothing', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('p1.antes'));

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(6);
SELECT pg_temp.guardar('p', $q$SELECT pg_temp.solicitar(21, 4, 4, 'traslado', 'Pide pasar a audio')$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('p1: one pendiente request, signed by the Cámaras coordinator',
  $q$SELECT pg_temp.solicitudes(21)$q$, 'pendiente:CAM_COORD>AUD:vol:traslado:Pide pasar a audio:-:-:-:-');
SELECT pg_temp.assert_eq('p1: the request returns its id',
  $q$SELECT count(*)::text FROM public.dream_team_solicitudes_cambio_area
      WHERE id = pg_temp.ctx('p')::uuid AND servicio_id = pg_temp.id('se', 21)$q$, '1');
SELECT pg_temp.assert_eq('p1: requesting does not move the servicio',
  $q$SELECT pg_temp.servicios(21) || ' / ' || pg_temp.grants(21)$q$,
  'CAM:vol:activo:admin_asignacion:1:- / dps.team.serve@CAM, dream_team.serve@CAM');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(6);
SELECT pg_temp.assert_eq('p1: the requester reads their own request, without resolving it (RPC and RLS)',
  $q$SELECT string_agg(l.persona_nombre || '|' || l.estado || '|' || l.puede_resolver || '|' || l.es_mia, ',')
            || ' / ' || (SELECT count(*) FROM public.dream_team_solicitudes_cambio_area)
       FROM public.dream_team_solicitudes_cambio_area() l$q$, 'ZZ Ca V21|pendiente|false|true / 1');
RESET ROLE;

-- The Atención al Voluntario coordinator of Producción Técnica.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('p2: the AV coordinator reads only the pending request inside their reach, to resolve (RPC and RLS)',
  $q$SELECT string_agg(l.persona_nombre || '|' || l.estado || '|' || l.puede_resolver || '|' || l.es_mia, ',')
            || ' / ' || (SELECT count(*) FROM public.dream_team_solicitudes_cambio_area)
       FROM public.dream_team_solicitudes_cambio_area() l$q$, 'ZZ Ca V21|pendiente|true|false / 1');
RESET ROLE;

INSERT INTO t_ca_ctx (k, v) VALUES ('p2.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_raises('p2: the AV coordinator cannot approve a request whose destination is outside Producción Técnica',
  $q$SELECT pg_temp.resolver('g', true, NULL)$q$, '42501',
  'Solo un director con autoridad sobre ambas áreas o el coordinador de Atención al Voluntario de la dirección puede resolver esta solicitud.');
SELECT pg_temp.assert_raises('p2: nor reject it',
  $q$SELECT pg_temp.resolver('g', false, NULL)$q$, '42501',
  'Solo un director con autoridad sobre ambas áreas o el coordinador de Atención al Voluntario de la dirección puede resolver esta solicitud.');
SELECT pg_temp.assert_raises('p2: the AV coordinator cannot request for an área they do not coordinate',
  $q$SELECT pg_temp.solicitar(22, 4, 4, 'traslado', NULL)$q$, '42501',
  'No tienes autoridad de director ni de coordinador sobre el área actual de este servicio.');
SELECT pg_temp.assert_raises('p2: nor list its destinations',
  $q$SELECT pg_temp.destinos(22)$q$, '42501',
  'No tienes autoridad de director ni de coordinador sobre el área actual de este servicio.');
SELECT pg_temp.assert_raises('p2: the AV coordinator cannot move directly, even inside their node',
  $q$SELECT pg_temp.mover(23, 4, 4, 'traslado', NULL)$q$, '42501',
  'No tienes autoridad de director sobre el área actual de este servicio.');
RESET ROLE;
SELECT pg_temp.assert_eq('p2: the refused calls changed nothing', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('p2.antes'));
SELECT pg_temp.assert_eq('p2: the outside request is still pendiente',
  $q$SELECT pg_temp.solicitudes(17)$q$, 'pendiente:COORD>EST:vol:correccion:Va a estacionamiento:-:-:-:-');

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.guardar('p.ok', $q$SELECT pg_temp.resolver('p', true, 'Aprobado por AV')$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('p2: approving returns the new servicio, in Audio',
  $q$SELECT pg_temp.lbl(s.equipo_id) || ':' || s.estado FROM public.dream_team_servicios s WHERE s.id = pg_temp.ctx('p.ok')::uuid$q$, 'AUD:activo');
SELECT pg_temp.assert_eq('p2: the request is aprobada by the AV coordinator, with the answer and the new servicio',
  $q$SELECT pg_temp.solicitudes(21)$q$, 'aprobada:CAM_COORD>AUD:vol:traslado:Pide pasar a audio:AV_COORD:Aprobado por AV:at:nuevo');
SELECT pg_temp.assert_eq('p2: origin retired, destination activo',
  $q$SELECT pg_temp.servicios(21)$q$, 'AUD:vol:activo:reasignacion:1:-, CAM:vol:retirado:reasignacion:2:fin');
SELECT pg_temp.assert_eq('p2: history signed by the AV coordinator, with the request nota',
  $q$SELECT pg_temp.historial(21)$q$,
  'AUD:activo>activo:reasignacion:AV_COORD:Traslado · Desde ZZ DPS › Producción Técnica › Cámaras (Voluntario) · Pide pasar a audio'
  || ' | CAM:activo>retirado:reasignacion:AV_COORD:Traslado · Hacia ZZ DPS › Producción Técnica › Audio (Voluntario) · Pide pasar a audio');
SELECT pg_temp.assert_eq('p2: grants moved',
  $q$SELECT pg_temp.grants(21)$q$, 'dps.team.serve@AUD, dps.team.serve@CAM~, dream_team.serve@AUD, dream_team.serve@CAM~');

-- Nobody resolves their own request: the AV coordinator asks for a volunteer of their node.
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.guardar('p.mia', $q$SELECT pg_temp.solicitar(23, 4, 4, 'correccion', NULL)$q$);
RESET ROLE;
SELECT pg_temp.assert_eq('p3: the AV coordinator requests for their own node',
  $q$SELECT pg_temp.solicitudes(23)$q$, 'pendiente:AV_COORD>AUD:vol:correccion:-:-:-:-:-');
INSERT INTO t_ca_ctx (k, v) VALUES ('p3.antes', pg_temp.huella());
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_persona(5);
SELECT pg_temp.assert_eq('p3: they read it as their own, without resolving it',
  $q$SELECT string_agg(l.estado || '|' || l.puede_resolver || '|' || l.es_mia, ',')
       FROM public.dream_team_solicitudes_cambio_area() l WHERE l.servicio_id = pg_temp.id('se', 23)$q$, 'pendiente|false|true');
SELECT pg_temp.assert_raises('p3: they cannot approve their own request',
  $q$SELECT pg_temp.resolver('p.mia', true, NULL)$q$, '42501', 'No puedes resolver una solicitud que enviaste tú.');
SELECT pg_temp.assert_raises('p3: nor reject it',
  $q$SELECT pg_temp.resolver('p.mia', false, NULL)$q$, '42501', 'No puedes resolver una solicitud que enviaste tú.');
SELECT pg_temp.as_persona(2);
SELECT pg_temp.assert_eq('p3: the PT director can resolve it',
  $q$SELECT string_agg(l.estado || '|' || l.puede_resolver || '|' || l.es_mia, ',')
       FROM public.dream_team_solicitudes_cambio_area() l WHERE l.servicio_id = pg_temp.id('se', 23)$q$, 'pendiente|true|false');
RESET ROLE;
SELECT pg_temp.assert_eq('p3: the refused calls changed nothing', $q$SELECT pg_temp.huella()$q$, pg_temp.ctx('p3.antes'));

SELECT pg_temp.assert_eq('p4: the two new functions: authenticated executes them, anon and public do not; SECURITY DEFINER, empty search_path',
  $q$SELECT string_agg(p.oid::regprocedure::text || '=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
                        || '|' || has_function_privilege('anon', p.oid, 'EXECUTE')
                        || '|' || has_function_privilege('public', p.oid, 'EXECUTE')
                        || '|' || (p.prosecdef AND p.proconfig @> ARRAY['search_path=""']), ', ' ORDER BY p.proname)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('dream_team_puede_solicitar_cambio_area', 'dream_team_puede_resolver_cambio_area')$q$,
  'dream_team_puede_resolver_cambio_area(uuid,uuid)=true|false|false|true, '
  || 'dream_team_puede_solicitar_cambio_area(uuid)=true|false|false|true');

DO $$
BEGIN
  RAISE EXCEPTION 'SUITE_RESULT: %', (SELECT coalesce(string_agg(case_name, ' || ' ORDER BY case_name), 'ALL OK') FROM t_ca_failures);
END;
$$;
