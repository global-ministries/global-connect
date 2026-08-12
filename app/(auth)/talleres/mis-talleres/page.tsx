/**
 * PR18 — DT-073 — /talleres/mis-talleres (RSC).
 *
 * Lists the participant's active inscripciones (pendiente | aprobado).
 * Each entry shows the taller summary + the inscripcion status. NO
 * administrative details, NO asistencia rows, NO motivos — summary
 * projection only (design §9).
 *
 * Capability gate: participation.read.
 */

import { ContenedorDashboard, TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { GraduationCap } from 'lucide-react'

import {
  loadParticipanteActiveTalleres,
  requireParticipante,
} from '@/lib/platform/talleres/participante'

export const metadata = {
  title: 'Mis Talleres',
}

export default async function MisTalleresPage() {
  const ctx = await requireParticipante()
  const talleres = await loadParticipanteActiveTalleres(ctx)

  return (
    <ContenedorDashboard
      titulo="Mis Talleres"
      botonRegreso={{ href: '/dashboard', texto: 'Inicio' }}
    >
      <div className="grid gap-4">
        {talleres.length === 0 ? (
          <TarjetaSistema variante="outlined" className="p-6 text-center">
            <TextoSistema variante="sutil">
              No tienes talleres activos. Visita{' '}
              <a href="/talleres/explorar" className="underline">
                Explorar
              </a>{' '}
              para ver los disponibles.
            </TextoSistema>
          </TarjetaSistema>
        ) : (
          <ul className="grid gap-4">
            {talleres.map((t) => (
              <li key={t.id}>
                <TarjetaSistema variante="elevated" className="p-4">
                  <div className="flex items-start gap-3">
                    <GraduationCap className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <TextoSistema className="font-medium">{t.nombre}</TextoSistema>
                      <TextoSistema variante="sutil" className="mt-1 block text-sm">
                        Edición {t.edicion} · {t.tipo === 'pareja' ? 'Pareja' : 'Individual'}
                      </TextoSistema>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <BadgeSistema>{t.estado_taller}</BadgeSistema>
                        <BadgeSistema variante={t.estado_inscripcion === 'aprobado' ? 'success' : 'default'}>
                          {t.estado_inscripcion}
                        </BadgeSistema>
                        {t.unit_estado && (
                          <BadgeSistema variante="info">{t.unit_estado}</BadgeSistema>
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
