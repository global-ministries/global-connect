-- ════════════════════════════════════════════════════════════════════
-- PR29-C — RPCs para Ediciones Globales de Talleres de Crecimiento.
-- Fase 3 (cadena: design → B → C → D → E).
--
-- Define las 6 funciones SECURITY DEFINER que materializan el state
-- machine de `taller_ediciones_globales` (la tabla creada en PR29-B):
--   - create_edicion_global        (crear temporada + asociar talleres)
--   - open_edicion_global          (transicionar a abierto + propagar)
--   - close_edicion_global         (cerrar, respeta inscripciones activas)
--   - cancel_edicion_global        (cancelar + limpiar junction)
--   - add_taller_to_edicion_global (asociar taller a una global)
--   - remove_taller_from_edicion_global (sacar taller de una global)
--
-- Gating (todas): `talleres_crecimiento.director.write` OR
--                `talleres_crecimiento.admin.manage`.
-- Las capabilities se chequean vía `public.auth_has_talleres_capability`
-- (helper existente, ver migration 20260808204221).
--
-- Idempotencia:
--   - CREATE OR REPLACE FUNCTION (re-deploy safe).
--   - GRANT idempotente.
--   - La junction usa ON CONFLICT DO NOTHING.
--   - El trigger de updated_at es local a esta migration (la tabla ya
--     tiene el trigger de PR29-B; este es un safety net por si el deploy
--     de PR29-C corre antes que el de PR29-B — al ser BEFORE UPDATE
--     redundant es inofensivo).
--
-- Out of scope (futuro PR29-E):
--   - DROP de taller_periodos_generales.
--   - Migración del pg_cron 'talleres_period_closer'.
--
-- No toca archivos protegidos (byte-identity guard).
-- ════════════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0) Helper local: updated_at para tablas de PR29                ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Re-creación idempotente del helper de updated_at que ya instaló
-- PR29-B sobre `taller_ediciones_globales`. CREATE OR REPLACE FUNCTION
-- lo deja no-op si ya existe. Trigger sobre la junction para que el
-- audit trail sea consistente en PR29-C.

CREATE OR REPLACE FUNCTION public.fn_set_updated_at_taller_ediciones_globales()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Safety net trigger sobre la junction (no estaba en PR29-B porque
-- la junction no tiene updated_at). Se añade `BEFORE UPDATE` solo
-- para defender la columna updated_at en `taller_ediciones_globales`
-- si la migration C corre antes que B en un entorno degradado.
DROP TRIGGER IF EXISTS set_updated_at_taller_ediciones_globales
  ON public.taller_ediciones_globales;
CREATE TRIGGER set_updated_at_taller_ediciones_globales
  BEFORE UPDATE ON public.taller_ediciones_globales
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_updated_at_taller_ediciones_globales();

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 1) create_edicion_global                                        ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Crea una edición global en estado 'borrador'. Opcionalmente asocia
-- talleres iniciales en la misma transacción (la asociación se hace vía
-- `add_taller_to_edicion_global` lógicamente — pero acá lo inlineamos
-- para mantener 1 round-trip en el form de crear).
--
-- Validations:
--   - auth.uid() NOT NULL (else UNAUTHENTICATED)
--   - director.write OR admin.manage (else FORBIDDEN)
--   - length(nombre) BETWEEN 2 AND 120
--   - slug match '^[a-z0-9-]+$', length 2..80, NOT en {__legacy__, legacy-pre-pr29}
--   - fecha_cierre > fecha_apertura
--
-- Returns: jsonb {id, slug, estado}

