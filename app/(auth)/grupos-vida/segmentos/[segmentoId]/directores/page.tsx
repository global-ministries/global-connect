import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense, lazy } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'

import { ContenedorDashboard, TextoSistema } from '@/components/ui/sistema-diseno'

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
    redirect('/grupos-vida/segmentos')
  }

  return (
<ContenedorDashboard
        titulo="Directores del Segmento"
        subtitulo={segmento.nombre}
        botonRegreso={{ href: `/grupos-vida/segmentos/${segmento.id}`, texto: 'Volver' }}
      >
        <div className="space-y-4">
          <Suspense fallback={<div className="text-sm text-muted-foreground">Cargando módulo...</div>}>
            <DirectoresSegmentoClient segmentoId={segmentoId} esSuperior={esSuperior} />
          </Suspense>

          {!esSuperior && (
            <TextoSistema variante="sutil" className="text-[11px]">
              Solo roles superiores (admin/pastor/director-general) pueden agregar nuevos directores. Puedes ver tus asignaciones existentes.
            </TextoSistema>
          )}
        </div>
      </ContenedorDashboard>
)
}
