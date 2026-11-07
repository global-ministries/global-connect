/**
 * Planner board — the view model of /grupos-vida/planificar (T5a of
 * odd/tasks/planner-gdv.md; artboards 01, 03 and 08 of design/planner-gdv).
 * Pure functions over the loader output (lib/platform/grupos-vida/planner/
 * datos.ts) and the T4 rules: season state, the actor's warnings (S10),
 * lanes and localidad blocks, card badges, the people bank (S11) and the
 * alerts panel. No React, no Supabase.
 */
import {
  ETIQUETA_BLOQUEO,
  SIN_LOCALIDAD,
  contar,
  enLista,
  esMatrimonios,
  nombrePareja,
  mensajeConyugeQueSeQueda,
  personasAMover,
  nombreCompleto,
  nombrePersona,
  normalizar,
  personasDelGrupo,
  resumenBloqueos,
  type Aviso,
  type Bloqueo,
  type GrupoTablero,
  type PersonaBanco,
  type PersonaGrupo,
  type SegmentoConDirectores,
  type SegmentoPlanner,
  type SugerenciaLocalidad,
  type TemporadaPlanner,
  type TemporadasPlanner,
  type TipoAviso,
  type TipoBloqueo,
} from '@/lib/platform/grupos-vida/planner'
import { rolEnGrupo } from '@/lib/platform/grupos-vida/planner/borrador'
import type { RolPlanner } from '@/lib/platform/grupos-vida/planner/acciones'
import type { TonoEstado } from '@/components/ui/punto-estado'

/** "1.412": Spanish locales skip the separator below 10.000, the design does not. */
export function formatearCantidad(n: number): string {
  const [signo, digitos] = n < 0 ? ['-', String(-n)] : ['', String(n)]
  const grupos: string[] = []
  for (let fin = digitos.length; fin > 0; fin -= 3) grupos.unshift(digitos.slice(Math.max(0, fin - 3), fin))
  return signo + grupos.join('.')
}

export interface EstadoTemporada {
  readonly etiqueta: string
  readonly tono: TonoEstado
}

export function estadoTemporada(temporada: Pick<TemporadaPlanner, 'estado' | 'activa'>): EstadoTemporada {
  if (temporada.estado === 'planificacion') return { etiqueta: 'En planificación', tono: 'info' }
  if (temporada.activa) return { etiqueta: 'Activa', tono: 'success' }
  if (temporada.estado === 'finalizada') return { etiqueta: 'Finalizada', tono: 'muted' }
  const estado = temporada.estado?.trim()
  return { etiqueta: estado ? estado.charAt(0).toUpperCase() + estado.slice(1) : 'Sin estado', tono: 'muted' }
}

/** Everyone in the visible groups, each person once. */
export function contarPersonas(grupos: readonly GrupoTablero[]): number {
  return new Set(grupos.flatMap((g) => personasDelGrupo(g).map((p) => p.usuario_id))).size
}

/** The segments a director de etapa sees, by name (S10); empty for whoever sees every segment. */
export const segmentosDelAlcance = (capacidades: TemporadasPlanner): readonly SegmentoPlanner[] =>
  capacidades.ve_todos_los_segmentos ? [] : capacidades.segmentos

/**
 * The warnings the actor sees (S10): those that touch a visible group, and the
 * bank-only ones (an unplaced person of the origin season) of the actor's
 * segments. Whoever sees every segment keeps them all.
 */
export function avisosDelAlcance(
  avisos: readonly Aviso[],
  grupos: readonly GrupoTablero[],
  banco: readonly PersonaBanco[],
  capacidades: TemporadasPlanner,
): Aviso[] {
  if (capacidades.ve_todos_los_segmentos) return [...avisos]
  const visibles = new Set(grupos.map((g) => g.grupo_id))
  const segmentos = new Set(capacidades.segmentos_editables)
  const segmentoDe = new Map(banco.map((p) => [p.usuario_id, p.segmento_sugerido_id]))
  return avisos.filter((a) =>
    a.grupoIds.length > 0
      ? a.grupoIds.some((id) => visibles.has(id))
      : a.personaIds.some((id) => segmentos.has(segmentoDe.get(id) ?? '')),
  )
}

// ─── Board ───

export type Agrupar = 'localidad' | 'director'

export interface BloqueCarril {
  readonly id: string
  readonly titulo: string
  /** "Sin localidad" blocks publishing (S6); "Sin director de etapa" too. */
  readonly falta: boolean
  readonly grupos: readonly GrupoTablero[]
}

export interface Carril {
  readonly segmento: SegmentoPlanner
  readonly grupos: number
  readonly personas: number
  readonly bloques: readonly BloqueCarril[]
}

const porNombre = (a: { nombre: string }, b: { nombre: string }): number => a.nombre.localeCompare(b.nombre, 'es')

function coincide(grupo: GrupoTablero, consulta: string): boolean {
  if (!consulta) return true
  const textos = [grupo.nombre, nombreCompleto(grupo), ...personasDelGrupo(grupo).map(nombrePersona)]
  return textos.some((t) => normalizar(t).includes(consulta))
}

