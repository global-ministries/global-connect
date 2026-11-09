'use client'

/**
 * Estudiantes › Promover temporada — the groups "Grupo hoy → Queda como" and
 * the graduates (artboards 13 / 14 of design/estudiantes-dps, C19, C20, C25).
 *
 * - Desktop: one `TablaDensa` banded by ámbito and sub-área: Grupo hoy
 *   (frozen, opens the read-only panel) · Hoy (año · líderes) · → · Queda
 *   como · Después · Integrantes · Movimiento ("2 egresan · 6 suben", the
 *   flags). Without a choice: «Falta decidir». The group option (a) creates
 *   is its own row at the end of its Inside Out band, on a soft warning
 *   tint. The graduates are a second dense table (Estudiante · Grupo hoy ·
 *   Año final · Pasa a) that opens nothing.
 * - Phone: a bleed list per ámbito and sub-área with a sticky header; each
 *   row shows the name, "→ new name" (with an `sr-only` "Queda como"), the
 *   flags and the count (gap GP2, the before → after cell).
 */
import type { ReactElement } from 'react'
import { ArrowRight } from 'lucide-react'

import { BadgeSistema } from '@/components/ui/sistema-diseno'
import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'
import type { BloquePromocion, FilaEgresado, FilaPromocion, InsigniaPromocion } from '@/lib/platform/estudiantes/promocion'

import { SeccionMovil } from '../alcance/movil-alcance'
import { TablaDensa, type ColumnaDensa } from '../alcance/tabla-densa'
import { ConNumeros } from './partes-promocion'
import { idDecision } from './tarjeta-decision'

const VARIANTE: Record<InsigniaPromocion['tono'], 'default' | 'success' | 'warning' | 'info'> = {
  default: 'default',
  success: 'success',
  warning: 'warning',
  info: 'info',
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

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`

const COLUMNAS: readonly ColumnaDensa<FilaPromocion>[] = [
  {
    id: 'hoy',
    titulo: 'Hoy',
    celda: (f) =>
      f.hoy.sinLider ? (
        <>
          {f.hoy.detalle} · <span className="font-medium text-warning-text">Sin líder</span>
        </>
      ) : (
        <span className={f.nuevo ? 'text-muted-foreground' : undefined}>{f.hoy.detalle}</span>
      ),
  },
  { id: 'flecha', titulo: 'Pasa a', tituloOculto: true, clase: 'w-7 px-1 text-muted-foreground', celda: () => <ArrowRight aria-hidden="true" className="size-3.5" /> },
  {
    id: 'queda',
    titulo: 'Queda como',
    celda: (f) => (
      <>
        <span className="sr-only">Queda como </span>
        {f.quedaComo.pendiente ? <span className="font-semibold text-warning-text">{f.quedaComo.nombre}</span> : <b className="font-semibold">{f.quedaComo.nombre}</b>}
      </>
    ),
  },
  {
    id: 'despues',
    titulo: 'Después',
    clase: 'text-muted-foreground',
    celda: (f) =>
      f.quedaComo.pendiente ? (
        <a
          href={`#${idDecision(f.id)}`}
          onClick={(e) => e.stopPropagation()}
          className="focus-ring rounded-sm text-xs font-medium text-brand-text hover:underline"
        >
          {f.quedaComo.detalle}
        </a>
      ) : f.quedaComo.sinLider ? (
        <span className="text-warning-text">{`${f.quedaComo.detalle} · sin líder`}</span>
      ) : (
        f.quedaComo.detalle
      ),
  },
  { id: 'integrantes', titulo: 'Integrantes', derecha: true, clase: 'font-mono tabular-nums', celda: (f) => f.integrantes },
  {
    id: 'movimiento',
    titulo: 'Movimiento',
    celda: (f) => (
      <span className="inline-flex items-center gap-1.5">
        {f.cifra ? (
          <span className="text-muted-foreground">
            <ConNumeros texto={f.cifra} />
          </span>
        ) : null}
        <Insignias fila={f} />
        {!f.cifra && f.insignias.length === 0 && <span className="text-muted-foreground">—</span>}
      </span>
    ),
  },
]

export interface TablaPromocionProps {
  readonly bloques: readonly BloquePromocion[]
  readonly seleccionada: string | null
  readonly onAbrir: (filaId: string) => void
}

export function TablaPromocion({ bloques, seleccionada, onAbrir }: TablaPromocionProps): ReactElement {
  return (
    <TablaDensa
      etiqueta="Grupo hoy → Queda como"
      primera={{ titulo: 'Grupo hoy', nombre: (f) => f.hoy.nombre }}
      columnas={COLUMNAS}
      secciones={bloques.map((b) => {
        const integrantes = b.filas.filter((f) => !f.nuevo).reduce((s, f) => s + f.integrantes, 0)
        return { id: b.id, titulo: b.titulo, detalle: `${plural(b.filas.length, 'grupo', 'grupos')} · ${plural(integrantes, 'integrante', 'integrantes')}`, filas: b.filas }
      })}
      claveFila={(f) => f.id}
      onAbrir={(f) => onAbrir(f.id)}
      etiquetaFila={(f) => f.etiqueta}
      seleccionada={seleccionada}
      tonoFila={(f) => (f.nuevo ? 'nuevo' : undefined)}
    />
  )
}

export function TablaEgresan({ egresados }: { readonly egresados: readonly FilaEgresado[] }): ReactElement {
  return (
    <TablaDensa
      etiqueta="Egresan"
      primera={{ titulo: 'Estudiante', nombre: (e) => e.nombre }}
      columnas={[
        { id: 'grupo', titulo: 'Grupo hoy', celda: (e) => e.grupo },
        { id: 'final', titulo: 'Año final', celda: (e) => e.anioFinal },
        { id: 'pasa', titulo: 'Pasa a', celda: (e) => e.pasaA },
      ]}
      secciones={[{ id: 'egresan', titulo: '', filas: egresados }]}
      claveFila={(e) => e.personaId}
    />
  )
}

const COLUMNAS_MOVIL: readonly ColumnaLista[] = [{ id: 'hoy', titulo: 'Grupo hoy' }]

export function ListaPromocionMovil({ bloques, onAbrir }: { readonly bloques: readonly BloquePromocion[]; readonly onAbrir: (filaId: string) => void }): ReactElement {
  return (
    <div className="space-y-4">
      {bloques.map((bloque, i) => (
        <SeccionMovil key={bloque.id} id={`promocion-bloque-${i}`} titulo={bloque.titulo} detalle={<span className="font-mono tabular-nums">{bloque.filas.length}</span>}>
          <ListaResponsiva
            etiqueta={bloque.titulo}
            columnas={COLUMNAS_MOVIL}
            filas={bloque.filas}
            claveFila={(fila) => fila.id}
            onAbrirFila={(fila) => onAbrir(fila.id)}
            etiquetaFila={(fila) => fila.etiqueta}
            vacio={null}
            renderCelda={(fila) => fila.hoy.nombre}
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
        </SeccionMovil>
      ))}
    </div>
  )
}
