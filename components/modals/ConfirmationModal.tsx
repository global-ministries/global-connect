"use client"

import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import React from "react"

// Usa un div con estilos glassmorphism en vez de GlassCard si no existe el componente
export function GlassCard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-2xl bg-white/60 backdrop-blur-md shadow-xl border border-white/30 ${className}`}
      style={{
        boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.15)",
        border: "1px solid rgba(255,255,255,0.18)",
      }}
    >
      {children}
    </div>
  )
}

interface ConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  isLoading?: boolean
  confirmLabel?: string
  // Si se pasa, el botón de confirmar será un submit de este formulario (server action)
  confirmFormAction?: (formData: FormData) => Promise<void> | void
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  isLoading = false,
  confirmLabel = "Confirmar Borrado",
  confirmFormAction,
}: ConfirmationModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="absolute inset-0 bg-white/20 backdrop-blur-[6px] pointer-events-none" />
      <div className="relative z-10 w-full max-w-md mx-auto">
        <GlassCard className="p-8 flex flex-col items-center gap-6">
          <AlertTriangle className="w-12 h-12 text-orange-500 mb-2" />
          <h2 className="text-xl font-bold text-gray-800 text-center">{title}</h2>
          <p className="text-gray-600 text-center">{message}</p>
          <div className="flex gap-4 w-full mt-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            {confirmFormAction ? (
              <form action={confirmFormAction} className="flex-1">
                <Button
                  type="submit"
                  variant="destructive"
                  className="w-full flex items-center justify-center"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {confirmLabel}
                </Button>
              </form>
            ) : (
              <Button
                type="button"
                variant="destructive"
                className="flex-1 flex items-center justify-center"
                onClick={onConfirm}
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {confirmLabel}
              </Button>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
