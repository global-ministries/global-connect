import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Cuenta grupos activos: grupos cuya temporada asociada tiene activa = true.
 * Implementado en dos pasos para evitar dependencias de filtros relacionales implícitos
 * que no son soportados directamente por el API REST de PostgREST sin especificar
 * la relación en el select.
 * Paso 1: obtener IDs de temporadas activas visibles por RLS.
 * Paso 2: count grupos con temporada_id IN (...).
 * Retorna null ante cualquier error para que la UI muestre "N/D".
 */
export async function getTotalGruposActivos(): Promise<number | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return null

    // 1. Obtener temporadas activas
    const { data: temporadasActivas, error: errorTemp } = await supabase
      .from('temporadas')
      .select('id')
      .eq('activa', true)

    if (errorTemp) {
      console.error('Error listando temporadas activas:', errorTemp)
      return null
    }
    if (!temporadasActivas || temporadasActivas.length === 0) return 0

    const temporadaIds = temporadasActivas.map(t => t.id).filter(Boolean)
    if (temporadaIds.length === 0) return 0

    // 2. Contar grupos en esas temporadas
    const { count, error: errorGrupos } = await supabase
      .from('grupos')
      .select('id', { count: 'exact', head: true })
      .in('temporada_id', temporadaIds)

    if (errorGrupos) {
      console.error('Error contando grupos activos:', errorGrupos)
      return null
    }

    return count ?? 0
  } catch (e) {
    console.error('Fallo getTotalGruposActivos()', e)
    return null
  }
}