function claveBloque(grupo: GrupoTablero, agrupar: Agrupar): { id: string; titulo: string; falta: boolean } {
  if (agrupar === 'director') {
    if (grupo.directores.length === 0) return { id: 'sin-director', titulo: 'Sin director de etapa', falta: true }
    const nombres = enLista(grupo.directores.map(nombrePersona))
    return { id: `dir:${grupo.directores.map((d) => d.usuario_id).sort().join('|')}`, titulo: nombres, falta: false }
  }
  if (!grupo.localidad_id) return { id: 'sin-localidad', titulo: SIN_LOCALIDAD, falta: true }
  return { id: `loc:${grupo.localidad_id}`, titulo: grupo.localidad_nombre ?? 'Localidad', falta: false }
}

function bloques(grupos: readonly GrupoTablero[], agrupar: Agrupar): BloqueCarril[] {
  const mapa = new Map<string, { id: string; titulo: string; falta: boolean; grupos: GrupoTablero[] }>()
  grupos.forEach((grupo) => {
    const clave = claveBloque(grupo, agrupar)
    const bloque = mapa.get(clave.id) ?? { ...clave, grupos: [] }
    bloque.grupos.push(grupo)
    mapa.set(clave.id, bloque)
  })
  // What blocks publishing first (attention first), then by name.
  return [...mapa.values()]
    .map((b) => ({ ...b, grupos: [...b.grupos].sort(porNombre) }))
    .sort((a, b) => Number(b.falta) - Number(a.falta) || a.titulo.localeCompare(b.titulo, 'es'))
}

/**
 * One lane per segment the actor sees (planner_temporadas.segmentos: every
 * segment for whoever sees them all, their own for a director de etapa), even
 * an empty one, so its first group can be created. The search keeps the
 * groups whose name, label or people match, and drops lanes left empty.
 */
export function carriles(
  grupos: readonly GrupoTablero[],
  capacidades: TemporadasPlanner,
  agrupar: Agrupar,
  busqueda: string,
): Carril[] {
  const consulta = normalizar(busqueda)
  const segmentos = new Map<string, SegmentoPlanner>()
  capacidades.segmentos.forEach((s) => segmentos.set(s.id, { id: s.id, nombre: s.nombre }))
  grupos.forEach((g) => {
    if (!segmentos.has(g.segmento_id)) segmentos.set(g.segmento_id, { id: g.segmento_id, nombre: g.segmento_nombre })
  })
  return [...segmentos.values()].sort(porNombre).flatMap((segmento) => {
    const delSegmento = grupos.filter((g) => g.segmento_id === segmento.id)
    const visibles = delSegmento.filter((g) => coincide(g, consulta))
    if (consulta && visibles.length === 0) return []
    return [{ segmento, grupos: delSegmento.length, personas: contarPersonas(delSegmento), bloques: bloques(visibles, agrupar) }]
  })
}

// ─── Cards ───

export interface Insignia {
  readonly etiqueta: string
  readonly tono: 'danger' | 'warning' | 'success'
}

const ETIQUETA_AVISO_GRUPO: Readonly<Record<TipoAviso, (n: number, grupo: GrupoTablero) => string>> = {
  repite_lider: () => 'Repite líder',
  otra_ciudad: (n) => `${n} en otra ciudad`,
  sin_direccion: (n) => `${n} sin dirección`,
  grupo_pequeno: (_, grupo) => `Pequeño · ${personasDelGrupo(grupo).length}`,
  sobre_cupo: () => 'Sobre el cupo',
  sin_aprendices: () => 'Sin aprendices',
  conyuge_separado: (n) => (n === 1 ? '1 cónyuge separado' : `${n} cónyuges separados`),
  sin_ubicar: (n) => `${n} sin ubicar`,
  otra_temporada: (n) => `${n} en otra temporada`,
}

/**
 * Blockers (red) then warnings (amber) of one group, one badge per kind, and
 * with the bank rows "N sin su pareja" in Matrimonios (S23); "Listo" when
 * there is nothing.
 */
export function insigniasGrupo(
  grupo: GrupoTablero,
  bloqueos: readonly Bloqueo[],
  avisos: readonly Aviso[],
  fichas?: ReadonlyMap<string, PersonaBanco>,
): Insignia[] {
  const tiposBloqueo = new Set(bloqueos.filter((b) => b.grupo_id === grupo.grupo_id).map((b) => b.tipo))
  const rojas = [...tiposBloqueo].map((tipo): Insignia => ({ etiqueta: ETIQUETA_BLOQUEO[tipo], tono: 'danger' }))
  const porTipo = new Map<TipoAviso, number>()
  avisos.filter((a) => a.grupoIds.includes(grupo.grupo_id)).forEach((a) => porTipo.set(a.tipo, (porTipo.get(a.tipo) ?? 0) + 1))
  const amarillas = [...porTipo].map(([tipo, n]): Insignia => ({ etiqueta: ETIQUETA_AVISO_GRUPO[tipo](n, grupo), tono: 'warning' }))
  const solos = fichas ? sinPareja(grupo, fichas) : 0
  const pareja: Insignia[] = solos > 0 ? [{ etiqueta: `${solos} sin su pareja`, tono: 'warning' }] : []
  const todas = [...rojas, ...amarillas, ...pareja]
  return todas.length > 0 ? todas : [{ etiqueta: 'Listo', tono: 'success' }]
}

