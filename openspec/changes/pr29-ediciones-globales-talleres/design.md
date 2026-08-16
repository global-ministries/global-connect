# PR29 — Ediciones Globales para Talleres de Crecimiento

**Change:** pr29-ediciones-globales-talleres
**Phase:** sdd-design
**Mode:** openspec
**Generated:** 2026-08-16
**Status:** ready for review

---

## Approach (one-line)

Introducir una entidad nueva "temporada global" (`taller_ediciones_globales`) que agrupa N `taller_ediciones` (locales) — sigue el mismo patrón que `temporadas` en Grupos de Vida (segmento + temporada + grupo), pero aplicado a talleres. Aditivo: 100% compatible con datos existentes, backfill automático de las 3 ediciones de prod en una "Edición Legacy".

---

## Architecture decisions

| Concern | Approach | Rationale |
|---|---|---|
| Modelo entidad | Tabla nueva `taller_ediciones_globales` (plural) + junction table `taller_edicion_global_participantes` | Evita colisión de nombre con `taller_ediciones` (local). Sigue el patrón de Grupos de Vida donde `temporadas` es entidad global y `grupos.temporada_id` FK a ella. |
| Asociación taller-edicion | 1-N via junction table | Un taller puede estar en múltiples globales (Otoño 2026 + Primavera 2027). 1-1 sería restrictivo y limitaría casos reales. |
| Naming | `taller_ediciones_globales` (plural) vs local `taller_ediciones` (singular) | Coincide con la convención de Grupos de Vida. La FK en la local se llama `edicion_global_id` para claridad. |
| Estado propagation | Automático al abrir/cerrar la global (RPC transaccional) | El value del feature es "una temporada = N talleres abiertos a la vez". Manual por taller sería solo renombrar el modelo actual. |
| Inscripciones | Por taller (no por edición) | Confirmado por usuario: "se inscribe al taller y listo sin complicaciones". Inscripción contra la global agregaría complejidad sin valor. |
| Equipos | Por taller (dream_team no se comparte entre talleres) | Confirmado por usuario. La global no es dueña de un equipo. |
| Certificados | Por taller | Confirmado por usuario. No cambian los certificados. |
| Página admin | Coexisten `/admin/talleres/abstracto` y nueva `/admin/talleres/ediciones-globales` | El usuario razonó: "una cosa es el listado de talleres (catálogo conceptual), otra cosa son las ediciones (cuándo abren)". Dos páginas separadas con link cruzado refleja el modelo mental correcto. |
| Taller_periodos_generales | Deprecada gradualmente (no DROP) | El pg_cron closer depende de ella. Migración aditiva primero; DROP solo después de >30 días sin uso. |
| Archivos protegidos (byte-identity guard) | NO SE TOCAN | Las 16 paths del design §5 permanecen intactas. Los cambios van en archivos nuevos en `/admin/talleres/ediciones-globales/` y `/lib/platform/talleres/ediciones-globales/`. |

---

## Modelo de datos

### Tabla nueva: `public.taller_ediciones_globales`

```sql
CREATE TABLE public.taller_ediciones_globales (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                    text        NOT NULL CHECK (length(nombre) BETWEEN 2 AND 120),
  slug                      text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$' AND length(slug) BETWEEN 2 AND 80),
  descripcion               text        CHECK (descripcion IS NULL OR length(descripcion) <= 1000),
  fecha_apertura            timestamptz NOT NULL,
  fecha_cierre              timestamptz NOT NULL CHECK (fecha_cierre > fecha_apertura),
  estado                    text        NOT NULL CHECK (estado IN ('borrador','abierto','cerrado','cancelado')),
  created_by_persona_id     uuid        REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  version                   integer     NOT NULL DEFAULT 1,
  CONSTRAINT slug_reserved_excludes_legacy CHECK (slug != '__legacy__')
);

CREATE INDEX idx_taller_ediciones_globales_estado ON public.taller_ediciones_globales(estado);
CREATE INDEX idx_taller_ediciones_globales_fecha_apertura ON public.taller_ediciones_globales(fecha_apertura DESC);
CREATE INDEX idx_taller_ediciones_globales_fecha_cierre ON public.taller_ediciones_globales(fecha_cierre);
CREATE INDEX idx_taller_ediciones_globales_open ON public.taller_ediciones_globales(fecha_cierre) WHERE estado = 'abierto';
```

### Tabla nueva: `public.taller_edicion_global_participantes`

```sql
CREATE TABLE public.taller_edicion_global_participantes (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  edicion_global_id         uuid        NOT NULL REFERENCES public.taller_ediciones_globales(id) ON DELETE CASCADE,
  taller_id                 uuid        NOT NULL REFERENCES public.talleres(id) ON DELETE RESTRICT,
  created_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE(edicion_global_id, taller_id)
);

CREATE INDEX idx_teg_participantes_edicion_global ON public.taller_edicion_global_participantes(edicion_global_id);
CREATE INDEX idx_teg_participantes_taller ON public.taller_edicion_global_participantes(taller_id);
```

