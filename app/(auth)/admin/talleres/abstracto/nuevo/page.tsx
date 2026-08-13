/**
 * PR23.1 — /admin/talleres/abstracto/nuevo.
 *
 * Direct page for creating a taller abstracto. The form is the
 * same client component used on the index page.
 */

import { ContenedorDashboard, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { CrearTallerAbstractoForm } from './crear-form'

export const metadata = { title: 'Crear Grupo de Corto Plazo' }

export default function CrearTallerAbstractoPage() {
  return (
    <ContenedorDashboard
      titulo="Crear Grupo de Corto Plazo"
      botonRegreso={{ href: '/admin/talleres/abstracto', texto: 'Grupos de corto plazo' }}
    >
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <TextoSistema variante="sutil">
          Creá el grupo de corto plazo (programa conceptual). Una vez creado,
          podés abrir ediciones específicas (otoño 2026, primavera 2027, etc.)
          desde la página del grupo — eso es PR23.2.
        </TextoSistema>
      </TarjetaSistema>
      <CrearTallerAbstractoForm />
    </ContenedorDashboard>
  )
}
