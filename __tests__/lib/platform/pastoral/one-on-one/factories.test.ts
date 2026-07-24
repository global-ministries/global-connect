/**
 * W05 — DT-031 — Pastoral 1:1 Repository factory tests.
 * F(pastoral/one-on-one/factories)
 *
 * Tests that the factory creates the correct repository based on the useFake flag.
 */
import { createPastoralOneOnOneRepository } from '@/lib/platform/pastoral/one-on-one/factories'

describe('createPastoralOneOnOneRepository — factory', () => {
  it('creates a fake repository when useFake=true', () => {
    const repo = createPastoralOneOnOneRepository({ useFake: true })
    // Verify it has all required methods from the interface
    expect(typeof repo.createOneOnOne).toBe('function')
    expect(typeof repo.getOneOnOneById).toBe('function')
    expect(typeof repo.listOneOnOnes).toBe('function')
    expect(typeof repo.updateOneOnOne).toBe('function')
    expect(typeof repo.addParticipante).toBe('function')
    expect(typeof repo.listParticipantes).toBe('function')
    expect(typeof repo.addNota).toBe('function')
    expect(typeof repo.listNotas).toBe('function')
    expect(typeof repo.emitPastoralEvent).toBe('function')
  })

  it('the fake repository is functional (happy path)', async () => {
    const repo = createPastoralOneOnOneRepository({ useFake: true })
    const created = await repo.createOneOnOne({
      mentorOficialPersonaId: 'mentor-factory-test',
      autorPersonaId: 'autor-factory-test',
    })
    expect(created.id).toBeDefined()
    expect(created.version).toBe(1)
    expect(created.estado).toBe('pending_participant')
  })
})
