/**
 * PR18 — DT-072 — /talleres/explorar (RSC).
 * PR20 — wires the list into a client component (ExplorarTalleresClient)
 *        so that the FAB can react to selection.
 *
 * Lists talleres currently open for enrollment (`estado='abierto'` or
 * `estado='en_curso'`). Participants see each taller with a flag
 * indicating whether they're already inscribed. The inscribirse action
 * is exposed as a server action imported from `./actions.ts`.
 *
 * Capability gate: participation.read (via requireParticipante).
 */

import { ContenedorDashboard, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import {
  loadParticipanteExplorar,
  requireParticipante,
} from '@/lib/platform/talleres/participante'

import { ExplorarTalleresClient } from './explorar-client'

export const metadata = {
  title: 'Explorar Talleres',
}

export default async function ExplorarTalleresPage() {
  const ctx = await requireParticipante()
  const talleres = await loadParticipanteExplorar(ctx)

  // For the FAB we need a default cohorte id. The current participante
  // model doesn't surface it on the listing; we look up the first
  // active cohorte as a fallback. Future iteration: surface cohorte_id
  // per-taller on the listing projection.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase
  const cohorteRes = await client
    .from('talleres_crecimiento_cohortes')
    .select('id')
    .eq('estado', 'activo')
    .limit(1)
    .maybeSingle()
  const defaultCohorteId: string = (cohorteRes.data?.id as string | undefined) ?? ''

  return (
    <ContenedorDashboard
      titulo="Explorar Talleres"
      botonRegreso={{ href: '/dashboard', texto: 'Inicio' }}
    >
      <div className="grid gap-4">
        <TarjetaSistema variante="outlined" className="p-4 sm:p-5">
          <TextoSistema variante="sutil">
            Estos talleres están abiertos para inscripción. Tocá uno para
            seleccionarlo; el botón &quot;Inscribirme&quot; aparece abajo a la
            derecha. Si ya estás inscripto/a en uno, su tarjeta está
            deshabilitada.
          </TextoSistema>
        </TarjetaSistema>
        <ExplorarTalleresClient
          talleres={talleres.map((t) => ({
            ...t,
            cohorte_id: defaultCohorteId,
          }))}
          defaultCohorteId={defaultCohorteId}
        />
      </div>
    </ContenedorDashboard>
  )
}
