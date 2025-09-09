import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function HistorialAsistenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <div className="p-8">No autenticado</div>

  const [grupoRes, puedeEditarRes, eventosRes] = await Promise.all([
    supabase.rpc('obtener_detalle_grupo', { p_auth_id: user.id, p_grupo_id: id }),
    supabase.rpc('puede_editar_grupo', { p_auth_id: user.id, p_grupo_id: id }),
    supabase.rpc('listar_eventos_grupo', { p_auth_id: user.id, p_grupo_id: id, p_limit: 50, p_offset: 0 })
  ])
  const grupo = grupoRes.data
  const puedeEditar = puedeEditarRes.data
  const eventos = eventosRes.data
  try {
    console.log('historial/raw', {
      count: Array.isArray(eventos) ? eventos.length : null,
      puedeEditar,
      groupId: id,
      userId: user.id,
      eventosError: (eventosRes as any)?.error || null
    })
  } catch {}

  if (!puedeEditar || !grupo) {
    return (
      <div className="p-8">
        <p>No tienes permiso para ver el historial de este grupo.</p>
        <Link href={`/dashboard/grupos/${id}`} className="text-orange-600 underline">Volver</Link>
      </div>
    )
  }

  type Ev = { id: string; fecha: string; tema: string | null; total: number; presentes: number; porcentaje: number }
  const rows: Ev[] = Array.isArray(eventos) ? (eventos as Ev[]) : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Historial de asistencia — {grupo.nombre}</h1>
          <p className="text-muted-foreground">Últimos eventos registrados</p>
        </div>
        <div className="flex gap-4">
          <Link href={`/dashboard/grupos/${id}`} className="text-orange-600 underline">Volver</Link>
          <Link href={`/dashboard/grupos/${id}/asistencia`} className="text-blue-600 underline">Registrar nuevo</Link>
        </div>
      </div>

      <div className="border rounded-lg divide-y">
        {rows.map((ev) => (
          <div key={ev.id} className="flex items-center justify-between p-3">
            <div>
              <div className="font-medium">{ev.fecha} — {ev.tema || 'Sin tema'}</div>
              <div className="text-xs text-muted-foreground">Presentes {ev.presentes}/{ev.total} — {ev.porcentaje}%</div>
            </div>
            <div className="flex gap-3 text-sm">
              <Link href={`/dashboard/grupos/${id}/asistencia/${ev.id}`} className="text-orange-600 underline">Ver</Link>
              <Link href={`/dashboard/grupos/${id}/asistencia/editar/${ev.id}`} className="text-blue-600 underline">Editar</Link>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">No hay eventos registrados aún.</div>
        )}
      </div>
    </div>
  )
}
