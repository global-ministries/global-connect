import type { Database } from '@/lib/supabase/database.types'

import { accionesDeContacto, type AccionesContacto, type VisorUsuarios } from './contacto'

/**
 * Pure view model behind /users (S13 of odd/tasks/sistema-diseno-v2.md;
 * prototype docs/design-system/prototipos/usuarios/01-lista-escritorio.html).
 * No I/O, no React, in the style of lib/platform/dream-team/servidores-vista.ts.
 *
 * The database owns the scope, the filters, the sort and the pages
 * (listar_usuarios_con_permisos_v2 / obtener_estadisticas_usuarios_con_
 * permisos_v2, 20261030100000). This module owns what the screen does with
 * them: one row per person with the account state and the contact actions of
 * the viewer, the attention metrics that are filters (Nuevos, Sin grupo, Sin
 * cuenta, Sin teléfono), the RPC arguments, the active-filter count, the hero
 * summary and the URL codec (?q, roles, email, tel, grupo, cuenta, nuevos,
 * orden, pagina, persona).
 *
 * The metrics count the caller's whole scope (campus included, no search and
 * no filter), as in the prototype; the list total is the RPC total_count.
 */

// ── Types ────────────────────────────────────────────────────────────────

type ListaV2 = Database['public']['Functions']['listar_usuarios_con_permisos_v2']
type EstadisticasV2 = Database['public']['Functions']['obtener_estadisticas_usuarios_con_permisos_v2']

export type ArgumentosLista = ListaV2['Args']
export type ArgumentosEstadisticas = EstadisticasV2['Args']

/** One row of listar_usuarios_con_permisos_v2 (one per person and role). Nullable as the data really is. */
export interface FilaUsuarioRpc {
  readonly id: string
  readonly nombre: string | null
  readonly apellido: string | null
  readonly email: string | null
  readonly telefono: string | null
  readonly cedula: string | null
  readonly fecha_registro: string | null
  readonly rol_nombre_interno: string | null
  readonly rol_nombre_visible: string | null
  readonly foto_perfil_url: string | null
  readonly total_count: number | null
  readonly puede_ver: boolean | null
  readonly cuenta: string | null
  readonly grupo_id: string | null
  readonly grupo_nombre: string | null
  readonly campus_nombre: string | null
  readonly es_de_mi_grupo: boolean | null
}

/** 'si' account; 'invitada' no account and an open invitation; 'no' neither. */
export type CuentaEstado = 'si' | 'invitada' | 'no'

export type OrdenUsuarios = 'nombre' | 'registro_desc' | 'registro_asc'

export type MetricaUsuariosId = 'nuevos' | 'sinGrupo' | 'sinCuenta' | 'sinTelefono'

export type TonoUsuarios = 'success' | 'warning' | 'info' | 'danger' | 'muted'

export interface PersonaUsuario {
  readonly id: string
  readonly nombre: string
  readonly apellido: string
  readonly nombreCompleto: string
  readonly email: string | null
  readonly telefono: string | null
  readonly cedula: string | null
  readonly fechaRegistro: string | null
  /** System roles, highest first. */
  readonly roles: readonly string[]
  readonly fotoUrl: string | null
  readonly cuenta: CuentaEstado
  readonly grupoId: string | null
  readonly grupoNombre: string | null
  readonly campusNombre: string | null
  readonly esDeMiGrupo: boolean
}

export interface FilaVistaUsuario extends PersonaUsuario {
  readonly iniciales: string
  readonly cuentaEtiqueta: string
  readonly cuentaTono: TonoUsuarios
  /** "Líder", "Pastor · Líder", or "Sin rol" (neutral tags, not a status). */
  readonly rolesEtiqueta: string
  /** "<grupo> · <campus>", either part optional. */
  readonly detalle: string
  readonly contacto: AccionesContacto
}

export interface EstadisticasUsuarios {
  readonly total: number
  readonly conEmail: number
  readonly conTelefono: number
  readonly registradosHoy: number
  readonly nuevos7d: number
  readonly sinGrupo: number
  readonly sinCuenta: number
  readonly sinTelefono: number
  /** The sinCuenta people with an open invitation. */
  readonly invitadas: number
}

/** Structurally a MetricaAtencion (components/ui/metricas-atencion). */
export interface MetricaUsuarios {
  readonly id: MetricaUsuariosId
  readonly etiqueta: string
  readonly valor: number
  readonly total: number
  readonly pista: string
  readonly tono: TonoUsuarios
  readonly activa: boolean
}

export interface FiltrosUsuarios {
  readonly q: string
  readonly roles: readonly string[]
  readonly conEmail: boolean | null
  readonly conTelefono: boolean | null
  readonly enGrupo: boolean | null
  readonly conCuenta: boolean | null
  /** Registered in the last NUEVOS_DIAS days. */
  readonly nuevos: boolean
  readonly orden: OrdenUsuarios
  /** 1-based. */
  readonly pagina: number
  /** The person whose panel is open. */
  readonly persona: string | null
}

