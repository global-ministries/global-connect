import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extraerRelacion } from "@/lib/supabase/helpers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
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
import {
    Home, MapPin, Users, Calendar, CheckCircle,
    Pencil, Phone, Mail, FileText, Clock, Info
} from "lucide-react";
import { AprobacionCasaClient } from "./aprobacion-client";
import { obtenerPermisosCasaAnfitrionaUI, puedeVerCasaAnfitrionaUI } from "@/lib/casas-anfitrionas/ui-permissions";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function DetalleCasaAnfitrionaPage({ params }: PageProps) {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const puedeVer = await puedeVerCasaAnfitrionaUI(supabase, user.id, id);
    if (!puedeVer) notFound();

    // Usar admin solo después de validar visibilidad por RPC.
    const adminDb = createSupabaseAdminClient();
    const { data: casa } = await adminDb
        .from("casas_anfitrionas")
        .select(`
      *,
      usuarios!casas_anfitrionas_usuario_id_fkey ( id, nombre, apellido, email, telefono, foto_perfil_url ),
      co_anfitrion:usuarios!casas_anfitrionas_co_anfitrion_id_fkey ( id, nombre, apellido, foto_perfil_url ),
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

    const permisosCasa = await obtenerPermisosCasaAnfitrionaUI(supabase, user.id, id);

    // Contar grupos usando esta casa
    const { count: gruposUsando } = await adminDb
        .from("grupos")
        .select("*", { count: "exact", head: true })
        .eq("casa_anfitriona_id", id)
        .eq("activo", true)
        .eq("eliminado", false);

    const usuario = extraerRelacion<{
        id: string; nombre: string; apellido: string;
        email: string | null; telefono: string | null;
        foto_perfil_url: string | null;
    }>(casa.usuarios);

    const direccion = extraerRelacion<{
        calle: string; barrio: string | null; codigo_postal: string | null;
        referencia: string | null; latitud: number | null; longitud: number | null;
        parroquias: {
            nombre: string;
            municipios: { nombre: string; estados: { nombre: string } };
        } | null;
    }>(casa.direcciones);

    const coAnfitrion = extraerRelacion<{
        id: string; nombre: string; apellido: string;
        foto_perfil_url: string | null;
    }>(casa.co_anfitrion);

    const disponibilidadSchema = z.array(z.object({
        dia: z.string(),
        disponible: z.boolean(),
    })).catch([]);
    const disponibilidad = disponibilidadSchema.parse(casa.disponibilidad);
    const diasDisponibles = disponibilidad.filter((d) => d.disponible).map((d) => d.dia);

    // Formato de fecha
    const fechaCreacion = casa.creado_en
        ? new Date(casa.creado_en).toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" })
        : null;

    return (
<ContenedorDashboard
                titulo={casa.nombre_lugar}
                botonRegreso={{ href: "/grupos-vida/casas-anfitrionas", texto: "Casas Anfitrionas" }}
                accionPrincipal={permisosCasa.puedeEditar ? (
                    <Link href={`/grupos-vida/casas-anfitrionas/${id}/editar`}>
                        <BotonSistema variante="outline" icono={Pencil} tamaño="sm">
                            Editar
                        </BotonSistema>
                    </Link>
                ) : undefined}
            >
                <div className="grid gap-6 lg:grid-cols-3">
                    {/* ─── Contenido principal ─── */}
                    <div className="space-y-6 lg:col-span-2">
                        {/* Badges de estado */}
                        <div className="flex flex-wrap items-center gap-2">
                            {casa.aprobada && casa.activa ? (
                                <BadgeSistema variante="success" tamaño="md">
                                    <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                                    Aprobada y activa
                                </BadgeSistema>
                            ) : casa.aprobada ? (
                                <BadgeSistema variante="default" tamaño="md">Inactiva</BadgeSistema>
                            ) : (
                                <BadgeSistema variante="warning" tamaño="md">
                                    <Clock className="mr-1.5 h-3.5 w-3.5" />
                                    Pendiente de aprobación
                                </BadgeSistema>
                            )}
                            {gruposUsando !== null && gruposUsando > 0 && (
                                <BadgeSistema variante="info" tamaño="sm">
                                    <Users className="mr-1 h-3 w-3" />
                                    {gruposUsando} grupo{gruposUsando !== 1 && "s"} asignado{gruposUsando !== 1 && "s"}
                                </BadgeSistema>
                            )}
                        </div>

                        {/* Descripción */}
                        {casa.descripcion && (
                            <TarjetaSistema>
                                <TextoSistema>{casa.descripcion}</TextoSistema>
                            </TarjetaSistema>
                        )}

                        {/* Tarjeta de Dirección */}
                        <TarjetaSistema>
                            <div className="space-y-3">
                                <TituloSistema nivel={4} className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-orange-500" />
                                    Dirección
                                </TituloSistema>
                                <div className="pl-6 space-y-1">
                                    <TextoSistema className="font-medium">
                                        {direccion?.calle ?? "Sin dirección"}
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
                            </div>
                        </TarjetaSistema>

                        {/* Capacidad y disponibilidad */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <TarjetaSistema>
                                <div className="space-y-2">
                                    <TituloSistema nivel={4} className="flex items-center gap-2">
                                        <Users className="h-4 w-4 text-orange-500" />
                                        Capacidad
                                    </TituloSistema>
                                    <div className="pl-6">
                                        <TextoSistema className="text-2xl font-bold">
                                            {casa.capacidad_maxima ?? "—"}
                                        </TextoSistema>
                                        <TextoSistema variante="muted" tamaño="sm">
                                            {casa.capacidad_maxima ? "personas máximo" : "No especificada"}
                                        </TextoSistema>
                                    </div>
                                </div>
                            </TarjetaSistema>

                            <TarjetaSistema>
                                <div className="space-y-2">
                                    <TituloSistema nivel={4} className="flex items-center gap-2">
                                        <Calendar className="h-4 w-4 text-orange-500" />
                                        Disponibilidad
                                    </TituloSistema>
                                    <div className="pl-6 flex flex-wrap gap-1.5">
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
                            </TarjetaSistema>
                        </div>

                        {/* Notas públicas */}
                        {casa.notas_publicas && (
                            <TarjetaSistema>
                                <div className="space-y-2">
                                    <TituloSistema nivel={4} className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-orange-500" />
                                        Notas
                                    </TituloSistema>
                                    <TextoSistema variante="muted" className="pl-6">
                                        {casa.notas_publicas}
                                    </TextoSistema>
                                </div>
                            </TarjetaSistema>
                        )}
                    </div>

                    {/* ─── Sidebar derecho ─── */}
                    <div className="space-y-4">
                        {/* Anfitrión */}
                        <TarjetaSistema>
                            <div className="space-y-4">
                                <TituloSistema nivel={4} className="flex items-center gap-2">
                                    <Home className="h-4 w-4 text-orange-500" />
                                    {coAnfitrion ? "Anfitriones" : "Anfitrión"}
                                </TituloSistema>
                                {usuario ? (
                                    <div className="space-y-3">
                                        <div className="flex items-start gap-3">
                                            {usuario.foto_perfil_url ? (
                                                <img
                                                    src={usuario.foto_perfil_url}
                                                    alt={`${usuario.nombre} ${usuario.apellido}`}
                                                    className="w-12 h-12 rounded-full object-cover border-2 border-border flex-shrink-0"
                                                />
                                            ) : (
                                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                                                    <span className="text-white font-bold text-lg">
                                                        {usuario.nombre.charAt(0)}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="space-y-1 min-w-0">
                                                <TextoSistema className="font-semibold">
                                                    {usuario.nombre} {usuario.apellido}
                                                </TextoSistema>
                                                {usuario.email && (
                                                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                        <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                                                        <span className="truncate">{usuario.email}</span>
                                                    </div>
                                                )}
                                                {usuario.telefono && (
                                                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                        <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                                                        <span>{usuario.telefono}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {coAnfitrion && (
                                            <>
                                                <SeparadorSistema />
                                                <div className="flex items-start gap-3">
                                                    {coAnfitrion.foto_perfil_url ? (
                                                        <img
                                                            src={coAnfitrion.foto_perfil_url}
                                                            alt={`${coAnfitrion.nombre} ${coAnfitrion.apellido}`}
                                                            className="w-10 h-10 rounded-full object-cover border-2 border-border flex-shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center flex-shrink-0">
                                                            <span className="text-white font-bold">
                                                                {coAnfitrion.nombre.charAt(0)}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="space-y-0.5 min-w-0">
                                                        <TextoSistema className="font-medium">
                                                            {coAnfitrion.nombre} {coAnfitrion.apellido}
                                                        </TextoSistema>
                                                        <BadgeSistema variante="info" tamaño="sm">Co-anfitrión</BadgeSistema>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <TextoSistema variante="muted">Sin anfitrión asignado</TextoSistema>
                                )}
                            </div>
                        </TarjetaSistema>

                        {/* Info de la casa */}
                        <TarjetaSistema>
                            <div className="space-y-3">
                                <TituloSistema nivel={4} className="flex items-center gap-2">
                                    <Info className="h-4 w-4 text-orange-500" />
                                    Información
                                </TituloSistema>
                                <div className="space-y-2 text-sm">
                                    {fechaCreacion && (
                                        <div className="flex justify-between">
                                            <TextoSistema variante="muted" tamaño="sm">Registrada</TextoSistema>
                                            <TextoSistema tamaño="sm">{fechaCreacion}</TextoSistema>
                                        </div>
                                    )}
                                    <div className="flex justify-between">
                                        <TextoSistema variante="muted" tamaño="sm">Grupos</TextoSistema>
                                        <TextoSistema tamaño="sm">{gruposUsando ?? 0}</TextoSistema>
                                    </div>
                                    <div className="flex justify-between">
                                        <TextoSistema variante="muted" tamaño="sm">Aprobada</TextoSistema>
                                        <TextoSistema tamaño="sm">{casa.aprobada ? "Sí" : "No"}</TextoSistema>
                                    </div>
                                    <div className="flex justify-between">
                                        <TextoSistema variante="muted" tamaño="sm">Activa</TextoSistema>
                                        <TextoSistema tamaño="sm">{casa.activa ? "Sí" : "No"}</TextoSistema>
                                    </div>
                                </div>
                            </div>
                        </TarjetaSistema>

                        {/* Aprobación — definida por el predicado backend granular. */}
                        {permisosCasa.puedeAprobar && !casa.aprobada && (
                            <AprobacionCasaClient casaId={casa.id} />
                        )}
                    </div>
                </div>
            </ContenedorDashboard>
);
}
