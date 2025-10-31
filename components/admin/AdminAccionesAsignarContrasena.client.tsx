"use client"

import { useState } from 'react'
import { TarjetaSistema, BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { SetPasswordModal } from '@/components/modals/SetPasswordModal'

export function AdminAccionesAsignarContrasena({ userAuthId }: { userAuthId: string | null }) {
  const [abierto, setAbierto] = useState(false)

  const sinCuentaAuth = !userAuthId

  return (
    <TarjetaSistema className="p-6 mb-6">
      <h3 className="text-xl font-bold text-gray-800 mb-2">Acciones de Administrador</h3>
      <TextoSistema variante="sutil" tamaño="sm" className="mb-4">
        Asignar una nueva contraseña al usuario seleccionado. Esta acción es irreversible y debe comunicarse de forma segura.
      </TextoSistema>

      <BotonSistema
        onClick={() => setAbierto(true)}
        disabled={sinCuentaAuth}
      >
        Asignar Nueva Contraseña
      </BotonSistema>

      {abierto && userAuthId && (
        <SetPasswordModal
          isOpen={abierto}
          onClose={() => setAbierto(false)}
          userId={userAuthId}
        />
      )}

      {sinCuentaAuth && (
        <TextoSistema variante="muted" tamaño="sm" className="mt-3">
          Este usuario no tiene una cuenta de autenticación asociada (auth_id nulo).
        </TextoSistema>
      )}
    </TarjetaSistema>
  )
}
