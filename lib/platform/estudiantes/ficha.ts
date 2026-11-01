/**
 * Estudiantes — the pure view model of the "Año escolar" editor of the person
 * detail (C6b4 of odd/tasks/estudiantes-fase-b.md, S16): whoever sees a
 * Transit / Inside Out group fixes the año actual and the año en que termina
 * el colegio of a member. The Living Room has no year.
 *
 * Source: estudiantes_ficha(p_persona_id)
 * (supabase/migrations/20261102110000_estudiantes_ficha_leer.sql); the save is
 * estudiantes_ficha_guardar (20261029100100), which checks the same rules
 * again (anio_invalido). The selects work with strings ('' = nothing chosen).
 */

type ErrorRpc = { readonly code?: string; readonly message?: string } | null | undefined

export interface AnioEscala {
  readonly numero: number
  /** "2do año". */
  readonly etiqueta: string
  /** "Transit" / "Inside Out". */
  readonly ambito: string
}

export interface FichaEstudiante {
  readonly personaId: string
  readonly campusId: string
  /** NULL without ficha. */
  readonly anioActual: number | null
  readonly anioFinal: number | null
  readonly egresado: boolean
  readonly puedeEditar: boolean
  /** The campus scale, in order. */
  readonly escala: readonly AnioEscala[]
}

export interface BorradorFicha {
  readonly anioActual: string
  readonly anioFinal: string
}

export interface OpcionAnio {
  readonly valor: string
  readonly etiqueta: string
}

export type ValidacionFicha =
  | { readonly ok: true; readonly anioActual: number; readonly anioFinal: number }
  | { readonly ok: false; readonly mensaje: string }

const objeto = (valor: unknown): Record<string, unknown> | null =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null

const entero = (valor: unknown): number | null => (typeof valor === 'number' && Number.isInteger(valor) ? valor : null)

function anioEscala(valor: unknown): AnioEscala | null {
  const o = objeto(valor)
  const numero = entero(o?.numero)
  if (!o || numero === null || typeof o.etiqueta !== 'string') return null
  return { numero, etiqueta: o.etiqueta, ambito: typeof o.ambito === 'string' ? o.ambito : '' }
}

/** The jsonb of estudiantes_ficha; `null` when it is not one. */
export function parsearFicha(valor: unknown): FichaEstudiante | null {
  const o = objeto(valor)
  if (!o || typeof o.persona_id !== 'string' || typeof o.campus_id !== 'string') return null
  const escala = (Array.isArray(o.escala) ? o.escala : []).map(anioEscala).filter((e): e is AnioEscala => e !== null)
  return {
    personaId: o.persona_id,
    campusId: o.campus_id,
    anioActual: entero(o.anio_actual),
    anioFinal: entero(o.anio_final),
    egresado: o.egresado === true,
    puedeEditar: o.puede_editar === true && escala.length > 0,
    escala,
  }
}

const opcion = (e: AnioEscala): OpcionAnio => ({ valor: String(e.numero), etiqueta: e.etiqueta })

const numeroDe = (valor: string): number | null => (/^\d+$/.test(valor) ? Number(valor) : null)

const enEscala = (ficha: FichaEstudiante, numero: number | null): boolean => numero !== null && ficha.escala.some((e) => e.numero === numero)

const etiquetaDe = (ficha: FichaEstudiante, numero: number | null): string | null =>
  numero === null ? null : (ficha.escala.find((e) => e.numero === numero)?.etiqueta ?? `${numero}º`)

const ultimo = (ficha: FichaEstudiante): number | null => ficha.escala[ficha.escala.length - 1]?.numero ?? null

/** Options of "Año actual": the whole scale. */
export function opcionesAnioActual(ficha: FichaEstudiante): OpcionAnio[] {
  return ficha.escala.map(opcion)
}

/** Options of "Termina el colegio en": the years from the chosen año actual on. */
export function opcionesAnioFinal(ficha: FichaEstudiante, anioActual: string): OpcionAnio[] {
  const desde = numeroDe(anioActual)
  return ficha.escala.filter((e) => desde === null || e.numero >= desde).map(opcion)
}

