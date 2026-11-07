/**
 * Planner — the draft of a session (S24 of odd/tasks/planner-gdv.md; replaces
 * the autosave of S13).
 *
 * The director moves, creates, edits and deletes on the board without
 * saving: every action adds one pending change, in the exact shape of
 * planner_guardar_cambios (acciones.ts, CambioPlanner), with a human
 * description ("Mover a Juan y Érica Castejón a Grupo #14 Los Escalona como
 * miembros"). "Guardar" sends the list in order; the database applies it in
 * one transaction, one step per change, so each one stays undoable (S15).
 *
 * Pure functions, no React, no storage:
 *   - aplicarBorrador: the board and bank with every pending change applied
 *     (a new group shows with its "tmp:" key as id; a deleted group is gone
 *     and its people are back in the bank, as planner_eliminar_grupo does).
 *   - agregarCambio: adds one change and keeps the list short: moves of the
 *     same people coalesce (A→G1 then G1→G2 is A→G2), moving back to the
 *     original place removes the change, an edit of the same field replaces
 *     the earlier one, an edit of a new group goes into its "crear", and
 *     deleting a new group removes its "crear" (people moved into it go back
 *     to the bank). A change that changes nothing is not added.
 *   - quitarUltimo (local undo) and quitarCambio (one change, refused while a
 *     later change depends on it: moves into a new group need its "crear",
 *     a later move of the same people needs the earlier one).
 *   - aPayload: the RPC payload; bloqueosConBorrador: the blockers of the
 *     board with the draft applied; marcasBorrador: what is unsaved.
 *   - serializarBorrador / leerBorrador: the localStorage text, per user and
 *     season, with a version; anything else reads as an empty draft.
 */
import { esObjeto } from './campos'
import { personasDelGrupo } from './grupo'
import { contar, enLista, nombrePareja, nombrePersona } from './textos'
import type { Bloqueo, DirectorGrupo, GrupoTablero, Localidad, PersonaBanco, PersonaGrupo, SegmentoConDirectores } from './tipos'
import {
  CLAVE_TEMPORAL,
  MAXIMO_CAMBIOS,
  ROLES_PLANNER,
  esClaveTemporal,
  type CambioPlanner,
  type DatosGrupo,
  type RolPlanner,
} from './acciones'

// ─── The board ───

export interface EstadoTablero {
  readonly grupos: readonly GrupoTablero[]
  readonly banco: readonly PersonaBanco[]
}

export interface Movimiento {
  readonly usuarioIds: readonly string[]
  /** null = back to the bank. */
  readonly grupoId: string | null
  readonly rol: RolPlanner | null
}

/** What a new group or an edit needs to show names: the segments with their directors and the localidades. */
export interface Catalogo {
  readonly segmentos: readonly SegmentoConDirectores[]
  readonly localidades: readonly Localidad[]
}

const LISTA_DE_ROL: Readonly<Record<RolPlanner, 'lideres' | 'aprendices' | 'miembros'>> = {
  lider: 'lideres',
  aprendiz: 'aprendices',
  miembro: 'miembros',
}

/** The grupo_miembros.rol of each role (planner_mover_personas). */
const ROL_EN_GRUPO: Readonly<Record<RolPlanner, string>> = { lider: 'Líder', aprendiz: 'Colíder', miembro: 'Miembro' }

/** The role a person has in a group, or null when they are not in it. */
export function rolEnGrupo(grupo: GrupoTablero, usuarioId: string): RolPlanner | null {
  if (grupo.lideres.some((p) => p.usuario_id === usuarioId)) return 'lider'
  if (grupo.aprendices.some((p) => p.usuario_id === usuarioId)) return 'aprendiz'
  if (grupo.miembros.some((p) => p.usuario_id === usuarioId)) return 'miembro'
  return null
}

/**
 * The board after a move: the people leave every group of the season and
 * enter the destination in that role; their bank rows say where they are now.
 */
