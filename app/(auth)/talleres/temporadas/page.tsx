/**
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/temporadas,
 * replacing app/(auth)/admin/talleres/temporadas/page.tsx (kept alive,
 * unmodified, until T10 deletes it — see lib/platform/talleres/rutas.ts).
 * A straight move, not a merge: this is a single object relocating out of
 * /admin, unlike T6/T7 (which fused several distinct old screens into
 * one). docs/talleres-de-punta-a-punta.md line 347 is explicit that a
 * temporada (which talleres open) and an edición's periodo/ventana (its
 * own enrollment window) are NOT the same object and must not be merged.
 *
 * GATE, same shape as T2/T6/T7: flag -> user -> session, each an
 * informational card. No role required — RLS on talleres_temporadas_select
 * (metrics.read | director.read | admin.manage) decides which rows come
 * back; zero rows renders EstadoVacio, not an error, exactly like T2's
 * catalog page opens to any signed-in user and lets RLS decide the content.
 *
 * PERMISSIONS: `puedeCrear` is a flat capability check (director.write OR
 * admin.manage), NOT `cargarPermisos(client, equipoId)` — see actions.ts's
 * header for the full evidence. Short version: talleres_temporadas' own
 * INSERT/UPDATE/DELETE RLS calls the UNSCOPED `auth_has_talleres_
 * capability` (any grant, any scope), while `cargarPermisos(client, null)`
 * calls a DIFFERENT, narrower function that only matches a truly global
 * grant — it would wrongly hide "Crear Temporada" from a director scoped
 * to one branch, exactly the failure mode app/(auth)/talleres/page.tsx
 * (T2) already documents for its own `puedeCrear`. Temporadas share T2's
 * create_taller_abstract capability pair, so this is the same predicate,
 * not a new one.
 */

import Link from 'next/link'
import { CalendarRange } from 'lucide-react'

import {
  ContenedorDashboard,
  BotonSistema,
  TarjetaSistema,
  TextoSistema,
  BadgeSistema,
} from '@/components/ui/sistema-diseno'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { temporadaEstadoLabel, temporadaEstadoBadgeVariante } from '@/components/talleres/labels'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { loadTemporadas } from '@/lib/platform/talleres/temporadas'
import { rutaTemporada, rutaTemporadaCrear } from '@/lib/platform/talleres/rutas'

export const metadata = { title: 'Temporadas' }

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export default async function TemporadasPage() {
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
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  if (!session) {
    return (
      <ContenedorDashboard titulo="Temporadas">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">No se pudo resolver tu sesión.</TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  const caps = session.capabilities.map((c) => c.key)
  const puedeCrear =
    caps.includes('talleres_crecimiento.director.write') ||
    caps.includes('talleres_crecimiento.admin.manage')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const rows = await loadTemporadas(client)

  return (
    <ContenedorDashboard
      titulo="Temporadas"
      subtitulo="Qué talleres abren inscripción a la vez, en todo el programa."
      accionPrincipal={
        puedeCrear ? (
          <Link href={rutaTemporadaCrear()}>
            <BotonSistema type="button" variante="primario">
              Crear Temporada
            </BotonSistema>
          </Link>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EstadoVacio
          icono={CalendarRange}
          titulo="No hay temporadas todavía"
          subtitulo={puedeCrear ? 'Usá "Crear Temporada" para abrir la primera.' : undefined}
        />
      ) : (
        <>
          {/* Desktop — table */}
          <div className="hidden md:block overflow-hidden">
            <TarjetaSistema className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Temporada
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Fechas
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <Link
                            href={rutaTemporada(t.id)}
                            className="text-sm font-medium text-foreground hover:underline"
                          >
                            {t.nombre}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            <code>{t.slug}</code>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatFecha(t.fecha_apertura)} → {formatFecha(t.fecha_cierre)}
                      </td>
                      <td className="px-4 py-3">
                        <BadgeSistema variante={temporadaEstadoBadgeVariante(t.estado)} tamaño="sm">
                          {temporadaEstadoLabel(t.estado)}
                        </BadgeSistema>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TarjetaSistema>
          </div>

          {/* Mobile — cards */}
          <div className="md:hidden space-y-3">
            {rows.map((t) => (
              <Link key={t.id} href={rutaTemporada(t.id)} className="block">
                <TarjetaSistema variante="outlined" className="p-4 min-h-[44px]">
                  <TextoSistema className="text-sm font-medium">{t.nombre}</TextoSistema>
                  <TextoSistema variante="sutil" className="mt-1 block text-xs">
                    <code>{t.slug}</code> · {formatFecha(t.fecha_apertura)} → {formatFecha(t.fecha_cierre)}
                  </TextoSistema>
                  <div className="mt-2">
                    <BadgeSistema variante={temporadaEstadoBadgeVariante(t.estado)} tamaño="sm">
                      {temporadaEstadoLabel(t.estado)}
                    </BadgeSistema>
                  </div>
                </TarjetaSistema>
              </Link>
            ))}
          </div>
        </>
      )}
    </ContenedorDashboard>
  )
}
