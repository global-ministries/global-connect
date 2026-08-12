/**
 * PR19 — DT-077 — /talleres/equipo/mis-grupos/[id]/asistencia (L).
 * Lista de asistentes para una sesion del grupo. Pasa sesion_id como
 * query param. La UI renderiza un selector simple.
 */
import { DashboardPage, EmptyState } from '@/components/talleres/dashboard-page'
import { TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'

import {
  loadEquipoGrupos,
  loadEquipoAsistencia,
  requireOperacionalRole,
} from '@/lib/platform/talleres/operacional'

export const metadata = { title: 'Asistencia' }

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
  readonly searchParams?: Promise<{ readonly sesion_id?: string }>
}

export default async function AsistenciaPage(ctx: RouteContext) {
  const participant = await requireOperacionalRole()
  const { id: grupoId } = await ctx.params
  const sp = ctx.searchParams ? await ctx.searchParams : {}
  const sesionId = sp.sesion_id ?? null

  // Verify the leader owns this grupo.
  const grupos = await loadEquipoGrupos(participant)
  const ownsGrupo = grupos.some((g) => g.id === grupoId)
  if (!ownsGrupo) {
    return (
      <DashboardPage titulo="Asistencia">
        <EmptyState message="No lideras este grupo." />
      </DashboardPage>
    )
  }

  if (!sesionId) {
    return (
      <DashboardPage titulo="Asistencia" subtitulo="Sesiones del grupo">
        <EmptyState message="Proporcioná ?sesion_id=<id> en la URL." />
      </DashboardPage>
    )
  }

  const rows = await loadEquipoAsistencia(participant, sesionId)
  return (
    <DashboardPage titulo="Asistencia" subtitulo={`Sesión ${sesionId}`}>
      {rows.length === 0 ? (
        <EmptyState message="Aún no hay registros de asistencia." />
      ) : (
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <TarjetaSistema variante="outlined" className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <TextoSistema className="text-sm">{r.persona_id}</TextoSistema>
                  <BadgeSistema
                    variante={r.estado === 'presente' ? 'success' : r.estado === 'ausente' ? 'error' : 'info'}
                  >
                    {r.estado}
                  </BadgeSistema>
                </div>
              </TarjetaSistema>
            </li>
          ))}
        </ul>
      )}
    </DashboardPage>
  )
}
