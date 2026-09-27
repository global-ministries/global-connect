/**
 * T8 (odd/tasks/talleres-consolidar-pantallas.md) — /talleres/temporadas,
 * replacing app/(auth)/admin/talleres/temporadas/page.tsx (kept alive,
 * unmodified, until T10 deletes it — see lib/platform/talleres/rutas.ts).
 *
 * T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — rewritten to
 * list temporadas GROUPED BY DIRECCIÓN (root Dream Team node label), now
 * that talleres_temporadas has an owner (T3, migration
 * 20260928120000_talleres_temporadas_por_direccion.sql): each dirección
 * gets its own heading, then a `TarjetaSistema p-0 divide-y` of its own
 * temporadas — nombre, state badge, "{apertura} → {cierre}", and
 * "N talleres · M ediciones" (loadTemporadas' own per-temporada counts).
 * A dirección with zero temporadas is simply never shown (RLS on
 * talleres_temporadas still decides which rows a caller sees at all).
 *
 * GATE, same shape as T2/T6/T7: flag -> user -> session, each an
 * informational card. No role required.
 *
 * PERMISSIONS: `puedeCrear` (the header's "Crear Temporada" CTA) is true
 * when at least one dirección from `loadDireccionesConTalleres` carries
 * `puedeEditar` — that loader's own `cargarPermisos(client,
 * raiz.id).editarTaller`, the SAME predicate /talleres/[taller] uses for
 * its own `editarTaller`, never a flat `caps.includes(...)` check.
 */

import Link from 'next/link'
import { CalendarRange, ChevronRight } from 'lucide-react'

import {
  ContenedorDashboard,
  BotonSistema,
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
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
import {
  loadTemporadas,
  loadDireccionesConTalleres,
  type TemporadaRow,
} from '@/lib/platform/talleres/temporadas'
import { rutaTemporada, rutaTemporadaCrear } from '@/lib/platform/talleres/rutas'

export const metadata = { title: 'Temporadas' }

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function contarLabel(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
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
          <TextoSistema variante="sutil">Necesitas iniciar sesión.</TextoSistema>
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const [direcciones, rows] = await Promise.all([
    loadDireccionesConTalleres(client),
    loadTemporadas(client),
  ])

  const puedeCrear = direcciones.some((d) => d.puedeEditar)

  const rowsPorDireccion = new Map<string, TemporadaRow[]>()
  for (const row of rows) {
    const lista = rowsPorDireccion.get(row.dream_team_equipo_id)
    if (lista) lista.push(row)
    else rowsPorDireccion.set(row.dream_team_equipo_id, [row])
  }

  const grupos = direcciones
    .map((direccion) => ({ direccion, temporadas: rowsPorDireccion.get(direccion.id) ?? [] }))
    .filter((grupo) => grupo.temporadas.length > 0)

  return (
    <ContenedorDashboard
      titulo="Temporadas"
      subtitulo="Qué talleres abren inscripción a la vez, por dirección."
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
      {grupos.length === 0 ? (
        <EstadoVacio
          icono={CalendarRange}
          titulo="Tu dirección todavía no tiene temporadas"
          subtitulo={puedeCrear ? 'Usa "Crear Temporada" para abrir la primera.' : undefined}
        />
      ) : (
        <div className="grid gap-6">
          {grupos.map(({ direccion, temporadas }) => (
            <section key={direccion.id} aria-labelledby={`direccion-${direccion.id}-heading`}>
              <TituloSistema nivel={2} id={`direccion-${direccion.id}-heading`}>
                {direccion.label}
              </TituloSistema>
              <TarjetaSistema className="mt-3 p-0">
                <div className="divide-y divide-border">
                  {temporadas.map((t) => (
                    <Link
                      key={t.id}
                      href={rutaTemporada(t.id)}
                      className="flex items-center gap-3 p-4 transition-colors hover:bg-accent"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 break-words font-medium text-foreground">{t.nombre}</span>
                          <BadgeSistema variante={temporadaEstadoBadgeVariante(t.estado)} tamaño="sm">
                            {temporadaEstadoLabel(t.estado)}
                          </BadgeSistema>
                        </div>
                        <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                          {formatFecha(t.fecha_apertura)} → {formatFecha(t.fecha_cierre)}
                          {' · '}
                          {contarLabel(t.tallerCount, 'taller', 'talleres')}
                          {' · '}
                          {contarLabel(t.edicionCount, 'edición', 'ediciones')}
                        </TextoSistema>
                      </div>
                      <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </TarjetaSistema>
            </section>
          ))}
        </div>
      )}
    </ContenedorDashboard>
  )
}
