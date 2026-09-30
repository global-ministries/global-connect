import { createSupabaseServerClient } from "@/lib/supabase/server"

import GroupCreateForm from "@/components/forms/GroupCreateForm"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

import { ContenedorDashboard, TarjetaSistema } from "@/components/ui/sistema-diseno"

export default async function CreateGroupPage() {
  const supabase = await createSupabaseServerClient();
  const userData = await getUserWithRoles(supabase)
  if (!userData) {
    return null
  }
  const roles = userData.roles || []
  const esAdminOPastorODG = roles.some(r => ["admin", "pastor", "director-general"].includes(r))
  const esDirectorEtapa = roles.includes("director-etapa")
  const esLider = roles.includes("lider") // excepción temporal

  // Si no es admin/pastor/director-general ni director-etapa, redirigir a listado
  if (!esAdminOPastorODG && !esDirectorEtapa) {
    return (
<ContenedorDashboard
          titulo="Crear Grupo"
          descripcion="No tienes permisos para crear grupos"
          botonRegreso={{ href: '/grupos-vida', texto: 'Volver a Grupos' }}
        >
          <TarjetaSistema>
            <div className="text-sm text-red-600">No Tienes permisos para crear grupos.</div>
          </TarjetaSistema>
        </ContenedorDashboard>
)
  }

  // Cargar temporadas activas y segmentos permitidos
  const [temporadasResult, segmentosResult] = await Promise.all([
    supabase.from("temporadas").select("id, nombre").order('nombre'),
    (async () => {
      if (esAdminOPastorODG || esLider) {
        return await supabase.from("segmentos").select("id, nombre").order('nombre')
      }
      // director-etapa: sólo segmentos donde es líder de etapa
      const { data: authData } = await supabase.auth.getUser()
      const { data: segs, error } = await supabase.rpc('obtener_segmentos_para_director', { p_auth_id: authData?.user?.id! })
      if (error) {
        console.error('[Create] obtener_segmentos_para_director error:', error)
        return { data: [], error }
      }
      return { data: (segs as any[])?.map(s => ({ id: s.id, nombre: s.nombre })) || [], error: null }
    })()
  ]);

  // Manejar errores y logging para depuración
  if (temporadasResult.error) {
    console.error("Error cargando temporadas:", temporadasResult.error);
  }
  if (segmentosResult.error) {
    console.error("Error cargando segmentos:", segmentosResult.error);
  }

  const temporadas = temporadasResult.data || [];
  const segmentos = segmentosResult.data || [];

  // A director de etapa cannot list directors (the API is closed to them): hand the form their own entries.
  let directoresPropios: { id: string; segmento_id: string; nombre: string }[] = [];
  const esSoloDirectorEtapa = esDirectorEtapa && !esAdminOPastorODG;
  if (esSoloDirectorEtapa) {
    const { data: authData } = await supabase.auth.getUser()
    const adminDb = createSupabaseAdminClient()
    const { data: usuario } = await adminDb
      .from("usuarios")
      .select("id, nombre, apellido")
      .eq("auth_id", authData?.user?.id ?? "")
      .maybeSingle()
    if (usuario) {
      const { data: filas } = await adminDb
        .from("segmento_lideres")
        .select("id, segmento_id")
        .eq("usuario_id", usuario.id)
        .eq("tipo_lider", "director_etapa")
      const nombre = `${usuario.nombre || ""} ${usuario.apellido || ""}`.trim()
      directoresPropios = (filas || []).map((f) => ({ id: f.id, segmento_id: f.segmento_id, nombre }))
    }
  }

  return (
<ContenedorDashboard
        titulo="Crear Grupo"
        descripcion="Ingresa los datos para crear un nuevo grupo"
        botonRegreso={{ href: '/grupos-vida', texto: 'Volver a Grupos' }}
      >
        <TarjetaSistema>
          <GroupCreateForm temporadas={temporadas} segmentos={segmentos} userRoles={roles} directoresPropios={directoresPropios} />
        </TarjetaSistema>
      </ContenedorDashboard>
);
}
