/**
 * Planner — localidad and name suggestions and the computed labels (S3, S4
 * of odd/tasks/planner-gdv.md). Segment and localidad are never stored inside
 * the free name; the label and the full name are computed every time.
 */
import { esMatrimonios, personasDelGrupo } from './grupo'
import { normalizar } from './textos'
import type { GrupoTablero, Localidad, PersonaBanco, PersonaGrupo } from './tipos'

export const SIN_LOCALIDAD = 'Sin localidad'

export interface SugerenciaLocalidad {
  readonly localidadId: string
  readonly nombre: string
  /** "los líderes y 9 de 14 viven en Palavecino", "8 de 11 viven en Palavecino". */
  readonly motivo: string
}

const viven = (cantidad: number): string => (cantidad === 1 ? 'vive' : 'viven')

/** The localidad of each municipio; with two in one municipio, the first by name. */
function localidadPorMunicipio(localidades: readonly Localidad[]): Map<string, Localidad> {
  const ordenadas = [...localidades].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const mapa = new Map<string, Localidad>()
  ordenadas.forEach((l) => {
    if (l.municipio_id && !mapa.has(l.municipio_id)) mapa.set(l.municipio_id, l)
  })
  return mapa
}

/** The one municipio with most people; null on a tie or without anyone. */
function municipioMayoritario(municipios: readonly string[]): { municipio: string; cantidad: number } | null {
  const cuentas = new Map<string, number>()
  municipios.forEach((m) => cuentas.set(m, (cuentas.get(m) ?? 0) + 1))
  const [primero, segundo] = [...cuentas].sort((a, b) => b[1] - a[1])
  if (!primero || (segundo && segundo[1] === primero[1])) return null
  return { municipio: primero[0], cantidad: primero[1] }
}

function motivoPorLideres(lideresDeAcuerdo: number, otros: number, coinciden: number, municipio: string): string {
  const sujeto = lideresDeAcuerdo === 1 ? 'el líder' : 'los líderes'
  if (otros === 0 || coinciden === 0) return `${sujeto} ${viven(lideresDeAcuerdo)} en ${municipio}`
  return `${sujeto} y ${coinciden} de ${otros} viven en ${municipio}`
}

/**
 * S3: the localidad where the group's people live. When the Líderes with a
 * known address agree, their municipio wins; otherwise the municipio of most
 * people. Only municipios that have a localidad count (Peña never wins, but
 * its residents count in the total). Null without data or on a tie.
 */
export function sugerirLocalidad(
  grupo: GrupoTablero,
  banco: readonly PersonaBanco[],
  localidades: readonly Localidad[],
): SugerenciaLocalidad | null {
  const porMunicipio = localidadPorMunicipio(localidades)
  const fichas = new Map(banco.map((p) => [p.usuario_id, p]))
  const municipioDe = (p: PersonaGrupo): string | null => {
    const municipio = fichas.get(p.usuario_id)?.municipio_id ?? null
    return municipio && porMunicipio.has(municipio) ? municipio : null
  }
  const conMunicipio = (lista: readonly PersonaGrupo[]): string[] => lista.flatMap((p) => municipioDe(p) ?? [])
  const nombreMunicipio = (municipio: string): string =>
    banco.find((p) => p.municipio_id === municipio && p.municipio_nombre)?.municipio_nombre ?? porMunicipio.get(municipio)?.nombre ?? ''
  const sugerencia = (municipio: string, motivo: string): SugerenciaLocalidad | null => {
    const localidad = porMunicipio.get(municipio)
    return localidad ? { localidadId: localidad.id, nombre: localidad.nombre, motivo } : null
  }

  const todos = personasDelGrupo(grupo)
  const deLideres = conMunicipio(grupo.lideres)
  if (deLideres.length > 0 && new Set(deLideres).size === 1) {
    const lideres = new Set(grupo.lideres.map((l) => l.usuario_id))
    const otros = todos.filter((p) => !lideres.has(p.usuario_id))
    const coinciden = otros.filter((p) => municipioDe(p) === deLideres[0]).length
    return sugerencia(deLideres[0], motivoPorLideres(deLideres.length, otros.length, coinciden, nombreMunicipio(deLideres[0])))
  }
  const mayoria = municipioMayoritario(conMunicipio(todos))
  if (!mayoria) return null
  return sugerencia(mayoria.municipio, `${mayoria.cantidad} de ${todos.length} ${viven(mayoria.cantidad)} en ${nombreMunicipio(mayoria.municipio)}`)
}

/** The N of "<base> - N" or "<base> N" (both normalized); null for any other name. */
function numeroDelNombre(nombre: string, base: string): number | null {
  if (!nombre.startsWith(base)) return null
  const resto = nombre.slice(base.length).replace(/^ ?-/, '').trim()
  return /^\d+$/.test(resto) ? Number(resto) : null
}

/**
 * S4: "<Localidad> <Segmento> - N" with N the highest number already used by
 * that localidad and segment in the season plus one (production numbers only
 * grow; a gap is not reused). Matrimonios has no dash ("Cabudare Matrimonios
 * 10"), as in production. Names compare without case, accents or extra
 * spaces, with or without the dash. Null without localidad or segment.
 */
export function sugerirNombre(
  localidadNombre: string | null,
  segmentoNombre: string | null,
  nombresExistentes: readonly string[],
): string | null {
  const localidad = (localidadNombre ?? '').trim()
  const segmento = (segmentoNombre ?? '').trim()
  if (!localidad || !segmento) return null
  const base = `${localidad} ${segmento}`.replace(/\s+/g, ' ')
  const numeros = nombresExistentes.map((nombre) => numeroDelNombre(normalizar(nombre), normalizar(base)) ?? 0)
  const mayor = Math.max(0, ...numeros)
  return esMatrimonios(segmento) ? `${base} ${mayor + 1}` : `${base} - ${mayor + 1}`
}

type GrupoEtiquetable = Pick<GrupoTablero, 'segmento_nombre' | 'localidad_nombre'>

const localidadDe = (grupo: GrupoEtiquetable): string | null => grupo.localidad_nombre?.trim() || null

/** S4: the label next to the name, "Matrimonios · Cabudare" or "Matrimonios · Sin localidad". */
export const etiquetaGrupo = (grupo: GrupoEtiquetable): string => `${grupo.segmento_nombre.trim()} · ${localidadDe(grupo) ?? SIN_LOCALIDAD}`

/**
 * S4: where the label does not fit, "Grupo #14 Los Escalona · Matrimonios
 * Cabudare" ("… · Matrimonios · Sin localidad" without localidad). A name
 * that already says segment and localidad stays as it is; a blank one is the
 * label.
 */
export function nombreCompleto(grupo: GrupoEtiquetable & Pick<GrupoTablero, 'nombre'>): string {
  const nombre = grupo.nombre.trim()
  const segmento = grupo.segmento_nombre.trim()
  const localidad = localidadDe(grupo)
  if (!nombre) return etiquetaGrupo(grupo)
  if (!localidad) return `${nombre} · ${segmento} · ${SIN_LOCALIDAD}`
  const dice = (parte: string): boolean => normalizar(nombre).includes(normalizar(parte))
  return dice(segmento) && dice(localidad) ? nombre : `${nombre} · ${segmento} ${localidad}`
}
