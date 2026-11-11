/**
 * T8 (odd/tasks/proximo-paso.md, design/proximo-paso 06 and 07 · 6) — who is
 * signed in on the public /proximo-paso, within a time bound like
 * tieneSesionAcotada: a missing client, a failed or a slow lookup all count
 * as signed out, so the page always renders. With a session, the person's
 * own ficha (usuarios by auth_id, under RLS) gives the id the inscripción
 * read needs and the first name of «Hola, …».
 */
import { LIMITE_SESION_MS } from '@/lib/auth/sesion-acotada'

type Respuesta = PromiseLike<{ data: unknown; error: unknown }>

export interface ClienteSesionProximoPaso {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> }
  from: (tabla: 'usuarios') => { select: (columnas: string) => { eq: (columna: string, valor: string) => { maybeSingle: () => Respuesta } } }
}

export interface SesionProximoPaso {
  readonly authId: string
  /** usuarios.id; null without a ficha yet (it is linked on enrolling). */
  readonly usuarioId: string | null
  readonly nombre: string | null
}

async function acotado<T>(promesa: PromiseLike<T>, porDefecto: T, limiteMs: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  const tiempoAgotado = new Promise<T>((resolve) => {
    temporizador = setTimeout(() => resolve(porDefecto), limiteMs)
  })
  try {
    return await Promise.race([Promise.resolve(promesa).then((v) => v, () => porDefecto), tiempoAgotado])
  } finally {
    clearTimeout(temporizador)
  }
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** The signed-in person, or null when signed out (or the lookup failed or was slow). */
export async function leerSesionProximoPaso(cliente: ClienteSesionProximoPaso | null, limiteMs = LIMITE_SESION_MS): Promise<SesionProximoPaso | null> {
  if (!cliente) return null
  const user = await acotado(
    cliente.auth.getUser().then(({ data }) => data?.user ?? null),
    null,
    limiteMs,
  )
  if (!user?.id) return null
  const ficha = await acotado(
    cliente.from('usuarios').select('id, nombre').eq('auth_id', user.id).maybeSingle(),
    { data: null, error: 'tiempo' },
    limiteMs,
  )
  const fila = !ficha.error && ficha.data && typeof ficha.data === 'object' ? (ficha.data as Record<string, unknown>) : null
  return { authId: user.id, usuarioId: texto(fila?.id), nombre: texto(fila?.nombre)?.split(/\s+/)[0] ?? null }
}
