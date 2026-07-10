import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GrupoDetailClient from "./GrupoDetailClient";

import { ContenedorDashboard, TarjetaSistema, BotonSistema } from "@/components/ui/sistema-diseno";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { obtenerConfiguracionGrupos } from "@/lib/actions/configuracion-grupos-vida.actions";

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
  casa_anfitriona_id?: string | null;
  casa_anfitriona_info?: {
    nombre_lugar?: string;
    anfitrion_nombre?: string;
    co_anfitrion_nombre?: string;
    calle?: string;
    barrio?: string;
    latitud?: number;
    longitud?: number;
  } | null;
  // Permisos de eliminación de miembros
  rol_minimo_eliminar_miembro?: string;
  roles_sistema_usuario?: string[];
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

  // Obtener config de gestión de miembros y roles del usuario
  const configResult = await obtenerConfiguracionGrupos();
  if (configResult.success && configResult.data) {
    grupo.rol_minimo_eliminar_miembro = configResult.data.rol_minimo_eliminar_miembro;
  }
  if (user?.id) {
    const { data: rolesArr } = await supabase.rpc("obtener_roles_sistema_usuario", {
      p_auth_id: user.id
    });
    grupo.roles_sistema_usuario = (rolesArr as string[] | null) ?? [];
  }

  // Obtener info de casa anfitriona si el grupo tiene una
  const { data: grupoRow } = await supabase
    .from("grupos")
    .select("casa_anfitriona_id")
    .eq("id", id)
    .single();

  if (grupoRow?.casa_anfitriona_id) {
    const { data: casaData } = await supabase
      .from("casas_anfitrionas")
      .select(`
        nombre_lugar,
        usuarios!casas_anfitrionas_usuario_id_fkey ( nombre, apellido ),
        co_anfitrion:usuarios!casas_anfitrionas_co_anfitrion_id_fkey ( nombre, apellido ),
        direcciones!casas_anfitrionas_direccion_id_fkey ( calle, barrio, latitud, longitud )
      `)
      .eq("id", grupoRow.casa_anfitriona_id)
      .single();

    if (casaData) {
      const anfitrionUser = casaData.usuarios as unknown as { nombre: string; apellido: string } | null;
      const coAnfitrionUser = casaData.co_anfitrion as unknown as { nombre: string; apellido: string } | null;
      const casaDireccion = casaData.direcciones as unknown as { calle: string | null; barrio: string | null; latitud: number | null; longitud: number | null } | null;
      grupo.casa_anfitriona_info = {
        nombre_lugar: casaData.nombre_lugar ?? undefined,
        anfitrion_nombre: anfitrionUser ? `${anfitrionUser.nombre} ${anfitrionUser.apellido}` : undefined,
        co_anfitrion_nombre: coAnfitrionUser ? `${coAnfitrionUser.nombre} ${coAnfitrionUser.apellido}` : undefined,
        calle: casaDireccion?.calle ?? undefined,
        barrio: casaDireccion?.barrio ?? undefined,
        latitud: casaDireccion?.latitud ?? undefined,
        longitud: casaDireccion?.longitud ?? undefined,
      };
    }
  }

  return (
<GrupoDetailClient grupo={grupo} id={id} />
);
}
