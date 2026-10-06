/**
 * Dream Team — registering a person who is not in the system yet, from the
 * assigner (T7 and T9 of odd/tasks/ninos-voluntarios-waumba.md).
 *
 * The database does the work in one transaction
 * (dream_team_registrar_persona, 20261006100000_dream_team_alta_persona.sql):
 * only the volunteer coordinator of the area, dream_team.org.manage, admin or
 * pastor may call it (20261006110100); it creates the person and their
 * servicio postulado, or answers with the
 * person who already holds the cedula ('existente') or the namesakes born the
 * same day ('coincidencias') without writing anything. This module only
 * validates the request body (same rules as the function, so the form gets a
 * clear message before a round trip) and maps the RPC answer and errors.
 */
import { prepararCedula } from '@/lib/utils/cedula'

export const GENEROS = ['Masculino', 'Femenino', 'Otro'] as const
export const ESTADOS_CIVILES = ['Soltero', 'Casado', 'Divorciado', 'Viudo'] as const
// relaciones_usuarios reads "usuario2 is <tipo> of usuario1": the representative is
// usuario2. The values are gender-neutral; 'hermano' covers an older sibling.
export const TIPOS_REPRESENTANTE = ['padre', 'tutor', 'abuelo', 'tio', 'hermano', 'otro_familiar'] as const

export type Genero = (typeof GENEROS)[number]
export type EstadoCivil = (typeof ESTADOS_CIVILES)[number]
export type TipoRepresentante = (typeof TIPOS_REPRESENTANTE)[number]

export const TIPO_REPRESENTANTE_LABELS: Readonly<Record<TipoRepresentante, string>> = {
  padre: 'Padre/Madre',
  tutor: 'Tutor/a',
  abuelo: 'Abuelo/a',
  tio: 'Tío/a',
  hermano: 'Hermano/a mayor',
  otro_familiar: 'Otro familiar',
}

/** An equipo the actor may register a new person into, with its active roles. */
export interface OpcionRegistro {
  readonly id: string
  readonly etiqueta: string
  readonly roles: readonly { readonly id: string; readonly label: string }[]
}

/** Maps the jsonb of dream_team_opciones_registro, dropping malformed entries. */
export function mapOpcionesRegistro(data: unknown): OpcionRegistro[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((o) => {
    if (!o || typeof o !== 'object') return []
    const { id, etiqueta, roles } = o as Record<string, unknown>
    if (typeof id !== 'string' || typeof etiqueta !== 'string') return []
    const lista = Array.isArray(roles) ? roles : []
    return [{
      id,
      etiqueta,
      roles: lista.flatMap((r) => {
        const { id: rid, label } = (r ?? {}) as Record<string, unknown>
        return typeof rid === 'string' && typeof label === 'string' ? [{ id: rid, label }] : []
      }),
    }]
  })
}

export interface AltaPersonaInput {
  readonly equipoId: string
  readonly rolId: string
  readonly nombre: string
  readonly apellido: string
  readonly genero: Genero
  readonly estadoCivil: EstadoCivil
  readonly cedula: string | null
  readonly fechaNacimiento: string | null
  readonly telefono: string | null
  readonly bautizado: boolean | null
  readonly fechaBautizo: string | null
  readonly tallaFranela: string | null
  readonly redesSociales: string | null
  readonly representanteId: string | null
  readonly representanteTipo: TipoRepresentante | null
}

export interface PersonaCandidata {
  readonly id: string
  readonly nombre: string
  readonly apellido: string
  readonly fechaNacimiento: string | null
}

