'use client'

/**
 * Niños › Salones — one carpeta (artboard `.cd` per area): Waumba Land or
 * UpStreet with its salones in fill order, the distribution (En orden ·
 * Equilibrada) and "Mantener a los regulares en su salón", which save at once.
 * From md the salones line up as a table (#, Salón, Quién entra, Cupo,
 * Voluntarios, Opciones, Estado); on phones each salón is a block. The name
 * opens the salón's panel; so does a click anywhere on the row.
 */
import type { ReactElement } from 'react'
import { ChevronRight, Folder } from 'lucide-react'

import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { Interruptor } from '@/components/ui/interruptor'
import { PuntoEstado } from '@/components/ui/punto-estado'
import {
  NOMBRE_AREA,
  textoQuienEntra,
  textoVoluntarios,
  type CarpetaAdmin,
  type SalonAdmin,
} from '@/lib/platform/ninos/salones-reglas'
import type { Distribucion } from '@/lib/platform/ninos/sugerir-salon'
import { cn } from '@/lib/utils'

const COLUMNAS =
  'md:grid md:grid-cols-[32px_minmax(0,1.3fr)_minmax(0,1.4fr)_72px_minmax(0,1fr)_minmax(0,1fr)_96px] md:items-center md:gap-2'

const OPCIONES_DISTRIBUCION: readonly { valor: Distribucion; etiqueta: string }[] = [
  { valor: 'en_orden', etiqueta: 'En orden' },
  { valor: 'equilibrada', etiqueta: 'Equilibrada' },
]

function Etiqueta({ children }: { readonly children: string }): ReactElement {
  return (
    <span className="inline-flex h-5 items-center rounded-md border border-border bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
      {children}
    </span>
  )
}

function FilaSalon({
  salon,
  numero,
  actual,
  onAbrir,
}: {
  readonly salon: SalonAdmin
  readonly numero: number
  readonly actual: boolean
  readonly onAbrir: (id: string) => void
}): ReactElement {
  const quien = textoQuienEntra(salon)
  return (
    <li
      data-testid={`salon-${salon.id}`}
      onClick={() => onAbrir(salon.id)}
      className={cn(
        'grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-border/60 px-3 py-2.5 last:border-b-0 hover:bg-accent md:min-h-11 md:py-1',
        COLUMNAS,
        actual && 'bg-brand-tint shadow-[inset_3px_0_0_var(--brand-primary)]',
        !salon.abierto && 'text-muted-foreground',
      )}
    >
      <span aria-hidden="true" className="hidden size-[22px] place-items-center rounded-md bg-muted font-mono text-[11px] tabular-nums text-muted-foreground md:inline-grid">
        {numero}
      </span>
      <span className="min-w-0">
        <button
          type="button"
          aria-label={`Editar ${salon.nombre}`}
          aria-haspopup="dialog"
          onClick={(e) => {
            e.stopPropagation()
            onAbrir(salon.id)
          }}
          className="focus-ring block max-w-full truncate rounded-md text-left text-[13px] font-semibold text-foreground pointer-coarse:min-h-11"
        >
          {salon.nombre}
        </button>
      </span>
      <span className="col-start-1 truncate text-xs text-muted-foreground md:col-auto md:text-[13px] md:text-inherit" title={quien}>
        {quien}
      </span>
      <span className="col-start-1 text-xs md:col-auto md:text-[13px]">
        <span className="text-muted-foreground md:sr-only">Cupo: </span>
        <span className="font-mono tabular-nums">
          {salon.capacidad} + {salon.cupoVisitantes}
        </span>
        <span className="sr-only"> regulares más visitantes</span>
      </span>
      <span className="col-start-1 truncate text-xs md:col-auto md:text-[13px]">
        <span className="text-muted-foreground md:sr-only">Voluntarios: </span>
        {textoVoluntarios(salon)}
      </span>
      <span className="col-start-1 flex flex-wrap gap-1 md:col-auto">
        {salon.opcionPanal && <Etiqueta>Pañal</Etiqueta>}
        {salon.opcionMerienda && <Etiqueta>Merienda</Etiqueta>}
        {!salon.opcionPanal && !salon.opcionMerienda && (
          <span className="hidden text-muted-foreground md:inline" aria-label="Sin opciones">
            —
          </span>
        )}
      </span>
      <span className="col-start-2 row-span-2 row-start-1 flex items-center gap-1 self-center md:col-auto md:row-auto md:row-span-1">
        <PuntoEstado tono={salon.abierto ? 'success' : 'muted'} etiqueta={salon.abierto ? 'Abierto' : 'Cerrado'} />
        <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground md:hidden" />
      </span>
    </li>
  )
}

