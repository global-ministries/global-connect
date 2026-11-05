'use client'

/**
 * Planner — the saved steps of the board (T5b of odd/tasks/planner-gdv.md;
 * S2, S3, S10, S13–S15, S17, S22).
 *
 * usePasosPlanner runs every change as one server action (actions.ts) inside
 * a transition: a move shows at once (useOptimistic over the loaded groups
 * and bank) and falls back to the server data when the step is refused; on
 * success the route refreshes and the new data replaces the optimistic one.
 * It also keeps the save state ("Guardando…", "Guardado", "No se guardó"),
 * the live-region text, the dialog requests (Ubicar, Nuevo grupo, Eliminar)
 * and the drag in progress.
 *
 * The board components read the actions from contexto-pasos.tsx.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react'
import { useRouter } from 'next/navigation'

import { useNotificaciones } from '@/hooks/use-notificaciones'
import {
  crearGrupoAction,
  deshacerPasoAction,
  editarGrupoAction,
  eliminarGrupoAction,
  marcarSegmentoAction,
  moverPersonasAction,
} from '@/app/(auth)/grupos-vida/planificar/actions'
import { enLista, nombrePersona, type GrupoTablero, type PasoHistorial, type SegmentoPlanner } from '@/lib/platform/grupos-vida/planner'
import { pasoADeshacer, type DatosGrupo, type ResultadoAccion } from '@/lib/platform/grupos-vida/planner/acciones'
import type { DatosPlanner } from '@/lib/platform/grupos-vida/planner/datos'

import type { Carga, EstadoGuardado, PasosPlanner, PeticionUbicar } from './contexto-pasos'
import { aplicarMovimiento, cambiaAlgo, planearMovimiento, type EstadoTablero, type Movimiento, type RolDestino } from './modelo'

export type { Carga, EstadoGuardado, PeticionUbicar } from './contexto-pasos'
export { PasosPlannerProvider } from './contexto-pasos'

const MIME = 'application/x-planner-gdv'

const ultimoGuardado = (pasos: readonly PasoHistorial[] | null): number | null => {
  const fecha = pasos?.[0] ? Date.parse(pasos[0].creado_en) : NaN
  return Number.isNaN(fecha) ? null : fecha
}

const ERROR_RED = 'No se pudo guardar el cambio. Revisa tu conexión e inténtalo de nuevo.'

export interface Deshacer {
  /** The step "Deshacer" would undo; null without own steps. */
  readonly paso: PasoHistorial | null
  /** Why it cannot run now; null when it can. */
  readonly motivo: string | null
  readonly ejecutar: () => void
}

