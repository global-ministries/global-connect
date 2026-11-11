/**
 * R3k (odd/tasks/talleres-rediseno.md, S1, S4, L10) — /talleres/[taller]/
 * configuracion: the taller's configuration as its own view (artboard
 * design/talleres-reserva/14), out of the taller page, where the whole form
 * used to sit stacked under the side column. The taller page's
 * «Configuración» action opens it, and its old anchor (#configuracion-heading,
 * the catálogo's link) is redirected here by RedirigirAnclaConfiguracion.
 *
 * GATE, the same as /talleres/[taller]: flag -> user -> session, each an
 * informational card, then the slug lookup (notFound for an unknown slug).
 * Anyone who can see the taller reads the configuration (as on the page
 * before); edit controls with cargarPermisos(...).editarTaller for THIS
 * taller's node, the predicate RLS enforces on `talleres` itself. The
 * ConfiguracionTaller props are the ones the taller page used to pass.
 */

import { notFound } from 'next/navigation'

import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { PaginaSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { ConfiguracionTaller } from '@/components/talleres/configuracion-taller'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { loadTallerDetalle } from '@/lib/platform/talleres/catalogo'
import { cargarPermisos } from '@/lib/platform/talleres/permisos'
import { rutaTaller } from '@/lib/platform/talleres/rutas'

export const metadata = { title: 'Configuración del taller' }

interface RouteContext {
  readonly params: Promise<{ readonly taller: string }>
}

const RESUMEN = 'Vale para las ediciones nuevas. Las que ya están abiertas guardan lo suyo.'

/** An informational card; a plain function (not a component) so the RSC test can read it unrendered. */
function aviso(texto: string) {
  return (
    <PaginaSistema titulo="Configuración">
      <TarjetaSistema variante="outlined" className="p-6 text-center">
        <TextoSistema variante="sutil">{texto}</TextoSistema>
      </TarjetaSistema>
    </PaginaSistema>
  )
}

export default async function ConfiguracionTallerPage(ctx: RouteContext) {
  if (!isTalleresEnabled()) return aviso('El módulo de talleres está deshabilitado.')

  const { taller: slug } = await ctx.params
  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const { data: { user } } = await client.auth.getUser()
  if (!user) return aviso('Necesitas iniciar sesión.')

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  if (!session) return aviso('No se pudo resolver tu sesión.')

  const taller = await loadTallerDetalle(client, slug)
  if (!taller) notFound()

  const permisos = await cargarPermisos(client, taller.dream_team_equipo_id)
  const rutaDelTaller = rutaTaller(taller.slug)

  return (
    <PaginaSistema
      titulo={`Configuración de ${taller.nombre}`}
      regreso={{ href: rutaDelTaller, texto: taller.nombre }}
    >
      {/* Phones: back to the taller, large title and the summary; from md the desktop header has them. */}
      <div className="-mt-2 grid gap-1">
        <BotonAtrasMovil atras={{ etiqueta: taller.nombre, href: rutaDelTaller }} className="-ml-2 justify-self-start md:hidden" />
        <TituloGrande nivel={2} titulo="Configuración" resumen={RESUMEN} />
        <p className="hidden text-[15px] text-muted-foreground md:block">{RESUMEN}</p>
      </div>

      <ConfiguracionTaller
        tallerId={taller.id}
        tallerSlug={taller.slug}
        tipo={taller.tipo}
        vinculo={taller.vinculo}
        regimen={taller.regimen}
        cierreInscripcionOffsetDias={taller.cierre_inscripcion_offset_dias}
        intervaloEdicionesDias={taller.intervalo_ediciones_dias}
        anclaEdiciones={taller.ancla_ediciones ?? null}
        clasesMinimasParaCompletar={taller.clases_minimas_para_completar}
        minimoInscritos={taller.minimo_inscritos ?? null}
        permiteRecuperarClases={taller.permite_recuperar_clases ?? true}
        momentoEnvioAcceso={taller.momento_envio_acceso}
        inscripcionAutomatica={taller.inscripcion_automatica}
        cadenciaDias={taller.cadencia_dias}
        duracionMinutos={taller.duracion_minutos}
        puedeEditar={permisos.editarTaller}
      />
    </PaginaSistema>
  )
}
