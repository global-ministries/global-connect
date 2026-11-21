/**
 * Personas — the rules of «Fusionar personas» (/admin/personas/fusionar;
 * odd/tasks/dream-team-estructura-correcciones.md, T5, S6c).
 *
 * The database does the merge (personas_fusionar,
 * 20261121120000_personas_fusionar.sql) and refuses on its own; this module
 * mirrors the choices for the screen (which ficha stays by default, which
 * cannot stay, the typed confirmation) and maps the RPC answers and errors.
 */
export interface PersonaFusionBuscada {
  readonly id: string
  readonly nombre: string
  readonly apellido: string
  readonly email: string | null
  readonly tieneCuenta: boolean
}

export interface ResumenPersonaFusion {
  readonly id: string
  readonly nombre: string
  readonly apellido: string
  readonly tieneCuenta: boolean
  readonly cedula: string | null
  readonly telefono: string | null
  readonly email: string | null
  readonly fechaRegistro: string | null
  readonly fechaNacimiento: string | null
  readonly campus: string | null
  readonly grupos: number
  readonly servicios: number
  readonly asistencias: number
  readonly asistenciasDps: number
}

export interface ConteoFusion {
  /** "<tabla>.<columna>" as the RPC reports it. */
  readonly clave: string
  readonly etiqueta: string
  readonly movidos: number
  readonly descartados: number
  /** Vigente servicios repeated in the same equipo and rol, closed as retirado. */
  readonly retirados: number
  /**
   * Rows of an append-only ledger (never rewritten) that keep the deleted
   * ficha's id; personas_fusiones maps that id to the survivor.
   */
  readonly conservados: number
}

export interface ResultadoFusion {
  readonly simulado: boolean
  readonly quedaId: string
  readonly seVaId: string
  readonly conteos: readonly ConteoFusion[]
  readonly totalMovidos: number
  readonly totalDescartados: number
  readonly totalConservados: number
  readonly camposCompletados: readonly string[]
}

const MENSAJE_DOS_CUENTAS = 'Las dos fichas tienen cuenta. No se pueden fusionar.'
const MENSAJE_MISMA = 'Elige dos fichas distintas.'
const MENSAJE_GENERICO = 'No se pudo fusionar. No se cambió nada; intenta de nuevo o avisa a soporte.'

export const nombreCompleto = (p: { readonly nombre: string; readonly apellido: string }): string =>
  `${p.nombre} ${p.apellido}`.replace(/\s+/g, ' ').trim()

/**
 * Which ficha stays by default: the one with the account; without accounts,
 * the older one (it has the history). Two accounts, or the same ficha twice,
 * are refused with the message to show.
 */
export function supervivientePorDefecto(
  a: ResumenPersonaFusion,
  b: ResumenPersonaFusion,
): { readonly quedaId: string | null; readonly bloqueo: string | null } {
  if (a.id === b.id) return { quedaId: null, bloqueo: MENSAJE_MISMA }
  if (a.tieneCuenta && b.tieneCuenta) return { quedaId: null, bloqueo: MENSAJE_DOS_CUENTAS }
  if (a.tieneCuenta) return { quedaId: a.id, bloqueo: null }
  if (b.tieneCuenta) return { quedaId: b.id, bloqueo: null }
  const fa = Date.parse(a.fechaRegistro ?? '')
  const fb = Date.parse(b.fechaRegistro ?? '')
  if (!Number.isNaN(fb) && (Number.isNaN(fa) || fb < fa)) return { quedaId: b.id, bloqueo: null }
  return { quedaId: a.id, bloqueo: null }
}

/** Whether `persona` may be the one that stays: never when only the other has the account. */
export function puedeQuedar(persona: ResumenPersonaFusion, otra: ResumenPersonaFusion): boolean {
  if (persona.tieneCuenta && otra.tieneCuenta) return false
  return persona.tieneCuenta || !otra.tieneCuenta
}

const normalizar = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** The typed confirmation: the survivor's full name, ignoring case, accents and extra blanks. */
export function confirmacionValida(escrito: string, queda: { readonly nombre: string; readonly apellido: string }): boolean {
  const esperado = normalizar(nombreCompleto(queda))
  return esperado !== '' && normalizar(escrito) === esperado
}

const MENSAJES: Readonly<Record<string, string>> = {
  sin_autoridad: 'No tienes permiso para fusionar personas.',
  misma_persona: MENSAJE_MISMA,
  persona_no_encontrada: 'Una de las fichas ya no existe. Vuelve a buscarlas.',
  ambas_con_cuenta: MENSAJE_DOS_CUENTAS,
  se_va_tiene_cuenta: 'La ficha con cuenta tiene que ser la que queda.',
  demasiados_ids: 'Elige solo dos fichas.',
  historial_inmutable: 'La ficha que se borra tiene historial que no se puede cambiar. No se cambió nada; avisa a soporte.',
}

/** The RPC error in Spanish. Never shows a database detail. */
export function mensajeErrorFusion(error: { readonly code?: string; readonly message?: string } | null | undefined): string {
  if (!error) return MENSAJE_GENERICO
  if (error.code === '42501') return MENSAJES.sin_autoridad
  if (error.code === '22023' && error.message && MENSAJES[error.message]) return MENSAJES[error.message]
  return MENSAJE_GENERICO
}

