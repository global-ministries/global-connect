'use client'

/**
 * Photo upload for Editar persona (decision 2 of S14): the same rules as the
 * legacy ProfilePhotoUploader (images only, up to 5 MB, optimized to JPEG
 * under the 1 MB Server Action limit) and the same actions
 * (uploadUserProfilePhoto / deleteUserProfilePhoto, gated by
 * puede_editar_usuario on the server). Saved at once, apart from the form.
 */
import { deleteUserProfilePhoto, uploadUserProfilePhoto } from '@/lib/actions/photo.actions'

const MAX_ORIGINAL = 5 * 1024 * 1024
const MAX_SUBIDA = 1024 * 1024
/** Longest side and JPEG quality, tried in order until the file fits. */
const PASOS: ReadonlyArray<readonly [number, number]> = [[800, 0.8], [600, 0.6], [300, 0.4]]

export type ResultadoFoto = { ok: true; url: string | null } | { ok: false; error: string }

function cargarImagen(archivo: Blob): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const img = document.createElement('img')
    const url = URL.createObjectURL(archivo)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolver(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      rechazar(new Error('No se pudo leer la imagen.'))
    }
    img.src = url
  })
}

/** Resizes to JPEG until it fits under 1 MB. */
export async function optimizarFoto(archivo: File): Promise<File> {
  if (archivo.size <= MAX_SUBIDA && archivo.type === 'image/jpeg') return archivo
  const img = await cargarImagen(archivo)
  for (const [lado, calidad] of PASOS) {
    const escala = Math.min(1, lado / Math.max(img.width, img.height))
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.round(img.width * escala)
    lienzo.height = Math.round(img.height * escala)
    lienzo.getContext('2d')?.drawImage(img, 0, 0, lienzo.width, lienzo.height)
    const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/jpeg', calidad))
    if (blob && blob.size <= MAX_SUBIDA) return new File([blob], archivo.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  }
  throw new Error('La imagen sigue siendo muy grande. Intenta con una foto más pequeña.')
}

export async function subirFoto(archivo: File, usuarioId: string): Promise<ResultadoFoto> {
  if (!archivo.type.startsWith('image/')) return { ok: false, error: 'Elige un archivo de imagen (JPG, PNG o WebP).' }
  if (archivo.size > MAX_ORIGINAL) return { ok: false, error: 'El archivo es demasiado grande. Máximo 5 MB.' }
  try {
    const datos = new FormData()
    datos.append('photo', await optimizarFoto(archivo))
    const r = await uploadUserProfilePhoto(datos, usuarioId)
    return r.success && r.photoUrl ? { ok: true, url: r.photoUrl } : { ok: false, error: r.error || 'No se pudo subir la foto.' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo subir la foto.' }
  }
}

export async function quitarFoto(usuarioId: string): Promise<ResultadoFoto> {
  try {
    const r = await deleteUserProfilePhoto(usuarioId)
    return r.success ? { ok: true, url: null } : { ok: false, error: r.error || 'No se pudo quitar la foto.' }
  } catch {
    return { ok: false, error: 'No se pudo quitar la foto.' }
  }
}
