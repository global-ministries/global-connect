-- Paso 4.8 (b) — Dream Team: permisos de tabla para `authenticated`.
--
-- ── PROBLEMA ───────────────────────────────────────────────────────────
-- Una consulta pasa por DOS capas de permisos, en este orden:
--   1. GRANT de tabla — ¿este rol puede tocar la tabla?
--   2. política RLS  — de las filas, ¿cuáles puede ver o escribir?
-- La RLS se evalúa DESPUÉS del grant. Sin grant, la consulta muere con
-- `42501: permission denied` antes de que se mire una sola política.
--
-- Probado asumiendo el rol `authenticated` con la identidad de la directora de
-- área de DPS, dentro de un bloque revertido:
--
--   permission denied for table dream_team_estados_historial
--
-- Estado real de staging antes de esta migración:
--
--   tabla                               SELECT  INSERT  UPDATE
--   dream_team_capability_grants          sí      no      no
--   dream_team_equipos                    sí      NO      NO
--   dream_team_roles                      sí      NO      NO
--   dream_team_servicios                  sí      sí      sí
--   dream_team_estados_historial          NO      NO      NO
--   dream_team_participation_eventos      NO      NO      NO
--   dream_team_requisitos                 NO      NO      NO
--   dream_team_requisitos_verificacion    NO      NO      NO
--
-- Consecuencias concretas:
--   · La pantalla de estructura muestra Renombrar, Desactivar, Agregar
--     sub-equipo y Agregar rol. Las cuatro fallaban: equipos y roles tienen
--     políticas de INSERT/UPDATE desde 20260910120000, pero nunca el grant.
--   · "Asignar servicio" crea el servicio y después escribe el historial:
--     permission denied, 500, y un servicio huérfano sin historial.
--
-- Mis simulaciones anteriores corrían como superusuario, que ignora grants y
-- RLS: no podían verlo. Sólo apareció al asumir el rol real.
--
-- ── ANTECEDENTE ────────────────────────────────────────────────────────
-- 20260822000004_talleres_dream_team_grant_authenticated.sql (sesión anterior)
-- diagnosticó esta misma clase de defecto para roles, equipos y servicios, y
-- dejó escrito que las cuatro tablas del ciclo de vida recibirían sus grants
-- "junto con la migración que canonicalice SUS políticas". Ésa es
-- 20260910190000, la inmediatamente anterior. Esta migración cumple ese
-- compromiso y cubre además los INSERT/UPDATE de equipos y roles, que nacieron
-- después.
--
-- ── PRINCIPIO: grant ⊆ política ────────────────────────────────────────
-- Cada tabla recibe EXACTAMENTE los privilegios que sus políticas controlan, ni
-- uno más. Como toda concesión queda cubierta por una política restrictiva, la
-- RLS sigue siendo el muro: quien no tiene capacidad sobre un nodo sigue viendo
-- y escribiendo cero filas, igual que hoy.
--
-- No se concede DELETE en ninguna tabla: ninguna tiene política de DELETE, y
-- un nodo o un servicio se desactivan, nunca se borran.
--
-- `dream_team_capability_grants` conserva sólo SELECT a propósito: la sesión
-- necesita leer las capacidades propias, pero las escrituras pasan
-- exclusivamente por la RPC SECURITY DEFINER dream_team_apply_servicio_grants,
-- que verifica autoridad nodo por nodo. Darle INSERT al rol sería abrir un
-- camino que esquiva esa verificación.
--
-- ── BLAST RADIUS ───────────────────────────────────────────────────────
-- Aditiva e idempotente: GRANT es un no-op cuando el privilegio ya existe. No
-- cambia ninguna política ni toca datos. Cero impacto sobre Grupos de Vida.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────
--   revoke insert, update on public.dream_team_equipos from authenticated;
--   revoke insert, update on public.dream_team_roles from authenticated;
--   revoke select, insert on public.dream_team_estados_historial from authenticated;
--   revoke select, insert on public.dream_team_participation_eventos from authenticated;
--   revoke select, insert, update on public.dream_team_requisitos from authenticated;
--   revoke select, insert, update on public.dream_team_requisitos_verificacion from authenticated;

-- Estructura: políticas SELECT / INSERT / UPDATE.
grant select, insert, update on public.dream_team_equipos to authenticated;
grant select, insert, update on public.dream_team_roles   to authenticated;

-- Asignaciones: políticas SELECT / INSERT / UPDATE (ya lo tenía; idempotente).
grant select, insert, update on public.dream_team_servicios to authenticated;

-- Bitácora del ciclo del voluntario: políticas SELECT / INSERT. Append-only.
grant select, insert on public.dream_team_estados_historial     to authenticated;
grant select, insert on public.dream_team_participation_eventos to authenticated;

-- Requisitos y su verificación: políticas SELECT / INSERT / UPDATE.
grant select, insert, update on public.dream_team_requisitos              to authenticated;
grant select, insert, update on public.dream_team_requisitos_verificacion to authenticated;

-- Capacidades: sólo lectura. Las escrituras van por la RPC que verifica
-- autoridad (ver comentario de cabecera).
grant select on public.dream_team_capability_grants to authenticated;
