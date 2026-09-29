'use client'

/**
 * Grupos de Vida — client island for /grupos-vida/directores.
 *
 * Every rule lives in the pure view model (lib/platform/grupos-vida/
 * directores-vista.ts); the server page (RSC) loads the rows and hands this
 * island plain serializable data. The island renders the header, the "Por
 * ordenar" strip and the two tabs (general directors, stage directors); the tab
 * is mirrored in the URL (`?tab=generales|etapa`) with `router.replace`, and the
 * search and segment filter of the stage directors stay in local state.
 *
 * Saves go through `useGuardarCambio`: a change shows at once, the control is
 * disabled while it saves and a failure restores the previous value. In
 * read-only mode (a director general viewing their own card) there is no
 * primary action and no control.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Plus, Users } from 'lucide-react'

import { ContenedorDashboard, InputSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import { filtrarDirectoresEtapa, type VistaDirectores } from '@/lib/platform/grupos-vida/directores-vista'
import { AgregarDirectorDialog } from './agregar-director-dialog'
import { FranjaPorOrdenar, ANILLO } from './franja-por-ordenar'
import { TablaDirectoresEtapa } from './tabla-directores-etapa'
import { TarjetaDirectorGeneral } from './tarjeta-director-general'
import { useGuardarCambio } from './use-guardar-cambio'

export type PestanaDirectores = 'generales' | 'etapa'

export interface DirectoresClientProps {
  readonly vista: VistaDirectores
  readonly tabInicial: PestanaDirectores
}

const SUBTITULO = 'Directores generales y de etapa de Grupos de Vida'

function Contador({ n }: { readonly n: number }): ReactElement {
  return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-foreground">{n}</span>
}

export function DirectoresClient({ vista, tabInicial }: DirectoresClientProps): ReactElement {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const guardado = useGuardarCambio(vista.generales)

  const [pestana, setPestana] = useState<PestanaDirectores>(tabInicial)
  const [q, setQ] = useState('')
  const [segmentoId, setSegmentoId] = useState<string | null>(null)
  const [agregando, setAgregando] = useState(false)

  const resultado = useMemo(
    () => filtrarDirectoresEtapa(vista.etapa, vista.segmentos, { q, segmentoId }),
    [vista.etapa, vista.segmentos, q, segmentoId],
  )

  function elegirPestana(siguiente: PestanaDirectores): void {
    setPestana(siguiente)
    router.replace(siguiente === 'generales' ? pathname : `${pathname}?tab=${siguiente}`, { scroll: false })
  }

  const puedeAgregar = !vista.soloLectura

  const botonAgregar = (clases: string): ReactElement => (
    <button
      type="button"
      onClick={() => setAgregando(true)}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary)] px-4 text-sm font-bold text-white transition-opacity hover:opacity-90',
        ANILLO,
        clases,
      )}
    >
      <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
      Agregar director
    </button>
  )

  return (
    <ContenedorDashboard titulo="Directores" accionPrincipal={puedeAgregar ? botonAgregar('hidden md:inline-flex') : null}>
      <p className="-mt-2 text-sm text-muted-foreground md:text-[15px]">{SUBTITULO}</p>

      <FranjaPorOrdenar items={vista.porOrdenar} />

      <div role="tablist" aria-label="Tipo de director" className="flex gap-2 border-b border-border">
        {(
          [
            ['generales', 'Directores generales', vista.totales.generales],
            ['etapa', 'Directores de etapa', vista.totales.etapa],
          ] as const
        ).map(([valor, etiqueta, cantidad]) => {
          const activa = pestana === valor
          return (
            <button
              key={valor}
              type="button"
              role="tab"
              id={`pestana-${valor}`}
              aria-selected={activa}
              aria-controls={`panel-${valor}`}
              onClick={() => elegirPestana(valor)}
              className={cn(
                '-mb-px flex min-h-[48px] items-center gap-2 border-b-2 px-3 text-[15px] font-semibold transition-colors sm:px-4',
                activa
                  ? 'border-[var(--brand-primary)] text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
                ANILLO,
              )}
            >
              {etiqueta} <Contador n={cantidad} />
            </button>
          )
        })}
      </div>

      {pestana === 'generales' ? (
        <div role="tabpanel" id="panel-generales" aria-label="Directores generales" className="flex flex-col gap-4">
          {vista.generales.length === 0 ? (
            <TarjetaSistema className="p-8">
              <div className="flex flex-col items-center gap-3 text-center">
                <Users className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
                <p className="font-medium text-muted-foreground">Aún no hay directores generales</p>
              </div>
            </TarjetaSistema>
          ) : (
            vista.generales.map((tarjeta) => <TarjetaDirectorGeneral key={tarjeta.usuarioId} tarjeta={tarjeta} guardado={guardado} />)
          )}
        </div>
      ) : (
        <div role="tabpanel" id="panel-etapa" aria-label="Directores de etapa" className="flex flex-col gap-4">
          <div className="max-w-[420px]">
            <InputSistema
              type="search"
              label="Buscar director"
              placeholder="Nombre del director"
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div role="group" aria-label="Filtrar por segmento" className="flex flex-wrap gap-2">
            {resultado.chips.map((chip) => (
              <button
                key={chip.id ?? 'todos'}
                type="button"
                aria-pressed={chip.activo}
                onClick={() => setSegmentoId(chip.id)}
                className={cn(
                  'flex min-h-[44px] items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors',
                  chip.activo
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-accent-strong)] text-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                  ANILLO,
                )}
              >
                {chip.label} <span className="font-bold tabular-nums text-foreground">{chip.cantidad}</span>
              </button>
            ))}
          </div>

          {resultado.filas.length === 0 ? (
            <TarjetaSistema className="p-8">
              <div className="text-center">
                <p className="text-base font-semibold text-foreground">Ningún director coincide con la búsqueda</p>
                <p className="mt-1.5 text-sm text-muted-foreground">Cambia el texto o elige otro segmento.</p>
              </div>
            </TarjetaSistema>
          ) : (
            <TablaDirectoresEtapa filas={resultado.filas} />
          )}
          <p className="px-1 text-[13px] text-muted-foreground">{resultado.pie}</p>
        </div>
      )}

      {puedeAgregar && botonAgregar('w-full md:hidden')}

      {puedeAgregar && <AgregarDirectorDialog abierto={agregando} onClose={() => setAgregando(false)} segmentos={vista.segmentos} />}
    </ContenedorDashboard>
  )
}
