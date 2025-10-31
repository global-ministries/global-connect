import { Users2, Upload } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import GruposListClient from "@/components/grupos/GruposList.client"
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, BotonSistema } from '@/components/ui/sistema-diseno'

// (El color por segmento ahora se maneja dentro del componente cliente)

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  // Seguridad: verificar roles de liderazgo
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData) {
    console.log("[GC] No hay usuario autenticado")
    redirect("/login")
  }
  // Acceso: cualquier usuario autenticado puede entrar; la RPC limitará visibilidad según permisos

  // Resolver searchParams (puede venir como Promise según tipos de Next)
  const sp: Record<string, string | string[] | undefined> = typeof (searchParams as any)?.then === 'function'
    ? await (searchParams as any)
    : (searchParams as any) || {}

  // Obtener grupos para el usuario actual usando la RPC con filtros de la URL
  const { data: { user } } = await supabase.auth.getUser()
  const pageSize = Number(Array.isArray(sp?.pageSize) ? sp?.pageSize[0] : sp?.pageSize) || 20
  const pageActuales = Number(Array.isArray(sp?.page_actuales) ? sp?.page_actuales[0] : sp?.page_actuales) || 1
  const pagePasados = Number(Array.isArray(sp?.page_pasados) ? sp?.page_pasados[0] : sp?.page_pasados) || 1
  const pageMios = Number(Array.isArray(sp?.page_mios) ? sp?.page_mios[0] : sp?.page_mios) || 1
  const pageFuturos = Number(Array.isArray(sp?.page_futuros) ? sp?.page_futuros[0] : sp?.page_futuros) || 1
  const offsetActuales = (pageActuales - 1) * pageSize
  const offsetPasados = (pagePasados - 1) * pageSize
  const offsetMios = (pageMios - 1) * pageSize
  const offsetFuturos = (pageFuturos - 1) * pageSize
  const seg = Array.isArray(sp?.segmentoId) ? sp?.segmentoId[0] : sp?.segmentoId
  const temp = Array.isArray(sp?.temporadaId) ? sp?.temporadaId[0] : sp?.temporadaId
  const estado = Array.isArray(sp?.estado) ? sp?.estado[0] : sp?.estado
  const muni = Array.isArray(sp?.municipioId) ? sp?.municipioId[0] : sp?.municipioId
  const parr = Array.isArray(sp?.parroquiaId) ? sp?.parroquiaId[0] : sp?.parroquiaId
  const esEliminado = estado === 'eliminado'
  const p_activo = estado === 'activo' ? true : estado === 'inactivo' ? false : null

  // Listas para filtros (segmentos, temporadas, municipios, parroquias)
  const [{ data: segmentos }, { data: temporadas }, { data: municipios }, { data: parroquias }] = await Promise.all([
    supabase.from("segmentos").select("id, nombre").order("nombre"),
    supabase.from("temporadas").select("id, nombre").order("nombre"),
    supabase.from("municipios").select("id, nombre").order("nombre"),
    supabase.from("parroquias").select("id, nombre, municipio_id").order("nombre"),
  ])
  try {
    const [actResp, pasResp, miosResp, futResp] = await Promise.all([
      supabase.rpc('obtener_grupos_para_usuario', {
        p_auth_id: user?.id,
        p_segmento_id: seg || null,
        p_temporada_id: temp || null,
        p_activo,
        p_municipio_id: muni || null,
        p_parroquia_id: parr || null,
        p_limit: pageSize,
        p_offset: offsetActuales,
        p_eliminado: esEliminado,
        p_estado_temporal: 'actual',
        p_solo_mios: false,
      }),
      supabase.rpc('obtener_grupos_para_usuario', {
        p_auth_id: user?.id,
        p_segmento_id: seg || null,
        p_temporada_id: temp || null,
        p_activo,
        p_municipio_id: muni || null,
        p_parroquia_id: parr || null,
        p_limit: pageSize,
        p_offset: offsetPasados,
        p_eliminado: esEliminado,
        p_estado_temporal: 'pasado',
        p_solo_mios: false,
      }),
      supabase.rpc('obtener_grupos_para_usuario', {
        p_auth_id: user?.id,
        p_segmento_id: seg || null,
        p_temporada_id: temp || null,
        p_activo,
        p_municipio_id: muni || null,
        p_parroquia_id: parr || null,
        p_limit: pageSize,
        p_offset: offsetMios,
        p_eliminado: esEliminado,
        p_estado_temporal: null,
        p_solo_mios: true,
      }),
      supabase.rpc('obtener_grupos_para_usuario', {
        p_auth_id: user?.id,
        p_segmento_id: seg || null,
        p_temporada_id: temp || null,
        p_activo,
        p_municipio_id: muni || null,
        p_parroquia_id: parr || null,
        p_limit: pageSize,
        p_offset: offsetFuturos,
        p_eliminado: esEliminado,
        p_estado_temporal: 'futuro',
        p_solo_mios: false,
      }),
    ])
    const error = actResp.error || pasResp.error || miosResp.error || futResp.error
    if (error) {
      console.log('[GC] Error RPC obtener_grupos_para_usuario:', error)
    }
    const gruposActuales = (actResp.data as any[]) || []
    const gruposPasados = (pasResp.data as any[]) || []
    const gruposMios = (miosResp.data as any[]) || []
    const gruposFuturos = (futResp.data as any[]) || []
    const totalActuales = gruposActuales?.[0]?.total_count ? Number(gruposActuales[0].total_count) : 0
    const totalPasados = gruposPasados?.[0]?.total_count ? Number(gruposPasados[0].total_count) : 0
    const totalMios = gruposMios?.[0]?.total_count ? Number(gruposMios[0].total_count) : 0
    const totalFuturos = gruposFuturos?.[0]?.total_count ? Number(gruposFuturos[0].total_count) : 0
    console.log('[GC] RPC grupos pre-cargados:', {
      actuales: gruposActuales.length,
      pasados: gruposPasados.length,
      mios: gruposMios.length,
      futuros: gruposFuturos.length,
    })

    const roles = userData.roles || []
    const canCreateSuperior = roles.some(r => ["admin","pastor","director-general","director-etapa"].includes(r))
    const canCreate = canCreateSuperior || roles.includes('lider')
    const canDelete = canCreateSuperior
    const canRestore = roles.some(r => ["admin","pastor","director-general"].includes(r))

    return (
      <DashboardLayout>
        <ContenedorDashboard
          titulo="Grupos"
          descripcion="Administra y organiza los grupos de tu comunidad"
          accionPrincipal={canCreateSuperior ? (
            <Link href="/dashboard/grupos/importar">
              <BotonSistema variante="outline" tamaño="sm" icono={Upload}>
                Importar CSV
              </BotonSistema>
            </Link>
          ) : null}
        >
          <GruposListClient
            grupos={[]}
            segmentos={segmentos || []}
            temporadas={temporadas || []}
            municipios={municipios || []}
            parroquias={parroquias || []}
            totalCount={totalActuales}
            pageSize={pageSize}
            canCreate={canCreate}
            canDelete={canDelete}
            canRestore={canRestore}
            userRoles={roles}
            filtroEstado={estado as string | undefined}
            hayMisGrupos={Boolean(gruposMios?.[0]?.hay_mis_grupos)}
            preActuales={gruposActuales}
            totalActuales={totalActuales}
            prePasados={gruposPasados}
            totalPasados={totalPasados}
            preMios={gruposMios}
            totalMios={totalMios}
            preFuturos={gruposFuturos}
            totalFuturos={totalFuturos}
          />
        </ContenedorDashboard>
      </DashboardLayout>
    )
  } catch (e) {
    console.log('[GC] Excepción RPC obtener_grupos_para_usuario:', e)
  }
  // En caso de excepción previa devuelve layout básico vacío
  return (
    <DashboardLayout>
      <ContenedorDashboard titulo="Grupos" descripcion="Administra y organiza los grupos de tu comunidad">
        <GruposListClient grupos={[]} segmentos={[]} temporadas={[]} totalCount={0} pageSize={pageSize} />
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
