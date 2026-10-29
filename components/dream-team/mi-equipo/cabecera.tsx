'use client'

/**
 * Mi equipo — what sits above the toolbar (prototype `.crumbs`, `.hero-fila`,
 * `.m-cab`):
 * - `MigasMiEquipo`: the desktop breadcrumbs, "Dream Team / Mi equipo /
 *   <dirección> / <área> …", each level but the current one goes back there.
 * - `CabeceraMiEquipo`: on phones the "‹ padre" row with the Filtros button
 *   and the large title (an h2: the shell's phone header holds the page h1,
 *   "Mi equipo"); from md the hero (the one h1, 24px) with its summary; and
 *   the Dirección selector when the viewer reaches several (on phones only at
 *   the dirección level, deeper "‹ padre" walks back up).
 */
import type { ReactElement, ReactNode } from 'react'

import { SelectSistema } from '@/components/ui/sistema-diseno'
import { BotonFiltrosMovil } from '@/components/ui/barra-herramientas'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import type { MigaMiEquipo, NavegacionMiEquipo } from '@/lib/platform/dream-team/mi-equipo-filtros'
import type { DireccionResumen } from '@/lib/platform/dream-team/mi-equipo-vista'
import { cn } from '@/lib/utils'

const CLASE_MIGA = 'truncate px-2 py-1.5'

export function MigasMiEquipo({
  migas,
  onIr,
}: {
  readonly migas: readonly MigaMiEquipo[]
  readonly onIr: (miga: MigaMiEquipo) => void
}): ReactElement {
  const fijas = ['Dream Team', 'Mi equipo']
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
        {fijas.map((texto) => (
          <li key={texto} className="flex min-w-0 items-center gap-0.5">
            {texto !== fijas[0] && <Separador />}
            <span className={cn(CLASE_MIGA, 'text-muted-foreground')}>{texto}</span>
          </li>
        ))}
        {migas.map((miga, i) => (
          <li key={miga.id} className="flex min-w-0 items-center gap-0.5">
            <Separador />
            {i === migas.length - 1 ? (
              <span aria-current="page" className={cn(CLASE_MIGA, 'font-semibold text-foreground')}>
                {miga.etiqueta}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onIr(miga)}
                className={cn(
                  CLASE_MIGA,
                  'focus-ring rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11',
                )}
              >
                {miga.etiqueta}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

function Separador(): ReactElement {
  return (
    <span aria-hidden="true" className="px-0.5 text-muted-foreground/60">
      /
    </span>
  )
}

/** "Dirige <b>Ana Pérez</b> · <b>15</b> personas · 18 servicios" (servicios only when someone serves twice). */
export function ResumenMiEquipo({ navegacion }: { readonly navegacion: NavegacionMiEquipo }): ReactElement {
  const responsable = navegacion.responsable?.match(/^(\S+) (.+)$/)
  const { personas, servicios } = navegacion
  return (
    <>
      {responsable && (
        <>
          {responsable[1]} <strong className="font-semibold">{responsable[2]}</strong> ·{' '}
        </>
      )}
      <strong className="font-mono tabular-nums">{personas}</strong> {personas === 1 ? 'persona' : 'personas'}
      {servicios > personas && (
        <>
          {' · '}
          <span className="font-mono tabular-nums">{servicios}</span> servicios
        </>
      )}
    </>
  )
}

export interface CabeceraMiEquipoProps {
  readonly navegacion: NavegacionMiEquipo
  readonly direcciones: readonly DireccionResumen[]
  readonly direccionId: string
  readonly onDireccion: (direccionId: string) => void
  readonly onIr: (miga: MigaMiEquipo) => void
  /** The phone Filtros button; absent on the Calendario tab. */
  readonly filtros?: { readonly activos: number; readonly onAbrir: () => void }
}

export function CabeceraMiEquipo({
  navegacion,
  direcciones,
  direccionId,
  onDireccion,
  onIr,
  filtros,
}: CabeceraMiEquipoProps): ReactElement {
  const { padre } = navegacion
  const resumen: ReactNode = <ResumenMiEquipo navegacion={navegacion} />
  const varias = direcciones.length > 1
  const botonFiltros = filtros ? <BotonFiltrosMovil filtrosActivos={filtros.activos} onClick={filtros.onAbrir} /> : null

  return (
    <>
      <div data-slot="cabecera-movil" className="md:hidden">
        <div className={cn('flex items-center justify-between gap-2', padre ? '-mx-2 -mt-2 mb-1' : '-mr-2')}>
          {padre ? (
            <BotonAtrasMovil atras={{ etiqueta: padre.etiqueta, onClick: () => onIr(padre) }} className="max-w-[75%]" />
          ) : (
            <TituloGrande titulo={navegacion.titulo} nivel={2} resumen={resumen} className="min-w-0 flex-1" />
          )}
          {botonFiltros}
        </div>
        {padre && <TituloGrande titulo={navegacion.titulo} nivel={2} resumen={resumen} />}
      </div>

      <div
        className={cn(
          'flex-col gap-4 md:flex-row md:items-end md:justify-between',
          varias && !padre ? 'flex' : 'hidden md:flex',
        )}
      >
        <div className="hidden min-w-0 md:block">
          <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">{navegacion.titulo}</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
            {resumen}
          </p>
        </div>
        {varias && (
          <div className={cn('w-full md:w-[280px] md:shrink-0', padre && 'hidden md:block')}>
            <SelectSistema
              label="Dirección"
              opciones={direcciones.map((direccion) => ({ valor: direccion.id, etiqueta: direccion.label }))}
              value={direccionId}
              onValueChange={onDireccion}
            />
          </div>
        )}
      </div>
    </>
  )
}
