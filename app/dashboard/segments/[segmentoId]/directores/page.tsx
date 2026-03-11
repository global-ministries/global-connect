import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense, lazy } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, TituloSistema, TextoSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { Users } from 'lucide-react'

const DirectoresSegmentoClient = lazy(() => import('./DirectoresSegmentoClient'))

interface Props {
  params: Promise<{ segmentoId: string }>
}

export default async function DirectoresSegmentoPage({ params }: Props) {
  const { segmentoId } = await params
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData) redirect('/login')
  console.log('[DIRECTORES_SEGMENTO] roles usuario:', userData.roles)
  const puedeVer = userData.roles.some(r => ['admin', 'pastor', 'director-general', 'director-etapa'].includes(r))
  if (!puedeVer) redirect('/dashboard')
  const esSuperior = userData.roles.some(r => ['admin', 'pastor', 'director-general'].includes(r))

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
        botonRegreso={{ href: `/dashboard/segments/${segmento.id}`, texto: 'Volver al segmento' }}
      >

        <div className="space-y-6">
          <TarjetaSistema className="p-6">
            <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
              <Users className="w-5 h-5 text-orange-500" />
              Asignaciones de Directores
            </h3>
            <TextoSistema variante="sutil" className="-mt-4 mb-4">Asigna y visualiza directores por ciudad y (próximamente) por grupo.</TextoSistema>

            {/* Contenido con estilo tipo 'Miembros' */}
            <div className="bg-card/50 border border-border rounded-xl p-4">
              <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando módulo...</div>}>
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
