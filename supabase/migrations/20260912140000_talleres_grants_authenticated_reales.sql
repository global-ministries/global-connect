-- Los permisos de tabla que producción ya tiene y el repositorio nunca escribió.
--
-- ── PROBLEMA ───────────────────────────────────────────────────────────
-- Una consulta pasa por dos capas, en este orden: primero el GRANT de tabla
-- —¿este rol puede tocarla?—, después la política RLS —¿cuáles filas?—. Sin
-- grant la consulta muere con `42501: permission denied` antes de que se
-- evalúe una sola política.
--
-- Las migraciones del dominio de talleres sólo conceden a `service_role`, y a
-- `authenticated` únicamente le REVOCAN:
--
--   20260810130000:287  revoke all on table … from anon, authenticated;
--   20260810130000:335  grant select, insert, update, delete … to service_role;
--
-- El grant para `authenticated` se aplicó a mano sobre producción cuando la
-- pantalla de detalle mostraba "Ediciones (0)" mientras SQL directo devolvía
-- tres. 20260813000004 —`grant_authenticated_talleres_domain`— existe para
-- registrarlo y no lo registra: su encabezado dice "applied directly to prod
-- via the supabase_global apply_migration tool … it does NOT run as part of
-- the normal supabase migration sequence" y su cuerpo entero es `SELECT 1;`.
-- El archivo documenta el arreglo; no lo contiene.
--
-- Resultado: un reset desde cero deja las 18 tablas del dominio sin un solo
-- permiso para `authenticated`, y con RLS activa. Cada `.from('taller_…')` de
-- cada pantalla y cada route handler devuelve `permission denied`. El código
-- de las páginas usa `data ?? []`, así que no se ve un error: se ven listas
-- vacías. La aplicación arranca y no muestra nada.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────
-- Concede a `authenticated` exactamente lo que producción tiene hoy, tabla por
-- tabla. No es un conjunto uniforme y por eso no se escribe como uno: se
-- verificó contra producción con `information_schema.role_table_grants` y
-- contra `pg_class.relacl`, y hay dos formas distintas.
--
-- Catorce tablas tienen las cuatro operaciones de fila:
--
--   taller_asistencias              taller_periodos_generales
--   taller_catalogo_etiquetas       taller_reporte_correcciones
--   taller_certificados             taller_reportes
--   taller_ediciones                taller_sesiones
--   taller_eventos                  taller_solicitudes_retiro
--   taller_grupo_asignaciones       talleres_crecimiento_cohortes
--   taller_grupos
--   taller_inscripciones
--
-- Cuatro tienen además REFERENCES, TRIGGER y TRUNCATE —las siete de `ALL` en
-- Postgres 15—, porque se les aplicó `GRANT ALL` y no la lista de cuatro:
--
--   talleres                        talleres_temporada_talleres
--   talleres_role_capability_map    talleres_temporadas
--
-- Las siete se escriben enumeradas y no como `GRANT ALL`. `ALL` significa "lo
-- que esta versión de Postgres considere todo", y en 17 eso ya incluye
-- MAINTAIN: reproduciría un permiso que producción no tiene. Enumerar dice lo
-- que se verificó.
--
-- No hace falta guard. `GRANT` sobre un permiso que ya está concedido es un
-- no-op en Postgres, así que en producción y en staging esta migración se
-- aplica y no cambia nada.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- Cero en producción y cero en staging: los 126 permisos ya están ahí, uno por
-- uno, y volver a concederlos no los altera. En un reset desde cero el efecto
-- es que el dominio de talleres empieza a responder. El alcance por fila sigue
-- siendo el de las políticas RLS, que esta migración no toca: el grant abre la
-- tabla, la política decide las filas.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────
--   revoke all on table public.<tabla> from authenticated;
-- para cada una de las 18. Contra producción eso reproduce el bug original
-- —listas vacías en todas las pantallas de talleres—, así que el rollback real
-- de esta migración es no tenerla.

-- ── Las catorce con las cuatro operaciones de fila ──────────────────────
grant select, insert, update, delete on table public.taller_asistencias to authenticated;
grant select, insert, update, delete on table public.taller_catalogo_etiquetas to authenticated;
grant select, insert, update, delete on table public.taller_certificados to authenticated;
grant select, insert, update, delete on table public.taller_ediciones to authenticated;
grant select, insert, update, delete on table public.taller_eventos to authenticated;
grant select, insert, update, delete on table public.taller_grupo_asignaciones to authenticated;
grant select, insert, update, delete on table public.taller_grupos to authenticated;
grant select, insert, update, delete on table public.taller_inscripciones to authenticated;
grant select, insert, update, delete on table public.taller_periodos_generales to authenticated;
grant select, insert, update, delete on table public.taller_reporte_correcciones to authenticated;
grant select, insert, update, delete on table public.taller_reportes to authenticated;
grant select, insert, update, delete on table public.taller_sesiones to authenticated;
grant select, insert, update, delete on table public.taller_solicitudes_retiro to authenticated;
grant select, insert, update, delete on table public.talleres_crecimiento_cohortes to authenticated;

-- ── Las cuatro con las siete ────────────────────────────────────────────
grant select, insert, update, delete, references, trigger, truncate on table public.talleres to authenticated;
grant select, insert, update, delete, references, trigger, truncate on table public.talleres_role_capability_map to authenticated;
grant select, insert, update, delete, references, trigger, truncate on table public.talleres_temporada_talleres to authenticated;
grant select, insert, update, delete, references, trigger, truncate on table public.talleres_temporadas to authenticated;
