/**
 * /perfil — Mi perfil. "Mis datos" is Editar persona in `esPerfil` mode (S14
 * decision 11 of odd/tasks/sistema-diseno-v2.md): the same sections and save
 * bar, no Usuarios breadcrumbs, saving stays here with a toast, Cancelar
 * discards in place. "Mis hijos" is unchanged (odd/tasks/ninos-roles-ui.md F3).
 */
import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'

import { MisHijos } from '@/components/perfil/mis-hijos'
import { PerfilPestanas } from '@/components/perfil/perfil-pestanas'
import { FormularioEditarPersona } from '@/components/users/editar/formulario-editar-persona'
import { MigasPerfil } from '@/components/users/editar/migas-editar'
import { BotonSistema, PaginaSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { obtenerSugerenciasDireccionFamiliar } from '@/lib/actions/direccion-familiar.actions'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import { esMayorDeEdad, parseMisHijos } from '@/lib/platform/ninos/mis-hijos'
import { parsePendientesMisHijos } from '@/lib/platform/ninos/mis-hijos-registrar'
import { parseMisPrechecks } from '@/lib/platform/ninos/precheck'
import { cargarCatalogosEdicion, cargarIdentidadEdicion, cargarUsuarioEditable } from '@/lib/platform/usuarios/editar-carga'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

function ErrorPerfil({ titulo, texto, detalle, accion }: { titulo: string; texto: string; detalle?: string; accion: { href: string; texto: string } }) {
  return (
    <PaginaSistema breadcrumbs={<MigasPerfil />}>
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-4 size-12 text-danger" aria-hidden="true" />
          <TituloSistema nivel={2}>{titulo}</TituloSistema>
          <p className="mb-4 text-muted-foreground">{texto}</p>
          {detalle && <p className="mb-4 text-sm text-muted-foreground">{detalle}</p>}
          <BotonSistema asChild variante="primario">
            <Link href={accion.href}>{accion.texto}</Link>
          </BotonSistema>
        </div>
      </div>
    </PaginaSistema>
  )
}

export default async function PerfilPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return <ErrorPerfil titulo="Error de autenticación" texto="No se pudo verificar tu sesión" accion={{ href: '/auth/login', texto: 'Iniciar sesión' }} />
  }

  // Admin client: the caller's own row by auth_id (bypasses RLS), as before.
  const adminSupabase = createSupabaseAdminClient()
  const { usuario, error } = await cargarUsuarioEditable(adminSupabase, { columna: 'auth_id', valor: user.id })

  if (!usuario) {
    return (
      <ErrorPerfil
        titulo="Perfil no encontrado"
        texto="No se pudo cargar tu información de perfil"
        detalle={`Error: ${error || 'Usuario no encontrado en la base de datos'}`}
        accion={{ href: '/dashboard', texto: 'Volver al inicio' }}
      />
    )
  }

  // "Mis hijos" (Niños) is read with the user's session client: the RPC finds the parent through auth.uid().
  // An account whose birth date says under 18 has no Mis hijos (G8; the SQL refuses it too).
  const conMisHijos = esMayorDeEdad(usuario.fecha_nacimiento, hoyEnCaracas())
  const sinDatos = Promise.resolve({ data: null })
  const [{ ocupaciones, profesiones, catalogos }, identidad, { sugerencias }, { data: misHijosData }, { data: pendientesData }, { data: prechecksData }] =
    await Promise.all([
      cargarCatalogosEdicion(adminSupabase),
      cargarIdentidadEdicion(supabase, { usuarioId: usuario.id, authId: user.id }),
      obtenerSugerenciasDireccionFamiliar(usuario.id),
      conMisHijos ? supabase.rpc('ninos_mis_hijos') : sinDatos,
      conMisHijos ? supabase.rpc('ninos_mis_hijos_pendientes') : sinDatos,
      conMisHijos ? supabase.rpc('ninos_mis_prechecks') : sinDatos,
    ])

  return (
    <PaginaSistema breadcrumbs={<MigasPerfil />}>
      {/* "Mis datos" and "Mis hijos" tabs (F3). Mis hijos is shown to every adult account:
          a parent without children registers them there (M5). */}
      <PerfilPestanas
        datos={
          <FormularioEditarPersona
            usuario={usuario}
            identidad={identidad}
            ocupaciones={ocupaciones}
            profesiones={profesiones}
            catalogos={catalogos}
            sugerenciasDireccion={sugerencias}
            esPerfil
          />
        }
        hijos={
          conMisHijos ? (
            <MisHijos hijos={parseMisHijos(misHijosData)} pendientes={parsePendientesMisHijos(pendientesData)} prechecks={parseMisPrechecks(prechecksData)} />
          ) : null
        }
      />
    </PaginaSistema>
  )
}
