/**
 * What the viewer may do with one servicio: the single rule behind the
 * Servidores menu and drawer and Mi equipo's person panel
 * (components/dream-team/detalle-persona.tsx). Pure; the server checks every
 * action again.
 *
 * Mi equipo grants by role (S11 decision 10 of odd/tasks/sistema-diseno-v2.md):
 * the director does everything; the coordinador registers people, edits
 * fichas and turnos and invites, but does not change the etapa; without
 * permissions there is no action.
 */
import type { FilaServidor } from './servidores-vista'
import { TRANSICIONES_VALIDAS } from './state-machine'
import type { DreamTeamEstado } from './types'

export interface AccionesServicio {
  /** Any action at all; without it there is not even "Ver su equipo". */
  readonly alguna: boolean
  /** The editable servicio, when the viewer may change its stage. */
  readonly servicio: { readonly id: string; readonly version: number } | null
  readonly cambiarEtapa: boolean
  /** The servicio whose shifts the viewer may change; `undefined` when none. */
  readonly turnosDe: string | undefined
  readonly editarFicha: boolean
  readonly invitar: boolean
}

/** The facts of a servicio the rule reads. */
export type DatosAccionesServicio = Pick<
  FilaServidor,
  'editable' | 'servicioId' | 'version' | 'fichaEditable' | 'estado' | 'tieneCuenta'
>

function editaServicio(fila: DatosAccionesServicio): boolean {
  return fila.editable && fila.servicioId !== undefined && fila.version !== undefined
}

export function tieneMenu(fila: DatosAccionesServicio): boolean {
  return editaServicio(fila) || fila.fichaEditable === true
}

export function accionesDeServicio(fila: DatosAccionesServicio): AccionesServicio {
  const servicio = editaServicio(fila) ? { id: fila.servicioId as string, version: fila.version as number } : null
  const editarFicha = fila.fichaEditable === true
  return {
    alguna: tieneMenu(fila),
    servicio,
    cambiarEtapa: servicio !== null && (TRANSICIONES_VALIDAS[fila.estado]?.size ?? 0) > 0,
    // A retired servicio no longer serves, so it has no shifts to change.
    turnosDe: fila.estado === 'retirado' ? undefined : (servicio?.id ?? (editarFicha ? fila.servicioId : undefined)),
    editarFicha,
    // T12: the same people may invite someone without account to sign in.
    invitar: editarFicha && fila.tieneCuenta === false,
  }
}

/** The viewer's role in Mi equipo. */
export type RolMiEquipo = 'director' | 'coordinador' | 'sin_permisos'

export interface PermisosMiEquipo {
  /** "Agregar persona" / registrar a new person. */
  readonly registrar: boolean
  readonly cambiarEtapa: boolean
  readonly editarFicha: boolean
  readonly turnos: boolean
  readonly invitar: boolean
}

const PERMISOS_MI_EQUIPO: Readonly<Record<RolMiEquipo, PermisosMiEquipo>> = {
  director: { registrar: true, cambiarEtapa: true, editarFicha: true, turnos: true, invitar: true },
  coordinador: { registrar: true, cambiarEtapa: false, editarFicha: true, turnos: true, invitar: true },
  sin_permisos: { registrar: false, cambiarEtapa: false, editarFicha: false, turnos: false, invitar: false },
}

export function permisosMiEquipo(rol: RolMiEquipo): PermisosMiEquipo {
  return PERMISOS_MI_EQUIPO[rol]
}

/** A servicio as Mi equipo knows it. */
export interface ServicioMiEquipo {
  readonly origen: 'dream_team' | 'grupos_vida'
  readonly estado: DreamTeamEstado
  readonly servicioId?: string
  readonly version?: number
  readonly tieneCuenta: boolean | null
}

/**
 * Mi equipo's role grants through the same rule as Servidores: the stage
 * follows `cambiarEtapa`, the ficha (and with it shifts and the invite)
 * follows `editarFicha`, never on a retired servicio. A Grupos de Vida
 * servicio is managed in Grupos de Vida, so it is read-only for every role.
 */
export function accionesDeServicioMiEquipo(servicio: ServicioMiEquipo, rol: RolMiEquipo): AccionesServicio {
  const permisos = permisosMiEquipo(rol)
  const dreamTeam = servicio.origen === 'dream_team'
  return accionesDeServicio({
    editable: dreamTeam && permisos.cambiarEtapa,
    fichaEditable: dreamTeam && permisos.editarFicha && servicio.estado !== 'retirado',
    servicioId: servicio.servicioId,
    version: servicio.version,
    estado: servicio.estado,
    tieneCuenta: servicio.tieneCuenta,
  })
}
