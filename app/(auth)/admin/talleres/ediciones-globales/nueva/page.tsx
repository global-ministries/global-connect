/**
 * PR29-D — /admin/talleres/ediciones-globales/nueva.
 *
 * RSC page for creating a new edicion global. Loads the list of
 * active talleres for the initial-talleres selector and renders the
 * client form.
 *
 * Capability gate: director.write OR admin.manage (via the
 * `requireEdicionesGlobalesRole` helper).
 */

import { ContenedorDashboard, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { requireEdicionesGlobalesRole } from '@/lib/platform/talleres/ediciones-globales'

import { CrearEdicionGlobalForm } from '../nuevo-form'

export const metadata = { title: 'Nueva edición global' }

export default async function CrearEdicionGlobalPage() {
  const gate = await requireEdicionesGlobalesRole()
  if (!gate.ok) {
    return (
      <ContenedorDashboard titulo="Nueva edición global">
        <TarjetaSistema variante="outlined" className="p-6 text-center">
          <TextoSistema variante="sutil">
            {gate.error === 'not-found'
              ? 'El módulo de talleres está deshabilitado.'
              : gate.error === 'unauthorized'
                ? 'Necesitás iniciar sesión.'
                : 'No tenés permiso para crear ediciones globales.'}
          </TextoSistema>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = gate.supabase
  const { data: talleresData } = await client
    .from('talleres')
    .select('id, slug, nombre')
    .eq('estado', 'active')
    .order('nombre', { ascending: true })
    .limit(500)

  const talleresDisponibles = (talleresData ?? []) as Array<{
    id: string
    slug: string
    nombre: string
  }>

  return (
    <ContenedorDashboard
      titulo="Nueva edición global"
      botonRegreso={{
        href: '/admin/talleres/ediciones-globales',
        texto: 'Ediciones globales',
      }}
    >
      <TarjetaSistema variante="outlined" className="mb-4 p-4">
        <TextoSistema variante="sutil">
          Una edición global agrupa N talleres y permite abrirlos/cerrarlos
          en simultáneo. Al crearla queda en estado <strong>borrador</strong>;
          después podés abrirla desde la página de detalle. Esto no modifica
          ninguna inscripción existente (la inscripción sigue siendo por
          taller).
        </TextoSistema>
      </TarjetaSistema>
      <CrearEdicionGlobalForm talleresDisponibles={talleresDisponibles} />
    </ContenedorDashboard>
  )
}