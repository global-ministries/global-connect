'use client'

/**
 * Planner — the session draft of the board (S24 of odd/tasks/planner-gdv.md;
 * T5b; S2, S3, S10, S13–S15, S17, S22).
 *
 * Nothing is saved while the director works. Every board action (drag,
 * Ubicar, Mover, Al banco, a role change, Nuevo grupo, Usar <localidad>, a
 * field of the group panel, Eliminar) adds one pending change to the draft
 * (lib/platform/grupos-vida/planner/borrador.ts), kept in localStorage per
 * user and season (borrador-local.ts); the board, the bank and the alerts
 * are the loaded data with the draft applied. The spouse rule (S2), the
 * scope (S10) and S22 are checked here as before; the server checks them
 * again on save. "Guardar" sends the whole draft in one
 * planner_guardar_cambios call (all or nothing): on success the draft
 * empties and the route refreshes; on a refusal the draft stays and the
 * failed change is pointed at in the pending list.
 *
 * "Deshacer" (and Ctrl/Cmd+Z) removes the last pending change; with none it
 * undoes the actor's latest saved step (planner_deshacer_paso), as does
 * "Terminé mi segmento", which saves at once (it is not a board change).
 * Leaving the page with unsaved changes asks first (beforeunload). The hook
 * also keeps the live-region text, the dialog requests (Ubicar, Nuevo grupo,
 * Eliminar), the open group panel (T6) and the drag in progress.
 *
 * The Lado a lado view (T7, lado-a-lado.tsx) adds to the same draft: "Pasar"
 * (one move per role, so everyone keeps their origin role), "Pasar las N sin
 * ubicar" and "Crear grupo copiando este" (a "crear" with its "tmp:" key and
 * the leaders' move) each write the draft once.
 *
 * The board components read the actions from contexto-pasos.tsx.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { useNotificaciones } from '@/hooks/use-notificaciones'
import { deshacerPasoAction, guardarCambiosAction, marcarSegmentoAction } from '@/app/(auth)/grupos-vida/planificar/actions'
import {
  enLista,
  nombrePersona,
  normalizar,
  type GrupoTablero,
  type PasoHistorial,
  type SegmentoPlanner,
  type SugerenciaLocalidad,
} from '@/lib/platform/grupos-vida/planner'
import {
  MAXIMO_CAMBIOS,
  pasoADeshacer,
  validarDatosGrupo,
  type CambioPlanner,
  type DatosGrupo,
  type ResultadoAccion,
  type ResultadoGuardar,
} from '@/lib/platform/grupos-vida/planner/acciones'
import {
  BORRADOR_VACIO,
  aPayload,
  agregarCambio,
  aplicarBorrador,
  marcasBorrador,
  motivoNoQuitar,
  normalizarBorrador,
  nuevaClave,
  quitarCambio,
  quitarUltimo,
  type Borrador,
  type Catalogo,
  type CambioPendiente,
  type EstadoTablero,
} from '@/lib/platform/grupos-vida/planner/borrador'
import type { DatosPlanner } from '@/lib/platform/grupos-vida/planner/datos'

import { useBorradorLocal } from './borrador-local'
import type { Carga, PasosPlanner, PeticionUbicar } from './contexto-pasos'
import { planearMovimiento, type RolDestino } from './modelo'
import { datosCopia, planPasar, type MovimientoLado } from './modelo-lado'

export type { Carga, PeticionUbicar } from './contexto-pasos'
export { PasosPlannerProvider } from './contexto-pasos'

const MIME = 'application/x-planner-gdv'

const ERROR_RED = 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.'
const GUARDANDO = 'Espera a que terminen de guardarse los cambios.'
const LLENO = `Guarda tus cambios antes de seguir: se guardan hasta ${MAXIMO_CAMBIOS} a la vez.`

const rechazo = (mensaje: string): ResultadoAccion<null> => ({ ok: false, codigo: 'validacion', mensaje })
const LISTO: ResultadoAccion<null> = { ok: true, datos: null }

export interface Deshacer {
  /** The last pending change: "Deshacer" removes it first. */
  readonly pendiente: CambioPendiente | null
  /** The saved step "Deshacer último guardado" would undo; null without own steps. */
  readonly paso: PasoHistorial | null
  /** Why it cannot run now; null when it can. */
  readonly motivo: string | null
  readonly ejecutar: () => void
}

