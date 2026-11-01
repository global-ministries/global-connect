'use server'

/**
 * Estudiantes — server actions of /estudiantes/grupos (C2 of
 * odd/tasks/estudiantes-fase-b.md): create, edit, deactivate a group, set its
 * leaders, confirm, add, move and remove members, and the lookups of the
 * drawer (people search, "Sin grupo", available leaders, past leaders).
 *
 * Gate: an authenticated session only. Who may act is decided in the
 * database: every estudiantes_* function resolves the caller and checks the
 * Dream Team level on the group's sub-área and campus (Q3), raising its code
 * as the message (supabase/migrations/20261029100100_estudiantes_asistencia_rpcs.sql,
 * 20261029130000_estudiantes_gestion_grupos.sql); lib/platform/estudiantes/errores.ts
 * turns it into Spanish. Optional DEFAULT NULL arguments are left out, never
 * sent as null (the generated types do not allow it).
 */

import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'
import { argumentosBusqueda } from '@/lib/platform/estudiantes/gestion-grupo'
import { MENSAJES_ERROR_GRUPOS, mensajeErrorGrupos } from '@/lib/platform/estudiantes/errores'
import type { PersonaRol } from '@/lib/platform/estudiantes/grupos-datos'
import { leerHistorialLideres, type PeriodoLider } from '@/lib/platform/estudiantes/lideres-historial'

export type ResultadoGrupos<T = null> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly message: string }

type Cliente = Awaited<ReturnType<typeof createSupabaseServerClient>>
type Args<F extends keyof Database['public']['Functions']> = Database['public']['Functions'][F]['Args']
type ErrorRpc = { readonly code?: string; readonly message?: string } | null

const RUTA = '/estudiantes/grupos'
const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

class EntradaInvalida extends Error {}

function uuid(valor: unknown): string {
  if (typeof valor === 'string' && UUID_RE.test(valor)) return valor
  throw new EntradaInvalida()
}

function uuids(valores: unknown): string[] {
  if (!Array.isArray(valores)) throw new EntradaInvalida()
  return valores.map(uuid)
}

function textoOpcional(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor !== 'string') throw new EntradaInvalida()
  return valor.trim() || null
}

function enteroOpcional(valor: unknown, minimo: number, maximo: number): number | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < minimo || valor > maximo) throw new EntradaInvalida()
  return valor
}

function horaOpcional(valor: unknown): string | null {
  const hora = textoOpcional(valor)
  if (hora !== null && !HORA_RE.test(hora)) throw new EntradaInvalida()
  return hora
}

function nombre(valor: unknown): string {
  if (typeof valor !== 'string') throw new EntradaInvalida()
  return valor.trim()
}

/** Session gate, input parsing and error mapping shared by every action. */
async function ejecutar<E, T>(
  parse: () => E,
  run: (cliente: Cliente, entrada: E) => Promise<ResultadoGrupos<T>>,
): Promise<ResultadoGrupos<T>> {
  const cliente = await createSupabaseServerClient()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  if (!user) return { ok: false, message: SIN_SESION }

  let entrada: E
  try {
    entrada = parse()
  } catch (error) {
    if (error instanceof EntradaInvalida) return { ok: false, message: MENSAJES_ERROR_GRUPOS.datos_invalidos }
    throw error
  }
  return run(cliente, entrada)
}

/** A write: the RPC, its error in Spanish, and the page refreshed on success. */
async function escribir(llamada: PromiseLike<{ error: ErrorRpc }>, fallback: string): Promise<ResultadoGrupos> {
  const { error } = await llamada
  if (error) return { ok: false, message: mensajeErrorGrupos(error, fallback) }
  revalidatePath(RUTA)
  return { ok: true, data: null }
}

export interface DatosGrupo {
  readonly nombre: string
  /** Transit / Inside Out. */
  readonly anio: number | null
  /** The Living Room. */
  readonly zona: string | null
  /** 0 Sunday … 6 Saturday; The Living Room. */
  readonly diaSemana: number | null
  /** "HH:MM"; The Living Room, needs the day. */
  readonly hora: string | null
}

function datosGrupo(datos: DatosGrupo) {
  return {
    nombre: nombre(datos.nombre),
    anio: enteroOpcional(datos.anio, 1, 20),
    zona: textoOpcional(datos.zona),
    dia: enteroOpcional(datos.diaSemana, 0, 6),
    hora: horaOpcional(datos.hora),
  }
}

export interface CrearGrupoInput extends DatosGrupo {
  readonly subareaId: string
  readonly campusId: string
  /** Servicio ids of the leaders; empty creates the group without leaders. */
  readonly lideres: readonly string[]
}

