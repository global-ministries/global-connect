import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extraerRelacion } from "@/lib/supabase/helpers";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ContenedorDashboard, TarjetaSistema, TextoSistema, BotonSistema, BadgeSistema } from "@/components/ui/sistema-diseno";
import { Plus, Home } from "lucide-react";
import Link from "next/link";

/**
 * Página de listado de casas anfitrionas.
 * Muestra estadísticas y lista de casas con conteo real de grupos usando cada una.
 * Incluye foto del anfitrión y cónyuge si comparten dirección.
 */
export default async function CasasAnfitrionasPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // Usar admin client para que el join a usuarios funcione sin importar el rol del usuario
    const adminDb = createSupabaseAdminClient();

    // Obtener casas con datos del anfitrión, dirección y foto
    const { data: casas } = await adminDb
        .from("casas_anfitrionas")
        .select(`
      id, nombre_lugar, capacidad_maxima, activa, aprobada,
      fotos_urls, creado_en, usuario_id,
      usuarios!casas_anfitrionas_usuario_id_fkey ( id, nombre, apellido, foto_perfil_url, direccion_id ),
      direcciones!casas_anfitrionas_direccion_id_fkey ( calle, barrio )
    `)
        .order("creado_en", { ascending: false });

    // Contar cuántos grupos usan cada casa anfitriona (G-07)
    const { data: conteoGrupos } = await adminDb
        .from("grupos")
        .select("casa_anfitriona_id")
        .not("casa_anfitriona_id", "is", null);

    // Crear mapa de conteo: casa_id → cantidad de grupos
    const gruposPorCasa = new Map<string, number>();
    if (conteoGrupos) {
        for (const g of conteoGrupos) {
            if (g.casa_anfitriona_id) {
                gruposPorCasa.set(
                    g.casa_anfitriona_id,
                    (gruposPorCasa.get(g.casa_anfitriona_id) ?? 0) + 1
                );
            }
        }
    }

    // Buscar cónyuges de los anfitriones para mostrar en las cards
    const anfitrionIds = (casas ?? []).map((c) => {
        const u = extraerRelacion<{ id: string }>(c.usuarios);
        return u?.id;
    }).filter(Boolean) as string[];

    // Obtener relaciones de cónyuge
    const { data: relConyuge } = anfitrionIds.length > 0
        ? await adminDb
            .from("relaciones_usuarios")
            .select("usuario1_id, usuario2_id")
            .eq("tipo_relacion", "conyuge")
            .or(`usuario1_id.in.(${anfitrionIds.join(",")}),usuario2_id.in.(${anfitrionIds.join(",")})`)
        : { data: null };

    // Crear mapa anfitrión → cónyuge ID
    const conyugeMap = new Map<string, string>();
    if (relConyuge) {
        for (const rel of relConyuge) {
            if (anfitrionIds.includes(rel.usuario1_id)) {
                conyugeMap.set(rel.usuario1_id, rel.usuario2_id);
            }
            if (anfitrionIds.includes(rel.usuario2_id)) {
                conyugeMap.set(rel.usuario2_id, rel.usuario1_id);
            }
        }
    }

    // Obtener datos del cónyuge (nombre, foto)
    const conyugeIds = [...new Set(conyugeMap.values())];
    const { data: conyugesData } = conyugeIds.length > 0
        ? await adminDb
            .from("usuarios")
            .select("id, nombre, apellido, foto_perfil_url")
            .in("id", conyugeIds)
        : { data: null };

    const conyugeInfoMap = new Map<string, { nombre: string; foto: string | null }>();
    if (conyugesData) {
        for (const c of conyugesData) {
            conyugeInfoMap.set(c.id, {
                nombre: `${c.nombre} ${c.apellido}`.trim(),
                foto: c.foto_perfil_url,
            });
        }
    }

    // Verificar si el usuario puede gestionar casas
    const { data: puedeGestionar } = await supabase.rpc("puede_gestionar_casas", {
        p_auth_id: user.id,
    });

    const totalCasas = casas?.length ?? 0;
    const aprobadas = casas?.filter((c) => c.aprobada && c.activa).length ?? 0;
    const pendientes = casas?.filter((c) => !c.aprobada).length ?? 0;
    const inactivas = casas?.filter((c) => c.aprobada && !c.activa).length ?? 0;

    return (
        <DashboardLayout>
            <ContenedorDashboard
                titulo="Casas Anfitrionas"
                botonRegreso={{ href: "/grupos-vida", texto: "Grupos de Vida" }}
                accionPrincipal={
                    <Link href="/grupos-vida/casas-anfitrionas/nueva">
                        <BotonSistema variante="primario" icono={Plus} tamaño="sm">
                            Registrar casa
                        </BotonSistema>
                    </Link>
                }
            >
                {/* Stats rápidos — sin colores hardcoded (G-08) */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <TarjetaSistema>
                        <div className="text-center">
                            <TextoSistema variante="muted" tamaño="sm">Total</TextoSistema>
                            <TextoSistema className="text-2xl font-bold">{totalCasas}</TextoSistema>
                        </div>
                    </TarjetaSistema>
                    <TarjetaSistema>
                        <div className="text-center">
                            <TextoSistema variante="muted" tamaño="sm">Aprobadas</TextoSistema>
                            <div className="flex items-center justify-center gap-1.5 mt-0.5">
                                <TextoSistema className="text-2xl font-bold">{aprobadas}</TextoSistema>
                                <BadgeSistema variante="success" tamaño="sm">activas</BadgeSistema>
                            </div>
                        </div>
                    </TarjetaSistema>
                    <TarjetaSistema>
                        <div className="text-center">
                            <TextoSistema variante="muted" tamaño="sm">Pendientes</TextoSistema>
                            <div className="flex items-center justify-center gap-1.5 mt-0.5">
                                <TextoSistema className="text-2xl font-bold">{pendientes}</TextoSistema>
                                <BadgeSistema variante="warning" tamaño="sm">por aprobar</BadgeSistema>
                            </div>
                        </div>
                    </TarjetaSistema>
                    <TarjetaSistema>
                        <div className="text-center">
                            <TextoSistema variante="muted" tamaño="sm">Inactivas</TextoSistema>
                            <TextoSistema className="text-2xl font-bold text-muted-foreground">{inactivas}</TextoSistema>
                        </div>
                    </TarjetaSistema>
                </div>

                {/* Lista responsiva — Desktop: tabla, Móvil: tarjetas */}
                {casas && casas.length > 0 ? (
                    <>
                        {/* Desktop: tabla */}
                        <TarjetaSistema className="hidden md:block">
                            <div className="overflow-hidden">
                                <table className="w-full divide-y divide-border">
                                    <thead>
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Casa</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Anfitrión</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Dirección</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Capacidad</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {casas.map((casa) => {
                                            const usuario = extraerRelacion<{ id: string; nombre: string; apellido: string; foto_perfil_url: string | null }>(casa.usuarios);
                                            const direccion = extraerRelacion<{ calle: string; barrio: string | null }>(casa.direcciones);
                                            const conyugeId = usuario ? conyugeMap.get(usuario.id) : undefined;
                                            const conyugeInfo = conyugeId ? conyugeInfoMap.get(conyugeId) : undefined;
                                            const fotos: string[] = [];
                                            if (usuario?.foto_perfil_url) fotos.push(usuario.foto_perfil_url);
                                            if (conyugeInfo?.foto) fotos.push(conyugeInfo.foto);

                                            return (
                                                <tr key={casa.id} className="hover:bg-accent/50 transition-colors">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex -space-x-2 flex-shrink-0">
                                                                {fotos.length > 0 ? fotos.map((url, i) => (
                                                                    <img key={i} src={url} alt="" className="w-9 h-9 rounded-full border-2 border-card object-cover" />
                                                                )) : (
                                                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center">
                                                                        <Home className="w-4 h-4 text-white" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <Link href={`/grupos-vida/casas-anfitrionas/${casa.id}`} className="hover:text-orange-600 transition-colors">
                                                                    <span className="font-medium text-foreground hover:underline cursor-pointer">{casa.nombre_lugar}</span>
                                                                </Link>
                                                                {(gruposPorCasa.get(casa.id) ?? 0) > 0 && (
                                                                    <div className="text-xs text-muted-foreground">
                                                                        {gruposPorCasa.get(casa.id)} {gruposPorCasa.get(casa.id) === 1 ? "grupo" : "grupos"}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                                                        <div className="flex flex-col">
                                                            <span>{usuario ? `${usuario.nombre} ${usuario.apellido}` : "Sin anfitrión"}</span>
                                                            {conyugeInfo && (
                                                                <span className="text-xs text-muted-foreground/70">y {conyugeInfo.nombre}</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground hidden lg:table-cell">
                                                        <div className="flex flex-col">
                                                            <span>{direccion?.calle ?? "Sin dirección"}</span>
                                                            {direccion?.barrio && (
                                                                <span className="text-xs text-muted-foreground/70">{direccion.barrio}</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground hidden lg:table-cell">
                                                        {casa.capacidad_maxima ? `${casa.capacidad_maxima} personas` : "—"}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        {!casa.aprobada ? (
                                                            <BadgeSistema variante="warning" tamaño="sm">Pendiente</BadgeSistema>
                                                        ) : casa.activa ? (
                                                            <BadgeSistema variante="success" tamaño="sm">Activa</BadgeSistema>
                                                        ) : (
                                                            <BadgeSistema variante="default" tamaño="sm">Inactiva</BadgeSistema>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </TarjetaSistema>

                        {/* Móvil: tarjetas */}
                        <div className="md:hidden space-y-3">
                            {casas.map((casa) => {
                                const usuario = extraerRelacion<{ id: string; nombre: string; apellido: string; foto_perfil_url: string | null }>(casa.usuarios);
                                const direccion = extraerRelacion<{ calle: string; barrio: string | null }>(casa.direcciones);
                                const conyugeId = usuario ? conyugeMap.get(usuario.id) : undefined;
                                const conyugeInfo = conyugeId ? conyugeInfoMap.get(conyugeId) : undefined;
                                const fotos: string[] = [];
                                if (usuario?.foto_perfil_url) fotos.push(usuario.foto_perfil_url);
                                if (conyugeInfo?.foto) fotos.push(conyugeInfo.foto);

                                return (
                                    <Link key={casa.id} href={`/grupos-vida/casas-anfitrionas/${casa.id}`}>
                                        <TarjetaSistema className="p-4">
                                            <div className="flex items-start gap-3">
                                                <div className="flex -space-x-2 flex-shrink-0 mt-0.5">
                                                    {fotos.length > 0 ? fotos.map((url, i) => (
                                                        <img key={i} src={url} alt="" className="w-9 h-9 rounded-full border-2 border-card object-cover" />
                                                    )) : (
                                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center">
                                                            <Home className="w-4 h-4 text-white" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between mb-1">
                                                        <h3 className="font-medium text-foreground truncate">{casa.nombre_lugar}</h3>
                                                        {!casa.aprobada ? (
                                                            <BadgeSistema variante="warning" tamaño="sm" className="ml-2 flex-shrink-0">Pendiente</BadgeSistema>
                                                        ) : casa.activa ? (
                                                            <BadgeSistema variante="success" tamaño="sm" className="ml-2 flex-shrink-0">Activa</BadgeSistema>
                                                        ) : (
                                                            <BadgeSistema variante="default" tamaño="sm" className="ml-2 flex-shrink-0">Inactiva</BadgeSistema>
                                                        )}
                                                    </div>
                                                    <div className="space-y-0.5 text-sm text-muted-foreground">
                                                        <div>
                                                            <span className="font-medium">Anfitrión:</span>{" "}
                                                            {usuario ? `${usuario.nombre} ${usuario.apellido}` : "Sin anfitrión"}
                                                            {conyugeInfo && <span className="text-muted-foreground/70"> y {conyugeInfo.nombre}</span>}
                                                        </div>
                                                        {direccion?.calle && (
                                                            <div className="text-xs text-muted-foreground/70">
                                                                📍 {direccion.calle}{direccion.barrio ? `, ${direccion.barrio}` : ''}
                                                            </div>
                                                        )}
                                                        {casa.capacidad_maxima && (
                                                            <div className="text-xs">Cap: {casa.capacidad_maxima}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </TarjetaSistema>
                                    </Link>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <TarjetaSistema variante="outlined" className="py-12 text-center">
                        <Home className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                        <TextoSistema variante="muted">
                            {puedeGestionar
                                ? "No hay casas anfitrionas registradas aún."
                                : "No hay casas anfitrionas disponibles."}
                        </TextoSistema>
                    </TarjetaSistema>
                )}
            </ContenedorDashboard>
        </DashboardLayout>
    );
}
