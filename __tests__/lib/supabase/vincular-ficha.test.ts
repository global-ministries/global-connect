import { vincularFichaConfirmada } from '@/lib/supabase/vincular-ficha'

type Ficha = { id: string; auth_id: string | null; email: string | null; cedula: string | null }

/** Minimal in-memory stand-in for the `usuarios` table, enough for the linker's queries. */
function crearAdmin(fichas: Ficha[]) {
  const tabla = fichas.map((f) => ({ ...f }))
  const inserts: Record<string, unknown>[] = []
  const updates: { valores: Record<string, unknown>; filtros: [string, unknown][] }[] = []

  function consulta() {
    const filtros: [string, unknown][] = []
    const patrones: [string, RegExp][] = []
    const filtrar = () =>
      tabla.filter(
        (fila) =>
          filtros.every(([col, val]) => (fila as Record<string, unknown>)[col] === val) &&
          patrones.every(([col, re]) => re.test(String((fila as Record<string, unknown>)[col] ?? ''))),
      )
    const builder = {
      // ILIKE semantics: % and _ are wildcards unless escaped with a backslash.
      ilike(col: string, patron: string) {
        let re = ''
        for (let i = 0; i < patron.length; i++) {
          const c = patron[i]
          if (c === '\\' && i + 1 < patron.length) re += patron[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          else if (c === '%') re += '.*'
          else if (c === '_') re += '.'
          else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        }
        // eslint-disable-next-line security/detect-non-literal-regexp -- test double, pattern built from escaped fixtures
        patrones.push([col, new RegExp(`^${re}$`, 'i')])
        return builder
      },
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

  it('matches the confirmed email case-insensitively', async () => {
    const { admin, tabla } = crearAdmin([
      { id: 'f1', auth_id: null, email: 'Bea@Example.COM', cedula: null },
    ])
    const res = await vincularFichaConfirmada(admin, usuario())
    expect(res.estado).toBe('vinculada')
    expect(tabla[0].auth_id).toBe('auth-1')
  })

  it('treats % and _ in the email literally', async () => {
    const { admin, tabla } = crearAdmin([
      { id: 'f1', auth_id: null, email: 'bxa@example.com', cedula: null },
      { id: 'f2', auth_id: null, email: 'b%a@example.com', cedula: null },
    ])
    const res = await vincularFichaConfirmada(admin, { ...usuario(), email: 'b_a@example.com' })
    expect(res.estado).toBe('creada')
    expect(tabla.every((f) => f.auth_id === null)).toBe(true)
  })

  it('refuses when the email matches several fichas that differ only in case', async () => {
    const { admin, tabla } = crearAdmin([
      { id: 'f1', auth_id: null, email: 'bea@example.com', cedula: null },
      { id: 'f2', auth_id: null, email: 'BEA@example.com', cedula: null },
    ])
    const res = await vincularFichaConfirmada(admin, usuario())
    expect(res.estado).toBe('ambigua')
    expect(tabla.every((f) => f.auth_id === null)).toBe(true)
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