export function aplicarMovimiento(estado: EstadoTablero, movimiento: Movimiento): EstadoTablero {
  const mueven = new Set(movimiento.usuarioIds)
  const fichas = new Map(estado.banco.map((p) => [p.usuario_id, p]))
  const enGrupos = new Map(estado.grupos.flatMap((g) => personasDelGrupo(g).map((p) => [p.usuario_id, p] as const)))
  const destino = estado.grupos.find((g) => g.grupo_id === movimiento.grupoId) ?? null
  const rol = movimiento.rol ?? 'miembro'
  const llegan: PersonaGrupo[] = movimiento.usuarioIds.flatMap((id) => {
    const persona = enGrupos.get(id) ?? fichas.get(id)
    return persona ? [{ usuario_id: id, nombre: persona.nombre, apellido: persona.apellido, lideres_origen: enGrupos.get(id)?.lideres_origen ?? [] }] : []
  })
  const sinEllos = (lista: readonly PersonaGrupo[]) => lista.filter((p) => !mueven.has(p.usuario_id))

  const grupos = estado.grupos.map((g) => {
    const limpio = { ...g, lideres: sinEllos(g.lideres), aprendices: sinEllos(g.aprendices), miembros: sinEllos(g.miembros) }
    if (!destino || g.grupo_id !== destino.grupo_id) return limpio
    const lista = LISTA_DE_ROL[rol]
    return { ...limpio, [lista]: [...limpio[lista], ...llegan] }
  })
  const banco = estado.banco.map((p) =>
    mueven.has(p.usuario_id)
      ? {
          ...p,
          grupo_actual_id: destino?.grupo_id ?? null,
          grupo_actual_nombre: destino?.nombre ?? null,
          grupo_actual_rol: destino ? ROL_EN_GRUPO[rol] : null,
          grupo_actual_segmento_id: destino?.segmento_id ?? null,
          grupos_en_temporada: destino ? 1 : 0,
        }
      : p,
  )
  return { grupos, banco }
}

/** Whether the move changes anything: someone not already there in that role. */
export function cambiaAlgo(estado: EstadoTablero, movimiento: Movimiento): boolean {
  const destino = estado.grupos.find((g) => g.grupo_id === movimiento.grupoId) ?? null
  return movimiento.usuarioIds.some((id) => {
    if (!destino) return estado.grupos.some((g) => rolEnGrupo(g, id) !== null)
    return rolEnGrupo(destino, id) !== (movimiento.rol ?? 'miembro')
  })
}

const espacios = (texto: string): string => texto.replace(/\s+/g, ' ').trim()
const horaCorta = (hora: string | null | undefined): string => {
  const partes = /^(\d{1,2}):(\d{2})/.exec(hora ?? '')
  return partes ? `${partes[1].padStart(2, '0')}:${partes[2]}` : ''
}

const nombreSegmento = (segmentoId: string, estado: EstadoTablero, catalogo: Catalogo): string =>
  catalogo.segmentos.find((s) => s.id === segmentoId)?.nombre ?? estado.grupos.find((g) => g.segmento_id === segmentoId)?.segmento_nombre ?? 'Segmento'

/** The directores de etapa of ids: from the segment's eligible ones, the group's current ones, or the bank. */
function directores(ids: readonly string[], segmentoId: string, actuales: readonly DirectorGrupo[], estado: EstadoTablero, catalogo: Catalogo): DirectorGrupo[] {
  const elegibles = catalogo.segmentos.find((s) => s.id === segmentoId)?.directores ?? []
  return ids.map((id) => {
    const conocido = elegibles.find((d) => d.usuario_id === id) ?? actuales.find((d) => d.usuario_id === id)
    if (conocido) return conocido
    const ficha = estado.banco.find((p) => p.usuario_id === id)
    return { segmento_lider_id: '', usuario_id: id, nombre: ficha?.nombre ?? '', apellido: ficha?.apellido ?? '' }
  })
}

/** A group with the given fields changed (only the keys present). */
function conCampos(grupo: GrupoTablero, cambios: Partial<DatosGrupo>, estado: EstadoTablero, catalogo: Catalogo): GrupoTablero {
  let siguiente: GrupoTablero = { ...grupo }
  if (cambios.nombre !== undefined) siguiente = { ...siguiente, nombre: espacios(cambios.nombre) }
  if (cambios.segmento_id !== undefined) {
    siguiente = { ...siguiente, segmento_id: cambios.segmento_id, segmento_nombre: nombreSegmento(cambios.segmento_id, estado, catalogo) }
  }
  if ('localidad_id' in cambios) {
    const localidad = catalogo.localidades.find((l) => l.id === cambios.localidad_id) ?? null
    siguiente = {
      ...siguiente,
      localidad_id: cambios.localidad_id ?? null,
      localidad_nombre: localidad?.nombre ?? null,
      localidad_municipio_id: localidad?.municipio_id ?? null,
      // The municipio name is not in campus_localidades; the bank knows it from where people live.
      localidad_municipio_nombre: localidad?.municipio_id ? (estado.banco.find((p) => p.municipio_id === localidad.municipio_id)?.municipio_nombre ?? null) : null,
    }
  }
  if ('dia_reunion' in cambios) siguiente = { ...siguiente, dia_reunion: cambios.dia_reunion ?? null }
  if ('hora_reunion' in cambios) siguiente = { ...siguiente, hora_reunion: cambios.hora_reunion ?? null }
  if ('capacidad_maxima' in cambios) siguiente = { ...siguiente, capacidad_maxima: cambios.capacidad_maxima ?? null }
  if (cambios.director_etapa_ids !== undefined) {
    siguiente = { ...siguiente, directores: directores(cambios.director_etapa_ids, siguiente.segmento_id, grupo.directores, estado, catalogo) }
  }
  return siguiente
}

