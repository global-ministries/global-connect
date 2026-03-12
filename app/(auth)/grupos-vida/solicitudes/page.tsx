import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/getUserWithRoles";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ContenedorDashboard } from "@/components/ui/sistema-diseno";
import { listarSolicitudesPendientes } from "@/lib/actions/solicitudes-grupo.actions";
import { SolicitudesPendientesClient } from "./SolicitudesPendientesClient";

export default async function SolicitudesPage() {
    const supabase = await createSupabaseServerClient();
    const userData = await getUserWithRoles(supabase);
    if (!userData) redirect("/login");

    // Solo DG+ puede ver solicitudes pendientes
    const esDG = userData.roles.some((r) =>
        ["admin", "pastor", "director-general"].includes(r)
    );

    if (!esDG) {
        redirect("/grupos-vida/solicitudes/mis-solicitudes");
    }

    const resultado = await listarSolicitudesPendientes();

    return (
        <DashboardLayout>
            <ContenedorDashboard
                titulo="Solicitudes Pendientes"
                descripcion="Aprueba o rechaza solicitudes de gestión de grupos"
                botonRegreso={{ href: "/grupos-vida", texto: "Grupos" }}
            >
                <SolicitudesPendientesClient
                    solicitudesIniciales={resultado.success ? (resultado.data ?? []) : []}
                />
            </ContenedorDashboard>
        </DashboardLayout>
    );
}