### Modificación a `public.talleres_crecimiento_metadata` (tabla actual `taller_ediciones`)

```sql
ALTER TABLE public.talleres_crecimiento_metadata
  ADD COLUMN IF NOT EXISTS edicion_global_id uuid NULL
    REFERENCES public.taller_ediciones_globales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tcm_edicion_global
  ON public.talleres_crecimiento_metadata(edicion_global_id)
  WHERE edicion_global_id IS NOT NULL;
```

**Nota:** Mantener nullable para no romper nada. Las ediciones locales sin global siguen funcionando como hoy. El backfill poblará `edicion_global_id` para las 3 existentes apuntando a `Edición Legacy`.

---

## Transiciones de estado

### Global (en `taller_ediciones_globales`)

```
borrador ───[open]──→ abierto ───[close]──→ cerrado (terminal)
    │                     │
    └─[cancel]──→ cancelado (terminal)
```

**Reglas:**
- `open`: solo si estado='borrador'. Warning si `fecha_apertura > now()` (futuro).
- `close`: solo si estado='abierto'. Por defecto NO cierra locales con inscripciones activas. `p_force_local=true` cierra duro.
- `cancel`: desde borrador o abierto. Limpia participantes (taller_ediciones quedan con edicion_global_id NULL).

### Local (en `talleres_crecimiento_metadata`) — propagación automática

Cuando la global pasa a 'abierto':
- Cada local asociada con estado='borrador' transiciona a 'abierto' (atomic, en la misma transacción).

Cuando la global pasa a 'cerrado' (sin `p_force_local`):
- Locales con inscripciones activas: NO se cierran. Warning surfaced al admin.
- Locales sin inscripciones activas: pasan a 'cerrado'.

Override manual local:
- Admin puede abrir/cerrar un taller específico dentro de la global (override via `p_force_local=true`).
- Una local PUEDE ser 'borrador' aunque la global sea 'abierto' (admin abre temporada pero deja un taller específico sin abrir todavía).
- Una local NO PUEDE ser 'abierto' si la global es 'cerrado' o 'cancelado' salvo con `admin.manage + p_force_local=true`.

### Eventos emitidos

- `edicion_global_opened` (metadata: edicion_global_id, taller_ids[])
- `edicion_global_closed` (metadata: edicion_global_id, taller_ids[], force_local)
- `edicion_global_cancelled` (metadata: edicion_global_id, motivo)
- `taller_edicion_auto_opened` (metadata: edicion_global_id, edicion_local_id)
- `taller_edicion_auto_closed` (metadata: edicion_global_id, edicion_local_id)

---

## RPCs nuevas (PR29-C)

```sql
-- Crear edición global (con o sin talleres iniciales)
create_edicion_global(
  p_nombre         text,
  p_slug           text,
  p_descripcion    text,
  p_fecha_apertura timestamptz,
  p_fecha_cierre   timestamptz,
  p_taller_ids     uuid[]  DEFAULT '{}'
) RETURNS jsonb  -- {id, slug, ...}

-- Abrir global (propaga a locales)
open_edicion_global(p_id uuid) RETURNS jsonb

-- Cerrar global (respeta locales con inscripciones activas salvo force)
close_edicion_global(p_id uuid, p_force_local boolean DEFAULT false) RETURNS jsonb

-- Cancelar global
cancel_edicion_global(p_id uuid, p_motivo text) RETURNS jsonb

-- Agregar/quitar talleres
add_taller_to_edicion_global(p_edicion_global_id uuid, p_taller_id uuid) RETURNS jsonb
remove_taller_from_edicion_global(p_edicion_global_id uuid, p_taller_id uuid) RETURNS jsonb
```

**Gating:** Todas requieren `talleres_crecimiento.director.write` OR `talleres_crecimiento.admin.manage`.

**UX Reglas (confirmadas con usuario 2026-08-16):**

