'use server'

/**
 * «Lo hizo» of the home's «Próximo Paso de tus voluntarios»
 * (odd/tasks/home-por-rol.md T4, S5): marks or unmarks «hizo Próximo Paso»
 * for one person with marcar_proximo_paso. The session client calls it, so
 * the database decides who may mark (proximo_paso_puede_marcar) and raises
 * its own Spanish message otherwise. The row updates in place on the
 * client, so nothing is revalidated: a marked person stays in the list
 * until the next visit and the mark can be undone.
 */
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type ResultadoProximoPaso = { ok: true; hecho: boolean } | { ok: false; message: string }

const SIN_SESION = 'Tu sesión terminó. Vuelve a iniciar sesión.'
const DATOS_INVALIDOS = 'Revisa los datos e inténtalo de nuevo.'
const NO_GUARDADO = 'No pudimos guardar la marca. Inténtalo de nuevo.'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// The codes marcar_proximo_paso raises with a message written for the person.
const CODIGOS_CON_MENSAJE = new Set(['42501', 'P0002', '22023'])

export async function marcarProximoPasoVoluntario(usuarioId: string, hecho: boolean): Promise<ResultadoProximoPaso> {
  if (typeof usuarioId !== 'string' || !UUID_RE.test(usuarioId) || typeof hecho !== 'boolean') return { ok: false, message: DATOS_INVALIDOS }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: SIN_SESION }

  try {
    const { data, error } = await supabase.rpc('marcar_proximo_paso', { p_usuario_id: usuarioId, p_hecho: hecho })
    if (error) {
      const conMensaje = typeof error.code === 'string' && CODIGOS_CON_MENSAJE.has(error.code) && typeof error.message === 'string'
      if (!conMensaje) console.error('marcar_proximo_paso:', error)
      return { ok: false, message: conMensaje ? error.message : NO_GUARDADO }
    }
    const resultado = typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null
    if (typeof resultado?.hecho !== 'boolean') return { ok: false, message: NO_GUARDADO }
    return { ok: true, hecho: resultado.hecho }
  } catch (error) {
    console.error('marcar_proximo_paso:', error)
    return { ok: false, message: NO_GUARDADO }
  }
}
