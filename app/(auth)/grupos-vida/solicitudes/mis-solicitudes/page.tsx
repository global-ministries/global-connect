import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/getUserWithRoles";

import { ContenedorDashboard } from "@/components/ui/sistema-diseno";
import { obtenerMisSolicitudes } from "@/lib/actions/solicitudes-grupo.actions";
import { MisSolicitudesClient } from "./MisSolicitudesClient";

export default async function MisSolicitudesPage() {
    const supabase = await createSupabaseServerClient();
    const userData = await getUserWithRoles(supabase);
    if (!userData) redirect("/login");

    const resultado = await obtenerMisSolicitudes();
    const solicitudes = resultado.success ? (resultado.data ?? []) : [];

    return (
<ContenedorDashboard
                titulo="Mis Solicitudes"
                descripcion="Historial de solicitudes que has creado"
                botonRegreso={{ href: "/grupos-vida", texto: "Grupos" }}
            >
                <MisSolicitudesClient solicitudes={solicitudes} />
            </ContenedorDashboard>
);
}
