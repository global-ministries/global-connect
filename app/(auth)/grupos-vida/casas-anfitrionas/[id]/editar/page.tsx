import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extraerRelacion } from "@/lib/supabase/helpers";
import { redirect, notFound } from "next/navigation";
import { ContenedorDashboard } from "@/components/ui/sistema-diseno";
import { EditarCasaClient } from "./editar-casa-client";
import { z } from "zod";
import { obtenerUsuariosAsignablesCasaAnfitriona } from "@/lib/casas-anfitrionas/assignable-users";
import { obtenerPermisosCasaAnfitrionaUI } from "@/lib/casas-anfitrionas/ui-permissions";

interface PageProps {
    params: Promise<{ id: string }>;
}

/**
 * Página de edición de casa anfitriona.
 *
 * Carga los datos actuales de la casa, catálogos de ubicación y
 * lista de miembros asignables según permisos backend.
 * Renderiza el formulario con datos pre-cargados.
 */
export default async function EditarCasaAnfitrionaPage({ params }: PageProps) {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: puedeEditar, error: editPermissionError } = await supabase.rpc("puede_editar_casa_anfitriona", {
        p_auth_id: user.id,
        p_casa_id: id,
    });

    if (editPermissionError || puedeEditar !== true) redirect("/grupos-vida/casas-anfitrionas");

    const permisosCasa = await obtenerPermisosCasaAnfitrionaUI(supabase, user.id, id);
    const adminDb = createSupabaseAdminClient();

    // Cargar casa con todos sus datos
    const { data: casa } = await adminDb
        .from("casas_anfitrionas")
        .select(`
      *,
      usuarios!casas_anfitrionas_usuario_id_fkey ( id, nombre, apellido ),
      direcciones!casas_anfitrionas_direccion_id_fkey (
        calle, barrio, codigo_postal, referencia, latitud, longitud,
        parroquia_id,
        parroquias!direcciones_parroquia_id_fkey (
          id, municipio_id,
          municipios!parroquias_municipio_id_fkey (
            id, estado_id
          )
        )
      )
    `)
        .eq("id", id)
        .single();

    if (!casa) notFound();

    // Cargar catálogos de ubicación
    const [{ data: estados }, { data: municipios }, { data: parroquias }] = await Promise.all([
        supabase.from("estados").select("id, nombre").order("nombre"),
        supabase.from("municipios").select("id, nombre, estado_id").order("nombre"),
        supabase.from("parroquias").select("id, nombre, municipio_id").order("nombre"),
    ]);

    // Extraer datos de dirección
    const direccion = extraerRelacion<{
        calle: string; barrio: string | null; codigo_postal: string | null;
        referencia: string | null; latitud: number | null; longitud: number | null;
        parroquia_id: string | null;
        parroquias: {
            id: string; municipio_id: string;
            municipios: { id: string; estado_id: string };
        } | null;
    }>(casa.direcciones);

    // Parsear disponibilidad JSONB
    const disponibilidadSchema = z.array(z.object({
        dia: z.string(),
        disponible: z.boolean(),
    })).catch([]);
    const disponibilidad = disponibilidadSchema.parse(casa.disponibilidad);
    const diasActivos = disponibilidad.filter((d) => d.disponible).map((d) => d.dia.toLowerCase());

    // Construir datos iniciales
    const datosIniciales = {
        nombre_lugar: casa.nombre_lugar,
        descripcion: casa.descripcion ?? undefined,
        capacidad_maxima: casa.capacidad_maxima ?? undefined,
        calle: direccion?.calle ?? "",
        barrio: direccion?.barrio ?? undefined,
        codigo_postal: direccion?.codigo_postal ?? undefined,
        referencia: direccion?.referencia ?? undefined,
        estado_id: direccion?.parroquias?.municipios?.estado_id ?? undefined,
        municipio_id: direccion?.parroquias?.municipio_id ?? undefined,
        parroquia_id: direccion?.parroquia_id ?? undefined,
        lat: direccion?.latitud ?? undefined,
        lng: direccion?.longitud ?? undefined,
        notas_publicas: casa.notas_publicas ?? undefined,
        usuario_id: casa.usuario_id ?? undefined,
        disponibilidad_lunes: diasActivos.includes("lunes"),
        disponibilidad_martes: diasActivos.includes("martes"),
        disponibilidad_miercoles: diasActivos.includes("miércoles") || diasActivos.includes("miercoles"),
        disponibilidad_jueves: diasActivos.includes("jueves"),
        disponibilidad_viernes: diasActivos.includes("viernes"),
        disponibilidad_sabado: diasActivos.includes("sábado") || diasActivos.includes("sabado"),
        disponibilidad_domingo: diasActivos.includes("domingo"),
    };

    // Preparar opciones para selects
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

    const usuarioActual = extraerRelacion<{ id: string; nombre: string; apellido: string }>(casa.usuarios);
    const usuariosOptions = permisosCasa.puedeCrearParaOtros
        ? await obtenerUsuariosAsignablesCasaAnfitriona({
            supabase,
            adminDb,
            authId: user.id,
            currentCasaId: id,
            currentOwner: usuarioActual
                ? { value: usuarioActual.id, label: `${usuarioActual.nombre} ${usuarioActual.apellido}`.trim() }
                : null,
        })
        : [];

    return (
        <ContenedorDashboard
            titulo={`Editar ${casa.nombre_lugar}`}
            botonRegreso={{ href: `/grupos-vida/casas-anfitrionas/${id}`, texto: "Detalle" }}
        >
            <EditarCasaClient
                casaId={id}
                datosIniciales={datosIniciales}
                estados={estadosOptions}
                municipios={municipiosOptions}
                parroquias={parroquiasOptions}
                usuarios={usuariosOptions}
                mostrarSelectorUsuario={permisosCasa.puedeCrearParaOtros}
            />
        </ContenedorDashboard>
    );
}
