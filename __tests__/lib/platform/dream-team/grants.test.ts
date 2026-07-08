import {
  buildGrantsForServicio,
  applyGrantsForTransition,
  serializePausedGrantsSnapshot,
  restoreFromSnapshot,
} from '@/lib/platform/dream-team/grants'
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
const equipoEstudiantes = { id: 'equipo-estudiantes-transit', experiencia: 'estudiantes' as const }
const rolLiderDeGrupo = { id: 'rol-lider-grupo', label: 'Líder de grupo' }

describe('DreamTeamServiceGrant builder', () => {
  it('builds grants for Voluntario en DPS', () => {
    const grants = buildGrantsForServicio(equipoDps, rolVoluntario)

    expect(grants).toHaveLength(2)
    expect(grants.map((grant) => grant.capabilityKey)).toEqual([
      'dream_team.serve',
      'dps.team.serve',
    ])
    expect(grants[0]).toMatchObject({
      capabilityKey: 'dream_team.serve',
      experience: 'dream_team',
      scopeType: 'experience',
      scopeId: undefined,
    })
    expect(grants[1]).toMatchObject({
      capabilityKey: 'dps.team.serve',
      experience: 'dps',
      scopeType: 'equipo',
      scopeId: 'equipo-dps-camara',
    })
  })

  it('builds grants for Líder de grupo en Estudiantes', () => {
    const grants = buildGrantsForServicio(equipoEstudiantes, rolLiderDeGrupo)

    expect(grants).toHaveLength(4)
    expect(grants.map((grant) => grant.capabilityKey)).toEqual([
      'dream_team.serve',
      'dream_team.lead',
      'dream_team.gdv.lead',
      'estudiantes.team.lead',
    ])
    expect(grants[2]).toMatchObject({
      capabilityKey: 'dream_team.gdv.lead',
      experience: 'grupos_vida',
      scopeType: 'grupo',
      scopeId: 'rol-lider-grupo',
    })
    expect(grants[3]).toMatchObject({
      capabilityKey: 'estudiantes.team.lead',
      experience: 'estudiantes',
      scopeType: 'equipo',
      scopeId: 'equipo-estudiantes-transit',
    })
  })
})

describe('applyGrantsForTransition', () => {
  it('grants capabilities when transitioning to activo', () => {
    const audit = createPlatformGrantAudit()
    const decision = applyGrantsForTransition(
      {
        servicio: makeServicio('postulado'),
        estadoAnterior: 'postulado',
        estadoNuevo: 'activo',
        motivo: 'admin_promocion',
        actorPersonaId: 'persona-admin',
        fecha: '2026-07-07T00:00:00Z',
        equipo: equipoDps,
        rol: rolVoluntario,
      },
      audit,
    )

    expect(decision.action).toBe('grant')
    if (decision.action !== 'grant') throw new Error('expected grant')
    expect(decision.grants).toHaveLength(2)
    expect(decision.auditEvents).toHaveLength(2)
    expect(decision.auditEvents.every((event) => event.decision === 'grant')).toBe(true)
    expect(audit.logger.getEvents()).toHaveLength(2)
    expect(audit.metrics.getSnapshot().get('dream_team|dream_team_servicio|grant')).toBe(1)
    expect(audit.metrics.getSnapshot().get('dps|dream_team_servicio|grant')).toBe(1)
  })

  it('revokes and snapshots grants when transitioning from activo to en_pausa', () => {
    const audit = createPlatformGrantAudit()
    const decision = applyGrantsForTransition(
      {
        servicio: makeServicio('activo'),
        estadoAnterior: 'activo',
        estadoNuevo: 'en_pausa',
        motivo: 'admin_pausa',
        actorPersonaId: 'persona-admin',
        fecha: '2026-07-07T00:00:00Z',
        equipo: equipoDps,
        rol: rolVoluntario,
      },
      audit,
    )

    expect(decision.action).toBe('revoke')
    if (decision.action !== 'revoke') throw new Error('expected revoke')
    expect(decision.grants).toHaveLength(2)
    expect(decision.snapshot).toEqual({
      servicioId: 'servicio-1',
      personaId: 'persona-ana',
      grants: decision.grants,
      pausedAt: '2026-07-07T00:00:00Z',
    })
    expect(decision.auditEvents).toHaveLength(2)
    expect(decision.auditEvents.every((event) => event.decision === 'revoke')).toBe(true)
    expect(audit.metrics.getSnapshot().get('dream_team|dream_team_servicio|revoke')).toBe(1)
    expect(audit.metrics.getSnapshot().get('dps|dream_team_servicio|revoke')).toBe(1)
  })

  it('restores grants from snapshot when resuming from en_pausa', () => {
    const audit = createPlatformGrantAudit()
    const previousGrants = buildGrantsForServicio(equipoDps, rolVoluntario)
    const previousSnapshot = serializePausedGrantsSnapshot(
      'servicio-1',
      'persona-ana',
      previousGrants,
      '2026-07-01T00:00:00Z',
    )

    const decision = applyGrantsForTransition(
      {
        servicio: makeServicio('en_pausa'),
        estadoAnterior: 'en_pausa',
        estadoNuevo: 'activo',
        motivo: 'admin_reactivacion',
        actorPersonaId: 'persona-admin',
        fecha: '2026-07-07T00:00:00Z',
        previousSnapshot,
      },
      audit,
    )

    expect(decision.action).toBe('restore')
    if (decision.action !== 'restore') throw new Error('expected restore')
    expect(decision.grants).toEqual(previousSnapshot.grants)
    expect(decision.auditEvents).toHaveLength(2)
    expect(decision.auditEvents.every((event) => event.decision === 'grant')).toBe(true)
  })

  it('revokes without snapshot when transitioning to retirado', () => {
    const audit = createPlatformGrantAudit()
    const decision = applyGrantsForTransition(
      {
        servicio: makeServicio('activo'),
        estadoAnterior: 'activo',
        estadoNuevo: 'retirado',
        motivo: 'admin_retiro',
        actorPersonaId: 'persona-admin',
        fecha: '2026-07-07T00:00:00Z',
        equipo: equipoDps,
        rol: rolVoluntario,
      },
      audit,
    )

    expect(decision.action).toBe('revoke')
    if (decision.action !== 'revoke') throw new Error('expected revoke')
    expect(decision.grants).toHaveLength(2)
    expect(decision.snapshot).toBeUndefined()
    expect(decision.auditEvents).toHaveLength(2)
    expect(decision.auditEvents.every((event) => event.decision === 'revoke')).toBe(true)
  })

  it('returns noop for grant-irrelevant transitions', () => {
    const audit = createPlatformGrantAudit()
    const decision = applyGrantsForTransition(
      {
        servicio: makeServicio('activo'),
        estadoAnterior: 'activo',
        estadoNuevo: 'activo',
        motivo: 'admin_promocion',
        actorPersonaId: 'persona-admin',
        fecha: '2026-07-07T00:00:00Z',
        equipo: equipoDps,
        rol: rolVoluntario,
      },
      audit,
    )

    expect(decision.action).toBe('noop')
    if (decision.action !== 'noop') throw new Error('expected noop')
    expect(decision.reason).toBe('not_a_grant_relevant_transition')
    expect(audit.logger.getEvents()).toHaveLength(0)
  })
})

