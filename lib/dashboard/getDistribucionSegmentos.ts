import { createSupabaseServerClient } from '@/lib/supabase/server'

export interface SegmentoDistribucionItem {
  id: string
  nombre: string
  grupos: number
}

/**
 * Obtiene la distribución de grupos por segmento visibles para el usuario.
 * Estrategia: 1) Listar segmentos, 2) Para cada segmento contar grupos (paralelo) filtrando por segmento_id.
 * Optimization futura: crear vista/materialized o RPC agregador si el número de segmentos crece.
 */
export async function getDistribucionSegmentos(): Promise<SegmentoDistribucionItem[] | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return null

    // 1. Temporadas activas
    const { data: temporadasActivas, error: errorTemp } = await supabase
      .from('temporadas')
      .select('id')
      .eq('activa', true)

    if (errorTemp) {
      console.error('Error listando temporadas activas:', errorTemp)
      return null
    }
    const temporadaIds = (temporadasActivas || []).map(t => t.id)
    if (temporadaIds.length === 0) return []

    // 2. Traer todos los grupos en temporadas activas (sólo ids necesarios) y segmentarlos en memoria
    // Nota: Si la cantidad crece mucho, reemplazar por RPC agregado.
    const { data: grupos, error: errorGrupos } = await supabase
      .from('grupos')
      .select('id, segmento_id, temporada_id')
      .in('temporada_id', temporadaIds)

    if (errorGrupos) {
      console.error('Error listando grupos para distribución:', errorGrupos)
      return null
    }
    if (!grupos || grupos.length === 0) return []

    // 3. Obtener nombres de segmentos involucrados
    const segmentoIds = Array.from(new Set(grupos.map(g => g.segmento_id)))
    if (segmentoIds.length === 0) return []

    const { data: segmentos, error: errorSeg } = await supabase
      .from('segmentos')
      .select('id, nombre')
      .in('id', segmentoIds)

    if (errorSeg) {
      console.error('Error obteniendo segmentos:', errorSeg)
      return null
    }
    const nombrePorId = new Map((segmentos || []).map(s => [s.id, s.nombre]))

    const conteo = new Map<string, number>()
    for (const g of grupos) {
      conteo.set(g.segmento_id, (conteo.get(g.segmento_id) || 0) + 1)
    }

    const resultado: SegmentoDistribucionItem[] = Array.from(conteo.entries()).map(([id, grupos]) => ({
      id,
      nombre: nombrePorId.get(id) || 'Sin nombre',
      grupos
    }))

    // Ordenar descendente por grupos
    resultado.sort((a, b) => b.grupos - a.grupos)
    return resultado
  } catch (e) {
    console.error('Fallo getDistribucionSegmentos()', e)
    return null
  }
}
