import { redirect } from "next/navigation"
import Link from "next/link"
import { Layers, Users, ChevronRight } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { ContenedorDashboard, TarjetaSistema, TextoSistema, BotonSistema } from "@/components/ui/sistema-diseno"
import GestionSegmentosModales from "@/components/grupos/FormularioSegmento.client"

export default async function Page() {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData) redirect("/login")

  // Solo admin, pastor, director-general y director-etapa pueden ver segmentos (líderes no)
  const rolesPermitidos = ["admin", "pastor", "director-general", "director-etapa"]
  const tieneAcceso = userData.roles.some((r) => rolesPermitidos.includes(r))
  if (!tieneAcceso) redirect("/grupos-vida")

  // Solo admin puede crear/editar/eliminar segmentos
  const puedeGestionar = userData.roles.includes("admin")

  const esAdmin = userData.roles.includes("admin")
  const esPastor = userData.roles.includes("pastor")
  const esDG = userData.roles.includes("director-general")
  const esDE = userData.roles.includes("director-etapa")

  let lista: { id: string; nombre: string; campus_id: string | null }[] = []

  if (esAdmin || esPastor) {
    // Admin y pastor ven todos los segmentos
    const { data: segmentos } = await supabase
      .from("segmentos")
      .select("id, nombre, campus_id")
      .order("nombre", { ascending: true })
    lista = segmentos ?? []
  } else if (esDG) {
    // DG ve solo sus segmentos asignados via director_general_segmentos
    const adminDb = createSupabaseAdminClient()
    const { data: usuarioData } = await adminDb
      .from("usuarios")
      .select("id")
      .eq("auth_id", userData.user.id)
      .single()

    if (usuarioData) {
      const { data: asignaciones } = await adminDb
        .from("director_general_segmentos")
        .select("segmento_id")
        .eq("usuario_id", usuarioData.id)

      const segmentoIds = asignaciones?.map((a) => a.segmento_id).filter(Boolean) ?? []

      if (segmentoIds.length > 0) {
        const { data: segmentos } = await supabase
          .from("segmentos")
          .select("id, nombre, campus_id")
          .in("id", segmentoIds)
          .order("nombre", { ascending: true })
        lista = segmentos ?? []
      }
    }
  } else if (esDE) {
    // Director de etapa ve solo sus segmentos asignados via segmento_lideres
    const adminDb = createSupabaseAdminClient()

    // Obtener usuario_id interno
    const { data: usuarioData } = await adminDb
      .from("usuarios")
      .select("id")
      .eq("auth_id", userData.user.id)
      .single()

    if (usuarioData) {
      // Obtener segmento_ids asignados al director de etapa
      const { data: asignaciones } = await adminDb
        .from("segmento_lideres")
        .select("segmento_id")
        .eq("usuario_id", usuarioData.id)
        .eq("tipo_lider", "director_etapa")

      const segmentoIds = asignaciones?.map((a) => a.segmento_id).filter(Boolean) ?? []

      if (segmentoIds.length > 0) {
        const { data: segmentos } = await supabase
          .from("segmentos")
          .select("id, nombre, campus_id")
          .in("id", segmentoIds)
          .order("nombre", { ascending: true })
        lista = segmentos ?? []
      }
    }
  }

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Segmentos"
        botonRegreso={{ href: "/grupos-vida", texto: "Grupos de Vida" }}
        accionPrincipal={
          puedeGestionar ? (
            <GestionSegmentosModales segmentos={lista} trigger="boton" />
          ) : undefined
        }
      >
        {lista.length > 0 ? (
          <>
            {/* Desktop: tabla */}
            <TarjetaSistema className="hidden md:block">
              <div className="overflow-hidden">
                <table className="w-full divide-y divide-border">
                  <thead>
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Segmento</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lista.map((seg) => (
                      <tr key={seg.id} className="hover:bg-accent/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Link href={`/grupos-vida/segmentos/${seg.id}`} className="flex items-center gap-3 hover:text-orange-600 transition-colors">
                            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                              <Users className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <span className="font-medium text-foreground">{seg.nombre}</span>
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            {puedeGestionar && (
                              <GestionSegmentosModales segmentos={lista} trigger="editar" segmentoEditar={seg} />
                            )}
                            <Link href={`/grupos-vida/segmentos/${seg.id}`}>
                              <BotonSistema variante="outline" tamaño="sm">
                                <Users className="w-3.5 h-3.5 mr-1.5" />
                                Directores
                              </BotonSistema>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TarjetaSistema>

            {/* Móvil: tarjetas */}
            <div className="md:hidden flex flex-col gap-4">
              {lista.map((seg) => (
                <Link key={seg.id} href={`/grupos-vida/segmentos/${seg.id}`}>
                  <TarjetaSistema className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground truncate">{seg.nombre}</h3>
                        <p className="text-xs text-muted-foreground">Gestionar directores</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                  </TarjetaSistema>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <TarjetaSistema variante="outlined" className="py-12 text-center">
            <Layers className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
            <TextoSistema variante="muted" className="font-medium">
              {esDG ? "No tienes segmentos asignados" : "No hay segmentos registrados."}
            </TextoSistema>
            {esDG && (
              <TextoSistema variante="muted" tamaño="sm" className="mt-1">
                Contacta al administrador para que te asigne segmentos.
              </TextoSistema>
            )}
          </TarjetaSistema>
        )}
      </ContenedorDashboard>

      {/* FAB móvil para crear segmento — solo admin */}
      {puedeGestionar && (
        <GestionSegmentosModales segmentos={lista} trigger="fab" />
      )}
    </DashboardLayout>
  )
}
