/**
 * Whether a visitor of a public page is signed in, answered within a time bound.
 * Public pages (the /ninos/registro QR page) must always render, so a missing
 * client, a failed lookup or a slow one all count as "signed out".
 */
type ClienteSesion = {
  auth: { getUser: () => Promise<{ data: { user: unknown } }> }
}

export const LIMITE_SESION_MS = 1500

export async function tieneSesionAcotada(cliente: ClienteSesion | null, limiteMs = LIMITE_SESION_MS): Promise<boolean> {
  if (!cliente) return false
  let temporizador: ReturnType<typeof setTimeout> | undefined
  const tiempoAgotado = new Promise<false>((resolve) => {
    temporizador = setTimeout(() => resolve(false), limiteMs)
  })
  const consulta = cliente.auth.getUser().then(
    ({ data }) => Boolean(data?.user),
    () => false,
  )
  try {
    return await Promise.race([consulta, tiempoAgotado])
  } finally {
    clearTimeout(temporizador)
  }
}
