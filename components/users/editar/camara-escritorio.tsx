'use client'

/**
 * The computer's camera for the profile photo (the legacy
 * ProfilePhotoUploader's "Usar cámara"): the front camera in a dialog,
 * "Tomar foto" captures a JPEG. The stream stops when the dialog closes.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema } from '@/components/ui/sistema-diseno'

function mensajeDeError(e: unknown): string {
  const nombre = e instanceof Error ? e.name : ''
  if (nombre === 'NotAllowedError') return 'Permite el acceso a la cámara en tu navegador.'
  if (nombre === 'NotFoundError') return 'No se encontró ninguna cámara en este equipo.'
  if (nombre === 'NotReadableError') return 'La cámara está siendo usada por otra aplicación.'
  return 'No se pudo abrir la cámara. Usa «Subir una foto».'
}

const SIN_CAMARA = 'Tu navegador no permite usar la cámara. Usa «Subir una foto».'

/** Older or insecure (http) contexts have no mediaDevices. */
const hayCamara = (): boolean => typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'

export function CamaraEscritorio({ abierta, onCerrar, onFoto }: {
  readonly abierta: boolean
  readonly onCerrar: () => void
  readonly onFoto: (archivo: File) => void
}): ReactElement {
  return (
    <Dialog open={abierta} onOpenChange={(a) => !a && onCerrar()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Tomar foto</DialogTitle>
          <DialogDescription>Mira a la cámara con buena luz y pulsa «Tomar foto».</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open: a fresh stream and state each time. */}
        {abierta && <VistaCamara onCerrar={onCerrar} onFoto={onFoto} />}
      </DialogContent>
    </Dialog>
  )
}

function VistaCamara({ onCerrar, onFoto }: { readonly onCerrar: () => void; readonly onFoto: (archivo: File) => void }): ReactElement {
  const video = useRef<HTMLVideoElement>(null)
  const [lista, setLista] = useState(false)
  const [error, setError] = useState<string | null>(() => (hayCamara() ? null : SIN_CAMARA))

  useEffect(() => {
    if (!hayCamara()) return
    let cancelado = false
    let flujo: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }, audio: false })
      .then((s) => {
        flujo = s
        if (cancelado) return s.getTracks().forEach((t) => t.stop())
        if (video.current) video.current.srcObject = s
      })
      .catch((e) => !cancelado && setError(mensajeDeError(e)))
    return () => {
      cancelado = true
      flujo?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const capturar = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const lienzo = document.createElement('canvas')
    lienzo.width = v.videoWidth
    lienzo.height = v.videoHeight
    lienzo.getContext('2d')?.drawImage(v, 0, 0)
    lienzo.toBlob((blob) => blob && onFoto(new File([blob], 'camara.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.85)
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-muted">
        <video ref={video} autoPlay playsInline muted onLoadedData={() => setLista(true)} className="aspect-square w-full -scale-x-100 object-cover" />
      </div>
      {error && <p role="alert" className="text-[13px] text-danger-text">{error}</p>}
      <DialogFooter>
        <BotonSistema type="button" variante="outline" onClick={onCerrar}>
          Cancelar
        </BotonSistema>
        <BotonSistema type="button" onClick={capturar} disabled={!lista}>
          Tomar foto
        </BotonSistema>
      </DialogFooter>
    </>
  )
}