/** "2do año · termina en 6to año", "6to año · egresó" or "Sin año escolar". */
export function resumenFicha(ficha: FichaEstudiante): string {
  const actual = etiquetaDe(ficha, ficha.anioActual)
  if (!actual) return 'Sin año escolar'
  if (ficha.egresado) return `${actual} · egresó`
  const final = etiquetaDe(ficha, ficha.anioFinal)
  return final ? `${actual} · termina en ${final}` : actual
}

/** The stored years; without año final, the last year of the scale (the database default). */
export function borradorInicial(ficha: FichaEstudiante): BorradorFicha {
  const final = ficha.anioFinal ?? ultimo(ficha)
  return { anioActual: ficha.anioActual === null ? '' : String(ficha.anioActual), anioFinal: final === null ? '' : String(final) }
}

/** A new año actual; an año final that became earlier moves to the last year of the scale. */
export function cambiarAnioActual(ficha: FichaEstudiante, borrador: BorradorFicha, anioActual: string): BorradorFicha {
  const actual = numeroDe(anioActual)
  const final = numeroDe(borrador.anioFinal)
  if (actual !== null && (final === null || final < actual)) {
    const ultimoAnio = ultimo(ficha)
    return { anioActual, anioFinal: ultimoAnio === null ? '' : String(ultimoAnio) }
  }
  return { anioActual, anioFinal: borrador.anioFinal }
}

/** Whether the draft still holds the stored years. */
export function sinCambios(ficha: FichaEstudiante, borrador: BorradorFicha): boolean {
  const inicial = borradorInicial(ficha)
  return ficha.anioActual !== null && inicial.anioActual === borrador.anioActual && inicial.anioFinal === borrador.anioFinal
}

export function validarFicha(ficha: FichaEstudiante, borrador: BorradorFicha): ValidacionFicha {
  if (borrador.anioActual === '') return { ok: false, mensaje: 'Elige el año actual.' }
  const actual = numeroDe(borrador.anioActual)
  if (actual === null || !enEscala(ficha, actual)) return { ok: false, mensaje: 'Elige el año actual de la escala de tu campus.' }
  if (borrador.anioFinal === '') return { ok: false, mensaje: 'Elige el año en que termina el colegio.' }
  const final = numeroDe(borrador.anioFinal)
  if (final === null || !enEscala(ficha, final)) return { ok: false, mensaje: 'Elige el año en que termina el colegio de la escala de tu campus.' }
  if (final < actual) return { ok: false, mensaje: 'El año en que termina el colegio no puede ser anterior al año actual.' }
  return { ok: true, anioActual: actual, anioFinal: final }
}

// ── errors ───────────────────────────────────────────────────────────

export const MENSAJES_ERROR_FICHA = {
  sin_autoridad: 'No tienes permiso para editar el año escolar de esta persona.',
  anio_invalido: 'Elige años de la escala de tu campus. El año final no puede ser anterior al actual.',
  anio_no_aplica: 'The Living Room no lleva año escolar.',
  datos_invalidos: 'Revisa los datos e inténtalo de nuevo.',
} as const

export type CodigoErrorFicha = keyof typeof MENSAJES_ERROR_FICHA

const esCodigo = (valor: string): valor is CodigoErrorFicha => Object.prototype.hasOwnProperty.call(MENSAJES_ERROR_FICHA, valor)

/** The code of an RPC error (`sin_autoridad` for SQLSTATE 42501); `null` when unknown. */
export function codigoErrorFicha(error: ErrorRpc): CodigoErrorFicha | null {
  const mensaje = error?.message?.trim() ?? ''
  if (esCodigo(mensaje)) return mensaje
  if (error?.code === '42501') return 'sin_autoridad'
  return null
}

export function mensajeErrorFicha(error: ErrorRpc, fallback = 'No se pudo guardar el año escolar. Inténtalo de nuevo.'): string {
  const codigo = codigoErrorFicha(error)
  return codigo ? MENSAJES_ERROR_FICHA[codigo] : fallback
}
