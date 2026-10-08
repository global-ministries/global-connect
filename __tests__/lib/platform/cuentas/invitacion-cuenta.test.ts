import {
  enviarInvitacionCuenta,
  mapEstadoInvitacion,
  mapInvitacionError,
  parseInvitacion,
  type DependenciasInvitacion,
} from '@/lib/platform/cuentas/invitacion-cuenta'

const FICHA = '11111111-1111-4111-8111-111111111111'

type Llamada = { nombre: string; args: Record<string, unknown> }

function crearDeps(over: {
  crear?: { data: unknown; error: { code?: string; message?: string } | null }
  previo?: { email: string; email_confirmed_at: string | null } | null
  generar?: { error: { message: string } | null }
  correo?: { success: boolean; error?: string }
} = {}) {
  const llamadasUsuario: Llamada[] = []
  const llamadasAdmin: Llamada[] = []
  const generados: Record<string, unknown>[] = []
  const borrados: string[] = []
  const correos: { to: string; subject: string; enlace: string }[] = []

  const deps: DependenciasInvitacion = {
    rpcUsuario: async (nombre, args) => {
      llamadasUsuario.push({ nombre, args })
      return (
        over.crear ?? {
          data: { id: 'inv-1', email: 'ana@example.test', nombre: 'Ana', auth_user_id_previo: null },
          error: null,
        }
      )
    },
    admin: {
      rpc: async (nombre, args) => {
        llamadasAdmin.push({ nombre, args })
        return { data: null, error: null }
      },
      obtenerUsuario: async () => (over.previo === undefined ? null : over.previo),
      borrarUsuario: async (id) => {
        borrados.push(id)
        return { error: null }
      },
      generarEnlace: async (params) => {
        generados.push(params as unknown as Record<string, unknown>)
        if (over.generar?.error) return { data: null, error: over.generar.error }
        return { data: { userId: 'auth-nuevo', hashedToken: 'hash-123' }, error: null }
      },
    },
    enviarCorreo: async ({ to, subject, enlace }) => {
      correos.push({ to, subject, enlace })
      return over.correo ?? { success: true }
    },
    urlBase: 'https://app.example.test',
  }
  return { deps, llamadasUsuario, llamadasAdmin, generados, borrados, correos }
}

describe('parseInvitacion', () => {
  it('accepts an email and the replace flag', () => {
    expect(parseInvitacion({ email: ' Ana@Example.test ', reemplazarEmail: true })).toEqual({
      email: 'ana@example.test',
      reemplazarEmail: true,
    })
  })
  it('refuses a missing or malformed email', () => {
    expect(parseInvitacion({})).toEqual({ error: 'Escribe un correo válido' })
    expect(parseInvitacion({ email: 'sin-arroba' })).toEqual({ error: 'Escribe un correo válido' })
    expect(parseInvitacion(null)).toEqual({ error: 'Body inválido' })
  })
})

describe('mapInvitacionError', () => {
  it.each([
    [{ code: '42501', message: 'sin_autoridad' }, 403],
    [{ code: 'P0002', message: 'ficha_no_encontrada' }, 404],
    [{ code: '22023', message: 'ya_tiene_cuenta' }, 409],
    [{ code: '22023', message: 'email_distinto' }, 409],
    [{ code: '23505', message: 'email_en_uso' }, 409],
    [{ code: '22023', message: 'email_invalido' }, 422],
    [{ code: 'XX000', message: 'otra cosa' }, 500],
  ])('maps %o to %i', (error, status) => {
    expect(mapInvitacionError(error).status).toBe(status)
  })
  it('flags the email replacement so the UI can ask for confirmation', () => {
    expect(mapInvitacionError({ code: '22023', message: 'email_distinto' }).codigo).toBe('email_distinto')
  })
})

describe('mapEstadoInvitacion', () => {
  it('maps the RPC answer', () => {
    expect(
      mapEstadoInvitacion({
        sin_cuenta: true,
        email_ficha: 'ana@example.test',
        invitacion: { estado: 'enviada', email: 'ana@example.test', created_at: '2026-10-08T10:00:00Z' },
      }),
    ).toEqual({
      sinCuenta: true,
      emailFicha: 'ana@example.test',
      invitacion: { estado: 'enviada', email: 'ana@example.test', enviadaEl: '2026-10-08T10:00:00Z' },
    })
    expect(mapEstadoInvitacion({ sin_cuenta: false, email_ficha: null, invitacion: null })).toEqual({
      sinCuenta: false,
      emailFicha: null,
      invitacion: null,
    })
  })
})

