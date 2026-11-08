'use client'

/**
 * Planner — the history side panel (T8a of odd/tasks/planner-gdv.md;
 * artboard 09; S13, S15, S24), opened from "Historial" in the season header.
 *
 * The saved steps of planner_historial, newest first and grouped by day,
 * each with its actor and sentence, the relative time, the segments it
 * touched as chips and "Deshecho por X" once undone. The first page comes
 * with the board (the page's planner_historial read); "Ver pasos anteriores"
 * reads the next one with the date of the last step read (p_antes). The
 * filters (director, segment, text) apply to the steps read so far.
 *
 * "Deshacer" shows on the steps the caller may undo (puede_deshacer: their
 * own of the last 24 h and, for the director general, admin and pastor,
 * anyone's, S15); otherwise the RPC's reason is shown. While the board has
 * unsaved changes a saved step cannot be undone: the board shows the draft
 * over the saved data, and undoing under it would mix both, so the panel
 * asks to save or discard them first (S24).
 *
 * Planning style (S25): the filters at the toolbar's 36px, each day under
 * the 12px uppercase heading as one flat `rounded-md` surface of 13px rows
 * (the actor's initials avatar, sentence, chips and time in 12px, "Deshacer"
 * as a brand text action) split by light dividers.
 */
import { useEffect, useId, useState, type ReactElement } from 'react'
import { Search } from 'lucide-react'

import { BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { contar, type PasoHistorial, type SegmentoPlanner, type TemporadaPlanner } from '@/lib/platform/grupos-vida/planner'
import { PASOS_RECIENTES, type ResultadoAccion } from '@/lib/platform/grupos-vida/planner/acciones'
import { cargarHistorialAction } from '@/app/(auth)/grupos-vida/planificar/actions'
import { cn } from '@/lib/utils'

import { AvatarIniciales } from './avatar-iniciales'
import { EtiquetaPlanner } from './etiqueta'
import { CLASE_ACCION_TEXTO, CLASE_CONTROL_COMPACTO, CLASE_FILA, CLASE_SUPERFICIE, CLASE_TITULO_SECCION } from './estilo-planner'
import {
  FILTROS_HISTORIAL,
  agruparPorDia,
  filtrarPasos,
  opcionesDirector,
  opcionesSegmento,
  tiempoPaso,
  type FiltrosHistorial,
} from './modelo-historial'

const ERROR_RED = 'No se pudo leer el historial. Revisa tu conexión e inténtalo de nuevo.'

export interface PanelHistorialProps {
  readonly abierto: boolean
  readonly onAbiertoChange: (abierto: boolean) => void
  readonly temporada: Pick<TemporadaPlanner, 'id' | 'nombre'>
  readonly usuarioId: string
  /** Admin, pastor and director general see every director's steps (and undo them). */
  readonly veTodo: boolean
  readonly segmentos: readonly SegmentoPlanner[]
  /** The first page (the latest PASOS_RECIENTES steps); null when it could not be read. */
  readonly pasos: readonly PasoHistorial[] | null
  /** Unsaved board changes (S24): undoing a saved step waits for them. */
  readonly cambiosSinGuardar: number
  readonly guardando: boolean
  readonly onGuardar: () => void
  readonly onDescartar: () => void
  readonly onDeshacer: (paso: PasoHistorial) => Promise<ResultadoAccion<unknown>>
}

/** The pages read after the first; they start over when the first page changes (after a save or an undo). */
interface Paginas {
  readonly fuente: readonly PasoHistorial[] | null
  readonly extra: readonly PasoHistorial[]
  readonly hayMas: boolean
}

const inicio = (pasos: readonly PasoHistorial[] | null): Paginas => ({ fuente: pasos, extra: [], hayMas: (pasos?.length ?? 0) >= PASOS_RECIENTES })

function Fila({
  paso,
  ahora,
  usuarioId,
  deshecho,
  deshaciendo,
  bloqueado,
  idNota,
  onDeshacer,
}: {
  readonly paso: PasoHistorial
  readonly ahora: Date
  readonly usuarioId: string
  /** Undone in this session, before the refreshed history arrives. */
  readonly deshecho: boolean
  readonly deshaciendo: boolean
  /** Unsaved changes: "Deshacer" says why it waits (the note). */
  readonly bloqueado: boolean
  readonly idNota: string
  readonly onDeshacer: (paso: PasoHistorial) => void
}): ReactElement {
  const yaDeshecho = paso.deshecho_por !== null || deshecho
  const meta = [paso.actor_id === usuarioId ? 'Tú' : null, tiempoPaso(paso.creado_en, ahora)].filter(Boolean).join(' · ')
  return (
    <li className={cn(CLASE_FILA, 'flex items-start gap-2.5 py-2.5 pr-1.5 pl-3')}>
      <AvatarIniciales nombres={[paso.actor_nombre]} className="mt-px" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className={yaDeshecho ? 'break-words text-muted-foreground line-through' : 'break-words text-foreground'}>
          <span className="font-semibold">{paso.actor_nombre}</span> {paso.descripcion}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {paso.segmentos.map((s) => (
            <EtiquetaPlanner key={s.id} tono="neutro">
              {s.nombre}
            </EtiquetaPlanner>
          ))}
          <span>{meta}</span>
        </div>
        {yaDeshecho ? (
          <EtiquetaPlanner tono="info">{paso.deshecho_por_nombre ? `Deshecho por ${paso.deshecho_por_nombre}` : 'Deshecho'}</EtiquetaPlanner>
        ) : (
          !paso.puede_deshacer && paso.motivo_no_deshacer && <p className="break-words text-xs text-muted-foreground">{paso.motivo_no_deshacer}</p>
        )}
      </div>
      {!yaDeshecho && paso.puede_deshacer && (
        <button
          type="button"
          aria-label={`Deshacer: ${paso.descripcion}`}
          aria-disabled={bloqueado}
          aria-describedby={bloqueado ? idNota : undefined}
          aria-busy={deshaciendo || undefined}
          disabled={deshaciendo}
          onClick={() => !bloqueado && onDeshacer(paso)}
          className={cn(CLASE_ACCION_TEXTO, '-my-1 shrink-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-50')}
        >
          {deshaciendo ? 'Deshaciendo…' : 'Deshacer'}
        </button>
      )}
    </li>
  )
}

/** The panel body; it unmounts when the panel closes, so the time and the filters start over each time. */
function Contenido(props: PanelHistorialProps): ReactElement {
  const { temporada, usuarioId, segmentos, pasos, cambiosSinGuardar, guardando, onGuardar, onDescartar, onDeshacer } = props
  const idNota = useId()
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const reloj = window.setInterval(() => setAhora(new Date()), 30_000)
    return () => window.clearInterval(reloj)
  }, [])

  const [paginasGuardadas, setPaginas] = useState<Paginas>(() => inicio(pasos))
  const paginas = paginasGuardadas.fuente === pasos ? paginasGuardadas : inicio(pasos)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtros, setFiltros] = useState<FiltrosHistorial>(FILTROS_HISTORIAL)
  const [deshechos, setDeshechos] = useState<ReadonlySet<string>>(() => new Set())
  const [deshaciendo, setDeshaciendo] = useState<string | null>(null)

  if (!pasos) {
    return <p className="text-sm text-muted-foreground">No se pudo leer el historial. Recarga la página.</p>
  }

  const vistos = new Set(pasos.map((p) => p.paso_id))
  const todos = [...pasos, ...paginas.extra.filter((p) => !vistos.has(p.paso_id))]
  const filtrados = filtrarPasos(todos, filtros)
  const dias = agruparPorDia(filtrados, ahora)

  const verMas = async () => {
    const ultimo = todos.at(-1)
    if (!ultimo || cargando) return
    setCargando(true)
    setError(null)
    try {
      const r = await cargarHistorialAction({ temporadaId: temporada.id, antes: ultimo.creado_en })
      if (r.ok) setPaginas({ fuente: pasos, extra: [...paginas.extra, ...r.datos.pasos], hayMas: r.datos.hayMas })
      else setError(r.mensaje)
    } catch {
      setError(ERROR_RED)
    }
    setCargando(false)
  }

  const deshacer = async (paso: PasoHistorial) => {
    if (cambiosSinGuardar > 0 || deshaciendo) return
    setDeshaciendo(paso.paso_id)
    const r = await onDeshacer(paso)
    setDeshaciendo(null)
    if (r.ok) setDeshechos((d) => new Set(d).add(paso.paso_id))
  }

  const cambiar = (parcial: Partial<FiltrosHistorial>) => setFiltros((f) => ({ ...f, ...parcial }))
  const bloqueado = cambiosSinGuardar > 0

  return (
    <div className="space-y-4">
      {bloqueado && (
        <AvisoFormulario id={idNota} tono="info" role="note" className="space-y-3 py-3">
          <p>
            Tienes {contar(cambiosSinGuardar, 'cambio sin guardar', 'cambios sin guardar')}.{' '}
            {cambiosSinGuardar === 1 ? 'Guárdalo o descártalo' : 'Guárdalos o descártalos'} antes de deshacer un paso guardado: el tablero mezclaría lo
            guardado con lo que todavía no está en el servidor.
          </p>
          <div className="flex flex-wrap gap-2">
            <BotonSistema type="button" variante="primario" tamaño="sm" cargando={guardando} onClick={onGuardar}>
              Guardar
            </BotonSistema>
            <BotonSistema type="button" variante="ghost" tamaño="sm" disabled={guardando} onClick={onDescartar}>
              Descartar
            </BotonSistema>
          </div>
        </AvisoFormulario>
      )}

      <div role="group" aria-label="Filtrar el historial" className="grid gap-2 @md:grid-cols-2">
        <SelectSistema
          aria-label="Director"
          className={CLASE_CONTROL_COMPACTO}
          opciones={opcionesDirector(todos, usuarioId)}
          value={filtros.actor}
          onValueChange={(actor) => cambiar({ actor })}
        />
        <SelectSistema
          aria-label="Segmento"
          className={CLASE_CONTROL_COMPACTO}
          opciones={opcionesSegmento(todos, segmentos)}
          value={filtros.segmento}
          onValueChange={(segmento) => cambiar({ segmento })}
        />
        <div className="@md:col-span-2">
          <InputSistema
            type="search"
            icono={Search}
            value={filtros.texto}
            onChange={(e) => cambiar({ texto: e.target.value })}
            placeholder="Buscar persona, grupo o director"
            aria-label="Buscar en el historial"
            autoComplete="off"
            className={CLASE_CONTROL_COMPACTO}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Puedes deshacer los pasos de las últimas 24 h{props.veTodo ? ': los tuyos y los de los directores de etapa' : ''}. Si otro director cambió lo mismo
        después, te lo decimos y no se pisa su trabajo.
      </p>

      {todos.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm font-medium text-foreground">Todavía no hay pasos guardados en {temporada.nombre}</p>
          <p className="text-sm text-muted-foreground">Cada vez que guardas, cada cambio queda aquí como un paso.</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm font-medium text-foreground">Ningún paso coincide</p>
          <p className="text-sm text-muted-foreground">Prueba con otro director, segmento o texto.</p>
          <BotonSistema type="button" variante="ghost" tamaño="sm" className="mt-2" onClick={() => setFiltros(FILTROS_HISTORIAL)}>
            Limpiar filtros
          </BotonSistema>
        </div>
      ) : (
        <section aria-label="Pasos guardados" className="space-y-4">
          {dias.map((dia) => (
            <div key={dia.titulo} className="space-y-1.5">
              <h3 className={CLASE_TITULO_SECCION}>{dia.titulo}</h3>
              <ul aria-label={`Pasos de ${dia.titulo}`} className={CLASE_SUPERFICIE}>
                {dia.pasos.map((paso) => (
                  <Fila
                    key={paso.paso_id}
                    paso={paso}
                    ahora={ahora}
                    usuarioId={usuarioId}
                    deshecho={deshechos.has(paso.paso_id)}
                    deshaciendo={deshaciendo === paso.paso_id}
                    bloqueado={bloqueado}
                    idNota={idNota}
                    onDeshacer={(p) => void deshacer(p)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {error && <AvisoFormulario tono="error">{error}</AvisoFormulario>}
      {paginas.hayMas && (
        <BotonSistema type="button" variante="outline" tamaño="sm" cargando={cargando} onClick={() => void verMas()}>
          Ver pasos anteriores
        </BotonSistema>
      )}
    </div>
  )
}

export function PanelHistorial(props: PanelHistorialProps): ReactElement {
  const { abierto, onAbiertoChange, temporada, veTodo } = props
  return (
    <DetalleResponsivo
      abierto={abierto}
      onCambioAbierto={onAbiertoChange}
      ancho="lg"
      titulo={`Historial de ${temporada.nombre}`}
      descripcion={
        veTodo
          ? 'Cada cambio guardado es un paso. Ves los pasos de todos los directores.'
          : 'Cada cambio guardado es un paso. Ves los pasos de tus segmentos y deshaces los tuyos.'
      }
    >
      <Contenido {...props} />
    </DetalleResponsivo>
  )
}
