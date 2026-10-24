"use client"

import Link from 'next/link'
import { TarjetaSistema, TituloSistema, TextoSistema, BotonSistema } from '@/components/ui/sistema-diseno'

interface PropsDashboardMiembro {
  data?: unknown
}

/**
 * The member dashboard. obtener_datos_dashboard sends a member no widgets yet, so this shows
 * only what is true for everyone: keeping one's own data up to date. No placeholder cards that
 * promise group, birthday or attendance data (odd/tasks/ninos-roles-ui.md F7).
 */
export default function DashboardMiembro(_props: PropsDashboardMiembro) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
      <div className="col-span-2">
        <TarjetaSistema className="p-3 md:p-4 lg:p-6 h-full">
          <TituloSistema nivel={3}>Mantén tus datos al día</TituloSistema>
          <TextoSistema variante="sutil" className="mt-2">
            Tu teléfono, tu dirección y tus datos de contacto ayudan a tu líder y a la iglesia a estar en contacto contigo.
          </TextoSistema>
          <div className="mt-4">
            <Link href="/perfil">
              <BotonSistema variante="primario" tamaño="sm">Ir a Mi Perfil</BotonSistema>
            </Link>
          </div>
        </TarjetaSistema>
      </div>
    </div>
  )
}
