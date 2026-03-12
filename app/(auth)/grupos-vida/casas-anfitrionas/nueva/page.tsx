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
 *
 * - Verifica autenticación y roles de liderazgo.
 * - Carga catálogos de estados, municipios y parroquias para cascading.
 * - Renderiza FormCasaAnfitriona dentro de DashboardLayout + ContenedorDashboard.
 */
export default async function NuevaCasaAnfitrionaPage() {
    const supabase = await createSupabaseServerClient();
    const userData = await getUserWithRoles(supabase);

    if (!userData) redirect("/login");

    const tieneAcceso = userData.roles.some((r) => ROLES_LIDERAZGO.includes(r));
    if (!tieneAcceso) redirect("/grupos-vida/casas-anfitrionas");

    // Cargar catálogos de ubicación para cascading
    const [{ data: estados }, { data: municipios }, { data: parroquias }] = await Promise.all([
        supabase.from("estados").select("id, nombre").order("nombre"),
        supabase.from("municipios").select("id, nombre, estado_id").order("nombre"),
        supabase.from("parroquias").select("id, nombre, municipio_id").order("nombre"),
    ]);

    const estadosOptions = (estados ?? []).map((e) => ({
        value: e.id,
        label: e.nombre,
    }));

    const municipiosOptions = (municipios ?? []).map((m) => ({
        value: m.id,
        label: m.nombre,
        parentId: m.estado_id,
    }));

    const parroquiasOptions = (parroquias ?? []).map((p) => ({
        value: p.id,
        label: p.nombre,
        parentId: p.municipio_id,
    }));

    return (
        <DashboardLayout>
            <ContenedorDashboard
                titulo="Registrar Casa Anfitriona"
                botonRegreso={{ href: "/grupos-vida/casas-anfitrionas", texto: "Casas Anfitrionas" }}
            >
                <TarjetaSistema className="p-4 sm:p-6">
                    <NuevaCasaClient
                        estados={estadosOptions}
                        municipios={municipiosOptions}
                        parroquias={parroquiasOptions}
                    />
                </TarjetaSistema>
            </ContenedorDashboard>
        </DashboardLayout>
    );
}
