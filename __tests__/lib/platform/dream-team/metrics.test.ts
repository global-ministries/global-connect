import { getDreamTeamMetrics } from '@/lib/platform/dream-team/metrics'
import { createInMemoryDreamTeamRepository } from '@/lib/platform/dream-team/repository-fake'
import { personaId, DREAM_TEAM_ESTADOS } from '@/lib/platform/dream-team/types'
import type { DreamTeamEquipo, DreamTeamRol, DreamTeamServicio, DreamTeamRequisitoVerificacion } from '@/lib/platform/dream-team/types'

const ana = personaId('persona-ana')
const luis = personaId('persona-luis')

const equipos: DreamTeamEquipo[] = [
  { id: 'equipo-dps-camara', experiencia: 'dps', label: 'DPS Producción Técnica', activo: true },
  { id: 'equipo-estudiantes-transit', experiencia: 'estudiantes', label: 'Estudiantes Transit', activo: true },
  { id: 'equipo-ninos', experiencia: 'ninos', label: 'Niños Salón', activo: true },
]

const roles: DreamTeamRol[] = [
  { id: 'rol-voluntario', equipoId: 'equipo-dps-camara', label: 'Voluntario', activo: true },
  { id: 'rol-lider', equipoId: 'equipo-estudiantes-transit', label: 'Líder de grupo', activo: true },
  { id: 'rol-maestro', equipoId: 'equipo-ninos', label: 'Maestro', activo: true },
]

function makeServicio(overrides: Partial<DreamTeamServicio> & Pick<DreamTeamServicio, 'id' | 'equipoId' | 'rolId' | 'estado'>): DreamTeamServicio {
  return {
    personaId: ana,
    fechaInicio: '2026-01-01',
    motivoActual: 'admin_asignacion',
    version: 1,
    ...overrides,
  } as DreamTeamServicio
}

function makeVerificacion(overrides: Partial<DreamTeamRequisitoVerificacion> & Pick<DreamTeamRequisitoVerificacion, 'id' | 'servicioId' | 'requisitoId'>): DreamTeamRequisitoVerificacion {
  return {
    estado: 'pendiente',
    ...overrides,
  } as DreamTeamRequisitoVerificacion
}

