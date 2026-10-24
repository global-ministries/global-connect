
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import UserCreateForm from "@/components/forms/UserCreateForm"

import { PaginaSistema } from '@/components/ui/sistema-diseno'

export default async function CreateUserPage() {
  // Verificar permisos antes de mostrar el formulario
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/')
  }
  const { data: permitido } = await supabase.rpc('puede_crear_usuario' as any, {
    p_auth_id: user.id,
  })
  if (!permitido) {
    redirect('/users')
  }

  return (
    <PaginaSistema
      titulo="Agregar Miembro"
      regreso={{ href: '/users', texto: 'Volver a Usuarios' }}
    >
      <UserCreateForm />
    </PaginaSistema>
  )
}
