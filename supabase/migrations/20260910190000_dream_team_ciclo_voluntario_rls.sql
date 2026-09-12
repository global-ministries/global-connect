-- Paso 4.8 — Dream Team: acotar al árbol las cuatro tablas del ciclo del
--             voluntario, en lectura y en escritura.
--
-- ── PROBLEMA A · LECTURA A NIVEL DE TODA LA IGLESIA ────────────────────
-- dream_team_estados_historial, dream_team_participation_eventos,
-- dream_team_requisitos_verificacion y dream_team_requisitos leían con el gate
-- PLANO (auth_has_dream_team_capability), que sólo pregunta "¿tenés esta
-- capacidad en algún lado?". Cualquier voluntario pasaba y leía el historial de
-- etapas, los eventos y las verificaciones de TODOS los voluntarios de la
-- iglesia. Datos personales, sin acotar.
--
-- ── PROBLEMA B · ASIGNAR SERVICIO SE ROMPE PARA UN DIRECTOR DE ÁREA ────
-- POST /api/dream-team/servicios escribe, en orden:
--   1. el servicio                       → permitido para dream_team.direct
--   2. las verificaciones de requisitos  → sólo requirements.manage / director.coordinate
--   3. el historial inicial              → sólo director.coordinate
-- Una directora de área aprieta "Asignar servicio": el servicio se crea, el
-- historial falla, recibe un 500, y queda un servicio huérfano sin historial.
-- Hoy el paso 2 se saltea porque no hay requisitos cargados; el paso 3 falla
-- siempre.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────
-- LECTURA de las tres tablas que cuelgan de un servicio (historial, eventos,
-- verificaciones): "podés leerlo si podés leer el servicio".
--
--   exists (select 1 from dream_team_servicios s where s.id = servicio_id)
--
-- Postgres aplica RLS también dentro de las subconsultas de una política, así
-- que esa subconsulta hereda EXACTAMENTE la política de lectura de servicios —
-- con su recorrido de árbol y su término de ficha propia — sin repetir una sola
-- capacidad. Si mañana cambia quién ve un servicio, cambia solo quién ve su
-- historial.
--
-- No hay ciclo: historial → servicios → usuarios, y ninguna política de
-- usuarios mira estas tablas.
--
-- LECTURA de requisitos, que no cuelgan de un servicio sino de un equipo y un
-- rol: términos de árbol sobre equipo_id. Incluye dream_team.serve a propósito:
-- un voluntario tiene que poder ver qué se le exige a su propio puesto.
--
-- ESCRITURA de historial, eventos y verificaciones: la misma autoridad que
-- escribir el servicio — los términos de talleres más director.coordinate,
-- direct y org.manage en árbol sobre el equipo del servicio. Quien puede
-- asignar a alguien puede dejar asentado que lo asignó.
--
-- ESCRITURA de requisitos: requirements.manage y director.coordinate como antes,
-- más direct y org.manage en árbol. Quien dirige un área define qué hace falta
-- para servir en ella.
--
-- Historial y eventos siguen siendo append-only: sin UPDATE ni DELETE. Son la
-- bitácora del ciclo del voluntario.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- Reemplaza las políticas de 20260910120100. En lectura ACHICA el alcance: de
-- toda la iglesia a la rama de cada uno. En escritura lo AMPLÍA únicamente para
-- directores de área dentro de su rama, que es lo que el flujo de asignación ya
-- necesitaba. Los términos de talleres se conservan en escritura para no
-- regresionar ese flujo. Cero impacto sobre Grupos de Vida.

-- ── dream_team_estados_historial (append-only) ─────────────────────────
drop policy if exists dream_team_estados_historial_read on public.dream_team_estados_historial;
create policy dream_team_estados_historial_read on public.dream_team_estados_historial
  for select to public
  using (exists (select 1 from public.dream_team_servicios s where s.id = servicio_id));

