import { createSupabaseServerClient } from "@/lib/supabase/server"
import RegistroAsistenciaAvanzado from "@/components/grupos/RegistroAsistenciaAvanzado.client"
import Link from "next/link"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ContenedorDashboard, TituloSistema, BotonSistema } from "@/components/ui/sistema-diseno"
import { obtenerConfiguracionGrupos } from "@/lib/actions/configuracion-grupos-vida.actions"

/** Forma mínima del resultado de obtener_detalle_grupo relevante para asistencia */
interface GrupoDetalle {
  nombre: string
  hora_reunion?: string | null
  direccion?: { latitud?: number; longitud?: number; lat?: number; lng?: number } | null
  miembros: Array<{ id: string; nombre: string; apellido: string; rol?: string | null }>
}

export default async function RegistrarAsistenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <DashboardLayout>
        <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <TituloSistema nivel={2}>Acceso requerido</TituloSistema>
              <p className="text-muted-foreground mb-4">Debes iniciar sesión para acceder a esta página.</p>
              <Link href="/login">
                <BotonSistema variante="primario">Iniciar Sesión</BotonSistema>
              </Link>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  const [{ data: grupoRaw }, { data: puedeEditar }, configResult] = await Promise.all([
    supabase.rpc("obtener_detalle_grupo", { p_auth_id: user.id, p_grupo_id: id }),
    supabase.rpc("puede_editar_grupo", { p_auth_id: user.id, p_grupo_id: id }),
    obtenerConfiguracionGrupos(),
  ])

  const grupo = grupoRaw as GrupoDetalle | null

  if (!grupo || !puedeEditar) {
    return (
      <DashboardLayout>
        <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <TituloSistema nivel={2}>Sin permisos</TituloSistema>
              <p className="text-muted-foreground mb-4">No tienes permiso para registrar asistencia en este grupo.</p>
              <Link href={`/grupos-vida/${id}`}>
                <BotonSistema variante="primario">Volver al grupo</BotonSistema>
              </Link>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    )
  }

  // Normalizar lat/lng si existen
  if (grupo.direccion) {
    grupo.direccion.lat = grupo.direccion.latitud
    grupo.direccion.lng = grupo.direccion.longitud
  }

  const configuracion = configResult.success && configResult.data
    ? {
      visitantes_habilitados: configResult.data.visitantes_habilitados,
      puntos_oracion_compartidos: configResult.data.puntos_oracion_compartidos,
      modo_cierre_asistencia: configResult.data.modo_cierre_asistencia,
    }
    : undefined

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo={`Registrar Asistencia - ${grupo.nombre}`}
        descripcion="Registra la asistencia y notas pastorales de la reunión."
        botonRegreso={{ href: `/grupos-vida/${id}`, texto: "Volver al grupo" }}
      >
        <RegistroAsistenciaAvanzado
          grupoId={id}
          miembros={(grupo.miembros || []).map((m: { id: string; nombre: string; apellido: string; rol?: string | null }) => ({
            id: m.id,
            nombre: m.nombre,
            apellido: m.apellido,
            rol: m.rol || undefined,
          }))}
          configuracion={configuracion}
          initialData={grupo.hora_reunion ? { hora: grupo.hora_reunion } : undefined}
        />
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