const ETIQUETA_AVISO_PERSONA: Partial<Record<TipoAviso, string>> = {
  repite_lider: 'Repite líder',
  otra_ciudad: 'Vive en otra ciudad',
  sin_direccion: 'Sin dirección',
  conyuge_separado: 'Cónyuge en otro segmento',
  otra_temporada: 'También en otra temporada',
}

/** The warning chips of one person inside one group (the expanded card). */
export function insigniasPersona(
  personaId: string,
  grupoId: string,
  bloqueos: readonly Bloqueo[],
  avisos: readonly Aviso[],
): Insignia[] {
  const enDos = bloqueos.some((b) => b.tipo === 'persona_en_dos_grupos' && b.usuario_id === personaId && b.grupo_id === grupoId)
  const tipos = new Set(
    avisos.filter((a) => a.personaIds.includes(personaId) && a.grupoIds.includes(grupoId)).map((a) => a.tipo),
  )
  return [
    ...(enDos ? [{ etiqueta: 'En dos grupos', tono: 'danger' as const }] : []),
    ...[...tipos].flatMap((tipo) => {
      const etiqueta = ETIQUETA_AVISO_PERSONA[tipo]
      return etiqueta ? [{ etiqueta, tono: 'warning' as const }] : []
    }),
  ]
}

export interface RolGrupo {
  readonly id: 'lideres' | 'aprendices' | 'miembros'
  readonly titulo: string
  readonly personas: readonly PersonaGrupo[]
}

/** The roles of an expanded card, in order (Líder, Aprendiz, Miembro). */
export const rolesGrupo = (grupo: GrupoTablero): RolGrupo[] => [
  { id: 'lideres', titulo: grupo.lideres.length === 1 ? 'Líder' : 'Líderes', personas: grupo.lideres },
  { id: 'aprendices', titulo: grupo.aprendices.length === 1 ? 'Aprendiz' : 'Aprendices', personas: grupo.aprendices },
  { id: 'miembros', titulo: grupo.miembros.length === 1 ? 'Miembro' : 'Miembros', personas: grupo.miembros },
]

// ─── Couples in a group (S23) ───

/** One member row of a role: a person, or the two spouses when both have that role. */
export interface FilaRol {
  readonly clave: string
  readonly personas: readonly PersonaGrupo[]
}

/** The rows of one role: spouses of the same role (bank conyuge_id) are one row, in the first one's place. */
export const filasDelRol = (personas: readonly PersonaGrupo[], fichas: ReadonlyMap<string, Pick<PersonaBanco, 'conyuge_id'>>): FilaRol[] =>
  emparejar(personas, (p) => fichas.get(p.usuario_id)?.conyuge_id)

/** "Juan Castejón y Érica de Castejón": both full names, never shortened. */
export const nombresFila = (personas: readonly Pick<PersonaGrupo, 'nombre' | 'apellido'>[]): string => enLista(personas.map(nombrePersona))

const OPUESTO: Readonly<Record<string, string>> = { Masculino: 'Femenino', Femenino: 'Masculino' }

/** 'esposo' / 'esposa' by the spouse's gender (or the opposite of the person's), else 'cónyuge'. */
function palabraConyuge(conyuge: string | null | undefined, persona: string | null | undefined): string {
  const genero = conyuge ?? (persona ? OPUESTO[persona] : undefined)
  return genero === 'Masculino' ? 'esposo' : genero === 'Femenino' ? 'esposa' : 'cónyuge'
}

const mayuscula = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1)

export interface NotaPareja {
  readonly texto: string
  /** The spouse is not in the group (only in Matrimonios): counted as "sin su pareja". */
  readonly falta: boolean
}

/**
 * Where a member's spouse is (S23), or null when there is nothing to say: the
 * couple shares a role (one row), or the person has no bank row. A spouse in
 * another role of the same group is a hint, "Esposa: Carla Rivas (Miembro)".
 * Only in a Matrimonios group (S2) the missing spouse is marked: "Su esposa
 * está en Grupo Rosas", "Su esposo está en el banco", "Sin cónyuge registrado".
 */
export function notaPareja(personaId: string, grupo: GrupoTablero, fichas: ReadonlyMap<string, PersonaBanco>): NotaPareja | null {
  const ficha = fichas.get(personaId)
  if (!ficha) return null
  const conyugeId = ficha.conyuge_id && ficha.conyuge_id !== personaId ? ficha.conyuge_id : null
  const matrimonios = esMatrimonios(grupo.segmento_nombre)
  if (!conyugeId) return matrimonios ? { texto: 'Sin cónyuge registrado', falta: true } : null
  const conyuge = fichas.get(conyugeId)
  const palabra = palabraConyuge(conyuge?.genero, ficha.genero)
  const rolConyuge = rolEnGrupo(grupo, conyugeId)
  if (rolConyuge) {
    if (rolConyuge === rolEnGrupo(grupo, personaId)) return null
    const enGrupo = personasDelGrupo(grupo).find((p) => p.usuario_id === conyugeId)
    const nombre = enGrupo ?? conyuge
    return { texto: `${mayuscula(palabra)}: ${nombre ? nombrePersona(nombre) : 'en el grupo'} (${ETIQUETA_ROL[rolConyuge]})`, falta: false }
  }
  if (!matrimonios) return null
  const donde = !conyuge
    ? 'no está en este grupo'
    : conyuge.grupo_actual_id
      ? `está en ${conyuge.grupo_actual_nombre?.trim() || 'otro grupo'}`
      : 'está en el banco'
  return { texto: `Su ${palabra} ${donde}`, falta: true }
}

