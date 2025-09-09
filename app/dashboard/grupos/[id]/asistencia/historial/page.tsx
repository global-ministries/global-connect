import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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
            <BreadcrumbPage>Historial</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Encabezado */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl">Historial de asistencia — {grupo.nombre}</CardTitle>
            <CardDescription>Últimos eventos registrados</CardDescription>
          </div>
          <div className="flex gap-3">
            <Link href={`/dashboard/grupos/${id}`} className="text-orange-600 underline">Volver</Link>
            <Link href={`/dashboard/grupos/${id}/asistencia`} className="text-blue-600 underline">Registrar nuevo</Link>
          </div>
        </CardHeader>
      </Card>

      {/* Lista */}
      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {rows.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between p-4">
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
        </CardContent>
      </Card>
    </div>
  )
}
