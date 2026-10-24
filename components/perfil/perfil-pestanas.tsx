'use client'

/**
 * Mi Perfil in two tabs, "Mis datos" (the profile form) and "Mis hijos"
 * (odd/tasks/ninos-roles-ui.md F3). Mis hijos used to sit below the whole form and its
 * "Guardar cambios" button, so it was hard to find and looked saved by it.
 *
 * The tab follows the address: `#mis-hijos` (the dashboard card, the invitation and
 * welcome emails, DESTINO_MIS_HIJOS) opens Mis hijos, and switching tabs rewrites the
 * hash without a navigation. Both panels stay mounted, so switching never drops unsaved
 * changes in the form. Without Mis hijos (an account under 18, G8) there are no tabs.
 */
import { useEffect, useState, type ReactNode } from 'react'

import { TabsContent, TabsList, TabsSistema, TabsTrigger } from '@/components/ui/TabsSistema'

const HASH_MIS_HIJOS = '#mis-hijos'

type Pestana = 'datos' | 'hijos'

interface Props {
  readonly datos: ReactNode
  readonly hijos: ReactNode | null
}

function pestanaDeLaDireccion(): Pestana {
  return typeof window !== 'undefined' && window.location.hash === HASH_MIS_HIJOS ? 'hijos' : 'datos'
}

export function PerfilPestanas({ datos, hijos }: Props) {
  // 'datos' on the server and the first client render; the hash is read after mounting.
  const [pestana, setPestana] = useState<Pestana>('datos')

  useEffect(() => {
    const sincronizar = () => setPestana(pestanaDeLaDireccion())
    sincronizar()
    window.addEventListener('hashchange', sincronizar)
    return () => window.removeEventListener('hashchange', sincronizar)
  }, [])

  if (hijos === null) return <>{datos}</>

  function cambiar(valor: string) {
    const siguiente: Pestana = valor === 'hijos' ? 'hijos' : 'datos'
    setPestana(siguiente)
    const { pathname, search } = window.location
    window.history.replaceState(window.history.state, '', siguiente === 'hijos' ? `${pathname}${search}${HASH_MIS_HIJOS}` : `${pathname}${search}`)
  }

  return (
    <TabsSistema value={pestana} onValueChange={cambiar}>
      <TabsList aria-label="Secciones de Mi Perfil">
        <TabsTrigger value="datos">Mis datos</TabsTrigger>
        <TabsTrigger value="hijos">Mis hijos</TabsTrigger>
      </TabsList>
      <TabsContent value="datos" forceMount hidden={pestana !== 'datos'}>
        {datos}
      </TabsContent>
      <TabsContent value="hijos" forceMount hidden={pestana !== 'hijos'}>
        {hijos}
      </TabsContent>
    </TabsSistema>
  )
}
