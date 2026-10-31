import { accionesDeContacto, contactoPermitido as permiteContacto, motivoContacto, telefonoPorRevisar, type VisorUsuarios } from './contacto'
import type { TipoAsistencia } from './asistencia-persona'
import { ETIQUETA_ROL, type CuentaEstado } from './lista-vista'

export { telefonoPorRevisar }

/**
 * Pure view model of the ficha /users/[id] (S13 of
 * odd/tasks/sistema-diseno-v2.md; prototype
 * docs/design-system/prototipos/usuarios/03-ficha-escritorio.html and
 * 04-ficha-celular.html). No I/O.
 *
 * The tab lives in ?tab= (Datos drops it); the Asistencia range in ?desde= and
 * ?hasta=. Contact follows ./contacto (S13 decision 6); Editar follows
 * puede_editar_usuario; password and role changes stay with admin, as on the
 * edit page and the list.
 */

export type TabFicha = 'datos' | 'familia' | 'grupos' | 'asistencia' | 'servicio' | 'cuenta'

export const TABS_FICHA: readonly { readonly id: TabFicha; readonly etiqueta: string }[] = [
  { id: 'datos', etiqueta: 'Datos' },
  { id: 'familia', etiqueta: 'Familia' },
  { id: 'grupos', etiqueta: 'Grupos' },
  { id: 'asistencia', etiqueta: 'Asistencia' },
  { id: 'servicio', etiqueta: 'Servicio' },
  { id: 'cuenta', etiqueta: 'Cuenta' },
]

export function leerTab(valor: string | null | undefined): TabFicha {
  return TABS_FICHA.find((t) => t.id === valor)?.id ?? 'datos'
}

function consulta(actual: string, cambios: Readonly<Record<string, string>>): string {
  const params = new URLSearchParams(actual)
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor) params.set(clave, valor)
    else params.delete(clave)
  }
  const texto = params.toString()
  return texto ? `?${texto}` : ''
}

/** The query string with the tab; the other params stay. */
export function consultaConTab(actual: string, tab: TabFicha): string {
  return consulta(actual, { tab: tab === 'datos' ? '' : tab })
}

/** The query string with the Asistencia range ('' removes a bound). */
export function consultaConRango(actual: string, desde: string, hasta: string): string {
  return consulta(actual, { desde, hasta })
}

type Parametro = string | readonly string[] | undefined

const primero = (v: Parametro): string | undefined => (typeof v === 'string' ? v : v?.[0])

