'use server'

/**
 * PR23.2a — Server actions for the admin abstract-taller edición screen.
 *
 * T7 hardening (odd/tasks/talleres-temporadas-y-ediciones.md, item 4,
 * 20260928140000_talleres_paso6_hardening.sql) — the `openEdicion` action
 * that used to live here (wrapping the legacy 11-arg `public.open_edicion`
 * RPC) is REMOVED: that RPC no longer grants EXECUTE to authenticated,
 * since it never enforced any of paso 6's own rules (dates, temporada
 * state, cupo, …). Every real "create an edición" path now goes through
 * `talleres_crear_edicion` (components/talleres/open-edicion-form.tsx →
 * app/(auth)/talleres/[taller]/actions.ts's `crearEdicion`) or the
 * temporada RPCs. `OpenEdicionForm` already stopped importing this file's
 * `openEdicion` when it was rewritten in T4 — verified with rg before
 * deleting it here that nothing else imports it either (only its own now-
 * deleted test, __tests__/app/auth/admin/talleres/abstracto/openEdicion-
 * actions.test.ts, did).
 */

import { redirect } from 'next/navigation'

export async function redirectToEdicion(tallerSlug: string, edicionId: string): Promise<never> {
  redirect(`/admin/talleres/edicion/${edicionId}`)
}
