import { createSupabaseServerClient } from '@/lib/supabase/server'
import AttendanceRegister from '@/components/grupos/AttendanceRegister.client'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, TituloSistema, BotonSistema } from '@/components/ui/sistema-diseno'

export default async function RegistrarAsistenciaPage({ params }: { params: { id: string } }) {
  const { id } = params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return (
      <DashboardLayout>
        <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <TituloSistema nivel={2}>Acceso requerido</TituloSistema>
              <p className="text-gray-600 mb-4">Debes iniciar sesión para acceder a esta página.</p>
              <Link href="/login">
                <BotonSistema variante="primario">
                  Iniciar Sesión
                </BotonSistema>
              </Link>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  const [{ data: grupo }, { data: puedeEditar }] = await Promise.all([
    supabase.rpc('obtener_detalle_grupo', { p_auth_id: user.id, p_grupo_id: id }),
    supabase.rpc('puede_editar_grupo', { p_auth_id: user.id, p_grupo_id: id })
  ])

  if (!grupo || !puedeEditar) {
    return (
      <DashboardLayout>
        <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <TituloSistema nivel={2}>Sin permisos</TituloSistema>
              <p className="text-gray-600 mb-4">No tienes permiso para registrar asistencia en este grupo.</p>
              <Link href={`/dashboard/grupos/${id}`}>
                <BotonSistema variante="primario">
                  Volver al grupo
                </BotonSistema>
              </Link>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  // Normalizar lat/lng si existen (no requerido aquí, pero mantenemos el patrón de mapping)
  if (grupo.direccion) {
    grupo.direccion.lat = grupo.direccion.latitud
    grupo.direccion.lng = grupo.direccion.longitud
  }

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo={`Registrar Asistencia - ${grupo.nombre}`}
        descripcion="Marca presentes y guarda en un clic."
        accionPrincipal={
          <Link href={`/dashboard/grupos/${id}`}>
            <BotonSistema 
              variante="ghost" 
              tamaño="sm"
              className="p-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </BotonSistema>
          </Link>
        }
      >
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
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