/** A new group as planner_crear_grupo leaves it: proximo, pendiente, inactive, nobody in it. */
function grupoNuevo(clave: string, datos: DatosGrupo, estado: EstadoTablero, catalogo: Catalogo): GrupoTablero {
  const vacio: GrupoTablero = {
    grupo_id: clave,
    nombre: '',
    segmento_id: datos.segmento_id,
    segmento_nombre: nombreSegmento(datos.segmento_id, estado, catalogo),
    localidad_id: null,
    localidad_nombre: null,
    localidad_municipio_id: null,
    localidad_municipio_nombre: null,
    dia_reunion: null,
    hora_reunion: null,
    capacidad_maxima: null,
    estado_ciclo: 'proximo',
    estado_aprobacion: 'pendiente',
    activo: false,
    directores: [],
    lideres: [],
    aprendices: [],
    miembros: [],
  }
  return conCampos(vacio, datos, estado, catalogo)
}

const existe = (estado: EstadoTablero, grupoId: string): boolean => estado.grupos.some((g) => g.grupo_id === grupoId)

/** One change on the board; a change on a group that is not there leaves the board as it is. */
export function aplicarCambio(estado: EstadoTablero, cambio: CambioPlanner, catalogo: Catalogo): EstadoTablero {
  switch (cambio.tipo) {
    case 'mover':
      if (cambio.grupo !== null && !existe(estado, cambio.grupo)) return estado
      return aplicarMovimiento(estado, { usuarioIds: cambio.usuarios, grupoId: cambio.grupo, rol: cambio.grupo === null ? null : cambio.rol })
    case 'crear':
      if (existe(estado, cambio.clave)) return estado
      return { ...estado, grupos: [...estado.grupos, grupoNuevo(cambio.clave, cambio.datos, estado, catalogo)] }
    case 'editar': {
      const grupo = estado.grupos.find((g) => g.grupo_id === cambio.grupo)
      if (!grupo) return estado
      const editado = conCampos(grupo, cambio.cambios, estado, catalogo)
      return {
        grupos: estado.grupos.map((g) => (g.grupo_id === grupo.grupo_id ? editado : g)),
        banco: estado.banco.map((p) =>
          p.grupo_actual_id === grupo.grupo_id ? { ...p, grupo_actual_nombre: editado.nombre, grupo_actual_segmento_id: editado.segmento_id } : p,
        ),
      }
    }
    case 'eliminar':
      if (!existe(estado, cambio.grupo)) return estado
      return {
        grupos: estado.grupos.filter((g) => g.grupo_id !== cambio.grupo),
        banco: estado.banco.map((p) =>
          p.grupo_actual_id === cambio.grupo
            ? { ...p, grupo_actual_id: null, grupo_actual_nombre: null, grupo_actual_rol: null, grupo_actual_segmento_id: null, grupos_en_temporada: 0 }
            : p,
        ),
      }
  }
}

// ─── The draft ───

export interface CambioPendiente {
  /** Unique in the draft (list keys). */
  readonly id: string
  readonly cambio: CambioPlanner
  /** "Mover a Ana Gil a Grupo Rosas como miembro". */
  readonly descripcion: string
  /** The segments it touches: "Terminé mi segmento" waits until they are saved (S14, S17). */
  readonly segmentos: readonly string[]
}

export interface Borrador {
  readonly cambios: readonly CambioPendiente[]
  /** Next number for change ids and "tmp:" keys. */
  readonly siguiente: number
}

export const BORRADOR_VACIO: Borrador = { cambios: [], siguiente: 1 }

/**
 * The key of the next new group ("tmp:g3"), skipping `ocupadas` (a group just
 * saved still shows with its key until the refreshed data arrives);
 * agregarCambio moves the counter on.
 */
export function nuevaClave(borrador: Borrador, ocupadas: ReadonlySet<string> = new Set()): string {
  let n = borrador.siguiente
  while (ocupadas.has(`tmp:g${n}`)) n += 1
  return `tmp:g${n}`
}

export const aplicarBorrador = (base: EstadoTablero, cambios: readonly CambioPendiente[], catalogo: Catalogo): EstadoTablero =>
  cambios.reduce((estado, c) => aplicarCambio(estado, c.cambio, catalogo), base)

/** The planner_guardar_cambios payload, in order. */
export const aPayload = (cambios: readonly CambioPendiente[]): CambioPlanner[] =>
  cambios.map(({ cambio }) => (cambio.tipo === 'mover' && cambio.grupo === null ? { ...cambio, rol: null } : cambio))

