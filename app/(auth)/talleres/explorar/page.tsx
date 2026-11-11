/**
 * PR18 — DT-072 — /talleres/explorar (RSC).
 * PR20 — wires the list into a client component (ExplorarTalleresClient).
 * P2 (odd/tasks/talleres-inscripcion-en-pareja.md) — `talleres_inscribirme`
 *        resolves the cohorte from the edición server-side.
 *
 * Lists talleres currently open for enrollment (`estado='abierto'` or
 * `estado='en_curso'`), visible + enrollable by ANY authenticated user
 * (Finding #1, Option B): the guard is `requireExplorarViewer`, the RLS layer
 * confines what a viewer can actually read/insert.
 *
 * T9 (odd/tasks/proximo-paso.md, L21–L23) — each row also carries the real
 * estado of the viewer's own inscripción (loadParticipanteActiveTalleres).
 *
 * R3a (odd/tasks/talleres-rediseno.md, S1 S2 S6 S7; design/talleres-interior/
 * 20 and 21) — the v2 frame: back to «Mis talleres» (desktop header and phone), large title and
 * summary on phones. The page also reads the viewer's ficha (género for «Ya
 * inscrito» / «Ya inscrita», «Tus datos» in the confirmation) and calls
 * hizo_proximo_paso(usuarios.id) once: true drops the Próximo Paso taller
 * and the client shows the card to share it; false or null lists it (L5).
 */

import { BookOpen } from 'lucide-react'
import Link from 'next/link'

import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { BotonSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import {
  cargarHizoProximoPaso,
  cargarPersonaExplorar,
  sinProximoPasoSiLoHizo,
} from '@/lib/platform/talleres/explorar'
import {
  loadParticipanteActiveTalleres,
  loadParticipanteExplorar,
  requireExplorarViewer,
} from '@/lib/platform/talleres/participante'
import { refrescarEstadosEdiciones } from '@/lib/platform/talleres/refrescar-estados'

import { ExplorarTalleresClient } from './explorar-client'

export const metadata = {
  title: 'Explorar talleres',
}

const RUTA_MIS_TALLERES = '/talleres/mi-recorrido'

function Num({ children }: { children: number }) {
  return <strong className="font-mono font-semibold tabular-nums text-foreground">{children}</strong>
}

export default async function ExplorarTalleresPage() {
  const ctx = await requireExplorarViewer()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = ctx.supabase

  // T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — best
  // effort, unscoped (explorar spans every open taller). Runs before
  // loadParticipanteExplorar so its estados are never stale.
  await refrescarEstadosEdiciones(client)

  const [ediciones, inscripciones, persona, hizoProximoPaso] = await Promise.all([
    loadParticipanteExplorar(ctx),
    loadParticipanteActiveTalleres(ctx),
    cargarPersonaExplorar(client, ctx.personaId),
    cargarHizoProximoPaso(client, ctx.personaId),
  ])
  const estadoPorEdicion = new Map<string, 'pendiente' | 'aprobado'>()
  for (const inscripcion of inscripciones) {
    const estado = inscripcion.estado_inscripcion
    if (estado === 'pendiente' || estado === 'aprobado') estadoPorEdicion.set(inscripcion.id, estado)
  }
  const talleres = sinProximoPasoSiLoHizo(ediciones, hizoProximoPaso).map((edicion) => ({
    ...edicion,
    estado_inscripcion: estadoPorEdicion.get(edicion.id) ?? null,
  }))

  const cuantosTalleres = new Set(talleres.map((t) => t.slug || t.id)).size
  const pendientes = talleres.filter((t) => t.ya_inscrito && t.estado_inscripcion === 'pendiente').length
  const resumen =
    cuantosTalleres > 0 ? (
      <>
        <Num>{cuantosTalleres}</Num> {cuantosTalleres === 1 ? 'taller con inscripción abierta' : 'talleres con inscripción abierta'}
        {pendientes > 0 && (
          <>
            {' '}· tienes <Num>{pendientes}</Num>{' '}
            {pendientes === 1 ? 'solicitud esperando aprobación' : 'solicitudes esperando aprobación'}
          </>
        )}
      </>
    ) : (
      'No hay talleres con inscripción abierta en este momento.'
    )

  return (
    <PaginaSistema
      titulo="Explorar talleres"
      regreso={{ href: RUTA_MIS_TALLERES, texto: 'Mis talleres' }}
      acciones={
        <BotonSistema asChild variante="outline" tamaño="sm" icono={BookOpen}>
          <Link href={RUTA_MIS_TALLERES}>Mis talleres</Link>
        </BotonSistema>
      }
    >
      {/* Phones: back to Mis talleres, large title and the summary; from md the desktop header has them. */}
      <div className="-mt-2 grid gap-1">
        <BotonAtrasMovil atras={{ etiqueta: 'Mis talleres', href: RUTA_MIS_TALLERES }} className="-ml-2 justify-self-start md:hidden" />
        <TituloGrande nivel={2} titulo="Explorar talleres" resumen={resumen} />
        <p className="hidden text-[15px] text-muted-foreground md:block">{resumen}</p>
      </div>
      <ExplorarTalleresClient talleres={talleres} persona={persona} proximoPasoHecho={hizoProximoPaso === true} />
    </PaginaSistema>
  )
}
