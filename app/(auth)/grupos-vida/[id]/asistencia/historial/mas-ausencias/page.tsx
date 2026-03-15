import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContenedorDashboard, BotonSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import RankingAsistenciaClient from '@/components/asistencia/RankingAsistencia.client'

export default async function MasAusenciasPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return (
            <DashboardLayout>
                <ContenedorDashboard titulo="" descripcion="" accionPrincipal={null}>
                    <div className="flex items-center justify-center min-h-[50vh]">
                        <div className="text-center">
                            <TituloSistema nivel={2}>Acceso requerido</TituloSistema>
                            <p className="text-muted-foreground mb-4">Debes iniciar sesión.</p>
                            <Link href="/login">
                                <BotonSistema variante="primario">Iniciar Sesión</BotonSistema>
                            </Link>
                        </div>
                    </div>
                </ContenedorDashboard>
            </DashboardLayout>
        )
    }

    // Obtener nombre del grupo
    const { data: grupo } = await supabase.rpc('obtener_detalle_grupo', {
        p_auth_id: user.id,
        p_grupo_id: id
    }) as { data: any }

    // Obtener ranking de más ausencias
    const { data: rankingData, error } = await supabase.rpc('obtener_ranking_asistencia_grupo', {
        p_grupo_id: id,
        p_auth_id: user.id,
        p_modo: 'ausentes'
    })

    if (error) {
        console.error('Error al obtener ranking:', error)
    }

    const ranking = rankingData as any || { total_eventos: 0, miembros: [] }

    return (
        <DashboardLayout>
            <ContenedorDashboard
                titulo="Más Ausencias"
                descripcion={`Miembros con más ausencias — ${grupo?.nombre || 'Grupo'}`}
                botonRegreso={{ href: `/grupos-vida/${id}/asistencia/historial`, texto: 'Historial' }}
                accionPrincipal={null}
            >
                <RankingAsistenciaClient
                    modo="ausentes"
                    miembros={ranking.miembros || []}
                    totalEventos={ranking.total_eventos || 0}
                    grupoNombre={grupo?.nombre || 'Grupo'}
                />
            </ContenedorDashboard>
        </DashboardLayout>
    )
}
