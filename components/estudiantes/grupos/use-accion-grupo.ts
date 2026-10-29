'use client'

/**
 * Estudiantes › Grupos — runs one server action at a time from the drawer:
 * remembers which one is running (for `cargando` on its button) and shows
 * the toast, the success text or the Spanish error of the action.
 */
import { useCallback, useState } from 'react'

import { useNotificaciones } from '@/hooks/use-notificaciones'
import type { ResultadoGrupos } from '@/lib/actions/estudiantes-grupos.actions'

export interface AccionGrupo {
  /** The key of the running action; `null` when idle. */
  readonly pendiente: string | null
  /** Runs `llamada`; resolves to whether it worked. */
  readonly ejecutar: <T>(clave: string, llamada: () => Promise<ResultadoGrupos<T>>, exito: string | ((data: T) => string)) => Promise<boolean>
}

export function useAccionGrupo(): AccionGrupo {
  const toast = useNotificaciones()
  const [pendiente, setPendiente] = useState<string | null>(null)

  const ejecutar = useCallback(
    async <T,>(clave: string, llamada: () => Promise<ResultadoGrupos<T>>, exito: string | ((data: T) => string)): Promise<boolean> => {
      setPendiente(clave)
      try {
        const resultado = await llamada()
        if (!resultado.ok) {
          toast.error(resultado.message)
          return false
        }
        toast.success(typeof exito === 'function' ? exito(resultado.data) : exito)
        return true
      } catch {
        toast.error('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.')
        return false
      } finally {
        setPendiente(null)
      }
    },
    [toast],
  )

  return { pendiente, ejecutar }
}
