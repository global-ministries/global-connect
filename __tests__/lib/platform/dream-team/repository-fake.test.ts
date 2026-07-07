import {
  createInMemoryDreamTeamRepository,
  ConcurrencyConflictError,
} from '@/lib/platform/dream-team/repository-fake'
import { personaId } from '@/lib/platform/dream-team/types'
import type {
  DreamTeamEquipo,
  DreamTeamEstadoHistorial,
  DreamTeamParticipationEvent,
  DreamTeamRequisito,
  DreamTeamRequisitoVerificacion,
  DreamTeamRol,
  DreamTeamServicio,
} from '@/lib/platform/dream-team/types'

function makePersonaId(name: string) {
  return personaId(name)
}

function makeServicioInput(
  overrides: Partial<Omit<DreamTeamServicio, 'id' | 'version'>> = {},
): Omit<DreamTeamServicio, 'id' | 'version'> {
  return {
    personaId: makePersonaId('persona-default'),
    equipoId: 'equipo-dps-camara',
    rolId: 'rol-voluntario',
    estado: 'activo',
    fechaInicio: '2026-01-01',
    motivoActual: 'admin_asignacion',
    ...overrides,
  }
}

function makeEquipo(id: string): DreamTeamEquipo {
  return { id, experiencia: 'dps', label: id, activo: true }
}

function makeRol(id: string, equipoId: string): DreamTeamRol {
  return { id, equipoId, label: id, activo: true }
}

function makeRequisito(id: string, rolId: string): DreamTeamRequisito {
  return {
    id,
    equipoId: 'equipo-dps-camara',
    rolId,
    codigo: `req-${id}`,
    label: `Requisito ${id}`,
    tipo: 'documento',
    obligatoriedad: 'requerido',
  }
}

function makeVerificacion(
  id: string,
  servicioId: string,
  requisitoId: string,
): DreamTeamRequisitoVerificacion {
  return {
    id,
    servicioId,
    requisitoId,
    estado: 'pendiente',
  }
}

function makeParticipationEvent(
  overrides: Partial<Omit<DreamTeamParticipationEvent, 'id'>>,
): Omit<DreamTeamParticipationEvent, 'id'> {
  return {
    personaId: makePersonaId('persona-default'),
    servicioId: 'servicio-default',
    tipoEvento: 'service_state_changed',
    payload: { foo: 'bar' },
    fecha: '2026-07-07T00:00:00.000Z',
    ...overrides,
  }
}