/** The people of a Matrimonios group whose spouse is not there (S23); 0 elsewhere. */
export const sinPareja = (grupo: GrupoTablero, fichas: ReadonlyMap<string, PersonaBanco>): number =>
  esMatrimonios(grupo.segmento_nombre) ? personasDelGrupo(grupo).filter((p) => notaPareja(p.usuario_id, grupo, fichas)?.falta).length : 0

/** "José y Mariela Torrealba", "Carmen Rivero", or null without Líder. */
export function textoLideres(grupo: GrupoTablero): string | null {
  if (grupo.lideres.length === 0) return null
  const [una, otra] = grupo.lideres
  if (grupo.lideres.length === 2 && otra && normalizar(una.apellido) === normalizar(otra.apellido)) {
    return `${una.nombre.trim()} y ${nombrePersona(otra)}`
  }
  return enLista(grupo.lideres.map(nombrePersona))
}

// ─── People bank (S11) ───

export type FiltroEdad = '' | '18-35' | '36-50' | '51+'
/** '' all, 'sin-direccion', or a municipio id. */
export type FiltroCiudad = string

export interface FiltrosBanco {
  readonly busqueda: string
  readonly sinUbicar: boolean
  readonly matrimonios: boolean
  readonly sinSegmento: boolean
  readonly edad: FiltroEdad
  readonly ciudad: FiltroCiudad
}

export const FILTROS_BANCO_INICIALES: FiltrosBanco = {
  busqueda: '',
  sinUbicar: true,
  matrimonios: false,
  sinSegmento: false,
  edad: '',
  ciudad: '',
}

export const SIN_DIRECCION = 'sin-direccion'

export type SeccionBancoId = 'origen' | 'nuevos' | 'sin-grupo' | 'ubicados'

/** One row: a person, or a couple (both in the same section) as one row. */
export interface FilaBanco {
  readonly clave: string
  readonly personas: readonly PersonaBanco[]
}

export interface SeccionBanco {
  readonly id: SeccionBancoId
  readonly titulo: string
  /** People (not rows) in the section. */
  readonly cantidad: number
  readonly filas: readonly FilaBanco[]
}

export interface ModeloBanco {
  /** "61 sin ubicar" */
  readonly sinUbicar: string
  /** "24 de 2025 - II y 37 nuevos" */
  readonly desglose: string
  readonly total: number
  readonly conteos: { readonly sinUbicar: number; readonly matrimonios: number; readonly sinSegmento: number }
  readonly ciudades: readonly { readonly valor: string; readonly etiqueta: string }[]
  readonly secciones: readonly SeccionBanco[]
  /** Rows after the filters. */
  readonly filas: number
}

const seccionDe = (p: PersonaBanco): SeccionBancoId => {
  if (p.grupo_actual_id) return 'ubicados'
  if (p.origen_grupo_id) return 'origen'
  return p.segmento_sugerido_id ? 'sin-grupo' : 'nuevos'
}

const enRangoEdad = (edad: number | null, rango: FiltroEdad): boolean => {
  if (!rango) return true
  if (edad === null) return false
  if (rango === '18-35') return edad >= 18 && edad <= 35
  if (rango === '36-50') return edad >= 36 && edad <= 50
  return edad >= 51
}

const enCiudad = (p: PersonaBanco, ciudad: FiltroCiudad): boolean =>
  !ciudad || (ciudad === SIN_DIRECCION ? !p.municipio_id : p.municipio_id === ciudad)

function coincideBanco(p: PersonaBanco, consulta: string): boolean {
  if (!consulta) return true
  return [nombrePersona(p), p.municipio_nombre ?? '', p.origen_grupo_nombre ?? '', p.grupo_actual_nombre ?? ''].some((t) =>
    normalizar(t).includes(consulta),
  )
}

/** Pairs each one with their spouse (`conyugeDe`) when both are in the list; the couple takes the first one's place. */
function emparejar<T extends { readonly usuario_id: string }>(
  personas: readonly T[],
  conyugeDe: (persona: T) => string | null | undefined,
): { clave: string; personas: T[] }[] {
  const presentes = new Map(personas.map((p) => [p.usuario_id, p]))
  const usados = new Set<string>()
  return personas.flatMap((p) => {
    if (usados.has(p.usuario_id)) return []
    usados.add(p.usuario_id)
    const conyugeId = conyugeDe(p)
    const conyuge = conyugeId && conyugeId !== p.usuario_id ? presentes.get(conyugeId) : undefined
    if (conyuge && !usados.has(conyuge.usuario_id)) {
      usados.add(conyuge.usuario_id)
      return [{ clave: `${p.usuario_id}|${conyuge.usuario_id}`, personas: [p, conyuge] }]
    }
    return [{ clave: p.usuario_id, personas: [p] }]
  })
}

