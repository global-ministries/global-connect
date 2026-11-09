/**
 * Which sections the home shows, in order of urgency (odd/tasks/home-por-rol.md
 * S1, S3, S6–S8; design/home-por-rol/00). Pure: the facts are loaded by
 * cargarHechosInicio and the screen renders whatever this returns.
 */
import type { HechosInicio, PendientesInicio } from './hechos'

export type TipoPendiente =
  | 'reportes-sin-cargar'
  | 'solicitudes-grupo'
  | 'casas-por-revisar'
  | 'grupos-sin-casa'
  | 'dream-team'
  | 'tickets'
  /** Jump to «Mis servicios»; never shows the section on its own. */
  | 'servicios-por-confirmar'

export type PendienteInicio = { tipo: TipoPendiente; cantidad: number }

export type CargoInicio =
  | { tipo: 'grupo-lider'; grupoId: string; nombre: string | null }
  | { tipo: 'etapa'; directorEtapaId: string }
  | { tipo: 'segmento'; segmentoId: string }
  | { tipo: 'area-dream-team'; equipoId: string; servicioId: string }

export type PasoInicio = {
  id: 'proximo-paso' | 'completar-perfil' | 'talleres' | 'servir-dream-team'
  hecho: boolean
  destacado?: true
}

export type TileExplorar = 'proximo-paso' | 'talleres' | 'grupos-vida' | 'dream-team' | 'ninos'

export type SeccionInicio =
  | { id: 'para-responder'; items: PendienteInicio[] }
  | { id: 'mis-servicios'; porConfirmar: number }
  | { id: 'mis-hijos'; cantidad: number }
  | { id: 'a-cargo'; cargos: CargoInicio[] }
  | { id: 'grupo-miembro'; grupoId: string; nombre: string | null; soloLectura: boolean }
  | { id: 'vision-general' }
  | { id: 'proximos-pasos'; pasos: PasoInicio[] }
  | { id: 'explorar'; tiles: TileExplorar[] }

// Most urgent first: an overdue report before approvals, tickets last.
const ORDEN_PENDIENTES: ReadonlyArray<[keyof PendientesInicio, TipoPendiente]> = [
  ['reportesSinCargar', 'reportes-sin-cargar'],
  ['solicitudesGrupo', 'solicitudes-grupo'],
  ['casasPorRevisar', 'casas-por-revisar'],
  ['gruposSinCasa', 'grupos-sin-casa'],
  ['dreamTeam', 'dream-team'],
  ['ticketsAbiertos', 'tickets'],
]

// Without Próximo Paso, Dream Team is not named: serving starts there (S3, S4).
const EXPLORAR_SIN_PROXIMO_PASO: TileExplorar[] = ['proximo-paso', 'talleres', 'grupos-vida', 'ninos']
const EXPLORAR: TileExplorar[] = ['grupos-vida', 'talleres', 'dream-team', 'ninos']

function cargos(h: HechosInicio): CargoInicio[] {
  return [
    // The colíder is read as a member (S6): only the Líder has the group in charge.
    ...h.grupos.filter((g) => g.rol === 'Líder').map((g): CargoInicio => ({ tipo: 'grupo-lider', grupoId: g.grupoId, nombre: g.nombre })),
    ...h.etapasDirigidas.map((id): CargoInicio => ({ tipo: 'etapa', directorEtapaId: id })),
    ...h.segmentosDirigidos.map((id): CargoInicio => ({ tipo: 'segmento', segmentoId: id })),
    // Director de área by the nivel of the servicio, as dream_team_grants_de_servicio.
    ...h.serviciosActivos
      .filter((s) => s.nivel === 'director')
      .map((s): CargoInicio => ({ tipo: 'area-dream-team', equipoId: s.equipoId, servicioId: s.servicioId })),
  ]
}

// Whoever already serves, leads something or oversees the campus is not asked for Próximo Paso
// on the home even without the milestone (legacy data, L8): their directors mark it instead.
function pidePrimerPaso(h: HechosInicio, sirve: boolean, tieneCargo: boolean): boolean {
  return h.hizoProximoPaso === false && !sirve && !tieneCargo && !h.esAdminOPastor
}

function pasos(h: HechosInicio, sirve: boolean, tieneCargo: boolean): PasoInicio[] {
  // Unknown (null) or legacy without the milestone asks for nothing: neither Próximo Paso nor serving.
  if (pidePrimerPaso(h, sirve, tieneCargo)) {
    return [
      { id: 'proximo-paso', hecho: false, destacado: true },
      { id: 'completar-perfil', hecho: h.perfilCompleto },
      { id: 'talleres', hecho: false },
    ]
  }
  const lista: PasoInicio[] = [{ id: 'completar-perfil', hecho: h.perfilCompleto }]
  if (h.hizoProximoPaso === true) {
    lista.push({ id: 'proximo-paso', hecho: true })
    // Who already leads something, or oversees the campus, is not offered to serve.
    if (!sirve && !tieneCargo && !h.esAdminOPastor) lista.push({ id: 'servir-dream-team', hecho: false })
  }
  return lista
}

export function decidirSecciones(h: HechosInicio): SeccionInicio[] {
  const secciones: SeccionInicio[] = []
  const sirve = h.serviciosActivos.length > 0 || h.convocadoEnDps

  const pendientes = ORDEN_PENDIENTES.filter(([clave]) => h.pendientes[clave] > 0).map(
    ([clave, tipo]): PendienteInicio => ({ tipo, cantidad: h.pendientes[clave] }),
  )
  if (pendientes.length > 0) {
    if (h.serviciosPorConfirmar > 0) pendientes.push({ tipo: 'servicios-por-confirmar', cantidad: h.serviciosPorConfirmar })
    secciones.push({ id: 'para-responder', items: pendientes })
  }

  if (sirve) secciones.push({ id: 'mis-servicios', porConfirmar: h.serviciosPorConfirmar })
  if (h.hijos > 0) secciones.push({ id: 'mis-hijos', cantidad: h.hijos })

  const aCargo = cargos(h)
  if (aCargo.length > 0) secciones.push({ id: 'a-cargo', cargos: aCargo })

  for (const g of h.grupos) {
    if (g.rol === 'Líder') continue
    secciones.push({ id: 'grupo-miembro', grupoId: g.grupoId, nombre: g.nombre, soloLectura: g.rol === 'Colíder' })
  }

  // Only admin and pastor see the campus; a director general sees their segmento (S7, S8).
  if (h.esAdminOPastor) secciones.push({ id: 'vision-general' })

  const lista = pasos(h, sirve, aCargo.length > 0)
  if (lista.some((p) => !p.hecho)) secciones.push({ id: 'proximos-pasos', pasos: lista })

  secciones.push({ id: 'explorar', tiles: pidePrimerPaso(h, sirve, aCargo.length > 0) ? EXPLORAR_SIN_PROXIMO_PASO : EXPLORAR })
  return secciones
}
