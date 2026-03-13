import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getUserWithRoles } from "@/lib/getUserWithRoles";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ContenedorDashboard, TarjetaSistema } from "@/components/ui/sistema-diseno";
import { NuevaCasaClient } from "./nueva-casa-client";

/** Roles con acceso a registrar casas anfitrionas */
const ROLES_LIDERAZGO = ["admin", "pastor", "director-general", "director-etapa", "lider"];

/** Roles que pueden registrar casa para otro usuario */
const ROLES_GESTION = ["admin", "pastor", "director-general", "director-etapa", "lider"];

/**
 * Página para registrar una nueva casa anfitriona.
 *
 * - Verifica autenticación y roles de liderazgo.
 * - Carga catálogos de estados, municipios y parroquias para cascading.
 * - Para admin/pastor/director: carga lista de usuarios para el selector de propietario.
 */
export default async function NuevaCasaAnfitrionaPage() {
    const supabase = await createSupabaseServerClient();
    const userData = await getUserWithRoles(supabase);

    if (!userData) redirect("/login");

    const tieneAcceso = userData.roles.some((r) => ROLES_LIDERAZGO.includes(r));
    if (!tieneAcceso) redirect("/grupos-vida/casas-anfitrionas");

    const puedeGestionar = userData.roles.some((r) => ROLES_GESTION.includes(r));
    const esAdmin = userData.roles.some((r) => ["admin", "pastor", "director-general"].includes(r));

    // Cargar catálogos de ubicación en paralelo
    const [{ data: estados }, { data: municipios }, { data: parroquias }] = await Promise.all([
        supabase.from("estados").select("id, nombre").order("nombre"),
        supabase.from("municipios").select("id, nombre, estado_id").order("nombre"),
        supabase.from("parroquias").select("id, nombre, municipio_id").order("nombre"),
    ]);

    // Cargar usuarios elegibles (solo si puede gestionar)
    let usuariosOptions: { value: string; label: string }[] = [];

    if (puedeGestionar) {
        // 1. Obtener IDs de usuarios que ya tienen casa anfitriona (como principal o co-anfitrión)
        const { data: casasExistentes } = await supabase
            .from("casas_anfitrionas")
            .select("usuario_id, co_anfitrion_id");
        const idsConCasa = new Set(
            (casasExistentes ?? []).flatMap((c) =>
                [c.usuario_id, c.co_anfitrion_id].filter(Boolean) as string[]
            )
        );

        if (esAdmin) {
            // Admin/pastor/director-general: todos los usuarios sin casa
            const { data: todosUsuarios } = await supabase
                .from("usuarios")
                .select("id, nombre, apellido")
                .order("nombre");
            usuariosOptions = (todosUsuarios ?? [])
                .filter((u) => !idsConCasa.has(u.id))
                .map((u) => ({ value: u.id, label: `${u.nombre} ${u.apellido}`.trim() }));
        } else {
            // Líder/director-etapa: usar admin client para bypasear RLS en grupo_miembros
            const adminDb = createSupabaseAdminClient();
            const { data: miUsuario } = await adminDb
                .from("usuarios")
                .select("id")
                .eq("auth_id", userData.user.id)
                .single();

            if (miUsuario?.id) {
                // Buscar grupo_ids donde soy Líder o Colíder
                const { data: misRoles } = await adminDb
                    .from("grupo_miembros")
                    .select("grupo_id")
                    .eq("usuario_id", miUsuario.id)
                    .in("rol", ["Líder", "Colíder"])
                    .is("fecha_salida", null);

                const grupoIdsCandidatos = (misRoles ?? []).map((r) => r.grupo_id);

                // Filtrar solo grupos activos
                let grupoIds: string[] = [];
                if (grupoIdsCandidatos.length > 0) {
                    const { data: gruposActivos } = await adminDb
                        .from("grupos")
                        .select("id")
                        .in("id", grupoIdsCandidatos)
                        .eq("activo", true);
                    grupoIds = (gruposActivos ?? []).map((g) => g.id);
                }

                // Obtener miembros de esos grupos
                if (grupoIds.length > 0) {
                    const { data: miembrosRaw } = await adminDb
                        .from("grupo_miembros")
                        .select("usuario_id")
                        .in("grupo_id", grupoIds)
                        .is("fecha_salida", null);

                    const miembroIds = [...new Set(
                        (miembrosRaw ?? [])
                            .map((m) => m.usuario_id)
                            .filter((id) => !idsConCasa.has(id))
                    )];

                    if (miembroIds.length > 0) {
                        const { data: usuariosFetch } = await adminDb
                            .from("usuarios")
                            .select("id, nombre, apellido")
                            .in("id", miembroIds)
                            .order("nombre");

                        usuariosOptions = (usuariosFetch ?? []).map((u) => ({
                            value: u.id,
                            label: `${u.nombre} ${u.apellido}`.trim(),
                        }));
                    }
                }
            }
        }
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
                        mostrarSelectorUsuario={puedeGestionar}
                    />
                </TarjetaSistema>
            </ContenedorDashboard>
        </DashboardLayout>
    );
}
