'use client'

import { useActionState, useEffect, useRef, useState } from 'react'

import { createSupportTicketFromForm } from '@/lib/actions/support.actions'
import { BotonSistema, InputSistema, TextareaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { SupportTicketDiagnosticsFields } from './support-ticket-diagnostics-fields'

type UploadStatus = 'idle' | 'uploading' | 'finalizing' | 'uploaded' | 'failed'
type AttachmentUpload = { clientId: string; name: string; status: UploadStatus; progress: number; error?: string; attachmentId?: string; uploadUrl?: string }
type IntentAttachment = { id: string; uploadUrl: string }

export function SupportTicketCreateForm({ appBuildVersion }: { appBuildVersion: string }) {
  const [state, formAction, isPending] = useActionState(createSupportTicketFromForm, null)
  const [files, setFiles] = useState<File[]>([])
  const [uploads, setUploads] = useState<AttachmentUpload[]>([])
  const uploadStartedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!state?.success || uploadStartedFor.current === state.ticketId) return
    uploadStartedFor.current = state.ticketId
    if (files.length === 0) return
    void uploadFiles(state.ticketId, files)
  }, [files, state])

  const uploadFiles = async (ticketId: string, selectedFiles: File[]) => {
    for (const [index, file] of selectedFiles.entries()) {
      const upload = uploads[index]
      if (!upload) continue
      await uploadFile(ticketId, file, upload)
    }
  }

  const uploadFile = async (ticketId: string, file: File, upload: AttachmentUpload) => {
    try {
      const intent = await createAttachmentIntent(ticketId, file, upload.attachmentId)
      updateUpload(upload.clientId, { status: 'uploading', progress: 0, error: undefined, attachmentId: intent.id, uploadUrl: intent.uploadUrl })
      await uploadToR2(intent.uploadUrl, file, (progress) => updateUpload(upload.clientId, { progress }))
      updateUpload(upload.clientId, { status: 'finalizing', progress: 100 })
      await finalizeAttachment(intent.id)
      updateUpload(upload.clientId, { status: 'uploaded', progress: 100 })
    } catch (error) {
      updateUpload(upload.clientId, { status: 'failed', error: error instanceof Error ? error.message : 'No se pudo subir el adjunto' })
    }
  }

  const retryUpload = (clientId: string) => {
    if (!state?.success) return
    const uploadIndex = uploads.findIndex((upload) => upload.clientId === clientId)
    const upload = uploads[uploadIndex]
    const file = files[uploadIndex]
    if (!upload || !file || !shouldCreateFreshAttachmentIntent(upload)) return
    void uploadFile(state.ticketId, file, upload)
  }

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? [])
    setFiles(selectedFiles)
    setUploads(createAttachmentUploadItems(selectedFiles))
    uploadStartedFor.current = null
  }

  const statusText = uploads.length === 0
    ? 'Esperando envio del ticket para iniciar adjuntos.'
    : uploads.map((upload) => `${upload.name}: ${formatUploadStatus(upload)}`).join(' | ')

  return (
    <form action={formAction} className="space-y-5">
      <InputSistema name="subject" label="Asunto" minLength={5} maxLength={160} required placeholder="Ejemplo: No puedo abrir el mapa del grupo" />
      <TextareaSistema name="description" label="Descripcion" filas={6} minLength={10} maxLength={8000} required placeholder="Cuentanos que ocurrio, que esperabas y como reproducirlo." />
      <label className="space-y-2 text-sm font-medium text-foreground">
        <span>Categoria</span>
        <select name="category" defaultValue="bug" className="block w-full min-h-[44px] rounded-xl border border-border bg-card/50 px-3 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20">
          <option value="bug">Error</option><option value="access">Acceso</option><option value="data">Datos</option><option value="other">Otro</option>
        </select>
      </label>
      <label className="space-y-2 text-sm font-medium text-foreground">
        <span>Adjuntos</span>
        <input type="file" multiple accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime" onChange={handleFiles} className="block w-full min-h-[44px] rounded-xl border border-border bg-card/50 px-3 py-3 text-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--brand-primary)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]/20" />
      </label>
      <SupportTicketDiagnosticsFields appBuildVersion={appBuildVersion} />
      <TextoSistema variante="muted" tamaño="sm">Recopilamos diagnosticos tecnicos seguros automaticamente: ruta sin parametros, navegador, sistema operativo, viewport, version de la app y referencia de Sentry. Nunca recopilamos cookies, contrasenas, localStorage, payloads sin procesar, URLs firmadas ni claves de objetos.</TextoSistema>
      <TextoSistema variante="muted" tamaño="sm">Sube hasta 5 capturas PNG/JPG/WebP de 10MB o menos y hasta 1 video MP4/WebM/MOV de 100MB o menos. El total por ticket no puede superar 150MB.</TextoSistema>
      <div data-testid="support-attachment-status" className="rounded-xl border border-border bg-card/50 p-3 text-sm text-muted-foreground" aria-live="polite">
        {statusText}
        {uploads.filter((upload) => upload.status === 'failed').map((upload) => (
          <button key={upload.clientId} type="button" onClick={() => retryUpload(upload.clientId)} className="ml-3 font-medium text-[var(--brand-primary)]">Reintentar {upload.name}</button>
        ))}
      </div>
      {state && !state.success && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state?.success && <TextoSistema variante="muted" tamaño="sm">Ticket #{state.ticketNumber} creado. Los adjuntos finalizados quedan asociados al ticket de forma privada.</TextoSistema>}
      <BotonSistema type="submit" disabled={isPending}>{isPending ? 'Enviando...' : 'Enviar ticket'}</BotonSistema>
    </form>
  )

  function updateUpload(clientId: string, patch: Partial<AttachmentUpload>) {
    setUploads((currentUploads) => currentUploads.map((upload) => upload.clientId === clientId ? { ...upload, ...patch } : upload))
  }
}

