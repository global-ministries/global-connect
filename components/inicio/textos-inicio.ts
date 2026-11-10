/**
 * Copy, routes and date formats of the home (design/home-por-rol, _generar.mjs).
 * Every link goes to a page that already exists; the home adds no new queue.
 */
import {
  ArrowRight,
  Baby,
  CalendarCheck,
  ClipboardList,
  GraduationCap,
  HandHeart,
  House,
  LifeBuoy,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'

import type { TonoEstado } from '@/components/ui/punto-estado'
import { DESTINO_MIS_HIJOS } from '@/lib/auth/destino-mis-hijos'
import type { PasoInicio, TileExplorar, TipoPendiente } from '@/lib/inicio/decidir-secciones'

export const RUTA_TALLERES = '/talleres/explorar'
export const RUTA_PERFIL = '/perfil'
// Próximo Paso is a taller (S4): its enrollment lives with the other talleres.
export const RUTA_PROXIMO_PASO = RUTA_TALLERES
export const RUTA_DREAM_TEAM = '/dream-team'

export const RUTA_REPORTE_SEMANAL = '/grupos-vida/reportes/asistencia-semanal'
export const RUTA_TABLERO_GRUPOS = '/grupos-vida/dashboard-riesgo'
export const RUTA_MI_EQUIPO = '/dream-team/mi-equipo'
/** Anchor of the first «Próximo Paso de tus voluntarios» list. */
export const ID_PROXIMO_PASO_VOLUNTARIOS = 'proximo-paso-voluntarios'

export const rutaGrupo = (grupoId: string) => `/grupos-vida/${grupoId}`
export const rutaAsistenciaGrupo = (grupoId: string) => `/grupos-vida/${grupoId}/asistencia`
export const rutaSaludGrupo = (grupoId: string) => `/grupos-vida/${grupoId}/salud`

export const DESCRIPCION_PROXIMO_PASO =
  'Conoce la visión de Global, cómo funciona la iglesia y dónde puedes crecer. Es el primer paso para todo lo demás.'

export type TextoPendiente = {
  titulo: string
  detalle: string
  estado: string
  tono: TonoEstado
  cta: string
  href: string
  icono: LucideIcon
}

export const PENDIENTES: Record<TipoPendiente, TextoPendiente> = {
  'reportes-sin-cargar': { titulo: 'Reportes de asistencia sin cargar', detalle: 'De los grupos que lideras', estado: 'Atrasado', tono: 'danger', cta: 'Pasar asistencia', href: '/grupos-vida', icono: ClipboardList },
  'lideres-sin-reporte': { titulo: 'Líderes sin reporte', detalle: 'La semana pasada, en lo que diriges', estado: 'Atrasado', tono: 'danger', cta: 'Ver líderes', href: RUTA_REPORTE_SEMANAL, icono: ClipboardList },
  'marcar-proximo-paso': { titulo: 'Marcar Próximo Paso', detalle: 'Voluntarios sin la marca; sin ella no pasan a activos', estado: 'Por marcar', tono: 'warning', cta: 'Marcar abajo', href: `#${ID_PROXIMO_PASO_VOLUNTARIOS}`, icono: UserCheck },
  'solicitudes-grupo': { titulo: 'Solicitudes de grupo', detalle: 'Unirse o cambiarse de grupo', estado: 'Por aprobar', tono: 'warning', cta: 'Revisar', href: '/grupos-vida/solicitudes', icono: UserPlus },
  'casas-por-revisar': { titulo: 'Casas anfitrionas por revisar', detalle: 'Propuestas por líderes', estado: 'Por revisar', tono: 'warning', cta: 'Revisar', href: '/grupos-vida/casas-anfitrionas/revision', icono: House },
  'grupos-sin-casa': { titulo: 'Grupos sin casa anfitriona', detalle: 'Necesitan un lugar para reunirse', estado: 'Sin casa', tono: 'warning', cta: 'Buscar casa', href: '/grupos-vida/casas-anfitrionas/asignar', icono: House },
  'dream-team': { titulo: 'Pendientes de Dream Team', detalle: 'Postulados y servidores de tu área', estado: 'Por revisar', tono: 'warning', cta: 'Ver pendientes', href: '/dream-team/pendientes', icono: Users },
  tickets: { titulo: 'Tickets de soporte', detalle: 'Sin responder', estado: 'Abiertos', tono: 'info', cta: 'Responder', href: '/configuracion/soporte', icono: LifeBuoy },
  'servicios-por-confirmar': { titulo: 'Confirmar tus servicios', detalle: 'Responde en Mis servicios', estado: 'Pendiente', tono: 'warning', cta: 'Ir a Mis servicios', href: '#mis-servicios', icono: CalendarCheck },
}

export type TextoPaso = { titulo: string; pendiente: string; hecho: string; cta: string; href: string }

export const PASOS: Record<PasoInicio['id'], TextoPaso> = {
  'proximo-paso': { titulo: 'Próximo Paso', pendiente: 'El primer taller para conocer la iglesia', hecho: 'Terminado', cta: 'Inscribirme', href: RUTA_PROXIMO_PASO },
  'completar-perfil': { titulo: 'Completar tu perfil', pendiente: 'Faltan tu teléfono o tu fecha de nacimiento', hecho: 'Listo', cta: 'Completar', href: RUTA_PERFIL },
  talleres: { titulo: 'Talleres de crecimiento', pendiente: 'Inscripciones abiertas', hecho: 'Listo', cta: 'Ver talleres', href: RUTA_TALLERES },
  'servir-dream-team': { titulo: 'Servir en Dream Team', pendiente: 'Ya puedes postularte', hecho: 'Listo', cta: 'Ver equipos', href: RUTA_DREAM_TEAM },
}

export type TextoTile = { titulo: string; detalle: string; href: string; icono: LucideIcon }

export const TILES: Record<TileExplorar, TextoTile> = {
  'proximo-paso': { titulo: 'Próximo Paso', detalle: 'Conoce la iglesia', href: RUTA_PROXIMO_PASO, icono: ArrowRight },
  talleres: { titulo: 'Talleres', detalle: 'Inscripciones abiertas', href: RUTA_TALLERES, icono: GraduationCap },
  'grupos-vida': { titulo: 'Grupos de Vida', detalle: 'Busca uno cerca de ti', href: '/grupos-vida', icono: Users },
  'dream-team': { titulo: 'Dream Team', detalle: 'Sirve en un equipo', href: RUTA_DREAM_TEAM, icono: HandHeart },
  ninos: { titulo: 'Niños', detalle: 'Registro y check-in', href: DESTINO_MIS_HIJOS, icono: Baby },
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function partes(fecha: string): { dia: string; numero: number; mes: number } | null {
  const d = new Date(`${fecha}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return { dia: DIAS[d.getUTCDay()], numero: d.getUTCDate(), mes: d.getUTCMonth() }
}

/** `2026-11-09` → «Lunes 9 de noviembre». */
export function fechaLarga(fecha: string): string {
  const p = partes(fecha)
  return p ? `${p.dia} ${p.numero} de ${MESES[p.mes]}` : ''
}

/** `2026-11-12` → «Jueves 12 nov». */
export function fechaCorta(fecha: string): string {
  const p = partes(fecha)
  return p ? `${p.dia} ${p.numero} ${MESES[p.mes].slice(0, 3)}` : ''
}

/** `19:30` → «7:30 pm». */
export function hora12(hora: string): string {
  const [h, m] = hora.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hora
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

export const primerNombre = (nombre: string | null): string => nombre?.trim().split(/\s+/)[0] ?? ''

/** «Ana», «Ana y Luis», «Ana, Luis y Rosa». */
export function listaNombres(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}
