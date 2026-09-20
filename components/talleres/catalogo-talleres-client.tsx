'use client'

/**
 * T2 (odd/tasks/talleres-consolidar-pantallas.md) — the interactive body
 * of the new `/talleres` catalog (app/(auth)/talleres/page.tsx).
 *
 * Renders, in order, only the sections that have something to show for
 * THIS viewer (docs/talleres-de-punta-a-punta.md §8's consolidation
 * principle — the base decides scope, the page never branches by role):
 *
 *   1. "Mis grupos" — only when `misGrupos` is non-empty (the viewer
 *      leads at least one grupo).
 *   2. "Catálogo" — the talleres this viewer's RLS grants let them see,
 *      each with its ediciones nested, plus a client-side "todas" /
 *      "abiertas" filter/tab (replaces the old
 *      /talleres/direccion/periodos "all open windows" page).
 *   3. "Crear taller" — the existing `CrearTallerAbstractoForm`, shown
 *      only when `puedeCrear` (see the page for why that's a flat
 *      capability check rather than `cargarPermisos`: creating a taller
 *      has no existing object/equipo to scope the check against, and
 *      the check mirrors create_taller_abstract's OWN gate, which is
 *      itself unscoped).
 *
 * When there is truly nothing to show (no grupos, no visible talleres,
 * no create permission), one page-wide `EstadoVacio` replaces all of
 * the above — the explorar link itself lives in the page's header
 * (`accionPrincipal`), not here, so it stays visible even when this
 * component has content to show.
 *
 * Row anatomy for a taller follows docs §9 ("Filas y jerarquía"): name +
 * estado badge, one muted metadata line, then its ediciones nested
 * underneath with the tree indentation/border convention the doc names
 * this exact catalog as the reference example for.
 */

import { useState, type ReactElement } from 'react'
import { Calendar, LayoutGrid, Users } from 'lucide-react'

import { BadgeSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacio } from '@/components/dream-team/estado-vacio'
import { CrearTallerAbstractoForm } from './crear-taller-form'
import {
  edicionEstadoBadgeVariante,
  edicionEstadoLabel,
  tallerEstadoBadgeVariante,
  tallerEstadoLabel,
} from './labels'
import type { CatalogoTaller, MiGrupoResumen } from '@/lib/platform/talleres/catalogo'
import type { OpcionesEquipoTaller } from '@/lib/platform/talleres/equipo-organigrama'

type Filtro = 'todas' | 'abiertas'
const ESTADOS_ABIERTOS = new Set(['abierto', 'en_curso'])

export interface CatalogoTalleresClientProps {
  readonly catalogo: readonly CatalogoTaller[]
  readonly misGrupos: readonly MiGrupoResumen[]
  readonly puedeCrear: boolean
  readonly opciones: OpcionesEquipoTaller
}

function formatearFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function sumaInscripciones(taller: CatalogoTaller): number {
  return taller.ediciones.reduce((total, e) => total + e.total_inscripciones, 0)
}

export function CatalogoTalleresClient({
  catalogo,
  misGrupos,
  puedeCrear,
  opciones,
}: CatalogoTalleresClientProps): ReactElement {
  const [filtro, setFiltro] = useState<Filtro>('todas')

  const catalogoFiltrado =
    filtro === 'todas'
      ? catalogo
      : catalogo
          .map((t) => ({ ...t, ediciones: t.ediciones.filter((e) => ESTADOS_ABIERTOS.has(e.estado)) }))
          .filter((t) => t.ediciones.length > 0)

  const sinNadaEnAbsoluto = misGrupos.length === 0 && catalogo.length === 0 && !puedeCrear

  if (sinNadaEnAbsoluto) {
    return (
      <EstadoVacio
        icono={LayoutGrid}
        titulo="Aún no hay talleres para vos"
        subtitulo="Explorá los talleres abiertos para inscribirte — el enlace está arriba, en Explorar."
      />
    )
  }

  return (
    <div className="space-y-6">
      {misGrupos.length > 0 && (
        <section aria-labelledby="mis-grupos-heading">
          <h2 id="mis-grupos-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
            Mis grupos
          </h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {misGrupos.map((g) => (
              <li key={g.id}>
                <TarjetaSistema variante="elevated" className="p-4">
                  <div className="flex items-start gap-3">
                    <Users className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <TextoSistema className="font-medium">{g.nombre}</TextoSistema>
                      <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                        {[g.tallerNombre, g.edicionNombre].filter(Boolean).join(' · ') || '—'}
                      </TextoSistema>
                      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                        <span>
                          {g.proximaClase
                            ? `Próxima clase: ${formatearFecha(g.proximaClase)}`
                            : 'Sin próxima clase programada'}
                        </span>
                      </div>
                    </div>
                  </div>
                </TarjetaSistema>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="catalogo-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="catalogo-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
            Catálogo
          </h2>
          <div className="inline-flex rounded-xl border border-border p-1" role="group" aria-label="Filtrar ediciones">
            {(['todas', 'abiertas'] as const).map((opcion) => (
              <button
                key={opcion}
                type="button"
                onClick={() => setFiltro(opcion)}
                aria-pressed={filtro === opcion}
                className={
                  'min-h-[44px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ' +
                  (filtro === opcion ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')
                }
              >
                {opcion === 'todas' ? 'Todas' : 'Abiertas'}
              </button>
            ))}
          </div>
        </div>

        {puedeCrear && (
          <div className="mb-4">
            <CrearTallerAbstractoForm opciones={opciones} />
          </div>
        )}

        {catalogoFiltrado.length === 0 ? (
          <EstadoVacio
            icono={LayoutGrid}
            titulo={
              filtro === 'abiertas'
                ? 'No hay ediciones abiertas ahora mismo'
                : 'Aún no hay talleres registrados'
            }
          />
        ) : (
          <ul className="grid gap-3">
            {catalogoFiltrado.map((t) => (
              <li key={t.id}>
                <TarjetaSistema variante="outlined" className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words font-medium text-foreground">{t.nombre}</span>
                    <BadgeSistema variante={tallerEstadoBadgeVariante(t.estado)} tamaño="sm">
                      {tallerEstadoLabel(t.estado)}
                    </BadgeSistema>
                  </div>
                  <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                    {t.ediciones.length === 0
                      ? 'Sin ediciones'
                      : `${t.ediciones.length} ${t.ediciones.length === 1 ? 'edición' : 'ediciones'} · ${sumaInscripciones(t)} inscripciones`}
                  </TextoSistema>

                  {t.ediciones.length > 0 && (
                    <ul className="mt-2 space-y-1.5 border-l border-border pl-3">
                      {t.ediciones.map((e) => (
                        <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                          <TextoSistema tamaño="sm">{e.nombre_snapshot}</TextoSistema>
                          <div className="flex items-center gap-2">
                            <BadgeSistema variante={edicionEstadoBadgeVariante(e.estado)} tamaño="sm">
                              {edicionEstadoLabel(e.estado)}
                            </BadgeSistema>
                            <BadgeSistema variante="info" tamaño="sm">
                              {e.total_inscripciones} inscritos
                            </BadgeSistema>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </TarjetaSistema>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
