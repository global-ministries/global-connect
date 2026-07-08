import { transitionWithGrants } from '@/lib/platform/dream-team/servicios'
import { createPlatformGrantAudit } from '@/lib/platform/grants'
import { personaId } from '@/lib/platform/dream-team/types'
import type { DreamTeamServicio } from '@/lib/platform/dream-team/types'

function makeServicio(estado: DreamTeamServicio['estado']): DreamTeamServicio {
  return {
    id: 'servicio-1',
    personaId: personaId('persona-ana'),
    equipoId: 'equipo-dps-camara',
    rolId: 'rol-voluntario',
    estado,
    fechaInicio: '2026-01-01',
    motivoActual: 'admin_asignacion',
    version: 1,
  }
}

const equipoDps = { id: 'equipo-dps-camara', experiencia: 'dps' as const }
const rolVoluntario = { id: 'rol-voluntario', label: 'Voluntario' }

describe('transitionWithGrants', () => {
  it('returns the updated service and grant decision on a valid activation', async () => {
    const audit = createPlatformGrantAudit()
    const result = await transitionWithGrants({
      servicio: makeServicio('en_orientacion'),
      estadoNuevo: 'activo',
      motivo: 'admin_promocion',
      actorPersonaId: 'persona-admin',
      fecha: '2026-07-07T00:00:00Z',
      audit,
      equipo: equipoDps,
      rol: rolVoluntario,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.servicioNuevo.estado).toBe('activo')
    expect(result.servicioNuevo.version).toBe(2)
    expect(result.grantsDecision.action).toBe('grant')
    if (result.grantsDecision.action !== 'grant') throw new Error('expected grant')
    expect(result.grantsDecision.grants).toHaveLength(2)
    expect(result.pausedGrantsSnapshot).toBeUndefined()
    expect(audit.logger.getEvents()).toHaveLength(2)
  })

  it('returns an error and leaves audit empty for invalid transitions', async () => {
    const audit = createPlatformGrantAudit()
    const result = await transitionWithGrants({
      servicio: makeServicio('postulado'),
      estadoNuevo: 'en_pausa',
      motivo: 'admin_pausa',
      actorPersonaId: 'persona-admin',
      fecha: '2026-07-07T00:00:00Z',
      audit,
      equipo: equipoDps,
      rol: rolVoluntario,
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected error')
    expect(result.error.code).toBe('INVALID_STATE_TRANSITION')
    expect(audit.logger.getEvents()).toHaveLength(0)
  })

  it('snapshots paused grants for activo to en_pausa', async () => {
    const audit = createPlatformGrantAudit()
    const result = await transitionWithGrants({
      servicio: makeServicio('activo'),
      estadoNuevo: 'en_pausa',
      motivo: 'admin_pausa',
      actorPersonaId: 'persona-admin',
      fecha: '2026-07-07T00:00:00Z',
      audit,
      equipo: equipoDps,
      rol: rolVoluntario,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.servicioNuevo.estado).toBe('en_pausa')
    expect(result.grantsDecision.action).toBe('revoke')
    expect(result.pausedGrantsSnapshot).toBeDefined()
    expect(result.pausedGrantsSnapshot?.grants).toHaveLength(2)
    expect(audit.logger.getEvents()).toHaveLength(2)
  })

  it('restores grants from a previous snapshot on reactivation', async () => {
    const auditPause = createPlatformGrantAudit()
    const paused = await transitionWithGrants({
      servicio: makeServicio('activo'),
      estadoNuevo: 'en_pausa',
      motivo: 'admin_pausa',
      actorPersonaId: 'persona-admin',
      fecha: '2026-07-07T00:00:00Z',
      audit: auditPause,
      equipo: equipoDps,
      rol: rolVoluntario,
    })

    expect(paused.ok).toBe(true)
    if (!paused.ok) throw new Error('expected ok')

    const auditRestore = createPlatformGrantAudit()
    const restored = await transitionWithGrants({
      servicio: paused.servicioNuevo,
      estadoNuevo: 'activo',
      motivo: 'admin_reactivacion',
      actorPersonaId: 'persona-admin',
      fecha: '2026-07-14T00:00:00Z',
      audit: auditRestore,
      previousSnapshot: paused.pausedGrantsSnapshot,
    })

    expect(restored.ok).toBe(true)
    if (!restored.ok) throw new Error('expected ok')
    expect(restored.servicioNuevo.estado).toBe('activo')
    expect(restored.grantsDecision.action).toBe('restore')
    if (restored.grantsDecision.action !== 'restore') throw new Error('expected restore')
    expect(restored.grantsDecision.grants).toEqual(paused.pausedGrantsSnapshot?.grants)
    expect(auditRestore.logger.getEvents()).toHaveLength(2)
  })

  it('revokes grants without snapshot when retiring a service', async () => {
    const audit = createPlatformGrantAudit()
    const result = await transitionWithGrants({
      servicio: makeServicio('activo'),
      estadoNuevo: 'retirado',
      motivo: 'admin_retiro',
      actorPersonaId: 'persona-admin',
      fecha: '2026-07-07T00:00:00Z',
      audit,
      equipo: equipoDps,
      rol: rolVoluntario,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.servicioNuevo.estado).toBe('retirado')
    expect(result.servicioNuevo.fechaFin).toBe('2026-07-07T00:00:00Z')
    expect(result.grantsDecision.action).toBe('revoke')
    expect(result.pausedGrantsSnapshot).toBeUndefined()
    expect(audit.logger.getEvents()).toHaveLength(2)
  })
})
