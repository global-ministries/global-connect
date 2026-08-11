-- PR7 — DT-025..028 — Taller sessions, attendance, append-only corrections,
-- completed-group resource snapshots, and scoped RLS.
-- Additive only: no destructive DDL (I-6).

CREATE TABLE IF NOT EXISTS public.taller_sesiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.taller_grupos(id) ON DELETE RESTRICT,
  numero integer NOT NULL CHECK (numero > 0),
  fecha_programada date NOT NULL,
  fecha_realizada date,
  meeting_time_override time,
  meeting_time_applies_to text CHECK (
    meeting_time_applies_to IS NULL OR
    meeting_time_applies_to IN ('this_session', 'this_and_subsequent')
  ),
  estado text NOT NULL DEFAULT 'programada' CHECK (
    estado IN ('programada', 'en_curso', 'cerrada', 'cancelada')
  ),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT taller_sesiones_grupo_numero_unique UNIQUE (grupo_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_taller_sesiones_grupo_estado
  ON public.taller_sesiones (grupo_id, estado)
  WHERE estado IN ('programada', 'en_curso');
CREATE INDEX IF NOT EXISTS idx_taller_sesiones_fecha_programada
  ON public.taller_sesiones (fecha_programada)
  WHERE estado NOT IN ('cerrada', 'cancelada');
CREATE INDEX IF NOT EXISTS idx_taller_sesiones_fecha_realizada
  ON public.taller_sesiones (fecha_realizada)
  WHERE fecha_realizada IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.taller_asistencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id uuid NOT NULL REFERENCES public.taller_sesiones(id) ON DELETE RESTRICT,
  inscripcion_id uuid NOT NULL REFERENCES public.taller_inscripciones(id) ON DELETE RESTRICT,
  persona_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  estado text NOT NULL CHECK (estado IN ('presente', 'ausente', 'no_aplica')),
  correccion_de_asistencia_id uuid REFERENCES public.taller_asistencias(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT taller_asistencias_sesion_inscripcion_unique UNIQUE (sesion_id, inscripcion_id)
);

CREATE INDEX IF NOT EXISTS idx_taller_asistencias_sesion
  ON public.taller_asistencias (sesion_id, inscripcion_id);
CREATE INDEX IF NOT EXISTS idx_taller_asistencias_persona
  ON public.taller_asistencias (persona_id, sesion_id);

CREATE OR REPLACE FUNCTION public.set_taller_sesiones_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.taller_asistencias_immutable_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado = NEW.estado
     AND OLD.correccion_de_asistencia_id IS NOT DISTINCT FROM NEW.correccion_de_asistencia_id THEN
    RETURN NEW;
  END IF;

  IF NEW.correccion_de_asistencia_id IS NULL
     OR NEW.correccion_de_asistencia_id <> OLD.id
     OR OLD.correccion_de_asistencia_id IS NOT NULL THEN
    RAISE EXCEPTION 'taller_asistencias append-only: corrections must reference the prior row (NEW.correccion_de_asistencia_id = OLD.id) and the prior row must be the original record, not a prior correction. Use INSERT for append.';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.taller_grupos_capture_recursos_snapshot()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  snapshot jsonb;
BEGIN
  IF pg_trigger_depth() < 1
     AND OLD.estado IS DISTINCT FROM NEW.estado
     AND NEW.estado = 'completado'
     AND NEW.recursos_snapshot IS NULL THEN
    SELECT jsonb_build_object(
      'leaders_activos', COUNT(*) FILTER (WHERE a.rol = 'lider'),
      'voluntarios_activos', COUNT(*) FILTER (WHERE a.rol = 'voluntario'),
      'inscripciones_count', (
        SELECT COUNT(*) FROM public.taller_inscripciones i
        JOIN public.talleres_crecimiento_cohortes c ON c.id = i.cohorte_id
        WHERE c.id = (SELECT cohorte_id FROM public.taller_grupos WHERE id = NEW.id)
      ),
      'asistencia_total', (
        SELECT COUNT(*) FROM public.taller_asistencias ta
        JOIN public.taller_sesiones ts ON ts.id = ta.sesion_id
        WHERE ts.grupo_id = NEW.id AND ta.estado = 'presente'
      )
    ) INTO snapshot
    FROM public.taller_grupo_asignaciones a
    WHERE a.grupo_id = NEW.id AND a.activo = true;

    UPDATE public.taller_grupos
       SET recursos_snapshot = snapshot, completed_at = now()
     WHERE id = NEW.id AND recursos_snapshot IS NULL;
  END IF;
  RETURN NEW;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_taller_sesiones_updated_at') THEN
    CREATE TRIGGER trg_taller_sesiones_updated_at
      BEFORE UPDATE ON public.taller_sesiones FOR EACH ROW
      EXECUTE FUNCTION public.set_taller_sesiones_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_taller_asistencias_immutable_update') THEN
    CREATE TRIGGER trg_taller_asistencias_immutable_update
      BEFORE UPDATE ON public.taller_asistencias FOR EACH ROW
      EXECUTE FUNCTION public.taller_asistencias_immutable_update();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_taller_asistencias_updated_at') THEN
    CREATE TRIGGER trg_taller_asistencias_updated_at
      BEFORE UPDATE ON public.taller_asistencias FOR EACH ROW
      EXECUTE FUNCTION public.set_taller_sesiones_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_taller_grupos_capture_recursos_snapshot') THEN
    CREATE TRIGGER trg_taller_grupos_capture_recursos_snapshot
      AFTER UPDATE OF estado ON public.taller_grupos FOR EACH ROW
      EXECUTE FUNCTION public.taller_grupos_capture_recursos_snapshot();
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.taller_sesiones_validate_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado <> 'programada' THEN
    RAISE EXCEPTION 'taller_sesiones: new sessions must start as programada';
  END IF;
  IF NEW.numero > 1 AND NOT EXISTS (
    SELECT 1 FROM public.taller_sesiones
    WHERE grupo_id = NEW.grupo_id AND numero = NEW.numero - 1
  ) THEN
    RAISE EXCEPTION 'taller_sesiones: sessions must progress sequentially';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.taller_sesiones_validate_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.fecha_programada IS DISTINCT FROM OLD.fecha_programada
     AND EXISTS (
       SELECT 1 FROM public.taller_sesiones later
       WHERE later.grupo_id = OLD.grupo_id
         AND later.numero > OLD.numero
         AND later.meeting_time_override IS NOT NULL
         AND later.meeting_time_applies_to = 'this_and_subsequent'
     ) THEN
    RAISE EXCEPTION 'taller_sesiones: previous sessions are immutable after a subsequent override';
  END IF;
  RETURN NEW;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_taller_sesiones_validate_insert') THEN
    CREATE TRIGGER trg_taller_sesiones_validate_insert
      BEFORE INSERT ON public.taller_sesiones FOR EACH ROW
      EXECUTE FUNCTION public.taller_sesiones_validate_insert();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_taller_sesiones_validate_update') THEN
    CREATE TRIGGER trg_taller_sesiones_validate_update
      BEFORE UPDATE ON public.taller_sesiones FOR EACH ROW
      EXECUTE FUNCTION public.taller_sesiones_validate_update();
  END IF;
END
$$;

ALTER TABLE public.taller_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taller_asistencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.taller_sesiones, public.taller_asistencias FROM anon, authenticated;

CREATE POLICY taller_sesiones_select ON public.taller_sesiones FOR SELECT USING (
  auth_has_talleres_capability('talleres_crecimiento.director.read') OR
  auth_has_talleres_capability('talleres_crecimiento.coordinator.read') OR
  auth_has_talleres_capability('talleres_crecimiento.lead.read') OR
  auth_has_talleres_capability('talleres_crecimiento.volunteer.read') OR
  auth_has_talleres_capability('talleres_crecimiento.participation.read') OR
  auth_has_talleres_capability('talleres_crecimiento.metrics.read') OR
  auth_has_talleres_capability('talleres_crecimiento.admin.manage')
);
CREATE POLICY taller_sesiones_insert ON public.taller_sesiones FOR INSERT WITH CHECK (
  auth_has_talleres_capability('talleres_crecimiento.director.write') OR
  auth_has_talleres_capability('talleres_crecimiento.coordinator.write') OR
  auth_has_talleres_capability('talleres_crecimiento.lead.write') OR
  auth_has_talleres_capability('talleres_crecimiento.admin.manage')
);
CREATE POLICY taller_sesiones_update ON public.taller_sesiones FOR UPDATE USING (
  auth_has_talleres_capability('talleres_crecimiento.director.write') OR
  auth_has_talleres_capability('talleres_crecimiento.coordinator.write') OR
  auth_has_talleres_capability('talleres_crecimiento.lead.write') OR
  auth_has_talleres_capability('talleres_crecimiento.admin.manage')
) WITH CHECK (true);
CREATE POLICY taller_sesiones_delete ON public.taller_sesiones FOR DELETE USING (false);

CREATE POLICY taller_asistencias_select ON public.taller_asistencias FOR SELECT USING (
  auth_has_talleres_capability('talleres_crecimiento.director.read') OR
  auth_has_talleres_capability('talleres_crecimiento.coordinator.read') OR
  auth_has_talleres_capability('talleres_crecimiento.lead.write') OR
  auth_has_talleres_capability('talleres_crecimiento.participation.read')
);
CREATE POLICY taller_asistencias_insert ON public.taller_asistencias FOR INSERT WITH CHECK (
  auth_has_talleres_capability('talleres_crecimiento.director.write') OR
  auth_has_talleres_capability('talleres_crecimiento.coordinator.write') OR
  auth_has_talleres_capability('talleres_crecimiento.lead.write') OR
  auth_has_talleres_capability('talleres_crecimiento.admin.manage')
);
CREATE POLICY taller_asistencias_update ON public.taller_asistencias FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY taller_asistencias_delete ON public.taller_asistencias FOR DELETE USING (false);

GRANT SELECT, INSERT, UPDATE ON TABLE public.taller_sesiones TO service_role;
GRANT SELECT, INSERT ON TABLE public.taller_asistencias TO service_role;
