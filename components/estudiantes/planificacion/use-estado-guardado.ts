'use client'

/**
 * Estudiantes — the autosave status of a marking screen (S5 of
 * odd/tasks/estudiantes-estilo-dps.md; patterns.md › Inline edit and
 * autosave): "Guardando…" while any save is in flight, "Guardado" once the
 * last one answers, "No se pudo guardar" after a failure (the caller rolls
 * the change back and shows the error toast). It replaces the toast of each
 * mark. Feeds `EstadoGuardado` (components/dps/estado-guardado.tsx).
 */
import { useCallback, useRef, useState } from 'react'

import type { EstadoGuardadoValor } from '@/components/dps/estado-guardado'

export function useEstadoGuardado(): {
  readonly estado: EstadoGuardadoValor
  readonly empezar: () => void
  readonly terminar: (ok: boolean) => void
} {
  const [estado, setEstado] = useState<EstadoGuardadoValor>('inactivo')
  const enVuelo = useRef(0)

  const empezar = useCallback(() => {
    enVuelo.current += 1
    setEstado('guardando')
  }, [])

  const terminar = useCallback((ok: boolean) => {
    enVuelo.current = Math.max(0, enVuelo.current - 1)
    if (!ok) setEstado('error')
    else if (enVuelo.current === 0) setEstado((actual) => (actual === 'error' ? actual : 'guardado'))
  }, [])

  return { estado, empezar, terminar }
}
