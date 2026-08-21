/**
 * PR C (Fase 5 GdV-parity) — /admin/talleres/temporadas/[id] (RSC detail).
 *
 * The control surface for a single global season. Lists every active taller
 * with a checkbox reflecting talleres_temporada_talleres membership (the
 * "elijo qué talleres abren" flow), plus estado-transition buttons. Reads are
 * director.read/metrics.read/admin.manage viewable; writes gate on
 * director.write OR admin.manage (client actions re-check + RLS enforces).
 */

import { notFound } from 'next/navigation'

import {
  ContenedorDashboard,
  TarjetaSistema,
  TextoSistema,
  BadgeSistema,
} from '@/components/ui/sistema-diseno'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

import { TemporadaDetailClient } from './temporada-detail-client'

export const metadata = { title: 'Temporada' }

type TemporadaEstado = 'borrador' | 'abierto' | 'cerrado' | 'cancelado'

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

interface TemporadaRow {
  id: string
  nombre: string
  slug: string
  descripcion: string | null
  estado: TemporadaEstado
  fecha_apertura: string
  fecha_cierre: string
}

interface TallerOption {
  id: string
  nombre: string
  slug: string
}

const READ_CAPS = [
  'talleres_crecimiento.director.read',
  'talleres_crecimiento.metrics.read',
  'talleres_crecimiento.admin.manage',
  'talleres_crecimiento.director.write',
]

function estadoBadgeVariante(
  estado: TemporadaEstado,
): 'default' | 'success' | 'warning' | 'error' | 'info' {
  switch (estado) {
    case 'abierto':
      return 'success'
    case 'borrador':
      return 'info'
    case 'cancelado':
      return 'error'
    case 'cerrado':
    default:
      return 'default'
  }
}

export default async function TemporadaDetailPage(ctx: RouteContext) {
  if (!isTalleresEnabled()) {
    return (
      <ContenedorDashboard titulo="Temporada">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">El módulo de talleres está deshabilitado.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const { id } = await ctx.params

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return (
      <ContenedorDashboard titulo="Temporada">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">Necesitás iniciar sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) =>
      findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  const caps = session?.capabilities.map((c) => c.key) ?? []
  const canRead = READ_CAPS.some((c) => caps.includes(c))
  if (!canRead) {
    return (
      <ContenedorDashboard titulo="Temporada">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No tenés permisos para ver esta temporada.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }
  const canWrite =
    caps.includes('talleres_crecimiento.director.write') ||
    caps.includes('talleres_crecimiento.admin.manage')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const { data: temporadaData, error: temporadaError } = await client
    .from('talleres_temporadas')
    .select('id, nombre, slug, descripcion, estado, fecha_apertura, fecha_cierre')
    .eq('id', id)
    .maybeSingle()

  if (temporadaError || !temporadaData) {
    notFound()
  }
  const temporada = temporadaData as TemporadaRow

  // All active talleres (toggle candidates) + current junction membership.
  const [{ data: talleresData }, { data: junctionData }] = await Promise.all([
    client
      .from('talleres')
      .select('id, nombre, slug')
      .eq('estado', 'active')
      .order('nombre', { ascending: true })
      .limit(200),
    client
      .from('talleres_temporada_talleres')
      .select('taller_id')
      .eq('temporada_id', temporada.id),
  ])

  const talleres: TallerOption[] = (talleresData ?? []) as TallerOption[]
  const selectedTallerIds: string[] = ((junctionData ?? []) as { taller_id: string }[]).map(
    (r) => r.taller_id,
  )

  return (
    <ContenedorDashboard
      titulo={temporada.nombre}
      botonRegreso={{ href: '/admin/talleres/temporadas', texto: 'Temporadas' }}
    >
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1">
            <TextoSistema className="text-sm text-muted-foreground">
              <code>{temporada.slug}</code>
            </TextoSistema>
            {temporada.descripcion && (
              <TextoSistema className="mt-2 block">{temporada.descripcion}</TextoSistema>
            )}
            <TextoSistema variante="sutil" className="mt-2 block text-sm">
              {new Date(temporada.fecha_apertura).toLocaleDateString('es')}
              {' → '}
              {new Date(temporada.fecha_cierre).toLocaleDateString('es')}
            </TextoSistema>
          </div>
          <BadgeSistema variante={estadoBadgeVariante(temporada.estado)}>
            {temporada.estado}
          </BadgeSistema>
        </div>
      </TarjetaSistema>

      <TemporadaDetailClient
        temporadaId={temporada.id}
        estado={temporada.estado}
        canWrite={canWrite}
        talleres={talleres}
        selectedTallerIds={selectedTallerIds}
      />
    </ContenedorDashboard>
  )
}
