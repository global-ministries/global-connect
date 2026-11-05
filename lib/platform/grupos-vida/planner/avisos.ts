/**
 * Planner — warnings (S7 of odd/tasks/planner-gdv.md, with S2 and S5). They
 * never block publishing; the blockers (S6) come from planner_bloqueos.
 *
 * Per group: repite_lider, otra_ciudad, sin_direccion, grupo_pequeno,
 * sobre_cupo, sin_aprendices. From the bank: conyuge_separado, sin_ubicar,
 * otra_temporada. Each warning carries its groups and people so the UI can
 * place it on a card, a person row or the alerts panel, and filter it by the
 * groups the actor sees (S10).
 */
import { esMatrimonios, personasDelGrupo } from './grupo'
import { contar, enLista, nombrePareja, nombrePersona } from './textos'
import type { GrupoTablero, Localidad, PersonaBanco, PersonaGrupo, SegmentoPlanner } from './tipos'

/** Fewer current people than this is a small group. */
export const MINIMO_PERSONAS_GRUPO = 6

export type TipoAviso =
  | 'repite_lider'
  | 'otra_ciudad'
  | 'sin_direccion'
  | 'grupo_pequeno'
  | 'sobre_cupo'
  | 'sin_aprendices'
  | 'conyuge_separado'
  | 'sin_ubicar'
  | 'otra_temporada'

export interface Aviso {
  readonly tipo: TipoAviso
  /** The groups it concerns (empty for a bank-only warning). */
  readonly grupoIds: readonly string[]
  /** The people it concerns (a couple is one warning with both). */
  readonly personaIds: readonly string[]
  readonly mensaje: string
}

export interface DatosAvisos {
  readonly grupos: readonly GrupoTablero[]
  readonly banco: readonly PersonaBanco[]
  readonly localidades: readonly Localidad[]
  /**
   * Segment names beyond the visible groups (planner_temporadas().segmentos),
   * so a spouse in a group the actor does not see still has a segment.
   */
  readonly segmentos?: readonly SegmentoPlanner[]
}

interface Contexto {
  readonly banco: ReadonlyMap<string, PersonaBanco>
  /** Municipios where some localidad is: living anywhere else (Peña) is not "another city". */
  readonly municipiosConLocalidad: ReadonlySet<string>
  readonly nombreSegmento: ReadonlyMap<string, string>
}

const aviso = (tipo: TipoAviso, grupoIds: readonly string[], personaIds: readonly string[], mensaje: string): Aviso => ({
  tipo,
  grupoIds,
  personaIds,
  mensaje,
})

function crearContexto({ grupos, banco, localidades, segmentos = [] }: DatosAvisos): Contexto {
  return {
    banco: new Map(banco.map((persona) => [persona.usuario_id, persona])),
    municipiosConLocalidad: new Set(localidades.flatMap((l) => (l.municipio_id ? [l.municipio_id] : []))),
    nombreSegmento: new Map([...segmentos.map((s): [string, string] => [s.id, s.nombre]), ...grupos.map((g): [string, string] => [g.segmento_id, g.segmento_nombre])]),
  }
}

/** Members and aprendices whose Líder of the origin season leads this group; a couple that repeats is one unit. */
function avisosRepiteLider(grupo: GrupoTablero, contexto: Contexto): Aviso[] {
  const lideres = new Set(grupo.lideres.map((l) => l.usuario_id))
  const repiten = personasDelGrupo({ lideres: [], aprendices: grupo.aprendices, miembros: grupo.miembros }).filter(
    (p) => !lideres.has(p.usuario_id) && p.lideres_origen.some((liderId) => lideres.has(liderId)),
  )
  const informados = new Set<string>()
  return repiten.flatMap((persona) => {
    if (informados.has(persona.usuario_id)) return []
    const conyugeId = contexto.banco.get(persona.usuario_id)?.conyuge_id
    const conyuge = repiten.find((otra) => otra.usuario_id === conyugeId && otra.usuario_id !== persona.usuario_id)
    const unidad = conyuge ? [persona, conyuge] : [persona]
    unidad.forEach((p) => informados.add(p.usuario_id))
    const anteriores = enLista(grupo.lideres.filter((l) => unidad.some((p) => p.lideres_origen.includes(l.usuario_id))).map(nombrePersona))
    const quien = conyuge ? `${nombrePareja(persona, conyuge)} repiten` : `${nombrePersona(persona)} repite`
    return [aviso('repite_lider', [grupo.grupo_id], unidad.map((p) => p.usuario_id), `${quien} con su líder anterior: ${anteriores}`)]
  })
}

/** S5: lives in the municipio of another localidad; no municipio is "sin dirección", never "otra ciudad". */
function avisoDeDireccion(grupo: GrupoTablero, persona: PersonaGrupo, contexto: Contexto): Aviso | null {
  const enBanco = contexto.banco.get(persona.usuario_id)
  if (!enBanco) return null
  const ids = [persona.usuario_id]
  if (!enBanco.municipio_id) return aviso('sin_direccion', [grupo.grupo_id], ids, `${nombrePersona(persona)} no tiene dirección`)
  const comparable = grupo.localidad_id !== null && grupo.localidad_municipio_id !== null
  const otraLocalidad = enBanco.municipio_id !== grupo.localidad_municipio_id && contexto.municipiosConLocalidad.has(enBanco.municipio_id)
  if (!comparable || !otraLocalidad) return null
  const mensaje = `${nombrePersona(persona)} vive en ${enBanco.municipio_nombre ?? 'otro municipio'} y el grupo es de ${grupo.localidad_nombre ?? 'otra localidad'}`
  return aviso('otra_ciudad', [grupo.grupo_id], ids, mensaje)
}