// ── Constants ────────────────────────────────────────────────────────────

export const NUEVOS_DIAS = 7

export const ROLES_SISTEMA = ['admin', 'pastor', 'director-general', 'director-etapa', 'lider', 'miembro'] as const

export const ETIQUETA_ROL: Readonly<Record<string, string>> = {
  admin: 'Administrador',
  pastor: 'Pastor',
  'director-general': 'Director general',
  'director-etapa': 'Director de etapa',
  lider: 'Líder',
  miembro: 'Miembro',
}

export const ETIQUETA_CUENTA: Readonly<Record<CuentaEstado, { readonly etiqueta: string; readonly tono: TonoUsuarios }>> = {
  si: { etiqueta: 'Con cuenta', tono: 'success' },
  invitada: { etiqueta: 'Invitación enviada', tono: 'info' },
  no: { etiqueta: 'Sin cuenta', tono: 'warning' },
}

export const ORDENES: readonly OrdenUsuarios[] = ['nombre', 'registro_desc', 'registro_asc']

export const ETIQUETA_ORDEN: Readonly<Record<OrdenUsuarios, string>> = {
  nombre: 'Nombre',
  registro_desc: 'Más recientes',
  registro_asc: 'Más antiguos',
}

export const FILTROS_INICIALES: FiltrosUsuarios = {
  q: '',
  roles: [],
  conEmail: null,
  conTelefono: null,
  enGrupo: null,
  conCuenta: null,
  nuevos: false,
  orden: 'nombre',
  pagina: 1,
  persona: null,
}

/** "Limpiar" in the filter sheet: every sheet filter back to its default. */
export const LIMPIAR_FILTROS: Partial<FiltrosUsuarios> = {
  roles: [],
  conEmail: null,
  conTelefono: null,
  enGrupo: null,
  conCuenta: null,
  nuevos: false,
  pagina: 1,
}

// ── Rows ─────────────────────────────────────────────────────────────────

const RANGO_ROL: Readonly<Record<string, number>> = Object.fromEntries(ROLES_SISTEMA.map((rol, i) => [rol, i]))
const rango = (rol: string) => RANGO_ROL[rol] ?? ROLES_SISTEMA.length

function esCuenta(valor: string | null): valor is CuentaEstado {
  return valor === 'si' || valor === 'invitada' || valor === 'no'
}

/** One person per id, in the RPC order (first appearance); roles merged, highest first. */
export function aPersonas(filas: readonly FilaUsuarioRpc[]): PersonaUsuario[] {
  const porId = new Map<string, { persona: PersonaUsuario; roles: Set<string> }>()
  for (const fila of filas) {
    const existente = porId.get(fila.id)
    if (existente) {
      if (fila.rol_nombre_interno) existente.roles.add(fila.rol_nombre_interno)
      continue
    }
    const nombre = fila.nombre ?? ''
    const apellido = fila.apellido ?? ''
    porId.set(fila.id, {
      roles: new Set(fila.rol_nombre_interno ? [fila.rol_nombre_interno] : []),
      persona: {
        id: fila.id,
        nombre,
        apellido,
        nombreCompleto: `${nombre} ${apellido}`.trim(),
        email: fila.email || null,
        telefono: fila.telefono || null,
        cedula: fila.cedula || null,
        fechaRegistro: fila.fecha_registro,
        roles: [],
        fotoUrl: fila.foto_perfil_url || null,
        cuenta: esCuenta(fila.cuenta) ? fila.cuenta : 'no',
        grupoId: fila.grupo_id,
        grupoNombre: fila.grupo_nombre || null,
        campusNombre: fila.campus_nombre || null,
        esDeMiGrupo: fila.es_de_mi_grupo === true,
      },
    })
  }
  return [...porId.values()].map(({ persona, roles }) => ({
    ...persona,
    roles: [...roles].sort((a, b) => rango(a) - rango(b)),
  }))
}

function iniciales(persona: PersonaUsuario): string {
  return [persona.nombre, persona.apellido]
    .map((parte) => parte.trim().charAt(0))
    .join('')
    .toLocaleUpperCase('es')
}

export function filasDeVista(personas: readonly PersonaUsuario[], visor: VisorUsuarios): FilaVistaUsuario[] {
  return personas.map((persona) => ({
    ...persona,
    iniciales: iniciales(persona),
    cuentaEtiqueta: ETIQUETA_CUENTA[persona.cuenta].etiqueta,
    cuentaTono: ETIQUETA_CUENTA[persona.cuenta].tono,
    rolesEtiqueta: persona.roles.length === 0 ? 'Sin rol' : persona.roles.map((r) => ETIQUETA_ROL[r] ?? r).join(' · '),
    detalle: [persona.grupoNombre, persona.campusNombre].filter(Boolean).join(' · '),
    contacto: accionesDeContacto(visor, persona),
  }))
}

