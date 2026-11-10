/**
 * Facts about one person that decide their home (odd/tasks/home-por-rol.md T2).
 * The sections come from relations, not global roles (S8): grupo_miembros, the
 * director scopes of Grupos de Vida, the nivel of their Dream Team servicio and
 * their children. Admin and pastor are the only global roles read.
 */

export type RolEnGrupo = 'Líder' | 'Colíder' | 'Miembro'

/** One active row of grupo_miembros. */
export type MembresiaGrupo = { grupoId: string; nombre: string | null; rol: RolEnGrupo }

/** One activo dream_team_servicios row; nivel comes from dream_team_roles (null when unknown). */
export type ServicioActivo = { servicioId: string; equipoId: string; nivel: string | null }

/** Counts of things waiting for this person outside «Mis servicios». */
export type PendientesInicio = {
  reportesSinCargar: number
  /** Leaders in the director's etapa or segmento without this week's report. */
  lideresSinReporte: number
  /** Volunteers of the person's Dream Team area without the Próximo Paso milestone. */
  marcarProximoPaso: number
  solicitudesGrupo: number
  casasPorRevisar: number
  gruposSinCasa: number
  dreamTeam: number
  ticketsAbiertos: number
}

export type HechosInicio = {
  /** usuarios.id; null when the person has no usuarios row. */
  usuarioId: string | null
  esAdminOPastor: boolean
  grupos: MembresiaGrupo[]
  /** segmento_lideres ids where the person is director_etapa. */
  etapasDirigidas: string[]
  /** segmento ids from director_general_segmentos. */
  segmentosDirigidos: string[]
  serviciosActivos: ServicioActivo[]
  /** Convocado in a DPS plan; filled when feat/dps-avisos is merged (S2). */
  convocadoEnDps: boolean
  /** Whether the person can open /dream-team (Mi equipo access or somewhere to register people), as its guard. */
  abreDreamTeam: boolean
  /** DPS services waiting for an answer; filled when feat/dps-avisos is merged (S2). */
  serviciosPorConfirmar: number
  hijos: number
  /** Phone and birth date are filled. */
  perfilCompleto: boolean
  /** null when it could not be known (the RPC failed or is not deployed yet). */
  hizoProximoPaso: boolean | null
  pendientes: PendientesInicio
}

/** Every fact empty: what each source degrades to when it fails. */
export const HECHOS_VACIOS: HechosInicio = {
  usuarioId: null,
  esAdminOPastor: false,
  grupos: [],
  etapasDirigidas: [],
  segmentosDirigidos: [],
  serviciosActivos: [],
  convocadoEnDps: false,
  abreDreamTeam: false,
  serviciosPorConfirmar: 0,
  hijos: 0,
  perfilCompleto: true,
  hizoProximoPaso: null,
  pendientes: {
    reportesSinCargar: 0,
    lideresSinReporte: 0,
    marcarProximoPaso: 0,
    solicitudesGrupo: 0,
    casasPorRevisar: 0,
    gruposSinCasa: 0,
    dreamTeam: 0,
    ticketsAbiertos: 0,
  },
}