function avisosDeTamano(grupo: GrupoTablero): Aviso[] {
  const cantidad = personasDelGrupo(grupo).length
  const personas = contar(cantidad, 'persona', 'personas')
  const lista: Aviso[] = []
  if (cantidad < MINIMO_PERSONAS_GRUPO) {
    const tiene = cantidad === 0 ? 'Todavía no tiene personas' : `Tiene ${personas}`
    lista.push(aviso('grupo_pequeno', [grupo.grupo_id], [], `${tiene}; lo mínimo son ${MINIMO_PERSONAS_GRUPO}`))
  }
  if (grupo.capacidad_maxima !== null && cantidad > grupo.capacidad_maxima) {
    lista.push(aviso('sobre_cupo', [grupo.grupo_id], [], `Tiene ${personas} y su cupo es ${grupo.capacidad_maxima}`))
  }
  return lista
}

function avisosDeGrupo(grupo: GrupoTablero, contexto: Contexto): Aviso[] {
  const direcciones = personasDelGrupo(grupo).flatMap((p) => avisoDeDireccion(grupo, p, contexto) ?? [])
  const sinAprendices = grupo.aprendices.length === 0 ? [aviso('sin_aprendices', [grupo.grupo_id], [], 'No tiene aprendices')] : []
  return [...avisosRepiteLider(grupo, contexto), ...direcciones, ...avisosDeTamano(grupo), ...sinAprendices]
}

/** S2: a couple split between a Matrimonios group and a group of another segment, once per couple. */
function avisosConyugeSeparado(contexto: Contexto): Aviso[] {
  const parejas = new Set<string>()
  return [...contexto.banco.values()].flatMap((persona) => {
    const conyuge = persona.conyuge_id ? contexto.banco.get(persona.conyuge_id) : undefined
    if (!conyuge || conyuge.usuario_id === persona.usuario_id) return []
    const pareja = [persona.usuario_id, conyuge.usuario_id].sort().join('|')
    if (parejas.has(pareja)) return []
    parejas.add(pareja)
    if (!persona.grupo_actual_id || !conyuge.grupo_actual_id || persona.grupo_actual_id === conyuge.grupo_actual_id) return []
    const segmentoPersona = contexto.nombreSegmento.get(persona.grupo_actual_segmento_id ?? '')
    const segmentoConyuge = contexto.nombreSegmento.get(conyuge.grupo_actual_segmento_id ?? '')
    if (!segmentoPersona || !segmentoConyuge || esMatrimonios(segmentoPersona) === esMatrimonios(segmentoConyuge)) return []
    const grupos = `${persona.grupo_actual_nombre ?? ''} (${segmentoPersona}) y ${conyuge.grupo_actual_nombre ?? ''} (${segmentoConyuge})`
    return [
      aviso(
        'conyuge_separado',
        [persona.grupo_actual_id, conyuge.grupo_actual_id],
        [persona.usuario_id, conyuge.usuario_id],
        `${nombrePareja(persona, conyuge)} están separados: ${grupos}`,
      ),
    ]
  })
}

/** Someone from the origin season who has no group in this one. */
const avisoSinUbicar = (persona: PersonaBanco): Aviso[] =>
  persona.origen_grupo_id && !persona.grupo_actual_id
    ? [aviso('sin_ubicar', [], [persona.usuario_id], `${nombrePersona(persona)} estaba en ${persona.origen_grupo_nombre ?? 'la temporada anterior'} y todavía no tiene grupo`)]
    : []

/** Someone placed in this season who is also in a group of another active season. */
function avisoOtraTemporada(persona: PersonaBanco): Aviso[] {
  if (!persona.grupo_actual_id || persona.otras_temporadas.length === 0) return []
  const porTemporada = new Map<string, string[]>()
  persona.otras_temporadas.forEach((o) => porTemporada.set(o.temporada_nombre, [...(porTemporada.get(o.temporada_nombre) ?? []), o.grupo_nombre]))
  const donde = enLista([...porTemporada].map(([temporada, grupos]) => `${enLista(grupos)} de ${temporada}`))
  return [aviso('otra_temporada', [persona.grupo_actual_id], [persona.usuario_id], `${nombrePersona(persona)} también está en ${donde}`)]
}

/** Every warning of the board: per group first, then the ones from the bank. */
export function calcularAvisos(datos: DatosAvisos): Aviso[] {
  const contexto = crearContexto(datos)
  return [
    ...datos.grupos.flatMap((grupo) => avisosDeGrupo(grupo, contexto)),
    ...avisosConyugeSeparado(contexto),
    ...datos.banco.flatMap(avisoSinUbicar),
    ...datos.banco.flatMap(avisoOtraTemporada),
  ]
}