export function createAttachmentUploadItems(files: File[]): AttachmentUpload[] {
  return files.map((file, index) => ({ clientId: `${file.name}:${file.size}:${file.type}:${index}`, name: file.name, status: 'idle', progress: 0 }))
}

export function shouldCreateFreshAttachmentIntent(upload: AttachmentUpload) {
  return upload.status === 'failed'
}

export function buildAttachmentIntentRequestBody(ticketId: string, file: File, replaceAttachmentId?: string) {
  return {
    ticketId,
    ...(replaceAttachmentId ? { replaceAttachmentId } : {}),
    files: [{ filename: file.name, contentType: file.type, byteSize: file.size }],
  }
}

async function createAttachmentIntent(ticketId: string, file: File, replaceAttachmentId?: string): Promise<IntentAttachment> {
  const response = await fetch('/api/support/attachments/intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildAttachmentIntentRequestBody(ticketId, file, replaceAttachmentId)),
  })
  const body: unknown = await response.json()
  if (!response.ok) throw new Error(readError(body, 'No se pudo autorizar el adjunto'))
  const attachments = parseIntentAttachments(body)
  if (attachments.length !== 1) throw new Error('Respuesta de adjunto invalida')
  return attachments[0]
}

function uploadToR2(uploadUrl: string, file: File, onProgress: (progress: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', uploadUrl)
    request.setRequestHeader('content-type', file.type)
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress(Math.round((event.loaded / event.total) * 100))
    }
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error('No se pudo subir el adjunto privado'))
    request.onerror = () => reject(new Error('No se pudo subir el adjunto privado'))
    request.send(file)
  })
}

async function finalizeAttachment(attachmentId: string) {
  const response = await fetch('/api/support/attachments/finalize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ attachmentId }),
  })
  const body: unknown = await response.json()
  if (!response.ok) throw new Error(readError(body, 'No se pudo finalizar el adjunto'))
}

function parseIntentAttachments(body: unknown): IntentAttachment[] {
  if (!isRecord(body) || !Array.isArray(body.attachments)) return []
  return body.attachments.filter(isIntentAttachment)
}

function isIntentAttachment(value: unknown): value is IntentAttachment {
  return isRecord(value) && typeof value.id === 'string' && typeof value.uploadUrl === 'string'
}

function readError(body: unknown, fallback: string) {
  return isRecord(body) && typeof body.error === 'string' ? body.error : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function formatUploadStatus(upload: AttachmentUpload) {
  if (upload.status === 'idle') return 'esperando envio'
  if (upload.status === 'uploading') return `subiendo ${upload.progress}%`
  if (upload.status === 'finalizing') return 'finalizando'
  if (upload.status === 'uploaded') return 'finalizado'
  return `fallo${upload.error ? ` (${upload.error})` : ''}`
}
