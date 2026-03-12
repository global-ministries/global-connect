import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extraerRelacion } from "@/lib/supabase/helpers";
import { redirect } from "next/navigation";
import { ContenedorDashboard, TarjetaSistema, TextoSistema, BotonSistema } from "@/components/ui/sistema-diseno";
import { CardCasaAnfitriona } from "@/components/grupos-vida/card-casa-anfitriona";
import { Plus, Home } from "lucide-react";
import Link from "next/link";

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

    // Verificar si el usuario puede gestionar casas
    const { data: puedeGestionar } = await supabase.rpc("puede_gestionar_casas", {
        p_auth_id: user.id,
    });

    return (
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
            {/* Stats rápidos */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <TarjetaSistema>
                    <div className="text-center">
                        <TextoSistema variante="muted" tamaño="sm">Total</TextoSistema>
                        <TextoSistema className="text-2xl font-bold">{casas?.length ?? 0}</TextoSistema>
                    </div>
                </TarjetaSistema>
                <TarjetaSistema>
                    <div className="text-center">
                        <TextoSistema variante="muted" tamaño="sm">Aprobadas</TextoSistema>
                        <TextoSistema className="text-2xl font-bold text-green-700 dark:text-green-400">
                            {casas?.filter((c) => c.aprobada && c.activa).length ?? 0}
                        </TextoSistema>
                    </div>
                </TarjetaSistema>
                <TarjetaSistema>
                    <div className="text-center">
                        <TextoSistema variante="muted" tamaño="sm">Pendientes</TextoSistema>
                        <TextoSistema className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                            {casas?.filter((c) => !c.aprobada).length ?? 0}
                        </TextoSistema>
                    </div>
                </TarjetaSistema>
                <TarjetaSistema>
                    <div className="text-center">
                        <TextoSistema variante="muted" tamaño="sm">Inactivas</TextoSistema>
                        <TextoSistema className="text-2xl font-bold text-muted-foreground">
                            {casas?.filter((c) => c.aprobada && !c.activa).length ?? 0}
                        </TextoSistema>
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
                                    gruposUsando={0}
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
    );
}
