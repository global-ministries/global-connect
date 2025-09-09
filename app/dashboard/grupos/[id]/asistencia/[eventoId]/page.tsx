import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AttendanceList from "@/components/grupos/AttendanceList.client";

type Evento = { id: string; grupo_id: string; fecha: string; hora: string | null; tema: string | null; notas: string | null }
type AsistenciaRow = {
  usuario_id: string
  presente: boolean
  motivo_inasistencia: string | null
  registrado_por_usuario_id: string | null
  fecha_registro: string
  nombre: string
  apellido: string
  rol: string | null
}

export default async function AsistenciaEventoPage({ params }: { params: Promise<{ id: string; eventoId: string }> }) {
  const { id, eventoId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <div className="p-8">No autenticado</div>

  const [{ data: evento }, { data: puedeEditar }] = await Promise.all([
    supabase.rpc('obtener_evento_grupo', { p_auth_id: user.id, p_evento_id: eventoId }),
    supabase.rpc('puede_editar_grupo', { p_auth_id: user.id, p_grupo_id: id }),
  ])
  try { console.log('evento/raw', { evento, eventoId, groupId: id, userId: user.id, puedeEditar }) } catch {}

  const ev = (Array.isArray(evento) ? (evento[0] as Evento | undefined) : undefined)
  if (!ev) return (
    <div className="p-8">
      <p>No hay acceso o el evento no existe.</p>
      <Link href={`/dashboard/grupos/${id}`} className="text-orange-600 underline">Volver</Link>
    </div>
  )

  // Nueva: cargar asistencias del evento
  const asistenciaRes = await supabase.rpc("obtener_asistencia_evento", {
    p_auth_id: user?.id ?? null,
    p_evento_id: eventoId,
  });
  console.log("asistencia/raw", { data: asistenciaRes.data, error: asistenciaRes.error, eventoId });

  const asistentes = Array.isArray(asistenciaRes.data)
    ? asistenciaRes.data.map((r: any) => ({
        id: r.usuario_id ?? r.id,
        nombre: r.nombre ?? "",
        apellido: r.apellido ?? "",
        rol: r.rol ?? null,
        presente: r.presente ?? false,
        motivo: r.motivo_inasistencia ?? r.motivo ?? null,
      }))
    : [];

  const total = asistentes.length
  const presentes = asistentes.filter((x) => x.presente).length
  const porcentaje = total ? Math.round((presentes / total) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Asistencia del {ev.fecha}</h1>
          <p className="text-muted-foreground">Tema: {ev.tema || '—'} • Notas: {ev.notas || '—'}</p>
        </div>
        <div className="flex gap-4">
          {puedeEditar && (
            <Link href={`/dashboard/grupos/${id}/asistencia/editar/${eventoId}`} className="text-blue-600 underline">Editar</Link>
          )}
          <Link href={`/dashboard/grupos/${id}`} className="text-orange-600 underline">Volver</Link>
        </div>
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
        <AttendanceList attendees={asistentes} />
      </div>
    </div>
  )
}
