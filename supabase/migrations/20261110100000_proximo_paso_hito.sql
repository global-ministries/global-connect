-- noqa: insert-into (only inside marcar_proximo_paso; no data is written here)
-- The milestone «hizo Próximo Paso», per person (odd/tasks/home-por-rol.md,
-- T1; S4, S5, L5–L8).
--
-- Why: Próximo Paso is the first taller of a new person and the door to serve
-- in Dream Team (S4); the home asks for it only to whoever has not done it
-- (S3), and "el director de cada area deberia poder marcar si su voluntario ha
-- realizado proximo paso o no" (S5). Today nothing answers "did this person do
-- Próximo Paso": its graduation (odd/tasks/proximo-paso.md) is not built, so
-- nobody holds the milestone yet.
--
-- What:
--   1. public.personas_proximo_paso: the manual mark, one row per person
--      (usuario_id, fuente 'marcado', marcado_por, marcado_en, nota). RLS on;
--      the person reads their own row and whoever may mark it reads it too
--      (proximo_paso_puede_ver). No direct writes: only marcar_proximo_paso.
--   2. public.proximo_paso_puede_marcar(p_usuario_id): whether the caller may
--      mark or unmark the person:
--        · admin or pastor (es_admin_o_pastor);
--        · Dream Team or talleres authority over the Próximo Paso node or an
--          ancestor (DPS): dream_team.direct / dream_team.coordinate in the
--          tree, talleres_crecimiento.director.write / coordinator.write
--          scoped. The node is the equipo of the taller slug 'proximo-paso'
--          (no fixed id); without it this branch is false;
--        · the director or coordinator of an area where the person has a
--          servicio that is not retirado (postulado and en_orientacion
--          included): dream_team.direct / dream_team.coordinate in the tree of
--          that servicio's equipo;
--        · whoever may edit the person's ficha (dream_team_puede_editar_ficha:
--          volunteer coordinator, org.manage, area director that reaches them).
--   3. public.proximo_paso_puede_ver(p_usuario_id): the person themself or (2).
--   4. public.hizo_proximo_paso(p_usuario_id) → boolean: true when a manual
--      mark exists or the person holds a certificate (not revoked) of an
--      edición of the taller slug 'proximo-paso'. NULL when the caller may not
--      see that person (3), as the home loader reads NULL as "unknown".
--   5. public.personas_con_proximo_paso(p_ids uuid[]) → setof uuid: the ids
--      among p_ids (max 2000) that did it and that the caller may see.
--   6. public.marcar_proximo_paso(p_usuario_id, p_hecho, p_nota default null)
--      → jsonb {usuario_id, hecho, marcado, por_certificado}: hecho = true
--      writes or updates the mark (marcado_por = the caller's usuarios.id);
--      hecho = false deletes the mark only — a certificate is never touched,
--      so the person may still have done it. Unauthorized: 42501 and nothing
--      changes.
--
-- Not done on purpose (L7): nothing blocks postulado → activo without the
-- milestone; no trigger or check on dream_team_servicios.
--
-- Blast radius: one new table (empty), six new functions. No existing object
-- changes. Every function runs as definer with an empty search_path and fully
-- qualified names; EXECUTE is revoked from PUBLIC and anon.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.marcar_proximo_paso(uuid, boolean, text),
--     public.personas_con_proximo_paso(uuid[]), public.hizo_proximo_paso(uuid),
--     public.proximo_paso_hecho(uuid), public.proximo_paso_puede_ver(uuid),
--     public.proximo_paso_puede_marcar(uuid), public.proximo_paso_nodo();
--   DROP TABLE IF EXISTS public.personas_proximo_paso;

-- ── 1. table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.personas_proximo_paso (
  usuario_id  uuid        PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  fuente      text        NOT NULL DEFAULT 'marcado' CHECK (fuente IN ('marcado')),
  marcado_por uuid        REFERENCES public.usuarios(id) ON DELETE SET NULL,
  marcado_en  timestamptz NOT NULL DEFAULT now(),
  nota        text        CHECK (nota IS NULL OR length(nota) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS idx_personas_proximo_paso_marcado_por
  ON public.personas_proximo_paso (marcado_por);

COMMENT ON TABLE public.personas_proximo_paso IS
  'Manual mark «hizo Próximo Paso», one row per person (S5). The certificate of the taller '
  'proximo-paso counts too (hizo_proximo_paso). Written only through marcar_proximo_paso.';

ALTER TABLE public.personas_proximo_paso ENABLE ROW LEVEL SECURITY;
-- Default privileges hand anon and authenticated everything; start from none.
REVOKE ALL ON public.personas_proximo_paso FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.personas_proximo_paso TO authenticated;

-- ── 2. helpers ───────────────────────────────────────────────────────

-- The Dream Team node of the taller Próximo Paso (under DPS since
-- 20260911130000). NULL when the taller or its node is missing.
CREATE OR REPLACE FUNCTION public.proximo_paso_nodo()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT t.dream_team_equipo_id FROM public.talleres t WHERE t.slug = 'proximo-paso' LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.proximo_paso_nodo() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.proximo_paso_puede_marcar(p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND p_usuario_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.usuarios a WHERE a.auth_id = auth.uid())
     AND (
       public.es_admin_o_pastor(auth.uid())
       -- Authority over the Próximo Paso node or an ancestor (DPS).
       OR EXISTS (SELECT 1
                    FROM (SELECT public.proximo_paso_nodo() AS id) n
                   WHERE n.id IS NOT NULL
                     AND (public.auth_has_dream_team_capability_in_tree('dream_team.direct', n.id)
                          OR public.auth_has_dream_team_capability_in_tree('dream_team.coordinate', n.id)
                          OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', n.id)
                          OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.write', n.id)))
       -- Director or coordinator of an area where the person serves or applied.
       OR EXISTS (SELECT 1
                    FROM public.dream_team_servicios s
                   WHERE s.persona_id = p_usuario_id
                     AND s.estado <> 'retirado'
                     AND (public.auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id)
                          OR public.auth_has_dream_team_capability_in_tree('dream_team.coordinate', s.equipo_id)))
       OR public.dream_team_puede_editar_ficha(p_usuario_id)
     );
$function$;

COMMENT ON FUNCTION public.proximo_paso_puede_marcar(uuid) IS
  'Whether the actor may mark or unmark «hizo Próximo Paso» for the person: admin or pastor; '
  'authority over the Próximo Paso node or DPS; director or coordinator of an area where the person '
  'has a non-retired servicio; or whoever may edit the person''s ficha.';

REVOKE ALL ON FUNCTION public.proximo_paso_puede_marcar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proximo_paso_puede_marcar(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.proximo_paso_puede_ver(p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND p_usuario_id IS NOT NULL
     AND (EXISTS (SELECT 1 FROM public.usuarios a WHERE a.auth_id = auth.uid() AND a.id = p_usuario_id)
          OR public.proximo_paso_puede_marcar(p_usuario_id));
$function$;

COMMENT ON FUNCTION public.proximo_paso_puede_ver(uuid) IS
  'Whether the actor may see «hizo Próximo Paso» of the person: the person themself or '
  'proximo_paso_puede_marcar.';

REVOKE ALL ON FUNCTION public.proximo_paso_puede_ver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proximo_paso_puede_ver(uuid) TO authenticated;

-- The fact itself, without any visibility check (internal).
CREATE OR REPLACE FUNCTION public.proximo_paso_hecho(p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.personas_proximo_paso m WHERE m.usuario_id = p_usuario_id)
      OR EXISTS (SELECT 1
                   FROM public.taller_certificados c
                   JOIN public.taller_ediciones e ON e.id = c.taller_id
                   JOIN public.talleres t ON t.id = e.taller_id
                  WHERE c.persona_id = p_usuario_id
                    AND c.revocado_at IS NULL
                    AND t.slug = 'proximo-paso');
$function$;

REVOKE ALL ON FUNCTION public.proximo_paso_hecho(uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS personas_proximo_paso_select ON public.personas_proximo_paso;
CREATE POLICY personas_proximo_paso_select ON public.personas_proximo_paso
  FOR SELECT TO authenticated
  USING (public.proximo_paso_puede_ver(usuario_id));

-- ── 3. reads ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hizo_proximo_paso(p_usuario_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE
           WHEN coalesce(auth.role(), '') = 'service_role' OR public.proximo_paso_puede_ver(p_usuario_id)
             THEN public.proximo_paso_hecho(p_usuario_id)
         END;
$function$;

COMMENT ON FUNCTION public.hizo_proximo_paso(uuid) IS
  'Whether the person did Próximo Paso: a manual mark (personas_proximo_paso) or a certificate, not '
  'revoked, of the taller proximo-paso. NULL when the actor may not see that person.';

REVOKE ALL ON FUNCTION public.hizo_proximo_paso(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hizo_proximo_paso(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.personas_con_proximo_paso(p_ids uuid[])
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF coalesce(array_length(p_ids, 1), 0) > 2000 THEN
    RAISE EXCEPTION 'demasiados_ids' USING errcode = '22023';
  END IF;
  RETURN QUERY
  SELECT DISTINCT x.id
    FROM unnest(coalesce(p_ids, '{}'::uuid[])) AS x(id)
   WHERE x.id IS NOT NULL
     AND public.proximo_paso_hecho(x.id)
     AND (coalesce(auth.role(), '') = 'service_role' OR public.proximo_paso_puede_ver(x.id));
END;
$function$;

COMMENT ON FUNCTION public.personas_con_proximo_paso(uuid[]) IS
  'The ids among p_ids (max 2000) that did Próximo Paso (hizo_proximo_paso) and that the actor may see.';

REVOKE ALL ON FUNCTION public.personas_con_proximo_paso(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personas_con_proximo_paso(uuid[]) TO authenticated;

-- ── 4. mark / unmark ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.marcar_proximo_paso(
  p_usuario_id uuid,
  p_hecho boolean,
  p_nota text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid;
  v_nota text := nullif(btrim(p_nota), '');
BEGIN
  SELECT u.id INTO v_actor FROM public.usuarios u WHERE u.auth_id = auth.uid() AND auth.uid() IS NOT NULL LIMIT 1;

  IF v_actor IS NULL OR NOT public.proximo_paso_puede_marcar(p_usuario_id) THEN
    RAISE EXCEPTION 'No tienes permiso para marcar Próximo Paso de esta persona.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_usuario_id) THEN
    RAISE EXCEPTION 'La persona no existe.' USING ERRCODE = 'P0002';
  END IF;
  IF p_hecho IS NULL THEN
    RAISE EXCEPTION 'Indica si la persona hizo Próximo Paso o no.' USING ERRCODE = '22023';
  END IF;
  IF length(v_nota) > 500 THEN
    RAISE EXCEPTION 'La nota no puede pasar de 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF p_hecho THEN
    INSERT INTO public.personas_proximo_paso (usuario_id, fuente, marcado_por, marcado_en, nota)
    VALUES (p_usuario_id, 'marcado', v_actor, now(), v_nota)
    ON CONFLICT (usuario_id) DO UPDATE
      SET marcado_por = EXCLUDED.marcado_por,
          marcado_en = EXCLUDED.marcado_en,
          nota = EXCLUDED.nota;
  ELSE
    -- Only the manual mark; a certificate of the taller stays as it is.
    DELETE FROM public.personas_proximo_paso WHERE usuario_id = p_usuario_id;
  END IF;

  RETURN jsonb_build_object(
    'usuario_id', p_usuario_id,
    'hecho', public.proximo_paso_hecho(p_usuario_id),
    'marcado', EXISTS (SELECT 1 FROM public.personas_proximo_paso m WHERE m.usuario_id = p_usuario_id),
    'por_certificado', EXISTS (SELECT 1
                                 FROM public.taller_certificados c
                                 JOIN public.taller_ediciones e ON e.id = c.taller_id
                                 JOIN public.talleres t ON t.id = e.taller_id
                                WHERE c.persona_id = p_usuario_id
                                  AND c.revocado_at IS NULL
                                  AND t.slug = 'proximo-paso')
  );
END;
$function$;

COMMENT ON FUNCTION public.marcar_proximo_paso(uuid, boolean, text) IS
  'Marks (p_hecho true) or unmarks (false) «hizo Próximo Paso» for the person. Unmarking deletes '
  'only the manual mark, never a certificate. Allowed by proximo_paso_puede_marcar; else 42501.';

REVOKE ALL ON FUNCTION public.marcar_proximo_paso(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_proximo_paso(uuid, boolean, text) TO authenticated;
