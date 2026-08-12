/**
 * PR18 — Index of /talleres/certificados — list page.
 *
 * Shows the participant's certificados (newest first). Each entry
 * links to the detail page at /talleres/certificados/[id].
 *
 * Capability gate: participation.read.
 */

import Link from 'next/link'

import { ContenedorDashboard, TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { Award } from 'lucide-react'

import {
  loadParticipanteCertificados,
  requireParticipante,
} from '@/lib/platform/talleres/participante'

export const metadata = {
  title: 'Mis Certificados',
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export default async function CertificadosIndexPage() {
  const ctx = await requireParticipante()
  const certificados = await loadParticipanteCertificados(ctx)

  return (
    <ContenedorDashboard
      titulo="Mis Certificados"
      botonRegreso={{ href: '/talleres/mis-talleres', texto: 'Mis Talleres' }}
    >
      {certificados.length === 0 ? (
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">
            Aún no tienes certificados emitidos.
          </TextoSistema>
        </TarjetaSistema>
      ) : (
        <ul className="grid gap-3">
          {certificados.map((cert) => (
            <li key={cert.id}>
              <Link href={`/talleres/certificados/${cert.id}`} className="block">
                <TarjetaSistema variante="elevated" className="p-4 transition hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <Award className="mt-0.5 h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <TextoSistema className="font-medium">
                        {cert.nombre_taller_snapshot}
                      </TextoSistema>
                      <TextoSistema variante="sutil" className="mt-1 block text-sm">
                        Completado el {formatDate(cert.fecha_completitud)}
                      </TextoSistema>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {cert.revocado_at ? (
                          <BadgeSistema variante="error">Revocado</BadgeSistema>
                        ) : (
                          <BadgeSistema variante="success">Vigente</BadgeSistema>
                        )}
                      </div>
                    </div>
                  </div>
                </TarjetaSistema>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ContenedorDashboard>
  )
}