// ── Metrics ──────────────────────────────────────────────────────────────

type FilaEstadisticas = Partial<EstadisticasV2['Returns'][number]>

const n = (v: number | null | undefined) => Number(v ?? 0) || 0

export function aEstadisticas(fila: FilaEstadisticas | null | undefined): EstadisticasUsuarios {
  return {
    total: n(fila?.total_usuarios),
    conEmail: n(fila?.con_email),
    conTelefono: n(fila?.con_telefono),
    registradosHoy: n(fila?.registrados_hoy),
    nuevos7d: n(fila?.nuevos_7d),
    sinGrupo: n(fila?.sin_grupo),
    sinCuenta: n(fila?.sin_cuenta),
    sinTelefono: n(fila?.sin_telefono),
    invitadas: n(fila?.invitadas),
  }
}

export function metricaActiva(filtros: FiltrosUsuarios, id: MetricaUsuariosId): boolean {
  switch (id) {
    case 'nuevos':
      return filtros.nuevos
    case 'sinGrupo':
      return filtros.enGrupo === false
    case 'sinCuenta':
      return filtros.conCuenta === false
    case 'sinTelefono':
      return filtros.conTelefono === false
  }
}

export function metricasAtencion(stats: EstadisticasUsuarios, filtros: FiltrosUsuarios): MetricaUsuarios[] {
  const metrica = (id: MetricaUsuariosId, etiqueta: string, valor: number, pista: string, tono: TonoUsuarios): MetricaUsuarios => ({
    id, etiqueta, valor, total: stats.total, pista, tono, activa: metricaActiva(filtros, id),
  })
  return [
    metrica('nuevos', 'Nuevos', stats.nuevos7d, `se registraron en los últimos ${NUEVOS_DIAS} días`, 'success'),
    metrica('sinGrupo', 'Sin grupo', stats.sinGrupo, 'no están en un Grupo de Vida', 'info'),
    metrica(
      'sinCuenta',
      'Sin cuenta',
      stats.sinCuenta,
      stats.invitadas > 0 ? `${stats.invitadas} con invitación enviada` : 'no entran a la plataforma',
      'warning',
    ),
    metrica('sinTelefono', 'Sin teléfono', stats.sinTelefono, 'no se les puede escribir', 'danger'),
  ]
}

/** Pressing a metric toggles its filter (pressing it again removes it) and goes back to page 1. */
export function parcheMetrica(filtros: FiltrosUsuarios, id: MetricaUsuariosId): Partial<FiltrosUsuarios> {
  const activa = metricaActiva(filtros, id)
  switch (id) {
    case 'nuevos':
      return { nuevos: !activa, pagina: 1 }
    case 'sinGrupo':
      return { enGrupo: activa ? null : false, pagina: 1 }
    case 'sinCuenta':
      return { conCuenta: activa ? null : false, pagina: 1 }
    case 'sinTelefono':
      return { conTelefono: activa ? null : false, pagina: 1 }
  }
}

const plural = (cantidad: number, uno: string, varios: string) => `${cantidad.toLocaleString('es-VE')} ${cantidad === 1 ? uno : varios}`

/** The hero line under "Usuarios": the real totals of the scope. */
export function resumenTotales(stats: EstadisticasUsuarios): string {
  return [
    plural(stats.total, 'persona', 'personas'),
    `${(stats.total - stats.sinCuenta).toLocaleString('es-VE')} con cuenta`,
    `${(stats.total - stats.sinGrupo).toLocaleString('es-VE')} en un Grupo de Vida`,
  ].join(' · ')
}

/** Sheet filters in use (each role counts); not the search, sort, page or open person. */
export function contarFiltrosActivos(filtros: FiltrosUsuarios): number {
  return (
    filtros.roles.length +
    [filtros.conEmail, filtros.conTelefono, filtros.enGrupo, filtros.conCuenta].filter((v) => v !== null).length +
    (filtros.nuevos ? 1 : 0)
  )
}

export function totalPaginas(total: number, limite: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, limite)))
}

// ── RPC arguments ────────────────────────────────────────────────────────

export interface ContextoLista {
  /** The session user's auth id. */
  readonly authId: string
  /** The header campus, or null for every campus the caller may see. */
  readonly campusId: string | null
  readonly limite: number
}

