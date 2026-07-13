import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/getUserWithRoles";

import { ContenedorDashboard } from "@/components/ui/sistema-diseno";
import { listarSolicitudesPendientes, listarSolicitudesCompletadas } from "@/lib/actions/solicitudes-grupo.actions";
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

    const [pendientesRes, completadasRes] = await Promise.all([
        listarSolicitudesPendientes(),
        listarSolicitudesCompletadas(),
    ]);

    return (
<ContenedorDashboard
                titulo="Solicitudes"
                descripcion="Gestiona las solicitudes de grupos de vida"
                botonRegreso={{ href: "/grupos-vida", texto: "Grupos" }}
            >
                <SolicitudesPendientesClient
                    solicitudesIniciales={pendientesRes.success ? (pendientesRes.data ?? []) : []}
                    solicitudesCompletadas={completadasRes.success ? (completadasRes.data ?? []) : []}
                />
            </ContenedorDashboard>
);
}
