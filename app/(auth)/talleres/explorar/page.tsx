/**
 * PR18 — DT-072 — /talleres/explorar (RSC).
 *
 * Lists talleres currently open for enrollment (`estado='abierto'` or
 * `estado='en_curso'`). Participants see each taller with a flag
 * indicating whether they're already inscribed. The inscribirse action
 * is exposed as a server action imported from `./actions.ts`.
 *
 * Capability gate: participation.read (via requireParticipante).
 */

import { ContenedorDashboard, TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { BookOpen } from 'lucide-react'

import {
  loadParticipanteExplorar,
  requireParticipante,
} from '@/lib/platform/talleres/participante'

export const metadata = {
  title: 'Explorar Talleres',
}

export default async function ExplorarTalleresPage() {
  const ctx = await requireParticipante()
  const talleres = await loadParticipanteExplorar(ctx)

  return (
    <ContenedorDashboard
      titulo="Explorar Talleres"
      botonRegreso={{ href: '/dashboard', texto: 'Inicio' }}
    >
      <div className="grid gap-4">
        <TarjetaSistema variante="outlined" className="p-4 sm:p-5">
          <TextoSistema variante="sutil">
            Estos talleres están abiertos para inscripción. Si ya estás
            inscripto/a en uno, el botón correspondiente estará deshabilitado.
          </TextoSistema>
        </TarjetaSistema>

        {talleres.length === 0 ? (
          <TarjetaSistema variante="outlined" className="p-6 text-center">
            <TextoSistema variante="sutil">
              No hay talleres abiertos en este momento.
            </TextoSistema>
          </TarjetaSistema>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {talleres.map((t) => (
              <li key={t.id}>
                <TarjetaSistema variante="elevated" className="p-4">
                  <div className="flex items-start gap-3">
                    <BookOpen className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <TextoSistema className="font-medium">{t.nombre}</TextoSistema>
                      <TextoSistema variante="sutil" className="mt-1 block text-sm">
                        Edición {t.edicion} · {t.tipo === 'pareja' ? 'Pareja' : 'Individual'}
                      </TextoSistema>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <BadgeSistema>{t.estado}</BadgeSistema>
                        {t.ya_inscrito && (
                          <BadgeSistema variante="success">Ya inscripto</BadgeSistema>
                        )}
                      </div>
                    </div>
                  </div>
                </TarjetaSistema>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ContenedorDashboard>
  )
}