// ─── Descriptions ───

const PALABRA_ROL: Readonly<Record<RolPlanner, readonly [string, string]>> = {
  lider: ['líder', 'líderes'],
  aprendiz: ['aprendiz', 'aprendices'],
  miembro: ['miembro', 'miembros'],
}

function nombres(usuarios: readonly string[], estado: EstadoTablero): string {
  const personas = usuarios.map(
    (id) => estado.banco.find((p) => p.usuario_id === id) ?? estado.grupos.flatMap(personasDelGrupo).find((p) => p.usuario_id === id) ?? null,
  )
  const [una, otra] = personas
  if (personas.length === 2 && una && otra) return nombrePareja(una, otra)
  return enLista(personas.map((p) => (p ? nombrePersona(p) : 'una persona')))
}

const nombreGrupo = (grupo: GrupoTablero | undefined): string => (grupo ? espacios(grupo.nombre) || 'el grupo' : 'un grupo')

function describirMovimiento(cambio: Extract<CambioPlanner, { tipo: 'mover' }>, estado: EstadoTablero): string {
  const quien = nombres(cambio.usuarios, estado)
  if (cambio.grupo === null) return `Devolver a ${quien} al banco`
  const destino = estado.grupos.find((g) => g.grupo_id === cambio.grupo)
  const rol = cambio.rol ?? 'miembro'
  const [singular, plural] = PALABRA_ROL[rol]
  const palabra = cambio.usuarios.length > 1 ? plural : singular
  if (destino && cambio.usuarios.every((id) => rolEnGrupo(destino, id) !== null)) return `Cambiar el rol de ${quien} a ${palabra} en ${nombreGrupo(destino)}`
  return `Mover a ${quien} a ${nombreGrupo(destino)} como ${palabra}`
}

function describirEdicion(grupo: GrupoTablero | undefined, cambios: Partial<DatosGrupo>, estado: EstadoTablero, catalogo: Catalogo): string {
  const de = nombreGrupo(grupo)
  const claves = Object.keys(cambios) as (keyof DatosGrupo)[]
  if (claves.length !== 1) return `Editar ${de}`
  switch (claves[0]) {
    case 'nombre':
      return `Cambiar nombre de ${de} a ${espacios(cambios.nombre ?? '')}`
    case 'segmento_id':
      return `Cambiar segmento de ${de} a ${nombreSegmento(cambios.segmento_id ?? '', estado, catalogo)}`
    case 'localidad_id': {
      const localidad = catalogo.localidades.find((l) => l.id === cambios.localidad_id)
      return cambios.localidad_id ? `Cambiar localidad de ${de} a ${localidad?.nombre ?? 'otra localidad'}` : `Quitar la localidad de ${de}`
    }
    case 'dia_reunion':
      return cambios.dia_reunion ? `Cambiar día de ${de} a ${cambios.dia_reunion}` : `Quitar el día de ${de}`
    case 'hora_reunion':
      return cambios.hora_reunion ? `Cambiar hora de ${de} a ${horaCorta(cambios.hora_reunion)}` : `Quitar la hora de ${de}`
    case 'capacidad_maxima':
      return cambios.capacidad_maxima ? `Cambiar capacidad de ${de} a ${cambios.capacidad_maxima}` : `Quitar la capacidad de ${de}`
    case 'director_etapa_ids': {
      const ids = cambios.director_etapa_ids ?? []
      if (ids.length === 0) return `Quitar los directores de etapa de ${de}`
      const lista = directores(ids, grupo?.segmento_id ?? '', grupo?.directores ?? [], estado, catalogo).map(nombrePersona)
      return `Cambiar directores de etapa de ${de} a ${enLista(lista)}`
    }
  }
}

/** The description of a change against the board right before it. */
export function describirCambio(cambio: CambioPlanner, estado: EstadoTablero, catalogo: Catalogo): string {
  switch (cambio.tipo) {
    case 'mover':
      return describirMovimiento(cambio, estado)
    case 'crear':
      return `Crear grupo ${espacios(cambio.datos.nombre)}`
    case 'editar':
      return describirEdicion(
        estado.grupos.find((g) => g.grupo_id === cambio.grupo),
        cambio.cambios,
        estado,
        catalogo,
      )
    case 'eliminar':
      return `Eliminar grupo ${nombreGrupo(estado.grupos.find((g) => g.grupo_id === cambio.grupo))}`
  }
}

