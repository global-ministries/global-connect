import {
  cancelarInvitacionCuenta,
  parseFilasEstados,
  parseIds,
  reenviarInvitaciones,
  resumirInvitaciones,
  VENCE_INVITACION_MS,
  type DependenciasCancelar,
  type FilaEstado,
} from '@/lib/platform/cuentas/invitaciones-pendientes'
import type { DependenciasInvitacion } from '@/lib/platform/cuentas/invitacion-cuenta'

const ANA = '11111111-1111-4111-8111-111111111111'
const LUIS = '22222222-2222-4222-8222-222222222222'
const AHORA = new Date('2026-11-02T12:00:00.000Z')
const hace = (ms: number) => new Date(AHORA.getTime() - ms).toISOString()

function fila(over: Partial<FilaEstado> = {}): FilaEstado {
  return {
    usuarioId: ANA,
    id: 'inv-1',
    estado: 'enviada',
    email: 'ana@example.test',
    createdAt: hace(60_000),
    aceptadaAt: null,
    invitadoPorNombre: 'Marta Díaz',
    ...over,
  }
}

describe('VENCE_INVITACION_MS', () => {
  it('is 24 hours (S4)', () => {
    expect(VENCE_INVITACION_MS).toBe(24 * 60 * 60 * 1000)
  })
})

describe('parseFilasEstados', () => {
  it('maps the RPC rows', () => {
    expect(
      parseFilasEstados([
        {
          usuario_id: ANA,
          id: 'inv-1',
          estado: 'aceptada',
          email: 'ana@example.test',
          created_at: '2026-10-01T10:00:00Z',
          aceptada_at: '2026-10-01T11:00:00Z',
          invitado_por_nombre: 'Marta Díaz',
        },
      ]),
    ).toEqual([
      {
        usuarioId: ANA,
        id: 'inv-1',
        estado: 'aceptada',
        email: 'ana@example.test',
        createdAt: '2026-10-01T10:00:00Z',
        aceptadaAt: '2026-10-01T11:00:00Z',
        invitadoPorNombre: 'Marta Díaz',
      },
    ])
  })

  it('drops malformed rows and keeps the valid ones', () => {
    const valida = {
      usuario_id: ANA,
      id: 'inv-1',
      estado: 'enviada',
      email: 'ana@example.test',
      created_at: '2026-10-01T10:00:00Z',
      aceptada_at: null,
      invitado_por_nombre: null,
    }
    const filas = parseFilasEstados([
      null,
      'texto',
      { ...valida, usuario_id: null },
      { ...valida, id: '' },
      { ...valida, estado: 'rara' },
      { ...valida, created_at: 'no es fecha' },
      { ...valida, email: 42 },
      valida,
    ])
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ id: 'inv-1', invitadoPorNombre: null, aceptadaAt: null })
  })

  it('returns an empty list for a non-array answer', () => {
    expect(parseFilasEstados(null)).toEqual([])
    expect(parseFilasEstados({})).toEqual([])
  })
})

describe('resumirInvitaciones', () => {
  it('shows an invitation sent just under 24 h ago as enviada', () => {
    const [r] = resumirInvitaciones([fila({ createdAt: hace(VENCE_INVITACION_MS - 1000) })], AHORA)
    expect(r.estado).toBe('enviada')
  })

  it('shows an invitation sent just over 24 h ago as vencida', () => {
    const [r] = resumirInvitaciones([fila({ createdAt: hace(VENCE_INVITACION_MS + 1000) })], AHORA)
    expect(r.estado).toBe('vencida')
  })

  it('shows an accepted latest invitation as registrada', () => {
    const [r] = resumirInvitaciones(
      [fila({ estado: 'aceptada', createdAt: hace(3 * VENCE_INVITACION_MS), aceptadaAt: hace(VENCE_INVITACION_MS) })],
      AHORA,
    )
    expect(r).toMatchObject({ estado: 'registrada', aceptadaEl: hace(VENCE_INVITACION_MS) })
  })

  it('shows a cancelled latest invitation as sin_invitar and keeps email and history', () => {
    const resumen = resumirInvitaciones(
      [
        fila({ id: 'inv-1', estado: 'cancelada', createdAt: hace(5000), invitadoPorNombre: 'Marta Díaz' }),
        fila({ id: 'inv-0', estado: 'cancelada', createdAt: hace(9000), email: 'viejo@example.test', invitadoPorNombre: null }),
      ],
      AHORA,
    )
    expect(resumen).toEqual([
      {
        usuarioId: ANA,
        estado: 'sin_invitar',
        email: 'ana@example.test',
        enviadaEl: hace(5000),
        aceptadaEl: null,
        invitadoPor: 'Marta Díaz',
        envios: 2,
        historial: [
          { estado: 'cancelada', email: 'viejo@example.test', fecha: hace(9000), invitadoPor: null },
          { estado: 'cancelada', email: 'ana@example.test', fecha: hace(5000), invitadoPor: 'Marta Díaz' },
        ],
      },
    ])
  })

  it('treats an expirada latest invitation as sin_invitar', () => {
    const [r] = resumirInvitaciones([fila({ estado: 'expirada' })], AHORA)
    expect(r.estado).toBe('sin_invitar')
  })

  it('counts every row as one send and summarizes each person from the latest row', () => {
    const resumen = resumirInvitaciones(
      [
        fila({ usuarioId: LUIS, id: 'l-1', estado: 'enviada', createdAt: hace(1000), email: 'luis@example.test' }),
        fila({ id: 'a-2', estado: 'enviada', createdAt: hace(2000), invitadoPorNombre: 'Pedro' }),
        fila({ id: 'a-1', estado: 'cancelada', createdAt: hace(3 * VENCE_INVITACION_MS) }),
        fila({ id: 'a-0', estado: 'cancelada', createdAt: hace(4 * VENCE_INVITACION_MS) }),
      ],
      AHORA,
    )
    expect(resumen.map((r) => [r.usuarioId, r.estado, r.envios, r.invitadoPor])).toEqual([
      [LUIS, 'enviada', 1, 'Marta Díaz'],
      [ANA, 'enviada', 3, 'Pedro'],
    ])
    expect(resumen[1].historial.map((h) => h.fecha)).toEqual([
      hace(4 * VENCE_INVITACION_MS),
      hace(3 * VENCE_INVITACION_MS),
      hace(2000),
    ])
  })

  it('returns nothing for no rows', () => {
    expect(resumirInvitaciones([], AHORA)).toEqual([])
  })
})

