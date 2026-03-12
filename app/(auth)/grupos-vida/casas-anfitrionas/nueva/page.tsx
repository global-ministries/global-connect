import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/getUserWithRoles";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ContenedorDashboard, TarjetaSistema } from "@/components/ui/sistema-diseno";
import { NuevaCasaClient } from "./nueva-casa-client";

/** Roles con acceso a registrar casas anfitrionas */
const ROLES_LIDERAZGO = ["admin", "pastor", "director-general", "director-etapa", "lider"];

/**
 * Página para registrar una nueva casa anfitriona.
 * - Verifica autenticación y roles de liderazgo.
 * - Carga el catálogo de parroquias para el formulario.
 * - Renderiza FormCasaAnfitriona dentro de DashboardLayout + ContenedorDashboard.
 */
export default async function NuevaCasaAnfitrionaPage() {
    const supabase = await createSupabaseServerClient();
    const userData = await getUserWithRoles(supabase);

    if (!userData) redirect("/login");

    const tieneAcceso = userData.roles.some((r) => ROLES_LIDERAZGO.includes(r));
    if (!tieneAcceso) redirect("/grupos-vida/casas-anfitrionas");

    // Cargar parroquias para el selector del formulario
    const { data: parroquias } = await supabase
        .from("parroquias")
        .select("id, nombre")
        .order("nombre");

    const parroquiasOptions = (parroquias ?? []).map((p) => ({
        value: p.id,
        label: p.nombre,
    }));

    return (
        <DashboardLayout>
            <ContenedorDashboard
                titulo="Registrar Casa Anfitriona"
                botonRegreso={{ href: "/grupos-vida/casas-anfitrionas", texto: "Casas Anfitrionas" }}
            >
                <TarjetaSistema className="p-4 sm:p-6">
                    <NuevaCasaClient parroquias={parroquiasOptions} />
                </TarjetaSistema>
            </ContenedorDashboard>
        </DashboardLayout>
    );
}
