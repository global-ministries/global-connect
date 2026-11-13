# Rendimiento del sistema bajo carga simultánea

Screens fail with "No pudimos cargar esta pantalla" because row-level security
recomputes permissions per row and queries hit the 8 s statement_timeout.
Fix Dream Team first, then sweep the rest of the system by measured cost.

## Specs

- S1. "hay algo que nos está tumbando el sistema" — /admin/dream-team/servidores
  must load without the error boundary for every role (admin, area director
  such as Engels, coordinator, servidor).
- S2. Rewritten SELECT policies on dream_team_servicios, dream_team_equipos,
  dream_team_roles and dream_team_requisitos return exactly the same rows as
  before for every user (proved by an equivalence check over all users × all
  rows), while computing the caller's scope once per statement.
- S3. Measured before/after: the unfiltered dream_team_servicios read as a
  scoped director drops from seconds (mean 3.4 s, max 7.96 s in
  pg_stat_statements) to well under 1 s.
- S4. The servidores page stops issuing one dream_team_roles request per
  equipo and runs independent reads in parallel.
- S5. "revisar absolutamente todo el sistema ... para aguantar conexiones
  simultáneas de muchas personas" — sweep the remaining modules (Grupos de
  Vida, Talleres, Niños, DPS, usuarios) ordered by pg_stat_statements total
  time, applying the same pattern.
- S6. Infrastructure recommendation (compute size, caching, Redis or not)
  backed by numbers.

## Tasks

- T1 [S2,S3] Migration: scope helpers computed once + rewritten Dream Team SELECT policies; SQL equivalence test; staging, then production. route: inline. commit: 30b0573e (+ limits test). DONE, applied to production 2026-11-13.
- T2 [S1,S4] Servidores page: bulk roles read, parallel waterfall (also Estructura). route: inline. commit: 446cdf75. Ships with the PR.
- T3 [S5] Talleres policies (same per-row helpers). route: TBD. commit: —
- T4 [S5] Grupos de Vida / usuarios hot queries. route: TBD. commit: —
- T5 [S6] Infra recommendation with measurements. route: inline. commit: —

## Log

- L1 (user, verbatim): "Debemos hacer una revisi a todo el sistema. Empezando por DreamTeam, porque me está saliendo mucho eso que no puede cargar la pantalla, que puede ser conexión, problema de conexión, pero en realidad no es así. El internet está perfecto, es algo del sistema. Entonces hay algo que nos está tumbando el sistema. Recuerda que esto debe ser muy debemos tener la mejor arquitectura e infraestructura del sistema porque muchas personas lo van a estar utilizando simultáneamente. Entonces esto debemos arreglarlo y si lo mejor es revisar, comenzar por aquí, pero revisar absolutamente todo el sistema. En busca de cuáles son esas mejoras que debemos hacer para que la arquitectura sea mucho más robusta, para aguantar conexiones simultáneas de muchas personas. O sea, todo eso tenemos que verlo, revisarlo y ya es el momento de hacerlo. debemos ver que vamos a implementar como ahí tenemos supabe pero no sé si tenemos que implementar alguna otra cosa algo tipo redes tipo o algo que que nos ayude a mejorar esto pero bueno ya debemos optimizar esto porque son cientos de usuarios que lo usarán semana a semana"
- L2 (evidence, prod 2026-11-13): authenticated statement_timeout=8s; max_connections=60; DB 150 MB, 1278 usuarios. pg_stat_statements: `select * from dream_team_servicios` mean 3440 ms max 7961 ms; dream_team_servicio_turnos mean 2350 ms; dream_team_equipos mean 1044 ms; grupos by temporada mean 1029 ms max 7976 ms; dream_team_roles by equipo 36k calls.
- L3 (root cause): dream_team_servicios_select calls 12 recursive-CTE capability checks per row; dream_team_*_select_coordinador_voluntario calls dream_team_puede_registrar_persona per row, which runs dream_team_equipos_registrables() and dream_team_equipos_director() (one recursive check per equipo) per row. Child tables (servicio_turnos, historial, verificacion, participation, turno_fecha_servidores) re-run the servicios policy through EXISTS.
- L4 (decision): no Redis now; fix query/RLS design first, measure, then decide compute size.
- L5 (evidence T1): staging per-user RLS snapshot, 26 users, before vs after: 0 differences; ~6.5 s per user (6 reads) before, ~0.2 s after. Production equivalence test (pares=93 registro=10) diferencias=0 before and after applying; edge-case test (depth, revoked, non-equipo scope, NULL equipo, auth.uid() NULL) on staging diferencias=0. Independent verify: S2 PASS.
- L6 (S3 measured, production, as Engels): `select * from dream_team_servicios` 6238 ms → 48 ms (117 rows both); servicio_turnos 50 ms; equipos 9 ms; roles 13 ms.
