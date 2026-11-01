/**
 * /users/[id]/edit — Editar persona on design system v2 (S14 of
 * odd/tasks/sistema-diseno-v2.md). Who may open it is unchanged:
 * puede_editar_usuario (with the campus rule of #621), otherwise back to the
 * ficha. "Asignar contraseña" no longer lives here; it is in the ficha's
 * Cuenta tab (decision 10).
 */
import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { FormularioEditarPersona } from '@/components/users/editar/formulario-editar-persona'
import { MigasEditar } from '@/components/users/editar/migas-editar'
import { BotonSistema, PaginaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { obtenerSugerenciasDireccionFamiliar } from '@/lib/actions/direccion-familiar.actions'
import { cargarCatalogosEdicion, cargarIdentidadEdicion, cargarUsuarioEditable } from '@/lib/platform/usuarios/editar-carga'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditUserPage({ params }: Props) {
  const { id } = await params

  // Verificar permisos antes de mostrar el formulario
  const supabaseServer = await createSupabaseServerClient()
  const { data: { user: authUser } } = await supabaseServer.auth.getUser()
  if (!authUser) {
    redirect('/')
  }
  const { data: permitido } = await supabaseServer.rpc('puede_editar_usuario' as any, {
    p_auth_id: authUser.id,
    p_target_user_id: id,
  })
  if (!permitido) {
    redirect(`/users/${id}`)
  }

  // Usar admin client para bypass RLS
  const supabase = createSupabaseAdminClient()
  const { usuario, error } = await cargarUsuarioEditable(supabase, { columna: 'id', valor: id })

  if (!usuario) {
    return (
      <PaginaSistema regreso={{ href: '/users', texto: 'Volver a Usuarios' }}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="mx-auto mb-4 size-12 text-danger" aria-hidden="true" />
            <TituloSistema nivel={2}>Usuario no encontrado</TituloSistema>
            <p className="mb-4 text-muted-foreground">No se pudo cargar la información del usuario con ID: {id}</p>
            <p className="mb-4 text-sm text-muted-foreground">Error: {error || 'Usuario no encontrado en la base de datos'}</p>
            <BotonSistema asChild variante="primario">
              <Link href="/users">Volver a Usuarios</Link>
            </BotonSistema>
          </div>
        </div>
      </PaginaSistema>
    )
  }

  const [{ ocupaciones, profesiones, catalogos }, identidad, { sugerencias }] = await Promise.all([
    cargarCatalogosEdicion(supabase),
    cargarIdentidadEdicion(supabaseServer, { usuarioId: id, authId: authUser.id }),
    obtenerSugerenciasDireccionFamiliar(id),
  ])

  return (
    <PaginaSistema breadcrumbs={<MigasEditar usuarioId={id} nombre={`${usuario.nombre} ${usuario.apellido}`.trim()} />}>
      <FormularioEditarPersona
        usuario={usuario}
        identidad={identidad}
        ocupaciones={ocupaciones}
        profesiones={profesiones}
        catalogos={catalogos}
        sugerenciasDireccion={sugerencias}
      />
    </PaginaSistema>
  )
}
