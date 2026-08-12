/**
 * PR18 — DT-074 — /talleres/historial (RSC).
 *
 * Longitudinal history of every inscripcion ever — pending, approved,
 * completed, abandoned. Used for the participant's life-long record.
 *
 * Capability gate: participation.read.
 */

import { ContenedorDashboard, TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { Clock } from 'lucide-react'

import {
  loadParticipanteHistorial,
  requireParticipante,
} from '@/lib/platform/talleres/participante'

export const metadata = {
  title: 'Historial de Talleres',
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export default async function HistorialTalleresPage() {
  const ctx = await requireParticipante()
  const rows = await loadParticipanteHistorial(ctx)

  return (
    <ContenedorDashboard
      titulo="Historial de Talleres"
      botonRegreso={{ href: '/talleres/mis-talleres', texto: 'Mis Talleres' }}
    >
      <div className="grid gap-4">
        {rows.length === 0 ? (
          <TarjetaSistema variante="outlined" className="p-6 text-center">
            <TextoSistema variante="sutil">
              Aún no tienes inscripciones registradas.
            </TextoSistema>
          </TarjetaSistema>
        ) : (
          <ul className="grid gap-3">
            {rows.map((row) => (
              <li key={row.id}>
                <TarjetaSistema variante="outlined" className="p-4">
                  <div className="flex items-start gap-3">
                    <Clock className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <TextoSistema className="font-medium">{row.nombre}</TextoSistema>
                      <TextoSistema variante="sutil" className="mt-1 block text-sm">
                        Edición {row.edicion} · Inscripto el {formatDate(row.fecha_inscripcion)}
                      </TextoSistema>
                      {row.fecha_completitud && (
                        <TextoSistema variante="sutil" className="mt-1 block text-sm">
                          Completado el {formatDate(row.fecha_completitud)}
                        </TextoSistema>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <BadgeSistema
                          variante={
                            row.estado_inscripcion === 'completado'
                              ? 'success'
                              : row.estado_inscripcion === 'no_aprobado'
                                ? 'error'
                                : 'default'
                          }
                        >
                          {row.estado_inscripcion}
                        </BadgeSistema>
                        {row.unit_estado && (
                          <BadgeSistema variante="info">{row.unit_estado}</BadgeSistema>
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
