-- Paso 4.2 — Dream Team: llevar el alcance jerárquico a las políticas RLS.
--
-- ── PROBLEMA, Y ES UNA CORRECCIÓN DEL PASO 1 ───────────────────────────
-- La migración 20260910120000 ensanchó las políticas SELECT de equipos y roles
-- con términos del dominio Dream Team, pero los escribió con el gate PLANO:
--
--   auth_has_dream_team_capability('dream_team.director.coordinate')
--
-- Ese gate no tiene predicado de alcance. Un Director de DPS con la capacidad
-- acotada al nodo DPS pasaba ese término para CUALQUIER fila — incluidos los
-- equipos de Conexión y de Grupos de Vida. La función jerárquica del Paso 3
-- existía, pero ninguna política la usaba, así que el aislamiento vivía sólo en
-- la capa de aplicación. Una llamada directa a la API lo esquivaba.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────
--   1. Reemplaza cada término plano del dominio Dream Team por su equivalente
--      jerárquico. Un grant con `scope_id NULL` sigue siendo global — la propia
--      función lo resuelve en su primera rama — así que nadie pierde acceso.
--   2. Suma términos jerárquicos a `dream_team_servicios`, que hasta ahora sólo
--      tenía términos de talleres: sin esto un Director de DPS no ve a su gente.
--   3. Suma lectura propia sobre `dream_team_servicios`: un voluntario debe poder
--      ver su propia ficha aunque no tenga capacidad sobre ningún equipo.
--
-- Los SIETE términos `talleres_crecimiento.*` se conservan TEXTUALMENTE en todas
-- las políticas donde ya estaban. El flujo de talleres validado en staging no
-- cambia de comportamiento.
--
-- ── POR QUÉ EL INSERT DE EQUIPOS MIRA AL PADRE ─────────────────────────
-- En un `WITH CHECK` de INSERT la fila todavía no existe en la tabla, así que un
-- recorrido de ancestros que arranque en `NEW.id` no encuentra nada y siempre
-- daría falso. La autoridad para colgar un nodo nuevo es la autoridad sobre el
-- PADRE, que sí existe. Para un nodo raíz (`parent_equipo_id IS NULL`) se exige
-- autoridad global, que es lo correcto: crear una Dirección de Línea 1 no es una
-- operación de rama.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- En staging hay un único grant `dream_team.*` (`dream_team.serve`, sin alcance
-- de nodo) y en producción ninguno, así que este endurecimiento no le quita
-- acceso a nadie hoy. Llega ANTES de que exista el primer director de área, que
-- es exactamente cuando hay que instalarlo. Los términos de talleres no se
-- tocan. Cero impacto sobre Grupos de Vida.

-- ── dream_team_equipos ─────────────────────────────────────────────────
drop policy if exists dream_team_equipos_select on public.dream_team_equipos;
create policy dream_team_equipos_select on public.dream_team_equipos
  for select to public
  using (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    or auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', id)
    or auth_has_talleres_capability('talleres_crecimiento.lead.read')
    or auth_has_talleres_capability('talleres_crecimiento.volunteer.read')
    or auth_has_talleres_capability('talleres_crecimiento.participation.read')
    or auth_has_talleres_capability('talleres_crecimiento.metrics.read')
    -- Dream Team, ahora acotado al árbol.
    or auth_has_dream_team_capability_in_tree('dream_team.org.manage', id)
    or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', id)
    or auth_has_dream_team_capability_in_tree('dream_team.coordinate', id)
    or auth_has_dream_team_capability_in_tree('dream_team.lead', id)
    or auth_has_dream_team_capability_in_tree('dream_team.serve', id)
    or auth_has_dream_team_capability_in_tree('dream_team.metrics.read', id)
  );

drop policy if exists dream_team_equipos_insert on public.dream_team_equipos;
create policy dream_team_equipos_insert on public.dream_team_equipos
  for insert to public
  with check (
    case
      when parent_equipo_id is null
        then auth_has_dream_team_capability('dream_team.org.manage')
      else auth_has_dream_team_capability_in_tree('dream_team.org.manage', parent_equipo_id)
    end
  );

drop policy if exists dream_team_equipos_update on public.dream_team_equipos;
create policy dream_team_equipos_update on public.dream_team_equipos
  for update to public
  using (auth_has_dream_team_capability_in_tree('dream_team.org.manage', id))
  with check (auth_has_dream_team_capability_in_tree('dream_team.org.manage', id));

-- ── dream_team_roles ───────────────────────────────────────────────────
drop policy if exists dream_team_roles_select on public.dream_team_roles;
create policy dream_team_roles_select on public.dream_team_roles
  for select to public
  using (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    or auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', equipo_id)
    or auth_has_talleres_capability('talleres_crecimiento.lead.read')
    or auth_has_talleres_capability('talleres_crecimiento.volunteer.read')
    or auth_has_talleres_capability('talleres_crecimiento.participation.read')
    or auth_has_talleres_capability('talleres_crecimiento.metrics.read')
    or auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.lead', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.serve', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.metrics.read', equipo_id)
  );

drop policy if exists dream_team_roles_insert on public.dream_team_roles;
create policy dream_team_roles_insert on public.dream_team_roles
  for insert to public
  with check (auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id));

drop policy if exists dream_team_roles_update on public.dream_team_roles;
create policy dream_team_roles_update on public.dream_team_roles
  for update to public
  using (auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id))
  with check (auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id));

-- ── dream_team_servicios ───────────────────────────────────────────────
-- Los cuatro términos de talleres se conservan textualmente. Se suman los del
-- árbol y la lectura de la propia ficha.
drop policy if exists dream_team_servicios_select on public.dream_team_servicios;
create policy dream_team_servicios_select on public.dream_team_servicios
  for select to public
  using (
    auth_has_talleres_capability('talleres_crecimiento.director.read')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    or auth_has_talleres_capability_scoped('talleres_crecimiento.coordinator.read', equipo_id)
    or auth_has_talleres_capability('talleres_crecimiento.lead.read')
    or auth_has_talleres_capability('talleres_crecimiento.volunteer.read')
    or auth_has_talleres_capability('talleres_crecimiento.participation.read')
    or auth_has_talleres_capability('talleres_crecimiento.metrics.read')
    -- Dream Team, acotado al árbol: un director de área ve a SU gente.
    or auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.lead', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.metrics.read', equipo_id)
    -- Ficha propia: un voluntario ve su propio servicio sin capacidad alguna.
    or persona_id = (select u.id from public.usuarios u where u.auth_id = auth.uid())
  );

-- Escritura: se conservan los dos términos de talleres y se suma el del árbol.
-- `dream_team.director.coordinate` es quien asigna; que sea en-árbol impide que
-- un director de área asigne fuera de su rama. La RPC de capacidades verifica
-- la autoridad por segunda vez, de forma independiente.
drop policy if exists dream_team_servicios_insert on public.dream_team_servicios;
create policy dream_team_servicios_insert on public.dream_team_servicios
  for insert to public
  with check (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
  );

drop policy if exists dream_team_servicios_update on public.dream_team_servicios;
create policy dream_team_servicios_update on public.dream_team_servicios
  for update to public
  using (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
  )
  with check (
    auth_has_talleres_capability('talleres_crecimiento.director.write')
    or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
    or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
  );
