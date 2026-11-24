/**
 * S7 of odd/tasks/dream-team-estructura-correcciones.md: the delete behind
 * «Quitar de este equipo» (until 2027-01-01) only removes the row that was just
 * retired, at the version the retire left; anything else is left alone.
 */
import { borrarServicioRetirado } from '@/lib/platform/dream-team/repository-supabase'

function cliente(resultado: { data: unknown; error: unknown }) {
  const eq = jest.fn()
  const select = jest.fn().mockResolvedValue(resultado)
  const cadena = { eq, select }
  eq.mockReturnValue(cadena)
  const del = jest.fn().mockReturnValue(cadena)
  const from = jest.fn().mockReturnValue({ delete: del })
  return { client: { from } as never, from, del, eq, select }
}

describe('borrarServicioRetirado', () => {
  it('deletes only that retired servicio at that version and reports it', async () => {
    const c = cliente({ data: [{ id: 'srv-1' }], error: null })
    await expect(borrarServicioRetirado(c.client, 'srv-1', 4)).resolves.toBe(true)
    expect(c.from).toHaveBeenCalledWith('dream_team_servicios')
    expect(c.del).toHaveBeenCalledTimes(1)
    expect(c.eq.mock.calls).toEqual([
      ['id', 'srv-1'],
      ['version', 4],
      ['estado', 'retirado'],
    ])
    expect(c.select).toHaveBeenCalledWith('id')
  })

  it('reports false when no row matched (changed meanwhile)', async () => {
    await expect(borrarServicioRetirado(cliente({ data: [], error: null }).client, 'srv-1', 4)).resolves.toBe(false)
    await expect(borrarServicioRetirado(cliente({ data: null, error: null }).client, 'srv-1', 4)).resolves.toBe(false)
  })

  it('throws the database error', async () => {
    const error = { message: 'boom', code: '42501' }
    await expect(borrarServicioRetirado(cliente({ data: null, error }).client, 'srv-1', 4)).rejects.toBe(error)
  })
})