/** The segments a change touches, against the board right before it. */
function segmentosDe(cambio: CambioPlanner, estado: EstadoTablero): string[] {
  const deGrupo = (id: string | null) => (id ? estado.grupos.find((g) => g.grupo_id === id)?.segmento_id : undefined)
  const lista: (string | undefined)[] = []
  if (cambio.tipo === 'mover') {
    lista.push(deGrupo(cambio.grupo))
    estado.grupos.forEach((g) => cambio.usuarios.some((id) => rolEnGrupo(g, id) !== null) && lista.push(g.segmento_id))
  } else if (cambio.tipo === 'crear') {
    lista.push(cambio.datos.segmento_id)
  } else {
    lista.push(deGrupo(cambio.grupo))
    if (cambio.tipo === 'editar') lista.push(cambio.cambios.segmento_id)
  }
  return [...new Set(lista.filter((s): s is string => Boolean(s)))]
}

const pendiente = (id: string, cambio: CambioPlanner, estado: EstadoTablero, catalogo: Catalogo): CambioPendiente => ({
  id,
  cambio,
  descripcion: describirCambio(cambio, estado, catalogo),
  segmentos: segmentosDe(cambio, estado),
})

// ─── Adding and removing ───

/** Whether an edit changes any field of the group as it is now. */
function editaAlgo(grupo: GrupoTablero, cambios: Partial<DatosGrupo>): boolean {
  return (Object.keys(cambios) as (keyof DatosGrupo)[]).some((clave) => {
    switch (clave) {
      case 'nombre':
        return espacios(cambios.nombre ?? '') !== espacios(grupo.nombre)
      case 'segmento_id':
        return cambios.segmento_id !== grupo.segmento_id
      case 'localidad_id':
        return (cambios.localidad_id ?? null) !== grupo.localidad_id
      case 'dia_reunion':
        return (cambios.dia_reunion ?? null) !== grupo.dia_reunion
      case 'hora_reunion':
        return horaCorta(cambios.hora_reunion) !== horaCorta(grupo.hora_reunion)
      case 'capacidad_maxima':
        return (cambios.capacidad_maxima ?? null) !== grupo.capacidad_maxima
      case 'director_etapa_ids': {
        const nuevos = new Set(cambios.director_etapa_ids ?? [])
        const actuales = new Set(grupo.directores.map((d) => d.usuario_id))
        return nuevos.size !== actuales.size || [...nuevos].some((id) => !actuales.has(id))
      }
    }
  })
}

const mismoConjunto = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x))
const comparten = (a: readonly string[], b: readonly string[]): boolean => a.some((x) => b.includes(x))
const usaGrupo = (cambio: CambioPlanner, grupoId: string): boolean =>
  (cambio.tipo === 'mover' || cambio.tipo === 'editar' || cambio.tipo === 'eliminar') && cambio.grupo === grupoId

/**
 * Walks the changes in order and keeps only those that still do something:
 * on a group that exists, a move or an edit that changes something, no
 * repeated "crear". Descriptions and segments are recomputed. The same draft
 * comes back when nothing was dropped or reworded.
 */
export function normalizarBorrador(borrador: Borrador, base: EstadoTablero, catalogo: Catalogo): Borrador {
  let estado = base
  let cambiado = false
  const cambios: CambioPendiente[] = []
  borrador.cambios.forEach((c) => {
    const { cambio } = c
    const vale =
      cambio.tipo === 'mover'
        ? (cambio.grupo === null || existe(estado, cambio.grupo)) && cambiaAlgo(estado, { usuarioIds: cambio.usuarios, grupoId: cambio.grupo, rol: cambio.rol })
        : cambio.tipo === 'crear'
          ? !existe(estado, cambio.clave)
          : cambio.tipo === 'editar'
            ? estado.grupos.some((g) => g.grupo_id === cambio.grupo && editaAlgo(g, cambio.cambios))
            : existe(estado, cambio.grupo) && !esClaveTemporal(cambio.grupo)
    if (!vale) {
      cambiado = true
      return
    }
    const nuevo = pendiente(c.id, cambio, estado, catalogo)
    if (nuevo.descripcion !== c.descripcion || !mismoConjunto(nuevo.segmentos, c.segmentos)) cambiado = true
    cambios.push(nuevo.descripcion === c.descripcion && mismoConjunto(nuevo.segmentos, c.segmentos) ? c : nuevo)
    estado = aplicarCambio(estado, cambio, catalogo)
  })
  return cambiado ? { ...borrador, cambios } : borrador
}

const conCambios = (borrador: Borrador, cambios: readonly CambioPendiente[], base: EstadoTablero, catalogo: Catalogo): Borrador =>
  normalizarBorrador({ cambios, siguiente: borrador.siguiente + 1 }, base, catalogo)

/**
 * Adds one change to the draft (see the header for how the list stays
 * short). The same draft comes back when the change changes nothing.
 */
