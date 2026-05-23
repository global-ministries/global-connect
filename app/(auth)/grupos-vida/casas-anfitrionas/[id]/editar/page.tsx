import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extraerRelacion } from "@/lib/supabase/helpers";
import { redirect, notFound } from "next/navigation";
import { getUserWithRoles } from "@/lib/getUserWithRoles";
import { ContenedorDashboard } from "@/components/ui/sistema-diseno";
import { EditarCasaClient } from "./editar-casa-client";
import { z } from "zod";

interface PageProps {
    params: Promise<{ id: string }>;
}

/** Roles con capacidad de gestión de casas */
const ROLES_GESTION = ["admin", "pastor", "director-general", "director-etapa", "lider"];

/**
 * Página de edición de casa anfitriona.
 *
 * Carga los datos actuales de la casa, catálogos de ubicación y
 * lista de miembros asignables (para roles de gestión).
 * Renderiza el formulario con datos pre-cargados.
 */
export default async function EditarCasaAnfitrionaPage({ params }: PageProps) {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // Cargar casa con todos sus datos
    const { data: casa } = await supabase
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

    // Verificar permisos: dueño o con rol de gestión
    const { data: puedeGestionar } = await supabase.rpc("puede_gestionar_casas", {
        p_auth_id: user.id,
    });

    // Obtener userId interno para verificar propiedad
    const { data: currentUser } = await supabase
        .from("usuarios")
        .select("id")
        .eq("auth_id", user.id)
        .single();

    const esDueno = currentUser?.id === casa.usuario_id;
    if (!esDueno && !puedeGestionar) redirect("/grupos-vida/casas-anfitrionas");

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

    // Determinar si mostrar selector de usuario
    const userWithRoles = await getUserWithRoles(supabase);
    const roles: string[] = userWithRoles?.roles ?? [];
    const tieneRolGestion = roles.some((r) => ROLES_GESTION.includes(r));

    // Cargar miembros si tiene rol de gestión
    const usuariosOptions: { value: string; label: string }[] = [];
    if (tieneRolGestion && currentUser) {
        const admin = createSupabaseAdminClient();
        const esAdmin = roles.some((r: string) => ["admin", "pastor", "director-general", "director-etapa"].includes(r));

        let grupoIds: string[] = [];

        if (esAdmin) {
            // Admin/pastor/director: puede ver todos los grupos activos
            const { data: todosGrupos } = await admin
                .from("grupos")
                .select("id")
                .eq("activo", true)
                .eq("eliminado", false);
            grupoIds = (todosGrupos ?? []).map((g) => g.id);
        } else {
            // Líder/colíder: solo sus grupos
            const { data: gruposLider } = await admin
                .from("grupo_miembros")
                .select("grupo_id")
                .eq("usuario_id", currentUser.id)
                .in("rol", ["Líder", "Colíder"]);
            grupoIds = (gruposLider ?? []).map((g) => g.grupo_id);
        }

        if (grupoIds.length > 0) {
            const { data: miembrosGrupo } = await admin
                .from("grupo_miembros")
                .select("usuario_id, usuarios!grupo_miembros_usuario_id_fkey(id, nombre, apellido)")
                .in("grupo_id", grupoIds)
                .eq("activo", true);

            // Filtrar duplicados y excluir miembros que ya tienen casa (excepto la actual)
            const { data: casasExistentes } = await admin
                .from("casas_anfitrionas")
                .select("usuario_id")
                .neq("id", id);

            const idsConCasa = new Set((casasExistentes ?? []).map((c) => c.usuario_id));
            const vistos = new Set<string>();

            for (const m of miembrosGrupo ?? []) {
                const u = extraerRelacion<{ id: string; nombre: string; apellido: string }>(m.usuarios);
                if (u && !vistos.has(u.id) && !idsConCasa.has(u.id)) {
                    vistos.add(u.id);
                    usuariosOptions.push({
                        value: u.id,
                        label: `${u.nombre} ${u.apellido}`.trim(),
                    });
                }
            }

            // Incluir al usuario actual de la casa (siempre debe aparecer)
            if (casa.usuario_id && !vistos.has(casa.usuario_id)) {
                const usuario = extraerRelacion<{ id: string; nombre: string; apellido: string }>(casa.usuarios);
                if (usuario) {
                    usuariosOptions.unshift({
                        value: usuario.id,
                        label: `${usuario.nombre} ${usuario.apellido}`.trim(),
                    });
                }
            }
        }
    }

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
                mostrarSelectorUsuario={tieneRolGestion}
            />
        </ContenedorDashboard>
    );
}
