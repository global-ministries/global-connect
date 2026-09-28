-- T3 correction (odd/tasks/talleres-configuracion-del-taller.md) — atomic
-- reorder for the taller's plantilla clases, replacing the app-layer
-- three-step client swap (non-atomic, flagged as a compromise in the
-- original T3 delivery).
--
-- WHY
--   The app-layer version of "reorder by swapping numero" issued three
--   sequential UPDATEs from the client with no transaction — a failure
--   between steps could leave one row parked on a temporary numero. Not
--   acceptable once T6 loads real plantilla data. This migration moves
--   the whole swap into one SECURITY DEFINER function, so it either
--   commits both rows or rolls back entirely.
--
-- WHAT
--   talleres_mover_plantilla_clase(p_clase_id uuid, p_direccion text)
--   ('arriba' | 'abajo') → jsonb {moved, clase_id, numero}. Authorized
--   with the EXACT predicate taller_plantilla_clases_update's RLS policy
--   uses (20260926150000_talleres_plantillas_del_taller.sql):
--   director.write OR admin.manage, tree-scoped via
--   auth_has_talleres_capability_scoped(key, talleres.dream_team_equipo_id)
--   — reused verbatim, not re-derived — else 42501
--   sin_permisos_para_este_taller. Swaps `numero` with the adjacent
--   ACTIVE-or-not neighbor (nearest lower numero for 'arriba', nearest
--   higher for 'abajo') in the SAME taller; no neighbor in that
--   direction is a no-op, {moved: false}.
--
--   The swap uses a temporary out-of-range `numero` so the two UPDATEs
--   never collide on UNIQUE (taller_id, numero) mid-function. The
--   column also has CHECK (numero > 0), which rules out a NEGATIVE
--   temporary value (it would fail that CHECK immediately, before the
--   UNIQUE constraint is even reached) — a large positive value
--   (current max + 1,000,000) achieves the same "park it out of the
--   way" effect without violating that CHECK. Safe within this single
--   transaction: the function either commits both swapped rows or
--   rolls back entirely, so the temporary value is never observable
--   outside the function.
--
-- SAFETY
--   Additive only: one new SECURITY DEFINER function, default-deny
--   (REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated,
--   postgres, service_role only — same posture as talleres_editar_grupo/
--   talleres_editar_clase, 20260927100000_talleres_instanciar_edicion.sql).
--   No existing table, column, policy, function, or trigger is dropped,
--   renamed, or narrowed. Grupos de Vida is not referenced.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.talleres_mover_plantilla_clase(uuid, text);

CREATE OR REPLACE FUNCTION public.talleres_mover_plantilla_clase(p_clase_id uuid, p_direccion text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_taller_id     uuid;
  v_numero        int;
  v_equipo_id     uuid;
  v_vecino_id     uuid;
  v_vecino_numero int;
  v_temp          int;
BEGIN
  IF p_direccion NOT IN ('arriba', 'abajo') THEN
    RAISE EXCEPTION 'INVALID_DIRECCION: %', p_direccion USING ERRCODE = '22023';
  END IF;

  SELECT taller_id, numero INTO v_taller_id, v_numero
  FROM public.taller_plantilla_clases
  WHERE id = p_clase_id;

  IF v_taller_id IS NULL THEN
    RAISE EXCEPTION 'CLASE_NOT_FOUND: %', p_clase_id USING ERRCODE = 'P0002';
  END IF;

  SELECT t.dream_team_equipo_id INTO v_equipo_id
  FROM public.talleres t
  WHERE t.id = v_taller_id;

  -- Same predicate as taller_plantilla_clases_update's RLS policy
  -- (20260926150000_talleres_plantillas_del_taller.sql) — reused
  -- verbatim, never re-derived.
  IF NOT (
       public.auth_has_talleres_capability_scoped('talleres_crecimiento.director.write', v_equipo_id)
    OR public.auth_has_talleres_capability_scoped('talleres_crecimiento.admin.manage', v_equipo_id)
  ) THEN
    RAISE EXCEPTION 'sin_permisos_para_este_taller' USING ERRCODE = '42501';
  END IF;

  IF p_direccion = 'arriba' THEN
    SELECT id, numero INTO v_vecino_id, v_vecino_numero
    FROM public.taller_plantilla_clases
    WHERE taller_id = v_taller_id AND numero < v_numero
    ORDER BY numero DESC
    LIMIT 1;
  ELSE
    SELECT id, numero INTO v_vecino_id, v_vecino_numero
    FROM public.taller_plantilla_clases
    WHERE taller_id = v_taller_id AND numero > v_numero
    ORDER BY numero ASC
    LIMIT 1;
  END IF;

  IF v_vecino_id IS NULL THEN
    RETURN jsonb_build_object('moved', false, 'clase_id', p_clase_id, 'numero', v_numero);
  END IF;

  SELECT COALESCE(MAX(numero), 0) + 1000000 INTO v_temp
  FROM public.taller_plantilla_clases
  WHERE taller_id = v_taller_id;

  UPDATE public.taller_plantilla_clases SET numero = v_temp WHERE id = p_clase_id;
  UPDATE public.taller_plantilla_clases SET numero = v_numero WHERE id = v_vecino_id;
  UPDATE public.taller_plantilla_clases SET numero = v_vecino_numero WHERE id = p_clase_id;

  RETURN jsonb_build_object('moved', true, 'clase_id', p_clase_id, 'numero', v_vecino_numero);
END;
$function$;

REVOKE ALL ON FUNCTION public.talleres_mover_plantilla_clase(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talleres_mover_plantilla_clase(uuid, text) TO authenticated, postgres, service_role;