/** Pairs each person with their spouse when both are in the list; the couple takes the first one's place. */
export const agruparParejas = (personas: readonly PersonaBanco[]): FilaBanco[] => emparejar(personas, (p) => p.conyuge_id)

/**
 * The bank: everyone of the church, never limited by segment (S11). "Sin
 * ubicar" (the default) is the people of the origin season without a group in
 * this one plus the new people (no group, no segment ever); couples are one
 * row; sections "De <origen>, sin ubicar", "Nuevos, sin segmento", then the
 * rest when "Sin ubicar" is off.
 */
export function modeloBanco(
  banco: readonly PersonaBanco[],
  filtros: FiltrosBanco,
  temporada: Pick<TemporadaPlanner, 'nombre' | 'origen_nombre'>,
): ModeloBanco {
  const origen = temporada.origen_nombre
  const deOrigen = banco.filter((p) => seccionDe(p) === 'origen').length
  const nuevos = banco.filter((p) => seccionDe(p) === 'nuevos').length
  const sinUbicar = deOrigen + nuevos

  const consulta = normalizar(filtros.busqueda)
  const base = banco.filter((p) => !filtros.sinUbicar || seccionDe(p) === 'origen' || seccionDe(p) === 'nuevos')
  const filtradas = base.filter(
    (p) => (!filtros.sinSegmento || !p.segmento_sugerido_id) && enRangoEdad(p.edad, filtros.edad) && enCiudad(p, filtros.ciudad) && coincideBanco(p, consulta),
  )

  const titulos: Record<SeccionBancoId, string> = {
    origen: origen ? `De ${origen}, sin ubicar` : 'De la temporada anterior, sin ubicar',
    nuevos: 'Nuevos, sin segmento',
    'sin-grupo': `Sin grupo en ${temporada.nombre}`,
    ubicados: `En un grupo de ${temporada.nombre}`,
  }
  const orden: SeccionBancoId[] = ['origen', 'nuevos', 'sin-grupo', 'ubicados']
  const secciones = orden.flatMap((id): SeccionBanco[] => {
    const filas = agruparParejas(filtradas.filter((p) => seccionDe(p) === id)).filter((f) => !filtros.matrimonios || f.personas.length === 2)
    const cantidad = filas.reduce((n, f) => n + f.personas.length, 0)
    return filas.length > 0 ? [{ id, titulo: titulos[id], cantidad, filas }] : []
  })

  const municipios = new Map<string, string>()
  banco.forEach((p) => p.municipio_id && p.municipio_nombre && municipios.set(p.municipio_id, p.municipio_nombre))
  const ciudades = [
    ...[...municipios].sort((a, b) => a[1].localeCompare(b[1], 'es')).map(([valor, etiqueta]) => ({ valor, etiqueta })),
    { valor: SIN_DIRECCION, etiqueta: 'Sin dirección' },
  ]

  const matrimonios = orden.reduce(
    (n, id) => n + agruparParejas(base.filter((p) => seccionDe(p) === id)).filter((f) => f.personas.length === 2).length,
    0,
  )

  return {
    sinUbicar: `${sinUbicar} sin ubicar`,
    desglose: origen ? `${deOrigen} de ${origen} y ${contar(nuevos, 'nuevo', 'nuevos')}` : contar(nuevos, 'nuevo', 'nuevos'),
    total: banco.length,
    conteos: { sinUbicar, matrimonios, sinSegmento: base.filter((p) => !p.segmento_sugerido_id).length },
    ciudades,
    secciones,
    filas: secciones.reduce((n, s) => n + s.filas.length, 0),
  }
}

/** The sections cut at `limite` rows in total (the bank shows 100 rows at a time); empty sections are dropped. */
export function cortarSecciones(secciones: readonly SeccionBanco[], limite: number): SeccionBanco[] {
  return secciones.reduce<{ restantes: number; secciones: SeccionBanco[] }>(
    (acc, seccion) => {
      if (acc.restantes <= 0) return acc
      const filas = seccion.filas.slice(0, acc.restantes)
      return { restantes: acc.restantes - filas.length, secciones: [...acc.secciones, { ...seccion, filas }] }
    },
    { restantes: limite, secciones: [] },
  ).secciones
}

export interface MarcaPersona {
  readonly etiqueta: string
  readonly tono: 'neutro' | 'info' | 'warning'
}

