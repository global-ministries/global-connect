'use client'

/**
 * R3d (odd/tasks/talleres-rediseno.md, S1, S2, S4) — the ediciones of the v2
 * taller page (artboard design/talleres-interior/22, `#cerradas`): a
 * ControlSegmentado Abiertas · En curso · Cerradas (with counts) over one
 * ListaResponsiva; every row opens its edición page (rutaEdicion). The split
 * and order live in vista-taller.ts.
 *
 * Columns: Edición (nombre and dates), Estado (status dot + words) and
 * Inscritos (mono). Below md each row is an inset grouped row with the
 * estado as its trailing meta.
 *
 * Empty states: no ediciones at all (with «Abrir edición» when the viewer may
 * open one: BotonAbrirEdicion renders nothing outside AbrirEdicionProvider)
 * and an empty segment.
 */

import { useMemo, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Layers } from 'lucide-react'

import { TituloSistema } from '@/components/ui/sistema-diseno'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'
import { PuntoEstado } from '@/components/ui/punto-estado'
import type { CatalogoEdicion } from '@/lib/platform/talleres/catalogo'
import { rutaEdicion } from '@/lib/platform/talleres/rutas'

import { BotonAbrirEdicion } from './abrir-edicion'
import {
  ETIQUETA_SEGMENTO,
  SEGMENTOS,
  TONO_ESTADO_EDICION,
  agruparEdiciones,
  etiquetaEstadoEdicion,
  plural,
  rangoFechas,
  segmentoInicial,
  type SegmentoEdiciones,
} from './vista-taller'

export interface EdicionesTallerProps {
  readonly tallerSlug: string
  readonly tallerNombre: string
  readonly ediciones: readonly CatalogoEdicion[]
}

const COLUMNAS: readonly ColumnaLista[] = [
  { id: 'edicion', titulo: 'Edición', ancho: 'minmax(0,1.6fr)' },
  { id: 'estado', titulo: 'Estado', ancho: 'minmax(0,1fr)' },
  { id: 'inscritos', titulo: 'Inscritos', ancho: '120px' },
]

const VACIO_SEGMENTO: Record<SegmentoEdiciones, string> = {
  abiertas: 'Ninguna edición abierta ni en borrador',
  en_curso: 'Ninguna edición en curso',
  cerradas: 'Ninguna edición cerrada todavía',
}

function inscritos(n: number): string {
  return `${n} ${plural(n, 'inscrito', 'inscritos')}`
}

export function EdicionesTaller({ tallerSlug, tallerNombre, ediciones }: EdicionesTallerProps): ReactElement {
  const router = useRouter()
  const grupos = useMemo(() => agruparEdiciones(ediciones), [ediciones])
  const [segmento, setSegmento] = useState<SegmentoEdiciones>(() => segmentoInicial(grupos))
  const filas = grupos[segmento]

  const vacio =
    ediciones.length === 0 ? (
      <EstadoVacioSistema
        icono={Layers}
        titulo="Este taller todavía no tiene ediciones"
        subtitulo="Cuando se abra una edición, aparece aquí con sus inscritos."
        accion={<BotonAbrirEdicion variante="outline" />}
      />
    ) : (
      <EstadoVacioSistema
        icono={Layers}
        titulo={VACIO_SEGMENTO[segmento]}
        subtitulo="Cambia de pestaña para ver las demás ediciones."
      />
    )

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TituloSistema nivel={2} id="ediciones-heading">
          Ediciones
        </TituloSistema>
        {ediciones.length > 0 && (
          <ControlSegmentado
            etiqueta="Mostrar ediciones"
            valor={segmento}
            onCambio={setSegmento}
            opciones={SEGMENTOS.map((s) => ({ valor: s, etiqueta: `${ETIQUETA_SEGMENTO[s]} ${grupos[s].length}` }))}
          />
        )}
      </div>

      <ListaResponsiva
        etiqueta={`Ediciones de ${tallerNombre}`}
        columnas={COLUMNAS}
        filas={filas}
        claveFila={(e) => e.id}
        etiquetaFila={(e) => `Abrir ${e.nombre_snapshot}`}
        onAbrirFila={(e) => router.push(rutaEdicion(tallerSlug, e.id))}
        vacio={vacio}
        renderCelda={(e, columna) => {
          if (columna === 'edicion') {
            return (
              <span className="grid min-w-0">
                <span className="truncate font-semibold text-foreground">{e.nombre_snapshot}</span>
                <span className="truncate text-[13px] text-muted-foreground">{rangoFechas(e)}</span>
              </span>
            )
          }
          if (columna === 'estado') {
            return <PuntoEstado tono={TONO_ESTADO_EDICION[e.estado]} etiqueta={etiquetaEstadoEdicion(e)} />
          }
          return (
            <span className="text-sm text-foreground">
              <strong className="font-mono font-semibold tabular-nums">{e.total_inscripciones}</strong>{' '}
              <span className="text-muted-foreground">{plural(e.total_inscripciones, 'inscrito', 'inscritos')}</span>
            </span>
          )
        }}
        renderFilaMovil={(e) => ({
          titulo: e.nombre_snapshot,
          subtitulo: `${rangoFechas(e)} · ${inscritos(e.total_inscripciones)}`,
          meta: <PuntoEstado tono={TONO_ESTADO_EDICION[e.estado]} etiqueta={etiquetaEstadoEdicion(e)} />,
        })}
      />

      {filas.length > 0 && (
        <p className="px-1 text-[13px] text-muted-foreground md:px-0">
          <span className="font-mono tabular-nums">{filas.length}</span> de{' '}
          <span className="font-mono tabular-nums">{ediciones.length}</span>{' '}
          {plural(ediciones.length, 'edición', 'ediciones')} ·{' '}
          {segmento === 'cerradas' ? 'la más reciente primero' : 'la más próxima primero'}
        </p>
      )}
    </div>
  )
}
