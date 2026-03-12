import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/getUserWithRoles";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ContenedorDashboard, TextoSistema, TarjetaSistema } from "@/components/ui/sistema-diseno";
import { ConfiguracionPanel } from "@/components/grupos-vida/configuracion-panel";

export default async function ConfiguracionPage() {
    const supabase = await createSupabaseServerClient();
    const userData = await getUserWithRoles(supabase);
    if (!userData) redirect("/login");

    // Solo admin y pastor pueden ver la configuración
    const esSuperadmin = userData.roles.some((r) =>
        ["admin", "pastor"].includes(r)
    );

    if (!esSuperadmin) {
        redirect("/grupos-vida");
    }

    return (
        <DashboardLayout>
            <ContenedorDashboard
                titulo="Configuración"
                descripcion="Ajustes generales del módulo de grupos de vida"
                botonRegreso={{ href: "/grupos-vida", texto: "Grupos" }}
            >
                <ConfiguracionPanel />
            </ContenedorDashboard>
        </DashboardLayout>
    );
}
