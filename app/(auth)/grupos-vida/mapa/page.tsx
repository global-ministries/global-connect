import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ContenedorDashboard, TarjetaSistema, TextoSistema } from "@/components/ui/sistema-diseno";
import { MapaGruposVida, type GrupoMapa } from "@/components/grupos-vida/mapa-grupos-vida";
import { BadgeEstadoCiclo } from "@/components/grupos-vida/badge-estado-ciclo";
import { MapPin, Users } from "lucide-react";

export default async function MapaGruposPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // Obtener datos del mapa usando la vista
    const { data: datosVista } = await supabase
        .from("v_mapa_grupos_vida")
        .select("*")
        .not("latitud", "is", null)
        .not("longitud", "is", null);

    const grupos: GrupoMapa[] = (datosVista ?? []).map((g) => ({
        id: g.grupo_id ?? "",
        nombre: g.nombre ?? "",
        latitud: g.latitud ?? 0,
        longitud: g.longitud ?? 0,
        direccion: g.direccion ?? "",
        lugar_reunion: g.lugar_reunion ?? "",
        dia_reunion: g.dia_reunion ?? null,
        hora_reunion: g.hora_reunion ?? null,
        estado_ciclo: g.estado_ciclo ?? "activo",
        segmento: g.segmento ?? "",
        temporada: g.temporada ?? "",
        total_miembros: g.total_miembros ?? 0,
        capacidad_maxima: g.capacidad_maxima ?? null,
        lideres: null,
    }));

    const totalGrupos = grupos.length;
    const totalMiembros = grupos.reduce((sum, g) => sum + g.total_miembros, 0);

    return (
        <ContenedorDashboard
            titulo="Mapa de Grupos de Vida"
            botonRegreso={{ href: "/grupos-vida", texto: "Grupos de Vida" }}
        >
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
            {grupos.length > 0 ? (
                <MapaGruposVida
                    grupos={grupos}
                    altura="calc(100vh - 300px)"
                />
            ) : (
                <TarjetaSistema variante="outlined" className="py-16 text-center">
                    <MapPin className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                    <TextoSistema variante="muted">
                        No hay grupos con coordenadas disponibles.
                    </TextoSistema>
                    <TextoSistema variante="muted" tamaño="sm" className="mt-1">
                        Ejecuta la geocodificación masiva desde Configuración → Grupos de Vida.
                    </TextoSistema>
                </TarjetaSistema>
            )}
        </ContenedorDashboard>
    );
}
