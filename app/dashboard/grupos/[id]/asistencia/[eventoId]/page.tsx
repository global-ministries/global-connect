import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AttendanceList from "@/components/grupos/AttendanceList.client";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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
  // (log depuración removido)

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
  // (log depuración removido)

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
      {/* Migas de pan */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/grupos">Grupos</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/dashboard/grupos/${id}`}>Detalle</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Asistencia</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Encabezado */}
      <Card className="">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl">Asistencia del {ev.fecha}</CardTitle>
            <CardDescription>
              {ev.hora ? `Hora: ${ev.hora} • ` : ''}Tema: {ev.tema || '—'} • Notas: {ev.notas || '—'}
            </CardDescription>
          </div>
          <div className="flex gap-3">
            {puedeEditar && (
              <Link
                href={`/dashboard/grupos/${id}/asistencia/editar/${eventoId}`}
                className="text-blue-600 underline"
              >
                Editar
              </Link>
            )}
            <Link href={`/dashboard/grupos/${id}`} className="text-orange-600 underline">
              Volver
            </Link>
          </div>
        </CardHeader>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardDescription>Presentes</CardDescription>
            <CardTitle className="text-2xl">{presentes}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-2xl">{total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>% Asistencia</CardDescription>
            <CardTitle className="text-2xl">{porcentaje}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Listas de asistencia */}
      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
          <CardDescription>Presentes y ausentes del evento</CardDescription>
        </CardHeader>
        <CardContent>
          <AttendanceList attendees={asistentes} />
        </CardContent>
      </Card>
    </div>
  )
}