describe('InMemoryDreamTeamRepository', () => {
  describe('createServicio', () => {
    it('inserts a service with auto-generated id and version 1', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const input = makeServicioInput({ personaId: makePersonaId('persona-ana') })

      const created = await repo.createServicio(input)

      expect(created.id).toMatch(/^[0-9a-fA-F-]{36}$/)
      expect(created.version).toBe(1)
      expect(created.personaId).toBe(input.personaId)
      expect(created.equipoId).toBe(input.equipoId)
      expect(created.rolId).toBe(input.rolId)
      expect(created.estado).toBe(input.estado)
    })

    it('retrieves the created service via getServicioById', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const created = await repo.createServicio(makeServicioInput())

      const found = await repo.getServicioById(created.id)

      expect(found).toEqual(created)
    })

    it('lists the created service via listServicios', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const created = await repo.createServicio(makeServicioInput())

      const all = await repo.listServicios({})

      expect(all).toHaveLength(1)
      expect(all[0]).toEqual(created)
    })

    it('returns null for an unknown service id', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const found = await repo.getServicioById('does-not-exist')
      expect(found).toBeNull()
    })
  })

  describe('listServicios filters', () => {
    it('filters by personaId returning only matching services', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const ana = makePersonaId('persona-ana')
      const luis = makePersonaId('persona-luis')
      await repo.createServicio(makeServicioInput({ personaId: ana, equipoId: 'equipo-a' }))
      await repo.createServicio(makeServicioInput({ personaId: luis, equipoId: 'equipo-b' }))

      const result = await repo.listServicios({ personaId: ana })

      expect(result).toHaveLength(1)
      expect(result[0].personaId).toBe(ana)
    })

    it('filters by equipoId returning only matching services', async () => {
      const repo = createInMemoryDreamTeamRepository()
      await repo.createServicio(makeServicioInput({ equipoId: 'equipo-dps' }))
      await repo.createServicio(makeServicioInput({ equipoId: 'equipo-estudiantes' }))

      const result = await repo.listServicios({ equipoId: 'equipo-dps' })

      expect(result).toHaveLength(1)
      expect(result[0].equipoId).toBe('equipo-dps')
    })

    it('filters by rolId returning only matching services', async () => {
      const repo = createInMemoryDreamTeamRepository()
      await repo.createServicio(makeServicioInput({ rolId: 'rol-lider' }))
      await repo.createServicio(makeServicioInput({ rolId: 'rol-voluntario' }))

      const result = await repo.listServicios({ rolId: 'rol-lider' })

      expect(result).toHaveLength(1)
      expect(result[0].rolId).toBe('rol-lider')
    })

    it('filters by a single estado', async () => {
      const repo = createInMemoryDreamTeamRepository()
      await repo.createServicio(makeServicioInput({ estado: 'activo' }))
      await repo.createServicio(makeServicioInput({ estado: 'en_pausa' }))

      const result = await repo.listServicios({ estado: 'activo' })

      expect(result).toHaveLength(1)
      expect(result[0].estado).toBe('activo')
    })

    it('filters by an array of estados', async () => {
      const repo = createInMemoryDreamTeamRepository()
      await repo.createServicio(makeServicioInput({ estado: 'activo' }))
      await repo.createServicio(makeServicioInput({ estado: 'en_pausa' }))
      await repo.createServicio(makeServicioInput({ estado: 'retirado' }))

      const result = await repo.listServicios({ estado: ['activo', 'en_pausa'] })

      expect(result).toHaveLength(2)
      expect(result.map((s) => s.estado).sort()).toEqual(['activo', 'en_pausa'])
    })

    it('returns all services when no filters are provided', async () => {
      const repo = createInMemoryDreamTeamRepository()
      await repo.createServicio(makeServicioInput({ estado: 'activo' }))
      await repo.createServicio(makeServicioInput({ estado: 'en_pausa' }))

      const result = await repo.listServicios({})

      expect(result).toHaveLength(2)
    })
  })

  describe('updateServicio', () => {
    it('increments version and persists the change', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const created = await repo.createServicio(makeServicioInput({ estado: 'activo' }))

      const updated = await repo.updateServicio(created.id, {
        estado: 'en_pausa',
        motivoActual: 'admin_pausa',
        expectedVersion: created.version,
      })

      expect(updated.version).toBe(created.version + 1)
      expect(updated.estado).toBe('en_pausa')
      expect(updated.motivoActual).toBe('admin_pausa')
      const found = await repo.getServicioById(created.id)
      expect(found).toEqual(updated)
    })

    it('throws ConcurrencyConflictError when expectedVersion does not match and leaves service intact', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const created = await repo.createServicio(makeServicioInput({ estado: 'activo' }))

      await expect(
        repo.updateServicio(created.id, {
          estado: 'en_pausa',
          motivoActual: 'admin_pausa',
          expectedVersion: created.version + 99,
        }),
      ).rejects.toThrow(ConcurrencyConflictError)

      const found = await repo.getServicioById(created.id)
      expect(found).toEqual(created)
    })

    it('auto-appends historial on estado change', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const created = await repo.createServicio(makeServicioInput({ estado: 'activo' }))

      await repo.updateServicio(created.id, {
        estado: 'en_pausa',
        motivoActual: 'admin_pausa',
        detalleMotivo: 'pausa administrativa',
        expectedVersion: created.version,
      })

      const historial = await repo.listHistorial(created.id)
      expect(historial).toHaveLength(1)
      expect(historial[0].estadoAnterior).toBe('activo')
      expect(historial[0].estadoNuevo).toBe('en_pausa')
      expect(historial[0].motivo).toBe('admin_pausa')
      expect(historial[0].detalleMotivo).toBe('pausa administrativa')
    })

    it('does not append historial when estado is unchanged', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const created = await repo.createServicio(makeServicioInput({ estado: 'activo' }))

      await repo.updateServicio(created.id, {
        motivoActual: 'admin_promocion',
        expectedVersion: created.version,
      })

      const historial = await repo.listHistorial(created.id)
      expect(historial).toHaveLength(0)
    })

    it('sets fechaFin automatically when transitioning to retirado', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const created = await repo.createServicio(makeServicioInput({ estado: 'activo' }))

      const updated = await repo.updateServicio(created.id, {
        estado: 'retirado',
        motivoActual: 'admin_retiro',
        expectedVersion: created.version,
      })

      expect(updated.estado).toBe('retirado')
      expect(updated.fechaFin).toBeDefined()
      expect(typeof updated.fechaFin).toBe('string')
    })
  })

  describe('appendHistorial + listHistorial', () => {
    it('persists a history entry with all fields', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const created = await repo.createServicio(makeServicioInput())

      const entry = await repo.appendHistorial({
        servicioId: created.id,
        estadoAnterior: 'activo',
        estadoNuevo: 'en_pausa',
        motivo: 'admin_pausa',
        actorPersonaId: makePersonaId('actor-1'),
        fecha: '2026-07-07T00:00:00.000Z',
      })

      expect(entry.id).toMatch(/^[0-9a-fA-F-]{36}$/)
      const historial = await repo.listHistorial(created.id)
      expect(historial).toHaveLength(1)
      expect(historial[0]).toEqual(entry)
    })

    it('returns multiple entries in insertion order', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const created = await repo.createServicio(makeServicioInput())

      await repo.appendHistorial({
        servicioId: created.id,
        estadoAnterior: 'postulado',
        estadoNuevo: 'en_orientacion',
        motivo: 'admin_promocion',
        actorPersonaId: makePersonaId('actor-1'),
        fecha: '2026-07-01T00:00:00.000Z',
      })
      await repo.appendHistorial({
        servicioId: created.id,
        estadoAnterior: 'en_orientacion',
        estadoNuevo: 'activo',
        motivo: 'admin_promocion',
        actorPersonaId: makePersonaId('actor-1'),
        fecha: '2026-07-02T00:00:00.000Z',
      })

      const historial = await repo.listHistorial(created.id)
      expect(historial).toHaveLength(2)
      expect(historial[0].estadoNuevo).toBe('en_orientacion')
      expect(historial[1].estadoNuevo).toBe('activo')
    })

    it('preserves pausedGrantsSnapshot', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const created = await repo.createServicio(makeServicioInput())
      const snapshot: DreamTeamEstadoHistorial['pausedGrantsSnapshot'] = [
        { key: 'dream_team.serve', scope: { experience: 'dps' } },
      ]

      const entry = await repo.appendHistorial({
        servicioId: created.id,
        estadoAnterior: 'activo',
        estadoNuevo: 'en_pausa',
        motivo: 'admin_pausa',
        actorPersonaId: makePersonaId('actor-1'),
        fecha: '2026-07-07T00:00:00.000Z',
        pausedGrantsSnapshot: snapshot,
      })

      expect(entry.pausedGrantsSnapshot).toEqual(snapshot)
      const historial = await repo.listHistorial(created.id)
      expect(historial[0].pausedGrantsSnapshot).toEqual(snapshot)
    })
  })

  describe('Requisitos', () => {
    it('inserts a new requisito on upsert', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const requisito = makeRequisito('req-1', 'rol-voluntario')

      const saved = await repo.upsertRequisito(requisito)
      const list = await repo.listRequisitosPorRol('rol-voluntario')

      expect(saved).toEqual(requisito)
      expect(list).toHaveLength(1)
      expect(list[0]).toEqual(requisito)
    })

    it('updates an existing requisito on upsert', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const original = makeRequisito('req-1', 'rol-voluntario')
      await repo.upsertRequisito(original)

      const updated = { ...original, label: 'Updated label' }
      const saved = await repo.upsertRequisito(updated)
      const list = await repo.listRequisitosPorRol('rol-voluntario')

      expect(saved.label).toBe('Updated label')
      expect(list).toHaveLength(1)
      expect(list[0].label).toBe('Updated label')
    })

    it('filters requisitos by rolId', async () => {
      const repo = createInMemoryDreamTeamRepository()
      await repo.upsertRequisito(makeRequisito('req-1', 'rol-voluntario'))
      await repo.upsertRequisito(makeRequisito('req-2', 'rol-lider'))

      const list = await repo.listRequisitosPorRol('rol-lider')

      expect(list).toHaveLength(1)
      expect(list[0].id).toBe('req-2')
    })
  })

  describe('Verificación de requisitos', () => {
    it('inserts a verificacion and lists it by servicio', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const created = await repo.createServicio(makeServicioInput())
      const verificacion = makeVerificacion('ver-1', created.id, 'req-1')

      const saved = await repo.upsertRequisitoVerificacion(verificacion)
      const list = await repo.listRequisitoVerificaciones(created.id)

      expect(saved).toEqual(verificacion)
      expect(list).toHaveLength(1)
      expect(list[0]).toEqual(verificacion)
    })

    it('updates the estado of an existing verificacion', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const created = await repo.createServicio(makeServicioInput())
      const original = makeVerificacion('ver-1', created.id, 'req-1')
      await repo.upsertRequisitoVerificacion(original)

      const updated = { ...original, estado: 'completado' as const, fechaVerificacion: '2026-07-07T00:00:00.000Z' }
      const saved = await repo.upsertRequisitoVerificacion(updated)
      const list = await repo.listRequisitoVerificaciones(created.id)

      expect(saved.estado).toBe('completado')
      expect(list).toHaveLength(1)
      expect(list[0].estado).toBe('completado')
    })
  })

  describe('countServiciosByEstado', () => {
    it('counts services by estado', async () => {
      const repo = createInMemoryDreamTeamRepository()
      await repo.createServicio(makeServicioInput({ estado: 'activo' }))
      await repo.createServicio(makeServicioInput({ estado: 'activo' }))
      await repo.createServicio(makeServicioInput({ estado: 'en_pausa' }))

      expect(await repo.countServiciosByEstado('activo')).toBe(2)
      expect(await repo.countServiciosByEstado('en_pausa')).toBe(1)
      expect(await repo.countServiciosByEstado('retirado')).toBe(0)
    })
  })

  describe('Equipos and Roles', () => {
    it('lists seeded equipos', async () => {
      const equipos = [makeEquipo('equipo-a'), makeEquipo('equipo-b')]
      const repo = createInMemoryDreamTeamRepository({ seed: { equipos } })

      const result = await repo.listEquipos()

      expect(result).toEqual(equipos)
    })

    it('lists roles for a given equipo', async () => {
      const roles = [makeRol('rol-a', 'equipo-1'), makeRol('rol-b', 'equipo-1'), makeRol('rol-c', 'equipo-2')]
      const repo = createInMemoryDreamTeamRepository({ seed: { roles } })

      const result = await repo.listRolesPorEquipo('equipo-1')

      expect(result).toHaveLength(2)
      expect(result.map((r) => r.id)).toEqual(['rol-a', 'rol-b'])
    })
  })

  describe('Participation events', () => {
    it('appends an event and assigns an id', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const created = await repo.createServicio(makeServicioInput())
      const input = makeParticipationEvent({ servicioId: created.id, personaId: created.personaId })

      const event = await repo.appendParticipationEvent(input)

      expect(event.id).toMatch(/^[0-9a-fA-F-]{36}$/)
      expect(event).toMatchObject(input)
    })

    it('lists events by servicio', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const created = await repo.createServicio(makeServicioInput())
      const input = makeParticipationEvent({ servicioId: created.id, personaId: created.personaId })
      await repo.appendParticipationEvent(input)

      const list = await repo.listParticipationEvents(created.id)

      expect(list).toHaveLength(1)
      expect(list[0].tipoEvento).toBe('service_state_changed')
    })

    it('lists events by persona', async () => {
      const repo = createInMemoryDreamTeamRepository()
      const ana = makePersonaId('persona-ana')
      const luis = makePersonaId('persona-luis')
      const created = await repo.createServicio(makeServicioInput({ personaId: ana }))
      await repo.appendParticipationEvent(makeParticipationEvent({ servicioId: created.id, personaId: ana }))
      await repo.appendParticipationEvent(makeParticipationEvent({ servicioId: 'other', personaId: luis }))

      const list = await repo.listParticipationEventsByPersona(ana)

      expect(list).toHaveLength(1)
      expect(list[0].personaId).toBe(ana)
    })
  })

  describe('Caso Ana', () => {
    it('keeps two services isolated when one is paused', async () => {
      const ana = makePersonaId('persona-ana')
      const repo = createInMemoryDreamTeamRepository({
        seed: {
          servicios: [
            {
              id: 'servicio-dps',
              personaId: ana,
              equipoId: 'equipo-dps-camara',
              rolId: 'rol-voluntario',
              estado: 'activo',
              fechaInicio: '2026-01-15',
              motivoActual: 'admin_promocion',
              version: 1,
            },
            {
              id: 'servicio-estudiantes',
              personaId: ana,
              equipoId: 'equipo-estudiantes-transit',
              rolId: 'rol-lider',
              estado: 'activo',
              fechaInicio: '2026-02-01',
              motivoActual: 'admin_promocion',
              version: 1,
            },
          ],
        },
      })

      const anaServices = await repo.listServicios({ personaId: ana })
      expect(anaServices).toHaveLength(2)

      const anaActive = await repo.listServicios({ personaId: ana, estado: 'activo' })
      expect(anaActive).toHaveLength(2)

      const dps = anaServices.find((s) => s.equipoId === 'equipo-dps-camara')!
      await repo.updateServicio(dps.id, {
        estado: 'en_pausa',
        motivoActual: 'gdv_liderazgo_removed',
        expectedVersion: dps.version,
      })

      const dpsHistorial = await repo.listHistorial(dps.id)
      expect(dpsHistorial).toHaveLength(1)
      expect(dpsHistorial[0].estadoNuevo).toBe('en_pausa')
      expect(dpsHistorial[0].motivo).toBe('gdv_liderazgo_removed')

      const estudiantes = anaServices.find((s) => s.equipoId === 'equipo-estudiantes-transit')!
      const estudiantesAfter = await repo.getServicioById(estudiantes.id)
      expect(estudiantesAfter).toEqual(estudiantes)
      expect((await repo.listHistorial(estudiantes.id))).toHaveLength(0)
    })
  })
})
