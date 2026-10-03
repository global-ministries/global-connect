/**
 * PR10 — DT-039 — Public certificate verification page (UNAUTHENTICATED).
 *
 * Server component. Reads `params.codigo`, looks the certificate up
 * in-process through the shared public lookup (no HTTP hop to its own API,
 * so it does not depend on a configured base URL), renders ONLY
 * non-sensitive data: taller name, participant name, completion date,
 * signers.
 *
 * On failure (not-found or revoked) renders a friendly neutral message.
 * NEVER discloses PII (email, phone, cedula, group notes).
 */

import { buildQrSvg, buildVerificationUrl, type VerifiedCertificate } from '@/lib/platform/talleres/certificates'
import { verifyPublicCertificate } from '@/lib/platform/talleres/verificar-certificado'

interface PageProps {
  readonly params: Promise<{ readonly codigo: string }>
}

async function loadCertificate(codigo: string): Promise<VerifiedCertificate> {
  try {
    return await verifyPublicCertificate(codigo)
  } catch {
    // A visitor only ever sees the neutral message, never an error page.
    return { valid: false, reason: 'not-found' }
  }
}

export default async function VerificarCertificadoPage({ params }: PageProps) {
  const { codigo } = await params
  const result = await loadCertificate(codigo)
  // Only used to display the verification URL / QR, not to look anything up.
  const baseUrl = process.env['NEXT_PUBLIC_BASE_URL'] ?? process.env['VERCEL_URL'] ?? ''
  const verificationUrl = buildVerificationUrl(baseUrl, codigo)
  const qrSvg = buildQrSvg({ text: verificationUrl, size: 4 })

  return (
    <main style={{ padding: '2rem', maxWidth: '40rem', margin: '0 auto', fontFamily: 'system-ui' }}>
      <h1>Verificación de Certificado</h1>
      {result.valid === false ? (
        <section>
          <p style={{ color: '#b91c1c' }}>Certificado no encontrado o revocado.</p>
          <p>
            Si crees que es un error, contacta a la organización que emitió el certificado.
          </p>
        </section>
      ) : (
        <section data-testid="certificate-valid">
          <p style={{ color: '#15803d' }}>✓ Certificado válido</p>
          <dl>
            <dt>Taller</dt>
            <dd data-testid="taller-title">{result.taller_title}</dd>
            <dt>Participante</dt>
            <dd data-testid="participant-name">{result.participant_name}</dd>
            <dt>Fecha de completitud</dt>
            <dd data-testid="completion-date">{result.completion_date}</dd>
            <dt>Firmantes</dt>
            <dd>
              <ul>
                {result.signers.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </dd>
          </dl>
          <details>
            <summary>Código QR / URL de verificación</summary>
            <div
              role="img"
              aria-label="QR de verificación"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <code>{verificationUrl}</code>
          </details>
        </section>
      )}
    </main>
  )
}
