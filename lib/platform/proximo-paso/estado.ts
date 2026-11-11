/**
 * T8 (odd/tasks/proximo-paso.md, L22/L24) — Próximo Paso for a signed-in
 * person: the open ediciones (proximo_paso_ediciones_abiertas with the
 * person's own client, with hora, lugar and indicaciones) and their own
 * inscripción in one of them (taller_inscripciones under RLS, as principal
 * or companero, pendiente or aprobado; same filter as
 * loadParticipanteActiveTalleres). Used by the home card and /proximo-paso.
 *
 * An inscripción counts only when its edición belongs to the taller with
 * slug 'proximo-paso', is abierto or en_curso and has not ended. An edición
 * already en curso is not in the open list: it keeps the name and dates the
 * inscripción's own read gives, without clases, hora or lugar.
 */
import { estadoInscripcion, parseEdicionesProximoPaso, PROXIMO_PASO_SLUG, type EdicionProximoPaso, type EstadoInscripcionProximoPaso } from '@/lib/platform/talleres/proximo-paso-registro'

export interface InscripcionProximoPaso {
  readonly estado: EstadoInscripcionProximoPaso
  readonly edicion: EdicionProximoPaso
}

export interface EstadoProximoPaso {
  readonly ediciones: readonly EdicionProximoPaso[]
  readonly inscripcion: InscripcionProximoPaso | null
}

type Respuesta = PromiseLike<{ data: unknown; error: unknown }>

/** The narrow client surface this needs (the SSR client fits). */
export interface ClienteProximoPaso {
  rpc: (nombre: 'proximo_paso_ediciones_abiertas') => Respuesta
  from: (tabla: 'taller_inscripciones') => {
    select: (columnas: string) => { or: (filtro: string) => { in: (columna: string, valores: string[]) => Respuesta } }
  }
}

const COLUMNAS_INSCRIPCION =
  'estado, edicion:taller_ediciones!taller_id (id, nombre_snapshot, fecha_inicio, fecha_fin, estado, taller:talleres!taller_id (slug))'

type Objeto = Record<string, unknown>
const objeto = (v: unknown): Objeto | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Objeto) : null)
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
/** PostgREST may embed a to-one relation as an object or a one-item array. */
const uno = (v: unknown): Objeto | null => objeto(Array.isArray(v) ? v[0] : v)

function inscripcionDe(fila: Objeto, abiertas: readonly EdicionProximoPaso[], hoy: string): InscripcionProximoPaso | null {
  const e = uno(fila.edicion)
  const id = texto(e?.id)
  const fechaInicio = texto(e?.fecha_inicio)
  if (!e || !id || !fechaInicio) return null
  if (texto(uno(e.taller)?.slug) !== PROXIMO_PASO_SLUG) return null
  if (e.estado !== 'abierto' && e.estado !== 'en_curso') return null
  const fechaFin = texto(e.fecha_fin)
  if (fechaFin && fechaFin < hoy) return null
  const edicion = abiertas.find((a) => a.id === id) ?? {
    id,
    nombre: texto(e.nombre_snapshot) ?? fechaInicio,
    fechaInicio,
    fechaFin,
    cupoRestante: null,
    clases: [],
    hora: null,
    lugar: null,
    indicaciones: null,
  }
  return { estado: estadoInscripcion(fila), edicion }
}

/**
 * The open ediciones and the own inscripción; null when the ediciones could
 * not be read. A failed inscripción read counts as none.
 */
export async function cargarEstadoProximoPaso(
  cliente: ClienteProximoPaso,
  { usuarioId, hoy }: { readonly usuarioId: string | null; readonly hoy: string },
): Promise<EstadoProximoPaso | null> {
  const { data, error } = await cliente.rpc('proximo_paso_ediciones_abiertas')
  if (error) return null
  const ediciones = parseEdicionesProximoPaso(data)
  if (!usuarioId) return { ediciones, inscripcion: null }

  const filas = await cliente
    .from('taller_inscripciones')
    .select(COLUMNAS_INSCRIPCION)
    .or(`persona_principal_id.eq.${usuarioId},companero_id.eq.${usuarioId}`)
    .in('estado', ['pendiente', 'aprobado'])
  const lista = !filas.error && Array.isArray(filas.data) ? filas.data : []
  const inscripciones = lista
    .map((f) => objeto(f))
    .filter((f): f is Objeto => f !== null)
    .map((f) => inscripcionDe(f, ediciones, hoy))
    .filter((i): i is InscripcionProximoPaso => i !== null)
    // An open edición first, then the earliest.
    .sort(
      (a, b) =>
        Number(!ediciones.includes(a.edicion)) - Number(!ediciones.includes(b.edicion)) ||
        a.edicion.fechaInicio.localeCompare(b.edicion.fechaInicio),
    )
  return { ediciones, inscripcion: inscripciones[0] ?? null }
}

export type VarianteProximoPaso =
  | { readonly variante: 'inscrito'; readonly inscripcion: InscripcionProximoPaso }
  | { readonly variante: 'abiertas'; readonly edicion: EdicionProximoPaso; readonly disponibles: readonly EdicionProximoPaso[] }
  | { readonly variante: 'sin-fecha' }

/** Ediciones still taking people: cupo left or no cupo defined. */
export const conCupo = (ediciones: readonly EdicionProximoPaso[]): EdicionProximoPaso[] => ediciones.filter((e) => e.cupoRestante !== 0)

/** Inscrito first; else the nearest open edición with cupo; else the soft card. */
export function varianteProximoPaso(estado: EstadoProximoPaso): VarianteProximoPaso {
  if (estado.inscripcion) return { variante: 'inscrito', inscripcion: estado.inscripcion }
  const disponibles = conCupo(estado.ediciones)
  return disponibles.length > 0 ? { variante: 'abiertas', edicion: disponibles[0], disponibles } : { variante: 'sin-fecha' }
}