CREATE OR REPLACE FUNCTION public.create_edicion_global(
  p_nombre         text,
  p_slug           text,
  p_descripcion    text,
  p_fecha_apertura timestamptz,
  p_fecha_cierre   timestamptz,
  p_taller_ids     uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id  uuid;
  v_cap_ok   boolean;
  v_new_id   uuid;
  v_taller_id uuid;
BEGIN
  -- Capability gate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  v_cap_ok := public.auth_has_talleres_capability('talleres_crecimiento.director.write')
              OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage');
  IF NOT v_cap_ok THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage'
      USING ERRCODE = '42501';
  END IF;

  -- Validations
  IF p_nombre IS NULL OR length(p_nombre) < 2 OR length(p_nombre) > 120 THEN
    RAISE EXCEPTION 'INVALID_NOMBRE_LENGTH' USING ERRCODE = '22023';
  END IF;

  IF p_slug IS NULL
     OR p_slug !~ '^[a-z0-9-]+$'
     OR length(p_slug) < 2
     OR length(p_slug) > 80
     OR p_slug = '__legacy__'
     OR p_slug = 'legacy-pre-pr29' THEN
    RAISE EXCEPTION 'INVALID_SLUG' USING ERRCODE = '22023';
  END IF;

  IF p_fecha_apertura IS NULL OR p_fecha_cierre IS NULL THEN
    RAISE EXCEPTION 'FECHAS_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_fecha_cierre <= p_fecha_apertura THEN
    RAISE EXCEPTION 'FECHA_CIERRE_BEFORE_APERTURA' USING ERRCODE = '22023';
  END IF;

  -- Insert (estado forzado a 'borrador' — siempre se crea en borrador)
  INSERT INTO public.taller_ediciones_globales (
    nombre, slug, descripcion,
    fecha_apertura, fecha_cierre,
    estado, created_by_persona_id
  )
  VALUES (
    p_nombre, p_slug, p_descripcion,
    p_fecha_apertura, p_fecha_cierre,
    'borrador', v_user_id
  )
  RETURNING id INTO v_new_id;

  -- Asocia talleres iniciales si los hay. ON CONFLICT DO NOTHING porque
  -- el caller puede pasar duplicados sin querer (form re-render).
  IF p_taller_ids IS NOT NULL AND array_length(p_taller_ids, 1) > 0 THEN
    FOREACH v_taller_id IN ARRAY p_taller_ids LOOP
      INSERT INTO public.taller_edicion_global_participantes (
        edicion_global_id, taller_id
      )
      VALUES (v_new_id, v_taller_id)
      ON CONFLICT (edicion_global_id, taller_id) DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'id', v_new_id,
    'slug', p_slug,
    'estado', 'borrador'
  );
END;
$func$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 2) open_edicion_global                                          ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Transiciona una global de 'borrador' a 'abierto'. Propaga a los
-- talleres asociados que estén en estado 'borrador' (locales), también
-- pasándolos a 'abierto'.
--
-- Si la fecha_apertura es futura (warning), la operación igual se
-- permite (admin puede abrir antes de tiempo). Se surfacea via RAISE
-- NOTICE para que el cliente la loguee.
--
-- Validations:
--   - La global debe existir
--   - estado actual = 'borrador' (si no, INVALID_STATE_TRANSITION)
--
-- Returns: jsonb {id, estado, locales_abiertas: count}

