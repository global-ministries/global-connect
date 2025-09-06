import { Users2 } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { getUserWithRoles } from "@/lib/getUserWithRoles"
import GruposListClient from "@/components/grupos/GruposList.client"

import { ReactNode } from "react"

function GlassCard({ children, className = "" }: { children: ReactNode, className?: string }) {
  return (
    <div className={`backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-6 lg:p-8 shadow-2xl ${className}`}>
      {children}
    </div>
  )
}

// (El color por segmento ahora se maneja dentro del componente cliente)

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  // Seguridad: verificar roles de liderazgo
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData) {
    console.log("[GC] No hay usuario autenticado")
    redirect("/login")
  }
  const rolesLiderazgo = ["admin", "pastor", "director-general", "director-etapa", "lider"]
  const tieneAcceso = userData.roles.some(r => rolesLiderazgo.includes(r))
  if (!tieneAcceso) {
    console.log("[GC] Usuario sin acceso, roles:", userData.roles)
    redirect("/dashboard")
  }

  // LOG: roles del usuario
  console.log("[GC] Roles del usuario:", userData.roles)

  // Resolver searchParams (puede venir como Promise según tipos de Next)
  const sp: Record<string, string | string[] | undefined> = typeof (searchParams as any)?.then === 'function'
    ? await (searchParams as any)
    : (searchParams as any) || {}

  // Obtener grupos para el usuario actual usando la RPC con filtros de la URL
  const { data: { user } } = await supabase.auth.getUser()
  let grupos: any[] = []
  let totalCount: number = 0
  const pageSize = Number(Array.isArray(sp?.pageSize) ? sp?.pageSize[0] : sp?.pageSize) || 20
  const page = Number(Array.isArray(sp?.page) ? sp?.page[0] : sp?.page) || 1
  const offset = (page - 1) * pageSize
  const seg = Array.isArray(sp?.segmentoId) ? sp?.segmentoId[0] : sp?.segmentoId
  const temp = Array.isArray(sp?.temporadaId) ? sp?.temporadaId[0] : sp?.temporadaId
  const estado = Array.isArray(sp?.estado) ? sp?.estado[0] : sp?.estado
  const muni = Array.isArray(sp?.municipioId) ? sp?.municipioId[0] : sp?.municipioId
  const parr = Array.isArray(sp?.parroquiaId) ? sp?.parroquiaId[0] : sp?.parroquiaId
  const p_activo = estado === 'activo' ? true : estado === 'inactivo' ? false : null
  try {
    const { data, error } = await supabase.rpc('obtener_grupos_para_usuario', {
      p_auth_id: user?.id,
      p_segmento_id: seg || null,
      p_temporada_id: temp || null,
      p_activo,
      p_municipio_id: muni || null,
      p_parroquia_id: parr || null,
      p_limit: pageSize,
      p_offset: offset,
    })
    if (error) {
      console.log('[GC] Error RPC obtener_grupos_para_usuario:', error)
    }
    grupos = (data as any[]) || []
    totalCount = grupos?.[0]?.total_count ? Number(grupos[0].total_count) : 0
    console.log('[GC] RPC grupos:', grupos?.length, 'totalCount:', totalCount)
  } catch (e) {
    console.log('[GC] Excepción RPC obtener_grupos_para_usuario:', e)
  }

  // Listas para filtros (segmentos, temporadas, municipios, parroquias)
  const [{ data: segmentos }, { data: temporadas }, { data: municipios }, { data: parroquias }] = await Promise.all([
    supabase.from("segmentos").select("id, nombre").order("nombre"),
    supabase.from("temporadas").select("id, nombre").order("nombre"),
    supabase.from("municipios").select("id, nombre").order("nombre"),
    supabase.from("parroquias").select("id, nombre, municipio_id").order("nombre"),
  ])

  return (
    <div className="space-y-6">
      {/* Header GlassCard */}
      <GlassCard>
        <div className="flex items-center gap-4 mb-2">
          <div className="w-10 h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
            <Users2 className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-800">Gestión de Grupos</h2>
            <p className="text-gray-600 text-sm lg:text-base">Administra y organiza los grupos de tu comunidad</p>
          </div>
        </div>
      </GlassCard>

      {/* Tarjetas + Lista (dinámicas con filtros) */}
      <GlassCard>
        <GruposListClient
          grupos={grupos || []}
          segmentos={segmentos || []}
          temporadas={temporadas || []}
          municipios={municipios || []}
          parroquias={parroquias || []}
          totalCount={totalCount}
          pageSize={pageSize}
        />
      </GlassCard>
    </div>
  )
}
