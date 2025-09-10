import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AttendanceRegister from '@/components/grupos/AttendanceRegister.client'
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
}

export default async function EditarAsistenciaPage({ params }: { params: Promise<{ id: string; eventoId: string }> }) {
  const { id, eventoId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <div className="p-8">No autenticado</div>

  const [{ data: evento }, { data: lista }, { data: grupo }, { data: puedeEditar }] = await Promise.all([
    supabase.rpc('obtener_evento_grupo', { p_auth_id: user.id, p_evento_id: eventoId }),
    supabase.rpc('obtener_asistencia_evento', { p_auth_id: user.id, p_evento_id: eventoId }),
    supabase.rpc('obtener_detalle_grupo', { p_auth_id: user.id, p_grupo_id: id }),
    supabase.rpc('puede_editar_grupo', { p_auth_id: user.id, p_grupo_id: id }),
  ])

  const ev: Evento | undefined = Array.isArray(evento) ? (evento[0] as Evento) : undefined
  if (!ev || !puedeEditar || !grupo) {
    return (
      <div className="p-8">
        <p>No tienes permiso para editar o el evento no existe.</p>
        <Link href={`/dashboard/grupos/${id}`} className="text-orange-600 underline">Volver</Link>
      </div>
    )
  }

  const miembros = (grupo.miembros || []).map((m: { id: string; nombre: string; apellido: string; rol?: string | null }) => ({ id: m.id, nombre: m.nombre, apellido: m.apellido, rol: m.rol || undefined }))
  const initial = {
    fecha: ev.fecha as string,
  hora: ev.hora as string | null,
    tema: ev.tema as string | null,
    notas: ev.notas as string | null,
    estado: Object.fromEntries(((Array.isArray(lista) ? (lista as AsistenciaRow[]) : [])).map((r) => [r.usuario_id, { presente: r.presente, motivo: r.motivo_inasistencia || '' }])) as Record<string, { presente: boolean; motivo?: string }>
  }

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
            <BreadcrumbPage>Editar asistencia</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Encabezado */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl">Editar asistencia — {grupo.nombre}</CardTitle>
            <CardDescription>Fecha: {ev.fecha}</CardDescription>
          </div>
          <div className="flex gap-3">
            <Link href={`/dashboard/grupos/${id}/asistencia/${eventoId}`} className="text-orange-600 underline">Ver evento</Link>
            <Link href={`/dashboard/grupos/${id}/asistencia/historial`} className="text-blue-600 underline">Historial</Link>
          </div>
        </CardHeader>
        <CardContent>
          {/* Reutilizamos el componente en modo edición */}
          <AttendanceRegister grupoId={id} miembros={miembros} initialData={initial} isEdit />
        </CardContent>
      </Card>
    </div>
  )
}