describe('parseIds', () => {
  it('validates, lowercases and dedupes the ids', () => {
    expect(parseIds({ ids: [ANA, ANA.toUpperCase(), LUIS] }, 10)).toEqual({ ids: [ANA, LUIS] })
    expect(parseIds({ ids: [] }, 10)).toEqual({ ids: [] })
  })

  it('refuses a bad body, a bad id or too many ids', () => {
    expect(parseIds(null, 10)).toEqual({ error: 'Body inválido' })
    expect(parseIds({ ids: 'x' }, 10)).toEqual({ error: 'Body inválido' })
    expect(parseIds({ ids: [ANA, 'x'] }, 10)).toEqual({ error: 'Persona inválida' })
    expect(parseIds({ ids: [ANA, 7] }, 10)).toEqual({ error: 'Persona inválida' })
    expect(parseIds({ ids: [ANA, LUIS] }, 1)).toEqual({ error: 'Demasiadas personas (máximo 1)' })
  })
})

function crearDepsCancelar(over: {
  cancelar?: { data: unknown; error: { code?: string; message?: string } | null }
  cuenta?: { email: string; email_confirmed_at: string | null } | null
  borrar?: { error: { message: string } | null }
} = {}) {
  const llamadas: { nombre: string; args: Record<string, unknown> }[] = []
  const consultados: string[] = []
  const borrados: string[] = []
  const deps: DependenciasCancelar = {
    rpcUsuario: async (nombre, args) => {
      llamadas.push({ nombre, args })
      return over.cancelar ?? { data: { id: 'inv-1', auth_user_id: 'auth-1' }, error: null }
    },
    admin: {
      obtenerUsuario: async (id) => {
        consultados.push(id)
        return over.cuenta === undefined ? { email: 'ana@example.test', email_confirmed_at: null } : over.cuenta
      },
      borrarUsuario: async (id) => {
        borrados.push(id)
        return over.borrar ?? { error: null }
      },
    },
  }
  return { deps, llamadas, consultados, borrados }
}

describe('cancelarInvitacionCuenta', () => {
  it('cancels as the caller and deletes the never-confirmed auth account (S6)', async () => {
    const t = crearDepsCancelar()
    expect(await cancelarInvitacionCuenta(t.deps, ANA)).toEqual({ ok: true })
    expect(t.llamadas).toEqual([{ nombre: 'invitacion_cuenta_cancelar', args: { p_usuario_id: ANA } }])
    expect(t.borrados).toEqual(['auth-1'])
  })

  it('keeps a confirmed auth account', async () => {
    const t = crearDepsCancelar({ cuenta: { email: 'ana@example.test', email_confirmed_at: '2026-10-01T00:00:00Z' } })
    expect(await cancelarInvitacionCuenta(t.deps, ANA)).toEqual({ ok: true })
    expect(t.borrados).toEqual([])
  })

  it('does nothing in auth when the invitation has no account or it no longer exists', async () => {
    const sinCuenta = crearDepsCancelar({ cancelar: { data: { id: 'inv-1', auth_user_id: null }, error: null } })
    expect(await cancelarInvitacionCuenta(sinCuenta.deps, ANA)).toEqual({ ok: true })
    expect(sinCuenta.consultados).toEqual([])
    const borrada = crearDepsCancelar({ cuenta: null })
    expect(await cancelarInvitacionCuenta(borrada.deps, ANA)).toEqual({ ok: true })
    expect(borrada.borrados).toEqual([])
  })

  it('still succeeds when deleting the account fails, logging the invitation id only', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    const t = crearDepsCancelar({ borrar: { error: { message: 'boom' } } })
    expect(await cancelarInvitacionCuenta(t.deps, ANA)).toEqual({ ok: true })
    expect(log).toHaveBeenCalledWith(expect.any(String), 'inv-1')
    expect(JSON.stringify(log.mock.calls)).not.toContain('@')
    log.mockRestore()
  })

  it.each([
    [{ code: '42501', message: 'sin_autoridad' }, 403, 'No tienes permiso para cancelar esta invitación'],
    [{ code: 'P0002', message: 'sin_invitacion_abierta' }, 409, 'Esta persona no tiene una invitación abierta'],
    [{ code: 'XX000', message: 'otra cosa' }, 500, 'No se pudo cancelar la invitación'],
  ])('maps %o to %i and touches no auth account', async (error, status, mensaje) => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    const t = crearDepsCancelar({ cancelar: { data: null, error } })
    expect(await cancelarInvitacionCuenta(t.deps, ANA)).toMatchObject({ ok: false, status, error: mensaje })
    expect(t.consultados).toEqual([])
    expect(t.borrados).toEqual([])
    log.mockRestore()
  })
})

