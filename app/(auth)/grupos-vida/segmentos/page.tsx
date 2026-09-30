/**
 * Grupos de Vida — /grupos-vida/segmentos (RSC).
 *
 * The list of segments with, per segment, its stage directors, active groups,
 * groups pending approval and the active groups without a stage director. The
 * server loader (lib/platform/grupos-vida/segmentos-datos.ts) checks the role
 * again before reading anything and builds the serializable view model; the
 * client island (components/grupos-vida/segmentos/segmentos-client.tsx) renders
 * it. Only admin creates, edits and deletes segments.
 */
import { redirect } from "next/navigation"
import { Layers } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { cargarVistaSegmentos } from "@/lib/platform/grupos-vida/segmentos-datos"

import { ContenedorDashboard, TarjetaSistema, TextoSistema } from "@/components/ui/sistema-diseno"
import GestionSegmentosModales from "@/components/grupos/FormularioSegmento.client"
import { SegmentosClient } from "@/components/grupos-vida/segmentos/segmentos-client"

export default async function Page() {
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData) redirect("/login")

  // Solo admin, pastor, director-general y director-etapa pueden ver segmentos (líderes no)
  const rolesPermitidos = ["admin", "pastor", "director-general", "director-etapa"]
  const tieneAcceso = userData.roles.some((r) => rolesPermitidos.includes(r))
  if (!tieneAcceso) redirect("/grupos-vida")

  const datos = await cargarVistaSegmentos({ authId: userData.user.id, roles: userData.roles })
  if (!datos) redirect("/grupos-vida")

  const { vista, puedeGestionar, esGeneralSinSegmentos } = datos

  return (
    <>
      <ContenedorDashboard
        titulo="Segmentos"
        botonRegreso={{ href: "/grupos-vida", texto: "Grupos de Vida" }}
        accionPrincipal={
          puedeGestionar ? (
            <GestionSegmentosModales segmentos={vista.filas.map((f) => ({ id: f.id, nombre: f.nombre }))} trigger="boton" />
          ) : undefined
        }
      >
        <p className="-mt-2 text-sm text-muted-foreground md:text-[15px]">Etapas en las que se organizan los grupos de vida</p>

        {vista.filas.length > 0 ? (
          <SegmentosClient vista={vista} puedeGestionar={puedeGestionar} />
        ) : (
          <TarjetaSistema variante="outlined" className="py-12 text-center">
            <Layers className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
            <TextoSistema variante="muted" className="font-medium">
              {esGeneralSinSegmentos ? "No tienes segmentos asignados" : "No hay segmentos registrados."}
            </TextoSistema>
            {esGeneralSinSegmentos && (
              <TextoSistema variante="muted" tamaño="sm" className="mt-1">
                Contacta al administrador para que te asigne segmentos.
              </TextoSistema>
            )}
          </TarjetaSistema>
        )}
      </ContenedorDashboard>

      {/* FAB móvil para crear segmento — solo admin */}
      {puedeGestionar && (
        <GestionSegmentosModales segmentos={vista.filas.map((f) => ({ id: f.id, nombre: f.nombre }))} trigger="fab" />
      )}
    </>
  )
}
