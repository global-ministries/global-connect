import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import GroupEditForm from "@/components/forms/GroupEditForm";
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { ContenedorDashboard, TarjetaSistema, BotonSistema, TituloSistema } from '@/components/ui/sistema-diseno';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditGroupPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();

  // Obtener usuario autenticado
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Obtener detalle del grupo usando RPC
  const { data: grupo, error } = await supabase.rpc("obtener_detalle_grupo", {
    p_auth_id: user.id,
    p_grupo_id: id
  });

  if (error || !grupo) {
    return (
      <DashboardLayout>
        <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <TituloSistema nivel={2}>Grupo no encontrado</TituloSistema>
              <p className="text-gray-600 mb-4">
                El grupo solicitado no existe o no tienes acceso para editarlo.
              </p>
              <Link href="/dashboard/grupos">
                <BotonSistema variante="primario">
                  Volver a Grupos
                </BotonSistema>
              </Link>
            </div>
          </div>
        </ContenedorDashboard>
      </DashboardLayout>
    );
  }

  // Chequear permiso explícito para editar; si no tiene, redirigir al detalle
  const { data: puedeEditar } = await supabase.rpc("puede_editar_grupo", {
    p_auth_id: user.id,
    p_grupo_id: id,
  });
  if (!puedeEditar) {
    redirect(`/dashboard/grupos/${id}`);
  }

  // Regla de Mapeo: Mapear latitud/longitud a lat/lng
  if (grupo.direccion) {
    grupo.direccion.lat = grupo.direccion.latitud;
    grupo.direccion.lng = grupo.direccion.longitud;
  }

  // Cargar listas de catálogo en paralelo
  const [
    { data: temporadas },
    { data: segmentos },
    { data: paises },
    { data: estados },
    { data: municipios },
    { data: parroquias }
  ] = await Promise.all([
    supabase.from("temporadas").select("id, nombre"),
    supabase.from("segmentos").select("id, nombre"),
    supabase.from("paises").select("id, nombre"),
    supabase.from("estados").select("id, nombre"),
    supabase.from("municipios").select("id, nombre"),
    supabase.from("parroquias").select("id, nombre")
  ]);

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Editar Grupo"
        descripcion={`Modifica la información del grupo "${grupo.nombre}"`}
        accionPrincipal={
          <Link href={`/dashboard/grupos/${id}`}>
            <BotonSistema 
              variante="ghost" 
              tamaño="sm"
              className="p-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </BotonSistema>
          </Link>
        }
      >
        {/* Formulario */}
        <TarjetaSistema className="p-6">
          <GroupEditForm
            grupo={grupo}
            temporadas={temporadas || []}
            segmentos={segmentos || []}
            paises={paises || []}
            estados={estados || []}
            municipios={municipios || []}
            parroquias={parroquias || []}
          />
        </TarjetaSistema>
      </ContenedorDashboard>
    </DashboardLayout>
  );
}