export type AltaPersonaResultado =
  | { readonly resultado: 'creada'; readonly personaId: string; readonly nombre: string; readonly servicioId: string }
  | { readonly resultado: 'existente'; readonly personaId: string; readonly nombre: string }
  | { readonly resultado: 'coincidencias'; readonly candidatos: readonly PersonaCandidata[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA = /^\d{4}-\d{2}-\d{2}$/

export const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

function textoOpcional(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

function fechaValida(v: string): boolean {
  if (!FECHA.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/** Validates the POST body. Returns the input, or a Spanish message for the form. */
export function parseAltaPersona(body: unknown): AltaPersonaInput | { readonly error: string } {
  if (!body || typeof body !== 'object') return { error: 'Body inválido' }
  const b = body as Record<string, unknown>

  if (!esUuid(b.equipoId) || !esUuid(b.rolId)) return { error: 'Equipo y rol son requeridos' }
  const nombre = textoOpcional(b.nombre)
  const apellido = textoOpcional(b.apellido)
  if (!nombre || !apellido) return { error: 'Nombre y apellido son requeridos' }
  if (!GENEROS.includes(b.genero as Genero)) return { error: 'Género inválido' }
  if (!ESTADOS_CIVILES.includes(b.estadoCivil as EstadoCivil)) return { error: 'Estado civil inválido' }

  const cedula = prepararCedula(b.cedula)
  const fechaNacimiento = textoOpcional(b.fechaNacimiento)
  if (fechaNacimiento && !fechaValida(fechaNacimiento)) return { error: 'Fecha de nacimiento inválida' }
  if (!cedula && !fechaNacimiento) return { error: 'Sin cédula, la fecha de nacimiento es requerida' }

  const fechaBautizo = textoOpcional(b.fechaBautizo)
  if (fechaBautizo && !fechaValida(fechaBautizo)) return { error: 'Fecha de bautizo inválida' }
  if (b.bautizado !== undefined && b.bautizado !== null && typeof b.bautizado !== 'boolean') {
    return { error: 'Bautizado inválido' }
  }

  const representanteId = b.representanteId == null || b.representanteId === '' ? null : b.representanteId
  if (representanteId !== null && !esUuid(representanteId)) return { error: 'Representante inválido' }
  const representanteTipo = b.representanteTipo == null || b.representanteTipo === '' ? null : b.representanteTipo
  if (representanteTipo !== null && !TIPOS_REPRESENTANTE.includes(representanteTipo as TipoRepresentante)) {
    return { error: 'Tipo de representante inválido' }
  }

  return {
    equipoId: b.equipoId,
    rolId: b.rolId,
    nombre,
    apellido,
    genero: b.genero as Genero,
    estadoCivil: b.estadoCivil as EstadoCivil,
    cedula,
    fechaNacimiento,
    telefono: textoOpcional(b.telefono),
    bautizado: typeof b.bautizado === 'boolean' ? b.bautizado : null,
    fechaBautizo,
    tallaFranela: textoOpcional(b.tallaFranela),
    redesSociales: textoOpcional(b.redesSociales),
    representanteId: representanteId as string | null,
    representanteTipo: representanteTipo as TipoRepresentante | null,
  }
}

/** The RPC's messages (RAISE EXCEPTION '<code>' USING errcode 22023) in the form's words. */
const MENSAJES: Readonly<Record<string, string>> = {
  rol_invalido: 'El rol no pertenece al equipo o está inactivo',
  nombre_y_apellido_requeridos: 'Nombre y apellido son requeridos',
  genero_y_estado_civil_requeridos: 'Género y estado civil son requeridos',
  fecha_nacimiento_requerida_sin_cedula: 'Sin cédula, la fecha de nacimiento es requerida',
  tipo_representante_invalido: 'Tipo de representante inválido',
  representante_no_encontrado: 'Representante no encontrado',
  actor_sin_campus: 'No tienes un campus principal para registrar a la persona',
}

export type RpcFallo =
  | { readonly status: 403; readonly error: string }
  | { readonly status: 422; readonly error: string }
  | { readonly status: 500; readonly error: string }

/** Maps an RPC error to an HTTP answer. Never leaks the SQLSTATE or the detail on a 500. */
export function mapRpcError(error: { code?: string; message?: string }): RpcFallo {
  if (error.code === '42501') return { status: 403, error: 'Permiso denegado' }
  if (error.code === '22023' || error.code === '22007' || error.code === '22008' || error.code === '23514') {
    return { status: 422, error: MENSAJES[error.message ?? ''] ?? 'Datos inválidos' }
  }
  return { status: 500, error: 'Error interno' }
}

interface RpcCandidato {
  id: string
  nombre: string
  apellido: string
  fecha_nacimiento: string | null
}

/** Maps the jsonb the RPC answers to the API shape. */
export function mapResultado(data: unknown): AltaPersonaResultado {
  const d = (data ?? {}) as Record<string, unknown>
  if (d.resultado === 'creada') {
    return { resultado: 'creada', personaId: String(d.persona_id), nombre: String(d.nombre), servicioId: String(d.servicio_id) }
  }
  if (d.resultado === 'existente') {
    return { resultado: 'existente', personaId: String(d.persona_id), nombre: String(d.nombre) }
  }
  if (d.resultado === 'coincidencias') {
    const candidatos = ((d.candidatos ?? []) as RpcCandidato[]).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      apellido: c.apellido,
      fechaNacimiento: c.fecha_nacimiento,
    }))
    return { resultado: 'coincidencias', candidatos }
  }
  throw new Error('dream_team_registrar_persona: unexpected answer')
}

/** The RPC arguments for an input and the actor's selected campus (null: their principal campus). */
export function rpcArgs(input: AltaPersonaInput, campusId: string | null) {
  return {
    p_equipo_id: input.equipoId,
    p_rol_id: input.rolId,
    p_nombre: input.nombre,
    p_apellido: input.apellido,
    p_genero: input.genero,
    p_estado_civil: input.estadoCivil,
    p_cedula: input.cedula ?? undefined,
    p_fecha_nacimiento: input.fechaNacimiento ?? undefined,
    p_telefono: input.telefono ?? undefined,
    p_bautizado: input.bautizado ?? undefined,
    p_fecha_bautizo: input.fechaBautizo ?? undefined,
    p_talla_franela: input.tallaFranela ?? undefined,
    p_redes_sociales: input.redesSociales ?? undefined,
    p_campus_id: campusId ?? undefined,
    p_representante_id: input.representanteId ?? undefined,
    p_representante_tipo: input.representanteTipo ?? undefined,
  }
}

/** The cookie useCampus mirrors the selected campus to (hooks/useCampus.tsx). */
export const CAMPUS_COOKIE = 'gc_campus_activo'

/**
 * Whether the caller may register a NEW person into some equipo (the volunteer
 * coordinator may hold no write capability at all). Fails closed: any error is false.
 */
export async function puedeRegistrarEnAlgunEquipo(supabase: {
  rpc: (fn: 'dream_team_equipos_registrables') => PromiseLike<{ data: unknown; error: unknown }>
}): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('dream_team_equipos_registrables')
    return !error && Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}
