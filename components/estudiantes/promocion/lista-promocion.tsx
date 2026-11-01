'use client'

/**
 * Estudiantes › Promover temporada — the groups "Grupo hoy → Queda como"
 * (artboards 09 / 10): one `ListaResponsiva` per ámbito and sub-área, the new
 * group of option (a) at the end of its Inside Out block. Desktop columns
 * Grupo hoy · Queda como · Integrantes (gap GP2, the before → after cell);
 * phone rows show the name, "→ new name" (with an `sr-only` "Queda como"),
 * the flags and the count. Every row opens the read-only group drawer.
 */
import type { ReactElement, ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'
import type { BloquePromocion, FilaPromocion, InsigniaPromocion } from '@/lib/platform/estudiantes/promocion'

import { TituloSeccion } from '../filas-inset'
import { ConNumeros } from './partes-promocion'

const COLUMNAS: readonly ColumnaLista[] = [
  { id: 'hoy', titulo: 'Grupo hoy', ancho: 'minmax(0,1.3fr)' },
  { id: 'queda', titulo: 'Queda como', ancho: 'minmax(0,1.3fr)' },
  { id: 'integrantes', titulo: 'Integrantes', ancho: 'minmax(0,0.8fr)' },
]

const VARIANTE: Record<InsigniaPromocion['tono'], 'default' | 'success' | 'warning' | 'info'> = {
  default: 'default',
  success: 'success',
  warning: 'warning',
  info: 'info',
}

function Celda({ titulo, detalle }: { readonly titulo: ReactNode; readonly detalle: ReactNode }): ReactElement {
  return (
    <div className="min-w-0">
      <p className="truncate text-[15px] font-semibold text-foreground">{titulo}</p>
      {detalle && <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{detalle}</p>}
    </div>
  )
}

function Hoy({ fila }: { readonly fila: FilaPromocion }): ReactElement {
  const { hoy } = fila
  return (
    <Celda
      titulo={hoy.nombre}
      detalle={
        hoy.sinLider ? (
          <>
            {hoy.detalle} · <span className="font-medium text-warning-text">Sin líder</span>
          </>
        ) : (
          hoy.detalle
        )
      }
    />
  )
}

function Queda({ fila }: { readonly fila: FilaPromocion }): ReactElement {
  const { quedaComo } = fila
  return (
    <Celda
      titulo={
        <>
          <span className="sr-only">Queda como </span>
          {quedaComo.pendiente ? <span className="text-warning-text">{quedaComo.nombre}</span> : quedaComo.nombre}
        </>
      }
      detalle={
        quedaComo.sinLider ? (
          <>
            {quedaComo.detalle} · <span className="font-medium text-warning-text">sin líder</span>
          </>
        ) : (
          quedaComo.detalle
        )
      }
    />
  )
}

function Insignias({ fila }: { readonly fila: FilaPromocion }): ReactElement | null {
  if (fila.insignias.length === 0) return null
  return (
    <>
      {fila.insignias.map((insignia) => (
        <BadgeSistema key={insignia.texto} variante={VARIANTE[insignia.tono]} tamaño="sm">
          {insignia.texto}
        </BadgeSistema>
      ))}
    </>
  )
}

export interface ListaPromocionProps {
  readonly bloques: readonly BloquePromocion[]
  readonly onAbrir: (filaId: string) => void
}

export function ListaPromocion({ bloques, onAbrir }: ListaPromocionProps): ReactElement {
  return (
    <div className="space-y-5">
      {bloques.map((bloque) => {
        const id = `promocion-bloque-${bloque.id.replace(/[^a-z0-9]+/gi, '-')}`
        return (
          <section key={bloque.id} aria-labelledby={id} className="space-y-2.5">
            <div className="px-1 md:px-0">
              <TituloSeccion id={id} texto={bloque.titulo} />
            </div>
            <ListaResponsiva
              etiqueta={bloque.titulo}
              columnas={COLUMNAS}
              filas={bloque.filas}
              claveFila={(fila) => fila.id}
              onAbrirFila={(fila) => onAbrir(fila.id)}
              etiquetaFila={(fila) => fila.etiqueta}
              renderCelda={(fila, columna) => {
                if (columna === 'hoy') return <Hoy fila={fila} />
                if (columna === 'queda') return <Queda fila={fila} />
                return (
                  <div className="min-w-0">
                    <p className="font-mono text-[15px] tabular-nums text-foreground">{fila.integrantes}</p>
                    {fila.cifra && (
                      <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                        <ConNumeros texto={fila.cifra} />
                      </p>
                    )}
                  </div>
                )
              }}
              renderFilaMovil={(fila) => ({
                titulo: fila.hoy.nombre,
                subtitulo: (
                  <span className="flex min-w-0 items-center gap-1">
                    <ArrowRight aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="sr-only">Queda como </span>
                    <span className={fila.quedaComo.pendiente ? 'truncate text-warning-text' : 'truncate'}>{fila.quedaComo.nombre}</span>
                  </span>
                ),
                insignias: <Insignias fila={fila} />,
                meta: (
                  <span className="font-mono text-sm tabular-nums text-muted-foreground" aria-label={`${fila.integrantes} integrantes`}>
                    {fila.integrantes}
                  </span>
                ),
              })}
            />
          </section>
        )
      })}
    </div>
  )
}
