"use client"

import { toast } from 'sonner'

export const useAppToast = () => {
  const success = (mensaje: string) => {
    toast.success('Éxito', { description: mensaje })
  }

  const error = (mensaje: string) => {
    toast.error('Error', { description: mensaje })
  }

  const info = (mensaje: string) => {
    toast.info('Información', { description: mensaje })
  }

  return { success, error, info }
}
