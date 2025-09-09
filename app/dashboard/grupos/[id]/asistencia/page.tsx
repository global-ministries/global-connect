import { createSupabaseServerClient } from '@/lib/supabase/server'
import AttendanceRegister from '@/components/grupos/AttendanceRegister.client'
import Link from 'next/link'

export default async function RegistrarAsistenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return (
      <div className="p-8">Debes iniciar sesión.</div>
    )
  }

  const [{ data: grupo }, { data: puedeEditar }] = await Promise.all([
    supabase.rpc('obtener_detalle_grupo', { p_auth_id: user.id, p_grupo_id: id }),
    supabase.rpc('puede_editar_grupo', { p_auth_id: user.id, p_grupo_id: id })
  ])

  if (!grupo || !puedeEditar) {
    return (
      <div className="p-8">
        <p className="mb-4">No tienes permiso para registrar asistencia en este grupo.</p>
        <Link href={`/dashboard/grupos/${id}`} className="text-orange-600 underline">Volver al grupo</Link>
      </div>
    )
  }

  // Normalizar lat/lng si existen (no requerido aquí, pero mantenemos el patrón de mapping)
  if (grupo.direccion) {
    grupo.direccion.lat = grupo.direccion.latitud
    grupo.direccion.lng = grupo.direccion.longitud
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Registrar asistencia - {grupo.nombre}</h1>
          <p className="text-muted-foreground">Marca presentes y guarda en un clic.</p>
        </div>
        <Link href={`/dashboard/grupos/${id}`} className="text-orange-600 underline">Volver</Link>
      </div>
      {/** Normalizamos miembros al shape esperado por el componente */}
      <AttendanceRegister
        grupoId={id}
        miembros={(grupo.miembros || []).map((m: { id: string; nombre: string; apellido: string; rol?: string | null }) => ({
          id: m.id,
          nombre: m.nombre,
          apellido: m.apellido,
          rol: m.rol || undefined,
        }))}
      />
    </div>
  )
}
