/**
 * DPS planning — the lists by position (odd/tasks/dps-asistencia-pco.md,
 * T14b; S12.2, S12.3; L56, L57): who may be picked in the Productor, Host,
 * Comunicador and Cantantes columns of the programming sheet.
 * Productores, hosts and comunicadores are kept in Configuración › Listas
 * (dps_lista_agregar / dps_lista_quitar); Cantantes are the people serving
 * in the «Cantantes» sub-equipo of Global Music, managed in Dream Team. The
 * database says who edits each list (dps_lista_puede_editar, in
 * supabase/migrations/20261109200000_dps_listas_posicion.sql); these
 * helpers read dps_lista_leer. Pure: safe on the client.
 */
import { leerPersonasBuscadas, type PersonaBuscada } from './personas'
import type { ColumnaPersona } from './programacion'

export type ListaDps = 'productores' | 'hosts' | 'comunicadores' | 'cantantes'

export interface DefListaDps {
  readonly id: ListaDps
  readonly etiqueta: string
  /** The column of the sheet it feeds. */
  readonly columna: ColumnaPersona
  /** Who keeps it, as the screen says it. */
  readonly quienEdita: string
}

export const LISTAS_DPS: readonly DefListaDps[] = [
  { id: 'productores', etiqueta: 'Productores', columna: 'productor', quienEdita: 'La arman la dirección de DPS y la de Producción Creativa.' },
  { id: 'hosts', etiqueta: 'Hosts', columna: 'host', quienEdita: 'La arma la dirección de DPS.' },
  {
    id: 'comunicadores',
    etiqueta: 'Comunicadores',
    columna: 'comunicador',
    quienEdita: 'La arma la dirección de DPS. Un comunicador no tiene que servir en DPS.',
  },
  { id: 'cantantes', etiqueta: 'Cantantes', columna: 'cantantes', quienEdita: 'Se gestionan en Dream Team › Global Music › Cantantes: son quienes sirven ahí.' },
]

export const LISTA_DE_COLUMNA: Readonly<Record<ColumnaPersona, ListaDps>> = {
  productor: 'productores',
  host: 'hosts',
  comunicador: 'comunicadores',
  cantantes: 'cantantes',
}

export interface ListaPersonasDps {
  readonly lista: ListaDps
  /** dps_lista_puede_editar for the caller (never for Cantantes). */
  readonly puedeEditar: boolean
  readonly personas: readonly PersonaBuscada[]
}

export type ListasDps = Readonly<Record<ListaDps, ListaPersonasDps>>

export const esListaDps = (v: unknown): v is ListaDps => LISTAS_DPS.some((l) => l.id === v)

/** Reads dps_lista_leer; null for an unknown list or a bad answer. */
export function leerListaDps(data: unknown): ListaPersonasDps | null {
  const d = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null
  if (!d || !esListaDps(d.lista)) return null
  // dps_lista_leer names the id persona_id and the whole name nombre.
  const filas = (Array.isArray(d.personas) ? d.personas : []).map((p) => (p && typeof p === 'object' ? { ...p, id: (p as Record<string, unknown>).persona_id } : p))
  const personas = leerPersonasBuscadas(filas)
  return { lista: d.lista, puedeEditar: d.puede_editar === true, personas }
}

/** The four lists, empty and read-only (a failed read, or before loading). */
export function listasVacias(): Record<ListaDps, ListaPersonasDps> {
  const vacia = (lista: ListaDps): ListaPersonasDps => ({ lista, puedeEditar: false, personas: [] })
  return { productores: vacia('productores'), hosts: vacia('hosts'), comunicadores: vacia('comunicadores'), cantantes: vacia('cantantes') }
}

/**
 * The four lists through dps_lista_leer, in parallel; a list that fails
 * reads empty and read-only (the cells still take written names). For the
 * server pages.
 */
export async function cargarListasDps(rpc: (nombre: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>): Promise<ListasDps> {
  const vacias = listasVacias()
  const leidas = await Promise.all(LISTAS_DPS.map((l) => rpc('dps_lista_leer', { p_lista: l.id })))
  LISTAS_DPS.forEach((l, i) => {
    const lista = leidas[i].error ? null : leerListaDps(leidas[i].data)
    if (lista?.lista === l.id) vacias[l.id] = lista
  })
  return vacias
}
