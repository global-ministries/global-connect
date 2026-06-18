## Exploration: Casas Anfitrionas permissions and data safety

### Current State
Casas Anfitrionas currently spans listing, detail, creation, edit, and approval/rejection under `app/(auth)/grupos-vida/casas-anfitrionas/**`, with mutations centralized in `lib/actions/casas-anfitrionas.actions.ts` and authorization partly delegated to Supabase RPCs. The database model stores houses in `casas_anfitrionas` with `aprobada`, `activa`, `aprobada_por`, `aprobada_en`, `notas_privadas`, owner, co-host, and address fields. RLS allows owners or broad leadership to update rows, and self-only inserts unless the app bypasses with the admin client.

The current permission model is too coarse: `puede_gestionar_casas` returns true for `admin`, `pastor`, `director-general`, and `director-etapa`, and `procesar_aprobacion_casa_anfitriona` uses that same check for approve/reject. UI partially contradicts this: detail approval UI only shows for `admin`, `pastor`, `director-general`, while creation UI includes `lider` as a role that can select another owner even though the backend RPC does not treat `lider` as a gestor. Creation and edit paths also use admin-client reads/selection patterns that depend on UI pre-filtering instead of a single reusable scope predicate.

Visibility is handled by `obtener_casas_visibles_ids`, later replaced by `20260326_003_actualizar_rpcs_dg_filtro_de.sql`; Admin/Pastor see all, DG is scoped by assigned Director de Etapa when present or segment fallback, Director de Etapa uses `segmento_lideres` with `tipo_lider = 'director_etapa'`, and Lider sees active groups they lead. Detail page currently fetches the requested house through `adminDb` before checking whether the current user can see that specific house, so direct URL access needs explicit scope revalidation.

Existing production data is known to be possibly wrong. The safe path is to treat authorization redesign as an additive/guarding change and handle correction through a separate audited, reversible inventory/backfill plan. No destructive or corrective production updates should be bundled into the first permission migration.

### Affected Areas
- `lib/actions/casas-anfitrionas.actions.ts` — central create/update/approval actions; currently uses coarse `puede_gestionar_casas`, admin insertion for another owner, and no granular scope validation for owner assignment.
- `app/(auth)/grupos-vida/casas-anfitrionas/page.tsx` — listing uses `obtener_casas_visibles_ids` then admin queries; should continue to separate ID authorization from enriched reads.
- `app/(auth)/grupos-vida/casas-anfitrionas/[id]/page.tsx` — detail uses admin read before visibility check and exposes edit/approval decisions from mixed role checks.
- `app/(auth)/grupos-vida/casas-anfitrionas/nueva/page.tsx` — creation UI includes `lider` and `director-etapa` in management-style owner selection; DE eligibility is group-leader based rather than director scope.
- `app/(auth)/grupos-vida/casas-anfitrionas/[id]/editar/page.tsx` — edit UI treats `director-etapa` as admin-like for all active groups and allows owner selection paths that need scoped validation.
- `components/grupos-vida/form-casa-anfitriona.tsx` — shared form carries `usuario_id` and `co_anfitrion_id`; should remain presentational and not encode permission truth.
- `supabase/migrations/20260312_002_casas_anfitrionas.sql` — current RLS is broad (`tiene_rol_de_liderazgo`) and does not express separate view/create/edit/approve/deactivate capabilities.
- `supabase/migrations/20260312_006_rpc_grupos_vida.sql` — defines `puede_gestionar_casas` and `procesar_aprobacion_casa_anfitriona`; key redesign target.
- `supabase/migrations/20260326_003_actualizar_rpcs_dg_filtro_de.sql` — latest `obtener_casas_visibles_ids` scope logic; should be reused or decomposed into granular predicates.
- `supabase/migrations/20260313_011_co_anfitrion_casas.sql` and `20260312_005_vistas_grupos_vida.sql` — available-house views only include approved/active houses and may need `security_invoker` or access review if exposed through Data API.
- `lib/actions/group.actions.ts`, `components/forms/GroupEditForm.tsx`, `app/(auth)/grupos-vida/[id]/GrupoDetailServer.tsx` — groups consume approved houses and display linked house details; selection should not permit out-of-scope house attachment.
- `__tests__/` and `supabase/tests/` — no Casas-specific test files found; new permission work needs server action/RPC safety tests or SQL preflight tests.
- `openspec/` — project has `openspec/specs/` and `openspec/changes/`, but no `openspec/config.yaml` was found during exploration.