/** Creates the group and, when chosen, its leaders. A leaders failure keeps the group and comes back as `aviso`. */
export async function crearGrupo(input: CrearGrupoInput): Promise<ResultadoGrupos<{ grupoId: string; aviso: string | null }>> {
  return ejecutar(
    () => ({ subarea: uuid(input.subareaId), campus: uuid(input.campusId), lideres: uuids(input.lideres), ...datosGrupo(input) }),
    async (cliente, e) => {
      const args: Args<'estudiantes_grupo_crear'> = {
        p_subarea_id: e.subarea,
        p_campus_id: e.campus,
        p_nombre: e.nombre,
        ...(e.anio !== null ? { p_anio: e.anio } : {}),
        ...(e.zona !== null ? { p_zona: e.zona } : {}),
        ...(e.dia !== null ? { p_dia_semana: e.dia } : {}),
        ...(e.hora !== null ? { p_hora: e.hora } : {}),
      }
      const { data, error } = await cliente.rpc('estudiantes_grupo_crear', args)
      if (error || typeof data !== 'string') return { ok: false, message: mensajeErrorGrupos(error, 'No se pudo crear el grupo.') }

      let aviso: string | null = null
      if (e.lideres.length > 0) {
        const fijar = await cliente.rpc('estudiantes_grupo_lideres_fijar', { p_grupo_id: data, p_servicio_ids: e.lideres })
        if (fijar.error) {
          aviso = `El grupo se creó, pero no se pudieron asignar los líderes. ${mensajeErrorGrupos(fijar.error, 'Asígnalos desde el grupo.')}`
        }
      }
      revalidatePath(RUTA)
      return { ok: true, data: { grupoId: data, aviso } }
    },
  )
}

export interface EditarGrupoInput extends DatosGrupo {
  readonly grupoId: string
}

export async function editarGrupo(input: EditarGrupoInput): Promise<ResultadoGrupos> {
  return ejecutar(
    () => ({ grupo: uuid(input.grupoId), ...datosGrupo(input) }),
    (cliente, e) => {
      // estudiantes_grupo_editar has no DEFAULTs, so every argument goes. The
      // generated types mark them non-null, but the function takes NULL where
      // the ámbito does not use the field (Transit has no zona, día or hora).
      const args = {
        p_grupo_id: e.grupo,
        p_nombre: e.nombre,
        p_anio: e.anio,
        p_zona: e.zona,
        p_dia_semana: e.dia,
        p_hora: e.hora,
      } as unknown as Args<'estudiantes_grupo_editar'>
      return escribir(cliente.rpc('estudiantes_grupo_editar', args), 'No se pudo guardar el grupo.')
    },
  )
}

export async function activarGrupo(input: { readonly grupoId: string; readonly activo: boolean }): Promise<ResultadoGrupos> {
  return ejecutar(
    () => {
      if (typeof input.activo !== 'boolean') throw new EntradaInvalida()
      return { grupo: uuid(input.grupoId), activo: input.activo }
    },
    (cliente, e) =>
      escribir(
        cliente.rpc('estudiantes_grupo_activar', { p_grupo_id: e.grupo, p_activo: e.activo }),
        e.activo ? 'No se pudo reactivar el grupo.' : 'No se pudo desactivar el grupo.',
      ),
  )
}

export async function fijarLideres(input: { readonly grupoId: string; readonly servicioIds: readonly string[] }): Promise<ResultadoGrupos> {
  return ejecutar(
    () => ({ grupo: uuid(input.grupoId), servicios: uuids(input.servicioIds) }),
    (cliente, e) =>
      escribir(
        cliente.rpc('estudiantes_grupo_lideres_fijar', { p_grupo_id: e.grupo, p_servicio_ids: e.servicios }),
        'No se pudieron guardar los líderes.',
      ),
  )
}

interface PersonaEnGrupo {
  readonly grupoId: string
  readonly personaId: string
}

const personaEnGrupo = (input: PersonaEnGrupo) => () => ({ grupo: uuid(input.grupoId), persona: uuid(input.personaId) })

export async function confirmarMiembro(input: PersonaEnGrupo): Promise<ResultadoGrupos> {
  return ejecutar(personaEnGrupo(input), (cliente, e) =>
    escribir(cliente.rpc('estudiantes_confirmar_miembro', { p_grupo_id: e.grupo, p_persona_id: e.persona }), 'No se pudo confirmar.'),
  )
}

/** Adds a person as miembro: the director decides (A12); visitors come only from the leader's list. */
export async function agregarIntegrante(input: PersonaEnGrupo): Promise<ResultadoGrupos> {
  return ejecutar(personaEnGrupo(input), (cliente, e) =>
    escribir(
      cliente.rpc('estudiantes_grupo_miembro_agregar', { p_grupo_id: e.grupo, p_persona_id: e.persona, p_estado: 'miembro' }),
      'No se pudo agregar al grupo.',
    ),
  )
}

