import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extraerRelacion } from "@/lib/supabase/helpers";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ContenedorDashboard, TarjetaSistema, TextoSistema, BotonSistema, BadgeSistema } from "@/components/ui/sistema-diseno";
import { CardCasaAnfitriona } from "@/components/grupos-vida/card-casa-anfitriona";
import { Plus, Home } from "lucide-react";
import Link from "next/link";

/**
 * Página de listado de casas anfitrionas.
 * Muestra estadísticas y lista de casas con conteo real de grupos usando cada una.
 */
export default async function CasasAnfitrionasPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    // Obtener casas con datos del anfitrión y dirección
    const { data: casas } = await supabase
        .from("casas_anfitrionas")
        .select(`
      id, nombre_lugar, capacidad_maxima, activa, aprobada,
      fotos_urls, creado_en,
      usuarios!casas_anfitrionas_usuario_id_fkey ( id, nombre, apellido ),
      direcciones!casas_anfitrionas_direccion_id_fkey ( calle, barrio )
    `)
        .order("creado_en", { ascending: false });

    // Contar cuántos grupos usan cada casa anfitriona (G-07)
    const { data: conteoGrupos } = await supabase
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

                {/* Lista */}
                {casas && casas.length > 0 ? (
                    <div className="space-y-3">
                        {casas.map((casa) => {
                            const usuario = extraerRelacion<{ id: string; nombre: string; apellido: string }>(casa.usuarios);
                            const direccion = extraerRelacion<{ calle: string; barrio: string | null }>(casa.direcciones);

                            return (
                                <Link key={casa.id} href={`/grupos-vida/casas-anfitrionas/${casa.id}`}>
                                    <CardCasaAnfitriona
                                        id={casa.id}
                                        nombreLugar={casa.nombre_lugar}
                                        capacidadMaxima={casa.capacidad_maxima}
                                        anfitrionNombre={usuario ? `${usuario.nombre} ${usuario.apellido}` : "Sin anfitrión"}
                                        anfitrionParejaNombre={null}
                                        calle={direccion?.calle ?? null}
                                        barrio={direccion?.barrio ?? null}
                                        aprobada={casa.aprobada}
                                        activa={casa.activa}
                                        gruposUsando={gruposPorCasa.get(casa.id) ?? 0}
                                        fotosUrls={casa.fotos_urls}
                                    />
                                </Link>
                            );
                        })}
                    </div>
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
