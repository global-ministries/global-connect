import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

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
  const adminDb = createSupabaseAdminClient();

  // Obtener usuario autenticado
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Obtener detalle del grupo usando RPC
  const { data: grupoRaw, error } = await supabase.rpc("obtener_detalle_grupo", {
    p_auth_id: user.id,
    p_grupo_id: id
  });
  const grupo = grupoRaw as any;

  if (error || !grupo) {
    return (
      <DashboardLayout>
        <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="text-red-500 text-6xl mb-4">⚠️</div>
              <TituloSistema nivel={2}>Grupo no encontrado</TituloSistema>
              <p className="text-muted-foreground mb-4">
                El grupo solicitado no existe o no tienes acceso para editarlo.
              </p>
              <Link href="/grupos-vida">
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
  const [{ data: puedeEditar }, { data: grupoExtra }] = await Promise.all([
    supabase.rpc("puede_editar_grupo", {
      p_auth_id: user.id,
      p_grupo_id: id,
    }),
    supabase
      .from("grupos")
      .select("casa_anfitriona_id")
      .eq("id", id)
      .single()
  ]);

  // Inyectar casa_anfitriona_id (no viene en la RPC obtener_detalle_grupo)
  if (grupoExtra?.casa_anfitriona_id) {
    grupo.casa_anfitriona_id = grupoExtra.casa_anfitriona_id;
  }

  // Regla de Mapeo: Mapear latitud/longitud a lat/lng
  if (grupo.direccion) {
    grupo.direccion.lat = grupo.direccion.latitud;
    grupo.direccion.lng = grupo.direccion.longitud;
  }

  // Cargar listas de catálogo en paralelo
  // Usar adminDb para casas para evitar que RLS en usuarios oculte los joins
  const [
    { data: temporadas },
    { data: segmentos },
    { data: parroquias },
    { data: casasRaw },
    { data: miembrosGrupo },
  ] = await Promise.all([
    supabase.from("temporadas").select("id, nombre"),
    supabase.from("segmentos").select("id, nombre"),
    supabase.from("parroquias").select("id, nombre"),
    adminDb
      .from("casas_anfitrionas")
      .select("id, nombre_lugar, usuario_id, usuarios!casas_anfitrionas_usuario_id_fkey(nombre, apellido)")
      .eq("activa", true)
      .eq("aprobada", true),
    adminDb
      .from("grupo_miembros")
      .select("usuario_id")
      .eq("grupo_id", id),
  ]);

  // Solo casas aprobadas que pertenezcan a miembros/líderes del grupo
  const miembroIds = new Set((miembrosGrupo ?? []).map((m) => m.usuario_id));
  const casasDisponibles = (casasRaw ?? [])
    .filter((c: Record<string, unknown>) => miembroIds.has(c.usuario_id as string))
    .map((c: Record<string, unknown>) => {
      const usuario = c.usuarios as Record<string, unknown> | null;
      return {
        id: c.id as string,
        nombre_lugar: c.nombre_lugar as string,
        anfitrion_nombre: usuario
          ? `${usuario.nombre ?? ''} ${usuario.apellido ?? ''}`.trim()
          : 'Sin anfitrión',
      };
    });

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo="Editar Grupo"
        descripcion={`Modifica la información del grupo "${grupo.nombre}"`}
        botonRegreso={{ href: `/grupos-vida/${id}`, texto: 'Volver al grupo' }}
      >
        {/* Formulario */}
        <TarjetaSistema className="p-6">
          {!puedeEditar && (
            <div className="mb-6 rounded-md border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800">
              Este grupo está en modo solo lectura para tu rol. No puedes editarlo porque no eres el director de etapa asignado ni tienes permisos superiores.
            </div>
          )}
          <GroupEditForm
            grupo={grupo as any}
            temporadas={temporadas || []}
            segmentos={segmentos || []}
            parroquias={parroquias || []}
            casasDisponibles={casasDisponibles}
            readOnly={!puedeEditar}
          />
        </TarjetaSistema>
      </ContenedorDashboard>
    </DashboardLayout>
  );
}