/** "Vive en Cabudare" / "Sin dirección" and "Activo en 2026-I", once per row. */
export function marcasFila(fila: FilaBanco): MarcaPersona[] {
  const marcas: MarcaPersona[] = []
  const agregar = (m: MarcaPersona) => !marcas.some((x) => x.etiqueta === m.etiqueta) && marcas.push(m)
  fila.personas.forEach((p) => agregar(p.municipio_nombre ? { etiqueta: `Vive en ${p.municipio_nombre}`, tono: 'neutro' } : { etiqueta: 'Sin dirección', tono: 'warning' }))
  fila.personas.forEach((p) => p.otras_temporadas.forEach((o) => agregar({ etiqueta: `Activo en ${o.temporada_nombre}`, tono: 'info' })))
  return marcas
}

/** The second line of a bank row: segment and where they were or are. */
export function detalleFila(fila: FilaBanco, temporada: Pick<TemporadaPlanner, 'origen_nombre'>): { segmento: string | null; donde: string | null } {
  const [p] = fila.personas
  const donde = p.grupo_actual_nombre
    ? `En ${p.grupo_actual_nombre}`
    : p.origen_grupo_nombre
      ? `${temporada.origen_nombre ?? 'Antes'}: ${p.origen_grupo_nombre}`
      : temporada.origen_nombre
        ? `Sin grupo en ${temporada.origen_nombre}`
        : null
  return { segmento: p.segmento_sugerido_nombre, donde }
}

export const nombreFila = (fila: FilaBanco): string => enLista(fila.personas.map(nombrePersona))

// ─── Alerts panel (03) ───

export interface ItemAlerta {
  readonly clave: string
  readonly titulo: string
  readonly detalle: string
  readonly grupoId: string | null
  /** The people it concerns; a bank-only item (grupoId null) offers "Ubicar" for them. */
  readonly personaIds: readonly string[]
  /** Their names, for "Ubicar a …"; null without people. */
  readonly personas: string | null
  /**
   * Only for "sin localidad": the suggestion (null when the people do not
   * point to one); undefined when there is nothing to suggest.
   */
  readonly sugerencia?: SugerenciaLocalidad | null
}

export interface SeccionAlerta {
  readonly id: string
  readonly titulo: string
  readonly cantidad: number
  readonly vacio: string | null
  readonly items: readonly ItemAlerta[]
}

const TITULO_BLOQUEO: Readonly<Record<TipoBloqueo, (n: number, temporada: string) => string>> = {
  sin_localidad: (n) => `${contar(n, 'grupo', 'grupos')} sin localidad`,
  sin_lider: (n) => `${contar(n, 'grupo', 'grupos')} sin Líder`,
  sin_director: (n) => `${contar(n, 'grupo', 'grupos')} sin director de etapa`,
  persona_en_dos_grupos: (n, temporada) => `${contar(n, 'persona', 'personas')} en dos grupos de ${temporada}`,
}

const VACIO_BLOQUEO: Readonly<Record<TipoBloqueo, string>> = {
  sin_localidad: 'Todo en orden. Todos los grupos tienen localidad.',
  sin_lider: 'Todo en orden. Todos los grupos tienen Líder.',
  sin_director: 'Todo en orden. Todos los grupos tienen director de etapa.',
  persona_en_dos_grupos: 'Todo en orden. Nadie está en dos grupos.',
}

const textoSugerencia = (sugerencia: SugerenciaLocalidad | null | undefined): string | null => {
  if (sugerencia === undefined) return null
  return sugerencia ? `Sugerida: ${sugerencia.nombre} · ${sugerencia.motivo}` : 'Sin sugerencia: elige la localidad a mano'
}

/**
 * The four blockers, always (a 0 says "Todo en orden"), with one item per
 * group or person and group. `sugerencias` (sugerirLocalidad per group
 * without localidad) gives each "sin localidad" item its suggestion.
 */
export function seccionesBloqueos(
  bloqueos: readonly Bloqueo[],
  grupos: readonly GrupoTablero[],
  temporada: string,
  sugerencias?: ReadonlyMap<string, SugerenciaLocalidad | null>,
): SeccionAlerta[] {
  const segmentoDe = new Map(grupos.map((g) => [g.grupo_id, g.segmento_nombre]))
  const conteo = {
    total: bloqueos.length,
    sin_lider: 0,
    sin_director: 0,
    sin_localidad: 0,
    persona_en_dos_grupos: 0,
  }
  bloqueos.forEach((b) => (conteo[b.tipo] += 1))
  return resumenBloqueos(conteo).map(({ tipo }) => {
    const filas = bloqueos.filter((b) => b.tipo === tipo)
    const cantidad = tipo === 'persona_en_dos_grupos' ? new Set(filas.map((b) => b.usuario_id)).size : filas.length
    return {
      id: tipo,
      titulo: TITULO_BLOQUEO[tipo](cantidad, temporada),
      cantidad,
      vacio: cantidad === 0 ? VACIO_BLOQUEO[tipo] : null,
      items: filas.map((b, i): ItemAlerta => {
        const sugerencia = tipo === 'sin_localidad' && sugerencias?.has(b.grupo_id) ? sugerencias.get(b.grupo_id) : undefined
        return {
          clave: `${b.tipo}:${b.grupo_id}:${b.usuario_id ?? i}`,
          titulo: b.grupo_nombre || 'Grupo sin nombre',
          detalle: [segmentoDe.get(b.grupo_id), b.detalle, textoSugerencia(sugerencia)].filter(Boolean).join(' · '),
          grupoId: b.grupo_id,
          personaIds: b.usuario_id ? [b.usuario_id] : [],
          personas: null,
          ...(sugerencia === undefined ? {} : { sugerencia }),
        }
      }),
    }
  })
}

