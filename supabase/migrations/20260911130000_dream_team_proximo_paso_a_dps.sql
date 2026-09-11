-- Paso C — Próximo Paso pasa a DPS.
--
-- ── DECISIÓN ───────────────────────────────────────────────────────────
-- Confirmada por el usuario: Próximo Paso lo administra DPS. El seed del
-- Paso 2 (20260910130000) lo había colgado de Conexión → Grupos de Corto Plazo
-- por supuesto, no por decisión.
--
-- Sigue siendo un taller —clases, asistencia, certificado—, así que conserva
-- `experiencia = 'talleres_crecimiento'` y sus cuatro roles, incluido
-- `director`, que usa el flujo de talleres (ver la excepción de vocabulario de
-- roles en el seed). Qué tipo de cosa es y quién la administra son dos datos
-- distintos: el primero es `experiencia`; el segundo, de qué nodo cuelga.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────
-- Una sola mutación: `parent_equipo_id` de Próximo Paso pasa de "Grupos de
-- Corto Plazo" a "DPS". El id del nodo no cambia, así que nada se rompe:
--   · servicios, roles, requisitos y cohortes de talleres apuntan al id;
--   · los grants acotados a Próximo Paso (scope_id = su id) siguen valiendo.
-- La autoridad por árbol se mueve sola: DPS y la Dirección de Experiencia
-- pasan a alcanzarlo; Conexión y Grupos de Corto Plazo dejan de hacerlo. Los
-- chequeos de talleres por equipo (auth_has_talleres_capability_scoped) miran
-- el nodo exacto, no el árbol: no cambian.
--
-- Consecuencia visible: la directora de DPS pasa a ver a quien sirve en
-- Próximo Paso. Es lo decidido. La prueba negativa sigue teniendo gente real:
-- en Conexión quedan servidores que ella no alcanza.
--
-- Lo que todavía NO hace: que las operaciones de talleres (ediciones, clases,
-- inscripciones) obedezcan al árbol. Eso es el paso E1.
--
-- ── IDENTIFICACIÓN ─────────────────────────────────────────────────────
-- Por etiqueta y padre, igual que el seed, sin ids fijos. Sólo se mueve el
-- Próximo Paso que cuelga de "Grupos de Corto Plazo"; si ya cuelga de DPS, o
-- falta alguno de los nodos, no hace nada. Idempotente. El trigger
-- dream_team_equipos_prevent_cycle y el índice único (parent_equipo_id, label)
-- siguen cuidando la forma del árbol.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- Una fila de dream_team_equipos. Cero impacto sobre Grupos de Vida.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────
--   update public.dream_team_equipos pp
--   set parent_equipo_id = gcp.id, updated_at = now()
--   from public.dream_team_equipos gcp, public.dream_team_equipos dps
--   where pp.label = 'Próximo Paso'
--     and pp.parent_equipo_id = dps.id
--     and dps.label = 'DPS'
--     and gcp.label = 'Grupos de Corto Plazo';

update public.dream_team_equipos pp
set parent_equipo_id = dps.id,
    updated_at = now()
from public.dream_team_equipos gcp,
     public.dream_team_equipos dps
join public.dream_team_equipos experiencia on experiencia.id = dps.parent_equipo_id
where pp.label = 'Próximo Paso'
  and pp.experiencia = 'talleres_crecimiento'
  and pp.parent_equipo_id = gcp.id
  and gcp.label = 'Grupos de Corto Plazo'
  and dps.label = 'DPS'
  and experiencia.label = 'Dirección de Experiencia'
  and experiencia.parent_equipo_id is null;