drop policy if exists dream_team_estados_historial_write on public.dream_team_estados_historial;
create policy dream_team_estados_historial_write on public.dream_team_estados_historial
  for insert to public
  with check (
    exists (
      select 1 from public.dream_team_servicios s
      where s.id = servicio_id
        and (
          auth_has_talleres_capability('talleres_crecimiento.director.write')
          or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
          or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', s.equipo_id)
          or auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id)
          or auth_has_dream_team_capability_in_tree('dream_team.org.manage', s.equipo_id)
        )
    )
  );

-- ── dream_team_participation_eventos (append-only) ─────────────────────
drop policy if exists dream_team_participation_eventos_read on public.dream_team_participation_eventos;
create policy dream_team_participation_eventos_read on public.dream_team_participation_eventos
  for select to public
  using (exists (select 1 from public.dream_team_servicios s where s.id = servicio_id));

drop policy if exists dream_team_participation_eventos_write on public.dream_team_participation_eventos;
create policy dream_team_participation_eventos_write on public.dream_team_participation_eventos
  for insert to public
  with check (
    exists (
      select 1 from public.dream_team_servicios s
      where s.id = servicio_id
        and (
          auth_has_talleres_capability('talleres_crecimiento.director.write')
          or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
          or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', s.equipo_id)
          or auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id)
          or auth_has_dream_team_capability_in_tree('dream_team.org.manage', s.equipo_id)
        )
    )
  );

-- ── dream_team_requisitos_verificacion ─────────────────────────────────
drop policy if exists dream_team_requisitos_verificacion_read on public.dream_team_requisitos_verificacion;
create policy dream_team_requisitos_verificacion_read on public.dream_team_requisitos_verificacion
  for select to public
  using (exists (select 1 from public.dream_team_servicios s where s.id = servicio_id));

drop policy if exists dream_team_requisitos_verificacion_write on public.dream_team_requisitos_verificacion;
create policy dream_team_requisitos_verificacion_write on public.dream_team_requisitos_verificacion
  for insert to public
  with check (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    or exists (
      select 1 from public.dream_team_servicios s
      where s.id = servicio_id
        and (
          auth_has_talleres_capability('talleres_crecimiento.director.write')
          or auth_has_talleres_capability('talleres_crecimiento.admin.manage')
          or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', s.equipo_id)
          or auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id)
          or auth_has_dream_team_capability_in_tree('dream_team.org.manage', s.equipo_id)
        )
    )
  );

drop policy if exists dream_team_requisitos_verificacion_update on public.dream_team_requisitos_verificacion;
create policy dream_team_requisitos_verificacion_update on public.dream_team_requisitos_verificacion
  for update to public
  using (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    or exists (
      select 1 from public.dream_team_servicios s
      where s.id = servicio_id
        and (
          auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', s.equipo_id)
          or auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id)
          or auth_has_dream_team_capability_in_tree('dream_team.org.manage', s.equipo_id)
        )
    )
  )
  with check (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    or exists (
      select 1 from public.dream_team_servicios s
      where s.id = servicio_id
        and (
          auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', s.equipo_id)
          or auth_has_dream_team_capability_in_tree('dream_team.direct', s.equipo_id)
          or auth_has_dream_team_capability_in_tree('dream_team.org.manage', s.equipo_id)
        )
    )
  );

-- ── dream_team_requisitos (config por equipo y rol) ────────────────────
drop policy if exists dream_team_requisitos_read on public.dream_team_requisitos;
create policy dream_team_requisitos_read on public.dream_team_requisitos
  for select to public
  using (
    auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.direct', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.lead', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.serve', equipo_id)
    or auth_has_dream_team_capability('dream_team.requirements.manage')
    or auth_has_dream_team_capability('dream_team.metrics.read')
  );

drop policy if exists dream_team_requisitos_write on public.dream_team_requisitos;
create policy dream_team_requisitos_write on public.dream_team_requisitos
  for insert to public
  with check (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.direct', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
  );

drop policy if exists dream_team_requisitos_update on public.dream_team_requisitos;
create policy dream_team_requisitos_update on public.dream_team_requisitos
  for update to public
  using (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.direct', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
  )
  with check (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    or auth_has_dream_team_capability_in_tree('dream_team.director.coordinate', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.direct', equipo_id)
    or auth_has_dream_team_capability_in_tree('dream_team.org.manage', equipo_id)
  );
