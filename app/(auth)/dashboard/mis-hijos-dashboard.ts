/**
 * Data for the dashboard "Mis hijos" card (R3b). Same reads as Mi Perfil:
 * the birth date with the admin client (one column, by auth_id), and
 * ninos_mis_hijos / ninos_mis_prechecks with the user's session (the RPCs
 * find the parent through auth.uid()). A minor (<18) never gets the card,
 * and any failure hides it instead of breaking the dashboard.
 */
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { esMayorDeEdad, parseMisHijos, type MiHijo } from '@/lib/platform/ninos/mis-hijos'
import { parseMisPrechecks, type MisPrechecks } from '@/lib/platform/ninos/precheck'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type DatosMisHijosDashboard = { hijos: MiHijo[]; prechecks: MisPrechecks }

export async function cargarMisHijosDashboard(): Promise<DatosMisHijosDashboard | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data: usuario } = await createSupabaseAdminClient()
      .from('usuarios')
      .select('fecha_nacimiento')
      .eq('auth_id', user.id)
      .maybeSingle()
    if (!usuario || !esMayorDeEdad(usuario.fecha_nacimiento, hoyEnCaracas())) return null

    const [{ data: hijosData, error }, { data: prechecksData }] = await Promise.all([
      supabase.rpc('ninos_mis_hijos'),
      supabase.rpc('ninos_mis_prechecks'),
    ])
    if (error) {
      console.error('Mis hijos dashboard card hidden:', error.message)
      return null
    }
    const hijos = parseMisHijos(hijosData)
    if (hijos.length === 0) return null
    return { hijos, prechecks: parseMisPrechecks(prechecksData) }
  } catch (error) {
    console.error('Mis hijos dashboard card hidden:', error)
    return null
  }
}
