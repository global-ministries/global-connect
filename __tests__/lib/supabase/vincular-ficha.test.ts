import { vincularFichaConfirmada } from '@/lib/supabase/vincular-ficha'

type Ficha = { id: string; auth_id: string | null; email: string | null; cedula: string | null }

/** Minimal in-memory stand-in for the `usuarios` table, enough for the linker's queries. */
function crearAdmin(fichas: Ficha[]) {
  const tabla = fichas.map((f) => ({ ...f }))
  const inserts: Record<string, unknown>[] = []
  const updates: { valores: Record<string, unknown>; filtros: [string, unknown][] }[] = []

  function consulta() {
    const filtros: [string, unknown][] = []
    const filtrar = () =>
      tabla.filter((fila) =>
        filtros.every(([col, val]) => (fila as Record<string, unknown>)[col] === val),
      )
    const builder = {
      eq(col: string, val: unknown) {
        filtros.push([col, val])
        return builder
      },
      is(col: string, val: unknown) {
        filtros.push([col, val])
        return builder
      },
      order() {
        return builder
      },
      then(resolve: (r: { data: Ficha[]; error: null }) => unknown) {
        return Promise.resolve({ data: filtrar(), error: null }).then(resolve)
      },
    }
    return { builder, filtros, filtrar }
  }

  const from = jest.fn(() => ({
    select: () => consulta().builder,
    insert: (filas: Record<string, unknown>[]) => {
      inserts.push(...filas)
      return Promise.resolve({ error: null })
    },
    update: (valores: Record<string, unknown>) => {
      const c = consulta()
      const registro = { valores, filtros: c.filtros }
      updates.push(registro)
      const builder = {
        ...c.builder,
        eq(col: string, val: unknown) {
          c.filtros.push([col, val])
          return builder
        },
        is(col: string, val: unknown) {
          c.filtros.push([col, val])
          return builder
        },
        then(resolve: (r: { error: null }) => unknown) {
          for (const fila of c.filtrar()) Object.assign(fila, valores)
          return Promise.resolve({ error: null }).then(resolve)
        },
      }
      return builder
    },
  }))

  return { admin: { from } as never, tabla, inserts, updates }
}

function usuario(over: Partial<{ email_confirmed_at: string | null; cedula: string }> = {}) {
  return {
    id: 'auth-1',
    email: 'bea@example.com',
    email_confirmed_at: 'email_confirmed_at' in over ? over.email_confirmed_at : '2026-10-04T00:00:00Z',
    user_metadata: { nombre: 'Beatriz', apellido: 'Paz', cedula: over.cedula ?? 'V-22.328.215' },
  }
}

describe('vincularFichaConfirmada', () => {
  it('does nothing while the email is not confirmed', async () => {
    const { admin, tabla, inserts } = crearAdmin([
      { id: 'f1', auth_id: null, email: 'bea@example.com', cedula: null },
    ])
    const res = await vincularFichaConfirmada(admin, usuario({ email_confirmed_at: null }))
    expect(res.estado).toBe('sin_confirmar')
    expect(tabla[0].auth_id).toBeNull()
    expect(inserts).toHaveLength(0)
  })

  it('is idempotent when a ficha already belongs to this account', async () => {
    const { admin, inserts, updates } = crearAdmin([
      { id: 'f1', auth_id: 'auth-1', email: 'bea@example.com', cedula: null },
    ])
    const res = await vincularFichaConfirmada(admin, usuario())
    expect(res.estado).toBe('ya_vinculada')
    expect(inserts).toHaveLength(0)
    expect(updates).toHaveLength(0)
  })

  it('links the unclaimed ficha that has the confirmed email', async () => {
    const { admin, tabla, inserts } = crearAdmin([
      { id: 'f1', auth_id: null, email: 'bea@example.com', cedula: '99999999' },
    ])
    const res = await vincularFichaConfirmada(admin, usuario())
    expect(res.estado).toBe('vinculada')
    expect(tabla[0].auth_id).toBe('auth-1')
    expect(inserts).toHaveLength(0)
  })

  it('only claims a ficha whose auth_id is still null when updating', async () => {
    const { admin, updates } = crearAdmin([
      { id: 'f1', auth_id: null, email: 'bea@example.com', cedula: null },
    ])
    await vincularFichaConfirmada(admin, usuario())
    expect(updates[0].filtros).toEqual(expect.arrayContaining([['id', 'f1'], ['auth_id', null]]))
  })

  it('refuses and stays unlinked when several fichas share the confirmed email', async () => {
    const { admin, tabla, inserts } = crearAdmin([
      { id: 'f1', auth_id: null, email: 'bea@example.com', cedula: null },
      { id: 'f2', auth_id: null, email: 'bea@example.com', cedula: null },
    ])
    const res = await vincularFichaConfirmada(admin, usuario())
    expect(res.estado).toBe('ambigua')
    expect(tabla.every((f) => f.auth_id === null)).toBe(true)
    expect(inserts).toHaveLength(0)
  })

  it('links by cedula when that ficha has no email', async () => {
    const { admin, tabla } = crearAdmin([
      { id: 'f1', auth_id: null, email: null, cedula: '22328215' },
    ])
    const res = await vincularFichaConfirmada(admin, usuario())
    expect(res.estado).toBe('vinculada')
    expect(tabla[0].auth_id).toBe('auth-1')
  })

  it('never links by cedula a ficha that carries a different email', async () => {
    const { admin, tabla, inserts } = crearAdmin([
      { id: 'f1', auth_id: null, email: 'otra@example.com', cedula: '22328215' },
    ])
    const res = await vincularFichaConfirmada(admin, usuario())
    expect(res.estado).toBe('creada')
    expect(tabla[0].auth_id).toBeNull()
    // The cedula is UNIQUE and belongs to someone else's ficha: the placeholder goes without it.
    expect(inserts).toEqual([expect.objectContaining({ auth_id: 'auth-1', cedula: null })])
  })

  it('never takes a ficha that already has an account', async () => {
    const { admin, tabla, inserts } = crearAdmin([
      { id: 'f1', auth_id: 'auth-otra', email: null, cedula: '22328215' },
    ])
    const res = await vincularFichaConfirmada(admin, usuario())
    expect(res.estado).toBe('creada')
    expect(tabla[0].auth_id).toBe('auth-otra')
    expect(inserts).toEqual([expect.objectContaining({ cedula: null })])
  })

  it('creates the placeholder ficha with the normalized cedula when nothing matches', async () => {
    const { admin, inserts } = crearAdmin([])
    const res = await vincularFichaConfirmada(admin, usuario())
    expect(res.estado).toBe('creada')
    expect(inserts).toEqual([
      expect.objectContaining({
        auth_id: 'auth-1',
        nombre: 'Beatriz',
        apellido: 'Paz',
        email: 'bea@example.com',
        cedula: '22328215',
      }),
    ])
  })
})
