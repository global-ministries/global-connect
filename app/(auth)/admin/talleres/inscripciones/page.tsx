/**
 * PR42 + redesign — `/admin/talleres/inscripciones` (RSC).
 *
 * Global admin view of ALL inscripciones across ALL ediciones. The page
 * is restricted to director.write | admin.manage | coordinator.write;
 * the capability gate is the OUTER wall (the SELECT policy already
 * allows the same set to read every row, but the gate also excludes
 * participants who would otherwise see the page via the URL).
 *
 * Scope decision (PR42, owner-confirmed): this surface is SOLO for
 * director/admin/coordinator — NEVER for participants. The
 * participante surface (`/talleres/mis-talleres`) keeps the
 * participant's own inscripciones.
 *
 * Features:
 *   - List of every inscripcion, ordered by created_at DESC.
 *   - Filters (server-side via URL params): estado, edicion_id, taller_id.
 *   - Empty state when there are no rows.
 *   - Approve / Reject buttons for `pendiente` rows when the user
 *     holds at least one of the write capabilities. The participant
 *     sees the list but no buttons (the server action gates the
 *     mutation; the UI mirrors the gate so the visual is
 *     deterministic).
 *
 * RSC contract: the page is a server component. Filters come from
 * `searchParams` so they're sharable via URL. The table is rendered
 * through the shared `<TablaInscripciones>` server component, which
 * delegates the inline approve/reject UI to
 * `@/components/talleres/inscripcion-actions`. Server actions live in
 * `@/lib/platform/talleres/inscripciones-actions` (shared with the
 * coordinator pendientes surface).
 */

import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  ContenedorDashboard,
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import { TablaInscripciones } from '@/components/talleres/tabla-inscripciones'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import {
  loadAdminInscripciones,
  type InscripcionEstado,
} from '@/lib/platform/talleres/admin-inscripciones'
import {
  approveInscripcionAction,
  rejectInscripcionAction,
} from '@/lib/platform/talleres/inscripciones-actions'

export const metadata = { title: 'Inscripciones (global)' }

interface RouteContext {
  readonly searchParams: Promise<{
    readonly estado?: string
    readonly edicion?: string
    readonly taller?: string
  }>
}

// Whitelist of valid filters (defense against URL tampering).
const VALID_ESTADOS: readonly InscripcionEstado[] = [
  'pendiente',
  'aprobado',
  'no_aprobado',
  'completado',
]

function parseEstado(raw: string | undefined): InscripcionEstado | undefined {
  if (!raw) return undefined
  return VALID_ESTADOS.includes(raw as InscripcionEstado)
    ? (raw as InscripcionEstado)
    : undefined
}

export default async function AdminInscripcionesPage(ctx: RouteContext) {
  if (!isTalleresEnabled()) {
    return (
      <ContenedorDashboard titulo="Inscripciones (global)">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">El m\u00f3dulo de talleres est\u00e1 deshabilitado.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Capability gate (owner-confirmed audience: director / admin /
  // coordinator). The same gate is also enforced by the SELECT
  // RLS policy on `taller_inscripciones`, so this is defense-in-depth.
  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) =>
      findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  const caps = session?.capabilities.map((c) => c.key) ?? []
  const hasRead =
    caps.includes('talleres_crecimiento.director.read') ||
    caps.includes('talleres_crecimiento.admin.manage') ||
    caps.includes('talleres_crecimiento.coordinator.read')
  if (!hasRead) {
    return (
      <ContenedorDashboard titulo="Inscripciones (global)">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">
            No ten\u00e9s permiso para ver esta p\u00e1gina.
          </TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const hasWrite =
    caps.includes('talleres_crecimiento.director.write') ||
    caps.includes('talleres_crecimiento.admin.manage') ||
    caps.includes('talleres_crecimiento.coordinator.write')

  const params = await ctx.searchParams
  const filters = {
    estado: parseEstado(params.estado),
    edicion_id: params.edicion || undefined,
    taller_id: params.taller || undefined,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const { rows, total } = await loadAdminInscripciones(client, filters);

  return (
    <ContenedorDashboard
      titulo="Inscripciones (global)"
      botonRegreso={{ href: '/admin/talleres/abstracto', texto: 'Grupos de corto plazo' }}
    >
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <TituloSistema nivel={2} className="text-lg">
              Todas las inscripciones
            </TituloSistema>
            <TextoSistema variante="sutil" className="mt-1 block text-sm">
              {total === 0
                ? 'Sin resultados para los filtros actuales.'
                : `${total} inscripción${total === 1 ? '' : 'es'}`}
            </TextoSistema>
          </div>
          <FiltersBar
            currentEstado={filters.estado}
            currentEdicion={filters.edicion_id}
            currentTaller={filters.taller_id}
          />
        </div>
      </TarjetaSistema>

      {rows.length === 0 ? (
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No hay inscripciones para mostrar.</TextoSistema>
        </TarjetaSistema>
      ) : (
        <TablaInscripciones
          rows={rows}
          canWrite={hasWrite}
          onApprove={approveInscripcionAction}
          onReject={rejectInscripcionAction}
        />
      )}
    </ContenedorDashboard>
  )
}

function FiltersBar({
  currentEstado,
  currentEdicion,
  currentTaller,
}: {
  readonly currentEstado?: InscripcionEstado
  readonly currentEdicion?: string
  readonly currentTaller?: string
}): React.ReactElement {
  // Build a shared base href so the user can mix-and-match filters.
  const baseParams = new URLSearchParams()
  if (currentEdicion) baseParams.set('edicion', currentEdicion)
  if (currentTaller) baseParams.set('taller', currentTaller)

  function hrefForEstado(estado: InscripcionEstado | null): string {
    const params = new URLSearchParams(baseParams)
    if (estado) params.set('estado', estado)
    const qs = params.toString()
    return qs ? `/admin/talleres/inscripciones?${qs}` : '/admin/talleres/inscripciones'
  }

  const opciones: Array<{ label: string; value: InscripcionEstado | null }> = [
    { label: 'Todas', value: null },
    { label: 'Pendientes', value: 'pendiente' },
    { label: 'Aprobadas', value: 'aprobado' },
    { label: 'No aprobadas', value: 'no_aprobado' },
    { label: 'Completadas', value: 'completado' },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TextoSistema variante="sutil" className="text-xs uppercase tracking-wide">
        Estado
      </TextoSistema>
      {opciones.map((opt) => {
        const active = (currentEstado ?? null) === opt.value
        return (
          <Link
            key={opt.label}
            href={hrefForEstado(opt.value)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              active
                ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white'
                : 'border-border text-muted-foreground hover:bg-[var(--brand-accent)]'
            }`}
          >
            {opt.label}
          </Link>
        )
      })}
    </div>
  )
}