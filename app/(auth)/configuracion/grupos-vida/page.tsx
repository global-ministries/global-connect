import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ContenedorDashboard, TarjetaSistema, TextoSistema, TituloSistema, SeparadorSistema } from "@/components/ui/sistema-diseno";
import { MapPin, Home, Settings } from "lucide-react";
import { GeocodificacionPanel } from "./geocodificacion-panel";

export default async function ConfiguracionGruposPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // Verificar si es admin
    const { data: esAdmin } = await supabase.rpc("es_superadmin", {
        p_auth_uid: user.id,
    });

    if (!esAdmin) redirect("/grupos-vida");

    // Stats de geocodificación
    const { count: totalDirecciones } = await supabase
        .from("direcciones")
        .select("*", { count: "exact", head: true });

    const { count: sinCoordenadas } = await supabase
        .from("direcciones")
        .select("*", { count: "exact", head: true })
        .or("latitud.is.null,longitud.is.null");

    const totalNum = totalDirecciones ?? 0;
    const sinNum = sinCoordenadas ?? 0;
    const conNum = totalNum - sinNum;
    const porcentaje = totalNum > 0 ? Math.round((conNum / totalNum) * 100) : 0;

    return (
        <ContenedorDashboard
            titulo="Configuración de Grupos de Vida"
            botonRegreso={{ href: "/configuracion", texto: "Configuración" }}
        >
            <div className="space-y-6">
                {/* Geocodificación */}
                <TarjetaSistema>
                    <div className="space-y-4">
                        <TituloSistema nivel={3} className="flex items-center gap-2">
                            <MapPin className="h-5 w-5" /> Geocodificación de Direcciones
                        </TituloSistema>
                        <TextoSistema variante="muted">
                            Convierte direcciones sin coordenadas a latitud/longitud usando OpenStreetMap.
                            Esto permite mostrar los grupos en el mapa interactivo.
                        </TextoSistema>

                        <SeparadorSistema />

                        {/* Estadísticas */}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="text-center">
                                <TextoSistema variante="muted" tamaño="sm">Total</TextoSistema>
                                <TextoSistema className="text-xl font-bold">{totalNum}</TextoSistema>
                            </div>
                            <div className="text-center">
                                <TextoSistema variante="muted" tamaño="sm">Con coordenadas</TextoSistema>
                                <TextoSistema className="text-xl font-bold text-green-600">{conNum}</TextoSistema>
                            </div>
                            <div className="text-center">
                                <TextoSistema variante="muted" tamaño="sm">Sin coordenadas</TextoSistema>
                                <TextoSistema className="text-xl font-bold text-amber-600">{sinNum}</TextoSistema>
                            </div>
                            <div className="text-center">
                                <TextoSistema variante="muted" tamaño="sm">Cobertura</TextoSistema>
                                <TextoSistema className="text-xl font-bold">{porcentaje}%</TextoSistema>
                            </div>
                        </div>

                        <SeparadorSistema />

                        {/* Panel de acción */}
                        <GeocodificacionPanel sinCoordenadas={sinNum} />
                    </div>
                </TarjetaSistema>

                {/* Tipos de grupo */}
                <TarjetaSistema>
                    <div className="space-y-3">
                        <TituloSistema nivel={3} className="flex items-center gap-2">
                            <Settings className="h-5 w-5" /> Tipos de Grupo
                        </TituloSistema>
                        <TextoSistema variante="muted">
                            Administra los tipos de grupo disponibles en el sistema.
                            Actualmente solo &quot;Grupos de Vida&quot; está disponible. Se habilitarán más tipos en fases futuras.
                        </TextoSistema>
                    </div>
                </TarjetaSistema>

                {/* Casas Anfitrionas config */}
                <TarjetaSistema>
                    <div className="space-y-3">
                        <TituloSistema nivel={3} className="flex items-center gap-2">
                            <Home className="h-5 w-5" /> Casas Anfitrionas
                        </TituloSistema>
                        <TextoSistema variante="muted">
                            Configuración de casas anfitrionas y flujo de aprobación.
                            Próximamente: criterios de auto-aprobación, notificaciones, y verificación por zona.
                        </TextoSistema>
                    </div>
                </TarjetaSistema>
            </div>
        </ContenedorDashboard>
    );
}
