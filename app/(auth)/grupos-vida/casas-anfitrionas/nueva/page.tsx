import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ContenedorDashboard, TarjetaSistema } from "@/components/ui/sistema-diseno";
import { NuevaCasaClient } from "./nueva-casa-client";
import { obtenerUsuariosAsignablesCasaAnfitriona } from "@/lib/casas-anfitrionas/assignable-users";
import {
    obtenerPermisosCasaAnfitrionaUI,
    puedeMostrarRegistroCasa,
} from "@/lib/casas-anfitrionas/ui-permissions";

/**
 * Página para registrar una nueva casa anfitriona.
 *
 * - Verifica autenticación y permisos backend de creación.
 * - Carga catálogos de estados, municipios y parroquias para cascading.
 * - Si el backend permite crear para otros, carga usuarios asignables ya filtrados.
 */
export default async function NuevaCasaAnfitrionaPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const permisosCasa = await obtenerPermisosCasaAnfitrionaUI(supabase, user.id);
    if (!puedeMostrarRegistroCasa(permisosCasa)) redirect("/grupos-vida/casas-anfitrionas");

    // Cargar catálogos de ubicación en paralelo
    const [{ data: estados }, { data: municipios }, { data: parroquias }] = await Promise.all([
        supabase.from("estados").select("id, nombre").order("nombre"),
        supabase.from("municipios").select("id, nombre, estado_id").order("nombre"),
        supabase.from("parroquias").select("id, nombre, municipio_id").order("nombre"),
    ]);

    // Cargar usuarios elegibles solo cuando el backend permite asignar propietario.
    let usuariosOptions: { value: string; label: string }[] = [];

    if (permisosCasa.puedeCrearParaOtros) {
        const adminDb = createSupabaseAdminClient();
        usuariosOptions = await obtenerUsuariosAsignablesCasaAnfitriona({
            supabase,
            adminDb,
            authId: user.id,
        });
    }

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
                        usuarios={usuariosOptions}
                        mostrarSelectorUsuario={permisosCasa.puedeCrearParaOtros}
                    />
                </TarjetaSistema>
            </ContenedorDashboard>
        </DashboardLayout>
    );
}
