/**
 * Dream Team — the view model of /dream-team/pendientes
 * (odd/tasks/dream-team-pendientes-director.md, T4, S4, S6; artboards
 * design/pendientes-director/01 and 02). Pure: it only shapes the rows of
 * dream_team_pendientes() (lib/platform/dream-team/pendientes.ts) for the
 * screen — which tipos each metric filter leaves, the ficha list per tipo and
 * the labels. Who sees what is the database's.
 */
import { TIPOS_FICHA, type FilaPendiente, type TipoPendiente } from './pendientes'

/** The metrics that filter the page, as `?grupo=` (artboard 01 "Cómo está tu equipo"). */
export const GRUPOS_PENDIENTES = ['puestos', 'fichas', 'cuenta', 'turno'] as const
export type GrupoPendientes = (typeof GRUPOS_PENDIENTES)[number]

const TIPOS_DE_GRUPO: Readonly<Record<GrupoPendientes, readonly TipoPendiente[]>> = {
  puestos: ['area_sin_servidores'],
  fichas: TIPOS_FICHA,
  cuenta: ['invitacion_vencida', 'sin_cuenta'],
  turno: ['sin_turno'],
}

export type TipoFicha = 'sin_cedula' | 'fecha_nacimiento' | 'sin_telefono' | 'genero_estado_civil'

export const TITULO_PENDIENTE: Readonly<Record<TipoPendiente, string>> = {
  area_sin_servidores: 'Puestos sin servidores',
  solicitud_cambio_area: 'Solicitudes de cambio de área',
  invitacion_vencida: 'Invitaciones vencidas',
  sin_cedula: 'Sin cédula',
  fecha_nacimiento: 'Fecha de nacimiento',
  sin_telefono: 'Sin teléfono',
  genero_estado_civil: 'Género o estado civil',
  sin_cuenta: 'Sin cuenta',
  por_activar: 'Por activar',
  sin_turno: 'Sin turno',
}

/** The `?grupo=` of the URL; anything else is no filter. */
export function leerGrupoPendientes(valor: string | readonly string[] | undefined): GrupoPendientes | null {
  const texto = Array.isArray(valor) ? valor[0] : valor
  return GRUPOS_PENDIENTES.find((grupo) => grupo === texto) ?? null
}

/** Whether a tipo shows under the pressed metric; every tipo without one. */
export function tipoVisible(tipo: TipoPendiente, grupo: GrupoPendientes | null): boolean {
  return grupo === null || TIPOS_DE_GRUPO[grupo].includes(tipo)
}

const MOTIVO_FECHA = {
  falta: 'Sin fecha de nacimiento',
  futura: 'Fecha de nacimiento futura',
  marcador_1900: 'Nació en 1900',
  anterior_1910: 'Fecha anterior a 1910',
} as const

/** What one ficha row lacks, as a short tag ("Sin cédula", "Nació en 1900"). */
export function etiquetaFalta(fila: FilaPendiente): string {
  switch (fila.tipo) {
    case 'fecha_nacimiento':
      return MOTIVO_FECHA[fila.motivo]
    case 'genero_estado_civil':
      if (fila.campos.length > 1) return 'Género y estado civil sin especificar'
      return fila.campos[0] === 'genero' ? 'Género sin especificar' : 'Estado civil sin especificar'
    default:
      return TITULO_PENDIENTE[fila.tipo]
  }
}

/** One person of a ficha tipo, with every ficha gap they have (that tipo first). */
export interface PersonaFicha {
  readonly personaId: string
  readonly nombre: string
  readonly equipoRuta: readonly string[]
  /** Whether the database lets the viewer open Editar ficha. */
  readonly editable: boolean
  readonly faltas: readonly string[]
}

/** The people of one ficha tipo, in the RPC's order. */
export function fichasDeTipo(filas: readonly FilaPendiente[], tipo: TipoFicha): PersonaFicha[] {
  const deFicha = filas.filter((fila) => TIPOS_FICHA.includes(fila.tipo))
  return filas
    .filter((fila) => fila.tipo === tipo && fila.personaId !== null)
    .map((fila) => {
      const otras = deFicha.filter((otra) => otra.personaId === fila.personaId && otra.tipo !== tipo)
      return {
        personaId: fila.personaId as string,
        nombre: fila.personaNombre ?? 'Persona sin nombre',
        equipoRuta: fila.equipoRuta,
        editable: fila.fichaEditable === true,
        faltas: [fila, ...otras].map(etiquetaFalta),
      }
    })
}

/** "Anfitriones · Atención al Invitado": the equipo, then the área above it (artboard rows). */
export function subtituloEquipo(ruta: readonly string[]): string {
  return ruta.slice(-2).reverse().join(' · ')
}
