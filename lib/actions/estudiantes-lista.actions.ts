'use server'

/**
 * Estudiantes — server actions of the leader list
 * (/estudiantes/grupos/[grupoId], C3b of odd/tasks/estudiantes-fase-b.md):
 * mark a person, save the place of a The Living Room meeting, confirm a
 * visitor as member, and "Agregar visitante" (add someone found by the
 * search, or create a new person with the possible-duplicates check).
 *
 * Gate: an authenticated session only. Who may act is decided in the
 * database: every estudiantes_* function resolves the caller and checks the
 * group level (Q3), raising its code as the message
 * (supabase/migrations/20261029100100_estudiantes_asistencia_rpcs.sql);
 * lib/platform/estudiantes/errores.ts turns it into Spanish and the code
 * travels back so the visitor form can react to `posibles_duplicados` and
 * `cedula_existente`. Optional DEFAULT NULL arguments are left out, never sent
 * as null. The turno is null only for The Living Room, which has none (the
 * generated types mark it non-null, so those calls are cast).
 *
 * A mark does not refresh the page (the list keeps it optimistically); the
 * visitor and member changes refresh the list and the group screen.
 */

import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Database, Json } from '@/lib/supabase/database.types'
import { MENSAJES_ERROR_GRUPOS, codigoErrorGrupos, mensajeErrorGrupos, type CodigoErrorGrupos } from '@/lib/platform/estudiantes/errores'
import type { Marca } from '@/lib/platform/estudiantes/lista-datos'
import { argumentosCoincidencias } from '@/lib/platform/estudiantes/visitante'
import type { PersonaEncontrada } from '@/lib/actions/estudiantes-grupos.actions'

export type ResultadoLista<T = null> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly message: string; readonly codigo: CodigoErrorGrupos | null }

type Cliente = Awaited<ReturnType<typeof createSupabaseServerClient>>
type Args<F extends keyof Database['public']['Functions']> = Database['public']['Functions'][F]['Args']
type ErrorRpc = { readonly code?: string; readonly message?: string } | null

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

class EntradaInvalida extends Error {}

function uuid(valor: unknown): string {
  if (typeof valor === 'string' && UUID_RE.test(valor)) return valor
  throw new EntradaInvalida()
}

function uuidONulo(valor: unknown): string | null {
  return valor === null || valor === undefined ? null : uuid(valor)
}