function crearDepsReenviar(filas: unknown, over: {
  estadosError?: { code?: string; message?: string }
  crearError?: Record<string, { code?: string; message?: string }>
} = {}) {
  const llamadasUsuario: { nombre: string; args: Record<string, unknown> }[] = []
  const correos: string[] = []
  const deps: DependenciasInvitacion = {
    rpcUsuario: async (nombre, args) => {
      llamadasUsuario.push({ nombre, args })
      if (nombre === 'invitacion_cuenta_estados') {
        return over.estadosError ? { data: null, error: over.estadosError } : { data: filas, error: null }
      }
      const id = args.p_usuario_id as string
      const error = over.crearError?.[id]
      if (error) return { data: null, error }
      return { data: { id: `nueva-${id}`, email: args.p_email, nombre: 'X', auth_user_id_previo: null }, error: null }
    },
    admin: {
      rpc: async () => ({ data: null, error: null }),
      obtenerUsuario: async () => null,
      borrarUsuario: async () => ({ error: null }),
      generarEnlace: async () => ({ data: { userId: 'auth-n', hashedToken: 'h' }, error: null }),
    },
    enviarCorreo: async ({ to }) => {
      correos.push(to)
      return { success: true }
    },
    urlBase: 'https://app.example.test',
  }
  return { deps, llamadasUsuario, correos }
}

const filaRpc = (usuario_id: string, email: string, created_at: string, estado = 'enviada') => ({
  usuario_id, id: `inv-${email}`, estado, email, created_at, aceptada_at: null, invitado_por_nombre: null,
})

describe('reenviarInvitaciones', () => {
  const SIN = '33333333-3333-4333-8333-333333333333'

  it('resends each person to the email of their latest invitation, sequentially, and reports per person', async () => {
    const t = crearDepsReenviar(
      [
        filaRpc(ANA, 'viejo@example.test', '2026-10-01T10:00:00Z', 'cancelada'),
        filaRpc(ANA, 'ana@example.test', '2026-10-02T10:00:00Z'),
        filaRpc(LUIS, 'luis@example.test', '2026-10-03T10:00:00Z'),
      ],
      { crearError: { [LUIS]: { code: '23505', message: 'email_en_uso' } } },
    )
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    const r = await reenviarInvitaciones(t.deps, [ANA, LUIS, SIN])
    log.mockRestore()

    expect(r).toEqual({
      ok: true,
      resultados: [
        { id: ANA, ok: true, email: 'ana@example.test' },
        { id: LUIS, ok: false, error: 'Ese correo ya pertenece a otra persona o a otra cuenta' },
        { id: SIN, ok: false, error: 'No hay una invitación para reenviar' },
      ],
    })
    expect(t.llamadasUsuario).toEqual([
      { nombre: 'invitacion_cuenta_estados', args: { p_usuario_ids: [ANA, LUIS, SIN] } },
      { nombre: 'invitacion_cuenta_crear', args: { p_usuario_id: ANA, p_email: 'ana@example.test', p_reemplazar_email: false } },
      { nombre: 'invitacion_cuenta_crear', args: { p_usuario_id: LUIS, p_email: 'luis@example.test', p_reemplazar_email: false } },
    ])
    expect(t.correos).toEqual(['ana@example.test'])
  })

  it('fails as a whole when the states cannot be read', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    const t = crearDepsReenviar(null, { estadosError: { code: 'XX000', message: 'boom' } })
    expect(await reenviarInvitaciones(t.deps, [ANA])).toEqual({
      ok: false, status: 500, error: 'No se pudieron leer las invitaciones',
    })
    expect(t.llamadasUsuario).toHaveLength(1)
    log.mockRestore()
  })
})
