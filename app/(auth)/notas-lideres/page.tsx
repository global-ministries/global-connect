import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import NotasLideresListado from './NotasLideresListado.client'

export const dynamic = 'force-dynamic'

export default async function PaginaNotasLideres() {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    let eventos: any[] = []
    if (user) {
        const { data, error } = await supabase.rpc('obtener_eventos_con_notas', {
            p_auth_id: user.id,
            p_limite: 50
        })
        if (!error && data) {
            eventos = Array.isArray(data) ? data : []
        }
    }

    return (
        <DashboardLayout>
            <ContenedorDashboard
                titulo="Notas de Líderes"
                botonRegreso={{ href: '/dashboard', texto: 'Dashboard' }}
            >
                <NotasLideresListado eventos={eventos} />
            </ContenedorDashboard>
        </DashboardLayout>
    )
}