describe('Paused grants snapshot', () => {
  it('serializes and restores grants round-trip', () => {
    const grants = buildGrantsForServicio(equipoDps, rolVoluntario)
    const snapshot = serializePausedGrantsSnapshot(
      'servicio-1',
      'persona-ana',
      grants,
      '2026-07-07T00:00:00Z',
    )

    expect(restoreFromSnapshot(snapshot)).toEqual(grants)
    expect(snapshot).toMatchObject({
      servicioId: 'servicio-1',
      personaId: 'persona-ana',
      pausedAt: '2026-07-07T00:00:00Z',
    })
  })
})

describe('transitionWithGrants integration', () => {
  it('returns an error for invalid state transitions without emitting grants', async () => {
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

  it('returns a paused snapshot for activo to en_pausa', async () => {
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
})

describe('Caso Ana: mixed services and pause/resume lifecycle', () => {
  it('preserves DPS grants while pausing and restoring Estudiantes grants', () => {
    const audit = createPlatformGrantAudit()
    const dpsGrants = buildGrantsForServicio(equipoDps, rolVoluntario)
    const estudiantesGrants = buildGrantsForServicio(equipoEstudiantes, {
      id: 'rol-lider',
      label: 'Líder',
    })

    expect(dpsGrants).toHaveLength(2)
    expect(estudiantesGrants.map((grant) => grant.capabilityKey)).toEqual([
      'dream_team.serve',
      'dream_team.lead',
      'estudiantes.team.lead',
    ])

    const pauseDecision = applyGrantsForTransition(
      {
        servicio: { ...makeServicio('activo'), id: 'servicio-estudiantes', equipoId: 'equipo-estudiantes-transit', rolId: 'rol-lider' },
        estadoAnterior: 'activo',
        estadoNuevo: 'en_pausa',
        motivo: 'admin_pausa',
        actorPersonaId: 'persona-ana',
        fecha: '2026-07-07T00:00:00Z',
        equipo: equipoEstudiantes,
        rol: { id: 'rol-lider', label: 'Líder' },
      },
      audit,
    )

    expect(pauseDecision.action).toBe('revoke')
    if (pauseDecision.action !== 'revoke') throw new Error('expected revoke')
    expect(pauseDecision.snapshot?.grants).toEqual(estudiantesGrants)

    const restoreDecision = applyGrantsForTransition(
      {
        servicio: { ...makeServicio('en_pausa'), id: 'servicio-estudiantes', equipoId: 'equipo-estudiantes-transit', rolId: 'rol-lider' },
        estadoAnterior: 'en_pausa',
        estadoNuevo: 'activo',
        motivo: 'admin_reactivacion',
        actorPersonaId: 'persona-ana',
        fecha: '2026-07-14T00:00:00Z',
        previousSnapshot: pauseDecision.snapshot,
      },
      createPlatformGrantAudit(),
    )

    expect(restoreDecision.action).toBe('restore')
    if (restoreDecision.action !== 'restore') throw new Error('expected restore')
    expect(restoreDecision.grants).toEqual(estudiantesGrants)
  })
})