export function agregarCambio(borrador: Borrador, cambio: CambioPlanner, base: EstadoTablero, catalogo: Catalogo): Borrador {
  const id = `c${borrador.siguiente}`
  const lista = borrador.cambios
  const actual = aplicarBorrador(base, lista, catalogo)

  if (cambio.tipo === 'mover') {
    if (cambio.grupo !== null && !existe(actual, cambio.grupo)) return borrador
    const mov = { usuarioIds: cambio.usuarios, grupoId: cambio.grupo, rol: cambio.grupo === null ? null : cambio.rol }
    // The latest change that moved any of these people: the same people coalesce into one move.
    const previo = lista.reduce((ultimo, c, i) => (c.cambio.tipo === 'mover' && comparten(c.cambio.usuarios, cambio.usuarios) ? i : ultimo), -1)
    const anterior = previo >= 0 ? lista[previo].cambio : null
    if (anterior?.tipo === 'mover' && mismoConjunto(anterior.usuarios, cambio.usuarios)) {
      const sin = lista.filter((_, i) => i !== previo)
      const estadoSin = aplicarBorrador(base, sin, catalogo)
      if (!cambiaAlgo(estadoSin, mov)) return conCambios(borrador, sin, base, catalogo)
      return conCambios(borrador, [...sin, pendiente(id, cambio, estadoSin, catalogo)], base, catalogo)
    }
    if (!cambiaAlgo(actual, mov)) return borrador
    return conCambios(borrador, [...lista, pendiente(id, cambio, actual, catalogo)], base, catalogo)
  }

  if (cambio.tipo === 'crear') {
    if (existe(actual, cambio.clave)) return borrador
    return conCambios(borrador, [...lista, pendiente(id, cambio, actual, catalogo)], base, catalogo)
  }

  if (cambio.tipo === 'editar') {
    if (esClaveTemporal(cambio.grupo)) {
      // A new group: the edit goes into its "crear".
      const i = lista.findIndex((c) => c.cambio.tipo === 'crear' && c.cambio.clave === cambio.grupo)
      const crear = lista[i]?.cambio
      if (crear?.tipo !== 'crear') return borrador
      const nuevo: CambioPlanner = { ...crear, datos: { ...crear.datos, ...cambio.cambios } }
      const antes = aplicarBorrador(base, lista.slice(0, i), catalogo)
      return conCambios(borrador, lista.map((c, j) => (j === i ? pendiente(c.id, nuevo, antes, catalogo) : c)), base, catalogo)
    }
    const grupo = actual.grupos.find((g) => g.grupo_id === cambio.grupo)
    if (!grupo) return borrador
    // An earlier edit of the same group and fields is replaced in place.
    const claves = Object.keys(cambio.cambios)
    const previo = lista.findIndex((c) => c.cambio.tipo === 'editar' && c.cambio.grupo === cambio.grupo && mismoConjunto(Object.keys(c.cambio.cambios), claves))
    if (previo >= 0) {
      const antes = aplicarBorrador(base, lista.slice(0, previo), catalogo)
      const sigue = antes.grupos.find((g) => g.grupo_id === cambio.grupo)
      const resto = lista.filter((_, i) => i !== previo)
      if (!sigue || !editaAlgo(sigue, cambio.cambios)) return conCambios(borrador, resto, base, catalogo)
      return conCambios(borrador, lista.map((c, i) => (i === previo ? pendiente(c.id, cambio, antes, catalogo) : c)), base, catalogo)
    }
    if (!editaAlgo(grupo, cambio.cambios)) return borrador
    return conCambios(borrador, [...lista, pendiente(id, cambio, actual, catalogo)], base, catalogo)
  }

  if (!existe(actual, cambio.grupo)) return borrador
  if (esClaveTemporal(cambio.grupo)) {
    // A new group never reached the server: drop its "crear" and its edits; people moved into it go back to the bank.
    const clave = cambio.grupo
    const resto = lista.flatMap((c): CambioPendiente[] => {
      if (c.cambio.tipo === 'crear' && c.cambio.clave === clave) return []
      if (c.cambio.tipo === 'editar' && c.cambio.grupo === clave) return []
      if (c.cambio.tipo === 'mover' && c.cambio.grupo === clave) return [{ ...c, cambio: { ...c.cambio, grupo: null, rol: null } }]
      return [c]
    })
    return conCambios(borrador, resto, base, catalogo)
  }
  return conCambios(borrador, [...lista, pendiente(id, cambio, actual, catalogo)], base, catalogo)
}

/** Local undo: the draft without its last change. */
export const quitarUltimo = (borrador: Borrador): Borrador =>
  borrador.cambios.length === 0 ? borrador : { ...borrador, cambios: borrador.cambios.slice(0, -1) }

/**
 * Why change `indice` cannot be removed on its own, or null when it can: a
 * later change uses the new group it creates, or moves its people again.
 */
