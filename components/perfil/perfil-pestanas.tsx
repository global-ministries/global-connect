'use client'

/**
 * Mi Perfil in tabs: "Mis datos" (the profile form), "Mi familia" (S15 of
 * odd/tasks/sistema-diseno-v2.md) and "Mis hijos" (odd/tasks/ninos-roles-ui.md
 * F3). Mis hijos used to sit below the whole form and its "Guardar cambios"
 * button, so it was hard to find and looked saved by it.
 *
 * The tab follows the address: `#mi-familia` opens Mi familia and `#mis-hijos`
 * (the dashboard card, the invitation and welcome emails, DESTINO_MIS_HIJOS)
 * opens Mis hijos; switching tabs rewrites the hash without a navigation. All
 * panels stay mounted, so switching never drops unsaved changes in the form.
 * Without Mi familia and Mis hijos there are no tabs; Mis hijos is missing for
 * an account under 18 (G8).
 */
import { useEffect, useState, type ReactNode } from 'react'

import { TabsContent, TabsList, TabsSistema, TabsTrigger } from '@/components/ui/TabsSistema'

type Pestana = 'datos' | 'familia' | 'hijos'

const HASHES: Record<Pestana, string> = { datos: '', familia: '#mi-familia', hijos: '#mis-hijos' }

interface Props {
  readonly datos: ReactNode
  readonly hijos: ReactNode | null
  readonly familia?: ReactNode
  /** Confirmed relatives and requests to answer, for the tab label ("Mi familia 2 · 1 nueva"). */
  readonly cuentaFamilia?: { readonly confirmados: number; readonly nuevas: number }
}

function pestanaDeLaDireccion(conFamilia: boolean, conHijos: boolean): Pestana {
  if (typeof window === 'undefined') return 'datos'
  if (conHijos && window.location.hash === HASHES.hijos) return 'hijos'
  if (conFamilia && window.location.hash === HASHES.familia) return 'familia'
  return 'datos'
}

export function PerfilPestanas({ datos, hijos, familia, cuentaFamilia }: Props) {
  const conFamilia = familia !== undefined && familia !== null
  const conHijos = hijos !== null
  // 'datos' on the server and the first client render; the hash is read after mounting.
  const [pestana, setPestana] = useState<Pestana>('datos')

  useEffect(() => {
    const sincronizar = () => setPestana(pestanaDeLaDireccion(conFamilia, conHijos))
    sincronizar()
    window.addEventListener('hashchange', sincronizar)
    return () => window.removeEventListener('hashchange', sincronizar)
  }, [conFamilia, conHijos])

  if (!conFamilia && !conHijos) return <>{datos}</>

  function cambiar(valor: string) {
    const siguiente: Pestana = valor === 'hijos' || valor === 'familia' ? valor : 'datos'
    setPestana(siguiente)
    const { pathname, search } = window.location
    window.history.replaceState(window.history.state, '', `${pathname}${search}${HASHES[siguiente]}`)
  }

  const nuevas = cuentaFamilia?.nuevas ?? 0
  const confirmados = cuentaFamilia?.confirmados ?? 0

  return (
    <TabsSistema value={pestana} onValueChange={cambiar}>
      <TabsList aria-label="Secciones de Mi Perfil" className="flex max-w-full justify-start overflow-x-auto [scrollbar-width:none] md:inline-flex">
        <TabsTrigger value="datos" className="shrink-0 whitespace-nowrap px-3.5">Mis datos</TabsTrigger>
        {conFamilia && (
          <TabsTrigger value="familia" className="shrink-0 gap-1.5 whitespace-nowrap px-3.5">
            Mi familia
            {confirmados > 0 && <span className="font-mono text-xs tabular-nums opacity-80">{confirmados}</span>}
            {nuevas > 0 && (
              <>
                <span aria-hidden="true" className="rounded-full bg-brand-strong px-1.5 py-px text-[11px] font-semibold text-white">
                  {nuevas === 1 ? '1 nueva' : `${nuevas} nuevas`}
                </span>
                <span className="sr-only">, {nuevas === 1 ? '1 solicitud por responder' : `${nuevas} solicitudes por responder`}</span>
              </>
            )}
          </TabsTrigger>
        )}
        {conHijos && <TabsTrigger value="hijos" className="shrink-0 whitespace-nowrap px-3.5">Mis hijos</TabsTrigger>}
      </TabsList>
      <TabsContent value="datos" forceMount hidden={pestana !== 'datos'}>
        {datos}
      </TabsContent>
      {conFamilia && (
        <TabsContent value="familia" forceMount hidden={pestana !== 'familia'}>
          {familia}
        </TabsContent>
      )}
      {conHijos && (
        <TabsContent value="hijos" forceMount hidden={pestana !== 'hijos'}>
          {hijos}
        </TabsContent>
      )}
    </TabsSistema>
  )
}
