-- Reconcile global staging Task 2.2 follow-up hardening.
-- Staging applied this as a separate migration after direct anon EXECUTE was observed.
-- Keep it checked in so repository migration history maps to staging evidence.

REVOKE ALL ON FUNCTION public.puede_ver_casa_anfitriona(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.puede_crear_casa_anfitriona_para(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.puede_aprobar_casa_anfitriona(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.puede_editar_casa_anfitriona(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.puede_cambiar_estado_casa_anfitriona(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.obtener_permisos_casa_anfitriona(uuid, uuid) FROM anon;