CREATE OR REPLACE FUNCTION public.open_edicion_global(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id    uuid;
  v_cap_ok     boolean;
  v_estado     text;
  v_fecha_apertura timestamptz;
  v_locales_abiertas integer := 0;
BEGIN
  -- Capability gate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  v_cap_ok := public.auth_has_talleres_capability('talleres_crecimiento.director.write')
              OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage');
  IF NOT v_cap_ok THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the global row to serialize concurrent open transitions.
  SELECT estado, fecha_apertura
    INTO v_estado, v_fecha_apertura
    FROM public.taller_ediciones_globales
   WHERE id = p_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EDICION_GLOBAL_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_estado <> 'borrador' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: actual=%, expected=borrador',
      v_estado
      USING ERRCODE = '22023';
  END IF;

  -- Update global
  UPDATE public.taller_ediciones_globales
     SET estado = 'abierto'
   WHERE id = p_id;

  -- Propagate a locales: pasar a 'abierto' los talleres participantes
  -- que estén en 'borrador' en la tabla local (taller_ediciones).
  WITH participantes AS (
    SELECT p.taller_id
      FROM public.taller_edicion_global_participantes p
     WHERE p.edicion_global_id = p_id
  ),
  updated AS (
    UPDATE public.taller_ediciones t
       SET estado = 'abierto'
      FROM participantes par
     WHERE t.id = par.taller_id
       AND t.estado = 'borrador'
     RETURNING 1
  )
  SELECT count(*) INTO v_locales_abiertas FROM updated;

  -- Surface warning si fecha_apertura es futura. RAISE NOTICE no aborta
  -- la transacción — el admin ve el warning en el log del cliente.
  IF v_fecha_apertura IS NOT NULL AND v_fecha_apertura > now() THEN
    RAISE NOTICE 'OPEN_BEFORE_FECHA_APERTURA: fecha_apertura=%', v_fecha_apertura;
  END IF;

  RETURN jsonb_build_object(
    'id', p_id,
    'estado', 'abierto',
    'locales_abiertas', v_locales_abiertas
  );
END;
$func$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 3) close_edicion_global                                         ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Cierra la global. Por defecto (p_force_local=false), cierra SOLO
-- las locales SIN inscripciones activas (estado='pendiente' o
-- 'aprobado' en taller_inscripciones). Las que sí tienen, quedan en
-- su estado actual (warning surfaced).
--
-- Con p_force_local=true, cierra TODAS las locales sin importar
-- inscripciones.
--
-- Validations:
--   - La global debe existir
--   - estado actual = 'abierto'
--
-- Returns: jsonb {id, estado, locales_cerradas, locales_no_cerradas}

CREATE OR REPLACE FUNCTION public.close_edicion_global(
  p_id           uuid,
  p_force_local  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id      uuid;
  v_cap_ok       boolean;
  v_estado       text;
  v_locales_cerradas   integer := 0;
  v_locales_no_cerradas integer := 0;
BEGIN
  -- Capability gate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  v_cap_ok := public.auth_has_talleres_capability('talleres_crecimiento.director.write')
              OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage');
  IF NOT v_cap_ok THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the global row
  SELECT estado INTO v_estado
    FROM public.taller_ediciones_globales
   WHERE id = p_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EDICION_GLOBAL_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_estado <> 'abierto' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: actual=%, expected=abierto',
      v_estado
      USING ERRCODE = '22023';
  END IF;

  -- Update global
  UPDATE public.taller_ediciones_globales
     SET estado = 'cerrado'
   WHERE id = p_id;

  -- Propagate a locales
  IF p_force_local THEN
    -- Cierra duro: todas las participantes
    WITH participantes AS (
      SELECT p.taller_id
        FROM public.taller_edicion_global_participantes p
       WHERE p.edicion_global_id = p_id
    ),
    updated AS (
      UPDATE public.taller_ediciones t
         SET estado = 'cerrado'
        FROM participantes par
       WHERE t.id = par.taller_id
       RETURNING 1
    )
    SELECT count(*) INTO v_locales_cerradas FROM updated;
    v_locales_no_cerradas := 0;
  ELSE
    -- Cierra solo las que NO tienen inscripciones activas.
    -- Inscripción activa = estado IN ('pendiente','aprobado').
    WITH participantes AS (
      SELECT p.taller_id
        FROM public.taller_edicion_global_participantes p
       WHERE p.edicion_global_id = p_id
    ),
    con_inscripciones AS (
      SELECT t.id
        FROM public.taller_ediciones t
        JOIN participantes par ON par.taller_id = t.id
       WHERE EXISTS (
             SELECT 1 FROM public.taller_inscripciones i
              WHERE i.taller_id = t.id
                AND i.estado IN ('pendiente','aprobado')
           )
    ),
    cerradas AS (
      UPDATE public.taller_ediciones t
         SET estado = 'cerrado'
        FROM participantes par
       WHERE t.id = par.taller_id
         AND NOT EXISTS (
           SELECT 1 FROM con_inscripciones c WHERE c.id = t.id
         )
       RETURNING 1
    )
    SELECT
      (SELECT count(*) FROM cerradas),
      (SELECT count(*) FROM con_inscripciones)
      INTO v_locales_cerradas, v_locales_no_cerradas;
  END IF;

  RETURN jsonb_build_object(
    'id', p_id,
    'estado', 'cerrado',
    'locales_cerradas', v_locales_cerradas,
    'locales_no_cerradas', v_locales_no_cerradas,
    'force_local', p_force_local
  );
END;
$func$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 4) cancel_edicion_global                                        ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Cancela la global (estado terminal). Desde 'borrador' o 'abierto'.
-- Limpia la junction (los participantes se borran vía ON DELETE
-- CASCADE si la FK lo permite — pero acá lo hacemos explícito para
-- surfacear el evento).
--
-- NO modifica las locales automáticamente — el admin las cancela
-- individualmente si lo desea.
--
-- p_motivo: text NOT NULL (la cancelación siempre requiere razón).
--
-- Returns: jsonb {id, estado, motivo}

