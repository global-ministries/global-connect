import { enlaceWhatsapp, normalizarTelefono } from '@/lib/utils/telefono'

/**
 * Who may call or WhatsApp a person from Usuarios (S13 decision 6 of
 * odd/tasks/sistema-diseno-v2.md). Pure; the screen hides what this denies.
 *
 * - admin, pastor, director general and director de etapa see a whole campus
 *   in the list (listar_usuarios_con_permisos_v2), so they may contact anybody
 *   it returns.
 * - A leader may contact only the people of their own active Grupo de Vida
 *   (`esDeMiGrupo`, computed by the RPC). This widens the actions, not who is
 *   listed: the leader already lists the members of their groups.
 * - A miembro contacts nobody from the list.
 * - Nobody gets an action on their own row or for a person without a number.
 */

/** Roles that list a whole campus. */
const ROLES_DE_CAMPUS: readonly string[] = ['admin', 'pastor', 'director-general', 'director-etapa']

export interface VisorUsuarios {
  /** System roles of the viewer (roles_sistema.nombre_interno). */
  readonly roles: readonly string[]
  /** The viewer's usuarios.id, when known. */
  readonly usuarioId: string | null
}

export interface PersonaContactable {
  readonly id: string
  readonly telefono: string | null
  /** A current member of an active group the viewer leads (RPC es_de_mi_grupo). */
  readonly esDeMiGrupo: boolean
}

export interface AccionesContacto {
  /** `tel:` link, or null. */
  readonly llamar: string | null
  /** `https://wa.me/…` link for a Venezuelan mobile, or null. */
  readonly whatsapp: string | null
}

const SIN_ACCIONES: AccionesContacto = { llamar: null, whatsapp: null }

export function puedeContactar(visor: VisorUsuarios, persona: PersonaContactable): boolean {
  if (!persona.telefono || persona.telefono.trim() === '') return false
  if (visor.usuarioId !== null && visor.usuarioId === persona.id) return false
  if (visor.roles.some((rol) => ROLES_DE_CAMPUS.includes(rol))) return true
  return visor.roles.includes('lider') && persona.esDeMiGrupo
}

export function accionesDeContacto(visor: VisorUsuarios, persona: PersonaContactable): AccionesContacto {
  if (!puedeContactar(visor, persona)) return SIN_ACCIONES
  const telefono = persona.telefono as string
  const canonico = normalizarTelefono(telefono) ?? telefono
  return {
    llamar: `tel:${canonico.replace(/[^\d+]/g, '')}`,
    whatsapp: enlaceWhatsapp(telefono),
  }
}
