"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

type Payload = {
  allowed: boolean
  roles: Array<string | { nombre_interno?: string }>
  authId?: string
  email?: string | null
}

export default function TopDebugBar() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const cargar = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/debug/toolbar', { cache: 'no-store' })
      const json = await res.json()
      setData(json)
    } catch (e: any) {
      setError(e?.message || 'Error cargando debug toolbar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [])

  // Restaurar estado colapsado y persistir cambios
  useEffect(() => {
    try {
      const saved = localStorage.getItem('gc_dbg_collapsed')
      if (saved) setCollapsed(saved === '1')
    } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem('gc_dbg_collapsed', collapsed ? '1' : '0') } catch {}
  }, [collapsed])

  const roles = Array.isArray(data?.roles)
    ? data!.roles.map((r: any) => typeof r === 'string' ? r : r?.nombre_interno).filter(Boolean)
    : []

  const onChangeRol = async (nuevo: string) => {
    try {
      const res = await fetch('/api/debug/toolbar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol: nuevo })
      })
      const json = await res.json()
      if (!json?.ok) throw new Error(json?.error || 'No se pudo cambiar el rol')
      await cargar()
      // refrescar la página para que el server reciba el nuevo rol en SSR
      window.location.reload()
    } catch (e: any) {
      setError(e?.message || 'No se pudo cambiar el rol')
    }
  }

  if (loading) return null
  if (!data?.allowed) return null

  if (collapsed) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <div className="flex justify-end pr-2">
          <button
            onClick={() => setCollapsed(false)}
            title="Mostrar barra de debug"
            className="pointer-events-auto translate-y-0 bg-black/60 backdrop-blur text-white border border-white/20 border-t-0 rounded-b-md h-7 px-2 flex items-center justify-center hover:bg-black/70"
            aria-label="Mostrar barra de debug"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-10 bg-black/60 backdrop-blur text-white flex items-center text-xs px-3 gap-3">
      <div className="opacity-80">Auth: {data?.authId?.slice(0,8)}…</div>
      <div className="opacity-80">Email: {data?.email || '—'}</div>
      <div className="flex items-center gap-2">
        <span>Rol:</span>
        <select
          className="bg-transparent border border-white/30 rounded px-2 py-0.5"
          onChange={(e) => onChangeRol(e.target.value)}
          value={roles?.[0] || ''}
        >
          {['admin','pastor','director-general','director-etapa','lider','miembro'].map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="ml-auto">
        <button
          onClick={() => setCollapsed(true)}
          title="Ocultar barra de debug"
          className="h-6 w-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>
      {error && <div className="text-red-300">{error}</div>}
    </div>
  )
}
