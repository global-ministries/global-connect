/**
 * What /mis-servicios/[planId] and /mis-servicios/fechas show when their
 * data cannot be read (odd/tasks/dps-asistencia-pco.md, T15c): the action's
 * message and the way back to Inicio. Server-safe.
 */
import type { ReactElement } from 'react'
import Link from 'next/link'
import { CalendarX } from 'lucide-react'

import { BotonAtrasMovil } from '@/components/ui/barra-navegacion-movil'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { BotonSistema, PaginaSistema } from '@/components/ui/sistema-diseno'

export function SinServicio({ titulo, mensaje }: { readonly titulo: string; readonly mensaje: string }): ReactElement {
  return (
    <PaginaSistema regreso={{ href: '/dashboard', texto: 'Inicio' }}>
      <BotonAtrasMovil atras={{ etiqueta: 'Inicio', href: '/dashboard' }} className="-mt-2 -ml-2 max-w-[160px] md:hidden" />
      <h1 className="text-[28px] font-bold leading-[1.1] tracking-[-0.03em] md:text-2xl md:font-[650] md:tracking-[-0.02em]">{titulo}</h1>
      <EstadoVacioSistema
        icono={CalendarX}
        titulo="No se pudo abrir"
        subtitulo={mensaje}
        accion={
          <BotonSistema asChild variante="outline">
            <Link href="/dashboard">Volver a Inicio</Link>
          </BotonSistema>
        }
      />
    </PaginaSistema>
  )
}
