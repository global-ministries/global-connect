'use client'

/**
 * Estudiantes › Grupos — the leaders multi-select (gap G9; "Líderes de …" in
 * the drawer and "Líderes" in "Crear grupo"): the Dream Team volunteers of
 * the sub-área and campus who may lead (estudiantes_lideres_disponibles),
 * leaders first, free ones before busy ones, each with what else they lead.
 * "Elige 1 o 2" is guidance, not a limit (A13).
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react'

import { SkeletonLista } from '@/components/ui/estado-vacio-sistema'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { AvatarServidor } from '@/components/dream-team/servidores/lista-servidores'
import { lideresDisponibles } from '@/lib/actions/estudiantes-grupos.actions'
import { lideresParaElegir, subtituloLider } from '@/lib/platform/estudiantes/gestion-grupo'
import type { GrupoGestion, PersonaRol } from '@/lib/platform/estudiantes/grupos-datos'

import { FilaSeleccion, ListaInset, TituloSeccion } from '../filas-inset'

type Resultado =
  | { readonly tipo: 'error'; readonly clave: string; readonly mensaje: string }
  | { readonly tipo: 'listo'; readonly clave: string; readonly disponibles: readonly PersonaRol[] }

export interface SelectorLideresProps {
  readonly subareaId: string
  readonly campusId: string
  /** Every group, for the "lidera …" hint. */
  readonly grupos: readonly GrupoGestion[]
  /** The group being edited (its own leaders are not "busy"); `null` when creating. */
  readonly grupoId: string | null
  readonly seleccion: ReadonlySet<string>
  readonly onCambio: (seleccion: ReadonlySet<string>) => void
  readonly titulo: string
}

export function SelectorLideres({ subareaId, campusId, grupos, grupoId, seleccion, onCambio, titulo }: SelectorLideresProps): ReactElement {
  const clave = `${subareaId}:${campusId}`
  // The last answer, tagged with the sub-área and campus it belongs to: another one is still loading.
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const estado = resultado?.clave === clave ? resultado : null

  useEffect(() => {
    let vigente = true
    lideresDisponibles({ subareaId, campusId }).then((respuesta) => {
      if (!vigente) return
      setResultado(
        respuesta.ok
          ? { tipo: 'listo', clave: `${subareaId}:${campusId}`, disponibles: respuesta.data }
          : { tipo: 'error', clave: `${subareaId}:${campusId}`, mensaje: respuesta.message },
      )
    })
    return () => {
      vigente = false
    }
  }, [subareaId, campusId])

  const opciones = useMemo(
    () => (estado?.tipo === 'listo' ? lideresParaElegir(estado.disponibles, grupos, grupoId) : []),
    [estado, grupos, grupoId],
  )

  function alternar(servicioId: string, marcada: boolean): void {
    const siguiente = new Set(seleccion)
    if (marcada) siguiente.add(servicioId)
    else siguiente.delete(servicioId)
    onCambio(siguiente)
  }

  const elegidos = seleccion.size
  return (
    <section aria-labelledby="selector-lideres" className="space-y-2">
      <TituloSeccion
        id="selector-lideres"
        texto={titulo}
        pista={
          <>
            <b className="font-mono font-semibold tabular-nums text-foreground">{elegidos}</b> {elegidos === 1 ? 'elegido' : 'elegidos'} · elige 1 o 2
          </>
        }
      />
      {estado === null && (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
          <SkeletonLista filas={3} />
        </div>
      )}
      {estado?.tipo === 'error' && <AvisoFormulario tono="error">{estado.mensaje}</AvisoFormulario>}
      {estado?.tipo === 'listo' && opciones.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay voluntarios en esta sub-área. Agrégalos en Dream Team y vuelve aquí.</p>
      )}
      {opciones.length > 0 && (
        <ListaInset etiqueta={titulo}>
          {opciones.map((opcion) => (
            <FilaSeleccion
              key={opcion.servicioId}
              id={`lider-${opcion.servicioId}`}
              avatar={<AvatarServidor nombre={opcion.nombre} />}
              titulo={opcion.nombre}
              subtitulo={subtituloLider(opcion)}
              marcada={seleccion.has(opcion.servicioId)}
              onCambio={(marcada) => alternar(opcion.servicioId, marcada)}
            />
          ))}
        </ListaInset>
      )}
    </section>
  )
}
