/**
 * PR C (Fase 5 GdV-parity) — /admin/talleres/temporadas (RSC list).
 *
 * The Dirección entry-point for global seasons (talleres_temporadas), the
 * mirror of the Grupos de Vida temporadas list. A season groups WHICH talleres
 * open enrollment (via the talleres_temporada_talleres junction, managed from
 * the detail page). Read is director.read / metrics.read / admin.manage viewable
 * (RLS parity); the "Crear Temporada" action shows only for write-capable users.
 */

import Link from 'next/link'

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

export const metadata = { title: 'Temporadas de Talleres' }

type TemporadaEstado = 'borrador' | 'abierto' | 'cerrado' | 'cancelado'

interface TemporadaRow {
  id: string
  nombre: string
  slug: string
  estado: TemporadaEstado
  fecha_apertura: string
  fecha_cierre: string
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

export default async function TalleresTemporadasPage() {
  if (!isTalleresEnabled()) {
    return (
      <ContenedorDashboard titulo="Temporadas">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">El módulo de talleres está deshabilitado.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) {
    return (
      <ContenedorDashboard titulo="Temporadas">
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
      <ContenedorDashboard titulo="Temporadas">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No tenés permisos para ver las temporadas.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }
  const canWrite =
    caps.includes('talleres_crecimiento.director.write') ||
    caps.includes('talleres_crecimiento.admin.manage')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const { data: temporadasData } = await client
    .from('talleres_temporadas')
    .select('id, nombre, slug, estado, fecha_apertura, fecha_cierre')
    .order('fecha_apertura', { ascending: false })
    .limit(100)

  const temporadas: TemporadaRow[] = (temporadasData ?? []) as TemporadaRow[]

  return (
    <ContenedorDashboard
      titulo="Temporadas"
      accionPrincipal={
        canWrite ? (
          <Link
            href="/admin/talleres/temporadas/crear"
            className="inline-flex items-center gap-2 rounded bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white"
          >
            Crear Temporada
          </Link>
        ) : undefined
      }
    >
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <TextoSistema variante="sutil" className="text-sm">
          Una temporada agrupa qué talleres abren inscripción a la vez (el equivalente global de las
          ediciones). Creá una temporada, elegí qué talleres abren desde su detalle y abrí sus
          ediciones vinculadas.
        </TextoSistema>
      </TarjetaSistema>

      {temporadas.length === 0 ? (
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">
            Todavía no hay temporadas.{canWrite ? ' Usá "Crear Temporada" para abrir la primera.' : ''}
          </TextoSistema>
        </TarjetaSistema>
      ) : (
        <ul className="grid gap-3">
          {temporadas.map((t) => (
            <li key={t.id}>
              <TarjetaSistema variante="elevated" className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <Link
                      href={`/admin/talleres/temporadas/${t.id}`}
                      className="font-medium hover:underline"
                    >
                      {t.nombre}
                    </Link>
                    <TextoSistema variante="sutil" className="mt-1 block text-sm">
                      <code>{t.slug}</code>
                      {' · '}
                      {new Date(t.fecha_apertura).toLocaleDateString('es')}
                      {' → '}
                      {new Date(t.fecha_cierre).toLocaleDateString('es')}
                    </TextoSistema>
                  </div>
                  <BadgeSistema variante={estadoBadgeVariante(t.estado)}>{t.estado}</BadgeSistema>
                </div>
              </TarjetaSistema>
            </li>
          ))}
        </ul>
      )}
    </ContenedorDashboard>
  )
}
