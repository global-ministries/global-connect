# Design: Casas Anfitrionas Map

## Technical Approach

Move map eligibility and sensitive location access behind backend RPCs. `direcciones` linked from `casas_anfitrionas.direccion_id` becomes the last-approved host-home location; pending creates/edits are stored separately until review. UI stays App Router-first: server pages fetch scoped RPC data, client components only render already-authorized payloads.

## Architecture Decisions

| Topic | Decision | Rationale |
|---|---|---|
| Assignment UX | Dedicated guided page/queue, with a small group-edit link/select fallback; no modal-first flow. | Assignment needs scope checks, create-or-select, pending review messaging, and PR slicing; a modal would hide state and grow `GroupEditForm.tsx`. |
| Sensitive fields | Normal group map payload may include `group id/name`, `segment`, `season`, `day/time`, `counts`, `capacity`, `host_home_name`, `approved lat/lng`, `barrio/parroquia` only when approved, and `notas_publicas`. Withhold `calle`, `codigo_postal`, `referencia`, `pending location`, `notas_privadas`, owner/co-host email/phone, member addresses, and member lat/lng except in member-layer RPC. | Prevents public/client payloads from exposing operational or unapproved location details. |
| Review model | Add `casa_anfitriona_location_reviews` plus `casa_anfitriona_audit_events`; approval writes the official `direcciones` row and audit event atomically. | Keeps last approved location visible while pending changes wait for review. |
| Authorization | Prefer `SECURITY DEFINER` RPCs bound with `p_auth_id IS DISTINCT FROM auth.uid()`, explicit grants to `authenticated/service_role`, and server actions that use admin client only after RPC validation. | Matches existing Casas hardening and avoids RLS/view leaks. |
| Delivery | Forced chained PRs under 400 changed lines. | Scope crosses DB, actions, dashboard, assignment, and map/member privacy. |

## Data Flow

```
Dashboard queue -> assignment page -> RPC validates group/casa scope
  -> link group to Casa -> pending review stays off map
Reviewer page -> approve/reject RPC -> audit event -> approved direction
Map page -> scoped RPC -> Leaflet renders host-home markers
Member layer -> separate admin/director RPC -> sensitive pins
```

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/*_casas_map_location_review.sql` | Create | Add review/audit tables, indexes, RPCs, grants, and replace map view/RPC contract. |
| `lib/actions/casas-anfitrionas.actions.ts` | Modify | Add assignment, review, queues, and map/member RPC wrappers with Zod validation. |
| `app/(auth)/dashboard/page.tsx`, `components/dashboard/roles/*` | Modify | Show non-blocking missing-host-home and pending-review cards. |
| `app/(auth)/grupos-vida/casas-anfitrionas/asignar/**` | Create | Guided select/create assignment flow. |
| `app/(auth)/grupos-vida/casas-anfitrionas/revision/**` | Create | Scoped pending review list and decision UI. |
| `app/(auth)/grupos-vida/mapa/page.tsx`, `components/grupos-vida/mapa-*.tsx` | Modify | Use host-home RPC, filters, privacy copy, and optional member layer. |
| `components/forms/GroupEditForm.tsx` | Modify | Remove manual-address-as-map-source behavior; link to guided assignment. |
| `__tests__/**`, `supabase/tests/**` | Modify/Create | Cover actions, pages, migration text, and executable RPC contracts. |

## Interfaces / Contracts

- `obtener_mapa_grupos_vida_host_homes(p_auth_id uuid, p_scope text default 'active')`: returns only active/planned in-scope groups with active approved Casa and approved coordinates.
- `obtener_grupos_sin_casa_anfitriona(p_auth_id uuid, p_scope text default 'active')`: dashboard/queue rows.
- `obtener_casas_revision_pendiente(p_auth_id uuid)`: scoped pending create/location-change rows.
- `asignar_casa_anfitriona_a_grupo(p_auth_id uuid, p_grupo_id uuid, p_casa_id uuid)`: validates role, group scope, Casa eligibility, multi-group/hall policy.
- `procesar_revision_ubicacion_casa(p_auth_id uuid, p_review_id uuid, p_accion text, p_notas text default null)`: approve/reject atomically.
- `obtener_mapa_miembros(p_auth_id uuid, p_scope text default 'active')`: exact member pins for admin/director only.

## Migration / Rollout

Additive only. Do not auto-create Casas from manual group addresses. Existing approved Casas seed an initial approved-location audit snapshot. Existing pending Casas remain off-map and get pending review rows when address data exists. Manual `grupos.direccion_anfitrion_id` stays for legacy detail display but is ignored by map eligibility; queues expose groups needing assignment.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| SQL | RPC caller binding, grants, scope, hidden manual addresses, pending vs approved location. | `supabase/tests/*.sql` plus migration contract Jest tests. |
| Actions | Validation before admin reads/writes; assignment/review error paths. | Jest mocks matching existing Casas action tests. |
| UI | Dashboard cards, assignment/review pages, map privacy/member layer states. | Component/page tests with mocked actions. |
| E2E/Smoke | Staging chain smoke: queue -> assign -> approve -> map appears. | Manual or scripted staging smoke after DB slice. |

## Chained PR Plan

1. DB contracts and SQL tests. 2. Server actions/data wrappers. 3. Dashboard queues. 4. Assignment flow. 5. Review flow. 6. Host-home map rewrite. 7. Member layer. Each slice must stay under the 400-line budget or split again.

## Open Questions

- None.
