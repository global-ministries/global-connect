/**
 * /dream-team/pendientes (RSC), odd/tasks/dream-team-pendientes-director.md T4
 * (S4, S5, S6): who opens it (the Mi equipo authorities: a Dream Team reader,
 * an area coordinator, whoever registers people; not a Grupos de Vida director
 * by role alone), and what reaches the client island — the mapped summary and
 * rows of dream_team_pendientes_resumen() / dream_team_pendientes(), the
 * requests the viewer resolves, the role and the área rows' assigner data.
 */
import type { ReactElement } from 'react'

import type { DreamTeamRol } from '@/lib/platform/dream-team/types'

const notFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const redirect = jest.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`)
})
jest.mock('next/navigation', () => ({ notFound: () => notFound(), redirect: (to: string) => redirect(to) }))

const isDreamTeamEnabled = jest.fn(() => true)
const requireDreamTeamSession = jest.fn()
const hasDreamTeamPendientesAccess = jest.fn(() => true)
const hasDreamTeamWriteCapability = jest.fn(() => true)
jest.mock('@/lib/platform/dream-team/route-access', () => ({
  isDreamTeamEnabled: () => isDreamTeamEnabled(),
  requireDreamTeamSession: () => requireDreamTeamSession(),
  hasDreamTeamPendientesAccess: () => hasDreamTeamPendientesAccess(),
  hasDreamTeamWriteCapability: () => hasDreamTeamWriteCapability(),
}))

let puedeRegistrar = false
jest.mock('@/lib/platform/dream-team/ficha-persona', () => ({
  puedeRegistrarParaNavegacion: async () => puedeRegistrar,
}))

const RESUMEN = {
  areas_sin_servidores: 1, areas_total: 4, sin_cedula: 1, fecha_nacimiento: 0, sin_telefono: 0, genero_estado_civil: 0,
  fichas_incompletas: 1, sin_cuenta: 0, invitaciones_vencidas: 0, por_activar: 0, sin_turno: 0, solicitudes: 1,
  urgentes: 2, personas_total: 10, personas_en_orden: 9, porcentaje: 90,
}
const FILAS = [
  { tipo: 'area_sin_servidores', persona_id: null, equipo_id: 'eq-video', equipo_ruta: 'DPS › Producción › Mesa de video', detalle: { por_activar: 0 } },
  { tipo: 'sin_cedula', persona_id: 'p1', persona_nombre: 'Ana Pérez', equipo_id: 'eq-anf', equipo_ruta: 'DPS › Anfitriones', ficha_editable: true, detalle: {} },
]
const rpc = jest.fn(async (nombre: string) => {
  if (nombre === 'dream_team_pendientes_resumen') return { data: [RESUMEN], error: null }
  if (nombre === 'dream_team_pendientes') return { data: FILAS, error: null }
  return { data: null, error: { code: 'XX000' } }
})
jest.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc }) }))

const SOLICITUDES = [
  { id: 'sol-1', estado: 'pendiente', puedeResolver: true, personaNombre: 'Valentina' },
  { id: 'sol-2', estado: 'pendiente', puedeResolver: false, personaNombre: 'Mía' },
  { id: 'sol-3', estado: 'aprobada', puedeResolver: false, personaNombre: 'Otra' },
]
jest.mock('@/lib/platform/dream-team/cambiar-area', () => ({
  fetchSolicitudesCambioArea: async () => SOLICITUDES,
}))

const ROLES: DreamTeamRol[] = [{ id: 'rol-1', equipoId: 'eq-video', label: 'servidor', nivel: 0, activo: true } as unknown as DreamTeamRol]
const listRolesPorEquipo = jest.fn(async () => ROLES)
jest.mock('@/lib/platform/dream-team/repository-supabase', () => ({
  createSupabaseDreamTeamRepository: () => ({ listRolesPorEquipo }),
}))

import DreamTeamPendientesPage from '@/app/(auth)/dream-team/pendientes/page'
import type { PendientesClientProps } from '@/components/dream-team/pendientes/pendientes-client'

async function renderizar(searchParams: Record<string, string> = {}): Promise<PendientesClientProps> {
  const elemento = (await DreamTeamPendientesPage({ searchParams: Promise.resolve(searchParams) })) as ReactElement<PendientesClientProps>
  return elemento.props
}

beforeEach(() => {
  jest.clearAllMocks()
  isDreamTeamEnabled.mockReturnValue(true)
  requireDreamTeamSession.mockResolvedValue({ personaId: 'yo', globalRoles: [], capabilities: [] })
  hasDreamTeamPendientesAccess.mockReturnValue(true)
  hasDreamTeamWriteCapability.mockReturnValue(true)
  puedeRegistrar = false
})

describe('/dream-team/pendientes — who opens it', () => {
  it('is a 404 with Dream Team off', async () => {
    isDreamTeamEnabled.mockReturnValue(false)
    await expect(renderizar()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('sends a signed-out visitor to /login', async () => {
    requireDreamTeamSession.mockResolvedValue(null)
    await expect(renderizar()).rejects.toThrow('NEXT_REDIRECT:/login')
  })

  it('is a 404 for whoever has no team authority and registers nowhere', async () => {
    hasDreamTeamPendientesAccess.mockReturnValue(false)
    await expect(renderizar()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(rpc).not.toHaveBeenCalledWith('dream_team_pendientes', expect.anything())
  })

  it('opens for whoever registers people (the volunteer coordinator), as a coordinador', async () => {
    hasDreamTeamPendientesAccess.mockReturnValue(false)
    hasDreamTeamWriteCapability.mockReturnValue(false)
    puedeRegistrar = true
    expect((await renderizar()).rol).toBe('coordinador')
  })
})

describe('/dream-team/pendientes — what reaches the client', () => {
  it('passes the mapped summary and rows, and only the requests the viewer resolves', async () => {
    const props = await renderizar()
    expect(props.resumen).toEqual(expect.objectContaining({ urgentes: 2, porcentaje: 90, personasTotal: 10, areasSinServidores: 1 }))
    expect(props.filas.map((f) => [f.tipo, f.personaId ?? f.equipoId])).toEqual([
      ['area_sin_servidores', 'eq-video'],
      ['sin_cedula', 'p1'],
    ])
    expect(rpc).toHaveBeenCalledWith('dream_team_pendientes_resumen', undefined)
    expect(rpc).toHaveBeenCalledWith('dream_team_pendientes', undefined)
    expect(props.solicitudes.map((s) => s.id)).toEqual(['sol-1'])
    expect(props.rol).toBe('director')
  })

  it('gives the assigner the áreas sin servidores and their roles', async () => {
    const props = await renderizar()
    expect(props.equiposAsignables).toEqual([{ id: 'eq-video', etiqueta: 'Mesa de video', ruta: ['DPS', 'Producción', 'Mesa de video'] }])
    expect(listRolesPorEquipo).toHaveBeenCalledWith('eq-video')
    expect(props.rolesPorEquipo).toEqual({ 'eq-video': ROLES })
  })

  it('asks no roles of a read-only viewer, who cannot assign', async () => {
    hasDreamTeamWriteCapability.mockReturnValue(false)
    const props = await renderizar()
    expect(props.rol).toBe('sin_permisos')
    expect(listRolesPorEquipo).not.toHaveBeenCalled()
    expect(props.rolesPorEquipo).toEqual({})
  })

  it('reads the metric filter from the URL, ignoring unknown values', async () => {
    expect((await renderizar({ grupo: 'fichas' })).grupoInicial).toBe('fichas')
    expect((await renderizar({ grupo: 'otro' })).grupoInicial).toBeNull()
  })

  it('still renders when the reads fail (null summary, no rows)', async () => {
    const falla = async () => ({ data: null, error: { code: 'XX000' } })
    rpc.mockImplementationOnce(falla).mockImplementationOnce(falla)
    const props = await renderizar()
    expect(props.resumen).toBeNull()
    expect(props.filas).toEqual([])
  })
})
