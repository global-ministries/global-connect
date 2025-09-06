"use client"

import { useEffect, useState } from "react"

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
      {error && <div className="text-red-300">{error}</div>}
    </div>
  )
}