CREATE OR REPLACE FUNCTION public.cancel_edicion_global(
  p_id     uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id  uuid;
  v_cap_ok   boolean;
  v_estado   text;
  v_participantes_borrados integer := 0;
BEGIN
  -- Capability gate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  v_cap_ok := public.auth_has_talleres_capability('talleres_crecimiento.director.write')
              OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage');
  IF NOT v_cap_ok THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage'
      USING ERRCODE = '42501';
  END IF;

  -- p_motivo es NOT NULL por contrato (la cancelación siempre requiere razón).
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 1 THEN
    RAISE EXCEPTION 'MOTIVO_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- Lock the global row
  SELECT estado INTO v_estado
    FROM public.taller_ediciones_globales
   WHERE id = p_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EDICION_GLOBAL_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_estado NOT IN ('borrador','abierto') THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: actual=%, expected=borrador|abierto',
      v_estado
      USING ERRCODE = '22023';
  END IF;

  -- Update global
  UPDATE public.taller_ediciones_globales
     SET estado = 'cancelado'
   WHERE id = p_id;

  -- Delete participantes explícito. La FK tiene ON DELETE CASCADE en
  -- la global, así que borrar la global ya los limpiaría — pero acá
  -- NO borramos la global, solo cambiamos su estado. Hacemos DELETE
  -- explícito de la junction para que las locales queden libres (su
  -- edicion_global_id queda apuntando a una global cancelada — eso
  -- es válido por diseño: las locales quedan con el FK a una global
  -- cancelada hasta que el admin reasigne via UI).
  WITH deleted AS (
    DELETE FROM public.taller_edicion_global_participantes
     WHERE edicion_global_id = p_id
     RETURNING 1
  )
  SELECT count(*) INTO v_participantes_borrados FROM deleted;

  RETURN jsonb_build_object(
    'id', p_id,
    'estado', 'cancelado',
    'motivo', p_motivo,
    'participantes_removidos', v_participantes_borrados
  );
END;
$func$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 5) add_taller_to_edicion_global                                 ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Asocia un taller a una edición global. Idempotente (ON CONFLICT
-- DO NOTHING sobre UNIQUE(edicion_global_id, taller_id)).
--
-- Validations:
--   - La global y el taller deben existir.
--   - Si el taller ya está en OTRA global con estado='abierto' Y el
--     caller NO tiene admin.manage → warning surfaced via RAISE NOTICE
--     (no bloquea — el admin con director.write puede igualmente
--     agregar; el warning lo ve en el log).
--
-- Returns: jsonb {edicion_global_id, taller_id, added: bool, warning: text|null}

