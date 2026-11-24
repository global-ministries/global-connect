/**
 * S7 of odd/tasks/dream-team-estructura-correcciones.md (T8, T8b): the delete
 * behind «Quitar de este equipo» and «Cambiar etapa» → Retirado (until
 * 2027-01-01) goes through the same SQL function the cambiar-área RPCs call,
 * dream_team_servicio_borrar_si_sin_historial: it removes the servicio only
 * when it is retirado, before that date and without attendance records, and
 * says whether it did.
 */
import { borrarServicioRetirado } from '@/lib/platform/dream-team/repository-supabase'

function cliente(resultado: { data: unknown; error: unknown }) {
  const rpc = jest.fn().mockResolvedValue(resultado)
  const from = jest.fn()
  return { client: { rpc, from } as never, rpc, from }
}

describe('borrarServicioRetirado', () => {
  it('asks the SQL function to delete that servicio and reports it was deleted', async () => {
    const c = cliente({ data: true, error: null })
    await expect(borrarServicioRetirado(c.client, 'srv-1')).resolves.toBe(true)
    expect(c.rpc).toHaveBeenCalledTimes(1)
    expect(c.rpc).toHaveBeenCalledWith('dream_team_servicio_borrar_si_sin_historial', { p_servicio: 'srv-1' })
    // No direct table delete: the SQL function owns the rules.
    expect(c.from).not.toHaveBeenCalled()
  })

  it('reports false when the function kept it (not retirado, after the date or with attendance)', async () => {
    await expect(borrarServicioRetirado(cliente({ data: false, error: null }).client, 'srv-1')).resolves.toBe(false)
    await expect(borrarServicioRetirado(cliente({ data: null, error: null }).client, 'srv-1')).resolves.toBe(false)
  })

  it('throws the database error', async () => {
    const error = { message: 'boom', code: '42501' }
    await expect(borrarServicioRetirado(cliente({ data: null, error }).client, 'srv-1')).rejects.toBe(error)
  })
})
