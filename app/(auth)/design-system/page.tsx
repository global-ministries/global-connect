import { notFound } from 'next/navigation'

import { PaginaSistema } from '@/components/ui/sistema-diseno'
import { GaleriaSistema } from '@/components/ui/galeria-sistema'

export const metadata = { title: 'Sistema de diseño' }

/**
 * Gallery of the design system v2 pieces (docs/design-system/README.md#gallery).
 * Review tool for local and preview deployments only: in production it does
 * not exist. It sits under (auth), so previews still require a login.
 */
export default function DesignSystemPage() {
  if (process.env.VERCEL_ENV === 'production') notFound()

  return (
    <PaginaSistema
      titulo="Sistema de diseño"
      descripcion="Cada pieza del sistema de diseño v2 con datos de ejemplo. Solo en local y previews."
    >
      <GaleriaSistema />
    </PaginaSistema>
  )
}