describe('getDreamTeamMetrics', () => {
  beforeEach(() => {
    jest.useRealTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns empty metrics for an empty repository', async () => {
    const repo = createInMemoryDreamTeamRepository({ seed: { equipos } })

    const metrics = await getDreamTeamMetrics(repo)

    expect(metrics.servicios_por_experiencia_equipo).toEqual([])
    expect(metrics.distribucion_roles).toEqual([])
    expect(metrics.requisitos_vencidos).toEqual([])
    expect(metrics.servicios_por_estado).toHaveLength(DREAM_TEAM_ESTADOS.length)
    for (const estado of DREAM_TEAM_ESTADOS) {
      expect(metrics.servicios_por_estado).toContainEqual({ estado, count: 0 })
    }
  })

  it('counts services grouped by experience and equipo', async () => {
    const repo = createInMemoryDreamTeamRepository({
      seed: {
        equipos,
        servicios: [
          makeServicio({ id: 'srv-dps-1', equipoId: 'equipo-dps-camara', rolId: 'rol-voluntario', estado: 'activo' }),
          makeServicio({ id: 'srv-dps-2', equipoId: 'equipo-dps-camara', rolId: 'rol-voluntario', estado: 'en_pausa' }),
          makeServicio({ id: 'srv-est-1', equipoId: 'equipo-estudiantes-transit', rolId: 'rol-lider', estado: 'activo' }),
        ],
      },
    })

    const metrics = await getDreamTeamMetrics(repo)

    expect(metrics.servicios_por_experiencia_equipo).toEqual(expect.arrayContaining([
      { experiencia: 'dps', equipoId: 'equipo-dps-camara', count: 2 },
      { experiencia: 'estudiantes', equipoId: 'equipo-estudiantes-transit', count: 1 },
    ]))
    expect(metrics.servicios_por_experiencia_equipo).toHaveLength(2)
  })

  it('returns correct estado counts including zero states', async () => {
    const repo = createInMemoryDreamTeamRepository({
      seed: {
        equipos,
        servicios: [
          makeServicio({ id: 'srv-1', equipoId: 'equipo-dps-camara', rolId: 'rol-voluntario', estado: 'postulado' }),
          makeServicio({ id: 'srv-2', equipoId: 'equipo-dps-camara', rolId: 'rol-voluntario', estado: 'activo' }),
          makeServicio({ id: 'srv-3', equipoId: 'equipo-dps-camara', rolId: 'rol-voluntario', estado: 'activo' }),
          makeServicio({ id: 'srv-4', equipoId: 'equipo-dps-camara', rolId: 'rol-voluntario', estado: 'en_pausa' }),
          makeServicio({ id: 'srv-5', equipoId: 'equipo-dps-camara', rolId: 'rol-voluntario', estado: 'retirado' }),
        ],
      },
    })

    const metrics = await getDreamTeamMetrics(repo)

    expect(metrics.servicios_por_estado).toEqual(expect.arrayContaining([
      { estado: 'postulado', count: 1 },
      { estado: 'en_orientacion', count: 0 },
      { estado: 'activo', count: 2 },
      { estado: 'en_pausa', count: 1 },
      { estado: 'inactivo', count: 0 },
      { estado: 'retirado', count: 1 },
    ]))
    expect(metrics.servicios_por_estado).toHaveLength(DREAM_TEAM_ESTADOS.length)
  })

  it('distribucion_roles counts only active services grouped by rol and experience', async () => {
    const repo = createInMemoryDreamTeamRepository({
      seed: {
        equipos,
        roles,
        servicios: [
          makeServicio({ id: 'srv-dps-active', equipoId: 'equipo-dps-camara', rolId: 'rol-voluntario', estado: 'activo' }),
          makeServicio({ id: 'srv-dps-paused', equipoId: 'equipo-dps-camara', rolId: 'rol-voluntario', estado: 'en_pausa' }),
          makeServicio({ id: 'srv-est-active', equipoId: 'equipo-estudiantes-transit', rolId: 'rol-lider', estado: 'activo' }),
          makeServicio({ id: 'srv-est-postulado', equipoId: 'equipo-estudiantes-transit', rolId: 'rol-lider', estado: 'postulado' }),
        ],
      },
    })

    const metrics = await getDreamTeamMetrics(repo)

    expect(metrics.distribucion_roles).toEqual(expect.arrayContaining([
      { rolId: 'rol-voluntario', experiencia: 'dps', count: 1 },
      { rolId: 'rol-lider', experiencia: 'estudiantes', count: 1 },
    ]))
    expect(metrics.distribucion_roles).toHaveLength(2)
  })

  it('lists only vencido verifications with fechaVencimiento before now', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-08-15T00:00:00.000Z'))

    const servicios = [
      makeServicio({ id: 'srv-ana', equipoId: 'equipo-estudiantes-transit', rolId: 'rol-lider', estado: 'activo' }),
    ]
    const repo = createInMemoryDreamTeamRepository({
      seed: {
        equipos,
        servicios,
        requisitoVerificaciones: [
          makeVerificacion({ id: 'ver-vencida', servicioId: 'srv-ana', requisitoId: 'req-cap', estado: 'vencido', fechaVencimiento: '2026-08-01' }),
          makeVerificacion({ id: 'ver-pendiente', servicioId: 'srv-ana', requisitoId: 'req-otro', estado: 'pendiente', fechaVencimiento: '2026-08-01' }),
          makeVerificacion({ id: 'ver-futura', servicioId: 'srv-ana', requisitoId: 'req-fut', estado: 'vencido', fechaVencimiento: '2026-08-20' }),
        ],
      },
    })

    const metrics = await getDreamTeamMetrics(repo)

    expect(metrics.requisitos_vencidos).toHaveLength(1)
    expect(metrics.requisitos_vencidos[0]).toEqual({
      verificacionId: 'ver-vencida',
      servicioId: 'srv-ana',
      requisitoId: 'req-cap',
      fechaVencimiento: '2026-08-01',
    })

    const servicio = await repo.getServicioById('srv-ana')
    expect(servicio?.estado).toBe('activo')
  })

  it('matches Ana scenario with two active services in different experiences', async () => {
    const repo = createInMemoryDreamTeamRepository({
      seed: {
        equipos,
        roles,
        servicios: [
          makeServicio({ id: 'srv-dps', equipoId: 'equipo-dps-camara', rolId: 'rol-voluntario', estado: 'activo' }),
          makeServicio({ id: 'srv-est', equipoId: 'equipo-estudiantes-transit', rolId: 'rol-lider', estado: 'activo' }),
        ],
      },
    })

    const metrics = await getDreamTeamMetrics(repo)

    expect(metrics.servicios_por_estado.find((s) => s.estado === 'activo')?.count).toBe(2)
    expect(metrics.servicios_por_experiencia_equipo).toEqual(expect.arrayContaining([
      { experiencia: 'dps', equipoId: 'equipo-dps-camara', count: 1 },
      { experiencia: 'estudiantes', equipoId: 'equipo-estudiantes-transit', count: 1 },
    ]))
    expect(metrics.distribucion_roles).toEqual(expect.arrayContaining([
      { rolId: 'rol-voluntario', experiencia: 'dps', count: 1 },
      { rolId: 'rol-lider', experiencia: 'estudiantes', count: 1 },
    ]))
  })
})
