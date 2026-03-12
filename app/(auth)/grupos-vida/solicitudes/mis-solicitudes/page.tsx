import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserWithRoles } from "@/lib/getUserWithRoles";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ContenedorDashboard, TextoSistema, TarjetaSistema } from "@/components/ui/sistema-diseno";
import { BadgeSistema } from "@/components/ui/sistema-diseno";
import { Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

const ICONO_ESTADO: Record<string, typeof Clock> = {
    pendiente: Clock,
    aprobado: CheckCircle2,
    rechazado: XCircle,
    expirado: AlertTriangle,
};

const VARIANTE_ESTADO: Record<string, "warning" | "success" | "error" | "default"> = {
    pendiente: "warning",
    aprobado: "success",
    rechazado: "error",
    expirado: "default",
};

const ETIQUETA_TIPO: Record<string, string> = {
    ingreso: "Ingreso",
    traslado: "Traslado",
    egreso: "Egreso",
    cambio_rol: "Cambio de Rol",
    activacion_grupo: "Activación",
};

export default async function MisSolicitudesPage() {
    const supabase = await createSupabaseServerClient();
    const userData = await getUserWithRoles(supabase);
    if (!userData) redirect("/login");

    // Obtener el ID interno del usuario
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: usuarioInterno } = await supabase
        .from("usuarios")
        .select("id")
        .eq("auth_id", user.id)
        .single();

    if (!usuarioInterno) redirect("/grupos-vida");

    // Obtener solicitudes creadas por este usuario
    const { data: solicitudes } = await supabase
        .from("solicitudes_grupo")
        .select(`
      id, tipo, estado, motivo, notas_director, creado_en, actualizado_en,
      grupo:grupos!solicitudes_grupo_grupo_id_fkey(nombre),
      grupo_origen:grupos!solicitudes_grupo_grupo_origen_id_fkey(nombre),
      usuario:usuarios!solicitudes_grupo_usuario_id_fkey(nombre, apellido)
    `)
        .eq("solicitado_por", usuarioInterno.id)
        .order("creado_en", { ascending: false })
        .limit(50);

    return (
        <DashboardLayout>
            <ContenedorDashboard
                titulo="Mis Solicitudes"
                descripcion="Historial de solicitudes que has creado"
                botonRegreso={{ href: "/grupos-vida", texto: "Grupos" }}
            >
                {(!solicitudes || solicitudes.length === 0) ? (
                    <TarjetaSistema className="p-8 text-center">
                        <TextoSistema variante="muted" tamaño="lg">
                            No has creado solicitudes aún
                        </TextoSistema>
                    </TarjetaSistema>
                ) : (
                    <div className="space-y-3">
                        {solicitudes.map((sol) => {
                            const IconoEstado = ICONO_ESTADO[sol.estado] ?? Clock;
                            const grupo = sol.grupo as { nombre: string } | null;
                            const grupoOrigen = sol.grupo_origen as { nombre: string } | null;
                            const usuario = sol.usuario as { nombre: string; apellido: string } | null;

                            return (
                                <TarjetaSistema key={sol.id} className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <BadgeSistema variante="info" tamaño="sm">
                                                    {ETIQUETA_TIPO[sol.tipo] ?? sol.tipo}
                                                </BadgeSistema>
                                                <BadgeSistema
                                                    variante={VARIANTE_ESTADO[sol.estado] ?? "default"}
                                                    tamaño="sm"
                                                >
                                                    <IconoEstado className="h-3 w-3 mr-1" />
                                                    {sol.estado.charAt(0).toUpperCase() + sol.estado.slice(1)}
                                                </BadgeSistema>
                                            </div>

                                            <div className="mt-2 space-y-1">
                                                {usuario && (
                                                    <TextoSistema tamaño="sm">
                                                        <span className="font-medium">{usuario.nombre} {usuario.apellido}</span>
                                                    </TextoSistema>
                                                )}
                                                {grupo && (
                                                    <TextoSistema tamaño="sm" variante="muted">
                                                        Grupo: {grupo.nombre}
                                                        {grupoOrigen && ` ← ${grupoOrigen.nombre}`}
                                                    </TextoSistema>
                                                )}
                                                {sol.motivo && (
                                                    <TextoSistema tamaño="sm" variante="muted" className="italic">
                                                        &quot;{sol.motivo}&quot;
                                                    </TextoSistema>
                                                )}
                                                {sol.notas_director && sol.estado !== "pendiente" && (
                                                    <TextoSistema tamaño="sm" variante="sutil" className="border-l-2 border-border pl-2 mt-1">
                                                        Nota del director: &quot;{sol.notas_director}&quot;
                                                    </TextoSistema>
                                                )}
                                            </div>
                                        </div>

                                        <TextoSistema tamaño="sm" variante="muted" className="shrink-0">
                                            {new Date(sol.creado_en).toLocaleDateString("es-VE", {
                                                day: "numeric",
                                                month: "short",
                                            })}
                                        </TextoSistema>
                                    </div>
                                </TarjetaSistema>
                            );
                        })}
                    </div>
                )}
            </ContenedorDashboard>
        </DashboardLayout>
    );
}