const TITULO_AVISO: Readonly<Record<TipoAviso, (n: number, origen: string | null) => string>> = {
  sin_ubicar: (n, origen) => `${contar(n, 'persona', 'personas')} de ${origen ?? 'la temporada anterior'} sin ubicar`,
  otra_temporada: (n) => `${n} ${n === 1 ? 'activo' : 'activos'} en otra temporada`,
  otra_ciudad: (n) => `${n} ${n === 1 ? 'vive' : 'viven'} en otra ciudad que su grupo`,
  sin_direccion: (n) => `${n} sin dirección`,
  grupo_pequeno: (n) => `${contar(n, 'grupo pequeño', 'grupos pequeños')} (menos de 6)`,
  sobre_cupo: (n) => `${contar(n, 'grupo', 'grupos')} sobre el cupo`,
  repite_lider: (n) => `${n} ${n === 1 ? 'repite' : 'repiten'} con el mismo líder`,
  sin_aprendices: (n) => `${contar(n, 'grupo', 'grupos')} sin aprendices`,
  conyuge_separado: (n) => `${n} ${n === 1 ? 'pareja separada' : 'parejas separadas'} (uno en Matrimonios)`,
}

/** Display order of the warnings (03). */
const ORDEN_AVISOS: readonly TipoAviso[] = [
  'sin_ubicar',
  'otra_temporada',
  'otra_ciudad',
  'sin_direccion',
  'grupo_pequeno',
  'sobre_cupo',
  'repite_lider',
  'sin_aprendices',
  'conyuge_separado',
]

/** The warnings grouped by kind; kinds without warnings are left out. `fichas` names the people ("Ubicar a …"). */
export function seccionesAvisos(
  avisos: readonly Aviso[],
  grupos: readonly GrupoTablero[],
  origen: string | null,
  fichas?: ReadonlyMap<string, Pick<PersonaBanco, 'nombre' | 'apellido'>>,
): SeccionAlerta[] {
  const nombreGrupo = new Map(grupos.map((g) => [g.grupo_id, g.nombre]))
  const personas = (ids: readonly string[]): string | null => {
    const nombres = ids.flatMap((id) => {
      const ficha = fichas?.get(id)
      return ficha ? [nombrePersona(ficha)] : []
    })
    return nombres.length > 0 ? enLista(nombres) : null
  }
  return ORDEN_AVISOS.flatMap((tipo) => {
    const delTipo = avisos.filter((a) => a.tipo === tipo)
    if (delTipo.length === 0) return []
    return [
      {
        id: tipo,
        titulo: TITULO_AVISO[tipo](delTipo.length, origen),
        cantidad: delTipo.length,
        vacio: null,
        items: delTipo.map((a, i) => {
          const grupoId = a.grupoIds.find((id) => nombreGrupo.has(id)) ?? null
          return {
            clave: `${tipo}:${i}`,
            titulo: a.mensaje,
            detalle: grupoId ? (nombreGrupo.get(grupoId) ?? '') : 'En el banco',
            grupoId,
            personaIds: a.personaIds,
            personas: personas(a.personaIds),
          }
        }),
      },
    ]
  })
}


// ─── Steps (T5b, S24) ───

export type RolDestino = RolPlanner

export const ETIQUETA_ROL: Readonly<Record<RolDestino, string>> = { lider: 'Líder', aprendiz: 'Aprendiz', miembro: 'Miembro' }

// The board with the draft applied lives in lib (borrador.ts); the components read it from here.
export { aplicarMovimiento, cambiaAlgo, rolEnGrupo, type EstadoTablero, type Movimiento } from '@/lib/platform/grupos-vida/planner/borrador'

/**
 * S22: only a group that has not started can be deleted. The board knows
 * activo and estado_ciclo; whether it already has meetings (eventos_grupo)
 * only the server knows, and it refuses then.
 */
export const puedeEliminarGrupo = (grupo: Pick<GrupoTablero, 'activo' | 'estado_ciclo'>): boolean =>
  !grupo.activo && grupo.estado_ciclo !== 'activo'

/** One option of the directores de etapa: a person, or a couple when both spouses are eligible. */
export interface DirectorElegible {
  readonly clave: string
  readonly usuarioIds: readonly string[]
  readonly nombre: string
}

/**
 * The directores de etapa offered for a new group of a segment: every eligible
 * one of the segment (planner_temporadas, the same rule the server checks),
 * a couple of the bank as one option ("Luisa y Orlando Pérez"), by name.
 */
