SET search_path = public;

-- Tabla de auditoría para grupo_miembros
CREATE TABLE IF NOT EXISTS public.audit_grupo_miembros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  happened_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL CHECK (action IN ('CREATE','UPDATE','DELETE')),
  grupo_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  actor_auth_id uuid,
  actor_usuario_id uuid,
  old_data jsonb,
  new_data jsonb
);

COMMENT ON TABLE public.audit_grupo_miembros IS 'Auditoría de altas/cambios/bajas de miembros de grupo';

-- Función trigger que registra auditoría usando la variable de sesión auth.uid si existe
CREATE OR REPLACE FUNCTION public.tr_audit_grupo_miembros()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auth_id uuid;
  v_actor_usuario_id uuid;
BEGIN
  BEGIN
    v_auth_id := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  EXCEPTION WHEN others THEN
    v_auth_id := NULL;
  END;

  IF v_auth_id IS NOT NULL THEN
    SELECT u.id INTO v_actor_usuario_id FROM public.usuarios u WHERE u.auth_id = v_auth_id;
  END IF;

  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.audit_grupo_miembros(action, grupo_id, usuario_id, actor_auth_id, actor_usuario_id, old_data, new_data)
    VALUES ('CREATE', NEW.grupo_id, NEW.usuario_id, v_auth_id, v_actor_usuario_id, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.audit_grupo_miembros(action, grupo_id, usuario_id, actor_auth_id, actor_usuario_id, old_data, new_data)
    VALUES ('UPDATE', NEW.grupo_id, NEW.usuario_id, v_auth_id, v_actor_usuario_id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.audit_grupo_miembros(action, grupo_id, usuario_id, actor_auth_id, actor_usuario_id, old_data, new_data)
    VALUES ('DELETE', OLD.grupo_id, OLD.usuario_id, v_auth_id, v_actor_usuario_id, to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_audit_grupo_miembros_ins ON public.grupo_miembros;
DROP TRIGGER IF EXISTS tg_audit_grupo_miembros_upd ON public.grupo_miembros;
DROP TRIGGER IF EXISTS tg_audit_grupo_miembros_del ON public.grupo_miembros;

CREATE TRIGGER tg_audit_grupo_miembros_ins
AFTER INSERT ON public.grupo_miembros
FOR EACH ROW EXECUTE FUNCTION public.tr_audit_grupo_miembros();

CREATE TRIGGER tg_audit_grupo_miembros_upd
AFTER UPDATE ON public.grupo_miembros
FOR EACH ROW EXECUTE FUNCTION public.tr_audit_grupo_miembros();

CREATE TRIGGER tg_audit_grupo_miembros_del
AFTER DELETE ON public.grupo_miembros
FOR EACH ROW EXECUTE FUNCTION public.tr_audit_grupo_miembros();