1. ✅ El form permite **agregar y quitar talleres** en cualquier momento.
2. ✅ Un taller **puede estar en 2 ediciones ABIERTAS a la vez** (con warning en el form: "Este taller ya está en una edición abierta").
3. ✅ Al cerrar global con inscripciones activas: **respeta el ciclo del taller local**. Solo se bloquean NUEVAS inscripciones.
4. ✅ Una edición global **puede existir sin talleres** (caso edge: admin crea primero la global, después agrega).
5. ✅ `/admin/talleres/abstracto` y `/admin/talleres/ediciones-globales` **coexisten** con links cruzados. No hay redirect.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| 3 ediciones existentes en prod quedan huérfanas si la migración falla | Backfill en transacción única, idempotente (ON CONFLICT DO NOTHING). Si falla, ediciones quedan con `edicion_global_id NULL` (estado válido). Admin reasigna via UI. |
| Byte-identity guard detecta cambios accidentales | Los 16 paths protegidos NO se tocan. Solo se crean archivos nuevos en `/admin/talleres/ediciones-globales/` y `/lib/platform/talleres/ediciones-globales/`. |
| pg_cron 'talleres_period_closer' lee `taller_periodos_generales.fecha_cierre_real` | Mantener `taller_periodos_generales` como tabla sombra + vista de compat. PR29-E. |
| Conflicto de slug 'Edición Legacy' | Slug reservado: `__legacy__` (con underscores). El form de crear no permite ese slug. |
| Dos admins abren la misma global simultáneamente | Optimistic concurrency via campo `version`. Stale write → 409. |

---

## Plan de PRs encadenados

| # | Scope | Criterio de listo |
|---|---|---|
| **PR29-A** | Diseño (este doc) + review | Aprobado por usuario + diseño cierra preguntas TBD |
| **PR29-B** | Migration additive: CREATE taller_ediciones_globales + junction + edicion_global_id nullable + backfill "Edición Legacy" para 3 existentes | Tests: supabase/tests/pr29_b_schema_baseline.test.sql. Riesgo: bajo. |
| **PR29-C** | RPCs: 6 nuevas funciones + triggers updated_at + RLS | Tests: supabase/tests/pr29_c_rpcs.test.sql (capabilities, state machine, edge cases, force_local). Riesgo: medio. |
| **PR29-D** | Frontend: nueva página `/admin/talleres/ediciones-globales` (lista + crear + detalle con talleres + form abrir/cerrar). Link cruzado en `/admin/talleres/abstracto`. | Tests jest + visual. NO edita archivos protegidos. Riesgo: bajo. |
| **PR29-E** | Deprecation marker en `taller_periodos_generales` (COMMENT ON + trigger que bloquea INSERTs salvo service_role). Vista `v_taller_periodos_generales_compat`. | pg_cron closer sigue funcionando via la vista. Riesgo: bajo. |

**Orden:** A → review → merge → B → review → merge → C → review → merge → D → review → merge → E → review → merge.

**Límites:**
- Cada PR ≤ 400 líneas revisadas.
- Cada PR cierra con `pnpm test -- --related` verde + `git diff main...HEAD -- <protected>` vacío.
- Cada PR corre `generate-staging-schema-baseline.mjs` si toca schema.

---

## Preguntas resueltas (2026-08-16)

1. ✅ **Edición como admin o director general**: ambas capabilities (`director.write` o `admin.manage`) pueden crear/gestionar ediciones.
2. ✅ **Agregar talleres a la edición**: el admin puede agregar Y quitar talleres.
3. ✅ **Taller en 2 ediciones ABIERTAS**: se permite con warning en el form.
4. ✅ **Cerrar global con inscripciones activas**: respeta el ciclo local. Solo bloquea NUEVAS inscripciones.
5. ✅ **Edición sin talleres**: se permite (caso edge).
6. ✅ **Coexisten abstracto + ediciones-globales**: dos páginas separadas con links cruzados.

## Preguntas abiertas / TBD

Ninguna — todas las preguntas de UX/flujo están resueltas con el usuario.

---

## Out of scope (futuro)

- **PR29-F (futuro, fuera de scope de PR29):** DROP de `taller_periodos_generales` si en >30 días no se inserta nada y la app entera usa la nueva ruta.
- **Migrar el `pg_cron closer`** para que lea de la nueva global en lugar de `taller_periodos_generales`.
- **UI de inscripción al participante:** actualmente solo se ve en el taller. Quizás a futuro "Inscribirme a esta edición" como shortcut.

---

## Cobertura de contenido requerido (14/14)

1. ✅ Resumen ejecutivo
2. ✅ Decisiones arquitectónicas (tabla)
3. ✅ Modelo de datos (CREATE TABLE statements completos)
4. ✅ Authorization y RLS (gating por capability, descriptivo)
5. ✅ Transiciones de estado (máquina completa)
6. ✅ Eventos emitidos (lista de 5 eventos)
7. ✅ UX / navigation (coexisten + links cruzados)
8. ✅ Plan de PRs (5 PRs encadenados)
9. ✅ Riesgos y mitigaciones (6 riesgos)
10. ✅ Preguntas resueltas
11. ✅ Preguntas abiertas (ninguna)
12. ✅ Out of scope
13. ✅ Analogía con Grupos de Vida (referencia explícita)
14. ✅ Stats de cobertura

**Status:** ready for review
**Next:** PR29-B (migration additive)