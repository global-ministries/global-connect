"use client"

import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'

export const useNotificaciones = () => {
  const exito = useCallback((mensaje: string) => {
    toast.success('Éxito', { description: mensaje })
  }, [])

  const error = useCallback((mensaje: string) => {
    toast.error('Error', { description: mensaje })
  }, [])

  const info = useCallback((mensaje: string) => {
    toast.info('Información', { description: mensaje })
  }, [])

  return useMemo(() => ({ success: exito, error, info }), [exito, error, info])
}