export interface ErrorGuardar {
  readonly mensaje: string
  /** The failed change (0-based) in the pending list; null when it is not one change. */
  readonly indice: number | null
}

export function usePasosPlanner(datos: DatosPlanner, pasos: readonly PasoHistorial[] | null) {
  const { capacidades, temporada, estado } = datos
  const router = useRouter()
  const notificar = useNotificaciones()
  const [, iniciar] = useTransition()
  const cargado = useMemo<EstadoTablero>(() => ({ grupos: datos.grupos, banco: datos.banco }), [datos.grupos, datos.banco])
  const catalogo = useMemo<Catalogo>(() => ({ segmentos: capacidades.segmentos, localidades: datos.localidades }), [capacidades.segmentos, datos.localidades])
  // The changes just saved stay applied until the refreshed data (a new `cargado`) arrives.
  const [enCamino, setEnCamino] = useState<{ readonly cargado: EstadoTablero; readonly cambios: readonly CambioPendiente[] } | null>(null)
  const base = useMemo(
    () => (enCamino && enCamino.cargado === cargado ? aplicarBorrador(cargado, enCamino.cambios, catalogo) : cargado),
    [cargado, enCamino, catalogo],
  )

  const [guardado, escribirBorrador] = useBorradorLocal(capacidades.usuario_id, temporada.id)
  // Changes that no longer apply to the loaded data (another director did it, the group is gone) drop out.
  const borrador = useMemo(() => normalizarBorrador(guardado, base, catalogo), [guardado, base, catalogo])
  const cambios = borrador.cambios
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<ErrorGuardar | null>(null)
  const [listaAbierta, setListaAbierta] = useState(false)

  const tablero = useMemo(() => aplicarBorrador(base, cambios, catalogo), [base, cambios, catalogo])
  const marcas = useMemo(() => marcasBorrador(cambios, base), [cambios, base])

  const [anuncio, setAnuncio] = useState('')
  const [ubicar, setUbicar] = useState<PeticionUbicar | null>(null)
  const [nuevoGrupo, setNuevoGrupo] = useState<SegmentoPlanner | null>(null)
  const [eliminar, setEliminar] = useState<GrupoTablero | null>(null)
  const [grupoAbiertoId, setGrupoAbiertoId] = useState<string | null>(null)
  const [deshechos, setDeshechos] = useState<ReadonlySet<string>>(() => new Set())
  const [arrastrando, setArrastrando] = useState(false)
  const carga = useRef<Carga | null>(null)

  const fichas = useMemo(() => new Map(tablero.banco.map((p) => [p.usuario_id, p])), [tablero.banco])
  const editables = useMemo(() => new Set(capacidades.segmentos_editables), [capacidades.segmentos_editables])
  const editable = useCallback((segmentoId: string) => editables.has(segmentoId), [editables])

  const avisar = useCallback(
    (texto: string) => {
      setAnuncio(texto)
      notificar.info(texto)
    },
    [notificar],
  )

  /** Replaces the draft; any change to it clears the last save error (its position no longer holds). */
  const cambiarBorrador = useCallback(
    (siguiente: Borrador) => {
      escribirBorrador(siguiente)
      setErrorGuardar(null)
    },
    [escribirBorrador],
  )

  /** Adds one change; false when it changed nothing or could not be added now. */
  const agregar = useCallback(
    (cambio: CambioPlanner, texto: string): boolean => {
      if (guardando) {
        avisar(GUARDANDO)
        return false
      }
      const siguiente = agregarCambio(borrador, cambio, base, catalogo)
      if (siguiente === borrador) return false
      if (siguiente.cambios.length > MAXIMO_CAMBIOS) {
        avisar(LLENO)
        return false
      }
      cambiarBorrador(siguiente)
      setAnuncio(`${texto}. Sin guardar.`)
      return true
    },
    [avisar, base, borrador, cambiarBorrador, catalogo, guardando],
  )

  /** Adds several changes in order and writes the draft once; how many changed something (0 when none could be added). */
  const agregarVarios = useCallback(
    (lista: readonly CambioPlanner[], texto: string): number => {
      if (guardando) {
        avisar(GUARDANDO)
        return 0
      }
      let siguiente = borrador
      let agregados = 0
      lista.forEach((cambio) => {
        const otro = agregarCambio(siguiente, cambio, base, catalogo)
        if (otro === siguiente) return
        siguiente = otro
        agregados += 1
      })
      if (agregados === 0) return 0
      if (siguiente.cambios.length > MAXIMO_CAMBIOS) {
        avisar(LLENO)
        return 0
      }
      cambiarBorrador(siguiente)
      setAnuncio(`${texto}. Sin guardar.`)
      return agregados
    },
    [avisar, base, borrador, cambiarBorrador, catalogo, guardando],
  )

  /** Runs one server call right away (undo of a saved step, "Terminé mi segmento"), then refreshes. */
  const ejecutar = useCallback(
    <T,>(accion: () => Promise<ResultadoAccion<T>>, exito: (datos: T) => string) =>
      new Promise<ResultadoAccion<T>>((resolver) => {
        iniciar(async () => {
          let resultado: ResultadoAccion<T>
          try {
            resultado = await accion()
          } catch {
            resultado = { ok: false, codigo: null, mensaje: ERROR_RED }
          }
          if (resultado.ok) {
            setAnuncio(exito(resultado.datos))
            iniciar(() => router.refresh())
          } else {
            setAnuncio(resultado.mensaje)
            notificar.error(resultado.mensaje)
          }
          resolver(resultado)
        })
      }),
    [notificar, router],
  )

  const nombres = useCallback(
    (ids: readonly string[]) => enLista(ids.map((id) => (fichas.get(id) ? nombrePersona(fichas.get(id)!) : 'una persona'))),
    [fichas],
  )

  /** One move into the draft; `avisarConyuge` shows the spouse note as a toast (drag, where no dialog showed it). */
  const mover = useCallback(
    (usuarioIds: readonly string[], grupo: GrupoTablero | null, rol: RolDestino, aviso: string | null, avisarConyuge: boolean) => {
      const cambio: CambioPlanner = { tipo: 'mover', usuarios: [...usuarioIds], grupo: grupo?.grupo_id ?? null, rol: grupo ? rol : null }
      const quien = nombres(usuarioIds)
      const texto = `${quien} ${grupo ? `en ${grupo.nombre}` : 'al banco'}${aviso ? `. ${aviso}` : ''}`
      if (agregar(cambio, texto) && aviso && avisarConyuge) notificar.info(aviso)
    },
    [agregar, nombres, notificar],
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

  // ─── Deshacer ───

  const ultimo = cambios.at(-1) ?? null
  const pasoDeshacer = useMemo(
    () => (pasos ? pasoADeshacer(pasos.filter((p) => !deshechos.has(p.paso_id)), capacidades.usuario_id) : null),
    [pasos, deshechos, capacidades.usuario_id],
  )
  const motivoDeshacer = ultimo
    ? guardando
      ? GUARDANDO
      : null
    : !pasos
      ? 'No se pudo leer el historial; recarga la página'
      : !pasoDeshacer
        ? 'No tienes cambios para deshacer'
        : pasoDeshacer.puede_deshacer
          ? null
          : (pasoDeshacer.motivo_no_deshacer ?? 'Este cambio ya no se puede deshacer')

  const deshacer = useCallback(() => {
    if (motivoDeshacer) return avisar(motivoDeshacer)
    if (ultimo) {
      cambiarBorrador(quitarUltimo(borrador))
      setAnuncio(`Quitaste: ${ultimo.descripcion}`)
      return
    }
    if (!pasoDeshacer) return
    const paso = pasoDeshacer
    void ejecutar(() => deshacerPasoAction({ pasoId: paso.paso_id }), () => `Deshiciste: ${paso.descripcion}`).then((r) => {
      if (r.ok) setDeshechos((d) => new Set(d).add(paso.paso_id))
    })
  }, [avisar, borrador, cambiarBorrador, ejecutar, motivoDeshacer, pasoDeshacer, ultimo])

  // Ctrl/Cmd+Z outside text fields and dialogs runs Deshacer.
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

  // Leaving the page (reload, close, another site) with unsaved changes asks first; the draft stays in this browser anyway.
  const hayCambios = cambios.length > 0
  useEffect(() => {
    if (!hayCambios) return
    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', alSalir)
    return () => window.removeEventListener('beforeunload', alSalir)
  }, [hayCambios])

  // ─── Guardar, Descartar, Quitar ───

  const guardar = useCallback(async () => {
    if (cambios.length === 0 || guardando) return
    const enviados = cambios
    setGuardando(true)
    setErrorGuardar(null)
    let resultado: ResultadoGuardar
    try {
      resultado = await guardarCambiosAction({ temporadaId: temporada.id, cambios: aPayload(enviados) })
    } catch {
      resultado = { ok: false, codigo: null, mensaje: ERROR_RED, indice: null }
    }
    setGuardando(false)
    if (resultado.ok) {
      const n = resultado.datos.guardados || enviados.length
      const texto = n === 1 ? 'Se guardó 1 cambio' : `Se guardaron ${n} cambios`
      setEnCamino({ cargado, cambios: [...(enCamino && enCamino.cargado === cargado ? enCamino.cambios : []), ...enviados] })
      escribirBorrador(BORRADOR_VACIO)
      setListaAbierta(false)
      setAnuncio(texto)
      notificar.success(texto)
      iniciar(() => router.refresh())
    } else {
      setErrorGuardar({ mensaje: resultado.mensaje, indice: resultado.indice })
      setAnuncio(resultado.mensaje)
      notificar.error(resultado.mensaje)
      if (resultado.indice !== null) setListaAbierta(true)
    }
  }, [cambios, cargado, enCamino, escribirBorrador, guardando, notificar, router, temporada.id])

  const descartar = useCallback(() => {
    if (guardando) return avisar(GUARDANDO)
    cambiarBorrador(BORRADOR_VACIO)
    setListaAbierta(false)
    setAnuncio('Descartaste los cambios sin guardar')
  }, [avisar, cambiarBorrador, guardando])

  const quitar = useCallback(
    (indice: number) => {
      if (guardando) return avisar(GUARDANDO)
      const motivo = motivoNoQuitar(cambios, indice)
      if (motivo) return avisar(motivo)
      const siguiente = quitarCambio(borrador, indice, base, catalogo)
      if (!siguiente) return
      const quitado = cambios[indice]
      cambiarBorrador(siguiente)
      if (quitado) setAnuncio(`Quitaste: ${quitado.descripcion}`)
    },
    [avisar, base, borrador, cambiarBorrador, cambios, catalogo, guardando],
  )

  // ─── Groups ───

  const segmentos = useMemo(() => new Map((estado?.segmentos ?? []).map((s) => [s.id, s])), [estado])
  const visibles = useMemo(() => new Set(tablero.grupos.map((g) => g.grupo_id)), [tablero.grupos])

  /** The name rule the server checks on save, in the director's words: unique per segment (S4). */
  const nombreUsado = useCallback(
    (nombre: string, segmentoId: string, salvo: string | null) =>
      tablero.grupos.some((g) => g.segmento_id === segmentoId && g.grupo_id !== salvo && normalizar(g.nombre) === normalizar(nombre)),
    [tablero.grupos],
  )

  /** One edit of a group (S3, S4) with only the changed keys; `que` names the field in the announcement. */
  const editar = useCallback(
    async (grupo: GrupoTablero, cambiosGrupo: Partial<DatosGrupo>, que: string): Promise<ResultadoAccion<null>> => {
      const validados = validarDatosGrupo(cambiosGrupo, { comprobarIds: false })
      if ('error' in validados) return rechazo(validados.error)
      const { nombre } = validados.valores
      if (nombre !== undefined && nombreUsado(nombre, grupo.segmento_id, grupo.grupo_id)) {
        return rechazo(`Ya hay un grupo llamado «${nombre}» en ${grupo.segmento_nombre}.`)
      }
      if (guardando) return rechazo(GUARDANDO)
      agregar({ tipo: 'editar', grupo: grupo.grupo_id, cambios: validados.valores }, `Cambiaste ${que} de ${grupo.nombre}`)
      return LISTO
    },
    [agregar, guardando, nombreUsado],
  )

  const usarLocalidad = useCallback(
    (grupo: GrupoTablero, sugerencia: SugerenciaLocalidad) => editar(grupo, { localidad_id: sugerencia.localidadId }, 'la localidad'),
    [editar],
  )

  const abrirGrupo = useCallback(
    (grupoId: string) => {
      if (visibles.has(grupoId)) setGrupoAbiertoId(grupoId)
    },
    [visibles],
  )

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
      usarLocalidad: (grupo, sugerencia) => void usarLocalidad(grupo, sugerencia),
      abrirGrupo,
      grupoVisible: (grupoId) => visibles.has(grupoId),
      pedirEliminar: setEliminar,
      pedirNuevoGrupo: setNuevoGrupo,
      segmento: (id) => segmentos.get(id) ?? null,
      marcar: (s, terminado) =>
        void ejecutar(
          () => marcarSegmentoAction({ temporadaId: temporada.id, segmentoId: s.id, terminado }),
          () => (terminado ? `Marcaste ${s.nombre} como terminado` : `${s.nombre} vuelve a estar sin terminar`),
        ),
      pendiente: {
        grupo: (grupoId) => marcas.grupos.has(grupoId),
        persona: (usuarioId) => marcas.personas.has(usuarioId),
        enSegmento: (segmentoId) => marcas.segmentos.get(segmentoId) ?? 0,
      },
    }),
    [abrirGrupo, arrastrando, editable, ejecutar, marcas, segmentos, soltar, temporada.id, usarLocalidad, visibles],
  )

  const confirmarUbicar = (usuarioIds: readonly string[], grupoId: string | null, rol: RolDestino, aviso: string | null) => {
    setUbicar(null)
    mover(usuarioIds, tablero.grupos.find((g) => g.grupo_id === grupoId) ?? null, rol, aviso, false)
  }

  /** From the group panel: a new role in the same group, or back to the bank (null). */
  const moverDesdePanel = (usuarioIds: readonly string[], grupo: GrupoTablero | null, rol: RolDestino) => mover(usuarioIds, grupo, rol, null, false)

  const crear = async (segmento: SegmentoPlanner, grupo: DatosGrupo): Promise<ResultadoAccion<null>> => {
    const validados = validarDatosGrupo(grupo, { comprobarIds: false })
    if ('error' in validados) return rechazo(validados.error)
    const nombre = validados.valores.nombre ?? ''
    if (nombreUsado(nombre, segmento.id, null)) return rechazo(`Ya hay un grupo llamado «${nombre}» en ${segmento.nombre}.`)
    if (guardando) return rechazo(GUARDANDO)
    const clave = nuevaClave(borrador, visibles)
    const agregado = agregar({ tipo: 'crear', clave, datos: { ...grupo, ...validados.valores } }, `Creaste ${nombre} en ${segmento.nombre}`)
    return agregado ? LISTO : rechazo(LLENO)
  }

  const confirmarEliminar = (grupo: GrupoTablero) => {
    setEliminar(null)
    agregar({ tipo: 'eliminar', grupo: grupo.grupo_id }, `Eliminaste ${grupo.nombre}`)
  }

  // ─── Lado a lado (T7) ───

  const movimientos = (lista: readonly MovimientoLado[], destino: GrupoTablero): CambioPlanner[] =>
    lista.map((m) => ({ tipo: 'mover', usuarios: [...m.usuarios], grupo: destino.grupo_id, rol: m.rol }))

  /** "Pasar": `carga` into `destino` keeping each one's role in `origen` (or `rol`); a couple outside Matrimonios asks who goes. */
  const pasar = (carga: Carga, destino: GrupoTablero, rol: RolDestino, origen: GrupoTablero | null) => {
    const plan = planPasar(carga.ids, rol, origen, destino, fichas)
    if (plan.tipo === 'elegir') return setUbicar({ carga, grupoId: destino.grupo_id, rol })
    const quien = nombres(plan.movimientos.flatMap((m) => m.usuarios))
    const agregados = agregarVarios(movimientos(plan.movimientos, destino), `${quien} en ${destino.nombre}${plan.aviso ? `. ${plan.aviso}` : ''}`)
    if (agregados > 0 && plan.aviso) notificar.info(plan.aviso)
  }

  /** "Pasar las N sin ubicar": every row in order; couples that must choose who goes stay, and the toast says so. */
  const pasarVarios = (filas: readonly { readonly carga: Carga; readonly rol: RolDestino }[], destino: GrupoTablero, origen: GrupoTablero | null) => {
    const cambiosLado: CambioPlanner[] = []
    const avisos: string[] = []
    const eligen: string[] = []
    filas.forEach(({ carga: c, rol }) => {
      const plan = planPasar(c.ids, rol, origen, destino, fichas)
      if (plan.tipo === 'elegir') return void eligen.push(c.nombre)
      cambiosLado.push(...movimientos(plan.movimientos, destino))
      if (plan.aviso) avisos.push(`${c.nombre}: ${plan.aviso}`)
    })
    const personas = new Set(cambiosLado.flatMap((c) => (c.tipo === 'mover' ? c.usuarios : []))).size
    const agregados = cambiosLado.length > 0 ? agregarVarios(cambiosLado, `Pasaste ${personas === 1 ? '1 persona' : `${personas} personas`} a ${destino.nombre}`) : 0
    if (agregados > 0 && avisos.length > 0) notificar.info(avisos.join(' · '))
    if (eligen.length > 0) notificar.info(`Elige quién va de ${enLista(eligen)} con «Pasar»: fuera de Matrimonios cada uno va a su grupo.`)
  }

  /**
   * "Crear grupo copiando este": a "crear" of the origin group's fields
   * (datosCopia) and the move of its leaders still without a group. The new
   * group's "tmp:" key, or null when nothing was added.
   */
  const crearCopia = (origen: GrupoTablero): string | null => {
    if (!editable(origen.segmento_id)) {
      avisar(`No puedes crear grupos de ${origen.segmento_nombre}.`)
      return null
    }
    const delSegmento = tablero.grupos.filter((g) => g.segmento_id === origen.segmento_id).map((g) => g.nombre)
    const copia = datosCopia(origen, catalogo, delSegmento, temporada.nombre)
    const validados = validarDatosGrupo(copia.datos, { comprobarIds: false })
    if ('error' in validados) {
      avisar(validados.error)
      return null
    }
    const clave = nuevaClave(borrador, visibles)
    const lideres = origen.lideres.map((l) => l.usuario_id)
    const libres = lideres.filter((id) => !fichas.get(id)?.grupo_actual_id)
    const ocupados = lideres.filter((id) => fichas.get(id)?.grupo_actual_id)
    const lista: CambioPlanner[] = [
      { tipo: 'crear', clave, datos: { ...copia.datos, ...validados.valores } },
      ...(libres.length > 0 ? [{ tipo: 'mover' as const, usuarios: libres, grupo: clave, rol: 'lider' as const }] : []),
    ]
    if (agregarVarios(lista, `Creaste ${copia.datos.nombre} copiando ${origen.nombre}`) === 0) return null
    if (copia.omitidos.length > 0) {
      notificar.info(
        `No se copiaron como directores de etapa: ${enLista(copia.omitidos.map(nombrePersona))}. Ya no son directores de ${origen.segmento_nombre}.`,
      )
    }
    if (ocupados.length > 0) notificar.info(`${nombres(ocupados)} ya ${ocupados.length === 1 ? 'está' : 'están'} en otro grupo de ${temporada.nombre}: no se movieron.`)
    return clave
  }

  return {
    tablero,
    fichas,
    contexto,
    anuncio,
    deshacer: { pendiente: ultimo, paso: pasoDeshacer, motivo: motivoDeshacer, ejecutar: deshacer } satisfies Deshacer,
    /** The pending changes, in order, and what can be done with them. */
    borrador: {
      cambios,
      guardando,
      error: errorGuardar,
      guardar: () => void guardar(),
      descartar,
      quitar,
      motivoQuitar: (indice: number) => motivoNoQuitar(cambios, indice),
      listaAbierta,
      abrirLista: () => setListaAbierta(true),
      cerrarLista: () => setListaAbierta(false),
    },
    ubicar,
    cerrarUbicar: () => setUbicar(null),
    confirmarUbicar,
    nuevoGrupo,
    cerrarNuevoGrupo: () => setNuevoGrupo(null),
    crear,
    eliminar,
    cerrarEliminar: () => setEliminar(null),
    confirmarEliminar,
    /** The open group panel; null when closed or when the group left the board (deleted, removed from the draft). */
    grupoAbierto: tablero.grupos.find((g) => g.grupo_id === grupoAbiertoId) ?? null,
    abrirGrupo,
    cerrarGrupo: () => setGrupoAbiertoId(null),
    editar,
    usarLocalidad,
    moverDesdePanel,
    pasar,
    pasarVarios,
    crearCopia,
  }
}