function fechaIso(v: Parametro): string | undefined {
  const texto = primero(v)
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return undefined
  const d = new Date(`${texto}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto ? texto : undefined
}

/** ?desde= / ?hasta= as ISO dates; invalid values are dropped (the RPC defaults to 12 months). */
export function leerRango(params: Readonly<Record<string, Parametro>>): { desde?: string; hasta?: string } {
  const desde = fechaIso(params.desde)
  const hasta = fechaIso(params.hasta)
  return { ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) }
}

export interface PersonaFichaContacto {
  readonly id: string
  readonly email: string | null
  readonly telefono: string | null
  /** A current member of an active group the viewer leads. */
  readonly esDeMiGrupo: boolean
}

export interface AccionesFicha {
  /** The viewer may call and WhatsApp this person (role rule, phone aside). */
  readonly contactoPermitido: boolean
  readonly llamar: string | null
  readonly whatsapp: string | null
  readonly email: string | null
  readonly editar: boolean
  /** Why a contact button is disabled, or null. */
  readonly motivo: string | null
}

export function accionesFicha(visor: VisorUsuarios, persona: PersonaFichaContacto, puedeEditar: boolean): AccionesFicha {
  const contactoPermitido = permiteContacto(visor, persona)
  const { llamar, whatsapp } = accionesDeContacto(visor, persona)
  const email = persona.email ? `mailto:${persona.email}` : null
  return {
    contactoPermitido,
    llamar,
    whatsapp,
    email,
    editar: puedeEditar,
    motivo: motivoContacto({ permitido: contactoPermitido, telefono: persona.telefono, whatsapp, email: persona.email }),
  }
}

export interface AvisoFicha {
  readonly id: 'telefono' | 'cuenta' | 'grupo'
  readonly tono: 'warning' | 'info'
  readonly titulo: string
  readonly texto: string
}

export interface EntradaAvisos {
  readonly telefono: string | null
  /** null when unknown (the viewer cannot see it). */
  readonly cuenta: CuentaEstado | null
  /** null when unknown. */
  readonly tieneGrupo: boolean | null
}

export function avisosFicha({ telefono, cuenta, tieneGrupo }: EntradaAvisos): AvisoFicha[] {
  const avisos: AvisoFicha[] = []
  if (telefonoPorRevisar(telefono)) {
    avisos.push({
      id: 'telefono',
      tono: 'warning',
      titulo: 'Revisar teléfono',
      texto: `«${telefono}» no parece un número válido, así que WhatsApp no funciona.`,
    })
  }
  if (cuenta === 'no' || cuenta === 'invitada') {
    avisos.push({
      id: 'cuenta',
      tono: 'warning',
      titulo: cuenta === 'invitada' ? 'Invitación enviada, todavía sin cuenta' : 'No tiene cuenta en la plataforma',
      texto: 'No ve sus grupos ni recibe recordatorios.',
    })
  }
  if (tieneGrupo === false) {
    avisos.push({
      id: 'grupo',
      tono: 'info',
      titulo: 'No está en un Grupo de Vida',
      texto: 'Conéctalo con un grupo cerca de su casa desde Grupos de Vida.',
    })
  }
  return avisos
}

/** Highest first, so a person with two roles shows the broader one. */
const ORDEN_ROLES = ['admin', 'pastor', 'director-general', 'director-etapa', 'lider', 'miembro']

/** obtener_detalle_usuario returns nombre_interno strings; older payloads carried objects. */
export function rolPrincipal(roles: unknown): { interno: string; etiqueta: string } {
  const lista = (Array.isArray(roles) ? roles : [])
    .map((r) => {
      if (typeof r === 'string') return { interno: r, etiqueta: ETIQUETA_ROL[r] ?? r }
      const o = (r ?? {}) as { nombre_interno?: unknown; nombre_visible?: unknown }
      if (typeof o.nombre_interno !== 'string') return null
      const visible = typeof o.nombre_visible === 'string' ? o.nombre_visible : null
      return { interno: o.nombre_interno, etiqueta: visible ?? ETIQUETA_ROL[o.nombre_interno] ?? o.nombre_interno }
    })
    .filter((r): r is { interno: string; etiqueta: string } => r !== null)
  if (lista.length === 0) return { interno: 'sin-rol', etiqueta: 'Sin rol' }
  const rango = (r: { interno: string }) => {
    const i = ORDEN_ROLES.indexOf(r.interno)
    return i === -1 ? ORDEN_ROLES.length : i
  }
  return [...lista].sort((a, b) => rango(a) - rango(b))[0]
}

/** What each system role may do (Cuenta tab, "Rol y permisos"). */
export const PERMISOS_ROL: Readonly<Record<string, string>> = {
  miembro: 'Ve su ficha y la de su familia.',
  lider: 'Ve y edita a las personas de los grupos que lidera.',
  'director-etapa': 'Ve a todas las personas del campus; edita a las de los grupos de su etapa.',
  'director-general': 'Ve a todas las personas del campus; edita a las de los grupos de su alcance.',
  pastor: 'Ve y edita a todas las personas de su campus.',
  admin: 'Ve y edita a todas las personas de todos los campus y cambia roles.',
}

/** "Asignar contraseña" and the role change: admin only (the API checks it again). */
export function puedeAdministrarCuenta(rolesVisor: readonly string[]): boolean {
  return rolesVisor.includes('admin')
}

/** The leader callout: where the group's own attendance lives. */
export function enlaceAsistenciaGrupo(grupo: { readonly tipo: TipoAsistencia; readonly id: string; readonly nombre: string }): string {
  if (grupo.tipo === 'gdv') return `/grupos-vida/${encodeURIComponent(grupo.id)}/asistencia`
  return `/estudiantes/grupos?${new URLSearchParams({ q: grupo.nombre }).toString()}`
}
