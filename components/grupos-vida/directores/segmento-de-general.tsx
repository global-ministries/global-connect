'use client'

/**
 * Directores — one segment of a general director's card: name and counts, the
 * groups it makes visible, the two-option scope control ("Todo el segmento" /
 * "Solo estos directores") and, for the second one, the checklist of the
 * segment's stage directors. Editable for admin and pastor; for a director
 * general viewing their own card it is read-only: a badge for the scope and the
 * names of who is included.
 *
 * Saving goes through `useGuardarCambio`: the change shows at once, the
 * segment's controls are disabled while it saves, and a failure restores the
 * previous value.
 */
import type { ReactElement } from 'react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { cambiarAlcanceDG, marcarDirectoresDG } from '@/lib/actions/gdv-directores.actions'
import { cn } from '@/lib/utils'
import type { Alcance, SegmentoDeGeneral } from '@/lib/platform/grupos-vida/directores-vista'
import { ANILLO } from './franja-por-ordenar'
import type { useGuardarCambio } from './use-guardar-cambio'

export interface SegmentoDeGeneralProps {
  readonly usuarioId: string
  readonly segmento: SegmentoDeGeneral
  readonly editable: boolean
  readonly guardado: ReturnType<typeof useGuardarCambio>
}

const ETIQUETA_ALCANCE: Record<Alcance, string> = {
  segmento: 'Todo el segmento',
  directores: 'Solo estos directores',
}

export function SegmentoDeGeneralFila({ usuarioId, segmento, editable, guardado }: SegmentoDeGeneralProps): ReactElement {
  const clave = `${usuarioId}:${segmento.segmentoId}`
  const alcance = guardado.valor<Alcance>(`${clave}:alcance`, segmento.alcance)
  const marcadosDelServidor = segmento.directores.filter((d) => d.marcado).map((d) => d.segmentoLiderId)
  const marcados = guardado.valor<readonly string[]>(`${clave}:marcas`, marcadosDelServidor)
  const guardando = guardado.pendiente(`${clave}:`)

  function elegirAlcance(siguiente: Alcance): void {
    if (siguiente === alcance || guardando) return
    void guardado.guardar(
      `${clave}:alcance`,
      siguiente,
      () => cambiarAlcanceDG(usuarioId, segmento.segmentoId, siguiente),
      'Alcance actualizado.',
    )
  }

  function alternar(segmentoLiderId: string): void {
    if (guardando) return
    const siguiente = marcados.includes(segmentoLiderId)
      ? marcados.filter((id) => id !== segmentoLiderId)
      : [...marcados, segmentoLiderId]
    void guardado.guardar(
      `${clave}:marcas`,
      siguiente,
      () => marcarDirectoresDG(usuarioId, segmento.segmentoId, siguiente),
      'Directores actualizados.',
    )
  }

  const incluidos = segmento.directores.filter((d) => marcados.includes(d.segmentoLiderId))

  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-border bg-background p-4" aria-busy={guardando}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-semibold text-foreground">{segmento.nombre}</span>
          <span className="text-[13px] text-muted-foreground">{segmento.conteo}</span>
        </div>
        <span className="text-[13px] font-semibold text-foreground">{segmento.visibles}</span>
        {editable ? (
          <div
            role="group"
            aria-label={`Alcance en ${segmento.nombre}`}
            className="flex self-start rounded-xl border border-border bg-card p-[3px] md:self-auto"
          >
            {(['segmento', 'directores'] as const).map((opcion) => (
              <button
                key={opcion}
                type="button"
                aria-pressed={alcance === opcion}
                disabled={guardando}
                onClick={() => elegirAlcance(opcion)}
                className={cn(
                  'min-h-[44px] rounded-[9px] px-4 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                  alcance === opcion ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  ANILLO,
                )}
              >
                {ETIQUETA_ALCANCE[opcion]}
              </button>
            ))}
          </div>
        ) : (
          <BadgeSistema variante="info" tamaño="sm">
            {ETIQUETA_ALCANCE[alcance]}
          </BadgeSistema>
        )}
      </div>

      {guardando && (
        <p role="status" className="text-[13px] text-muted-foreground">
          Guardando…
        </p>
      )}

      {alcance === 'segmento' && <p className="text-[13px] text-muted-foreground">Incluye los grupos sin director de etapa</p>}

      {alcance === 'directores' && editable && (
        <div
          role="group"
          aria-label={`Directores de etapa de ${segmento.nombre}`}
          className="grid gap-2 md:grid-cols-2"
        >
          {segmento.directores.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Este segmento aún no tiene directores de etapa.</p>
          ) : (
            segmento.directores.map((director) => (
              <label
                key={director.segmentoLiderId}
                className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[10px] border border-border bg-card px-3.5 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
              >
                <input
                  type="checkbox"
                  checked={marcados.includes(director.segmentoLiderId)}
                  disabled={guardando}
                  onChange={() => alternar(director.segmentoLiderId)}
                  className="h-5 w-5 shrink-0 accent-[var(--brand-primary)]"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{director.nombre}</span>
                <span className="shrink-0 text-[13px] text-muted-foreground">{director.detalle}</span>
              </label>
            ))
          )}
        </div>
      )}

      {alcance === 'directores' && !editable && (
        <p className="text-[13px] text-muted-foreground">
          {incluidos.length === 0 ? 'Aún no incluye directores de etapa' : `Incluye a ${incluidos.map((d) => d.nombre).join(', ')}`}
        </p>
      )}
    </div>
  )
}
