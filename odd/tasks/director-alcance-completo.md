# director-alcance-completo

A Dream Team area director (e.g. Engels, director of Dirección de Estudiantes) must reach everyone in his equipo tree
(Transit, Inside Out, The Living Room): invite them to create an account, edit their Dream Team ficha and their general profile.

## Specs

- **S1** — Experience-scoped serve grants count as inside. User: "Sí, corregir la regla (Recomendado)" to: «¿Corrijo la regla de permisos para que reconozca el permiso general de Living Room? Así Engels alcanzaría a los 33 servidores de esa área.» Today `dream_team_director_alcanza_persona` rejects any target whose active grant has no equipo scope; 33 The Living Room servers hold `the_living_room.team.serve` with scope_type `experience`, scope_id NULL (by design). Expected: Engels can invite and edit them.
- **S2** — People who also serve elsewhere stay reachable. User verbatim: «que pueda editar segun lo recomendado a pesar de que en otras areas puedan servir, liderar o coordinar..». A director reaches a person who has a non-retired servicio in an equipo of his tree, even when that person also serves, leads or coordinates in equipos outside his tree (DPS Video, Producción Creativa, Niños, Talleres, Global Music…). Still protected (unchanged): people with a system role other than `miembro`/`lider` (usuario_roles), people with active `support_user_capabilities`, and people holding `dream_team.direct` or `dream_team.org.manage` outside the director's tree (peer directors).
- **S3** — General profile. User: «Sí, también el perfil general» to: «Además de la ficha de Dream Team, ¿el director debe poder abrir y editar el perfil general de la persona (la página de usuario)?» `puede_editar_usuario(p_auth_id, p_target)` must return true when the director reaches the target per S1–S2 (today false for all 91).
- **S4** — Invitation and ficha follow the same reach: `invitacion_cuenta_puede_invitar` and `dream_team_puede_editar_ficha` true for every reachable person.
- **S5** — Acceptance in production (simulated as Engels, auth cda85476-79a8-43eb-921c-eb75178eb626): of the 91 people with a non-retired servicio under Dirección de Estudiantes (a53a379c-…), every one without the S2 protections passes all three checks; Transit 43, Inside Out 32, The Living Room 34.

## Tasks

- T1 (S0 data, done 2026-11-13 directly in prod): merged duplicate Jesús Mendoza (ea1ad718 → 94f38fd0, kept 26 asistencias + GdV group, added cédula 36346324); fixed Brayan Evies name and email (eviesbrayan0@gmail.com).
- T2 (S1–S4) migration rewriting `dream_team_director_alcanza_persona` (+ `puede_editar_usuario` reach) with SQL test; route: worker; commit: —
- T3 (S5) apply to prod and verify with Engels simulation; route: parent; commit: —

## Log

- L1 (user, 2026-11-13): «te cuento lo siguiente engels es el director de estudiantes y su tarea es poder enviarle la invitación a todos los directores que están debajo de él en en transit pero también en lo que él lidera porque una de las cosas que tenemos que ver es que él también es director de de inside out y de living room él es el director entonces como director él debe poder enviar también invitaciones a todos los que están dentro de de esas direcciones.. allí te dejo un mensaje que él me mandó porque le está diciendo que tiene algunos problemas entonces la ideal es que podamos revisar qué problemas tiene porque él debería poder invitar a todos y poder editar sus perfiles de absolutamente todo el mundo que está debajo de él él como es director de estudiante él debería poder editar absolutamente todo de todas las áreas que están debajo de él entonces bueno vamos a analizar absolutamente todo»
- L2 (diagnosis, prod): 55/91 reachable (Transit 41/43, Inside Out 29/32, TLR 1/34). Causes: experience-scoped `the_living_room.team.serve` (33) and grants in other areas (DPS/Niños/Talleres). `puede_editar_usuario` false for all 91.
- L3 (user decisions): S1 yes; S2 verbatim above; data fixes yes; S3 yes.
- L4 (T2, worker): migration `supabase/migrations/20261113120000_director_alcance_completo.sql` (alcanza: only `dream_team.direct`/`dream_team.org.manage` outside the tree block; `puede_editar_usuario` + director branch when `p_auth_id = auth.uid()`; invitation comment refreshed — invitation and ficha already call alcanza). Test `supabase/tests/director-alcance-completo.test.sql`; `invitacion-cuenta-directores-area.test.sql` case "taller grant outside the tree" flipped to allowed per S2. Evidence on a scratch local Postgres 16 with stub tables and the real repo functions: RED 6/16 failing (S1, S2, S3, S4 cases), GREEN 16/16. Not yet run against staging or prod.
