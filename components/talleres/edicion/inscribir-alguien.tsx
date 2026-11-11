'use client'

/**
 * R3f (odd/tasks/talleres-rediseno.md, S1, S2) — «Inscribir a alguien»: the
 * edición's one primary action (artboard 12's header button, artboard 24's
 * FAB). Opens a DetalleResponsivo (side panel from md, bottom sheet below)
 * with the existing InscribirPersonaForm (search, Inscribir, «Inscribir
 * igual (sobre el cupo)»), whose actions check the permission again. The
 * page only renders it with aprobarInscripciones and a cohorte.
 */

import { useState, type ReactElement } from 'react'
import { UserPlus } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { InscribirPersonaForm, type InscribirPersonaFormProps } from '@/components/talleres/inscribir-persona-form'
import { useNotificaciones } from '@/hooks/use-notificaciones'

export function InscribirAlguien(props: Omit<InscribirPersonaFormProps, 'onInscrita'>): ReactElement {
  const [abierto, setAbierto] = useState(false)
  const toast = useNotificaciones()

  return (
    <>
      <BotonSistema type="button" icono={UserPlus} onClick={() => setAbierto(true)} className="hidden md:inline-flex">
        Inscribir a alguien
      </BotonSistema>
      <BotonFlotante icono={UserPlus} label="Inscribir a alguien" onClick={() => setAbierto(true)} />
      <DetalleResponsivo
        abierto={abierto}
        onCambioAbierto={setAbierto}
        titulo="Inscribir a alguien"
        descripcion="Busca a la persona por nombre, apellido o correo."
      >
        <InscribirPersonaForm
          {...props}
          onInscrita={() => {
            setAbierto(false)
            toast.success('Inscripción creada.')
          }}
        />
      </DetalleResponsivo>
    </>
  )
}
