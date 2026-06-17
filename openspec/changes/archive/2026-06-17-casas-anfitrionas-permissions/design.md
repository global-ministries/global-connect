# Design: Casas Anfitrionas Permissions

## Technical Approach

Add a granular Casas permission layer in Supabase and make Next.js server actions/pages consume it as the single authorization contract. Existing `adminDb` reads may remain for enriched joins, but every list/detail/mutation path must first validate visibility/scope through RPCs. Migrations are additive and non-destructive; production data repair is explicitly deferred to a future diagnostics-first change.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| Patch `puede_gestionar_casas` | Small diff, keeps ambiguous semantics | Reject; separate action predicates are safer. |
| Granular RPC predicates | More SQL/tests, one source of truth | Choose: `puede_ver/crear_para/aprobar/editar/desactivar_casa`. |
| Capability table | Flexible, but overbuilt and data-heavy | Reject for this role/scoped model. |
| Pending revision table for approved edits | Safest for active groups, larger change | Prefer; if not implemented in first slice, block sensitive approved edits until product confirms lifecycle. |

## Data Flow

    Server Component / Server Action
        └─ get auth user
        └─ RPC permission check
        └─ scoped adminDb read/write only after allow
        └─ revalidate Casas list/detail/group visibility

UI never infers permissions from local role arrays. It receives boolean permissions and eligible user options produced by server-side RPC-backed queries.

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/migrations/<timestamp>_casas_anfitrionas_granular_permissions.sql` | Create | Add RPC predicates, grants, optional indexes, and read-only diagnostics helpers. |
| `lib/supabase/database.types.ts` | Modify | Regenerate after staging migration so new RPCs are typed. |
| `lib/actions/casas-anfitrionas.actions.ts` | Modify | Replace `validarAuthYPermisos(requiereGestion)` and direct `puede_gestionar_casas` calls with action-specific checks. Validate owner/co-host scope before `adminDb` writes. |
| `app/(auth)/grupos-vida/casas-anfitrionas/page.tsx` | Modify | Use list visibility RPC plus create permission for primary action/FAB. |
| `app/(auth)/grupos-vida/casas-anfitrionas/[id]/page.tsx` | Modify | Check `puede_ver_casa` before admin read; render edit/approve/deactivate from backend permission booleans. |
| `app/(auth)/grupos-vida/casas-anfitrionas/nueva/page.tsx` | Modify | Use backend-derived create permissions and eligible owner RPC/list, not role constants. |
| `app/(auth)/grupos-vida/casas-anfitrionas/[id]/editar/page.tsx` | Modify | Check `puede_editar_casa` before loading edit data; scope assignable owners. |
| `components/grupos-vida/form-casa-anfitriona.tsx` | Modify | Stay presentational; consume `usuarios` and `mostrarSelectorUsuario` only. |
| `__tests__/lib/actions/casas-anfitrionas.actions.test.ts` | Create | Jest unit tests for deny-before-write, RPC calls, revalidation, and owner-scope validation. |
| `__tests__/supabase/casas-anfitrionas-permissions-migration.test.ts` | Create | Static SQL expectations for additive migration, grants, security definer settings, and no destructive repair SQL. |

## Interfaces / Contracts

New RPC contract:
- `obtener_permisos_casa_anfitriona(p_auth_id uuid, p_casa_id uuid default null) returns jsonb`
- `puede_ver_casa_anfitriona(p_auth_id uuid, p_casa_id uuid) returns boolean`
- `puede_crear_casa_anfitriona_para(p_auth_id uuid, p_usuario_id uuid) returns boolean`
- `puede_aprobar_casa_anfitriona(p_auth_id uuid, p_casa_id uuid) returns boolean`
- `puede_editar_casa_anfitriona(p_auth_id uuid, p_casa_id uuid) returns boolean`
- `puede_cambiar_estado_casa_anfitriona(p_auth_id uuid, p_casa_id uuid) returns boolean`

All are `SECURITY DEFINER SET search_path TO 'public'`, revoked from `PUBLIC`, granted to `authenticated, service_role`, and avoid user-editable JWT metadata.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Server actions deny before write and call granular RPCs | Strict TDD with Jest mocks for Supabase clients/actions. |
| SQL/static | Migration is additive, grants are correct, no repair SQL | Jest reads migration like existing support tests. |
| RLS/RPC | Role/scope expectations on staging if harness supports it | Extend `supabase/tests` with non-destructive RPC checks; mutating checks only with `RLS_ENV=staging`. |
| UI | Buttons/selectors reflect backend permissions | Page/component tests where practical; otherwise action-level coverage owns security. |

## Migration / Rollout

Create additive RPCs first, deploy to staging, regenerate types, then switch server actions/UI. Keep existing functions during rollout for rollback. No production data updates, deletes, backfills, or repairs. Data remediation must be a separate SDD change: read-only diagnostics, reviewed findings, explicit approval, reversible repair plan.

## Open Questions

- [ ] Confirm approved-house edit lifecycle: pending revision table now, or block sensitive edits until separate lifecycle work.