describe('enviarInvitacionCuenta', () => {
  it('records the invitation as the caller, creates the account and mails the confirm link', async () => {
    const t = crearDeps()
    const r = await enviarInvitacionCuenta(t.deps, FICHA, { email: 'ana@example.test', reemplazarEmail: false })

    expect(r).toEqual({ ok: true, email: 'ana@example.test' })
    expect(t.llamadasUsuario).toEqual([
      {
        nombre: 'invitacion_cuenta_crear',
        args: { p_usuario_id: FICHA, p_email: 'ana@example.test', p_reemplazar_email: false },
      },
    ])
    expect(t.generados).toEqual([
      { tipo: 'invite', email: 'ana@example.test', datos: { invitacion_cuenta_id: 'inv-1' } },
    ])
    expect(t.llamadasAdmin).toEqual([
      { nombre: 'invitacion_cuenta_registrar_envio', args: { p_id: 'inv-1', p_auth_user_id: 'auth-nuevo' } },
    ])
    expect(t.correos).toHaveLength(1)
    expect(t.correos[0].to).toBe('ana@example.test')
    expect(t.correos[0].enlace).toBe(
      'https://app.example.test/auth/confirm?token_hash=hash-123&type=invite&next=%2Fauth%2Freset-password',
    )
  })

  it('stops on a database refusal without creating an account or sending mail', async () => {
    const t = crearDeps({ crear: { data: null, error: { code: '23505', message: 'email_en_uso' } } })
    const r = await enviarInvitacionCuenta(t.deps, FICHA, { email: 'ana@example.test', reemplazarEmail: false })
    expect(r).toMatchObject({ ok: false, status: 409, codigo: 'email_en_uso' })
    expect(t.generados).toHaveLength(0)
    expect(t.correos).toHaveLength(0)
  })

  it('refuses an unauthorized caller with 403', async () => {
    const t = crearDeps({ crear: { data: null, error: { code: '42501', message: 'sin_autoridad' } } })
    const r = await enviarInvitacionCuenta(t.deps, FICHA, { email: 'ana@example.test', reemplazarEmail: false })
    expect(r).toMatchObject({ ok: false, status: 403 })
    expect(t.generados).toHaveLength(0)
  })

  it('resends to the account of the previous invitation with a magic link', async () => {
    const t = crearDeps({
      crear: {
        data: { id: 'inv-2', email: 'ana@example.test', nombre: 'Ana', auth_user_id_previo: 'auth-viejo' },
        error: null,
      },
      previo: { email: 'ana@example.test', email_confirmed_at: null },
    })
    await enviarInvitacionCuenta(t.deps, FICHA, { email: 'ana@example.test', reemplazarEmail: false })
    expect(t.generados[0]).toMatchObject({ tipo: 'magiclink' })
    expect(t.borrados).toEqual([])
    expect(t.correos[0].enlace).toContain('type=magiclink')
  })

  it('deletes the unconfirmed account of the previous invitation when the email changed', async () => {
    const t = crearDeps({
      crear: {
        data: { id: 'inv-2', email: 'nuevo@example.test', nombre: 'Ana', auth_user_id_previo: 'auth-viejo' },
        error: null,
      },
      previo: { email: 'viejo@example.test', email_confirmed_at: null },
    })
    await enviarInvitacionCuenta(t.deps, FICHA, { email: 'nuevo@example.test', reemplazarEmail: true })
    expect(t.borrados).toEqual(['auth-viejo'])
    expect(t.generados[0]).toMatchObject({ tipo: 'invite', email: 'nuevo@example.test' })
  })

  it('reports a failed account creation as 502', async () => {
    const t = crearDeps({ generar: { error: { message: 'boom' } } })
    const r = await enviarInvitacionCuenta(t.deps, FICHA, { email: 'ana@example.test', reemplazarEmail: false })
    expect(r).toMatchObject({ ok: false, status: 502 })
    expect(t.correos).toHaveLength(0)
  })

  it('reports a failed email as 502 (the invitation stays, it can be resent)', async () => {
    const t = crearDeps({ correo: { success: false, error: 'down' } })
    const r = await enviarInvitacionCuenta(t.deps, FICHA, { email: 'ana@example.test', reemplazarEmail: false })
    expect(r).toMatchObject({ ok: false, status: 502 })
  })
})