export const MENSAJE_ELIGE_DOS = MENSAJE_MISMA

const ETIQUETAS_CONTEO: Readonly<Record<string, string>> = {
  'grupo_miembros.usuario_id': 'Grupos de vida',
  'asistencia.usuario_id': 'Asistencia a grupos',
  'dream_team_servicios.persona_id': 'Servicios en Dream Team',
  'dream_team_capability_grants.persona_id': 'Permisos de Dream Team',
  'usuario_campus.usuario_id': 'Campus',
  'usuario_roles.usuario_id': 'Roles',
  'relaciones_usuarios.usuario1_id': 'Familia',
  'relaciones_usuarios.usuario2_id': 'Familia',
  'relaciones_usuarios.entre_ambas': 'Vínculo familiar entre las dos fichas',
  'dps_asistencias.persona_id': 'Asistencia en DPS',
  'dps_convocados.persona_id': 'Convocatorias de DPS',
  'estudiantes_grupo_miembros.persona_id': 'Grupos de Estudiantes',
  'estudiantes_asistencias.persona_id': 'Asistencia en Estudiantes',
  'taller_asistencias.persona_id': 'Asistencia a talleres',
  'audit_grupo_miembros.usuario_id': 'Historial de grupos',
  'operating_core_participation_eventos.subject_id': 'Historial de participación',
  'operating_core_participation_eventos.actor_persona_id': 'Historial de participación (registrado por esta ficha)',
}

/** A readable name for a "<tabla>.<columna>" count; unknown ones keep the key. */
export function etiquetaConteo(clave: string): string {
  return ETIQUETAS_CONTEO[clave] ?? clave
}

const ETIQUETAS_CAMPO: Readonly<Record<string, string>> = {
  cedula: 'Cédula',
  telefono: 'Teléfono',
  email: 'Email',
  fecha_nacimiento: 'Fecha de nacimiento',
  bautizado: 'Bautizado',
  fecha_bautizo: 'Fecha de bautizo',
  talla_franela: 'Talla de franela',
  redes_sociales: 'Redes sociales',
  foto_perfil_url: 'Foto',
  direccion_id: 'Dirección',
  familia_id: 'Familia',
  ocupacion_id: 'Ocupación',
  profesion_id: 'Profesión',
  estado_civil: 'Estado civil',
  fecha_registro: 'Fecha de registro (la más antigua)',
}

export function etiquetaCampo(campo: string): string {
  return ETIQUETAS_CAMPO[campo] ?? campo
}

const cadena = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)

export function mapBusquedaFusion(data: unknown): PersonaFusionBuscada[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((fila) => {
    const f = (fila ?? {}) as Record<string, unknown>
    if (typeof f.id !== 'string' || typeof f.nombre !== 'string' || typeof f.apellido !== 'string') return []
    return [{ id: f.id, nombre: f.nombre, apellido: f.apellido, email: cadena(f.email), tieneCuenta: f.tiene_cuenta === true }]
  })
}

export function mapResumenFusion(data: unknown): ResumenPersonaFusion[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((fila) => {
    const f = (fila ?? {}) as Record<string, unknown>
    if (typeof f.id !== 'string' || typeof f.nombre !== 'string' || typeof f.apellido !== 'string') return []
    return [{
      id: f.id,
      nombre: f.nombre,
      apellido: f.apellido,
      tieneCuenta: f.tiene_cuenta === true,
      cedula: cadena(f.cedula),
      telefono: cadena(f.telefono),
      email: cadena(f.email),
      fechaRegistro: cadena(f.fecha_registro),
      fechaNacimiento: cadena(f.fecha_nacimiento),
      campus: cadena(f.campus),
      grupos: numero(f.grupos),
      servicios: numero(f.servicios),
      asistencias: numero(f.asistencias),
      asistenciasDps: numero(f.asistencias_dps),
    }]
  })
}

/** Maps the jsonb answer of personas_fusionar; the counts with most rows first. */
export function mapResultadoFusion(data: unknown): ResultadoFusion {
  const d = (data ?? {}) as Record<string, unknown>
  const conteos = Object.entries((d.conteos ?? {}) as Record<string, unknown>)
    .map(([clave, valor]) => {
      const v = (valor ?? {}) as Record<string, unknown>
      return {
        clave,
        etiqueta: etiquetaConteo(clave),
        movidos: numero(v.movidos),
        descartados: numero(v.descartados),
        retirados: numero(v.retirados),
        conservados: numero(v.conservados),
      }
    })
    .sort((a, b) => b.movidos + b.descartados - (a.movidos + a.descartados) || a.clave.localeCompare(b.clave))
  return {
    simulado: d.simulado === true,
    quedaId: String(d.queda_id ?? ''),
    seVaId: String(d.se_va_id ?? ''),
    conteos,
    totalMovidos: numero(d.total_movidos),
    totalDescartados: numero(d.total_descartados),
    totalConservados: numero(d.total_conservados),
    camposCompletados: Array.isArray(d.campos_completados) ? d.campos_completados.filter((c): c is string => typeof c === 'string') : [],
  }
}

