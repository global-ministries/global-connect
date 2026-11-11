'use client'

/**
 * R3d (odd/tasks/talleres-rediseno.md, S1, S2, S4) — «Abrir edición» of the
 * v2 taller page (artboard design/talleres-interior/22 `#abrir`).
 *
 * One OpenEdicionForm per page, opened from several places (the desktop
 * header action, the phone actions, the empty ediciones list): the provider
 * owns the open state and mounts the form; `BotonAbrirEdicion` only opens it.
 * The page renders the provider only with permisos.abrirEdicion, the same gate
 * as before; without the provider the button renders nothing.
 *
 * The URL hash `#abrir` opens it on load (the artboard's state), so another
 * screen can deep-link to the panel.
 */

import { createContext, useContext, useState, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { Plus } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { OpenEdicionForm } from '@/components/talleres/open-edicion-form'

type PropsFormulario = Omit<ComponentProps<typeof OpenEdicionForm>, 'abierto' | 'onCambioAbierto'>

const AbrirEdicionContexto = createContext<(() => void) | null>(null)

export const HASH_ABRIR_EDICION = '#abrir'

export function AbrirEdicionProvider({
  formulario,
  children,
}: {
  readonly formulario: PropsFormulario
  readonly children: ReactNode
}): ReactElement {
  // DetalleResponsivo renders nothing on the server and while hydrating, so reading the hash here cannot mismatch.
  const [abierto, setAbierto] = useState(
    () => typeof window !== 'undefined' && window.location.hash === HASH_ABRIR_EDICION,
  )

  function cambiar(siguiente: boolean): void {
    setAbierto(siguiente)
    if (!siguiente && window.location.hash === HASH_ABRIR_EDICION) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
    }
  }

  return (
    <AbrirEdicionContexto.Provider value={() => cambiar(true)}>
      {children}
      <OpenEdicionForm {...formulario} abierto={abierto} onCambioAbierto={cambiar} />
    </AbrirEdicionContexto.Provider>
  )
}

export function BotonAbrirEdicion({
  className,
  variante = 'primario',
}: {
  readonly className?: string
  readonly variante?: 'primario' | 'outline'
}): ReactElement | null {
  const abrir = useContext(AbrirEdicionContexto)
  if (!abrir) return null
  return (
    <BotonSistema
      type="button"
      variante={variante}
      tamaño="sm"
      icono={Plus}
      onClick={abrir}
      aria-haspopup="dialog"
      className={className}
    >
      Abrir edición
    </BotonSistema>
  )
}
