/**
 * Dream Team — «Cambiar rol» (odd/tasks/dream-team-cambiar-rol.md, T1, S1–S3):
 * change the rol of a servicio inside its own equipo, at once, for the same
 * people who open «Cambiar de área» (director or coordinator authority over
 * the equipo). Without director authority one cannot change one's own rol,
 * the rol of a coordinator or a director (T2, S6: 'rol_superior') nor assign
 * a director-level one.
 *
 * The database is the one authority (20261125100000, 20261125110000):
 * dream_team_servicio_roles_cambiables lists the roles of the equipo with
 * `actual` and `asignable`, dream_team_servicio_cambiar_rol applies the change
 * (history, verificaciones and grants included). This module validates the
 * body, maps the rows and turns the database codes into plain Spanish.
 */
import { esUuid } from './alta-persona'
import { NOTA_CAMBIO_AREA_MAX } from './cambiar-area'
import { esNivelRol } from './nivel-rol'
import type { DreamTeamNivelRol } from './types'

/** The nota of a rol change has the limit of a change of área. */
export const NOTA_CAMBIO_ROL_MAX = NOTA_CAMBIO_AREA_MAX

export interface RolCambiable {
  readonly id: string
  readonly label: string
  readonly nivel: DreamTeamNivelRol
  /** The servicio's current rol. */
  readonly actual: boolean
  /** The caller may pick it (active, not the current one, allowed for their authority, not already held). */
  readonly asignable: boolean
}

/** The rows of dream_team_servicio_roles_cambiables. */
export function mapRolesCambiables(data: unknown): RolCambiable[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((fila): RolCambiable[] => {
    const f = fila as Record<string, unknown> | null
    if (typeof f?.id !== 'string' || typeof f.label !== 'string') return []
    return [
      {
        id: f.id,
        label: f.label,
        nivel: esNivelRol(f.nivel) ? f.nivel : 'voluntario',
        actual: f.actual === true,
        asignable: f.asignable === true,
      },
    ]
  })
}

export interface CuerpoCambioRol {
  readonly rolId: string
  readonly nota: string | null
}

/** Validates POST /api/dream-team/servicios/[id]/cambiar-rol. */
export function parseCambioRol(body: unknown): { readonly datos: CuerpoCambioRol } | { readonly error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  if (!esUuid(b.rolId)) return { error: 'Elige el rol nuevo.' }
  if (b.nota !== undefined && b.nota !== null && typeof b.nota !== 'string') return { error: 'Nota inválida' }
  const nota = typeof b.nota === 'string' ? b.nota.trim() : ''
  if (nota.length > NOTA_CAMBIO_ROL_MAX) return { error: `La nota admite hasta ${NOTA_CAMBIO_ROL_MAX} caracteres.` }
  return { datos: { rolId: b.rolId, nota: nota || null } }
}

/** The codes the cambiar-rol functions raise, in plain Spanish. */
export const MENSAJES_CAMBIO_ROL = {
  sin_autoridad: 'No tienes permiso para cambiar roles en esta área.',
  rol_direccion: 'Solo la dirección del área puede asignar un rol de dirección.',
  propio_servicio: 'No puedes cambiar tu propio rol. Pídeselo a la dirección del área.',
  rol_superior: 'Solo la dirección del área puede cambiar el rol de un coordinador o de un director.',
  servicio_inexistente: 'Este servicio ya no existe. Actualiza la página.',
  servicio_retirado: 'Este servicio está retirado; no se le puede cambiar el rol.',
  rol_invalido: 'Elige un rol activo de esta misma área.',
  mismo_rol: 'Ese ya es su rol. Elige otro.',
  rol_duplicado: 'Esta persona ya tiene ese rol en esta área.',
} as const

type CodigoCambioRol = keyof typeof MENSAJES_CAMBIO_ROL

const esCodigo = (valor: unknown): valor is CodigoCambioRol =>
  typeof valor === 'string' && Object.prototype.hasOwnProperty.call(MENSAJES_CAMBIO_ROL, valor)

/**
 * An RPC error as an HTTP answer: 42501 → 403 and 22023 → 422 with the
 * Spanish text of the code (any other 42501, such as a missing EXECUTE, is a
 * plain refusal); anything else is a 500 without detail.
 */
export function mapCambioRolError(error: { code?: string; message?: string }): {
  readonly status: 403 | 422 | 500
  readonly error: string
} {
  const codigo = esCodigo(error.message) ? error.message : null
  if (error.code === '42501') return { status: 403, error: MENSAJES_CAMBIO_ROL[codigo ?? 'sin_autoridad'] }
  if (error.code === '22023') {
    return { status: 422, error: codigo ? MENSAJES_CAMBIO_ROL[codigo] : 'No se pudo cambiar el rol. Revisa los datos.' }
  }
  return { status: 500, error: 'Error interno' }
}
