/**
 * QR poster for the public pre-registration (N8): the URL it encodes and the
 * QR rendered server-side as an SVG string (qrcode, no client JS).
 */
import QRCode from 'qrcode'

export function urlBaseCartel(env: { NEXT_PUBLIC_SITE_URL?: string }, origen: string): string {
  return (env.NEXT_PUBLIC_SITE_URL || origen).replace(/\/+$/, '')
}

export function urlRegistro(base: string, campusId: string | null): string {
  const url = `${base.replace(/\/+$/, '')}/ninos/registro`
  return campusId ? `${url}?campus=${encodeURIComponent(campusId)}` : url
}

export function qrSvg(texto: string): Promise<string> {
  return QRCode.toString(texto, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 })
}
