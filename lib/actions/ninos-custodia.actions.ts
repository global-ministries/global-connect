'use server'

/**
 * Niños — server actions of the «Custodia» section of a child's ficha
 * (odd/tasks/ninos-checkin-pco.md, T2e, S9.2): list the restrictions and
 * create, edit or deactivate one.
 *
 * Gate: an authenticated session only. Who may (coordinación / dirección of
 * Niños for that child: admin, pastor or ninos_puede_configurar on a Niños
 * area of the child's campus) and every rule are checked again by the RPCs
 * (supabase/migrations/20261108170000_ninos_custodia.sql), whose HINT is
 * returned as is (lib/platform/ninos/custodia.ts).
 */

import {
  cargarCustodiaFicha,
  rpcGuardarRestriccion,
  validarRestriccion,
  type GuardarRestriccionArgs,
  type Resultado,
  type RestriccionFicha,
} from '@/lib/platform/ninos/custodia'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const DATOS_INVALIDOS = 'Revisa los datos e inténtalo de nuevo.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID_RE.test(valor)

async function clienteConSesion() {
  const cliente = await createSupabaseServerClient()
  const {
    data: { user },
  } = await cliente.auth.getUser()
  return user ? cliente : null
}

/** Every restriction of the child (active first). */
export async function listarCustodia(ninoId: string): Promise<Resultado<RestriccionFicha[]>> {
  const cliente = await clienteConSesion()
  if (!cliente) return { ok: false, message: SIN_SESION }
  if (!esUuid(ninoId)) return { ok: false, message: DATOS_INVALIDOS }
  return cargarCustodiaFicha(cliente, ninoId)
}

export type GuardarCustodiaInput = GuardarRestriccionArgs

function bienFormado(input: GuardarCustodiaInput | undefined): input is GuardarCustodiaInput {
  return (
    !!input &&
    esUuid(input.ninoId) &&
    (input.id === null || esUuid(input.id)) &&
    typeof input.persona === 'string' &&
    typeof input.relacion === 'string' &&
    typeof input.respaldo === 'string' &&
    typeof input.notas === 'string' &&
    typeof input.activa === 'boolean'
  )
}

/** Creates (id null), edits or deactivates a restriction; returns its id. */
export async function guardarCustodia(input: GuardarCustodiaInput): Promise<Resultado<{ id: string }>> {
  const cliente = await clienteConSesion()
  if (!cliente) return { ok: false, message: SIN_SESION }
  if (!bienFormado(input)) return { ok: false, message: DATOS_INVALIDOS }
  const invalido = validarRestriccion(input)
  if (invalido) return { ok: false, message: invalido }

  const r = await rpcGuardarRestriccion(cliente, input)
  return r.ok ? { ok: true, data: { id: r.data } } : r
}