export function CarpetaSalones({
  carpeta,
  salones,
  editable,
  actualId,
  ocupado,
  onAbrir,
  onCarpeta,
}: {
  readonly carpeta: CarpetaAdmin
  readonly salones: readonly SalonAdmin[]
  /** May save the carpeta (configures a salón of the area). */
  readonly editable: boolean
  readonly actualId: string | null
  readonly ocupado: boolean
  readonly onAbrir: (id: string) => void
  readonly onCarpeta: (carpeta: CarpetaAdmin) => void
}): ReactElement {
  const nombre = NOMBRE_AREA[carpeta.area]
  const idTitulo = `carpeta-${carpeta.area}`
  const regulares = salones.reduce((t, s) => t + s.capacidad, 0)
  const visitantes = salones.reduce((t, s) => t + s.cupoVisitantes, 0)
  const enOrden = carpeta.distribucion === 'en_orden'
  return (
    <section aria-labelledby={idTitulo} className="min-w-0 overflow-hidden rounded-md border border-border bg-card">
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2">
        <Folder aria-hidden="true" className="size-4 text-muted-foreground" />
        <h2 id={idTitulo} className="text-[15px] font-[650] text-foreground">
          {nombre}
        </h2>
        <span className="text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">{salones.length}</span> {salones.length === 1 ? 'salón' : 'salones'} · cupo{' '}
          <span className="font-mono tabular-nums">
            {regulares} + {visitantes}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-2 md:ml-auto">
          {editable ? (
            <>
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Distribución</span>
                <ControlSegmentado
                  etiqueta={`Distribución de ${nombre}`}
                  opciones={OPCIONES_DISTRIBUCION}
                  valor={carpeta.distribucion}
                  onCambio={(d) => {
                    if (d !== carpeta.distribucion && !ocupado) onCarpeta({ ...carpeta, distribucion: d })
                  }}
                />
              </span>
              <span className="flex items-center gap-1">
                <Interruptor
                  activo={carpeta.mantenerRegulares}
                  aria-label={`Mantener a los regulares en su salón, ${nombre}`}
                  disabled={ocupado}
                  onCambio={(v) => onCarpeta({ ...carpeta, mantenerRegulares: v })}
                />
                <span aria-hidden="true" className="text-[13px] text-foreground">
                  Mantener a los regulares en su salón
                </span>
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              {enOrden ? 'En orden' : 'Equilibrada'} · {carpeta.mantenerRegulares ? 'mantiene a los regulares en su salón' : 'no mantiene a los regulares'}
            </span>
          )}
        </span>
      </div>
      <p className="border-b border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground">
        <strong className="font-semibold text-foreground">{enOrden ? 'En orden:' : 'Equilibrada:'}</strong>{' '}
        {enOrden
          ? 'llena cada salón hasta el cupo antes de pasar al siguiente que le sirva al niño.'
          : 'manda al niño al salón con menos niños entre los que le sirven.'}
        {carpeta.mantenerRegulares && ' Un niño regular (desde su 4.ª visita) se queda en el salón donde ya está aunque toque otro.'}
      </p>
      {salones.length ? (
        <>
          <div
            aria-hidden="true"
            className={cn('hidden h-8 border-b border-border px-3 text-xs font-medium text-muted-foreground', COLUMNAS)}
          >
            <span>#</span>
            <span>Salón</span>
            <span>Quién entra</span>
            <span>Cupo</span>
            <span>Voluntarios</span>
            <span>Opciones</span>
            <span>Estado</span>
          </div>
          <ol aria-label={`Salones de ${nombre}, en orden de llenado`}>
            {salones.map((s, i) => (
              <FilaSalon key={s.id} salon={s} numero={i + 1} actual={s.id === actualId} onAbrir={onAbrir} />
            ))}
          </ol>
        </>
      ) : (
        <p className="px-3 py-5 text-center text-[13px] text-muted-foreground">Esta carpeta no tiene salones.</p>
      )}
    </section>
  )
}