export function motivoNoQuitar(cambios: readonly CambioPendiente[], indice: number): string | null {
  const objetivo = cambios[indice]?.cambio
  if (!objetivo) return null
  const despues = cambios.slice(indice + 1)
  if (objetivo.tipo === 'crear') {
    const usa = despues.find((c) => usaGrupo(c.cambio, objetivo.clave))
    return usa ? `Primero quita «${usa.descripcion}»: usa este grupo nuevo.` : null
  }
  if (objetivo.tipo === 'mover') {
    const vuelve = despues.find((c) => c.cambio.tipo === 'mover' && comparten(c.cambio.usuarios, objetivo.usuarios))
    return vuelve ? `Primero quita «${vuelve.descripcion}»: vuelve a mover a estas personas.` : null
  }
  return null
}

/** The draft without change `indice`; null when a later change depends on it (motivoNoQuitar). */
export function quitarCambio(borrador: Borrador, indice: number, base: EstadoTablero, catalogo: Catalogo): Borrador | null {
  if (indice < 0 || indice >= borrador.cambios.length || motivoNoQuitar(borrador.cambios, indice) !== null) return null
  return normalizarBorrador({ ...borrador, cambios: borrador.cambios.filter((_, i) => i !== indice) }, base, catalogo)
}

// ─── What is unsaved ───

export interface MarcasBorrador {
  /** Groups created, edited, deleted, or that people entered or left. */
  readonly grupos: ReadonlySet<string>
  /** People moved. */
  readonly personas: ReadonlySet<string>
  /** Pending changes per segment. */
  readonly segmentos: ReadonlyMap<string, number>
}

export function marcasBorrador(cambios: readonly CambioPendiente[], base: EstadoTablero): MarcasBorrador {
  const grupos = new Set<string>()
  const personas = new Set<string>()
  const segmentos = new Map<string, number>()
  cambios.forEach(({ cambio, segmentos: delCambio }) => {
    delCambio.forEach((s) => segmentos.set(s, (segmentos.get(s) ?? 0) + 1))
    if (cambio.tipo === 'crear') grupos.add(cambio.clave)
    else if (cambio.grupo !== null) grupos.add(cambio.grupo)
    if (cambio.tipo !== 'mover') return
    cambio.usuarios.forEach((id) => personas.add(id))
    base.grupos.forEach((g) => cambio.usuarios.some((id) => rolEnGrupo(g, id) !== null) && grupos.add(g.grupo_id))
  })
  return { grupos, personas, segmentos }
}

/** "3 movimientos · 1 grupo nuevo · 2 ediciones · 1 grupo eliminado". */
export function resumenCambios(cambios: readonly CambioPendiente[]): string {
  const n = (tipo: CambioPlanner['tipo']) => cambios.filter((c) => c.cambio.tipo === tipo).length
  const partes = [
    [n('mover'), 'movimiento', 'movimientos'],
    [n('crear'), 'grupo nuevo', 'grupos nuevos'],
    [n('editar'), 'edición', 'ediciones'],
    [n('eliminar'), 'grupo eliminado', 'grupos eliminados'],
  ] as const
  const texto = partes.filter(([cantidad]) => cantidad > 0).map(([cantidad, uno, varios]) => contar(cantidad, uno, varios))
  return texto.length > 0 ? texto.join(' · ') : 'Sin cambios'
}

// ─── Blockers through the draft ───

const ORDEN_BLOQUEO: Readonly<Record<Bloqueo['tipo'], number>> = { sin_lider: 1, sin_director: 2, sin_localidad: 3, persona_en_dos_grupos: 4 }

/**
 * The publish blockers (S6) of the board with the draft applied, the same
 * rows planner_bloqueos would give after saving: Líder, director de etapa and
 * localidad from each group on the board; "persona en dos grupos" from the
 * server, minus the people the draft moved (a move leaves every other group)
 * and the groups it deleted. Without pending changes, the server's rows.
 */
