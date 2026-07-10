import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/getUserWithRoles";

import { ContenedorDashboard } from "@/components/ui/sistema-diseno";
import { ConfiguracionPanel } from "@/components/grupos-vida/configuracion-panel";
import { obtenerConfiguracionGrupos } from "@/lib/actions/configuracion-grupos-vida.actions";

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

    // COR-006: Pre-cargar config desde Server Component
    const resultado = await obtenerConfiguracionGrupos();
    const configInicial = resultado.success ? resultado.data ?? null : null;

    return (
<ContenedorDashboard
                titulo="Configuración"
                descripcion="Ajustes generales del módulo de grupos de vida"
                botonRegreso={{ href: "/grupos-vida", texto: "Grupos" }}
            >
                <ConfiguracionPanel configInicial={configInicial} />
            </ContenedorDashboard>
);
}
