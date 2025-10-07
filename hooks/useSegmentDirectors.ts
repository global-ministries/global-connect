import { useEffect, useState, useCallback } from 'react'

interface DirectorEtapaEntry {
  id: string
  usuario_id: string
  nombre: string
  ciudades?: string[]
  asignaciones?: { grupo_id: string }[]
}

interface UseSegmentDirectorsResult {
  loading: boolean
  error: string | null
  data: DirectorEtapaEntry[]
  refresh: () => void
  toggleGrupo: (opts: { directorId: string; grupoId: string; accion: 'agregar' | 'quitar' }) => Promise<boolean>
  toggleCiudad: (opts: { directorId: string; segmentoId: string; segmentoUbicacionId: string; accion: 'agregar' | 'quitar' }) => Promise<boolean>
  crearDirector: (usuarioId: string, opts?: { segmentoUbicacionId?: string }) => Promise<boolean>
  eliminarDirector: (directorId: string) => Promise<boolean>
}

export function useSegmentDirectors(segmentoId: string | null): UseSegmentDirectorsResult {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DirectorEtapaEntry[]>([])

  const fetchData = useCallback(async () => {
    if (!segmentoId) { setData([]); return }
    setLoading(true)
    setError(null)
    try {
      const resDir = await fetch(`/api/segmentos/${segmentoId}/directores-etapa`)
      if (!resDir.ok) throw new Error(`Directores HTTP ${resDir.status}`)
      const jsonDir = await resDir.json()

      // Ciudades + directores (vista extendida)
      const resCities = await fetch(`/api/segmentos/${segmentoId}/directores-etapa/ubicaciones`)
      let mapCiudades: Record<string, string[] | undefined> = {}
      if (resCities.ok) {
        const jsonCities = await resCities.json()
        for (const d of jsonCities.directores || []) {
          mapCiudades[d.director_etapa_segmento_lider_id] = d.ciudades || []
        }
      }
      const merged: DirectorEtapaEntry[] = (jsonDir.directores || []).map((d: any) => ({
        ...d,
        ciudades: mapCiudades[d.id] || []
      }))
      setData(merged)
    } catch (e: any) {
      setError(e.message || 'Error cargando directores')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [segmentoId])

  useEffect(() => { fetchData() }, [fetchData])

  const refresh = useCallback(() => { fetchData() }, [fetchData])

  const toggleGrupo = useCallback(async ({ directorId, grupoId, accion }: { directorId: string; grupoId: string; accion: 'agregar' | 'quitar' }) => {
    try {
      const res = await fetch(`/api/segmentos/${segmentoId}/directores-etapa`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ director_etapa_segmento_lider_id: directorId, grupo_id: grupoId, accion })
      })
      if (!res.ok) return false
      await fetchData()
      return true
    } catch { return false }
  }, [segmentoId, fetchData])

  const toggleCiudad = useCallback(async ({ directorId, segmentoId, segmentoUbicacionId, accion }: { directorId: string; segmentoId: string; segmentoUbicacionId: string; accion: 'agregar' | 'quitar' }) => {
    try {
      const res = await fetch(`/api/segmentos/${segmentoId}/directores-etapa/ubicaciones`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ director_etapa_segmento_lider_id: directorId, segmento_ubicacion_id: segmentoUbicacionId, accion })
      })
      if (!res.ok) return false
      await fetchData()
      return true
    } catch { return false }
  }, [segmentoId, fetchData])

  const crearDirector = useCallback(async (usuarioId: string, opts?: { segmentoUbicacionId?: string }) => {
    if (!segmentoId) return false
    try {
      const res = await fetch(`/api/segmentos/${segmentoId}/directores-etapa/crear`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usuario_id: usuarioId, segmento_ubicacion_id: opts?.segmentoUbicacionId })
      })
      if (!res.ok) return false
      await fetchData()
      return true
    } catch { return false }
  }, [segmentoId, fetchData])

  const eliminarDirector = useCallback(async (directorId: string) => {
    if (!segmentoId) return false
    try {
      const res = await fetch(`/api/segmentos/${segmentoId}/directores-etapa?directorId=${encodeURIComponent(directorId)}`, { method: 'DELETE' })
      if (!res.ok) return false
      await fetchData()
      return true
    } catch { return false }
  }, [segmentoId, fetchData])

  return { loading, error, data, refresh, toggleGrupo, toggleCiudad, crearDirector, eliminarDirector }
}
