/**
 * PR10 — DT-039 — Public certificate verification page (UNAUTHENTICATED).
 *
 * Server component. Reads `params.codigo`, fetches the verification
 * result via the public API route, renders ONLY non-sensitive data:
 * taller name, participant name, completion date, signers.
 *
 * On failure (not-found or revoked) renders a friendly neutral message.
 * NEVER discloses PII (email, phone, cedula, group notes).
 */

import { buildQrSvg, buildVerificationUrl, isValidCertificateCode, type VerifiedCertificate } from '@/lib/platform/talleres/certificates'

interface PageProps {
  readonly params: Promise<{ readonly codigo: string }>
}

async function fetchCertificate(codigo: string, baseUrl: string): Promise<VerifiedCertificate> {
  if (!isValidCertificateCode(codigo)) {
    return { valid: false, reason: 'not-found' }
  }
  try {
    const r = await fetch(`${baseUrl}/api/public/verificar-certificado/${codigo}`, {
      cache: 'no-store',
    })
    if (r.status === 404) return { valid: false, reason: 'not-found' }
    if (!r.ok) return { valid: false, reason: 'not-found' }
    const data = (await r.json()) as Partial<VerifiedCertificate> & { revoked?: boolean }
    if (data.revoked) return { valid: false, reason: 'revoked' }
    if (data.valid === false) return { valid: false, reason: 'not-found' }
    if (
      data.valid === true &&
      typeof data.taller_title === 'string' &&
      typeof data.participant_name === 'string' &&
      typeof data.completion_date === 'string' &&
      Array.isArray(data.signers)
    ) {
      return {
        valid: true,
        taller_title: data.taller_title,
        participant_name: data.participant_name,
        completion_date: data.completion_date,
        signers: data.signers as readonly string[],
      }
    }
    return { valid: false, reason: 'not-found' }
  } catch {
    return { valid: false, reason: 'not-found' }
  }
}

export default async function VerificarCertificadoPage({ params }: PageProps) {
  const { codigo } = await params
  const baseUrl = process.env['NEXT_PUBLIC_BASE_URL'] ?? process.env['VERCEL_URL'] ?? ''
  const result = await fetchCertificate(codigo, baseUrl)
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