export function directoresElegibles(
  segmento: Pick<SegmentoConDirectores, 'directores'> | undefined,
  fichas: ReadonlyMap<string, Pick<PersonaBanco, 'conyuge_id'>>,
): DirectorElegible[] {
  const directores = segmento?.directores ?? []
  const presentes = new Map(directores.map((d) => [d.usuario_id, d]))
  const usados = new Set<string>()
  return directores
    .flatMap((d): DirectorElegible[] => {
      if (usados.has(d.usuario_id)) return []
      usados.add(d.usuario_id)
      const conyugeId = fichas.get(d.usuario_id)?.conyuge_id
      const conyuge = conyugeId && conyugeId !== d.usuario_id ? presentes.get(conyugeId) : undefined
      if (conyuge && !usados.has(conyuge.usuario_id)) {
        usados.add(conyuge.usuario_id)
        return [{ clave: `${d.usuario_id}|${conyuge.usuario_id}`, usuarioIds: [d.usuario_id, conyuge.usuario_id], nombre: nombrePareja(d, conyuge) }]
      }
      return [{ clave: d.usuario_id, usuarioIds: [d.usuario_id], nombre: nombrePersona(d) }]
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

// ─── Group panel (T6, artboard 02) ───

export interface LugarIntegrantes {
  readonly clave: string
  /** The municipio, "Palavecino". */
  readonly etiqueta: string
  readonly cantidad: number
  /** Some Líder lives there. */
  readonly conLideres: boolean
}

/**
 * Where the people of a group live (S3, S5): one row per municipio, most
 * people first, then "Sin dirección". Someone without a bank row is left out.
 */
export function dondeViven(grupo: GrupoTablero, fichas: ReadonlyMap<string, Pick<PersonaBanco, 'municipio_id' | 'municipio_nombre'>>): LugarIntegrantes[] {
  const lideres = new Set(grupo.lideres.map((l) => l.usuario_id))
  const lugares = new Map<string, { etiqueta: string; cantidad: number; conLideres: boolean }>()
  let sinDireccion = 0
  personasDelGrupo(grupo).forEach((p) => {
    const ficha = fichas.get(p.usuario_id)
    if (!ficha) return
    if (!ficha.municipio_id) {
      sinDireccion += 1
      return
    }
    const lugar = lugares.get(ficha.municipio_id) ?? { etiqueta: ficha.municipio_nombre ?? 'Otro municipio', cantidad: 0, conLideres: false }
    lugares.set(ficha.municipio_id, { ...lugar, cantidad: lugar.cantidad + 1, conLideres: lugar.conLideres || lideres.has(p.usuario_id) })
  })
  const filas = [...lugares]
    .map(([clave, l]): LugarIntegrantes => ({ clave, ...l }))
    .sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta, 'es'))
  return sinDireccion > 0 ? [...filas, { clave: SIN_DIRECCION, etiqueta: 'Sin dirección', cantidad: sinDireccion, conLideres: false }] : filas
}

/** 'HH:MM' of an RPC time ('19:30:00'), '' without one. */
export function horaCorta(hora: string | null): string {
  const partes = /^(\d{1,2}):(\d{2})/.exec(hora ?? '')
  return partes ? `${partes[1].padStart(2, '0')}:${partes[2]}` : ''
}

export const NOTA_MATRIMONIOS = 'Van los dos: es un grupo de Matrimonios'

export type PlanMovimiento =
  | {
      readonly tipo: 'mover'
      readonly usuarioIds: readonly string[]
      /** mensajeConyugeQueSeQueda: who does not come along (S2). */
      readonly aviso: string | null
      /** The couple goes together into Matrimonios. */
      readonly nota: string | null
    }
  /** A couple row into a non-Matrimonios group: someone must choose who goes. */
  | { readonly tipo: 'elegir' }

/**
 * S2 for a move: `ids` is one person, or the two of a couple row of the bank;
 * `quien` the one chosen when a couple goes to a non-Matrimonios group. Into
 * Matrimonios the couple goes together (personasAMover); elsewhere only the
 * person, with the note of where the spouse stays.
 */
export function planearMovimiento(
  ids: readonly string[],
  destino: Pick<GrupoTablero, 'grupo_id' | 'segmento_nombre'> | null,
  fichas: ReadonlyMap<string, PersonaBanco>,
  quien: string | null,
): PlanMovimiento {
  if (!destino) return { tipo: 'mover', usuarioIds: quien ? [quien] : [...ids], aviso: null, nota: null }
  const matrimonios = esMatrimonios(destino.segmento_nombre)
  if (ids.length > 1 && matrimonios) return { tipo: 'mover', usuarioIds: [...ids], aviso: null, nota: NOTA_MATRIMONIOS }
  if (ids.length > 1 && !quien) return { tipo: 'elegir' }
  const persona = quien ?? ids[0]
  const conyugeId = fichas.get(persona)?.conyuge_id ?? null
  const usuarioIds = personasAMover(persona, conyugeId, destino.segmento_nombre)
  if (usuarioIds.length > 1) return { tipo: 'mover', usuarioIds, aviso: null, nota: NOTA_MATRIMONIOS }
  const conyuge = conyugeId ? (fichas.get(conyugeId) ?? null) : null
  const aviso = mensajeConyugeQueSeQueda({ conyuge, segmentoDestinoNombre: destino.segmento_nombre, grupoDestinoId: destino.grupo_id })
  return { tipo: 'mover', usuarioIds, aviso, nota: null }
}