/** Moves an active member of the ámbito into `grupoId` in one step (their past attendance stays with the old group). */
export async function moverIntegrante(input: PersonaEnGrupo): Promise<ResultadoGrupos> {
  return ejecutar(personaEnGrupo(input), (cliente, e) =>
    escribir(cliente.rpc('estudiantes_grupo_miembro_mover', { p_persona_id: e.persona, p_grupo_id: e.grupo }), 'No se pudo mover.'),
  )
}

export async function quitarIntegrante(input: PersonaEnGrupo): Promise<ResultadoGrupos> {
  return ejecutar(personaEnGrupo(input), (cliente, e) =>
    escribir(cliente.rpc('estudiantes_grupo_miembro_quitar', { p_grupo_id: e.grupo, p_persona_id: e.persona }), 'No se pudo quitar del grupo.'),
  )
}

export interface PersonaEncontrada {
  readonly personaId: string
  readonly nombre: string
  /** Their active group in the ámbito, if any. */
  readonly grupoId: string | null
  readonly grupo: string | null
  readonly enEsteGrupo: boolean
}

const nombreDe = (fila: { readonly nombre: string | null; readonly apellido: string | null }): string =>
  [fila.nombre, fila.apellido].filter(Boolean).join(' ')

/** "Agregar integrante": the church-wide search by cédula, teléfono or full name (at most 10). */
export async function buscarPersonas(input: { readonly grupoId: string; readonly consulta: string }): Promise<ResultadoGrupos<PersonaEncontrada[]>> {
  return ejecutar(
    () => ({ grupo: uuid(input.grupoId), argumentos: argumentosBusqueda(typeof input.consulta === 'string' ? input.consulta : '') }),
    async (cliente, e) => {
      if (e.argumentos === null) return { ok: true, data: [] }
      const { data, error } = await cliente.rpc('estudiantes_buscar_personas', { p_grupo_id: e.grupo, ...e.argumentos })
      if (error) return { ok: false, message: mensajeErrorGrupos(error, 'No se pudo buscar.') }
      return {
        ok: true,
        data: (data ?? []).map((fila) => ({
          personaId: fila.persona_id,
          nombre: nombreDe(fila),
          grupoId: fila.grupo_id ?? null,
          grupo: fila.grupo ?? null,
          enEsteGrupo: fila.en_este_grupo === true,
        })),
      }
    },
  )
}

export interface PersonaSinGrupo {
  readonly personaId: string
  readonly nombre: string
  readonly anioEtiqueta: string | null
  readonly ultimoGrupo: string | null
}

/** People who were in a group of the same sub-área and campus and have none in the ámbito today (at most 50). */
export async function sinGrupo(input: { readonly grupoId: string }): Promise<ResultadoGrupos<PersonaSinGrupo[]>> {
  return ejecutar(
    () => ({ grupo: uuid(input.grupoId) }),
    async (cliente, e) => {
      const { data, error } = await cliente.rpc('estudiantes_sin_grupo', { p_grupo_id: e.grupo })
      if (error) return { ok: false, message: mensajeErrorGrupos(error, 'No se pudo cargar la lista.') }
      return {
        ok: true,
        data: (data ?? []).map((fila) => ({
          personaId: fila.persona_id,
          nombre: nombreDe(fila),
          anioEtiqueta: fila.anio_etiqueta ?? null,
          ultimoGrupo: fila.ultimo_grupo ?? null,
        })),
      }
    },
  )
}

/** The Dream Team volunteers of a sub-área and campus who may lead a group there. */
export async function lideresDisponibles(input: { readonly subareaId: string; readonly campusId: string }): Promise<ResultadoGrupos<PersonaRol[]>> {
  return ejecutar(
    () => ({ subarea: uuid(input.subareaId), campus: uuid(input.campusId) }),
    async (cliente, e) => {
      const { data, error } = await cliente.rpc('estudiantes_lideres_disponibles', { p_subarea_id: e.subarea, p_campus_id: e.campus })
      if (error) return { ok: false, message: mensajeErrorGrupos(error, 'No se pudieron cargar los voluntarios.') }
      return {
        ok: true,
        data: (data ?? []).map((fila) => ({ servicioId: fila.servicio_id, personaId: fila.persona_id, nombre: nombreDe(fila), rol: fila.rol })),
      }
    },
  )
}

/** Every leadership period of a group, current ones first (estudiantes_grupo_lideres_historial; L29). */
export async function historialLideres(input: { readonly grupoId: string }): Promise<ResultadoGrupos<PeriodoLider[]>> {
  return ejecutar(
    () => ({ grupo: uuid(input.grupoId) }),
    async (cliente, e) => {
      const { data, error } = await cliente.rpc('estudiantes_grupo_lideres_historial', { p_grupo_id: e.grupo })
      if (error) return { ok: false, message: mensajeErrorGrupos(error, 'No se pudieron cargar los líderes anteriores.') }
      return { ok: true, data: leerHistorialLideres(data) }
    },
  )
}
