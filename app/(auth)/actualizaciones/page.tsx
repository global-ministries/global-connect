import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import ActualizacionesClient from './ActualizacionesClient'
import type { RolSistema } from '@/lib/data/actualizaciones'

/**
 * Mapea roles del sistema (con guiones) a roles de actualizaciones (con underscores).
 * Devuelve el rol más alto del usuario para filtrar actualizaciones.
 */
function mapearRolPrincipal(roles: string[]): RolSistema {
    const jerarquia: { db: string; act: RolSistema }[] = [
        { db: 'admin', act: 'admin' },
        { db: 'pastor', act: 'pastor' },
        { db: 'director-general', act: 'director_general' },
        { db: 'director-etapa', act: 'director_etapa' },
        { db: 'lider', act: 'lider' },
        { db: 'miembro', act: 'miembro' },
    ]

    for (const { db, act } of jerarquia) {
        if (roles.includes(db)) return act
    }

    return 'miembro'
}

/**
 * Página de actualizaciones del sistema.
 * Server Component que resuelve el rol del usuario y pasa los datos al client.
 * - Miembros: ven solo detalles de su rol, sin filtros.
 * - Líderes y superiores: ven todo con opción de filtrar por rol.
 */
export default async function ActualizacionesPage() {
    const supabase = await createSupabaseServerClient()
    const userData = await getUserWithRoles(supabase)
    const roles = userData?.roles || []
    const rolMapeado = mapearRolPrincipal(roles)
    const puedeVerTodo = rolMapeado !== 'miembro'

    return (
        <ContenedorDashboard titulo="Actualizaciones" descripcion="Historial de cambios y mejoras del sistema">
            <ActualizacionesClient puedeVerTodo={puedeVerTodo} rolUsuario={rolMapeado} />
        </ContenedorDashboard>
    )
}