CREATE OR REPLACE FUNCTION public.add_taller_to_edicion_global(
  p_edicion_global_id uuid,
  p_taller_id         uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id   uuid;
  v_cap_ok    boolean;
  v_admin_ok  boolean;
  v_global_exists boolean;
  v_taller_exists boolean;
  v_existe_en_otra integer;
  v_other_slug text;
  v_added      boolean := false;
  v_warning    text := NULL;
BEGIN
  -- Capability gate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  v_cap_ok := public.auth_has_talleres_capability('talleres_crecimiento.director.write')
              OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage');
  IF NOT v_cap_ok THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage'
      USING ERRCODE = '42501';
  END IF;

  v_admin_ok := public.auth_has_talleres_capability('talleres_crecimiento.admin.manage');

  -- Validate both exist
  SELECT EXISTS (
    SELECT 1 FROM public.taller_ediciones_globales WHERE id = p_edicion_global_id
  ) INTO v_global_exists;
  IF NOT v_global_exists THEN
    RAISE EXCEPTION 'EDICION_GLOBAL_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.talleres WHERE id = p_taller_id
  ) INTO v_taller_exists;
  IF NOT v_taller_exists THEN
    RAISE EXCEPTION 'TALLER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Warning si el taller ya está en otra global ABIERTA y el caller
  -- no tiene admin.manage. No bloquea — superficie informativa.
  IF NOT v_admin_ok THEN
    SELECT count(*), max(g.slug)
        INTO v_existe_en_otra, v_other_slug
      FROM public.taller_edicion_global_participantes p
      JOIN public.taller_ediciones_globales g ON g.id = p.edicion_global_id
     WHERE p.taller_id = p_taller_id
       AND g.estado = 'abierto'
       AND g.id <> p_edicion_global_id;

    IF v_existe_en_otra > 0 THEN
      v_warning := format(
        'TALLER_EN_OTRA_GLOBAL_ABIERTA: el taller ya participa en %s (estado=abierto)',
        v_other_slug
      );
      RAISE NOTICE '%', v_warning;
    END IF;
  END IF;

  -- Insert (idempotente por UNIQUE constraint)
  WITH inserted AS (
    INSERT INTO public.taller_edicion_global_participantes (
      edicion_global_id, taller_id
    )
    VALUES (p_edicion_global_id, p_taller_id)
    ON CONFLICT (edicion_global_id, taller_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) > 0 INTO v_added FROM inserted;

  RETURN jsonb_build_object(
    'edicion_global_id', p_edicion_global_id,
    'taller_id', p_taller_id,
    'added', v_added,
    'warning', v_warning
  );
END;
$func$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 6) remove_taller_from_edicion_global                            ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Saca un taller de una edición global. Solo permitido si la global
-- está en estado='borrador' (no se puede modificar la composición de
-- una edición ya abierta — esa decisión se toma al abrir).
--
-- Returns: jsonb {edicion_global_id, taller_id, removed: bool}

CREATE OR REPLACE FUNCTION public.remove_taller_from_edicion_global(
  p_edicion_global_id uuid,
  p_taller_id         uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id   uuid;
  v_cap_ok    boolean;
  v_estado    text;
  v_removed   boolean := false;
BEGIN
  -- Capability gate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  v_cap_ok := public.auth_has_talleres_capability('talleres_crecimiento.director.write')
              OR public.auth_has_talleres_capability('talleres_crecimiento.admin.manage');
  IF NOT v_cap_ok THEN
    RAISE EXCEPTION 'FORBIDDEN: requires director.write or admin.manage'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the global row para chequear estado de forma consistente.
  SELECT estado INTO v_estado
    FROM public.taller_ediciones_globales
   WHERE id = p_edicion_global_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EDICION_GLOBAL_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_estado <> 'borrador' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: actual=%, expected=borrador (no se puede modificar la composicion de una edicion ya abierta)',
      v_estado
      USING ERRCODE = '22023';
  END IF;

  -- Delete from junction
  WITH deleted AS (
    DELETE FROM public.taller_edicion_global_participantes
     WHERE edicion_global_id = p_edicion_global_id
       AND taller_id = p_taller_id
     RETURNING 1
  )
  SELECT count(*) > 0 INTO v_removed FROM deleted;

  RETURN jsonb_build_object(
    'edicion_global_id', p_edicion_global_id,
    'taller_id', p_taller_id,
    'removed', v_removed
  );
END;
$func$;

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 7) Grants                                                       ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Todas las RPCs son SECURITY DEFINER → accesibles via supabase.rpc()
-- desde clientes con rol 'authenticated' que pasen el capability gate.

GRANT EXECUTE ON FUNCTION public.create_edicion_global(text, text, text, timestamptz, timestamptz, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_edicion_global(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_edicion_global(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_edicion_global(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_taller_to_edicion_global(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_taller_from_edicion_global(uuid, uuid) TO authenticated;