### Approaches
1. **Granular database capability RPCs with UI alignment** — Add/replace RPC predicates such as `puede_ver_casa`, `puede_crear_casa_para_si`, `puede_crear_casa_para_usuario`, `puede_editar_casa`, `puede_aprobar_casa`, and `puede_cambiar_estado_casa`, then update server actions and UI to call them.
   - Pros: one authorization source of truth; fixes backend/RPC bypasses; safest for direct calls; supports scope-specific rules and future audit.
   - Cons: more SQL and tests; requires careful migration order and type regeneration.
   - Effort: High

2. **Patch existing coarse function and UI lists** — Narrow `puede_gestionar_casas`, remove `lider` from management UI, add ad-hoc detail checks, and keep current action shapes.
   - Pros: smaller initial diff; faster to review.
   - Cons: preserves ambiguous semantics; easy to reintroduce approval/create-for-other bugs; does not model self-create, scoped create-for-other, approval, edit, and deactivate separately.
   - Effort: Medium

3. **Capability table/policy layer** — Introduce persisted Casas capability assignments independent of roles and use RLS/RPCs around those capability rows.
   - Pros: flexible and auditable; can model exceptions.
   - Cons: overbuilt for current role hierarchy; adds admin UX/data migration complexity; risky while production Casas data is already suspect.
   - Effort: High

### Recommendation
Use Approach 1. Define granular, SECURITY DEFINER RPC predicates as the backend source of truth, and make UI decisions a projection of those predicates rather than separate role arrays. Keep the first migration additive/non-destructive: add new functions, optional audit/preflight helpers, and stricter server-action checks before retiring `puede_gestionar_casas` semantics. Do not correct existing production rows in this change; instead produce a separate read-only inventory and proposed reversible backfill/repair plan.

Recommended rule direction for proposal/spec/design:
- Admin/Pastor: broad view, create-for-self, create-for-other, edit, approve/reject, deactivate/reactivate.
- Director General: broad authority within `obtener_casas_visibles_ids`/DG scope; can likely approve within scope if product confirms.
- Director de Etapa: view/create/edit within assigned etapa scope; approval should be denied/escalated unless product explicitly grants it.
- Lider: create/suggest own or group-related house requests only; no official approval and no arbitrary create-for-other.
- Miembro/anfitrión: create own pending house request.
- Approved-house sensitive edits should either reset to pending or create a pending revision record; prefer reset-to-pending only if product accepts temporary unavailability, otherwise use a revision/request model.

### Risks
- Production data may already violate future rules; automatic cleanup could damage valid edge cases or break active groups.
- Direct detail/action routes currently need explicit visibility/scope checks before admin-enriched reads are trusted.
- Existing RLS policies are broad and may conflict with stricter server-action behavior unless redesigned carefully.
- Changing approval semantics for Director de Etapa may surprise users if they have been using backend/RPC paths.
- Resetting approved houses to pending after edits can disrupt active group assignments unless the lifecycle is specified precisely.
- No Casas-specific tests were found; untested SQL authorization changes are high-risk.

### Ready for Proposal
Yes — proceed to `sdd-propose`. The orchestrator should tell the user that exploration supports a granular-permission redesign with non-destructive migrations first, explicit product confirmation needed for DG approval and approved-house edit lifecycle, and a separate data-repair SDD/change for production cleanup.