function fecha(valor: unknown): string {
  if (typeof valor === 'string' && FECHA_RE.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`))) return valor
  throw new EntradaInvalida()
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor !== 'string') throw new EntradaInvalida()
  return valor.trim()
}

function fallo(error: ErrorRpc, fallback: string): { readonly ok: false; readonly message: string; readonly codigo: CodigoErrorGrupos | null } {
  return { ok: false, message: mensajeErrorGrupos(error, fallback), codigo: codigoErrorGrupos(error) }
}

/** Session gate, input parsing and error mapping shared by every action. */
async function ejecutar<E, T>(parse: () => E, run: (cliente: Cliente, entrada: E) => Promise<ResultadoLista<T>>): Promise<ResultadoLista<T>> {
  const cliente = await createSupabaseServerClient()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  if (!user) return { ok: false, message: SIN_SESION, codigo: null }

  let entrada: E
  try {
    entrada = parse()
  } catch (error) {
    if (error instanceof EntradaInvalida) return { ok: false, message: MENSAJES_ERROR_GRUPOS.datos_invalidos, codigo: 'datos_invalidos' }
    throw error
  }
  return run(cliente, entrada)
}

function refrescar(grupoId: string): void {
  revalidatePath(`/estudiantes/grupos/${grupoId}`)
  revalidatePath('/estudiantes/grupos')
}

interface Reunion {
  readonly grupoId: string
  readonly fecha: string
  /** `null` for The Living Room. */
  readonly turnoId: string | null
}

const reunion = (input: Reunion) => ({ grupo: uuid(input.grupoId), fecha: fecha(input.fecha), turno: uuidONulo(input.turnoId) })

const objeto = (valor: Json | undefined): { readonly [clave: string]: Json | undefined } =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? valor : {}

export interface MarcarInput extends Reunion {
  readonly personaId: string
  /** `null` clears the mark (second tap on the same state). */
  readonly estado: Marca | null
}

/** Marks presente / ausente (or clears) one person; the meeting opens on the first mark. */
export async function marcarAsistencia(input: MarcarInput): Promise<ResultadoLista<{ visitas: number; sugerirConfirmar: boolean }>> {
  return ejecutar(
    () => {
      if (input.estado !== null && input.estado !== 'presente' && input.estado !== 'ausente') throw new EntradaInvalida()
      return { ...reunion(input), persona: uuid(input.personaId), estado: input.estado }
    },
    async (cliente, e) => {
      const args = {
        p_grupo_id: e.grupo,
        p_fecha: e.fecha,
        p_turno_id: e.turno,
        p_persona_id: e.persona,
        p_estado: e.estado,
      } as unknown as Args<'estudiantes_marcar'>
      const { data, error } = await cliente.rpc('estudiantes_marcar', args)
      if (error) return fallo(error, 'No se pudo guardar la marca.')
      const r = objeto(data)
      return { ok: true, data: { visitas: typeof r.visitas === 'number' ? r.visitas : 0, sugerirConfirmar: r.sugerir_confirmar === true } }
    },
  )
}

/** "Lugar (opcional)" of a The Living Room meeting; an empty place clears it. Opens the meeting when missing. */
export async function guardarLugar(input: Reunion & { readonly lugar: string }): Promise<ResultadoLista> {
  return ejecutar(
    () => ({ ...reunion(input), lugar: texto(input.lugar) }),
    async (cliente, e) => {
      const args = {
        p_grupo_id: e.grupo,
        p_fecha: e.fecha,
        p_turno_id: e.turno,
        ...(e.lugar ? { p_lugar: e.lugar } : {}),
      } as unknown as Args<'estudiantes_reunion_guardar'>
      const { error } = await cliente.rpc('estudiantes_reunion_guardar', args)
      if (error) return fallo(error, 'No se pudo guardar el lugar.')
      return { ok: true, data: null }
    },
  )
}

/** "¿La sumas al grupo?": the visitor becomes a member. */
export async function confirmarMiembroLista(input: { readonly grupoId: string; readonly personaId: string }): Promise<ResultadoLista> {
  return ejecutar(
    () => ({ grupo: uuid(input.grupoId), persona: uuid(input.personaId) }),
    async (cliente, e) => {
      const { error } = await cliente.rpc('estudiantes_confirmar_miembro', { p_grupo_id: e.grupo, p_persona_id: e.persona })
      if (error) return fallo(error, 'No se pudo confirmar.')
      refrescar(e.grupo)
      return { ok: true, data: null }
    },
  )
}

/** "Agregar" on a search result: the person joins as visitante (a member keeps their estado) and is marked presente. */
export async function agregarVisitante(input: Reunion & { readonly personaId: string }): Promise<ResultadoLista> {
  return ejecutar(
    () => ({ ...reunion(input), persona: uuid(input.personaId) }),
    async (cliente, e) => {
      const args = { p_grupo_id: e.grupo, p_fecha: e.fecha, p_turno_id: e.turno, p_persona_id: e.persona } as unknown as Args<'estudiantes_visitante_agregar'>
      const { error } = await cliente.rpc('estudiantes_visitante_agregar', args)
      if (error) return fallo(error, 'No se pudo agregar al grupo.')
      refrescar(e.grupo)
      return { ok: true, data: null }
    },
  )
}

/**
 * "Registrar visitante": creates the person (and the representante), adds them
 * as visitante and marks them presente. `datos` is the p_datos built by
 * lib/platform/estudiantes/visitante.ts; the database validates every field.
 */
export async function crearVisitante(input: Reunion & { readonly datos: Readonly<Record<string, Json>> }): Promise<ResultadoLista<{ personaId: string }>> {
  return ejecutar(
    () => {
      const datos = input.datos
      if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) throw new EntradaInvalida()
      return { ...reunion(input), datos: datos as Json }
    },
    async (cliente, e) => {
      const args = { p_grupo_id: e.grupo, p_fecha: e.fecha, p_turno_id: e.turno, p_datos: e.datos } as unknown as Args<'estudiantes_visitante_crear'>
      const { data, error } = await cliente.rpc('estudiantes_visitante_crear', args)
      if (error) return fallo(error, 'No se pudo registrar al visitante.')
      refrescar(e.grupo)
      const personaId = objeto(data).persona_id
      return { ok: true, data: { personaId: typeof personaId === 'string' ? personaId : '' } }
    },
  )
}

/** After `posibles_duplicados`: who matches the new visitor's full name or phone (at most 10). */
export async function buscarCoincidencias(input: {
  readonly grupoId: string
  readonly nombre: string
  readonly apellido: string
  readonly telefono?: string
}): Promise<ResultadoLista<PersonaEncontrada[]>> {
  return ejecutar(
    () => {
      const entrada = { grupo: uuid(input.grupoId), nombre: texto(input.nombre), apellido: texto(input.apellido), telefono: texto(input.telefono) }
      if (!entrada.nombre || !entrada.apellido) throw new EntradaInvalida()
      return entrada
    },
    async (cliente, e) => {
      const { data, error } = await cliente.rpc('estudiantes_buscar_personas', { p_grupo_id: e.grupo, ...argumentosCoincidencias(e) })
      if (error) return fallo(error, 'No se pudo buscar.')
      return {
        ok: true,
        data: (data ?? []).map((fila) => ({
          personaId: fila.persona_id,
          nombre: [fila.nombre, fila.apellido].filter(Boolean).join(' '),
          grupoId: fila.grupo_id ?? null,
          grupo: fila.grupo ?? null,
          enEsteGrupo: fila.en_este_grupo === true,
        })),
      }
    },
  )
}

/** The newest meeting the group can mark ("Registrar nuevo" from the group drawer); `null` without one. */
export async function sesionReciente(input: { readonly grupoId: string }): Promise<ResultadoLista<{ fecha: string; turnoId: string | null } | null>> {
  return ejecutar(
    () => ({ grupo: uuid(input.grupoId) }),
    async (cliente, e) => {
      const { data, error } = await cliente.rpc('estudiantes_grupo_sesiones', { p_grupo_id: e.grupo })
      if (error) return fallo(error, 'No se pudieron cargar las reuniones.')
      const ultima = (data ?? [])[0]
      return { ok: true, data: ultima ? { fecha: ultima.fecha, turnoId: ultima.turno_id ?? null } : null }
    },
  )
}
