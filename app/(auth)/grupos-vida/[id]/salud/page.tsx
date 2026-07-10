import { createSupabaseServerClient } from "@/lib/supabase/server"

import { ContenedorDashboard, TituloSistema, BotonSistema } from "@/components/ui/sistema-diseno"
import VistaSaludMiembros from "@/components/grupos/VistaSaludMiembros.client"
import { obtenerSaludMiembrosGrupo } from "@/lib/actions/asistencia-avanzada.actions"
import Link from "next/link"

/** Forma mínima del resultado de obtener_detalle_grupo relevante para esta página */
interface GrupoDetalle {
    nombre: string
}

export default async function SaludMiembrosPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return (
<ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
                    <div className="flex items-center justify-center min-h-[50vh]">
                        <div className="text-center">
                            <TituloSistema nivel={2}>Acceso requerido</TituloSistema>
                            <p className="text-muted-foreground mb-4">Debes iniciar sesión.</p>
                            <Link href="/login">
                                <BotonSistema variante="primario">Iniciar Sesión</BotonSistema>
                            </Link>
                        </div>
                    </div>
                </ContenedorDashboard>
)
    }

    const [{ data: puedeEditar }, saludResult, { data: grupoRaw }] = await Promise.all([
        supabase.rpc("puede_editar_grupo", { p_auth_id: user.id, p_grupo_id: id }),
        obtenerSaludMiembrosGrupo(id),
        supabase.rpc("obtener_detalle_grupo", { p_auth_id: user.id, p_grupo_id: id }),
    ])

    const grupo = grupoRaw as GrupoDetalle | null

    if (!grupo || !puedeEditar) {
        return (
<ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
                    <div className="flex items-center justify-center min-h-[50vh]">
                        <div className="text-center">
                            <div className="text-red-500 text-6xl mb-4">⚠️</div>
                            <TituloSistema nivel={2}>Sin permisos</TituloSistema>
                            <p className="text-muted-foreground mb-4">No tienes permiso para ver la salud de este grupo.</p>
                            <Link href={`/grupos-vida/${id}`}>
                                <BotonSistema variante="primario">Volver al grupo</BotonSistema>
                            </Link>
                        </div>
                    </div>
                </ContenedorDashboard>
)
    }

    return (
<ContenedorDashboard
                titulo={`Salud del Grupo - ${grupo?.nombre ?? ""}`}
                descripcion="Seguimiento de asistencia, riesgo y bienestar de los miembros."
                botonRegreso={{ href: `/grupos-vida/${id}`, texto: "Volver al grupo" }}
            >
                <VistaSaludMiembros
                    miembros={saludResult.success ? (saludResult.data ?? []) : []}
                    grupoId={id}
                />
            </ContenedorDashboard>
)
}
