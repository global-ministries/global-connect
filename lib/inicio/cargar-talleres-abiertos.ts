/**
 * How many talleres the person can enroll in, for the Talleres tile of
 * «Explorar» (odd/tasks/home-por-rol.md S15). The cheap part of
 * /talleres/explorar: its first query (loadParticipanteExplorar in
 * lib/platform/talleres/participante.ts, ediciones `abierto` or `en_curso`
 * under the session's RLS), without the Próximo Paso taller for who already
 * did it (sinProximoPasoSiLoHizo), counted by taller as its summary line.
 *
 * null when it cannot be known (Talleres off, a failure or a time-out): the
 * tile then says «Ver talleres».
 */
import { sinProximoPasoSiLoHizo } from '@/lib/platform/talleres/explorar'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'

import { intentar } from './cargar-a-cargo'
import type { ClienteInicio } from './cargar-hechos'

const ESTADOS_ABIERTOS = ['abierto', 'en_curso']

type Respuesta = { data: unknown; error: { message?: string } | null }
type ConsultaEdiciones = { select: (columnas: string) => { in: (columna: string, valores: string[]) => PromiseLike<Respuesta> } }

export async function cargarTalleresAbiertos(supabase: ClienteInicio, { hizoProximoPaso }: { hizoProximoPaso: boolean | null }): Promise<number | null> {
  if (!isTalleresEnabled()) return null
  return intentar<number | null>(
    'talleres con inscripción abierta',
    async () => {
      const ediciones = supabase.from('taller_ediciones') as unknown as ConsultaEdiciones
      const { data, error } = await ediciones.select('id, taller:talleres!taller_id(slug)').in('estado', ESTADOS_ABIERTOS)
      if (error) throw new Error(error.message ?? 'error de Supabase')
      const filas = (Array.isArray(data) ? data : []).flatMap((f: unknown) => {
        const fila = typeof f === 'object' && f !== null ? (f as { id?: unknown; taller?: { slug?: unknown } | null }) : null
        if (!fila || typeof fila.id !== 'string') return []
        return [{ id: fila.id, slug: typeof fila.taller?.slug === 'string' ? fila.taller.slug : '' }]
      })
      return new Set(sinProximoPasoSiLoHizo(filas, hizoProximoPaso).map((t) => t.slug || t.id)).size
    },
    null,
  )
}
