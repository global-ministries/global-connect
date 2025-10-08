import { useCallback, useEffect, useState } from 'react'

interface GrupoAsignable {
	id: string
	nombre: string
	asignado: boolean
	directoresCount?: number
	directoresSample?: string[]
	temporadaNombre?: string | null
	miembrosCount?: number
	lideres?: string[]
	activo?: boolean
}

interface UseDirectorGroupAssignmentsResult {
	loading: boolean
	error: string | null
	grupos: GrupoAsignable[]
	asignados: number
	refresh: () => void
	actualizar: (opts: { agregar?: string[]; quitar?: string[]; modo?: 'merge'|'replace' }) => Promise<{ agregados: number; quitados: number; totalAsignados: number }>
	detectarOtrosDirectores: (grupoId: string) => Promise<string[]>
}

export function useDirectorGroupAssignments(segmentoId: string | null, directorId: string | null): UseDirectorGroupAssignmentsResult {
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [grupos, setGrupos] = useState<GrupoAsignable[]>([])
	const [asignados, setAsignados] = useState(0)

	const fetchData = useCallback(async () => {
		if (!segmentoId || !directorId) { setGrupos([]); setAsignados(0); return }
		setLoading(true)
		setError(null)
		try {
			const res = await fetch(`/api/segmentos/${segmentoId}/directores-etapa/${directorId}/grupos-asignables`)
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
			const json = await res.json()
			setGrupos(json.grupos || [])
			setAsignados(json.asignados || 0)
		} catch (e: any) {
			setError(e.message || 'Error cargando grupos')
			setGrupos([])
			setAsignados(0)
		} finally {
			setLoading(false)
		}
	}, [segmentoId, directorId])

	useEffect(() => { fetchData() }, [fetchData])
	const refresh = useCallback(() => { fetchData() }, [fetchData])

	const actualizar = useCallback(async ({ agregar, quitar, modo }: { agregar?: string[]; quitar?: string[]; modo?: 'merge'|'replace' }) => {
		if (!segmentoId || !directorId) return { agregados: 0, quitados: 0, totalAsignados: 0 }
		try {
			const res = await fetch(`/api/segmentos/${segmentoId}/directores-etapa/${directorId}/grupos-asignables`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ agregar, quitar, modo })
			})
			if (!res.ok) throw new Error((await res.json().catch(()=>({}))).error || `HTTP ${res.status}`)
			const json = await res.json().catch(()=>({}))
			await fetchData()
			return { agregados: json.agregados || 0, quitados: json.quitados || 0, totalAsignados: json.totalAsignados || 0 }
		} catch (e: any) {
			throw e
		}
	}, [segmentoId, directorId, fetchData])

	// Detectar otros directores para un grupo (consulta dinámica)
	const detectarOtrosDirectores = useCallback(async (grupoId: string) => {
		if (!grupoId) return []
		try {
			const res = await fetch(`/api/grupos/${grupoId}/directores`, { cache: 'no-store' })
			if (!res.ok) return []
			const json = await res.json()
			// Se espera una estructura { directores:[{id, nombre, director_etapa_segmento_lider_id}] }
			return (json.directores || []).map((d: any) => d.nombre).filter(Boolean)
		} catch { return [] }
	}, [])

	return { loading, error, grupos, asignados, refresh, actualizar, detectarOtrosDirectores }
}
