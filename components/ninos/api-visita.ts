/**
 * Browser side of POST /api/ninos/checkin and /api/ninos/checkout (N9).
 * Returns the same { data, error } shape as supabase.rpc so the screens keep
 * their error messages (mensajeDeErrorCheckin / mensajeDeErrorRetiro).
 */
type Resultado<T> = { data: T[] | null; error: { code?: string } | null }

async function postear<T>(ruta: string, body: unknown): Promise<Resultado<T>> {
  try {
    const res = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = (await res.json().catch(() => null)) as { filas?: T[]; error?: { code?: string } } | null
    if (!res.ok) return { data: null, error: json?.error ?? {} }
    return { data: json?.filas ?? [], error: null }
  } catch {
    return { data: null, error: {} }
  }
}

export type FilaIngreso = { nino_id: string; salon_id: string; codigo: string; ocupacion: number; capacidad: number; sobre_capacidad: boolean }

export const registrarIngresoApi = (body: { ninoIds: string[]; salonIds: string[]; turnoId: string; fecha: string }) =>
  postear<FilaIngreso>('/api/ninos/checkin', body)

export const registrarRetiroApi = (body: { codigo: string; turnoId: string; fecha: string; retiradoPor: string }) =>
  postear<{ nino_id: string; salon_id: string; salida_at: string }>('/api/ninos/checkout', body)