/** listar_usuarios_con_permisos_v2 arguments; unset filters are left to the database defaults. */
export function argumentosLista(filtros: FiltrosUsuarios, contexto: ContextoLista): ArgumentosLista {
  return {
    p_auth_id: contexto.authId,
    p_busqueda: filtros.q.trim(),
    ...(filtros.roles.length > 0 ? { p_roles_filtro: [...filtros.roles] } : {}),
    ...(filtros.conEmail !== null ? { p_con_email: filtros.conEmail } : {}),
    ...(filtros.conTelefono !== null ? { p_con_telefono: filtros.conTelefono } : {}),
    ...(filtros.enGrupo !== null ? { p_en_grupo: filtros.enGrupo } : {}),
    ...(filtros.conCuenta !== null ? { p_con_cuenta: filtros.conCuenta } : {}),
    ...(filtros.nuevos ? { p_nuevos_dias: NUEVOS_DIAS } : {}),
    p_orden: filtros.orden,
    p_limite: contexto.limite,
    p_offset: (Math.max(1, filtros.pagina) - 1) * contexto.limite,
    ...(contexto.campusId ? { p_campus_id: contexto.campusId } : {}),
  }
}

/** The metrics and the hero count the caller's whole scope: only the campus narrows them. */
export function argumentosEstadisticas(contexto: Omit<ContextoLista, 'limite'>): ArgumentosEstadisticas {
  return {
    p_auth_id: contexto.authId,
    ...(contexto.campusId ? { p_campus_id: contexto.campusId } : {}),
  }
}

// ── URL codec ────────────────────────────────────────────────────────────

/** `URLSearchParams`, Next's `ReadonlyURLSearchParams`, or the plain record a page receives. */
export type ParametrosDeUrl =
  | { get(nombre: string): string | null }
  | Readonly<Record<string, string | readonly string[] | undefined>>

function leer(parametros: ParametrosDeUrl, nombre: string): string | null {
  if (typeof (parametros as { get?: unknown }).get === 'function') {
    return (parametros as { get(n: string): string | null }).get(nombre)
  }
  const valor = (parametros as Readonly<Record<string, string | readonly string[] | undefined>>)[nombre]
  if (Array.isArray(valor)) return valor[0] ?? null
  return typeof valor === 'string' ? valor : null
}

function leerBooleano(valor: string | null): boolean | null {
  if (valor === '1') return true
  if (valor === '0') return false
  return null
}

const escribirBooleano = (valor: boolean) => (valor ? '1' : '0')

function leerRoles(valor: string | null): string[] {
  if (!valor) return []
  const validos = new Set<string>(ROLES_SISTEMA)
  return [...new Set(valor.split(',').map((r) => r.trim()).filter((r) => validos.has(r)))]
}

function leerPagina(valor: string | null): number {
  const pagina = Number(valor)
  return Number.isInteger(pagina) && pagina >= 1 ? pagina : 1
}

/** Reads the list state from the URL; invalid values fall back to the defaults. */
export function leerFiltrosDeUrl(parametros: ParametrosDeUrl): FiltrosUsuarios {
  const orden = leer(parametros, 'orden')
  const persona = leer(parametros, 'persona')?.trim()
  return {
    q: leer(parametros, 'q')?.trim() ?? '',
    roles: leerRoles(leer(parametros, 'roles')),
    conEmail: leerBooleano(leer(parametros, 'email')),
    conTelefono: leerBooleano(leer(parametros, 'tel')),
    enGrupo: leerBooleano(leer(parametros, 'grupo')),
    conCuenta: leerBooleano(leer(parametros, 'cuenta')),
    nuevos: leer(parametros, 'nuevos') === '1',
    orden: (ORDENES as readonly (string | null)[]).includes(orden) ? (orden as OrdenUsuarios) : FILTROS_INICIALES.orden,
    pagina: leerPagina(leer(parametros, 'pagina')),
    persona: persona ? persona : null,
  }
}

/** The query string (without `?`); defaults are left out. */
export function escribirFiltrosEnUrl(filtros: FiltrosUsuarios): string {
  const parametros = new URLSearchParams()
  if (filtros.q.trim() !== '') parametros.set('q', filtros.q.trim())
  if (filtros.roles.length > 0) parametros.set('roles', filtros.roles.join(','))
  if (filtros.conEmail !== null) parametros.set('email', escribirBooleano(filtros.conEmail))
  if (filtros.conTelefono !== null) parametros.set('tel', escribirBooleano(filtros.conTelefono))
  if (filtros.enGrupo !== null) parametros.set('grupo', escribirBooleano(filtros.enGrupo))
  if (filtros.conCuenta !== null) parametros.set('cuenta', escribirBooleano(filtros.conCuenta))
  if (filtros.nuevos) parametros.set('nuevos', '1')
  if (filtros.orden !== FILTROS_INICIALES.orden) parametros.set('orden', filtros.orden)
  if (filtros.pagina > 1) parametros.set('pagina', String(filtros.pagina))
  if (filtros.persona) parametros.set('persona', filtros.persona)
  return parametros.toString()
}
