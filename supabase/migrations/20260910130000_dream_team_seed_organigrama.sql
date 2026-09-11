-- Paso 2 — Dream Team: sembrar el organigrama real de la iglesia.
--
-- ── QUÉ SIEMBRA ────────────────────────────────────────────────────────
-- El árbol vive en `dream_team_equipos.parent_equipo_id` (autorreferenciada).
-- No se crea ninguna tabla nueva: la estructura ya tenía la forma correcta,
-- sólo estaba vacía y era de solo lectura hasta el Paso 1.
--
--   Dirección de Grupos de Vida            [grupos_vida]
--   Dirección de Conexión                  [talleres_crecimiento]
--     └ Grupos de Corto Plazo
--         ├ Próximo Paso · Punto de Partida · Mujer de Hoy
--         └ (los equipos de taller que ya existían, re-parentados)
--   Dirección de Experiencia               [experiencia]
--     ├ DPS                                [dps]
--     │   ├ Producción Técnica → Cámaras · Sonido · Teleprompter
--     │   └ Media · Redes Sociales · Producción Creativa
--     │     · Atención al Invitado · Bautizos · Banda Musical
--     ├ Dirección de Estudiantes           [estudiantes] → Transit · Inside Out
--     ├ Dirección de Niños                 [ninos] → Waumba Land · Upstreet
--     └ Dream Team                         [dream_team]
--   Dirección de Atracción                 [atraccion]              INACTIVA
--   Dirección de Servicios Ministeriales   [servicios_ministeriales] INACTIVA
--
-- ── DÓNDE SE SIRVE vs DÓNDE SE ADMINISTRA ──────────────────────────────
-- Decisión de negocio confirmada, y es la que sostiene el aislamiento entre
-- direcciones: los servicios cuelgan SIEMPRE del área operativa real. El
-- camarógrafo cuelga de "Cámaras", el maestro de "Upstreet". Su
-- `dream_team_servicios.equipo_id` apunta a su nodo funcional.
--
-- El nodo "Dream Team" NO contiene a los voluntarios de la iglesia: contiene
-- únicamente al equipo humano que administra el voluntariado (onboarding y
-- orientación). Si contuviera a todos, el Director de Experiencia heredaría
-- sobre ellos al caminar el árbol en el Paso 3, y vería voluntarios de Conexión
-- y de Grupos de Vida — justo lo que el modelo debe impedir.
--
-- La autoridad transversal de la persona a cargo de Dream Team NO viaja por el
-- árbol: se expresa con un grant de `scope_id IS NULL`, que la función
-- jerárquica del Paso 3 acepta como alcance global.
--
-- ── CLAVES DE EXPERIENCIA ──────────────────────────────────────────────
-- Una clave por Dirección de Línea 1, no `dream_team` en todas las cabeceras:
-- `experiencia` alimenta `resolveExperienceSpecificCapability()`, que decide qué
-- capability de dominio se acuña cuando alguien pasa a activo. Estampar
-- `dream_team` sobre Grupos de Vida le daría a sus líderes capacidades del
-- mundo equivocado.
--
-- Conexión reutiliza `talleres_crecimiento` en vez de estrenar una clave
-- `conexion`: esa clave ya está viva, con trece capacidades, políticas RLS y un
-- caso propio en el resolvedor. Una segunda clave para el mismo mundo sería la
-- duplicación que este rediseño vino a eliminar.
--
-- `experiencia`, `atraccion` y `servicios_ministeriales` son claves nuevas y
-- deben existir también en `PLATFORM_EXPERIENCE_CATALOG`: `normalizeScope()`
-- falla CERRADO ante una experiencia que no esté en el catálogo, así que base y
-- catálogo tipado quedan atados.
--
-- ── VOCABULARIO DE ROLES POR NIVEL ─────────────────────────────────────
--   nivel 0 y 1 (Direcciones y Áreas) → director, coordinador
--   nivel 2+    (equipos operativos)  → coordinador, lider, voluntario
--   excepción: todo lo que cuelga de "Grupos de Corto Plazo" lleva ADEMÁS
--   `director`, porque el flujo de talleres ya vivo lo usa —
--   `talleres_role_capability_map` lo mapea y la tarjeta de asignación ofrece
--   "Director (del taller)". La excepción está justificada por comportamiento
--   existente, no por gusto.
--
-- Las etiquetas van en minúscula sin tilde, igual que los roles ya sembrados.
-- La forma visible ("Coordinador", "Líder") la resuelve la interfaz.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- Aditiva, forward-only, idempotente (todo insert va con WHERE NOT EXISTS, y
-- los índices únicos del Paso 1 son la red de seguridad). No borra ni renombra
-- nada. La única mutación de filas existentes es re-parentar los equipos de
-- taller que hoy son raíces sueltas: `parent_equipo_id` pasa de NULL al nodo
-- "Grupos de Corto Plazo". Eso no toca ninguna FK — `talleres_crecimiento_cohortes`
-- apunta a `dream_team_equipos.id`, que no cambia. Sin re-parentarlos, caminar
-- el árbol desde una cohorte nunca llegaría a la Dirección de Conexión.
--
-- Cero impacto sobre Grupos de Vida: no se toca `roles_sistema`, `usuario_roles`,
-- `grupos`, `grupo_miembros` ni `segmento_lideres`. El nodo de Grupos de Vida se
-- crea vacío; sus líderes entran por la vista de solo lectura del Paso 5.

