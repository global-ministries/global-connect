/**
 * The one client call that changes people's role (admin only; the API
 * route decides). Used by the list's "Seleccionar" mode and the ficha's
 * Cuenta tab. Throws with the server's reason when the change is refused.
 */
export async function cambiarRolUsuarios(userIds: readonly string[], rol: string): Promise<void> {
  const res = await fetch('/api/usuarios/cambiar-rol', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userIds, rol }),
  })
  const json = (await res.json().catch(() => null)) as { error?: string } | null
  if (!res.ok) throw new Error(json?.error || 'No se pudo cambiar el rol.')
}
