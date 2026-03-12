import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extraerRelacion } from "@/lib/supabase/helpers";
import { redirect, notFound } from "next/navigation";
import { z } from "zod";
import {
    ContenedorDashboard,
    TarjetaSistema,
    TextoSistema,
    TituloSistema,
    BadgeSistema,
    BotonSistema,
    SeparadorSistema,
} from "@/components/ui/sistema-diseno";
import { BadgeEstadoCiclo } from "@/components/grupos-vida/badge-estado-ciclo";
import { Home, MapPin, Users, Calendar, CheckCircle, XCircle } from "lucide-react";
import { AprobacionCasaClient } from "./aprobacion-client";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function DetalleCasaAnfitrionaPage({ params }: PageProps) {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: casa } = await supabase
        .from("casas_anfitrionas")
        .select(`
      *,
      usuarios!casas_anfitrionas_usuario_id_fkey ( id, nombre, apellido, email, telefono, foto_perfil_url ),
      direcciones!casas_anfitrionas_direccion_id_fkey (
        calle, barrio, codigo_postal, referencia, latitud, longitud,
        parroquias!direcciones_parroquia_id_fkey (
          nombre,
          municipios!parroquias_municipio_id_fkey (
            nombre,
            estados!municipios_estado_id_fkey ( nombre )
          )
        )
      )
    `)
        .eq("id", id)
        .single();

    if (!casa) notFound();

    // Verificar permisos de gestión
    const { data: puedeGestionar } = await supabase.rpc("puede_gestionar_casas", {
        p_auth_id: user.id,
    });

    // Contar grupos usando esta casa
    const { count: gruposUsando } = await supabase
        .from("grupos")
        .select("*", { count: "exact", head: true })
        .eq("casa_anfitriona_id", id)
        .eq("activo", true)
        .eq("eliminado", false);

    const usuario = extraerRelacion<{
        id: string; nombre: string; apellido: string;
        email: string | null; telefono: string | null;
    }>(casa.usuarios);

    const direccion = extraerRelacion<{
        calle: string; barrio: string | null; codigo_postal: string | null;
        referencia: string | null; latitud: number | null; longitud: number | null;
        parroquias: {
            nombre: string;
            municipios: { nombre: string; estados: { nombre: string } };
        } | null;
    }>(casa.direcciones);

    const disponibilidadSchema = z.array(z.object({
        dia: z.string(),
        disponible: z.boolean(),
    })).catch([]);
    const disponibilidad = disponibilidadSchema.parse(casa.disponibilidad);
    const diasDisponibles = disponibilidad.filter((d) => d.disponible).map((d) => d.dia);

    return (
        <ContenedorDashboard
            titulo={casa.nombre_lugar}
            botonRegreso={{ href: "/grupos-vida/casas-anfitrionas", texto: "Casas Anfitrionas" }}
        >
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Info principal */}
                <div className="space-y-4 lg:col-span-2">
                    <TarjetaSistema>
                        <div className="space-y-4">
                            {/* Estado */}
                            <div className="flex items-center gap-3">
                                <BadgeSistema
                                    variante={casa.aprobada && casa.activa ? "success" : casa.aprobada ? "warning" : "error"}
                                    tamaño="md"
                                >
                                    {casa.aprobada && casa.activa ? (
                                        <><CheckCircle className="mr-1 h-3.5 w-3.5" /> Aprobada y activa</>
                                    ) : casa.aprobada ? (
                                        "Inactiva"
                                    ) : (
                                        <><XCircle className="mr-1 h-3.5 w-3.5" /> Pendiente de aprobación</>
                                    )}
                                </BadgeSistema>
                                {gruposUsando !== null && gruposUsando > 0 && (
                                    <BadgeSistema variante="info" tamaño="sm">
                                        {gruposUsando} grupo{gruposUsando !== 1 && "s"}
                                    </BadgeSistema>
                                )}
                            </div>

                            {/* Descripción */}
                            {casa.descripcion && (
                                <TextoSistema>{casa.descripcion}</TextoSistema>
                            )}

                            <SeparadorSistema />

                            {/* Dirección */}
                            <div className="space-y-2">
                                <TituloSistema nivel={4} className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4" /> Dirección
                                </TituloSistema>
                                <TextoSistema>
                                    {direccion?.calle}
                                    {direccion?.barrio && `, ${direccion.barrio}`}
                                </TextoSistema>
                                {direccion?.referencia && (
                                    <TextoSistema variante="muted" tamaño="sm">
                                        Ref: {direccion.referencia}
                                    </TextoSistema>
                                )}
                                {direccion?.parroquias && (
                                    <TextoSistema variante="muted" tamaño="sm">
                                        {direccion.parroquias.nombre}, {direccion.parroquias.municipios.nombre},{" "}
                                        {direccion.parroquias.municipios.estados.nombre}
                                    </TextoSistema>
                                )}
                            </div>

                            <SeparadorSistema />

                            {/* Capacidad y disponibilidad */}
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <TituloSistema nivel={4} className="flex items-center gap-2">
                                        <Users className="h-4 w-4" /> Capacidad
                                    </TituloSistema>
                                    <TextoSistema className="mt-1">
                                        {casa.capacidad_maxima ? `${casa.capacidad_maxima} personas` : "No especificada"}
                                    </TextoSistema>
                                </div>
                                <div>
                                    <TituloSistema nivel={4} className="flex items-center gap-2">
                                        <Calendar className="h-4 w-4" /> Disponibilidad
                                    </TituloSistema>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {diasDisponibles.length > 0 ? (
                                            diasDisponibles.map((dia) => (
                                                <BadgeSistema key={dia} variante="default" tamaño="sm">
                                                    {dia}
                                                </BadgeSistema>
                                            ))
                                        ) : (
                                            <TextoSistema variante="muted" tamaño="sm">No especificada</TextoSistema>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Notas públicas */}
                            {casa.notas_publicas && (
                                <>
                                    <SeparadorSistema />
                                    <div>
                                        <TituloSistema nivel={4}>Notas</TituloSistema>
                                        <TextoSistema variante="muted" className="mt-1">
                                            {casa.notas_publicas}
                                        </TextoSistema>
                                    </div>
                                </>
                            )}
                        </div>
                    </TarjetaSistema>
                </div>

                {/* Sidebar: anfitrión + acciones */}
                <div className="space-y-4">
                    {/* Anfitrión */}
                    <TarjetaSistema>
                        <TituloSistema nivel={4} className="flex items-center gap-2 mb-3">
                            <Home className="h-4 w-4" /> Anfitrión
                        </TituloSistema>
                        {usuario && (
                            <div className="space-y-1">
                                <TextoSistema className="font-medium">
                                    {usuario.nombre} {usuario.apellido}
                                </TextoSistema>
                                {usuario.email && (
                                    <TextoSistema variante="muted" tamaño="sm">{usuario.email}</TextoSistema>
                                )}
                                {usuario.telefono && (
                                    <TextoSistema variante="muted" tamaño="sm">{usuario.telefono}</TextoSistema>
                                )}
                            </div>
                        )}
                    </TarjetaSistema>

                    {/* Acciones de aprobación */}
                    {puedeGestionar && !casa.aprobada && (
                        <AprobacionCasaClient casaId={casa.id} />
                    )}
                </div>
            </div>
        </ContenedorDashboard>
    );
}
