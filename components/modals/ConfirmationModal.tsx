"use client"

import { AlertTriangle, Loader2 } from "lucide-react"
import { BotonSistema, TarjetaSistema } from "@/components/ui/sistema-diseno"

interface ConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  isLoading?: boolean
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  isLoading = false,
}: ConfirmationModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative z-10 w-full max-w-md mx-auto px-4">
        <TarjetaSistema className="p-8 flex flex-col items-center gap-6">
          <AlertTriangle className="w-12 h-12 text-orange-500 mb-2" />
          <h2 className="text-xl font-bold text-foreground text-center">{title}</h2>
          <p className="text-muted-foreground text-center">{message}</p>
          <div className="flex gap-4 w-full mt-4">
            <BotonSistema
              type="button"
              variante="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancelar
            </BotonSistema>
            <BotonSistema
              type="button"
              variante="primario"
              className="flex-1 !bg-red-500 hover:!bg-red-600"
              onClick={onConfirm}
              disabled={isLoading}
              cargando={isLoading}
            >
              Confirmar Borrado
            </BotonSistema>
          </div>
        </TarjetaSistema>
      </div>
    </div>
  )
}
