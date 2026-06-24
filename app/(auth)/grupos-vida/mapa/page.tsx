import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ContenedorDashboard, TarjetaSistema, TextoSistema, BadgeSistema } from "@/components/ui/sistema-diseno";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { MapaGruposVida, type GrupoMapa, type MiembroMapa } from "@/components/grupos-vida/mapa-grupos-vida";
import { emitMemberMapObservableEvent, splitValidMemberLocations } from "@/components/grupos-vida/mapa-location-model";
import { obtenerDatosMapaGruposHostHomes, obtenerMapaMiembros } from "@/lib/actions/casas-anfitrionas.actions";
import { MapPin, Users } from "lucide-react";

type MapScope = "active" | "planned";
type MapSearchParams = Record<string, string | string[] | undefined>;
type HostHomeMapResult = Awaited<ReturnType<typeof obtenerDatosMapaGruposHostHomes>>;
type HostHomeMapRow = NonNullable<HostHomeMapResult["data"]>[number];
type MemberMapResult = Awaited<ReturnType<typeof obtenerMapaMiembros>>;
type MemberMapRow = NonNullable<MemberMapResult["data"]>[number];
const MEMBER_MAP_TIMEOUT_MS = 1500;
const MEMBER_MAP_TIMEOUT_ERROR = "member-map-timeout";

export default async function MapaGruposPage({ searchParams }: { searchParams?: Promise<MapSearchParams> } = {}) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const sp = searchParams ? await searchParams : {};
    const scope = resolveMapScope(Array.isArray(sp.scope) ? sp.scope[0] : sp.scope);
    const mapResult = await obtenerDatosMapaGruposHostHomes({ scope });
    const memberMapResult = mapResult.success ? await loadMemberMap(scope) : { success: true, data: [] } satisfies MemberMapResult;

    const mapLoadFailed = !mapResult.success;
    const grupos: GrupoMapa[] = mapLoadFailed ? [] : (mapResult.data ?? []).map(toGrupoMapa);
    const memberLayerFailed = mapResult.success && !memberMapResult.success;
    const memberLayerRaw = memberLayerFailed ? [] : (memberMapResult.data ?? []).map(toMiembroMapa);
    const { valid: miembros, skippedCount: skippedMemberLocations } = splitValidMemberLocations(memberLayerRaw);
    if (skippedMemberLocations > 0) {
        emitMemberMapObservableEvent("invalid-coordinates", skippedMemberLocations);
    }

    const totalGrupos = grupos.length;
    const totalMiembros = grupos.reduce((sum, g) => sum + g.total_miembros, 0);
    const scopeLabel = scope === "planned" ? "Mostrando grupos planificados" : "Mostrando grupos activos";

    return (
        <DashboardLayout>
            <ContenedorDashboard
                titulo="Mapa de Grupos de Vida"
                botonRegreso={{ href: "/grupos-vida", texto: "Grupos de Vida" }}
            >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                    <TarjetaSistema variante="outlined" className="p-4 sm:p-5">
                        <TextoSistema variante="sutil">
                            Las ubicaciones visibles provienen de Casas Anfitrionas aprobadas. La dirección exacta, cambios pendientes y datos de miembros permanecen reservados para canales autorizados.
                        </TextoSistema>
                    </TarjetaSistema>

                    <nav aria-label="Filtros del mapa de Grupos de Vida" className="flex flex-wrap gap-2">
                        <MapScopeLink href="/grupos-vida/mapa" active={scope === "active"}>Activos</MapScopeLink>
                        <MapScopeLink href="/grupos-vida/mapa?scope=planned" active={scope === "planned"}>Planificados</MapScopeLink>
                    </nav>
                </div>

                <div className="flex items-center gap-2">
                    <BadgeSistema variante={scope === "planned" ? "warning" : "success"} tamaño="sm">
                        {scopeLabel}
                    </BadgeSistema>
                    {mapLoadFailed && (
                        <TextoSistema variante="muted" tamaño="sm">
                            No pudimos cargar el mapa autorizado. Intenta nuevamente.
                        </TextoSistema>
                    )}
                </div>

                {miembros.length > 0 && (
                    <TarjetaSistema variante="outlined" className="p-4 sm:p-5">
                        <TextoSistema variante="sutil">
                            La capa Miembros muestra ubicaciones exactas y privadas. Úsala únicamente para coordinación pastoral y operativa autorizada; no compartas estos datos fuera de los canales correspondientes.
                        </TextoSistema>
                    </TarjetaSistema>
                )}

                {(memberLayerFailed || skippedMemberLocations > 0) && (
                    <TarjetaSistema variante="outlined" className="p-4 sm:p-5" role="alert">
                        <TextoSistema variante="sutil">
                            {memberLayerFailed
                                ? "No pudimos cargar la capa de miembros. El mapa de grupos sigue disponible; actualiza la página y reporta la capa de miembros al equipo de soporte si el problema continúa."
                                : `${skippedMemberLocations} ubicación${skippedMemberLocations === 1 ? "" : "es"} de miembro no se pudo mostrar porque sus coordenadas no son válidas. Actualiza la página y reporta la capa de miembros al equipo de soporte si persiste.`}
                        </TextoSistema>
                    </TarjetaSistema>
                )}

                {/* Stats */}
                <div className="flex flex-wrap gap-4">
                    <TarjetaSistema className="flex items-center gap-3 px-4 py-3">
                        <MapPin className="h-5 w-5 text-muted-foreground" />
                        <div>
                            <TextoSistema variante="muted" tamaño="sm">Grupos en el mapa</TextoSistema>
                            <TextoSistema className="text-lg font-bold">{totalGrupos}</TextoSistema>
                        </div>
                    </TarjetaSistema>
                    <TarjetaSistema className="flex items-center gap-3 px-4 py-3">
                        <Users className="h-5 w-5 text-muted-foreground" />
                        <div>
                            <TextoSistema variante="muted" tamaño="sm">Total miembros</TextoSistema>
                            <TextoSistema className="text-lg font-bold">{totalMiembros}</TextoSistema>
                        </div>
                    </TarjetaSistema>
                </div>

                {/* Mapa */}
                {mapLoadFailed ? (
                    <TarjetaSistema variante="outlined" className="py-16 text-center">
                        <div role="alert">
                            <MapPin className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                            <TextoSistema variante="muted">
                                No pudimos cargar el mapa autorizado.
                            </TextoSistema>
                            <TextoSistema variante="muted" tamaño="sm" className="mt-1">
                                Revisa tu conexión o intenta actualizar la página. Si el problema continúa, reporta la carga del mapa autorizado al equipo de soporte.
                            </TextoSistema>
                        </div>
                    </TarjetaSistema>
                ) : grupos.length > 0 || miembros.length > 0 ? (
                    <MapaGruposVida
                        grupos={grupos}
                        miembros={miembros}
                        altura="calc(100vh - 300px)"
                    />
                ) : (
                    <TarjetaSistema variante="outlined" className="py-16 text-center">
                        <MapPin className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                        <TextoSistema variante="muted">
                            No hay grupos con Casa Anfitriona aprobada para este filtro.
                        </TextoSistema>
                        <TextoSistema variante="muted" tamaño="sm" className="mt-1">
                            Asigna y aprueba una Casa Anfitriona para que el grupo sea visible en el mapa.
                        </TextoSistema>
                    </TarjetaSistema>
                )}
            </ContenedorDashboard>
        </DashboardLayout>
    );
}

