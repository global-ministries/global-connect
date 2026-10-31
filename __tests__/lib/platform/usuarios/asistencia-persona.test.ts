/**
 * cargarAsistenciaPersona: reads obtener_asistencia_persona (S13 of
 * odd/tasks/sistema-diseno-v2.md) and maps it to the Asistencia tab model.
 * NULL from the RPC means the caller may not see it; an RPC error throws.
 */
import { aAsistenciaPersona, cargarAsistenciaPersona } from '@/lib/platform/usuarios/asistencia-persona'

const respuesta = {
  desde: '2026-08-01',
  hasta: '2026-10-29',
  grupos: [
    {
      tipo: 'gdv', id: 'g1', nombre: 'Familias Unidas', area: 'Matrimonios', rol: 'Miembro',
      actual: true, desde: '2026-02-01', salio: null, completado: null, total_sesiones: null,
      marcas: [
        { fecha: '2026-10-20', presente: true, era_visitante: false },
        { fecha: '2026-10-13', presente: false, era_visitante: false },
        { fecha: '2026-10-06', presente: true, era_visitante: false },
      ],
    },
    {
      tipo: 'estudiantes', id: 'e1', nombre: 'Chicos Norte', area: 'The Living Room · Grupos de Chicos', rol: 'Visitante',
      actual: false, desde: '2026-03-01', salio: '2026-09-01', completado: null, total_sesiones: null,
      marcas: [{ fecha: '2026-08-10', presente: true, era_visitante: true }],
    },
    {
      tipo: 'talleres', id: 't1', nombre: 'Finanzas', area: 'Grupo A', rol: 'Participante',
      actual: true, desde: null, salio: null, completado: false, total_sesiones: 6, marcas: [],
    },
    { tipo: 'otro', id: 'x', nombre: 'Ignorado', marcas: [] },
  ],
}

describe('aAsistenciaPersona', () => {
  it('maps every group with camelCase fields and per-group totals', () => {
    const a = aAsistenciaPersona(respuesta)
    expect(a.desde).toBe('2026-08-01')
    expect(a.hasta).toBe('2026-10-29')
    expect(a.grupos.map((g) => `${g.tipo}:${g.id}`)).toEqual(['gdv:g1', 'estudiantes:e1', 'talleres:t1'])
    expect(a.grupos[0]).toEqual({
      tipo: 'gdv', id: 'g1', nombre: 'Familias Unidas', area: 'Matrimonios', rol: 'Miembro',
      actual: true, desde: '2026-02-01', salio: null, completado: null, totalSesiones: null,
      marcas: [
        { fecha: '2026-10-06', presente: true, eraVisitante: false },
        { fecha: '2026-10-13', presente: false, eraVisitante: false },
        { fecha: '2026-10-20', presente: true, eraVisitante: false },
      ],
      totales: { reuniones: 3, presentes: 2, porcentaje: 67 },
    })
  })

  it('keeps the visitor flag, the leave date and the taller fields', () => {
    const a = aAsistenciaPersona(respuesta)
    expect(a.grupos[1]).toMatchObject({ rol: 'Visitante', actual: false, salio: '2026-09-01', marcas: [{ eraVisitante: true }] })
    expect(a.grupos[2]).toMatchObject({ completado: false, totalSesiones: 6, totales: { reuniones: 0, presentes: 0, porcentaje: null } })
  })

  it('a malformed payload reads as no groups', () => {
    expect(aAsistenciaPersona({ desde: '2026-01-01', hasta: '2026-02-01' }).grupos).toEqual([])
  })
})

describe('cargarAsistenciaPersona', () => {
  const cliente = (resultado: { data: unknown; error: unknown }) => {
    const rpc = jest.fn().mockResolvedValue(resultado)
    return { rpc, supabase: { rpc } as never }
  }

  it('calls the RPC with the person, the caller and the range', async () => {
    const { rpc, supabase } = cliente({ data: respuesta, error: null })
    const a = await cargarAsistenciaPersona(supabase, { usuarioId: 'u-1', authId: 'auth-1', desde: '2026-08-01', hasta: '2026-10-29' })
    expect(rpc).toHaveBeenCalledWith('obtener_asistencia_persona', {
      p_usuario_id: 'u-1', p_auth_id: 'auth-1', p_fecha_inicio: '2026-08-01', p_fecha_fin: '2026-10-29',
    })
    expect(a?.grupos).toHaveLength(3)
  })

  it('leaves the range to the database defaults when not given', async () => {
    const { rpc, supabase } = cliente({ data: respuesta, error: null })
    await cargarAsistenciaPersona(supabase, { usuarioId: 'u-1', authId: 'auth-1' })
    expect(rpc).toHaveBeenCalledWith('obtener_asistencia_persona', { p_usuario_id: 'u-1', p_auth_id: 'auth-1' })
  })

  it('returns null when the caller may not see it', async () => {
    const { supabase } = cliente({ data: null, error: null })
    await expect(cargarAsistenciaPersona(supabase, { usuarioId: 'u-1', authId: 'auth-1' })).resolves.toBeNull()
  })

  it('throws on an RPC error', async () => {
    const { supabase } = cliente({ data: null, error: { message: 'boom' } })
    await expect(cargarAsistenciaPersona(supabase, { usuarioId: 'u-1', authId: 'auth-1' })).rejects.toThrow(
      'obtener_asistencia_persona: boom',
    )
  })
})
