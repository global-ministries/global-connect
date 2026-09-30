'use client'

/**
 * Directores — the save contract of every change on the page.
 *
 * `guardar` shows the new value at once (an overlay over what the server
 * sent), disables the affected control while the server action runs, and on
 * failure removes the overlay so the previous value is back and the error goes
 * to the toast. On success it asks the router for fresh server data, and the
 * overlay is dropped as soon as that data arrives (`datosDelServidor`
 * changes), except for the saves still running, so nothing optimistic outlives
 * the truth and no pending choice flickers back.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useNotificaciones } from '@/hooks/use-notificaciones'

export interface ResultadoAccion {
  readonly success: boolean
  readonly error?: string
}

const ERROR_GENERICO = 'No se pudo guardar el cambio.'

export function useGuardarCambio(datosDelServidor: unknown) {
  const router = useRouter()
  const toast = useNotificaciones()
  const [pendientes, setPendientes] = useState<readonly string[]>([])
  const [valores, setValores] = useState<Readonly<Record<string, unknown>>>({})
  // Mirror of `pendientes` for the effect below, which must not re-run when it changes.
  const clavesPendientes = useRef<readonly string[]>([])

  useEffect(() => {
    // Keep the overlay of the saves still running: their own result settles them.
    setValores((actuales) => Object.fromEntries(Object.entries(actuales).filter(([clave]) => clavesPendientes.current.includes(clave))))
  }, [datosDelServidor])

  /** True while any change whose key starts with `prefijo` is being saved. */
  const pendiente = useCallback((prefijo: string): boolean => pendientes.some((clave) => clave.startsWith(prefijo)), [pendientes])

  /** The value being saved for `clave`, or the one the server sent. */
  const valor = useCallback(<T,>(clave: string, delServidor: T): T => (clave in valores ? (valores[clave] as T) : delServidor), [valores])

  const guardar = useCallback(
    async (clave: string, siguiente: unknown, accion: () => Promise<ResultadoAccion>, mensajeExito: string): Promise<boolean> => {
      clavesPendientes.current = [...clavesPendientes.current, clave]
      setPendientes((actuales) => [...actuales, clave])
      setValores((actuales) => ({ ...actuales, [clave]: siguiente }))

      let resultado: ResultadoAccion
      try {
        resultado = await accion()
      } catch {
        resultado = { success: false, error: ERROR_GENERICO }
      }

      clavesPendientes.current = clavesPendientes.current.filter((c) => c !== clave)
      setPendientes((actuales) => actuales.filter((c) => c !== clave))
      if (!resultado.success) {
        setValores(({ [clave]: _descartado, ...resto }) => resto)
        toast.error(resultado.error || ERROR_GENERICO)
        return false
      }
      toast.success(mensajeExito)
      router.refresh()
      return true
    },
    [router, toast],
  )

  return { pendiente, valor, guardar }
}
