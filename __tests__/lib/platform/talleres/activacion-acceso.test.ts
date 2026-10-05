/**
 * @jest-environment node
 */

import {
  activarCuenta,
  consultarInvitacion,
  esTokenConFormato,
  verificarCedula,
} from '@/lib/platform/talleres/activacion-acceso'
import { hashTokenInvitacion } from '@/lib/platform/talleres/invitacion-acceso-envio'

const TOKEN = 'a'.repeat(43)
const HASH = hashTokenInvitacion(TOKEN)

function crearAdmin(rpcs: Record<string, { data: unknown; error: unknown }>) {
  const rpc = jest.fn((nombre: string) => Promise.resolve(rpcs[nombre] ?? { data: null, error: { message: 'x' } }))
  const createUser = jest.fn().mockResolvedValue({ data: { user: { id: 'auth-9' } }, error: null })
  const deleteUser = jest.fn().mockResolvedValue({ data: null, error: null })
  return { admin: { rpc, auth: { admin: { createUser, deleteUser } } }, rpc, createUser, deleteUser }
}

const VERIFICADA = { data: { ok: true, invitacion_id: 'inv-1', email: 'ana@example.com' }, error: null }

describe('esTokenConFormato', () => {
  it('accepts a 43-char base64url token only', () => {
    expect(esTokenConFormato(TOKEN)).toBe(true)
    expect(esTokenConFormato('short')).toBe(false)
    expect(esTokenConFormato(`${'a'.repeat(42)}/`)).toBe(false)
  })
})

describe('consultarInvitacion', () => {
  it('returns the taller and the invitee for a valid token', async () => {
    const { admin, rpc } = crearAdmin({
      invitacion_acceso_consultar: {
        data: { valida: true, taller_nombre: 'Novios', nombre_invitado: 'Ana' },
        error: null,
      },
    })
    expect(await consultarInvitacion(admin, HASH)).toEqual({
      valida: true,
      tallerNombre: 'Novios',
      nombreInvitado: 'Ana',
      nombreInvitante: null,
      vinculo: null,
    })
    expect(rpc).toHaveBeenCalledWith('invitacion_acceso_consultar', { p_token_hash: HASH })
  })

  it('reads an invalid answer or an error as not valid', async () => {
    expect(await consultarInvitacion(crearAdmin({ invitacion_acceso_consultar: { data: { valida: false }, error: null } }).admin, HASH)).toEqual({ valida: false })
    expect(await consultarInvitacion(crearAdmin({}).admin, HASH)).toEqual({ valida: false })
  })
})

describe('verificarCedula', () => {
  it('normalizes the cédula and reports a match', async () => {
    const { admin, rpc } = crearAdmin({ invitacion_acceso_verificar: VERIFICADA })
    expect(await verificarCedula(admin, HASH, ' V-12.345.678 ')).toEqual({
      ok: true,
      invitacionId: 'inv-1',
      email: 'ana@example.com',
    })
    expect(rpc).toHaveBeenCalledWith('invitacion_acceso_verificar', { p_token_hash: HASH, p_cedula: '12345678' })
  })

  it('reports a mismatch with the remaining attempts', async () => {
    const { admin } = crearAdmin({
      invitacion_acceso_verificar: { data: { ok: false, codigo: 'CEDULA_NO_COINCIDE', intentos_restantes: 2 }, error: null },
    })
    const r = await verificarCedula(admin, HASH, '12345678')
    expect(r).toMatchObject({ ok: false, codigo: 'CEDULA_NO_COINCIDE' })
    if (!r.ok) expect(r.mensaje).toMatch(/2 intentos/)
  })

  it('rejects an unrecognizable cédula without calling the database', async () => {
    const { admin, rpc } = crearAdmin({})
    expect(await verificarCedula(admin, HASH, 'ab')).toMatchObject({ ok: false, codigo: 'CEDULA_INVALIDA' })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('activarCuenta', () => {
  const entrada = { tokenHash: HASH, cedula: '12345678', password: 'secreta123', confirmaConyuge: true }

  it('creates a confirmed account and links it to the invitation', async () => {
    const { admin, rpc, createUser } = crearAdmin({
      invitacion_acceso_verificar: VERIFICADA,
      invitacion_acceso_vincular: { data: { ok: true }, error: null },
    })
    expect(await activarCuenta(admin, entrada)).toEqual({ ok: true, email: 'ana@example.com' })
    expect(createUser).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'secreta123', email_confirm: true })
    expect(rpc).toHaveBeenCalledWith('invitacion_acceso_vincular', {
      p_id: 'inv-1',
      p_auth_user_id: 'auth-9',
      p_confirma_conyuge: true,
    })
  })

  it('requires a password of at least 8 characters before anything else', async () => {
    const { admin, rpc } = crearAdmin({})
    expect(await activarCuenta(admin, { ...entrada, password: 'corta' })).toMatchObject({
      ok: false,
      codigo: 'PASSWORD_CORTA',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('removes the new account when the link is refused', async () => {
    const { admin, deleteUser } = crearAdmin({
      invitacion_acceso_verificar: VERIFICADA,
      invitacion_acceso_vincular: { data: { ok: false, codigo: 'ENLACE_INVALIDO' }, error: null },
    })
    expect(await activarCuenta(admin, entrada)).toMatchObject({ ok: false, codigo: 'ENLACE_INVALIDO' })
    expect(deleteUser).toHaveBeenCalledWith('auth-9')
  })

  it('reports an existing account for the email', async () => {
    const { admin, createUser } = crearAdmin({ invitacion_acceso_verificar: VERIFICADA })
    createUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'A user with this email address has already been registered', code: 'email_exists' } })
    expect(await activarCuenta(admin, entrada)).toMatchObject({ ok: false, codigo: 'YA_TIENE_CUENTA' })
  })

  it('stops when the cédula does not match', async () => {
    const { admin, createUser } = crearAdmin({
      invitacion_acceso_verificar: { data: { ok: false, codigo: 'BLOQUEADA' }, error: null },
    })
    expect(await activarCuenta(admin, entrada)).toMatchObject({ ok: false, codigo: 'BLOQUEADA' })
    expect(createUser).not.toHaveBeenCalled()
  })
})
