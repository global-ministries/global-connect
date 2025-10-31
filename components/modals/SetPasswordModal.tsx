"use client"

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { InputSistema, BotonSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'

const esquema = z.object({
  nuevaContrasena: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  confirmarContrasena: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
}).refine((val) => val.nuevaContrasena === val.confirmarContrasena, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmarContrasena']
})

type Formulario = z.infer<typeof esquema>

function generarContrasenaSegura(longitud = 12) {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_+-='
  const array = new Uint32Array(longitud)
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(array)
  } else {
    for (let i = 0; i < longitud; i++) array[i] = Math.floor(Math.random() * alfabeto.length)
  }
  let out = ''
  for (let i = 0; i < longitud; i++) out += alfabeto[array[i] % alfabeto.length]
  return out
}

export function SetPasswordModal({ isOpen, onClose, userId }: { isOpen: boolean; onClose: () => void; userId: string }) {
  const toast = useNotificaciones()
  const [cargando, setCargando] = useState(false)

  const { register, handleSubmit, formState: { errors, isValid }, setValue } = useForm<Formulario>({
    resolver: zodResolver(esquema),
    mode: 'onChange'
  })

  const onSubmit = async (datos: Formulario) => {
    setCargando(true)
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: datos.nuevaContrasena })
      })
      const json = await res.json().catch(() => ({} as any))
      if (!res.ok) throw new Error(json?.error || 'No se pudo asignar la contraseña')
      toast.success('Contraseña asignada correctamente')
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Error al asignar la contraseña')
    } finally {
      setCargando(false)
    }
  }

  const generarYCompletar = () => {
    const pwd = generarContrasenaSegura(14)
    setValue('nuevaContrasena', pwd, { shouldValidate: true })
    setValue('confirmarContrasena', pwd, { shouldValidate: true })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar Nueva Contraseña</DialogTitle>
          <DialogDescription>
            <div className="space-y-2">
              <TextoSistema variante="sutil" tamaño="sm">
                ⚠️ Atención: Al cambiar la contraseña, el usuario perderá el acceso con su contraseña actual. Deberás comunicarle esta nueva contraseña de forma segura.
              </TextoSistema>
            </div>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <InputSistema
              type="password"
              label="Nueva Contraseña"
              placeholder="Ingresa una contraseña segura"
              error={errors.nuevaContrasena?.message}
              {...register('nuevaContrasena')}
            />
            <InputSistema
              type="password"
              label="Confirmar Contraseña"
              placeholder="Repite la contraseña"
              error={errors.confirmarContrasena?.message}
              {...register('confirmarContrasena')}
            />
          </div>

          <div className="flex items-center justify-between">
            <BotonSistema
              type="button"
              variante="outline"
              tamaño="sm"
              onClick={generarYCompletar}
              disabled={cargando}
            >
              Generar Contraseña Segura
            </BotonSistema>

            <div className="flex gap-2">
              <BotonSistema variante="ghost" onClick={onClose} disabled={cargando}>
                Cancelar
              </BotonSistema>
              <BotonSistema type="submit" cargando={cargando} disabled={cargando || !isValid}>
                Guardar Contraseña
              </BotonSistema>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
