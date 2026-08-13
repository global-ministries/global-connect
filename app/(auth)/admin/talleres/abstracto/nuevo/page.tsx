/**
 * PR23.1 — /admin/talleres/abstracto/nuevo.
 *
 * Direct page for creating a taller abstracto. The form is the
 * same client component used on the index page.
 */

import { ContenedorDashboard, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { CrearTallerAbstractoForm } from './crear-form'

export const metadata = { title: 'Crear Taller Abstracto' }

export default function CrearTallerAbstractoPage() {
  return (
    <ContenedorDashboard
      titulo="Crear Taller Abstracto"
      botonRegreso={{ href: '/admin/talleres/abstracto', texto: 'Talleres abstractos' }}
    >
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <TextoSistema variante="sutil">
          Creá el taller conceptual (programa abstracto). Una vez creado, podés
          abrir ediciones específicas (otoño 2026, primavera 2027, etc.) desde
          la página del taller — eso es PR23.2.
        </TextoSistema>
      </TarjetaSistema>
      <CrearTallerAbstractoForm />
    </ContenedorDashboard>
  )
}
