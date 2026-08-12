/**
 * PR18 — DT-075 — /talleres/certificados/[id] (RSC).
 *
 * Single certificado detail. The participant can download/view the
 * certificate. Verifies ownership (persona_id) at the helper layer —
 * deny-by-default. Public verification at
 * /verificar-certificado/[codigo] is a separate page (PR10).
 *
 * Capability gate: participation.read.
 */

import Link from 'next/link'

import { ContenedorDashboard, TarjetaSistema, TextoSistema, BadgeSistema } from '@/components/ui/sistema-diseno'
import { Award, ExternalLink } from 'lucide-react'

import {
  loadParticipanteCertificado,
  requireParticipante,
} from '@/lib/platform/talleres/participante'

export const metadata = {
  title: 'Certificado',
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

interface RouteContext {
  readonly params: Promise<{ readonly id: string }>
}

export default async function CertificadoDetailPage(ctx: RouteContext) {
  const participant = await requireParticipante()
  const { id } = await ctx.params
  const cert = await loadParticipanteCertificado(participant, id)

  return (
    <ContenedorDashboard
      titulo="Certificado"
      botonRegreso={{ href: '/talleres/certificados', texto: 'Mis Certificados' }}
    >
      {!cert ? (
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">
            El certificado solicitado no existe o no te pertenece.
          </TextoSistema>
        </TarjetaSistema>
      ) : (
        <TarjetaSistema variante="elevated" className="p-6">
          <div className="flex items-start gap-3">
            <Award className="mt-0.5 h-6 w-6 text-primary" />
            <div className="flex-1">
              <TextoSistema className="text-xl font-semibold">
                {cert.nombre_taller_snapshot}
              </TextoSistema>
              <TextoSistema variante="sutil" className="mt-1 block">
                Completado el {formatDate(cert.fecha_completitud)}
              </TextoSistema>
              <div className="mt-3 flex flex-wrap gap-2">
                {cert.revocado_at ? (
                  <BadgeSistema variante="error">Revocado</BadgeSistema>
                ) : (
                  <BadgeSistema variante="success">Vigente</BadgeSistema>
                )}
              </div>
              <div className="mt-4 rounded border bg-muted/30 p-3 text-sm">
                <TextoSistema variante="sutil">Código de verificación</TextoSistema>
                <code className="mt-1 block break-all font-mono text-base">
                  {cert.codigo_verificacion}
                </code>
              </div>
              <Link
                href={`/verificar-certificado/${cert.codigo_verificacion}`}
                className="mt-4 inline-flex items-center gap-1.5 text-sm underline"
              >
                <ExternalLink className="h-4 w-4" />
                Verificar públicamente
              </Link>
            </div>
          </div>
        </TarjetaSistema>
      )}
    </ContenedorDashboard>
  )
}