export function bloqueosConBorrador(servidor: readonly Bloqueo[], estado: EstadoTablero, cambios: readonly CambioPendiente[]): readonly Bloqueo[] {
  if (cambios.length === 0) return servidor
  const movidos = new Set(cambios.flatMap((c) => (c.cambio.tipo === 'mover' ? c.cambio.usuarios : [])))
  const grupos = new Map(estado.grupos.map((g) => [g.grupo_id, g]))
  const fila = (g: GrupoTablero, tipo: Bloqueo['tipo'], detalle: string): Bloqueo => ({
    tipo,
    segmento_id: g.segmento_id,
    grupo_id: g.grupo_id,
    grupo_nombre: g.nombre,
    usuario_id: null,
    detalle,
  })
  const deGrupos = estado.grupos.flatMap((g) => [
    ...(g.lideres.length === 0 ? [fila(g, 'sin_lider', 'No tiene líder')] : []),
    ...(g.directores.length === 0 ? [fila(g, 'sin_director', `No tiene director de etapa de ${g.segmento_nombre}`)] : []),
    ...(g.localidad_id ? [] : [fila(g, 'sin_localidad', 'No tiene localidad')]),
  ])
  const dobles = servidor.filter((b) => b.tipo === 'persona_en_dos_grupos' && b.usuario_id && !movidos.has(b.usuario_id) && grupos.has(b.grupo_id))
  const porPersona = new Map<string, number>()
  dobles.forEach((b) => porPersona.set(b.usuario_id ?? '', (porPersona.get(b.usuario_id ?? '') ?? 0) + 1))
  const enDos = dobles
    .filter((b) => (porPersona.get(b.usuario_id ?? '') ?? 0) > 1)
    .map((b) => ({ ...b, grupo_nombre: grupos.get(b.grupo_id)?.nombre ?? b.grupo_nombre }))
  return [...deGrupos, ...enDos].sort(
    (a, b) =>
      ORDEN_BLOQUEO[a.tipo] - ORDEN_BLOQUEO[b.tipo] ||
      (grupos.get(a.grupo_id)?.segmento_nombre ?? '').localeCompare(grupos.get(b.grupo_id)?.segmento_nombre ?? '', 'es') ||
      a.grupo_nombre.localeCompare(b.grupo_nombre, 'es'),
  )
}

// ─── localStorage ───

/** Bump when the stored shape changes: an older draft is then discarded. */
export const VERSION_BORRADOR = 1

export interface DuenoBorrador {
  readonly usuarioId: string
  readonly temporadaId: string
}

export const claveBorrador = (usuarioId: string, temporadaId: string): string => `planner-gdv:borrador:${usuarioId}:${temporadaId}`

export const serializarBorrador = (borrador: Borrador, dueno: DuenoBorrador): string =>
  JSON.stringify({ version: VERSION_BORRADOR, usuarioId: dueno.usuarioId, temporadaId: dueno.temporadaId, siguiente: borrador.siguiente, cambios: borrador.cambios })

const esTexto = (valor: unknown): valor is string => typeof valor === 'string'
const esListaDeTextos = (valor: unknown): valor is string[] => Array.isArray(valor) && valor.every(esTexto)
const CAMPOS_GRUPO = new Set(['nombre', 'segmento_id', 'localidad_id', 'dia_reunion', 'hora_reunion', 'capacidad_maxima', 'director_etapa_ids'])
const esDatos = (valor: unknown): boolean => esObjeto(valor) && Object.keys(valor).every((k) => CAMPOS_GRUPO.has(k))

/** The shape of one stored change (values are checked again on save). */
function esCambio(valor: unknown): valor is CambioPlanner {
  if (!esObjeto(valor)) return false
  switch (valor.tipo) {
    case 'mover':
      return (
        esListaDeTextos(valor.usuarios) &&
        valor.usuarios.length > 0 &&
        (valor.grupo === null || esTexto(valor.grupo)) &&
        (valor.rol === null || ROLES_PLANNER.includes(valor.rol as RolPlanner))
      )
    case 'crear':
      return esTexto(valor.clave) && CLAVE_TEMPORAL.test(valor.clave) && esDatos(valor.datos) && esObjeto(valor.datos) && esTexto(valor.datos.nombre) && esTexto(valor.datos.segmento_id)
    case 'editar':
      return esTexto(valor.grupo) && esDatos(valor.cambios)
    case 'eliminar':
      return esTexto(valor.grupo)
    default:
      return false
  }
}

const esPendiente = (valor: unknown): valor is CambioPendiente =>
  esObjeto(valor) && esTexto(valor.id) && esTexto(valor.descripcion) && esListaDeTextos(valor.segmentos) && esCambio(valor.cambio)

/** The stored draft of this user and season; an empty draft for anything else (another version, season, user or shape). */
export function leerBorrador(texto: string | null | undefined, dueno: DuenoBorrador): Borrador {
  if (!texto) return BORRADOR_VACIO
  let valor: unknown
  try {
    valor = JSON.parse(texto)
  } catch {
    return BORRADOR_VACIO
  }
  if (!esObjeto(valor) || valor.version !== VERSION_BORRADOR || valor.usuarioId !== dueno.usuarioId || valor.temporadaId !== dueno.temporadaId) {
    return BORRADOR_VACIO
  }
  const { cambios, siguiente } = valor
  if (!Array.isArray(cambios) || cambios.length > MAXIMO_CAMBIOS || !cambios.every(esPendiente)) return BORRADOR_VACIO
  if (typeof siguiente !== 'number' || !Number.isInteger(siguiente) || siguiente < 1) return BORRADOR_VACIO
  return { cambios, siguiente }
}
