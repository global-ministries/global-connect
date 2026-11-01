'use client'

/**
 * Niños › Check-in — MESA, "Otra familia": search by phone or name
 * (ninos_buscar_familias), the error, "no match" and the list when several
 * families match. Picking one opens it at the mesa. Desktop: "/" focuses the
 * search (aria-keyshortcuts) and the key hints show under it (prototype 05).
 */
import type { ReactElement, Ref } from 'react'
import { ChevronRight, Search, Users } from 'lucide-react'

import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import type { FamiliaEncontrada } from '@/lib/platform/ninos/familias-vista'

import { Avatar, CLASE_LINEA_INSET, ListaInset, Tecla, TituloSeccion } from './partes'

export interface BuscadorFamiliaProps {
  readonly q: string
  readonly onQ: (q: string) => void
  readonly onBuscar: () => void
  readonly buscando: boolean
  readonly error: string | null
  /** Last results; null before searching. */
  readonly familias: readonly FamiliaEncontrada[] | null
  /** Show the pick list (several matches and none chosen). */
  readonly mostrarLista: boolean
  readonly onElegir: (f: FamiliaEncontrada) => void
  readonly refBuscar?: Ref<HTMLInputElement>
}

export function BuscadorFamilia({ refBuscar, ...p }: BuscadorFamiliaProps): ReactElement {
  return (
    <div className="grid min-w-0 gap-2">
      <TituloSeccion
        id="checkin-mesa"
        texto={
          <>
            <span className="lg:hidden">Otra familia</span>
            <span className="hidden lg:inline">Mesa</span>
          </>
        }
        pista="Teléfono completo o nombre"
      />
      <form
        role="search"
        className="flex min-w-0 items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          p.onBuscar()
        }}
      >
        <div className="min-w-0 flex-1">
          <InputSistema
            ref={refBuscar}
            aria-keyshortcuts="/"
            accesorio={<Tecla className="hidden lg:inline-grid">/</Tecla>}
            type="search"
            enterKeyHint="search"
            icono={Search}
            aria-label="Buscar familia por teléfono o nombre"
            placeholder="Teléfono o nombre"
            value={p.q}
            onChange={(e) => p.onQ(e.target.value)}
          />
        </div>
        <BotonSistema type="submit" soloIcono icono={Search} disabled={p.buscando} aria-label="Buscar" />
      </form>
      <p className="px-1 text-[13px] text-muted-foreground lg:hidden">Teléfono completo o nombre del papá, la mamá o el niño.</p>
      <p aria-hidden="true" className="hidden flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground lg:flex">
        <span className="inline-flex items-center gap-1.5">
          <Tecla>/</Tecla> buscar
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Tecla>Enter</Tecla> registrar familia marcada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Tecla>Esc</Tecla> cerrar panel
        </span>
      </p>

      {p.error && (
        <p role="alert" className="px-1 text-sm text-danger-text">
          {p.error}
        </p>
      )}
      {p.familias && p.familias.length === 0 && (
        <div className="rounded-2xl border border-border/60 bg-card">
          <EstadoVacioSistema
            icono={Users}
            className="py-8"
            titulo="No se encontraron familias."
            subtitulo="Prueba con otro teléfono o nombre, o registra una nueva familia."
          />
        </div>
      )}
      {p.mostrarLista && p.familias && p.familias.length > 1 && (
        <ListaInset etiqueta="Familias encontradas">
          {p.familias.map((f) => {
            const padres = f.padres.map((x) => `${x.nombre} ${x.apellido}`).join(' · ') || `${f.nombre} ${f.apellido}`
            return (
              <li key={f.id} className={CLASE_LINEA_INSET}>
                <button
                  type="button"
                  className="focus-ring flex min-h-16 w-full min-w-0 items-center gap-3 px-3.5 py-2.5 text-left touch-manipulation transition-colors active:bg-accent md:hover:bg-accent/50"
                  onClick={() => p.onElegir(f)}
                >
                  <Avatar nombre={f.nombre} apellido={f.apellido} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-foreground">{padres}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                      {f.hijos.map((h) => h.nombre).join(', ') || 'Sin niños registrados'}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            )
          })}
        </ListaInset>
      )}
    </div>
  )
}
