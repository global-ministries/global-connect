/**
 * PR18 — DT-072 — /talleres/explorar (RSC).
 * PR20 — wires the list into a client component (ExplorarTalleresClient)
 *        so that the FAB can react to selection.
 * P2 (odd/tasks/talleres-inscripcion-en-pareja.md) — the page-level
 *        `defaultCohorteId` fallback is gone: `talleres_inscribirme`
 *        resolves the cohorte from the edición server-side.
 *
 * Lists talleres currently open for enrollment (`estado='abierto'` or
 * `estado='en_curso'`). Participants see each taller with a flag
 * indicating whether they're already inscribed. The inscribirse action
 * is exposed as a server action imported from `./actions.ts`.
 *
 * Finding #1 (Option B) — visible + enrollable by ANY authenticated
 * user, with any role or none. The page guard is `requireExplorarViewer`
 * (no `participation.read` requirement); the RLS layer confines what a
 * viewer can actually read/insert.
 *
 * T9 (odd/tasks/proximo-paso.md, L21–L23) — each row also carries the real
 * estado of the viewer's own inscripción (loadParticipanteActiveTalleres), so
 * the card and the confirmation say «inscrito» or «pendiente» truthfully. No
 * instructional banner: the cards and the «Inscribirme» button speak.
 */

import { PaginaSistema } from '@/components/ui/sistema-diseno'

import {
  loadParticipanteActiveTalleres,
  loadParticipanteExplorar,
  requireExplorarViewer,
} from '@/lib/platform/talleres/participante'
import { refrescarEstadosEdiciones } from '@/lib/platform/talleres/refrescar-estados'

import { ExplorarTalleresClient } from './explorar-client'

export const metadata = {
  title: 'Explorar Talleres',
}

export default async function ExplorarTalleresPage() {
  const ctx = await requireExplorarViewer()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase

  // T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — best
  // effort, unscoped (explorar spans every open taller) — see refrescar-
  // estados.ts's own header. Runs before loadParticipanteExplorar so its
  // edición badges never show a stale STORED estado.
  await refrescarEstadosEdiciones(client)

  const [ediciones, inscripciones] = await Promise.all([
    loadParticipanteExplorar(ctx),
    loadParticipanteActiveTalleres(ctx),
  ])
  const estadoPorEdicion = new Map<string, 'pendiente' | 'aprobado'>()
  for (const inscripcion of inscripciones) {
    const estado = inscripcion.estado_inscripcion
    if (estado === 'pendiente' || estado === 'aprobado') estadoPorEdicion.set(inscripcion.id, estado)
  }
  const talleres = ediciones.map((edicion) => ({
    ...edicion,
    estado_inscripcion: estadoPorEdicion.get(edicion.id) ?? null,
  }))

  return (
    <PaginaSistema
      titulo="Explorar Talleres"
      regreso={{ href: '/dashboard', texto: 'Inicio' }}
      descripcion="Talleres con inscripciones abiertas."
    >
      <div className="grid gap-4">
        <ExplorarTalleresClient talleres={talleres} />
      </div>
    </PaginaSistema>
  )
}
