'use server'

/**
 * Niños — server actions of /ninos/salones (odd/tasks/ninos-checkin-pco.md,
 * T1d, S5, S8.4): the rules of a salón, its name / quota / ranges, a new
 * salón and the carpeta of an area.
 *
 * Gate: an authenticated session only. Who may write is checked again by the
 * database: ninos_salon_reglas_guardar and the ninos_salones RLS need
 * ninos_puede_configurar on the salón's equipo (an area coordinator edits only
 * their area); ninos_carpeta_guardar needs it on a salón of the area. The RPC
 * HINT is returned as is (lib/platform/ninos/salones-reglas.ts). On success
 * the screen is revalidated.
 */

import { revalidatePath } from 'next/cache'

import type { Resultado } from '@/lib/platform/ninos/eventos'
import {
  AREAS,
  DISTRIBUCIONES,
  actualizarDatosSalon,
  insertarSalon,
  rpcGuardarCarpeta,
  rpcGuardarReglas,
  validarDatosSalon,
  validarReglas,
  type CarpetaAdmin,
  type DatosSalon,
  type ReglasSalon,
} from '@/lib/platform/ninos/salones-reglas'
import type { AreaSalon } from '@/lib/platform/ninos/sugerir-salon'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const DATOS_INVALIDOS = 'Revisa los datos e inténtalo de nuevo.'
const RUTA = '/ninos/salones'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID_RE.test(valor)
const esNumeroONulo = (valor: unknown): boolean => valor === null || typeof valor === 'number'
const esArea = (valor: unknown): valor is AreaSalon => AREAS.includes(valor as AreaSalon)

async function clienteConSesion() {
  const cliente = await createSupabaseServerClient()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  return user ? cliente : null
}

function despues<T>(r: Resultado<T>): Resultado<T> {
  if (r.ok) revalidatePath(RUTA)
  return r
}

function reglasBienFormadas(r: ReglasSalon | undefined): r is ReglasSalon {
  return (
    !!r &&
    typeof r.cupoVisitantes === 'number' &&
    typeof r.minVoluntarios === 'number' &&
    (['abierto', 'opcionPanal', 'opcionMerienda'] as const).every((k) => typeof r[k] === 'boolean') &&
    (['ninosPorVoluntario', 'corteMes', 'corteDia', 'promocionMes', 'promocionDia'] as const).every((k) => esNumeroONulo(r[k]))
  )
}

/** Replaces the rules of a salón (visitors, volunteers, open, options, corte, promoción). */
export async function guardarReglasSalon(input: { salonId: string; reglas: ReglasSalon }): Promise<Resultado<null>> {
  const cliente = await clienteConSesion()
  if (!cliente) return { ok: false, message: SIN_SESION }
  if (!esUuid(input?.salonId) || !reglasBienFormadas(input.reglas)) return { ok: false, message: DATOS_INVALIDOS }
  const invalido = validarReglas(input.reglas)
  if (invalido) return { ok: false, message: invalido }

  return despues(await rpcGuardarReglas(cliente, input.salonId, input.reglas))
}

/** The name, regulars' quota and age / grade ranges of a salón. */
export async function guardarDatosSalon(input: { salonId: string; datos: DatosSalon }): Promise<Resultado<null>> {
  const cliente = await clienteConSesion()
  if (!cliente) return { ok: false, message: SIN_SESION }
  const d = input?.datos
  if (
    !esUuid(input?.salonId) ||
    !d ||
    typeof d.nombre !== 'string' ||
    typeof d.capacidad !== 'number' ||
    !(['edadMinMeses', 'edadMaxMeses', 'gradoMin', 'gradoMax'] as const).every((k) => esNumeroONulo(d[k]))
  ) {
    return { ok: false, message: DATOS_INVALIDOS }
  }
  const invalido = validarDatosSalon(d)
  if (invalido) return { ok: false, message: invalido }

  return despues(await actualizarDatosSalon(cliente, input.salonId, d))
}

/** A new salón of an area in the campus; returns its id. */
export async function crearSalon(input: { campusId: string; area: AreaSalon; nombre: string }): Promise<Resultado<{ id: string }>> {
  const cliente = await clienteConSesion()
  if (!cliente) return { ok: false, message: SIN_SESION }
  if (!esUuid(input?.campusId) || !esArea(input.area) || typeof input.nombre !== 'string') return { ok: false, message: DATOS_INVALIDOS }
  const invalido = validarDatosSalon({ nombre: input.nombre, capacidad: 1, edadMinMeses: null, edadMaxMeses: null, gradoMin: null, gradoMax: null })
  if (invalido) return { ok: false, message: invalido }

  return despues(await insertarSalon(cliente, input))
}

/** Distribution and "mantener a los regulares" of an area in a campus. */
export async function guardarCarpeta(input: { campusId: string } & CarpetaAdmin): Promise<Resultado<null>> {
  const cliente = await clienteConSesion()
  if (!cliente) return { ok: false, message: SIN_SESION }
  if (
    !esUuid(input?.campusId) ||
    !esArea(input.area) ||
    !DISTRIBUCIONES.includes(input.distribucion) ||
    typeof input.mantenerRegulares !== 'boolean'
  ) {
    return { ok: false, message: DATOS_INVALIDOS }
  }

  return despues(
    await rpcGuardarCarpeta(cliente, input.campusId, { area: input.area, distribucion: input.distribucion, mantenerRegulares: input.mantenerRegulares }),
  )
}
