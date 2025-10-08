import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense, lazy } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, TituloSistema, TextoSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { ArrowLeft, Users } from 'lucide-react'

const DirectoresSegmentoClient = lazy(() => import('./DirectoresSegmentoClient'))

interface Props {
  params: { segmentoId: string }
}

export default async function DirectoresSegmentoPage({ params }: Props) {
  const { segmentoId } = params
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData) redirect('/login')
  console.log('[DIRECTORES_SEGMENTO] roles usuario:', userData.roles)
  const puedeVer = userData.roles.some(r => ['admin','pastor','director-general','director-etapa'].includes(r))
  if (!puedeVer) redirect('/dashboard')
  const esSuperior = userData.roles.some(r => ['admin','pastor','director-general'].includes(r))

  // Obtener nombre del segmento para el título/contexto
  const { data: segRows, error } = await supabase
    .from('segmentos')
    .select('id,nombre')
    .eq('id', segmentoId)
    .limit(1)

  if (error) {
    console.error('[DIRECTORES_SEGMENTO] error cargando segmento', error)
  }
  const segmento = segRows && segRows.length > 0 ? segRows[0] : null
  if (!segmento) {
    console.warn('[DIRECTORES_SEGMENTO] segmento no visible o inexistente. Redirigiendo detalle.')
    redirect('/dashboard/segments')
  }

  return (
    <DashboardLayout>
      <ContenedorDashboard
        titulo={`Directores de Etapa`}
        subtitulo={`Gestión para el segmento: ${segmento.nombre}`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <Link href={`/dashboard/segments/${segmento.id}`} className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4 mr-1" /> Volver al segmento
          </Link>
        </div>

        <div className="space-y-6">
          <TarjetaSistema className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center text-white">
                <Users className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <TituloSistema nivel={3}>Asignaciones de Directores</TituloSistema>
                <TextoSistema variante="sutil" className="mt-1">Asigna y visualiza directores por ciudad y (próximamente) por grupo.</TextoSistema>
              </div>
            </div>
            <div className="mt-6">
              <Suspense fallback={<div className="text-sm text-gray-500">Cargando módulo...</div>}>
                <DirectoresSegmentoClient segmentoId={segmentoId} esSuperior={esSuperior} />
              </Suspense>
            </div>
          </TarjetaSistema>
          {!esSuperior && (
            <div className="text-[11px] text-muted-foreground">
              Solo roles superiores (admin/pastor/director-general) pueden agregar nuevos directores. Puedes ver tus asignaciones existentes.
            </div>
          )}
        </div>
      </ContenedorDashboard>
    </DashboardLayout>
  )
}