export function usePasosPlanner(datos: DatosPlanner, pasos: readonly PasoHistorial[] | null) {
  const { capacidades, temporada, estado } = datos
  const router = useRouter()
  const notificar = useNotificaciones()
  const base = useMemo<EstadoTablero>(() => ({ grupos: datos.grupos, banco: datos.banco }), [datos.grupos, datos.banco])
  const [tablero, moverOptimista] = useOptimistic(base, aplicarMovimiento)
  const [, iniciar] = useTransition()
  const [guardado, setGuardado] = useState<EstadoGuardado>(() => ({ tipo: 'listo', en: ultimoGuardado(pasos) }))
  // Shown while a step runs: an optimistic flag, because a plain state update inside the transition only commits when it ends.
  const [guardando, marcarGuardando] = useOptimistic(false)
  const [anuncio, setAnuncio] = useState('')
  const [ubicar, setUbicar] = useState<PeticionUbicar | null>(null)
  const [nuevoGrupo, setNuevoGrupo] = useState<SegmentoPlanner | null>(null)
  const [eliminar, setEliminar] = useState<GrupoTablero | null>(null)
  const [deshechos, setDeshechos] = useState<ReadonlySet<string>>(() => new Set())
  const [arrastrando, setArrastrando] = useState(false)
  const carga = useRef<Carga | null>(null)

  const fichas = useMemo(() => new Map(tablero.banco.map((p) => [p.usuario_id, p])), [tablero.banco])
  const editables = useMemo(() => new Set(capacidades.segmentos_editables), [capacidades.segmentos_editables])
  const editable = useCallback((segmentoId: string) => editables.has(segmentoId), [editables])

  /** Runs one step: optimistic move first, then the save state, the announcement and the refresh. */
  const ejecutar = useCallback(
    <T,>(accion: () => Promise<ResultadoAccion<T>>, opciones: { readonly movimiento?: Movimiento; readonly exito: (datos: T) => string }) =>
      new Promise<ResultadoAccion<T>>((resolver) => {
        iniciar(async () => {
          if (opciones.movimiento) moverOptimista(opciones.movimiento)
          marcarGuardando(true)
          let resultado: ResultadoAccion<T>
          try {
            resultado = await accion()
          } catch {
            resultado = { ok: false, codigo: null, mensaje: ERROR_RED }
          }
          if (resultado.ok) {
            setGuardado({ tipo: 'listo', en: Date.now() })
            setAnuncio(opciones.exito(resultado.datos))
            iniciar(() => router.refresh())
          } else {
            setGuardado({ tipo: 'error', mensaje: resultado.mensaje })
            setAnuncio(resultado.mensaje)
            notificar.error(resultado.mensaje)
          }
          resolver(resultado)
        })
      }),
    [marcarGuardando, moverOptimista, notificar, router],
  )

  const nombres = useCallback(
    (ids: readonly string[]) => enLista(ids.map((id) => (fichas.get(id) ? nombrePersona(fichas.get(id)!) : 'una persona'))),
    [fichas],
  )

  /** One planner_mover_personas step; `avisar` shows the spouse note as a toast (drag, where no dialog showed it). */
  const mover = useCallback(
    (usuarioIds: readonly string[], grupo: GrupoTablero | null, rol: RolDestino, aviso: string | null, avisar: boolean) => {
      const movimiento: Movimiento = { usuarioIds, grupoId: grupo?.grupo_id ?? null, rol: grupo ? rol : null }
      if (!cambiaAlgo(tablero, movimiento)) return
      if (aviso && avisar) notificar.info(aviso)
      const quien = nombres(usuarioIds)
      void ejecutar(() => moverPersonasAction({ temporadaId: temporada.id, ...movimiento }), {
        movimiento,
        exito: () => `${quien} ${grupo ? `en ${grupo.nombre}` : 'al banco'}${aviso ? `. ${aviso}` : ''}`,
      })
    },
    [ejecutar, nombres, notificar, tablero, temporada.id],
  )

  const soltar = useCallback(
    (grupo: GrupoTablero | null, rol: RolDestino) => {
      const actual = carga.current
      carga.current = null
      setArrastrando(false)
      if (!actual) return
      const plan = planearMovimiento(actual.ids, grupo, fichas, null)
      if (plan.tipo === 'elegir') {
        if (grupo) setUbicar({ carga: actual, grupoId: grupo.grupo_id, rol })
        return
      }
      mover(plan.usuarioIds, grupo, rol, plan.aviso, true)
    },
    [fichas, mover],
  )

  const pasoDeshacer = useMemo(
    () => (pasos ? pasoADeshacer(pasos.filter((p) => !deshechos.has(p.paso_id)), capacidades.usuario_id) : null),
    [pasos, deshechos, capacidades.usuario_id],
  )
  const motivoDeshacer = !pasos
    ? 'No se pudo leer el historial; recarga la página'
    : !pasoDeshacer
      ? 'No tienes cambios para deshacer'
      : pasoDeshacer.puede_deshacer
        ? null
        : (pasoDeshacer.motivo_no_deshacer ?? 'Este cambio ya no se puede deshacer')

  const deshacer = useCallback(() => {
    if (!pasoDeshacer || motivoDeshacer) {
      const motivo = motivoDeshacer ?? 'No tienes cambios para deshacer'
      setAnuncio(motivo)
      notificar.info(motivo)
      return
    }
    const paso = pasoDeshacer
    void ejecutar(() => deshacerPasoAction({ pasoId: paso.paso_id }), { exito: () => `Deshiciste: ${paso.descripcion}` }).then((r) => {
      if (r.ok) setDeshechos((d) => new Set(d).add(paso.paso_id))
    })
  }, [ejecutar, motivoDeshacer, notificar, pasoDeshacer])

  // Ctrl/Cmd+Z outside text fields and dialogs undoes the latest own step.
  const deshacerActual = useRef(deshacer)
  useEffect(() => {
    deshacerActual.current = deshacer
  }, [deshacer])
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      const destino = e.target instanceof HTMLElement ? e.target : null
      if (destino?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]')) return
      e.preventDefault()
      deshacerActual.current()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [])

  const segmentos = useMemo(() => new Map((estado?.segmentos ?? []).map((s) => [s.id, s])), [estado])

  const contexto = useMemo<PasosPlanner>(
    () => ({
      editable,
      pedirUbicar: (c, inicial) => setUbicar({ carga: c, grupoId: inicial?.grupoId ?? null, rol: inicial?.rol ?? 'miembro' }),
      arrastrar: (c, e) => {
        carga.current = c
        setArrastrando(true)
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData(MIME, c.ids.join(','))
          e.dataTransfer.setData('text/plain', c.nombre)
        }
      },
      terminarArrastre: () => {
        carga.current = null
        setArrastrando(false)
      },
      arrastrando,
      soltar,
      usarLocalidad: (grupo, sugerencia) =>
        void ejecutar(() => editarGrupoAction({ grupoId: grupo.grupo_id, cambios: { localidad_id: sugerencia.localidadId } }), {
          exito: () => `${grupo.nombre} ahora es de ${sugerencia.nombre}`,
        }),
      pedirEliminar: setEliminar,
      pedirNuevoGrupo: setNuevoGrupo,
      segmento: (id) => segmentos.get(id) ?? null,
      marcar: (s, terminado) =>
        void ejecutar(() => marcarSegmentoAction({ temporadaId: temporada.id, segmentoId: s.id, terminado }), {
          exito: () => (terminado ? `Marcaste ${s.nombre} como terminado` : `${s.nombre} vuelve a estar sin terminar`),
        }),
    }),
    [arrastrando, editable, ejecutar, segmentos, soltar, temporada.id],
  )

  const confirmarUbicar = (usuarioIds: readonly string[], grupoId: string | null, rol: RolDestino, aviso: string | null) => {
    setUbicar(null)
    mover(usuarioIds, tablero.grupos.find((g) => g.grupo_id === grupoId) ?? null, rol, aviso, false)
  }

  const crear = (segmento: SegmentoPlanner, grupo: DatosGrupo) =>
    ejecutar(() => crearGrupoAction({ temporadaId: temporada.id, datos: grupo }), { exito: () => `Creaste ${grupo.nombre} en ${segmento.nombre}` })

  const confirmarEliminar = (grupo: GrupoTablero) => {
    setEliminar(null)
    void ejecutar(() => eliminarGrupoAction({ grupoId: grupo.grupo_id }), { exito: () => `Eliminaste ${grupo.nombre}` })
  }

  return {
    tablero,
    fichas,
    contexto,
    guardado: guardando ? ({ tipo: 'guardando' } satisfies EstadoGuardado) : guardado,
    anuncio,
    deshacer: { paso: pasoDeshacer, motivo: motivoDeshacer, ejecutar: deshacer } satisfies Deshacer,
    ubicar,
    cerrarUbicar: () => setUbicar(null),
    confirmarUbicar,
    nuevoGrupo,
    cerrarNuevoGrupo: () => setNuevoGrupo(null),
    crear,
    eliminar,
    cerrarEliminar: () => setEliminar(null),
    confirmarEliminar,
  }
}