-- ── Nivel 0 · Direcciones de Línea 1 ───────────────────────────────────
insert into public.dream_team_equipos (experiencia, parent_equipo_id, label, activo)
select v.experiencia, null::uuid, v.label, v.activo
from (values
  ('grupos_vida',             'Dirección de Grupos de Vida',          true),
  ('talleres_crecimiento',    'Dirección de Conexión',                true),
  ('experiencia',             'Dirección de Experiencia',             true),
  ('atraccion',               'Dirección de Atracción',               false),
  ('servicios_ministeriales', 'Dirección de Servicios Ministeriales', false)
) as v(experiencia, label, activo)
where not exists (
  select 1 from public.dream_team_equipos e
  where e.parent_equipo_id is null and e.label = v.label
);

-- ── Nivel 1 · Áreas ────────────────────────────────────────────────────
insert into public.dream_team_equipos (experiencia, parent_equipo_id, label, activo)
select v.experiencia, p.id, v.label, true
from (values
  ('talleres_crecimiento', 'Grupos de Corto Plazo',    'Dirección de Conexión'),
  ('dps',                  'DPS',                      'Dirección de Experiencia'),
  ('estudiantes',          'Dirección de Estudiantes', 'Dirección de Experiencia'),
  ('ninos',                'Dirección de Niños',       'Dirección de Experiencia'),
  ('dream_team',           'Dream Team',               'Dirección de Experiencia')
) as v(experiencia, label, parent_label)
join public.dream_team_equipos p
  on p.parent_equipo_id is null and p.label = v.parent_label
where not exists (
  select 1 from public.dream_team_equipos e
  where e.parent_equipo_id = p.id and e.label = v.label
);

-- ── Re-parentar los equipos de taller preexistentes ────────────────────
-- Antes de este seed eran raíces sueltas (parent_equipo_id IS NULL). Se cuelgan
-- de "Grupos de Corto Plazo" para que el recorrido de ancestros llegue hasta la
-- Dirección de Conexión. No se les cambia el nombre: sus etiquetas son las
-- reales del negocio y están referenciadas por cohortes vivas.
update public.dream_team_equipos e
set parent_equipo_id = gcp.id,
    updated_at = now()
from public.dream_team_equipos gcp
join public.dream_team_equipos con
  on con.id = gcp.parent_equipo_id
 and con.parent_equipo_id is null
 and con.label = 'Dirección de Conexión'
where gcp.label = 'Grupos de Corto Plazo'
  and e.parent_equipo_id is null
  and e.experiencia = 'talleres_crecimiento'
  and e.id <> con.id;

-- ── Nivel 2 · Equipos operativos ───────────────────────────────────────
insert into public.dream_team_equipos (experiencia, parent_equipo_id, label, activo)
select v.experiencia, p.id, v.label, true
from (values
  ('talleres_crecimiento', 'Próximo Paso',         'Grupos de Corto Plazo'),
  ('talleres_crecimiento', 'Punto de Partida',     'Grupos de Corto Plazo'),
  ('talleres_crecimiento', 'Mujer de Hoy',         'Grupos de Corto Plazo'),
  ('dps',                  'Producción Técnica',   'DPS'),
  ('dps',                  'Media',                'DPS'),
  ('dps',                  'Redes Sociales',       'DPS'),
  ('dps',                  'Producción Creativa',  'DPS'),
  ('dps',                  'Atención al Invitado', 'DPS'),
  ('dps',                  'Bautizos',             'DPS'),
  ('dps',                  'Banda Musical',        'DPS'),
  ('estudiantes',          'Transit',              'Dirección de Estudiantes'),
  ('estudiantes',          'Inside Out',           'Dirección de Estudiantes'),
  ('ninos',                'Waumba Land',          'Dirección de Niños'),
  ('ninos',                'Upstreet',             'Dirección de Niños')
) as v(experiencia, label, parent_label)
join public.dream_team_equipos p
  on p.label = v.parent_label and p.parent_equipo_id is not null
where not exists (
  select 1 from public.dream_team_equipos e
  where e.parent_equipo_id = p.id and e.label = v.label
);

-- ── Nivel 3 · Puestos dentro de Producción Técnica ─────────────────────
insert into public.dream_team_equipos (experiencia, parent_equipo_id, label, activo)
select v.experiencia, p.id, v.label, true
from (values
  ('dps', 'Cámaras',      'Producción Técnica'),
  ('dps', 'Sonido',       'Producción Técnica'),
  ('dps', 'Teleprompter', 'Producción Técnica')
) as v(experiencia, label, parent_label)
join public.dream_team_equipos p
  on p.label = v.parent_label and p.parent_equipo_id is not null
where not exists (
  select 1 from public.dream_team_equipos e
  where e.parent_equipo_id = p.id and e.label = v.label
);

-- ── Roles · vocabulario por nivel ──────────────────────────────────────
with recursive arbol as (
  select e.id,
         e.parent_equipo_id,
         e.label,
         0 as nivel,
         (e.label = 'Grupos de Corto Plazo') as bajo_corto_plazo
  from public.dream_team_equipos e
  where e.parent_equipo_id is null
  union all
  select e.id,
         e.parent_equipo_id,
         e.label,
         a.nivel + 1,
         a.bajo_corto_plazo or e.label = 'Grupos de Corto Plazo'
  from public.dream_team_equipos e
  join arbol a on e.parent_equipo_id = a.id
),
vocabulario as (
  select a.id as equipo_id, r.label
  from arbol a
  cross join lateral unnest(
    case
      when a.nivel <= 1        then array['director', 'coordinador']
      when a.bajo_corto_plazo  then array['director', 'coordinador', 'lider', 'voluntario']
      else                          array['coordinador', 'lider', 'voluntario']
    end
  ) as r(label)
)
insert into public.dream_team_roles (equipo_id, label, activo)
select v.equipo_id, v.label, true
from vocabulario v
where not exists (
  select 1 from public.dream_team_roles x
  where x.equipo_id = v.equipo_id and x.label = v.label
);