function MapScopeLink({ active, children, href }: { active: boolean; children: string; href: string }) {
    return (
        <Link
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
                "inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-medium transition-colors",
                active ? "border-orange-500 bg-orange-500/10 text-orange-700" : "border-border bg-background text-muted-foreground hover:text-foreground",
            ].join(" ")}
        >
            {children}
        </Link>
    );
}

function resolveMapScope(scope: string | undefined): MapScope {
    return scope === "planned" ? "planned" : "active";
}

async function loadMemberMap(scope: MapScope): Promise<MemberMapResult> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<MemberMapResult>((resolve) => {
        timeoutId = setTimeout(() => {
            resolve({ success: false, error: MEMBER_MAP_TIMEOUT_ERROR });
        }, MEMBER_MAP_TIMEOUT_MS);
    });

    try {
        const result = await Promise.race([obtenerMapaMiembros({ scope }), timeout]);
        if (!result.success) {
            emitMemberMapObservableEvent(result.error === MEMBER_MAP_TIMEOUT_ERROR ? "timeout" : "failure", 0);
            return { success: false, error: "No pudimos cargar la capa de miembros" };
        }

        return result;
    } catch {
        emitMemberMapObservableEvent("failure", 0);
        return { success: false, error: "No pudimos cargar la capa de miembros" };
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

function toGrupoMapa(row: HostHomeMapRow): GrupoMapa {
    return {
        id: row.grupo_id,
        nombre: row.grupo_nombre,
        latitud: row.latitud,
        longitud: row.longitud,
        dia_reunion: row.dia_reunion,
        hora_reunion: row.hora_reunion,
        estado_ciclo: row.estado_ciclo ?? "activo",
        segmento: row.segmento ?? "",
        temporada: row.temporada ?? "",
        total_miembros: row.total_miembros,
        capacidad_maxima: row.capacidad_maxima,
        casa_id: row.casa_id,
        barrio: row.barrio,
        notas_publicas: row.notas_publicas,
    };
}

function toMiembroMapa(row: MemberMapRow): MiembroMapa {
    return {
        id: row.usuario_id,
        nombre: row.nombre,
        grupo_id: row.grupo_id,
        grupo_nombre: row.grupo_nombre,
        latitud: row.latitud,
        longitud: row.longitud,
    };
}
