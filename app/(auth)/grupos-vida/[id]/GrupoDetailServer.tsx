import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GrupoDetailClient from "./GrupoDetailClient";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ContenedorDashboard, TarjetaSistema, BotonSistema } from "@/components/ui/sistema-diseno";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

/** Tipo para el resultado del RPC obtener_detalle_grupo */
interface GrupoRPCResult {
  nombre: string;
  segmento_nombre?: string;
  temporada_nombre?: string;
  dia_reunion?: string;
  hora_reunion?: string;
  direccion?: {
    calle?: string;
    barrio?: string;
    latitud?: number;
    longitud?: number;
    lat?: number;
    lng?: number;
  };
  miembros?: Array<{
    id: string | number;
    nombre: string;
    apellido: string;
    email?: string;
    telefono?: string;
    rol?: string;
    foto_perfil_url?: string | null;
  }>;
  puede_gestionar_miembros?: boolean;
  rol_en_grupo?: string | null;
  puede_editar_ui?: boolean;
}

export default async function GrupoDetailServer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: grupoRaw, error } = await supabase.rpc("obtener_detalle_grupo", {
    p_auth_id: user!.id,
    p_grupo_id: id
  });
  const grupo = grupoRaw as GrupoRPCResult | null;

  if (error || !grupo) {
    return (
      <DashboardLayout>
        <ContenedorDashboard
          titulo="Grupo no encontrado"
          botonRegreso={{ href: "/grupos-vida", texto: "Volver a Grupos" }}
        >
          <TarjetaSistema variante="outlined" className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-semibold text-foreground mb-2">
              Grupo no encontrado
            </p>
            <p className="text-muted-foreground mb-6">
              El grupo solicitado no existe o no tienes acceso para verlo.
            </p>
            <Link href="/grupos-vida">
              <BotonSistema variante="primario">
                Volver a Grupos
              </BotonSistema>
            </Link>
          </TarjetaSistema>
        </ContenedorDashboard>
      </DashboardLayout>
    );
  }

  // Mapear latitud/longitud a lat/lng para el frontend
  if (grupo.direccion) {
    grupo.direccion.lat = grupo.direccion.latitud;
    grupo.direccion.lng = grupo.direccion.longitud;
  }
  // Calcular permiso de edición (si hay usuario); inyectar en el objeto grupo para el cliente
  if (user?.id) {
    const { data: permitido } = await supabase.rpc("puede_editar_grupo", {
      p_auth_id: user.id,
      p_grupo_id: id,
    });
    grupo.puede_editar_ui = !!permitido;
  } else {
    grupo.puede_editar_ui = false;
  }

  return (
    <DashboardLayout>
      <GrupoDetailClient grupo={grupo} id={id} />
    </DashboardLayout>
  );
}
