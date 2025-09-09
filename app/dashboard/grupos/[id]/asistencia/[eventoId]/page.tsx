import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function AsistenciaEventoPage({ params }: { params: Promise<{ id: string; eventoId: string }> }) {
  const { id, eventoId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <div className="p-8">No autenticado</div>

  const [{ data: evento }, { data: lista }] = await Promise.all([
    supabase.rpc('obtener_evento_grupo', { p_auth_id: user.id, p_evento_id: eventoId }),
    supabase.rpc('obtener_asistencia_evento', { p_auth_id: user.id, p_evento_id: eventoId }),
  ])

  const ev = Array.isArray(evento) ? evento[0] : undefined
  if (!ev) return (
    <div className="p-8">
      <p>No hay acceso o el evento no existe.</p>
      <Link href={`/dashboard/grupos/${id}`} className="text-orange-600 underline">Volver</Link>
    </div>
  )

  const total = lista?.length || 0
  const presentes = (lista || []).filter((x: any) => x.presente).length
  const porcentaje = total ? Math.round((presentes / total) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Asistencia del {ev.fecha}</h1>
          <p className="text-muted-foreground">Tema: {ev.tema || '—'} • Notas: {ev.notas || '—'}</p>
        </div>
        <Link href={`/dashboard/grupos/${id}`} className="text-orange-600 underline">Volver</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg border">
          <div className="text-sm text-muted-foreground">Presentes</div>
          <div className="text-2xl font-semibold">{presentes}</div>
        </div>
        <div className="p-4 rounded-lg border">
          <div className="text-sm text-muted-foreground">Total</div>
          <div className="text-2xl font-semibold">{total}</div>
        </div>
        <div className="p-4 rounded-lg border">
          <div className="text-sm text-muted-foreground">% Asistencia</div>
          <div className="text-2xl font-semibold">{porcentaje}%</div>
        </div>
      </div>

      <div className="border rounded-lg divide-y">
        {(lista || []).map((r: any) => (
          <div key={r.usuario_id} className="flex items-center justify-between p-3">
            <div>
              <div className="font-medium">{r.nombre} {r.apellido}</div>
              <div className="text-xs text-muted-foreground">{r.rol || 'Miembro'}</div>
            </div>
            <div className="text-sm">
              {r.presente ? 'Presente' : `Ausente${r.motivo_inasistencia ? ` — ${r.motivo_inasistencia}` : ''}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
